import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,ScrollView,StyleSheet,ActivityIndicator,Alert,PanResponder,Switch,Animated,Easing,AccessibilityInfo} from 'react-native';
import Svg,{Circle,Path} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {openSignInNext} from './AuthScreen';
import {SW} from './StressTheme';
import {Fill} from './DrinkDetail';
import {saveDrinkGoal} from './Drinks';
import {saveHealthGoals} from './HealthDetail';
import {healthKitAvailable,syncNativeHealth} from './HealthDataPanel';
import {configureSocialTrack,getSocialState,socialTrackSupported} from './modules/watch-link/socialTrack';
import {formatMins} from './SocialHrvInsights';
import {playVoiceDemo,type VoiceGender} from './VoiceFriend';
export const DOTS=[
 {id:'bloop',name:'Bloop',theme:'grape',color:'#7139E9',light:'#EEE5FF',face:'●',description:'Curious & cuddly'},
 {id:'poppy',name:'Poppy',theme:'coral',color:'#E76B8A',light:'#FFE7EE',face:'✿',description:'Warm & cheerful'},
 {id:'mochi',name:'Mochi',theme:'sky',color:'#488CD9',light:'#E2F1FF',face:'✦',description:'Cool & calm'},
 {id:'zuzu',name:'Zuzu',theme:'sunny',color:'#E3A426',light:'#FFF4CE',face:'★',description:'Bright & bubbly'},
 {id:'nori',name:'Nori',theme:'mint',color:'#3BA986',light:'#E1F8ED',face:'♥',description:'Soft & peaceful'}
] as const;

type GoalId='stress'|'sleep'|'water'|'social'|'move'|'mindful';
const GOALS:{id:GoalId;label:string;pal:string}[]=[
 {id:'stress',label:'Feel less stressed',pal:'calm'},
 {id:'sleep',label:'Sleep better',pal:'tired'},
 {id:'water',label:'Drink more water',pal:'joy'},
 {id:'social',label:'Less social media',pal:'fear'},
 {id:'move',label:'Move more',pal:'joy'},
 {id:'mindful',label:'Be more mindful',pal:'calm'},
];
const MOODS=[{mood:'Joyful',pal:'joy'},{mood:'Calm',pal:'calm'},{mood:'Sad',pal:'sadness'},{mood:'Angry',pal:'anger'},{mood:'Anxious',pal:'fear'},{mood:'Tired',pal:'tired'}] as const;
// Same keys as earlier onboarding versions so saved answers still load when editing.
type Targets={water:number;sleep:number;steps:number;mindfulness:number;social_now:number;social_goal:number};
const DEFAULT_TARGETS:Targets={water:8,sleep:8,steps:8000,mindfulness:10,social_now:180,social_goal:60};
type Step='welcome'|'goals'|'water'|'socialNow'|'socialGoal'|'sleep'|'move'|'mindful'|'feeling'|'health'|'voice'|'reminders'|'plan';
// Same daily check-in reminder (storage key, settings columns, text) as More › Reminders, so either place can change it.
async function setDailyCheckin(uid:string,on:boolean,hour:number){
 const key='superdots-reminder-'+uid;
 if(on){const p=await Notifications.getPermissionsAsync().catch(()=>null);if(!p?.granted&&!(await Notifications.requestPermissionsAsync().catch(()=>null))?.granted)return}
 const previous=await AsyncStorage.getItem(key).catch(()=>null);
 const id=on?await Notifications.scheduleNotificationAsync({content:{title:'A moment for you 💜',body:'How are you feeling today? Your MoodPal is here for a quick check-in.',data:{screen:'Actions'},sound:false},trigger:{type:Notifications.SchedulableTriggerInputTypes.DAILY,hour,minute:0}}).catch(()=>null):null;
 if(on&&!id)return;
 const {error}=await supabase.from('user_settings').update({daily_reminders_enabled:on,daily_reminder_hour:hour,daily_reminder_minute:0,onboarding_notifications_preference:on}).eq('user_id',uid);
 if(error){if(id)await Notifications.cancelScheduledNotificationAsync(id).catch(()=>{});return}
 if(previous)await Notifications.cancelScheduledNotificationAsync(previous).catch(()=>{});
 if(id)await AsyncStorage.setItem(key,id).catch(()=>{});else await AsyncStorage.removeItem(key).catch(()=>{});
}

function useReduceMotion(){
 const [r,setR]=useState(false);
 useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setR);const s=AccessibilityInfo.addEventListener('reduceMotionChanged',setR);return()=>s.remove()},[]);
 return r;
}

// A round dial turned with a finger; ticks once per step. Also adjustable with VoiceOver swipes.
const SWEEP=300,START=-150;
function polar(cx:number,cy:number,r:number,deg:number){const a=(deg-90)*Math.PI/180;return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}}
function arc(cx:number,cy:number,r:number,from:number,to:number){const a=polar(cx,cy,r,from),b=polar(cx,cy,r,to);return `M${a.x} ${a.y} A${r} ${r} 0 ${to-from>180?1:0} 1 ${b.x} ${b.y}`}
function Dial({value,min,max,step,color,label,format,onChange,onDrag,children}:{value:number;min:number;max:number;step:number;color:string;label:string;format:(v:number)=>string;onChange:(v:number)=>void;onDrag:(on:boolean)=>void;children?:React.ReactNode}){
 const size=270,c=size/2,r=116,frac=(value-min)/(max-min);
 const ref=useRef({value,min,max,step,onChange});ref.current={value,min,max,step,onChange};
 const set=(v:number)=>{const {min,max,step,value,onChange}=ref.current;const n=Math.max(min,Math.min(max,Math.round((v-min)/step)*step+min));if(n!==value){onChange(n);void Haptics.selectionAsync().catch(()=>{})}};
 const fromTouch=(x:number,y:number)=>{
  let deg=Math.atan2(x-c,-(y-c))*180/Math.PI;if(deg<START)deg+=360;
  const f=(deg-START)/SWEEP;if(f>1)return;
  const {min,max,value}=ref.current,cur=(value-min)/(max-min);
  if(Math.abs(f-cur)>0.5)return; // don't jump across the gap at the bottom
  set(min+f*(max-min));
 };
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:e=>{onDrag(true);fromTouch(e.nativeEvent.locationX,e.nativeEvent.locationY)},
  onPanResponderMove:e=>fromTouch(e.nativeEvent.locationX,e.nativeEvent.locationY),
  onPanResponderRelease:()=>onDrag(false),onPanResponderTerminate:()=>onDrag(false),
 }),[]);
 const knob=polar(c,c,r,START+SWEEP*frac);
 return <View style={{alignItems:'center',gap:6}}>
  <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{text:format(value)}}
   accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>set(value+(e.nativeEvent.actionName==='increment'?step:-step))}
   style={{width:size,height:size}} {...pan.panHandlers}>
   <Svg width={size} height={size} pointerEvents="none">
    <Path d={arc(c,c,r,START,START+SWEEP)} stroke={SW.line} strokeWidth={22} strokeLinecap="round" fill="none"/>
    {frac>0.001?<Path d={arc(c,c,r,START,START+SWEEP*frac)} stroke={color} strokeWidth={22} strokeLinecap="round" fill="none"/>:null}
    <Circle cx={knob.x} cy={knob.y} r={17} fill="#fff" stroke={color} strokeWidth={5}/>
   </Svg>
   <View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}>{children}</View>
  </View>
  <Text style={s.dialValue} accessibilityElementsHidden>{format(value)}</Text>
  <View style={{flexDirection:'row',gap:14}}>
   <TouchableOpacity accessibilityLabel={'Less '+label} onPress={()=>set(value-step)} style={s.stepBtn}><Ionicons name="remove" size={22} color={SW.ink}/></TouchableOpacity>
   <TouchableOpacity accessibilityLabel={'More '+label} onPress={()=>set(value+step)} style={s.stepBtn}><Ionicons name="add" size={22} color={SW.ink}/></TouchableOpacity>
  </View>
 </View>;
}

// Six pals on a track; drag or tap to pick, and the chosen pal plays.
function MoodSlider({value,onChange,onDrag}:{value:number|null;onChange:(i:number)=>void;onDrag:(on:boolean)=>void}){
 const [w,setW]=useState(0);const ref=useRef({w,value,onChange});ref.current={w,value,onChange};
 const pick=(x:number)=>{const {w,value,onChange}=ref.current;if(!w)return;const i=Math.max(0,Math.min(MOODS.length-1,Math.floor(x/(w/MOODS.length))));if(i!==value){onChange(i);void Haptics.selectionAsync().catch(()=>{})}};
 const pan=useMemo(()=>PanResponder.create({onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:e=>{onDrag(true);pick(e.nativeEvent.locationX)},onPanResponderMove:e=>pick(e.nativeEvent.locationX),onPanResponderRelease:()=>onDrag(false),onPanResponderTerminate:()=>onDrag(false)}),[]);
 const m=value===null?null:MOODS[value];
 return <View style={{alignItems:'center',gap:14}}>
  <View style={s.palStage}>{m?<SuperdotMascot key={m.pal} id={m.pal} size={150}/>:<SuperdotMascot id="calm" size={150} animate={false}/>}</View>
  <Text style={s.dialValue}>{m?m.mood:'Slide to choose'}</Text>
  <View onLayout={e=>setW(e.nativeEvent.layout.width)} style={s.moodTrack} accessible accessibilityRole="adjustable" accessibilityLabel="Mood" accessibilityValue={{text:m?m.mood:'None'}} accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={e=>{const n=Math.max(0,Math.min(MOODS.length-1,(value??-1)+(e.nativeEvent.actionName==='increment'?1:-1)));onChange(n)}} {...pan.panHandlers}>
   {MOODS.map((x,i)=><View key={x.mood} pointerEvents="none" style={[s.moodDot,value===i&&{backgroundColor:SW.mint,borderColor:SW.green}]}>
    <SuperdotMascot id={x.pal} size={36} animate={false}/>
   </View>)}
  </View>
 </View>;
}

function GoalCard({g,on,onPress}:{g:typeof GOALS[number];on:boolean;onPress:()=>void}){
 const reduce=useReduceMotion();const pop=useRef(new Animated.Value(1)).current;
 const press=()=>{onPress();void Haptics.selectionAsync().catch(()=>{});if(!reduce)Animated.sequence([Animated.timing(pop,{toValue:0.94,duration:90,useNativeDriver:true}),Animated.spring(pop,{toValue:1,friction:4,useNativeDriver:true})]).start()};
 return <Animated.View style={{width:'48%',transform:[{scale:pop}]}}>
  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:on}} accessibilityLabel={g.label} onPress={press} style={[s.goal,on&&s.goalOn]}>
   <SuperdotMascot key={on?'on':'off'} id={g.pal} size={64} animate={on}/>
   <Text style={s.goalText}>{g.label}</Text>
   <Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={22} color={on?SW.green:'#C9D3D0'} style={{position:'absolute',top:10,right:10}}/>
  </TouchableOpacity>
 </Animated.View>;
}

export default function Onboarding({done,editing=false,onCancel}:{done:()=>void;editing?:boolean;onCancel?:()=>void}){
 const [i,setI]=useState(0),[goals,setGoals]=useState<GoalId[]>(editing?[]:['water','social']),[t,setT]=useState<Targets>(DEFAULT_TARGETS);
 const [voice,setVoice]=useState<VoiceGender>('female'),[playing,setPlaying]=useState<VoiceGender|null>(null);const stopDemo=useRef<()=>void>(()=>{});
 useEffect(()=>()=>stopDemo.current(),[]);
 const [mood,setMood]=useState<number|null>(null),[checkinReminder,setCheckinReminder]=useState(false),[fromPlan,setFromPlan]=useState(false);
 // What was saved before an edit, so only changed answers are applied and older text answers are kept.
 const [loaded,setLoaded]=useState<{goals:GoalId[];t:Targets;checkin:boolean;hour:number;legacy:string[]}|null>(null);
 const [health,setHealth]=useState<'idle'|'busy'|'done'>('idle'),[loading,setLoading]=useState(false),[fetching,setFetching]=useState(editing),[dragging,setDragging]=useState(false);
 const reduce=useReduceMotion();const fade=useRef(new Animated.Value(1)).current;
 useEffect(()=>{if(!editing)return;let active=true;(async()=>{
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Not signed in');
   const [{data:p,error:pe},{data:settings,error:se}]=await Promise.all([
    supabase.from('profiles').select('health_goals,baseline_preferences').eq('id',user.id).single(),
    supabase.from('user_settings').select('daily_reminders_enabled,daily_reminder_hour').eq('user_id',user.id).single()
   ]);if(pe||se)throw pe||se;if(!active)return;
   const raw=(p?.health_goals||[]) as string[],isGoal=(g:string):g is GoalId=>GOALS.some(x=>x.id===g);
   // Reminders live on each phone, so On means one is scheduled here (as in More › Reminders).
   const id=await AsyncStorage.getItem('superdots-reminder-'+user.id).catch(()=>null);
   const checkin=!!id&&(await Notifications.getAllScheduledNotificationsAsync().catch(()=>[])).some(n=>n.identifier===id);
   const g=raw.filter(isGoal),tt={...DEFAULT_TARGETS,...(p?.baseline_preferences||{})};
   setGoals(g);setT(tt);setCheckinReminder(checkin);
   setLoaded({goals:g,t:tt,checkin,hour:Number(settings?.daily_reminder_hour??9),legacy:raw.filter(x=>!isGoal(x))});
  }catch(e:any){if(active)Alert.alert('Could not load your profile',e?.message||'Please try again.');}
  finally{if(active)setFetching(false)}
 })();return()=>{active=false}},[editing]);

 const steps=useMemo<Step[]>(()=>{
  const has=(g:GoalId)=>goals.includes(g);
  // New accounts get a short setup (water, social media, Apple Health); the rest has defaults and is editable later.
  if(!editing)return ['welcome','water','socialNow','socialGoal','health','voice','plan'];
  return ['welcome','goals',...(has('water')?['water' as const]:[]),...(has('social')?['socialNow' as const,'socialGoal' as const]:[]),...(has('sleep')?['sleep' as const]:[]),
   ...(has('move')?['move' as const]:[]),...(has('mindful')||has('stress')?['mindful' as const]:[]),...(editing?[]:['feeling' as const]),'health','voice','reminders','plan'];
 },[goals,editing]);
 const step=steps[Math.min(i,steps.length-1)];
 const go=(n:number)=>{const to=Math.max(0,Math.min(steps.length-1,n));if(reduce){setI(to);return}
  Animated.timing(fade,{toValue:0,duration:120,useNativeDriver:true}).start(()=>{setI(to);Animated.timing(fade,{toValue:1,duration:220,easing:Easing.out(Easing.ease),useNativeDriver:true}).start()})};
 // Edit from the plan opens one screen; Done goes straight back to the plan.
 const jump=(s:Step)=>{setFromPlan(s!=='goals');go(steps.indexOf(s))};
 const backToPlan=()=>{setFromPlan(false);go(steps.indexOf('plan'))};
 const setTarget=(k:keyof Targets)=>(v:number)=>setT(x=>({...x,[k]:v}));

 async function connectHealth(){
  setHealth('busy');
  try{await syncNativeHealth();setHealth('done')}catch(e:any){setHealth('idle');Alert.alert('Apple Health',e?.message||'You can connect later from the Health tab.')}
 }
 async function finish(){
  setLoading(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('Please sign in again.');
   const labels=GOALS.filter(g=>goals.includes(g.id)).map(g=>g.label);
   const profile=editing&&loaded
    ?{health_goals:[...goals,...loaded.legacy],baseline_preferences:t,onboarding_version:4}
    :{health_goals:goals,tracking_reasons:labels,habit_goals:labels,baseline_preferences:t,onboarding_version:4,...(editing?{}:{onboarding_completed_at:new Date().toISOString()})};
   const {error:e1}=await supabase.from('profiles').update(profile).eq('id',user.id);if(e1)throw e1;
   // The answers become the app's settings right away. When editing, only answers that changed are applied.
   const has=(g:GoalId)=>goals.includes(g);
   const fresh=(g:GoalId|GoalId[],k:keyof Targets)=>{const gs=Array.isArray(g)?g:[g];return gs.some(has)&&(!editing||!loaded||!gs.some(x=>loaded.goals.includes(x))||loaded.t[k]!==t[k])};
   if(fresh('water','water'))await saveDrinkGoal('water',t.water*8);
   await saveHealthGoals({...(fresh('sleep','sleep')?{sleep:t.sleep*60}:{}),...(fresh('move','steps')?{steps:t.steps}:{}),...(fresh(['mindful','stress'],'mindfulness')?{mindfulness:t.mindfulness}:{})});
   if(fresh('social','social_goal')&&socialTrackSupported){try{configureSocialTrack(getSocialState()?.enabled??false,t.social_goal)}catch{}}
   if(!editing&&mood!==null){await supabase.from('wellness_journal').insert({user_id:user.id,entry_type:'reflection',body:'Mood check-in',mood:MOODS[mood].mood,reflection_answers:{},stress_factors:[]})}
   if(!editing?checkinReminder:loaded&&checkinReminder!==loaded.checkin)await setDailyCheckin(user.id,checkinReminder,loaded?.hour??20);
   await supabase.from('user_settings').update({voice_gender:voice}).eq('user_id',user.id);
   if(!editing)void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
   done();
  }catch(e:any){Alert.alert('Could not save',e?.message||'Please try again.');}
  finally{setLoading(false);}
 }
 if(fetching)return <View style={[s.root,{justifyContent:'center'}]}><ActivityIndicator color={SW.green}/></View>;

 const hours=(v:number)=>v+(v===1?' hour':' hours');
 const socialPal=(m:number)=>m<=60?'calm':m<=150?'joy':'fear';
 const head=(title:string,sub?:string)=><View style={{gap:6}}><Text style={s.title} accessibilityRole="header">{title}</Text>{sub?<Text style={s.sub}>{sub}</Text>:null}</View>;
 const toggleRow=(label:string,hint:string,on:boolean,set:(v:boolean)=>void,icon:any)=><View style={s.row}>
  <View style={s.rowIcon}><Ionicons name={icon} size={20} color={SW.green}/></View>
  <View style={{flex:1}}><Text style={s.rowLabel}>{label}</Text><Text style={s.hint}>{hint}</Text></View>
  <Switch value={on} onValueChange={set} trackColor={{true:SW.green,false:'#D7E0DC'}} accessibilityLabel={label}/>
 </View>;
 const planRow=(icon:any,label:string,value:string,to:Step)=><TouchableOpacity key={label} onPress={()=>jump(to)} accessibilityRole="button" accessibilityLabel={`${label}, ${value}. Edit`} style={s.row}>
  <View style={s.rowIcon}><Ionicons name={icon} size={20} color={SW.green}/></View>
  <View style={{flex:1}}><Text style={s.hint}>{label}</Text><Text style={s.rowLabel}>{value}</Text></View><Text style={s.edit}>Edit</Text>
 </TouchableOpacity>;
 async function toggleCheckin(on:boolean){
  if(!on){setCheckinReminder(false);return}
  setCheckinReminder(true);
  const p=await Notifications.getPermissionsAsync().catch(()=>null);
  if(p?.granted||(await Notifications.requestPermissionsAsync().catch(()=>null))?.granted)return;
  setCheckinReminder(false);Alert.alert('Notifications are off','To get a daily check-in, allow notifications for MoodPals in iPhone Settings.');
 }
 const has=(g:GoalId)=>goals.includes(g);
 const last=i>=steps.length-1;

 const body=()=>{switch(step){
  case 'welcome':return <View style={s.center}>
   <View style={s.palStage}><SuperdotMascot id="joy" size={190}/></View>
   <Text style={s.hero}>Little steps.{'\n'}A calmer day.</Text>
   <Text style={[s.sub,{textAlign:'center'}]}>A few quick questions and MoodPals sets up your goals for you. It takes about a minute.</Text>
  </View>;
  case 'goals':return <>{head('What would you like to improve?','Pick as many as you like.')}
   <View style={s.goalGrid}>{GOALS.map(g=><GoalCard key={g.id} g={g} on={has(g.id)} onPress={()=>setGoals(x=>x.includes(g.id)?x.filter(y=>y!==g.id):[...x,g.id])}/>)}</View></>;
  case 'water':return <>{head('How much water a day?','Turn the dial to set your daily goal.')}
   <Dial value={t.water} min={4} max={16} step={1} color="#3D9BE9" label="Water goal" format={v=>`${v} cups · ${v*8} oz`} onChange={setTarget('water')} onDrag={setDragging}>
    <View style={{transform:[{scale:0.66}]}}><Fill kind="water" progress={t.water/16} color="#3D9BE9" duration={reduce?0:220}/></View>
   </Dial>
   <Text style={[s.hint,{textAlign:'center'}]}>Your own water goal is part of MoodPals Plus. Free uses 64 oz (8 cups).</Text></>;
  case 'socialNow':return <>{head('How much time on social media now?','A rough guess is fine.')}
   <Dial value={t.social_now} min={15} max={480} step={15} color={SW.hr} label="Social media time now" format={v=>formatMins(v)+' a day'} onChange={setTarget('social_now')} onDrag={setDragging}>
    <SuperdotMascot key={socialPal(t.social_now)} id={socialPal(t.social_now)} size={120}/>
   </Dial></>;
  case 'socialGoal':return <>{head('Your daily social media goal','This becomes your Screen Time daily limit.')}
   <Dial value={t.social_goal} min={15} max={240} step={15} color={SW.green} label="Social media goal" format={v=>formatMins(v)+' a day'} onChange={setTarget('social_goal')} onDrag={setDragging}>
    <SuperdotMascot key={socialPal(t.social_goal)} id={socialPal(t.social_goal)} size={120}/>
   </Dial>
   {t.social_goal<t.social_now?<Text style={[s.sub,{textAlign:'center'}]}>That's {formatMins(t.social_now-t.social_goal)} a day back for you.</Text>:null}</>;
  case 'sleep':return <>{head('How much sleep do you want?','Turn the dial to set your sleep goal.')}
   <Dial value={t.sleep} min={5} max={10} step={0.5} color="#7A6FE0" label="Sleep goal" format={hours} onChange={setTarget('sleep')} onDrag={setDragging}>
    <SuperdotMascot key={t.sleep>=7?'calm':'tired'} id={t.sleep>=7?'calm':'tired'} size={120}/>
   </Dial></>;
  case 'move':return <>{head('How many steps a day?','Turn the dial to set your step goal.')}
   <Dial value={t.steps} min={2000} max={15000} step={500} color="#F08A4B" label="Step goal" format={v=>v.toLocaleString()+' steps'} onChange={setTarget('steps')} onDrag={setDragging}>
    <SuperdotMascot id="joy" size={120}/>
   </Dial></>;
  case 'mindful':return <>{head('Minutes to slow down each day','Breathing, meditation or a quiet moment.')}
   <Dial value={t.mindfulness} min={5} max={30} step={5} color="#4FA9E8" label="Mindful minutes goal" format={v=>v+' min a day'} onChange={setTarget('mindfulness')} onDrag={setDragging}>
    <SuperdotMascot id="calm" size={120}/>
   </Dial></>;
  case 'feeling':return <>{head('How have you been feeling lately?','Slide across the pals. This is your first check-in.')}
   <MoodSlider value={mood} onChange={setMood} onDrag={setDragging}/></>;
  case 'voice':return <>{head('Meet your MoodPal voice','Talk about your day like you would with a best friend. Tap play to hear them.')}
   <View style={{gap:10}}>{(['female','male'] as VoiceGender[]).map(g=>{const on=voice===g,live=playing===g;return <TouchableOpacity key={g} accessibilityRole="radio" accessibilityState={{checked:on}} onPress={()=>setVoice(g)} style={[s.row,on&&{borderColor:SW.green,borderWidth:2}]}>
    <SuperdotMascot id={g==='female'?'joy':'calm'} size={48} animate={live}/>
    <View style={{flex:1}}><Text style={s.rowLabel}>{g==='female'?'Female voice':'Male voice'}</Text><Text style={s.hint}>{g==='female'?'Warm and gentle':'Friendly and calm'}</Text></View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={(live?'Stop ':'Play ')+g+' voice demo'} onPress={async()=>{stopDemo.current();if(live){setPlaying(null);return}setVoice(g);setPlaying(g);stopDemo.current=await playVoiceDemo(g,()=>setPlaying(p=>p===g?null:p))}} style={{width:44,height:44,borderRadius:22,backgroundColor:SW.green,alignItems:'center',justifyContent:'center'}}>
     <Ionicons name={live?'stop':'play'} size={20} color="#fff" style={live?undefined:{marginLeft:2}}/>
    </TouchableOpacity>
   </TouchableOpacity>})}</View>
   <Text style={s.hint}>Talking with your pal is part of MoodPals Plus. You can change the voice later.</Text></>;
  case 'health':return <>{head('Connect Apple Health','MoodPals reads your HRV, sleep and steps to show how your body handles stress. Nothing is shared.')}
   <View style={s.center}><View style={s.palStage}><SuperdotMascot id="calm" size={150}/></View></View>
   {healthKitAvailable()?<TouchableOpacity disabled={health!=='idle'} onPress={()=>void connectHealth()} style={[s.secondary,health==='done'&&{backgroundColor:SW.mint}]} accessibilityRole="button">
    {health==='busy'?<ActivityIndicator color={SW.green}/>:<><Ionicons name={health==='done'?'checkmark-circle':'heart'} size={20} color={SW.green}/><Text style={s.secondaryText}>{health==='done'?'Connected':'Connect Apple Health'}</Text></>}
   </TouchableOpacity>:<Text style={s.hint}>You can connect Apple Health later from the Health tab on your iPhone.</Text>}
   <Text style={s.hint}>MoodPals isn't a medical device and doesn't diagnose stress.</Text></>;
  case 'reminders':return <>{head('Gentle reminders','Turn on what helps. You can change these any time.')}
   {toggleRow('Daily check-in',editing&&loaded?`A daily nudge at ${loaded.hour>12?loaded.hour-12+' PM':loaded.hour+(loaded.hour===12?' PM':' AM')} to log how you feel.`:'A nudge at 8 PM to log how you feel.',checkinReminder,v=>void toggleCheckin(v),'happy-outline')}
</>;
  case 'plan':return <><View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={s.planPal}><SuperdotMascot id="joy" size={64}/></View><View style={{flex:1}}>{head(editing?'Your goals':'Your plan is ready',editing?'Tap any goal to change it.':'These are now your settings. Tap one to change it.')}</View></View>
   <View style={{gap:8}}>
    {has('water')?planRow('water-outline','Water goal',`${t.water} cups (${t.water*8} oz) a day`,'water'):null}
    {has('social')?planRow('time-outline','Social media now',formatMins(t.social_now)+' a day','socialNow'):null}
    {has('social')?planRow('phone-portrait-outline','Screen Time daily limit',formatMins(t.social_goal),'socialGoal'):null}
    {has('sleep')?planRow('moon-outline','Sleep goal',hours(t.sleep),'sleep'):null}
    {has('move')?planRow('walk-outline','Step goal',t.steps.toLocaleString()+' steps','move'):null}
    {has('mindful')||has('stress')?planRow('leaf-outline','Mindful minutes',t.mindfulness+' min a day','mindful'):null}
    {!editing&&mood!==null?planRow('happy-outline','First check-in',MOODS[mood].mood,'feeling'):null}
    {editing?planRow('notifications-outline','Reminders',checkinReminder?'Daily check-in':'Off','reminders'):null}
    {!goals.length?planRow('sparkles-outline','Goals','None picked yet','goals'):null}
   </View>
   {has('social')?<Text style={s.hint}>Your Screen Time limit starts once you choose apps in Screen Time.</Text>:null}</>;
 }};

 return <View style={s.root}>
  <View style={s.top}>
   {i>0?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={()=>fromPlan&&step!=='plan'?backToPlan():go(i-1)} style={s.iconBtn}><Ionicons name="chevron-back" size={22} color={SW.ink}/></TouchableOpacity>
    :editing?<TouchableOpacity hitSlop={10} onPress={onCancel}><Text style={s.link}>Cancel</Text></TouchableOpacity>
    :<TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to sign in" disabled={loading} hitSlop={10} onPress={()=>{openSignInNext();void supabase.auth.signOut()}}><Text style={s.link}>‹ Log in</Text></TouchableOpacity>}
   <View style={s.dots} accessibilityLabel={`Step ${i+1} of ${steps.length}`}>{steps.map((x,n)=><View key={x} style={[s.dot,n<=i&&{backgroundColor:SW.green},n===i&&{width:18}]}/>)}</View>
   <View style={{width:44}}/>
  </View>
  <ScrollView scrollEnabled={!dragging} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
   <Animated.View style={{gap:16,opacity:fade,transform:[{translateY:fade.interpolate({inputRange:[0,1],outputRange:[12,0]})}]}}>{body()}</Animated.View>
  </ScrollView>
  <View style={s.footer}>
   <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>last?void finish():fromPlan&&step!=='welcome'?backToPlan():go(i+1)} style={s.primary}>
    {loading?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{step==='welcome'?'Get started':last?(editing?'Save changes':'Start MoodPals'):fromPlan?'Done':'Continue'}</Text>}
   </TouchableOpacity>
   {!last&&!fromPlan&&step!=='welcome'?<TouchableOpacity onPress={()=>go(i+1)} style={{minHeight:40,justifyContent:'center'}}><Text style={s.skip}>Skip</Text></TouchableOpacity>:null}
  </View>
 </View>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:SW.bg},
 top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:6},
 iconBtn:{width:44,height:44,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
 link:{color:SW.green,fontWeight:'800',fontSize:15},
 dots:{flexDirection:'row',gap:5,flexShrink:1,flexWrap:'wrap',justifyContent:'center'},
 dot:{width:6,height:6,borderRadius:3,backgroundColor:SW.line},
 content:{padding:22,paddingBottom:24,flexGrow:1},
 center:{alignItems:'center',gap:14},
 planPal:{width:76,height:76,borderRadius:38,backgroundColor:SW.mint,alignItems:'center',justifyContent:'center'},
 palStage:{width:210,height:210,borderRadius:105,backgroundColor:SW.mint,alignItems:'center',justifyContent:'center',alignSelf:'center'},
 hero:{fontSize:32,lineHeight:38,fontWeight:'900',color:SW.ink,textAlign:'center'},
 title:{fontSize:27,lineHeight:33,fontWeight:'900',color:SW.ink},
 sub:{fontSize:15,lineHeight:21,color:SW.muted},
 hint:{fontSize:12,lineHeight:17,color:SW.muted},
 goalGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12},
 goal:{backgroundColor:'#fff',borderRadius:22,borderWidth:2,borderColor:'#fff',padding:14,paddingTop:18,alignItems:'center',gap:8,minHeight:140},
 goalOn:{borderColor:SW.green,backgroundColor:SW.mint},
 goalText:{fontSize:14,fontWeight:'800',color:SW.ink,textAlign:'center'},
 dialValue:{fontSize:24,fontWeight:'900',color:SW.ink,textAlign:'center'},
 stepBtn:{width:48,height:48,borderRadius:24,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:SW.line},
 moodTrack:{flexDirection:'row',alignSelf:'stretch',justifyContent:'space-between',backgroundColor:'#fff',borderRadius:30,padding:6},
 moodDot:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'transparent'},
 row:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderRadius:18,padding:14,minHeight:64},
 rowIcon:{width:38,height:38,borderRadius:19,backgroundColor:SW.mint,alignItems:'center',justifyContent:'center'},
 rowLabel:{fontSize:15,fontWeight:'800',color:SW.ink},
 edit:{color:SW.green,fontWeight:'800'},
 secondary:{flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',minHeight:52,borderRadius:18,backgroundColor:'#fff',borderWidth:2,borderColor:SW.green},
 secondaryText:{color:SW.green,fontWeight:'900',fontSize:16},
 footer:{paddingHorizontal:22,paddingBottom:34,paddingTop:8,gap:4},
 primary:{backgroundColor:SW.green,borderRadius:18,minHeight:56,alignItems:'center',justifyContent:'center'},
 primaryText:{color:'#fff',fontWeight:'900',fontSize:17},
 skip:{color:SW.muted,fontWeight:'700',textAlign:'center'},
});
