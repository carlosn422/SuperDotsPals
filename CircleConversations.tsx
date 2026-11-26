import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Animated,AppState,PanResponder,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Svg,{Path} from 'react-native-svg';
import {Ionicons} from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {CircleMood,Friend,FriendSharedMood,MOOD_REACTIONS,MOOD_TINTS,REACTION_LABELS,ReceivedSignal,SignalId,signalById,moodLabel} from './LittleSignalsData';
import {CircleStore,canSignal,familyFriend,isMoodNew,useCircle} from './CircleStore';
import {Avatar,CT,EmptyState,MoodPalThumb,OfflineBanner,cs,useReduceMotion} from './CircleComponents';
import {Emoji,EmojiStyle} from './EmojiCatalog';
import EmojiPickerSheet from './EmojiPickerSheet';
import {usePlus} from './PlusStore';
import {shortProfileName} from './FamilyWatches';

// Circle conversations: one thread per person, built only from existing Circle data
// (moods they shared with me, my reactions, their reactions to my moods, Little Signals). No text messages.

type ThreadItem=
 |{kind:'theirMood';key:string;at:string;mood:FriendSharedMood}
 |{kind:'myMood';key:string;at:string;moodId:string;mood:CircleMood;sharedAt?:string;emoji:string;style?:EmojiStyle;unread:boolean}
 |{kind:'signal';key:string;at:string;signal:ReceivedSignal}
 |{kind:'sentSignal';key:string;at:string;signal:SignalId}
 |{kind:'myShare';key:string;at:string;mood:CircleMood};

export type Conversation={id:string;name:string;detail?:string;friend?:Friend;mood?:CircleMood;lastAt:string;preview:string;previewColor?:string;unread:number;pinnedAt?:string};

const now=()=>Date.now();
const isActive=(m:{expiresAt:string})=>new Date(m.expiresAt).getTime()>now();

export function personFor(store:CircleStore,id:string):Friend|undefined{return store.friends.find(f=>f.id===id)||familyFriend(store,id);}
// Display name without the family suffix, plus a secondary line ("Carlos's family") for family watches.
// "Mia's Apple Watch" -> "Mia", "Jordan Lee" -> "Jordan".
export const firstName=(name:string)=>shortProfileName(name).split(' ')[0]||name;

export function personName(store:CircleStore,id:string){
 const fam=store.familyNames?.[id];if(fam&&!store.friends.some(f=>f.id===id))return {name:fam.name,detail:fam.owner+"'s family"};
 return {name:store.friends.find(f=>f.id===id)?.name||store.inbox.find(n=>n.friendId===id)?.name||'Former friend',detail:undefined as string|undefined};
}

// Every activity with one person, oldest first. Friends' moods only while they're still visible (24 h rule).
export function threadItems(store:CircleStore,id:string):ThreadItem[]{
 const items:ThreadItem[]=[];
 store.friendMoods.filter(m=>m.friendId===id&&isActive(m)).forEach(m=>items.push({kind:'theirMood',key:'m'+m.id,at:m.sharedAt,mood:m}));
 const seen=new Set<string>();
 store.inbox.filter(n=>n.friendId===id).forEach(n=>{if(seen.has(n.moodId))return;seen.add(n.moodId);
  items.push({kind:'myMood',key:'r'+n.moodId,at:n.at,moodId:n.moodId,mood:n.mood,sharedAt:store.myMoods.find(m=>m.id===n.moodId)?.sharedAt,emoji:n.emoji,style:store.myMoods.find(m=>m.id===n.moodId)?.reactions.find(r=>r.friendId===n.friendId)?.style,unread:!n.read})});
 store.myMoods.forEach(m=>m.reactions.filter(r=>r.friendId===id&&!seen.has(m.id)).forEach(r=>{seen.add(m.id);
  items.push({kind:'myMood',key:'r'+m.id,at:r.at,moodId:m.id,mood:m.mood,sharedAt:m.sharedAt,emoji:r.emoji,style:r.style,unread:false})}));
 // My mood changes only appear when this person reacted to them.
 seen.forEach(mid=>{const m=store.myMoods.find(x=>x.id===mid);if(m)items.push({kind:'myShare',key:'p'+m.id,at:m.sharedAt,mood:m.mood})});
 store.signals.filter(s=>s.friendId===id).forEach(s=>items.push({kind:'signal',key:'s'+s.id,at:s.at,signal:s}));
 store.sentSignals.forEach((s,i)=>{if(s.friendIds.includes(id))items.push({kind:'sentSignal',key:'x'+s.at+i,at:s.at,signal:s.signal})});
 // The history fetch and live updates may overlap. Render each persisted event only once.
 // Distinct event IDs are deliberately kept, even when mood and timestamp match.
 const unique=new Map<string,ThreadItem>();
 items.forEach(item=>{if(!unique.has(item.key))unique.set(item.key,item)});
 const sorted=[...unique.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key));
 // Keep my mood change only when their reaction to it comes right after; anything else in between (like a signal) skips it.
 return sorted.filter((it,i)=>it.kind!=='myShare'||sorted[i+1]?.key==='r'+it.key.slice(1));
}

function unreadFor(store:CircleStore,id:string){
 return store.inbox.filter(n=>n.friendId===id&&!n.read).length+store.signals.filter(s=>s.friendId===id&&!s.seen).length
  +store.friendMoods.filter(m=>m.friendId===id&&isActive(m)&&isMoodNew(store,m)).length;
}
export function latestMood(store:CircleStore,id:string){return store.friendMoods.filter(m=>m.friendId===id&&isActive(m)).sort((a,b)=>b.sharedAt.localeCompare(a.sharedAt))[0];}

function previewOf(it:ThreadItem,first:string):{text:string;color?:string;at:string}{
 switch(it.kind){
  case 'theirMood':return it.mood.myReactionAt&&it.mood.myReaction?{text:'You reacted '+it.mood.myReaction+' to '+moodLabel(it.mood.mood),at:it.mood.myReactionAt}:{text:'Feeling '+moodLabel(it.mood.mood),color:MOOD_TINTS[it.mood.mood].color,at:it.at};
  case 'myMood':return {text:'Reacted '+it.emoji+' to your '+moodLabel(it.mood)+' mood',at:it.at};
  case 'signal':{const s=signalById(it.signal.signal);return {text:s.emoji+' '+s.label,at:it.at};}
  case 'sentSignal':{const s=signalById(it.signal);return {text:'You sent '+s.emoji+' '+s.label,at:it.at};}
  case 'myShare':return {text:'You felt '+moodLabel(it.mood),color:MOOD_TINTS[it.mood].color,at:it.at};
 }
}

// One row per person: friends and family profiles with any activity, plus pinned friends. Pinned first, then newest activity.
export function conversationsFor(store:CircleStore):Conversation[]{
 const ids=new Set<string>([...store.friends.filter(f=>f.pinnedAt).map(f=>f.id),...store.friendMoods.filter(isActive).map(m=>m.friendId),...store.inbox.map(n=>n.friendId),...store.signals.map(s=>s.friendId),...store.sentSignals.flatMap(s=>s.friendIds)]);
 const list:Conversation[]=[];
 ids.forEach(id=>{
  const friend=personFor(store,id);const {name,detail}=personName(store,id);
  if(!friend&&!store.inbox.some(n=>n.friendId===id))return;
  const items=threadItems(store,id);
  if(!items.length&&!friend?.pinnedAt)return;
  const p=items.map(it=>previewOf(it,name)).sort((a,b)=>b.at.localeCompare(a.at))[0];
  list.push({id,name,detail,friend,mood:latestMood(store,id)?.mood,lastAt:p?.at||'',preview:p?.text||'No moods shared yet',previewColor:p?.color,unread:unreadFor(store,id),pinnedAt:friend?.pinnedAt});
 });
 return list.sort((a,b)=>{
  if(!!a.pinnedAt!==!!b.pinnedAt)return a.pinnedAt?-1:1;
  if(a.pinnedAt&&b.pinnedAt)return a.pinnedAt.localeCompare(b.pinnedAt);
  return b.lastAt.localeCompare(a.lastAt);
 });
}

// Which conversation (and item) a notification / Today card ref points to.
export function conversationRef(store:CircleStore,ref:string):{friendId:string;focus:string}|null{
 const fm=store.friendMoods.find(m=>m.id===ref);if(fm)return isActive(fm)?{friendId:fm.friendId,focus:'m'+fm.id}:null;
 const sig=store.signals.find(s=>s.id===ref);if(sig)return {friendId:sig.friendId,focus:'s'+sig.id};
 const reactions=store.inbox.filter(n=>n.moodId===ref||n.id===ref).sort((a,b)=>Number(a.read)-Number(b.read)||b.at.localeCompare(a.at));
 if(reactions[0])return {friendId:reactions[0].friendId,focus:'r'+reactions[0].moodId};
 const mine=store.myMoods.find(m=>m.id===ref);const last=mine?.reactions.slice().sort((a,b)=>b.at.localeCompare(a.at))[0];
 if(mine&&last)return {friendId:last.friendId,focus:'r'+mine.id};
 return null;
}

function dayLabel(iso:string){
 const d=new Date(iso),t=new Date();const y=new Date();y.setDate(t.getDate()-1);
 if(d.toDateString()===t.toDateString())return 'Today';
 if(d.toDateString()===y.toDateString())return 'Yesterday';
 return d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
}
const clock=(iso:string)=>new Date(iso).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
function rowTime(iso:string){
 if(!iso)return '';const d=new Date(iso);const days=(new Date().setHours(0,0,0,0)-new Date(iso).setHours(0,0,0,0))/864e5;
 if(days<=0)return clock(iso);if(days===1)return 'Yesterday';if(days<7)return d.toLocaleDateString(undefined,{weekday:'short'});
 return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function useTick(ms:number){const [,set]=useState(0);useEffect(()=>{const t=setInterval(()=>set(x=>x+1),ms);return()=>clearInterval(t)},[ms]);}

export function PersonAvatar({store,id,size=52}:{store:CircleStore;id:string;size?:number}){
 const mood=latestMood(store,id)?.mood;const p=personFor(store,id);
 if(mood)return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:MOOD_TINTS[mood].tint,alignItems:'center',justifyContent:'center'}}><MoodPalThumb mood={mood} size={size*0.78}/></View>;
 return <Avatar initials={p?.initials||'?'} color={p?.color||'#C9D2CE'} size={size}/>;
}


function Section({title}:{title:string}){return <Text accessibilityRole="header" style={{fontSize:17,fontWeight:'900',color:CT.ink,marginTop:6,marginBottom:2,marginLeft:4}}>{title}</Text>;}
function sectionOf(c:Conversation){
 if(c.pinnedAt)return 'Pinned';if(!c.lastAt)return 'Earlier';
 const days=(new Date().setHours(0,0,0,0)-new Date(c.lastAt).setHours(0,0,0,0))/864e5;
 return days<=0?'Today':days===1?'Yesterday':'Earlier';
}

export function MessagesInbox({onOpen,onInvite,onSend}:{onOpen:(id:string)=>void;onInvite:()=>void;onSend:()=>void}){
 const store=useCircle();useTick(60000);
 const list=conversationsFor(store);
 if(store.loading&&!list.length)return <View style={{paddingVertical:48,alignItems:'center'}}><ActivityIndicator color={CT.ink}/></View>;
 if(!store.friends.length&&!list.length)return <EmptyState mood="Joyful" title="Your circle is empty" detail="Invite close friends or family with your personal code. When they share a mood, it shows up here." action="Invite Friends" onAction={onInvite}/>;
 if(!list.length)return <EmptyState mood="Calm" title="No messages yet" detail="When someone shares a mood or reacts to yours, their conversation appears here." action="Send a Little Signal" onAction={onSend}/>;
 const sections:{title:string;items:Conversation[]}[]=[];
 list.forEach(c=>{const t=sectionOf(c);const last=sections[sections.length-1];if(last&&last.title===t)last.items.push(c);else sections.push({title:t,items:[c]})});
 return <View style={{gap:6}}>{sections.map(sec=><View key={sec.title} style={{gap:6}}>
  <Section title={sec.title}/>
  <View style={[cs.card,{paddingVertical:2,paddingHorizontal:12}]}>
   {sec.items.map((c,i)=><TouchableOpacity key={c.id} onPress={()=>onOpen(c.id)} accessibilityRole="button"
    accessibilityLabel={c.name+(c.detail?', '+c.detail:'')+', '+c.preview+', '+rowTime(c.lastAt)+(c.unread?', '+c.unread+' unread':'')}
    style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderBottomWidth:i===sec.items.length-1?0:1,borderBottomColor:CT.line}}>
    <PersonAvatar store={store} id={c.id}/>
    <View style={{flex:1,gap:3}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
      <Text numberOfLines={1} style={{flexShrink:1,fontSize:16,fontWeight:'900',color:CT.ink}}>{c.name}</Text>
      <View style={{flex:1}}/>
      <Text style={{fontSize:12,color:CT.muted,fontWeight:'600'}}>{rowTime(c.lastAt)}</Text>
     </View>
     <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
      {c.previewColor?<View style={{width:8,height:8,borderRadius:4,backgroundColor:c.previewColor}}/>:null}
      <Text numberOfLines={1} style={{flex:1,fontSize:14,color:c.unread?CT.ink:CT.muted,fontWeight:c.unread?'700':'500'}}>{c.detail?c.detail+' · ':''}{c.preview}</Text>
      {c.unread?<View style={{minWidth:22,height:22,borderRadius:11,paddingHorizontal:6,backgroundColor:CT.danger,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900'}}>{c.unread>99?'99+':c.unread}</Text></View>:null}
     </View>
    </View>
    <Ionicons name="chevron-forward" size={17} color={CT.muted}/>
   </TouchableOpacity>)}
  </View>
 </View>)}</View>;
}

function ConversationHeader({id,onBack,onInfo}:{id:string;onBack:()=>void;onInfo:()=>void}){
 const store=useCircle();const m=latestMood(store,id);const {name,detail}=personName(store,id);
 const known=!!personFor(store,id);
 return <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:6}}>
  <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to Messages" hitSlop={10} style={{width:32,height:44,justifyContent:'center'}}><Ionicons name="chevron-back" size={27} color={CT.ink}/></TouchableOpacity>
  <PersonAvatar store={store} id={id} size={42}/>
  <View style={{flex:1}}>
   <Text accessibilityRole="header" numberOfLines={1} style={{fontSize:18,fontWeight:'900',color:CT.ink}}>{name}</Text>
   <Text numberOfLines={1} style={{fontSize:12,color:CT.muted,fontWeight:'600'}}>{detail||(known?(m?'Feeling '+moodLabel(m.mood):'In your circle'):'No longer in your circle')}</Text>
  </View>
  {store.friends.some(f=>f.id===id)?<TouchableOpacity onPress={onInfo} accessibilityRole="button" accessibilityLabel={'About '+name} hitSlop={10} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="information-circle-outline" size={27} color={CT.ink}/></TouchableOpacity>:null}
 </View>;
}

function Pop({children,trigger}:{children:React.ReactNode;trigger:string}){
 const reduce=useReduceMotion();const v=useRef(new Animated.Value(1)).current;const first=useRef(true);
 useEffect(()=>{if(first.current){first.current=false;return;}if(reduce)return;v.setValue(.6);Animated.spring(v,{toValue:1,friction:4,tension:160,useNativeDriver:true}).start();},[trigger]);
 return <Animated.View style={{transform:[{scale:v}]}}>{children}</Animated.View>;
}

const bubble={borderRadius:22,paddingHorizontal:12,paddingVertical:10,maxWidth:'100%' as const};

// The thread is drawn as a trail: their activity stops on the left, mine on the right, joined by a winding path.
const NODE=46,TRAIL='#D3EADD';
type Side='L'|'R';
const sideOf=(it:ThreadItem):Side=>it.kind==='theirMood'||it.kind==='signal'?'L':'R';
const trailNode={width:NODE,height:NODE,borderRadius:NODE/2,borderWidth:3,alignItems:'center' as const,justifyContent:'center' as const,backgroundColor:'#fff'};
function TrailLink({width,from,to,day,connect}:{width:number;from:Side;to:Side;day?:string;connect:boolean}){
 const h=day?52:24,x=(v:Side)=>v==='L'?NODE/2:width-NODE/2,a=x(from),b=x(to);
 return <View style={{height:h,alignItems:'center',justifyContent:'center'}}>
  {connect&&width?<Svg width={width} height={h} style={StyleSheet.absoluteFill}><Path d={`M${a} 0 C${a} ${h*.65} ${b} ${h*.35} ${b} ${h}`} stroke={TRAIL} strokeWidth={4} strokeLinecap="round" fill="none"/></Svg>:null}
  {day?<View style={{backgroundColor:'#E7EFEA',borderRadius:12,paddingHorizontal:12,paddingVertical:4}}><Text style={{fontSize:12,fontWeight:'800',color:CT.muted}}>{day}</Text></View>:null}
 </View>;
}
const meta={fontSize:11,color:CT.muted,fontWeight:'600' as const};

const UNDO_MS=8000;
type Draft={e:string;style:EmojiStyle;until:number};

function UndoPill({draft,onUndo}:{draft:Draft;onUndo:()=>void}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(t)},[]);
 const left=Math.max(0,draft.until-now);
 return <View style={{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderRadius:18,borderTopLeftRadius:6,borderWidth:1,borderColor:CT.line,paddingLeft:11,paddingRight:5,paddingVertical:5,overflow:'hidden'}}>
  <Emoji e={draft.e} style={draft.style} size={17}/>
  <Text style={{fontSize:13,fontWeight:'800',color:CT.ink}}>Sending in {Math.ceil(left/1000)}s</Text>
  <TouchableOpacity onPress={onUndo} accessibilityRole="button" accessibilityLabel="Undo reaction" hitSlop={8} style={{width:30,height:30,borderRadius:15,backgroundColor:'#FDECEF',alignItems:'center',justifyContent:'center'}}><Ionicons name="trash-outline" size={16} color={CT.danger}/></TouchableOpacity>
  <View style={{position:'absolute',left:0,bottom:0,height:3,width:(left/UNDO_MS*100)+'%' as any,backgroundColor:CT.primary}}/>
 </View>;
}

type ThreadProps={id:string;focus?:string;onBack:()=>void;onInfo:()=>void;onSend:()=>void;fill?:boolean;padding?:number};

// Full conversation: header, thread (newest at the bottom) and the reaction bar. With `fill` it owns its scrolling.
export function ConversationScreen({id,focus,onBack,onInfo,onSend,fill,padding=20}:ThreadProps){
 const store=useCircle();useTick(60000);
 const items=threadItems(store,id);
 const {name}=personName(store,id);const first=firstName(name);
 const [limit,setLimit]=useState(()=>{const i=focus?items.findIndex(x=>x.key===focus):-1;return Math.max(40,i>=0?items.length-i:0)});
 const active=items.filter((x):x is Extract<ThreadItem,{kind:'theirMood'}>=>x.kind==='theirMood');
 const [picked,setPicked]=useState<string|undefined>(()=>focus&&active.some(x=>x.key===focus)?focus:undefined);
 const target=active.find(x=>x.key===picked)||active[active.length-1];
 const [pending,setPending]=useState<Record<string,boolean>>({});
 const [highlight,setHighlight]=useState(focus);
 const [tw,setTw]=useState(0);
 useEffect(()=>{if(!highlight)return;const t=setTimeout(()=>setHighlight(undefined),2500);return()=>clearTimeout(t)},[highlight]);

 // Opening the thread reads only this person's activity; anything that arrives while it's open is read too.
 const unreadKey=[...store.inbox.filter(n=>n.friendId===id&&!n.read).map(n=>n.id),...store.signals.filter(s=>s.friendId===id&&!s.seen).map(s=>s.id),...store.friendMoods.filter(m=>m.friendId===id&&isActive(m)&&isMoodNew(store,m)).map(m=>m.id)].join(',');
 useEffect(()=>{
  store.inbox.filter(n=>n.friendId===id&&!n.read).forEach(n=>store.markReactionRead(n.id));
  const sigs=store.signals.filter(s=>s.friendId===id&&!s.seen).map(s=>s.id);if(sigs.length)store.markSignalSeen(sigs);
  const moods=store.friendMoods.filter(m=>m.friendId===id&&isActive(m)&&isMoodNew(store,m)).map(m=>m.id);if(moods.length)store.markMoodSeen(moods);
 },[id,unreadKey]);
 useEffect(()=>{const t=setInterval(()=>{if(AppState.currentState==='active')void store.refresh()},20000);return()=>clearInterval(t)},[id]);

 // A reaction waits UNDO_MS before it's sent (trash can to undo); once sent it's final.
 const {isPlus}=usePlus();
 const [sheet,setSheet]=useState(false);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const draftsRef=useRef(drafts);
 const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
 const putDraft=(id:string,d?:Draft)=>{clearTimeout(timers.current[id]);delete timers.current[id];const n={...draftsRef.current};if(d)n[id]=d;else delete n[id];draftsRef.current=n;setDrafts(n)};
 const commit=async(id:string)=>{
  const d=draftsRef.current[id];if(!d)return;
  putDraft(id);
  setPending(p=>({...p,[id]:true}));
  const ok=await store.react(id,d.e,d.style);
  setPending(p=>{const n={...p};delete n[id];return n});
  Haptics.notificationAsync(ok?Haptics.NotificationFeedbackType.Success:Haptics.NotificationFeedbackType.Error).catch(()=>{});
 };
 const commitRef=useRef(commit);commitRef.current=commit;
 const undo=(id:string)=>{putDraft(id);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{})};
 const react=(m:FriendSharedMood,e:string,style:EmojiStyle='standard')=>{
  if(m.myReaction||pending[m.id])return;
  Haptics.selectionAsync().catch(()=>{});
  putDraft(m.id,{e,style,until:Date.now()+UNDO_MS});
  timers.current[m.id]=setTimeout(()=>void commitRef.current(m.id),UNDO_MS);
 };
 // Leaving the app or the conversation sends anything still waiting so it can't get lost.
 useEffect(()=>{
  const flush=()=>Object.keys(draftsRef.current).forEach(id=>void commitRef.current(id));
  const sub=AppState.addEventListener('change',st=>{if(st!=='active')flush()});
  return()=>{sub.remove();flush()};
 },[]);
 const swipe=useRef(PanResponder.create({
  onMoveShouldSetPanResponder:(_,g)=>g.dy<-12&&Math.abs(g.dy)>Math.abs(g.dx),
  onPanResponderRelease:(_,g)=>{if(g.dy<-30)setSheet(true)},
 })).current;

 const scroll=useRef<ScrollView>(null);const atBottom=useRef(true);const didInitial=useRef(false);
 const shown=items.slice(-limit);
 let lastDay='';
 const thread=!items.length?<View style={{alignItems:'center',gap:8,paddingVertical:40,paddingHorizontal:20}}>
   <PersonAvatar store={store} id={id} size={72}/>
   <Text style={[cs.heading,{textAlign:'center'}]}>Nothing here yet</Text>
   <Text style={[cs.muted,{textAlign:'center',lineHeight:18}]}>When {first} shares a mood with you, it shows up here and you can react with an emoji. Shared moods stay visible for 24 hours.</Text>
  </View>:
  <View onLayout={e=>setTw(e.nativeEvent.layout.width)}>
   {items.length>shown.length?<TouchableOpacity onPress={()=>{atBottom.current=false;setLimit(l=>l+40)}} accessibilityRole="button" style={{alignSelf:'center',paddingVertical:8,paddingHorizontal:14}}><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>Show earlier</Text></TouchableOpacity>:null}
   {shown.map((it,i)=>{
    const day=dayLabel(it.at);const sep=day!==lastDay;lastDay=day;const lit=highlight===it.key;
    const side=sideOf(it),prevSide=i>0?sideOf(shown[i-1]):side,last=i===shown.length-1,L=side==='L';
    let node:React.ReactNode,card:React.ReactNode,extra:React.ReactNode=null;
    const corner=L?{borderTopLeftRadius:6}:{borderTopRightRadius:6};
    if(it.kind==='theirMood'){const m=it.mood;const t=MOOD_TINTS[m.mood];const selected=target?.key===it.key;
     node=<View style={[trailNode,{backgroundColor:t.tint,borderColor:t.color}]}><MoodPalThumb mood={m.mood} size={32}/></View>;
     card=<TouchableOpacity activeOpacity={.85} onPress={()=>{Haptics.selectionAsync().catch(()=>{});setPicked(it.key)}} accessibilityRole="button"
       accessibilityLabel={first+' is feeling '+moodLabel(m.mood)+', '+clock(m.sharedAt)+(m.myReaction?', you reacted '+m.myReaction:'')} accessibilityState={{selected}} accessibilityHint="Choose this mood in the reaction bar"
       style={[bubble,corner,{backgroundColor:t.tint,borderWidth:2,borderColor:selected&&active.length>1||lit?t.color:'transparent'}]}>
       <View style={{gap:1,paddingHorizontal:4,flexShrink:1}}>
        <Text style={{fontSize:13,fontWeight:'700',color:CT.ink}}>{first} is feeling</Text>
        <Text style={{fontSize:19,fontWeight:'900',color:t.color}}>{moodLabel(m.mood)}</Text>
        <Text style={[meta,{marginTop:2}]}>{clock(m.sharedAt)}</Text>
       </View>
      </TouchableOpacity>;
     extra=drafts[m.id]?<UndoPill draft={drafts[m.id]} onUndo={()=>undo(m.id)}/>:m.myReaction?<View style={{flexDirection:'row',alignItems:'center',gap:4}}><Ionicons name="return-down-forward" size={16} color={t.color}/><Pop trigger={m.myReaction}>
       <View accessible accessibilityLabel={'You reacted '+(REACTION_LABELS[m.myReaction]||m.myReaction)+' to '+first+'’s '+moodLabel(m.mood)+' mood'+(pending[m.id]?', sending':'')}
        style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:CT.primarySoft,borderRadius:18,borderTopLeftRadius:6,paddingHorizontal:11,paddingVertical:6}}>
        <Emoji e={m.myReaction} style={m.myReactionStyle} size={17}/>
        <Text style={{fontSize:13,fontWeight:'800',color:CT.ink}}>You reacted</Text>
        <Text style={meta}>{m.myReactionAt?clock(m.myReactionAt):''}</Text>
        <Ionicons name={pending[m.id]?'time-outline':'checkmark'} size={13} color={pending[m.id]?CT.muted:CT.primary}/>
       </View></Pop></View>:null;
    }else if(it.kind==='myMood'){const t=MOOD_TINTS[it.mood];const mine=store.myMoods.find(m=>m.id===it.moodId&&m.active);
     const stop=()=>{if(!mine)return;Haptics.selectionAsync().catch(()=>{});Alert.alert('Stop sharing this '+moodLabel(it.mood)+' mood?','Friends will no longer see it or be able to react.',[{text:'Cancel',style:'cancel'},{text:'Stop sharing',style:'destructive',onPress:()=>store.stopSharing(mine.id)}])};
     node=<View><View style={[trailNode,{backgroundColor:t.tint,borderColor:t.color}]}><MoodPalThumb mood={it.mood} size={32}/></View>
       <View style={{position:'absolute',left:-8,bottom:-6,backgroundColor:'#fff',borderRadius:14,paddingHorizontal:3,borderWidth:1,borderColor:CT.line}}><Emoji e={it.emoji} style={it.style} size={16}/></View></View>;
     card=<TouchableOpacity activeOpacity={1} onLongPress={mine?stop:undefined} delayLongPress={350} accessibilityRole={mine?'button':undefined} accessibilityHint={mine?'Long press to stop sharing this mood':undefined} accessibilityActions={mine?[{name:'longpress',label:'Stop sharing'}]:undefined} onAccessibilityAction={stop} accessibilityLabel={first+' reacted '+(REACTION_LABELS[it.emoji]||it.emoji)+' to your '+it.mood+' mood, '+clock(it.at)}
       style={[bubble,corner,{backgroundColor:'#fff',borderWidth:lit?2:1,borderColor:lit?CT.primary:CT.line}]}>
       <View style={{gap:2,flexShrink:1,paddingHorizontal:2}}>
        <Text style={{fontSize:13,fontWeight:'700',color:CT.ink}}>{first} reacted</Text>
        <Text style={{fontSize:14,fontWeight:'800',color:CT.ink}}>to your <Text style={{color:t.color}}>{it.mood}</Text> mood</Text>
        <Text style={meta}>{clock(it.at)}</Text>
       </View>
      </TouchableOpacity>;
    }else if(it.kind==='signal'){const sg=signalById(it.signal.signal);
     node=<View style={[trailNode,{backgroundColor:'#FFF1F4',borderColor:'#F4A7BA'}]}><Text style={{fontSize:22}}>{sg.emoji}</Text></View>;
     card=<View style={[bubble,corner,{backgroundColor:'#FFF1F4',borderWidth:2,borderColor:lit?'#E76B8A':'transparent'}]} accessible accessibilityLabel={first+' sent '+sg.label+', '+clock(it.at)}>
       <Text style={{fontSize:14,fontWeight:'800',color:CT.ink}}>{sg.label}</Text><Text style={meta}>Little Signal · {clock(it.at)}</Text>
      </View>;
    }else if(it.kind==='myShare'){const t=MOOD_TINTS[it.mood];
     node=<View style={[trailNode,{backgroundColor:t.tint,borderColor:t.color}]}><MoodPalThumb mood={it.mood} size={32}/></View>;
     card=<View style={[bubble,corner,{backgroundColor:t.tint,borderWidth:2,borderColor:lit?t.color:'transparent'}]} accessible accessibilityLabel={'You changed your mood to '+moodLabel(it.mood)+', '+clock(it.at)}>
       <View style={{gap:1,paddingHorizontal:4,flexShrink:1}}>
        <Text style={{fontSize:13,fontWeight:'700',color:CT.ink}}>You changed to</Text>
        <Text style={{fontSize:19,fontWeight:'900',color:t.color}}>{moodLabel(it.mood)}</Text>
        <Text style={[meta,{marginTop:2}]}>{clock(it.at)}</Text>
       </View>
      </View>;
    }else{const sg=signalById(it.signal);
     node=<View style={[trailNode,{backgroundColor:CT.primarySoft,borderColor:CT.primary}]}><Text style={{fontSize:21}}>{sg.emoji}</Text></View>;
     card=<View style={[bubble,corner,{backgroundColor:CT.primarySoft}]} accessible accessibilityLabel={'You sent '+sg.label+', '+clock(it.at)}>
       <Text style={{color:CT.ink,fontWeight:'800',fontSize:13}}>You sent {sg.label.toLowerCase()}</Text><Text style={meta}>Little Signal · {clock(it.at)}</Text>
      </View>;
    }
    const line=L?{left:NODE/2-2}:{right:NODE/2-2};
    return <View key={it.key}>
     {i>0||sep?<TrailLink width={tw} from={prevSide} to={side} day={sep?day:undefined} connect={i>0}/>:null}
     <View>
      {i>0?<View style={[{position:'absolute',top:0,height:NODE/2,width:4,backgroundColor:TRAIL},line]}/>:null}
      {!last?<View style={[{position:'absolute',top:NODE/2,bottom:0,width:4,backgroundColor:TRAIL},line]}/>:null}
      <View style={{flexDirection:L?'row':'row-reverse',alignItems:'flex-start',gap:10}}>
       {node}
       <View style={{flex:1,alignItems:L?'flex-start':'flex-end',gap:6,paddingRight:L?24:0,paddingLeft:L?0:24}}>{card}{extra}</View>
      </View>
     </View>
    </View>;
   })}
  </View>;

 const isFriend=canSignal(store,id);
 const bar=<View {...(target&&!(target.mood.myReaction&&!drafts[target.mood.id])?swipe.panHandlers:{})} style={{backgroundColor:'#fff',borderRadius:24,padding:12,gap:10,borderWidth:1,borderColor:CT.line}}>
  {target?(()=>{const m=target.mood;const d=drafts[m.id];const done=!!m.myReaction&&!d;const tint=MOOD_TINTS[m.mood].color;
   const btn={width:56,height:52,borderRadius:26,alignItems:'center' as const,justifyContent:'center' as const};
   return <>
   {done?null:<View style={{alignSelf:'center',width:34,height:4,borderRadius:2,backgroundColor:'#E3EAE6',marginTop:-4}}/>}
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
    {done?<><Text numberOfLines={1} style={{flexShrink:1,fontSize:13,fontWeight:'800',color:CT.ink}}>You reacted to {first}’s <Text style={{color:tint}}>{moodLabel(m.mood)}</Text> mood</Text><Emoji e={m.myReaction!} style={m.myReactionStyle} size={16}/></>
     :<Text numberOfLines={1} style={{flex:1,fontSize:13,fontWeight:'800',color:CT.ink}}>React to {first}’s <Text style={{color:tint}}>{moodLabel(m.mood)}</Text> mood{active.length>1?' · '+clock(m.sharedAt):''}</Text>}
   </View>
   {done?<Text style={[cs.rowSub,{fontSize:12}]}>Sent reactions can’t be changed.{active.length>1?' Tap another mood above to react to it.':''}</Text>
   :<View style={{flexDirection:'row',justifyContent:'space-between'}}>
    {MOOD_REACTIONS[m.mood].map(e=>{const on=d?.e===e&&d.style==='standard';return <TouchableOpacity key={e} disabled={!!pending[m.id]} onPress={()=>react(m,e)} accessibilityRole="button"
     accessibilityLabel={'React '+(REACTION_LABELS[e]||e)+' to '+first+'’s '+moodLabel(m.mood)+' mood'} accessibilityState={{selected:on}}
     style={[btn,{backgroundColor:on?CT.primarySoft:'#F5F8F6',borderWidth:on?2:0,borderColor:CT.primary}]}><Text style={{fontSize:27}}>{e}</Text></TouchableOpacity>})}
    <TouchableOpacity disabled={!!pending[m.id]} onPress={()=>setSheet(true)} accessibilityRole="button" accessibilityLabel={isPlus?'More emoji':'More emoji, Plus'} style={[btn,{backgroundColor:'#F5F8F6'}]}>
     <Ionicons name="add" size={28} color={CT.primary}/>
     {!isPlus?<View style={{position:'absolute',top:4,right:6,backgroundColor:CT.primary,borderRadius:8,width:16,height:16,alignItems:'center',justifyContent:'center'}}><Ionicons name="lock-closed" size={9} color="#fff"/></View>:null}
    </TouchableOpacity>
   </View>}
   <EmojiPickerSheet visible={sheet} mood={m.mood} title={'React to '+first+'’s '+moodLabel(m.mood)+' mood'} onClose={()=>setSheet(false)} onPick={(e,st)=>{setSheet(false);react(m,e,st)}}/>
  </>})()
:<View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <Text style={[cs.rowSub,{flex:1,fontSize:12}]}>You can react when {first} shares a mood.</Text>
   {isFriend?<TouchableOpacity onPress={onSend} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:CT.primarySoft,borderRadius:16,paddingHorizontal:12,paddingVertical:9}}><Ionicons name="heart-outline" size={17} color={CT.primary}/><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>Little Signal</Text></TouchableOpacity>:null}
  </View>}
 </View>;
 const header=<ConversationHeader id={id} onBack={onBack} onInfo={onInfo}/>;
 if(!fill)return <View style={{gap:12}}>{header}<OfflineBanner/>{thread}{bar}</View>;
 return <View style={{flex:1}}>
  <View style={{paddingHorizontal:padding-6,paddingTop:4,borderBottomWidth:1,borderBottomColor:CT.line}}>{header}</View>
  <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{paddingHorizontal:padding,paddingVertical:12,gap:10}} showsVerticalScrollIndicator={false}
   scrollEventThrottle={64} onScroll={e=>{const {contentOffset,contentSize,layoutMeasurement}=e.nativeEvent;atBottom.current=contentOffset.y+layoutMeasurement.height>=contentSize.height-80}}
   onContentSizeChange={()=>{if(!didInitial.current){didInitial.current=true;scroll.current?.scrollToEnd({animated:false});}else if(atBottom.current)scroll.current?.scrollToEnd({animated:true});}}>
   <OfflineBanner/>
   {thread}
  </ScrollView>
  <View style={{paddingHorizontal:padding-8,paddingTop:6,paddingBottom:8}}>{bar}</View>
 </View>;
}
