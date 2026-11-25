import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Platform,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Device from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {APP_THEME as T} from './MoodMascot';
import {DurationRing} from './FamilyScreenBreak';
import {pickBreakApps,requestSatelliteAuthorization,satelliteAccessToken,satelliteRecover,satelliteSaveCredentials,satelliteState,satelliteSync,onBreakState,type SatelliteState} from './modules/watch-link/screenBreak';

const URL='https://hzoauxxpvrgahlavxmvp.supabase.co';
const KEY='sb_publishable_pPPqosRo1SqwrbW-8MWURA_UxTED6Vs';
const EAS_PROJECT_ID=(Device.default.expoConfig?.extra as any)?.eas?.projectId||'7fce274d-e6b2-4944-a9b0-ef08fa13f871';
const isPad=Platform.OS==='ios'&&(Platform as any).isPad===true;

async function pairing(body:Record<string,unknown>,token?:string){
 const res=await fetch(URL+'/functions/v1/watch-pairing',{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+(token||KEY)},body:JSON.stringify(body)});
 const json=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(json.error||'Something went wrong. Try again.');
 return json;
}

// A client that only ever uses this device's own Keychain login (no persisted session, no parent account).
function deviceClient():SupabaseClient{
 return createClient(URL,KEY,{accessToken:async()=>(await satelliteAccessToken())||KEY,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}} as any);
}

export default function SatelliteMode({onExit}:{onExit:()=>void}){
 const [state,setState]=useState<SatelliteState|null>(()=>satelliteState());
 const {width}=useWindowDimensions();
 const pad=Math.max(20,(width-560)/2);
 const refresh=useCallback(async(reason:string)=>{const next=await satelliteSync(reason);if(next)setState(next)},[]);
 useEffect(()=>{const sub=onBreakState(()=>setState(satelliteState()));return()=>sub.remove()},[]);
 const linked=!!state?.linked;
 return <SafeAreaView style={st.page}><ScrollView contentContainerStyle={[st.body,{paddingHorizontal:pad}]} keyboardShouldPersistTaps="handled">
  <Image source={require('./assets/branding/moodpals-logo.png')} accessibilityLabel="MoodPals" style={st.logo} resizeMode="contain"/>
  {state?.unlinked?<Unlinked reason={state.reason} onDone={onExit}/>
   :!linked?<Pair onPaired={next=>setState(next)} onCancel={onExit}/>
   :!state?.engine.authorized||!state.engine.selectionCount?<Setup state={state} onChange={()=>void refresh('setup')}/>
   :<Dashboard state={state} refresh={refresh} onState={setState}/>}
 </ScrollView></SafeAreaView>;
}

function Pair({onPaired,onCancel}:{onPaired:(s:SatelliteState)=>void;onCancel:()=>void}){
 const [link,setLink]=useState<{id:string;secret:string;code:string;expiresAt:string}|null>(null),[error,setError]=useState(''),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false);
 const installationId=satelliteState()?.installationId||'';
 const start=useCallback(async()=>{
  setError('');setBusy(true);
  try{setLink(await pairing({action:'start',kind:'satellite',installationId,deviceType:isPad?'ipad':'iphone',deviceName:isPad?'Family iPad':'Family iPhone'}))}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 },[installationId]);
 useEffect(()=>{void start()},[start]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  if(!link)return;let active=true;
  const t=setInterval(async()=>{
   try{
    const r=await pairing({action:'poll',id:link.id,secret:link.secret,installationId});
    if(!active||r.status!=='approved'||!r.tokenHash)return;
    clearInterval(t);
    const temp=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error:otp}=await temp.auth.verifyOtp({token_hash:r.tokenHash,type:'magiclink'});
    if(otp||!data.session)throw new Error('Linking failed. Show a new code and try again.');
    satelliteSaveCredentials({access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at});
    await pairing({action:'complete',id:link.id,secret:link.secret},data.session.access_token).catch(()=>null);
    const next=await satelliteSync('paired');
    if(next&&active)onPaired(next);
   }catch(e:any){if(active)setError(e.message)}
  },3000);
  return()=>{active=false;clearInterval(t)};
 },[link,installationId,onPaired]);
 const left=link?Math.max(0,Math.round((Date.parse(link.expiresAt)-now)/1000)):0;
 return <View style={st.stack}>
  <Text style={st.title}>Link as a Family Device</Text>
  <Text style={st.sub}>On the parent's iPhone, open MoodPals › Family › Family Devices › Add Device and enter this code.</Text>
  <View style={st.card}>
   {busy&&!link?<ActivityIndicator color={T.primary}/>:link&&left>0?<>
    <Text style={st.code} accessibilityLabel={'Code '+link.code.split('').join(' ')}>{link.code.slice(0,3)} {link.code.slice(3)}</Text>
    <Text style={st.muted}>Expires in {Math.floor(left/60)}:{String(left%60).padStart(2,'0')} · Waiting for the parent…</Text>
   </>:<Text style={st.muted}>This code expired.</Text>}
  </View>
  {error?<Text style={st.error}>{error}</Text>:null}
  {(!link||left===0||error)?<TouchableOpacity style={st.cta} onPress={()=>void start()} disabled={busy}><Text style={st.ctaText}>Show a new code</Text></TouchableOpacity>:null}
  <TouchableOpacity style={st.ghost} onPress={onCancel}><Text style={st.ghostText}>Cancel</Text></TouchableOpacity>
 </View>;
}

function Setup({state,onChange}:{state:SatelliteState;onChange:()=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const authorize=async(kind:'child'|'individual')=>{
  setError('');setBusy(true);
  try{if(!await requestSatelliteAuthorization(kind))setError('Screen Time access wasn’t allowed.')}
  catch{setError(kind==='child'?'This device isn’t signed in with a child’s Apple Account in Family Sharing. Use “This device” instead.':'Screen Time access wasn’t allowed.')}
  finally{setBusy(false);onChange()}
 };
 const choose=async()=>{setError('');await pickBreakApps().catch(()=>null);onChange()};
 return <View style={st.stack}>
  <Text style={st.title}>{state.deviceName||'Family device'} is linked</Text>
  {!state.engine.authorized?<>
   <Text style={st.sub}>A parent sets up Screen Time here. Family Sharing works best: the child can’t turn it off.</Text>
   <TouchableOpacity style={st.cta} disabled={busy} onPress={()=>void authorize('child')}><Text style={st.ctaText}>Child in Family Sharing</Text></TouchableOpacity>
   <TouchableOpacity style={st.ghost} disabled={busy} onPress={()=>void authorize('individual')}><Text style={st.ghostText}>This device</Text></TouchableOpacity>
  </>:<>
   <Text style={st.sub}>Choose the apps MoodPals pauses on this device when screen time ends.</Text>
   <TouchableOpacity style={st.cta} onPress={()=>void choose()}><Text style={st.ctaText}>Choose apps</Text></TouchableOpacity>
  </>}
  {error?<Text style={st.error}>{error}</Text>:null}
 </View>;
}

function Dashboard({state,refresh,onState}:{state:SatelliteState;refresh:(r:string)=>Promise<void>;onState:(s:SatelliteState)=>void}){
 const [now,setNow]=useState(Date.now()),[recovering,setRecovering]=useState(false);
 const session=state.engine.session;
 const active=session?.status==='active';
 const restricted=!!state.engine.manualLock||session?.status==='restricted';
 const deviceId=state.deviceId;
 const client=useRef<SupabaseClient|null>(null);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 // Foreground sync: on open, every 30 s, and when the app returns to the foreground.
 useEffect(()=>{
  void refresh('open');
  const t=setInterval(()=>void refresh('poll'),30000);
  const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh('active')});
  return()=>{clearInterval(t);sub.remove()};
 },[refresh]);
 // Realtime while open; background pushes wake the device natively when it's closed.
 useEffect(()=>{
  if(!deviceId)return;
  const c=client.current||(client.current=deviceClient());
  void (async()=>{const token=await satelliteAccessToken();if(token)c.realtime.setAuth(token)})();
  const ch=c.channel('satellite-'+deviceId).on('postgres_changes' as any,{event:'*',schema:'public',table:'family_device_commands',filter:'device_id=eq.'+deviceId},()=>void refresh('realtime')).subscribe();
  void (async()=>{
   try{
    const token=(await Notifications.getExpoPushTokenAsync({projectId:EAS_PROJECT_ID})).data;
    if(token)await c.rpc('satellite_register_push',{p_token:token});
   }catch{}
  })();
  return()=>{void c.removeChannel(ch)};
 },[deviceId,refresh]);
 const seconds=active&&session?Math.max(0,Math.round(session.deadline-now/1000)):0;
 const synced=state.lastSyncAt?Math.round((now/1000-state.lastSyncAt)/60):null;
 if(recovering)return <Recovery onDone={()=>{setRecovering(false);onState(satelliteState()!)}}/>;
 return <View style={st.stack}>
  <Text style={st.device}>{state.deviceName||'Family device'}</Text>
  <View style={st.row}>
   <Status ok={state.online!==false} label={state.online===false?'Offline':'Connected'}/>
   <Status ok={state.engine.authorized} label={state.engine.authorized?(state.authKind==='child'?'Screen Time · Family Sharing':'Screen Time on'):'Screen Time off'}/>
  </View>
  {state.status==='unlinking'?<Text style={st.muted}>Unlinking…</Text>:null}
  {active&&session?<View style={st.center}>
   <Text style={st.child}>{session.childName}</Text>
   <DurationRing minutes={Math.ceil(seconds/60)} onChange={()=>{}} min={0} max={Math.max(1,Math.ceil(session.grantedSeconds/60))} prefix="" />
   <Text style={st.timer}>{Math.floor(seconds/3600)>0?Math.floor(seconds/3600)+':':''}{String(Math.floor(seconds/60)%60).padStart(Math.floor(seconds/3600)>0?2:1,'0')}:{String(seconds%60).padStart(2,'0')} left</Text>
  </View>:<View style={[st.card,st.center]}>
   <Text style={st.ready}>{restricted?'Time for a break!':'Ready for screen time'}</Text>
   <Text style={st.muted}>{restricted?'Chosen apps are paused until a parent starts screen time.':'A parent starts screen time from MoodPals.'}</Text>
  </View>}
  <Text style={st.muted}>{synced===null?'Not synced yet':synced<1?'Synced just now':'Synced '+synced+' min ago'}</Text>
  <TouchableOpacity onPress={()=>setRecovering(true)} style={st.linkBtn}><Text style={st.link}>Parent recovery</Text></TouchableOpacity>
 </View>;
}

function Recovery({onDone}:{onDone:()=>void}){
 const [code,setCode]=useState(''),[error,setError]=useState('');
 const submit=()=>{const r=satelliteRecover(code);if(r.ok)onDone();else setError(r.error||'That code doesn’t match.')};
 return <View style={st.stack}>
  <Text style={st.title}>Parent recovery</Text>
  <Text style={st.sub}>Enter the recovery code from Family Devices on the parent's iPhone. This unlinks this device and lifts MoodPals pauses.</Text>
  <TextInput style={st.codeInput} value={code} onChangeText={t=>setCode(t.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" maxLength={6} accessibilityLabel="Recovery code"/>
  {error?<Text style={st.error}>{error}</Text>:null}
  <TouchableOpacity style={[st.cta,code.length!==6&&{opacity:.5}]} disabled={code.length!==6} onPress={submit}><Text style={st.ctaText}>Unlink this device</Text></TouchableOpacity>
  <TouchableOpacity style={st.ghost} onPress={onDone}><Text style={st.ghostText}>Cancel</Text></TouchableOpacity>
 </View>;
}

function Unlinked({reason,onDone}:{reason?:string;onDone:()=>void}){
 return <View style={st.stack}>
  <Text style={st.title}>{reason==='recovered'?'Device unlinked':'This device was unlinked'}</Text>
  <Text style={st.sub}>MoodPals pauses were removed from this device.</Text>
  <TouchableOpacity style={st.cta} onPress={onDone}><Text style={st.ctaText}>Done</Text></TouchableOpacity>
 </View>;
}

function Status({ok,label}:{ok:boolean;label:string}){
 return <View style={st.pill}><View style={[st.dot,{backgroundColor:ok?'#2FB574':'#E0A030'}]}/><Text style={st.pillText}>{label}</Text></View>;
}

const st=StyleSheet.create({
 page:{flex:1,backgroundColor:T.background},
 body:{paddingVertical:24,gap:18,flexGrow:1,justifyContent:'center'},
 logo:{height:30,width:30*607/97,alignSelf:'center'},
 stack:{gap:14},
 title:{fontSize:28,fontWeight:'900',color:T.ink,textAlign:'center'},
 sub:{fontSize:15,lineHeight:21,color:T.muted,textAlign:'center'},
 muted:{fontSize:13,color:T.muted,textAlign:'center'},
 error:{fontSize:14,color:'#C2413A',textAlign:'center',fontWeight:'700'},
 card:{backgroundColor:T.surface,borderRadius:20,padding:20,gap:10,borderWidth:1,borderColor:T.border},
 center:{alignItems:'center',gap:10},
 code:{fontSize:52,fontWeight:'900',letterSpacing:6,color:T.ink,textAlign:'center'},
 codeInput:{borderWidth:1.5,borderColor:T.border,borderRadius:18,minHeight:64,fontSize:30,fontWeight:'900',letterSpacing:10,textAlign:'center',color:T.ink,backgroundColor:'#fff'},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:54,paddingVertical:15,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},
 ctaText:{color:'#fff',fontSize:17,fontWeight:'900'},
 ghost:{borderRadius:26,minHeight:54,paddingVertical:15,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:T.border,backgroundColor:'#fff'},
 ghostText:{fontSize:17,fontWeight:'800',color:T.ink},
 device:{fontSize:22,fontWeight:'900',color:T.ink,textAlign:'center'},
 row:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8},
 pill:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:T.surface,borderRadius:14,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderColor:T.border},
 dot:{width:8,height:8,borderRadius:4},
 pillText:{fontSize:12,fontWeight:'700',color:T.ink},
 child:{fontSize:26,fontWeight:'900',color:T.ink},
 timer:{fontSize:20,fontWeight:'800',color:T.ink},
 ready:{fontSize:22,fontWeight:'900',color:T.ink,textAlign:'center'},
 linkBtn:{paddingVertical:8,alignItems:'center'},
 link:{color:T.primary,fontWeight:'800',fontSize:13},
});
