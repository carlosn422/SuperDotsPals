import React,{useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ChartScrubContext} from './StressDashboard';
import {ActivityIndicator,Alert,AppState,Modal,PanResponder,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Svg,{Circle,Defs,Line,LinearGradient,Path,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import SuperdotMascot from './SuperdotMascot';
import {usePlus} from './PlusStore';
import {useIsGuest} from './Account';
import {ManageFamilyProfile,familyProfilesChanged,shortProfileName,useFamilyProfiles} from './FamilyWatches';
import {WatchColorGrid,WatchImage,isWatchColor,type WatchColor} from './WatchArt';
import {ScreenTimeReport,ackBreakSync,getBreakState,onBreakState,pendingBreakSync,pickBreakApps,requestScreenTimeAccess,screenBreakSupported,sendBreakCommand,setBreakChildren,setBreakEntitlement,type BreakAction,type BreakSession,type BreakState,type BreakSyncRow} from './modules/watch-link/screenBreak';
import {configureSocialTrack,getSocialState} from './modules/watch-link/socialTrack';
import {comparison,formatDuration,observations,periodRange,periodStats,sessionInterval,type BreakPeriod,type Bucket,type SessionRow} from './ScreenBreakInsights';

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
 if(children)setBreakChildren(children.map(c=>({id:c.id,name:c.name})));
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
// Tap red: a manual lock unlocks; an ended timer opens that member so the parent can act.
function HeaderLock({onOpen}:{onOpen:(childId:string)=>void}){
 const [state,setState]=useBreakState();
 const [busy,setBusy]=useState(false);
 const now=useNow(state?.session?.status==='active');
 if(!state?.authorized)return null;
 const s=state.session;
 const ended=s&&(s.status==='restricted'||(s.status==='active'&&s.deadline*1000<=now))?s:undefined;
 const locked=!!ended||!!state.manualLock;
 function tap(){
  if(ended){onOpen(ended.childId);return}
  setBusy(true);
  const reply=sendBreakCommand('unlock');
  setBusy(false);
  if(reply.state)setState(reply.state);
  if(!reply.ok)Alert.alert('Unable to unlock',reply.error||'Please try again.');
 }
 const icon=<Ionicons name={locked?'lock-closed':'lock-open'} size={22} color={locked?red:T.primary}/>;
 return locked?<TouchableOpacity accessibilityRole="button" accessibilityLabel={ended?`Apps locked: ${ended.childName}'s time is up. Open ${ended.childName}`:'Apps locked. Unlock'} disabled={busy} onPress={tap} hitSlop={12} style={[st.headerLock,{backgroundColor:'#FBE7EC'}]}>{busy?<ActivityIndicator color={red}/>:icon}</TouchableOpacity>
  :<View accessible accessibilityLabel="Apps unlocked" style={[st.headerLock,{backgroundColor:T.primarySoft}]}>{icon}</View>;
}

// ---------- Screens ----------

type Route={name:'list'}|{name:'child';id:string}|{name:'insights';id:string};

export default function FamilyScreenBreak({onBack,backLabel='Settings',target,onAddWatch,embedded,footer}:{onBack?:()=>void;backLabel?:string;target?:{childId?:string;profileId?:string;add?:boolean;at:number}|null;onAddWatch?:()=>void;embedded?:boolean;footer?:React.ReactNode}){
 const guest=useIsGuest();
 const [children,setChildren]=useState<FamilyChild[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [route,setRoute]=useState<Route>({name:'list'}),[adding,setAdding]=useState(false);
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
  if(child)setRoute({name:'child',id:child.id});
 },[target,loading,children]);
 const child=route.name!=='list'?children.find(c=>c.id===route.id):undefined;
 const members=children.filter(c=>!c.watch_only);
 if(route.name==='insights'&&child)return <InsightsScreen child={child} onBack={()=>setRoute({name:'child',id:child.id})}/>;
 if(route.name==='child'&&child)return <ChildScreen child={child} children={children} onBack={()=>setRoute({name:'list'})} onInsights={()=>setRoute({name:'insights',id:child.id})} onChanged={()=>{void load();familyChildrenChanged()}} onRemoved={()=>{setRoute({name:'list'});void load()}} onAddWatch={onAddWatch} onOpen={id=>setRoute({name:'child',id})}/>;
 return <View style={{gap:14}}>
  {!embedded&&onBack?<Back label={backLabel} onPress={onBack}/>:null}
  <View style={[st.row,{paddingVertical:0}]}><Text style={st.title} accessibilityRole="header">Family</Text>{screenBreakSupported&&!guest?<HeaderLock onOpen={id=>setRoute({name:'child',id})}/>:null}</View>
  <Text style={st.sub}>Lend your iPhone with a Screen Break timer you control from MoodPals or your Apple Watch. Members don't need an account or a watch.</Text>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <Text style={st.heading}>Members</Text>
   {guest?null:<TouchableOpacity accessibilityRole="button" accessibilityLabel={adding?'Close add member':'Add member'} onPress={()=>setAdding(a=>!a)} style={st.addBtn}><Ionicons name={adding?'close':'add'} size={18} color="#fff"/><Text style={st.addBtnText}>{adding?'Close':'Add member'}</Text></TouchableOpacity>}
  </View>
  {guest?<View style={st.card}><Text style={st.body}>Create a free account to add family members and use Screen Break.</Text></View>:<>
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {loading?<ActivityIndicator color={T.primary}/>:null}
   {adding||(!loading&&!error&&!members.length)?<AddChild onAdded={id=>{setAdding(false);void load().then(()=>{if(id)setRoute({name:'child',id})});familyChildrenChanged()}}/>:null}
   {members.length?<View style={[st.card,{paddingVertical:4,gap:0}]}>
    {members.map((c,i)=><TouchableOpacity key={c.id} accessibilityRole="button" accessibilityLabel={'Open '+c.name} onPress={()=>setRoute({name:'child',id:c.id})} style={[st.row,i>0&&st.rowLine]}>
     <View style={st.avatar}><Text style={st.avatarText}>{c.name.slice(0,1).toUpperCase()}</Text></View>
     <View style={{flex:1}}><Text style={st.rowTitle}>{c.name}</Text><Text style={st.sub}>{c.profile_user_id?'Watch assigned':'No watch assigned'}</Text></View>
     <ActiveBadge childId={c.id}/>
     <Ionicons name="chevron-forward" size={18} color={T.muted}/>
    </TouchableOpacity>)}
   </View>:null}
  </>}
  {footer?<View style={{marginTop:10}}>{footer}</View>:null}
 </View>;
}

function ActiveBadge({childId}:{childId:string}){
 const [state]=useBreakState();
 const s=state?.session;
 const now=useNow(!!s&&s.childId===childId&&s.status==='active');
 if(!s||s.childId!==childId||(s.status!=='active'&&s.status!=='restricted'))return null;
 const left=Math.max(1,Math.ceil((s.deadline*1000-now)/60000));
 return <View style={st.badge}><Text style={st.badgeText}>{s.status==='active'?left+' min left':'Break on'}</Text></View>;
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

function ChildScreen({child,children,onBack,onInsights,onChanged,onRemoved,onAddWatch,onOpen}:{child:FamilyChild;children:FamilyChild[];onBack:()=>void;onInsights:()=>void;onChanged:()=>void;onRemoved:()=>void;onAddWatch?:()=>void;onOpen?:(id:string)=>void}){
 const [state,setState]=useBreakState();
 const {isPlus,showPaywall}=usePlus();
 const [editing,setEditing]=useState(false);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[minutes,setMinutes]=useState(30),[adding,setAdding]=useState(false),[extra,setExtra]=useState(15);
 useEffect(()=>{void AsyncStorage.getItem(LAST_MINUTES_KEY).then(v=>{const n=Number(v);if(n>=5&&n<=180)setMinutes(Math.round(n/5)*5)})},[]);
 const session=state?.session;
 // A session whose member record was replaced (same name, old id) is still controllable from that member.
 const orphan=!!session&&!children.some(c=>c.id===session.childId)&&session.childName===child.name;
 const mine=session&&(session.childId===child.id||orphan)&&(session.status==='active'||session.status==='restricted')?session:null;
 const other=session&&session.childId!==child.id&&!orphan&&session.status==='active'?session:null;
 const now=useNow((!!mine&&mine.status==='active')||!!other);
 const lock=useRef(false);
 const refresh=()=>setState(getBreakState());
 useEffect(()=>{void syncScreenBreak(isPlus).then(refresh)},[child.id]);

 function run(action:BreakAction,extra:{minutes?:number}={}){
  if(lock.current)return;
  lock.current=true;setBusy(action);setError('');
  try{
   const reply=sendBreakCommand(action,{childId:child.id,minutes:extra.minutes,session:action==='start'?undefined:mine||undefined});
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
  <Back label="Family" onPress={onBack}/>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   <View style={[st.avatar,{width:52,height:52,borderRadius:26}]}><Text style={[st.avatarText,{fontSize:22}]}>{child.name.slice(0,1).toUpperCase()}</Text></View>
   <Text style={[st.title,{flex:1}]} numberOfLines={1}>{child.name}</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={editing?'Done editing':'Edit '+child.name} onPress={()=>setEditing(e=>!e)} style={st.editBtn}><Text style={st.editBtnText}>{editing?'Done':'Edit'}</Text></TouchableOpacity>
  </View>
  {editing?<ChildManage section="edit" child={child} children={children} onChanged={()=>{setEditing(false);onChanged()}} onRemoved={onRemoved} onAddWatch={onAddWatch} locked={!!mine}/>:null}
  {!screenBreakSupported?<View style={st.card}><Text style={st.body}>Screen Break needs the latest MoodPals build on this iPhone.</Text></View>:<>
   {state&&!state.hasPlus&&!isPlus?<PlanNote state={state} daysLeft={trialDaysLeft} onUpgrade={()=>showPaywall('screenBreak')}/>:null}
   {mine?.status==='active'?<View style={[st.card,{alignItems:'center'}]}>
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
    <View style={{flexDirection:'row',gap:10,alignSelf:'stretch',marginTop:6}}>
     <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>run('endNow')} style={[st.cta,{flex:1,backgroundColor:'#F4A570'}]}><Text style={st.ctaText}>End Now</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>Alert.alert('Cancel Screen Break?','This stops the timer and keeps apps open.',[{text:'Keep'},{text:'Cancel Session',style:'destructive',onPress:()=>run('cancel')}])} style={[st.ghost,{flex:1}]}><Text style={[st.ghostText,{color:red}]}>Cancel</Text></TouchableOpacity>
    </View>
   </View>:mine?.status==='restricted'?<View style={[st.card,{alignItems:'center'}]}>
    <SuperdotMascot id="joy" size={130}/>
    <Text style={[st.title,{fontSize:22,textAlign:'center'}]}>Time for a break!</Text>
    <Text style={[st.body,{textAlign:'center'}]}>Great job! Let's take a little break from the screen.</Text>
    <Text style={st.sub}>Break on since {clock(mine.endedAt||mine.deadline)}. Paused apps show the Joy break screen.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>run('release')} style={[st.cta,{alignSelf:'stretch'}]}><Text style={st.ctaText}>Release Break</Text></TouchableOpacity>
   </View>:<View style={st.card}>
    <Text style={st.heading}>Screen Break</Text>
    {other?<View style={[st.setupDone,{flexDirection:'column',alignItems:'stretch',gap:10,paddingVertical:14}]}>
     <Text style={[st.body,{textAlign:'center'}]}>A timer is running for {other.childName} · {Math.max(1,Math.ceil((other.deadline*1000-now)/60000))} min left</Text>
     {children.some(c=>c.id===other.childId)&&onOpen?<TouchableOpacity accessibilityRole="button" onPress={()=>onOpen(other.childId)} style={st.cta}><Text style={st.ctaText}>Go to {other.childName}</Text></TouchableOpacity>:null}
    </View>:null}
    {!state?.authorized?<View style={{gap:10}}>
     <Text style={st.kicker}>Step 1 of 2</Text>
     <Text style={st.rowTitle}>Allow Screen Time access</Text>
     <Text style={st.sub}>Lets MoodPals pause the apps you choose when time is up.</Text>
     <TouchableOpacity accessibilityRole="button" disabled={busy==='auth'} onPress={()=>void authorize()} style={st.cta}>{busy==='auth'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Allow Screen Time Access</Text>}</TouchableOpacity>
    </View>:!(state?.selectionCount||0)?<View style={{gap:10}}>
     <Text style={st.kicker}>Step 2 of 2</Text>
     <Text style={st.rowTitle}>Choose apps to pause</Text>
     <Text style={st.sub}>Pick the apps, categories or websites to pause when time is up.</Text>
     <TouchableOpacity accessibilityRole="button" disabled={busy==='pick'} onPress={()=>void pick()} style={st.cta}>{busy==='pick'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Choose Apps to Pause</Text>}</TouchableOpacity>
    </View>:<TouchableOpacity accessibilityRole="button" accessibilityLabel={'Setup complete, '+state.selectionCount+' selected. Edit apps'} onPress={()=>void pick()} style={st.setupDone}>
     <Ionicons name="checkmark-circle" size={22} color={T.primary}/>
     <Text style={[st.body,{flex:1}]}>Setup complete · {state.selectionCount} to pause</Text>
     <Text style={st.link}>Edit apps</Text>
    </TouchableOpacity>}
    {ready&&!other?<>
    <Text style={[st.rowTitle,{marginTop:8,textAlign:'center'}]}>How long can {child.name} use the phone?</Text>
    <DurationRing minutes={minutes} onChange={setMinutes} min={5} max={180}/>
    <TouchableOpacity accessibilityRole="button" disabled={!ready||!validMinutes||!!busy||!!other} onPress={()=>{void AsyncStorage.setItem(LAST_MINUTES_KEY,String(chosen));run('start',{minutes:chosen})}} style={[st.cta,(!ready||!validMinutes||!!busy||!!other)&&{opacity:0.5}]}><Text style={st.ctaText}>Start</Text></TouchableOpacity>
    <Text style={[st.sub,{textAlign:'center'}]}>Your Apple Watch reminds you 5 minutes before and lets you manage it.</Text>
    </>:null}
    {state?.entitlementKnown&&!state.allowed&&!state.hasPlus&&!isPlus&&!other?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Free trial ended. See MoodPals Plus" onPress={()=>showPaywall('screenBreak')} style={st.gate}>
     <View style={st.gatePill}><Ionicons name="lock-closed" size={16} color="#fff"/><Text style={st.ctaText}>Get MoodPals Plus</Text></View>
    </TouchableOpacity>:null}
   </View>}
   {busy&&busy!=='auth'&&busy!=='pick'?<ActivityIndicator color={T.primary}/>:null}
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {state&&!state.authorized&&mine?<Text style={[st.sub,{color:red}]}>Screen Time access was turned off, so apps can't be paused. Allow access again to restore the break.</Text>:null}
  </>}
  <TouchableOpacity accessibilityRole="button" onPress={onInsights} style={st.linkRow}><Ionicons name="bar-chart-outline" size={20} color={T.primary}/><Text style={[st.rowTitle,{flex:1}]}>Screen Time Insights</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></TouchableOpacity>
  <ChildManage section="watch" child={child} children={children} onChanged={onChanged} onRemoved={onRemoved} onAddWatch={onAddWatch} locked={!!mine}/>
 </View>;
}

// Circular duration dial, same as the Apple Watch: drag around the ring in 5-minute steps.
function DurationRing({minutes,onChange,min,max,step=5,prefix=''}:{minutes:number;onChange:(n:number)=>void;min:number;max:number;step?:number;prefix?:string}){
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
 return <View style={{width:SIZE,height:SIZE,alignSelf:'center',marginVertical:6}} {...pan.panHandlers}
  accessible accessibilityRole="adjustable" accessibilityLabel="Duration" accessibilityValue={{text:prefix+formatDuration(minutes*60)}}
  accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>set(minutes+(e.nativeEvent.actionName==='increment'?step:-step))}>
  <Svg width={SIZE} height={SIZE} pointerEvents="none">
   <Circle cx={C} cy={C} r={R} stroke={T.primarySoft} strokeWidth={LINE} fill="none"/>
   <Circle cx={C} cy={C} r={R} stroke={T.primary} strokeWidth={LINE} fill="none" strokeLinecap="round" strokeDasharray={CIRC+' '+CIRC} strokeDashoffset={CIRC*(1-Math.max(0.002,frac))} transform={'rotate(-90 '+C+' '+C+')'}/>
   <Circle cx={kx} cy={ky} r={KNOB} fill="#fff" stroke={T.primary} strokeWidth={3}/>
  </Svg>
  <View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}>
   <Text style={{fontSize:52,fontWeight:'900',color:T.ink}}>{prefix}{minutes}</Text>
   <Text style={st.sub}>{h?h+' hr'+(m?' '+m+' min':''):'min'}</Text>
  </View>
 </View>;
}

function PlanNote({state,daysLeft,onUpgrade}:{state:BreakState;daysLeft:number|null;onUpgrade:()=>void}){
 if(!state.entitlementKnown)return null;
 const text=state.trialAvailable?'14 days free: your trial starts with the first Screen Break or when you turn on Screen Time & Stress.':state.allowed?'Free trial: '+daysLeft+' day'+(daysLeft===1?'':'s')+' left.':'Your 14-day free trial has ended. Your history stays here, and you can always end or release a break.';
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

function ChildManage({child,children,onChanged,onRemoved,onAddWatch,locked,section}:{child:FamilyChild;children:FamilyChild[];onChanged:()=>void;onRemoved:()=>void;onAddWatch?:()=>void;locked:boolean;section:'edit'|'watch'}){
 const [draft,setDraft]=useState(child.name),[linking,setLinking]=useState(false),[error,setError]=useState('');
 // Family watches added with the watch code flow that aren't assigned to another member yet.
 const watches=children.filter(c=>c.watch_only&&c.profile_user_id);
 async function save(){
  const name=draft.replace(/\s+/g,' ').trim();
  if(!name)return;
  const {error:e}=await supabase.from('family_children').update({name,updated_at:new Date().toISOString()}).eq('id',child.id);
  if(e){setError('Unable to save the name.');return}
  onChanged();
 }
 async function link(profile:string){
  const {error:e}=await supabase.rpc('family_link_child_watch',{p_child:child.id,p_profile:profile});
  if(e){setError(e.code==='P0001'?e.message:'Unable to assign the watch.');return}
  setLinking(false);onChanged();
 }
 function remove(){
  Alert.alert('Remove '+child.name+'?','Their Screen Break history is deleted too.',[{text:'Keep'},{text:'Remove',style:'destructive',onPress:async()=>{
   const {error:e}=await supabase.from('family_children').delete().eq('id',child.id);
   if(e)setError('Unable to remove.');else onRemoved();
  }}]);
 }
 if(section==='edit')return <View style={[st.card,{gap:12}]}>
  <Text style={st.heading}>Edit member</Text>
  {child.profile_user_id?<Text style={st.sub}>The name follows the assigned watch. Rename it under Watches on the Family screen.</Text>:<>
   <TextInput value={draft} onChangeText={setDraft} maxLength={40} autoCapitalize="words" style={st.input} accessibilityLabel="Member's name" onSubmitEditing={()=>void save()}/>
   <TouchableOpacity accessibilityRole="button" disabled={!draft.trim()||draft.trim()===child.name} onPress={()=>void save()} style={[st.cta,(!draft.trim()||draft.trim()===child.name)&&{opacity:0.5}]}><Text style={st.ctaText}>Save Name</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" disabled={locked} onPress={remove} style={[st.ghost,locked&&{opacity:0.5}]}><Text style={[st.ghostText,{color:red}]}>Remove Member</Text></TouchableOpacity>
   {locked?<Text style={[st.sub,{textAlign:'center'}]}>End the Screen Break before removing {child.name}.</Text>:null}
  </>}
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
 </View>;
 return <MemberWatch child={child} spare={watches} onChanged={onChanged} link={link} error={error}/>;
}

// Watch card for one member, used on Today; loads the member by id, or by the family watch profile id.
export function MemberWatchCard({childId,profileId}:{childId?:string;profileId?:string}){
 const [children,setChildren]=useState<FamilyChild[]>([]);
 const load=useCallback(()=>{void loadChildren().then(setChildren).catch(()=>{})},[]);
 useEffect(()=>{load();listeners.add(load);return()=>{listeners.delete(load)}},[load]);
 const child=children.find(c=>!c.watch_only&&(childId?c.id===childId:c.profile_user_id===profileId));
 if(!child)return null;
 const spare=children.filter(c=>c.watch_only&&c.profile_user_id);
 return <MemberWatch child={child} spare={spare} onChanged={familyChildrenChanged} link={async()=>{}} error=""/>;
}

function MemberWatch({child,spare,onChanged,link,error}:{child:FamilyChild;spare:FamilyChild[];onChanged:()=>void;link:(profile:string)=>Promise<void>;error:string}){
 const {profiles,load}=useFamilyProfiles(!!child.profile_user_id);
 const [sheet,setSheet]=useState(false),[managing,setManaging]=useState(false),[unassigning,setUnassigning]=useState(false),[unError,setUnError]=useState('');
 function unassign(){
  Alert.alert('Unassign this watch?',child.name+' stays in Family. The watch keeps working and can be assigned to another member.',[{text:'Keep'},{text:'Unassign',style:'destructive',onPress:async()=>{
   setUnassigning(true);setUnError('');
   const {error:e}=await supabase.rpc('family_unassign_child_watch',{p_child:child.id});
   setUnassigning(false);
   if(e)setUnError('Unable to unassign the watch. Try again.');else{familyProfilesChanged();onChanged()}
  }}]);
 }
 const watch=child.profile_user_id?profiles.find(p=>p.id===child.profile_user_id):undefined;
 const color=watch&&isWatchColor(watch.watchColor)?watch.watchColor:null;
 return <View style={[st.card,{gap:12}]}>
  {child.profile_user_id?<>
   <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
    <WatchImage color={color} name={shortProfileName(child.name)} width={64}/>
    <View style={{flex:1,gap:2}}><Text style={st.rowTitle}>{child.name}'s Apple Watch</Text><Text style={st.sub}>Mood-only watch{watch?(watch.connected?' · Linked':' · Not linked'):''}</Text></View>
   </View>
   <TouchableOpacity accessibilityRole="button" disabled={!watch} onPress={()=>setManaging(true)} style={[st.ghost,!watch&&{opacity:0.5}]}><Text style={st.ghostText}>Manage Watch</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" disabled={unassigning} onPress={unassign} style={{alignItems:'center',justifyContent:'center',minHeight:44}}>{unassigning?<ActivityIndicator color={T.primary}/>:<Text style={[st.link,{color:red}]}>Unassign Watch</Text>}</TouchableOpacity>
   {unError?<Text style={[st.sub,{color:red}]}>{unError}</Text>:null}
   {managing&&watch?<ManageFamilyProfile profile={watch} onClose={()=>{setManaging(false);void load()}} onDeleted={async()=>{setManaging(false);familyProfilesChanged();onChanged()}}/>:null}
  </>:<>
   <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
    <Ionicons name="watch-outline" size={26} color={T.primary}/>
    <View style={{flex:1}}><Text style={st.rowTitle}>Apple Watch</Text><Text style={st.sub}>Optional. {child.name} can pick moods from their own watch.</Text></View>
   </View>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setSheet(true)} style={st.ghost}><Text style={st.ghostText}>Assign a Watch</Text></TouchableOpacity>
   <AssignWatchSheet visible={sheet} child={child} spare={spare} link={link} onClose={()=>setSheet(false)} onAssigned={()=>{familyProfilesChanged();onChanged()}}/>
  </>}
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
 </View>;
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
  void supabase.from('screen_break_sessions').select('id,child_id,started_at,deadline_at,ended_at,granted_seconds,status,version')
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
 const stats=useMemo(()=>periodStats(all,period,anchor,new Date(now)),[all,period,anchor,Math.floor(now/60000)]);
 const compare=comparison(stats);
 const notes=observations(stats,period);
 const windows=useMemo(()=>all.map(s=>sessionInterval(s)).filter((w):w is [number,number]=>!!w&&w[1]>range.start.getTime()&&w[0]<range.end.getTime()).map(([a,b])=>[a/1000,b/1000] as [number,number]),[all,range.start.getTime()]);
 const startOfTimes=periodRange(period,new Date()).start;
 return <View style={{gap:14}}>
  <Back label={child.name} onPress={onBack}/>
  <Text style={st.title}>Screen Time Insights</Text>
  <View style={st.segment}>{PERIODS.map(p=><TouchableOpacity key={p.key} accessibilityRole="tab" accessibilityState={{selected:period===p.key}} onPress={()=>{setPeriod(p.key);setAnchor(new Date())}} style={[st.segBtn,period===p.key&&st.segOn]}><Text style={[st.segText,period===p.key&&{color:'#fff'}]}>{p.label}</Text></TouchableOpacity>)}</View>
  <PeriodPicker period={period} anchor={anchor} onPick={setAnchor}/>
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
  {loading?<ActivityIndicator color={T.primary}/>:null}
  {allowed&&ScreenTimeReport&&state?.authorized?<View style={[st.card,{height:period==='day'?330:310,padding:0,overflow:'hidden'}]}>
   {/* Shown until Apple's report draws over it; the report never draws in the Simulator or without Screen Time data. */}
   <View style={{padding:16,gap:6}} accessibilityElementsHidden>
    <Text style={st.kicker}>Total Screen Usage</Text>
    <Text style={st.body}>Loading Apple Screen Time…</Text>
    <Text style={st.sub}>Apple's device usage for this iPhone appears here. It isn't available in the Simulator or before iOS has recorded Screen Time on this iPhone.</Text>
   </View>
   <ScreenTimeReport style={StyleSheet.absoluteFill} request={{period,start:range.start.getTime()/1000,end:range.end.getTime()/1000,prevStart:previous.start.getTime()/1000,windows,childName:child.name}}/>
  </View>
   :<View style={st.card}><Text style={st.kicker}>Total Screen Usage</Text><Text style={st.body}>{!allowed?'Apple Screen Time usage is part of Screen Break with MoodPals Plus.':ScreenTimeReport?'Allow Screen Time access in Screen Break to see the usage Apple reports for this iPhone.':'Apple Screen Time usage needs the latest MoodPals build.'}</Text>
    {!allowed?<TouchableOpacity onPress={()=>showPaywall('screenBreak')}><Text style={st.link}>See MoodPals Plus</Text></TouchableOpacity>:null}</View>}
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
  {allowed&&notes.length?<View style={st.card}>{notes.map(n=><Text key={n} style={st.body}>• {n}</Text>)}</View>:null}
  <Text style={st.sub}>Screen Break Time is the time inside {child.name}'s sessions, from start until the session ended, was canceled or reached its time. Time Granted is what you allowed. Neither is measured phone use. Apple's Total Screen Usage is device activity on this iPhone for anyone using it.</Text>
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

const st=StyleSheet.create({
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
