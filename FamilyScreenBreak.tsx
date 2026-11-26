import React,{useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ChartScrubContext} from './StressDashboard';
import {ActionSheetIOS,ActivityIndicator,Alert,Animated,AppState,Modal,PanResponder,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import Svg,{Circle,Defs,Line,LinearGradient,Path,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {useReduceMotion} from './CircleComponents';
import SuperdotMascot from './SuperdotMascot';
import {usePlus} from './PlusStore';
import {useIsGuest} from './Account';
import {ManageFamilyProfile,familyCall,familyProfilesChanged,shortProfileName,useFamilyProfiles,type FamilyProfile} from './FamilyWatches';
import {WatchColorGrid,WatchColorSheet,WatchImage,colorName,isWatchColor,type WatchColor} from './WatchArt';
import {ackBreakSync,getBreakState,onBreakState,pendingBreakSync,pickBreakApps,requestScreenTimeAccess,screenBreakSupported,sendBreakCommand,setBreakChildren,setBreakEntitlement,type BreakAction,type BreakSession,type BreakState,type BreakSyncRow} from './modules/watch-link/screenBreak';
import {configureSocialTrack,getSocialState} from './modules/watch-link/socialTrack';
import {DeviceCard,DeviceSelect,FamilyDevicesScreen,PHONE,cancelDeviceCommand,deviceCommand,deviceStatus,useDeviceNames,useFamilyDevices,type DeviceCommand,type FamilyDevice,type RemoteSession} from './FamilyDevices';
import {comparison,formatDuration,observations,periodRange,periodStats,type BreakPeriod,type Bucket,type SessionRow} from './ScreenBreakInsights';

export type FamilyChild={id:string;name:string;profile_user_id:string|null;watch_only?:boolean};
export type Entitlement={has_plus:boolean;trial_started_at:string|null;trial_ends_at:string|null;trial_available:boolean;allowed:boolean};
const LAST_MINUTES_KEY='screenBreak.lastMinutes';
const red='#D65B79';

// ---------- Sync: children, sessions and the trial (runs whenever MoodPals is open) ----------

const listeners=new Set<()=>void>();
export function familyChildrenChanged(){listeners.forEach(l=>l())}
export function onFamilyChildrenChanged(l:()=>void){listeners.add(l);return()=>{listeners.delete(l)}}

async function loadChildren():Promise<FamilyChild[]>{
 const {data,error}=await supabase.from('family_children').select('id,name,profile_user_id,watch_only').order('created_at');
 if(error)throw error;
 return (data as FamilyChild[])||[];
}

const toSec=(iso:string|null)=>iso?Math.floor(Date.parse(iso)/1000):undefined;

/** Saves sessions recorded on this iPhone and refreshes the cached entitlement the native timer checks offline. */
export async function syncScreenBreak(isPlus:boolean):Promise<Entitlement|null>{
 if(!screenBreakSupported)return null;
 const children=await loadChildren().catch(()=>null);
 // Watches parked without a member (watch_only) aren't timer targets.
 if(children)setBreakChildren(children.filter(c=>!c.watch_only).map(c=>({id:c.id,name:c.name})));
 const rows=pendingBreakSync();
 const {data,error}=rows.length?await supabase.rpc('screen_break_sync',{p_sessions:rows}):await supabase.rpc('screen_break_entitlement');
 if(error||!data)return null;
 if(rows.length)ackBreakSync(Object.fromEntries(rows.map(r=>[r.id,r.version])));
 let e=data as Entitlement;
 // Screen Time & Stress shares the trial: tracking that is on counts as started, and stops when the trial ends.
 const social=getSocialState();
 if(social?.enabled&&!isPlus&&!e.has_plus){
  if(e.trial_available){const r=await supabase.rpc('screen_time_trial_start');if(!r.error&&r.data)e=r.data as Entitlement}
  else if(!e.allowed){try{configureSocialTrack(false,social.limitMinutes)}catch{}}
 }
 cacheEntitlement(e,isPlus);
 return e;
}

function cacheEntitlement(e:Entitlement,isPlus:boolean){
 setBreakEntitlement({hasPlus:isPlus||e.has_plus,trialAvailable:e.trial_available,trialStartedAt:toSec(e.trial_started_at),trialEndsAt:toSec(e.trial_ends_at)});
}

/** Starts the shared 14-day trial when Screen Time & Stress tracking is turned on. Null when offline. */
export async function startScreenTimeTrial(isPlus:boolean):Promise<Entitlement|null>{
 const {data,error}=await supabase.rpc('screen_time_trial_start');
 if(error||!data)return null;
 const e=data as Entitlement;
 cacheEntitlement(e,isPlus);
 return e;
}

export function useScreenBreakSync(enabled:boolean){
 const {isPlus}=usePlus();
 useEffect(()=>{
  if(!enabled||!screenBreakSupported)return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void syncScreenBreak(isPlus).finally(()=>{busy=false})};
  run();
  const app=AppState.addEventListener('change',st=>{if(st==='active')run()});
  // New sessions or changes recorded natively (also from the Watch) are saved right away.
  const sub=onBreakState(()=>{if(pendingBreakSync().length)run()});
  listeners.add(run);
  return()=>{app.remove();sub.remove();listeners.delete(run)};
 },[enabled,isPlus]);
}

function useBreakState(){
 const [state,setState]=useState<BreakState|null>(()=>getBreakState());
 useEffect(()=>{
  setState(getBreakState());
  const sub=onBreakState(setState);
  const app=AppState.addEventListener('change',st=>{if(st==='active')setState(getBreakState())});
  return()=>{sub.remove();app.remove()};
 },[]);
 return [state,setState] as const;
}

function useNow(active:boolean){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!active)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[active]);
 return now;
}

const clock=(sec:number)=>new Date(sec*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
function countdown(ms:number){
 const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
 return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(r).padStart(2,'0');
}

// Red while apps on this iPhone are locked (watch lock or a timer that ran out), green otherwise.
// Tap red to unlock, whether the watch locked it or a timer ran out (that timer is already in the member's history).
function HeaderLock(){
 const [state,setState]=useBreakState();
 const [busy,setBusy]=useState(false);
 const now=useNow(state?.session?.status==='active');
 if(!state?.authorized)return null;
 const s=state.session;
 const ended=s&&(s.status==='restricted'||(s.status==='active'&&s.deadline*1000<=now))?s:undefined;
 const locked=!!ended||!!state.manualLock;
 function tap(){
  setBusy(true);
  const reply=sendBreakCommand('unlock');
  setBusy(false);
  if(reply.state)setState(reply.state);
  if(!reply.ok)Alert.alert('Unable to unlock',reply.error||'Please try again.');
 }
 const icon=<Ionicons name={locked?'lock-closed':'lock-open'} size={22} color={locked?red:T.primary}/>;
 return locked?<TouchableOpacity accessibilityRole="button" accessibilityLabel={ended?`Apps locked: ${ended.childName}'s time is up. Unlock`:'Apps locked. Unlock'} disabled={busy} onPress={tap} hitSlop={12} style={[st.headerLock,{backgroundColor:'#FBE7EC'}]}>{busy?<ActivityIndicator color={red}/>:icon}</TouchableOpacity>
  :<View accessible accessibilityLabel="Apps unlocked" style={[st.headerLock,{backgroundColor:T.primarySoft}]}>{icon}</View>;
}

// ---------- Screens ----------

type Route={name:'list'}|{name:'child';id:string}|{name:'insights';id:string}|{name:'devices';id?:string};

export default function FamilyScreenBreak({onBack,backLabel='Settings',target,onAddWatch,embedded,footer}:{onBack?:()=>void;backLabel?:string;target?:{childId?:string;profileId?:string;add?:boolean;at:number}|null;onAddWatch?:()=>void;embedded?:boolean;footer?:React.ReactNode}){
 const guest=useIsGuest();
 const [children,setChildren]=useState<FamilyChild[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const {width:screenW}=useWindowDimensions();
 const [route,setRoute]=useState<Route>({name:'list'}),[adding,setAdding]=useState(false),[selected,setSelected]=useState<string|null>(null);
 const select=(id:string)=>{setSelected(id);setRoute({name:'list'})};
 const [startOn,setStartOn]=useState<FamilyDevice|null>(null);
 const family=useFamilyDevices(screenBreakSupported&&!guest&&route.name==='list');
 const dashNow=useNow(route.name==='list'&&family.devices.length>0);
 const load=useCallback(async()=>{
  try{const list=await loadChildren();setChildren(list);setError('');if(screenBreakSupported)setBreakChildren(list.filter(c=>!c.watch_only).map(c=>({id:c.id,name:c.name})))}
  catch{setError('Unable to load your family members. Check your connection.')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{if(guest){setLoading(false);return}void load();listeners.add(load);return()=>{listeners.delete(load)}},[load,guest]);
 useEffect(()=>{
  if(!target||loading)return;
  if(target.add){setRoute({name:'list'});setAdding(true);return}
  const child=children.find(c=>c.id===target.childId||(!!target.profileId&&c.profile_user_id===target.profileId));
  if(child)select(child.id);
 },[target,loading,children]);
 const child=route.name==='child'||route.name==='insights'?children.find(c=>c.id===route.id):undefined;
 const members=children.filter(c=>!c.watch_only);
 const current=members.find(c=>c.id===selected)||members[0];
 const pager=useRef<ScrollView>(null),reduce=useReduceMotion();
 const [section,setSection]=useState<'family'|'devices'>('family');
 // The timer ring locks this pager while it's dragged, as well as the page behind it.
 const parentScrub=useContext(ChartScrubContext),[scrub,setScrub]=useState(false);
 const scrubCtx=useCallback((v:boolean)=>{setScrub(v);parentScrub(v)},[parentScrub]);
 const index=Math.max(0,members.findIndex(c=>c.id===current?.id));
 useEffect(()=>{pager.current?.scrollTo({x:index*screenW,animated:!reduce})},[index,screenW]);
 if(route.name==='devices')return <>
  <FamilyDevicesScreen openId={route.id} onBack={()=>setRoute({name:'list'})} childName={id=>children.find(c=>c.id===id)?.name||'Someone'} onStart={members.length?setStartOn:undefined}/>
  <StartTimerSheet device={startOn} members={members} onClose={()=>setStartOn(null)}/>
 </>;
 if(route.name==='insights'&&child)return <InsightsScreen child={child} onBack={()=>select(child.id)}/>;
 if(route.name==='child'&&child)return <ChildScreen child={child} children={children} onBack={()=>setRoute({name:'list'})} onInsights={()=>setRoute({name:'insights',id:child.id})} onChanged={()=>{void load();familyChildrenChanged()}} onRemoved={()=>{setRoute({name:'list'});void load()}} onAddWatch={onAddWatch} onOpen={id=>setRoute({name:'child',id})}/>;
 return <View style={{gap:14}}>
  {!embedded&&onBack?<Back label={backLabel} onPress={onBack}/>:null}
  <View style={[st.row,{paddingVertical:0}]}><Text style={st.title} accessibilityRole="header">Family</Text>{screenBreakSupported&&!guest?<HeaderLock/>:null}</View>
  {guest?<View style={st.card}><Text style={st.body}>Create a free account to add family members and use Screen Break.</Text></View>:<>
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {loading?<ActivityIndicator color={T.primary}/>:null}
   {!loading&&!error?<View style={st.famSegment} accessibilityRole="tablist">{(['family','devices'] as const).map(k=><TouchableOpacity key={k} accessibilityRole="tab" accessibilityState={{selected:section===k}} onPress={()=>{if(section!==k){void Haptics.selectionAsync();setSection(k)}}} style={[st.segmentItem,section===k&&st.segmentOn]}><Ionicons name={k==='family'?'people':'tablet-portrait'} size={16} color={section===k?T.ink:T.muted}/><Text style={[st.segmentText,section===k&&{color:T.ink}]}>{k==='family'?'Family':'Devices'}</Text></TouchableOpacity>)}</View>:null}
   {section==='devices'&&!loading&&!error?<DevicesArea family={family} now={dashNow} width={screenW} childName={id=>children.find(c=>c.id===id)?.name||'Someone'} onOpen={id=>setRoute({name:'devices',id})} onAll={()=>setRoute({name:'devices'})} onStart={members.length?setStartOn:undefined}/>:<>
    {!loading&&!error&&members.length?<ProfileRow members={members} selected={current?.id} adding={adding} onSelect={id=>{setAdding(false);setSelected(id)}} onAdd={()=>setAdding(a=>!a)} sessions={family.sessions}/>:null}
    {adding||(!loading&&!error&&!members.length)?<AddChild onAdded={id=>{setAdding(false);void load().then(()=>{if(id)setSelected(id)});familyChildrenChanged()}}/>:null}
    {current&&!adding?<ChartScrubContext.Provider value={scrubCtx}><ScrollView ref={pager} horizontal pagingEnabled scrollEnabled={!scrub} showsHorizontalScrollIndicator={false} contentOffset={{x:index*screenW,y:0}} onMomentumScrollEnd={e=>{const c=members[Math.round(e.nativeEvent.contentOffset.x/screenW)];if(c&&c.id!==current.id){void Haptics.selectionAsync();setSelected(c.id)}}} style={{marginHorizontal:-20}}>
     {members.map(c=><View key={c.id} style={{width:screenW,paddingHorizontal:20}}>{c.id===current.id?<ChildScreen inline child={c} children={children} onBack={()=>{}} onInsights={()=>setRoute({name:'insights',id:c.id})} onChanged={()=>{void load();familyChildrenChanged()}} onRemoved={()=>{setSelected(null);void load()}} onAddWatch={onAddWatch} onOpen={select}/>:<View style={{minHeight:420}}/>}</View>)}
    </ScrollView></ChartScrubContext.Provider>:null}
   </>}
  </>}
  {footer?<View style={{marginTop:10}}>{footer}</View>:null}
  <StartTimerSheet device={startOn} members={members} onClose={()=>setStartOn(null)}/>
 </View>;
}

/** Devices as a swipeable carousel, one card at a time. */
function DevicesArea({family,now,width,childName,onOpen,onAll,onStart}:{family:ReturnType<typeof useFamilyDevices>;now:number;width:number;childName:(id:string)=>string;onOpen:(id:string)=>void;onAll:()=>void;onStart?:(d:FamilyDevice)=>void}){
 const [page,setPage]=useState(0);
 if(!family.devices.length)return <TouchableOpacity accessibilityRole="button" onPress={onAll} style={st.linkRow}><View style={[st.tile,{backgroundColor:TINTS[1]}]}><Ionicons name="add" size={22} color={TINT_INK[1]}/></View><Text style={[st.rowTitle,{flex:1}]}>Add a family device</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></TouchableOpacity>;
 return <View style={{gap:12}}>
  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{marginHorizontal:-20}} scrollEventThrottle={32} onScroll={e=>setPage(Math.round(e.nativeEvent.contentOffset.x/width))}>
   {family.devices.map(d=><View key={d.id} style={{width,paddingHorizontal:20}}><DeviceCard device={d} isDefault={family.defaultId===d.id} commands={family.commands} sessions={family.sessions} now={now} childName={childName} onOpen={()=>onOpen(d.id)} onStart={onStart}/></View>)}
  </ScrollView>
  {family.devices.length>1?<View style={{flexDirection:'row',justifyContent:'center',gap:7}} accessibilityLabel={'Device '+(page+1)+' of '+family.devices.length}>{family.devices.map((d,i)=><View key={d.id} style={{width:8,height:8,borderRadius:4,backgroundColor:i===page?T.primary:'#CFD8D3'}}/>)}</View>:null}
  <TouchableOpacity accessibilityRole="button" onPress={onAll} style={{alignSelf:'center',minHeight:44,justifyContent:'center'}}><Text style={st.link}>Manage devices</Text></TouchableOpacity>
 </View>;
}

/** Family members as circles; the selected one gets an animated ring. */
function ProfileRow({members,selected,adding,onSelect,onAdd,sessions}:{members:FamilyChild[];selected?:string;adding:boolean;onSelect:(id:string)=>void;onAdd:()=>void;sessions:RemoteSession[]}){
 const [state]=useBreakState();
 const now=Date.now();
 const timing=(id:string)=>(state?.session?.status==='active'&&state.session.childId===id&&state.session.deadline*1000>now)||sessions.some(x=>x.child_id===id&&Date.parse(x.deadline_at)>now);
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:16,paddingVertical:4,paddingHorizontal:2}}>
  {members.map((c,i)=><ProfileCircle key={c.id} name={c.name} index={i} on={!adding&&c.id===selected} timer={timing(c.id)} onPress={()=>{if(c.id!==selected||adding){void Haptics.selectionAsync();onSelect(c.id)}}}/>)}
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={adding?'Close add member':'Add member'} onPress={onAdd} style={{alignItems:'center',gap:6,width:68}}>
   <View style={[st.profile,{borderStyle:'dashed',borderWidth:2,borderColor:adding?T.primary:'#C9D6CF',backgroundColor:'#fff'}]}><Ionicons name={adding?'close':'add'} size={28} color={T.primary}/></View>
   <Text style={st.profileName}>{adding?'Close':'Add'}</Text>
  </TouchableOpacity>
 </ScrollView>;
}
function ProfileCircle({name,index,on,timer,onPress}:{name:string;index:number;on:boolean;timer:boolean;onPress:()=>void}){
 const reduce=useReduceMotion();
 const ring=useRef(new Animated.Value(on?1:0)).current;
 useEffect(()=>{if(reduce)ring.setValue(on?1:0);else Animated.spring(ring,{toValue:on?1:0,useNativeDriver:true,speed:18,bounciness:8}).start()},[on,reduce]);
 const k=index%TINTS.length;
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={name+(timer?', timer running':'')} accessibilityState={{selected:on}} onPress={onPress} style={{alignItems:'center',gap:6,width:68}}>
  <View style={{width:68,height:68,alignItems:'center',justifyContent:'center'}}>
   <Animated.View style={[StyleSheet.absoluteFill,{borderRadius:34,borderWidth:3,borderColor:T.primary,opacity:ring,transform:[{scale:ring.interpolate({inputRange:[0,1],outputRange:[0.85,1]})}]}]}/>
   <View style={[st.profile,{backgroundColor:TINTS[k]}]}><Text style={{fontSize:24,fontWeight:'900',color:TINT_INK[k]}}>{name.slice(0,1).toUpperCase()}</Text></View>
   {timer?<View style={st.profileTimer}><Ionicons name="hourglass" size={11} color="#fff"/></View>:null}
  </View>
  <Text style={[st.profileName,on&&{color:T.ink}]} numberOfLines={1}>{name}</Text>
 </TouchableOpacity>;
}

/** Starting a timer from a device card: who and how long in one sheet. Members with a timer elsewhere can't be picked. */
function StartTimerSheet({device,members,onClose}:{device:FamilyDevice|null;members:FamilyChild[];onClose:()=>void}){
 const family=useFamilyDevices(!!device);
 const [state]=useBreakState();
 const [child,setChild]=useState<string|null>(null),[minutes,setMinutes]=useState(30),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!device)return;
  setChild(null);setError('');
  void AsyncStorage.getItem(LAST_MINUTES_KEY).then(v=>{const n=Number(v);if(n>=5&&n<=180)setMinutes(Math.round(n/5)*5)});
 },[device?.id]);
 if(!device)return null;
 const now=Date.now(),phone=state?.session?.status==='active'?state.session.childId:undefined;
 const session=family.sessions.find(x=>x.family_device_id===device.id&&Date.parse(x.deadline_at)>now);
 const busyElsewhere=(id:string)=>id===phone||!!deviceInUse(id,family,now);
 const sel=child&&!busyElsewhere(child)?child:members.find(c=>!busyElsewhere(c.id))?.id;
 const who=(id:string)=>members.find(c=>c.id===id)?.name||'Someone';
 const start=async()=>{
  if(!sel)return;
  setBusy(true);setError('');
  try{
   await deviceCommand(device.id,'START_SESSION',{minutes,child:sel,replace:!!session});
   void AsyncStorage.setItem(LAST_MINUTES_KEY,String(minutes));
   void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
   onClose();
  }catch(e:any){setError(e.message)}
  finally{setBusy(false)}
 };
 return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
  <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
   <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close"/>
   <View style={[st.sheet,{alignItems:'center'}]}>
    <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6'}}/>
    <Text style={st.sheetTitle} numberOfLines={1}>Start timer on {device.name}</Text>
    <View style={st.chips}>{members.map(c=><Chip key={c.id} label={c.name} on={c.id===sel} disabled={busyElsewhere(c.id)} onPress={()=>setChild(c.id)}/>)}</View>
    {session?<ReplaceNote name={who(session.child_id)} ms={Date.parse(session.deadline_at)-now}/>:null}
    <DurationRing minutes={minutes} onChange={setMinutes} min={5} max={180}/>
    <TouchableOpacity accessibilityRole="button" disabled={busy||!sel} onPress={()=>void start()} style={[st.cta,{alignSelf:'stretch'},(busy||!sel)&&{opacity:.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Start {formatDuration(minutes*60)}</Text>}</TouchableOpacity>
    {error?<Text style={[st.sub,{color:red,textAlign:'center'}]}>{error}</Text>:null}
   </View>
  </View>
 </Modal>;
}

/** The family device a member's timer runs or is starting on. */
function deviceInUse(childId:string,family:{sessions:RemoteSession[];commands:DeviceCommand[]},now=Date.now()){
 return family.sessions.find(x=>x.child_id===childId&&Date.parse(x.deadline_at)>now)?.family_device_id
  ||family.commands.find(c=>c.type==='START_SESSION'&&(c.status==='pending'||c.status==='delivered')&&c.child_id===childId)?.device_id;
}

const minLeft=(ms:number)=>Math.max(1,Math.ceil(ms/60000))+' min left';
/** Shown above Start when another member's timer runs on the chosen device: starting ends it. */
function ReplaceNote({name,ms}:{name:string;ms:number}){
 return <View style={st.replaceNote} accessible accessibilityLabel={name+"'s timer is running, "+minLeft(ms)+'. Starting ends it.'}>
  <Ionicons name="timer-outline" size={22} color="#B7791F"/>
  <View style={{flex:1}}><Text style={st.rowTitle}>{name}'s timer is running</Text><Text style={st.sub}>{minLeft(ms)} · Starting ends it.</Text></View>
 </View>;
}

function ActiveBadge({childId,remote}:{childId:string;remote?:RemoteSession}){
 const [state]=useBreakState();
 const s=state?.session;
 const local=!!s&&s.childId===childId&&s.status==='active';
 const now=useNow(local||!!remote);
 const deadline=local?s!.deadline*1000:remote?Date.parse(remote.deadline_at):0;
 if(deadline<=now)return null;
 const left=Math.max(1,Math.ceil((deadline-now)/60000));
 return <View style={st.badge}><Text style={st.badgeText}>{left+' min left'}</Text></View>;
}

function AddChild({onAdded}:{onAdded:(id?:string)=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function add(){
  const clean=name.replace(/\s+/g,' ').trim();
  if(!clean||busy)return;
  setBusy(true);setError('');
  const {data,error:e}=await supabase.rpc('family_add_child',{p_name:clean});
  setBusy(false);
  if(e){setError(e.code==='P0001'?e.message:'Unable to add. Check your connection and try again.');return}
  setName('');onAdded((data as {id?:string}|null)?.id);
 }
 return <View style={st.card}>
  <Text style={st.heading}>Add a member</Text>
  <Text style={st.sub}>Just a name. You can assign a watch later.</Text>
  <TextInput value={name} onChangeText={setName} placeholder="Name" maxLength={40} autoCapitalize="words" returnKeyType="done" onSubmitEditing={()=>void add()} editable={!busy} style={st.input} accessibilityLabel="Member's name"/>
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
  <TouchableOpacity accessibilityRole="button" disabled={!name.trim()||busy} onPress={()=>void add()} style={[st.cta,(!name.trim()||busy)&&{opacity:0.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Add Member</Text>}</TouchableOpacity>
 </View>;
}

function ChildScreen({child,children,onBack,onInsights,onChanged,onRemoved,onAddWatch,onOpen,inline}:{inline?:boolean;child:FamilyChild;children:FamilyChild[];onBack:()=>void;onInsights:()=>void;onChanged:()=>void;onRemoved:()=>void;onAddWatch?:()=>void;onOpen?:(id:string)=>void}){
 const [watchOpen,setWatchOpen]=useState(false);
 const [state,setState]=useBreakState();
 const {isPlus,showPaywall}=usePlus();
 const [editing,setEditing]=useState(false);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[minutes,setMinutes]=useState(30),[adding,setAdding]=useState(false),[extra,setExtra]=useState(15);
 useEffect(()=>{void AsyncStorage.getItem(LAST_MINUTES_KEY).then(v=>{const n=Number(v);if(n>=5&&n<=180)setMinutes(Math.round(n/5)*5)})},[]);
 const family=useFamilyDevices(screenBreakSupported);
 // The default device is preselected; picking another only applies to this timer.
 const [picked,setPicked]=useState<string|null>(null);
 const session=state?.session;
 // A session whose member record was replaced (same name, old id) is still controllable from that member.
 const orphan=!!session&&!children.some(c=>c.id===session.childId)&&session.childName===child.name;
 // A timer that ran out is just a lock now (the Family header lock); the member goes back to Start.
 const now=useNow(session?.status==='active');
 const running=session&&session.status==='active'&&session.deadline*1000>now?session:null;
 const mine=running&&(running.childId===child.id||orphan)?running:null;
 const other=running&&running.childId!==child.id&&!orphan?running:null;
 // One device per member: a running (or starting) timer pins the member to its device.
 const busyOn=deviceInUse(child.id,family);
 const inUse=mine?PHONE:family.devices.some(d=>d.id===busyOn)?busyOn:undefined;
 const usable=(id:string)=>id===PHONE||family.devices.some(d=>d.id===id&&d.status==='active');
 const target=inUse||(picked&&usable(picked)?picked:usable(family.defaultId)?family.defaultId:PHONE);
 const remote=target!==PHONE?family.devices.find(d=>d.id===target):undefined;
 const t=Date.now(),nameOf=(id:string)=>children.find(c=>c.id===id)?.name||'Someone';
 const deviceOptions=[{id:PHONE,name:'This iPhone',busy:other?other.childName+' · '+minLeft(other.deadline*1000-t):undefined},
  ...family.devices.filter(d=>d.status==='active').map(d=>{const x=family.sessions.find(y=>y.family_device_id===d.id&&Date.parse(y.deadline_at)>t);
   return {id:d.id,name:d.name,tablet:d.device_type==='ipad',busy:x?nameOf(x.child_id)+' · '+minLeft(Date.parse(x.deadline_at)-t):undefined,note:d.auth_status!=='approved'||!d.selection_count?'Finish setup on the device':undefined}})];
 const lock=useRef(false);
 const refresh=()=>setState(getBreakState());
 useEffect(()=>{void syncScreenBreak(isPlus).then(refresh)},[child.id]);

 function run(action:BreakAction,extra:{minutes?:number;replace?:boolean}={}){
  if(lock.current)return;
  lock.current=true;setBusy(action);setError('');
  try{
   const reply=sendBreakCommand(action,{childId:child.id,minutes:extra.minutes,replace:extra.replace,session:action==='start'?undefined:mine||undefined});
   if(reply.state)setState(reply.state);
   if(!reply.ok){
    if(reply.code==='plus')showPaywall('screenBreak');
    else if(reply.code==='entitlement')void syncScreenBreak(isPlus).then(refresh);
    setError(reply.error||'Something went wrong. Please try again.');
   }else void syncScreenBreak(isPlus);
  }finally{lock.current=false;setBusy(null)}
 }
 async function authorize(){
  setBusy('auth');setError('');
  try{await requestScreenTimeAccess()}catch(e:any){setError(e?.message?.includes('cancel')?'':'Screen Time access was not allowed. You can try again.')}
  setBusy(null);refresh();
 }
 async function pick(){setBusy('pick');try{await pickBreakApps()}catch{setError('Unable to open the app picker.')}setBusy(null);refresh()}
 const chosen=minutes;
 const validMinutes=Number.isFinite(chosen)&&chosen>=1&&chosen<=720;
 const ready=!!state?.authorized&&(state?.selectionCount||0)>0;
 const trialDaysLeft=state?.trialEndsAt?Math.max(0,Math.ceil((state.trialEndsAt*1000-Date.now())/864e5)):null;

 return <View style={{gap:14}}>
  {inline?null:<Back label="Family" onPress={onBack}/>}
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   {inline?null:<View style={[st.avatar,{width:52,height:52,borderRadius:26}]}><Text style={[st.avatarText,{fontSize:22}]}>{child.name.slice(0,1).toUpperCase()}</Text></View>}
   <Text style={[inline?st.heroTitle:st.title,{flex:1}]} numberOfLines={1}>{child.name}</Text>
   {inline?<TouchableOpacity accessibilityRole="button" accessibilityLabel={'More for '+child.name} onPress={()=>{
    const opts=[['Screen Time Insights',onInsights],...(state?.selectionCount?[['Apps to Pause',()=>void pick()]]:[]),['Apple Watch',()=>setWatchOpen(true)],['Edit '+child.name,()=>setEditing(true)]] as [string,()=>void][];
    ActionSheetIOS.showActionSheetWithOptions({options:[...opts.map(o=>o[0]),'Cancel'],cancelButtonIndex:opts.length},i=>opts[i]?.[1]());
   }} style={st.moreBtn}><Ionicons name="ellipsis-horizontal" size={22} color={T.primary}/></TouchableOpacity>
   :<TouchableOpacity accessibilityRole="button" accessibilityLabel={'Edit '+child.name} onPress={()=>setEditing(true)} style={st.editBtn}><Text style={st.editBtnText}>Edit</Text></TouchableOpacity>}
  </View>
  <EditMemberSheet visible={editing} child={child} children={children} onClose={()=>setEditing(false)} onChanged={onChanged} onRemoved={()=>{setEditing(false);onRemoved()}}/>
  {!screenBreakSupported?<View style={st.card}><Text style={st.body}>Screen Break needs the latest MoodPals build on this iPhone.</Text></View>:<>
   {state&&!state.hasPlus&&!isPlus?<PlanNote state={state} daysLeft={trialDaysLeft} onUpgrade={()=>showPaywall('screenBreak')}/>:null}
   {inUse?null:<DeviceSelect options={deviceOptions} selected={target} defaultId={family.defaultId} onSelect={setPicked}/>}
   {remote?<RemoteTimer child={child} children={children} device={remote} family={family} minutes={minutes} setMinutes={setMinutes} onOpen={onOpen} onPlan={()=>showPaywall('screenBreak')}/>:mine?<View style={[st.card,st.heroCard,{alignItems:'center'}]}>
    <Text style={st.kicker}>Screen time left</Text>
    <Text style={st.timer} accessibilityRole="timer">{countdown(mine.deadline*1000-now)}</Text>
    <Text style={st.sub}>Ends at {clock(mine.deadline)} · {formatDuration(mine.grantedSeconds)} granted</Text>
    <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>{setExtra(15);setAdding(true)}} style={[st.cta,{alignSelf:'stretch',marginTop:6}]}><Text style={st.ctaText}>Add Time</Text></TouchableOpacity>
    <Modal visible={adding} transparent animationType="slide" onRequestClose={()=>setAdding(false)}>
     <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setAdding(false)} accessibilityLabel="Close"/>
      <View style={[st.sheet,{alignItems:'center'}]}>
       <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6'}}/>
       <Text style={st.sheetTitle}>Add time for {child.name}</Text>
       <DurationRing minutes={extra} onChange={setExtra} min={5} max={120} prefix="+"/>
       <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>{setAdding(false);run('addTime',{minutes:extra})}} style={[st.cta,{alignSelf:'stretch'}]}><Text style={st.ctaText}>Add {formatDuration(extra*60)}</Text></TouchableOpacity>
      </View>
     </View>
    </Modal>
    {/* Stop ends the timer, keeps only the time used and leaves the apps open. */}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Stop '+child.name+"'s timer"} disabled={!!busy} onPress={()=>run('cancel')} style={[st.ghost,{alignSelf:'stretch',marginTop:6}]}><Text style={[st.ghostText,{color:red}]}>Stop</Text></TouchableOpacity>
   </View>:<View style={st.card}>
    <Text style={st.heading}>Screen Break</Text>
    {other?<ReplaceNote name={other.childName} ms={other.deadline*1000-now}/>:null}
    {!state?.authorized?<View style={{gap:10}}>
     <Text style={st.kicker}>Step 1 of 2</Text>
     <Text style={st.rowTitle}>Allow Screen Time access</Text>
     <TouchableOpacity accessibilityRole="button" disabled={busy==='auth'} onPress={()=>void authorize()} style={st.cta}>{busy==='auth'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Allow Screen Time Access</Text>}</TouchableOpacity>
    </View>:!(state?.selectionCount||0)?<View style={{gap:10}}>
     <Text style={st.kicker}>Step 2 of 2</Text>
     <Text style={st.rowTitle}>Choose apps to pause</Text>
     <TouchableOpacity accessibilityRole="button" disabled={busy==='pick'} onPress={()=>void pick()} style={st.cta}>{busy==='pick'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Choose Apps to Pause</Text>}</TouchableOpacity>
    </View>:inline?null:<TouchableOpacity accessibilityRole="button" accessibilityLabel={'Setup complete, '+state.selectionCount+' selected. Edit apps'} onPress={()=>void pick()} style={st.setupDone}>
     <Ionicons name="checkmark-circle" size={22} color={T.primary}/>
     <Text style={[st.body,{flex:1}]}>Setup complete · {state.selectionCount} to pause</Text>
     <Text style={st.link}>Edit apps</Text>
    </TouchableOpacity>}
    {ready?<>
    <DurationRing minutes={minutes} onChange={setMinutes} min={5} max={180}/>
    <TouchableOpacity accessibilityRole="button" disabled={!ready||!validMinutes||!!busy} onPress={()=>{void AsyncStorage.setItem(LAST_MINUTES_KEY,String(chosen));run('start',{minutes:chosen,replace:!!other})}} style={[st.cta,(!ready||!validMinutes||!!busy)&&{opacity:0.5}]}><Text style={st.ctaText}>Start</Text></TouchableOpacity>
    </>:null}
    {state?.entitlementKnown&&!state.allowed&&!state.hasPlus&&!isPlus&&!other?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Free trial ended. See MoodPals Plus" onPress={()=>showPaywall('screenBreak')} style={st.gate}>
     <View style={st.gatePill}><Ionicons name="lock-closed" size={16} color="#fff"/><Text style={st.ctaText}>Get MoodPals Plus</Text></View>
    </TouchableOpacity>:null}
   </View>}
   {remote?null:<>{busy&&busy!=='auth'&&busy!=='pick'?<ActivityIndicator color={T.primary}/>:null}
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {state&&!state.authorized&&mine?<Text style={[st.sub,{color:red}]}>Screen Time access was turned off, so apps can't be paused. Allow access again to restore the break.</Text>:null}</>}
  </>}
  {inline?<Modal visible={watchOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setWatchOpen(false)}>
   <ScrollView contentContainerStyle={{padding:20,gap:14}}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>setWatchOpen(false)} style={{alignSelf:'flex-end',minHeight:44,justifyContent:'center'}}><Text style={st.link}>Done</Text></TouchableOpacity>
    <MemberWatch child={child} children={children} onChanged={onChanged} onRemoved={onRemoved}/>
   </ScrollView>
  </Modal>:<>
  <TouchableOpacity accessibilityRole="button" onPress={onInsights} style={st.linkRow}><View style={[st.tile,{backgroundColor:TINTS[2]}]}><Ionicons name="bar-chart" size={21} color={TINT_INK[2]}/></View><Text style={[st.rowTitle,{flex:1}]}>Screen Time Insights</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></TouchableOpacity>
  <MemberWatch child={child} children={children} onChanged={onChanged} onRemoved={onRemoved}/>
  </>}
 </View>;
}

type FamilyDevicesData=ReturnType<typeof useFamilyDevices>;
/** Timer for a family device (iPad / spare iPhone). Shows a session only once the device acknowledged it. */
function RemoteTimer({child,children,device,family,minutes,setMinutes,onOpen,onPlan}:{child:FamilyChild;children:FamilyChild[];device:FamilyDevice;family:FamilyDevicesData;minutes:number;setMinutes:(n:number)=>void;onOpen?:(id:string)=>void;onPlan:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[extra,setExtra]=useState(15),[adding,setAdding]=useState(false);
 const now=useNow(true);
 const session=family.sessions.find(x=>x.family_device_id===device.id&&Date.parse(x.deadline_at)>now);
 const status=deviceStatus(device,family.commands,family.sessions,now);
 const failed=family.commands.find(c=>c.device_id===device.id&&(c.status==='rejected'||c.status==='expired')&&now-Date.parse(c.updated_at||c.created_at)<120000);
 const who=(id:string)=>children.find(c=>c.id===id)?.name||'Someone';
 const act=async(type:string,opts:{minutes?:number;child?:string;replace?:boolean}={})=>{
  setBusy(true);setError('');
  try{await deviceCommand(device.id,type,opts);void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{})}
  catch(e:any){if(/trial|Plus/i.test(e.message))onPlan();setError(e.message)}
  finally{setBusy(false)}
 };
 const extendSheet=session?<Modal visible={adding} transparent animationType="slide" onRequestClose={()=>setAdding(false)}>
  <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
   <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setAdding(false)} accessibilityLabel="Close"/>
   <View style={[st.sheet,{alignItems:'center'}]}>
    <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6'}}/>
    <Text style={st.sheetTitle}>Add time for {who(session.child_id)}</Text>
    <DurationRing minutes={extra} onChange={setExtra} min={5} max={120} prefix="+"/>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>{setAdding(false);void act('EXTEND_SESSION',{minutes:extra})}} style={[st.cta,{alignSelf:'stretch'}]}><Text style={st.ctaText}>Add {formatDuration(extra*60)}</Text></TouchableOpacity>
   </View>
  </View>
 </Modal>:null;
 const pendingStart=status.pending?.type==='START_SESSION'?status.pending:undefined;
 return <View style={[st.card,{alignItems:'stretch'}]}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <Text style={[st.heading,{flex:1}]} numberOfLines={1}>{device.name}</Text>
   <Text style={[st.sub,{color:status.tone==='warn'?'#B7791F':T.primary,fontWeight:'800'}]}>{status.label}</Text>
  </View>
  {session&&session.child_id===child.id?<>
   <View style={{alignItems:'center',gap:4}}>
    <Text style={st.kicker}>Screen time left</Text>
    <Text style={st.timer} accessibilityRole="timer">{countdown(Date.parse(session.deadline_at)-now)}</Text>
    <Text style={st.sub}>Ends at {clock(Date.parse(session.deadline_at)/1000)} · {formatDuration(session.granted_seconds)} granted</Text>
   </View>
   <TouchableOpacity accessibilityRole="button" disabled={busy||!!status.pending} onPress={()=>{setExtra(15);setAdding(true)}} style={[st.cta,(busy||!!status.pending)&&{opacity:.5}]}><Text style={st.ctaText}>Add Time</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" disabled={busy||!!status.pending} onPress={()=>void act('END_SESSION')} style={[st.ghost,(busy||!!status.pending)&&{opacity:.5}]}><Text style={[st.ghostText,{color:red}]}>End Now</Text></TouchableOpacity>
   {extendSheet}
  </>:pendingStart?<View style={{alignItems:'center',gap:10}}>
   <ActivityIndicator color={T.primary}/>
   <Text style={[st.body,{textAlign:'center'}]}>{status.label==='Waiting for device connection'?'Waiting for '+device.name+' to connect…':'Starting '+(pendingStart.minutes||0)+' min for '+who(pendingStart.child_id||'')+'…'}</Text>
   <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>{setBusy(true);void cancelDeviceCommand(pendingStart.id).catch(e=>setError(e.message)).finally(()=>setBusy(false))}} style={[st.ghost,{alignSelf:'stretch'}]}><Text style={st.ghostText}>Cancel</Text></TouchableOpacity>
  </View>:device.auth_status!=='approved'||!device.selection_count?<Text style={st.body}>Finish setup on {device.name}: allow Screen Time and choose the apps to pause.</Text>:<>
   {session?<ReplaceNote name={who(session.child_id)} ms={Date.parse(session.deadline_at)-now}/>:null}
   <DurationRing minutes={minutes} onChange={setMinutes} min={5} max={180}/>
   <TouchableOpacity accessibilityRole="button" disabled={busy||!!status.pending} onPress={()=>{void AsyncStorage.setItem(LAST_MINUTES_KEY,String(minutes));void act('START_SESSION',{minutes,child:child.id,replace:!!session})}} style={[st.cta,(busy||!!status.pending)&&{opacity:.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Start</Text>}</TouchableOpacity>
  </>}
  {status.pending&&!pendingStart?<Text style={[st.sub,{textAlign:'center'}]}>{status.label}…</Text>:null}
  {failed?<Text style={[st.sub,{color:red,textAlign:'center'}]}>{failed.error||'The device couldn’t do that.'}</Text>:null}
  {error?<Text style={[st.sub,{color:red,textAlign:'center'}]}>{error}</Text>:null}
 </View>;
}

// Circular duration dial, same as the Apple Watch: drag around the ring in 5-minute steps.
// Ring color by time given: green while it's a modest amount, then amber, then red.
const SEGMENTS=72,TIME_STOPS:[number,[number,number,number]][]=[[45,[52,179,126]],[90,[242,179,61]],[150,[229,72,77]]];
function timeColor(minutes:number){
 const i=TIME_STOPS.findIndex(([m])=>minutes<=m);
 const mix=i<=0?TIME_STOPS[i<0?TIME_STOPS.length-1:0][1]:(()=>{const [m0,a]=TIME_STOPS[i-1],[m1,b]=TIME_STOPS[i],t=(minutes-m0)/(m1-m0);return a.map((v,k)=>v+(b[k]-v)*t)})();
 return '#'+mix.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}
const PRESETS=[15,30,45,60,90];
export function DurationRing({minutes,onChange,min,max,step=5,prefix=''}:{minutes:number;onChange:(n:number)=>void;min:number;max:number;step?:number;prefix?:string}){
 // The knob is wider than the ring, so the ring is inset by the knob's radius to keep it inside the view.
 const SIZE=230,LINE=18,KNOB=LINE*0.75,R=SIZE/2-KNOB-3,C=SIZE/2,CIRC=2*Math.PI*R;
 const frac=(minutes-min)/(max-min);
 const last=useRef(minutes);last.current=minutes;
 // Holding the ring locks the page (and the tab pager) so dragging only changes the time.
 const setScrubbing=useContext(ChartScrubContext);
 const set=(v:number)=>{
  const snapped=Math.min(max,Math.max(min,Math.round(v/step)*step));
  if(snapped===last.current)return;
  last.current=snapped;onChange(snapped);void Haptics.selectionAsync();
 };
 const fromTouch=(x:number,y:number)=>{
  let a=Math.atan2(x-C,C-y);if(a<0)a+=2*Math.PI;
  let f=a/(2*Math.PI);
  // Don't jump across the top between the shortest and longest time.
  const cur=(last.current-min)/(max-min);
  if(cur>0.85&&f<0.15)f=1;else if(cur<0.15&&f>0.85)f=0;
  set(min+f*(max-min));
 };
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:()=>true,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:e=>{setScrubbing(true);fromTouch(e.nativeEvent.locationX,e.nativeEvent.locationY)},
  onPanResponderMove:e=>fromTouch(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderRelease:()=>setScrubbing(false),
  onPanResponderTerminate:()=>setScrubbing(false),
 }),[min,max,step,setScrubbing]);
 const angle=frac*2*Math.PI,kx=C+R*Math.sin(angle),ky=C-R*Math.cos(angle);
 const h=Math.floor(minutes/60),m=minutes%60;
 return <View style={{alignSelf:'stretch',alignItems:'center',gap:12}}><View style={{width:SIZE,height:SIZE,alignSelf:'center',marginVertical:6}} {...pan.panHandlers}
  accessible accessibilityRole="adjustable" accessibilityLabel="Duration" accessibilityValue={{text:prefix+formatDuration(minutes*60)}}
  accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>set(minutes+(e.nativeEvent.actionName==='increment'?step:-step))}>
  <Svg width={SIZE} height={SIZE} pointerEvents="none">
   {Array.from({length:SEGMENTS},(_,i)=>{
    const f0=i/SEGMENTS,f1=(i+1)/SEGMENTS,color=timeColor(min+(f0+f1)/2*(max-min)),on=f0<frac;
    const len=(on?Math.min(f1,frac)-f0:f1-f0)*CIRC;
    return <Circle key={i} cx={C} cy={C} r={R} stroke={on?color:color+'33'} strokeWidth={LINE} fill="none" strokeDasharray={(len+(on?0.6:0))+' '+CIRC} strokeDashoffset={-f0*CIRC} transform={'rotate(-90 '+C+' '+C+')'}/>;
   })}
   <Circle cx={C} cy={C-R} r={LINE/2} fill={timeColor(min)}/>
   <Circle cx={kx} cy={ky} r={KNOB} fill="#fff" stroke={timeColor(minutes)} strokeWidth={3}/>
  </Svg>
  <View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}>
   <Text style={{fontSize:52,fontWeight:'900',color:T.ink}}>{prefix}{minutes}</Text>
   <Text style={st.sub}>{h?h+' hr'+(m?' '+m+' min':''):'min'}</Text>
  </View>
 </View>
 <View style={st.presets}>{PRESETS.filter(n=>n>=min&&n<=max).map(n=><TouchableOpacity key={n} accessibilityRole="button" accessibilityLabel={prefix+formatDuration(n*60)} accessibilityState={{selected:n===minutes}} onPress={()=>set(n)} style={[st.preset,n===minutes&&st.presetOn]}><Text style={[st.presetText,n===minutes&&{color:'#fff'}]}>{prefix}{n<60?n+'m':n/60+'h'}</Text></TouchableOpacity>)}</View>
 </View>;
}

function PlanNote({state,daysLeft,onUpgrade}:{state:BreakState;daysLeft:number|null;onUpgrade:()=>void}){
 if(!state.entitlementKnown)return null;
 const text=state.trialAvailable?'14 days free: your trial starts with the first Screen Break or when you turn on Screen Time & Stress.':state.allowed?'Free trial: '+daysLeft+' day'+(daysLeft===1?'':'s')+' left.':'Your 14-day free trial has ended. Your history stays here, and you can always stop a timer or unlock.';
 return <TouchableOpacity accessibilityRole="button" onPress={onUpgrade} style={st.note}>
  <Ionicons name="sparkles-outline" size={18} color={T.primary}/><Text style={[st.sub,{flex:1,color:T.ink}]}>{text}</Text>
  {!state.allowed||!state.trialAvailable?<Text style={{color:T.primary,fontWeight:'900',fontSize:12}}>Plus</Text>:null}
 </TouchableOpacity>;
}

function StatusRow({done,title,detail,action,onPress,busy,disabled}:{done:boolean;title:string;detail:string;action?:string;onPress:()=>void;busy?:boolean;disabled?:boolean}){
 return <View style={st.step}>
  <Ionicons name={done?'checkmark-circle':'ellipse-outline'} size={23} color={done?T.primary:'#B8C4BE'}/>
  <View style={{flex:1,gap:2}}><Text style={st.rowTitle}>{title}</Text><Text style={st.sub}>{detail}</Text></View>
  {action?<TouchableOpacity accessibilityRole="button" accessibilityLabel={action+' '+title} disabled={busy||disabled} onPress={onPress} style={[st.small,(busy||disabled)&&{opacity:0.5}]}>{busy?<ActivityIndicator size="small" color={T.primary}/>:<Text style={st.smallText}>{action}</Text>}</TouchableOpacity>:null}
 </View>;
}

const WHEEL_ROW=44;
// Snapping wheel: the highlighted middle row is the value. Explicit width and height so the rows always draw.
function DurationWheel({values,value,onChange,format,label}:{values:number[];value:number;onChange:(n:number)=>void;format:(n:number)=>string;label:string}){
 const ref=useRef<ScrollView>(null);
 const index=Math.max(0,values.indexOf(value));
 useEffect(()=>{const t=setTimeout(()=>ref.current?.scrollTo({y:index*WHEEL_ROW,animated:false}),0);return()=>clearTimeout(t)},[]);
 const at=(y:number)=>values[Math.max(0,Math.min(values.length-1,Math.round(y/WHEEL_ROW)))];
 return <View style={{alignSelf:'stretch',height:WHEEL_ROW*3,overflow:'hidden'}} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{text:format(value)}}
  accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>{const i=index+(e.nativeEvent.actionName==='increment'?1:-1);if(i>=0&&i<values.length){onChange(values[i]);ref.current?.scrollTo({y:i*WHEEL_ROW,animated:true})}}}>
  <View pointerEvents="none" style={{position:'absolute',top:WHEEL_ROW,left:0,right:0,height:WHEEL_ROW,borderRadius:12,backgroundColor:T.primarySoft}}/>
  <ScrollView ref={ref} style={{flex:1}} showsVerticalScrollIndicator={false} nestedScrollEnabled snapToInterval={WHEEL_ROW} decelerationRate="fast"
   contentContainerStyle={{paddingVertical:WHEEL_ROW}} scrollEventThrottle={16}
   onScroll={e=>{const v=at(e.nativeEvent.contentOffset.y);if(v!==value)onChange(v)}}
   onMomentumScrollEnd={e=>onChange(at(e.nativeEvent.contentOffset.y))}>
   {values.map((n,i)=><TouchableOpacity key={n} activeOpacity={0.6} onPress={()=>{onChange(n);ref.current?.scrollTo({y:i*WHEEL_ROW,animated:true})}} style={{height:WHEEL_ROW,alignItems:'center',justifyContent:'center'}}>
    <Text style={n===value?st.wheelOn:st.wheelOff}>{format(n)}</Text>
   </TouchableOpacity>)}
  </ScrollView>
 </View>;
}

const WHEEL_HOURS=Array.from({length:13},(_,i)=>i),WHEEL_MINUTES=[0,15,30,45];

export function CustomDurationSheet({visible,initialMinutes,onClose,onChoose,title='Set Custom Duration',onOff}:{visible:boolean;initialMinutes:number;onClose:()=>void;onChoose:(n:number)=>void;title?:string;onOff?:()=>void}){
 const snap=(m:number)=>({h:Math.min(12,Math.floor(m/60)),m:Math.min(45,Math.round((m%60)/15)*15)});
 const [hours,setHours]=useState(snap(initialMinutes).h),[mins,setMins]=useState(snap(initialMinutes).m);
 useEffect(()=>{if(visible){const x=snap(initialMinutes);setHours(x.h);setMins(x.m)}},[visible,initialMinutes]);
 const total=hours*60+mins,valid=total>=1&&total<=720;
 const fmt=(h:number,m:number)=>[h?h+' hr':'',m?m+' min':''].filter(Boolean).join(' ')||'0 min';
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.25)'}}>
   <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close custom time" accessibilityRole="button"/>
   <View style={st.durationSheet}>
    <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6',alignSelf:'center'}}/>
    <Text style={[st.heading,{textAlign:'center'}]}>{title}</Text>
    <View style={{flexDirection:'row',gap:12}}>
     <View style={{flex:1,gap:6}}><Text style={st.wheelLabel}>Hours</Text>{visible?<DurationWheel label="Hours" values={WHEEL_HOURS} value={hours} onChange={setHours} format={n=>n+' hr'}/>:null}</View>
     <View style={{flex:1,gap:6}}><Text style={st.wheelLabel}>Minutes</Text>{visible?<DurationWheel label="Minutes" values={WHEEL_MINUTES} value={mins} onChange={setMins} format={n=>n+' min'}/>:null}</View>
    </View>
    {hours===12&&mins>0?<Text style={[st.sub,{textAlign:'center',color:red}]}>Up to 12 hours.</Text>:null}
    <TouchableOpacity accessibilityRole="button" disabled={!valid} onPress={()=>onChoose(total)} style={[st.cta,!valid&&{opacity:0.5}]}><Text style={st.ctaText}>{valid?'Use '+fmt(hours,mins):'Choose a time'}</Text></TouchableOpacity>
    {onOff?<TouchableOpacity accessibilityRole="button" onPress={onOff} style={st.ghost}><Text style={st.ghostText}>Turn Off</Text></TouchableOpacity>:null}
   </View>
  </View>
 </Modal>;
}

function Chip({label,on,onPress,disabled}:{label:string;on?:boolean;onPress:()=>void;disabled?:boolean}){
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:!!on}} disabled={disabled} onPress={onPress} style={[st.chip,on&&st.chipOn,disabled&&{opacity:0.5}]}><Text style={[st.chipText,on&&{color:'#fff'}]}>{label}</Text></TouchableOpacity>;
}

async function linkWatch(child:FamilyChild,profile:string){
 const {error:e}=await supabase.rpc('family_link_child_watch',{p_child:child.id,p_profile:profile});
 if(e)throw Error(e.code==='P0001'?e.message:'Unable to assign the watch.');
}

// Watch card for one member, used on Today; loads the member by id, or by the family watch profile id.
export function MemberWatchCard({childId,profileId}:{childId?:string;profileId?:string}){
 const [children,setChildren]=useState<FamilyChild[]>([]);
 const load=useCallback(()=>{void loadChildren().then(setChildren).catch(()=>{})},[]);
 useEffect(()=>{load();listeners.add(load);return()=>{listeners.delete(load)}},[load]);
 const child=children.find(c=>!c.watch_only&&(childId?c.id===childId:c.profile_user_id===profileId));
 if(!child)return null;
 return <MemberWatch child={child} children={children} onChanged={familyChildrenChanged} onRemoved={familyChildrenChanged}/>;
}

// Summary of the member's watch; editing happens in the shared Edit sheet.
function MemberWatch({child,children,onChanged,onRemoved}:{child:FamilyChild;children:FamilyChild[];onChanged:()=>void;onRemoved:()=>void}){
 const {profiles}=useFamilyProfiles(!!child.profile_user_id);
 const [editing,setEditing]=useState(false),[assigning,setAssigning]=useState(false);
 const watch=child.profile_user_id?profiles.find(p=>p.id===child.profile_user_id):undefined;
 const color=watch&&isWatchColor(watch.watchColor)?watch.watchColor:null;
 const spare=children.filter(c=>c.watch_only&&c.profile_user_id);
 return <View style={[st.card,{gap:12}]}>
  {child.profile_user_id?<View style={{flexDirection:'row',alignItems:'center',gap:14}}>
   <WatchImage color={color} name={shortProfileName(child.name)} width={64}/>
   <View style={{flex:1,gap:2}}><Text style={st.rowTitle}>{child.name}'s Apple Watch</Text><Text style={st.sub}>Mood-only watch{watch?(watch.connected?' · Linked':' · Not linked'):''}</Text></View>
  </View>:<View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   <Ionicons name="watch-outline" size={26} color={T.primary}/>
   <View style={{flex:1}}><Text style={st.rowTitle}>Apple Watch</Text><Text style={st.sub}>Optional. {child.name} can pick moods from their own watch.</Text></View>
  </View>}
  {child.profile_user_id?<TouchableOpacity accessibilityRole="button" accessibilityLabel={'Edit '+child.name+' and their watch'} onPress={()=>setEditing(true)} style={st.ghost}><Text style={st.ghostText}>Edit</Text></TouchableOpacity>
   :<TouchableOpacity accessibilityRole="button" onPress={()=>setAssigning(true)} style={st.ghost}><Text style={st.ghostText}>Assign a Watch</Text></TouchableOpacity>}
  <EditMemberSheet visible={editing} child={child} children={children} onClose={()=>setEditing(false)} onChanged={onChanged} onRemoved={()=>{setEditing(false);onRemoved()}}/>
  <AssignWatchSheet visible={assigning} child={child} spare={spare} link={p=>linkWatch(child,p)} onClose={()=>setAssigning(false)} onAssigned={()=>{familyProfilesChanged();onChanged()}}/>
 </View>;
}

// A family watch from Family › Watches: its member's Edit sheet, or the watch's own page if no member has it.
export function FamilyWatchEditor({profile,onClose,onDeleted}:{profile:FamilyProfile;onClose:()=>void;onDeleted:()=>void|Promise<void>}){
 const [children,setChildren]=useState<FamilyChild[]|null>(null);
 const load=useCallback(()=>{void loadChildren().then(setChildren).catch(()=>setChildren([]))},[]);
 useEffect(load,[load]);
 if(!children)return null;
 const member=children.find(c=>!c.watch_only&&c.profile_user_id===profile.id);
 if(!member)return <ManageFamilyProfile profile={profile} onClose={onClose} onDeleted={onDeleted}/>;
 return <EditMemberSheet visible child={member} children={children} onClose={onClose} onChanged={()=>{load();familyChildrenChanged()}} onRemoved={()=>{familyChildrenChanged();onClose()}}/>;
}

type EditStage='edit'|'assign'|'color'|'manage';

// One bottom sheet for a member and their watch, which share a name: rename both, watch colour, assign or
// unassign the watch, and remove the member. Sub-sheets open after this one has slid away (iOS shows one at a time).
function EditMemberSheet({visible,child,children,onClose,onChanged,onRemoved}:{visible:boolean;child:FamilyChild;children:FamilyChild[];onClose:()=>void;onChanged:()=>void;onRemoved:()=>void}){
 const {profiles,load}=useFamilyProfiles(visible&&!!child.profile_user_id);
 const [state]=useBreakState();
 const [draft,setDraft]=useState(child.name),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [stage,setStage]=useState<EditStage>('edit'),[leaving,setLeaving]=useState<EditStage|null>(null);
 useEffect(()=>{if(visible){setDraft(child.name);setError('');setStage('edit');setLeaving(null)}},[visible]);
 useEffect(()=>{setDraft(child.name)},[child.name]);
 const watch=child.profile_user_id?profiles.find(p=>p.id===child.profile_user_id):undefined;
 const color=watch&&isWatchColor(watch.watchColor)?watch.watchColor:null;
 const s=state?.session;
 const locked=!!s&&s.childId===child.id&&s.status==='active'&&s.deadline*1000>Date.now();
 const spare=children.filter(c=>c.watch_only&&c.profile_user_id);
 const name=draft.replace(/\s+/g,' ').trim();
 const open=(next:EditStage)=>setLeaving(next);
 async function save(){
  if(!name||name===child.name||busy)return;
  setBusy('name');setError('');
  try{
   // A watch's name is the member's name (the server copies it to the member).
   if(child.profile_user_id){await familyCall('rename',{profileId:child.profile_user_id,name});familyProfilesChanged()}
   else{const {error:e}=await supabase.from('family_children').update({name,updated_at:new Date().toISOString()}).eq('id',child.id);if(e)throw Error('Unable to save the name.')}
   onChanged();
  }catch(e:any){setError(e?.message||'Unable to save the name.')}
  finally{setBusy('')}
 }
 function unassign(){
  Alert.alert('Unassign this watch?',child.name+' stays in Family. The watch keeps working and can be assigned to another member.',[{text:'Keep'},{text:'Unassign',style:'destructive',onPress:async()=>{
   setBusy('unassign');setError('');
   const {error:e}=await supabase.rpc('family_unassign_child_watch',{p_child:child.id});
   setBusy('');
   if(e)setError('Unable to unassign the watch. Try again.');else{familyProfilesChanged();onChanged()}
  }}]);
 }
 function remove(){
  Alert.alert('Remove '+child.name+'?',child.profile_user_id?'Their Screen Break history is deleted too. Their watch stays in Family and can be assigned to someone else.':'Their Screen Break history is deleted too.',[{text:'Keep'},{text:'Remove',style:'destructive',onPress:async()=>{
   setBusy('remove');setError('');
   // Park the watch first, so it can still be assigned to another member.
   if(child.profile_user_id){
    const {error:ue}=await supabase.rpc('family_unassign_child_watch',{p_child:child.id});
    if(ue){setBusy('');setError('Unable to remove. Try again.');return}
    familyProfilesChanged();
   }
   const {error:e}=await supabase.from('family_children').delete().eq('id',child.id);
   setBusy('');
   if(e)setError('Unable to remove.');else onRemoved();
  }}]);
 }
 const row=(icon:keyof typeof Ionicons.glyphMap,label:string,value:string,onPress:()=>void)=><TouchableOpacity accessibilityRole="button" accessibilityLabel={label+', '+value} onPress={onPress} style={st.option}>
  <Ionicons name={icon} size={20} color={T.primary}/><Text style={[st.rowTitle,{flex:1}]}>{label}</Text><Text style={st.sub}>{value}</Text><Ionicons name="chevron-forward" size={17} color={T.muted}/>
 </TouchableOpacity>;
 return <>
  <Modal visible={visible&&stage==='edit'&&!leaving} transparent animationType="slide" onRequestClose={busy?undefined:onClose} onDismiss={()=>{if(leaving){setStage(leaving);setLeaving(null)}}}>
   <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
    <TouchableOpacity style={StyleSheet.absoluteFill} disabled={!!busy} onPress={onClose} accessibilityLabel="Close"/>
    <ScrollView style={{maxHeight:'88%',flexGrow:0}} contentContainerStyle={st.sheet} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
     <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6',alignSelf:'center'}}/>
     <Text style={st.sheetTitle}>Edit {child.name}</Text>
     <Text style={st.kicker}>Name</Text>
     <TextInput value={draft} onChangeText={setDraft} maxLength={40} autoCapitalize="words" returnKeyType="done" editable={busy!=='name'} style={st.input} accessibilityLabel="Member's name" onSubmitEditing={()=>void save()}/>
     {child.profile_user_id?<Text style={st.sub}>Also renames {child.name}'s watch, and what your Circle sees.</Text>:null}
     <TouchableOpacity accessibilityRole="button" disabled={!name||name===child.name||!!busy} onPress={()=>void save()} style={[st.cta,(!name||name===child.name||!!busy)&&{opacity:0.5}]}>{busy==='name'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Save</Text>}</TouchableOpacity>
     <Text style={[st.kicker,{marginTop:6}]}>Apple Watch</Text>
     {child.profile_user_id?<>
      <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
       <WatchImage color={color} name={shortProfileName(child.name)} width={56}/>
       <View style={{flex:1,gap:2}}><Text style={st.rowTitle}>{child.name}'s Apple Watch</Text><Text style={st.sub}>Mood-only watch{watch?(watch.connected?' · Linked':' · Not linked'):''}</Text></View>
       {!watch?<ActivityIndicator color={T.primary}/>:null}
      </View>
      {watch?row('color-palette-outline','Watch colour',color?colorName(color):'Choose',()=>open('color')):null}
      {watch?row('options-outline','More watch options','Sharing, remove',()=>open('manage')):null}
      <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={unassign} style={{alignItems:'center',justifyContent:'center',minHeight:44}}>{busy==='unassign'?<ActivityIndicator color={T.primary}/>:<Text style={[st.link,{color:red}]}>Unassign Watch</Text>}</TouchableOpacity>
     </>:<>
      <Text style={st.sub}>Optional. {child.name} can pick moods from their own watch.</Text>
      <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>open('assign')} style={st.ghost}><Text style={st.ghostText}>Assign a Watch</Text></TouchableOpacity>
     </>}
     <TouchableOpacity accessibilityRole="button" disabled={locked||!!busy} onPress={remove} style={[st.ghost,{marginTop:6},(locked||!!busy)&&{opacity:0.5}]}><Text style={[st.ghostText,{color:red}]}>Remove Member</Text></TouchableOpacity>
     {locked?<Text style={[st.sub,{textAlign:'center'}]}>Stop {child.name}'s timer before removing them.</Text>:null}
     {error?<Text style={[st.sub,{color:red,textAlign:'center'}]}>{error}</Text>:null}
    </ScrollView>
   </View>
  </Modal>
  <AssignWatchSheet visible={visible&&stage==='assign'} child={child} spare={spare} link={p=>linkWatch(child,p)} onClose={()=>setStage('edit')} onAssigned={()=>{familyProfilesChanged();onChanged()}}/>
  {watch?<WatchColorSheet visible={visible&&stage==='color'} name={shortProfileName(child.name)} initial={color} onSave={async c=>{await familyCall('set_color',{profileId:watch.id,color:c});familyProfilesChanged();void load()}} onClose={()=>setStage('edit')}/>:null}
  {visible&&stage==='manage'&&watch?<ManageFamilyProfile profile={watch} onClose={()=>{setStage('edit');void load()}} onDeleted={()=>{setStage('edit');familyProfilesChanged();onChanged()}}/>:null}
 </>;
}

// Bottom sheet that walks through adding a family watch and assigning it to this member.
function AssignWatchSheet({visible,child,spare,link,onClose,onAssigned}:{visible:boolean;child:FamilyChild;spare:FamilyChild[];link:(profile:string)=>Promise<void>;onClose:()=>void;onAssigned:()=>void}){
 const {isPlus,showPaywall}=usePlus();
 const [step,setStep]=useState<'start'|'code'|'color'|'done'>('start'),[code,setCode]=useState(''),[color,setColor]=useState<WatchColor|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(visible){setStep(spare.length?'start':'code');setCode('');setColor(null);setError('')}},[visible]);
 const name=child.name;
 async function finish(){
  if(!color||busy)return;
  setBusy(true);setError('');
  try{
   const {data,error:e}=await supabase.functions.invoke('watch-pairing',{body:{action:'approve_code',code,color,family:true}});
   let msg:string|undefined=data?.error;
   if(e&&!msg&&'context' in e){try{msg=(await (e as any).context.json())?.error}catch{}}
   if(e||msg||!data?.profileId)throw Error(msg||'Unable to set up the watch. Check the code and try again.');
   const {error:le}=await supabase.rpc('family_link_child_watch',{p_child:child.id,p_profile:data.profileId});
   if(le)throw Error(le.code==='P0001'?le.message:'The watch was added but could not be assigned. Try Assign again.');
   onAssigned();setStep('done');
  }catch(err:any){
   const m=err?.message||'Something went wrong.';
   if(/Family watch limit/.test(m)&&!isPlus){setError("MoodPals Free includes 1 family watch. Upgrade to Plus for up to 4.");showPaywall('family')}
   else{setError(m);if(/code/i.test(m))setStep('code')}
  }finally{setBusy(false)}
 }
 async function useExisting(profile:string){
  setBusy(true);setError('');
  const {error:e}=await supabase.rpc('family_link_child_watch',{p_child:child.id,p_profile:profile});
  setBusy(false);
  if(e){setError(e.code==='P0001'?e.message:'Unable to assign the watch.');return}
  onAssigned();setStep('done');
 }
 const digits=code.replace(/\D/g,'');
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={busy?undefined:onClose}>
  <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
   <TouchableOpacity style={StyleSheet.absoluteFill} disabled={busy} onPress={onClose} accessibilityLabel="Close"/>
   <ScrollView style={{maxHeight:'88%',flexGrow:0}} contentContainerStyle={st.sheet} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <View style={{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6',alignSelf:'center'}}/>
    {step==='start'?<>
     <Text style={st.sheetTitle}>Assign a watch to {name}</Text>
     <Text style={st.sub}>Use a watch that isn't assigned to anyone, or set up a new one.</Text>
     {spare.map(w=><TouchableOpacity key={w.id} accessibilityRole="button" disabled={busy} onPress={()=>void useExisting(w.profile_user_id!)} style={st.option}><Ionicons name="watch" size={22} color={T.primary}/><Text style={[st.rowTitle,{flex:1}]}>{w.name}</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></TouchableOpacity>)}
     <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setStep('code')} style={st.cta}><Text style={st.ctaText}>Set Up a New Watch</Text></TouchableOpacity>
    </>:step==='code'?<>
     <Text style={st.kicker}>Step 1 of 2</Text>
     <Text style={st.sheetTitle}>Enter the watch code</Text>
     <Text style={st.body}>On {name}'s Apple Watch, open MoodPals. It shows a 6-digit code.</Text>
     <TextInput value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} placeholder="000000" placeholderTextColor="#C3CDC8" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} autoFocus accessibilityLabel="Watch code" style={st.codeInput} onSubmitEditing={()=>{if(digits.length===6)setStep('color')}}/>
     <TouchableOpacity accessibilityRole="button" disabled={digits.length!==6} onPress={()=>{setError('');setStep('color')}} style={[st.cta,digits.length!==6&&{opacity:0.5}]}><Text style={st.ctaText}>Next</Text></TouchableOpacity>
    </>:step==='color'?<>
     <Text style={st.kicker}>Step 2 of 2</Text>
     <Text style={st.sheetTitle}>Choose a watch colour</Text>
     <Text style={st.sub}>So you can tell {name}'s watch apart in MoodPals.</Text>
     <View style={{alignItems:'center'}}><WatchImage color={color} name={shortProfileName(name)} width={100}/></View>
     <WatchColorGrid value={color} onChange={setColor} name={shortProfileName(name)}/>
     <TouchableOpacity accessibilityRole="button" disabled={!color||busy} onPress={()=>void finish()} style={[st.cta,(!color||busy)&&{opacity:0.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>{color?'Assign Watch':'Choose a colour'}</Text>}</TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setStep('code')} style={{alignItems:'center',minHeight:44,justifyContent:'center'}}><Text style={st.link}>Back</Text></TouchableOpacity>
    </>:<View style={{alignItems:'center',gap:10}}>
     <Ionicons name="checkmark-circle" size={64} color={T.primary}/>
     <Text style={[st.sheetTitle,{textAlign:'center'}]}>{name}'s watch is set up</Text>
     <Text style={[st.body,{textAlign:'center'}]}>{name} can pick moods on the watch. You'll see them on Today.</Text>
     <TouchableOpacity accessibilityRole="button" onPress={onClose} style={[st.cta,{alignSelf:'stretch'}]}><Text style={st.ctaText}>Done</Text></TouchableOpacity>
    </View>}
    {error?<Text style={[st.sub,{color:red,textAlign:'center'}]}>{error}</Text>:null}
   </ScrollView>
  </View>
 </Modal>;
}

// ---------- Insights ----------

const PERIODS:{key:BreakPeriod;label:string}[]=[{key:'day',label:'Day'},{key:'week',label:'Week'},{key:'month',label:'Month'},{key:'year',label:'Year'}];
const shift=(period:BreakPeriod,anchor:Date,n:number)=>periodRange(period,anchor,n).start;

function periodTitle(period:BreakPeriod,anchor:Date){
 const r=periodRange(period,anchor);
 if(period==='day')return r.start.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 if(period==='week'){const last=new Date(r.end.getFullYear(),r.end.getMonth(),r.end.getDate()-1);return r.start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+last.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
 if(period==='month')return r.start.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 return String(r.start.getFullYear());
}

function fromSync(r:BreakSyncRow):SessionRow{return {id:r.id,child_id:r.child_id,started_at:r.started_at,deadline_at:r.deadline_at,ended_at:r.ended_at||null,granted_seconds:r.granted_seconds,status:r.status,version:r.version}}
function fromNative(s:BreakSession):SessionRow{return {id:s.id,child_id:s.childId,started_at:new Date(s.startedAt*1000).toISOString(),deadline_at:new Date(s.deadline*1000).toISOString(),ended_at:s.endedAt?new Date(s.endedAt*1000).toISOString():null,granted_seconds:s.grantedSeconds,status:s.status,version:s.version}}

function InsightsScreen({child,onBack}:{child:FamilyChild;onBack:()=>void}){
 const [period,setPeriod]=useState<BreakPeriod>('week');
 const [anchor,setAnchor]=useState(()=>new Date());
 const [rows,setRows]=useState<SessionRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [state]=useBreakState();
 const {isPlus,showPaywall}=usePlus();
 const allowed=isPlus||!!state?.allowed||!state?.entitlementKnown;
 const active=state?.session&&state.session.childId===child.id&&state.session.status==='active'?state.session:null;
 const now=useNow(!!active);
 const range=periodRange(period,anchor),previous=periodRange(period,anchor,-1);
 const isCurrent=range.start<=new Date()&&new Date()<range.end;
 useEffect(()=>{
  let live=true;setLoading(true);setError('');
  void supabase.from('screen_break_sessions').select('id,child_id,family_device_id,started_at,deadline_at,ended_at,granted_seconds,status,version')
   .eq('child_id',child.id).lt('started_at',range.end.toISOString()).gte('deadline_at',previous.start.toISOString()).order('started_at').limit(2000)
   .then(({data,error:e})=>{if(!live)return;setLoading(false);if(e)setError('Unable to load session history. Showing sessions saved on this iPhone.');setRows((data as SessionRow[])||[])});
  return()=>{live=false};
 },[child.id,period,range.start.getTime(),state?.session?.version]);
 // Sessions recorded on this iPhone that haven't reached the server yet count too (each id once, newest version).
 const all=useMemo(()=>{
  const local=pendingBreakSync().filter(r=>r.child_id===child.id).map(fromSync);
  if(state?.session&&state.session.childId===child.id)local.push(fromNative(state.session));
  return [...rows,...local];
 },[rows,state,child.id]);
 const family=useFamilyDevices();
 const deviceName=useDeviceNames(family.devices);
 const [device,setDevice]=useState<string>('all');
 const deviceKey=(r:SessionRow)=>r.family_device_id||PHONE;
 const shown=useMemo(()=>device==='all'?all:all.filter(r=>deviceKey(r)===device),[all,device]);
 const stats=useMemo(()=>periodStats(shown,period,anchor,new Date(now)),[shown,period,anchor,Math.floor(now/60000)]);
 const byDevice=useMemo(()=>{
  const keys=[...new Set(all.map(deviceKey))];
  return keys.map(k=>{const p=periodStats(all.filter(r=>deviceKey(r)===k),period,anchor,new Date(now));return {key:k,name:k===PHONE?'This iPhone':deviceName(k),seconds:p.seconds,sessions:p.sessions}}).filter(x=>x.seconds>0||x.sessions>0).sort((a,b)=>b.seconds-a.seconds);
 },[all,period,anchor,deviceName,Math.floor(now/60000)]);
 const deviceTotal=useMemo(()=>byDevice.reduce((t,d)=>({seconds:t.seconds+d.seconds,sessions:t.sessions+d.sessions}),{seconds:0,sessions:0}),[byDevice]);
 const compare=comparison(stats);
 const notes=observations(stats,period);
 const startOfTimes=periodRange(period,new Date()).start;
 return <View style={{gap:14}}>
  <Back label={child.name} onPress={onBack}/>
  <Text style={st.title}>Screen Time Insights</Text>
  <View style={st.segment}>{PERIODS.map(p=><TouchableOpacity key={p.key} accessibilityRole="tab" accessibilityState={{selected:period===p.key}} onPress={()=>{setPeriod(p.key);setAnchor(new Date())}} style={[st.segBtn,period===p.key&&st.segOn]}><Text style={[st.segText,period===p.key&&{color:'#fff'}]}>{p.label}</Text></TouchableOpacity>)}</View>
  <PeriodPicker period={period} anchor={anchor} onPick={setAnchor}/>
  {family.devices.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[{id:'all',name:'All devices'},{id:PHONE,name:'This iPhone'},...family.devices.map(d=>({id:d.id,name:d.name}))].map(o=><Chip key={o.id} label={o.name} on={device===o.id} onPress={()=>setDevice(o.id)}/>)}</View>:null}
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
  {loading?<ActivityIndicator color={T.primary}/>:null}
  <View style={st.note}><Ionicons name="bar-chart-outline" size={18} color={T.primary}/><Text style={[st.sub,{color:T.ink,flex:1}]}>{child.name}'s time in your tracked apps is in Actions › Screen Time & Stress: choose {child.name} above the chart.</Text></View>
  <View style={st.grid}>
   <Stat label="Screen Break Time" value={formatDuration(stats.seconds)} sub={'Recorded sessions for '+child.name}/>
   <Stat label="Daily Average" value={formatDuration(stats.dailyAverage)} sub={'Over '+stats.days+' day'+(stats.days===1?'':'s')}/>
   <Stat label="Sessions" value={String(stats.sessions)} sub={stats.completed+' completed'}/>
   <Stat label="Time Granted" value={formatDuration(stats.grantedSeconds)} sub="Allowed by you, not usage"/>
  </View>
  {active&&period==='day'&&isCurrent?<View style={st.note}><Ionicons name="time-outline" size={18} color={T.primary}/><Text style={[st.sub,{color:T.ink,flex:1}]}>Active now: {countdown(active.deadline*1000-now)} left, ends {clock(active.deadline)}</Text></View>:null}
  <View style={st.card}>
   <Text style={st.kicker}>Compared to {({day:'previous day',week:'previous week',month:'previous month',year:'previous year'} as const)[period]}</Text>
   {allowed?<Text style={st.body}>{compare?compare.text+' Screen Break time':'Not enough history to compare yet.'}</Text>:<Text style={st.body}>Comparisons are part of Screen Break with MoodPals Plus.</Text>}
  </View>
  <View style={st.card}>
   <Text style={st.kicker}>{({day:'Sessions by hour',week:'Sessions by day',month:'Sessions by week',year:'Sessions by month'} as const)[period]}</Text>
   {stats.hasData?<SessionLineChart period={period} buckets={stats.buckets}/>:<Text style={st.body}>No Screen Break sessions for {child.name} in this period.</Text>}
   {stats.highest&&period!=='day'?<Text style={st.sub}>Longest: {period==='week'?stats.highest.start.toLocaleDateString(undefined,{weekday:'long'}):period==='month'?'Week '+stats.highest.label.replace('Wk ',''):stats.highest.start.toLocaleDateString(undefined,{month:'long'})} · {formatDuration(stats.highest.seconds)}</Text>:null}
  </View>
  {device==='all'&&(family.devices.length>0||byDevice.some(d=>d.key!==PHONE))&&byDevice.length>0?<View style={st.card}>
   <Text style={st.kicker}>By device</Text>
   {[...byDevice,{key:'total',name:'Total',seconds:deviceTotal.seconds,sessions:deviceTotal.sessions}].map(d=><View key={d.key} style={[{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},d.key==='total'?{borderTopWidth:1,borderTopColor:T.border,paddingTop:8}:null]}>
    <View style={{flex:1}}><Text style={[st.body,d.key==='total'?{fontWeight:'800'}:null]}>{d.name}</Text><Text style={st.sub}>{d.sessions} session{d.sessions===1?'':'s'}</Text></View>
    <Text style={[st.body,{fontWeight:'800'}]}>{formatDuration(d.seconds)}</Text>
   </View>)}
   {deviceTotal.seconds>stats.seconds?<Text style={st.sub}>Sessions that ran on two devices at once count once in Screen Break Time.</Text>:null}
  </View>:null}
  {allowed&&notes.length?<View style={st.card}>{notes.map(n=><Text key={n} style={st.body}>• {n}</Text>)}</View>:null}
  <Text style={st.sub}>Screen Break Time is the time inside {child.name}'s sessions, from start until the session ended, was canceled or reached its time. Time Granted is what you allowed. Neither is measured phone use.</Text>
 </View>;
}

function bucketName(period:BreakPeriod,b:Bucket){
 if(period==='day')return b.start.toLocaleTimeString(undefined,{hour:'numeric'});
 if(period==='week')return b.start.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 if(period==='month')return b.label.replace('Wk','Week')+' · from '+b.start.toLocaleDateString(undefined,{month:'short',day:'numeric'});
 return b.start.toLocaleDateString(undefined,{month:'long'});
}

// Line graph of recorded Screen Break time. Press and drag along it to read the time at each point.
function SessionLineChart({period,buckets}:{period:BreakPeriod;buckets:Bucket[]}){
 const [width,setWidth]=useState(0),[picked,setPicked]=useState<number|null>(null);
 const H=120,pad=8,n=buckets.length;
 const peak=Math.max(60,...buckets.map(b=>b.seconds));
 const x=(i:number)=>pad+(n>1?i*(width-pad*2)/(n-1):(width-pad*2)/2);
 const y=(sec:number)=>pad+(H-pad*2)*(1-sec/peak);
 const pick=(px:number)=>{if(width&&n)setPicked(Math.max(0,Math.min(n-1,Math.round((px-pad)/((width-pad*2)/Math.max(1,n-1))))))};
 const setScrubbing=useContext(ChartScrubContext);
 const pan=useMemo(()=>PanResponder.create({
  // A tap shows that point; a horizontal drag scrubs; a vertical swipe is left to the page so it scrolls.
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)>Math.abs(g.dy)*1.2,
  onPanResponderTerminationRequest:(_e,g)=>Math.abs(g.dy)>Math.abs(g.dx),
  onPanResponderGrant:e=>pick(e.nativeEvent.locationX),
  onPanResponderMove:(e,g)=>{if(Math.abs(g.dx)>Math.abs(g.dy))setScrubbing(true);pick(e.nativeEvent.locationX)},
  onPanResponderRelease:()=>setScrubbing(false),
  onPanResponderTerminate:()=>setScrubbing(false),
 }),[width,n,setScrubbing]);
 const line=buckets.map((b,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(b.seconds).toFixed(1)).join(' ');
 const area=line+' L'+x(n-1).toFixed(1)+' '+(H-pad)+' L'+x(0).toFixed(1)+' '+(H-pad)+' Z';
 const sel=picked!==null?buckets[picked]:null;
 const total=buckets.reduce((t,b)=>t+b.seconds,0);
 return <View style={{gap:6}}>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',minHeight:38}}>
   <View>
    <Text style={st.statValue}>{formatDuration(sel?sel.seconds:total)}</Text>
    <Text style={st.sub}>{sel?bucketName(period,sel):'Total · press and drag the line'}</Text>
   </View>
   <Text style={st.axis}>max {formatDuration(peak)}</Text>
  </View>
  <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{height:H}} {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={'Screen Break time chart, total '+formatDuration(total)}
   accessibilityValue={{text:sel?bucketName(period,sel)+', '+formatDuration(sel.seconds):'Total '+formatDuration(total)}}
   accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>setPicked(p=>Math.max(0,Math.min(n-1,(p??-1)+(e.nativeEvent.actionName==='increment'?1:-1))))}>
   {width?<Svg width={width} height={H}>
    <Defs><LinearGradient id="sbArea" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={T.primary} stopOpacity={0.28}/><Stop offset="1" stopColor={T.primary} stopOpacity={0.02}/></LinearGradient></Defs>
    <Line x1={pad} x2={width-pad} y1={H-pad} y2={H-pad} stroke={T.border} strokeWidth={1}/>
    <Path d={area} fill="url(#sbArea)"/>
    <Path d={line} fill="none" stroke={T.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
    {sel&&picked!==null?<>
     <Line x1={x(picked)} x2={x(picked)} y1={pad} y2={H-pad} stroke={T.muted} strokeWidth={1} strokeDasharray="3 3"/>
     <Circle cx={x(picked)} cy={y(sel.seconds)} r={5.5} fill="#fff" stroke={T.primary} strokeWidth={2.5}/>
    </>:null}
   </Svg>:null}
  </View>
  <View style={{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:2}}>
   {(period==='day'?buckets.filter((_,i)=>i%6===0):buckets).map((b,i)=><Text key={i} style={[st.axis,{textAlign:'center'}]} numberOfLines={1}>{b.label}</Text>)}
  </View>
 </View>;
}

// Same date header as the Health detail screens: ‹ title ˄ › with a card of tiles, newest first.
function PeriodPicker({period,anchor,onPick}:{period:BreakPeriod;anchor:Date;onPick:(d:Date)=>void}){
 const [open,setOpen]=useState(false);
 const today=new Date(),current=periodRange(period,anchor),latest=periodRange(period,today);
 const canForward=current.start<latest.start;
 const tiles:{key:string;top:string;bottom:string;date:Date}[]=[];
 const count=period==='day'?14:period==='week'?8:period==='month'?12:4;
 for(let i=0;i<count;i++){
  const d=periodRange(period,today,-i).start;
  const top=period==='day'?['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]:period==='week'?d.toLocaleDateString(undefined,{month:'short'}):period==='month'?String(d.getFullYear()).slice(2):'Year';
  const bottom=period==='day'||period==='week'?String(d.getDate()):period==='month'?d.toLocaleDateString(undefined,{month:'short'}):String(d.getFullYear());
  tiles.push({key:period+i,top,bottom,date:d});
 }
 return <View style={{gap:12}}>
  <View style={st.dateRow}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous" onPress={()=>onPick(periodRange(period,anchor,-1).start)} style={st.arrow}><Ionicons name="chevron-back" size={18} color={T.primary}/></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Choose '+period+', '+periodTitle(period,anchor)} onPress={()=>setOpen(o=>!o)} style={{flexDirection:'row',alignItems:'center',gap:4}}>
    <Text style={st.dateText}>{periodTitle(period,anchor)}</Text><Ionicons name={open?'chevron-up':'chevron-down'} size={16} color={T.primary}/>
   </TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next" disabled={!canForward} onPress={()=>onPick(periodRange(period,anchor,1).start)} style={[st.arrow,{opacity:canForward?1:0}]}><Ionicons name="chevron-forward" size={18} color={T.primary}/></TouchableOpacity>
  </View>
  {open?<View style={[st.card,{gap:10}]}>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{tiles.map(t=>{const on=periodRange(period,t.date).start.getTime()===current.start.getTime();return <TouchableOpacity key={t.key} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={periodTitle(period,t.date)} onPress={()=>{onPick(t.date);setOpen(false)}} style={[st.dateChip,period==='year'&&{width:64},on&&{backgroundColor:T.primary}]}>
    <Text style={{fontSize:10,fontWeight:'700',color:on?'#fff':T.muted}}>{t.top}</Text><Text style={{fontSize:15,fontWeight:'800',color:on?'#fff':T.ink}}>{t.bottom}</Text>
   </TouchableOpacity>})}</View>
  </View>:null}
 </View>;
}

function Stat({label,value,sub}:{label:string;value:string;sub:string}){
 return <View style={st.stat}><Text style={st.statLabel}>{label}</Text><Text style={st.statValue}>{value}</Text><Text style={st.sub}>{sub}</Text></View>;
}

function Back({label,onPress}:{label:string;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={st.back}><Ionicons name="chevron-back" size={18} color={T.primary}/><Text style={{color:T.primary,fontWeight:'800'}}>{label}</Text></TouchableOpacity>;
}

const TINTS=['#E4F6EA','#EAF1FF','#F4EBFF','#FFF7E8','#FDECE8'],TINT_INK=['#23966A','#4A8CFF','#9B7BC8','#C98A0B','#DA4B31'];
const st=StyleSheet.create({
 hero:{borderRadius:23,backgroundColor:'#E8F5EF',padding:18,flexDirection:'row',alignItems:'center',gap:12},
 heroKicker:{fontSize:11,letterSpacing:1,fontWeight:'900',color:'#3B8A6A'},
 heroTitle:{fontSize:22,lineHeight:27,fontWeight:'900',color:T.ink},
 heroCard:{backgroundColor:'#E8F5EF',borderColor:'#E8F5EF'},
 famSegment:{flexDirection:'row',backgroundColor:'#E6EEEA',borderRadius:14,padding:3},
 segmentItem:{flex:1,minHeight:40,borderRadius:11,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center'},
 segmentOn:{backgroundColor:'#fff',shadowColor:'#000',shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:1}},
 segmentText:{fontSize:15,fontWeight:'800',color:T.muted},
 moreBtn:{width:44,height:44,borderRadius:22,backgroundColor:T.primarySoft,alignItems:'center',justifyContent:'center'},
 profile:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center'},
 profileName:{fontSize:13,fontWeight:'800',color:T.muted,maxWidth:68},
 profileTimer:{position:'absolute',right:2,bottom:2,width:22,height:22,borderRadius:11,backgroundColor:T.primary,borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
 tile:{width:43,height:43,borderRadius:15,alignItems:'center',justifyContent:'center'},
 presets:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8},
 preset:{minWidth:52,minHeight:40,borderRadius:20,paddingHorizontal:12,alignItems:'center',justifyContent:'center',backgroundColor:T.primarySoft},
 presetOn:{backgroundColor:T.primary},
 presetText:{fontSize:15,fontWeight:'800',color:T.primary},
 back:{flexDirection:'row',alignItems:'center',gap:4,marginBottom:4},
 title:{fontSize:28,fontWeight:'900',color:T.ink},
 gate:{position:'absolute',top:0,left:0,right:0,bottom:0,borderRadius:20,backgroundColor:'rgba(244,247,245,0.72)',alignItems:'center',justifyContent:'center'},
 gatePill:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:T.primary,borderRadius:24,paddingHorizontal:20,paddingVertical:12},
 headerLock:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
 heading:{fontSize:17,fontWeight:'900',color:T.ink},
 kicker:{fontSize:12,fontWeight:'900',color:T.muted,letterSpacing:0.6,textTransform:'uppercase'},
 body:{fontSize:14,lineHeight:20,color:T.ink},
 sub:{fontSize:12,lineHeight:17,color:T.muted},
 card:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:T.border},
 row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12},
 rowLine:{borderTopWidth:1,borderTopColor:T.border},
 rowTitle:{fontSize:15,fontWeight:'800',color:T.ink},
 avatar:{width:38,height:38,borderRadius:19,backgroundColor:T.primarySoft,alignItems:'center',justifyContent:'center'},
 avatarText:{fontSize:16,fontWeight:'900',color:T.primary},
 badge:{backgroundColor:T.primarySoft,borderRadius:10,paddingHorizontal:8,paddingVertical:3},
 badgeText:{fontSize:11,fontWeight:'800',color:T.primary},
 input:{borderWidth:1,borderColor:T.border,borderRadius:14,padding:12,fontSize:15,fontWeight:'700',color:T.ink,backgroundColor:'#fff'},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:54,paddingVertical:15,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},
 ctaText:{color:'#fff',fontSize:17,fontWeight:'900'},
 ghost:{borderRadius:26,minHeight:54,paddingVertical:15,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff'},
 ghostText:{fontSize:17,fontWeight:'800',color:T.ink},
 timer:{fontSize:52,fontWeight:'900',color:T.ink,fontVariant:['tabular-nums']},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},
 chip:{borderRadius:18,paddingHorizontal:14,paddingVertical:9,backgroundColor:T.primarySoft},
 chipOn:{backgroundColor:T.primary},
 chipText:{fontSize:14,fontWeight:'800',color:T.primary},
 step:{flexDirection:'row',alignItems:'center',gap:10},
 setupStatus:{gap:12,backgroundColor:'#fff',borderRadius:16,padding:12,borderWidth:1,borderColor:T.border},
 durationRow:{flexDirection:'row',gap:7,justifyContent:'space-between'},
 durationPreset:{flex:1,alignItems:'center',borderRadius:16,paddingVertical:10,backgroundColor:T.primarySoft,gap:1},
 durationText:{fontSize:15,fontWeight:'900',color:T.primary},
 durationUnit:{fontSize:10,fontWeight:'700',color:T.primary},
 customRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:16,minHeight:52,paddingHorizontal:16,backgroundColor:T.primarySoft},
 customText:{fontSize:16,fontWeight:'900',color:T.primary},
 wheelLabel:{fontSize:13,fontWeight:'700',color:T.muted,textAlign:'center'},
 wheelOn:{fontSize:20,fontWeight:'900',color:T.ink},
 wheelOff:{fontSize:16,fontWeight:'500',color:'#9AA7A0'},
 durationSheet:{backgroundColor:T.surface,borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:20,paddingTop:16,paddingBottom:38,gap:16,borderWidth:1,borderColor:T.border},

 small:{borderRadius:14,paddingHorizontal:16,paddingVertical:10,minHeight:44,justifyContent:'center',backgroundColor:T.primarySoft,alignItems:'center'},
 smallText:{fontSize:13,fontWeight:'800',color:T.primary},
 note:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:T.primarySoft,borderRadius:16,padding:12},
 link:{color:T.primary,fontWeight:'800',fontSize:14},
 linkRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:T.surface,borderRadius:18,padding:16,borderWidth:1,borderColor:T.border},
 segment:{flexDirection:'row',backgroundColor:T.surface,borderRadius:18,padding:4,borderWidth:1,borderColor:T.border},
 segBtn:{flex:1,alignItems:'center',paddingVertical:9,borderRadius:14},
 segOn:{backgroundColor:T.primary},
 segText:{fontSize:14,fontWeight:'800',color:T.ink},
 dateRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 arrow:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:T.primary+'22'},
 dateText:{fontSize:16,fontWeight:'800',color:T.primary},
 dateChip:{width:42,alignItems:'center',paddingVertical:7,borderRadius:13,backgroundColor:T.background,gap:2},
 calTitle:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:4},
 calStrip:{flexDirection:'row',gap:6},
 calItem:{flex:1,alignItems:'center',gap:2,paddingVertical:8,borderRadius:14,backgroundColor:T.surface,borderWidth:1,borderColor:T.border},
 calNum:{fontSize:15,fontWeight:'900',color:T.ink},
 calDay:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},
 addBtn:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:T.primary,paddingHorizontal:18,minHeight:44,borderRadius:22},
 addBtnText:{color:'#fff',fontWeight:'900',fontSize:15},
 replaceNote:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FDF3E1',borderRadius:16,padding:14},
 sheet:{backgroundColor:'#fff',borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,paddingBottom:40,gap:14},
 sheetTitle:{fontSize:22,fontWeight:'900',color:T.ink},
 codeInput:{borderWidth:1.5,borderColor:T.border,borderRadius:18,minHeight:64,fontSize:30,fontWeight:'900',letterSpacing:10,textAlign:'center',color:T.ink,backgroundColor:'#fff'},
 editBtn:{minHeight:44,paddingHorizontal:18,borderRadius:22,justifyContent:'center',backgroundColor:T.primarySoft},
 editBtnText:{color:T.primary,fontWeight:'900',fontSize:15},
 setupDone:{flexDirection:'row',alignItems:'center',gap:10,minHeight:52,paddingHorizontal:14,borderRadius:16,backgroundColor:T.primarySoft},
 option:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:14,borderRadius:16,borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff'},
 navRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 navBtn:{width:36,height:36,borderRadius:18,backgroundColor:T.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:T.border},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
 stat:{flexBasis:'47%',flexGrow:1,backgroundColor:T.surface,borderRadius:18,padding:14,gap:3,borderWidth:1,borderColor:T.border},
 statLabel:{fontSize:12,fontWeight:'800',color:T.muted},
 statValue:{fontSize:24,fontWeight:'900',color:T.ink},
 chart:{flexDirection:'row',alignItems:'flex-end',gap:2},
 axis:{fontSize:9,fontWeight:'700',color:T.muted},
});
