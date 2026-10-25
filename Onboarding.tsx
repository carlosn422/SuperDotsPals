import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,ActivityIndicator,Alert} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {openSignInNext} from './AuthScreen';
export const DOTS=[
 {id:'bloop',name:'Bloop',theme:'grape',color:'#7139E9',light:'#EEE5FF',face:'●',description:'Curious & cuddly'},
 {id:'poppy',name:'Poppy',theme:'coral',color:'#E76B8A',light:'#FFE7EE',face:'✿',description:'Warm & cheerful'},
 {id:'mochi',name:'Mochi',theme:'sky',color:'#488CD9',light:'#E2F1FF',face:'✦',description:'Cool & calm'},
 {id:'zuzu',name:'Zuzu',theme:'sunny',color:'#E3A426',light:'#FFF4CE',face:'★',description:'Bright & bubbly'},
 {id:'nori',name:'Nori',theme:'mint',color:'#3BA986',light:'#E1F8ED',face:'♥',description:'Soft & peaceful'}
] as const;
const goals=['Understand stress','Improve sleep','Build healthy habits','Track fitness','Improve recovery'];
const contexts=['Apple Watch owner','Regular exercise','Shift work','Trouble sleeping','Prefer not to share'];
const signals=['I often feel stressed','I get tired easily','I wake up feeling unrested','I feel overwhelmed','My sleep schedule is irregular','My energy changes throughout the day'];
const reasons=['Understand what causes stress','Get helpful reminders','Feel more relaxed','Understand my body better','Explore my health patterns'];
const routines=['Keep a regular sleep schedule','Exercise more','Practice mindfulness or meditation','Log my daily feelings','Get more daylight','Drink enough water'];
const goalsData=[{key:'sleep',name:'Sleep',unit:'hours',values:[6,7,8,9]},{key:'daylight',name:'Daylight',unit:'minutes',values:[10,20,30,40]},{key:'mindfulness',name:'Mindfulness',unit:'minutes',values:[3,5,10,15]},{key:'steps',name:'Steps',unit:'steps',values:[4000,6000,8000,10000]},{key:'water',name:'Water',unit:'cups',values:[4,6,8,10]}] as const;
const initialTargets:Record<string,number>={sleep:7,daylight:20,mindfulness:5,steps:8000,water:8};
const stepTitles=['Welcome to MoodPals','Your Apple Watch companion','A little about you','What has your body been telling you?','What would you like to understand?','Small habits, big feelings','A note about HRV','Every body is different','Learn your patterns','Stay in the loop','Your privacy matters','Your health, your choice','Your plan begins with you','Build your daily goals'];
export default function Onboarding({done,editing=false,onCancel}:{done:()=>void;editing?:boolean;onCancel?:()=>void}){
 const [step,setStep]=useState(0),[age,setAge]=useState(''),[sex,setSex]=useState(''),[signalsSelected,setSignals]=useState<string[]>([]),[reasonsSelected,setReasons]=useState<string[]>([]),[habitsSelected,setHabits]=useState<string[]>([]),[dot,setDot]=useState('bloop'),[loading,setLoading]=useState(false),[notifications,setNotifications]=useState(false),[targets,setTargets]=useState<Record<string,number>>(initialTargets);
 const [fetching,setFetching]=useState(editing);
 useEffect(()=>{if(!editing)return;let active=true;(async()=>{
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Not signed in');
   const [{data:p,error:pe},{data:settings,error:se}]=await Promise.all([
    supabase.from('profiles').select('birth_year,sex,stress_signals,tracking_reasons,habit_goals,baseline_preferences').eq('id',user.id).single(),
    supabase.from('user_settings').select('companion,onboarding_notifications_preference').eq('user_id',user.id).single()
   ]);if(pe||se)throw pe||se;if(!active)return;
   setAge(p?.birth_year?String(new Date().getFullYear()-p.birth_year):'');
   setSex(p?.sex||'');setSignals(p?.stress_signals||[]);setReasons(p?.tracking_reasons||[]);
   setHabits(p?.habit_goals||[]);setDot(settings?.companion||'bloop');
   setNotifications(settings?.onboarding_notifications_preference===true);
   setTargets({...initialTargets,...(p?.baseline_preferences||{})});
  }catch(e:any){if(active)Alert.alert('Could not load your profile',e?.message||'Please try again.');}
  finally{if(active)setFetching(false)}
 })();return()=>{active=false}},[editing]);
 const picked={color:'#7861E8',light:'#EEE8FF',theme:'grape',id:'bloop'};
 const toggle=(value:string,values:string[],setter:(v:string[])=>void)=>setter(values.includes(value)?values.filter(item=>item!==value):[...values,value]);
 const next=()=>setStep(x=>Math.min(stepTitles.length-1,x+1));
 function choice(label:string,active:boolean,onPress:()=>void,subtitle?:string){return <TouchableOpacity key={label} onPress={onPress} style={[s.choice,active&&{borderColor:picked.color,backgroundColor:picked.light}]} accessibilityRole="checkbox" accessibilityState={{checked:active}}><View style={{flex:1}}><Text style={s.choiceText}>{label}</Text>{subtitle?<Text style={s.hint}>{subtitle}</Text>:null}</View><Text style={[s.check,{color:active?picked.color:'#A79ABF'}]}>{active?'●':'○'}</Text></TouchableOpacity>}
 async function finish(){
  setLoading(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('Please sign in again.');
   const ageNumber=age.trim()?Number(age):null;
   if(ageNumber!==null&&(!Number.isInteger(ageNumber)||ageNumber<13||ageNumber>120))throw Error('Enter an age between 13 and 120, or leave it blank.');
   const profile={
    birth_year:ageNumber===null?null:new Date().getFullYear()-ageNumber,
    sex:sex||null,
    health_goals:reasonsSelected,
    health_context:[],
    stress_signals:signalsSelected,
    tracking_reasons:reasonsSelected,
    habit_goals:habitsSelected,
    baseline_preferences:targets,
    onboarding_version:3
   };
   const {error:e1}=await supabase.from('profiles').update(profile).eq('id',user.id);if(e1)throw e1;
   const {error:e2}=await supabase.from('user_settings').update({onboarding_notifications_preference:notifications}).eq('user_id',user.id);if(e2)throw e2;
   const {error:e3}=await supabase.from('profiles').update({onboarding_completed_at:new Date().toISOString()}).eq('id',user.id);if(e3)throw e3;
   done();
  }catch(e:any){Alert.alert('Could not save onboarding',e?.message||'Please try again.');}
  finally{setLoading(false);}
 }
 if(fetching)return <View style={[s.root,{justifyContent:'center'}]}><ActivityIndicator color={picked.color}/></View>;
 return <View style={s.root}><ScrollView key={step} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={s.brand}>✦ MoodPals</Text>{!editing?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to sign in" disabled={loading} hitSlop={10} onPress={()=>{openSignInNext();void supabase.auth.signOut()}}><Text style={s.signIn}>Sign in instead</Text></TouchableOpacity>:null}</View>{editing?<TouchableOpacity onPress={onCancel}><Text style={s.skip}>Cancel editing</Text></TouchableOpacity>:null}
  <Text style={s.progress}>STEP {step+1} OF {stepTitles.length}</Text>
  <View style={s.track}><View style={[s.fill,{width:`${((step+1)/stepTitles.length*100)}%` as `${number}%`,backgroundColor:picked.color}]}/></View>
  <Text style={s.title}>{stepTitles[step]}</Text>
  {step===0?<View style={s.explainer}><SuperdotMascot id={dot} color={picked.color} size={168}/><Text style={s.explainerTitle}>Little steps. A calmer day.</Text><Text style={s.sub}>Meet your MoodPal — a thoughtful wellness companion to help you reflect on mood, hydration, activity and recovery.</Text><Text style={s.hint}>This is not a medical diagnosis or a substitute for professional care.</Text></View>:null}
  {step===1?<View style={s.explainer}><SuperdotMascot id="nori" color="#3BA986" size={144}/><Text style={s.explainerTitle}>Your watch can tell part of the story.</Text><Text style={s.sub}>With your permission, MoodPals can read Apple Health heart-rate variability, resting heart rate, sleep and steps, and help you reflect on possible patterns.</Text><Text style={s.hint}>You can use MoodPals without an Apple Watch. No readings are requested during this introduction.</Text></View>:null}
  {step===2?<><Text style={s.sub}>Get a more relevant wellbeing experience. Both questions are optional.</Text><Text style={s.label}>Your age</Text><TextInput keyboardType="number-pad" maxLength={3} placeholder="Age (optional)" placeholderTextColor="#AAA0C1" value={age} onChangeText={setAge} style={s.input}/><Text style={s.label}>Sex (optional)</Text><Text style={s.hint}>Used only as context, never to diagnose health conditions.</Text>{[['Female','female'],['Male','male'],['Other','other'],['Prefer not to say','prefer_not_to_say']].map(([label,value])=>choice(label,sex===value,()=>setSex(value)))}</>:null}
  {step===3?<><Text style={s.sub}>Do any of these sound familiar? Select as many as you'd like.</Text>{signals.map(x=>choice(x,signalsSelected.includes(x),()=>toggle(x,signalsSelected,setSignals)))}</>:null}
  {step===4?<><Text style={s.sub}>Choose what matters to you. We'll use these answers to tailor your goals.</Text>{reasons.map(x=>choice(x,reasonsSelected.includes(x),()=>toggle(x,reasonsSelected,setReasons)))}</>:null}
  {step===5?<><Text style={s.sub}>What healthy habits would you like to build?</Text>{routines.map(x=>choice(x,habitsSelected.includes(x),()=>toggle(x,habitsSelected,setHabits)))}</>:null}
  {step===6?<><View style={s.explainer}><Text style={{fontSize:66}}>💗</Text><Text style={s.explainerTitle}>Meet HRV</Text><Text style={s.sub}>Heart rate variability describes small differences in timing between heartbeats. Trends can be influenced by sleep, exercise and many other factors. No single HRV reading can diagnose stress.</Text><Text style={s.hint}>Actual HRV readings require HealthKit permission and a compatible data source. No fictitious readings are treated as measurements.</Text></View></>:null}
  {step===9?<><View style={s.explainer}><Text style={{fontSize:66}}>🔔</Text><Text style={s.explainerTitle}>Gentle reminders</Text><Text style={s.sub}>Would you like the option to receive gentle reminders about your wellness goals?</Text>{choice('I would like reminders',notifications,()=>setNotifications(v=>!v))}<Text style={s.hint}>This saves your preference only. System notifications are not enabled until you grant iOS permission in a future supported version.</Text></View></>:null}
  {step===11?<><View style={s.explainer}><Text style={{fontSize:66}}>❤️</Text><Text style={s.explainerTitle}>Apple Health</Text><Text style={s.sub}>With your permission, MoodPals could use HRV, heart rate, sleep, steps and mindfulness history to show your trends.</Text><Text style={s.hint}>You can choose Connect and sync from the Health tab after onboarding. Health data is not requested on this screen.</Text></View></>:null}
  {step===7?<View style={s.explainer}><Text style={{fontSize:62}}>💗</Text><Text style={s.explainerTitle}>HRV changes over time.</Text><Text style={s.sub}>Heart rate variability can rise and fall with rest, exercise, sleep, illness and emotional strain. Your own baseline matters more than comparing your readings with someone else's.</Text><View style={{flexDirection:'row',gap:9}}><View style={[s.goalCard,{flex:1,backgroundColor:'#FFF0E9'}]}><Text style={s.goalName}>Below your baseline</Text><Text style={s.hint}>Consider rest, context and how you feel.</Text></View><View style={[s.goalCard,{flex:1,backgroundColor:'#E6F7EE'}]}><Text style={s.goalName}>Near your baseline</Text><Text style={s.hint}>Keep noticing trends and routines.</Text></View></View></View>:null}
  {step===8?<View style={s.explainer}><SuperdotMascot id="mochi" color="#488CD9" size={128}/><Text style={s.explainerTitle}>Better questions, not labels.</Text><Text style={s.sub}>When you feel stressed, MoodPals can ask about sleep, hydration, work and recent activity. If your watch has enough readings, it can show trends as one more piece of context.</Text><Text style={s.hint}>No single sensor reading proves that someone is stressed.</Text></View>:null}
  {step===10?<View style={s.explainer}><Text style={{fontSize:64}}>🔐</Text><Text style={s.explainerTitle}>Privacy first.</Text><Text style={s.sub}>Your mood, journal and preferences are stored in your private Supabase account. Apple Health access is optional; choosing Connect and sync later uploads selected measurements to your account.</Text><Text style={s.hint}>You control Health permissions in the iPhone Health app. Don't connect Health unless you're comfortable with storing your selected measurements.</Text></View>:null}
  {step===12?<View style={s.explainer}><SuperdotMascot id="bloop" color="#7139E9" size={136}/><Text style={s.explainerTitle}>Build your own wellness picture.</Text><Text style={s.sub}>MoodPals starts with your check-ins and goals. As you record more information, it can display real trends and ask more relevant questions.</Text><Text style={s.hint}>There are no precomputed stress diagnoses or invented personal scores.</Text></View>:null}
  {step===13?<><Text style={s.sub}>Suggested targets are just starting points. Adjust them to suit your routine.</Text><View style={s.goalGrid}>{goalsData.map(g=><View key={g.key} style={s.goalCard}><Text style={s.goalName}>{g.name}</Text><Text style={[s.goalValue,{color:picked.color}]}>{targets[g.key]} <Text style={s.hint}>{g.unit}</Text></Text><View style={s.goalButtons}>{g.values.map(n=><TouchableOpacity key={n} onPress={()=>setTargets(v=>({...v,[g.key]:n}))} style={[s.goalChip,targets[g.key]===n&&{backgroundColor:picked.color}]}><Text style={[s.goalChipText,targets[g.key]===n&&{color:'white'}]}>{n}</Text></TouchableOpacity>)}</View></View>)}</View></>:null}
  <View style={s.buttons}>{step>0?<TouchableOpacity onPress={()=>setStep(v=>v-1)} style={s.back}><Text style={s.backText}>Back</Text></TouchableOpacity>:null}<TouchableOpacity disabled={loading} onPress={()=>step===stepTitles.length-1?void finish():next()} style={[s.primary,{backgroundColor:picked.color}]}>{loading?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>{step===stepTitles.length-1?(editing?'Save changes':'Start my wellness journey'):'Continue'}</Text>}</TouchableOpacity></View>
  {step!==stepTitles.length-1?<TouchableOpacity onPress={next}><Text style={s.skip}>Skip for now</Text></TouchableOpacity>:null}
  <Text style={s.privacy}>Sensitive questions are optional. Your saved answers are protected by account-level access controls.</Text>
 </ScrollView></View>;
}
const s=StyleSheet.create({signIn:{color:'#5940BA',fontWeight:'800',fontSize:13,backgroundColor:'#EEE8FB',paddingHorizontal:12,paddingVertical:7,borderRadius:16,overflow:'hidden'},root:{flex:1,backgroundColor:'#FAF8FF'},content:{padding:24,paddingTop:66,paddingBottom:46,gap:13},brand:{fontSize:20,fontWeight:'900',color:'#5940BA'},progress:{fontSize:10,letterSpacing:2,color:'#8976AD',fontWeight:'800',marginTop:14},track:{height:6,backgroundColor:'#E9E0FA',borderRadius:10,overflow:'hidden'},fill:{height:'100%',borderRadius:10},title:{fontSize:28,color:'#28145E',fontWeight:'900',marginTop:14,lineHeight:35},sub:{color:'#8B7EAD',lineHeight:21,fontSize:14},label:{fontWeight:'800',color:'#28145E',marginTop:10,fontSize:14},hint:{color:'#9A8DAE',fontSize:11,lineHeight:18},input:{padding:16,borderWidth:1,borderColor:'#E4DBF5',borderRadius:17,backgroundColor:'#fff',fontSize:16,color:'#28145E'},choice:{padding:15,borderRadius:16,borderWidth:2,borderColor:'#EEE9F6',backgroundColor:'#fff',flexDirection:'row',alignItems:'center',gap:12},choiceText:{fontWeight:'700',color:'#37245F',fontSize:13},check:{fontSize:19,fontWeight:'800'},buttons:{flexDirection:'row',gap:10,marginTop:20},back:{borderRadius:17,padding:16,backgroundColor:'#EEE8F8',alignItems:'center',justifyContent:'center'},backText:{color:'#6445B1',fontWeight:'800'},primary:{padding:17,borderRadius:17,alignItems:'center',flex:1},primaryText:{color:'white',fontWeight:'900'},skip:{fontWeight:'700',color:'#8A78B6',textAlign:'center'},privacy:{color:'#AA9BC2',fontSize:10,textAlign:'center',lineHeight:17,marginTop:10},dotGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,justifyContent:'center'},dotCard:{width:'47%',padding:12,borderWidth:2,borderRadius:21,alignItems:'center',gap:5},dotName:{color:'#28145E',fontWeight:'900',fontSize:16},dotDesc:{color:'#8E80A5',fontSize:10,textAlign:'center'},explainer:{alignItems:'center',backgroundColor:'#fff',borderRadius:24,padding:22,gap:18,marginTop:16},explainerTitle:{color:'#28145E',fontSize:23,fontWeight:'900'},goalGrid:{gap:10},goalCard:{backgroundColor:'#fff',borderRadius:18,padding:14},goalName:{fontSize:14,fontWeight:'800',color:'#28145E'},goalValue:{fontSize:25,fontWeight:'900',marginVertical:7},goalButtons:{flexDirection:'row',gap:6},goalChip:{flex:1,backgroundColor:'#EEE8F8',borderRadius:10,paddingVertical:8,alignItems:'center'},goalChipText:{fontSize:11,fontWeight:'800',color:'#6A5792'}});
