import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Alert,AppState,Animated,Easing,AccessibilityInfo} from 'react-native';
import Svg,{Circle,Defs,RadialGradient,Stop} from 'react-native-svg';
import {Ionicons} from '@expo/vector-icons';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';

const exercises=[
 {id:'calm',name:'Calm breathing',subtitle:'Gentle 4–4 rhythm',mascot:'calm',inhale:4,hold:0,exhale:4},
 {id:'box',name:'Box breathing',subtitle:'4–4–4–4 rhythm',mascot:'joy',inhale:4,hold:4,exhale:4,holdAfter:4},
 {id:'unwind',name:'Unwind',subtitle:'Slow 4–6 rhythm',mascot:'tired',inhale:4,hold:0,exhale:6}
] as const;
type Exercise=typeof exercises[number];
type Step={kind:'in'|'hold'|'out';name:string;time:number};
const MINT='#34B37E',MINT_DEEP='#23966A',MINT_SOFT='#E4F6EA',INK='#2E1F5E',LAVENDER='#8276A5',LAV_BORDER='#E6DDF7',CREAM='#FFFAF2';
const SMALL=0.84,LARGE=1;

export default function BreathingStudio({onDone}:{accent?:string;tint?:string;onDone?:()=>void}){
 const [selected,setSelected]=useState<Exercise>(exercises[0]),[duration,setDuration]=useState(1);
 const [remaining,setRemaining]=useState(60),[elapsed,setElapsed]=useState(0),[running,setRunning]=useState(false),[saving,setSaving]=useState(false),[completed,setCompleted]=useState(false);
 const [reduceMotion,setReduceMotion]=useState(false);
 const scale=useRef(new Animated.Value(0.92)).current;
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>{setRemaining(v=>Math.max(0,v-1));setElapsed(v=>v+1)},1000);return()=>clearInterval(timer)},[running]);
 useEffect(()=>{if(running&&remaining===0){setRunning(false);setCompleted(true);void persist(duration)}},[remaining,running]);
 useEffect(()=>{const sub=AppState.addEventListener('change',status=>{if(status!=='active')setRunning(false)});return()=>sub.remove()},[]);
 useEffect(()=>{let on=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(on)setReduceMotion(v)});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);return()=>{on=false;sub.remove()}},[]);
 async function persist(minutes:number){
  setSaving(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in again');
   const {error}=await supabase.from('habit_entries').insert({user_id:user.id,habit:'mindfulness',amount:minutes,unit:'minutes'});if(error)throw error;
  }catch(e:any){Alert.alert('Session not saved',e?.message??'Check your connection and try again.')}finally{setSaving(false)}
 }
 function reset(){setRunning(false);setRemaining(duration*60);setElapsed(0);setCompleted(false)}
 function chooseRoutine(item:Exercise){setSelected(item);reset()}
 function chooseDuration(n:number){setDuration(n);setRemaining(n*60);setElapsed(0);setCompleted(false);setRunning(false)}
 const steps:Step[]=([{kind:'in',name:'Breathe in',time:selected.inhale},{kind:'hold',name:'Hold',time:selected.hold},{kind:'out',name:'Breathe out',time:selected.exhale},{kind:'hold',name:'Hold',time:'holdAfter' in selected?selected.holdAfter:0}] as Step[]).filter(s=>s.time>0);
 const cycle=steps.reduce((n,x)=>n+x.time,0);
 let t=elapsed%cycle,stepIndex=0;
 for(let i=0;i<steps.length;i++){if(t<steps[i].time){stepIndex=i;break}t-=steps[i].time}
 const step=steps[stepIndex];
 const active=running||(elapsed>0&&!completed);
 // Inhale grows, exhale shrinks, holds stay put; one animation per phase so it stays in sync with the 1 s timer.
 useEffect(()=>{
  if(!running){Animated.timing(scale,{toValue:0.92,duration:reduceMotion?0:400,useNativeDriver:true}).start();return;}
  if(reduceMotion){scale.setValue(step.kind==='in'?LARGE:step.kind==='out'?SMALL:(stepIndex>0&&steps[stepIndex-1].kind==='in'?LARGE:SMALL));return;}
  if(step.kind==='hold')return;
  Animated.timing(scale,{toValue:step.kind==='in'?LARGE:SMALL,duration:(step.time-t)*1000,easing:Easing.inOut(Easing.sin),useNativeDriver:true}).start();
 },[running,stepIndex,elapsed===0,reduceMotion,selected.id]);
 const clock=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 const phaseText=completed?'Great job!':running?step.name:elapsed>0?'Paused':'Ready to breathe?';
 return <View style={s.wrap}>
  <View pointerEvents="none" style={[s.blob,{width:220,height:220,right:-70,top:-60}]}/>
  <View pointerEvents="none" style={[s.blob,{width:180,height:180,left:-80,bottom:120}]}/>
  <View style={s.header}>
   <View style={{flex:1,gap:6}}>
    <Text accessibilityRole="header" style={s.title}>Breathing for Calm</Text>
    <Text style={s.desc}>A simple breathing exercise to help you feel calm, focused, and present.</Text>
   </View>
   <SuperdotMascot id="calm" size={70} animate={false}/>
  </View>

  <View style={s.card}>
   <Text style={s.label}>Choose a routine</Text>
   <View accessibilityRole="radiogroup" style={{gap:9}}>{exercises.map(item=>{const on=selected.id===item.id;return <TouchableOpacity key={item.id} disabled={running} accessibilityRole="radio" accessibilityState={{selected:on,disabled:running}} accessibilityLabel={item.name+', '+item.subtitle} onPress={()=>chooseRoutine(item)} style={[s.routine,on&&s.routineOn,running&&!on&&{opacity:.55}]}>
    <SuperdotMascot id={item.mascot} size={46} animate={false}/>
    <View style={{flex:1,gap:2}}><Text style={[s.routineName,on&&{color:MINT_DEEP}]}>{item.name}</Text><Text style={s.routineSub}>{item.subtitle}</Text></View>
    {on?<Ionicons name="checkmark-circle" size={26} color={MINT}/>:null}
   </TouchableOpacity>})}</View>

   <Text style={s.label}>Session length</Text>
   <View accessibilityRole="radiogroup" style={s.lengths}>{[1,3,5].map(n=>{const on=duration===n;return <TouchableOpacity key={n} disabled={running} accessibilityRole="radio" accessibilityState={{selected:on,disabled:running}} accessibilityLabel={n+(n===1?' minute':' minutes')+' session'} onPress={()=>chooseDuration(n)} style={[s.length,on&&s.lengthOn,running&&!on&&{opacity:.55}]}><Text style={[s.lengthText,on&&{color:'#fff'}]}>{n} min</Text></TouchableOpacity>})}</View>

   <View accessible accessibilityLabel={phaseText+', '+Math.floor(remaining/60)+' minutes '+remaining%60+' seconds left'} accessibilityLiveRegion="polite" style={s.visual}>
    <View style={s.halo}/>
    <Animated.View style={[s.orb,{transform:[{scale}]}]}>
     <Svg width={216} height={216} viewBox="0 0 216 216" style={StyleSheet.absoluteFill}><Defs><RadialGradient id="orb" cx="50%" cy="38%" r="65%"><Stop offset="0" stopColor="#6FD3A6"/><Stop offset="1" stopColor={MINT_DEEP}/></RadialGradient></Defs><Circle cx="108" cy="108" r="100" fill="url(#orb)"/><Circle cx="108" cy="108" r="104" fill="none" stroke="#FFFFFF" strokeWidth="7"/></Svg>
     <SuperdotMascot id="calm" size={92} animate={running&&!reduceMotion}/>
     <Text style={s.phase}>{phaseText}</Text>
     <Text style={s.countdown}>{completed?'00:00':clock}</Text>
    </Animated.View>
   </View>

   {completed?<>
    <Text style={s.doneText}>You took a moment for yourself.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={saving} style={s.start} onPress={()=>{reset();onDone?.()}}><Text style={s.startText}>{saving?'Saving…':'Done'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={reset} style={s.textBtn}><Text style={s.textBtnLabel}>Breathe again</Text></TouchableOpacity>
   </>:<>
    <TouchableOpacity accessibilityRole="button" style={s.start} onPress={()=>setRunning(v=>!v)}><Ionicons name={running?'pause':'play'} size={22} color="#fff"/><Text style={s.startText}>{running?'Pause breathing':active?'Resume breathing':'Start breathing'}</Text></TouchableOpacity>
    {active?<TouchableOpacity accessibilityRole="button" onPress={reset} style={s.textBtn}><Text style={s.textBtnLabel}>End session</Text></TouchableOpacity>:null}
   </>}
  </View>
  <Text style={s.note}>Sessions pause if you leave the app. Completed sessions are saved to your MoodPals history (not Apple Health yet). This is a relaxation exercise, not a medical treatment.</Text>
 </View>;
}
const shadow={shadowColor:'#2E1F5E',shadowOpacity:.08,shadowRadius:10,shadowOffset:{width:0,height:4}};
const s=StyleSheet.create({
 wrap:{borderRadius:28,padding:16,gap:14,backgroundColor:CREAM,overflow:'hidden'},
 blob:{position:'absolute',borderRadius:999,backgroundColor:MINT_SOFT,opacity:.7},
 header:{flexDirection:'row',alignItems:'center',gap:8,paddingTop:4},
 title:{fontSize:25,lineHeight:30,color:INK,fontWeight:'900'},
 desc:{fontSize:14,color:LAVENDER,lineHeight:20},
 card:{backgroundColor:'rgba(255,255,255,.82)',borderRadius:26,padding:14,gap:12,borderWidth:1,borderColor:'#F1ECF8',...shadow},
 label:{fontSize:16,fontWeight:'900',color:INK,marginTop:4},
 routine:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,borderColor:LAV_BORDER,borderWidth:1.5,borderRadius:18,paddingVertical:8,paddingHorizontal:12,backgroundColor:'#FFFDF9'},
 routineOn:{borderColor:MINT,borderWidth:2,backgroundColor:'#EEF9F2'},
 routineName:{fontSize:16,fontWeight:'900',color:INK},
 routineSub:{fontSize:13,color:LAVENDER,fontWeight:'600'},
 lengths:{flexDirection:'row',gap:9},
 length:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:23,backgroundColor:'#fff',borderWidth:1,borderColor:'#F0EBF7',...shadow},
 lengthOn:{backgroundColor:MINT,borderColor:MINT},
 lengthText:{fontSize:15,color:'#5B3FA8',fontWeight:'900'},
 visual:{height:268,alignItems:'center',justifyContent:'center',marginVertical:4},
 halo:{position:'absolute',width:258,height:258,borderRadius:129,backgroundColor:MINT_SOFT,borderWidth:10,borderColor:'rgba(255,255,255,.9)'},
 orb:{width:216,height:216,borderRadius:108,alignItems:'center',justifyContent:'center',shadowColor:MINT_DEEP,shadowOpacity:.35,shadowRadius:18,shadowOffset:{width:0,height:8}},
 phase:{color:'#fff',fontSize:16,fontWeight:'900',marginTop:2,textAlign:'center'},
 countdown:{color:'#fff',fontSize:34,fontWeight:'900',fontVariant:['tabular-nums']},
 doneText:{color:LAVENDER,fontSize:14,textAlign:'center',fontWeight:'600'},
 start:{flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center',minHeight:58,borderRadius:29,backgroundColor:MINT,...shadow,shadowColor:MINT_DEEP,shadowOpacity:.3},
 startText:{color:'#fff',fontWeight:'900',fontSize:18},
 textBtn:{alignSelf:'center',minHeight:44,justifyContent:'center',paddingHorizontal:16},
 textBtnLabel:{color:MINT_DEEP,fontWeight:'800',fontSize:15},
 note:{color:LAVENDER,fontSize:11,textAlign:'center',lineHeight:16,paddingHorizontal:8}
});
