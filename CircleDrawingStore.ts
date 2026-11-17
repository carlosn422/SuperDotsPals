import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import {SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL,supabase} from './supabase';
import {publishDrawingSnapshot} from './WidgetBridge';
import {endDrawingLiveActivities,onLiveToken,showDrawingLiveActivity} from './modules/drawing-live';
import {packCanvas} from './supabase/functions/drawing-live-push/pack';

// Shared canvases for Circle groups (see supabase/migrations/20261129_circle_drawing.sql).
// Only the latest canvas of each group exists; strokes are vectors on a CANVAS x CANVAS square.
export const CANVAS=1000;
export type Brush='pen'|'marker'|'pencil'|'highlighter';
// f: the saved stroke this piece was left from after erasing (only sent when publishing).
export type Stroke={id:string;u?:string;f?:string;b:Brush;c:string;w:number;p:number[]};
export type CanvasMember={id:string;name:string;color:string;owner:boolean};
export type CircleCanvas={groupId:string;name:string;icon:string;color:string;ownerId:string;isOwner:boolean;version:number;updatedAt:string|null;updatedBy:string|null;isWidget:boolean;members:CanvasMember[]};
export type CanvasData={background:string;strokes:Stroke[];version:number};
// What one person changed in a drawing session, applied on top of the latest canvas.
export type CanvasDiff={remove:string[];add:Stroke[];background?:string};

export const FREE_COLORS=['#1C2B33','#E5484D','#F59E0B','#34B37E','#3B82F6','#8B5CF6'];
export const PLUS_COLORS=['#000000','#6E7D86','#FFFFFF','#B42318','#FB7185','#F472B6','#F97316','#FACC15','#A3E635','#14B8A6','#0EA5E9','#1E3A8A','#7C3AED','#92400E'];
export const BACKGROUNDS=['#FFFFFF','#FFF7E6','#FDECEF','#E4F6EA','#E6F0FF','#F1EAFE','#FFF3C4','#1D2B33'];
export const FREE_WIDTH=10;
export const FREE_PUBLISHES=5;
export const WIDTHS=[3,6,10,16,24,36];
export const BRUSHES:{id:Brush;label:string;icon:string;width:number;opacity:number}[]=[
 {id:'pen',label:'Pen',icon:'pen',width:FREE_WIDTH,opacity:1},
 {id:'marker',label:'Marker',icon:'marker',width:22,opacity:.9},
 {id:'pencil',label:'Pencil',icon:'pencil-outline',width:5,opacity:.6},
 {id:'highlighter',label:'Highlighter',icon:'format-color-highlight',width:34,opacity:.35},
];
export const brushOpacity=(b:Brush)=>BRUSHES.find(x=>x.id===b)?.opacity??1;
export const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export const EMPTY_DIFF:CanvasDiff={remove:[],add:[]};
export const diffIsEmpty=(d:CanvasDiff)=>!d.remove.length&&!d.add.length&&!d.background;

export function applyDiffs(c:CanvasData|undefined,diffs:CanvasDiff[]):CanvasData{
 let out:CanvasData=c||{background:'#FFFFFF',strokes:[],version:0};
 for(const d of diffs){
  const removed=new Set(d.remove);
  const kept=out.strokes.filter(s=>!removed.has(s.id));
  const have=new Set(kept.map(s=>s.id));
  out={...out,background:d.background||out.background,strokes:[...kept,...d.add.filter(s=>!have.has(s.id))]};
 }
 return out;
}

type State={me:string|null;canvases:CircleCanvas[];loaded:boolean;data:Record<string,CanvasData>;publishesLeft:number|null};
let state:State={me:null,canvases:[],loaded:false,data:{},publishesLeft:FREE_PUBLISHES};
const listeners=new Set<()=>void>();
function update(p:Partial<State>){state={...state,...p};listeners.forEach(l=>l());}
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l)}};
export function useCircleDrawing(){return useSyncExternalStore(subscribe,()=>state);}

function toCanvas(r:any):CircleCanvas{
 return {groupId:r.group_id,name:r.name,icon:r.icon||'people',color:r.color||'#3BA986',ownerId:r.owner_id,isOwner:!!r.is_owner,version:Number(r.version)||0,
  updatedAt:r.updated_at,updatedBy:r.updated_by,isWidget:!!r.is_widget,members:Array.isArray(r.members)?r.members:[]};
}

export async function refreshCircleDrawing(){
 const {data:{session}}=await supabase.auth.getSession();
 const me=session?.user.id||null;
 if(me!==state.me){update({me,canvases:[],loaded:false,data:{},publishesLeft:FREE_PUBLISHES});published='';}
 if(!me){publishDrawingSnapshot(null,null);watchWidget(null);return;}
 const [list,left]=await Promise.all([supabase.rpc('circle_canvas_list'),supabase.rpc('circle_drawing_publishes_left')]);
 if(list.error){console.warn('Circle drawing refresh failed',list.error.message);return;}
 const canvases=(list.data||[]).map(toCanvas);
 const ids=new Set(canvases.map((c:CircleCanvas)=>c.groupId));
 const listed=new Map<string,number>(canvases.map((c:CircleCanvas)=>[c.groupId,c.version] as [string,number]));
 update({canvases,loaded:true,data:Object.fromEntries(Object.entries(state.data).filter(([id,d])=>ids.has(id)&&d.version<=(listed.get(id)??0))),publishesLeft:left.error?state.publishesLeft:(left.data as number|null)});
 await publishWidget();
}

export async function loadCanvas(groupId:string){
 const {data,error}=await supabase.from('circle_group_canvas').select('background,strokes,version').eq('group_id',groupId).maybeSingle();
 if(error||!data)return null;
 const c:CanvasData={background:data.background,strokes:Array.isArray(data.strokes)?data.strokes:[],version:Number(data.version)||0};
 const cur=state.data[groupId];
 if(!cur||cur.version<=c.version)update({data:{...state.data,[groupId]:c}});
 return c;
}

// One publish = one drawing session shared with the group (Done). Returns an error message or null.
export async function publishCanvas(groupId:string,diff:CanvasDiff):Promise<string|null>{
 const {data,error}=await supabase.rpc('circle_canvas_publish',{p_group:groupId,p_remove:diff.remove,p_add:diff.add,p_background:diff.background??null});
 if(error)return error.message;
 update({publishesLeft:data as number|null});
 pushLockScreens(groupId);
 await loadCanvas(groupId);
 void refreshCircleDrawing();
 return null;
}
const rpc=async(fn:string,args:Record<string,unknown>)=>{const {error}=await supabase.rpc(fn,args);if(error)throw error;await refreshCircleDrawing();};
export const setCanvasEnabled=(groupId:string,on:boolean)=>rpc('circle_canvas_enable',{p_group:groupId,p_on:on});
export const clearCanvas=async(groupId:string)=>{await rpc('circle_canvas_clear',{p_group:groupId});pushLockScreens(groupId);await loadCanvas(groupId);};
// Shows the new drawing on the Lock Screen of members who picked this Circle (Live Activity push).
const pushLockScreens=(groupId:string)=>void supabase.functions.invoke('drawing-live-push',{body:{group:groupId}}).catch(()=>{});

// Sends this phone's Live Activity tokens to the server; remembered so sign-out can remove them.
export const LIVE_TOKENS_KEY='circleDrawing.liveTokens';
async function registerLiveToken(t:{kind:string;token:string;activity?:string;group?:string}){
 const {data}=await supabase.auth.getSession();if(!data.session)return;
 const {error}=await supabase.rpc('circle_drawing_live_register',{p_token:t.token,p_kind:t.kind,p_activity:t.activity??null,p_group:t.group??null,p_env:__DEV__?'sandbox':'production'});
 if(error)return;
 const list:string[]=JSON.parse(await AsyncStorage.getItem(LIVE_TOKENS_KEY).catch(()=>null)||'[]');
 if(!list.includes(t.token))await AsyncStorage.setItem(LIVE_TOKENS_KEY,JSON.stringify([t.token,...list].slice(0,10))).catch(()=>{});
}
export const leaveGroup=(groupId:string)=>rpc('circle_group_leave',{p_group:groupId});
export const setWidgetCanvas=(groupId:string|null)=>rpc('circle_drawing_set_widget',{p_group:groupId});

async function widgetAuth(me:string){
 const key='circleDrawingWidgetToken:'+me;
 let token=await AsyncStorage.getItem(key).catch(()=>null);
 if(!token){
  const {data,error}=await supabase.rpc('circle_drawing_widget_token');
  if(error||!data)return null;
  token=data as string;await AsyncStorage.setItem(key,token).catch(()=>{});
 }
 return {url:SUPABASE_URL,key:SUPABASE_PUBLISHABLE_KEY,token};
}

// One shared Realtime channel per canvas topic (supabase.channel reuses topics), with listeners counted.
type Listener=(event:string,payload:any)=>void;
const channels:Record<string,{ch:ReturnType<typeof supabase.channel>;listeners:Set<Listener>}>={};
export function listenDrawing(groupId:string,fn:Listener){
 let e=channels[groupId];
 if(!e){
  const listeners=new Set<Listener>();
  const ch=supabase.channel('drawing:'+groupId,{config:{private:true}});
  for(const ev of ['canvas','draft','leave'])ch.on('broadcast',{event:ev},({payload})=>listeners.forEach(f=>f(ev,payload)));
  ch.subscribe();
  e=channels[groupId]={ch,listeners};
 }
 const entry=e;entry.listeners.add(fn);
 return()=>{entry.listeners.delete(fn);if(!entry.listeners.size&&channels[groupId]===entry){delete channels[groupId];void supabase.removeChannel(entry.ch);}};
}
export function sendDrawing(groupId:string,event:string,payload:unknown){void channels[groupId]?.ch.send({type:'broadcast',event,payload});}

// Live version announcements for the Circle shown in my widget, so it refreshes as soon as anyone publishes.
let widgetGroup:string|null=null;let unwatch:(()=>void)|null=null;
function watchWidget(groupId:string|null){
 if(groupId===widgetGroup)return;
 unwatch?.();unwatch=null;widgetGroup=groupId;
 if(groupId)unwatch=listenDrawing(groupId,ev=>{if(ev==='canvas')void loadCanvas(groupId).then(()=>publishWidget())});
}

let published='';
async function publishWidget(){
 const me=state.me;if(!me)return;
 const sel=state.canvases.find(c=>c.isWidget);
 watchWidget(sel?.groupId||null);
 let c=sel?state.data[sel.groupId]:undefined;
 if(sel&&(!c||c.version<sel.version))c=(await loadCanvas(sel.groupId))||c;
 const auth=await widgetAuth(me);
 const sig=me+'|'+(sel&&c?sel.groupId+':'+c.version:'off')+'|'+!!auth;
 if(sig===published)return;published=sig;
 publishDrawingSnapshot(sel&&c?{groupId:sel.groupId,background:c.background,version:c.version,strokes:c.strokes.map(({b,c:color,w,p})=>({b,c:color,w,p}))}:null,auth);
 if(sel&&c)showDrawingLiveActivity(sel.groupId,packCanvas(c.strokes,c.background,c.version));else void endDrawingLiveActivities();
}

let started=false;
// Keeps the canvas list and the widget up to date while the app runs.
export function startCircleDrawingSync(){
 if(started)return()=>{};started=true;
 let t:ReturnType<typeof setTimeout>|undefined;
 const soon=()=>{if(t)clearTimeout(t);t=setTimeout(()=>void refreshCircleDrawing(),300);};
 soon();
 const auth=supabase.auth.onAuthStateChange((_e,session)=>{
  // Clear the widget right away on sign-out; the deferred refresh may never run.
  if(!session){published='';publishDrawingSnapshot(null,null);void endDrawingLiveActivities();watchWidget(null);}
  soon();
 });
 const app=AppState.addEventListener('change',s=>{if(s==='active')soon();});
 let tokens:{kind:string;token:string;activity?:string;group?:string}[]=[];
 const live=onLiveToken(tk=>{tokens=[...tokens.filter(x=>x.kind!==tk.kind||x.activity!==tk.activity),tk];void registerLiveToken(tk);});
 const relink=supabase.auth.onAuthStateChange((e)=>{if(e==='SIGNED_IN')tokens.forEach(tk=>void registerLiveToken(tk));});
 return()=>{started=false;if(t)clearTimeout(t);auth.data.subscription.unsubscribe();relink.data.subscription.unsubscribe();live.remove();app.remove();watchWidget(null);};
}
