import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {nativeHealth,syncNativeHealth,refreshSavedHealth,HEALTH_SYNCED_FLAG} from './HealthDataPanel';
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

// The Apple Watch uploads its own stress, HRV and sleep. Refresh as soon as a row lands so the iPhone MoodPal matches the watch.
let channel:ReturnType<typeof supabase.channel>|null=null,channelUser:string|null=null,refreshTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleRefresh(){
 if(refreshTimer)clearTimeout(refreshTimer);
 refreshTimer=setTimeout(()=>{refreshTimer=undefined;void refreshSavedHealth().catch(()=>{})},1500);
}
async function listenForReadings(userId:string|null,reconnect=false){
 if(channel&&(reconnect||channelUser!==userId)){const old=channel;channel=null;channelUser=null;await supabase.removeChannel(old)}
 if(!userId||channel)return;
 channelUser=userId;
 channel=supabase.channel('readings-sync:'+userId)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'wellness_readings',filter:'user_id=eq.'+userId},scheduleRefresh)
  .subscribe();
}
// Serialized: overlapping calls (sign-in + foreground) otherwise reuse a channel that is already subscribed.
let listenQueue:Promise<void>=Promise.resolve();
function listen(userId:string|null,reconnect=false){
 listenQueue=listenQueue.then(()=>listenForReadings(userId,reconnect)).catch(e=>console.warn('Readings realtime unavailable',e));
 return listenQueue;
}
supabase.auth.onAuthStateChange((_event,session)=>{const id=session?.user.id??null;setTimeout(()=>void listen(id),0)});

// Coming back to MoodPals re-reads Apple Health (at most every 15 minutes) and always reloads saved readings.
// iOS drops the realtime socket while the app is suspended, so reconnect too.
async function onForeground(){
 const before=lastRun;
 await backgroundSync();
 if(lastRun===before)await refreshSavedHealth().catch(()=>{});
 const {data}=await supabase.auth.getSession();
 await listen(data.session?.user.id??null,true);
}
AppState.addEventListener('change',s=>{if(s==='active')void onForeground()});

const h=nativeHealth();
if(h?.addUpdateListener){
 h.addUpdateListener(()=>backgroundSync());
 void enableHealthBackgroundUpdates();
 AppState.addEventListener('change',s=>{if(s==='active')void enableHealthBackgroundUpdates()});
}
