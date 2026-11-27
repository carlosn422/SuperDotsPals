import {IconTile} from './IconTile';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActionSheetIOS,ActivityIndicator,Alert,Animated,Modal,ScrollView,StyleSheet,Switch,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Svg,{Circle} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {authenticateGuardian,getBreakState,onBreakState,sendBreakCommand,type BreakState} from './modules/watch-link/screenBreak';
import {useReduceMotion} from './CircleComponents';
import {formatDuration,periodStats,periodRange,type SessionRow} from './ScreenBreakInsights';

/** Family devices (iPads / spare iPhones) belong to the parent's family account, never to a child.
 *  The child is chosen per session; the parent's own iPhone is the device id PHONE. */
export const PHONE='phone';
export type FamilyDevice={id:string;name:string;device_type:'ipad'|'iphone';status:'active'|'unlinking'|'removed';auth_status:'unknown'|'approved'|'denied';auth_kind:'child'|'individual'|null;selection_count:number;restricted:boolean;last_sync_at:string|null;recovery_code:string;created_at:string};
export type DeviceCommand={id:string;device_id:string;type:string;status:'pending'|'delivered'|'acknowledged'|'rejected'|'expired'|'canceled';error:string|null;error_code:string|null;session_id:string|null;child_id:string|null;minutes:number|null;created_at:string;updated_at?:string};
export type RemoteSession={id:string;child_id:string;family_device_id:string;started_at:string;deadline_at:string;granted_seconds:number;status:string;version:number};
type DevicesData={devices:FamilyDevice[];defaultId:string;commands:DeviceCommand[];sessions:RemoteSession[];loaded:boolean};

const listeners=new Set<()=>void>();
export function familyDevicesChanged(){listeners.forEach(l=>l())}

export function useFamilyDevices(enabled=true){
 const [data,setData]=useState<DevicesData>({devices:[],defaultId:PHONE,commands:[],sessions:[],loaded:false});
 const load=useCallback(async()=>{
  const since=new Date(Date.now()-10*60000).toISOString();
  const [d,p,c,s]=await Promise.all([
   supabase.from('family_devices').select('id,name,device_type,status,auth_status,auth_kind,selection_count,restricted,last_sync_at,recovery_code,created_at').neq('status','removed').order('created_at'),
   supabase.from('family_device_prefs').select('default_device_id').maybeSingle(),
   supabase.from('family_device_commands').select('*').gte('created_at',since).order('seq',{ascending:false}).limit(100),
   supabase.from('screen_break_sessions').select('id,child_id,family_device_id,started_at,deadline_at,granted_seconds,status,version').not('family_device_id','is',null).eq('status','active').gt('deadline_at',new Date().toISOString()),
  ]);
  if(d.error)return;
  const devices=(d.data as FamilyDevice[])||[];
  const def=p.data?.default_device_id&&devices.some(x=>x.id===p.data!.default_device_id)?p.data.default_device_id:PHONE;
  setData({devices,defaultId:def,commands:(c.data as DeviceCommand[])||[],sessions:(s.data as RemoteSession[])||[],loaded:true});
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  void load();listeners.add(load);
  const ch=supabase.channel('family-devices-'+Math.random().toString(36).slice(2))
   .on('postgres_changes' as any,{event:'*',schema:'public',table:'family_devices'},()=>void load())
   .on('postgres_changes' as any,{event:'*',schema:'public',table:'family_device_commands'},()=>void load())
   .on('postgres_changes' as any,{event:'*',schema:'public',table:'screen_break_sessions'},()=>void load())
   .subscribe();
  const t=setInterval(()=>void load(),20000);
  return()=>{listeners.delete(load);clearInterval(t);void supabase.removeChannel(ch)};
 },[enabled,load]);
 return {...data,reload:load};
}

async function rpc(name:string,args:Record<string,unknown>){
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw Error(error.message||'Request failed. Check your connection and try again.');
 familyDevicesChanged();
 return data;
}
export const deviceCommand=(device:string,type:string,opts:{minutes?:number;child?:string;replace?:boolean}={})=>rpc('family_device_command',{p_device:device,p_type:type,p_minutes:opts.minutes??null,p_child:opts.child??null,...(opts.replace?{p_replace:true}:{})});
export const cancelDeviceCommand=(command:string)=>rpc('family_device_cancel_command',{p_command:command});

export function lastSeen(d:FamilyDevice,now=Date.now()){
 if(!d.last_sync_at)return 'Not connected yet';
 const m=Math.round((now-Date.parse(d.last_sync_at))/60000);
 return m<1?'Seen just now':m<60?'Seen '+m+' min ago':m<1440?'Seen '+Math.round(m/60)+' h ago':'Seen '+Math.round(m/1440)+' d ago';
}

/** The parent-visible state of one family device. A session only shows as active after the device acknowledged it. */
export function deviceStatus(d:FamilyDevice,commands:DeviceCommand[],sessions:RemoteSession[],now=Date.now()):{label:string;tone:'ok'|'busy'|'warn';pending?:DeviceCommand}{
 const pending=commands.find(c=>c.device_id===d.id&&(c.status==='pending'||c.status==='delivered'));
 const stale=!d.last_sync_at||now-Date.parse(d.last_sync_at)>10*60000;
 if(d.status==='unlinking')return {label:'Unlink pending',tone:'warn',pending};
 if(pending){
  if(stale&&now-Date.parse(pending.created_at)>20000)return {label:'Waiting for device connection',tone:'warn',pending};
  const label=pending.type==='START_SESSION'?(pending.status==='pending'?'Connecting':'Starting timer'):pending.type==='EXTEND_SESSION'?'Updating timer':pending.type==='END_SESSION'||pending.type==='LOCK_APPS'?'Lock pending':pending.type==='UNLOCK_APPS'?'Updating':'Connecting';
  return {label,tone:'busy',pending};
 }
 if(d.auth_status!=='approved')return {label:'Authorization required',tone:'warn'};
 if(sessions.some(s=>s.family_device_id===d.id&&Date.parse(s.deadline_at)>now))return {label:'Timer active',tone:'busy'};
 if(stale&&d.last_sync_at&&now-Date.parse(d.last_sync_at)>60*60000)return {label:'Device unavailable',tone:'warn'};
 if(d.restricted)return {label:'Apps locked',tone:'ok'};
 return {label:'Ready',tone:'ok'};
}

export type DeviceOption={id:string;name:string;tablet?:boolean;busy?:string;note?:string};
const WARN='#B7791F';
/** The device for this timer as one row; tapping it slides up every device with who's using it. */
export function DeviceSelect({options,selected,defaultId,onSelect}:{options:DeviceOption[];selected:string;defaultId:string;onSelect:(id:string)=>void}){
 const [open,setOpen]=useState(false);
 if(options.length<2)return null;
 const cur=options.find(o=>o.id===selected)||options[0];
 const icon=(o:DeviceOption)=><View style={s.optIcon}><Ionicons name={o.tablet?'tablet-portrait-outline':'phone-portrait-outline'} size={20} color={T.primary}/></View>;
 const status=(o:DeviceOption)=><Text style={[s.optSub,!!o.busy&&{color:WARN,fontWeight:'700'}]} numberOfLines={1}>{o.busy||o.note||'Available'}</Text>;
 return <>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Device: '+cur.name+(cur.busy?', '+cur.busy:'')+'. Change device'} onPress={()=>setOpen(true)} style={s.select}>
   {icon(cur)}
   <View style={{flex:1}}><Text style={s.optName} numberOfLines={1}>{cur.name}</Text>{status(cur)}</View>
   <Text style={s.selectLink}>Change</Text>
   <Ionicons name="chevron-down" size={18} color={T.primary}/>
  </TouchableOpacity>
  <Modal visible={open} transparent animationType="slide" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(29,43,51,0.3)'}}>
    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={()=>setOpen(false)} accessibilityLabel="Close"/>
    <View style={s.sheet} accessibilityRole="radiogroup" accessibilityLabel="Device">
     <View style={s.grabber}/>
     <Text style={s.sheetTitle}>Choose a device</Text>
     <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets style={{flexGrow:0}} contentContainerStyle={{gap:10}}>
     {options.map(o=>{const on=o.id===selected;return <TouchableOpacity key={o.id} accessibilityRole="radio" accessibilityState={{selected:on}} onPress={()=>{onSelect(o.id);setOpen(false)}} style={[s.opt,on&&s.optOn]}>
      {icon(o)}
      <View style={{flex:1}}><Text style={s.optName} numberOfLines={1}>{o.name}{o.id===defaultId?' · Default':''}</Text>{status(o)}</View>
      {on?<Ionicons name="checkmark-circle" size={24} color={T.primary}/>:null}
     </TouchableOpacity>})}
     </ScrollView>
    </View>
   </View>
  </Modal>
 </>;
}

/** Default device first, then the other family devices, then This iPhone. */
export function deviceOrder(devices:FamilyDevice[],defaultId:string):string[]{
 const ids=devices.map(d=>d.id);
 return defaultId===PHONE?[PHONE,...ids]:[...ids.filter(id=>id===defaultId),...ids.filter(id=>id!==defaultId),PHONE];
}

export const THIS_PHONE={id:PHONE,name:'This iPhone',device_type:'iphone'} as unknown as FamilyDevice;

/** Who used a device last and how long it's been in use. */
function DeviceStats({deviceId,childName}:{deviceId:string;childName:(id:string)=>string}){
 const [rows,setRows]=useState<SessionRow[]>([]),[loaded,setLoaded]=useState(false);
 const ws=periodRange('week',new Date()).start.getTime();
 useEffect(()=>{let live=true;setLoaded(false);
  let q=supabase.from('screen_break_sessions').select('id,child_id,family_device_id,started_at,deadline_at,ended_at,granted_seconds,status,version').gte('deadline_at',new Date(ws).toISOString()).order('started_at',{ascending:false}).limit(500);
  q=deviceId===PHONE?q.is('family_device_id',null):q.eq('family_device_id',deviceId);
  void q.then(({data})=>{if(live){setRows((data as SessionRow[])||[]);setLoaded(true)}});
  return()=>{live=false}},[deviceId,ws]);
 const now=new Date(),day=periodStats(rows,'day',now,now),wk=periodStats(rows,'week',now,now),last=rows[0];
 const running=last&&!last.ended_at&&Date.parse(last.deadline_at)>Date.now();
 const ago=last?Math.max(0,Date.now()-Date.parse(last.ended_at||last.deadline_at)):0;
 const when=running?'Now':!last?'':ago<36e5?Math.max(1,Math.round(ago/6e4))+'m ago':ago<864e5?Math.round(ago/36e5)+'h ago':Math.round(ago/864e5)+'d ago';
 const val=(label:string,value:string,color:string)=><View style={{gap:2,flex:1}}><Text style={{fontSize:12,fontWeight:'800',color}}>{label}</Text><Text style={s.statNum} numberOfLines={1}>{value}</Text></View>;
 if(!loaded)return null;
 return <View style={{gap:12}}>
  <View style={s.statBox}>
   <View style={[s.statOrb,{backgroundColor:running?'#E4F6EA':'#F4EBFF'}]}><Ionicons name={running?'hourglass':'person'} size={22} color={running?T.primary:'#9B7BC8'}/></View>
   <View style={{flex:1,gap:2}}>
    <Text style={{fontSize:12,fontWeight:'800',color:'#9B7BC8'}}>{running?'In use by':'Last used by'}</Text>
    <Text style={s.statNum} numberOfLines={1}>{last?childName(last.child_id):'No one yet'}</Text>
   </View>
   {last?<Text style={{fontSize:14,fontWeight:'800',color:running?T.primary:T.muted}}>{when}</Text>:null}
  </View>
  <View style={s.statBox}>
   {val('Today',formatDuration(day.seconds),T.primary)}{val('This week',formatDuration(wk.seconds),'#4A8CFF')}{val('Sessions',String(wk.sessions),'#F2A93B')}
  </View>
 </View>;
}

/** Scrolls a name that's too long for its card back and forth. */
function Marquee({text,style,width=60}:{text:string;style:any;width?:number}){
 const reduce=useReduceMotion(),[tw,setTw]=useState(0),x=useRef(new Animated.Value(0)).current,over=Math.ceil(tw-width);
 useEffect(()=>{x.setValue(0);if(over<=0||reduce)return;const a=Animated.loop(Animated.sequence([Animated.delay(1200),Animated.timing(x,{toValue:-over,duration:over*45,useNativeDriver:true}),Animated.delay(1000),Animated.timing(x,{toValue:0,duration:over*45,useNativeDriver:true})]));a.start();return()=>a.stop()},[over,reduce]);
 return <View style={{width,overflow:'hidden'}} accessible accessibilityLabel={text}><Animated.View style={{width:400,flexDirection:'row',transform:[{translateX:over>0?x:Math.max(0,(width-tw)/2)}]}}><Text style={[style,{flexShrink:0}]} onLayout={e=>setTw(e.nativeEvent.layout.width)}>{text}</Text></Animated.View></View>;
}

/** The selected device's card; its settings slide up. Devices are picked from DeviceDock. */
export function FamilyDevicesScreen({childName,onStart,selectedId,adding,onAddDone}:{childName:(id:string)=>string;onStart?:(device:FamilyDevice)=>void;selectedId?:string|null;adding?:boolean;onAddDone?:()=>void}){
 const {devices,defaultId,commands,sessions,loaded}=useFamilyDevices();
 const [sheet,setSheet]=useState<string|null>(null),[now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t)},[]);
 const open=devices.find(d=>d.id===sheet);
 useEffect(()=>{if(sheet&&loaded&&!open)setSheet(null)},[sheet,loaded,open]);
 const id=selectedId&&(selectedId===PHONE||devices.some(d=>d.id===selectedId))?selectedId:deviceOrder(devices,defaultId)[0];
 const d=devices.find(x=>x.id===id);
 const [phoneState,setPhoneState]=useState<BreakState|null>(()=>getBreakState());
 useEffect(()=>{const sub=onBreakState(setPhoneState);return()=>sub.remove()},[]);
 const phoneSend=(a:'lock'|'unlock')=>{const r=sendBreakCommand(a);if(r.state)setPhoneState(r.state);if(!r.ok)Alert.alert('This iPhone',r.error||'Something went wrong. Please try again.')};
 return <View style={{gap:14}}>
  {adding?<AddDevice onDone={()=>onAddDone?.()}/>:null}
  {!loaded?<ActivityIndicator color={T.primary}/>:null}
  {!adding?d?<DeviceCard device={d} isDefault={defaultId===d.id} commands={commands} sessions={sessions} now={now} childName={childName} onOpen={()=>setSheet(d.id)} onStart={onStart}/>:<>
  <View style={s.card}>
   <View style={s.deviceRow}>
    <IconTile icon="phone-portrait" color="#4A8CFF" size={52}/>
    <View style={{flex:1}}>
     <View style={s.nameLine}><Text style={s.rowTitle} numberOfLines={1}>This iPhone</Text>{defaultId===PHONE?<DefaultPill/>:null}</View>
     {phoneState?.manualLock?<StatusLine icon="lock-closed" color={PAUSED} text="Apps locked"/>:phoneState?.session?.status==='active'?<StatusLine icon="hourglass" color={OK} text="Timer running"/>:<StatusLine icon="checkmark-circle" color={OK} text="Available"/>}
    </View>
    {defaultId===PHONE?null:<TouchableOpacity accessibilityRole="button" accessibilityLabel="Make This iPhone the default device" onPress={()=>void rpc('family_device_clear_default',{}).catch(e=>Alert.alert('Family Devices',e.message))} style={s.textBtn}><Text style={s.link}>Make default</Text></TouchableOpacity>}
   </View>
   <View style={s.actions}>{phoneState?.manualLock?<ActionBtn locked label="Unlock apps" icon="lock-open-outline" onPress={()=>phoneSend('unlock')}/>:phoneState?.session?.status==='active'?null:<ActionBtn label="Lock apps" icon="lock-closed-outline" onPress={()=>phoneSend('lock')}/>}{onStart?<ActionBtn primary label="Start timer" icon="time-outline" onPress={()=>onStart(THIS_PHONE)}/>:null}</View>
  </View>
  </>:null}
  {!adding&&loaded?<DeviceStats deviceId={d?d.id:PHONE} childName={childName}/>:null}
  {loaded&&!devices.length&&!adding?<Text style={s.sub}>No family devices yet. On the iPad, install MoodPals and tap “Link as a Family Device.”</Text>:null}
  <Modal visible={!!open} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setSheet(null)}>
   <ScrollView automaticallyAdjustKeyboardInsets style={{flex:1,backgroundColor:T.background}} contentContainerStyle={{padding:20,paddingBottom:48,gap:14}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={s.grabber}/>
    {open?<DeviceSettings device={open} isDefault={defaultId===open.id} now={now} onBack={()=>setSheet(null)} onClose={()=>setSheet(null)}/>:null}
   </ScrollView>
  </Modal>
 </View>;
}

/** Device cards pinned above the tab bar, like the member cards; a running timer shows as a ring of the time left. */
export function DeviceDock({devices,defaultId,sessions,selected,adding,onSelect,onAdd}:{devices:FamilyDevice[];defaultId:string;sessions:RemoteSession[];selected?:string|null;adding:boolean;onSelect:(id:string)=>void;onAdd:()=>void}){
 const order=deviceOrder(devices,defaultId),cur=selected&&order.includes(selected)?selected:order[0],now=Date.now();
 const [,tick]=useState(0);
 useEffect(()=>{if(!sessions.length)return;const t=setInterval(()=>tick(n=>n+1),5000);return()=>clearInterval(t)},[sessions.length]);
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:4}} contentContainerStyle={{gap:10,paddingVertical:4,paddingHorizontal:2}}>
  {order.map(id=>{
   const d=devices.find(x=>x.id===id),on=!adding&&id===cur,name=d?d.name:'This iPhone';
   const run=d?sessions.find(x=>x.family_device_id===d.id&&Date.parse(x.deadline_at)>now):undefined;
   const frac=run?Math.min(1,(Date.parse(run.deadline_at)-now)/1000/Math.max(1,run.granted_seconds)):null;
   const color=frac===null?T.primary:frac<=.2?'#E5484D':frac<=.5?'#F2A93B':T.primary,r=16,cc=2*Math.PI*r;
   return <TouchableOpacity key={id} accessibilityRole="button" accessibilityLabel={name+(frac!==null?', timer running':'')+(defaultId===id?', default':'')} accessibilityState={{selected:on}} onPress={()=>onSelect(id)} style={[s.dockCard,on&&{backgroundColor:T.primary,borderColor:T.primary}]}>
    <View style={{width:38,height:38,alignItems:'center',justifyContent:'center'}}>
     {frac!==null?<Svg width={38} height={38} style={StyleSheet.absoluteFill}><Circle cx={19} cy={19} r={r} stroke={on?'rgba(255,255,255,.35)':color+'33'} strokeWidth={3.5} fill="none"/><Circle cx={19} cy={19} r={r} stroke={on?'#fff':color} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray={cc+' '+cc} strokeDashoffset={cc*(1-frac)} transform="rotate(-90 19 19)"/></Svg>:null}
     {on?<Ionicons name={d?.device_type==='ipad'?'tablet-landscape':'phone-portrait'} size={frac===null?22:15} color="#fff"/>:<IconTile icon={d?.device_type==='ipad'?'tablet-landscape':'phone-portrait'} color="#4A8CFF" size={frac===null?36:26}/>}
    </View>
    <Marquee text={name} style={[s.dockName,{color:on?'#fff':T.ink}]}/>
   </TouchableOpacity>})}
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={adding?'Close add device':'Add device'} onPress={onAdd} style={[s.dockCard,{borderStyle:'dashed',borderWidth:2,borderColor:adding?T.primary:'#C9D6CF'}]}>
   <View style={{width:38,height:38,alignItems:'center',justifyContent:'center'}}><Ionicons name={adding?'close':'add'} size={24} color={T.primary}/></View>
   <Text style={[s.dockName,{color:T.ink}]}>{adding?'Close':'Add'}</Text>
  </TouchableOpacity>
 </ScrollView>;
}

const OK='#2FB574',PAUSED='#C2413A';
const seen=(d:FamilyDevice,now:number)=>lastSeen(d,now).replace(/^Seen /,'');
function DefaultPill(){return <View style={s.pill}><Text style={s.pillText}>Default</Text></View>}
function StatusLine({icon,color,text,busy}:{icon:string;color:string;text:string;busy?:boolean}){
 return <View style={s.statusLine}>{busy?<ActivityIndicator size="small" color={WARN}/>:<Ionicons name={icon as any} size={16} color={color}/>}<Text style={s.statusText} numberOfLines={2}>{text}</Text></View>;
}
function ActionBtn({label,icon,primary,danger,locked,onPress}:{label:string;icon:string;primary?:boolean;danger?:boolean;locked?:boolean;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[s.action,primary&&{backgroundColor:T.primary},locked&&{backgroundColor:'#FDECE8'}]}>
  <Ionicons name={icon as any} size={18} color={primary?'#fff':danger||locked?PAUSED:T.ink}/>
  <Text style={[s.actionText,primary&&{color:'#fff'},(danger||locked)&&{color:PAUSED}]} numberOfLines={1}>{label}</Text>
 </TouchableOpacity>;
}

/** One device: what it's doing now, and only the actions that fit its confirmed state. */
export function DeviceCard({device:d,isDefault,commands,sessions,now,childName,onOpen,onStart,width}:{width?:number;device:FamilyDevice;isDefault:boolean;commands:DeviceCommand[];sessions:RemoteSession[];now:number;childName:(id:string)=>string;onOpen:()=>void;onStart?:(device:FamilyDevice)=>void}){
 const [sending,setSending]=useState(false),[error,setError]=useState('');
 // Lock state shown right after a tap, until the device confirms it or the command fails.
 const [expect,setExpect]=useState<{locked:boolean;at:number}|null>(null);
 const st0=deviceStatus(d,commands,sessions,now);
 const lockPending=!!st0.pending&&(st0.pending.type==='LOCK_APPS'||st0.pending.type==='UNLOCK_APPS');
 const st=expect&&lockPending?{...st0,pending:undefined}:st0;
 const locked=expect?.locked??d.restricted;
 useEffect(()=>{
  if(expect&&!lockPending&&(d.restricted===expect.locked||Date.now()-expect.at>4000))setExpect(null);
 },[expect,lockPending,d.restricted,now]);
 const session=sessions.find(x=>x.family_device_id===d.id&&Date.parse(x.deadline_at)>now);
 const failed=commands.find(c=>c.device_id===d.id&&(c.status==='rejected'||c.status==='expired')&&now-Date.parse(c.updated_at||c.created_at)<120000);
 const ready=d.status==='active'&&d.auth_status==='approved'&&d.selection_count>0;
 const send=async(type:string,opts:{minutes?:number}={})=>{
  if(sending||st.pending)return;
  setSending(true);setError('');
  try{await deviceCommand(d.id,type,opts)}catch(e:any){setError(e.message)}finally{setSending(false)}
 };
 const toggleLock=()=>{
  const target=!locked;
  setExpect({locked:target,at:Date.now()});setError('');
  void deviceCommand(d.id,target?'LOCK_APPS':'UNLOCK_APPS').catch(()=>setExpect(null));
 };
 const addTime=()=>ActionSheetIOS.showActionSheetWithOptions({title:'Add time for '+childName(session!.child_id),options:['+15 min','+30 min','+1 hour','Cancel'],cancelButtonIndex:3},i=>{const m=[15,30,60][i];if(m)void send('EXTEND_SESSION',{minutes:m})});
 const left=session?Math.max(1,Math.ceil((Date.parse(session.deadline_at)-now)/60000))+' min left':'';
 const status=sending?{icon:'',color:WARN,text:'Sending…',busy:true}
  :st.pending?{icon:'',color:WARN,text:st.label==='Waiting for device connection'?'Waiting for '+d.name+' to connect':'Waiting for '+d.name+'…',busy:true}
  :d.status==='unlinking'?{icon:'alert-circle',color:WARN,text:'Removing · waiting for the device'}
  :session?{icon:'timer-outline',color:T.primary,text:childName(session.child_id)+' · '+left}
  :!ready?{icon:'alert-circle',color:WARN,text:d.auth_status==='approved'?'Choose apps to pause on the device':'Finish Screen Time setup on the device'}
  :st.label==='Device unavailable'?{icon:'cloud-offline-outline',color:WARN,text:'Offline · '+seen(d,now)}
  :locked?{icon:'lock-closed',color:PAUSED,text:'Apps locked · '+seen(d,now)}
  :{icon:'checkmark-circle',color:OK,text:'Available · '+seen(d,now)};
 const pendingStart=st.pending?.type==='START_SESSION'?st.pending:undefined;
 return <View style={[s.card,width?{width}:null]}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={d.name+(isDefault?', default':'')+', '+status.text+'. Device settings'} onPress={onOpen} style={s.deviceRow}>
   <IconTile icon={d.device_type==='ipad'?'tablet-landscape':'phone-portrait'} color="#4A8CFF" size={52}/>
   <View style={{flex:1}}>
    <View style={s.nameLine}><Text style={s.rowTitle} numberOfLines={1}>{d.name}</Text>{isDefault?<DefaultPill/>:null}</View>
    <StatusLine {...status}/>
   </View>
   <Ionicons name="chevron-forward" size={18} color={T.muted}/>
  </TouchableOpacity>
  {sending||d.status!=='active'?null:pendingStart?<View style={s.actions}><ActionBtn label="Cancel" icon="close" onPress={()=>{setSending(true);void cancelDeviceCommand(pendingStart.id).catch(e=>setError(e.message)).finally(()=>setSending(false))}}/></View>
   :st.pending||!ready?null
   :session?<View style={s.actions}><ActionBtn primary label="Add time" icon="add" onPress={addTime}/><ActionBtn danger label="End" icon="stop-circle-outline" onPress={()=>void send('END_SESSION')}/></View>
   :locked?<View style={s.actions}><ActionBtn locked label="Unlock apps" icon="lock-open-outline" onPress={toggleLock}/>{onStart?<ActionBtn primary label="Start timer" icon="time-outline" onPress={()=>onStart(d)}/>:null}</View>
   :<View style={s.actions}><ActionBtn label="Lock apps" icon="lock-closed-outline" onPress={toggleLock}/>{onStart?<ActionBtn primary label="Start timer" icon="time-outline" onPress={()=>onStart(d)}/>:null}</View>}
  {failed&&!st.pending&&failed.type!=='LOCK_APPS'&&failed.type!=='UNLOCK_APPS'?<Text style={[s.sub,{color:PAUSED}]}>{failed.error||'The device couldn’t do that.'}</Text>:null}
  {error?<Text style={[s.sub,{color:PAUSED}]}>{error}</Text>:null}
 </View>;
}

function SettingRow({label,value,children,onPress,danger,last}:{label:string;value?:string;children?:React.ReactNode;onPress?:()=>void;danger?:boolean;last?:boolean}){
 const body=<><Text style={[s.setLabel,danger&&{color:PAUSED}]}>{label}</Text>{value!=null?<Text style={s.setValue} numberOfLines={1}>{value}</Text>:null}{children}</>;
 return onPress?<TouchableOpacity accessibilityRole="button" onPress={onPress} style={[s.setRow,!last&&s.setLine]}>{body}</TouchableOpacity>:<View style={[s.setRow,!last&&s.setLine]}>{body}</View>;
}

/** Settings-style details for rarely changed things: name, default, Screen Time, recovery code, removal. */
function DeviceSettings({device,isDefault,now,onBack,onClose,backLabel}:{device:FamilyDevice;isDefault:boolean;now:number;onBack:()=>void;onClose:()=>void;backLabel?:string}){
 const [name,setName]=useState(device.name),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setName(device.name),[device.name]);
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const rename=()=>{const n=name.trim();if(!n){setName(device.name);return}if(n!==device.name)void act(()=>rpc('family_device_rename',{p_device:device.id,p_name:n}))};
 const guard=async()=>{if(!await authenticateGuardian('Remove '+device.name))throw Error('Confirm with Face ID or your passcode to remove a device.')};
 const remove=()=>Alert.alert('Remove '+device.name+'?','MoodPals pauses on it are lifted when it next connects. History is kept.',[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>void act(async()=>{await guard();await deviceCommand(device.id,'UNLINK_DEVICE')})}]);
 const forceRemove=()=>Alert.alert('Remove now?','Use this if the device is lost or offline. Write down its recovery code first: '+device.recovery_code+'. Enter it on the device under Parent recovery to lift its pauses.',[{text:'Cancel',style:'cancel'},{text:'Remove now',style:'destructive',onPress:()=>void act(async()=>{await guard();await rpc('family_device_remove',{p_device:device.id})})}]);
 const screenTime=device.auth_status==='approved'?(device.auth_kind==='child'?'Family Sharing child':'This device'):device.auth_status==='denied'?'Not allowed':'Not set up';
 return <View style={{gap:14}}>
  {backLabel?<TouchableOpacity accessibilityRole="button" onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={20} color={T.primary}/><Text style={s.backText}>{backLabel}</Text></TouchableOpacity>:null}
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><IconTile icon={device.device_type==='ipad'?'tablet-landscape':'phone-portrait'} color="#4A8CFF" size={52}/><Text style={[s.title,{flex:1}]} accessibilityRole="header" numberOfLines={1}>{device.name}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.closeBtn}><Ionicons name="close" size={22} color={T.ink}/></TouchableOpacity></View>
  <View style={s.group}>
   <SettingRow label="Name"><TextInput style={s.setInput} value={name} onChangeText={setName} onEndEditing={rename} returnKeyType="done" maxLength={60} editable={!busy} accessibilityLabel="Device name"/></SettingRow>
   <SettingRow label="Default device" last><Switch value={isDefault} disabled={busy} trackColor={{true:T.primary}} onValueChange={v=>void act(()=>v?rpc('family_device_set_default',{p_device:device.id}):rpc('family_device_clear_default',{}))} accessibilityLabel="Default device"/></SettingRow>
  </View>
  <View style={s.group}>
   <SettingRow label="Screen Time" value={screenTime}/>
   <SettingRow label="Apps to pause" value={device.selection_count?String(device.selection_count):'None chosen'}/>
   <SettingRow label="Connection" value={lastSeen(device,now)} last><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void act(()=>deviceCommand(device.id,'REQUEST_STATUS'))} style={s.textBtn}><Text style={s.link}>Check</Text></TouchableOpacity></SettingRow>
  </View>
  <View style={s.group}><SettingRow label="Recovery code" value={device.recovery_code} last/></View>
  <Text style={s.groupNote}>For the device's Parent recovery.</Text>
  <View style={s.group}>{device.status==='unlinking'?<SettingRow label="Remove now" danger last onPress={busy?undefined:forceRemove}/>:<SettingRow label="Remove device" danger last onPress={busy?undefined:remove}/>}</View>
  {busy?<ActivityIndicator color={T.primary}/>:null}
  {error?<Text style={[s.sub,{color:PAUSED}]}>{error}</Text>:null}
 </View>;
}

function AddDevice({onDone}:{onDone:()=>void}){
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<string|null>(null);
 const submit=async()=>{
  setBusy(true);setError('');
  try{
   const {data,error:e}=await supabase.functions.invoke('watch-pairing',{body:{action:'approve_code',code,satellite:true}});
   let message=data?.error;
   if(e||message){try{message=message||(await (e as any)?.context?.json())?.error}catch{}throw Error(message||'That code didn’t work. Check it and try again.')}
   setDone(data?.deviceName||'Family device');familyDevicesChanged();
  }catch(x:any){setError(x.message)}finally{setBusy(false)}
 };
 if(done)return <View style={s.card}>
  <Text style={s.rowTitle}>Approve on {done}</Text>
  <Text style={s.sub}>Tap Approve on the device to finish linking. It then shows up here. Next, set up Screen Time on it and choose the apps to pause.</Text>
  <TouchableOpacity accessibilityRole="button" onPress={onDone} style={s.cta}><Text style={s.ctaText}>Done</Text></TouchableOpacity>
 </View>;
 return <View style={s.card}>
  <Text style={s.rowTitle}>Enter the code shown on the device</Text>
  <Text style={s.sub}>On the iPad or spare iPhone, open MoodPals and tap “Link as a Family Device.”</Text>
  <TextInput style={s.code} value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor="#B7C2BC" accessibilityLabel="Pairing code"/>
  {error?<Text style={[s.sub,{color:'#C2413A'}]}>{error}</Text>:null}
  <TouchableOpacity accessibilityRole="button" disabled={busy||code.length!==6} onPress={()=>void submit()} style={[s.cta,(busy||code.length!==6)&&{opacity:.5}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.ctaText}>Link Device</Text>}</TouchableOpacity>
 </View>;
}

/** Per-device totals for a set of session rows (recorded session time, not measured app use). */
export function useDeviceNames(devices:FamilyDevice[]){
 return useMemo(()=>{const m=new Map<string,string>();devices.forEach(d=>m.set(d.id,d.name));return (id:string|null|undefined)=>id?m.get(id)||'Removed device':'This iPhone'},[devices]);
}

const s=StyleSheet.create({
 back:{flexDirection:'row',alignItems:'center',gap:2,alignSelf:'flex-start',paddingVertical:4},
 backText:{color:T.primary,fontSize:16,fontWeight:'700'},
 title:{fontSize:28,fontWeight:'900',color:T.ink},
 sub:{fontSize:12,lineHeight:17,color:T.muted},
 kicker:{fontSize:12,fontWeight:'800',color:T.muted,textTransform:'uppercase'},
 card:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:T.border},
 row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12},
 line:{borderTopWidth:1,borderTopColor:T.border},
 rowTitle:{fontSize:16,fontWeight:'800',color:T.ink},
 dot:{width:10,height:10,borderRadius:5},
 detail:{gap:10,paddingBottom:14},
 input:{borderWidth:1.5,borderColor:T.border,borderRadius:14,paddingHorizontal:12,minHeight:44,fontSize:16,color:T.ink,backgroundColor:'#fff'},
 code:{borderWidth:1.5,borderColor:T.border,borderRadius:18,minHeight:64,fontSize:30,fontWeight:'900',letterSpacing:10,textAlign:'center',color:T.ink,backgroundColor:'#fff'},
 small:{backgroundColor:T.primary,borderRadius:14,paddingHorizontal:16,justifyContent:'center'},
 smallText:{color:'#fff',fontWeight:'800'},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:54,paddingVertical:15,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},
 ctaText:{color:'#fff',fontSize:17,fontWeight:'900'},
 ghost:{borderRadius:22,minHeight:44,paddingVertical:10,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff'},
 ghostText:{fontSize:15,fontWeight:'800',color:T.ink},
 link:{color:T.primary,fontWeight:'800',fontSize:13},
 addBtn:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:T.primary,borderRadius:18,paddingHorizontal:12,paddingVertical:8},
 addBtnText:{color:'#fff',fontWeight:'800',fontSize:13},
 select:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderRadius:18,borderWidth:1.5,borderColor:T.border,paddingHorizontal:14,paddingVertical:10,minHeight:64},
 selectLink:{fontSize:15,fontWeight:'800',color:T.primary},
 sheet:{backgroundColor:'#fff',borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,paddingBottom:40,gap:10,maxHeight:'85%'},
 dockCard:{width:70,paddingVertical:7,borderRadius:18,alignItems:'center',gap:6,backgroundColor:'rgba(255,255,255,.8)',borderWidth:1,borderColor:'#fff'},
 dockName:{fontSize:12,fontWeight:'800'},
 statBox:{backgroundColor:'#fff',borderRadius:24,padding:16,gap:12,flexDirection:'row',alignItems:'center',shadowColor:'#2D4A3E',shadowOpacity:.06,shadowRadius:12,shadowOffset:{width:0,height:4}},
 statNum:{fontSize:19,fontWeight:'900',color:T.ink},
 statOrb:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center'},
 showAll:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,alignSelf:'center',minHeight:44,paddingHorizontal:16},
 closeBtn:{width:40,height:40,borderRadius:20,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
 grabber:{width:38,height:5,borderRadius:3,backgroundColor:'#D2DAD6',alignSelf:'center'},
 sheetTitle:{fontSize:22,fontWeight:'900',color:T.ink,marginBottom:4},
 opt:{flexDirection:'row',alignItems:'center',gap:12,borderRadius:18,borderWidth:1.5,borderColor:T.border,padding:12,minHeight:64},
 optOn:{borderColor:T.primary,backgroundColor:T.primarySoft},
 optIcon:{width:40,height:40,borderRadius:12,backgroundColor:T.primarySoft,alignItems:'center',justifyContent:'center'},
 optName:{fontSize:17,fontWeight:'800',color:T.ink},
 optSub:{fontSize:14,color:T.muted,marginTop:2},
 tonalPill:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:T.primarySoft,borderRadius:22,paddingHorizontal:14,minHeight:44},
 tonalText:{color:T.primary,fontWeight:'800',fontSize:15},
 deviceRow:{flexDirection:'row',alignItems:'center',gap:14,minHeight:56},
 deviceIcon:{width:52,height:52,borderRadius:16,backgroundColor:'#EAF1FF',alignItems:'center',justifyContent:'center'},
 nameLine:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},
 pill:{backgroundColor:T.primarySoft,borderRadius:8,paddingHorizontal:8,paddingVertical:2},
 pillText:{color:T.primary,fontSize:12,fontWeight:'800'},
 statusLine:{flexDirection:'row',alignItems:'center',gap:6,marginTop:4},
 statusText:{flexShrink:1,fontSize:14,color:T.muted},
 actions:{flexDirection:'row',gap:10},
 action:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minHeight:44,borderRadius:22,backgroundColor:T.background,paddingHorizontal:12},
 actionText:{fontSize:15,fontWeight:'800',color:T.ink},
 textBtn:{minHeight:44,minWidth:44,justifyContent:'center',paddingHorizontal:4},
 info:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:T.surface,borderRadius:16,padding:14},
 group:{backgroundColor:T.surface,borderRadius:14,borderWidth:1,borderColor:T.border,paddingLeft:16},
 groupNote:{fontSize:12,lineHeight:17,color:T.muted,marginTop:-8,paddingHorizontal:16},
 setRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,paddingRight:16},
 setLine:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:T.border},
 setLabel:{fontSize:16,color:T.ink,fontWeight:'600'},
 setValue:{flex:1,textAlign:'right',fontSize:16,color:T.muted},
 setInput:{flex:1,textAlign:'right',fontSize:16,color:T.ink,minHeight:44},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},
 chip:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:18,borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:8,maxWidth:240},
 chipOn:{backgroundColor:T.primary,borderColor:T.primary},
 chipText:{fontSize:14,fontWeight:'800',color:T.ink},
});
