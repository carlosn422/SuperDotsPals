import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,AppState,StyleSheet,Switch,Text,TouchableOpacity,View} from 'react-native';
import Svg,{Circle,Rect} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {useStress} from './StressDashboard';
import {requestScreenTimeAccess} from './modules/watch-link/screenBreak';
import {SocialAppLabel,configureSocialTrack,getSocialState,pickTrackedApps,socialMarks,socialTrackSupported,type SocialMark,type SocialState} from './modules/watch-link/socialTrack';
import {CustomDurationSheet} from './FamilyScreenBreak';
import {LOOKBACK_DAYS,appInsights,formatMins,insightLine,weekUse,type MoodEntry} from './SocialHrvInsights';


function useSocialData(){
 const [state,setState]=useState<SocialState|null>(()=>getSocialState());
 const [marks,setMarks]=useState<SocialMark[]>([]);
 const refresh=useCallback(()=>{setState(getSocialState());setMarks(socialMarks(Date.now()-LOOKBACK_DAYS*864e5))},[]);
 useEffect(()=>{refresh();const sub=AppState.addEventListener('change',s=>{if(s==='active')refresh()});return()=>sub.remove()},[refresh]);
 return {state,marks,refresh};
}

function useMoods(){
 const [moods,setMoods]=useState<MoodEntry[]>([]);
 useEffect(()=>{let alive=true;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const since=new Date(Date.now()-LOOKBACK_DAYS*864e5).toISOString();
  const {data,error}=await supabase.from('wellness_journal').select('mood,occurred_at').eq('user_id',user.id).not('mood','is',null).gte('occurred_at',since).limit(500);
  if(!error&&alive)setMoods((data||[]) as MoodEntry[]);
 })();return()=>{alive=false}},[]);
 return moods;
}

function AppName({app}:{app:number}){
 return SocialAppLabel?<SocialAppLabel app={app} style={{height:24,flex:1}}/>:<Text style={st.rowTitle}>{app<0?'Other apps & sites':'App '+(app+1)}</Text>;
}

/** Actions › Apps & stress. */
export function SocialHrvScreen(){
 const {state,marks,refresh}=useSocialData();
 const {points}=useStress();
 const moods=useMoods();
 const [busy,setBusy]=useState(''),[limitSheet,setLimitSheet]=useState(false);
 const insights=useMemo(()=>appInsights(marks,points,moods),[marks,points,moods]);
 const week=useMemo(()=>weekUse(marks,points),[marks,points]);
 if(!socialTrackSupported||!state)return <View style={st.card}><Text style={st.body}>Apps & stress needs the latest MoodPals build on this iPhone.</Text></View>;
 const chosen=state.apps.length+state.groupCount;
 async function allow(){setBusy('auth');try{await requestScreenTimeAccess()}catch{}setBusy('');refresh()}
 async function pick(){setBusy('pick');try{const n=await pickTrackedApps();if(n&&!state!.enabled)configureSocialTrack(true,state!.limitMinutes)}catch{}setBusy('');refresh()}
 const set=(enabled:boolean,limit:number)=>{try{configureSocialTrack(enabled,limit)}catch{}refresh()};
 return <View style={{gap:14}}>
  <View><Text style={st.title}>Apps & stress</Text><Text style={st.sub}>See how the apps you use line up with your HRV stress score and the moods you log. Usage stays on this iPhone.</Text></View>
  {!state.authorized?<View style={st.card}>
   <Text style={st.rowTitle}>Allow Screen Time access</Text>
   <Text style={st.sub}>MoodPals uses Apple's Screen Time to note each 15 minutes you spend in the apps you choose.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void allow()} style={st.cta}>{busy==='auth'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Allow Screen Time Access</Text>}</TouchableOpacity>
  </View>:!chosen?<View style={st.card}>
   <Text style={st.rowTitle}>Choose apps to track</Text>
   <Text style={st.sub}>For example social media, news and video apps like Instagram, TikTok, X and YouTube. Pick apps one by one to see each separately.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void pick()} style={st.cta}>{busy==='pick'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Choose Apps</Text>}</TouchableOpacity>
  </View>:<>
   <View style={st.card}>
    <View style={st.row}><Text style={[st.rowTitle,{flex:1}]}>Tracking</Text><Switch value={state.enabled} onValueChange={v=>set(v,state.limitMinutes)} trackColor={{true:T.primary,false:'#D5DED9'}}/></View>
    <TouchableOpacity accessibilityRole="button" onPress={()=>void pick()} style={st.row}><Text style={[st.body,{flex:1}]}>{chosen} {chosen===1?'app':'apps'} chosen</Text><Text style={st.link}>Edit apps</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Daily limit, '+(state.limitMinutes?formatMins(state.limitMinutes):'off')+'. Set time'} disabled={!state.enabled} onPress={()=>setLimitSheet(true)} style={[st.row,{marginTop:4},!state.enabled&&{opacity:0.5}]}>
     <View style={{flex:1}}><Text style={st.rowTitle}>Daily limit</Text><Text style={st.body}>{state.limitMinutes?formatMins(state.limitMinutes)+' a day':'Off'}</Text></View>
     <Text style={st.link}>Set time</Text>
    </TouchableOpacity>
    <Text style={st.sub}>When you reach it, these apps show a reminder. Choose Take a break to close the app, or I need it today to keep using these apps until midnight.</Text>
    <CustomDurationSheet visible={limitSheet} title="Daily limit" initialMinutes={state.limitMinutes||60} onClose={()=>setLimitSheet(false)} onChoose={n=>{setLimitSheet(false);set(true,n)}} onOff={state.limitMinutes?()=>{setLimitSheet(false);set(true,0)}:undefined}/>
   </View>
   <WeekChart week={week}/>
   <View style={st.card}>
    <Text style={st.heading}>By app · last {LOOKBACK_DAYS} days</Text>
    {!insights.length?<Text style={st.sub}>Nothing yet. Marks appear after 15 minutes in a tracked app.</Text>:insights.map(i=><View key={i.app} style={st.appRow}>
     <View style={st.row}><AppName app={i.app}/><Text style={st.minutes}>{formatMins(i.todayMinutes)} today</Text></View>
     <Text style={[st.body,i.delta!==undefined&&i.delta>=8&&{color:'#C2573F'}]}>{insightLine(i)}</Text>
     <Text style={st.sub}>{formatMins(i.periodMinutes)} over {i.days} {i.days===1?'day':'days'}{i.hrvAfter&&i.hrvUsual&&!i.learning?` · HRV after ${Math.round(i.hrvAfter)} ms vs usual ${Math.round(i.hrvUsual)} ms`:''}{i.topMood?` · Mood logged after: mostly ${i.topMood} (${i.moodCount})`:''}</Text>
    </View>)}
   </View>
   <Text style={st.note}>Patterns, not a diagnosis. HRV also changes with sleep, exercise, caffeine and illness. Use is counted in 15-minute steps, and time during a family member's Screen Break isn't counted.</Text>
  </>}
 </View>;
}

function WeekChart({week}:{week:ReturnType<typeof weekUse>}){
 const W=300,H=120,bw=26,max=Math.max(60,...week.map(d=>d.minutes));
 const x=(i:number)=>14+i*(W-28)/6;
 return <View style={st.card}>
  <Text style={st.heading}>This week</Text>
  <View style={{flexDirection:'row',gap:14}}><Legend color={T.primary} label="Time in tracked apps"/><Legend color="#E08A4C" label="Avg stress score" dot/></View>
  <Svg width="100%" height={H+8} viewBox={`0 0 ${W} ${H+8}`}>
   {week.map((d,i)=>{const h=d.minutes/max*(H-14);return <Rect key={'b'+i} x={x(i)-bw/2} y={H-h} width={bw} height={Math.max(h,d.minutes?3:0)} rx={7} fill={T.primary} opacity={0.75}/>})}
   {week.map((d,i)=>d.stress===null?null:<Circle key={'s'+i} cx={x(i)} cy={H-d.stress/100*(H-14)} r={5} fill="#E08A4C" stroke="#fff" strokeWidth={2}/>)}
  </Svg>
  <View style={{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:2}}>{week.map(d=><Text key={d.start} style={st.axis}>{['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(d.start).getDay()]}</Text>)}</View>
  <Text style={st.sub}>Today {formatMins(week[6].minutes)}{week[6].stress!==null?` · stress ${week[6].stress}`:''}</Text>
 </View>;
}

function Legend({color,label,dot}:{color:string;label:string;dot?:boolean}){
 return <View style={{flexDirection:'row',alignItems:'center',gap:6}}><View style={{width:10,height:10,borderRadius:dot?5:3,backgroundColor:color}}/><Text style={st.axis}>{label}</Text></View>;
}

/** Today tab summary; hidden until tracking is on. */
export function SocialHrvTodayCard({onOpen}:{onOpen:()=>void}){
 const {state,marks}=useSocialData();
 const {points}=useStress();
 const insights=useMemo(()=>appInsights(marks,points,[]),[marks,points]);
 if(!socialTrackSupported||!state?.enabled)return null;
 const today=weekUse(marks,points)[6];
 const flagged=insights.find(i=>!i.learning&&i.delta!==undefined&&i.delta>=8);
 return <TouchableOpacity accessibilityRole="button" onPress={onOpen} style={st.card}>
  <View style={st.row}><Ionicons name="phone-portrait-outline" size={20} color={T.primary}/><Text style={[st.heading,{flex:1}]}>Apps & stress</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></View>
  <Text style={st.body}>{formatMins(today.minutes)} in tracked apps today{state.limitMinutes?` of ${formatMins(state.limitMinutes)}`:''}</Text>
  {flagged?<View style={st.row}><Text style={st.sub}>Higher stress after:</Text><AppName app={flagged.app}/></View>:<Text style={st.sub}>{insights.some(i=>!i.learning)?'No app stands out for stress right now.':'Still learning your patterns.'}</Text>}
 </TouchableOpacity>;
}

const st=StyleSheet.create({
 title:{fontSize:26,fontWeight:'900',color:T.ink},
 heading:{fontSize:16,fontWeight:'900',color:T.ink},
 rowTitle:{fontSize:15,fontWeight:'800',color:T.ink},
 body:{fontSize:14,fontWeight:'600',color:T.ink,lineHeight:20},
 sub:{fontSize:12,fontWeight:'600',color:T.muted,lineHeight:17},
 note:{fontSize:11,color:T.muted,lineHeight:16,textAlign:'center',paddingHorizontal:10},
 link:{fontSize:14,fontWeight:'800',color:T.primary},
 card:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:T.border},
 row:{flexDirection:'row',alignItems:'center',gap:8},
 appRow:{gap:4,paddingVertical:8,borderTopWidth:1,borderTopColor:T.border},
 minutes:{fontSize:13,fontWeight:'800',color:T.muted},
 axis:{fontSize:11,fontWeight:'700',color:T.muted},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:50,alignItems:'center',justifyContent:'center',paddingHorizontal:18},
 ctaText:{color:'#fff',fontSize:16,fontWeight:'900'},
});
