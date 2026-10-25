import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Alert,AppState,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {publishCircleSnapshot} from './WidgetBridge';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {supabase} from './supabase';
import type {CircleStore,CodePreview,State} from './CircleStore';
import {CIRCLE_MOODS,CircleGroup,CircleMood,Friend,NotificationPrefs,SignalId,isToday,signalById} from './LittleSignalsData';

// My Circle backed by Supabase (see supabase/migrations/20261023_my_circle_little_signals.sql).
const EMPTY_PREFS:NotificationPrefs={invites:true,approvals:true,signals:true,reactions:true,quietHours:true,showNamesInPreview:true,showMoodOnLockScreen:false};
const PREF_COLUMNS:Record<keyof NotificationPrefs,string>={invites:'invites',approvals:'approvals',signals:'signals',reactions:'reactions',quietHours:'quiet_hours',showNamesInPreview:'show_names_in_preview',showMoodOnLockScreen:'show_mood_on_lock_screen'};
const EAS_PROJECT_ID=(Constants.expoConfig?.extra as any)?.eas?.projectId||'7fce274d-e6b2-4944-a9b0-ef08fa13f871';
const initialsOf=(name:string)=>(name.trim()[0]||'?').toUpperCase();
const asMood=(m:string)=>(CIRCLE_MOODS.includes(m as CircleMood)?m:'Calm') as CircleMood;
const isNetworkError=(e:any)=>/network|fetch|timed? ?out|offline/i.test(String(e?.message||e));
const deviceTimezone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}};
const startOfToday=()=>{const d=new Date();d.setHours(0,0,0,0);return d.toISOString();};

const emptyState=():State=>({friends:[],groups:[],requests:[],myMoods:[],friendMoods:[],signals:[],invite:{code:'',expiresAt:new Date().toISOString()},prefs:{...EMPTY_PREFS},revokedFriendIds:[],blockedNames:[],sentSignals:[],offline:false,widgetHideMood:true,inbox:[]});
const WIDGET_HIDE_MOOD_KEY='circle.widgetHideMood';
// Read acknowledgements that couldn't reach the server yet; retried on every refresh.
const PENDING_READS_KEY='circle.pendingReactionReads';
const loadPendingReads=async():Promise<string[]>=>{try{return JSON.parse((await AsyncStorage.getItem(PENDING_READS_KEY))||'[]')}catch{return []}};
const savePendingReads=(ids:string[])=>AsyncStorage.setItem(PENDING_READS_KEY,JSON.stringify(Array.from(new Set(ids)).slice(-200))).catch(()=>{});

export function useLiveCircleState():CircleStore{
 const [st,setSt]=useState<State>(emptyState);
 const [loading,setLoading]=useState(true);
 const stRef=useRef(st);stRef.current=st;
 const me=useRef<string|null>(null);
 const up=(fn:(s:State)=>Partial<State>)=>setSt(s=>({...s,...fn(s)}));

 const userId=async()=>{
  if(me.current)return me.current;
  const {data}=await supabase.auth.getSession();
  me.current=data.session?.user.id||null;
  return me.current;
 };

 const refresh=useCallback(async()=>{
  const uid=await userId();if(!uid){setLoading(false);return;}
  try{
   const ensure=await supabase.rpc('circle_ensure_profile');if(ensure.error)throw ensure.error;
   const pendingReads=await loadPendingReads();
   if(pendingReads.length){const r=await supabase.rpc('circle_mark_reactions_read',{p_ids:pendingReads});if(!r.error)await savePendingReads([]);}
   const [invite,friends,requests,groups,mine,shared,myReactions,signals,sent,prefs,inbox]=await Promise.all([
    supabase.rpc('circle_my_invite'),
    supabase.rpc('circle_friends'),
    supabase.rpc('circle_requests'),
    supabase.from('circle_groups').select('id,name,icon,color,allowed_moods,created_at,circle_group_members(member_id)').order('created_at'),
    supabase.from('circle_shared_moods').select('id,mood,group_ids,shared_at,expires_at,stopped_at,circle_reactions(reactor_id,emoji,updated_at)').eq('owner_id',uid).order('shared_at',{ascending:false}).limit(30),
    supabase.from('circle_shared_moods').select('id,owner_id,mood,shared_at,expires_at').neq('owner_id',uid).order('shared_at',{ascending:false}).limit(30),
    supabase.from('circle_reactions').select('shared_mood_id,emoji').eq('reactor_id',uid),
    supabase.from('circle_signals').select('id,sender_id,signal,sent_at,seen_at').eq('recipient_id',uid).order('sent_at',{ascending:false}).limit(50),
    supabase.from('circle_signals').select('recipient_id,signal,sent_at').eq('sender_id',uid).gte('sent_at',startOfToday()),
    supabase.from('circle_notification_prefs').select('*').eq('user_id',uid).maybeSingle(),
    supabase.rpc('circle_reaction_inbox',{p_unread_only:false,p_limit:50}),
   ]);
   const failed=[invite,friends,requests,groups,mine,shared,myReactions,signals,sent,prefs,inbox].find(r=>r.error);
   if(failed?.error)throw failed.error;
   const now=Date.now();
   const reactionByMood=new Map<string,string>(((myReactions.data||[]) as any[]).map(r=>[r.shared_mood_id,r.emoji]));
   const inv=((invite.data||[]) as any[])[0];
   const p:any=prefs.data;
   setSt(s=>({...s,offline:false,
    invite:inv?{code:inv.code,expiresAt:inv.expires_at}:s.invite,
    friends:((friends.data||[]) as any[]).map((f):Friend=>({id:f.friend_id,name:f.display_name,initials:initialsOf(f.display_name),color:f.avatar_color,
     since:new Date(f.since).toLocaleDateString(undefined,{month:'short',year:'numeric'}),muted:f.muted,hideMyMoods:f.hide_my_moods})),
    requests:((requests.data||[]) as any[]).map(r=>({id:r.link_id,direction:r.direction,name:r.display_name,initials:initialsOf(r.display_name),color:r.avatar_color,sentAt:r.created_at,status:r.status==='declined'?'declined':'pending'})),
    groups:((groups.data||[]) as any[]).map((g):CircleGroup=>({id:g.id,name:g.name,icon:g.icon,color:g.color,memberIds:(g.circle_group_members||[]).map((m:any)=>m.member_id),
     moods:CIRCLE_MOODS.filter(m=>(g.allowed_moods||[]).includes(m))})),
    myMoods:((mine.data||[]) as any[]).map(m=>({id:m.id,mood:asMood(m.mood),sharedAt:m.shared_at,expiresAt:m.stopped_at||m.expires_at,groupIds:m.group_ids||[],
     active:!m.stopped_at&&new Date(m.expires_at).getTime()>now,
     reactions:(m.circle_reactions||[]).map((r:any)=>({friendId:r.reactor_id,emoji:r.emoji,at:r.updated_at})).sort((a:any,b:any)=>a.at.localeCompare(b.at))})),
    friendMoods:((shared.data||[]) as any[]).map(m=>({id:m.id,friendId:m.owner_id,mood:asMood(m.mood),sharedAt:m.shared_at,expiresAt:m.expires_at,myReaction:reactionByMood.get(m.id)})),
    signals:((signals.data||[]) as any[]).map(x=>({id:x.id,friendId:x.sender_id,signal:x.signal as SignalId,at:x.sent_at,seen:!!x.seen_at})),
    sentSignals:((sent.data||[]) as any[]).map(x=>({friendIds:[x.recipient_id],signal:x.signal as SignalId,at:x.sent_at})),
    inbox:((inbox.data||[]) as any[]).map(n=>({id:n.id,moodId:n.shared_mood_id,mood:asMood(n.mood),friendId:n.reactor_id,name:n.reactor_name,emoji:n.emoji,at:n.reacted_at,read:!!n.read_at||pendingReads.includes(n.id)})),
    prefs:p?{invites:p.invites,approvals:p.approvals,signals:p.signals,reactions:p.reactions,quietHours:p.quiet_hours,showNamesInPreview:p.show_names_in_preview,showMoodOnLockScreen:p.show_mood_on_lock_screen}:s.prefs,
   }));
   const tz=deviceTimezone();
   if(p&&p.timezone!==tz)supabase.from('circle_notification_prefs').update({timezone:tz}).eq('user_id',uid).then(()=>{});
  }catch(e){
   if(isNetworkError(e))up(()=>({offline:true}));
   else console.warn('My Circle refresh failed',e);
  }finally{setLoading(false)}
 },[]);

 useEffect(()=>{AsyncStorage.getItem(WIDGET_HIDE_MOOD_KEY).then(v=>{if(v!==null)up(()=>({widgetHideMood:v==='1'}))}).catch(()=>{})},[]);

 useEffect(()=>{
  if(loading)return;
  const name=(id:string)=>st.friends.find(f=>f.id===id);
  const active=st.myMoods.find(m=>m.active);
  publishCircleSnapshot({
   signals:st.signals.map(s=>{const f=name(s.friendId);const sig=signalById(s.signal);return {name:f?.name||'A friend',initials:f?.initials||'?',color:f?.color||'#7BC6A4',emoji:sig.emoji,label:sig.label,at:s.at};}),
   unseen:st.signals.filter(s=>!s.seen).length,todayCount:st.signals.filter(s=>isToday(s.at)).length,friendCount:st.friends.length,
   hideMood:st.widgetHideMood,showNames:st.prefs.showNamesInPreview,mood:active?.mood||'',
  });
 },[loading,st.signals,st.friends,st.myMoods,st.prefs.showNamesInPreview,st.widgetHideMood]);

 useEffect(()=>{
  void refresh();
  const auth=supabase.auth.onAuthStateChange((_e,session)=>{const id=session?.user.id||null;if(id!==me.current){me.current=id;setSt(emptyState());if(id)void refresh();}});
  const app=AppState.addEventListener('change',s=>{if(s==='active')void refresh()});
  const received=Notifications.addNotificationReceivedListener(n=>{if(n.request.content.data?.action==='circle')void refresh()});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh()},45000);
  return()=>{auth.data.subscription.unsubscribe();app.remove();received.remove();clearInterval(timer)};
 },[refresh]);

 // Runs an action, reports failures, then reloads from the server so the screen reflects what was actually saved.
 const run=async(label:string,fn:()=>PromiseLike<{error:any}>|Promise<{error:any}>)=>{
  try{const {error}=await fn();if(error)throw error;}
  catch(e:any){if(isNetworkError(e))up(()=>({offline:true}));Alert.alert(label,isNetworkError(e)?'You’re offline. Try again when you’re connected.':(e?.message||'Please try again.'));}
  finally{void refresh()}
 };

 const syncMembers=async(groupId:string,want:string[],have:string[])=>{
  const add=want.filter(m=>!have.includes(m)),remove=have.filter(m=>!want.includes(m));
  if(remove.length){const r=await supabase.from('circle_group_members').delete().eq('group_id',groupId).in('member_id',remove);if(r.error)return r;}
  if(add.length){const r=await supabase.from('circle_group_members').insert(add.map(member_id=>({group_id:groupId,member_id})));if(r.error)return r;}
  return {error:null};
 };

 const actions=useMemo(()=>({
  reset:()=>{void refresh()},
  showEmpty:()=>{},
  setOffline:(_:boolean)=>{},
  simulateIncomingSignal:(_f:string,_s:SignalId)=>{},
  sendRequest:(_n:string,_i:string,_c:string)=>{},
  regenerateCode:()=>{void (async()=>{const r=await supabase.rpc('circle_regenerate_invite');if(r.error){Alert.alert('Couldn’t create a new code',r.error.message);return;}
   const row=(r.data as any[])?.[0];if(row)up(()=>({invite:{code:row.code,expiresAt:row.expires_at}}));})()},
  previewCode:async(code:string,_own:string):Promise<CodePreview>=>{
   const r=await supabase.rpc('circle_preview_invite',{p_code:code});
   if(r.error){if(isNetworkError(r.error))up(()=>({offline:true}));throw r.error;}
   const row=(r.data as any[])?.[0];if(!row)return {state:'invalid'};
   return {state:row.state,name:row.display_name||undefined,initials:row.display_name?initialsOf(row.display_name):undefined,color:row.avatar_color||undefined};
  },
  redeemCode:async(code:string):Promise<string>=>{const r=await supabase.rpc('circle_redeem_invite',{p_code:code});void refresh();if(r.error)throw r.error;return r.data as string;},
  acceptRequest:(id:string,groupIds:string[])=>{up(s=>({requests:s.requests.filter(x=>x.id!==id)}));void run('Couldn’t accept the request',()=>supabase.rpc('circle_respond',{p_link:id,p_accept:true,p_group_ids:groupIds}))},
  declineRequest:(id:string)=>{up(s=>({requests:s.requests.filter(x=>x.id!==id)}));void run('Couldn’t decline the request',()=>supabase.rpc('circle_respond',{p_link:id,p_accept:false,p_group_ids:[]}))},
  cancelRequest:(id:string)=>{up(s=>({requests:s.requests.filter(x=>x.id!==id)}));void run('Couldn’t cancel the request',()=>supabase.rpc('circle_cancel_request',{p_link:id}))},
  updateFriend:(id:string,patch:Partial<Friend>)=>{
   const f={...stRef.current.friends.find(x=>x.id===id),...patch} as Friend;
   up(s=>({friends:s.friends.map(x=>x.id===id?f:x)}));
   void run('Couldn’t update this friend',async()=>supabase.from('circle_friend_settings').upsert({owner_id:await userId(),friend_id:id,muted:!!f.muted,hide_my_moods:!!f.hideMyMoods},{onConflict:'owner_id,friend_id'}));
  },
  setFriendGroups:(id:string,groupIds:string[])=>{
   const before=stRef.current.groups;
   up(s=>({groups:s.groups.map(g=>({...g,memberIds:groupIds.includes(g.id)?Array.from(new Set([...g.memberIds,id])):g.memberIds.filter(m=>m!==id)}))}));
   void run('Couldn’t update groups',async()=>{
    const add=before.filter(g=>groupIds.includes(g.id)&&!g.memberIds.includes(id)).map(g=>({group_id:g.id,member_id:id}));
    const remove=before.filter(g=>!groupIds.includes(g.id)&&g.memberIds.includes(id)).map(g=>g.id);
    if(remove.length){const r=await supabase.from('circle_group_members').delete().eq('member_id',id).in('group_id',remove);if(r.error)return r;}
    if(add.length)return supabase.from('circle_group_members').insert(add);
    return {error:null};
   });
  },
  removeFriend:(id:string,block=false)=>{up(s=>({friends:s.friends.filter(f=>f.id!==id)}));void run(block?'Couldn’t block this person':'Couldn’t remove this friend',()=>supabase.rpc('circle_remove_friend',{p_friend:id,p_block:block}))},
  saveGroup:(g:CircleGroup)=>{
   const existing=stRef.current.groups.find(x=>x.id===g.id);
   up(s=>({groups:existing?s.groups.map(x=>x.id===g.id?g:x):[...s.groups,g]}));
   const row={name:g.name,icon:g.icon,color:g.color,allowed_moods:g.moods};
   void run('Couldn’t save the group',async()=>{
    if(existing){const r=await supabase.from('circle_groups').update(row).eq('id',g.id);if(r.error)return r;return syncMembers(g.id,g.memberIds,existing.memberIds);}
    const r=await supabase.from('circle_groups').insert({...row,owner_id:await userId()}).select('id').single();if(r.error)return r;
    return syncMembers((r.data as any).id,g.memberIds,[]);
   });
  },
  deleteGroup:(id:string)=>{up(s=>({groups:s.groups.filter(g=>g.id!==id)}));void run('Couldn’t delete the group',()=>supabase.from('circle_groups').delete().eq('id',id))},
  toggleGroupMood:(id:string,mood:CircleMood)=>{
   const g=stRef.current.groups.find(x=>x.id===id);if(!g)return;
   const moods=g.moods.includes(mood)?g.moods.filter(m=>m!==mood):CIRCLE_MOODS.filter(m=>m===mood||g.moods.includes(m));
   up(s=>({groups:s.groups.map(x=>x.id===id?{...x,moods}:x)}));
   void run('Couldn’t update mood sharing',()=>supabase.from('circle_groups').update({allowed_moods:moods}).eq('id',id));
  },
  shareMood:(mood:CircleMood,groupIds:string[])=>{
   const temp='pending-'+Date.now();
   up(s=>({myMoods:[{id:temp,mood,sharedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+864e5).toISOString(),groupIds,reactions:[],active:true},...s.myMoods]}));
   void run('Couldn’t share your mood',()=>supabase.rpc('circle_share_mood',{p_mood:mood,p_group_ids:groupIds}));
   return temp;
  },
  stopSharing:(id:string)=>{up(s=>({myMoods:s.myMoods.map(m=>m.id===id?{...m,active:false,expiresAt:new Date().toISOString()}:m)}));void run('Couldn’t stop sharing',()=>supabase.rpc('circle_stop_share',{p_mood:id}))},
  react:(friendMoodId:string,emoji?:string)=>{
   up(s=>({friendMoods:s.friendMoods.map(m=>m.id===friendMoodId?{...m,myReaction:emoji}:m)}));
   void run('Couldn’t save your reaction',async()=>{const uid=await userId();
    return emoji?supabase.from('circle_reactions').upsert({shared_mood_id:friendMoodId,reactor_id:uid,emoji,updated_at:new Date().toISOString()},{onConflict:'shared_mood_id,reactor_id'})
     :supabase.from('circle_reactions').delete().eq('shared_mood_id',friendMoodId).eq('reactor_id',uid);});
  },
  sendSignal:(friendIds:string[],signal:SignalId)=>{
   up(s=>({sentSignals:[{friendIds,signal,at:new Date().toISOString()},...s.sentSignals]}));
   void run('Couldn’t send your signal',async()=>{const r=await supabase.rpc('circle_send_signal',{p_recipients:friendIds,p_signal:signal});
    if(!r.error&&typeof r.data==='number'&&r.data<friendIds.length)Alert.alert('Some signals weren’t sent','You can send up to 3 signals to the same friend per hour and 30 a day.');
    return r;});
  },
  // Only the opened notification is marked read; opening the Circle tab never clears the rest.
  markReactionRead:(id:string)=>{
   const n=stRef.current.inbox.find(x=>x.id===id);if(!n||n.read)return;
   up(s=>({inbox:s.inbox.map(x=>x.id===id?{...x,read:true}:x)}));
   supabase.rpc('circle_mark_reactions_read',{p_ids:[id]}).then(r=>{if(r.error)void loadPendingReads().then(ids=>savePendingReads([...ids,id]))},()=>{void loadPendingReads().then(ids=>savePendingReads([...ids,id]))});
  },
  markSignalsSeen:()=>{up(s=>({signals:s.signals.map(x=>({...x,seen:true}))}));supabase.rpc('circle_mark_signals_seen').then(()=>{})},
  setPref:(k:keyof NotificationPrefs,v:boolean)=>{up(s=>({prefs:{...s.prefs,[k]:v}}));
   void run('Couldn’t save notification settings',async()=>supabase.from('circle_notification_prefs').upsert({user_id:await userId(),[PREF_COLUMNS[k]]:v,timezone:deviceTimezone()},{onConflict:'user_id'}))},
  setWidgetHideMood:(v:boolean)=>{up(()=>({widgetHideMood:v}));AsyncStorage.setItem(WIDGET_HIDE_MOOD_KEY,v?'1':'0').catch(()=>{})},
  refresh,
  ensurePush:async()=>{
   try{
    let perm=await Notifications.getPermissionsAsync();
    if(!perm.granted&&perm.canAskAgain)perm=await Notifications.requestPermissionsAsync();
    if(!perm.granted)return;
    const token=(await Notifications.getExpoPushTokenAsync({projectId:EAS_PROJECT_ID})).data;
    if(token)await supabase.rpc('circle_register_push_token',{p_token:token});
   }catch(e){if(Platform.OS==='ios')console.log('Push token unavailable (simulators cannot receive remote push):',String(e))}
  },
 }),[refresh]);

 return {...st,...actions,live:true,loading};
}
