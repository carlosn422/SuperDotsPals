import type {SocialMark} from './modules/watch-link/socialTrack';
import type {StressPoint} from './StressEngine';
import {median} from './StressEngine';
import {moodLabel} from './LittleSignalsData';

// Lines up the owner's app use (15-minute marks) with HRV stress scores and logged moods in the 2 hours after.
// These are patterns, not causes: HRV also moves with sleep, exercise, caffeine and illness.
export const AFTER_MS=2*3600e3;
export const LOOKBACK_DAYS=30;
export const MIN_DAYS=3,MIN_AFTER_POINTS=4,CLEAR_CHANGE=8;

export type MoodEntry={mood:string;occurred_at:string};
export type AppInsight={app:number;todayMinutes:number;periodMinutes:number;days:number;afterPoints:number;
 stressAfter?:number;stressUsual?:number;delta?:number;hrvAfter?:number;hrvUsual?:number;topMood?:string;moodCount:number;learning:boolean};
export type DayUse={start:number;minutes:number;stress:number|null};

const dayStart=(ms:number)=>{const d=new Date(ms);d.setHours(0,0,0,0);return d.getTime()};
/** Local midnight `n` days before `ms`'s day; calendar-based so daylight-saving days stay aligned. */
const daysBefore=(ms:number,n:number)=>{const d=new Date(ms);d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return d.getTime()};
const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:undefined;

/** The owner's minutes per app per day (15-minute steps). Marks are cumulative for the day, so each owner
 * mark adds only its step over the previous mark; steps reached during a family timer aren't counted. */
export function minutesByDay(marks:SocialMark[]){
 const days=new Map<number,Map<number,number>>(),last=new Map<string,number>();
 for(const m of [...marks].sort((a,b)=>a.at-b.at)){
  const d=dayStart(m.at),key=`${d}:${m.app}`,prev=last.get(key)??0;
  if(m.minutes<=prev)continue;
  last.set(key,m.minutes);
  if(m.family)continue;
  const apps=days.get(d)??new Map<number,number>();apps.set(m.app,(apps.get(m.app)??0)+m.minutes-prev);days.set(d,apps);
 }
 return days;
}

export function appInsights(marks:SocialMark[],points:StressPoint[],moods:MoodEntry[],now=Date.now()):AppInsight[]{
 const since=daysBefore(now,LOOKBACK_DAYS-1);
 const all=marks.filter(m=>m.at>=since),recent=all.filter(m=>!m.family);
 const pts=points.map(p=>({t:Date.parse(p.at),score:p.score,hrv:p.hrv})).filter(p=>Number.isFinite(p.t)&&p.t>=since&&p.t<=now);
 const usual=median(pts.map(p=>p.score))??NaN;
 const hrvUsual=median(pts.map(p=>p.hrv).filter((h):h is number=>typeof h==='number'&&h>0))??NaN;
 const moodTimes=moods.map(m=>({t:Date.parse(m.occurred_at),mood:moodLabel(m.mood)})).filter(m=>Number.isFinite(m.t)&&m.t>=since);
 const byDay=minutesByDay(all),today=dayStart(now);
 const apps=[...new Set(recent.map(m=>m.app))];
 return apps.map(app=>{
  const own=recent.filter(m=>m.app===app);
  const inWindow=(t:number)=>own.some(m=>t>m.at&&t<=m.at+AFTER_MS);
  const after=pts.filter(p=>inWindow(p.t));
  const afterMoods=moodTimes.filter(m=>inWindow(m.t));
  const counts=new Map<string,number>();afterMoods.forEach(m=>counts.set(m.mood,(counts.get(m.mood)??0)+1));
  const topMood=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  let periodMinutes=0,days=0;
  byDay.forEach(a=>{const n=a.get(app);if(n){periodMinutes+=n;days++}});
  const stressAfter=avg(after.map(p=>p.score));
  const hrvAfter=avg(after.map(p=>p.hrv).filter((h):h is number=>typeof h==='number'&&h>0));
  const learning=days<MIN_DAYS||after.length<MIN_AFTER_POINTS||!Number.isFinite(usual);
  return {app,todayMinutes:byDay.get(today)?.get(app)??0,periodMinutes,days,afterPoints:after.length,
   stressAfter,stressUsual:Number.isFinite(usual)?usual:undefined,delta:!learning&&stressAfter!==undefined?Math.round(stressAfter-usual):undefined,
   hrvAfter,hrvUsual:Number.isFinite(hrvUsual)?hrvUsual:undefined,topMood,moodCount:afterMoods.length,learning};
 }).sort((a,b)=>b.periodMinutes-a.periodMinutes);
}

/** Last 7 days: tracked minutes (all apps) and average stress score that day. */
export function weekUse(marks:SocialMark[],points:StressPoint[],now=Date.now()):DayUse[]{
 const byDay=minutesByDay(marks);
 return Array.from({length:7},(_,i)=>{
  const start=daysBefore(now,6-i),end=daysBefore(now,5-i);
  let minutes=0;byDay.get(start)?.forEach(n=>{minutes+=n});
  const scores=points.map(p=>({t:Date.parse(p.at),s:p.score})).filter(p=>p.t>=start&&p.t<end).map(p=>p.s);
  const a=avg(scores);
  return {start,minutes,stress:a===undefined?null:Math.round(a)};
 });
}

export function insightLine(i:AppInsight){
 if(i.learning)return 'Still learning: needs a few more days of use and HRV readings.';
 if(i.delta===undefined)return '';
 if(i.delta>=CLEAR_CHANGE)return `Stress higher than usual in the 2 hours after use (+${i.delta}).`;
 if(i.delta<=-CLEAR_CHANGE)return `Stress lower than usual in the 2 hours after use (${i.delta}).`;
 return 'No clear change in stress after use.';
}

export const formatMins=(n:number)=>n>=60?`${Math.floor(n/60)}h${n%60?` ${n%60}m`:''}`:`${n} min`;
