import React,{createContext,useContext,useMemo,useState} from 'react';
import {CIRCLE_MOODS,CircleGroup,CircleMood,DEFAULT_PREFS,Friend,FriendRequest,FriendSharedMood,MOCK_FRIENDS,MOCK_FRIEND_MOODS,MOCK_GROUPS,MOCK_INVITE,MOCK_MY_MOODS,MOCK_REQUESTS,MOCK_SIGNALS,MySharedMood,NotificationPrefs,ReceivedSignal,SignalId} from './LittleSignalsData';

// Local, in-memory state for the My Circle prototype. Replaced by Supabase-backed data after the prototype review.
type State={friends:Friend[];groups:CircleGroup[];requests:FriendRequest[];myMoods:MySharedMood[];friendMoods:FriendSharedMood[];signals:ReceivedSignal[];invite:{code:string;expiresAt:string};prefs:NotificationPrefs;revokedFriendIds:string[];blockedNames:string[];sentSignals:{friendIds:string[];signal:SignalId;at:string}[];offline:boolean};
const initial=():State=>({friends:MOCK_FRIENDS.map(f=>({...f})),groups:MOCK_GROUPS.map(g=>({...g,memberIds:[...g.memberIds],moods:[...g.moods]})),requests:MOCK_REQUESTS.map(r=>({...r})),myMoods:MOCK_MY_MOODS.map(m=>({...m,reactions:[...m.reactions]})),friendMoods:MOCK_FRIEND_MOODS.map(m=>({...m})),signals:MOCK_SIGNALS.map(s=>({...s})),invite:{...MOCK_INVITE},prefs:{...DEFAULT_PREFS},revokedFriendIds:[],blockedNames:[],sentSignals:[],offline:false});
const empty=():State=>({...initial(),friends:[],groups:[],requests:[],myMoods:[],friendMoods:[],signals:[]});

function useCircleState(){
 const [st,setSt]=useState<State>(initial);
 const up=(fn:(s:State)=>Partial<State>)=>setSt(s=>({...s,...fn(s)}));
 const actions=useMemo(()=>({
  reset:()=>setSt(initial()),
  showEmpty:()=>setSt(empty()),
  setOffline:(offline:boolean)=>up(()=>({offline})),
  regenerateCode:()=>up(()=>({invite:{code:'MP-'+Math.random().toString(36).slice(2,7).toUpperCase().replace(/[O0I1L]/g,'7'),expiresAt:new Date(Date.now()+7*864e5).toISOString()}})),
  sendRequest:(name:string,initials:string,color:string)=>up(s=>({requests:[{id:'rq'+Date.now(),direction:'outgoing',name,initials,color,sentAt:new Date().toISOString(),status:'pending'},...s.requests]})),
  acceptRequest:(id:string,groupIds:string[])=>up(s=>{const r=s.requests.find(x=>x.id===id);if(!r)return {};const fid='f'+id;
   return {requests:s.requests.filter(x=>x.id!==id),friends:[...s.friends,{id:fid,name:r.name,initials:r.initials,color:r.color,since:'Today',muted:false,hideMyMoods:false}],groups:s.groups.map(g=>groupIds.includes(g.id)?{...g,memberIds:[...g.memberIds,fid]}:g)}}),
  declineRequest:(id:string)=>up(s=>({requests:s.requests.filter(x=>x.id!==id)})),
  cancelRequest:(id:string)=>up(s=>({requests:s.requests.filter(x=>x.id!==id)})),
  updateFriend:(id:string,patch:Partial<Friend>)=>up(s=>({friends:s.friends.map(f=>f.id===id?{...f,...patch}:f)})),
  setFriendGroups:(id:string,groupIds:string[])=>up(s=>({groups:s.groups.map(g=>({...g,memberIds:groupIds.includes(g.id)?Array.from(new Set([...g.memberIds,id])):g.memberIds.filter(m=>m!==id)}))})),
  removeFriend:(id:string,block=false)=>up(s=>({friends:s.friends.filter(f=>f.id!==id),groups:s.groups.map(g=>({...g,memberIds:g.memberIds.filter(m=>m!==id)})),revokedFriendIds:[...s.revokedFriendIds,id],blockedNames:block?[...s.blockedNames,s.friends.find(f=>f.id===id)?.name||'']:s.blockedNames,
   signals:s.signals.filter(x=>x.friendId!==id),friendMoods:s.friendMoods.filter(x=>x.friendId!==id),myMoods:s.myMoods.map(m=>({...m,reactions:m.reactions.filter(r=>r.friendId!==id)}))})),
  saveGroup:(g:CircleGroup)=>up(s=>({groups:s.groups.some(x=>x.id===g.id)?s.groups.map(x=>x.id===g.id?g:x):[...s.groups,g]})),
  deleteGroup:(id:string)=>up(s=>({groups:s.groups.filter(g=>g.id!==id)})),
  toggleGroupMood:(id:string,mood:CircleMood)=>up(s=>({groups:s.groups.map(g=>g.id!==id?g:{...g,moods:g.moods.includes(mood)?g.moods.filter(m=>m!==mood):CIRCLE_MOODS.filter(m=>m===mood||g.moods.includes(m))})})),
  shareMood:(mood:CircleMood,groupIds:string[])=>{const id='m'+Date.now();up(s=>({myMoods:[{id,mood,sharedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+864e5).toISOString(),groupIds,reactions:[],active:true},...s.myMoods]}));return id;},
  stopSharing:(id:string)=>up(s=>({myMoods:s.myMoods.map(m=>m.id===id?{...m,active:false,expiresAt:new Date().toISOString()}:m)})),
  react:(friendMoodId:string,emoji?:string)=>up(s=>({friendMoods:s.friendMoods.map(m=>m.id===friendMoodId?{...m,myReaction:emoji}:m)})),
  sendSignal:(friendIds:string[],signal:SignalId)=>up(s=>({sentSignals:[{friendIds,signal,at:new Date().toISOString()},...s.sentSignals]})),
  markSignalsSeen:()=>up(s=>({signals:s.signals.map(x=>({...x,seen:true}))})),
  simulateIncomingSignal:(friendId:string,signal:SignalId)=>up(s=>({signals:[{id:'s'+Date.now(),friendId,signal,at:new Date().toISOString(),seen:false},...s.signals]})),
  setPref:(k:keyof NotificationPrefs,v:boolean)=>up(s=>({prefs:{...s.prefs,[k]:v}})),
 }),[]);
 return {...st,...actions};
}
export type CircleStore=ReturnType<typeof useCircleState>;
const Ctx=createContext<CircleStore|null>(null);
export function CircleProvider({children}:{children:React.ReactNode}){const store=useCircleState();return <Ctx.Provider value={store}>{children}</Ctx.Provider>;}
export function useCircle(){const c=useContext(Ctx);if(!c)throw Error('useCircle must be used inside CircleProvider');return c;}
export function friendName(store:CircleStore,id:string){return store.friends.find(f=>f.id===id)?.name||'Former friend';}
export function uniqueAudience(store:CircleStore,groupIds:string[],mood?:CircleMood){
 const ids=new Set<string>();
 store.groups.filter(g=>groupIds.includes(g.id)&&(!mood||g.moods.includes(mood))).forEach(g=>g.memberIds.forEach(m=>{const f=store.friends.find(x=>x.id===m);if(f&&!f.hideMyMoods)ids.add(m)}));
 return Array.from(ids);
}
