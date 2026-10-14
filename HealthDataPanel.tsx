import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet,Platform} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants,{ExecutionEnvironment} from 'expo-constants';
import {supabase} from './supabase';

// HealthKit is a native module: don't require it in Expo Go.
const inExpoGo=Constants.appOwnership==='expo'||(Constants.executionEnvironment===ExecutionEnvironment.StoreClient&&Constants.expoGoConfig!=null);
function nativeHealth(){if(inExpoGo||Platform.OS!=='ios')return null;try{return require('@appeeky/expo-healthkit') as any}catch{return null}}
type Metric='hrv'|'resting_heart_rate'|'steps'|'sleep_minutes';
type Reading={metric:Metric;value:number;recorded_at:string;source:string};
type Upload={user_id:string;metric:Metric;value:number;source:'healthkit';source_record_key:string;recorded_at:string};
const palette={ink:'#25145C',purple:'#7139E9',muted:'#8276A5',mint:'#E6FAEF'};
function numberValue(v:unknown){const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
function keyForToday(){const d=new Date();return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-')}
async function syncNativeHealth():Promise<number>{
 const h=nativeHealth();
 if(!h||!h.isAvailable())throw Error('Apple Health is not available. Install a native iOS development build on an iPhone.');
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Sign in before syncing health data.');
 await h.requestAuthorization({toRead:[h.QuantityType.heartRateVariabilitySDNN,h.QuantityType.restingHeartRate,h.QuantityType.stepCount,h.CategoryType.sleepAnalysis]});
 const now=new Date(),recent=new Date(now.getTime()-30*86400000),day=new Date();day.setHours(0,0,0,0);
 const night=new Date(now.getTime()-24*3600000);
 const results=await Promise.allSettled([
  h.queryQuantitySamples({type:h.QuantityType.heartRateVariabilitySDNN,unit:'ms',from:recent,to:now,limit:90,ascending:false}),
  h.queryQuantitySamples({type:h.QuantityType.restingHeartRate,unit:'count/min',from:recent,to:now,limit:40,ascending:false}),
  h.queryStatistics({type:h.QuantityType.stepCount,unit:'count',from:day,to:now,options:h.StatisticsOption.cumulativeSum}),
  h.queryCategorySamples({type:h.CategoryType.sleepAnalysis,from:night,to:now,limit:100,ascending:false})
 ]);
 const uploaded:Upload[]=[];
 const append=(metric:Metric,val:unknown,key:string,date:unknown)=>{
  const num=numberValue(val);if(num===null)return;
  const d=date?new Date(String(date)):now;if(Number.isNaN(d.getTime()))return;
  uploaded.push({user_id:user.id,metric,value:Math.round(num*100)/100,source:'healthkit',source_record_key:key,recorded_at:d.toISOString()});
 };
 const samples=(index:number)=>results[index].status==='fulfilled'?(results[index] as PromiseFulfilledResult<any>).value:[];
 const hrvs=Array.isArray(samples(0))?samples(0):[];
 hrvs.forEach((v:any)=>append('hrv',v.value,'hrv-'+String(v.uuid||v.startDate),v.endDate||v.startDate));
 const rests=Array.isArray(samples(1))?samples(1):[];
 rests.forEach((v:any)=>append('resting_heart_rate',v.value,'rest-'+String(v.uuid||v.startDate),v.endDate||v.startDate));
 const steps=results[2].status==='fulfilled'?(results[2] as PromiseFulfilledResult<any>).value:null;
 if(steps&&steps.sum!==null&&steps.sum!==undefined)append('steps',steps.sum,'steps-'+keyForToday(),now);
 const sleeps=samples(3);
 if(Array.isArray(sleeps)){
  const allowed=[h.SleepAnalysisValue.asleepUnspecified,h.SleepAnalysisValue.asleepCore,h.SleepAnalysisValue.asleepDeep,h.SleepAnalysisValue.asleepREM].filter(x=>x!==undefined);
  const spans=sleeps.filter((v:any)=>allowed.includes(v.value)).map((v:any)=>[new Date(v.startDate).getTime(),new Date(v.endDate).getTime()]).filter(([a,b]:number[])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a:number[],b:number[])=>a[0]-b[0]);
  const merged:number[][]=[];for(const [a,b] of spans){const last=merged[merged.length-1];if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
  const minutes=merged.reduce((total,[a,b])=>total+(b-a)/60000,0);
  if(minutes>0)append('sleep_minutes',Math.min(minutes,1440),'sleep-'+keyForToday(),now);
 }
 if(!uploaded.length)return 0;
 const {error}=await supabase.from('wellness_readings').upsert(uploaded,{onConflict:'user_id,source,metric,source_record_key'});
 if(error)throw error;
 return uploaded.length;
}
export function useSavedHealth(){
 const [readings,setReadings]=useState<Reading[]>([]),[loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user){setReadings([]);return}
 const {data,error}=await supabase.from('wellness_readings').select('metric,value,recorded_at,source').eq('user_id',user.id).eq('source','healthkit').order('recorded_at',{ascending:false}).limit(250);
 if(error)throw error;setReadings((data||[]) as Reading[]);
 }catch(e){console.warn('Unable to load saved HealthKit readings',e)}finally{setLoading(false)}},[]);
 useEffect(()=>{void reload()},[reload]);
 const latest=(metric:Metric)=>readings.find(v=>v.metric===metric)||null;
 const today=keyForToday();
 const daily=(metric:Metric)=>readings.find(v=>v.metric===metric&&(()=>{const d=new Date(v.recorded_at);return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-')===today})())||null;
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
 const available=!!nativeHealth()?.isAvailable?.();
 async function connect(){
  setSyncing(true);try{const count=await syncNativeHealth();await reload();
   Alert.alert('Apple Health sync',count?'Synced '+count+' real measurements to your private Superdots account.':'No permitted health samples were found. You can review Health permissions in iOS Settings.');
  }catch(e:any){Alert.alert('Health sync unavailable',e?.message||'Please retry in a native development build.')}finally{setSyncing(false)}
 }
 const measurements=[
  {metric:'hrv' as Metric,name:'HRV',unit:'ms',icon:'pulse-outline',tint:'#FFEAF0',reading:latest('hrv')},
  {metric:'resting_heart_rate' as Metric,name:'Resting heart rate',unit:'bpm',icon:'heart-outline',tint:'#FFEAF0',reading:latest('resting_heart_rate')},
  {metric:'steps' as Metric,name:'Steps today',unit:'steps',icon:'walk-outline',tint:'#E8F9ED',reading:daily('steps')},
  {metric:'sleep_minutes' as Metric,name:'Recent sleep',unit:'min',icon:'moon-outline',tint:'#F0E8FF',reading:latest('sleep_minutes')}
 ];
 return <View style={{gap:15}}>
 <View style={s.connect}><Ionicons name="heart-circle" size={47} color="#EF6491"/><View style={{flex:1,gap:5}}><Text style={s.title}>Apple Health</Text><Text style={s.sub}>{readings.length?'Real readings saved from your device':'Your Apple Health data is not yet synced'}</Text></View></View>
 <Text style={s.info}>With your permission, Superdots reads HRV, resting heart rate, steps and sleep from Apple Health and uploads selected measurements to your private Supabase account for personalized wellness support. It does not diagnose stress. You can manage access in the iPhone Health app.</Text>
 <TouchableOpacity disabled={syncing||!available} onPress={()=>void connect()} style={[s.button,(!available||syncing)&&{opacity:0.55}]}>{syncing?<ActivityIndicator color="#fff"/>:<Ionicons name="sync" color="#fff" size={19}/>}<Text style={s.buttonText}>{syncing?'Syncing…':readings.length?'Sync latest health data':'Connect and sync health data'}</Text></TouchableOpacity>
 {!available?<Text style={s.sub}>Requires an iPhone native development build with HealthKit capability. Not available in Expo Go.</Text>:null}
 <View style={s.row}>{measurements.map(x=><View key={x.metric} style={s.tile}><View style={[s.icon,{backgroundColor:x.tint}]}><Ionicons name={x.icon as any} color={palette.purple} size={21}/></View><Text style={s.label}>{x.name}</Text><Text style={s.value}>{loading?'…':x.reading?Math.round(x.reading.value).toLocaleString():'—'} <Text style={s.unit}>{x.reading?x.unit:''}</Text></Text><Text style={s.sub}>{x.reading?'HealthKit · '+new Date(x.reading.recorded_at).toLocaleDateString():'No synced measurement'}</Text></View>)}</View>
 </View>;
}
const s=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:11},tile:{backgroundColor:'#fff',borderRadius:22,padding:17,width:'48%',gap:7,minHeight:142},label:{fontSize:12,fontWeight:'800',color:palette.ink},sub:{fontSize:11,lineHeight:16,color:palette.muted},value:{fontSize:21,fontWeight:'900',color:palette.ink},unit:{fontWeight:'500',fontSize:11,color:palette.muted},connect:{backgroundColor:palette.mint,borderRadius:22,padding:17,flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:20,fontWeight:'900',color:palette.ink},info:{fontSize:12,color:palette.muted,lineHeight:18},button:{backgroundColor:palette.purple,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},buttonText:{color:'#fff',fontWeight:'900',fontSize:13},icon:{width:39,height:39,borderRadius:20,justifyContent:'center',alignItems:'center'}});
