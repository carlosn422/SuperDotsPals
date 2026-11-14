import React,{useEffect,useState} from 'react';
import {Modal,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Svg,{Circle,Defs,LinearGradient,Rect,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import SuperdotMascot from './SuperdotMascot';
import {supabase} from './supabase';
import type {Metric,Reading} from './HealthDataPanel';
import {FREE_HEALTH_DAYS,PLUS_HEALTH_DAYS,usePlus} from './PlusStore';
import {PlusPaywallSheet} from './PlusPaywall';
import {median,noiseLabel,sameDay,sleepQuality} from './StressEngine';

export type HealthKind='sleep'|'fitness'|'daylight'|'steps'|'mindfulness'|'noise';
export type GoalKey='sleep'|'move'|'exercise'|'stand'|'daylight'|'steps'|'mindfulness';
type Period='D'|'W'|'M';

const INK='#1D2B33',MUTED='#6E7D86',BG='#F4FAF6',LINE='#E6EEEA';
export const hm=(minutes:number)=>{const r=Math.round(minutes),h=Math.floor(r/60),m=r%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`};
const fmtNum=(v:number)=>Math.round(v).toLocaleString();

export const GOAL_DEFAULTS:Record<GoalKey,number>={sleep:420,move:500,exercise:30,stand:12,daylight:20,steps:10000,mindfulness:10};
const GOAL_INFO:Record<GoalKey,{label:string;step:number;min:number;max:number;fmt:(v:number)=>string}>={
 sleep:{label:'Sleep goal',step:30,min:240,max:720,fmt:hm},
 move:{label:'Move goal',step:10,min:50,max:2000,fmt:v=>v+' cal'},
 exercise:{label:'Exercise goal',step:5,min:5,max:240,fmt:v=>v+'m'},
 stand:{label:'Stand goal',step:1,min:1,max:24,fmt:v=>v+'h'},
 daylight:{label:'Daily goal',step:5,min:5,max:240,fmt:v=>v+'m'},
 steps:{label:'Daily goal',step:500,min:1000,max:50000,fmt:fmtNum},
 mindfulness:{label:'Daily goal',step:5,min:5,max:120,fmt:v=>v+'m'},
};

const GOALS_KEY='moodpals-health-goals';
let goalCache:Record<GoalKey,number>={...GOAL_DEFAULTS};
let goalsLoaded=false;
const goalListeners=new Set<(g:Record<GoalKey,number>)=>void>();
export function useHealthGoals(){
 const [goals,setGoals]=useState(goalCache);
 useEffect(()=>{
  goalListeners.add(setGoals);
  if(!goalsLoaded){goalsLoaded=true;AsyncStorage.getItem(GOALS_KEY).then(v=>{if(!v)return;goalCache={...GOAL_DEFAULTS,...JSON.parse(v)};goalListeners.forEach(l=>l(goalCache))}).catch(()=>{})}
  return()=>{goalListeners.delete(setGoals)};
 },[]);
 const setGoal=(k:GoalKey,v:number)=>{goalCache={...goalCache,[k]:v};goalListeners.forEach(l=>l(goalCache));void AsyncStorage.setItem(GOALS_KEY,JSON.stringify(goalCache)).catch(()=>{})};
 return {goals,setGoal};
}

// Minutes logged with the in-app breathing exercises, by day.
const mindful=(health:number|null,app?:number)=>health===null&&!app?null:(health||0)+(app||0);
export function useAppMindfulness(days:number,refresh?:unknown){
 const [byDay,setByDay]=useState<Record<string,number>>({});
 useEffect(()=>{let alive=true;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const start=addDays(new Date(),-(days-1));start.setHours(0,0,0,0);
  const {data,error}=await supabase.from('habit_entries').select('amount,recorded_at').eq('user_id',user.id).eq('habit','mindfulness').gte('recorded_at',start.toISOString());
  if(error||!alive)return;
  const m:Record<string,number>={};(data||[]).forEach(r=>{const k=new Date(r.recorded_at).toDateString();m[k]=(m[k]||0)+Number(r.amount||0)});
  setByDay(m);
 })();return()=>{alive=false}},[days,refresh]);
 return byDay;
}

export const noon=(d:Date)=>{const x=new Date(d);x.setHours(12,0,0,0);return x};
export const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
export function dayValue(readings:Reading[],metric:Metric,day:Date){return readings.find(r=>r.metric===metric&&sameDay(new Date(r.recorded_at),day))?.value??null}

const KIND:Record<HealthKind,{title:string;icon:React.ComponentProps<typeof Ionicons>['name'];color:string;tint:string;metric:Metric;goals:GoalKey[];fmt:(v:number)=>string}>={
 sleep:{title:'Sleep',icon:'moon',color:'#6C63E0',tint:'#E4E1FB',metric:'sleep_minutes',goals:['sleep'],fmt:hm},
 fitness:{title:'Fitness',icon:'flame',color:'#F2685A',tint:'#FCE3DF',metric:'active_energy_kcal',goals:['move','exercise','stand'],fmt:v=>fmtNum(v)+' cal'},
 daylight:{title:'Daylight',icon:'sunny',color:'#F4A83A',tint:'#FDF0D6',metric:'daylight_minutes',goals:['daylight'],fmt:v=>Math.round(v)+'m'},
 steps:{title:'Steps',icon:'footsteps',color:'#34B37E',tint:'#D9F2E2',metric:'steps',goals:['steps'],fmt:fmtNum},
 mindfulness:{title:'Mindfulness',icon:'flower',color:'#4FA9E8',tint:'#DDEEFB',metric:'mindfulness_minutes',goals:['mindfulness'],fmt:v=>Math.round(v)+'m'},
 noise:{title:'Noise Levels',icon:'ear',color:'#E58A6C',tint:'#FBE6DE',metric:'noise_db',goals:[],fmt:v=>Math.round(v)+' dB'},
};
const FIT:{metric:Metric;goal:GoalKey;label:string;color:string;icon:React.ComponentProps<typeof Ionicons>['name'];unit:string}[]=[
 {metric:'active_energy_kcal',goal:'move',label:'Move',color:'#F2685A',icon:'arrow-forward',unit:'cal'},
 {metric:'exercise_minutes',goal:'exercise',label:'Exercise',color:'#5CC15A',icon:'play-forward',unit:'m'},
 {metric:'stand_hours',goal:'stand',label:'Stand',color:'#3BB5D8',icon:'arrow-up',unit:'h'},
];
const STAGES:{metric:Metric;label:string;color:string}[]=[
 {metric:'sleep_awake_minutes',label:'Awake',color:'#F7A072'},
 {metric:'sleep_rem_minutes',label:'REM',color:'#7FD3F7'},
 {metric:'sleep_core_minutes',label:'Core',color:'#7B83F2'},
 {metric:'sleep_deep_minutes',label:'Deep',color:'#4A3FB8'},
];
const avg=(vals:(number|null)[])=>{const v=vals.filter((x):x is number=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};

export default function HealthDetail({kind,initialDay,readings,onClose,onAskAI,onBreathing}:{kind:HealthKind|null;initialDay:Date;readings:Reading[];onClose:()=>void;onAskAI:()=>void;onBreathing?:()=>void}){
 return <Modal visible={!!kind} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  {kind?<DetailBody kind={kind} initialDay={initialDay} readings={readings} onClose={onClose} onAskAI={onAskAI} onBreathing={onBreathing}/>:null}
  {kind?<PlusPaywallSheet nested/>:null}
 </Modal>;
}

function DetailBody({kind,initialDay,readings,onClose,onAskAI,onBreathing}:{kind:HealthKind;initialDay:Date;readings:Reading[];onClose:()=>void;onAskAI:()=>void;onBreathing?:()=>void}){
 const {isPlus,showPaywall}=usePlus();
 const {goals,setGoal}=useHealthGoals();
 const insets=useSafeAreaInsets();
 const k=KIND[kind];
 const today=noon(new Date());
 const limit=isPlus?PLUS_HEALTH_DAYS:FREE_HEALTH_DAYS;
 const minDay=addDays(today,-(limit-1));
 const [day,setDay]=useState(()=>noon(initialDay));
 const [period,setPeriod]=useState<Period>('D');
 const [page,setPage]=useState<'main'|'goals'>('main');
 const [picker,setPicker]=useState(false);
 const app=useAppMindfulness(limit,readings);
 const span=period==='D'?1:period==='W'?7:30;
 const choosePeriod=(p:Period)=>{if(!isPlus&&p!=='D'){showPaywall('trends');return}setPicker(false);setPeriod(p)};
 const val=(m:Metric,d:Date)=>m==='mindfulness_minutes'?mindful(dayValue(readings,m,d),app[d.toDateString()]):dayValue(readings,m,d);
 const days=Array.from({length:span},(_,i)=>addDays(day,i-(span-1))).filter(d=>d>=minDay);
 const series=(m:Metric)=>days.map(d=>val(m,d));
 const value=(m:Metric)=>period==='D'?val(m,day):avg(series(m));
 const canBack=addDays(day,-span)>=minDay,canForward=day<today;
 const back=()=>{if(canBack)setDay(addDays(day,-span));else if(!isPlus)showPaywall('health')};
 const forward=()=>{if(canForward){const n=addDays(day,span);setDay(n>today?today:n)}};
 const dateLabel=period==='D'?day.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):`${days[0].toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${day.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
 const main=value(k.metric);
 const goal=k.goals[0]?goals[k.goals[0]]:null;
 const ask=()=>{onClose();onAskAI()};

 if(page==='goals')return <View style={{flex:1,backgroundColor:BG,paddingTop:insets.top+8}}>
  <View style={st.goalHead}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={()=>setPage('main')} style={st.round}><Ionicons name="arrow-back" size={22} color={k.color}/></TouchableOpacity><Text style={st.goalTitle}>{k.title}</Text><View style={{width:46}}/></View>
  <View style={[st.card,{marginHorizontal:18,paddingVertical:6}]}>
   {k.goals.map((g,i)=>{const info=GOAL_INFO[g],v=goals[g];return <View key={g} style={[st.goalRow,i>0&&{borderTopWidth:1,borderTopColor:LINE}]}>
    <Ionicons name="radio-button-on" size={20} color={kind==='fitness'?FIT[i].color:k.color}/>
    <Text style={{flex:1,fontSize:15,color:INK}}>{info.label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Lower '+info.label} disabled={v<=info.min} onPress={()=>setGoal(g,Math.max(info.min,v-info.step))} style={st.step}><Ionicons name="remove" size={18} color={v<=info.min?'#C3CBCF':INK}/></TouchableOpacity>
    <Text style={{fontSize:15,fontWeight:'700',color:INK,minWidth:70,textAlign:'center'}}>{info.fmt(v)}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Raise '+info.label} disabled={v>=info.max} onPress={()=>setGoal(g,Math.min(info.max,v+info.step))} style={st.step}><Ionicons name="add" size={18} color={v>=info.max?'#C3CBCF':INK}/></TouchableOpacity>
   </View>})}
  </View>
  <Text style={[st.muted,{marginHorizontal:24,marginTop:12}]}>Goals are only used inside MoodPals to fill your rings. They don't change your Apple Health or Activity goals.</Text>
 </View>;

 // Ring, status line and insight for the chosen day or period.
 const fit=FIT.map(f=>({...f,key:f.goal,value:value(f.metric),goal:goals[f.goal]}));
 const closed=fit.filter(f=>f.value!==null&&f.value>=f.goal).length;
 const awake=value('sleep_awake_minutes')||0;
 const noData=kind==='fitness'?fit.every(f=>f.value===null):main===null;
 const status=noData?'No Data':kind==='sleep'?sleepQuality(main!,awake):kind==='fitness'?`${closed} of 3 rings closed`:kind==='noise'?noiseLabel(main!):goal&&main!>=goal?'Goal reached':`${Math.round(100*main!/goal!)}% of goal`;
 const insight=insightFor(kind,period,main,goal,fit,awake);
 const mascot=noData?'calm':kind==='noise'?(main!<70?'calm':'anxious'):kind==='fitness'?(closed>=2?'joy':'calm'):goal&&main!>=goal?'joy':kind==='sleep'&&main!<360?'tired':'calm';

 return <View style={{flex:1,backgroundColor:BG}}>
  <Svg width="100%" height={560} style={StyleSheet.absoluteFill as any}><Defs><LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={k.tint}/><Stop offset="1" stopColor={BG}/></LinearGradient></Defs><Rect x="0" y="0" width="100%" height={560} fill="url(#bg)"/></Svg>
  <View style={[st.top,{paddingTop:insets.top+6}]}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Close '+k.title} onPress={onClose} style={st.round}><Ionicons name="close" size={24} color={k.color}/></TouchableOpacity>
   <View style={st.periods}>{(['D','W','M'] as Period[]).map(p=>{const locked=!isPlus&&p!=='D';return <TouchableOpacity key={p} accessibilityRole="button" accessibilityState={{selected:period===p}} accessibilityLabel={(p==='D'?'Day':p==='W'?'Week':'Month')+(locked?', MoodPals Plus':'')} onPress={()=>choosePeriod(p)} style={[st.period,period===p&&{backgroundColor:k.tint}]}>
    <Text style={[st.periodText,period===p&&{color:INK}]}>{p}</Text>{locked?<Ionicons name="lock-closed" size={11} color={MUTED}/>:null}</TouchableOpacity>})}</View>
   {k.goals.length?<TouchableOpacity accessibilityRole="button" accessibilityLabel={k.title+' goals'} onPress={()=>setPage('goals')} style={st.round}><Ionicons name="options-outline" size={22} color={k.color}/></TouchableOpacity>:<View style={{width:46}}/>}
  </View>
  <ScrollView contentContainerStyle={{padding:18,paddingTop:6,gap:16,paddingBottom:insets.bottom+40}} showsVerticalScrollIndicator={false}>
   <View style={st.dateRow}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous" onPress={back} style={[st.arrow,{backgroundColor:k.color+'22',opacity:canBack||!isPlus?1:0.35}]}><Ionicons name="chevron-back" size={18} color={k.color}/></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Choose day, '+dateLabel} onPress={()=>setPicker(p=>!p)} style={{flexDirection:'row',alignItems:'center',gap:4}}><Text style={[st.date,{color:k.color}]}>{dateLabel}</Text><Ionicons name={picker?'chevron-up':'chevron-down'} size={16} color={k.color}/></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next" disabled={!canForward} onPress={forward} style={[st.arrow,{backgroundColor:k.color+'22',opacity:canForward?1:0}]}><Ionicons name="chevron-forward" size={18} color={k.color}/></TouchableOpacity>
   </View>
   {picker?<View style={[st.card,{gap:10}]}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{Array.from({length:limit},(_,i)=>addDays(today,-i)).map(d=>{const on=sameDay(d,day);return <TouchableOpacity key={d.toDateString()} accessibilityRole="button" accessibilityLabel={d.toDateString()} onPress={()=>{setDay(d);setPicker(false)}} style={[st.chip,on&&{backgroundColor:k.color}]}>
     <Text style={{fontSize:10,fontWeight:'700',color:on?'#fff':MUTED}}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</Text><Text style={{fontSize:15,fontWeight:'800',color:on?'#fff':INK}}>{d.getDate()}</Text></TouchableOpacity>})}</View>
    {isPlus?null:<TouchableOpacity accessibilityRole="button" onPress={()=>showPaywall('health')} style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="lock-closed" size={12} color={k.color}/><Text style={{color:k.color,fontWeight:'800',fontSize:12}}>Free shows the last {FREE_HEALTH_DAYS} days. See {PLUS_HEALTH_DAYS} days with MoodPals Plus</Text></TouchableOpacity>}
   </View>:null}

   <View style={{alignItems:'center',gap:10,marginTop:4}}>
    {kind==='fitness'?<Rings size={250} stroke={28} rings={fit.map(f=>({progress:(f.value||0)/f.goal,color:f.color}))}/>:
     <Rings size={250} stroke={30} rings={[{progress:main===null?0:kind==='noise'?Math.min(1,main/100):main/goal!,color:k.color}]}>
      <Ionicons name={k.icon} size={26} color={k.color}/>
      <Text style={st.ringValue}>{main===null?'--':k.fmt(main)}</Text>
      <Text style={st.ringGoal}>{kind==='noise'?(main===null?' ':'average'):'/'+GOAL_INFO[k.goals[0]].fmt(goal!)}</Text>
     </Rings>}
    <Text style={st.status}>{status}</Text>
    {period!=='D'&&!noData?<Text style={st.muted}>Daily average over {series(k.metric).filter(v=>v!==null).length} days with data</Text>:null}
   </View>

   <View style={st.card}>
    {kind==='fitness'?<View style={{flexDirection:'row',justifyContent:'space-between'}}>{fit.map(f=><View key={f.label} style={{gap:2}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:4}}><Ionicons name={f.icon} size={13} color={f.color}/><Text style={{fontSize:13,fontWeight:'700',color:f.color}}>{f.label}</Text></View>
     <Text style={st.stat}>{f.value===null?'--':fmtNum(f.value)}</Text><Text style={st.muted}>/{GOAL_INFO[f.key].fmt(f.goal)}</Text></View>)}</View>:null}
    {kind==='sleep'?<View style={{flexDirection:'row'}}>
     <View style={{flex:1,gap:2}}><Text style={{fontSize:13,fontWeight:'700',color:k.color}}>Duration</Text><Text style={[st.stat,main===null&&st.none]}>{main===null?'No Data':hm(main)}</Text><Text style={st.muted}>/{hm(goal!)}</Text></View>
     <View style={{flex:1,gap:2}}><Text style={{fontSize:13,fontWeight:'700',color:'#8F86FF'}}>Quality</Text><Text style={[st.stat,main===null&&st.none]}>{main===null?'No Data':sleepQuality(main,awake)}</Text></View>
    </View>:null}
    <View style={{flexDirection:'row',gap:10,alignItems:'flex-start'}}><SuperdotMascot id={mascot} size={34} animate={false}/><Text style={[st.body,{flex:1}]}>{insight}</Text></View>
    <View style={{height:1,backgroundColor:LINE}}/>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Ask AI about your '+k.title.toLowerCase()} onPress={ask} style={{alignItems:'center',paddingVertical:4}}><Text style={{color:k.color,fontWeight:'700',fontSize:15}}>Ask AI</Text></TouchableOpacity>
   </View>

   {kind==='mindfulness'&&onBreathing?<TouchableOpacity accessibilityRole="button" onPress={()=>{onClose();onBreathing()}} style={[st.cta,{backgroundColor:k.color}]}><Ionicons name="leaf" size={18} color="#fff"/><Text style={{color:'#fff',fontWeight:'800',fontSize:15}}>Start a breathing break</Text></TouchableOpacity>:null}

   {period==='D'?<DayCards kind={kind} day={day} val={val} readings={readings} goal={goal} color={k.color}/>:
    <TrendCard title={kind==='fitness'?'Daily Move':'Daily Trend'} days={days} values={series(k.metric)} goal={kind==='fitness'?goals.move:goal} color={k.color} fmt={kind==='fitness'?(v:number)=>fmtNum(v)+' cal':k.fmt} lowerIsBetter={kind==='noise'}/>}
   <Text style={[st.muted,{textAlign:'center'}]}>From Apple Health{kind==='mindfulness'?' and MoodPals breathing breaks':''}. Not a medical measurement.</Text>
  </ScrollView>
 </View>;
}

function insightFor(kind:HealthKind,period:Period,v:number|null,goal:number|null,fit:{label:string;value:number|null;goal:number}[],awake:number){
 const when=period==='D'?'':` on average over the last ${period==='W'?'week':'month'}`;
 if(kind==='fitness'){
  if(fit.every(f=>f.value===null))return 'No activity recorded yet. Wear your Apple Watch during the day to fill your rings.';
  const open=fit.filter(f=>(f.value||0)<f.goal).map(f=>f.label);
  if(!open.length)return 'All three rings are closed. Movement like this helps your body handle stress.';
  if(open.length===3)return 'Your rings are still open. A short walk or stretch can help release tension from the day.';
  return `The ${fit.filter(f=>!open.includes(f.label)).map(f=>f.label).join(' and ')} ring${3-open.length>1?'s are':' is'} closed. Depending on your schedule, you may consider finishing the ${open.join(' and ')} ring${open.length>1?'s':''}.`;
 }
 if(v===null)return kind==='sleep'?'No sleep data recorded for this night. Wear your Apple Watch to bed for a more complete picture of your health.':kind==='noise'?'No noise readings yet. Apple Watch measures sound levels around you when the Noise app is on.':kind==='daylight'?'No daylight recorded. Time outside with your Apple Watch on helps your body keep a steady rhythm.':kind==='steps'?'No steps recorded yet. Carry your iPhone or wear your Apple Watch to count them.':'No mindful minutes yet. A one-minute breathing break can calm your body.';
 if(kind==='sleep'){if(v>=goal!)return `You slept ${hm(v)}${when}, reaching your goal. Rested nights help your body handle stress.`;return `You slept ${hm(v)}${when}, ${hm(goal!-v)} short of your goal.${awake>=30&&period==='D'?` You were awake for ${hm(awake)} during the night.`:''} An earlier wind-down may help.`}
 if(kind==='noise')return v<70?`Your surroundings averaged ${Math.round(v)} dB${when}, a comfortable level.`:`Your surroundings averaged ${Math.round(v)} dB${when}. Long exposure to loud sound can add to stress; quieter breaks help.`;
 if(kind==='steps')return v>=goal!?`${fmtNum(v)} steps${when}. You reached your goal; gentle activity like this helps release tension.`:v<goal!/2?'Your walking time is limited. Gentle activity may help release tension from the day.':`${fmtNum(goal!-v)} steps to go to reach your goal${when}.`;
 if(kind==='daylight')return v>=goal!?`You spent ${Math.round(v)} minutes in daylight${when}. Natural light helps steady your sleep and mood.`:'More natural light exposure can help reduce stress, stabilize circadian rhythm, and support better sleep.';
 return v>=goal!?`${Math.round(v)} mindful minutes${when}. Nice work taking time to slow down.`:'A few minutes of slow breathing can lower your heart rate and calm your mind.';
}

function DayCards({kind,day,val,readings,goal,color}:{kind:HealthKind;day:Date;val:(m:Metric,d:Date)=>number|null;readings:Reading[];goal:number|null;color:string}){
 if(kind==='sleep'){
  const total=val('sleep_minutes',day),stages=STAGES.map(x=>({...x,value:val(x.metric,day)??0}));
  const stageTotal=stages.reduce((t,x)=>t+x.value,0),awake=stages[0].value,restorative=stages[1].value+stages[3].value,hr=val('sleep_heart_rate',day);
  const share=total?restorative/total:0;
  return <>
   <View style={st.card}><Text style={st.cardTitle}>Sleep Stages</Text>
    {stageTotal?<><View style={{flexDirection:'row',height:14,borderRadius:7,overflow:'hidden'}}>{stages.filter(x=>x.value).map(x=><View key={x.metric} style={{flex:x.value,backgroundColor:x.color}}/>)}</View>
     {stages.map(x=><View key={x.metric} style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={[st.dot,{backgroundColor:x.color}]}/><Text style={{flex:1,fontWeight:'600',color:INK}}>{x.label}</Text><Text style={[st.muted,{width:40,textAlign:'right'}]}>{Math.round(100*x.value/stageTotal)}%</Text><Text style={{width:70,textAlign:'right',fontWeight:'700',color:INK}}>{hm(x.value)}</Text></View>)}</>
    :<Text style={st.muted}>No Data. Sleep stages need an Apple Watch on watchOS 9 or later.</Text>}
   </View>
   <View style={st.card}><Text style={st.cardTitle}>Sleep Quality Contributors</Text>
    <Contributor icon="moon-outline" color={color} title="Total Sleep" value={total===null?'No Data':hm(total)} progress={total===null?null:total/goal!}/>
    <Contributor icon="leaf-outline" color={color} title="Restorative Sleep" detail="Deep and REM" value={stageTotal?`${Math.round(share*100)}% · ${hm(restorative)}`:'No Data'} progress={stageTotal?share/0.45:null}/>
    <Contributor icon="eye-outline" color={color} title="Time Awake" value={stageTotal?hm(awake):'No Data'} progress={stageTotal?1-Math.min(1,awake/60):null}/>
    <Contributor icon="heart-outline" color={color} title="Sleeping Heart Rate" value={hr===null?'No Data':Math.round(hr)+' bpm'} progress={null}/>
   </View>
  </>;
 }
 if(kind==='fitness'){
  const hours=Array.from({length:24},(_,h)=>readings.find(r=>r.metric==='heart_rate'&&sameDay(new Date(r.recorded_at),day)&&new Date(r.recorded_at).getHours()===h)?.value??null);
  const vals=hours.filter((v):v is number=>v!==null);
  return <View style={st.card}><Text style={st.cardTitle}>Heart Rate</Text>
   {vals.length?<><View style={{flexDirection:'row',gap:22}}><MiniStat label="Average" value={Math.round(median(vals)!)+' bpm'}/><MiniStat label="Range" value={`${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))} bpm`}/></View>
    <Bars values={hours} color="#EE6F86" labels={hours.map((_,i)=>i%6===0?['12a','6a','12p','6p'][i/6]:'')} min={Math.min(40,...vals)}/></>
   :<Text style={[st.muted,{textAlign:'center',paddingVertical:30}]}>No Data</Text>}
  </View>;
 }
 const metric=KIND[kind].metric,fmt=KIND[kind].fmt;
 const cur=val(metric,day),prev=val(metric,addDays(day,-1));
 const diff=cur!==null&&prev!==null?cur-prev:null;
 return <View style={st.card}><Text style={st.cardTitle}>Compared with the day before</Text>
  <View style={{flexDirection:'row'}}>
   <MiniStat label={sameDay(day,new Date())?'Today':day.toLocaleDateString(undefined,{weekday:'long'})} value={cur===null?'--':fmt(cur)}/>
   <MiniStat label={addDays(day,-1).toLocaleDateString(undefined,{weekday:'long'})} value={prev===null?'--':fmt(prev)}/>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
   <Ionicons name={diff===null||Math.abs(diff)<0.5?'remove':diff>0?'arrow-up':'arrow-down'} size={14} color={MUTED}/>
   <Text style={st.muted}>{diff===null?'Not enough data to compare':Math.abs(diff)<0.5?'Same as the previous day':`${fmt(Math.abs(diff))} ${diff>0?'more':'less'} than the previous day`}</Text>
  </View>
  {goal!==null&&cur!==null?<View style={{gap:6}}><Text style={st.muted}>Goal {GOAL_INFO[KIND[kind].goals[0]].fmt(goal)}</Text><Progress value={cur/goal} color={color}/></View>:null}
 </View>;
}

function TrendCard({title,days,values,goal,color,fmt,lowerIsBetter=false}:{title:string;days:Date[];values:(number|null)[];goal:number|null;color:string;fmt:(v:number)=>string;lowerIsBetter?:boolean}){
 const have=values.filter((v):v is number=>v!==null);
 const best=have.length?(lowerIsBetter?Math.min(...have):Math.max(...have)):null;
 const met=goal!==null?have.filter(v=>v>=goal).length:null;
 const labels=days.map((d,i)=>days.length<=7?['S','M','T','W','T','F','S'][d.getDay()]:i%5===0?String(d.getDate()):'');
 return <View style={st.card}><Text style={st.cardTitle}>{title}</Text>
  {have.length?<><View style={{flexDirection:'row'}}><MiniStat label="Average" value={fmt(avg(values)!)}/><MiniStat label={lowerIsBetter?'Quietest day':'Best day'} value={fmt(best!)}/>{met!==null?<MiniStat label="Goal met" value={`${met} of ${have.length}`}/>:null}</View>
   <Bars values={values} color={color} labels={labels} goal={goal}/></>:<Text style={[st.muted,{textAlign:'center',paddingVertical:30}]}>No Data</Text>}
 </View>;
}

function Bars({values,color,labels,goal,min=0}:{values:(number|null)[];color:string;labels:string[];goal?:number|null;min?:number}){
 const H=120,max=Math.max(goal||0,...values.map(v=>v||0))*1.08||1;
 const h=(v:number)=>Math.max(4,(H-4)*(v-min)/(max-min));
 return <View>
  <View style={{height:H,flexDirection:'row',alignItems:'flex-end',gap:values.length>10?2:6}}>
   {goal?<View style={{position:'absolute',left:0,right:0,bottom:h(goal),borderTopWidth:1,borderColor:color,borderStyle:'dashed',opacity:0.6}}/>:null}
   {values.map((v,i)=><View key={i} style={{flex:1,height:v===null?3:h(v),borderRadius:6,backgroundColor:v===null?LINE:color,opacity:v===null?1:goal&&v<goal?0.55:1}}/>)}
  </View>
  {values.length>10?<View style={{height:14,marginTop:6}}>{labels.map((l,i)=>l?<Text key={i} numberOfLines={1} style={[st.axis,{position:'absolute',left:`${100*i/values.length}%`,width:40}]}>{l}</Text>:null)}</View>
  :<View style={{flexDirection:'row',gap:6,marginTop:6}}>{labels.map((l,i)=><Text key={i} numberOfLines={1} style={[st.axis,{flex:1,textAlign:'center'}]}>{l}</Text>)}</View>}
 </View>;
}

function Contributor({icon,color,title,detail,value,progress}:{icon:React.ComponentProps<typeof Ionicons>['name'];color:string;title:string;detail?:string;value:string;progress:number|null}){
 return <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Ionicons name={icon} size={22} color={color}/>
  <View style={{flex:1,gap:5}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:15,color:INK}}>{title}{detail?<Text style={st.muted}>  {detail}</Text>:null}</Text><Text style={[st.muted,{fontSize:13}]}>{value}</Text></View>{progress!==null?<Progress value={progress} color={color}/>:null}</View>
 </View>;
}
function Progress({value,color}:{value:number;color:string}){return <View style={{height:6,borderRadius:3,backgroundColor:color+'22',overflow:'hidden'}}><View style={{width:`${Math.round(100*Math.max(0,Math.min(1,value)))}%`,height:6,borderRadius:3,backgroundColor:color}}/></View>}
function MiniStat({label,value}:{label:string;value:string}){return <View style={{flex:1,gap:3}}><Text style={st.muted}>{label}</Text><Text style={{fontSize:20,fontWeight:'800',color:INK}}>{value}</Text></View>}

function Rings({size,stroke,rings,children}:{size:number;stroke:number;rings:{progress:number;color:string}[];children?:React.ReactNode}){
 return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>
  <Svg width={size} height={size} style={{position:'absolute'}}>{rings.map((r,i)=>{const rad=size/2-stroke/2-i*(stroke+3),c=2*Math.PI*rad,p=Math.max(0,Math.min(1,r.progress));return <React.Fragment key={i}>
   <Circle cx={size/2} cy={size/2} r={rad} stroke={r.color} strokeOpacity={0.16} strokeWidth={stroke} fill="none"/>
   {p>0?<Circle cx={size/2} cy={size/2} r={rad} stroke={r.color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c*p} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>:null}
  </React.Fragment>})}</Svg>
  {children}
 </View>;
}

const st=StyleSheet.create({
 top:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:18,paddingBottom:8},
 round:{width:46,height:46,borderRadius:23,backgroundColor:'rgba(255,255,255,0.75)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.9)'},
 periods:{flex:1,flexDirection:'row',backgroundColor:'rgba(255,255,255,0.75)',borderRadius:23,padding:4,borderWidth:1,borderColor:'rgba(255,255,255,0.9)'},
 period:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,paddingVertical:9,borderRadius:19},periodText:{fontSize:17,fontWeight:'800',color:MUTED},
 dateRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},arrow:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},date:{fontSize:16,fontWeight:'800'},
 chip:{width:42,alignItems:'center',paddingVertical:7,borderRadius:13,backgroundColor:BG,gap:2},
 ringValue:{fontSize:38,fontWeight:'900',color:INK,marginTop:4},ringGoal:{fontSize:15,color:MUTED},status:{fontSize:26,fontWeight:'900',color:INK},
 card:{backgroundColor:'#fff',borderRadius:24,padding:18,gap:14,shadowColor:'#2D4A3E',shadowOpacity:0.05,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:2},
 cardTitle:{fontSize:19,fontWeight:'800',color:INK},stat:{fontSize:28,fontWeight:'800',color:INK},none:{color:'#B8C1C5'},
 body:{fontSize:14,lineHeight:21,color:'#4E5C64'},muted:{fontSize:12,lineHeight:17,color:MUTED},axis:{fontSize:9,color:'#9AA7AD'},dot:{width:10,height:10,borderRadius:5},
 cta:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,minHeight:52,borderRadius:16},
 goalHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:16},goalTitle:{fontSize:18,fontWeight:'800',color:INK},
 goalRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:14},step:{width:34,height:34,borderRadius:17,backgroundColor:BG,alignItems:'center',justifyContent:'center'},
});
