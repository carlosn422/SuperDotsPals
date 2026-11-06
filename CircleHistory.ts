import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import type {CircleStore} from './CircleStore';
import {CIRCLE_MOODS,CircleMood,ReactionNotice,ReceivedSignal,SignalId} from './LittleSignalsData';

// Calendar history for Circle. Days are local calendar days ("YYYY-MM-DD"); boundaries come from the Date constructor so DST is handled.
export const dayKey=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export const fromKey=(k:string)=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d);};
export const addDays=(k:string,n:number)=>{const d=fromKey(k);return dayKey(new Date(d.getFullYear(),d.getMonth(),d.getDate()+n));};
export const todayKey=()=>dayKey(new Date());
export const keyOf=(iso:string)=>dayKey(new Date(iso));
export const dayRange=(k:string)=>({start:fromKey(k).getTime(),end:fromKey(addDays(k,1)).getTime()});
export const longDate=(k:string)=>fromKey(k).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
export const shortDate=(k:string)=>fromKey(k).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

type Sent={friendIds:string[];signal:SignalId;at:string};
export type HistoryDay={inbox:ReactionNotice[];signals:ReceivedSignal[];sent:Sent[]};
const EMPTY:HistoryDay={inbox:[],signals:[],sent:[]};
const asMood=(m:string)=>(CIRCLE_MOODS.includes(m as CircleMood)?m:'Calm') as CircleMood;
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}};
const uidNow=async()=>(await supabase.auth.getSession()).data.session?.user.id||'';
const dayCache=new Map<string,HistoryDay>();
const monthCache=new Map<string,{at:number;days:string[]}>();

// Reactions to my moods and Little Signals on one day. Friends' moods aren't fetched: they're only visible for 24 h and the store already has them.
async function fetchDay(k:string):Promise<HistoryDay>{
 const uid=await uidNow();if(!uid)return EMPTY;
 const ck=uid+'|'+k;const settled=k<addDays(todayKey(),-1);
 if(settled&&dayCache.has(ck))return dayCache.get(ck)!;
 const {start,end}=dayRange(k);const a=new Date(start).toISOString(),b=new Date(end).toISOString();
 const [r,s]=await Promise.all([
  supabase.rpc('circle_reaction_history',{p_start:a,p_end:b,p_limit:200}),
  supabase.from('circle_signals').select('id,sender_id,recipient_id,signal,sent_at,seen_at').or('sender_id.eq.'+uid+',recipient_id.eq.'+uid).gte('sent_at',a).lt('sent_at',b).order('sent_at',{ascending:false}).limit(200),
 ]);
 if(r.error)throw r.error;if(s.error)throw s.error;
 const day:HistoryDay={
  inbox:((r.data||[]) as any[]).map(n=>({id:n.id,moodId:n.shared_mood_id,mood:asMood(n.mood),friendId:n.reactor_id,name:n.reactor_name,emoji:n.emoji,at:n.reacted_at,read:!!n.read_at,style:n.style,sharedAt:n.shared_at})),
  signals:((s.data||[]) as any[]).filter(x=>x.recipient_id===uid).map(x=>({id:x.id,friendId:x.sender_id,signal:x.signal,at:x.sent_at,seen:!!x.seen_at})),
  sent:((s.data||[]) as any[]).filter(x=>x.sender_id===uid).map(x=>({friendIds:[x.recipient_id],signal:x.signal,at:x.sent_at})),
 };
 if(settled)dayCache.set(ck,day);
 return day;
}

// Loads one day (or nothing for undefined); ignores results that arrive after the day changed.
export function useHistoryDay(store:CircleStore,k?:string){
 const [state,setState]=useState<{key?:string;data?:HistoryDay;error?:boolean}>({});
 const [tick,setTick]=useState(0);const token=useRef(0);
 useEffect(()=>{
  const t=++token.current;
  if(!k||!store.live){setState({key:k,data:EMPTY});return;}
  setState(s=>s.key===k?s:{key:k});
  fetchDay(k).then(data=>{if(t===token.current)setState({key:k,data})},()=>{if(t===token.current)setState({key:k,error:true})});
 },[k,store.live,tick]);
 const ready=state.key===k;
 return {data:ready?state.data:undefined,loading:!!k&&(!ready||(!state.data&&!state.error)),error:ready&&!!state.error,retry:()=>setTick(x=>x+1)};
}

// Local days in a month with activity the caller may see (dates only). Month = first day key of that month.
export function useActivityDays(store:CircleStore,month:string,enabled:boolean){
 const [state,setState]=useState<{month?:string;days:string[];error?:boolean}>({days:[]});const token=useRef(0);
 useEffect(()=>{
  if(!enabled)return;const t=++token.current;
  const local=recentKeys(store).filter(d=>d.slice(0,7)===month.slice(0,7));
  if(!store.live){setState({month,days:local});return;}
  void (async()=>{
   const uid=await uidNow();const ck=uid+'|'+month;const hit=monthCache.get(ck);
   if(hit&&Date.now()-hit.at<60000){if(t===token.current)setState({month,days:Array.from(new Set([...hit.days,...local]))});return;}
   const m=fromKey(month);const a=new Date(m.getFullYear(),m.getMonth(),1),b=new Date(m.getFullYear(),m.getMonth()+1,1);
   const r=await supabase.rpc('circle_activity_days',{p_start:a.toISOString(),p_end:b.toISOString(),p_tz:tz()});
   if(t!==token.current)return;
   if(r.error){setState({month,days:local,error:true});return;}
   const days=((r.data||[]) as any[]).map(d=>String(d).slice(0,10));monthCache.set(ck,{at:Date.now(),days});
   setState({month,days:Array.from(new Set([...days,...local]))});
  })().catch(()=>{if(t===token.current)setState({month,days:local,error:true})});
 },[month,enabled,store.live]);
 return {days:state.month===month?state.days:[],loading:enabled&&state.month!==month,error:state.month===month&&!!state.error};
}

function recentKeys(store:CircleStore){
 const now=Date.now();
 return Array.from(new Set([...store.friendMoods.filter(m=>new Date(m.expiresAt).getTime()>now).map(m=>m.sharedAt),...store.inbox.map(n=>n.at),...store.signals.map(s=>s.at),...store.sentSignals.map(s=>s.at)].map(keyOf)));
}

// The store with extra history merged in (deduplicated; the store's own copy wins so read state stays current).
export function withHistory(store:CircleStore,days:(HistoryDay|undefined)[]):CircleStore{
 const list=days.filter(Boolean) as HistoryDay[];if(!list.length)return store;
 const inboxIds=new Set(store.inbox.map(n=>n.id)),sigIds=new Set(store.signals.map(s=>s.id));
 const sentKey=(s:Sent)=>s.at+'|'+s.signal+'|'+s.friendIds.join(',');const sentKeys=new Set(store.sentSignals.map(sentKey));
 const inbox=[...store.inbox],signals=[...store.signals],sentSignals=[...store.sentSignals];
 list.forEach(d=>{
  d.inbox.forEach(n=>{if(!inboxIds.has(n.id)){inboxIds.add(n.id);inbox.push(n)}});
  d.signals.forEach(s=>{if(!sigIds.has(s.id)){sigIds.add(s.id);signals.push(s)}});
  d.sent.forEach(s=>{const k=sentKey(s);if(!sentKeys.has(k)){sentKeys.add(k);sentSignals.push(s)}});
 });
 return {...store,inbox,signals,sentSignals};
}
