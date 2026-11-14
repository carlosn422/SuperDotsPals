import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {supabase} from './supabase';
import {levelFor,STRESS_LEVELS,StressLevel,StressPoint} from './StressEngine';

const ASKED_KEY='moodpals-stress-alert-permission-asked';
// Same wording as the watch (StressAlert in StressEngine.swift).
const BODY:Partial<Record<StressLevel,string>>={
 elevated:'Your HRV is below your usual range, and your stress level looks a little high. A short break or a few slow breaths can help.',
 overload:'Your HRV is well below your usual range, and your stress level looks elevated. Take things a little slower, get some rest, and give your body time to recover.'
};
export function stressAlertContent(score:number,at:string,hrv?:number){
 const level=levelFor(score);
 const time=new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 return {title:[hrv?`HRV ${Math.round(hrv)}ms`:null,STRESS_LEVELS[level].label,time].filter(Boolean).join(' · '),body:BODY[level]||STRESS_LEVELS[level].summary};
}

// Alert when a freshly synced HRV reading is Elevated or Overload (on by default; off switch in Reminders).
// The cooldown is shared with the Apple Watch through claim_stress_alert, so only one device alerts.
export async function maybeSendStressAlert(point:StressPoint){
 try{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  const {data}=await supabase.from('user_settings').select('stress_alerts_enabled').eq('user_id',user.id).maybeSingle();
  if(data&&!data.stress_alerts_enabled)return false;
  let permission=await Notifications.getPermissionsAsync();
  if(!permission.granted){
   if(!permission.canAskAgain||AppState.currentState!=='active'||await AsyncStorage.getItem(ASKED_KEY))return false;
   await AsyncStorage.setItem(ASKED_KEY,'1');
   permission=await Notifications.requestPermissionsAsync();if(!permission.granted)return false;
  }
  if(point.score<60||Date.now()-new Date(point.at).getTime()>6*3600000)return false;
  const {data:claimed,error}=await supabase.rpc('claim_stress_alert',{score:Math.round(point.score)});
  if(error||claimed!==true)return false;
  await Notifications.scheduleNotificationAsync({content:{...stressAlertContent(point.score,point.at,point.hrv),data:{screen:'Actions',action:'breathing'},sound:false},trigger:null});
  return true;
 }catch(e){console.warn('Stress alert skipped',e);return false}
}
