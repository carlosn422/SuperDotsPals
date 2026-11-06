import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActionSheetIOS,ActivityIndicator,Alert,Modal,ScrollView,Share,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {CIRCLE_MOODS,CircleGroup,CircleMood,Friend,FriendRequest,FriendSharedMood,LITTLE_SIGNALS,MOOD_REACTIONS,MOOD_TINTS,REACTION_LABELS,SignalId,isToday,signalById,timeAgo,timeLeft} from './LittleSignalsData';
import {CodePreview,activeFriendMoods,circleNewCount,familyFriend,friendName,isMoodNew,uniqueAudience,useCircle} from './CircleStore';
import {usePlus} from './PlusStore';
import {Avatar,CCard,CHeading,CRow,CT,Chip,EmptyState,MoodPalThumb,OfflineBanner,PrimaryButton,SampleDataNote,SignalBurst,SoftButton,ToggleRow,cs} from './CircleComponents';
import {ConversationScreen,MessagesInbox,conversationRef,conversationsFor} from './CircleConversations';
import CircleSignalSheet,{SignalPicker} from './CircleSignalSheet';

export type CircleRoute=
 |{name:'home'}|{name:'invite';groupId?:string}|{name:'enterCode'}|{name:'requests';groupId?:string;groupName?:string}|{name:'assignGroups';requestId:string;groupId?:string;groupName?:string}
 |{name:'friends'}|{name:'friend';id:string}|{name:'groups'}|{name:'group';id?:string;draft?:GroupDraft}|{name:'permissions'}
 |{name:'share';mood:CircleMood}|{name:'send';friendId?:string}|{name:'signalSent';signal:SignalId;friendIds:string[]}
 |{name:'signalReceived';signalId:string}|{name:'friendMood';id:string}|{name:'room';id:string}|{name:'today'}
 |{name:'notifications'}|{name:'widgets'}|{name:'circleSettings'}|{name:'revoked'}|{name:'fromNotification';ref:string}|{name:'chat';id:string;focus?:string};

const TITLES:Record<CircleRoute['name'],string>={chat:'Messages',circleSettings:'Circle Settings',fromNotification:'Circle',home:'Circle',invite:'Invite Friends',enterCode:'Enter Invite Code',requests:'Friend Requests',assignGroups:'Add to Groups',friends:'Friends',friend:'Friend',groups:'Manage Groups',group:'Group',permissions:'Mood Sharing',share:'Choose Audience',send:'Send a Little Signal',signalSent:'Signal Sent',signalReceived:'Little Signal',friendMood:'Shared Mood',room:'Your Mood',today:'Messages',notifications:'Circle Notifications',widgets:'Widgets',revoked:'Not Available'};
type GroupDraft={group:CircleGroup;knownFriendIds:string[]};
const GROUP_ICONS=['heart','home','leaf','star','people','sunny','musical-notes','paw'] as const;
const GROUP_COLORS=['#E76B8A','#488CD9','#3BA986','#E3A426','#7139E9','#D9704B'];

type HomeTab='messages'|'people';
// With `contentStyle` the navigator owns its scrolling (Circle tab and sheet), so a conversation can keep its header and reaction bar on screen.
export default function CircleNavigator({initial=[{name:'home'}],exitLabel='Settings',onExit,mood,onRouteChange,contentStyle,resetKey=0}:{initial?:CircleRoute[];exitLabel?:string;onExit:()=>void;mood?:string;onRouteChange?:()=>void;contentStyle?:any;resetKey?:number}){
 const [stack,setStack]=useState<CircleRoute[]>(initial);
 const [homeTab,setHomeTab]=useState<HomeTab>('messages');
 const store=useCircle();const {refresh}=store;
 useEffect(()=>{onRouteChange?.();void refresh()},[stack.length,stack[stack.length-1]?.name]);
 useEffect(()=>{setStack(initial)},[JSON.stringify(initial)]);
 useEffect(()=>{if(resetKey)setStack([{name:'home'}])},[resetKey]);
 const route=stack[stack.length-1];
 const push=(r:CircleRoute)=>setStack(s=>[...s,r]);
 const replace=(r:CircleRoute)=>setStack(s=>[...s.slice(0,-1),r]);
 const back=()=>{if(stack.length<=1)onExit();else setStack(s=>s.slice(0,-1));};
 const nav={push,replace,back,popTo:(name:CircleRoute['name'])=>setStack(s=>{const i=s.map(x=>x.name).lastIndexOf(name);return i>=0?s.slice(0,i+1):[{name:'home'}]})};
 if(route.name==='chat'){
  const props={id:route.id,focus:route.focus,onBack:back,onInfo:()=>push({name:'friend',id:route.id}),onSend:()=>push({name:'send',friendId:route.id})};
  return contentStyle?<ConversationScreen key={route.id} {...props} fill/>:<ConversationScreen key={route.id} {...props}/>;
 }
 const isHome=(route.name==='home'||route.name==='today')&&stack.length===1;
 const pendingRequests=store.requests.filter(r=>r.direction==='incoming'&&r.status==='pending').length;
 const body=<View style={{gap:14}}>
  {isHome?<View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <View style={{flex:1}}><Text style={[cs.title,{textAlign:'left'}]} accessibilityRole="header">Circle</Text><Text style={[cs.muted,{fontSize:14}]}>Stay connected through moods.</Text></View>
   <HeaderButton icon="notifications-outline" label={pendingRequests?pendingRequests+' friend requests':'Requests and invites'} dot={pendingRequests>0} onPress={()=>push({name:'requests'})}/>
  </View>:
  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative'}}>
    {stack.length > 1 && (
        <TouchableOpacity onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{position: 'absolute', left: 0, padding: 4}}>
            <Ionicons name="chevron-back" size={22} color={CT.ink}/>
        </TouchableOpacity>
    )}
    <Text style={cs.title}>{TITLES[route.name]}</Text>
  </View>}
  <OfflineBanner/>
  <Screen route={route} nav={nav} mood={mood} homeTab={homeTab} setHomeTab={setHomeTab}/>
 </View>;
 return contentStyle?<ScrollView key={stack.length+route.name+resetKey} style={{flex:1}} contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{body}</ScrollView>:body;
}
type Nav={push:(r:CircleRoute)=>void;replace:(r:CircleRoute)=>void;back:()=>void;popTo:(n:CircleRoute['name'])=>void};

function Screen({route,nav,mood,homeTab='messages',setHomeTab=()=>{}}:{route:CircleRoute;nav:Nav;mood?:string;homeTab?:HomeTab;setHomeTab?:(t:HomeTab)=>void}){
 switch(route.name){
  case 'home':case 'today':return <Home nav={nav} tab={homeTab} onTab={setHomeTab}/>;
  case 'chat':return null;
  case 'invite':return <Invite groupId={route.groupId} nav={nav}/>;
  case 'enterCode':return <EnterCode nav={nav}/>;
  case 'requests':return <Requests groupId={route.groupId} groupName={route.groupName} nav={nav}/>;
  case 'assignGroups':return <AssignGroups id={route.requestId} groupId={route.groupId} groupName={route.groupName} nav={nav}/>;
  case 'friends':return <Friends nav={nav}/>;
  case 'friend':return <FriendDetail id={route.id} nav={nav}/>;
  case 'groups':return <Groups nav={nav}/>;
  case 'group':return <GroupEdit id={route.id} draft={route.draft} nav={nav}/>;
  case 'permissions':return <Permissions/>;
  case 'share':return <ChooseAudience mood={route.mood} nav={nav}/>;
  case 'send':return <SendSignal friendId={route.friendId} nav={nav}/>;
  case 'signalSent':return <SignalSent signal={route.signal} friendIds={route.friendIds} nav={nav}/>;
  case 'signalReceived':return <OpenConversation refId={route.signalId} nav={nav} missing={<EmptyState title="Signal not found" detail="It may have been from someone no longer in your circle."/>}/>;
  case 'friendMood':return <OpenConversation refId={route.id} nav={nav} missing={<Screen route={{name:'revoked'}} nav={nav}/>}/>;
  case 'room':return <OpenConversation refId={route.id} nav={nav} missing={<OpenInbox nav={nav}/>}/>;
  case 'notifications':return <NotificationSettings/>;
  case 'widgets':return <WidgetPreviews/>;
  case 'circleSettings':return <CircleSettings nav={nav}/>;
  case 'fromNotification':return <OpenFromNotification id={route.ref} nav={nav}/>;
  case 'revoked':return <EmptyState mood="Sad" title="This mood is no longer available" detail="It may have expired after 24 hours, or the person stopped sharing with you. Shared moods are only visible to people they were shared with."/>;
 }
}

function HeaderButton({icon,label,dot,onPress}:{icon:any;label:string;dot?:boolean;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label+(dot?', new activity':'')} onPress={onPress} style={{width:44,height:44,borderRadius:22,backgroundColor:CT.primarySoft,alignItems:'center',justifyContent:'center'}}>
  <Ionicons name={icon} size={21} color={CT.primary}/>{dot?<View style={{position:'absolute',top:9,right:10,width:9,height:9,borderRadius:5,backgroundColor:CT.danger,borderWidth:1.5,borderColor:'#fff'}}/>:null}
 </TouchableOpacity>;
}
function Stat({value,label,icon,dot,onPress}:{value:number;label:string;icon:any;dot?:boolean;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={value+' '+label+(dot?', waiting for you':'')} onPress={onPress} style={{flex:1,alignItems:'center',backgroundColor:CT.background,borderRadius:16,paddingVertical:12,gap:2}}>
  <View><Ionicons name={icon} size={20} color={CT.primary}/>{dot?<View style={{position:'absolute',top:-2,right:-5,width:8,height:8,borderRadius:4,backgroundColor:CT.danger}}/>:null}</View>
  <Text style={{fontSize:24,fontWeight:'900',color:CT.ink}}>{value}</Text><Text style={{fontSize:11,color:CT.muted,fontWeight:'700'}}>{label}</Text>
 </TouchableOpacity>;
}

type Person={f:Friend;mood?:FriendSharedMood;isNew:boolean};
// Pinned first (in the order they were pinned), then latest shared mood, then everyone else by name.
function sortPeople(people:Person[],mode:'recent'|'all'){
 const byName=(a:Person,b:Person)=>a.f.name.localeCompare(b.f.name);
 if(mode==='all')return [...people].sort(byName);
 return [...people].sort((a,b)=>{
  if(!!a.f.pinnedAt!==!!b.f.pinnedAt)return a.f.pinnedAt?-1:1;
  if(a.f.pinnedAt&&b.f.pinnedAt)return a.f.pinnedAt.localeCompare(b.f.pinnedAt);
  if(!!a.mood!==!!b.mood)return a.mood?-1:1;
  if(a.mood&&b.mood)return b.mood.sharedAt.localeCompare(a.mood.sharedAt);
  return byName(a,b);
 });
}
function whenLabel(iso:string){const d=new Date(iso);const t=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});return (isToday(iso)?'Today':d.toLocaleDateString(undefined,{weekday:'short'}))+' · '+t;}

function PersonCircle({p,onPress,onLongPress}:{p:Person;onPress:()=>void;onLongPress:()=>void}){
 const t=p.mood?MOOD_TINTS[p.mood.mood]:undefined;
 const label=p.f.name+(p.mood?', '+p.mood.mood+', '+timeAgo(p.mood.sharedAt)+(p.isNew?', new':''):', no mood shared')+(p.f.pinnedAt?', pinned':'');
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Long press for pin options" onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={{width:96,alignItems:'center',gap:4}}>
  <View style={{width:84,height:84,borderRadius:42,borderWidth:p.isNew?3:1.5,borderColor:p.isNew&&t?t.color:'#DCE5E0',backgroundColor:t?t.tint:CT.background,alignItems:'center',justifyContent:'center'}}>
   {p.mood?<MoodPalThumb mood={p.mood.mood} size={58}/>:<Avatar initials={p.f.initials} color={p.f.color} size={54}/>}
   {p.f.pinnedAt?<View style={{position:'absolute',top:-3,right:-3,width:24,height:24,borderRadius:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#DCE5E0',alignItems:'center',justifyContent:'center'}}><Ionicons name="pin" size={13} color={CT.primary}/></View>:null}
  </View>
  <Text numberOfLines={1} style={{fontSize:14,fontWeight:'900',color:CT.ink,maxWidth:94}}>{p.f.name}</Text>
  {p.mood&&t?<><View style={{backgroundColor:t.tint,paddingHorizontal:9,paddingVertical:3,borderRadius:10}}><Text style={{color:t.color,fontWeight:'800',fontSize:11}}>{p.mood.mood}</Text></View>
   <Text style={[cs.rowSub,p.isNew?{color:t.color,fontWeight:'800'}:null]}>{p.isNew?'New · ':''}{timeAgo(p.mood.sharedAt)}</Text></>
   :<Text style={cs.rowSub}>No mood yet</Text>}
 </TouchableOpacity>;
}

function YourPeople({nav}:{nav:Nav}){
 const store=useCircle();
 const [allOpen,setAllOpen]=useState(false);
 const latest=new Map<string,FriendSharedMood>();
 activeFriendMoods(store).forEach(m=>{const cur=latest.get(m.friendId);if(!cur||m.sharedAt>cur.sharedAt)latest.set(m.friendId,m)});
 const all=store.friends.map(f=>{const mood=latest.get(f.id);return {f,mood,isNew:!!mood&&isMoodNew(store,mood)}});
 const people=sortPeople(all,'recent');
 function options(f:Friend){
  const pin=()=>store.updateFriend(f.id,{pinnedAt:f.pinnedAt?undefined:new Date().toISOString()});
  ActionSheetIOS.showActionSheetWithOptions({title:f.name,options:['Cancel',f.pinnedAt?'Unpin':'Pin to Top','View Profile'],cancelButtonIndex:0},i=>{if(i===1)pin();if(i===2)nav.push({name:'friend',id:f.id})});
 }
 return <CCard style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <Text style={[cs.rowTitle,{fontSize:19,flex:1}]} accessibilityRole="header">Your People</Text>
   <Chip label="Most Recent" selected onPress={()=>{}}/>
   <Chip label="All Friends" selected={false} onPress={()=>setAllOpen(true)}/>
  </View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6,paddingRight:4}} style={{marginHorizontal:-4}}>
   {people.map(p=><PersonCircle key={p.f.id} p={p} onLongPress={()=>options(p.f)} onPress={()=>nav.push({name:'chat',id:p.f.id})}/>)}
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add Friend" onPress={()=>nav.push({name:'invite'})} style={{width:96,alignItems:'center',gap:4}}>
    <View style={{width:84,height:84,borderRadius:42,borderWidth:1.5,borderStyle:'dashed',borderColor:CT.primary,alignItems:'center',justifyContent:'center',backgroundColor:CT.primarySoft}}><Ionicons name="person-add-outline" size={28} color={CT.primary}/></View>
    <Text style={{fontSize:14,fontWeight:'900',color:CT.primary}}>Add Friend</Text>
   </TouchableOpacity>
  </ScrollView>
  {store.friends.length>1&&!store.friends.some(f=>f.pinnedAt)?<Text style={[cs.rowSub,{textAlign:'center'}]}>Tip: long-press someone to pin them to the front.</Text>:null}
  <AllFriendsSheet visible={allOpen} people={all} onClose={()=>setAllOpen(false)} onOpen={p=>{setAllOpen(false);nav.push({name:'chat',id:p.f.id})}} onAdd={()=>{setAllOpen(false);nav.push({name:'invite'})}}/>
 </CCard>;
}

function AllFriendsSheet({visible,people,onClose,onOpen,onAdd}:{visible:boolean;people:Person[];onClose:()=>void;onOpen:(p:Person)=>void;onAdd:()=>void}){
 const [q,setQ]=useState('');
 useEffect(()=>{if(!visible)setQ('')},[visible]);
 const term=q.trim().toLowerCase();
 const shown=sortPeople(people,'all').filter(p=>!term||p.f.name.toLowerCase().includes(term));
 const sections:{letter:string;items:Person[]}[]=[];
 shown.forEach(p=>{const ch=p.f.name.trim().charAt(0).toUpperCase();const letter=/[A-Z]/.test(ch)?ch:'#';const last=sections[sections.length-1];if(last&&last.letter===letter)last.items.push(p);else sections.push({letter,items:[p]})});
 return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
  <View style={{flex:1,backgroundColor:CT.background}}>
   <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingTop:18,paddingBottom:10}}>
    <Text accessibilityRole="header" style={{flex:1,fontSize:24,fontWeight:'900',color:CT.ink}}>All Friends</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={10}><Text style={{color:CT.primary,fontWeight:'800',fontSize:16}}>Done</Text></TouchableOpacity>
   </View>
   <View style={{marginHorizontal:20,marginBottom:8,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:CT.line,paddingHorizontal:12}}>
    <Ionicons name="search" size={17} color={CT.muted}/>
    <TextInput value={q} onChangeText={setQ} placeholder="Search friends" accessibilityLabel="Search friends" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" style={{flex:1,paddingVertical:11,fontSize:16,color:CT.ink}}/>
   </View>
   <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{paddingHorizontal:20,paddingBottom:40,gap:10}}>
    <Text style={cs.rowSub}>{term?shown.length+(shown.length===1?' match':' matches'):people.length+(people.length===1?' friend':' friends')}</Text>
    {sections.map(sec=><View key={sec.letter} style={{gap:6}}>
     <Text style={{fontSize:13,fontWeight:'900',color:CT.muted,marginLeft:4}}>{sec.letter}</Text>
     <CCard style={{paddingVertical:4}}>
      {sec.items.map((p,i)=><CRow key={p.f.id} last={i===sec.items.length-1} onPress={()=>onOpen(p)} title={p.f.name}
       subtitle={p.mood?p.mood.mood+' · '+timeAgo(p.mood.sharedAt):'No mood yet'}
       leading={p.mood?<MoodPalThumb mood={p.mood.mood} size={40}/>:<Avatar initials={p.f.initials} color={p.f.color} size={40}/>}
       right={p.f.pinnedAt?<View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="pin" size={15} color={CT.primary}/><Ionicons name="chevron-forward" size={18} color={CT.primary}/></View>:undefined}/>)}
     </CCard>
    </View>)}
    {term&&!shown.length?<Text style={[cs.rowSub,{textAlign:'center',marginTop:20}]}>No friends match “{q.trim()}”.</Text>:null}
    <SoftButton label="Add Friend" icon="person-add-outline" onPress={onAdd}/>
   </ScrollView>
  </View>
 </Modal>;
}

function HomeTabs({tab,onTab,unread}:{tab:HomeTab;onTab:(t:HomeTab)=>void;unread:number}){
 const item=(k:HomeTab,label:string,icon:any,badge?:number)=>{const on=tab===k;return <TouchableOpacity key={k} onPress={()=>onTab(k)} accessibilityRole="tab" accessibilityState={{selected:on}} accessibilityLabel={label+(badge?', '+badge+' unread':'')}
  style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:11,borderRadius:22,backgroundColor:on?CT.primary:'transparent'}}>
  <Ionicons name={icon} size={19} color={on?'#fff':CT.ink}/><Text style={{fontSize:15,fontWeight:'800',color:on?'#fff':CT.ink}}>{label}</Text>
  {badge?<View style={{position:'absolute',top:-4,right:18,minWidth:20,height:20,borderRadius:10,paddingHorizontal:5,backgroundColor:CT.danger,borderWidth:1.5,borderColor:'#fff',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:11,fontWeight:'900'}}>{badge>99?'99+':badge}</Text></View>:null}
 </TouchableOpacity>};
 return <View accessibilityRole="tablist" style={{flexDirection:'row',backgroundColor:'#fff',borderRadius:26,padding:4,gap:4,borderWidth:1,borderColor:CT.line}}>
  {item('messages','Messages',tab==='messages'?'chatbubble':'chatbubble-outline',unread)}{item('people','People',tab==='people'?'people':'people-outline')}
 </View>;
}

function Home({nav,tab='messages',onTab=()=>{}}:{nav:Nav;tab?:HomeTab;onTab?:(t:HomeTab)=>void}){
 const store=useCircle();
 const {isPlus,showPaywall}=usePlus();
 useEffect(()=>{void store.ensurePush()},[]);
 const pending=store.requests.filter(r=>r.status==='pending'&&r.direction==='incoming').length;
 const unread=conversationsFor(store).reduce((n,c)=>n+c.unread,0);
 const [signal,setSignal]=useState(false);
 return <>
  <HomeTabs tab={tab} onTab={onTab} unread={unread}/>
  {store.friends.length?<TouchableOpacity onPress={()=>setSignal(true)} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:CT.primarySoft,borderRadius:22,paddingVertical:12}}><Ionicons name="heart" size={18} color={CT.primary}/><Text style={{color:CT.primary,fontWeight:'900',fontSize:15}}>Send a Little Signal</Text></TouchableOpacity>:null}
  <CircleSignalSheet visible={signal} onClose={()=>setSignal(false)} onInvite={()=>nav.push({name:'invite'})}/>
  {tab==='messages'?<MessagesInbox onOpen={id=>nav.push({name:'chat',id})} onInvite={()=>nav.push({name:'invite'})} onSend={()=>nav.push({name:'send'})}/>:<>
  <CCard style={{gap:14}}>
   <View style={{flexDirection:'row',gap:9}}>
    <Stat icon="people-outline" value={store.friends.length} label={store.friends.length===1?'Friend':'Friends'} onPress={()=>nav.push({name:'friends'})}/>
    <Stat icon="albums-outline" value={store.groups.length} label={store.groups.length===1?'Group':'Groups'} onPress={()=>nav.push({name:'groups'})}/>
    <Stat icon="mail-outline" value={pending} label={pending===1?'Request':'Requests'} dot={pending>0} onPress={()=>nav.push({name:'requests'})}/>
   </View>
   <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><PrimaryButton label="Invite Friends" icon="person-add-outline" onPress={()=>nav.push({name:'invite'})}/></View><View style={{flex:1}}><SoftButton label="Enter Code" icon="keypad-outline" onPress={()=>nav.push({name:'enterCode'})}/></View></View>
  </CCard>
  {pending?<RequestsCard pending={pending} onPress={()=>nav.push({name:'requests'})}/>:null}
  {!store.friends.length?<EmptyState mood="Joyful" title="Your circle is empty" detail="Invite close friends or family with your personal code. Nobody can find you by searching — only people you share your code with." action="Invite Friends" onAction={()=>nav.push({name:'invite'})}/>:<>
   <YourPeople nav={nav}/>
  </>}
  <CCard style={{gap:8}}>
   <Text style={[cs.rowTitle,{fontSize:19}]} accessibilityRole="header">Groups</Text>
   {store.groups.length?<View>{store.groups.map((g,i)=><CRow key={g.id} last={i===store.groups.length-1} icon={g.icon} tint={g.color+'22'} color={g.color} title={g.name} subtitle={g.memberIds.length+(g.memberIds.length===1?' member':' members')} onPress={()=>nav.push({name:'group',id:g.id})}/>)}</View>
    :<Text style={cs.rowSub}>Groups like Family or Close Friends let you choose who sees which moods.</Text>}
   <SoftButton label="Create a Group" icon="add" onPress={()=>!isPlus?showPaywall('circles'):nav.push({name:'group'})}/>
  </CCard>
  <CCard style={{paddingVertical:4}}><CRow icon="settings-outline" title="Circle Settings" subtitle="Mood sharing, notifications and widgets" onPress={()=>nav.push({name:'circleSettings'})} last/></CCard>
  </>}
  {store.live?null:<PrototypeControls nav={nav}/>}
 </>;
}

function CircleSettings({nav}:{nav:Nav}){
 const store=useCircle();
 return <CCard style={{paddingVertical:4}}>
  <CRow icon="people-outline" title="Friends" subtitle={store.friends.length+' approved friends'} onPress={()=>nav.push({name:'friends'})}/>
  <CRow icon="albums-outline" title="Manage Groups" subtitle={store.groups.map(g=>g.name).join(', ')||'Create your first group'} onPress={()=>nav.push({name:'groups'})}/>
  <CRow icon="happy-outline" title="Mood Sharing Settings" subtitle="Choose which moods each group can see" onPress={()=>nav.push({name:'permissions'})}/>
  <CRow icon="notifications-outline" title="Notification Settings" subtitle="Signals, reactions and lock-screen privacy" onPress={()=>nav.push({name:'notifications'})}/>
  <CRow icon="apps-outline" title="Home Screen Widgets" subtitle="Little Signals small and medium widgets" onPress={()=>nav.push({name:'widgets'})} last/>
 </CCard>;
}

function PrototypeControls({nav}:{nav:Nav}){
 const store=useCircle();
 return <CCard style={{gap:6,backgroundColor:'#FBFAFE'}}>
  <SampleDataNote/>
  <Text style={[cs.muted,{textAlign:'center',marginBottom:4}]}>Review tools for the prototype — not part of the final feature.</Text>
  <ToggleRow title="Simulate offline" value={store.offline} onChange={store.setOffline}/>
  <CRow icon="gift-outline" title="Simulate receiving a signal" subtitle="Jamie sends a hug" onPress={()=>{const id=store.friends[0]?.id||'jamie';store.simulateIncomingSignal(id,'hug');nav.push({name:'chat',id})}}/>
  <CRow icon="eye-off-outline" title="Open a revoked or expired mood link" onPress={()=>nav.push({name:'revoked'})}/>
  <CRow icon="trash-outline" title="Show empty states" onPress={store.showEmpty}/>
  <CRow icon="refresh-outline" title="Reset sample data" onPress={store.reset} last/>
 </CCard>;
}

function RequestsCard({pending,onPress}:{pending:number;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={pending+' friend '+(pending===1?'request':'requests')+'. People want to join your Circle.'} onPress={onPress}
   style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:MOOD_TINTS.Joyful.tint,borderRadius:20,padding:12}}>
   <MoodPalThumb mood="Joyful" size={52}/>
   <View style={{flex:1}}><Text style={[cs.rowTitle,{fontSize:17}]}>{pending} Friend {pending===1?'Request':'Requests'}</Text><Text style={cs.rowSub}>{pending===1?'Someone wants':'People want'} to join your Circle.</Text></View>
   <Ionicons name="chevron-forward" size={20} color={MOOD_TINTS.Joyful.color}/>
  </TouchableOpacity>;
}

function expiryLabel(iso:string){
 const hours=Math.max(0,Math.round((new Date(iso).getTime()-Date.now())/36e5));
 return hours>=36?Math.round(hours/24)+' days':hours>=1?hours+(hours===1?' hour':' hours'):'less than an hour';
}

function GroupInviteCard({group}:{group:CircleGroup}){
 const store=useCircle();const [inv,setInv]=useState<{code:string;expiresAt:string}|null>(null);const [copied,setCopied]=useState(false);
 useEffect(()=>{let live=true;void store.groupInvite(group.id).then(v=>{if(live)setInv(v)});return()=>{live=false}},[group.id]);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(t)},[copied]);
 const name=group.name.trim()||'this group';
 return <>
  <CHeading title={'Invite to '+name} detail={'Approved friends join '+name}/>
  <CCard style={{alignItems:'center',gap:8,paddingVertical:18}}>
   {inv?<><Text accessibilityLabel={'Invite code '+inv.code.split('').join(' ')} style={{fontSize:28,fontWeight:'900',letterSpacing:3,color:CT.ink}}>{inv.code}</Text>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="time-outline" size={14} color={CT.muted}/><Text style={cs.muted}>Expires in {expiryLabel(inv.expiresAt)}</Text></View></>:<ActivityIndicator/>}
  </CCard>
  {inv?<View style={{flexDirection:'row',gap:9}}>
   <View style={{flex:1}}><SoftButton label={copied?'Copied':'Copy Code'} icon={copied?'checkmark-circle-outline':'copy-outline'} onPress={()=>void Clipboard.setStringAsync(inv.code).then(()=>setCopied(true))}/></View>
   <View style={{flex:1}}><PrimaryButton label="Share Invite" icon="share-outline" onPress={()=>void Share.share({message:'Join my '+name+' group on MoodPals 💚 Open the app and enter my invite code: '+inv.code})}/></View>
  </View>:null}
 </>;
}

function Invite({groupId,nav}:{groupId?:string;nav:Nav}){
 const {invite,regenerateCode,requests,groups}=useCircle();
 const {isPlus,showPaywall}=usePlus();
 const picked=groupId?groups.find(g=>g.id===groupId):undefined;
 const def=groups.find(g=>g.isDefault)?.name;
 const incoming=requests.filter(r=>r.status==='pending'&&r.direction==='incoming');
 const [copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(t)},[copied]);
 const copy=async()=>{await Clipboard.setStringAsync(invite.code);setCopied(true)};
 const left=expiryLabel(invite.expiresAt);
 const waitingFor=incoming.length?<><CHeading title="Waiting for you" detail="Approve to add them to your circle"/><CCard style={{paddingVertical:4}}>{incoming.map((r,i)=><RequestRow key={r.id} r={r} tab="incoming" last={i===incoming.length-1} nav={nav}/>)}</CCard></>:null;
 if(!groupId&&groups.length)return <>
  {waitingFor}
  <CHeading title="Got a friend’s code?" detail="Enter it to send them a request."/>
  <EnterCode nav={nav}/>
  <CHeading title="Who are you inviting?" detail="Pick a group. Approved friends join it."/>
  <CCard style={{paddingVertical:4}}>
   {groups.map(g=><CRow key={g.id} icon={g.icon} tint={g.color+'22'} color={g.color} title={g.name} subtitle={g.memberIds.length+(g.memberIds.length===1?' member':' members')} onPress={()=>nav.push({name:'invite',groupId:g.id})}/>)}
   <CRow last icon="add" title="Create a Group" subtitle={isPlus?undefined:'MoodPals Plus'} onPress={()=>!isPlus?showPaywall('circles'):nav.push({name:'group'})}/>
  </CCard>
 </>;
 if(picked&&!picked.isDefault)return <>{waitingFor}<GroupInviteCard group={picked}/><HowItWorks group={picked.name}/></>;
 if(!invite.code)return <EmptyState mood="Calm" title="Getting your code…" detail="Connect to the internet to create your invite code."/>;
 const share=()=>void Share.share({message:'Join my circle on MoodPals 💚 Open the app and enter my invite code: '+invite.code});
 return <>
  {waitingFor}
  <CCard style={{alignItems:'center',gap:10,paddingVertical:24}}>
   <MoodPalThumb mood="Joyful" size={84}/>
   <Text style={[cs.muted,{fontSize:13}]}>Your personal invite code</Text>
   <Text accessibilityLabel={'Invite code '+invite.code.split('').join(' ')} style={{fontSize:34,fontWeight:'900',letterSpacing:3,color:CT.ink}}>{invite.code}</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="time-outline" size={14} color={CT.muted}/><Text style={cs.muted}>Expires in {left}</Text></View>
   {def?<Text style={[cs.muted,{textAlign:'center'}]}>Approved friends join “{def}”</Text>:null}
  </CCard>
  <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><SoftButton label={copied?"Copied":"Copy Code"} icon={copied?"checkmark-circle-outline":"copy-outline"} onPress={()=>void copy()}/></View><View style={{flex:1}}><PrimaryButton label="Share Invite" icon="share-outline" onPress={share}/></View></View>
  <SoftButton label="Regenerate Code" icon="refresh-outline" onPress={()=>Alert.alert('Regenerate code?','Your current code will stop working immediately. Pending requests already sent stay in your Friend Requests.',[{text:'Cancel',style:'cancel'},{text:'Regenerate',style:'destructive',onPress:regenerateCode}])}/>
  <HowItWorks group={def}/>
 </>;
}

function HowItWorks({group}:{group?:string}){
 return <>
  <CCard style={{gap:8}}><CHeading title="How it works"/>
   {['Share your code with someone you trust.','They enter it in MoodPals and send you a request.',group?'You approve, and they join “'+group+'”. Change their groups anytime.':'You approve the request and choose their groups.','Nothing is shared until you decide to share a mood.'].map((t,i)=><View key={i} style={{flexDirection:'row',gap:10,alignItems:'flex-start'}}><View style={{width:22,height:22,borderRadius:11,backgroundColor:CT.primarySoft,alignItems:'center',justifyContent:'center'}}><Text style={{color:CT.primary,fontWeight:'900',fontSize:12}}>{i+1}</Text></View><Text style={{flex:1,color:CT.ink,fontSize:13,lineHeight:19}}>{t}</Text></View>)}
  </CCard>
 </>;
}

function EnterCode({nav}:{nav:Nav}){
 const store=useCircle();
 const [code,setCode]=useState('');const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<null|CodePreview['state']|'sent'>(null);const [found,setFound]=useState<CodePreview|null>(null);
 const check=async()=>{setBusy(true);try{const r=await store.previewCode(code,store.invite.code);setFound(r);setResult(r.state);}catch(e:any){Alert.alert('Couldn’t check that code',e?.message||'Please try again.')}finally{setBusy(false)}};
 const send=async()=>{setBusy(true);try{const r=await store.redeemCode(code);setResult(r==='sent'?'sent':r==='pending'?'pending':r==='already_friends'?'already_friends':'invalid');}catch(e:any){Alert.alert('Couldn’t send your request',e?.message||'Please try again.')}finally{setBusy(false)}};
 const known=useRef<string[]|null>(null);
 const waiting=result==='sent'||result==='pending';
 useEffect(()=>{if(!waiting){known.current=null;return}
  if(!known.current){known.current=store.friends.map(f=>f.id);return}
  if(store.friends.some(f=>!known.current!.includes(f.id)))nav.popTo('home');
 },[waiting,store.friends]);
 const format=(t:string)=>{const up=t.toUpperCase().replace(/[^A-Z0-9-]/g,'');if('MP-'.startsWith(up))return up;const raw=up.replace(/-/g,'').replace(/^MP/,'').slice(0,5);return raw?'MP-'+raw:''};
 const name=found?.name||'your friend';
 return <>
  <CCard style={{gap:12}}>
   <Text style={cs.muted}>Enter the code a friend shared with you.</Text>
   <TextInput value={code} onChangeText={t=>{setCode(format(t));setResult(null);setFound(null)}} placeholder="MP-XXXXX" autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Invite code"
    style={{borderWidth:1.5,borderColor:CT.border,borderRadius:16,paddingHorizontal:16,paddingVertical:14,fontSize:24,fontWeight:'900',letterSpacing:3,color:CT.ink,textAlign:'center'}}/>
   <PrimaryButton label={busy?'Checking…':'Continue'} onPress={()=>void check()} disabled={code.length<8||store.offline||busy}/>
   {store.offline?<Text style={[cs.muted,{textAlign:'center'}]}>Connect to the internet to check a code.</Text>:null}
   {store.live?null:<Text style={[cs.muted,{textAlign:'center'}]}>Try MP-4QW8N (valid), MP-2EXP1 (expired) or MP-9RVK0 (revoked).</Text>}
  </CCard>
  {result==='invalid'?<StateCard icon="alert-circle-outline" color="#D9704B" title="We couldn’t find that code" detail="Check the letters and try again. After several attempts you’ll need to wait a few minutes."/>:null}
  {result==='rate_limited'?<StateCard icon="hourglass-outline" color="#C99A12" title="Too many attempts" detail="For everyone’s privacy, please wait about 10 minutes before trying another code."/>:null}
  {result==='own'?<StateCard icon="person-outline" color={CT.muted} title="That’s your own code" detail="Share it with a friend so they can send you a request."/>:null}
  {result==='expired'?<StateCard icon="time-outline" color="#C99A12" title="This invite has expired" detail="Invite codes expire after 2 days. Ask your friend to share a new code."/>:null}
  {result==='revoked'?<StateCard icon="close-circle-outline" color={CT.danger} title="This invite is no longer active" detail="Your friend regenerated their code. Ask them for the new one."/>:null}
  {result==='already_friends'?<StateCard icon="people-outline" color={CT.primary} title={'You’re already friends with '+name} detail="Find them in Friends."/>:null}
  {result==='pending'?<StateCard icon="hourglass-outline" color={CT.primary} title="Request already sent" detail={'Waiting for '+name+' to approve it.'}/>:null}
  {(result==='valid'||result==='sent')&&found?<CCard style={{alignItems:'center',gap:8,paddingVertical:20}}>
   <Avatar initials={found.initials||'?'} color={found.color||'#7BC6A4'} size={64}/>
   <Text style={{fontSize:20,fontWeight:'900',color:CT.ink}}>{name}</Text>
   <Text style={cs.muted}>invited you to their circle</Text>
   <Text style={[cs.muted,{textAlign:'center',lineHeight:18}]}>You’ll be connected only after {name} approves your request. Nothing is shared automatically.</Text>
   <View style={{alignSelf:'stretch',marginTop:6}}>{result==='sent'?<SoftButton label="Request sent · waiting for approval" icon="checkmark-circle-outline" onPress={()=>nav.push({name:'requests'})}/>:
    <PrimaryButton label={busy?'Sending…':'Send Friend Request'} icon="paper-plane-outline" disabled={busy} onPress={()=>void send()}/>}</View>
  </CCard>:null}
 </>;
}
function StateCard({icon,color,title,detail}:{icon:any;color:string;title:string;detail:string}){return <CCard style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}><Ionicons name={icon} size={24} color={color}/><View style={{flex:1,gap:3}}><Text style={cs.rowTitle}>{title}</Text><Text style={cs.rowSub}>{detail}</Text></View></CCard>;}

function RequestRow({r,tab,last,nav,groupId,groupName}:{r:FriendRequest;tab:'incoming'|'outgoing';last:boolean;nav:Nav;groupId?:string;groupName?:string}){
 const store=useCircle();
 return <View style={[cs.row,last&&{borderBottomWidth:0},{flexWrap:'wrap'}]}>
   <Avatar initials={r.initials} color={r.color}/>
   <View style={{flex:1,gap:2}}><Text style={cs.rowTitle}>{r.name}</Text><Text style={cs.rowSub}>{r.status==='declined'?'Not accepted':(tab==='incoming'?(r.groupName?'Joins '+r.groupName+' · ':'Wants to join your circle · '):'Sent ')+timeAgo(r.sentAt)}</Text></View>
   {tab==='incoming'?<View style={{flexDirection:'row',gap:7}}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>Alert.alert('Decline '+r.name+'?','They won’t be told you declined. Their request just disappears.',[{text:'Cancel',style:'cancel'},{text:'Decline',style:'destructive',onPress:()=>store.declineRequest(r.id)}])} style={[cs.soft,{backgroundColor:'#F3F5F4',paddingVertical:9}]}><Text style={{fontWeight:'800',color:CT.muted,fontSize:13}}>Decline</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={()=>!groupId&&r.groupId?store.acceptRequest(r.id,[r.groupId]):nav.push({name:'assignGroups',requestId:r.id,groupId,groupName})} style={[cs.soft,{backgroundColor:CT.primary,paddingVertical:9}]}><Text style={{fontWeight:'800',color:'#fff',fontSize:13}}>Accept</Text></TouchableOpacity>
   </View>:r.status==='declined'?<Ionicons name="close-circle" size={22} color="#C9D2CE"/>:<TouchableOpacity onPress={()=>store.cancelRequest(r.id)}><Text style={{color:CT.danger,fontWeight:'800',fontSize:12}}>Cancel</Text></TouchableOpacity>}
  </View>;
}

function Requests({groupId,groupName,nav}:{groupId?:string;groupName?:string;nav:Nav}){
 const store=useCircle();const [tab,setTab]=useState<'incoming'|'outgoing'>('incoming');
 const list=store.requests.filter(r=>r.direction===tab);
 return <>
  <Segmented value={tab} options={[['incoming','Received'],['outgoing','Sent']]} onChange={v=>setTab(v as any)}/>
  {!list.length?<EmptyState mood="Calm" title={tab==='incoming'?'No requests right now':'No sent requests'} detail={tab==='incoming'?'When someone enters your invite code, their request appears here for your approval.':'Requests you send with a friend’s code show here until they respond.'}/>:
  <CCard style={{paddingVertical:4}}>{list.map((r,i)=><RequestRow key={r.id} r={r} tab={tab} last={i===list.length-1} nav={nav} groupId={groupId} groupName={groupName}/>)}</CCard>}
 </>;
}
export function Segmented({value,options,onChange}:{value:string;options:[string,string][];onChange:(v:string)=>void}){
 return <View style={{flexDirection:'row',backgroundColor:'#E7EFEA',borderRadius:17,padding:5,gap:6}}>{options.map(([k,l])=><TouchableOpacity key={k} onPress={()=>onChange(k)} accessibilityRole="tab" accessibilityState={{selected:value===k}} style={{flex:1,paddingVertical:10,borderRadius:12,alignItems:'center',backgroundColor:value===k?'#fff':'transparent'}}><Text style={{fontSize:13,fontWeight:'800',color:value===k?CT.primary:CT.muted}}>{l}</Text></TouchableOpacity>)}</View>;
}

function GroupPicker({selected,onToggle}:{selected:string[];onToggle:(id:string)=>void}){
 const {groups}=useCircle();
 if(!groups.length)return <Text style={cs.muted}>You haven’t created any groups yet.</Text>;
 return <View style={{gap:8}}>{groups.map(g=>{const on=selected.includes(g.id);return <TouchableOpacity key={g.id} onPress={()=>onToggle(g.id)} accessibilityRole="checkbox" accessibilityState={{checked:on}} style={{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:16,borderWidth:1.5,borderColor:on?g.color:CT.border,backgroundColor:on?g.color+'14':'#fff'}}>
  <View style={[cs.rowIcon,{backgroundColor:g.color+'22'}]}><Ionicons name={g.icon as any} size={19} color={g.color}/></View>
  <View style={{flex:1}}><Text style={cs.rowTitle}>{g.name}</Text><Text style={cs.rowSub}>{g.memberIds.length} members · sees {g.moods.length===6?'all moods':g.moods.join(', ')||'no moods'}</Text></View>
  <Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={24} color={on?g.color:'#C9D2CE'}/></TouchableOpacity>})}</View>;
}
const toggle=(arr:string[],id:string)=>arr.includes(id)?arr.filter(x=>x!==id):[...arr,id];

function AssignGroups({id,groupId,groupName,nav}:{id:string;groupId?:string;groupName?:string;nav:Nav}){
 const store=useCircle();const r=store.requests.find(x=>x.id===id);const [sel,setSel]=useState<string[]>(()=>groupId&&store.groups.some(g=>g.id===groupId)?[groupId]:r?.groupId?[r.groupId]:[]);
 const draftOnly=!!groupId&&!store.groups.some(g=>g.id===groupId);
 if(!r)return <EmptyState title="Request handled" detail="This request is no longer pending."/>;
 return <>
  <CCard style={{flexDirection:'row',alignItems:'center',gap:12}}><Avatar initials={r.initials} color={r.color} size={52}/><View style={{flex:1}}><Text style={{fontSize:18,fontWeight:'900',color:CT.ink}}>{r.name}</Text><Text style={cs.muted}>Choose which groups {r.name} belongs to. Only you can see your groups.</Text></View></CCard>
  {draftOnly&&!store.groups.length?null:<GroupPicker selected={sel} onToggle={g=>setSel(s=>toggle(s,g))}/>}
  <Text style={[cs.muted,{textAlign:'center'}]}>{draftOnly?r.name+' will be added to '+(groupName?'“'+groupName+'”':'your new group')+' when you create it.':sel.length?'':'Choose at least one group for '+r.name+'.'}</Text>
  <PrimaryButton label={'Accept '+r.name} icon="checkmark" disabled={!draftOnly&&!sel.length} onPress={()=>{store.acceptRequest(id,sel);if(groupId)nav.popTo('group');else nav.replace({name:'friends'})}}/>
 </>;
}

function Friends({nav}:{nav:Nav}){
 const store=useCircle();
 if(!store.friends.length)return <EmptyState mood="Joyful" title="No friends yet" detail="Once you approve a request, your friend will appear here." action="Invite Friends" onAction={()=>nav.push({name:'invite'})}/>;
 return <CCard style={{paddingVertical:4}}>{store.friends.map((f,i)=>{const gs=store.groups.filter(g=>g.memberIds.includes(f.id));return <CRow key={f.id} last={i===store.friends.length-1} leading={<Avatar initials={f.initials} color={f.color}/>} title={f.name}
  subtitle={(gs.map(g=>g.name).join(', ')||'No groups')+(f.muted?' · Signals muted':'')+(f.hideMyMoods?' · Moods hidden':'')} onPress={()=>nav.push({name:'friend',id:f.id})}/>})}</CCard>;
}

function FriendDetail({id,nav}:{id:string;nav:Nav}){
 const store=useCircle();const f=store.friends.find(x=>x.id===id);
 if(!f)return <EmptyState mood="Sad" title="No longer in your circle" detail="This person was removed. They can no longer see anything you share."/>;
 const groupIds=store.groups.filter(g=>g.memberIds.includes(id)).map(g=>g.id);
 const real=f.realName||f.name;
 function save(v?:string){
  const nick=v?.trim().slice(0,40)||undefined,name=nick||real;
  store.updateFriend(id,{nickname:nick,name,initials:(name.trim()[0]||'?').toUpperCase()});
 }
 function rename(){
  Alert.prompt('Rename '+real,'Only you see this name.',[{text:'Cancel',style:'cancel'},...(f!.nickname?[{text:'Use '+real,onPress:()=>save()}]:[]),{text:'Save',onPress:(v?:string)=>save(v)}],'plain-text',f!.nickname||'');
 }
 return <>
  <CCard style={{alignItems:'center',gap:6,paddingVertical:20}}><Avatar initials={f.initials} color={f.color} size={70}/><Text style={{fontSize:21,fontWeight:'900',color:CT.ink}}>{f.name}</Text>{f.nickname&&f.realName&&f.realName!==f.nickname?<Text style={cs.muted}>{f.realName}</Text>:null}<Text style={cs.muted}>In your circle since {f.since}</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Rename '+f.name} onPress={rename} style={{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:6,paddingHorizontal:12}}><Ionicons name="pencil" size={14} color={CT.primary}/><Text style={{fontSize:14,fontWeight:'800',color:CT.primary}}>{f.nickname?'Edit name':'Rename'}</Text></TouchableOpacity>
</CCard>
  <CHeading title="Groups" detail="Private to you — friends never see your group names."/>
  <GroupPicker selected={groupIds} onToggle={g=>store.setFriendGroups(id,toggle(groupIds,g))}/>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Mute signals" subtitle={'No notifications from '+f.name+'. Their signals still appear in your conversation.'} value={f.muted} onChange={v=>store.updateFriend(id,{muted:v})}/>
   <ToggleRow title="Hide my mood updates" subtitle={f.name+' won’t see moods you share, whatever their groups.'} value={f.hideMyMoods} onChange={v=>store.updateFriend(id,{hideMyMoods:v})} last/>
  </CCard>
  <SoftButton danger label={'Remove '+f.name} icon="person-remove-outline" onPress={()=>Alert.alert('Remove '+f.name+'?','They’ll immediately lose access to every mood you’ve shared, and you to theirs. They won’t be notified.',[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>{store.removeFriend(id);nav.back()}}])}/>
  <SoftButton danger label={'Block '+f.name} icon="ban-outline" onPress={()=>Alert.alert('Block '+f.name+'?','Removes them and stops them from sending you requests or signals again, even with a new code.',[{text:'Cancel',style:'cancel'},{text:'Block',style:'destructive',onPress:()=>{store.removeFriend(id,true);nav.back()}}])}/>
 </>;
}

function Groups({nav}:{nav:Nav}){
 const store=useCircle();
 const {isPlus,showPaywall}=usePlus();
 return <>
  {!store.groups.length?<EmptyState mood="Calm" title="No groups yet" detail="Groups like Close Friends, Family or Support Team let you choose who sees which moods."/>:
  <CCard style={{paddingVertical:4}}>{store.groups.map((g,i)=><CRow key={g.id} last={i===store.groups.length-1} icon={g.icon} tint={g.color+'22'} color={g.color} title={g.name} subtitle={g.memberIds.length+' members · '+(g.moods.length===6?'All moods':g.moods.length+' of 6 moods')} onPress={()=>nav.push({name:'group',id:g.id})}/>)}</CCard>}
  <PrimaryButton label="Create Group" icon="add" onPress={()=>!isPlus?showPaywall('circles'):nav.push({name:'group'})}/>
  <Text style={[cs.muted,{textAlign:'center'}]}>A friend can be in more than one group. Group names and members are only visible to you.</Text>
 </>;
}

function GroupEdit({id,draft,nav}:{id?:string;draft?:GroupDraft;nav:Nav}){
 const store=useCircle();const existing=store.groups.find(g=>g.id===id);
 const [g,setG]=useState<CircleGroup>(draft?.group||existing||{id:'g'+Date.now(),name:'',icon:'star',color:GROUP_COLORS[4],memberIds:[],moods:['Joyful','Calm']});
 const [known,setKnown]=useState<string[]>(draft?.knownFriendIds||[]);
 const set=(p:Partial<CircleGroup>)=>setG(x=>({...x,...p}));
 const pending=store.requests.filter(r=>r.status==='pending'&&r.direction==='incoming').length;
 // Friends approved while inviting from this screen join the draft; for a saved group only if they were added to it when approved.
 useEffect(()=>{
  if(!draft)return;
  const fresh=store.friends.map(f=>f.id).filter(f=>!known.includes(f));
  if(!fresh.length)return;
  setKnown(k=>[...k,...fresh]);
  const saved=store.groups.find(x=>x.id===g.id);
  const add=saved?fresh.filter(f=>saved.memberIds.includes(f)):fresh;
  if(add.length)setG(x=>({...x,memberIds:[...x.memberIds,...add.filter(f=>!x.memberIds.includes(f))]}));
 },[store.friends,store.groups]);
 const leave=(r:CircleRoute)=>{nav.replace({name:'group',id,draft:{group:g,knownFriendIds:store.friends.map(f=>f.id)}});nav.push(r)};
 return <>
  <CCard style={{gap:12}}>
   <Text style={cs.rowTitle}>Name</Text>
   {existing?.isDefault?<>
    <View accessibilityLabel={g.name+', default group, can’t be renamed'} style={{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1.5,borderColor:CT.border,borderRadius:14,padding:12}}><Text style={{flex:1,fontSize:16,color:CT.ink}}>{g.name}</Text><Ionicons name="lock-closed" size={16} color={CT.muted}/></View>
    <Text style={cs.muted}>Your default group. People who use your personal code join it.</Text>
   </>:<>
   <TextInput value={g.name} onChangeText={t=>set({name:t.slice(0,30)})} placeholder="e.g. Close Friends" style={{borderWidth:1.5,borderColor:CT.border,borderRadius:14,padding:12,fontSize:16,color:CT.ink}}/>
   <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{['Close Friends','Family','Support Team'].map(n=><Chip key={n} label={n} selected={g.name===n} onPress={()=>set({name:n})}/>)}</View>
   </>}
   <Text style={cs.rowTitle}>Icon & color</Text>
   <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{GROUP_ICONS.map(ic=><TouchableOpacity key={ic} onPress={()=>set({icon:ic})} style={[cs.rowIcon,{backgroundColor:g.icon===ic?g.color:g.color+'1A'}]}><Ionicons name={ic} size={19} color={g.icon===ic?'#fff':g.color}/></TouchableOpacity>)}</View>
   <View style={{flexDirection:'row',gap:10}}>{GROUP_COLORS.map(c=><TouchableOpacity key={c} onPress={()=>set({color:c})} accessibilityLabel={'Color '+c} style={{width:30,height:30,borderRadius:15,backgroundColor:c,borderWidth:3,borderColor:g.color===c?CT.ink:'#fff'}}/>)}</View>
  </CCard>
  <CHeading title="Moods this group can see"/>
  <MoodPermissionRow moods={g.moods} onToggle={m=>set({moods:g.moods.includes(m)?g.moods.filter(x=>x!==m):CIRCLE_MOODS.filter(x=>x===m||g.moods.includes(x))})}/>
  <CHeading title={'Members ('+g.memberIds.length+')'}/>
  <CCard style={{paddingVertical:4}}>
   {store.friends.length?store.friends.map(f=>{const on=g.memberIds.includes(f.id);return <CRow key={f.id} leading={<Avatar initials={f.initials} color={f.color} size={34}/>} title={f.name} onPress={()=>set({memberIds:toggle(g.memberIds,f.id)})} right={<Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={24} color={on?g.color:'#C9D2CE'}/>}/>}):<Text style={[cs.muted,{paddingHorizontal:12,paddingTop:12,paddingBottom:4}]}>{pending?'Approve a friend request to add them to this group.':'No friends in your circle yet. Invite someone you trust, then add them here.'}</Text>}
   {pending?<CRow icon="mail-unread-outline" title={'Review '+pending+(pending===1?' friend request':' friend requests')} subtitle="Approve and add them to this group" onPress={()=>leave({name:'requests',groupId:g.id,groupName:g.name.trim()})} right={<View style={cs.badge}><Text style={{color:'#fff',fontWeight:'900',fontSize:11}}>{pending}</Text></View>}/>:null}
   <CRow icon="person-add-outline" title={store.friends.length?'Invite more friends':'Invite Friends'} subtitle="Share your personal invite code" onPress={()=>leave({name:'invite'})} last/>
  </CCard>
  {existing?<GroupInviteCard group={existing}/>:null}
  <PrimaryButton label={existing?'Save Group':'Create Group'} disabled={!g.name.trim()} onPress={()=>{store.saveGroup({...g,name:g.name.trim()});nav.back()}}/>
  {existing&&!existing.isDefault?<SoftButton danger label="Delete Group" icon="trash-outline" onPress={()=>Alert.alert('Delete '+g.name+'?','Members stay your friends. They’ll stop seeing moods shared only with this group.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>{store.deleteGroup(g.id);nav.back()}}])}/>:null}
 </>;
}

function MoodPermissionRow({moods,onToggle}:{moods:CircleMood[];onToggle:(m:CircleMood)=>void}){
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{CIRCLE_MOODS.map(m=>{const on=moods.includes(m);const t=MOOD_TINTS[m];return <TouchableOpacity key={m} onPress={()=>onToggle(m)} accessibilityRole="checkbox" accessibilityState={{checked:on}} accessibilityLabel={m}
  style={{width:'31%',flexGrow:1,alignItems:'center',paddingVertical:8,borderRadius:16,borderWidth:1.5,borderColor:on?t.color:CT.border,backgroundColor:on?t.tint:'#fff',opacity:on?1:.55}}>
  <MoodPalThumb mood={m} size={46}/><Text style={{fontSize:12,fontWeight:'800',color:on?t.color:CT.muted}}>{m}</Text>
  <Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={16} color={on?t.color:'#C9D2CE'} style={{position:'absolute',top:6,right:6}}/></TouchableOpacity>})}</View>;
}

function Permissions(){
 const store=useCircle();
 if(!store.groups.length)return <EmptyState title="Create a group first" detail="Mood sharing is set per group, so you can share different moods with different people."/>;
 return <>
  <Text style={[cs.muted,{marginTop:-6,lineHeight:18}]}>Choose which MoodPals each group may see. When you share a mood, only groups that allow it are offered. You decide every time — nothing is shared automatically.</Text>
  {store.groups.map(g=><CCard key={g.id} style={{gap:10}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={[cs.rowIcon,{backgroundColor:g.color+'22'}]}><Ionicons name={g.icon as any} size={19} color={g.color}/></View><View style={{flex:1}}><Text style={cs.rowTitle}>{g.name}</Text><Text style={cs.rowSub}>{g.moods.length} of 6 moods · {g.memberIds.length} members</Text></View></View>
   <MoodPermissionRow moods={g.moods} onToggle={m=>store.toggleGroupMood(g.id,m)}/>
  </CCard>)}
 </>;
}

function ChooseAudience({mood,nav}:{mood:CircleMood;nav:Nav}){
 const store=useCircle();
 const allowed=store.groups.filter(g=>g.moods.includes(mood));const blocked=store.groups.filter(g=>!g.moods.includes(mood));
 const [sel,setSel]=useState<string[]>(allowed.map(g=>g.id).slice(0,1));
 const audience=uniqueAudience(store,sel,mood);
 const active=store.myMoods.find(m=>m.active&&m.mood===mood&&Date.now()-new Date(m.sharedAt).getTime()<6e4);
 if(active)return <>
  <CCard style={{alignItems:'center',gap:8,paddingVertical:22}}><SignalBurst mood={mood} emoji="💚" size={120}/><Text style={{fontSize:20,fontWeight:'900',color:CT.ink}}>Shared with {uniqueAudience(store,active.groupIds,mood).length} friends</Text><Text style={[cs.muted,{textAlign:'center'}]}>Your {mood} MoodPal is visible to them for 24 hours. You can stop sharing anytime.</Text></CCard>
  <PrimaryButton label="Open Messages" icon="chatbubbles-outline" onPress={()=>nav.replace({name:'today'})}/>
  <SoftButton danger label="Stop Sharing" icon="eye-off-outline" onPress={()=>{store.stopSharing(active.id);nav.back()}}/>
 </>;
 return <>
  <CCard style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:MOOD_TINTS[mood].tint}}><MoodPalThumb mood={mood} size={70} animate/><View style={{flex:1,gap:4}}><Text style={cs.muted}>You’re sharing</Text><Text style={{fontSize:22,fontWeight:'900',color:CT.ink}}>{mood}</Text><Text style={cs.rowSub}>Only your MoodPal and the time. Notes, answers, Health data and stress score stay private.</Text></View></CCard>
  <CHeading title="Who can see it?"/>
  {allowed.length?<View style={{gap:8}}>{allowed.map(g=>{const on=sel.includes(g.id);return <TouchableOpacity key={g.id} onPress={()=>setSel(s=>toggle(s,g.id))} accessibilityRole="checkbox" accessibilityState={{checked:on}} style={{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:16,borderWidth:1.5,borderColor:on?g.color:CT.border,backgroundColor:'#fff'}}>
   <View style={[cs.rowIcon,{backgroundColor:g.color+'22'}]}><Ionicons name={g.icon as any} size={19} color={g.color}/></View><View style={{flex:1}}><Text style={cs.rowTitle}>{g.name}</Text><Text style={cs.rowSub}>{g.memberIds.length} members</Text></View><Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={24} color={on?g.color:'#C9D2CE'}/></TouchableOpacity>})}</View>:
   <EmptyState mood={mood} title={'No group can see '+mood} detail="Turn this mood on for a group in Mood Sharing Settings." action="Mood Sharing Settings" onAction={()=>nav.push({name:'permissions'})}/>}
  {blocked.length?<Text style={cs.muted}>Not offered: {blocked.map(g=>g.name).join(', ')} (you don’t share {mood} with {blocked.length>1?'them':'this group'}).</Text>:null}
  <CCard style={{gap:6}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="people-outline" size={18} color={CT.primary}/><Text style={cs.rowTitle}>{audience.length} {audience.length===1?'friend':'friends'} will see this</Text></View>
   <Text style={cs.rowSub}>{audience.map(id=>friendName(store,id)).join(', ')||'Choose at least one group'}{sel.length>1?' · counted once even if they’re in several groups':''}</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:4}}><Ionicons name="time-outline" size={18} color={CT.muted}/><Text style={cs.rowSub}>Disappears after 24 hours</Text></View>
  </CCard>
  <PrimaryButton label="Share Mood" icon="paper-plane-outline" disabled={!audience.length} onPress={()=>{store.shareMood(mood,sel)}}/>
  <SoftButton label="Keep Private" onPress={nav.back}/>
 </>;
}

function FriendPick({selected,onToggle}:{selected:string[];onToggle:(id:string)=>void}){
 const {friends}=useCircle();
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{friends.map(f=>{const on=selected.includes(f.id);return <TouchableOpacity key={f.id} onPress={()=>onToggle(f.id)} accessibilityRole="checkbox" accessibilityState={{checked:on}} accessibilityLabel={f.name} style={{alignItems:'center',gap:4,width:62}}>
  <View style={{borderWidth:3,borderColor:on?CT.primary:'transparent',borderRadius:30,padding:2}}><Avatar initials={f.initials} color={f.color} size={46}/></View>
  <Text style={{fontSize:12,fontWeight:on?'900':'600',color:on?CT.primary:CT.ink}}>{f.name}</Text></TouchableOpacity>})}</View>;
}

function SendSignal({friendId,nav}:{friendId?:string;nav:Nav}){
 return <SignalPicker initial={friendId?[friendId]:[]} onInvite={()=>nav.push({name:'invite'})} onSent={(signal,friendIds)=>nav.replace({name:'signalSent',signal,friendIds})}/>;
}

function SignalSent({signal,friendIds,nav}:{signal:SignalId;friendIds:string[];nav:Nav}){
 const store=useCircle();const s=signalById(signal);
 return <>
  <CCard style={{alignItems:'center',gap:6,paddingVertical:20}}>
   <SignalBurst mood="Joyful" emoji={s.emoji} size={130}/>
   <Text style={{fontSize:21,fontWeight:'900',color:CT.ink,textAlign:'center'}}>{s.label}</Text>
   <Text style={cs.muted}>Sent to {friendIds.map(id=>friendName(store,id)).join(', ')}{store.offline?' · will send when you’re back online':''}</Text>
  </CCard>
  <PrimaryButton label="Done" onPress={nav.back}/>
 </>;
}

function OpenInbox({nav}:{nav:Nav}){useEffect(()=>{nav.replace({name:'today'})},[]);return null;}

// Opens the conversation (and item) a Today card or notification points to, if it's still visible.
function OpenConversation({refId,nav,missing}:{refId:string;nav:Nav;missing:React.ReactNode}){
 const store=useCircle();const target=conversationRef(store,refId);
 useEffect(()=>{if(target)nav.replace({name:'chat',id:target.friendId,focus:target.focus})},[!!target]);
 return target?null:<>{missing}</>;
}

// A push only carries the row id; refresh first so a signal or reaction that arrived while the app was closed is found.
function OpenFromNotification({id,nav}:{id:string;nav:Nav}){
 const store=useCircle();const [ready,setReady]=useState(false);
 useEffect(()=>{let on=true;void Promise.resolve(store.refresh()).catch(()=>{}).finally(()=>{if(on)setReady(true)});return()=>{on=false}},[id]);
 useEffect(()=>{
  if(!ready)return;
  const target=conversationRef(store,id);
  if(target)nav.replace({name:'chat',id:target.friendId,focus:target.focus});
  else nav.replace({name:'today'});
 },[ready]);
 return <View style={{paddingVertical:48,alignItems:'center'}}><ActivityIndicator color={CT.ink}/></View>;
}

function NotificationSettings(){
 const store=useCircle();const p=store.prefs;
 const preview=(title:string,body:string)=><View style={{backgroundColor:'rgba(245,245,247,0.96)',borderRadius:18,padding:12,flexDirection:'row',gap:10,alignItems:'center'}}><View style={{width:34,height:34,borderRadius:9,backgroundColor:CT.primary,alignItems:'center',justifyContent:'center'}}><Ionicons name="happy" size={20} color="#fff"/></View><View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:13,color:'#111'}}>{title}</Text><Text style={{fontSize:13,color:'#333'}}>{body}</Text></View><Text style={{fontSize:11,color:'#888'}}>now</Text></View>;
 const who=p.showNamesInPreview?'Jamie':'Someone in your circle';
 return <>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Invitations" subtitle="When someone sends you a friend request" value={p.invites} onChange={v=>store.setPref('invites',v)}/>
   <ToggleRow title="Request approved" subtitle="When a friend accepts your request" value={p.approvals} onChange={v=>store.setPref('approvals',v)}/>
   <ToggleRow title="Friends’ moods" subtitle="When a friend shares a mood with you" value={p.moods} onChange={v=>store.setPref('moods',v)}/>
   <ToggleRow title="Little Signals" value={p.signals} onChange={v=>store.setPref('signals',v)}/>
   <ToggleRow title="Reactions to my moods" value={p.reactions} onChange={v=>store.setPref('reactions',v)} last/>
  </CCard>
  <Text style={{color:CT.muted,fontSize:12,lineHeight:17,paddingHorizontal:6}}>To silence MoodPals at night, use Sleep or a Focus in your iPhone’s Settings.</Text>
  <CHeading title="Lock screen privacy"/>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Show names in previews" value={p.showNamesInPreview} onChange={v=>store.setPref('showNamesInPreview',v)}/>
   <ToggleRow title="Show friends’ moods in previews" subtitle="Off by default so moods aren’t visible on a locked or shared phone" value={p.showMoodOnLockScreen} onChange={v=>store.setPref('showMoodOnLockScreen',v)} last/>
  </CCard>
  <CHeading title="Preview" detail="How notifications will look with these settings"/>
  <View style={{gap:8,backgroundColor:'#2B3A4A',borderRadius:22,padding:12}}>
   {p.signals?preview('MoodPals',p.showNamesInPreview?'Jamie sent you a hug 🤗':'You received a Little Signal 💚'):null}
   {p.reactions?preview('MoodPals',who+' reacted to your mood'+(p.showMoodOnLockScreen?' (Anxious) 🫶':'')):null}
   {preview('MoodPals',(p.showNamesInPreview?'Taylor':'A friend')+' shared '+(p.showMoodOnLockScreen?'that they’re feeling sad 💙':'how they’re feeling'))}
  </View>
  <Text style={[cs.muted,{textAlign:'center'}]}>Mute individual friends from their page in Friends.</Text>
 </>;
}

function WidgetPreviews(){
 const store=useCircle();const latest=store.signals[0];const f=latest&&store.friends.find(x=>x.id===latest.friendId);
 const privateMode=store.widgetHideMood;const setPrivate=store.setWidgetHideMood;
 const recent=store.signals.slice(0,3);
 return <>
  <Text style={[cs.muted,{marginTop:-6,lineHeight:18}]}>Add these from your Home Screen: touch and hold an empty spot, tap +, then search for MoodPals. iOS refreshes widgets on its own schedule, so new signals may take a few minutes to appear.</Text>
  <CHeading title="Small"/>
  <View style={{flexDirection:'row',gap:14,alignSelf:'center'}}>
   <View style={wd.small}>{latest&&f?<><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Avatar initials={f.initials} color={f.color} size={28}/><Text style={{fontWeight:'800',color:CT.ink,fontSize:13}}>{f.name}</Text></View>
    <Text style={{fontSize:40}}>{signalById(latest.signal).emoji}</Text><Text style={{fontSize:12,fontWeight:'700',color:CT.ink}} numberOfLines={2}>{signalById(latest.signal).label}</Text><Text style={{fontSize:10,color:CT.muted}}>{timeAgo(latest.at)}</Text></>:
    <><Text style={{fontSize:36}}>🫶</Text><Text style={{fontSize:12,fontWeight:'700',color:CT.ink}}>Tap to send a Little Signal</Text></>}</View>
   <View style={[wd.small,{backgroundColor:'#F4FAF6'}]}><Ionicons name="lock-closed" size={16} color={CT.muted}/><Text style={{fontSize:40}}>💚</Text><Text style={{fontSize:12,fontWeight:'700',color:CT.ink}}>{store.signals.filter(s=>isToday(s.at)).length} new signals</Text><Text style={{fontSize:10,color:CT.muted}}>Private mode</Text></View>
  </View>
  <CHeading title="Medium"/>
  <View style={wd.medium}>
   <View style={{alignItems:'center',justifyContent:'center',width:96}}><MoodPalThumb mood={privateMode?'Calm':'Anxious'} size={84}/><Text style={{fontSize:10,color:CT.muted,fontWeight:'700'}}>{privateMode?'My Circle':'You · Anxious'}</Text></View>
   <View style={{flex:1,gap:7,justifyContent:'center'}}><Text style={{fontWeight:'900',color:CT.ink,fontSize:13}}>Close Friends</Text>
    {recent.length?recent.map(s=><View key={s.id} style={{flexDirection:'row',alignItems:'center',gap:6}}><Text style={{fontSize:17}}>{signalById(s.signal).emoji}</Text><Text style={{flex:1,fontSize:12,color:CT.ink}} numberOfLines={1}>{friendName(store,s.friendId)} · {signalById(s.signal).label}</Text></View>):<Text style={cs.rowSub}>No signals yet</Text>}
    <View style={{flexDirection:'row',gap:6}}><View style={wd.pill}><Text style={{fontSize:11,fontWeight:'800',color:CT.primary}}>❤️ Send</Text></View><View style={wd.pill}><Text style={{fontSize:11,fontWeight:'800',color:CT.primary}}>Open</Text></View></View></View>
  </View>
  <ToggleRow title="Hide my mood on widgets" subtitle="Default. Keeps your mood private on a locked or shared iPhone." value={privateMode} onChange={setPrivate}/>
  <Text style={[cs.muted,{textAlign:'center'}]}>Tapping a widget opens Today’s Signals. Widgets are static — animations play inside the app.</Text>
 </>;
}
const wd={small:{width:155,height:155,borderRadius:24,backgroundColor:'#fff',padding:14,justifyContent:'space-between' as const,shadowColor:'#000',shadowOpacity:.08,shadowRadius:10,shadowOffset:{width:0,height:4}},
 medium:{height:155,borderRadius:24,backgroundColor:'#fff',padding:12,flexDirection:'row' as const,gap:8,shadowColor:'#000',shadowOpacity:.08,shadowRadius:10,shadowOffset:{width:0,height:4}},
 pill:{backgroundColor:CT.primarySoft,borderRadius:12,paddingHorizontal:10,paddingVertical:5}};
