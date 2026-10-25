import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet,TextInput,AppState} from 'react-native';
import {supabase} from './supabase';
import {useIsGuest} from './Account';
import FamilyWatches,{familyProfilesChanged} from './FamilyWatches';
import {usePlus} from './PlusStore';
import {getPendingWatchPairing,getWatchStatus,onWatchPairingRequest,requestWatchPairing,WatchStatus} from './modules/watch-link';

type Device={id:string;name:string;platform:string;linked_at:string;last_seen_at:string|null;revoked_at:string|null};
const purple='#6953CA';
export default function ConnectedDevices(){
 const [devices,setDevices]=useState<Device[]>([]),[connecting,setConnecting]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [code,setCode]=useState(''),[watch,setWatch]=useState<WatchStatus>(getWatchStatus()),[waiting,setWaiting]=useState(false);
 const [familyReload,setFamilyReload]=useState(0);
 const isGuest=useIsGuest();
 const {isPlus,showPaywall}=usePlus();
 async function call(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke('watch-pairing',{body:{action,...extra}});
  if(error||data?.error){
   let msg=data?.error;
   if(!msg&&error&&'context' in error){try{msg=(await (error as any).context.json())?.error}catch{}}
   throw Error(msg||error?.message||'Connection failed');
  }
  return data;
 }
 async function load(){setLoading(true);try{setDevices((await call('list')).devices||[])}catch(e:any){setMessage(e.message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  const refresh=()=>setWatch(getWatchStatus());
  const t=setTimeout(refresh,800);
  const app=AppState.addEventListener('change',st=>{if(st==='active')refresh()});
  return()=>{clearTimeout(t);app.remove()};
 },[]);
 async function approve(action:'approve'|'approve_code',details:Record<string,unknown>){
  if(isGuest){setMessage('Create an account in Settings to link your Apple Watch.');return}
  setConnecting(true);setMessage('');
  try{
   const approved=await call(action,details);
   setCode('');
   if(approved?.family){setFamilyReload(n=>n+1);familyProfilesChanged();setMessage('Family watch added as a mood-only profile.')}
   else setMessage((approved?.deviceName||'Apple Watch')+' linked.');
   await load();
  }catch(e:any){
   setMessage(e.message||'Connection failed');
   if(!isPlus&&/Family watch limit/.test(e.message||'')){setMessage("MoodPals Free includes 1 family watch. Upgrade to Plus for up to 4, then enter the watch's code again.");showPaywall('family')}
  }finally{setConnecting(false)}
 }
 // One-tap link for this iPhone's own watch: approve its pending request, or ask the watch to start one.
 useEffect(()=>{
  if(!waiting)return;
  const sub=onWatchPairingRequest(p=>{setWaiting(false);void approve('approve',p)});
  const t=setTimeout(()=>{setWaiting(false);setMessage('Open MoodPals on your Apple Watch, then tap Link again.')},20000);
  return()=>{sub.remove();clearTimeout(t)};
 },[waiting]);
 function linkThisWatch(){
  setMessage('');
  const pending=getPendingWatchPairing();
  if(pending){void approve('approve',pending);return}
  if(!requestWatchPairing()){setMessage('Open MoodPals on your Apple Watch, then tap Link again.');return}
  setWaiting(true);
 }
 const digits=code.replace(/\D/g,'');
 const ownWatchLinked=devices.some(d=>d.platform==='watchos');
 async function remove(device:Device){Alert.alert('Remove device?',device.name+' will be permanently removed from your connected devices. It will need a new code to link again. Existing access tokens may remain valid until they expire.',[{text:'Cancel',style:'cancel'},{text:'Remove Device',style:'destructive',onPress:()=>{void (async()=>{setLoading(true);try{await call('remove',{deviceId:device.id});setDevices(current=>current.filter(d=>d.id!==device.id));await load()}catch(e:any){Alert.alert('Removal failed',e.message)}finally{setLoading(false)}})()}}])}
 return <View style={{gap:13}}>
  <Text style={styles.title}>Connected devices</Text>
  <Text style={styles.sub}>Open MoodPals on your Apple Watch while MoodPals is open on this iPhone and the watch links automatically. If it doesn't, tap Link below or type the code shown on the watch.</Text>
  {isGuest?<Text style={[styles.sub,{color:'#D65B79'}]}>Create an account in Settings to link your Apple Watch.</Text>:null}
  {!isGuest&&watch.paired&&watch.installed?<View style={styles.card}>
   <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
    <View style={{flex:1}}><Text style={{fontWeight:'800',color:'#271C49'}}>This iPhone's Apple Watch</Text><Text style={styles.sub}>{ownWatchLinked?'Linked to this account.':'MoodPals is installed on it.'}</Text></View>
    {ownWatchLinked?<Text style={{fontWeight:'800',color:'#2E9E6A'}}>Linked</Text>:<TouchableOpacity accessibilityRole="button" accessibilityLabel="Link this iPhone's Apple Watch" disabled={connecting||waiting} onPress={linkThisWatch} style={[styles.small,(connecting||waiting)&&{opacity:.5}]}>{waiting?<ActivityIndicator color="white"/>:<Text style={styles.buttonText}>Link</Text>}</TouchableOpacity>}
   </View>
   {waiting?<Text style={styles.sub}>Waiting for your watch… keep MoodPals open on it.</Text>:null}
  </View>:null}
  {!isGuest?<View style={styles.card}>
   <Text style={{fontWeight:'800',color:'#271C49'}}>Enter watch code</Text>
   <Text style={styles.sub}>Open MoodPals on the watch (yours or a family watch) and type the 6-digit code it shows.</Text>
   <View style={{flexDirection:'row',gap:10,alignItems:'center'}}>
    <TextInput value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} placeholder="000000" placeholderTextColor="#C9C2D8" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} accessibilityLabel="Watch code" style={styles.code} editable={!connecting} onSubmitEditing={()=>{if(digits.length===6)void approve('approve_code',{code:digits})}}/>
    <TouchableOpacity accessibilityRole="button" disabled={digits.length!==6||connecting} onPress={()=>void approve('approve_code',{code:digits})} style={[styles.small,(digits.length!==6||connecting)&&{opacity:.4}]}><Text style={styles.buttonText}>Link</Text></TouchableOpacity>
   </View>
  </View>:null}
  {connecting?<View style={[styles.card,{alignItems:'center',paddingVertical:35,gap:14}]}><ActivityIndicator color={purple} size="large"/><Text style={styles.title}>Connecting Apple Watch…</Text><Text style={styles.sub}>Securely linking your device</Text></View>:null}
  {loading?<ActivityIndicator color={purple}/>:null}
  {message?<Text style={styles.sub}>{message}</Text>:null}
  <TouchableOpacity onPress={()=>void load()}><Text style={{color:purple,fontWeight:'700'}}>Refresh device list ↻</Text></TouchableOpacity>
  {devices.length===0?<Text style={styles.sub}>No connected watches yet.</Text>:devices.map(d=><View key={d.id} style={styles.card}><Text style={{fontWeight:'800',color:'#271C49'}}>{d.name?.trim()||'Apple Watch'}</Text><Text style={styles.sub}>{d.platform==='watchos'?'Apple Watch · ':''}{d.last_seen_at?'Last seen '+new Date(d.last_seen_at).toLocaleString():'Paired '+new Date(d.linked_at).toLocaleDateString()}</Text><TouchableOpacity onPress={()=>void remove(d)}><Text style={{color:'#C64F67',fontWeight:'800'}}>Remove Device</Text></TouchableOpacity></View>)}
  {!isGuest?<FamilyWatches reloadKey={familyReload}/>:null}
 </View>;
}
const styles=StyleSheet.create({title:{fontWeight:'900',fontSize:20,color:'#251C45'},sub:{fontSize:12,lineHeight:19,color:'#807694'},button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'white',fontWeight:'900'},card:{backgroundColor:'white',borderRadius:16,padding:15,gap:10,borderWidth:1,borderColor:'#EDE9F3'},small:{backgroundColor:purple,borderRadius:12,paddingHorizontal:20,minHeight:44,minWidth:72,alignItems:'center',justifyContent:'center'},code:{flex:1,minHeight:48,borderRadius:12,borderWidth:1,borderColor:'#DCD5EA',paddingHorizontal:14,fontSize:24,letterSpacing:6,fontWeight:'800',color:'#271C49',fontVariant:['tabular-nums']}});
