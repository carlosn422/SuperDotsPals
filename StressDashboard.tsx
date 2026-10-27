import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,ActivityIndicator,Alert,Modal,ScrollView} from 'react-native';
import Svg,{Circle,Line,Path,Rect} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SuperdotMascot from './SuperdotMascot';
import {supabase} from './supabase';
import {useSavedHealth,syncNativeHealth,healthKitAvailable,Reading,Metric,HEALTH_SYNCED_FLAG} from './HealthDataPanel';
import {enableHealthBackgroundUpdates} from './HealthBackground';
import {computeStressPoints,dailyStress,baselineStatus,levelFor,levelDistribution,median,sameDay,sleepQuality,noiseLabel,formatMinutes,energyScore,energyLabel,STRESS_LEVELS,LEVEL_ORDER,StressPoint,MIN_BASELINE_SAMPLES,MIN_BASELINE_DAYS} from './StressEngine';

export const SW={bg:'#F4FAF6',mint:'#E4F6EA',ink:'#1D2B33',muted:'#6E7D86',green:'#34B37E',line:'#E6EEEA',card:'#FFFFFF',hr:'#9A86F2',pink:'#EE6F86'};
const SYNC_FLAG=HEALTH_SYNCED_FLAG;
let autoSynced=false;

export function useStress(){
 const health=useSavedHealth();
 const points=useMemo(()=>computeStressPoints(health.readings),[health.readings]);
 const today=useMemo(()=>dailyStress(points),[points]);
 const baseline=useMemo(()=>baselineStatus(health.readings),[health.readings]);
 return {...health,points,today,baseline};
}

function useWidth(initial=300){const [w,setW]=useState(initial);return {width:w,onLayout:(e:any)=>setW(Math.max(160,e.nativeEvent.layout.width))}}
const fmtTime=(iso:string)=>new Date(iso).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});

export function StressHero({name,mood,onCheckin}:{name?:string;mood:string;onCheckin:()=>void}){
 const {today,baseline,loading,readings,reload}=useStress();
 const [syncing,setSyncing]=useState(false);
 const available=healthKitAvailable();
 async function sync(silent=false){
  setSyncing(true);
  try{await syncNativeHealth();await AsyncStorage.setItem(SYNC_FLAG,'1');await reload();void enableHealthBackgroundUpdates()}
  catch(e:any){if(!silent)Alert.alert('Health sync unavailable','Could not connect to Apple Health. Please make sure you have granted permissions in the Health app.')}
  finally{setSyncing(false)}
 }
 useEffect(()=>{if(autoSynced||!available)return;autoSynced=true;void AsyncStorage.getItem(SYNC_FLAG).then(flag=>{if(flag)void sync(true)})},[available]);
 const level=today?STRESS_LEVELS[today.level]:null;
 const tint=level?.tint||SW.mint;
 const title=loading?'Loading…':level?level.label:readings.length?'Calibrating':'Connect';
 const detail=level?level.summary:!readings.length?'Connect Apple Health so your MoodPal can read HRV and heart rate from your iPhone and Apple Watch.':!baseline.ready?`Building your personal baseline: ${baseline.samples}/${MIN_BASELINE_SAMPLES} HRV readings across ${baseline.days}/${MIN_BASELINE_DAYS} days.`:'No HRV reading in the last 24 hours. Wear your Apple Watch to get a fresh score.';
 const position=today?100-today.score:50;
 return <View style={[st.hero,{backgroundColor:tint}]}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log how you feel" activeOpacity={0.8} onPress={onCheckin} style={{alignSelf:'center'}}><SuperdotMascot id={mood||level?.mascot||'calm'} size={168}/></TouchableOpacity>
  <Text style={st.heroGreeting}>{name?`Hi ${name}, here's your daily score`:"Here's your daily stress score"}</Text>
  <Text style={[st.heroLevel,{color:level?.color||SW.ink}]} accessibilityLabel={today?`Stress ${title}, score ${today.score} of 100`:title}>{title}</Text>
  <View style={st.scale} accessible accessibilityLabel="Stress scale from overload to great">
   {LEVEL_ORDER.map(l=><View key={l} style={[st.scaleSeg,{backgroundColor:STRESS_LEVELS[l].color,opacity:today?1:0.35}]}/>)}
   {today?<View style={[st.scaleDot,{left:`${Math.max(2,Math.min(96,position))}%`,borderColor:level!.color}]}/>:null}
  </View>
  <Text style={st.heroDetail}>{detail}</Text>
  <Text style={st.heroUpdated}>{today?`Score ${today.score}/100 · Updated ${fmtTime(today.updated)} · Not a medical measurement`:' '}</Text>
  <View style={{flexDirection:'row',gap:10,alignSelf:'stretch'}}>
   <TouchableOpacity accessibilityRole="button" onPress={onCheckin} style={[st.heroButton,{backgroundColor:SW.ink,flex:1}]}><Text style={st.heroButtonText}>Log how you feel</Text></TouchableOpacity>
   {available?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Sync Apple Health" disabled={syncing} onPress={()=>void sync()} style={[st.heroButton,{backgroundColor:'#fff',paddingHorizontal:16}]}>{syncing?<ActivityIndicator color={SW.ink}/>:<Ionicons name="sync" size={20} color={SW.ink}/>}</TouchableOpacity>:null}
  </View>
 </View>;
}

function Card({children,style}:{children:React.ReactNode;style?:any}){return <View style={[st.card,style]}>{children}</View>}

export function HrvTrendCard(){
 const {readings,points}=useStress();
 const {width,onLayout}=useWidth();
 const [range,setRange]=useState<'day'|'week'>('day');
 const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);if(range==='week')start.setDate(start.getDate()-6);
 const end=range==='day'?new Date(start.getTime()+86400000):now;
 const hrv=readings.filter(r=>r.metric==='hrv'&&new Date(r.recorded_at)>=start).sort((a,b)=>+new Date(a.recorded_at)-+new Date(b.recorded_at));
 const scoreAt=new Map(points.map(p=>[p.at,p]));
 const latest=hrv[hrv.length-1];
 const latestLevel=latest&&scoreAt.get(latest.recorded_at)?.level;
 const H=150,pad=10,max=Math.max(40,...hrv.map(r=>r.value))*1.1,min=0;
 const x=(iso:string)=>pad+(width-2*pad)*Math.min(1,Math.max(0,(+new Date(iso)-+start)/(+end-+start)));
 const y=(v:number)=>H-pad-(H-2*pad)*(v-min)/(max-min);
 const path=hrv.map((r,i)=>(i?'L':'M')+x(r.recorded_at).toFixed(1)+' '+y(r.value).toFixed(1)).join(' ');
 const labels=range==='day'?['0:00','6:00','12:00','18:00','24:00']:Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return ['S','M','T','W','T','F','S'][d.getDay()]});
 return <Card>
  <View style={st.cardTop}><Text style={st.cardTitle}>HRV Trend</Text>
   {latest?<View style={st.pill}><View style={[st.dot,{backgroundColor:latestLevel?STRESS_LEVELS[latestLevel].color:SW.muted}]}/><View><Text style={[st.pillTitle,{color:latestLevel?STRESS_LEVELS[latestLevel].color:SW.muted}]}>{latestLevel?STRESS_LEVELS[latestLevel].label:'Calibrating'}</Text><Text style={st.pillSub}>HRV {Math.round(latest.value)}ms · {fmtTime(latest.recorded_at)}</Text></View></View>:null}
  </View>
  <Segmented value={range} options={[['day','Today'],['week','7 days']]} onChange={v=>setRange(v as any)}/>
  <View onLayout={onLayout} style={{height:H}}>
   {hrv.length?<Svg width={width} height={H}>
    {[0,1,2,3,4].map(i=><Line key={i} x1={pad+(width-2*pad)*i/4} x2={pad+(width-2*pad)*i/4} y1={pad} y2={H-pad} stroke={SW.line} strokeDasharray="3 4"/>)}
    <Path d={path} stroke="#C9D2D6" strokeWidth={2} fill="none"/>
    {hrv.map(r=>{const p=scoreAt.get(r.recorded_at);return <Circle key={r.recorded_at} cx={x(r.recorded_at)} cy={y(r.value)} r={5.5} fill="#fff" stroke={p?STRESS_LEVELS[p.level].color:'#B7C2C7'} strokeWidth={3}/>})}
   </Svg>:<View style={st.empty}><Ionicons name="pulse-outline" size={26} color={SW.muted}/><Text style={st.muted}>No HRV readings {range==='day'?'today':'this week'} yet. Apple Watch records HRV periodically and during Breathe sessions.</Text></View>}
  </View>
  <View style={st.axis}>{labels.map((l,i)=><Text key={i} style={st.axisText}>{l}</Text>)}</View>
 </Card>;
}

export function HeartRateCard(){
 const {readings}=useSavedHealth();
 const {width,onLayout}=useWidth();
 const start=new Date();start.setHours(0,0,0,0);
 const hours=Array.from({length:24},(_,h)=>readings.find(r=>r.metric==='heart_rate'&&sameDay(new Date(r.recorded_at),start)&&new Date(r.recorded_at).getHours()===h)?.value??null);
 const values=hours.filter((v):v is number=>v!==null);
 const max=Math.max(100,...values),min=Math.min(40,...values),H=110;
 const rest=readings.find(r=>r.metric==='resting_heart_rate');
 const bw=(width-24)/24;
 return <Card>
  <View style={st.cardTop}><Text style={st.cardTitle}>Heart Rate</Text><Text style={st.muted}>{values.length?`${Math.round(Math.min(...values))}–${Math.round(Math.max(...values))} bpm today`:'Today'}</Text></View>
  <View style={{flexDirection:'row',gap:18}}>
   <Stat label="Average" value={values.length?String(Math.round(median(values)!)):'—'} unit="bpm"/>
   <Stat label="Resting" value={rest?String(Math.round(rest.value)):'—'} unit="bpm"/>
  </View>
  <View onLayout={onLayout} style={{height:H}}>
   {values.length?<Svg width={width} height={H}>{hours.map((v,i)=>v===null?null:<Rect key={i} x={12+i*bw+bw*0.2} width={bw*0.6} y={H-(H-8)*(v-min)/(max-min)-4} height={Math.max(4,(H-8)*(v-min)/(max-min))} rx={bw*0.3} fill={SW.hr} opacity={i===new Date().getHours()?1:0.6}/>)}</Svg>:<View style={st.empty}><Text style={st.muted}>Hourly heart rate appears after syncing Apple Health.</Text></View>}
  </View>
  <View style={st.axis}>{['0:00','6:00','12:00','18:00','24:00'].map(l=><Text key={l} style={st.axisText}>{l}</Text>)}</View>
 </Card>;
}

function Stat({label,value,unit,color=SW.ink}:{label:string;value:string;unit?:string;color?:string}){return <View style={{gap:2}}><Text style={[st.statLabel,{color}]}>{label}</Text><Text style={st.statValue}>{value}<Text style={st.statUnit}>{unit?' '+unit:''}</Text></Text></View>}
function Segmented({value,options,onChange}:{value:string;options:[string,string][];onChange:(v:string)=>void}){return <View style={st.segment}>{options.map(([k,l])=><TouchableOpacity key={k} onPress={()=>onChange(k)} style={[st.seg,value===k&&st.segActive]}><Text style={[st.segText,value===k&&{color:SW.ink}]}>{l}</Text></TouchableOpacity>)}</View>}
function Ring({progress,color,size=64,stroke=8,children}:{progress:number;color:string;size?:number;stroke?:number;children?:React.ReactNode}){
 const r=(size-stroke)/2,c=2*Math.PI*r,p=Math.max(0,Math.min(1,progress));
 return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><Svg width={size} height={size} style={{position:'absolute'}}><Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeOpacity={0.18} strokeWidth={stroke} fill="none"/><Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c*p} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/></Svg>{children}</View>;
}

function todayValue(readings:Reading[],metric:Metric){return readings.find(r=>r.metric===metric&&sameDay(new Date(r.recorded_at),new Date()))?.value??null}
function latestValue(readings:Reading[],metric:Metric){return readings.find(r=>r.metric===metric)?.value??null}

export function HealthActionsGrid({onMindfulness,onSteps}:{onMindfulness:()=>void;onSteps?:()=>void}){
 const {readings,loading}=useSavedHealth();
 const [appMindful,setAppMindful]=useState(0);
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const start=new Date();start.setHours(0,0,0,0);
  const {data,error}=await supabase.from('habit_entries').select('amount').eq('user_id',user.id).eq('habit','mindfulness').gte('recorded_at',start.toISOString());
  if(!error&&alive)setAppMindful((data||[]).reduce((t,r)=>t+Number(r.amount||0),0))})();return()=>{alive=false}},[readings]);
 const sleep=latestValue(readings,'sleep_minutes'),awake=latestValue(readings,'sleep_awake_minutes')||0,sleepHr=latestValue(readings,'sleep_heart_rate');
 const move=todayValue(readings,'active_energy_kcal'),exercise=todayValue(readings,'exercise_minutes'),stand=todayValue(readings,'stand_hours');
 const daylight=todayValue(readings,'daylight_minutes'),mindful=(todayValue(readings,'mindfulness_minutes')||0)+appMindful,steps=todayValue(readings,'steps'),noise=latestValue(readings,'noise_db');
 const dash=loading?'…':'—';
 const sl=sleep!==null?formatMinutes(sleep):null;
 const [sleepOpen,setSleepOpen]=useState(false);
 return <View style={{gap:11}}>
  <SleepDetail visible={sleepOpen} onClose={()=>setSleepOpen(false)} readings={readings}/>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open sleep details" onPress={()=>setSleepOpen(true)} style={[st.card,st.row]}>
   <View style={{flex:1,gap:10}}>
    <View style={st.tileHead}><Ionicons name="bed" size={17} color="#6C63E0"/><Text style={st.tileTitle}>Sleep</Text></View>
    <View style={{flexDirection:'row',gap:16}}>
     <View><Text style={[st.statLabel,{color:'#6C63E0'}]}>Duration</Text><Text style={st.statValue}>{sl?<>{sl.h}<Text style={st.statUnit}>h</Text>{sl.m}<Text style={st.statUnit}>m</Text></>:dash}</Text></View>
     <Stat label="Quality" color="#6C63E0" value={sleep!==null?sleepQuality(sleep,awake):dash}/>
     <Stat label="Avg HR" value={sleepHr!==null?String(Math.round(sleepHr)):dash} unit={sleepHr!==null?'bpm':''}/>
    </View>
   </View>
   <Ring progress={(sleep||0)/480} color="#6C63E0"/>
  </TouchableOpacity>
  <Card style={st.row}>
   <View style={{flex:1,gap:10}}>
    <View style={st.tileHead}><Ionicons name="flame" size={17} color="#F2685A"/><Text style={st.tileTitle}>Fitness</Text></View>
    <View style={{flexDirection:'row',gap:16}}>
     <Stat label="Move" color="#F2685A" value={move!==null?String(Math.round(move)):dash} unit={move!==null?'cal':''}/>
     <Stat label="Exercise" color="#5CC15A" value={exercise!==null?String(Math.round(exercise)):dash} unit={exercise!==null?'m':''}/>
     <Stat label="Stand" color="#3BB5D8" value={stand!==null?String(Math.round(stand)):dash} unit={stand!==null?'h':''}/>
    </View>
   </View>
   <Ring progress={(move||0)/500} color="#F2685A" size={70} stroke={7}><Ring progress={(exercise||0)/30} color="#5CC15A" size={52} stroke={7}><Ring progress={(stand||0)/12} color="#3BB5D8" size={34} stroke={7}/></Ring></Ring>
  </Card>
  <View style={st.grid}>
   <Tile icon="sunny" color="#F4A83A" title="Daylight" value={daylight!==null?String(Math.round(daylight)):dash} unit={daylight!==null?'m':''} note="Time outdoors in daylight"/>
   <Tile icon="flower" color="#4FA9E8" title="Mindfulness" value={String(Math.round(mindful))} unit="m" note="Tap for a breathing break" onPress={onMindfulness}/>
   <Tile icon="footsteps" color="#34B37E" title="Steps" value={steps!==null?Math.round(steps).toLocaleString():dash} note="From iPhone & Apple Watch" onPress={onSteps}/>
   <Tile icon="ear" color="#E58A6C" title="Noise Levels" value={noise!==null?noiseLabel(noise):dash} note={noise!==null?`${Math.round(noise)} dB average`:'Environmental audio'}/>
  </View>
 </View>;
}
function Tile({icon,color,title,value,unit,note,onPress}:{icon:any;color:string;title:string;value:string;unit?:string;note:string;onPress?:()=>void}){
 return <TouchableOpacity disabled={!onPress} onPress={onPress} accessibilityRole={onPress?'button':undefined} style={[st.card,st.tile]}>
  <View style={st.tileHead}><Ionicons name={icon} size={17} color={color}/><Text style={st.tileTitle}>{title}</Text></View>
  <Text style={st.tileValue}>{value}<Text style={st.statUnit}>{unit||''}</Text></Text>
  <View style={{flex:1}}/><View style={[st.tileIcon,{backgroundColor:color+'22'}]}><Ionicons name={icon} size={28} color={color}/></View>
  <Text style={st.muted}>{note}</Text>
 </TouchableOpacity>;
}

export function StressTrendCard({period}:{period:'Day'|'Week'|'Month'|'Year'}){
 const {points,loading}=useStress();
 const days=period==='Day'?1:period==='Week'?7:period==='Month'?30:365;
 const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);
 const inRange=points.filter(p=>new Date(p.at)>=start);
 const n=period==='Day'?8:period==='Week'?7:period==='Month'?10:12;
 const span=period==='Day'?86400000:days*86400000;
 const buckets=Array.from({length:n},(_,i)=>{
  const a=+start+span*i/n,b=+start+span*(i+1)/n;
  const vals=inRange.filter(p=>{const t=+new Date(p.at);return t>=a&&t<b}).map(p=>p.score);
  const d=new Date(a);
  const label=period==='Day'?String(d.getHours()).padStart(2,'0'):period==='Week'?['S','M','T','W','T','F','S'][d.getDay()]:period==='Month'?String(d.getDate()):['J','F','M','A','M','J','J','A','S','O','N','D'][d.getMonth()];
  return {score:vals.length?Math.round(median(vals)!):null,label};
 });
 const dist=levelDistribution(inRange);
 const avg=inRange.length?Math.round(median(inRange.map(p=>p.score))!):null;
 return <Card>
  <View style={st.cardTop}><Text style={st.cardTitle}>Stress Trend</Text>{avg!==null?<Text style={[st.pillTitle,{color:STRESS_LEVELS[levelFor(avg)].color}]}>{STRESS_LEVELS[levelFor(avg)].label} · {avg}</Text>:null}</View>
  <Text style={st.muted}>{loading?'Loading…':inRange.length?`${inRange.length} scored HRV readings. Higher bars mean more stress compared with your own baseline.`:'Stress scores appear once your baseline is ready (about 3 days of Apple Watch HRV).'}</Text>
  <View style={{flexDirection:'row',alignItems:'flex-end',height:120,gap:4}}>{buckets.map((b,i)=><View key={i} style={{flex:1,alignItems:'center',gap:5,justifyContent:'flex-end',height:120}}>
   <View style={{width:'62%',minWidth:6,height:b.score===null?5:Math.max(8,b.score),borderRadius:8,backgroundColor:b.score===null?SW.line:STRESS_LEVELS[levelFor(b.score)].color}}/>
   <Text style={st.axisText}>{b.label}</Text></View>)}</View>
  {inRange.length?<View style={{gap:7}}>
   <View style={{flexDirection:'row',height:10,borderRadius:6,overflow:'hidden'}}>{dist.filter(d=>d.count).map(d=><View key={d.level} style={{flex:d.share,backgroundColor:STRESS_LEVELS[d.level].color}}/>)}</View>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{dist.map(d=><View key={d.level} style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={[st.dot,{backgroundColor:STRESS_LEVELS[d.level].color}]}/><Text style={st.muted}>{STRESS_LEVELS[d.level].label} {Math.round(d.share*100)}%</Text></View>)}</View>
  </View>:null}
 </Card>;
}

const STAGES:{metric:Metric;label:string;color:string}[]=[
 {metric:'sleep_awake_minutes',label:'Awake',color:'#F7A072'},
 {metric:'sleep_rem_minutes',label:'REM',color:'#7FD3F7'},
 {metric:'sleep_core_minutes',label:'Core',color:'#7B83F2'},
 {metric:'sleep_deep_minutes',label:'Deep',color:'#4A3FB8'}
];
const hm=(m:number)=>{const t=formatMinutes(m);return `${t.h}h ${t.m}m`};
function nightValue(readings:Reading[],metric:Metric,day:Date){return readings.find(r=>r.metric===metric&&sameDay(new Date(r.recorded_at),day))?.value??null}

export function SleepDetail({visible,onClose,readings}:{visible:boolean;onClose:()=>void;readings:Reading[]}){
 const nights=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-6+i);return {day:d,total:nightValue(readings,'sleep_minutes',d)}});
 const last=[...nights].reverse().find(n=>n.total!==null);
 const day=last?.day||new Date();
 const stages=STAGES.map(x=>({...x,value:nightValue(readings,x.metric,day)??0}));
 const stageTotal=stages.reduce((t,x)=>t+x.value,0);
 const total=last?.total??null,awake=stages[0].value,hr=nightValue(readings,'sleep_heart_rate',day);
 const avg=median(nights.map(n=>n.total).filter((v):v is number=>v!==null));
 const maxNight=Math.max(480,...nights.map(n=>n.total||0));
 return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
  <ScrollView style={{flex:1,backgroundColor:SL.bg}} contentContainerStyle={{padding:20,gap:16,paddingBottom:50}}>
   <View style={st.cardTop}><Text style={[st.cardTitle,{color:'#fff',fontSize:26}]}>Sleep</Text><TouchableOpacity accessibilityLabel="Close sleep details" onPress={onClose} style={{padding:6}}><Ionicons name="close" size={26} color="#fff"/></TouchableOpacity></View>
   <View style={[st.card,{backgroundColor:SL.card,alignItems:'center'}]}>
    <Ionicons name="moon" size={34} color="#C9C3FF"/>
    <Text style={{color:'#fff',fontSize:40,fontWeight:'900'}}>{total!==null?hm(total):'—'}</Text>
    <Text style={{color:SL.muted,fontSize:13}}>{total!==null?`${sleepQuality(total,awake)} · ${day.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}`:'No sleep synced yet. Wear your Apple Watch to bed and sync Apple Health.'}</Text>
    <View style={{flexDirection:'row',gap:26,marginTop:6}}>
     <View style={{alignItems:'center'}}><Text style={SLt.k}>Avg HR</Text><Text style={SLt.v}>{hr!==null?Math.round(hr)+' bpm':'—'}</Text></View>
     <View style={{alignItems:'center'}}><Text style={SLt.k}>7-day avg</Text><Text style={SLt.v}>{avg!==null?hm(avg):'—'}</Text></View>
     <View style={{alignItems:'center'}}><Text style={SLt.k}>Awake</Text><Text style={SLt.v}>{stageTotal?Math.round(awake)+'m':'—'}</Text></View>
    </View>
   </View>
   <View style={[st.card,{backgroundColor:SL.card}]}>
    <Text style={[st.cardTitle,{color:'#fff'}]}>Sleep stages</Text>
    {stageTotal?<>
     <View style={{flexDirection:'row',height:16,borderRadius:8,overflow:'hidden'}}>{stages.filter(x=>x.value).map(x=><View key={x.metric} style={{flex:x.value,backgroundColor:x.color}}/>)}</View>
     {stages.map(x=><View key={x.metric} style={{flexDirection:'row',alignItems:'center',gap:10}}>
      <View style={[st.dot,{backgroundColor:x.color}]}/><Text style={{color:'#fff',fontWeight:'700',flex:1}}>{x.label}</Text>
      <Text style={{color:SL.muted,width:44,textAlign:'right'}}>{Math.round(100*x.value/stageTotal)}%</Text><Text style={{color:'#fff',fontWeight:'800',width:70,textAlign:'right'}}>{hm(x.value)}</Text>
     </View>)}
    </>:<Text style={{color:SL.muted,fontSize:12}}>Stages need an Apple Watch on watchOS 9 or later.</Text>}
   </View>
   <View style={[st.card,{backgroundColor:SL.card}]}>
    <Text style={[st.cardTitle,{color:'#fff'}]}>Last 7 nights</Text>
    <View style={{flexDirection:'row',alignItems:'flex-end',height:130,gap:8}}>{nights.map((n,i)=><View key={i} style={{flex:1,alignItems:'center',gap:6,justifyContent:'flex-end',height:130}}>
     <View style={{width:'70%',height:n.total?Math.max(6,100*n.total/maxNight):4,borderRadius:8,backgroundColor:n.total?(n.total>=420?'#8F86FF':'#5C55B8'):'#3A3266'}}/>
     <Text style={{fontSize:10,color:SL.muted}}>{['S','M','T','W','T','F','S'][n.day.getDay()]}</Text></View>)}</View>
    <Text style={{color:SL.muted,fontSize:11}}>Adults generally do best with 7–9 hours. Sleep data comes from Apple Health.</Text>
   </View>
  </ScrollView>
 </Modal>;
}

export function EnergyCard(){
 const {readings,today}=useStress();
 const now=new Date();
 const sleep=readings.find(r=>r.metric==='sleep_minutes'&&now.getTime()-new Date(r.recorded_at).getTime()<36*3600000)?.value??null;
 const kcal=todayValue(readings,'active_energy_kcal');
 const score=energyScore({sleepMinutes:sleep,stress:today?.score??null,activeKcal:kcal});
 const color=score===null?SW.muted:score>=75?'#34B37E':score>=50?'#8A9BEF':score>=30?'#F2A56F':'#EE6F86';
 return <Card style={st.row}>
  <Ring progress={(score??0)/100} color={color} size={78} stroke={9}><Ionicons name="battery-charging" size={24} color={color}/></Ring>
  <View style={{flex:1,gap:4}}>
   <Text style={st.cardTitle}>Energy {score!==null?<Text style={{color}}>{score}</Text>:null}</Text>
   <Text style={[st.pillTitle,{color}]}>{score!==null?energyLabel(score):'Waiting for sleep or HRV'}</Text>
   <Text style={st.muted}>Based on last night's sleep{sleep!==null?` (${hm(sleep)})`:''}, today's stress{today?` (${today.score})`:''} and active calories{kcal!==null?` (${Math.round(kcal)})`:''}.</Text>
  </View>
 </Card>;
}

const SL={bg:'#1E1840',card:'#2B2358',muted:'#A9A3D6'};
const SLt=StyleSheet.create({k:{color:SL.muted,fontSize:11,fontWeight:'700'},v:{color:'#fff',fontSize:16,fontWeight:'800'}});

const st=StyleSheet.create({
 hero:{borderRadius:30,padding:20,paddingTop:12,alignItems:'center',gap:8},
 heroGreeting:{fontSize:15,color:SW.muted,fontWeight:'600'},heroLevel:{fontSize:44,fontWeight:'900',letterSpacing:-1},
 scale:{flexDirection:'row',gap:6,width:'78%',height:14,alignItems:'center',position:'relative',marginVertical:4},scaleSeg:{flex:1,height:10,borderRadius:6},
 scaleDot:{position:'absolute',width:20,height:20,borderRadius:10,backgroundColor:'#fff',borderWidth:5,marginLeft:-10,top:-3},
 heroDetail:{fontSize:13,lineHeight:19,color:SW.ink,textAlign:'center',paddingHorizontal:8},heroUpdated:{fontSize:10,color:SW.muted},
 heroButton:{minHeight:52,borderRadius:16,alignItems:'center',justifyContent:'center'},heroButtonText:{color:'#fff',fontWeight:'800',fontSize:15},
 card:{backgroundColor:SW.card,borderRadius:24,padding:17,gap:12,shadowColor:'#2D4A3E',shadowOpacity:0.06,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:2},
 cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardTitle:{fontSize:19,fontWeight:'800',color:SW.ink},
 pill:{flexDirection:'row',gap:7,alignItems:'center',backgroundColor:SW.bg,borderRadius:14,paddingVertical:7,paddingHorizontal:10},pillTitle:{fontSize:14,fontWeight:'800'},pillSub:{fontSize:10,color:SW.muted},
 dot:{width:10,height:10,borderRadius:5},muted:{fontSize:11,lineHeight:16,color:SW.muted},
 empty:{flex:1,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:14},
 axis:{flexDirection:'row',justifyContent:'space-between'},axisText:{fontSize:9,color:'#9AA7AD'},
 statLabel:{fontSize:11,fontWeight:'700'},statValue:{fontSize:21,fontWeight:'800',color:SW.ink},statUnit:{fontSize:11,fontWeight:'600',color:SW.muted},
 segment:{flexDirection:'row',backgroundColor:SW.bg,borderRadius:12,padding:3},seg:{flex:1,alignItems:'center',paddingVertical:7,borderRadius:10},segActive:{backgroundColor:'#fff'},segText:{fontSize:12,fontWeight:'700',color:SW.muted},
 row:{flexDirection:'row',alignItems:'center',gap:12},tileHead:{flexDirection:'row',alignItems:'center',gap:6},tileTitle:{fontSize:15,fontWeight:'800',color:SW.ink},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:11},tile:{width:'48%',minHeight:170,gap:6},tileValue:{fontSize:24,fontWeight:'800',color:SW.ink},
 tileIcon:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',alignSelf:'center'}
});
