import React,{useCallback,useMemo,useState} from 'react';
import {Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {supabase} from './supabase';
import {friendName,useCircle} from './CircleStore';
import FamilyTimeline,{TimelineMood,TimelineReaction} from './FamilyTimeline';

const ink='#251C45',muted='#807694';

// The signed-in user's own day: their journal moods plus reactions on their Circle shares. No retention limit.
function YourDay({onClose,top,bottom}:{onClose:()=>void;top:number;bottom:number}){
 const store=useCircle();
 const [openKey,setOpenKey]=useState<string|null>(null);
 const [moods,setMoods]=useState<TimelineMood[]>([]);
 const reactions=useMemo<TimelineReaction[]>(()=>store.myMoods.flatMap(m=>m.reactions.map(r=>({share_id:m.id,id:m.id+r.friendId,mood:m.mood,shared_at:m.sharedAt,reactor_name:friendName(store,r.friendId),emoji:r.emoji,reacted_at:r.at}))),[store]);
 const loadDay=useCallback(async(start:Date)=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data,error}=await supabase.from('wellness_journal').select('mood,occurred_at').eq('user_id',user.id).not('mood','is',null)
   .gte('occurred_at',start.toISOString()).lt('occurred_at',new Date(start.getTime()+864e5).toISOString()).order('occurred_at',{ascending:false}).limit(200);
  if(!error)setMoods(data||[]);
 },[]);
 return <View style={{flex:1,backgroundColor:'#F7F5FB',paddingTop:top,paddingBottom:bottom}}>
  <View style={{width: 40, height: 5, backgroundColor: '#E5E0F0', borderRadius: 2.5, alignSelf: 'center', marginVertical: 8}} />
  {openKey && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={()=>setOpenKey(null)} style={{position: 'absolute', top: top + 10, left: 16, zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 4}} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}>
   <Ionicons name="chevron-back" size={22} color={ink}/>
   <Text style={{fontWeight:'800',color:ink}}>Back</Text>
  </TouchableOpacity>}
  
  <ScrollView contentContainerStyle={{padding:16, paddingTop: 20}}><FamilyTimeline name="You" moods={moods} reactions={reactions} onDay={d=>void loadDay(d)} openKey={openKey} onOpenKey={setOpenKey}/></ScrollView>
 </View>;
}

export default function YourDayRow(){
 const [open,setOpen]=useState(false);
 // Modal content sits outside the app's safe-area provider, so read the insets here.
 const insets=useSafeAreaInsets();
 return <>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Your day: mood changes and reactions" onPress={()=>setOpen(true)} style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'white',borderRadius:16,padding:13,borderWidth:1,borderColor:'#EDE9F3'}}>
   <Ionicons name="time-outline" size={21} color="#6953CA"/>
   <View style={{flex:1}}><Text style={{fontWeight:'800',color:ink,fontSize:14}}>Your day</Text><Text style={{color:muted,fontSize:11}}>Mood changes and reactions</Text></View>
   <Ionicons name="chevron-forward" size={18} color={muted}/>
  </TouchableOpacity>
  <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setOpen(false)}>{open?<YourDay top={insets.top} bottom={insets.bottom} onClose={()=>setOpen(false)}/>:null}</Modal>
 </>;
}
