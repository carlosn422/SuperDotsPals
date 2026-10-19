import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {supabase} from './supabase';

type Device={id:string;name:string;platform:string;linked_at:string;last_seen_at:string|null;revoked_at:string|null};
const purple='#6953CA';
const parse=(raw:string)=>{
 try{const u=new URL(raw);if(u.protocol!=='superdots:'||u.hostname!=='pair')throw Error('Invalid QR');
 const id=u.searchParams.get('id')||'',secret=u.searchParams.get('secret')||'';
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))throw Error('Invalid QR');
 return {id,secret};
 }catch{throw Error('Scan a Superdots Apple Watch QR code.')}
};
export default function ConnectedDevices(){
 const [devices,setDevices]=useState<Device[]>([]),[scan,setScan]=useState(false),[connecting,setConnecting]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [permission,requestPermission]=useCameraPermissions();
 async function call(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke('watch-pairing',{body:{action,...extra}});
  if(error||data?.error)throw Error(data?.error||error?.message||'Connection failed');
  return data;
 }
 async function load(){setLoading(true);try{setDevices((await call('list')).devices||[])}catch(e:any){setMessage(e.message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function scanned(raw:string){
  if(connecting)return;
  setScan(false);
  let details:{id:string;secret:string};
  try{details=parse(raw)}catch(e:any){Alert.alert('Invalid code',e.message);return}
  setConnecting(true);setMessage('');
  const began=Date.now();
  try{
   await call('approve',details);
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,3000-(Date.now()-began))));
   await load();
   setMessage('Apple Watch linked successfully.');
  }catch(e:any){Alert.alert('Unable to link watch',e.message)}
  finally{setConnecting(false)}
 }
 async function remove(device:Device){Alert.alert('Remove device?',device.name+' will be permanently removed from your connected devices. It will need a new QR code to link again. Existing access tokens may remain valid until they expire.',[{text:'Cancel',style:'cancel'},{text:'Remove Device',style:'destructive',onPress:()=>{void (async()=>{setLoading(true);try{await call('remove',{deviceId:device.id});setDevices(current=>current.filter(d=>d.id!==device.id));await load()}catch(e:any){Alert.alert('Removal failed',e.message)}finally{setLoading(false)}})()}}])}
 return <View style={{gap:13}}>
  <Text style={styles.title}>Connected devices</Text>
  <Text style={styles.sub}>Link your Apple Watch by scanning its one-time QR code. Pairing expires after 5 minutes.</Text>
  {!scan&&!connecting?<TouchableOpacity style={styles.button} onPress={async()=>{if(!permission?.granted){const p=await requestPermission();if(!p.granted)return}setScan(true)}}><Text style={styles.buttonText}>Scan Apple Watch QR code</Text></TouchableOpacity>:null}
  {scan?<View style={{gap:10}}><View style={{height:270,borderRadius:18,overflow:'hidden'}}><CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={e=>void scanned(e.data)}/></View><TouchableOpacity onPress={()=>setScan(false)}><Text style={{color:purple,textAlign:'center'}}>Cancel scanning</Text></TouchableOpacity></View>:null}
  {connecting?<View style={[styles.card,{alignItems:'center',paddingVertical:35,gap:14}]}><ActivityIndicator color={purple} size="large"/><Text style={styles.title}>Connecting Apple Watch…</Text><Text style={styles.sub}>Securely linking your device</Text></View>:null}
  {loading?<ActivityIndicator color={purple}/>:null}
  {message?<Text style={styles.sub}>{message}</Text>:null}
  <TouchableOpacity onPress={()=>void load()}><Text style={{color:purple,fontWeight:'700'}}>Refresh device list ↻</Text></TouchableOpacity>
  {devices.length===0?<Text style={styles.sub}>No connected watches yet.</Text>:devices.map(d=><View key={d.id} style={styles.card}><Text style={{fontWeight:'800',color:'#271C49'}}>{d.name?.trim()||'Apple Watch'}</Text><Text style={styles.sub}>{d.platform==='watchos'?'Apple Watch · ':''}{d.last_seen_at?'Last seen '+new Date(d.last_seen_at).toLocaleString():'Paired '+new Date(d.linked_at).toLocaleDateString()}</Text><TouchableOpacity onPress={()=>void remove(d)}><Text style={{color:'#C64F67',fontWeight:'800'}}>Remove Device</Text></TouchableOpacity></View>)}
 </View>;
}
const styles=StyleSheet.create({title:{fontWeight:'900',fontSize:20,color:'#251C45'},sub:{fontSize:12,lineHeight:19,color:'#807694'},button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'white',fontWeight:'900'},card:{backgroundColor:'white',borderRadius:16,padding:15,gap:10,borderWidth:1,borderColor:'#EDE9F3'}});
