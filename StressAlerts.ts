import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from './supabase';
import {levelFor,STRESS_LEVELS} from './StressEngine';

const COOLDOWN_MS=3*3600000;
const lastAlertKey=(id:string)=>'moodpals-stress-alert-'+id;

// Opt-in local alert when a freshly synced stress score crosses the user's threshold.
// Never includes raw health values in the notification text.
export async function maybeSendStressAlert(score:number,measuredAt:string){
 try{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  const {data,error}=await supabase.from('user_settings').select('stress_alerts_enabled,stress_alert_threshold').eq('user_id',user.id).maybeSingle();
  if(error||!data?.stress_alerts_enabled)return false;
  const threshold=Number(data.stress_alert_threshold??75);
  if(score<threshold||Date.now()-new Date(measuredAt).getTime()>6*3600000)return false;
  const last=Number(await AsyncStorage.getItem(lastAlertKey(user.id))||0);
  if(Date.now()-last<COOLDOWN_MS)return false;
  const permission=await Notifications.getPermissionsAsync();if(!permission.granted)return false;
  const level=STRESS_LEVELS[levelFor(score)];
  await Notifications.scheduleNotificationAsync({
   content:{title:`Stress level: ${level.label}`,body:'Your body signals are higher than your usual. Take a one-minute breathing break with your MoodPal.',data:{screen:'Actions',action:'breathing'},sound:false},
   trigger:null
  });
  await AsyncStorage.setItem(lastAlertKey(user.id),String(Date.now()));
  return true;
 }catch(e){console.warn('Stress alert skipped',e);return false}
}
