import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet,TextInput,AppState,Modal,ScrollView} from 'react-native';
import {supabase} from './supabase';
import {useIsGuest} from './Account';
import FamilyWatches,{familyProfilesChanged,shortProfileName} from './FamilyWatches';
import {usePlus} from './PlusStore';
import {getPendingWatchPairing,getWatchStatus,onWatchPairingRequest,requestWatchPairing,WatchStatus} from './modules/watch-link';
import {COLOR_NOTE,SectionHeader,WatchColor,WatchColorGrid,WatchColorSheet,WatchImage,WatchRow,colorName,isWatchColor} from './WatchArt';

type Device={id:string;name:string;platform:string;linked_at:string;last_seen_at:string|null;revoked_at:string|null;watch_color:string|null};
type Pending={action:'self'}|{action:'approve_code';code:string};
const purple='#6953CA',red='#C64F67';
const deviceName=(d:Device)=>d.name?.trim()||'Apple Watch';
const deviceStatus=(d:Device)=>d.last_seen_at?'Linked · last active '+new Date(d.last_seen_at).toLocaleDateString():'Linked '+new Date(d.linked_at).toLocaleDateString();
export default function ConnectedDevices(){
 const [devices,setDevices]=useState<Device[]>([]),[connecting,setConnecting]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [code,setCode]=useState(''),[watch,setWatch]=useState<WatchStatus>(getWatchStatus()),[waiting,setWaiting]=useState(false);
 const [familyReload,setFamilyReload]=useState(0);
 const [adding,setAdding]=useState<'mine'|'family'|null>(null),[step,setStep]=useState<'link'|'color'>('link'),[pending,setPending]=useState<Pending|null>(null);
 const [color,setColor]=useState<WatchColor|null>(null),[details,setDetails]=useState<Device|null>(null),[recoloring,setRecoloring]=useState(false);
 const waitColor=useRef<WatchColor|null>(null);
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
 function closeAdd(){setAdding(null);setStep('link');setPending(null);setColor(null);setCode('');setWaiting(false)}
 async function approve(action:'approve'|'approve_code',details:Record<string,unknown>){
  if(isGuest){setMessage('Create an account in Settings to link your Apple Watch.');return}
  setConnecting(true);setMessage('');
  try{
   const approved=await call(action,details);
   closeAdd();
   if(approved?.family){setFamilyReload(n=>n+1);familyProfilesChanged();setMessage('Family watch added as a mood-only profile.')}
   else setMessage((approved?.deviceName||'Apple Watch')+' linked.');
   await load();
  }catch(e:any){
   // Auto-link and Link can send the same watch request; the second approve loses after the first already linked it.
   if(action==='approve'&&/already used/.test(e.message||'')){closeAdd();await load();return}
   // Back to the code step; the chosen color is kept for the retry.
   setStep('link');
   setMessage(e.message||'Connection failed');
   if(!isPlus&&/Family watch limit/.test(e.message||'')){setMessage("MoodPals Free includes 1 family watch. Upgrade to Plus for up to 4, then enter the watch's code again.");showPaywall('family')}
  }finally{setConnecting(false)}
 }
 // One-tap link for this iPhone's own watch: approve its pending request, or ask the watch to start one.
 function linkThisWatch(c:WatchColor){
  setMessage('');
  const p=getPendingWatchPairing();
  if(p){void approve('approve',{...p,color:c});return}
  if(!requestWatchPairing()){setStep('link');setMessage('Open MoodPals on your Apple Watch, then tap Link again.');return}
  waitColor.current=c;setWaiting(true);
 }
 useEffect(()=>{
  if(!waiting)return;
  // The automatic link (no color chosen) also arrives here; it saves no color and the owner can pick one later.
  const sub=onWatchPairingRequest(p=>{setWaiting(false);void approve('approve',waitColor.current?{...p,color:waitColor.current}:p)});
  const t=setTimeout(()=>{setWaiting(false);setStep('link');setMessage('Open MoodPals on your Apple Watch, then tap Link again.')},20000);
  return()=>{sub.remove();clearTimeout(t)};
 },[waiting]);
 function finish(){
  if(!color||!pending)return;
  if(pending.action==='self')linkThisWatch(color);else void approve('approve_code',{code:pending.code,color});
 }
 const digits=code.replace(/\D/g,'');
 const watches=devices.filter(d=>d.platform==='watchos');
 const ownWatchLinked=watches.length>0;
 async function saveColor(d:Device,c:WatchColor){await call('set_color',{deviceId:d.id,color:c});setDevices(list=>list.map(x=>x.id===d.id?{...x,watch_color:c}:x));setDetails(x=>x&&x.id===d.id?{...x,watch_color:c}:x)}
 async function remove(device:Device){Alert.alert('Remove device?',deviceName(device)+' will be permanently removed from your connected devices. It will need a new code to link again. Existing access tokens may remain valid until they expire.',[{text:'Cancel',style:'cancel'},{text:'Remove Device',style:'destructive',onPress:()=>{void (async()=>{setLoading(true);try{await call('remove',{deviceId:device.id});setDetails(null);setDevices(current=>current.filter(d=>d.id!==device.id));await load()}catch(e:any){Alert.alert('Removal failed',e.message)}finally{setLoading(false)}})()}}])}
 const previewName=adding==='family'?'Family Watch':shortProfileName(watches[0]?.name||'Apple Watch');
 return <View style={{gap:13}}>
  <Text style={[styles.title,{fontSize:24}]}>Connected devices</Text>
  <Text style={styles.sub}>Open MoodPals on your Apple Watch while MoodPals is open on this iPhone and the watch links automatically. You can also add a watch with the code it shows.</Text>
  {isGuest?<Text style={[styles.sub,{color:'#D65B79'}]}>Create an account in Settings to link your Apple Watch.</Text>:null}
  {message&&!adding?<Text style={[styles.sub,{fontWeight:'700'}]}>{message}</Text>:null}
  <SectionHeader title="My Watches" action="Add Watch" disabled={isGuest} onAction={()=>{setMessage('');setAdding('mine')}}/>
  <View style={styles.card}>
   {loading&&!devices.length?<ActivityIndicator color={purple}/>:null}
   {!loading&&!watches.length?<Text style={[styles.sub,{paddingVertical:8}]}>No watches connected yet</Text>:null}
   {watches.map((d,i)=><WatchRow key={d.id} last={i===watches.length-1} color={isWatchColor(d.watch_color)?d.watch_color:null} name={shortProfileName(deviceName(d))} title={deviceName(d)} label={'Device details for '+deviceName(d)}
    lines={[deviceStatus(d),isWatchColor(d.watch_color)?'':'Choose Watch Color in details']} onPress={()=>setDetails(d)}/>)}
  </View>
  <TouchableOpacity onPress={()=>void load()}><Text style={{color:purple,fontWeight:'700'}}>Refresh device list ↻</Text></TouchableOpacity>
  {!isGuest?<FamilyWatches reloadKey={familyReload} onAdd={()=>{setMessage('');setAdding('family')}}/>:null}

  <Modal visible={!!adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={connecting?undefined:closeAdd}>
   <ScrollView contentContainerStyle={{padding:22,gap:14}} keyboardShouldPersistTaps="handled">
    <TouchableOpacity disabled={connecting} onPress={()=>step==='color'?setStep('link'):closeAdd()}><Text style={{color:purple,fontWeight:'800'}}>‹ {step==='color'?'Back':'Cancel'}</Text></TouchableOpacity>
    <Text style={styles.title}>{adding==='family'?'Add Family Watch':'Add Watch'}</Text>
    {step==='link'?<>
     {adding==='mine'&&watch.paired&&watch.installed?<View style={styles.card}>
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
       <View style={{flex:1}}><Text style={{fontWeight:'800',color:'#271C49'}}>This iPhone's Apple Watch</Text><Text style={styles.sub}>{ownWatchLinked?'Linked to this account.':'MoodPals is installed on it.'}</Text></View>
       {ownWatchLinked?<Text style={{fontWeight:'800',color:'#2E9E6A'}}>Linked</Text>:<TouchableOpacity accessibilityRole="button" accessibilityLabel="Link this iPhone's Apple Watch" onPress={()=>{setMessage('');setPending({action:'self'});setStep('color')}} style={styles.small}><Text style={styles.buttonText}>Link</Text></TouchableOpacity>}
      </View>
     </View>:null}
     <View style={styles.card}>
      <Text style={{fontWeight:'800',color:'#271C49'}}>Enter watch code</Text>
      <Text style={styles.sub}>{adding==='family'?'Open MoodPals on the family watch and type the 6-digit code it shows.':'Open MoodPals on the watch and type the 6-digit code it shows.'}</Text>
      <View style={{flexDirection:'row',gap:10,alignItems:'center'}}>
       <TextInput value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} placeholder="000000" placeholderTextColor="#C9C2D8" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} accessibilityLabel="Watch code" style={styles.code} onSubmitEditing={()=>{if(digits.length===6){setPending({action:'approve_code',code:digits});setStep('color')}}}/>
       <TouchableOpacity accessibilityRole="button" disabled={digits.length!==6} onPress={()=>{setMessage('');setPending({action:'approve_code',code:digits});setStep('color')}} style={[styles.small,digits.length!==6&&{opacity:.4}]}><Text style={styles.buttonText}>Next</Text></TouchableOpacity>
      </View>
     </View>
    </>:<>
     <Text style={{fontWeight:'800',color:'#271C49'}}>Choose a watch color</Text>
     <Text style={styles.sub}>{COLOR_NOTE}</Text>
     <View style={{alignItems:'center'}}><WatchImage color={color} name={previewName} width={110}/></View>
     <WatchColorGrid value={color} onChange={setColor} name={previewName}/>
     {connecting||waiting?<View style={{alignItems:'center',gap:8}}><ActivityIndicator color={purple}/><Text style={styles.sub}>{waiting?'Waiting for your watch… keep MoodPals open on it.':'Securely linking your watch…'}</Text></View>:
     <TouchableOpacity accessibilityRole="button" disabled={!color} onPress={finish} style={[styles.button,!color&&{opacity:.45}]}><Text style={styles.buttonText}>{color?'Finish':'Choose a color to finish'}</Text></TouchableOpacity>}
    </>}
    {message?<Text style={[styles.sub,{color:red,fontWeight:'700'}]}>{message}</Text>:null}
   </ScrollView>
  </Modal>

  <Modal visible={!!details} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setDetails(null)}>
   {details?<ScrollView contentContainerStyle={{padding:22,gap:14}}>
    <TouchableOpacity onPress={()=>setDetails(null)}><Text style={{color:purple,fontWeight:'800'}}>‹ Back</Text></TouchableOpacity>
    <View style={{alignItems:'center',gap:6}}><WatchImage color={isWatchColor(details.watch_color)?details.watch_color:null} name={shortProfileName(deviceName(details))} width={130}/><Text style={styles.title}>{deviceName(details)}</Text></View>
    <View style={styles.card}>
     <Text style={styles.sub}>Profile: your account</Text>
     <Text style={styles.sub}>Status: {deviceStatus(details)}</Text>
     <Text style={styles.sub}>Watch color: {isWatchColor(details.watch_color)?colorName(details.watch_color):'not chosen yet'}</Text>
    </View>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={()=>setRecoloring(true)}><Text style={styles.buttonText}>{isWatchColor(details.watch_color)?'Change Watch Color':'Choose Watch Color'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={[styles.button,{backgroundColor:red}]} onPress={()=>void remove(details)}><Text style={styles.buttonText}>Remove Device</Text></TouchableOpacity>
    <WatchColorSheet visible={recoloring} name={shortProfileName(deviceName(details))} initial={isWatchColor(details.watch_color)?details.watch_color:null} onSave={c=>saveColor(details,c)} onClose={()=>setRecoloring(false)}/>
   </ScrollView>:null}
  </Modal>
 </View>;
}
const styles=StyleSheet.create({title:{fontWeight:'900',fontSize:20,color:'#251C45'},sub:{fontSize:12,lineHeight:19,color:'#807694'},button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'white',fontWeight:'900'},card:{backgroundColor:'white',borderRadius:18,paddingHorizontal:15,paddingVertical:6,gap:10,borderWidth:1,borderColor:'#EDE9F3'},small:{backgroundColor:purple,borderRadius:12,paddingHorizontal:20,minHeight:44,minWidth:72,alignItems:'center',justifyContent:'center'},code:{flex:1,minHeight:48,borderRadius:12,borderWidth:1,borderColor:'#DCD5EA',paddingHorizontal:14,fontSize:24,letterSpacing:6,fontWeight:'800',color:'#271C49',fontVariant:['tabular-nums']}});
