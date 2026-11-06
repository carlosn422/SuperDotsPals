import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {CT,useReduceMotion} from './CircleComponents';
import {useCircle} from './CircleStore';
import {useIsGuest} from './Account';
import {CircleMood,MOOD_TINTS} from './LittleSignalsData';

const MOOD_HEART:Record<CircleMood,string>={Joyful:'💜',Calm:'💚',Sad:'💙',Angry:'❤️',Anxious:'💛',Tired:'🌙'};
type Status='idle'|'sharing'|'shared'|'error'|'nobody';

// Shown once the check-in is saved privately: one decision, Share with My Circle or Done.
export default function CheckinComplete({mood,onDone,onNeedsAccount}:{mood:string;onDone:()=>void;onNeedsAccount?:(mood:string)=>void}){
 const circle=useCircle();const isGuest=useIsGuest();const reduce=useReduceMotion();
 const m=(mood in MOOD_TINTS?mood:'Calm') as CircleMood;const tint=MOOD_TINTS[m];
 // One id per check-in: circle_share_mood_auto is idempotent on it, so retries and double taps can't share twice.
 const eventId=useRef(Crypto.randomUUID()).current;
 const [status,setStatus]=useState<Status>('idle');const [error,setError]=useState('');
 const busy=useRef(false);const leave=useRef<ReturnType<typeof setTimeout>|null>(null);
 const check=useRef(new Animated.Value(reduce?1:0)).current;
 useEffect(()=>{Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});if(!reduce)Animated.spring(check,{toValue:1,friction:5,tension:120,delay:150,useNativeDriver:true}).start();return()=>{if(leave.current)clearTimeout(leave.current)}},[]);

 async function share(){
  if(busy.current||status==='shared')return;
  if(isGuest){onNeedsAccount?.(m);return;}
  busy.current=true;setStatus('sharing');setError('');
  try{
   const {data,error}=await supabase.rpc('circle_share_mood_auto',{p_mood:m,p_event_id:eventId});
   if(error)throw error;
   if(!data){setStatus('nobody');return;}
   setStatus('shared');
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
   void circle.refresh();
   leave.current=setTimeout(onDone,1400);
  }catch(e:any){
   setStatus('error');
   setError(/network|fetch|timed? ?out|offline/i.test(String(e?.message||e))?'You’re offline.':(e?.message||'Something went wrong.'));
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});
  }finally{busy.current=false}
 }

 const shared=status==='shared';
 return <View style={{alignItems:'stretch',gap:14,paddingTop:6}}>
  <View style={{alignItems:'center'}}>
   <View style={{width:168,height:168,borderRadius:84,backgroundColor:tint.tint,alignItems:'center',justifyContent:'center'}}>
    <SuperdotMascot id={m} size={140}/>
    <Animated.View style={{position:'absolute',right:6,bottom:8,width:40,height:40,borderRadius:20,backgroundColor:CT.primary,borderWidth:3,borderColor:'#fff',alignItems:'center',justifyContent:'center',opacity:check,transform:[{scale:check.interpolate({inputRange:[0,1],outputRange:[.4,1]})}]}}>
     <Ionicons name="checkmark" size={22} color="#fff"/>
    </Animated.View>
   </View>
  </View>
  <View style={{alignItems:'center',gap:4}} accessible accessibilityRole="header" accessibilityLabel={'You’re feeling '+m+'. '+(shared?'Shared with your Circle.':'Your mood has been saved privately.')}>
   <Text style={{fontSize:25,fontWeight:'900',color:'#251C45',textAlign:'center'}}>You’re feeling {m}! {MOOD_HEART[m]}</Text>
   {shared?<View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="checkmark-circle" size={18} color={CT.primary}/><Text style={{fontSize:15,fontWeight:'800',color:CT.primary}}>Shared with your Circle!</Text></View>
    :<Text style={{fontSize:14,color:'#827892',textAlign:'center'}}>Your mood has been saved privately.</Text>}
  </View>
  {status==='error'?<View accessibilityLiveRegion="polite" style={{backgroundColor:'#FDECF1',borderRadius:14,padding:11}}><Text style={{color:'#A83D5A',fontSize:13,fontWeight:'700',textAlign:'center'}}>Couldn’t share: {error} Your mood is still saved privately.</Text></View>:null}
  {status==='nobody'?<View accessibilityLiveRegion="polite" style={{backgroundColor:'#FFF6D6',borderRadius:14,padding:11}}><Text style={{color:'#6F5610',fontSize:13,fontWeight:'700',textAlign:'center'}}>None of your groups can see {m} moods yet. Choose who sees what in Circle Settings → Mood Sharing.</Text></View>:null}
  <View style={{gap:9}}>
   {status!=='nobody'?<TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:status==='sharing'||shared,busy:status==='sharing'}} disabled={status==='sharing'||shared} onPress={()=>void share()}
    style={{backgroundColor:CT.primary,borderRadius:18,paddingVertical:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,opacity:shared?.75:1}}>
    {status==='sharing'?<ActivityIndicator color="#fff"/>:<Ionicons name={shared?'checkmark':status==='error'?'refresh':'people'} size={19} color="#fff"/>}
    <Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>{status==='sharing'?'Sharing…':shared?'Shared':status==='error'?'Retry Sharing':'Share with My Circle'}</Text>
   </TouchableOpacity>:null}
   <TouchableOpacity accessibilityRole="button" disabled={status==='sharing'} onPress={()=>{if(leave.current)clearTimeout(leave.current);onDone()}}
    style={{borderRadius:18,paddingVertical:15,alignItems:'center',borderWidth:1.5,borderColor:'#E3EAE6',backgroundColor:'#fff',opacity:status==='sharing'?.5:1}}>
    <Text style={{color:'#30264D',fontWeight:'800',fontSize:16}}>Done</Text>
   </TouchableOpacity>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:8}}>
   <Ionicons name="lock-closed" size={13} color="#827892"/>
   <Text style={{flexShrink:1,fontSize:12,color:'#827892',textAlign:'center'}}>Only your mood is shared. Your notes and health data stay private.</Text>
  </View>
 </View>;
}
