import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,AppState,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getWatchStatus,onWatchStatusChange,type WatchStatus} from './modules/watch-link';

// What WatchConnectivity can tell us about the Apple Watch paired with this iPhone. iOS reports
// paired / app installed / reachable, but not install progress, so "installing" is a bounded wait.
export type WatchSetup='checking'|'unsupported'|'unknown'|'notPaired'|'installing'|'notInstalled'|'ready';
const CONFIRMED_KEY='moodpals.watchAppConfirmed';
const CHECK_MS=6000,INSTALL_WAIT_MS=90000,RECHECK_WAIT_MS=30000;
const purple='#6953CA',green='#2E9E6A',ink='#271C49';

export function useWatchSetup(focused:boolean){
 const [status,setStatus]=useState<WatchStatus>(getWatchStatus);
 // MoodPals was seen installed on the paired watch before: a later "not installed" means it was removed, not that it's installing.
 const [confirmed,setConfirmed]=useState(false);
 const [wait,setWait]=useState<{from:number;ms:number}|null>(null);
 const [now,setNow]=useState(Date.now());
 const opened=useRef(Date.now());
 const refresh=useCallback(()=>{setStatus(getWatchStatus());setNow(Date.now())},[]);
 useEffect(()=>{void AsyncStorage.getItem(CONFIRMED_KEY).then(v=>{if(v==='1')setConfirmed(true)}).catch(()=>{})},[]);
 useEffect(()=>{
  const sub=onWatchStatusChange(s=>{setStatus(s);setNow(Date.now())});
  const app=AppState.addEventListener('change',st=>{if(st==='active')refresh()});
  return()=>{sub.remove();app.remove()};
 },[refresh]);
 useEffect(()=>{if(focused)refresh()},[focused,refresh]);
 const waitingForInstall=status.activated&&status.paired&&!status.installed&&!confirmed;
 useEffect(()=>{
  if(status.activated&&status.paired&&status.installed){setConfirmed(true);setWait(null);void AsyncStorage.setItem(CONFIRMED_KEY,'1').catch(()=>{})}
  else if(status.activated&&!status.paired){setConfirmed(false);setWait(null);void AsyncStorage.removeItem(CONFIRMED_KEY).catch(()=>{})}
 },[status.activated,status.paired,status.installed]);
 useEffect(()=>{if(waitingForInstall&&!wait)setWait({from:Date.now(),ms:INSTALL_WAIT_MS})},[waitingForInstall,wait]);
 // Wake up once when a bounded wait ends so the card moves on instead of spinning forever.
 const deadline=!status.activated&&status.supported?opened.current+CHECK_MS:waitingForInstall&&wait?wait.from+wait.ms:null;
 useEffect(()=>{
  if(deadline===null)return;
  const t=setTimeout(refresh,Math.max(0,deadline-Date.now())+50);
  return()=>clearTimeout(t);
 },[deadline,refresh]);
 let setup:WatchSetup;
 if(!status.supported)setup='unsupported';
 else if(!status.activated)setup=confirmed?'ready':now>=opened.current+CHECK_MS?'unknown':'checking';
 else if(!status.paired)setup='notPaired';
 else if(status.installed)setup='ready';
 else if(confirmed)setup='notInstalled';
 else setup=wait&&now>=wait.from+wait.ms?'notInstalled':'installing';
 const checkAgain=useCallback(()=>{
  opened.current=Date.now();
  const s=getWatchStatus();
  setStatus(s);setNow(Date.now());
  if(s.activated&&s.paired&&!s.installed)setWait({from:Date.now(),ms:RECHECK_WAIT_MS});
 },[]);
 return {setup,status,checkAgain};
}

const INSTALL_STEPS=['Open the Watch app on your iPhone.','On the My Watch tab, scroll down to Available Apps.','Tap Install next to MoodPals.'];
const PAIR_STEPS=['Open the Watch app on your iPhone.','Tap Pair New Watch and follow the steps.','MoodPals installs on your watch automatically.'];

function Steps({steps}:{steps:string[]}){
 return <View style={{gap:6}}>{steps.map((t,i)=><View key={t} style={{flexDirection:'row',gap:8}}>
  <View style={st.num}><Text style={st.numText}>{i+1}</Text></View><Text style={[st.body,{flex:1}]}>{t}</Text>
 </View>)}</View>;
}

export function WatchSetupCard({setup,linked,onLink,onCheckAgain}:{setup:WatchSetup;linked:boolean|null;onLink?:()=>void;onCheckAgain:()=>void}){
 const icon=(name:React.ComponentProps<typeof Ionicons>['name'],color:string,bg:string)=><View style={[st.icon,{backgroundColor:bg}]}><Ionicons name={name} size={24} color={color}/></View>;
 const head=(title:string,body:string,left:React.ReactNode,right?:React.ReactNode)=><View style={st.row}>
  {left}
  <View style={{flex:1,gap:3}}><Text style={st.title} accessibilityRole="header">{title}</Text><Text style={st.body}>{body}</Text></View>
  {right}
 </View>;
 const again=<TouchableOpacity accessibilityRole="button" onPress={onCheckAgain} style={st.secondary}><Text style={st.secondaryText}>Check again</Text></TouchableOpacity>;
 if(setup==='checking')return <View style={st.card}>{head('Checking your Apple Watch','One moment…',icon('watch-outline',purple,'#F0ECFA'),<ActivityIndicator color={purple}/>)}</View>;
 if(setup==='ready')return <View style={st.card}>
  {head('Apple Watch Ready',linked?'MoodPals is ready to use on your Apple Watch and linked to your account.':'MoodPals is ready to use on your Apple Watch.',icon('checkmark-circle',green,'#E3F5EC'))}
  {linked===false&&onLink?<>
   <Text style={st.body}>Link it to your account to sync your moods, theme and Circle.</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Link this iPhone's Apple Watch" onPress={onLink} style={st.primary}><Text style={st.primaryText}>Link my Apple Watch</Text></TouchableOpacity>
  </>:null}
 </View>;
 if(setup==='installing')return <View style={st.card}>
  {head('Setting up MoodPals on your Apple Watch','MoodPals is being installed on your paired Apple Watch. Please wait while setup completes.',icon('watch-outline',purple,'#F0ECFA'),<ActivityIndicator color={purple} accessibilityLabel="Waiting for your Apple Watch"/>)}
  <Text style={st.note}>Keep your Apple Watch close to your iPhone. This screen updates by itself.</Text>
 </View>;
 if(setup==='notInstalled')return <View style={st.card}>
  {head('Install MoodPals on your Apple Watch',"Your Apple Watch is paired, but MoodPals isn't on it yet.",icon('download-outline',purple,'#F0ECFA'))}
  <Steps steps={INSTALL_STEPS}/>
  <Text style={st.note}>Tip: in the Watch app, General → Automatic App Install keeps MoodPals on your watch and up to date.</Text>
  {again}
 </View>;
 if(setup==='notPaired')return <View style={st.card}>
  {head('Apple Watch Not Connected','Pair your Apple Watch with your iPhone to use MoodPals on your watch.',icon('watch-outline','#9A90B0','#F1EFF5'))}
  <Steps steps={PAIR_STEPS}/>
  <Text style={st.note}>Setting up a watch for a family member? Add it under Family Watches below.</Text>
  {again}
 </View>;
 if(setup==='unknown')return <View style={st.card}>
  {head("Couldn't check your Apple Watch","Open the Watch app on your iPhone to make sure your watch is paired and MoodPals is installed.",icon('watch-outline','#9A90B0','#F1EFF5'))}
  {again}
 </View>;
 return <View style={st.card}>{head('Apple Watch needs an iPhone','Use MoodPals on the iPhone your Apple Watch is paired with. Family watches can still be added below.',icon('watch-outline','#9A90B0','#F1EFF5'))}</View>;
}

const st=StyleSheet.create({
 card:{backgroundColor:'white',borderRadius:22,padding:16,gap:12,borderWidth:1,borderColor:'#ECE6F7'},
 row:{flexDirection:'row',alignItems:'center',gap:12},
 icon:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center'},
 title:{fontWeight:'900',fontSize:16,color:ink},
 body:{fontSize:13,lineHeight:19,color:'#6F6684'},
 note:{fontSize:12,lineHeight:18,color:'#8A819E'},
 num:{width:20,height:20,borderRadius:10,backgroundColor:'#F0ECFA',alignItems:'center',justifyContent:'center',marginTop:0},
 numText:{fontSize:11,fontWeight:'900',color:purple},
 primary:{backgroundColor:purple,borderRadius:14,minHeight:46,alignItems:'center',justifyContent:'center'},
 primaryText:{color:'white',fontWeight:'900'},
 secondary:{alignSelf:'flex-start',borderRadius:12,borderWidth:1,borderColor:'#DCD5EA',paddingHorizontal:16,minHeight:40,justifyContent:'center'},
 secondaryText:{color:purple,fontWeight:'800'},
});
