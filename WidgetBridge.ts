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

const MASCOT_ASSET:Record<string,string>={Joyful:'mascot_joy',Calm:'mascot_disgust',Sad:'mascot_sadness',Angry:'mascot_anger',Anxious:'mascot_fear',Tired:'mascot_tired'};
export type CircleWidgetSignal={name:string;initials:string;color:string;emoji:string;label:string;at:string};
// Shares the latest Little Signals with the Little Signals widget. The user's own mood is only included when they turn off "Hide my mood on widgets".
export function publishCircleSnapshot(data:{signals:CircleWidgetSignal[];unseen:number;todayCount:number;friendCount:number;hideMood:boolean;showNames:boolean;mood:string}){
 if(Platform.OS!=='ios')return;
 try{
  const {ExtensionStorage}=require('@bacons/apple-targets');
  const store=new ExtensionStorage(APP_GROUP);
  store.set('circleSnapshot',{
   signals:data.signals.slice(0,3).map(s=>({...s,at:Math.round(new Date(s.at).getTime()/1000)})),
   unseen:data.unseen,todayCount:data.todayCount,friendCount:data.friendCount,
   hideMood:data.hideMood,showNames:data.showNames,
   mood:data.hideMood?'':data.mood,mascot:data.hideMood?'':(MASCOT_ASSET[data.mood]||''),
  });
  ExtensionStorage.reloadWidget();
 }catch(e){console.warn('Circle widget snapshot skipped',e)}
}
