import {Platform} from 'react-native';
import {computeStressPoints,dailyStress,energyScore,sameDay,STRESS_LEVELS,ScoredReading} from './StressEngine';

export const APP_GROUP='group.com.superdotspals.wellnest';

// Shares today's stress snapshot with the home/lock-screen widget through the App Group.
export function publishStressSnapshot(readings:ScoredReading[]){
 if(Platform.OS!=='ios')return;
 try{
  const {ExtensionStorage}=require('@bacons/apple-targets');
  const today=dailyStress(computeStressPoints(readings));
  const now=Date.now();
  const sleep=readings.find(r=>r.metric==='sleep_minutes'&&now-new Date(r.recorded_at).getTime()<36*3600000)?.value??null;
  const kcal=readings.find(r=>r.metric==='active_energy_kcal'&&sameDay(new Date(r.recorded_at),new Date()))?.value??null;
  const hrv=readings.find(r=>r.metric==='hrv')?.value??null;
  const energy=energyScore({sleepMinutes:sleep,stress:today?.score??null,activeKcal:kcal});
  const store=new ExtensionStorage(APP_GROUP);
  store.set('stressSnapshot',{
   score:today?.score??-1,
   level:today?STRESS_LEVELS[today.level].label:'',
   updated:today?Math.round(new Date(today.updated).getTime()/1000):0,
   energy:energy??-1,
   hrv:hrv!==null?Math.round(hrv):-1
  });
  ExtensionStorage.reloadWidget();
 }catch(e){console.warn('Widget snapshot skipped',e)}
}
