import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,AppState,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg,{Circle} from 'react-native-svg';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {useStress} from './StressDashboard';
import {requestScreenTimeAccess} from './modules/watch-link/screenBreak';
import {SocialAppLabel,configureSocialTrack,getSocialState,pickTrackedApps,socialMarks,socialTrackSupported,type SocialMark,type SocialState} from './modules/watch-link/socialTrack';
import {CustomDurationSheet} from './FamilyScreenBreak';
import {LOOKBACK_DAYS,appInsights,formatMins,insightLine,minutesByDay,weekUse,type MoodEntry} from './SocialHrvInsights';


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
  <View><Text style={st.title}>Screen Time & Stress</Text><Text style={st.sub}>See how your apps, screen time, and stress are connected.</Text></View>
  {!state.authorized?<View style={st.card}>
   <Text style={st.rowTitle}>Allow Screen Time access</Text>
   <Text style={st.sub}>MoodPals uses Apple's Screen Time to note each 15 minutes you spend in the apps you choose. Usage stays on this iPhone.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void allow()} style={st.cta}>{busy==='auth'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Allow Screen Time Access</Text>}</TouchableOpacity>
  </View>:!chosen?<View style={st.card}>
   <Text style={st.rowTitle}>Choose apps to track</Text>
   <Text style={st.sub}>For example social media, news and video apps like Instagram, TikTok, X and YouTube. Pick apps one by one to see each separately.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void pick()} style={st.cta}>{busy==='pick'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Choose Apps</Text>}</TouchableOpacity>
  </View>:<>
   <LimitHero limit={state.limitMinutes} used={week[6].minutes} chosen={chosen} enabled={state.enabled}/>
   <View style={{flexDirection:'row',gap:10}}>
    <Tile icon="apps-outline" label="Edit Apps" busy={busy==='pick'} onPress={()=>void pick()}/>
    <Tile icon="time-outline" label="Set Limit" disabled={!state.enabled} onPress={()=>setLimitSheet(true)}/>
    <Tile icon={state.enabled?'pause-circle-outline':'play-circle-outline'} label={state.enabled?'Pause':'Resume'} onPress={()=>set(!state.enabled,state.limitMinutes)}/>
   </View>
   <CustomDurationSheet visible={limitSheet} title="Daily limit" initialMinutes={state.limitMinutes||60} onClose={()=>setLimitSheet(false)} onChoose={n=>{setLimitSheet(false);set(true,n)}} onOff={state.limitMinutes?()=>{setLimitSheet(false);set(true,0)}:undefined}/>
   <WeekChart week={week} marks={marks}/>
   <TopApps insights={insights} marks={marks}/>
   <Text style={st.note}>At your limit, tracked apps show a reminder: Take a break closes the app, I need it today keeps them open until midnight. Patterns, not a diagnosis: HRV also changes with sleep, exercise, caffeine and illness. Use is counted in 15-minute steps, and time during a family member's Screen Break isn't counted.</Text>
  </>}
 </View>;
}

function LimitHero({limit,used,chosen,enabled}:{limit:number;used:number;chosen:number;enabled:boolean}){
 const size=112,r=48,c=2*Math.PI*r,p=limit?Math.min(1,used/limit):0;
 return <View accessible accessibilityLabel={`Today's limit ${limit?formatMins(limit):'off'}, ${formatMins(used)} used, ${chosen} apps tracked`} style={st.hero}>
  <View style={{flex:1,gap:2}}>
   <Text style={st.heroLabel}>Today's Limit</Text>
   <Text style={st.heroValue} numberOfLines={1} adjustsFontSizeToFit>{limit?formatMins(limit):'Off'}</Text>
   <Text style={st.heroLabel}>{enabled?`${chosen} ${chosen===1?'app':'apps'} tracked`:'Tracking paused'}</Text>
  </View>
  <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>
   <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
    <Circle cx={size/2} cy={size/2} r={r} stroke="#DDF2E5" strokeWidth={10} fill="#fff"/>
    {p>0?<Circle cx={size/2} cy={size/2} r={r} stroke={T.primary} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${c*p} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>:null}
   </Svg>
   <Text style={st.ringValue}>{formatMins(used)}</Text>
   <Text style={st.ringLabel}>used</Text>
  </View>
 </View>;
}

function Tile({icon,label,onPress,disabled,busy}:{icon:keyof typeof Ionicons.glyphMap;label:string;onPress:()=>void;disabled?:boolean;busy?:boolean}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled||busy} onPress={onPress} style={[st.tile,disabled&&{opacity:0.5}]}>
  {busy?<ActivityIndicator color={T.primary}/>:<Ionicons name={icon} size={28} color={T.primary}/>}
  <Text style={st.tileText}>{label}</Text>
 </TouchableOpacity>;
}

function TopApps({insights,marks}:{insights:ReturnType<typeof appInsights>;marks:SocialMark[]}){
 const [open,setOpen]=useState<number|null>(null);
 const first=marks.reduce((m,x)=>Math.min(m,x.at),Date.now());
 const span=Math.min(LOOKBACK_DAYS,Math.floor((Date.now()-new Date(first).setHours(0,0,0,0))/864e5)+1);
 const rows=[...insights].sort((a,b)=>b.periodMinutes-a.periodMinutes).map(i=>({i,avg:Math.round(i.periodMinutes/span)}));
 const top=Math.max(1,...rows.map(r=>r.avg));
 return <View style={st.card}>
  <Text style={st.heading}>Top Apps · Last {LOOKBACK_DAYS} Days</Text>
  {!rows.length?<Text style={st.sub}>Nothing yet. Apps appear after 15 minutes in a tracked app.</Text>:rows.map(({i,avg},n)=>{const on=open===i.app;return <TouchableOpacity key={i.app} accessibilityRole="button" accessibilityState={{expanded:on}} onPress={()=>setOpen(on?null:i.app)} style={[st.appRow,n===0&&{borderTopWidth:0}]}>
   <View style={st.row}><AppName app={i.app}/><Text style={st.rowTitle}>{formatMins(i.todayMinutes)}</Text><Ionicons name={on?'chevron-down':'chevron-forward'} size={18} color={T.muted}/></View>
   <Text style={st.sub}>{formatMins(avg)} daily avg · today {formatMins(i.todayMinutes)}</Text>
   <View style={st.track}><View style={[st.fill,{width:`${Math.max(4,avg/top*100)}%`}]}/></View>
   {on?<View style={{gap:4,paddingTop:4}}>
    <Text style={[st.body,i.delta!==undefined&&i.delta>=8&&{color:'#C2573F'}]}>{insightLine(i)}</Text>
    <Text style={st.sub}>{formatMins(i.periodMinutes)} over {i.days} {i.days===1?'day':'days'}{i.hrvAfter&&i.hrvUsual&&!i.learning?` · HRV after ${Math.round(i.hrvAfter)} ms vs usual ${Math.round(i.hrvUsual)} ms`:''}{i.topMood?` · Mood logged after: mostly ${i.topMood} (${i.moodCount})`:''}</Text>
   </View>:null}
  </TouchableOpacity>})}
 </View>;
}

// Tap or drag across a day to select it. Each day is one column, so bars, tooltip and labels always line up.
function WeekChart({week,marks}:{week:ReturnType<typeof weekUse>;marks:SocialMark[]}){
 const H=150;
 const [sel,setSel]=useState(6),[width,setWidth]=useState(0),[mode,setMode]=useState<'time'|'stress'>('time');
 const byDay=useMemo(()=>minutesByDay(marks),[marks]);
 const step=Math.max(15,Math.ceil(Math.max(...week.map(d=>d.minutes))/4/15)*15);
 const top=mode==='time'?step*4:100;
 const ticks=[4,3,2,1,0].map(k=>k*top/4);
 const val=(d:typeof week[number])=>mode==='time'?d.minutes:d.stress;
 const label=(v:number|null)=>v===null?'No reading':mode==='time'?formatMins(v):String(v);
 const tick=(v:number)=>mode==='time'?(v>=60&&v%60===0?`${v/60}h`:v>=60?`${Math.floor(v/60)}h${v%60}`:`${v}m`):String(v);
 const day=week[sel];
 const apps=[...(byDay.get(day.start)?.entries()??[])].sort((a,b)=>b[1]-a[1]);
 const pick=(x:number)=>{if(width>0)setSel(Math.max(0,Math.min(6,Math.floor(x/(width/7)))))};
 const name=(start:number,long=false)=>new Date(start).toLocaleDateString(undefined,long?{weekday:'long',month:'short',day:'numeric'}:{weekday:'short'});
 return <View style={st.card}>
  <View style={st.row}>
   <Text style={[st.heading,{flex:1,fontSize:20}]}>This Week</Text>
   <View style={st.segment}>{(['time','stress'] as const).map(m=><TouchableOpacity key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>setMode(m)} style={[st.segItem,mode===m&&st.segOn]}><Text style={[st.segText,mode===m&&{color:'#fff'}]}>{m==='time'?'Time':'Stress'}</Text></TouchableOpacity>)}</View>
  </View>
  <View style={{flexDirection:'row',marginTop:30}}>
   <View style={{width:34,height:H,justifyContent:'space-between'}}>{ticks.map(v=><Text key={v} style={[st.axis,{marginVertical:-7}]}>{tick(v)}</Text>)}</View>
   <View style={{flex:1}}>
    <View style={[StyleSheet.absoluteFill,{height:H,justifyContent:'space-between'}]} pointerEvents="none">{ticks.map(v=><View key={v} style={{height:1,backgroundColor:T.border}}/>)}</View>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderTerminationRequest={()=>false}
     onResponderGrant={e=>pick(e.nativeEvent.locationX)} onResponderMove={e=>pick(e.nativeEvent.locationX)}
     accessible accessibilityRole="adjustable" accessibilityLabel={mode==='time'?'Time in tracked apps this week':'Average stress score this week'} accessibilityValue={{text:`${name(day.start,true)}, ${label(val(day))}`}}
     accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>setSel(i=>Math.max(0,Math.min(6,i+(e.nativeEvent.actionName==='increment'?1:-1))))}
     style={{flexDirection:'row'}}>
     {week.map((d,i)=>{const v=val(d),h=v?Math.max(4,v/top*H):0,on=i===sel;return <View key={d.start} pointerEvents="none" style={{flex:1,alignItems:'center'}}>
      <View style={{height:H,width:'100%',alignItems:'center',justifyContent:'flex-end'}}>
       {on?<View style={[st.tip,{bottom:h+8}]}><Text style={st.tipText}>{label(v)}</Text><View style={st.tipArrow}/></View>:null}
       <View style={{width:'72%',maxWidth:40,height:h,borderTopLeftRadius:6,borderTopRightRadius:6,backgroundColor:on?'#2E9E5E':'#C6EBD3'}}/>
      </View>
      <Text style={[st.axisDay,on&&{color:T.ink}]}>{name(d.start)}</Text>
     </View>})}
    </View>
   </View>
  </View>
  <View style={st.dayDetail}>
   <Text style={st.rowTitle}>{sel===6?'Today':name(day.start,true)}</Text>
   <Text style={st.sub}>{formatMins(day.minutes)} in tracked apps{day.stress!==null?` · avg stress ${day.stress}`:' · no HRV reading'}</Text>
   {apps.map(([app,n])=><View key={app} style={st.row}><AppName app={app}/><Text style={st.minutes}>{formatMins(n)}</Text></View>)}
  </View>
 </View>;
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
 title:{fontSize:30,fontWeight:'900',color:T.ink},
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
 hero:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#EAF7EF',borderRadius:24,padding:20,borderWidth:1,borderColor:'#D3EEDC'},
 heroLabel:{fontSize:16,fontWeight:'700',color:T.muted},
 heroValue:{fontSize:40,fontWeight:'900',color:T.ink},
 ringValue:{fontSize:18,fontWeight:'900',color:T.ink},
 ringLabel:{fontSize:13,fontWeight:'700',color:T.muted},
 tile:{flex:1,alignItems:'center',justifyContent:'center',gap:8,minHeight:96,backgroundColor:T.surface,borderRadius:18,borderWidth:1,borderColor:T.border,paddingHorizontal:4},
 tileText:{fontSize:14,fontWeight:'800',color:T.ink,textAlign:'center'},
 segment:{flexDirection:'row',backgroundColor:'#EEF2F0',borderRadius:18,padding:3},
 segItem:{paddingHorizontal:16,paddingVertical:7,borderRadius:15},
 segOn:{backgroundColor:'#2E9E5E'},
 segText:{fontSize:14,fontWeight:'800',color:T.muted},
 axisDay:{fontSize:13,fontWeight:'700',color:T.muted,marginTop:8},
 tip:{position:'absolute',backgroundColor:'#2E9E5E',borderRadius:10,paddingHorizontal:8,paddingVertical:5,alignItems:'center',minWidth:56,zIndex:2},
 tipText:{color:'#fff',fontSize:12,fontWeight:'900'},
 tipArrow:{position:'absolute',bottom:-5,width:10,height:10,backgroundColor:'#2E9E5E',transform:[{rotate:'45deg'}]},
 track:{height:8,borderRadius:4,backgroundColor:'#EEF2F0',overflow:'hidden'},
 fill:{height:8,borderRadius:4,backgroundColor:T.primary},
 dayDetail:{gap:6,paddingTop:10,borderTopWidth:1,borderTopColor:T.border},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:50,alignItems:'center',justifyContent:'center',paddingHorizontal:18},
 ctaText:{color:'#fff',fontSize:16,fontWeight:'900'},
});
