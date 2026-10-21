import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet,Platform} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants,{ExecutionEnvironment} from 'expo-constants';
import {supabase} from './supabase';
import {computeStressPoints,dailyStress} from './StressEngine';
import {maybeSendStressAlert} from './StressAlerts';

// HealthKit is a native module: don't require it in Expo Go.
const inExpoGo=Constants.appOwnership==='expo'||(Constants.executionEnvironment===ExecutionEnvironment.StoreClient&&Constants.expoGoConfig!=null);
function nativeHealth(){if(inExpoGo||Platform.OS!=='ios')return null;try{return require('@appeeky/expo-healthkit') as any}catch{return null}}
export type Metric='hrv'|'resting_heart_rate'|'steps'|'sleep_minutes'|'stress_score'|'heart_rate'|'active_energy_kcal'|'exercise_minutes'|'stand_hours'|'daylight_minutes'|'mindfulness_minutes'|'noise_db'|'sleep_deep_minutes'|'sleep_rem_minutes'|'sleep_core_minutes'|'sleep_awake_minutes'|'sleep_heart_rate';
export type Reading={metric:Metric;value:number;recorded_at:string;source:string};
type Upload={user_id:string;metric:Metric;value:number;source:'healthkit'|'computed';source_record_key:string;recorded_at:string};
const palette={ink:'#1D2B33',purple:'#34B37E',muted:'#6E7D86',mint:'#E4F6EA'};
function numberValue(v:unknown){const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
function dayKey(d:Date){return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-')}
function keyForToday(){return dayKey(new Date())}
const DAYLIGHT='HKQuantityTypeIdentifierTimeInDaylight';
const ACTIVITY_SUMMARY='HKActivitySummaryTypeIdentifier';
export function healthKitAvailable(){return !!nativeHealth()?.isAvailable?.()}

// Readings are shared by every dashboard card; one fetch per minute, refreshed after each sync.
let cache:{userId:string;readings:Reading[];at:number}|null=null;
let inflight:Promise<Reading[]>|null=null;
const listeners=new Set<(r:Reading[])=>void>();
async function fetchReadings(force=false):Promise<Reading[]>{
 const {data:{user}}=await supabase.auth.getUser();if(!user){cache=null;return []}
 if(!force&&cache&&cache.userId===user.id&&Date.now()-cache.at<60000)return cache.readings;
 if(inflight&&!force)return inflight;
 inflight=(async()=>{
  const since=new Date(Date.now()-400*86400000).toISOString();
  const {data,error}=await supabase.from('wellness_readings').select('metric,value,recorded_at,source').eq('user_id',user.id).in('source',['healthkit','computed']).gte('recorded_at',since).order('recorded_at',{ascending:false}).limit(3000);
  if(error)throw error;
  const readings=((data||[]) as Reading[]).map(r=>({...r,value:Number(r.value)}));
  cache={userId:user.id,readings,at:Date.now()};
  listeners.forEach(l=>l(readings));
  return readings;
 })();
 try{return await inflight}finally{inflight=null}
}

export async function syncNativeHealth():Promise<number>{
 const h=nativeHealth();
 if(!h||!h.isAvailable())throw Error('Apple Health is not available. Install a native iOS development build on an iPhone.');
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Sign in before syncing health data.');
 const Q=h.QuantityType,C=h.CategoryType;
 const wanted=[Q.heartRateVariabilitySDNN,Q.restingHeartRate,Q.stepCount,C.sleepAnalysis,Q.heartRate,Q.activeEnergyBurned,Q.appleExerciseTime,Q.appleStandTime,C.mindfulSession,Q.environmentalAudioExposure,DAYLIGHT,ACTIVITY_SUMMARY].filter(Boolean);
 let unsupported:string[]=[];try{unsupported=h.getUnsupportedTypes?.(wanted)||[]}catch{unsupported=[]}
 const toRead=wanted.filter((t:string)=>!unsupported.includes(t));
 await h.requestAuthorization({toRead});
 const can=(t:string)=>toRead.includes(t);
 const now=new Date(),recent=new Date(now.getTime()-30*86400000),week=new Date(now.getTime()-7*86400000),day=new Date();day.setHours(0,0,0,0);
 const night=new Date(now.getTime()-24*3600000);
 const skip=Promise.resolve([]);
 const results=await Promise.allSettled([
  h.queryQuantitySamples({type:Q.heartRateVariabilitySDNN,unit:'ms',from:recent,to:now,limit:240,ascending:false}),
  h.queryQuantitySamples({type:Q.restingHeartRate,unit:'count/min',from:recent,to:now,limit:40,ascending:false}),
  h.queryStatistics({type:Q.stepCount,unit:'count',from:day,to:now,options:h.StatisticsOption.cumulativeSum}),
  h.queryStatisticsCollection({type:Q.stepCount,unit:'count',from:recent,to:now,interval:{day:1},options:h.StatisticsOption.cumulativeSum}),
  h.queryCategorySamples({type:C.sleepAnalysis,from:night,to:now,limit:200,ascending:false}),
  can(Q.heartRate)?h.queryStatisticsCollection({type:Q.heartRate,unit:'count/min',from:week,to:now,interval:{hour:1},options:h.StatisticsOption.discreteAverage}):skip,
  can(ACTIVITY_SUMMARY)?h.queryActivitySummaries({from:recent,to:now}):skip,
  can(DAYLIGHT)?h.queryStatisticsCollection({type:DAYLIGHT,unit:'min',from:recent,to:now,interval:{day:1},options:h.StatisticsOption.cumulativeSum}):skip,
  can(C.mindfulSession)?h.queryCategorySamples({type:C.mindfulSession,from:recent,to:now,limit:300,ascending:false}):skip,
  can(Q.environmentalAudioExposure)?h.queryStatisticsCollection({type:Q.environmentalAudioExposure,unit:'dBASPL',from:recent,to:now,interval:{day:1},options:h.StatisticsOption.discreteAverage}):skip
 ]);
 const uploaded:Upload[]=[];
 const append=(metric:Metric,val:unknown,key:string,date:unknown,source:'healthkit'|'computed'='healthkit')=>{
  const num=numberValue(val);if(num===null)return;
  const d=date?new Date(date as any):now;if(Number.isNaN(d.getTime()))return;
  uploaded.push({user_id:user.id,metric,value:Math.round(num*100)/100,source,source_record_key:key,recorded_at:d.toISOString()});
 };
 const samples=(index:number):any[]=>{const r=results[index];const v=r.status==='fulfilled'?(r as PromiseFulfilledResult<any>).value:[];return Array.isArray(v)?v:[]};
 const daily=(index:number,metric:Metric,prefix:string,field:'sum'|'average')=>samples(index).forEach((v:any)=>{const d=new Date(v.startDate||v.start);if(Number.isNaN(d.getTime())||v[field]===undefined||v[field]===null)return;d.setHours(12,0,0,0);append(metric,v[field],prefix+'-'+dayKey(d),d)});
 samples(0).forEach((v:any)=>append('hrv',v.value,'hrv-'+String(v.uuid||v.startDate),v.endDate||v.startDate));
 samples(1).forEach((v:any)=>append('resting_heart_rate',v.value,'rest-'+String(v.uuid||v.startDate),v.endDate||v.startDate));
 const steps=results[2].status==='fulfilled'?(results[2] as PromiseFulfilledResult<any>).value:null;
 if(steps&&steps.sum!==null&&steps.sum!==undefined)append('steps',steps.sum,'steps-'+keyForToday(),now);
 daily(3,'steps','steps','sum');
 const sleeps=samples(4);
 if(sleeps.length){
  const V=h.SleepAnalysisValue;
  const spansFor=(values:number[])=>{
   const spans=sleeps.filter((v:any)=>values.includes(v.value)).map((v:any)=>[new Date(v.startDate).getTime(),new Date(v.endDate).getTime()]).filter(([a,b]:number[])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a:number[],b:number[])=>a[0]-b[0]);
   const merged:number[][]=[];for(const [a,b] of spans){const last=merged[merged.length-1];if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
   return merged;
  };
  const total=(m:number[][])=>Math.min(1440,m.reduce((t,[a,b])=>t+(b-a)/60000,0));
  const asleep=spansFor([V.asleepUnspecified,V.asleepCore,V.asleepDeep,V.asleepREM].filter((x:any)=>x!==undefined));
  const key=keyForToday();
  if(total(asleep)>0){
   append('sleep_minutes',total(asleep),'sleep-'+key,now);
   append('sleep_deep_minutes',total(spansFor([V.asleepDeep])),'sleep-deep-'+key,now);
   append('sleep_rem_minutes',total(spansFor([V.asleepREM])),'sleep-rem-'+key,now);
   append('sleep_core_minutes',total(spansFor([V.asleepCore,V.asleepUnspecified])),'sleep-core-'+key,now);
   append('sleep_awake_minutes',total(spansFor([V.awake])),'sleep-awake-'+key,now);
   if(can(Q.heartRate)){
    try{const from=new Date(asleep[0][0]),to=new Date(asleep[asleep.length-1][1]);
     const hr=await h.queryStatistics({type:Q.heartRate,unit:'count/min',from,to,options:h.StatisticsOption.discreteAverage});
     if(hr?.average)append('sleep_heart_rate',hr.average,'sleep-hr-'+key,now);
    }catch{}
   }
  }
 }
 samples(5).forEach((v:any)=>{const d=new Date(v.startDate);if(Number.isNaN(d.getTime())||!v.average)return;append('heart_rate',v.average,'hr-'+d.toISOString().slice(0,13),d)});
 samples(6).forEach((v:any)=>{const d=new Date(String(v.date).length===10?v.date+'T12:00:00':v.date);if(Number.isNaN(d.getTime()))return;d.setHours(12,0,0,0);const k=dayKey(d);
  append('active_energy_kcal',v.activeEnergyBurned,'move-'+k,d);append('exercise_minutes',v.appleExerciseTime,'exercise-'+k,d);append('stand_hours',v.appleStandHours,'stand-'+k,d)});
 daily(7,'daylight_minutes','daylight','sum');
 const mindful=new Map<string,{minutes:number;at:Date}>();
 samples(8).forEach((v:any)=>{const a=new Date(v.startDate),b=new Date(v.endDate);if(Number.isNaN(a.getTime())||!(b>a))return;const k=dayKey(a);const cur=mindful.get(k)||{minutes:0,at:new Date(a.getFullYear(),a.getMonth(),a.getDate(),12)};cur.minutes+=(b.getTime()-a.getTime())/60000;mindful.set(k,cur)});
 mindful.forEach((v,k)=>append('mindfulness_minutes',v.minutes,'mindful-'+k,v.at));
 daily(9,'noise_db','noise','average');
 // Derived stress scores, one per HRV sample, from the user's own baseline.
 const previous=await fetchReadings(true).catch(()=>[] as Reading[]);
 const combined=[...uploaded.map(u=>({metric:u.metric,value:u.value,recorded_at:u.recorded_at,source:u.source})),...previous];
 const hrvKeys=new Map(uploaded.filter(u=>u.metric==='hrv').map(u=>[u.recorded_at,u.source_record_key]));
 computeStressPoints(combined).filter(p=>Date.now()-new Date(p.at).getTime()<30*86400000).forEach(p=>{
  const key=hrvKeys.get(p.at);if(key)append('stress_score',p.score,'stress-'+key,p.at,'computed');
 });
 const unique=[...new Map(uploaded.map(v=>[v.source+'|'+v.metric+'|'+v.source_record_key,v])).values()];
 if(!unique.length)return 0;
 const core=unique.filter(u=>['hrv','resting_heart_rate','steps','sleep_minutes'].includes(u.metric));
 const extra=unique.filter(u=>!core.includes(u));
 const {error}=await supabase.from('wellness_readings').upsert(core,{onConflict:'user_id,source,metric,source_record_key'});
 if(error)throw error;
 let saved=core.length;
 for(let i=0;i<extra.length;i+=500){
  const {error:extraError}=await supabase.from('wellness_readings').upsert(extra.slice(i,i+500),{onConflict:'user_id,source,metric,source_record_key'});
  if(extraError){console.warn('Extended health metrics not saved (database migration pending?)',extraError.message);break}
  saved+=Math.min(500,extra.length-i);
 }
 const fresh=await fetchReadings(true).catch(()=>[] as Reading[]);
 const latestStress=dailyStress(computeStressPoints(fresh));
 if(latestStress)void maybeSendStressAlert(latestStress.score,latestStress.updated);
 return saved;
}
export function useSavedHealth(){
 const [readings,setReadings]=useState<Reading[]>(cache?.readings||[]),[loading,setLoading]=useState(!cache);
 const reload=useCallback(async(force=true)=>{try{setReadings(await fetchReadings(force))}catch(e){console.warn('Unable to load saved HealthKit readings',e)}finally{setLoading(false)}},[]);
 useEffect(()=>{listeners.add(setReadings);void reload(false);return()=>{listeners.delete(setReadings)}},[reload]);
 const latest=(metric:Metric)=>readings.find(v=>v.metric===metric)||null;
 const today=keyForToday();
 const daily=(metric:Metric)=>readings.find(v=>v.metric===metric&&dayKey(new Date(v.recorded_at))===today)||null;
 return {readings,loading,reload,latest,daily};
}
export function HealthMiniStats(){
 const {latest,daily,loading}=useSavedHealth();
 const steps=daily('steps'),sleep=latest('sleep_minutes');
 const items=[{name:'Steps',icon:'walk',value:steps?Math.round(steps.value).toLocaleString():'—',description:steps?'From Apple Health':'No steps synced'},{name:'Sleep',icon:'moon',value:sleep?Math.round(sleep.value)+' min':'—',description:sleep?'Latest synced':'No sleep synced'}];
 return <View style={s.row}>{items.map(x=><View key={x.name} style={s.tile}><Ionicons name={x.icon as any} color={palette.purple} size={21}/><Text style={s.label}>{x.name}</Text><Text style={s.value}>{loading?'…':x.value}</Text><Text style={s.sub}>{x.description}</Text></View>)}</View>;
}
export default function HealthDataPanel(){
 const [syncing,setSyncing]=useState(false);const {readings,loading,reload,latest,daily}=useSavedHealth();
 const available=healthKitAvailable();
 async function connect(){
  setSyncing(true);try{const count=await syncNativeHealth();await reload();
   Alert.alert('Apple Health sync',count?'Synced '+count+' real measurements to your private MoodPals account.':'No permitted health samples were found. You can review Health permissions in iOS Settings.');
  }catch(e:any){Alert.alert('Health sync unavailable',e?.message||'Please retry in a native development build.')}finally{setSyncing(false)}
 }
 const measurements=[
  {metric:'hrv' as Metric,name:'HRV',unit:'ms',icon:'pulse-outline',tint:'#FFEAF0',reading:latest('hrv')},
  {metric:'resting_heart_rate' as Metric,name:'Resting heart rate',unit:'bpm',icon:'heart-outline',tint:'#FFEAF0',reading:latest('resting_heart_rate')},
  {metric:'steps' as Metric,name:'Steps today',unit:'steps',icon:'walk-outline',tint:'#E8F9ED',reading:daily('steps')},
  {metric:'sleep_minutes' as Metric,name:'Recent sleep',unit:'min',icon:'moon-outline',tint:'#F0E8FF',reading:latest('sleep_minutes')},
  {metric:'heart_rate' as Metric,name:'Heart rate',unit:'bpm',icon:'heart-half-outline',tint:'#FFEAF0',reading:latest('heart_rate')},
  {metric:'active_energy_kcal' as Metric,name:'Move today',unit:'kcal',icon:'flame-outline',tint:'#FFF1E6',reading:daily('active_energy_kcal')},
  {metric:'daylight_minutes' as Metric,name:'Daylight today',unit:'min',icon:'sunny-outline',tint:'#FFF7DB',reading:daily('daylight_minutes')},
  {metric:'noise_db' as Metric,name:'Noise level',unit:'dB',icon:'ear-outline',tint:'#EEF1FD',reading:latest('noise_db')}
 ];
 return <View style={{gap:15}}>
 <View style={s.connect}><Ionicons name="heart-circle" size={47} color="#EF6491"/><View style={{flex:1,gap:5}}><Text style={s.title}>Apple Health</Text><Text style={s.sub}>{readings.length?'Real readings saved from your device':'Your Apple Health data is not yet synced'}</Text></View></View>
 <Text style={s.info}>With your permission, MoodPals reads HRV, heart rate, resting heart rate, steps, sleep stages, activity rings, daylight, mindful minutes and environmental noise from Apple Health and uploads selected measurements to your private Supabase account for personalized wellness support. Your stress score is estimated from your own HRV and resting heart rate baseline; it does not diagnose stress. You can manage access in the iPhone Health app.</Text>
 <TouchableOpacity disabled={syncing||!available} onPress={()=>void connect()} style={[s.button,(!available||syncing)&&{opacity:0.55}]}>{syncing?<ActivityIndicator color="#fff"/>:<Ionicons name="sync" color="#fff" size={19}/>}<Text style={s.buttonText}>{syncing?'Syncing…':readings.length?'Sync latest health data':'Connect and sync health data'}</Text></TouchableOpacity>
 {!available?<Text style={s.sub}>Requires an iPhone native development build with HealthKit capability. Not available in Expo Go.</Text>:null}
 <View style={s.row}>{measurements.map(x=><View key={x.metric} style={s.tile}><View style={[s.icon,{backgroundColor:x.tint}]}><Ionicons name={x.icon as any} color={palette.purple} size={21}/></View><Text style={s.label}>{x.name}</Text><Text style={s.value}>{loading?'…':x.reading?Math.round(x.reading.value).toLocaleString():'—'} <Text style={s.unit}>{x.reading?x.unit:''}</Text></Text><Text style={s.sub}>{x.reading?'HealthKit · '+new Date(x.reading.recorded_at).toLocaleDateString():'No synced measurement'}</Text></View>)}</View>
 </View>;
}
const s=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:11},tile:{backgroundColor:'#fff',borderRadius:22,padding:17,width:'48%',gap:7,minHeight:142},label:{fontSize:12,fontWeight:'800',color:palette.ink},sub:{fontSize:11,lineHeight:16,color:palette.muted},value:{fontSize:21,fontWeight:'900',color:palette.ink},unit:{fontWeight:'500',fontSize:11,color:palette.muted},connect:{backgroundColor:palette.mint,borderRadius:22,padding:17,flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:20,fontWeight:'900',color:palette.ink},info:{fontSize:12,color:palette.muted,lineHeight:18},button:{backgroundColor:palette.purple,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},buttonText:{color:'#fff',fontWeight:'900',fontSize:13},icon:{width:39,height:39,borderRadius:20,justifyContent:'center',alignItems:'center'}});
