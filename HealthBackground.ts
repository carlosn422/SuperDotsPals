import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {nativeHealth,syncNativeHealth,HEALTH_SYNCED_FLAG} from './HealthDataPanel';
import {supabase} from './supabase';

// HealthKit wakes the app (even after it was closed) when new HRV, heart-rate or sleep
// samples arrive, so the stress score, widget and alerts stay current without opening MoodPals.
const MIN_INTERVAL_MS=15*60000;
let lastRun=0,running:Promise<void>|null=null;

async function backgroundSync(){
 if(running||Date.now()-lastRun<MIN_INTERVAL_MS)return running||undefined;
 running=(async()=>{
  try{
   const {data}=await supabase.auth.getSession();
   if(!data.session||!(await AsyncStorage.getItem(HEALTH_SYNCED_FLAG)))return;
   lastRun=Date.now();
   await syncNativeHealth();
  }catch(e){console.warn('Background health sync failed',e)}
  finally{running=null}
 })();
 return running;
}

export async function enableHealthBackgroundUpdates(){
 const h=nativeHealth();if(!h?.isAvailable?.())return false;
 if(!(await AsyncStorage.getItem(HEALTH_SYNCED_FLAG)))return false;
 const Q=h.QuantityType,C=h.CategoryType,F=h.UpdateFrequency;
 const plan:[string,number][]=[[Q.heartRateVariabilitySDNN,F.immediate],[Q.restingHeartRate,F.hourly],[C.sleepAnalysis,F.hourly],[Q.heartRate,F.hourly]];
 try{
  const observed:string[]=await h.getObservedTypes();
  const missing=plan.filter(([t])=>!observed.includes(t));
  if(!missing.length)return true;
  await h.observe(plan.map(([t])=>t));
  for(const [type,freq] of missing)await h.enableBackgroundDelivery(type,freq);
  return true;
 }catch(e){console.warn('HealthKit background delivery unavailable',e);return false}
}

const h=nativeHealth();
if(h?.addUpdateListener){
 h.addUpdateListener(()=>backgroundSync());
 void enableHealthBackgroundUpdates();
 AppState.addEventListener('change',s=>{if(s==='active')void enableHealthBackgroundUpdates()});
}
