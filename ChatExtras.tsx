import React,{useEffect,useRef} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Animated} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useStress,SW} from './StressDashboard';
import {STRESS_LEVELS,formatMinutes} from './StressEngine';

export type ChatAction='breathing'|'water'|'trends'|'reminders';
export const ACTION_META:Record<ChatAction,{label:string;icon:any}>={
 breathing:{label:'Breathing break',icon:'leaf-outline'},water:{label:'Log water',icon:'water-outline'},
 trends:{label:'See my trends',icon:'stats-chart-outline'},reminders:{label:'Set a reminder',icon:'notifications-outline'}
};
export function actionsFor(text:string):ChatAction[]{
 const t=text.toLowerCase(),out:ChatAction[]=[];
 if(/breath|calm down|relax|mindful|meditat/.test(t))out.push('breathing');
 if(/water|hydrat/.test(t))out.push('water');
 if(/\bhrv\b|trend|pattern|over the (past|last) week/.test(t))out.push('trends');
 if(/remind|routine|schedule|bedtime/.test(t))out.push('reminders');
 return out.slice(0,3);
}

// Today's readings, shown above the chat and sent to the assistant as context.
export function useStressContext(){
 const {today,readings,baseline}=useStress();
 const now=Date.now();
 const sleep=readings.find(r=>r.metric==='sleep_minutes'&&now-new Date(r.recorded_at).getTime()<36*3600000)?.value??null;
 const hrv=readings.find(r=>r.metric==='hrv')?.value??null;
 const rhr=readings.find(r=>r.metric==='resting_heart_rate')?.value??null;
 const level=today?STRESS_LEVELS[today.level]:null;
 const sl=sleep!==null?formatMinutes(sleep):null;
 const chips=[
  {icon:'pulse',label:level?`${level.label} · ${today!.score}`:baseline.ready?'No score today':'Calibrating',color:level?.color||SW.muted},
  ...(hrv!==null?[{icon:'heart',label:`HRV ${Math.round(hrv)} ms`,color:'#EE6F86'}]:[]),
  ...(sl?[{icon:'moon',label:`Slept ${sl.h}h ${sl.m}m`,color:'#6C63E0'}]:[])
 ];
 const parts=[
  level?`Today's MoodPals stress level: ${level.label} (${today!.score}/100, relative to the user's own 21-day HRV/resting HR baseline; not a medical measure).`:'No stress score today.',
  hrv!==null?`Latest HRV ${Math.round(hrv)} ms${baseline.baseline?` (21-day median ${Math.round(baseline.baseline)} ms)`:''}.`:'',
  rhr!==null?`Resting heart rate ${Math.round(rhr)} bpm.`:'',
  sl?`Last sleep ${sl.h}h ${sl.m}m.`:''
 ];
 return {chips,text:parts.filter(Boolean).join(' ').slice(0,800),level:today?.level||null};
}

export function StressContextBar({chips}:{chips:{icon:string;label:string;color:string}[]}){
 return <View style={st.bar}>{chips.map(c=><View key={c.label} style={st.ctx}><Ionicons name={c.icon as any} size={13} color={c.color}/><Text style={[st.ctxText,{color:c.color}]}>{c.label}</Text></View>)}</View>;
}

export function promptsFor(level:string|null){
 const base=['How did I sleep?','What helped last time I felt like this?','Plan a calmer afternoon'];
 return [level==='elevated'||level==='overload'?'Why is my stress high today?':level?'What does my stress score mean today?':'How does the stress score work?',...base];
}

export function TypingBubble(){
 const dots=[useRef(new Animated.Value(0.3)).current,useRef(new Animated.Value(0.3)).current,useRef(new Animated.Value(0.3)).current];
 useEffect(()=>{const loops=dots.map((d,i)=>Animated.loop(Animated.sequence([Animated.delay(i*150),Animated.timing(d,{toValue:1,duration:300,useNativeDriver:true}),Animated.timing(d,{toValue:0.3,duration:300,useNativeDriver:true}),Animated.delay((2-i)*150)])));loops.forEach(l=>l.start());return()=>loops.forEach(l=>l.stop())},[]);
 return <View accessibilityLabel="MoodPal is typing" style={st.typing}>{dots.map((d,i)=><Animated.View key={i} style={[st.dot,{opacity:d}]}/>)}</View>;
}

const st=StyleSheet.create({
 bar:{flexDirection:'row',flexWrap:'wrap',gap:6},ctx:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:SW.bg,borderRadius:12,paddingHorizontal:9,paddingVertical:5},ctxText:{fontSize:11,fontWeight:'800'},
 typing:{alignSelf:'flex-start',flexDirection:'row',gap:5,backgroundColor:'#F2F4F4',borderRadius:15,paddingHorizontal:14,paddingVertical:14},dot:{width:7,height:7,borderRadius:4,backgroundColor:SW.muted}
});
