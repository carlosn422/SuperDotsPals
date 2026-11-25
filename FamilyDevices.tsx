import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {authenticateGuardian} from './modules/watch-link/screenBreak';

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
 if(d.restricted)return {label:'Apps restricted',tone:'ok'};
 return {label:'Ready',tone:'ok'};
}

export function DevicePicker({devices,selected,defaultId,onSelect}:{devices:FamilyDevice[];selected:string;defaultId:string;onSelect:(id:string)=>void}){
 if(!devices.length)return null;
 const all=[{id:PHONE,name:'This iPhone',icon:'phone-portrait-outline'},...devices.filter(d=>d.status==='active').map(d=>({id:d.id,name:d.name,icon:d.device_type==='ipad'?'tablet-portrait-outline':'phone-portrait-outline'}))];
 return <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Device">
  {all.map(o=><TouchableOpacity key={o.id} accessibilityRole="radio" accessibilityState={{selected:selected===o.id}} onPress={()=>onSelect(o.id)} style={[s.chip,selected===o.id&&s.chipOn]}>
   <Ionicons name={o.icon as any} size={16} color={selected===o.id?'#fff':T.ink}/>
   <Text style={[s.chipText,selected===o.id&&{color:'#fff'}]} numberOfLines={1}>{o.name}{o.id===defaultId?' · Default':''}</Text>
  </TouchableOpacity>)}
 </View>;
}

export function FamilyDevicesScreen({onBack,childName}:{onBack:()=>void;childName:(id:string)=>string}){
 const {devices,defaultId,commands,sessions,loaded}=useFamilyDevices();
 const [adding,setAdding]=useState(false),[open,setOpen]=useState<string|null>(null);
 const now=Date.now();
 return <View style={{gap:14}}>
  <TouchableOpacity accessibilityRole="button" onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={20} color={T.primary}/><Text style={s.backText}>Family</Text></TouchableOpacity>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <Text style={s.title} accessibilityRole="header">Family Devices</Text>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setAdding(a=>!a)} style={s.addBtn}><Ionicons name={adding?'close':'add'} size={18} color="#fff"/><Text style={s.addBtnText}>{adding?'Close':'Add Device'}</Text></TouchableOpacity>
  </View>
  <Text style={s.sub}>Link an iPad or spare iPhone your kids share. Choose who's using it each time you start a timer.</Text>
  {adding?<AddDevice onDone={()=>setAdding(false)}/>:null}
  {!loaded?<ActivityIndicator color={T.primary}/>:null}
  <View style={[s.card,{paddingVertical:4,gap:0}]}>
   <DefaultRow name="This iPhone" icon="phone-portrait-outline" detail="Lend your own iPhone" isDefault={defaultId===PHONE} onDefault={()=>void rpc('family_device_clear_default',{}).catch(e=>Alert.alert('Family Devices',e.message))}/>
   {devices.map(d=>{const st=deviceStatus(d,commands,sessions,now);const active=sessions.find(x=>x.family_device_id===d.id);return <View key={d.id} style={s.line}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>setOpen(open===d.id?null:d.id)} style={s.row}>
     <Ionicons name={d.device_type==='ipad'?'tablet-portrait-outline':'phone-portrait-outline'} size={24} color={T.ink}/>
     <View style={{flex:1}}>
      <Text style={s.rowTitle}>{d.name}{defaultId===d.id?' · Default':''}</Text>
      <Text style={s.sub}>{active?childName(active.child_id)+' · '+Math.max(1,Math.ceil((Date.parse(active.deadline_at)-now)/60000))+' min left':st.label} · {lastSeen(d,now)}</Text>
     </View>
     <View style={[s.dot,{backgroundColor:st.tone==='warn'?'#E0A030':st.tone==='busy'?T.primary:'#2FB574'}]}/>
     <Ionicons name={open===d.id?'chevron-up':'chevron-down'} size={18} color={T.muted}/>
    </TouchableOpacity>
    {open===d.id?<DeviceDetail device={d} isDefault={defaultId===d.id}/>:null}
   </View>})}
  </View>
  {loaded&&!devices.length&&!adding?<Text style={s.sub}>No family devices yet. On the iPad, install MoodPals and tap “Link as a Family Device.”</Text>:null}
 </View>;
}

function DefaultRow({name,icon,detail,isDefault,onDefault}:{name:string;icon:string;detail:string;isDefault:boolean;onDefault:()=>void}){
 return <View style={s.row}>
  <Ionicons name={icon as any} size={24} color={T.ink}/>
  <View style={{flex:1}}><Text style={s.rowTitle}>{name}{isDefault?' · Default':''}</Text><Text style={s.sub}>{detail}</Text></View>
  {isDefault?null:<TouchableOpacity accessibilityRole="button" onPress={onDefault}><Text style={s.link}>Make default</Text></TouchableOpacity>}
 </View>;
}

function DeviceDetail({device,isDefault}:{device:FamilyDevice;isDefault:boolean}){
 const [name,setName]=useState(device.name),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const remove=()=>Alert.alert('Remove '+device.name+'?','MoodPals pauses on it are lifted when it next connects. History is kept.',[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>void act(async()=>{
  if(!await authenticateGuardian('Remove '+device.name))throw Error('Confirm with Face ID or your passcode to remove a device.');
  await deviceCommand(device.id,'UNLINK_DEVICE');
 })}]);
 const forceRemove=()=>Alert.alert('Remove now?','Use this if the device is lost or offline. Write down its recovery code first: '+device.recovery_code+'. Enter it on the device under Parent recovery to lift its pauses.',[{text:'Cancel',style:'cancel'},{text:'Remove now',style:'destructive',onPress:()=>void act(async()=>{
  if(!await authenticateGuardian('Remove '+device.name))throw Error('Confirm with Face ID or your passcode to remove a device.');
  await rpc('family_device_remove',{p_device:device.id});
 })}]);
 return <View style={s.detail}>
  <Text style={s.kicker}>Name</Text>
  <View style={{flexDirection:'row',gap:8}}>
   <TextInput style={[s.input,{flex:1}]} value={name} onChangeText={setName} maxLength={60} accessibilityLabel="Device name"/>
   <TouchableOpacity accessibilityRole="button" disabled={busy||!name.trim()||name.trim()===device.name} onPress={()=>void act(()=>rpc('family_device_rename',{p_device:device.id,p_name:name.trim()}))} style={[s.small,(busy||!name.trim()||name.trim()===device.name)&&{opacity:.5}]}><Text style={s.smallText}>Save</Text></TouchableOpacity>
  </View>
  <Text style={s.sub}>Screen Time: {device.auth_status==='approved'?(device.auth_kind==='child'?'Family Sharing child':'This device')+' · '+device.selection_count+' to pause':device.auth_status==='denied'?'Not allowed — set it up on the device':'Set up on the device'}</Text>
  <Text style={s.sub}>Recovery code: <Text style={{fontWeight:'900',color:T.ink}}>{device.recovery_code}</Text> — enter it on the device under Parent recovery if it can't reach MoodPals.</Text>
  {isDefault?null:<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void act(()=>rpc('family_device_set_default',{p_device:device.id}))} style={s.ghost}><Text style={s.ghostText}>Make default device</Text></TouchableOpacity>}
  {device.status==='active'&&device.auth_status==='approved'&&device.selection_count>0?<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void act(()=>deviceCommand(device.id,device.restricted?'UNLOCK_APPS':'LOCK_APPS'))} style={s.ghost}><Text style={s.ghostText}>{device.restricted?'Unlock apps':'Lock apps now'}</Text></TouchableOpacity>:null}
  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void act(()=>deviceCommand(device.id,'REQUEST_STATUS'))} style={s.ghost}><Text style={s.ghostText}>Check status</Text></TouchableOpacity>
  {device.status==='unlinking'?<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={forceRemove} style={s.ghost}><Text style={[s.ghostText,{color:'#C2413A'}]}>Remove now</Text></TouchableOpacity>
   :<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={remove} style={s.ghost}><Text style={[s.ghostText,{color:'#C2413A'}]}>Remove device</Text></TouchableOpacity>}
  {busy?<ActivityIndicator color={T.primary}/>:null}
  {error?<Text style={[s.sub,{color:'#C2413A'}]}>{error}</Text>:null}
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
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},
 chip:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:18,borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:8,maxWidth:240},
 chipOn:{backgroundColor:T.primary,borderColor:T.primary},
 chipText:{fontSize:14,fontWeight:'800',color:T.ink},
});
