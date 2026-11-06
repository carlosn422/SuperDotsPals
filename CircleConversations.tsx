import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActionSheetIOS,ActivityIndicator,Alert,Animated,AppState,PanResponder,Platform,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {CircleMood,Friend,FriendSharedMood,MOOD_REACTIONS,MOOD_TINTS,REACTION_LABELS,ReceivedSignal,SignalId,signalById} from './LittleSignalsData';
import {CircleStore,familyFriend,isMoodNew,useCircle} from './CircleStore';
import {Avatar,CT,EmptyState,MoodPalThumb,OfflineBanner,cs,useReduceMotion} from './CircleComponents';
import {Emoji,EmojiStyle} from './EmojiCatalog';
import EmojiPickerSheet from './EmojiPickerSheet';
import {usePlus} from './PlusStore';
import CircleCalendarSheet from './CircleCalendarSheet';
import {HistoryDay,addDays,dayRange,keyOf,longDate,shortDate,todayKey,useHistoryDay,withHistory} from './CircleHistory';

// Circle conversations: one thread per person, built only from existing Circle data
// (moods they shared with me, my reactions, their reactions to my moods, Little Signals). No text messages.

type ThreadItem=
 |{kind:'theirMood';key:string;at:string;mood:FriendSharedMood}
 |{kind:'myMood';key:string;at:string;moodId:string;mood:CircleMood;sharedAt?:string;emoji:string;style?:EmojiStyle;unread:boolean}
 |{kind:'signal';key:string;at:string;signal:ReceivedSignal}
 |{kind:'sentSignal';key:string;at:string;signal:SignalId};

export type Conversation={id:string;name:string;detail?:string;friend?:Friend;mood?:CircleMood;lastAt:string;preview:string;previewColor?:string;unread:number;pinnedAt?:string};

const now=()=>Date.now();
const isActive=(m:{expiresAt:string})=>new Date(m.expiresAt).getTime()>now();

export function personFor(store:CircleStore,id:string):Friend|undefined{return store.friends.find(f=>f.id===id)||familyFriend(store,id);}
// Display name without the family suffix, plus a secondary line ("Carlos's family") for family watches.
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
  items.push({kind:'myMood',key:'r'+n.moodId,at:n.at,moodId:n.moodId,mood:n.mood,sharedAt:n.sharedAt??store.myMoods.find(m=>m.id===n.moodId)?.sharedAt,emoji:n.emoji,style:n.style??store.myMoods.find(m=>m.id===n.moodId)?.reactions.find(r=>r.friendId===n.friendId)?.style,unread:!n.read})});
 store.myMoods.forEach(m=>m.reactions.filter(r=>r.friendId===id&&!seen.has(m.id)).forEach(r=>{seen.add(m.id);
  items.push({kind:'myMood',key:'r'+m.id,at:r.at,moodId:m.id,mood:m.mood,sharedAt:m.sharedAt,emoji:r.emoji,style:r.style,unread:false})}));
 store.signals.filter(s=>s.friendId===id).forEach(s=>items.push({kind:'signal',key:'s'+s.id,at:s.at,signal:s}));
 store.sentSignals.forEach((s,i)=>{if(s.friendIds.includes(id))items.push({kind:'sentSignal',key:'x'+s.at+i,at:s.at,signal:s.signal})});
 return items.sort((a,b)=>a.at.localeCompare(b.at));
}

function unreadFor(store:CircleStore,id:string){
 return store.inbox.filter(n=>n.friendId===id&&!n.read).length+store.signals.filter(s=>s.friendId===id&&!s.seen).length
  +store.friendMoods.filter(m=>m.friendId===id&&isActive(m)&&isMoodNew(store,m)).length;
}
export function latestMood(store:CircleStore,id:string){return store.friendMoods.filter(m=>m.friendId===id&&isActive(m)).sort((a,b)=>b.sharedAt.localeCompare(a.sharedAt))[0];}

function previewOf(it:ThreadItem,first:string):{text:string;color?:string;at:string}{
 switch(it.kind){
  case 'theirMood':return it.mood.myReactionAt&&it.mood.myReaction?{text:'You reacted '+it.mood.myReaction+' to '+it.mood.mood,at:it.mood.myReactionAt}:{text:'Feeling '+it.mood.mood,color:MOOD_TINTS[it.mood.mood].color,at:it.at};
  case 'myMood':return {text:'Reacted '+it.emoji+' to your '+it.mood+' mood',at:it.at};
  case 'signal':{const s=signalById(it.signal.signal);return {text:s.emoji+' '+s.label,at:it.at};}
  case 'sentSignal':{const s=signalById(it.signal);return {text:'You sent '+s.emoji+' '+s.label,at:it.at};}
 }
}

type Range={start:number;end:number};
const inRange=(at:string,r?:Range)=>{if(!r)return true;const t=new Date(at).getTime();return t>=r.start&&t<r.end;};
const itemUnread=(store:CircleStore,it:ThreadItem)=>it.kind==='theirMood'?(isMoodNew(store,it.mood)?1:0):it.kind==='myMood'?(it.unread?1:0):it.kind==='signal'?(it.signal.seen?0:1):0;

// One row per person: friends and family profiles with any activity, plus pinned friends. Pinned first, then newest activity.
// With a range (one local day), only that day's activity counts and pinned friends without activity are left out.
export function conversationsFor(store:CircleStore,range?:Range):Conversation[]{
 const ids=new Set<string>([...store.friends.filter(f=>f.pinnedAt).map(f=>f.id),...store.friendMoods.filter(isActive).map(m=>m.friendId),...store.inbox.map(n=>n.friendId),...store.signals.map(s=>s.friendId),...store.sentSignals.flatMap(s=>s.friendIds)]);
 const list:Conversation[]=[];
 ids.forEach(id=>{
  const friend=personFor(store,id);const {name,detail}=personName(store,id);
  if(!friend&&!store.inbox.some(n=>n.friendId===id))return;
  const items=threadItems(store,id).filter(it=>inRange(it.at,range));
  if(!items.length&&(range||!friend?.pinnedAt))return;
  const previews=items.map(it=>previewOf(it,name)).sort((a,b)=>b.at.localeCompare(a.at));
  const p=previews.find(x=>inRange(x.at,range))||previews[0];
  list.push({id,name,detail,friend,mood:latestMood(store,id)?.mood,lastAt:range&&!inRange(p.at,range)?items[items.length-1].at:p?.at||'',preview:p?.text||'No moods shared yet',previewColor:p?.color,
   unread:range?items.reduce((n,it)=>n+itemUnread(store,it),0):unreadFor(store,id),pinnedAt:friend?.pinnedAt});
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

// Messages: Today and Yesterday by default; the History calendar switches to one chosen day until it's cleared.
export function MessagesInbox({onOpen,onInvite,onSend,day,onDay}:{onOpen:(id:string,day?:string)=>void;onInvite:()=>void;onSend:()=>void;day?:string;onDay:(k?:string)=>void}){
 const store=useCircle();useTick(60000);
 const [cal,setCal]=useState(false);
 const hist=useHistoryDay(store,day);
 const today=todayKey(),yest=addDays(today,-1);
 const view=day?withHistory(store,[hist.data]):store;
 const sections=(day?[{title:'',items:conversationsFor(view,dayRange(day))}]
  :[{title:'Today',items:conversationsFor(store,dayRange(today))},{title:'Yesterday',items:conversationsFor(store,dayRange(yest))}]).filter(s=>s.items.length);
 if(!day&&!sections.length){
  if(store.loading)return <View style={{paddingVertical:48,alignItems:'center'}}><ActivityIndicator color={CT.ink}/></View>;
  if(!store.friends.length&&!conversationsFor(store).length)return <EmptyState mood="Joyful" title="Your circle is empty" detail="Invite close friends or family with your personal code. When they share a mood, it shows up here." action="Invite Friends" onAction={onInvite}/>;
 }
 const header=<View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:2}}>
  <Text accessibilityRole="header" style={{flex:1,fontSize:19,fontWeight:'900',color:CT.ink,marginLeft:4}}>Conversations</Text>
  <TouchableOpacity onPress={()=>setCal(true)} accessibilityRole="button" accessibilityLabel={day?'Showing '+longDate(day)+'. Choose another date':'History. Choose a date'} hitSlop={6}
   style={{flexDirection:'row',alignItems:'center',gap:6,minHeight:36,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:CT.line,backgroundColor:'#fff'}}>
   <Ionicons name="calendar-outline" size={16} color={CT.primary}/>
   <Text style={{fontSize:14,fontWeight:'800',color:day?CT.ink:CT.primary}}>{day?shortDate(day):'History'}</Text>
   {day?<Ionicons name="chevron-down" size={14} color={CT.ink}/>:null}
  </TouchableOpacity>
 </View>;
 const filter=day?<View style={{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:CT.primarySoft,borderRadius:14,paddingLeft:12,paddingVertical:4,paddingRight:4}}>
  <Ionicons name="calendar-outline" size={17} color={CT.primary}/>
  <Text style={{flex:1,fontSize:14,fontWeight:'700',color:CT.ink}}>Viewing {longDate(day)}</Text>
  <TouchableOpacity onPress={()=>onDay(undefined)} accessibilityRole="button" accessibilityLabel="Clear date, back to Today and Yesterday" hitSlop={6} style={{width:36,height:36,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={20} color={CT.ink}/></TouchableOpacity>
 </View>:null;
 const body=day&&hist.loading?<View style={{paddingVertical:48,alignItems:'center'}}><ActivityIndicator color={CT.ink}/></View>
  :day&&hist.error?<EmptyState mood="Calm" title="Couldn’t load this day" detail="Check your connection and try again." action="Try Again" onAction={hist.retry}/>
  :day&&!sections.length?<EmptyState mood="Calm" title="No shared moods on this day." detail="Friends’ moods are visible for 24 hours, so earlier days only show reactions to your moods and Little Signals." action="Back to Recent" onAction={()=>onDay(undefined)}/>
  :!sections.length?<EmptyState mood="Calm" title="No messages yet" detail="Nothing from today or yesterday. When someone shares a mood or reacts to yours, their conversation appears here." action="Send a Little Signal" onAction={onSend}/>
  :<View style={{gap:6}}>{sections.map(sec=><View key={sec.title||'day'} style={{gap:6}}>
   {sec.title?<Section title={sec.title}/>:null}
   <View style={[cs.card,{paddingVertical:2,paddingHorizontal:12}]}>
    {sec.items.map((c,i)=>{const time=day?clock(c.lastAt):rowTime(c.lastAt);return <TouchableOpacity key={c.id} onPress={()=>onOpen(c.id,day)} accessibilityRole="button"
     accessibilityLabel={c.name+(c.detail?', '+c.detail:'')+', '+c.preview+', '+time+(c.unread?', '+c.unread+' unread':'')}
     style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderBottomWidth:i===sec.items.length-1?0:1,borderBottomColor:CT.line}}>
     <PersonAvatar store={store} id={c.id}/>
     <View style={{flex:1,gap:3}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
       <Text numberOfLines={1} style={{flexShrink:1,fontSize:16,fontWeight:'900',color:CT.ink}}>{c.name}</Text>
       <View style={{flex:1}}/>
       <Text style={{fontSize:12,color:CT.muted,fontWeight:'600'}}>{time}</Text>
      </View>
      <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
       {c.previewColor?<View style={{width:8,height:8,borderRadius:4,backgroundColor:c.previewColor}}/>:null}
       <Text numberOfLines={1} style={{flex:1,fontSize:14,color:c.unread?CT.ink:CT.muted,fontWeight:c.unread?'700':'500'}}>{c.detail?c.detail+' · ':''}{c.preview}</Text>
       {c.unread?<View style={{minWidth:22,height:22,borderRadius:11,paddingHorizontal:6,backgroundColor:CT.danger,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:12,fontWeight:'900'}}>{c.unread>99?'99+':c.unread}</Text></View>:null}
      </View>
     </View>
     <Ionicons name="chevron-forward" size={17} color={CT.muted}/>
    </TouchableOpacity>})}
   </View>
  </View>)}</View>;
 return <View style={{gap:10}}>
  {header}{filter}{body}
  <CircleCalendarSheet visible={cal} value={day} onClose={()=>setCal(false)} onPick={k=>{setCal(false);onDay(k)}} onRecent={()=>{setCal(false);onDay(undefined)}}/>
 </View>;
}

function ConversationHeader({id,onBack,onInfo,onCalendar}:{id:string;onBack:()=>void;onInfo:()=>void;onCalendar?:()=>void}){
 const store=useCircle();const m=latestMood(store,id);const {name,detail}=personName(store,id);
 const known=!!personFor(store,id);
 return <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:6}}>
  <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to Messages" hitSlop={10} style={{width:32,height:44,justifyContent:'center'}}><Ionicons name="chevron-back" size={27} color={CT.ink}/></TouchableOpacity>
  <PersonAvatar store={store} id={id} size={42}/>
  <View style={{flex:1}}>
   <Text accessibilityRole="header" numberOfLines={1} style={{fontSize:18,fontWeight:'900',color:CT.ink}}>{name}</Text>
   <Text numberOfLines={1} style={{fontSize:12,color:CT.muted,fontWeight:'600'}}>{detail||(known?(m?'Feeling '+m.mood:'In your circle'):'No longer in your circle')}</Text>
  </View>
  {onCalendar?<TouchableOpacity onPress={onCalendar} accessibilityRole="button" accessibilityLabel="Jump to a date" hitSlop={6} style={{width:40,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="calendar-outline" size={24} color={CT.ink}/></TouchableOpacity>:null}
  {store.friends.some(f=>f.id===id)?<TouchableOpacity onPress={onInfo} accessibilityRole="button" accessibilityLabel={'About '+name} hitSlop={10} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="information-circle-outline" size={27} color={CT.ink}/></TouchableOpacity>:null}
 </View>;
}

function Pop({children,trigger}:{children:React.ReactNode;trigger:string}){
 const reduce=useReduceMotion();const v=useRef(new Animated.Value(1)).current;const first=useRef(true);
 useEffect(()=>{if(first.current){first.current=false;return;}if(reduce)return;v.setValue(.6);Animated.spring(v,{toValue:1,friction:4,tension:160,useNativeDriver:true}).start();},[trigger]);
 return <Animated.View style={{transform:[{scale:v}]}}>{children}</Animated.View>;
}

const bubble={borderRadius:22,paddingHorizontal:12,paddingVertical:10,maxWidth:'80%' as const};
const meta={fontSize:11,color:CT.muted,fontWeight:'600' as const};

const UNDO_MS=8000;
type Draft={e:string;style:EmojiStyle;until:number};

function UndoPill({draft,onUndo}:{draft:Draft;onUndo:()=>void}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(t)},[]);
 const left=Math.max(0,draft.until-now);
 return <View style={{alignSelf:'flex-end',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderRadius:18,borderBottomRightRadius:6,borderWidth:1,borderColor:CT.line,paddingLeft:11,paddingRight:5,paddingVertical:5,overflow:'hidden'}}>
  <Emoji e={draft.e} style={draft.style} size={17}/>
  <Text style={{fontSize:13,fontWeight:'800',color:CT.ink}}>Sending in {Math.ceil(left/1000)}s</Text>
  <TouchableOpacity onPress={onUndo} accessibilityRole="button" accessibilityLabel="Undo reaction" hitSlop={8} style={{width:30,height:30,borderRadius:15,backgroundColor:'#FDECEF',alignItems:'center',justifyContent:'center'}}><Ionicons name="trash-outline" size={16} color={CT.danger}/></TouchableOpacity>
  <View style={{position:'absolute',left:0,bottom:0,height:3,width:(left/UNDO_MS*100)+'%' as any,backgroundColor:CT.primary}}/>
 </View>;
}

type ThreadProps={id:string;focus?:string;day?:string;onBack:()=>void;onInfo:()=>void;onSend:()=>void;fill?:boolean;padding?:number};

// Full conversation: header, thread (newest at the bottom) and the reaction bar. With `fill` it owns its scrolling.
export function ConversationScreen({id,focus,day,onBack,onInfo,onSend,fill,padding=20}:ThreadProps){
 const store=useCircle();useTick(60000);
 // Date jump: loads that day's history into this thread (merged, never a second thread) and scrolls to it.
 const [jump,setJump]=useState<string|undefined>(day);
 const [cal,setCal]=useState(false);
 const hist=useHistoryDay(store,jump);
 const [loaded,setLoaded]=useState<Record<string,HistoryDay>>({});
 useEffect(()=>{const d=hist.data;if(jump&&d)setLoaded(l=>l[jump]===d?l:{...l,[jump]:d})},[jump,hist.data]);
 const view=useMemo(()=>withHistory(store,Object.values(loaded)),[store,loaded]);
 const items=threadItems(view,id);
 const {name}=personName(store,id);const first=name.split(' ')[0]||name;
 const [limit,setLimit]=useState(()=>{const i=focus?items.findIndex(x=>x.key===focus):-1;return Math.max(40,i>=0?items.length-i:0)});
 const active=items.filter((x):x is Extract<ThreadItem,{kind:'theirMood'}>=>x.kind==='theirMood');
 const [picked,setPicked]=useState<string|undefined>(()=>focus&&active.some(x=>x.key===focus)?focus:undefined);
 const target=active.find(x=>x.key===picked)||active[active.length-1];
 const [pending,setPending]=useState<Record<string,boolean>>({});
 const [highlight,setHighlight]=useState(focus);
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
 const shown=jump?items:items.slice(-limit);
 const threadY=useRef(0);const dayY=useRef<Record<string,number>>({});const pendingJump=useRef<string|undefined>(day);
 const jumpDay=jump&&!hist.loading?jump:undefined;const dayEmpty=!!jumpDay&&!items.some(it=>keyOf(it.at)===jumpDay);
 const doJump=()=>{const k=pendingJump.current;if(!k||!fill)return;if(dayEmpty){pendingJump.current=undefined;scroll.current?.scrollToEnd({animated:true});return;}const y=dayY.current[k];if(y==null)return;pendingJump.current=undefined;atBottom.current=false;scroll.current?.scrollTo({y:Math.max(0,threadY.current+y-8),animated:didInitial.current});didInitial.current=true;};
 useEffect(()=>{if(!jumpDay)return;pendingJump.current=jumpDay;const t=setTimeout(doJump,150);return()=>clearTimeout(t)},[jumpDay,items.length]);
 const pickDay=(k?:string)=>{setCal(false);setJump(k);if(!k){pendingJump.current=undefined;atBottom.current=true;setTimeout(()=>scroll.current?.scrollToEnd({animated:true}),50)}};
 const openCalendar=()=>{const t=todayKey();
  if(Platform.OS!=='ios'){setCal(true);return;}
  ActionSheetIOS.showActionSheetWithOptions({title:'Jump to Date',options:['Cancel','Today','Yesterday','Select Date…'],cancelButtonIndex:0},i=>{if(i===1)pickDay(t);if(i===2)pickDay(addDays(t,-1));if(i===3)setCal(true)});};
 let lastDay='';
 const thread=!items.length?<View style={{alignItems:'center',gap:8,paddingVertical:40,paddingHorizontal:20}}>
   <PersonAvatar store={store} id={id} size={72}/>
   <Text style={[cs.heading,{textAlign:'center'}]}>Nothing here yet</Text>
   <Text style={[cs.muted,{textAlign:'center',lineHeight:18}]}>When {first} shares a mood with you, it shows up here and you can react with an emoji. Shared moods stay visible for 24 hours.</Text>
  </View>:
  <View style={{gap:6}} onLayout={e=>{threadY.current=e.nativeEvent.layout.y}}>
   {items.length>shown.length?<TouchableOpacity onPress={()=>{atBottom.current=false;setLimit(l=>l+40)}} accessibilityRole="button" style={{alignSelf:'center',paddingVertical:8,paddingHorizontal:14}}><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>Show earlier</Text></TouchableOpacity>:null}
   {shown.map(it=>{
    const day=dayLabel(it.at);const sep=day!==lastDay;lastDay=day;const lit=highlight===it.key;
    return <View key={it.key} style={{gap:4}} onLayout={sep?e=>{dayY.current[keyOf(it.at)]=e.nativeEvent.layout.y;if(pendingJump.current===keyOf(it.at))doJump()}:undefined}>
     {sep?<View style={{alignSelf:'center',backgroundColor:'#E7EFEA',borderRadius:12,paddingHorizontal:12,paddingVertical:4,marginVertical:8}}><Text style={{fontSize:12,fontWeight:'800',color:CT.muted}}>{day}</Text></View>:null}
     {it.kind==='theirMood'?(()=>{const m=it.mood;const t=MOOD_TINTS[m.mood];const selected=target?.key===it.key;
      return <View style={{gap:4}}>
       <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>
        <View style={{width:32,height:32,borderRadius:16,backgroundColor:t.tint,alignItems:'center',justifyContent:'center'}}><MoodPalThumb mood={m.mood} size={26}/></View>
        <TouchableOpacity activeOpacity={.85} onPress={()=>{Haptics.selectionAsync().catch(()=>{});setPicked(it.key)}} accessibilityRole="button"
         accessibilityLabel={first+' is feeling '+m.mood+', '+clock(m.sharedAt)+(m.myReaction?', you reacted '+m.myReaction:'')} accessibilityState={{selected}} accessibilityHint="Choose this mood in the reaction bar"
         style={[bubble,{backgroundColor:t.tint,borderBottomLeftRadius:6,flexDirection:'row',alignItems:'center',gap:10,borderWidth:2,borderColor:selected&&active.length>1||lit?t.color:'transparent'}]}>
         <MoodPalThumb mood={m.mood} size={62}/>
         <View style={{gap:1,paddingRight:4,flexShrink:1}}>
          <Text style={{fontSize:13,fontWeight:'700',color:CT.ink}}>{first} is feeling</Text>
          <Text style={{fontSize:19,fontWeight:'900',color:t.color}}>{m.mood}</Text>
          <Text style={[meta,{marginTop:2}]}>{clock(m.sharedAt)}</Text>
         </View>
        </TouchableOpacity>
       </View>
       {drafts[m.id]?<UndoPill draft={drafts[m.id]} onUndo={()=>undo(m.id)}/>:m.myReaction?<View style={{alignSelf:'flex-end'}}><Pop trigger={m.myReaction}>
        <View accessible accessibilityLabel={'You reacted '+(REACTION_LABELS[m.myReaction]||m.myReaction)+' to '+first+'’s '+m.mood+' mood'+(pending[m.id]?', sending':'')}
         style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:CT.primarySoft,borderRadius:18,borderBottomRightRadius:6,paddingHorizontal:11,paddingVertical:6}}>
         <Emoji e={m.myReaction} style={m.myReactionStyle} size={17}/>
         <Text style={{fontSize:13,fontWeight:'800',color:CT.ink}}>You reacted</Text>
         <Text style={meta}>{m.myReactionAt?clock(m.myReactionAt):''}</Text>
         <Ionicons name={pending[m.id]?'time-outline':'checkmark'} size={13} color={pending[m.id]?CT.muted:CT.primary}/>
        </View></Pop></View>:null}
      </View>;})()
     :it.kind==='myMood'?(()=>{const t=MOOD_TINTS[it.mood];const mine=store.myMoods.find(m=>m.id===it.moodId&&m.active);
      const stop=()=>{if(!mine)return;Haptics.selectionAsync().catch(()=>{});Alert.alert('Stop sharing this '+it.mood+' mood?','Friends will no longer see it or be able to react.',[{text:'Cancel',style:'cancel'},{text:'Stop sharing',style:'destructive',onPress:()=>store.stopSharing(mine.id)}])};
      return <View style={{alignItems:'flex-end'}}>
       <TouchableOpacity activeOpacity={1} onLongPress={mine?stop:undefined} delayLongPress={350} accessibilityRole={mine?'button':undefined} accessibilityHint={mine?'Long press to stop sharing this mood':undefined} accessibilityActions={mine?[{name:'longpress',label:'Stop sharing'}]:undefined} onAccessibilityAction={stop} accessibilityLabel={first+' reacted '+(REACTION_LABELS[it.emoji]||it.emoji)+' to your '+it.mood+' mood, '+clock(it.at)}
        style={[bubble,{backgroundColor:'#fff',borderBottomRightRadius:6,flexDirection:'row',alignItems:'center',gap:12,borderWidth:lit?2:1,borderColor:lit?CT.primary:CT.line}]}>
        <View><View style={{width:46,height:46,borderRadius:23,backgroundColor:t.tint,alignItems:'center',justifyContent:'center'}}><MoodPalThumb mood={it.mood} size={38}/></View>
         <View style={{position:'absolute',right:-9,bottom:-7,backgroundColor:'#fff',borderRadius:14,paddingHorizontal:3,borderWidth:1,borderColor:CT.line}}><Emoji e={it.emoji} style={it.style} size={16}/></View></View>
        <View style={{gap:2,flexShrink:1,paddingLeft:4}}>
         <Text style={{fontSize:13,fontWeight:'700',color:CT.ink}}>{first} reacted {it.emoji}</Text>
         <Text style={{fontSize:14,fontWeight:'800',color:CT.ink}}>to your <Text style={{color:t.color}}>{it.mood}</Text> mood</Text>
         <Text style={meta}>{clock(it.at)}</Text>
        </View>
       </TouchableOpacity>
      </View>;})()
     :it.kind==='signal'?(()=>{const s=signalById(it.signal.signal);
      return <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}><View style={{width:32}}/><View style={[bubble,{backgroundColor:'#FFF1F4',borderBottomLeftRadius:6,flexDirection:'row',alignItems:'center',gap:10,borderWidth:2,borderColor:lit?'#E76B8A':'transparent'}]} accessible accessibilityLabel={first+' sent '+s.label+', '+clock(it.at)}>
       <Text style={{fontSize:28}}>{s.emoji}</Text><View><Text style={{fontSize:14,fontWeight:'800',color:CT.ink}}>{s.label}</Text><Text style={meta}>Little Signal · {clock(it.at)}</Text></View>
      </View></View>;})()
     :(()=>{const s=signalById(it.signal);
      return <View style={{alignItems:'flex-end'}}><View style={[bubble,{backgroundColor:CT.primarySoft,borderBottomRightRadius:6,flexDirection:'row',alignItems:'center',gap:8}]} accessible accessibilityLabel={'You sent '+s.label+', '+clock(it.at)}>
       <Text style={{fontSize:22}}>{s.emoji}</Text><View><Text style={{color:CT.ink,fontWeight:'800',fontSize:13}}>You sent {s.label.toLowerCase()}</Text><Text style={meta}>Little Signal · {clock(it.at)}</Text></View>
      </View></View>;})()}
    </View>;
   })}
  </View>;

 const isFriend=store.friends.some(f=>f.id===id);
 const bar=<View {...(target&&!(target.mood.myReaction&&!drafts[target.mood.id])?swipe.panHandlers:{})} style={{backgroundColor:'#fff',borderRadius:24,padding:12,gap:10,borderWidth:1,borderColor:CT.line}}>
  {target?(()=>{const m=target.mood;const d=drafts[m.id];const done=!!m.myReaction&&!d;const tint=MOOD_TINTS[m.mood].color;
   const btn={width:56,height:52,borderRadius:26,alignItems:'center' as const,justifyContent:'center' as const};
   return <>
   {done?null:<View style={{alignSelf:'center',width:34,height:4,borderRadius:2,backgroundColor:'#E3EAE6',marginTop:-4}}/>}
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
    {done?<><Text numberOfLines={1} style={{flexShrink:1,fontSize:13,fontWeight:'800',color:CT.ink}}>You reacted to {first}’s <Text style={{color:tint}}>{m.mood}</Text> mood</Text><Emoji e={m.myReaction!} style={m.myReactionStyle} size={16}/></>
     :<Text numberOfLines={1} style={{flex:1,fontSize:13,fontWeight:'800',color:CT.ink}}>React to {first}’s <Text style={{color:tint}}>{m.mood}</Text> mood{active.length>1?' · '+clock(m.sharedAt):''}</Text>}
   </View>
   {done?<Text style={[cs.rowSub,{fontSize:12}]}>Sent reactions can’t be changed.{active.length>1?' Tap another mood above to react to it.':''}</Text>
   :<View style={{flexDirection:'row',justifyContent:'space-between'}}>
    {MOOD_REACTIONS[m.mood].map(e=>{const on=d?.e===e&&d.style==='standard';return <TouchableOpacity key={e} disabled={!!pending[m.id]} onPress={()=>react(m,e)} accessibilityRole="button"
     accessibilityLabel={'React '+(REACTION_LABELS[e]||e)+' to '+first+'’s '+m.mood+' mood'} accessibilityState={{selected:on}}
     style={[btn,{backgroundColor:on?CT.primarySoft:'#F5F8F6',borderWidth:on?2:0,borderColor:CT.primary}]}><Text style={{fontSize:27}}>{e}</Text></TouchableOpacity>})}
    <TouchableOpacity disabled={!!pending[m.id]} onPress={()=>setSheet(true)} accessibilityRole="button" accessibilityLabel={isPlus?'More emoji':'More emoji, Plus'} style={[btn,{backgroundColor:'#F5F8F6'}]}>
     <Ionicons name="add" size={28} color={CT.primary}/>
     {!isPlus?<View style={{position:'absolute',top:4,right:6,backgroundColor:CT.primary,borderRadius:8,width:16,height:16,alignItems:'center',justifyContent:'center'}}><Ionicons name="lock-closed" size={9} color="#fff"/></View>:null}
    </TouchableOpacity>
   </View>}
   <EmojiPickerSheet visible={sheet} title={'React to '+first+'’s '+m.mood+' mood'} onClose={()=>setSheet(false)} onPick={(e,st)=>{setSheet(false);react(m,e,st)}}/>
  </>})()
:<View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <Text style={[cs.rowSub,{flex:1,fontSize:12}]}>You can react when {first} shares a mood.</Text>
   {isFriend?<TouchableOpacity onPress={onSend} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:CT.primarySoft,borderRadius:16,paddingHorizontal:12,paddingVertical:9}}><Ionicons name="heart-outline" size={17} color={CT.primary}/><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>Little Signal</Text></TouchableOpacity>:null}
  </View>}
 </View>;
 const header=<ConversationHeader id={id} onBack={onBack} onInfo={onInfo} onCalendar={openCalendar}/>;
 const dayNote=jump&&hist.loading?<View style={{paddingVertical:16,alignItems:'center'}}><ActivityIndicator color={CT.ink}/></View>
  :jump&&hist.error?<View style={[cs.card,{alignItems:'center',gap:8}]}><Text style={[cs.muted,{textAlign:'center'}]}>Couldn’t load {longDate(jump)}.</Text>
   <TouchableOpacity onPress={hist.retry} accessibilityRole="button"><Text style={{color:CT.primary,fontWeight:'800'}}>Try Again</Text></TouchableOpacity></View>
  :dayEmpty&&jumpDay?<View style={[cs.card,{alignItems:'center',gap:10}]}>
   <MoodPalThumb mood="Calm" size={56}/>
   <Text style={[cs.heading,{textAlign:'center',fontSize:16}]}>Nothing with {first} on {longDate(jumpDay)}</Text>
   <Text style={[cs.muted,{textAlign:'center',lineHeight:18}]}>Shared moods are visible for 24 hours, so earlier days only show reactions and Little Signals.</Text>
   <View style={{flexDirection:'row',gap:10}}>
    <TouchableOpacity onPress={()=>setCal(true)} accessibilityRole="button" style={{backgroundColor:CT.primarySoft,borderRadius:16,paddingHorizontal:14,paddingVertical:9}}><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>Choose Another Date</Text></TouchableOpacity>
    <TouchableOpacity onPress={()=>pickDay(undefined)} accessibilityRole="button" style={{backgroundColor:'#F0F4F2',borderRadius:16,paddingHorizontal:14,paddingVertical:9}}><Text style={{color:CT.ink,fontWeight:'800',fontSize:13}}>Back to Latest</Text></TouchableOpacity>
   </View>
  </View>:null;
 const calendar=<CircleCalendarSheet visible={cal} value={jump} onClose={()=>setCal(false)} onPick={k=>pickDay(k)} onRecent={()=>pickDay(undefined)} recentLabel="Back to Latest"/>;
 if(!fill)return <View style={{gap:12}}>{header}<OfflineBanner/>{thread}{dayNote}{bar}{calendar}</View>;
 return <View style={{flex:1}}>
  <View style={{paddingHorizontal:padding-6,paddingTop:4,borderBottomWidth:1,borderBottomColor:CT.line}}>{header}</View>
  <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{paddingHorizontal:padding,paddingVertical:12,gap:10}} showsVerticalScrollIndicator={false}
   scrollEventThrottle={64} onScroll={e=>{const {contentOffset,contentSize,layoutMeasurement}=e.nativeEvent;atBottom.current=contentOffset.y+layoutMeasurement.height>=contentSize.height-80}}
   onContentSizeChange={()=>{if(pendingJump.current){doJump();return;}if(!didInitial.current){didInitial.current=true;scroll.current?.scrollToEnd({animated:false});}else if(atBottom.current)scroll.current?.scrollToEnd({animated:true});}}>
   <OfflineBanner/>
   {thread}
   {dayNote}
  </ScrollView>
  <View style={{paddingHorizontal:padding-8,paddingTop:6,paddingBottom:8}}>{bar}</View>
  {calendar}
 </View>;
}
