import {useEffect,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {sameDay} from './StressEngine';

export type Drink='water'|'caffeine';
export type DrinkRow={habit:string;amount:number;unit:string|null;recorded_at:string};
export const DRINK_UNIT:Record<Drink,string>={water:'oz',caffeine:'mg'};
// Older entries were saved as cups of water and servings of caffeine.
export const rowAmount=(r:Pick<DrinkRow,'habit'|'amount'|'unit'>)=>{const n=Number(r.amount)||0;return r.habit==='water'?(r.unit==='oz'?n:n*8):(r.unit==='mg'?n:n*95)};
// Each row is that day's running total; the newest row of the day wins.
export function dayRows(rows:DrinkRow[],habit:Drink,day:Date){return rows.filter(r=>r.habit===habit&&sameDay(new Date(r.recorded_at),day)).sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at))}
export function dayTotal(rows:DrinkRow[],habit:Drink,day:Date){const r=dayRows(rows,habit,day)[0];return r?rowAmount(r):null}

export const DRINK_GOAL_DEFAULTS:Record<Drink,number>={water:64,caffeine:400};
const GOALS_KEY='moodpals-drink-goals';
let goalCache:Record<Drink,number>|null=null;
const goalListeners=new Set<(g:Record<Drink,number>)=>void>();
// Custom goals are Plus; Free always uses the defaults.
export function useDrinkGoals(isPlus:boolean){
 const [saved,setSaved]=useState(goalCache||DRINK_GOAL_DEFAULTS);
 useEffect(()=>{goalListeners.add(setSaved);if(!goalCache)void AsyncStorage.getItem(GOALS_KEY).then(v=>{goalCache={...DRINK_GOAL_DEFAULTS,...(v?JSON.parse(v):{})};goalListeners.forEach(l=>l(goalCache!))}).catch(()=>{});return()=>{goalListeners.delete(setSaved)}},[]);
 const setGoal=(k:Drink,v:number)=>{goalCache={...(goalCache||DRINK_GOAL_DEFAULTS),[k]:v};goalListeners.forEach(l=>l(goalCache!));void AsyncStorage.setItem(GOALS_KEY,JSON.stringify(goalCache)).catch(()=>{})};
 return {goals:isPlus?saved:DRINK_GOAL_DEFAULTS,setGoal};
}

export type WaterReminder={enabled:boolean;every:number;start:number;end:number};
export const WATER_REMINDER_DEFAULT:WaterReminder={enabled:false,every:2,start:9,end:21};
const REMINDER_KEY='moodpals-water-reminder',PREFIX='water-reminder-';
export async function loadWaterReminder():Promise<WaterReminder>{
 try{const v=await AsyncStorage.getItem(REMINDER_KEY);return {...WATER_REMINDER_DEFAULT,...(v?JSON.parse(v):{})}}catch{return WATER_REMINDER_DEFAULT}
}
// Replaces the daily water reminders; returns false when notifications aren't allowed.
export async function saveWaterReminder(r:WaterReminder){
 if(r.enabled){const p=await Notifications.getPermissionsAsync();if(!p.granted&&!(await Notifications.requestPermissionsAsync()).granted)return false}
 const all=await Notifications.getAllScheduledNotificationsAsync();
 await Promise.all(all.filter(n=>n.identifier.startsWith(PREFIX)).map(n=>Notifications.cancelScheduledNotificationAsync(n.identifier)));
 if(r.enabled)for(let h=r.start;h<=r.end;h+=r.every)await Notifications.scheduleNotificationAsync({identifier:PREFIX+h,content:{title:'Time for some water',body:'A few sips help your body handle stress. Log it in MoodPals.',data:{screen:'Actions',action:'water'},sound:false},trigger:{type:Notifications.SchedulableTriggerInputTypes.DAILY,hour:h,minute:0}});
 await AsyncStorage.setItem(REMINDER_KEY,JSON.stringify(r));
 return true;
}
