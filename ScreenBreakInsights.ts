// Screen Break session history math. Durations are seconds; timestamps are UTC ISO strings from Supabase,
// and day/week/month/year boundaries use this iPhone's local calendar (DST-safe: built from calendar fields).
export type BreakPeriod='day'|'week'|'month'|'year';
export type SessionRow={id:string;child_id:string;family_device_id?:string|null;started_at:string;deadline_at:string;ended_at:string|null;granted_seconds:number;status:'active'|'restricted'|'released'|'canceled';version:number};
export type Range={start:Date;end:Date};
export type Bucket={label:string;seconds:number;start:Date};
export type PeriodStats={range:Range;previous:Range;seconds:number;previousSeconds:number;previousHasData:boolean;sessions:number;completed:number;grantedSeconds:number;dailyAverage:number;days:number;buckets:Bucket[];highest:Bucket|null;hasData:boolean};

const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function startOfDay(d:Date){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
export function addDays(d:Date,n:number){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,d.getHours(),d.getMinutes(),d.getSeconds())}

/** Calendar period containing `anchor`, shifted by `offset` periods (-1 = the one before). Weeks start on Monday. */
export function periodRange(period:BreakPeriod,anchor:Date,offset=0):Range{
 const y=anchor.getFullYear(),m=anchor.getMonth(),d=anchor.getDate();
 if(period==='day')return {start:new Date(y,m,d+offset),end:new Date(y,m,d+offset+1)};
 if(period==='week'){const monday=d-((anchor.getDay()+6)%7)+offset*7;return {start:new Date(y,m,monday),end:new Date(y,m,monday+7)}}
 if(period==='month')return {start:new Date(y,m+offset,1),end:new Date(y,m+offset+1,1)};
 return {start:new Date(y+offset,0,1),end:new Date(y+offset+1,0,1)};
}

/** Time actually inside a session: from start until it ended early, was canceled or reached its deadline; never after it ended. */
export function sessionInterval(s:SessionRow,now=new Date()):[number,number]|null{
 const start=Date.parse(s.started_at),deadline=Date.parse(s.deadline_at);
 if(!Number.isFinite(start)||!Number.isFinite(deadline)||deadline<=start)return null;
 let end=deadline;
 if(s.ended_at){const e=Date.parse(s.ended_at);if(Number.isFinite(e))end=Math.min(end,e)}
 if(s.status==='active')end=Math.min(end,now.getTime());
 return end>start?[start,end]:null;
}

/** Newest version of each session id, so retried or re-synced snapshots count once. */
export function latestVersions(rows:SessionRow[]):SessionRow[]{
 const by=new Map<string,SessionRow>();
 for(const r of rows){const old=by.get(r.id);if(!old||r.version>old.version)by.set(r.id,r)}
 return [...by.values()];
}

/** Union of overlapping intervals, so overlapping sessions of one child are not double-counted. */
export function mergeIntervals(list:[number,number][]):[number,number][]{
 const sorted=[...list].sort((a,b)=>a[0]-b[0]),out:[number,number][]=[];
 for(const [s,e] of sorted){const last=out[out.length-1];if(last&&s<=last[1])last[1]=Math.max(last[1],e);else out.push([s,e])}
 return out;
}

function overlap(list:[number,number][],start:number,end:number){
 let total=0;for(const [s,e] of list){const a=Math.max(s,start),b=Math.min(e,end);if(b>a)total+=b-a}
 return total/1000;
}

/** Calendar days in a range (23- and 25-hour DST days count as one day each). */
export function dayCount(start:Date,end:Date){let n=0;for(let d=startOfDay(start);d<end;d=addDays(d,1))n++;return n}

function bucketsFor(period:BreakPeriod,range:Range):Bucket[]{
 const {start,end}=range,y=start.getFullYear(),m=start.getMonth(),d=start.getDate(),out:Bucket[]=[];
 if(period==='day'){for(let h=0;h<24;h++)out.push({label:h%6===0?(h===0?'12a':h<12?h+'a':h===12?'12p':(h-12)+'p'):'',seconds:0,start:new Date(y,m,d,h)});return out}
 if(period==='week'){for(let i=0;i<7;i++)out.push({label:WEEKDAYS[i],seconds:0,start:new Date(y,m,d+i)});return out}
 if(period==='month'){for(let i=0;new Date(y,m,1+i*7)<end;i++)out.push({label:'Wk '+(i+1),seconds:0,start:new Date(y,m,1+i*7)});return out}
 for(let i=0;i<12;i++)out.push({label:MONTHS[i],seconds:0,start:new Date(y,i,1)});
 return out;
}

/** Recorded Screen Break time for one child in a calendar period, split by hour/day/week/month across boundaries. */
export function periodStats(rows:SessionRow[],period:BreakPeriod,anchor:Date,now=new Date()):PeriodStats{
 const range=periodRange(period,anchor),previous=periodRange(period,anchor,-1);
 const sessions=latestVersions(rows);
 const intervals=mergeIntervals(sessions.map(s=>sessionInterval(s,now)).filter((x):x is [number,number]=>!!x));
 const s0=range.start.getTime(),e0=range.end.getTime();
 const buckets=bucketsFor(period,range);
 buckets.forEach((b,i)=>{const next=i+1<buckets.length?buckets[i+1].start.getTime():e0;b.seconds=overlap(intervals,b.start.getTime(),next)});
 const seconds=overlap(intervals,s0,e0);
 const previousSeconds=overlap(intervals,previous.start.getTime(),previous.end.getTime());
 const startedIn=sessions.filter(s=>{const t=Date.parse(s.started_at);return t>=s0&&t<e0});
 const previousHasData=sessions.some(s=>{const t=Date.parse(s.started_at);return t>=previous.start.getTime()&&t<previous.end.getTime()});
 // The current period is averaged over the days so far; past periods over all their days.
 const days=dayCount(range.start,now<range.end?new Date(Math.max(now.getTime(),s0+1)):range.end);
 const highest=buckets.reduce<Bucket|null>((best,b)=>b.seconds>0&&(!best||b.seconds>best.seconds)?b:best,null);
 return {range,previous,seconds,previousSeconds,previousHasData,sessions:startedIn.length,completed:startedIn.filter(s=>s.status!=='active').length,
  grantedSeconds:startedIn.reduce((n,s)=>n+s.granted_seconds,0),dailyAverage:days?seconds/days:0,days,buckets,highest,hasData:seconds>0||startedIn.length>0};
}

export function formatDuration(seconds:number){
 const minutes=Math.round(Math.max(0,seconds)/60);
 if(minutes<60)return minutes+'m';
 return Math.floor(minutes/60)+'h'+(minutes%60?' '+(minutes%60)+'m':'');
}

export function comparison(stats:PeriodStats):{text:string;diff:number}|null{
 if(!stats.previousHasData)return null;
 const diff=stats.seconds-stats.previousSeconds;
 const pct=stats.previousSeconds>0?Math.round(Math.abs(diff)/stats.previousSeconds*100):null;
 return {diff,text:(diff>=0?'+':'−')+formatDuration(Math.abs(diff))+(pct!==null?' ('+pct+'%)':'')};
}

const PREVIOUS:Record<BreakPeriod,string>={day:'yesterday',week:'last week',month:'last month',year:'last year'};
const THIS:Record<BreakPeriod,string>={day:'today',week:'this week',month:'this month',year:'this year'};

/** Plain factual observations from recorded sessions only (no health claims). */
export function observations(stats:PeriodStats,period:BreakPeriod):string[]{
 const out:string[]=[];
 const c=comparison(stats);
 if(c&&Math.abs(c.diff)>=60)out.push('Screen Break sessions totaled '+formatDuration(Math.abs(c.diff))+(c.diff<0?' less':' more')+' than '+PREVIOUS[period]+'.');
 if(stats.highest&&period!=='day'){
  const name=period==='week'?stats.highest.start.toLocaleDateString(undefined,{weekday:'long'}):period==='month'?'Week '+stats.highest.label.replace('Wk ',''):stats.highest.start.toLocaleDateString(undefined,{month:'long'});
  out.push(name+' had the longest recorded sessions.');
 }
 if(stats.sessions>0)out.push('You scheduled '+stats.sessions+' Screen Break session'+(stats.sessions===1?'':'s')+' '+THIS[period]+'.');
 return out;
}
