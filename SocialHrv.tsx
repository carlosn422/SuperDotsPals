import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,AppState,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg,{Circle} from 'react-native-svg';
import {supabase} from './supabase';
import {APP_THEME as T} from './MoodMascot';
import {useStress} from './StressDashboard';
import {requestScreenTimeAccess} from './modules/watch-link/screenBreak';
import {SocialAppLabel,configureSocialTrack,getSocialState,pickTrackedApps,socialDaily,socialMarks,socialTrackSupported,type DailyUse,type SocialMark,type SocialState} from './modules/watch-link/socialTrack';
import {getBreakState} from './modules/watch-link/screenBreak';
import {usePlus} from './PlusStore';
import {CustomDurationSheet,startScreenTimeTrial,syncScreenBreak,type Entitlement} from './FamilyScreenBreak';
import {LOOKBACK_DAYS,OWNER,appInsights,appsFor,formatMins,insightLine,ownerMinutesOn,usageBuckets,usageByDay,type MoodEntry,type UsageBucket,type UsagePeriod} from './SocialHrvInsights';


function useSocialData(){
 const [state,setState]=useState<SocialState|null>(()=>getSocialState());
 const [marks,setMarks]=useState<SocialMark[]>([]),[daily,setDaily]=useState<DailyUse[]>([]);
 const refresh=useCallback(()=>{setState(getSocialState());setMarks(socialMarks(Date.now()-LOOKBACK_DAYS*864e5));setDaily(socialDaily())},[]);
 useEffect(()=>{refresh();const sub=AppState.addEventListener('change',s=>{if(s==='active')refresh()});return()=>sub.remove()},[refresh]);
 const byDay=useMemo(()=>usageByDay(daily,marks),[daily,marks]);
 return {state,marks,byDay,refresh};
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
 const {state,marks,byDay,refresh}=useSocialData();
 const {points}=useStress();
 const moods=useMoods();
 const {isPlus,showPaywall}=usePlus();
 const [busy,setBusy]=useState(''),[limitSheet,setLimitSheet]=useState(false),[error,setError]=useState('');
 const [ent,setEnt]=useState<Entitlement|null>(null);
 useEffect(()=>{void syncScreenBreak(isPlus).then(e=>{if(e)setEnt(e);refresh()})},[isPlus]);
 const plus=isPlus||!!ent?.has_plus;
 const insights=useMemo(()=>appInsights(marks,points,moods),[marks,points,moods]);
 if(!socialTrackSupported||!state)return <View style={st.card}><Text style={st.body}>Apps & stress needs the latest MoodPals build on this iPhone.</Text></View>;
 const chosen=state.apps.length+state.groupCount;
 async function allow(){setBusy('auth');try{await requestScreenTimeAccess()}catch{}setBusy('');refresh()}
 /** Tracking needs Plus or the 14-day trial shared with Screen Break, which starts here if it hasn't yet. */
 async function canTrack(){
  if(plus)return true;
  setError('');
  const e=await startScreenTimeTrial(isPlus);
  if(!e){setError('Check your connection, then try again.');return false}
  setEnt(e);
  if(e.allowed||e.has_plus)return true;
  showPaywall('screenTime');return false;
 }
 async function pick(){setBusy('pick');try{const n=await pickTrackedApps();if(n&&!state!.enabled&&await canTrack())configureSocialTrack(true,state!.limitMinutes)}catch{}setBusy('');refresh()}
 async function resume(){setBusy('resume');try{if(await canTrack())configureSocialTrack(true,state!.limitMinutes)}catch{}setBusy('');refresh()}
 const set=(enabled:boolean,limit:number)=>{try{configureSocialTrack(enabled,limit)}catch{}refresh()};
 return <View style={{gap:14}}>
  <View><Text style={st.title}>Screen Time & Stress</Text><Text style={st.sub}>See how your apps, screen time, and stress are connected.</Text></View>
  {!plus&&ent?<TrialNote ent={ent} onUpgrade={()=>showPaywall('screenTime')}/>:null}
  {error?<Text style={[st.sub,{color:'#C2573F'}]}>{error}</Text>:null}
  {!state.authorized?<View style={st.card}>
   <Text style={st.rowTitle}>Allow Screen Time access</Text>
   <Text style={st.sub}>MoodPals uses Apple's Screen Time to note each 15 minutes you spend in the apps you choose. Usage stays on this iPhone.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void allow()} style={st.cta}>{busy==='auth'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Allow Screen Time Access</Text>}</TouchableOpacity>
  </View>:!chosen?<View style={st.card}>
   <Text style={st.rowTitle}>Choose apps to track</Text>
   <Text style={st.sub}>For example social media, news and video apps like Instagram, TikTok, X and YouTube. Pick apps one by one to see each separately.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={()=>void pick()} style={st.cta}>{busy==='pick'?<ActivityIndicator color="#fff"/>:<Text style={st.ctaText}>Choose Apps</Text>}</TouchableOpacity>
  </View>:<>
   <LimitHero limit={state.limitMinutes} used={ownerMinutesOn(byDay)} chosen={chosen} enabled={state.enabled}/>
   <View style={{flexDirection:'row',gap:10}}>
    <Tile icon="apps-outline" label="Edit Apps" busy={busy==='pick'} onPress={()=>void pick()}/>
    <Tile icon="time-outline" label="Set Limit" disabled={!state.enabled} onPress={()=>setLimitSheet(true)}/>
    <Tile icon={state.enabled?'pause-circle-outline':'play-circle-outline'} label={state.enabled?'Pause':'Resume'} busy={busy==='resume'} onPress={()=>state.enabled?set(false,state.limitMinutes):void resume()}/>
   </View>
   <CustomDurationSheet visible={limitSheet} title="Daily limit" initialMinutes={state.limitMinutes||60} onClose={()=>setLimitSheet(false)} onChoose={n=>{setLimitSheet(false);set(true,n)}} onOff={state.limitMinutes?()=>{setLimitSheet(false);set(true,0)}:undefined}/>
   <UsageChart byDay={byDay} marks={marks} points={points}/>
   <TopApps insights={insights} marks={marks}/>
   <Text style={st.note}>{state.limitMinutes?`Your ${formatMins(state.limitMinutes)} is one daily total shared by your ${chosen} tracked ${chosen===1?'app':'apps'}. Only your time counts: time on a family member's timer goes to them. `:''}At the limit, Take a break closes the app, I need it today keeps them open until midnight. Patterns, not a diagnosis: HRV also changes with sleep, exercise, caffeine and illness. Totals are counted in 5-minute steps and apps in 15-minute steps.</Text>
  </>}
 </View>;
}

function TrialNote({ent,onUpgrade}:{ent:Entitlement;onUpgrade:()=>void}){
 const days=ent.trial_ends_at?Math.max(0,Math.ceil((Date.parse(ent.trial_ends_at)-Date.now())/864e5)):0;
 const ended=!ent.trial_available&&!ent.allowed;
 const text=ent.trial_available?'14 days free: your trial starts when you turn on tracking. Screen Break uses the same trial.':ent.allowed?`Free trial: ${days} ${days===1?'day':'days'} left.`:'Your 14-day free trial has ended. Your history stays here. MoodPals Plus keeps tracking and daily limits on.';
 return <TouchableOpacity accessibilityRole="button" onPress={onUpgrade} style={st.trial}>
  <View style={st.row}><Ionicons name="sparkles-outline" size={18} color={T.primary}/><Text style={[st.sub,{flex:1,color:T.ink}]}>{text}</Text>{!ent.trial_available&&!ended?<Text style={st.plusTag}>Plus</Text>:null}</View>
  {ended?<View style={st.cta}><Text style={st.ctaText}>Get MoodPals Plus</Text></View>:null}
 </TouchableOpacity>;
}

function LimitHero({limit,used,chosen,enabled}:{limit:number;used:number;chosen:number;enabled:boolean}){
 const size=112,r=48,c=2*Math.PI*r,p=limit?Math.min(1,used/limit):0;
 return <View accessible accessibilityLabel={`Daily limit ${limit?formatMins(limit)+' total, shared by '+chosen+' selected apps':'off'}. ${formatMins(used)} used${limit?' of '+formatMins(limit):''}`} style={st.hero}>
  <View style={{flex:1,gap:2}}>
   <Text style={st.heroLabel}>Daily limit</Text>
   <Text style={st.heroValue} numberOfLines={1} adjustsFontSizeToFit>{limit?formatMins(limit):'Off'}</Text>
   <Text style={st.heroLabel}>{!enabled?'Tracking paused':`Shared by ${chosen} ${chosen===1?'app':'apps'}`}</Text>
  </View>
  <View style={st.divider}/>
  <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>
   <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
    <Circle cx={size/2} cy={size/2} r={r} stroke="#DDF2E5" strokeWidth={10} fill="#fff"/>
    {p>0?<Circle cx={size/2} cy={size/2} r={r} stroke={T.primary} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${c*p} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>:null}
   </Svg>
   <Text style={st.ringValue}>{formatMins(used)}</Text>
   <Text style={st.ringLabel}>{limit?'of '+formatMins(limit):'used'}</Text>
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

const PERSON_COLORS=['#7C6CF2','#F4A570','#4FA3E0','#E46C8F','#C9A227'];
const PERIODS:{key:UsagePeriod;label:string}[]=[{key:'day',label:'Day'},{key:'week',label:'Week'},{key:'month',label:'Month'},{key:'year',label:'Year'}];
type Person={key:string;name:string;color:string};

/** You plus family members, each with a colour. Members only show up once they have a timer or usage. */
function usePeople(byDay:Map<number,Map<string,number>>):Person[]{
 const children=getBreakState()?.children??[];
 const seen=new Set<string>();byDay.forEach(m=>m.forEach((_,k)=>seen.add(k)));
 const list:Person[]=[{key:OWNER,name:'You',color:T.primary}];
 children.forEach((c,i)=>list.push({key:c.id,name:c.name,color:PERSON_COLORS[i%PERSON_COLORS.length]}));
 seen.forEach(k=>{if(!list.some(p=>p.key===k))list.push({key:k,name:'Family member',color:'#A9B4AF'})});
 return list;
}

// One chart for everyone: a stacked bar per day (or month), a colour per person. Pick a person to see only theirs.
// Tap or drag across the bars to select one; each bar is one column, so bars, tooltip and labels line up.
function UsageChart({byDay,marks,points}:{byDay:Map<number,Map<string,number>>;marks:SocialMark[];points:ReturnType<typeof useStress>['points']}){
 const H=150;
 const [period,setPeriod]=useState<UsagePeriod>('week'),[who,setWho]=useState<string|undefined>(undefined);
 const [mode,setMode]=useState<'time'|'stress'>('time'),[width,setWidth]=useState(0),[picked,setPicked]=useState<number|null>(null);
 const people=usePeople(byDay);
 const shown=who===undefined?people:people.filter(p=>p.key===who);
 const buckets=useMemo(()=>usageBuckets(byDay,points,period),[byDay,points,period]);
 const n=buckets.length,sel=Math.min(n-1,picked??n-1),b=buckets[sel];
 const minutesOf=(x:UsageBucket)=>shown.reduce((t,p)=>t+(x.byWho[p.key]??0),0);
 const val=(x:UsageBucket)=>mode==='time'?minutesOf(x):x.stress;
 const unit=period==='year'?60:15;
 const step=Math.max(unit,Math.ceil(Math.max(0,...buckets.map(minutesOf))/4/unit)*unit);
 const top=mode==='time'?step*4:100;
 const ticks=[4,3,2,1,0].map(k=>k*top/4);
 const label=(v:number|null)=>v===null?'No reading':mode==='time'?formatMins(v):String(v);
 const tick=(v:number)=>mode==='time'?(v>=60&&v%60===0?`${v/60}h`:v>=60?`${Math.floor(v/60)}h${v%60}`:`${v}m`):String(v);
 const name=(x:UsageBucket,long=false)=>period==='year'?new Date(x.start).toLocaleDateString(undefined,long?{month:'long',year:'numeric'}:{month:'narrow'})
  :period==='month'&&!long?String(new Date(x.start).getDate()):new Date(x.start).toLocaleDateString(undefined,long?{weekday:'long',month:'short',day:'numeric'}:{weekday:'short'});
 const pick=(x:number)=>{if(width>0)setPicked(Math.max(0,Math.min(n-1,Math.floor(x/(width/n)))))};
 const apps=appsFor(marks,who,b.start,b.end);
 const appsCovered=b.start>=Date.now()-LOOKBACK_DAYS*864e5;
 const choose=(p:UsagePeriod)=>{setPeriod(p);setPicked(null)};
 const total=minutesOf(b);
 return <View style={st.card}>
  <View style={st.row}>
   <Text style={[st.heading,{flex:1,fontSize:20}]}>Screen Time</Text>
   <View style={st.segment}>{(['time','stress'] as const).map(m=><TouchableOpacity key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>setMode(m)} style={[st.segItem,mode===m&&st.segOn]}><Text style={[st.segText,mode===m&&{color:'#fff'}]}>{m==='time'?'Time':'Stress'}</Text></TouchableOpacity>)}</View>
  </View>
  <View style={[st.segment,{alignSelf:'stretch'}]}>{PERIODS.map(p=><TouchableOpacity key={p.key} accessibilityRole="tab" accessibilityState={{selected:period===p.key}} onPress={()=>choose(p.key)} style={[st.segItem,{flex:1,alignItems:'center',paddingHorizontal:4},period===p.key&&st.segOn]}><Text style={[st.segText,period===p.key&&{color:'#fff'}]}>{p.label}</Text></TouchableOpacity>)}</View>
  {mode==='time'&&people.length>1?<View style={[st.row,{flexWrap:'wrap'}]}>
   {[{key:undefined as string|undefined,name:'All',color:T.ink},...people].map(p=>{const on=who===p.key;return <TouchableOpacity key={p.key??'all'} accessibilityRole="button" accessibilityState={{selected:on}} onPress={()=>setWho(p.key)} style={[st.chip,on&&{backgroundColor:p.key?p.color:T.ink,borderColor:p.key?p.color:T.ink}]}>
    {p.key?<View style={[st.dot,{backgroundColor:on?'#fff':p.color}]}/>:null}<Text style={[st.chipText,on&&{color:'#fff'}]}>{p.name}</Text>
   </TouchableOpacity>})}
  </View>:null}
  {period==='day'?<View style={{gap:10,paddingTop:6}}>
   {mode==='stress'?<Text style={st.body}>{b.stress===null?'No HRV reading today.':`Average stress today: ${b.stress}`}</Text>:shown.map(p=>{const v=b.byWho[p.key]??0,most=Math.max(1,...shown.map(q=>b.byWho[q.key]??0));return <View key={p.key} style={{gap:4}}>
    <View style={st.row}><View style={[st.dot,{backgroundColor:p.color}]}/><Text style={[st.rowTitle,{flex:1}]}>{p.name}</Text><Text style={st.minutes}>{formatMins(v)}</Text></View>
    <View style={st.track}><View style={[st.fill,{backgroundColor:p.color,width:`${v?Math.max(4,v/most*100):0}%`}]}/></View>
   </View>})}
  </View>:<View style={{flexDirection:'row',marginTop:30}}>
   <View style={{width:34,height:H,justifyContent:'space-between'}}>{ticks.map(v=><Text key={v} style={[st.axis,{marginVertical:-7}]}>{tick(v)}</Text>)}</View>
   <View style={{flex:1}}>
    <View style={[StyleSheet.absoluteFill,{height:H,justifyContent:'space-between'}]} pointerEvents="none">{ticks.map(v=><View key={v} style={{height:1,backgroundColor:T.border}}/>)}</View>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderTerminationRequest={()=>false}
     onResponderGrant={e=>pick(e.nativeEvent.locationX)} onResponderMove={e=>pick(e.nativeEvent.locationX)}
     accessible accessibilityRole="adjustable" accessibilityLabel={mode==='time'?'Time in tracked apps':'Average stress score'} accessibilityValue={{text:`${name(b,true)}, ${label(val(b))}`}}
     accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>setPicked(Math.max(0,Math.min(n-1,sel+(e.nativeEvent.actionName==='increment'?1:-1))))}
     style={{flexDirection:'row'}}>
     {buckets.map((x,i)=>{const v=val(x),h=v?Math.max(4,v/top*H):0,on=i===sel;return <View key={x.start} pointerEvents="none" style={{flex:1,alignItems:'center'}}>
      <View style={{height:H,width:'100%',alignItems:'center',justifyContent:'flex-end'}}>
       {on?<View style={[st.tip,{bottom:h+8}]}><Text style={st.tipText}>{label(v)}</Text><View style={st.tipArrow}/></View>:null}
       <View style={{width:'72%',maxWidth:40,height:h,borderTopLeftRadius:n>12?2:6,borderTopRightRadius:n>12?2:6,overflow:'hidden',opacity:on?1:0.5,backgroundColor:mode==='stress'?'#2E9E5E':undefined,flexDirection:'column-reverse'}}>
        {mode==='time'?shown.map(p=>{const m=x.byWho[p.key]??0;return m?<View key={p.key} style={{height:m/top*H,backgroundColor:p.color}}/>:null}):null}
       </View>
      </View>
      <Text style={[st.axisDay,on&&{color:T.ink},n>12&&{fontSize:10}]}>{period==='month'&&i%5!==4&&!on?' ':name(x)}</Text>
     </View>})}
    </View>
   </View>
  </View>}
  <View style={st.dayDetail}>
   <Text style={st.rowTitle}>{period==='day'?'Today':period==='year'?name(b,true):sel===n-1?'Today':name(b,true)}</Text>
   <Text style={st.sub}>{mode==='time'?`${formatMins(total)} in tracked apps${who===undefined?'':' · '+(people.find(p=>p.key===who)?.name??'')}`:b.stress!==null?`Avg stress ${b.stress}`:'No HRV reading'}</Text>
   {mode==='time'&&who===undefined&&period!=='day'?people.filter(p=>b.byWho[p.key]).map(p=><View key={p.key} style={st.row}><View style={[st.dot,{backgroundColor:p.color}]}/><Text style={[st.body,{flex:1}]}>{p.name}</Text><Text style={st.minutes}>{formatMins(b.byWho[p.key])}</Text></View>):null}
   {mode==='time'&&apps.length?<Text style={[st.kickerSmall,{marginTop:4}]}>Top apps</Text>:null}
   {mode==='time'?apps.slice(0,5).map(([app,m])=><View key={app} style={st.row}><AppName app={app}/><Text style={st.minutes}>{formatMins(m)}</Text></View>):null}
   {mode==='time'&&!appsCovered?<Text style={st.sub}>App details cover the last {LOOKBACK_DAYS} days.</Text>:null}
  </View>
 </View>;
}

/** Today tab summary; hidden until tracking is on. */
export function SocialHrvTodayCard({onOpen}:{onOpen:()=>void}){
 const {state,marks,byDay}=useSocialData();
 const {points}=useStress();
 const insights=useMemo(()=>appInsights(marks,points,[]),[marks,points]);
 if(!socialTrackSupported||!state?.enabled)return null;
 const used=ownerMinutesOn(byDay);
 const flagged=insights.find(i=>!i.learning&&i.delta!==undefined&&i.delta>=8);
 return <TouchableOpacity accessibilityRole="button" onPress={onOpen} style={st.card}>
  <View style={st.row}><Ionicons name="phone-portrait-outline" size={20} color={T.primary}/><Text style={[st.heading,{flex:1}]}>Apps & stress</Text><Ionicons name="chevron-forward" size={18} color={T.muted}/></View>
  <Text style={st.body}>{formatMins(used)} in tracked apps today{state.limitMinutes?` of ${formatMins(state.limitMinutes)}`:''}</Text>
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
 trial:{gap:10,backgroundColor:'#EAF7EF',borderRadius:16,padding:12,borderWidth:1,borderColor:'#D3EEDC'},
 plusTag:{color:T.primary,fontWeight:'900',fontSize:12},
 card:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:T.border},
 row:{flexDirection:'row',alignItems:'center',gap:8},
 appRow:{gap:4,paddingVertical:8,borderTopWidth:1,borderTopColor:T.border},
 minutes:{fontSize:13,fontWeight:'800',color:T.muted},
 axis:{fontSize:11,fontWeight:'700',color:T.muted},
 hero:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#EAF7EF',borderRadius:24,padding:20,borderWidth:1,borderColor:'#D3EEDC'},
 heroLabel:{fontSize:16,fontWeight:'700',color:T.muted},
 divider:{width:1,alignSelf:'stretch',backgroundColor:'#CFE5D7',marginVertical:6},
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
 chip:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:16,borderWidth:1,borderColor:T.border,paddingHorizontal:12,paddingVertical:6,backgroundColor:'#fff'},
 chipText:{fontSize:13,fontWeight:'800',color:T.ink},
 dot:{width:10,height:10,borderRadius:5},
 kickerSmall:{fontSize:12,fontWeight:'900',color:T.muted,textTransform:'uppercase',letterSpacing:0.5},
 cta:{backgroundColor:T.primary,borderRadius:26,minHeight:50,alignItems:'center',justifyContent:'center',paddingHorizontal:18},
 ctaText:{color:'#fff',fontSize:16,fontWeight:'900'},
});
