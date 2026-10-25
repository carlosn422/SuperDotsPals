import React,{useCallback,useMemo,useState} from 'react';
import {Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {supabase} from './supabase';
import {friendName,useCircle} from './CircleStore';
import FamilyTimeline,{TimelineMood,TimelineReaction} from './FamilyTimeline';

const ink='#251C45',muted='#807694';

// The signed-in user's own day: their journal moods plus reactions on their Circle shares. No retention limit.
function YourDay({onClose}:{onClose:()=>void}){
 const store=useCircle();
 const [moods,setMoods]=useState<TimelineMood[]>([]);
 const reactions=useMemo<TimelineReaction[]>(()=>store.myMoods.flatMap(m=>m.reactions.map(r=>({share_id:m.id,id:m.id+r.friendId,mood:m.mood,shared_at:m.sharedAt,reactor_name:friendName(store,r.friendId),emoji:r.emoji,reacted_at:r.at}))),[store]);
 const loadDay=useCallback(async(start:Date)=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data,error}=await supabase.from('wellness_journal').select('mood,occurred_at').eq('user_id',user.id).not('mood','is',null)
   .gte('occurred_at',start.toISOString()).lt('occurred_at',new Date(start.getTime()+864e5).toISOString()).order('occurred_at',{ascending:false}).limit(200);
  if(!error)setMoods(data||[]);
 },[]);
 return <SafeAreaView style={{flex:1,backgroundColor:'#F7F5FB'}}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Today" onPress={onClose} style={{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:16,paddingVertical:10}}>
   <Ionicons name="chevron-back" size={20} color={ink}/><Text style={{fontWeight:'800',color:ink}}>Today</Text>
  </TouchableOpacity>
  <ScrollView contentContainerStyle={{padding:16,paddingTop:4}}><FamilyTimeline name="You" moods={moods} reactions={reactions} onDay={d=>void loadDay(d)}/></ScrollView>
 </SafeAreaView>;
}

export default function YourDayRow(){
 const [open,setOpen]=useState(false);
 return <>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Your day: mood changes and reactions" onPress={()=>setOpen(true)} style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'white',borderRadius:16,padding:13,borderWidth:1,borderColor:'#EDE9F3'}}>
   <Ionicons name="time-outline" size={21} color="#6953CA"/>
   <View style={{flex:1}}><Text style={{fontWeight:'800',color:ink,fontSize:14}}>Your day</Text><Text style={{color:muted,fontSize:11}}>Mood changes and reactions</Text></View>
   <Ionicons name="chevron-forward" size={18} color={muted}/>
  </TouchableOpacity>
  <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>setOpen(false)}>{open?<YourDay onClose={()=>setOpen(false)}/>:null}</Modal>
 </>;
}
