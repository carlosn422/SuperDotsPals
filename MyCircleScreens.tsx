import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Share,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {CIRCLE_MOODS,CircleGroup,CircleMood,LITTLE_SIGNALS,MOOD_REACTIONS,MOOD_TINTS,SignalId,isToday,signalById,timeAgo,timeLeft} from './LittleSignalsData';
import {CodePreview,friendName,uniqueAudience,useCircle} from './CircleStore';
import {usePlus} from './PlusStore';
import {Avatar,CCard,CHeading,CRow,CT,Chip,EmptyState,MoodPalThumb,MoodTag,OfflineBanner,PrimaryButton,SampleDataNote,SignalBurst,SoftButton,ToggleRow,cs} from './CircleComponents';

export type CircleRoute=
 |{name:'home'}|{name:'invite'}|{name:'enterCode'}|{name:'requests';groupId?:string;groupName?:string}|{name:'assignGroups';requestId:string;groupId?:string;groupName?:string}
 |{name:'friends'}|{name:'friend';id:string}|{name:'groups'}|{name:'group';id?:string;draft?:GroupDraft}|{name:'permissions'}
 |{name:'share';mood:CircleMood}|{name:'send';friendId?:string}|{name:'signalSent';signal:SignalId;friendIds:string[]}
 |{name:'signalReceived';signalId:string}|{name:'friendMood';id:string}|{name:'room';id:string}|{name:'today'}
 |{name:'notifications'}|{name:'widgets'}|{name:'revoked'};

const TITLES:Record<CircleRoute['name'],string>={home:'My Circle',invite:'Invite Friends',enterCode:'Enter Invite Code',requests:'Friend Requests',assignGroups:'Add to Groups',friends:'Friends',friend:'Friend',groups:'Manage Groups',group:'Group',permissions:'Mood Sharing',share:'Choose Audience',send:'Send a Little Signal',signalSent:'Signal Sent',signalReceived:'Little Signal',friendMood:'Shared Mood',room:'Reactions',today:"Today's Signals",notifications:'Circle Notifications',widgets:'Widgets',revoked:'Not Available'};
type GroupDraft={group:CircleGroup;knownFriendIds:string[]};
const GROUP_ICONS=['heart','home','leaf','star','people','sunny','musical-notes','paw'] as const;
const GROUP_COLORS=['#E76B8A','#488CD9','#3BA986','#E3A426','#7139E9','#D9704B'];

export default function CircleNavigator({initial=[{name:'home'}],exitLabel='Settings',onExit,mood,onRouteChange}:{initial?:CircleRoute[];exitLabel?:string;onExit:()=>void;mood?:string;onRouteChange?:()=>void}){
 const [stack,setStack]=useState<CircleRoute[]>(initial);
 const {refresh}=useCircle();
 useEffect(()=>{onRouteChange?.();void refresh()},[stack.length,stack[stack.length-1]?.name]);
 useEffect(()=>{setStack(initial)},[JSON.stringify(initial)]);
 const route=stack[stack.length-1];
 const push=(r:CircleRoute)=>setStack(s=>[...s,r]);
 const replace=(r:CircleRoute)=>setStack(s=>[...s.slice(0,-1),r]);
 const back=()=>{if(stack.length<=1)onExit();else setStack(s=>s.slice(0,-1));};
 const prev=stack.length>1?TITLES[stack[stack.length-2].name]:exitLabel;
 const nav={push,replace,back,popTo:(name:CircleRoute['name'])=>setStack(s=>{const i=s.map(x=>x.name).lastIndexOf(name);return i>=0?s.slice(0,i+1):[{name:'home'}]})};
 return <View style={{gap:14}}>
  <TouchableOpacity onPress={back} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:4,paddingVertical:6,alignSelf:'flex-start'}}><Ionicons name="chevron-back" size={18} color={CT.primary}/><Text style={{color:CT.primary,fontWeight:'800'}}>{prev}</Text></TouchableOpacity>
  <Text style={cs.title}>{TITLES[route.name]}</Text>
  <OfflineBanner/>
  <Screen route={route} nav={nav} mood={mood}/>
 </View>;
}
type Nav={push:(r:CircleRoute)=>void;replace:(r:CircleRoute)=>void;back:()=>void;popTo:(n:CircleRoute['name'])=>void};

function Screen({route,nav,mood}:{route:CircleRoute;nav:Nav;mood?:string}){
 switch(route.name){
  case 'home':return <Home nav={nav}/>;
  case 'invite':return <Invite/>;
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
  case 'signalReceived':return <SignalReceived id={route.signalId} nav={nav} mood={mood}/>;
  case 'friendMood':return <FriendMood id={route.id} nav={nav}/>;
  case 'room':return <ReactionRoom id={route.id} nav={nav}/>;
  case 'today':return <TodaySignals nav={nav}/>;
  case 'notifications':return <NotificationSettings/>;
  case 'widgets':return <WidgetPreviews/>;
  case 'revoked':return <EmptyState mood="Sad" title="This mood is no longer available" detail="It may have expired after 24 hours, or the person stopped sharing with you. Shared moods are only visible to people they were shared with."/>;
 }
}

function Stat({value,label}:{value:number;label:string}){return <View style={{flex:1,alignItems:'center',backgroundColor:CT.background,borderRadius:16,paddingVertical:12}}><Text style={{fontSize:24,fontWeight:'900',color:CT.ink}}>{value}</Text><Text style={{fontSize:11,color:CT.muted,fontWeight:'700'}}>{label}</Text></View>;}

function Home({nav}:{nav:Nav}){
 const store=useCircle();
 useEffect(()=>{void store.ensurePush()},[]);
 const pending=store.requests.filter(r=>r.status==='pending'&&r.direction==='incoming').length;
 const todayCount=store.signals.filter(s=>isToday(s.at)).length+store.myMoods.filter(m=>m.active).reduce((n,m)=>n+m.reactions.length,0);
 return <>
  <Text style={[cs.muted,{marginTop:-8,fontSize:13,lineHeight:19}]}>A private space for the people you trust. Share how you feel only when you want to, and send little emoji signals of support.</Text>
  <CCard style={{gap:14}}>
   <View style={{flexDirection:'row',gap:9}}><Stat value={store.friends.length} label="Friends"/><Stat value={store.groups.length} label="Groups"/><Stat value={pending} label="Pending"/></View>
   <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><PrimaryButton label="Invite Friends" icon="person-add-outline" onPress={()=>nav.push({name:'invite'})}/></View><View style={{flex:1}}><SoftButton label="Enter Code" icon="keypad-outline" onPress={()=>nav.push({name:'enterCode'})}/></View></View>
  </CCard>
  <ReactionNotices nav={nav}/>
  {!store.friends.length?<EmptyState mood="Joyful" title="Your circle is empty" detail="Invite close friends or family with your personal code. Nobody can find you by searching — only people you share your code with." action="Invite Friends" onAction={()=>nav.push({name:'invite'})}/>:null}
  <CCard style={{paddingVertical:4}}>
   <CRow icon="mail-unread-outline" title="Friend Requests" subtitle={pending?pending+' waiting for your approval':'No new requests'} onPress={()=>nav.push({name:'requests'})} right={pending?<View style={cs.badge}><Text style={{color:'#fff',fontWeight:'900',fontSize:11}}>{pending}</Text></View>:undefined}/>
   <CRow icon="people-outline" title="Friends" subtitle={store.friends.length+' approved friends'} onPress={()=>nav.push({name:'friends'})}/>
   <CRow icon="albums-outline" title="Manage Groups" subtitle={store.groups.map(g=>g.name).join(', ')||'Create your first group'} onPress={()=>nav.push({name:'groups'})}/>
   <CRow icon="happy-outline" title="Mood Sharing Settings" subtitle="Choose which moods each group can see" onPress={()=>nav.push({name:'permissions'})}/>
   <CRow icon="sparkles-outline" title="Today's Signals" subtitle={todayCount?todayCount+' signals and reactions today':'Nothing yet today'} onPress={()=>nav.push({name:'today'})}/>
   <CRow icon="notifications-outline" title="Notification Settings" subtitle="Signals, reactions and lock-screen privacy" onPress={()=>nav.push({name:'notifications'})}/>
   <CRow icon="apps-outline" title="Home Screen Widgets" subtitle="Little Signals small and medium widgets" onPress={()=>nav.push({name:'widgets'})} last/>
  </CCard>
  {store.live?null:<PrototypeControls nav={nav}/>}
 </>;
}

function PrototypeControls({nav}:{nav:Nav}){
 const store=useCircle();
 return <CCard style={{gap:6,backgroundColor:'#FBFAFE'}}>
  <SampleDataNote/>
  <Text style={[cs.muted,{textAlign:'center',marginBottom:4}]}>Review tools for the prototype — not part of the final feature.</Text>
  <ToggleRow title="Simulate offline" value={store.offline} onChange={store.setOffline}/>
  <CRow icon="gift-outline" title="Simulate receiving a signal" subtitle="Jamie sends a hug" onPress={()=>{store.simulateIncomingSignal(store.friends[0]?.id||'jamie','hug');nav.push({name:'signalReceived',signalId:'latest'})}}/>
  <CRow icon="eye-off-outline" title="Open a revoked or expired mood link" onPress={()=>nav.push({name:'revoked'})}/>
  <CRow icon="trash-outline" title="Show empty states" onPress={store.showEmpty}/>
  <CRow icon="refresh-outline" title="Reset sample data" onPress={store.reset} last/>
 </CCard>;
}

function Invite(){
 const {invite,regenerateCode}=useCircle();
 const [copied,setCopied]=useState(false);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(t)},[copied]);
 const copy=async()=>{await Clipboard.setStringAsync(invite.code);setCopied(true)};
 const hours=Math.max(0,Math.round((new Date(invite.expiresAt).getTime()-Date.now())/36e5));
 const left=hours>=36?Math.round(hours/24)+' days':hours>=1?hours+(hours===1?' hour':' hours'):'less than an hour';
 if(!invite.code)return <EmptyState mood="Calm" title="Getting your code…" detail="Connect to the internet to create your invite code."/>;
 const share=()=>void Share.share({message:'Join my circle on MoodPals 💚 Open the app and enter my invite code: '+invite.code});
 return <>
  <CCard style={{alignItems:'center',gap:10,paddingVertical:24}}>
   <MoodPalThumb mood="Joyful" size={84}/>
   <Text style={[cs.muted,{fontSize:13}]}>Your personal invite code</Text>
   <Text accessibilityLabel={'Invite code '+invite.code.split('').join(' ')} style={{fontSize:34,fontWeight:'900',letterSpacing:3,color:CT.ink}}>{invite.code}</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="time-outline" size={14} color={CT.muted}/><Text style={cs.muted}>Expires in {left} · anyone you share it with can send you a request</Text></View>
  </CCard>
  <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><SoftButton label={copied?"Copied":"Copy Code"} icon={copied?"checkmark-circle-outline":"copy-outline"} onPress={()=>void copy()}/></View><View style={{flex:1}}><PrimaryButton label="Share Invite" icon="share-outline" onPress={share}/></View></View>
  <SoftButton label="Regenerate Code" icon="refresh-outline" onPress={()=>Alert.alert('Regenerate code?','Your current code will stop working immediately. Pending requests already sent stay in your Friend Requests.',[{text:'Cancel',style:'cancel'},{text:'Regenerate',style:'destructive',onPress:regenerateCode}])}/>
  <CCard style={{gap:8}}><CHeading title="How it works"/>
   {['Share your code with someone you trust.','They enter it in MoodPals and send you a request.','You approve the request and choose their groups.','Nothing is shared until you decide to share a mood.'].map((t,i)=><View key={i} style={{flexDirection:'row',gap:10,alignItems:'flex-start'}}><View style={{width:22,height:22,borderRadius:11,backgroundColor:CT.primarySoft,alignItems:'center',justifyContent:'center'}}><Text style={{color:CT.primary,fontWeight:'900',fontSize:12}}>{i+1}</Text></View><Text style={{flex:1,color:CT.ink,fontSize:13,lineHeight:19}}>{t}</Text></View>)}
  </CCard>
 </>;
}

function EnterCode({nav}:{nav:Nav}){
 const store=useCircle();
 const [code,setCode]=useState('');const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<null|CodePreview['state']|'sent'>(null);const [found,setFound]=useState<CodePreview|null>(null);
 const check=async()=>{setBusy(true);try{const r=await store.previewCode(code,store.invite.code);setFound(r);setResult(r.state);}catch(e:any){Alert.alert('Couldn’t check that code',e?.message||'Please try again.')}finally{setBusy(false)}};
 const send=async()=>{setBusy(true);try{const r=await store.redeemCode(code);setResult(r==='sent'?'sent':r==='pending'?'pending':r==='already_friends'?'already_friends':'invalid');}catch(e:any){Alert.alert('Couldn’t send your request',e?.message||'Please try again.')}finally{setBusy(false)}};
 const format=(t:string)=>{const raw=t.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^MP/,'').slice(0,5);return raw?'MP-'+raw:''};
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

function Requests({groupId,groupName,nav}:{groupId?:string;groupName?:string;nav:Nav}){
 const store=useCircle();const [tab,setTab]=useState<'incoming'|'outgoing'>('incoming');
 const list=store.requests.filter(r=>r.direction===tab);
 return <>
  <Segmented value={tab} options={[['incoming','Received'],['outgoing','Sent']]} onChange={v=>setTab(v as any)}/>
  {!list.length?<EmptyState mood="Calm" title={tab==='incoming'?'No requests right now':'No sent requests'} detail={tab==='incoming'?'When someone enters your invite code, their request appears here for your approval.':'Requests you send with a friend’s code show here until they respond.'}/>:
  <CCard style={{paddingVertical:4}}>{list.map((r,i)=><View key={r.id} style={[cs.row,i===list.length-1&&{borderBottomWidth:0},{flexWrap:'wrap'}]}>
   <Avatar initials={r.initials} color={r.color}/>
   <View style={{flex:1,gap:2}}><Text style={cs.rowTitle}>{r.name}</Text><Text style={cs.rowSub}>{r.status==='declined'?'Not accepted':(tab==='incoming'?'Wants to join your circle · ':'Sent ')+timeAgo(r.sentAt)}</Text></View>
   {tab==='incoming'?<View style={{flexDirection:'row',gap:7}}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>Alert.alert('Decline '+r.name+'?','They won’t be told you declined. Their request just disappears.',[{text:'Cancel',style:'cancel'},{text:'Decline',style:'destructive',onPress:()=>store.declineRequest(r.id)}])} style={[cs.soft,{backgroundColor:'#F3F5F4',paddingVertical:9}]}><Text style={{fontWeight:'800',color:CT.muted,fontSize:13}}>Decline</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={()=>nav.push({name:'assignGroups',requestId:r.id,groupId,groupName})} style={[cs.soft,{backgroundColor:CT.primary,paddingVertical:9}]}><Text style={{fontWeight:'800',color:'#fff',fontSize:13}}>Accept</Text></TouchableOpacity>
   </View>:r.status==='declined'?<Ionicons name="close-circle" size={22} color="#C9D2CE"/>:<TouchableOpacity onPress={()=>store.cancelRequest(r.id)}><Text style={{color:CT.danger,fontWeight:'800',fontSize:12}}>Cancel</Text></TouchableOpacity>}
  </View>)}</CCard>}
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
 const store=useCircle();const r=store.requests.find(x=>x.id===id);const [sel,setSel]=useState<string[]>(()=>groupId&&store.groups.some(g=>g.id===groupId)?[groupId]:[]);
 const draftOnly=!!groupId&&!store.groups.some(g=>g.id===groupId);
 if(!r)return <EmptyState title="Request handled" detail="This request is no longer pending."/>;
 return <>
  <CCard style={{flexDirection:'row',alignItems:'center',gap:12}}><Avatar initials={r.initials} color={r.color} size={52}/><View style={{flex:1}}><Text style={{fontSize:18,fontWeight:'900',color:CT.ink}}>{r.name}</Text><Text style={cs.muted}>Choose which groups {r.name} belongs to. Only you can see your groups.</Text></View></CCard>
  {draftOnly&&!store.groups.length?null:<GroupPicker selected={sel} onToggle={g=>setSel(s=>toggle(s,g))}/>}
  <Text style={[cs.muted,{textAlign:'center'}]}>{draftOnly?r.name+' will be added to '+(groupName?'“'+groupName+'”':'your new group')+' when you create it.':sel.length?'':'No group selected — '+r.name+' can send you signals but won’t see your moods.'}</Text>
  <PrimaryButton label={'Accept '+r.name} icon="checkmark" onPress={()=>{store.acceptRequest(id,sel);if(groupId)nav.popTo('group');else nav.replace({name:'friends'})}}/>
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
 return <>
  <CCard style={{alignItems:'center',gap:6,paddingVertical:20}}><Avatar initials={f.initials} color={f.color} size={70}/><Text style={{fontSize:21,fontWeight:'900',color:CT.ink}}>{f.name}</Text><Text style={cs.muted}>In your circle since {f.since}</Text>
   <View style={{alignSelf:'stretch',marginTop:8}}><SoftButton label={'Send '+f.name+' a Little Signal'} icon="heart-outline" onPress={()=>nav.push({name:'send',friendId:f.id})}/></View></CCard>
  <CHeading title="Groups" detail="Private to you — friends never see your group names."/>
  <GroupPicker selected={groupIds} onToggle={g=>store.setFriendGroups(id,toggle(groupIds,g))}/>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Mute signals" subtitle={'No notifications from '+f.name+'. Signals still appear in Today’s Signals.'} value={f.muted} onChange={v=>store.updateFriend(id,{muted:v})}/>
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
  <PrimaryButton label="Create Group" icon="add" onPress={()=>!isPlus&&store.groups.length>=1?showPaywall('circles'):nav.push({name:'group'})}/>
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
   <TextInput value={g.name} onChangeText={t=>set({name:t.slice(0,30)})} placeholder="e.g. Close Friends" style={{borderWidth:1.5,borderColor:CT.border,borderRadius:14,padding:12,fontSize:16,color:CT.ink}}/>
   <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{['Close Friends','Family','Support Team'].map(n=><Chip key={n} label={n} selected={g.name===n} onPress={()=>set({name:n})}/>)}</View>
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
  <PrimaryButton label={existing?'Save Group':'Create Group'} disabled={!g.name.trim()} onPress={()=>{store.saveGroup({...g,name:g.name.trim()});nav.back()}}/>
  {existing?<SoftButton danger label="Delete Group" icon="trash-outline" onPress={()=>Alert.alert('Delete '+g.name+'?','Members stay your friends. They’ll stop seeing moods shared only with this group.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>{store.deleteGroup(g.id);nav.back()}}])}/>:null}
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
  <PrimaryButton label="View Reactions" icon="chatbubbles-outline" onPress={()=>nav.replace({name:'room',id:active.id})}/>
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
 const store=useCircle();const [to,setTo]=useState<string[]>(friendId?[friendId]:[]);const [sig,setSig]=useState<SignalId|null>(null);
 const sentToday=store.sentSignals.filter(s=>isToday(s.at)).reduce((n,s)=>n+s.friendIds.length,0);
 if(!store.friends.length)return <EmptyState title="Add a friend first" detail="Little Signals can only be sent to approved friends." action="Invite Friends" onAction={()=>nav.push({name:'invite'})}/>;
 return <>
  <Text style={[cs.muted,{marginTop:-6}]}>A quick, wordless way to show you care. No mood share needed.</Text>
  <CHeading title="To"/>
  <CCard><FriendPick selected={to} onToggle={id=>setTo(s=>toggle(s,id))}/></CCard>
  <CHeading title="Signal"/>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>{LITTLE_SIGNALS.map(s=>{const on=sig===s.id;return <TouchableOpacity key={s.id} onPress={()=>setSig(s.id)} accessibilityRole="radio" accessibilityState={{selected:on}} style={{width:'48%',flexGrow:1,flexDirection:'row',alignItems:'center',gap:9,padding:12,borderRadius:16,borderWidth:1.5,borderColor:on?CT.primary:CT.border,backgroundColor:on?CT.primarySoft:'#fff'}}><Text style={{fontSize:24}}>{s.emoji}</Text><Text style={{flex:1,fontWeight:'800',fontSize:13,color:CT.ink}}>{s.label}</Text></TouchableOpacity>})}</View>
  {sentToday>=20?<Text style={[cs.muted,{textAlign:'center'}]}>You’ve sent a lot of signals today. Try again tomorrow.</Text>:null}
  <PrimaryButton label={to.length>1?'Send to '+to.length+' friends':'Send Signal'} icon="heart" disabled={!to.length||!sig||sentToday>=20} onPress={()=>{if(!sig)return;store.sendSignal(to,sig);nav.replace({name:'signalSent',signal:sig,friendIds:to})}}/>
 </>;
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

function SignalReceived({id,nav,mood}:{id:string;nav:Nav;mood?:string}){
 const store=useCircle();const sig=id==='latest'?store.signals[0]:store.signals.find(s=>s.id===id);
 useEffect(()=>{store.markSignalsSeen()},[]);
 if(!sig)return <EmptyState title="Signal not found" detail="It may have been from someone no longer in your circle."/>;
 const s=signalById(sig.signal);const name=friendName(store,sig.friendId);
 const m=(CIRCLE_MOODS.find(x=>x.toLowerCase()===(mood||'').toLowerCase())||'Calm') as CircleMood;
 return <>
  <CCard style={{alignItems:'center',gap:6,paddingVertical:20}}>
   <SignalBurst mood={m} emoji={s.emoji} size={140}/>
   <Text style={{fontSize:21,fontWeight:'900',color:CT.ink,textAlign:'center'}}>{s.notify(name)}</Text>
   <Text style={cs.muted}>{timeAgo(sig.at)}</Text>
  </CCard>
  <PrimaryButton label={'Send '+name+' one back'} icon="heart-outline" onPress={()=>nav.replace({name:'send',friendId:sig.friendId})}/>
  <SoftButton label="See Today’s Signals" onPress={()=>nav.replace({name:'today'})}/>
 </>;
}

function ReactionPicker({mood,value,onPick}:{mood:CircleMood;value?:string;onPick:(e?:string)=>void}){
 return <View style={{flexDirection:'row',justifyContent:'space-between'}}>{MOOD_REACTIONS[mood].map(e=>{const on=value===e;return <TouchableOpacity key={e} onPress={()=>onPick(on?undefined:e)} accessibilityRole="button" accessibilityLabel={'React '+e} accessibilityState={{selected:on}} style={{width:54,height:54,borderRadius:27,alignItems:'center',justifyContent:'center',backgroundColor:on?MOOD_TINTS[mood].tint:'#F5F8F6',borderWidth:2,borderColor:on?MOOD_TINTS[mood].color:'transparent'}}><Text style={{fontSize:26}}>{e}</Text></TouchableOpacity>})}</View>;
}

function FriendMood({id,nav}:{id:string;nav:Nav}){
 const store=useCircle();const fm=store.friendMoods.find(m=>m.id===id);
 const f=fm&&store.friends.find(x=>x.id===fm.friendId);
 if(!fm||!f||new Date(fm.expiresAt).getTime()<Date.now())return <Screen route={{name:'revoked'}} nav={nav}/>;
 return <>
  <CCard style={{alignItems:'center',gap:8,paddingVertical:20,backgroundColor:MOOD_TINTS[fm.mood].tint}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Avatar initials={f.initials} color={f.color} size={30}/><Text style={cs.rowTitle}>{f.name}</Text><Text style={cs.rowSub}>· {timeAgo(fm.sharedAt)}</Text></View>
   <MoodPalThumb mood={fm.mood} size={130} animate/>
   <Text style={{fontSize:16,color:CT.ink}}>{f.name} is feeling <Text style={{fontWeight:'900',color:MOOD_TINTS[fm.mood].color}}>{fm.mood.toLowerCase()}</Text></Text>
   <Text style={cs.rowSub}>Visible for {timeLeft(fm.expiresAt)}</Text>
  </CCard>
  <CHeading title={fm.myReaction?'Your reaction':'Send a reaction'} detail="Tap again to remove it. Only emoji — no messages."/>
  <CCard><ReactionPicker mood={fm.mood} value={fm.myReaction} onPick={e=>store.react(fm.id,e)}/></CCard>
  {fm.myReaction?<Text style={[cs.muted,{textAlign:'center'}]}>{f.name} will see your {fm.myReaction}</Text>:null}
  <SoftButton label={'Send '+f.name+' a Little Signal'} icon="heart-outline" onPress={()=>nav.push({name:'send',friendId:f.id})}/>
 </>;
}

function ReactionRoom({id,nav}:{id:string;nav:Nav}){
 const store=useCircle();const m=store.myMoods.find(x=>x.id===id);
 if(!m)return <Screen route={{name:'revoked'}} nav={nav}/>;
 const groups=store.groups.filter(g=>m.groupIds.includes(g.id));
 const date=new Date(m.sharedAt);
 return <>
  <CCard style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:MOOD_TINTS[m.mood].tint}}>
   <MoodPalThumb mood={m.mood} size={78} animate/>
   <View style={{flex:1,gap:4}}><Text style={{fontSize:22,fontWeight:'900',color:CT.ink}}>{m.mood}</Text>
    <Text style={cs.rowSub}>{date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})} · {date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</Text>
    <Text style={cs.rowSub}>Shared with {groups.map(g=>g.name).join(', ')||'removed groups'}</Text>
    <Text style={[cs.rowSub,{fontWeight:'800',color:m.active?CT.primary:CT.muted}]}>{m.active?'Visible · '+timeLeft(m.expiresAt):'Expired — no longer visible to friends'}</Text></View>
  </CCard>
  {!m.reactions.length?<EmptyState mood={m.mood} title="No reactions yet" detail={m.active?'Friends who can see this mood can react with an emoji. You’ll see them here.':'Nobody reacted before this mood expired.'}/>:
  <View style={{gap:10}}>{m.reactions.map(r=>{const f=store.friends.find(x=>x.id===r.friendId);return <View key={r.friendId} style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>
   <Avatar initials={f?.initials||'?'} color={f?.color||'#C9D2CE'} size={34}/>
   <View style={{backgroundColor:'#fff',borderRadius:20,borderBottomLeftRadius:6,paddingHorizontal:14,paddingVertical:10,shadowColor:'#4A268A',shadowOpacity:.05,shadowRadius:8,shadowOffset:{width:0,height:2}}}>
    <Text style={{fontSize:12,fontWeight:'800',color:CT.muted}}>{f?.name||'Former friend'}</Text><Text style={{fontSize:30}}>{r.emoji}</Text></View>
   <Text style={[cs.rowSub,{marginBottom:4}]}>{timeAgo(r.at)}</Text></View>})}</View>}
  {m.active?<SoftButton danger label="Stop Sharing" icon="eye-off-outline" onPress={()=>Alert.alert('Stop sharing?','Friends will no longer see this mood or be able to react.',[{text:'Cancel',style:'cancel'},{text:'Stop sharing',style:'destructive',onPress:()=>store.stopSharing(m.id)}])}/>:null}
 </>;
}

// Reactions to my shared moods: name, emoji and the original mood only. Unread ones are marked one at a time when opened.
function ReactionNotices({nav}:{nav:Nav}){
 const store=useCircle();const [all,setAll]=useState(false);
 const unread=store.inbox.filter(n=>!n.read).length;
 if(!store.inbox.length)return null;
 const shown=all?store.inbox:store.inbox.slice(0,6);
 return <>
  <CHeading title={unread?'Notifications · '+unread+' unread':'Notifications'} action={store.inbox.length>6?(all?'Show less':'Show all'):undefined} onAction={()=>setAll(v=>!v)}/>
  <CCard style={{paddingVertical:4}}>{shown.map((n,i)=><TouchableOpacity key={n.id} accessibilityRole="button" accessibilityLabel={n.name+' '+n.emoji+', '+n.mood+(n.read?'':', unread')}
   onPress={()=>{store.markReactionRead(n.id);if(store.myMoods.some(m=>m.id===n.moodId))nav.push({name:'room',id:n.moodId});}}
   style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderBottomWidth:i===shown.length-1?0:1,borderBottomColor:'#EEF2F0'}}>
   <View style={{width:8,height:8,borderRadius:4,backgroundColor:n.read?'transparent':'#3B82F6'}}/>
   <View style={{flex:1}}><Text style={cs.rowTitle}>{n.name}</Text><Text style={cs.rowSub}>{timeAgo(n.at)}</Text></View>
   <Text style={{fontSize:26}}>{n.emoji}</Text>
   <MoodPalThumb mood={n.mood} size={40}/>
  </TouchableOpacity>)}</CCard>
 </>;
}

function TodaySignals({nav}:{nav:Nav}){
 const store=useCircle();const [tab,setTab]=useState<'today'|'earlier'>('today');const [open,setOpen]=useState<Record<string,boolean>>({});
 const mine=store.myMoods.filter(m=>tab==='today'?isToday(m.sharedAt):!isToday(m.sharedAt));
 const signals=store.signals.filter(s=>tab==='today'?isToday(s.at):!isToday(s.at));
 const friendMoods=tab==='today'?store.friendMoods.filter(m=>new Date(m.expiresAt).getTime()>Date.now()):[];
 const nothing=!mine.length&&!signals.length&&!friendMoods.length;
 return <>
  <Segmented value={tab} options={[['today','Today'],['earlier','Earlier']]} onChange={v=>setTab(v as any)}/>
  {nothing?<EmptyState title={tab==='today'?'A quiet day so far':'Nothing earlier'} detail="Signals and reactions from your circle will show up here." action="Send a Little Signal" onAction={()=>nav.push({name:'send'})}/>:null}
  {mine.map(m=>{const isOpen=open[m.id]??tab==='today';return <CCard key={m.id} style={{gap:8}}>
   <TouchableOpacity onPress={()=>setOpen(o=>({...o,[m.id]:!isOpen}))} accessibilityRole="button" accessibilityState={{expanded:isOpen}} style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <MoodPalThumb mood={m.mood} size={42}/><View style={{flex:1}}><Text style={cs.rowTitle}>{tab==='today'?'Today':new Date(m.sharedAt).toLocaleDateString(undefined,{weekday:'short'})} — {m.mood}</Text><Text style={cs.rowSub}>{m.reactions.length?m.reactions.map(r=>r.emoji).join(' ')+' · '+m.reactions.length+' reactions':'No reactions'}{m.active?'':' · expired'}</Text></View>
    <Ionicons name={isOpen?'chevron-up':'chevron-down'} size={18} color={CT.primary}/></TouchableOpacity>
   {isOpen?<>{m.reactions.map(r=><View key={r.friendId} style={{flexDirection:'row',alignItems:'center',gap:10,paddingLeft:52}}><Text style={{flex:1,color:CT.ink,fontWeight:'700'}}>{friendName(store,r.friendId)}</Text><Text style={{fontSize:20}}>{r.emoji}</Text><Text style={cs.rowSub}>{timeAgo(r.at)}</Text></View>)}
    <TouchableOpacity onPress={()=>nav.push({name:'room',id:m.id})} style={{paddingLeft:52}}><Text style={{color:CT.primary,fontWeight:'800',fontSize:12}}>Open reactions →</Text></TouchableOpacity></>:null}
  </CCard>})}
  {signals.length?<><CHeading title="Little Signals"/><CCard style={{paddingVertical:4}}>{signals.map((s,i)=><CRow key={s.id} last={i===signals.length-1} leading={<View style={cs.signalEmoji}><Text style={{fontSize:22}}>{signalById(s.signal).emoji}</Text></View>} title={signalById(s.signal).notify(friendName(store,s.friendId))} subtitle={timeAgo(s.at)} onPress={()=>nav.push({name:'signalReceived',signalId:s.id})}/>)}</CCard></>:null}
  {friendMoods.length?<><CHeading title="Shared with you" detail="Visible for 24 hours after they share"/><CCard style={{paddingVertical:4}}>{friendMoods.map((m,i)=><CRow key={m.id} last={i===friendMoods.length-1} leading={<MoodPalThumb mood={m.mood} size={40}/>} title={friendName(store,m.friendId)+' · '+m.mood} subtitle={(m.myReaction?'You reacted '+m.myReaction+' · ':'Tap to react · ')+timeAgo(m.sharedAt)} onPress={()=>nav.push({name:'friendMood',id:m.id})}/>)}</CCard></>:null}
 </>;
}

function NotificationSettings(){
 const store=useCircle();const p=store.prefs;
 const preview=(title:string,body:string)=><View style={{backgroundColor:'rgba(245,245,247,0.96)',borderRadius:18,padding:12,flexDirection:'row',gap:10,alignItems:'center'}}><View style={{width:34,height:34,borderRadius:9,backgroundColor:CT.primary,alignItems:'center',justifyContent:'center'}}><Ionicons name="happy" size={20} color="#fff"/></View><View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:13,color:'#111'}}>{title}</Text><Text style={{fontSize:13,color:'#333'}}>{body}</Text></View><Text style={{fontSize:11,color:'#888'}}>now</Text></View>;
 const who=p.showNamesInPreview?'Jamie':'Someone in your circle';
 return <>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Invitations" subtitle="When someone sends you a friend request" value={p.invites} onChange={v=>store.setPref('invites',v)}/>
   <ToggleRow title="Request approved" subtitle="When a friend accepts your request" value={p.approvals} onChange={v=>store.setPref('approvals',v)}/>
   <ToggleRow title="Little Signals" value={p.signals} onChange={v=>store.setPref('signals',v)}/>
   <ToggleRow title="Reactions to my moods" value={p.reactions} onChange={v=>store.setPref('reactions',v)}/>
   <ToggleRow title="Quiet hours" subtitle="No circle notifications 10 PM – 7 AM. Everything still shows in Today’s Signals." value={p.quietHours} onChange={v=>store.setPref('quietHours',v)} last/>
  </CCard>
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
