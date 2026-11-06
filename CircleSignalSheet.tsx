import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {LITTLE_SIGNALS,SignalId,isToday,signalById} from './LittleSignalsData';
import {useCircle} from './CircleStore';
import {CT,EmptyState,PrimaryButton,cs,useReduceMotion} from './CircleComponents';
import {PersonAvatar} from './CircleConversations';

// Little Signal picker: choose friends (circles) or whole groups, then a signal. Used as a sheet and as the 'send' page.
export function SignalPicker({initial=[],onSent,onInvite}:{initial?:string[];onSent:(signal:SignalId,friendIds:string[])=>void;onInvite?:()=>void}){
 const store=useCircle();
 const [tab,setTab]=useState<'friends'|'groups'>('friends');
 const [people,setPeople]=useState<string[]>(initial);
 const [groups,setGroups]=useState<string[]>([]);
 const [sig,setSig]=useState<SignalId|null>(null);
 const friendIds=new Set(store.friends.map(f=>f.id));
 const to=Array.from(new Set([...people,...store.groups.filter(g=>groups.includes(g.id)).flatMap(g=>g.memberIds)])).filter(id=>friendIds.has(id));
 const sentToday=store.sentSignals.filter(s=>isToday(s.at)).reduce((n,s)=>n+s.friendIds.length,0);
 const hourAgo=Date.now()-3600e3;
 const atHourlyLimit=(id:string)=>store.sentSignals.filter(s=>Date.parse(s.at)>hourAgo&&s.friendIds.includes(id)).length>=3;
 const toggle=(list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];
 if(!store.friends.length)return <EmptyState title="Add a friend first" detail="Little Signals can only be sent to approved friends." action={onInvite?'Invite Friends':undefined} onAction={onInvite}/>;
 const limited=to.filter(atHourlyLimit);
 const send=()=>{if(!sig||!to.length)return;Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});store.sendSignal(to,sig);onSent(sig,to)};
 const seg=(k:'friends'|'groups',label:string,icon:any)=>{const on=tab===k;return <TouchableOpacity key={k} onPress={()=>setTab(k)} accessibilityRole="tab" accessibilityState={{selected:on}}
  style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:9,borderRadius:20,backgroundColor:on?CT.primary:'transparent'}}>
  <Ionicons name={icon} size={17} color={on?'#fff':CT.ink}/><Text style={{fontSize:14,fontWeight:'800',color:on?'#fff':CT.ink}}>{label}</Text></TouchableOpacity>};
 return <View style={{gap:14}}>
  <View accessibilityRole="tablist" style={{flexDirection:'row',backgroundColor:'#fff',borderRadius:24,padding:4,gap:4,borderWidth:1,borderColor:CT.line}}>
   {seg('friends','Friends','person-outline')}{seg('groups','Groups','people-outline')}
  </View>
  {tab==='friends'?<View style={{flexDirection:'row',flexWrap:'wrap',gap:14,paddingHorizontal:2}}>
   {store.friends.map(f=>{const on=people.includes(f.id);return <TouchableOpacity key={f.id} onPress={()=>{Haptics.selectionAsync().catch(()=>{});setPeople(p=>toggle(p,f.id))}} accessibilityRole="checkbox" accessibilityState={{checked:on}} accessibilityLabel={f.name}
    style={{width:72,alignItems:'center',gap:5}}>
    <View style={{borderRadius:34,borderWidth:3,borderColor:on?CT.primary:'transparent',padding:2}}><PersonAvatar store={store} id={f.id} size={56}/></View>
    {on?<View style={{position:'absolute',top:0,right:6,width:22,height:22,borderRadius:11,backgroundColor:CT.primary,borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'}}><Ionicons name="checkmark" size={13} color="#fff"/></View>:null}
    <Text numberOfLines={1} style={{fontSize:12,fontWeight:on?'900':'700',color:CT.ink,maxWidth:72}}>{f.name.split(' ')[0]}</Text>
   </TouchableOpacity>})}
  </View>:<View style={[cs.card,{paddingVertical:2,paddingHorizontal:12}]}>
   {store.groups.map((g,i)=>{const on=groups.includes(g.id);const n=g.memberIds.filter(id=>friendIds.has(id)).length;return <TouchableOpacity key={g.id} disabled={!n} onPress={()=>{Haptics.selectionAsync().catch(()=>{});setGroups(x=>toggle(x,g.id))}} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:!n}}
    style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,opacity:n?1:.45,borderBottomWidth:i===store.groups.length-1?0:1,borderBottomColor:CT.line}}>
    <View style={{width:40,height:40,borderRadius:20,backgroundColor:g.color+'22',alignItems:'center',justifyContent:'center'}}><Ionicons name={g.icon as any} size={20} color={g.color}/></View>
    <View style={{flex:1}}><Text style={cs.rowTitle}>{g.name}</Text><Text style={cs.rowSub}>{n===1?'1 friend':n+' friends'}</Text></View>
    <Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={24} color={on?CT.primary:CT.muted}/>
   </TouchableOpacity>})}
  </View>}
  <Text style={{fontSize:16,fontWeight:'900',color:CT.ink,marginTop:2}}>Signal</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>{LITTLE_SIGNALS.map(s=>{const on=sig===s.id;return <TouchableOpacity key={s.id} onPress={()=>setSig(s.id)} accessibilityRole="radio" accessibilityState={{selected:on}}
   style={{width:'48%',flexGrow:1,flexDirection:'row',alignItems:'center',gap:9,padding:12,borderRadius:16,borderWidth:1.5,borderColor:on?CT.primary:CT.border,backgroundColor:on?CT.primarySoft:'#fff'}}>
   <Text style={{fontSize:24}}>{s.emoji}</Text><Text style={{flex:1,fontWeight:'800',fontSize:13,color:CT.ink}}>{s.label}</Text></TouchableOpacity>})}</View>
  {sentToday>=20?<Text style={[cs.muted,{textAlign:'center'}]}>You’ve sent a lot of signals today. Try again tomorrow.</Text>:null}
  {limited.length?<Text style={[cs.muted,{textAlign:'center'}]}>You’ve sent {limited.map(id=>store.friends.find(f=>f.id===id)?.name.split(' ')[0]).join(', ')} 3 signals this hour. Try again a little later.</Text>:null}
  <PrimaryButton label={!to.length?'Choose who to send to':to.length>1?'Send to '+to.length+' friends':'Send to '+(store.friends.find(f=>f.id===to[0])?.name.split(' ')[0]||'1 friend')} icon="heart" disabled={!to.length||!sig||sentToday>=20||limited.length>0} onPress={send}/>
 </View>;
}

// Bottom sheet. After sending, the signal floats up in a bubble (like it lands on their watch), then the sheet closes.
function SentBubble({signal,onDone}:{signal:SignalId;onDone:()=>void}){
 const reduce=useReduceMotion();const v=useRef(new Animated.Value(0)).current;const s=signalById(signal);
 useEffect(()=>{
  const anim=reduce?Animated.sequence([Animated.timing(v,{toValue:1,duration:200,useNativeDriver:true}),Animated.delay(900)])
   :Animated.sequence([Animated.spring(v,{toValue:1,friction:5,tension:90,useNativeDriver:true}),Animated.delay(550),Animated.timing(v,{toValue:2,duration:550,easing:Easing.in(Easing.quad),useNativeDriver:true})]);
  anim.start(()=>onDone());return()=>anim.stop();
 },[]);
 const scale=v.interpolate({inputRange:[0,1,2],outputRange:[reduce?1:.4,1,.9]});
 const y=v.interpolate({inputRange:[0,1,2],outputRange:[reduce?0:80,0,reduce?0:-260]});
 const op=v.interpolate({inputRange:[0,.3,1,1.7,2],outputRange:[0,1,1,1,reduce?1:0]});
 return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:'rgba(244,250,246,.82)'}]}>
  <Animated.View accessible accessibilityLiveRegion="polite" accessibilityLabel={s.label+' sent'} style={{opacity:op,transform:[{translateY:y},{scale}],alignItems:'center',gap:8}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#fff',borderRadius:28,borderBottomLeftRadius:8,paddingHorizontal:18,paddingVertical:14,shadowColor:'#1D2B33',shadowOpacity:.15,shadowRadius:16,shadowOffset:{width:0,height:6}}}>
    <Text style={{fontSize:44}}>{s.emoji}</Text>
    <Text style={{fontSize:17,fontWeight:'900',color:CT.ink}}>{s.label}</Text>
   </View>
   <Text style={{fontSize:13,fontWeight:'800',color:CT.primary}}>Sent</Text>
  </Animated.View>
 </View>;
}

export default function CircleSignalSheet({visible,initial,onClose,onInvite}:{visible:boolean;initial?:string[];onClose:()=>void;onInvite?:()=>void}){
 const [sent,setSent]=useState<SignalId|null>(null);
 const [round,setRound]=useState(0);
 useEffect(()=>{if(visible){setSent(null);setRound(r=>r+1)}},[visible]);
 return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
  <View style={{flex:1,backgroundColor:'#F4FAF6'}}>
   <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingTop:16,paddingBottom:8}}>
    <Text accessibilityRole="header" style={{flex:1,fontSize:22,fontWeight:'900',color:CT.ink}}>Send a Little Signal</Text>
    <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Ionicons name="close" size={26} color={CT.ink}/></TouchableOpacity>
   </View>
   <ScrollView style={{flex:1}} contentContainerStyle={{padding:18,paddingTop:6,paddingBottom:40}} keyboardShouldPersistTaps="handled" scrollEnabled={!sent}>
    <SignalPicker key={round+'|'+(initial||[]).join(',')} initial={initial} onSent={x=>setSent(x)} onInvite={onInvite?()=>{onClose();onInvite()}:undefined}/>
   </ScrollView>
   {sent?<SentBubble signal={sent} onDone={onClose}/>:null}
  </View>
 </Modal>;
}
