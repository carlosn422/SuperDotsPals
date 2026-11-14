import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Animated,Easing,Modal,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Svg,{ClipPath,Defs,LinearGradient,Path,Rect,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import SuperdotMascot from './SuperdotMascot';
import {supabase} from './supabase';
import {FREE_HEALTH_DAYS,PLUS_HEALTH_DAYS,usePlus} from './PlusStore';
import {PlusBadge} from './TodayUpsell';
import {PlusPaywallSheet} from './PlusPaywall';
import {sameDay} from './StressEngine';
import {Period,TrendCard,addDays,detailStyles as st,noon} from './HealthDetail';
import {DRINK_UNIT,Drink,DrinkRow,WATER_REMINDER_DEFAULT,WaterReminder,dayRows,dayTotal,loadWaterReminder,rowAmount,saveWaterReminder,useDrinkGoals} from './Drinks';

const INK='#1D2B33',MUTED='#6E7D86',BG='#F4FAF6',LINE='#E6EEEA';
const CONF:Record<Drink,{title:string;color:string;tint:string;icon:React.ComponentProps<typeof Ionicons>['name']}>={
 water:{title:'Hydration',color:'#4A9BEA',tint:'#E1F0FD',icon:'water'},
 caffeine:{title:'Caffeine',color:'#C47F4E',tint:'#FAECE1',icon:'cafe'},
};
const WATER_SIZES=[4,8,12,16];
// Typical caffeine per cup (espresso: one shot) and the water it adds.
const DRINKS=[{name:'Americano',mg:95,oz:8},{name:'Latte',mg:80,oz:8},{name:'Flat White',mg:130,oz:6},{name:'Milk Tea',mg:40,oz:8},{name:'Green Tea',mg:30,oz:8},{name:'Espresso',mg:64,oz:1}];
const fmt=(k:Drink,v:number)=>`${Math.round(v)} ${DRINK_UNIT[k]}`;
const hourLabel=(h:number)=>`${h%12||12} ${h<12?'AM':'PM'}`;

export default function DrinkDetail({kind,onClose,onSaved,onAskAI}:{kind:Drink|null;onClose:()=>void;onSaved:(k:Drink,todayTotal:number)=>void;onAskAI:()=>void}){
 return <Modal visible={!!kind} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  {kind?<Body kind={kind} onClose={onClose} onSaved={onSaved} onAskAI={onAskAI}/>:null}
  {kind?<PlusPaywallSheet nested/>:null}
 </Modal>;
}

function Body({kind,onClose,onSaved,onAskAI}:{kind:Drink;onClose:()=>void;onSaved:(k:Drink,todayTotal:number)=>void;onAskAI:()=>void}){
 const {isPlus,plusKnown,showPaywall}=usePlus();
 const {goals,setGoal}=useDrinkGoals(isPlus);
 const insets=useSafeAreaInsets();
 const k=CONF[kind];
 const today=noon(new Date());
 const limit=isPlus?PLUS_HEALTH_DAYS:FREE_HEALTH_DAYS;
 const minDay=addDays(today,-(limit-1));
 const [rows,setRows]=useState<DrinkRow[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [day,setDay]=useState(today);
 const [period,setPeriod]=useState<Period>('D');
 const [page,setPage]=useState<'main'|'settings'>('main');
 const [picker,setPicker]=useState(false);
 const [manual,setManual]=useState<string|null>(null);
 const [prompt,setPrompt]=useState<{name:string;oz:number}|null>(null);
 const [reminder,setReminder]=useState<WaterReminder>(WATER_REMINDER_DEFAULT);
 const [tap,setTap]=useState<Record<Drink,number>>({water:8,caffeine:95});

 const load=useCallback(async()=>{
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
   const since=addDays(new Date(),-(PLUS_HEALTH_DAYS+1));since.setHours(0,0,0,0);
   const {data,error}=await supabase.from('habit_entries').select('habit,amount,unit,recorded_at').eq('user_id',user.id).in('habit',['water','caffeine']).gte('recorded_at',since.toISOString()).order('recorded_at',{ascending:false}).limit(2000);
   if(error)throw error;setRows((data||[]) as DrinkRow[]);
  }catch(e:any){Alert.alert('Unable to load '+k.title.toLowerCase(),e?.message||'Please retry')}
  finally{setLoading(false)}
 },[k.title]);
 useEffect(()=>{void load();void loadWaterReminder().then(setReminder)},[load]);
 useEffect(()=>{void (async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('user_settings').select('water_tap_oz,caffeine_tap_mg').eq('user_id',user.id).maybeSingle();if(data)setTap({water:Number(data.water_tap_oz)||8,caffeine:Number(data.caffeine_tap_mg)||95})})()},[]);
 // Amount the Apple Watch buttons and watch-face shortcuts log per tap.
 const changeTap=async(v:number)=>{const prev=tap[kind];setTap(t=>({...t,[kind]:v}));try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');const {error}=await supabase.from('user_settings').update(kind==='water'?{water_tap_oz:v}:{caffeine_tap_mg:v}).eq('user_id',user.id);if(error)throw error}catch(e:any){setTap(t=>({...t,[kind]:prev}));Alert.alert('Could not save',e?.message||'Please retry')}};
 // Reminders are Plus; turn them off if Plus has ended.
 useEffect(()=>{if(plusKnown&&!isPlus&&reminder.enabled){const off={...reminder,enabled:false};setReminder(off);void saveWaterReminder(off).catch(()=>{})}},[plusKnown,isPlus,reminder]);

 const span=period==='D'?1:period==='W'?7:30;
 const choosePeriod=(p:Period)=>{if(!isPlus&&p!=='D'){showPaywall('trends');return}setPicker(false);setPeriod(p)};
 const days=Array.from({length:span},(_,i)=>addDays(day,i-(span-1))).filter(d=>d>=minDay);
 const series=days.map(d=>dayTotal(rows,kind,d));
 const have=series.filter((v):v is number=>v!==null);
 const value=period==='D'?dayTotal(rows,kind,day):have.length?have.reduce((a,b)=>a+b,0)/have.length:null;
 const goal=goals[kind];
 const canBack=addDays(day,-span)>=minDay,canForward=day<today;
 const back=()=>{if(canBack)setDay(addDays(day,-span));else if(!isPlus)showPaywall('health')};
 const forward=()=>{if(canForward){const n=addDays(day,span);setDay(n>today?today:n)}};
 const dateLabel=period==='D'?day.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):`${days[0].toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${day.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
 const ask=()=>{if(!isPlus){showPaywall('reflections');return}onClose();onAskAI()};
 const plusOnly=(go:()=>void)=>()=>{if(!isPlus){showPaywall('hydration');return}go()};

 // Re-read the day's entries so totals logged from the watch or Today since opening aren't overwritten.
 async function freshDayRows(habit:Drink){
  const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
  const start=new Date(day);start.setHours(0,0,0,0);
  const {data,error}=await supabase.from('habit_entries').select('habit,amount,unit,recorded_at').eq('user_id',user.id).eq('habit',habit).gte('recorded_at',start.toISOString()).lt('recorded_at',addDays(start,1).toISOString()).order('recorded_at',{ascending:false});
  if(error)throw error;
  const fresh=(data||[]) as DrinkRow[];
  setRows(r=>[...fresh,...r.filter(x=>!(x.habit===habit&&sameDay(new Date(x.recorded_at),day)))]);
  return fresh;
 }
 async function setTotal(habit:Drink,next:number,current?:DrinkRow[]){
  const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
  const prev=(current??dayRows(rows,habit,day))[0];
  const prevAt=prev?new Date(prev.recorded_at).getTime():0;
  // Past days: just after that day's last entry so it becomes the day's total.
  const at=sameDay(day,today)?new Date(Math.max(Date.now(),prevAt+1)):new Date(prev?prevAt+1:noon(day).getTime());
  const {data,error}=await supabase.from('habit_entries').insert({user_id:user.id,habit,amount:Math.max(0,Math.round(next*10)/10),unit:DRINK_UNIT[habit],recorded_at:at.toISOString()}).select('habit,amount,unit,recorded_at').single();
  if(error)throw error;
  setRows(r=>[data as DrinkRow,...r]);
  if(sameDay(day,today))onSaved(habit,rowAmount(data as DrinkRow));
 }
 async function run(task:()=>Promise<void>){
  if(busy)return;setBusy(true);
  try{await task()}catch(e:any){Alert.alert('Unable to save',e?.message||'Please retry')}finally{setBusy(false)}
 }
 const reachGoal=async()=>{const r=await freshDayRows('water'),cur=r[0]?rowAmount(r[0]):0;if(cur<goals.water)await setTotal('water',goals.water,r)};
 const add=async(habit:Drink,n:number)=>{const r=await freshDayRows(habit);await setTotal(habit,(r[0]?rowAmount(r[0]):0)+n,r)};
 // Step back to the newest earlier total below the current one, so repeated undos keep going back.
 const undo=()=>run(async()=>{const r=await freshDayRows(kind),cur=r[0]?rowAmount(r[0]):0;const prev=r.find(x=>rowAmount(x)<cur);await setTotal(kind,prev?rowAmount(prev):0,r)});
 const addDrink=(d:{name:string;mg:number;oz:number})=>run(async()=>{await add('caffeine',d.mg);setPrompt({name:d.name,oz:d.oz})});
 const saveManual=()=>{const n=Number((manual||'').replace(',','.'));setManual(null);if(n>0&&n<=(kind==='water'?200:1000))void run(()=>add(kind,n))};
 const updateReminder=async(r:WaterReminder)=>{const prev=reminder;setReminder(r);try{if(!(await saveWaterReminder(r))){setReminder(prev);Alert.alert('Notifications are off','Allow notifications for MoodPals in iPhone Settings to get water reminders.')}}catch(e:any){setReminder(prev);Alert.alert('Could not update reminders',e?.message||'Please retry')}};

 if(page==='settings')return <View style={{flex:1,backgroundColor:BG,paddingTop:insets.top+8}}>
  <View style={st.goalHead}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={()=>setPage('main')} style={st.round}><Ionicons name="arrow-back" size={22} color={k.color}/></TouchableOpacity><Text style={st.goalTitle}>{k.title}</Text><View style={{width:46}}/></View>
  <ScrollView contentContainerStyle={{paddingHorizontal:18,gap:12,paddingBottom:insets.bottom+30}}>
   {kind==='water'?<View style={[st.card,{gap:12}]}>
    <TouchableOpacity accessibilityRole="button" onPress={plusOnly(()=>void updateReminder({...reminder,enabled:!reminder.enabled}))} style={s.row}>
     <Ionicons name="notifications-outline" size={20} color={k.color}/><Text style={s.rowLabel}>Water Reminder</Text>{isPlus?null:<PlusBadge/>}<Text style={s.rowValue}>{reminder.enabled?'On':'Off'}</Text>
    </TouchableOpacity>
    {isPlus&&reminder.enabled?<View style={{gap:10}}>
     <Choice label="Every" options={[1,2,3]} value={reminder.every} text={v=>v+(v===1?' hour':' hours')} color={k.color} onPick={v=>void updateReminder({...reminder,every:v})}/>
     <Choice label="From" options={[7,8,9,10]} value={reminder.start} text={hourLabel} color={k.color} onPick={v=>void updateReminder({...reminder,start:v})}/>
     <Choice label="Until" options={[18,20,21,22]} value={reminder.end} text={hourLabel} color={k.color} onPick={v=>void updateReminder({...reminder,end:v})}/>
    </View>:null}
   </View>:null}
   <View style={st.card}>
    <View style={s.row}>
     <Ionicons name={kind==='water'?'water-outline':'cafe-outline'} size={20} color={k.color}/><Text style={s.rowLabel}>{kind==='water'?'Daily Goal':'Daily Limit'}</Text>{isPlus?null:<PlusBadge/>}
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Lower" onPress={plusOnly(()=>setGoal(kind,Math.max(kind==='water'?32:100,goal-(kind==='water'?4:25))))} style={st.step}><Ionicons name="remove" size={18} color={INK}/></TouchableOpacity>
     <Text style={{fontSize:15,fontWeight:'700',color:INK,minWidth:62,textAlign:'center'}}>{fmt(kind,goal)}</Text>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Raise" onPress={plusOnly(()=>setGoal(kind,Math.min(kind==='water'?160:600,goal+(kind==='water'?4:25))))} style={st.step}><Ionicons name="add" size={18} color={INK}/></TouchableOpacity>
    </View>
   </View>
   <View style={[st.card,{gap:8}]}>
    <View style={s.row}>
     <Ionicons name="watch-outline" size={20} color={k.color}/><Text style={s.rowLabel}>Apple Watch per tap</Text>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Lower per tap" onPress={()=>void changeTap(Math.max(kind==='water'?1:5,tap[kind]-(kind==='water'?1:5)))} style={st.step}><Ionicons name="remove" size={18} color={INK}/></TouchableOpacity>
     <Text style={{fontSize:15,fontWeight:'700',color:INK,minWidth:62,textAlign:'center'}}>{fmt(kind,tap[kind])}</Text>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Raise per tap" onPress={()=>void changeTap(Math.min(kind==='water'?32:300,tap[kind]+(kind==='water'?1:5)))} style={st.step}><Ionicons name="add" size={18} color={INK}/></TouchableOpacity>
    </View>
    <Text style={st.muted}>Tapping the {kind==='water'?'water drop':'cup'} on your Apple Watch or watch face logs this amount.</Text>
   </View>
   <Text style={[st.muted,{marginHorizontal:6}]}>{kind==='water'?'Water is logged in fluid ounces (1 cup = 8 oz).':'400 mg a day is a common upper guide for healthy adults.'} Goals are only used inside MoodPals and are not medical advice.</Text>
  </ScrollView>
 </View>;

 const noData=value===null;
 const pct=value===null?0:value/goal;
 const status=noData?'No Data':kind==='water'?(pct>=1?'Goal reached':`${Math.round(pct*100)}% of goal`):(pct>1?'Above your limit':'Within your limit');
 const when=period==='D'?(sameDay(day,today)?' today':' that day'):' a day on average';
 const insight=kind==='water'
  ?(noData?'No water logged yet. Tap a size below each time you drink.':value!>=goal?`You drank ${fmt(kind,value!)}${when}, reaching your goal. Staying hydrated helps your body handle stress.`:`${fmt(kind,value!)}${when}. A glass of water now and then keeps your energy steady and supports recovery.`)
  :(noData?'No caffeine logged. Log coffee or tea to see how it lines up with your sleep and stress.':value!>goal?'Your caffeine intake is above your daily limit. Cutting back, especially after 2 PM, can help your sleep and stress.':`${fmt(kind,value!)}${when}, within your ${fmt(kind,goal)} limit. Keeping caffeine before 2 PM helps your sleep.`);
 const mascot=noData?'calm':kind==='water'?(pct>=1?'joy':'calm'):(pct>1?'anxious':'calm');
 const editable=period==='D'&&!loading;

 return <View style={{flex:1,backgroundColor:BG}}>
  <Svg width="100%" height={560} style={StyleSheet.absoluteFill as any}><Defs><LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={k.tint}/><Stop offset="1" stopColor={BG}/></LinearGradient></Defs><Rect x="0" y="0" width="100%" height={560} fill="url(#bg)"/></Svg>
  <View style={[st.top,{paddingTop:insets.top+6}]}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Close '+k.title} onPress={onClose} style={st.round}><Ionicons name="close" size={24} color={k.color}/></TouchableOpacity>
   <View style={st.periods}>{(['D','W','M'] as Period[]).map(p=>{const locked=!isPlus&&p!=='D';return <TouchableOpacity key={p} accessibilityRole="button" accessibilityState={{selected:period===p}} accessibilityLabel={(p==='D'?'Day':p==='W'?'Week':'Month')+(locked?', MoodPals Plus':'')} onPress={()=>choosePeriod(p)} style={[st.period,period===p&&{backgroundColor:'#fff'}]}>
    <Text style={[st.periodText,period===p&&{color:INK}]}>{p}</Text>{locked?<Ionicons name="lock-closed" size={11} color={MUTED}/>:null}</TouchableOpacity>})}</View>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={k.title+' settings'} onPress={()=>setPage('settings')} style={st.round}><Ionicons name="options-outline" size={22} color={k.color}/></TouchableOpacity>
  </View>
  <ScrollView contentContainerStyle={{padding:18,paddingTop:6,gap:16,paddingBottom:insets.bottom+40}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
   <View style={st.dateRow}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous" onPress={back} style={[st.arrow,{backgroundColor:k.color+'22',opacity:canBack||!isPlus?1:0.35}]}><Ionicons name="chevron-back" size={18} color={k.color}/></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Choose day, '+dateLabel} onPress={()=>setPicker(p=>!p)} style={{flexDirection:'row',alignItems:'center',gap:4}}><Text style={[st.date,{color:k.color}]}>{dateLabel}</Text><Ionicons name={picker?'chevron-up':'chevron-down'} size={16} color={k.color}/></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next" disabled={!canForward} onPress={forward} style={[st.arrow,{backgroundColor:k.color+'22',opacity:canForward?1:0}]}><Ionicons name="chevron-forward" size={18} color={k.color}/></TouchableOpacity>
   </View>
   {picker?<View style={[st.card,{gap:10}]}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{Array.from({length:limit},(_,i)=>addDays(today,-i)).map(d=>{const on=sameDay(d,day);return <TouchableOpacity key={d.toDateString()} accessibilityRole="button" accessibilityLabel={d.toDateString()} onPress={()=>{setDay(d);setPicker(false)}} style={[st.chip,on&&{backgroundColor:k.color}]}>
     <Text style={{fontSize:10,fontWeight:'700',color:on?'#fff':MUTED}}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</Text><Text style={{fontSize:15,fontWeight:'800',color:on?'#fff':INK}}>{d.getDate()}</Text></TouchableOpacity>})}</View>
    {isPlus?null:<TouchableOpacity accessibilityRole="button" onPress={()=>showPaywall('health')} style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="lock-closed" size={12} color={k.color}/><Text style={{color:k.color,fontWeight:'800',fontSize:12}}>Free shows the last {FREE_HEALTH_DAYS} days. See {PLUS_HEALTH_DAYS} with Plus</Text></TouchableOpacity>}
   </View>:null}

   <View style={{alignItems:'center',gap:8,marginTop:4}}>
    <Fill kind={kind} progress={pct} color={k.color}/>
    {loading?<ActivityIndicator color={k.color}/>:<View style={s.total}>
     <Text style={s.big}>{value===null?'0':Math.round(value)}</Text>
     <Text style={s.of}>/ {fmt(kind,goal)}</Text>
    </View>}
    <Text style={st.muted}>{kind==='caffeine'?'Daily limit':value!==null&&value<goal?`${fmt(kind,goal-value)} to go`:'Daily goal'}</Text>
    <Text style={st.status}>{status}</Text>
   </View>

   {editable?<View style={{gap:10}}>
    <View style={s.buttons}>
     {kind==='water'?WATER_SIZES.map(n=><Btn key={n} color={k.color} label={`+${n} oz`} disabled={busy} onPress={()=>void run(()=>add('water',n))}/>):DRINKS.map(d=><Btn key={d.name} color={k.color} label={`+ ${d.name}`} disabled={busy} onPress={()=>void addDrink(d)}/>)}
     {kind==='water'&&value!==null&&value<goal||kind==='water'&&value===null?<Btn color={k.color} label="Reach Goal" disabled={busy} onPress={()=>void run(reachGoal)}/>:null}
     <Btn color={k.color} label="Enter Manually" disabled={busy} onPress={()=>setManual('')}/>
    </View>
    {kind==='caffeine'?<Text style={[st.muted,{textAlign:'center'}]}>Amounts are typical for an 8 oz cup (espresso: one shot).</Text>:null}
    {dayRows(rows,kind,day).length?<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void undo()} style={{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:5,padding:6}}><Ionicons name="arrow-undo" size={14} color={MUTED}/><Text style={{color:MUTED,fontWeight:'700',fontSize:13}}>Undo last</Text></TouchableOpacity>:null}
   </View>:null}

   {kind==='water'&&period==='D'&&!reminder.enabled?<TouchableOpacity accessibilityRole="button" onPress={plusOnly(()=>setPage('settings'))} style={[st.card,{flexDirection:'row',alignItems:'center',gap:12}]}>
    <View style={{flex:1,gap:4}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Text style={st.cardTitle}>Water Reminder</Text>{isPlus?null:<PlusBadge/>}</View><Text style={st.body}>Reduce stress by staying hydrated regularly. Tap to turn on Water Reminders!</Text></View>
    <SuperdotMascot id="joy" size={58} animate={false}/>
   </TouchableOpacity>:null}

   <View style={st.card}>
    <View style={{flexDirection:'row',gap:10,alignItems:'flex-start'}}><SuperdotMascot id={mascot} size={34} animate={false}/><Text style={[st.body,{flex:1}]}>{insight}</Text></View>
    <View style={{height:1,backgroundColor:LINE}}/>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Ask AI about your '+k.title.toLowerCase()} onPress={ask} style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:6,paddingVertical:4}}><Text style={{color:k.color,fontWeight:'800',fontSize:15}}>Ask AI</Text>{isPlus?null:<PlusBadge/>}</TouchableOpacity>
   </View>

   {period!=='D'?<TrendCard title="Daily Trend" days={days} values={series} goal={goal} color={k.color} fmt={v=>fmt(kind,v)} lowerIsBetter={kind==='caffeine'}/>:null}
   <Text style={[st.muted,{textAlign:'center'}]}>Logged by you in MoodPals. Not medical advice.</Text>
  </ScrollView>

  {manual!==null?<View style={s.overlay}><View style={s.dialog}>
   <Text style={s.dialogTitle}>Enter {kind==='water'?'water (oz)':'caffeine (mg)'}</Text>
   <TextInput autoFocus value={manual} onChangeText={setManual} keyboardType="decimal-pad" placeholder={kind==='water'?'8':'95'} style={s.input} onSubmitEditing={saveManual}/>
   <TouchableOpacity accessibilityRole="button" onPress={saveManual} style={[s.dialogBtn,{backgroundColor:k.color}]}><Text style={s.dialogBtnText}>Add</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setManual(null)} style={{padding:8}}><Text style={{color:k.color,fontWeight:'800',fontSize:16}}>Cancel</Text></TouchableOpacity>
  </View></View>:null}
  {prompt?<View style={s.overlay}><View style={s.dialog}>
   <Text style={s.dialogTitle}>Add Hydration Data</Text>
   <Text style={[st.body,{textAlign:'center'}]}>Would you like to add the {prompt.name} you just logged, about {prompt.oz} oz of water, to your hydration?</Text>
   <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>{const oz=prompt.oz;setPrompt(null);void run(()=>add('water',oz))}} style={[s.dialogBtn,{backgroundColor:CONF.water.color}]}><Text style={s.dialogBtnText}>Add</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setPrompt(null)} style={{padding:8}}><Text style={{color:CONF.water.color,fontWeight:'800',fontSize:16}}>No</Text></TouchableOpacity>
  </View></View>:null}
 </View>;
}

function Btn({label,color,onPress,disabled}:{label:string;color:string;onPress:()=>void;disabled?:boolean}){
 return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.btn,{backgroundColor:color,opacity:disabled?0.6:1}]}><Text style={s.btnText}>{label}</Text></TouchableOpacity>;
}
function Choice({label,options,value,text,color,onPick}:{label:string;options:number[];value:number;text:(v:number)=>string;color:string;onPick:(v:number)=>void}){
 return <View style={{gap:6}}><Text style={st.muted}>{label}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{options.map(o=><TouchableOpacity key={o} accessibilityRole="button" accessibilityState={{selected:o===value}} onPress={()=>onPick(o)} style={[s.choice,o===value&&{backgroundColor:color,borderColor:color}]}><Text style={{fontWeight:'700',color:o===value?'#fff':INK}}>{text(o)}</Text></TouchableOpacity>)}</View></View>;
}
// A drop (water) or cup (caffeine) that fills toward the goal.
// Same tapered cup and rising wave as the Apple Watch drinks screen.
const CUP={x:20,y:10,w:160,h:200};
const cupPath=()=>{const {x,y,w,h}=CUP,inset=w*0.12,r=w*0.16,R=x+w,B=y+h;
 return `M${x} ${y} H${R} L${R-inset} ${B-r} Q${R-inset} ${B} ${R-inset-r} ${B} H${x+inset+r} Q${x+inset} ${B} ${x+inset} ${B-r} Z`};
const wavePath=(level:number,phase:number)=>{if(level<=0)return '';const {x,y,w,h}=CUP,B=y+h,top=B-h*level,amp=level>=1?0:6;
 let d=`M${x} ${B} L${x} ${top}`;for(let px=0;px<=w;px+=4)d+=` L${x+px} ${top+amp*Math.sin(px/w*2*Math.PI+phase)}`;return d+` L${x+w} ${B} Z`};
function Fill({kind,progress,color}:{kind:Drink;progress:number;color:string}){
 const target=Math.max(0,Math.min(1,progress));
 const anim=useRef(new Animated.Value(0)).current;
 const [level,setLevel]=useState(0);
 useEffect(()=>{const id=anim.addListener(({value})=>setLevel(value));return()=>anim.removeListener(id)},[anim]);
 useEffect(()=>{Animated.timing(anim,{toValue:target,duration:900,easing:Easing.inOut(Easing.ease),useNativeDriver:false}).start()},[target,anim]);
 const cup=cupPath();
 return <View style={{width:200,height:220,alignItems:'center',justifyContent:'center'}}>
  <Svg width={200} height={220} viewBox="0 0 200 220" style={StyleSheet.absoluteFill}>
   <Defs>
    <ClipPath id={'cup-'+kind}><Path d={cup}/></ClipPath>
    <LinearGradient id={'liquid-'+kind} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.75}/><Stop offset="1" stopColor={color} stopOpacity={1}/></LinearGradient>
   </Defs>
   <Path d={cup} fill={color+'14'}/>
   <Path d={wavePath(level,level*12)} fill={`url(#liquid-${kind})`} clipPath={`url(#cup-${kind})`}/>
   <Path d={cup} fill="none" stroke={color} strokeOpacity={0.9} strokeWidth={4} strokeLinejoin="round"/>
  </Svg>
  <Ionicons name={kind==='water'?'water':'cafe'} size={34} color="#fff" style={{textShadowColor:'rgba(0,0,0,0.3)',textShadowRadius:4,marginTop:20}}/>
 </View>;
}

const s=StyleSheet.create({
 total:{flexDirection:'row',alignItems:'baseline',gap:6},big:{fontSize:52,fontWeight:'900',color:INK},of:{fontSize:20,fontWeight:'700',color:MUTED},
 buttons:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:10},
 btn:{minWidth:96,paddingHorizontal:16,paddingVertical:12,borderRadius:22,alignItems:'center'},btnText:{color:'#fff',fontWeight:'800',fontSize:15},
 row:{flexDirection:'row',alignItems:'center',gap:10,minHeight:40},rowLabel:{flex:1,fontSize:16,color:INK},rowValue:{fontSize:15,color:MUTED,marginLeft:6},
 choice:{paddingHorizontal:12,paddingVertical:8,borderRadius:14,borderWidth:1,borderColor:LINE,backgroundColor:BG},
 overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.35)',alignItems:'center',justifyContent:'center',padding:30},
 dialog:{width:'100%',backgroundColor:'#fff',borderRadius:28,padding:24,gap:14,alignItems:'center'},
 dialogTitle:{fontSize:20,fontWeight:'800',color:INK},
 input:{alignSelf:'stretch',borderWidth:1,borderColor:LINE,borderRadius:14,padding:14,fontSize:20,textAlign:'center',color:INK},
 dialogBtn:{alignSelf:'stretch',minHeight:52,borderRadius:26,alignItems:'center',justifyContent:'center'},dialogBtnText:{color:'#fff',fontWeight:'800',fontSize:17},
});
