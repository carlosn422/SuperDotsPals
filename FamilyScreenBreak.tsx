import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Modal,PanResponder,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Svg,{Circle,Defs,Line,LinearGradient,Path,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import SuperdotMascot from './SuperdotMascot';
import {usePlus} from './PlusStore';
import {useIsGuest} from './Account';
import {ScreenTimeReport,ackBreakSync,getBreakState,onBreakState,pendingBreakSync,pickBreakApps,requestScreenTimeAccess,screenBreakSupported,sendBreakCommand,setBreakChildren,setBreakEntitlement,type BreakAction,type BreakSession,type BreakState,type BreakSyncRow} from './modules/watch-link/screenBreak';
import {comparison,formatDuration,observations,periodRange,periodStats,sessionInterval,type BreakPeriod,type Bucket,type SessionRow} from './ScreenBreakInsights';

export type FamilyChild={id:string;name:string;profile_user_id:string|null};
type Entitlement={has_plus:boolean;trial_started_at:string|null;trial_ends_at:string|null;trial_available:boolean;allowed:boolean};
const DURATIONS=[15,30,45,60];
const red='#D65B79';

// ---------- Sync: children, sessions and the trial (runs whenever MoodPals is open) ----------

const listeners=new Set<()=>void>();
export function familyChildrenChanged(){listeners.forEach(l=>l())}

async function loadChildren():Promise<FamilyChild[]>{
 const {data,error}=await supabase.from('family_children').select('id,name,profile_user_id').order('created_at');
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
 const e=data as Entitlement;
 setBreakEntitlement({hasPlus:isPlus||e.has_plus,trialAvailable:e.trial_available,trialStartedAt:toSec(e.trial_started_at),trialEndsAt:toSec(e.trial_ends_at)});
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

// ---------- Screens ----------

type Route={name:'list'}|{name:'child';id:string}|{name:'insights';id:string};

export default function FamilyScreenBreak({onBack,backLabel='Settings',target,onAddWatch}:{onBack:()=>void;backLabel?:string;target?:{childId?:string;profileId?:string;at:number}|null;onAddWatch?:()=>void}){
 const guest=useIsGuest();
 const [children,setChildren]=useState<FamilyChild[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [route,setRoute]=useState<Route>({name:'list'});
 const load=useCallback(async()=>{
  try{const list=await loadChildren();setChildren(list);setError('');if(screenBreakSupported)setBreakChildren(list.map(c=>({id:c.id,name:c.name})))}
  catch{setError('Unable to load your children. Check your connection.')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{if(guest){setLoading(false);return}void load();listeners.add(load);return()=>{listeners.delete(load)}},[load,guest]);
 useEffect(()=>{
  if(!target||loading)return;
  const child=children.find(c=>c.id===target.childId||(!!target.profileId&&c.profile_user_id===target.profileId));
  if(child)setRoute({name:'child',id:child.id});
 },[target,loading,children]);
 const child=route.name!=='list'?children.find(c=>c.id===route.id):undefined;
 if(route.name==='insights'&&child)return <InsightsScreen child={child} onBack={()=>setRoute({name:'child',id:child.id})}/>;
 if(route.name==='child'&&child)return <ChildScreen child={child} children={children} onBack={()=>setRoute({name:'list'})} onInsights={()=>setRoute({name:'insights',id:child.id})} onChanged={()=>{void load();familyChildrenChanged()}} onRemoved={()=>{setRoute({name:'list'});void load()}} onAddWatch={onAddWatch}/>;
 return <View style={{gap:14}}>
  <Back label={backLabel} onPress={onBack}/>
  <Text style={st.title}>Family</Text>
  <Text style={st.sub}>Lend your iPhone with a Screen Break timer you control from MoodPals or your Apple Watch. Children don't need an account, a watch or any health data.</Text>
  {guest?<View style={st.card}><Text style={st.body}>Create a free account to add children and use Screen Break.</Text></View>:<>
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {loading?<ActivityIndicator color={T.primary}/>:null}
   {children.length?<View style={[st.card,{paddingVertical:4,gap:0}]}>
    {children.map((c,i)=><TouchableOpacity key={c.id} accessibilityRole="button" accessibilityLabel={'Open '+c.name} onPress={()=>setRoute({name:'child',id:c.id})} style={[st.row,i>0&&st.rowLine]}>
     <View style={st.avatar}><Text style={st.avatarText}>{c.name.slice(0,1).toUpperCase()}</Text></View>
     <View style={{flex:1}}><Text style={st.rowTitle}>{c.name}</Text><Text style={st.sub}>{c.profile_user_id?'Family watch linked':'No watch needed'}</Text></View>
     <ActiveBadge childId={c.id}/>
     <Ionicons name="chevron-forward" size={18} color={T.muted}/>
    </TouchableOpacity>)}
   </View>:!loading&&!error?<View style={[st.card,{alignItems:'center'}]}><Text style={st.body}>No children yet. Add one to start a Screen Break.</Text></View>:null}
   <AddChild onAdded={()=>{void load();familyChildrenChanged()}}/>
  </>}
 </View>;
}

function ActiveBadge({childId}:{childId:string}){
 const [state]=useBreakState();
 const s=state?.session;
 if(!s||s.childId!==childId||(s.status!=='active'&&s.status!=='restricted'))return null;
 return <View style={st.badge}><Text style={st.badgeText}>{s.status==='active'?'Screen time':'Break on'}</Text></View>;
}

function AddChild({onAdded}:{onAdded:()=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function add(){
  const clean=name.replace(/\s+/g,' ').trim();
  if(!clean||busy)return;
  setBusy(true);setError('');
  const {error:e}=await supabase.rpc('family_add_child',{p_name:clean});
  setBusy(false);
  if(e){setError(e.code==='P0001'?e.message:'Unable to add. Check your connection and try again.');return}
  setName('');onAdded();
 }
 return <View style={st.card}>
  <Text style={st.heading}>Add a child</Text>
  <TextInput value={name} onChangeText={setName} placeholder="Child's name" maxLength={40} autoCapitalize="words" returnKeyType="done" onSubmitEditing={()=>void add()} editable={!busy} style={st.input} accessibilityLabel="Child's name"/>
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
  <TouchableOpacity accessibilityRole="button" disabled={!name.trim()||busy} onPress={()=>void add()} style={[st.cta,(!name.trim()||busy)&&{opacity:0.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Add Child</Text>}</TouchableOpacity>
 </View>;
}

function ChildScreen({child,children,onBack,onInsights,onChanged,onRemoved,onAddWatch}:{child:FamilyChild;children:FamilyChild[];onBack:()=>void;onInsights:()=>void;onChanged:()=>void;onRemoved:()=>void;onAddWatch?:()=>void}){
 const [state,setState]=useBreakState();
 const {isPlus,showPaywall}=usePlus();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[minutes,setMinutes]=useState(30),[useCustom,setUseCustom]=useState(false),[customOpen,setCustomOpen]=useState(false);
 const session=state?.session;
 const mine=session&&session.childId===child.id&&(session.status==='active'||session.status==='restricted')?session:null;
 const other=session&&session.childId!==child.id&&session.status==='active'?session:null;
 const now=useNow(!!mine&&mine.status==='active');
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
  <Text style={st.title}>{child.name}</Text>
  {!screenBreakSupported?<View style={st.card}><Text style={st.body}>Screen Break needs the latest MoodPals build on this iPhone.</Text></View>:<>
   {state&&!state.hasPlus&&!isPlus?<PlanNote state={state} daysLeft={trialDaysLeft} onUpgrade={()=>showPaywall('screenBreak')}/>:null}
   {mine?.status==='active'?<View style={[st.card,{alignItems:'center'}]}>
    <Text style={st.kicker}>Screen time left</Text>
    <Text style={st.timer} accessibilityRole="timer">{countdown(mine.deadline*1000-now)}</Text>
    <Text style={st.sub}>Ends at {clock(mine.deadline)} · {formatDuration(mine.grantedSeconds)} granted</Text>
    <Text style={[st.sub,{marginTop:6}]}>Add time</Text>
    <View style={st.chips}>{(state?.addTimeOptions||[5,10,15,30]).map(m=><Chip key={m} label={'+'+m+' min'} onPress={()=>run('addTime',{minutes:m})} disabled={!!busy}/>)}</View>
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
    {other?<Text style={st.body}>{other.childName}'s Screen Break is running on this iPhone. One session runs at a time.</Text>:null}
    <View style={st.setupStatus}>
     <StatusRow done={!!state?.authorized} title={state?.authorized?'Screen Time Ready':'Screen Time Access Needed'} detail={state?.authorized?'Approved on this iPhone':'Allow Screen Time access to pause selected apps'} action={state?.authorized?undefined:'Allow'} onPress={()=>void authorize()} busy={busy==='auth'}/>
     <View style={{height:1,backgroundColor:T.border,marginLeft:34}}/>
     <StatusRow done={(state?.selectionCount||0)>0} title="Apps to pause" detail={(state?.selectionCount||0)>0?state!.selectionCount+' selected':'Choose apps, categories or websites'} action={(state?.selectionCount||0)>0?'Change':'Choose'} onPress={()=>void pick()} busy={busy==='pick'} disabled={!state?.authorized}/>
    </View>
    <Text style={[st.rowTitle,{marginTop:8}]}>How long can {child.name} use the phone?</Text>
    <View style={st.durationRow}>
     {DURATIONS.map(m=><TouchableOpacity key={m} accessibilityRole="button" accessibilityState={{selected:!useCustom&&minutes===m}} onPress={()=>{setUseCustom(false);setMinutes(m)}} style={[st.durationPreset,!useCustom&&minutes===m&&{backgroundColor:T.primary}]}>
      <Text style={[st.durationText,!useCustom&&minutes===m&&{color:'#fff'}]}>{m}</Text><Text style={[st.durationUnit,!useCustom&&minutes===m&&{color:'#fff'}]}>min</Text>
     </TouchableOpacity>)}
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={useCustom?'Custom time, '+formatDuration(minutes*60)+' selected. Change':'Choose a custom time'} accessibilityState={{selected:useCustom}} onPress={()=>setCustomOpen(true)} style={[st.customRow,useCustom&&{backgroundColor:T.primary}]}>
     <Ionicons name="time-outline" size={20} color={useCustom?'#fff':T.primary}/>
     <Text style={[st.customText,useCustom&&{color:'#fff'}]}>{useCustom?'Custom · '+formatDuration(minutes*60):'Custom time'}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={!ready||!validMinutes||!!busy||!!other} onPress={()=>run('start',{minutes:chosen})} style={[st.cta,(!ready||!validMinutes||!!busy||!!other)&&{opacity:0.5}]}><Text style={st.ctaText}>Start Screen Break</Text></TouchableOpacity>
    <Text style={[st.sub,{textAlign:'center'}]}>Chosen apps pause when time is up. You'll get a reminder 5 minutes before. You can manage the session from your Apple Watch.</Text>
    <CustomDurationSheet visible={customOpen} initialMinutes={minutes} onClose={()=>setCustomOpen(false)} onChoose={m=>{setMinutes(m);setUseCustom(true);setCustomOpen(false)}}/>
   </View>}
   {busy&&busy!=='auth'&&busy!=='pick'?<ActivityIndicator color={T.primary}/>:null}
   {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
   {state&&!state.authorized&&mine?<Text style={[st.sub,{color:red}]}>Screen Time access was turned off, so apps can't be paused. Allow access again to restore the break.</Text>:null}
  </>}
  <TouchableOpacity accessibilityRole="button" onPress={onInsights} style={st.linkRow}><Ionicons name="bar-chart-outline" size={20} color={T.primary}/><Text style={[st.rowTitle,{flex:1}]}>Screen Time Insights</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></TouchableOpacity>
  <ChildManage child={child} children={children} onChanged={onChanged} onRemoved={onRemoved} onAddWatch={onAddWatch} locked={!!mine}/>
 </View>;
}

function PlanNote({state,daysLeft,onUpgrade}:{state:BreakState;daysLeft:number|null;onUpgrade:()=>void}){
 if(!state.entitlementKnown)return null;
 const text=state.trialAvailable?'14 days free: your trial starts with the first Screen Break.':state.allowed?'Screen Break trial: '+daysLeft+' day'+(daysLeft===1?'':'s')+' left.':'Your 14-day Screen Break trial has ended. Your history stays here, and you can always end or release a break.';
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

function CustomDurationSheet({visible,initialMinutes,onClose,onChoose}:{visible:boolean;initialMinutes:number;onClose:()=>void;onChoose:(n:number)=>void}){
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
    <Text style={[st.heading,{textAlign:'center'}]}>Set Custom Duration</Text>
    <View style={{flexDirection:'row',gap:12}}>
     <View style={{flex:1,gap:6}}><Text style={st.wheelLabel}>Hours</Text>{visible?<DurationWheel label="Hours" values={WHEEL_HOURS} value={hours} onChange={setHours} format={n=>n+' hr'}/>:null}</View>
     <View style={{flex:1,gap:6}}><Text style={st.wheelLabel}>Minutes</Text>{visible?<DurationWheel label="Minutes" values={WHEEL_MINUTES} value={mins} onChange={setMins} format={n=>n+' min'}/>:null}</View>
    </View>
    {hours===12&&mins>0?<Text style={[st.sub,{textAlign:'center',color:red}]}>Up to 12 hours.</Text>:null}
    <TouchableOpacity accessibilityRole="button" disabled={!valid} onPress={()=>onChoose(total)} style={[st.cta,!valid&&{opacity:0.5}]}><Text style={st.ctaText}>{valid?'Use '+fmt(hours,mins):'Choose a time'}</Text></TouchableOpacity>
   </View>
  </View>
 </Modal>;
}

function Chip({label,on,onPress,disabled}:{label:string;on?:boolean;onPress:()=>void;disabled?:boolean}){
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:!!on}} disabled={disabled} onPress={onPress} style={[st.chip,on&&st.chipOn,disabled&&{opacity:0.5}]}><Text style={[st.chipText,on&&{color:'#fff'}]}>{label}</Text></TouchableOpacity>;
}

function ChildManage({child,children,onChanged,onRemoved,onAddWatch,locked}:{child:FamilyChild;children:FamilyChild[];onChanged:()=>void;onRemoved:()=>void;onAddWatch?:()=>void;locked:boolean}){
 const [renaming,setRenaming]=useState(false),[draft,setDraft]=useState(child.name),[linking,setLinking]=useState(false),[error,setError]=useState('');
 // Family watches linked through the watch code flow, not yet merged with this child.
 const watches=children.filter(c=>c.id!==child.id&&c.profile_user_id);
 async function save(){
  const name=draft.replace(/\s+/g,' ').trim();
  if(!name)return;
  const {error:e}=await supabase.from('family_children').update({name,updated_at:new Date().toISOString()}).eq('id',child.id);
  if(e){setError('Unable to save the name.');return}
  setRenaming(false);onChanged();
 }
 async function link(profile:string){
  const {error:e}=await supabase.rpc('family_link_child_watch',{p_child:child.id,p_profile:profile});
  if(e){setError(e.code==='P0001'?e.message:'Unable to link the watch.');return}
  setLinking(false);onChanged();
 }
 function remove(){
  Alert.alert('Remove '+child.name+'?','Their Screen Break history is deleted too.',[{text:'Keep'},{text:'Remove',style:'destructive',onPress:async()=>{
   const {error:e}=await supabase.from('family_children').delete().eq('id',child.id);
   if(e)setError('Unable to remove.');else onRemoved();
  }}]);
 }
 return <View style={[st.card,{gap:10}]}>
  {renaming?<>
   <TextInput value={draft} onChangeText={setDraft} maxLength={40} autoFocus autoCapitalize="words" style={st.input} accessibilityLabel="Child's name" onSubmitEditing={()=>void save()}/>
   <View style={{flexDirection:'row',gap:10}}><TouchableOpacity onPress={()=>void save()} style={[st.cta,{flex:1}]}><Text style={st.ctaText}>Save</Text></TouchableOpacity><TouchableOpacity onPress={()=>setRenaming(false)} style={[st.ghost,{flex:1}]}><Text style={st.ghostText}>Cancel</Text></TouchableOpacity></View>
  </>:child.profile_user_id?<Text style={st.sub}>Name follows the linked family watch. Rename or remove it in Watches.</Text>:<TouchableOpacity onPress={()=>{setDraft(child.name);setRenaming(true)}}><Text style={st.link}>Rename</Text></TouchableOpacity>}
  {!child.profile_user_id?<>
   {linking?<View style={{gap:6}}>
    <Text style={st.sub}>Link one of your family watches to {child.name}. Their history is combined.</Text>
    {watches.map(w=><TouchableOpacity key={w.id} onPress={()=>void link(w.profile_user_id!)} style={st.small}><Text style={st.smallText}>{w.name}</Text></TouchableOpacity>)}
    {onAddWatch?<TouchableOpacity onPress={onAddWatch}><Text style={st.link}>Add a family watch first</Text></TouchableOpacity>:null}
   </View>:<TouchableOpacity onPress={()=>setLinking(true)}><Text style={st.link}>Link an Apple Watch</Text></TouchableOpacity>}
   <TouchableOpacity disabled={locked} onPress={remove}><Text style={[st.link,{color:red},locked&&{opacity:0.5}]}>Remove child</Text></TouchableOpacity>
  </>:null}
  {error?<Text style={[st.sub,{color:red}]}>{error}</Text>:null}
 </View>;
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
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:()=>true,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:e=>pick(e.nativeEvent.locationX),
  onPanResponderMove:e=>pick(e.nativeEvent.locationX),
 }),[width,n]);
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

// Calendar strip like the app's other date screens: tap a day, week, month or year; the title opens a month grid.
function PeriodPicker({period,anchor,onPick}:{period:BreakPeriod;anchor:Date;onPick:(d:Date)=>void}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(()=>new Date(anchor.getFullYear(),anchor.getMonth(),1));
 const today=new Date(),current=periodRange(period,anchor);
 const items:{key:string;top:string;bottom:string;date:Date}[]=[];
 if(period==='day'){const r=periodRange('week',anchor);for(let i=0;i<7;i++){const d=new Date(r.start.getFullYear(),r.start.getMonth(),r.start.getDate()+i);items.push({key:'d'+i,top:d.toLocaleDateString(undefined,{weekday:'narrow'}),bottom:String(d.getDate()),date:d})}}
 else if(period==='week'){for(let i=-5;i<=0;i++){const d=periodRange('week',today,i).start;items.push({key:'w'+i,top:'Week',bottom:d.toLocaleDateString(undefined,{month:'short',day:'numeric'}),date:d})}}
 else if(period==='month'){for(let i=-5;i<=0;i++){const d=new Date(today.getFullYear(),today.getMonth()+i,1);items.push({key:'m'+i,top:String(d.getFullYear()),bottom:d.toLocaleDateString(undefined,{month:'short'}),date:d})}}
 else{for(let i=-3;i<=0;i++){const d=new Date(today.getFullYear()+i,0,1);items.push({key:'y'+i,top:'Year',bottom:String(d.getFullYear()),date:d})}}
 const sel=(d:Date)=>periodRange(period,d).start.getTime()===current.start.getTime();
 const future=(d:Date)=>periodRange(period,d).start>today;
 const first=month.getDay(),offset=(first+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 const cells=[...Array(offset).fill(null),...Array.from({length:days},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1))];
 return <View style={{gap:8}}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open calendar" onPress={()=>{setMonth(new Date(anchor.getFullYear(),anchor.getMonth(),1));setOpen(true)}} style={st.calTitle}>
   <Ionicons name="calendar-outline" size={18} color={T.primary}/><Text style={st.rowTitle}>{periodTitle(period,anchor)}</Text><Ionicons name="chevron-down" size={16} color={T.muted}/>
  </TouchableOpacity>
  <View style={st.calStrip}>{items.map(it=>{const on=sel(it.date),off=future(it.date);return <TouchableOpacity key={it.key} disabled={off} accessibilityRole="button" accessibilityState={{selected:on,disabled:off}} onPress={()=>onPick(it.date)} style={[st.calItem,on&&{backgroundColor:T.primary},off&&{opacity:0.35}]}>
   <Text style={[st.axis,on&&{color:'#fff'}]}>{it.top}</Text><Text style={[st.calNum,on&&{color:'#fff'}]}>{it.bottom}</Text>
  </TouchableOpacity>})}</View>
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(29,43,51,0.3)'}}>
    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setOpen(false)} accessibilityLabel="Close calendar"/>
    <View style={[st.card,{gap:12}]}>
     <View style={st.navRow}>
      <TouchableOpacity accessibilityLabel="Previous month" onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))} style={st.navBtn}><Ionicons name="chevron-back" size={18} color={T.ink}/></TouchableOpacity>
      <Text style={st.heading}>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text>
      <TouchableOpacity accessibilityLabel="Next month" disabled={new Date(month.getFullYear(),month.getMonth()+1,1)>today} onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))} style={[st.navBtn,new Date(month.getFullYear(),month.getMonth()+1,1)>today&&{opacity:0.3}]}><Ionicons name="chevron-forward" size={18} color={T.ink}/></TouchableOpacity>
     </View>
     <View style={{flexDirection:'row'}}>{['M','T','W','T','F','S','S'].map((d,i)=><Text key={i} style={[st.axis,{flex:1,textAlign:'center'}]}>{d}</Text>)}</View>
     <View style={{flexDirection:'row',flexWrap:'wrap'}}>{cells.map((d,i)=>{if(!d)return <View key={i} style={{width:'14.28%',height:40}}/>;const on=sel(d),off=d>today;return <TouchableOpacity key={i} disabled={off} onPress={()=>{onPick(d);setOpen(false)}} style={{width:'14.28%',height:40,alignItems:'center',justifyContent:'center'}}>
      <View style={[st.calDay,on&&{backgroundColor:T.primary}]}><Text style={[st.body,{fontWeight:'800'},on&&{color:'#fff'},off&&{color:'#C3CDC8'}]}>{d.getDate()}</Text></View>
     </TouchableOpacity>})}</View>
    </View>
   </View>
  </Modal>
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
 cta:{backgroundColor:T.primary,borderRadius:24,paddingVertical:14,alignItems:'center',justifyContent:'center'},
 ctaText:{color:'#fff',fontSize:15,fontWeight:'900'},
 ghost:{borderRadius:24,paddingVertical:14,alignItems:'center',borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff'},
 ghostText:{fontSize:15,fontWeight:'800',color:T.ink},
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

 small:{borderRadius:14,paddingHorizontal:12,paddingVertical:8,backgroundColor:T.primarySoft,alignItems:'center'},
 smallText:{fontSize:13,fontWeight:'800',color:T.primary},
 note:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:T.primarySoft,borderRadius:16,padding:12},
 link:{color:T.primary,fontWeight:'800',fontSize:14},
 linkRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:T.surface,borderRadius:18,padding:16,borderWidth:1,borderColor:T.border},
 segment:{flexDirection:'row',backgroundColor:T.surface,borderRadius:18,padding:4,borderWidth:1,borderColor:T.border},
 segBtn:{flex:1,alignItems:'center',paddingVertical:9,borderRadius:14},
 segOn:{backgroundColor:T.primary},
 segText:{fontSize:14,fontWeight:'800',color:T.ink},
 calTitle:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:4},
 calStrip:{flexDirection:'row',gap:6},
 calItem:{flex:1,alignItems:'center',gap:2,paddingVertical:8,borderRadius:14,backgroundColor:T.surface,borderWidth:1,borderColor:T.border},
 calNum:{fontSize:15,fontWeight:'900',color:T.ink},
 calDay:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},
 navRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 navBtn:{width:36,height:36,borderRadius:18,backgroundColor:T.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:T.border},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
 stat:{flexBasis:'47%',flexGrow:1,backgroundColor:T.surface,borderRadius:18,padding:14,gap:3,borderWidth:1,borderColor:T.border},
 statLabel:{fontSize:12,fontWeight:'800',color:T.muted},
 statValue:{fontSize:24,fontWeight:'900',color:T.ink},
 chart:{flexDirection:'row',alignItems:'flex-end',gap:2},
 axis:{fontSize:9,fontWeight:'700',color:T.muted},
});
