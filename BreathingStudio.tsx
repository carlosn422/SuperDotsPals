import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Alert,AppState} from 'react-native';
import Svg,{Circle} from 'react-native-svg';
import {supabase} from './supabase';

const exercises=[
 {id:'calm',name:'Calm breathing',subtitle:'Gentle 4–4 rhythm',inhale:4,hold:0,exhale:4},
 {id:'box',name:'Box breathing',subtitle:'4–4–4–4 rhythm',inhale:4,hold:4,exhale:4,holdAfter:4},
 {id:'unwind',name:'Unwind',subtitle:'Slow 4–6 rhythm',inhale:4,hold:0,exhale:6}
] as const;
type Exercise=typeof exercises[number];
export default function BreathingStudio({accent='#7139E9',tint='#EEE5FF'}:{accent?:string;tint?:string}){
 const [selected,setSelected]=useState<Exercise>(exercises[0]),[duration,setDuration]=useState(1);
 const [remaining,setRemaining]=useState(60),[elapsed,setElapsed]=useState(0),[running,setRunning]=useState(false),[saving,setSaving]=useState(false),[completed,setCompleted]=useState(false);
 const [logged,setLogged]=useState(0);const live=useRef(false);
 useEffect(()=>{live.current=running},[running]);
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>{setRemaining(v=>Math.max(0,v-1));setElapsed(v=>v+1)},1000);return()=>clearInterval(timer)},[running]);
 useEffect(()=>{if(running&&remaining===0){setRunning(false);setCompleted(true);void persist(duration)}},[remaining,running]);
 useEffect(()=>{const sub=AppState.addEventListener('change',status=>{if(status!=='active')setRunning(false)});return()=>sub.remove()},[]);
 async function persist(minutes:number){
  setSaving(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in again');
   const {error}=await supabase.from('habit_entries').insert({user_id:user.id,habit:'mindfulness',amount:minutes,unit:'minutes'});if(error)throw error;
   setLogged(n=>n+minutes);
  }catch(e:any){Alert.alert('Session not saved',e?.message??'Check your connection and try again.')}finally{setSaving(false)}
 }
 function reset(){setRunning(false);setRemaining(duration*60);setElapsed(0);setCompleted(false)}
 function chooseDuration(n:number){setDuration(n);setRemaining(n*60);setElapsed(0);setCompleted(false);setRunning(false)}
 function phase(){
  const steps=[{name:'Breathe in',time:selected.inhale},{name:'Hold gently',time:selected.hold},{name:'Breathe out',time:selected.exhale},{name:'Rest',time:'holdAfter' in selected?selected.holdAfter:0}].filter(s=>s.time>0);
  const total=steps.reduce((n,x)=>n+x.time,0);let t=elapsed%total;
  for(const s of steps){if(t<s.time)return {name:s.name,progress:t/s.time};t-=s.time}
  return {name:'Breathe gently',progress:0};
 }
 const state=phase();
 return <View style={[s.wrap,{backgroundColor:tint}]}>
  <Text style={[s.eyebrow,{color:accent}]}>✦ MOODPALS MINDFULNESS</Text>
  <Text style={s.title}>A moment for you</Text>
  <Text style={s.desc}>Follow your buddy's breathing rhythm. This is a relaxation exercise, not a medical treatment.</Text>
  <Text style={s.label}>Choose a routine</Text>
  <View style={s.routines}>{exercises.map(item=><TouchableOpacity key={item.id} onPress={()=>{setSelected(item);reset()}} style={[s.routine,selected.id===item.id&&{borderColor:accent,backgroundColor:'#FFFFFF'}]}><Text style={[s.routineName,{color:selected.id===item.id?accent:'#312257'}]}>{item.name}</Text><Text style={s.routineSub}>{item.subtitle}</Text></TouchableOpacity>)}</View>
  <Text style={s.label}>Session length</Text>
  <View style={s.lengths}>{[1,3,5].map(n=><TouchableOpacity key={n} onPress={()=>chooseDuration(n)} style={[s.length,duration===n&&{backgroundColor:accent}]}><Text style={[s.lengthText,duration===n&&{color:'#fff'}]}>{n} min</Text></TouchableOpacity>)}</View>
  <View style={s.visual}><Svg width={220} height={220} viewBox="0 0 220 220"><Circle cx="110" cy="110" r="102" fill="none" stroke="#FFFFFF" strokeWidth="9" opacity=".85"/><Circle cx="110" cy="110" r={running?(state.name==='Breathe in'?70+state.progress*19:state.name==='Breathe out'?89-state.progress*19:82):80} fill={accent} opacity=".86"/><Circle cx="88" cy="99" r="8" fill="white"/><Circle cx="132" cy="99" r="8" fill="white"/></Svg><View style={s.visualText}><Text style={s.phase}>{completed?'All done! ✨':running?state.name:'Ready to breathe?'}</Text><Text style={s.countdown}>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</Text></View></View>
  <TouchableOpacity disabled={saving} style={[s.start,{backgroundColor:accent}]} onPress={()=>{if(completed){reset();return}setRunning(v=>!v)}}><Text style={s.startText}>{saving?'Saving...':completed?'Start another session':running?'Pause':'Start breathing'}</Text></TouchableOpacity>
  {(elapsed>0&&!completed)?<TouchableOpacity onPress={reset}><Text style={[s.reset,{color:accent}]}>Reset session</Text></TouchableOpacity>:null}
  {completed?<Text style={s.saved}>Your completed session was sent to your private Supabase mindfulness history.</Text>:null}
  {logged>0?<Text style={s.saved}>Logged during this visit: {logged} minutes</Text>:null}
  <Text style={s.note}>Timer-based prototype. Background sessions pause; Apple Health Mindful Session synchronization is not connected yet.</Text>
 </View>;
}
const s=StyleSheet.create({wrap:{borderRadius:26,padding:18,alignItems:'center',gap:12},eyebrow:{fontSize:10,letterSpacing:1.6,fontWeight:'900'},title:{fontSize:24,color:'#25145C',fontWeight:'900'},desc:{fontSize:12,color:'#8276A5',textAlign:'center',lineHeight:18},label:{fontSize:12,fontWeight:'800',color:'#25145C',alignSelf:'flex-start',marginTop:7},routines:{gap:7,width:'100%'},routine:{borderColor:'#E1D5FA',borderWidth:2,borderRadius:14,padding:11},routineName:{fontSize:13,fontWeight:'800'},routineSub:{fontSize:10,color:'#8276A5',marginTop:2},lengths:{flexDirection:'row',gap:8,width:'100%'},length:{backgroundColor:'#fff',flex:1,alignItems:'center',padding:10,borderRadius:13},lengthText:{fontSize:12,color:'#5B4996',fontWeight:'800'},visual:{width:220,height:220,alignItems:'center',justifyContent:'center'},visualText:{position:'absolute',alignItems:'center',top:119},phase:{color:'#fff',fontSize:12,fontWeight:'800'},countdown:{color:'#fff',fontSize:21,fontWeight:'900'},start:{width:'100%',borderRadius:16,padding:15,alignItems:'center'},startText:{color:'#fff',fontWeight:'900'},reset:{fontSize:12,fontWeight:'800'},note:{color:'#8276A5',fontSize:10,textAlign:'center',lineHeight:16},saved:{color:'#5B4996',fontSize:11,textAlign:'center'}});
