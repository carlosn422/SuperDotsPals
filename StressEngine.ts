// Personal, baseline-relative stress estimate from the user's own Apple Health readings.
// It is a wellness signal, not a diagnosis: lower HRV and higher resting heart rate than
// the person's recent norm push the score up; higher HRV and lower resting HR pull it down.

export type StressLevel='great'|'normal'|'elevated'|'overload';
export type ScoredReading={metric:string;value:number;recorded_at:string;source?:string};

export const STRESS_LEVELS:Record<StressLevel,{label:string;color:string;tint:string;mascot:string;summary:string}>={
 great:{label:'Great',color:'#4DBB7F',tint:'#E4F6EA',mascot:'calm',summary:'Your body signals look relaxed compared with your usual.'},
 normal:{label:'Normal',color:'#8A9BEF',tint:'#EEF1FD',mascot:'joy',summary:'Your signals are close to your personal baseline.'},
 elevated:{label:'Elevated',color:'#F2A56F',tint:'#FFF1E6',mascot:'anxious',summary:'Your HRV is lower than your usual. A short break could help.'},
 overload:{label:'Overload',color:'#EE6F86',tint:'#FFE9EC',mascot:'angry',summary:'Your signals are well outside your usual range. Try to pause and breathe.'}
};
export const LEVEL_ORDER:StressLevel[]=['overload','elevated','normal','great'];
export const BASELINE_DAYS=21,MIN_BASELINE_SAMPLES=8,MIN_BASELINE_DAYS=3;

export function levelFor(score:number):StressLevel{
 if(score<35)return 'great';
 if(score<60)return 'normal';
 if(score<80)return 'elevated';
 return 'overload';
}
export function median(values:number[]){
 const x=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!x.length)return null;
 const m=Math.floor(x.length/2);
 return x.length%2?x[m]:(x[m-1]+x[m])/2;
}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const time=(r:ScoredReading)=>new Date(r.recorded_at).getTime();

function baselineFor(series:ScoredReading[],at:number){
 const window=series.filter(r=>{const t=time(r);return t<at&&t>=at-BASELINE_DAYS*86400000});
 const days=new Set(window.map(r=>new Date(r.recorded_at).toDateString())).size;
 if(window.length<MIN_BASELINE_SAMPLES||days<MIN_BASELINE_DAYS)return null;
 return median(window.map(r=>r.value));
}

export function scoreFromSignals(hrv:number,hrvBaseline:number,rhr?:number|null,rhrBaseline?:number|null){
 const hrvPart=clamp((1-hrv/hrvBaseline)/0.5,-1,1);
 const rhrPart=rhr&&rhrBaseline?clamp((rhr-rhrBaseline)/(0.15*rhrBaseline),-1,1):0;
 return Math.round(clamp(50+40*hrvPart+10*rhrPart,0,100));
}

export type StressPoint={at:string;score:number;level:StressLevel;hrv:number;sourceKey?:string};

// Score every HRV sample against the 21 days of HRV (and resting HR) that preceded it.
export function computeStressPoints(readings:ScoredReading[]):StressPoint[]{
 const hrv=readings.filter(r=>r.metric==='hrv'&&r.value>0&&Number.isFinite(time(r))).sort((a,b)=>time(a)-time(b));
 const rhr=readings.filter(r=>r.metric==='resting_heart_rate'&&r.value>0&&Number.isFinite(time(r))).sort((a,b)=>time(a)-time(b));
 const points:StressPoint[]=[];
 for(const r of hrv){
  const at=time(r);
  const base=baselineFor(hrv,at);
  if(!base)continue;
  const recentRhr=[...rhr].reverse().find(x=>time(x)<=at&&time(x)>=at-36*3600000);
  const rhrBase=recentRhr?median(rhr.filter(x=>time(x)<time(recentRhr)&&time(x)>=at-BASELINE_DAYS*86400000).map(x=>x.value)):null;
  const score=scoreFromSignals(r.value,base,recentRhr?.value,rhrBase);
  points.push({at:r.recorded_at,score,level:levelFor(score),hrv:r.value});
 }
 return points;
}

export function baselineStatus(readings:ScoredReading[]){
 const cutoff=Date.now()-BASELINE_DAYS*86400000;
 const hrv=readings.filter(r=>r.metric==='hrv'&&r.value>0&&time(r)>=cutoff);
 const days=new Set(hrv.map(r=>new Date(r.recorded_at).toDateString())).size;
 return {samples:hrv.length,days,ready:hrv.length>=MIN_BASELINE_SAMPLES&&days>=MIN_BASELINE_DAYS,baseline:median(hrv.map(r=>r.value))};
}

export function sameDay(a:Date,b:Date){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}

// Today's score is the median of today's scored samples (falls back to the latest within 24h).
export function dailyStress(points:StressPoint[],day=new Date()){
 const today=points.filter(p=>sameDay(new Date(p.at),day));
 if(today.length){const score=Math.round(median(today.map(p=>p.score))!);return {score,level:levelFor(score),updated:today[today.length-1].at,count:today.length};}
 const last=points[points.length-1];
 if(last&&Date.now()-new Date(last.at).getTime()<24*3600000)return {score:last.score,level:last.level,updated:last.at,count:1};
 return null;
}

export function levelDistribution(points:StressPoint[]){
 const counts:Record<StressLevel,number>={great:0,normal:0,elevated:0,overload:0};
 points.forEach(p=>{counts[p.level]++});
 const total=points.length||1;
 return LEVEL_ORDER.map(level=>({level,count:counts[level],share:counts[level]/total}));
}

export type SleepQuality='Great'|'Good'|'Fair'|'Short';
export function sleepQuality(minutes:number,awakeMinutes=0):SleepQuality{
 const awakeShare=minutes>0?awakeMinutes/(minutes+awakeMinutes):0;
 if(minutes>=420&&awakeShare<0.1)return 'Great';
 if(minutes>=360)return 'Good';
 if(minutes>=300)return 'Fair';
 return 'Short';
}
export function noiseLabel(db:number){return db<70?'Normal':db<80?'Loud':'High'}
export function formatMinutes(total:number){const h=Math.floor(total/60),m=Math.round(total%60);return {h,m}}

// Energy (0-100): how charged you are today, from last night's sleep, today's stress and activity load.
export function energyScore({sleepMinutes,stress,activeKcal}:{sleepMinutes:number|null;stress:number|null;activeKcal:number|null}){
 if(sleepMinutes===null&&stress===null)return null;
 const sleepPart=sleepMinutes===null?0.6:Math.min(1,sleepMinutes/480);
 const calmPart=stress===null?0.6:1-stress/100;
 const drain=activeKcal===null?0:Math.min(0.25,activeKcal/2400);
 return Math.round(Math.max(0,Math.min(100,100*(0.55*sleepPart+0.45*calmPart-drain))));
}
export function energyLabel(score:number){return score>=75?'Charged':score>=50?'Steady':score>=30?'Low':'Drained'}
