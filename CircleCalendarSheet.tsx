import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {CT} from './CircleComponents';
import {useCircle} from './CircleStore';
import {addDays,dayKey,fromKey,shortDate,todayKey,useActivityDays} from './CircleHistory';

const monthOf=(k:string)=>k.slice(0,8)+'01';
const WEEKDAYS=Array.from({length:7},(_,i)=>new Date(2026,10,1+i).toLocaleDateString(undefined,{weekday:'short'}));

// "Select a Date" bottom sheet. Future days can't be picked; green dots mark days with Circle activity the user can see.
export default function CircleCalendarSheet({visible,value,onClose,onPick,onRecent,recentLabel='Back to Recent (Today & Yesterday)'}:{visible:boolean;value?:string;onClose:()=>void;onPick:(k:string)=>void;onRecent:()=>void;recentLabel?:string}){
 const store=useCircle();
 const today=todayKey();
 const [sel,setSel]=useState(value||today);
 const [month,setMonth]=useState(monthOf(value||today));
 useEffect(()=>{if(visible){setSel(value||today);setMonth(monthOf(value||today))}},[visible]);
 const {days,loading,error}=useActivityDays(store,month,visible);
 const m=fromKey(month);
 const first=m.getDay();const count=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();
 const cells:(string|null)[]=[...Array(first).fill(null),...Array.from({length:count},(_,i)=>dayKey(new Date(m.getFullYear(),m.getMonth(),i+1)))];
 while(cells.length%7)cells.push(null);
 const shift=(n:number)=>setMonth(dayKey(new Date(m.getFullYear(),m.getMonth()+n,1)));
 const canNext=month<monthOf(today);
 const label=sel===today?'Today':sel===addDays(today,-1)?'Yesterday':shortDate(sel).replace(/,? \d{4}$/,'');
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable style={{flex:1,backgroundColor:'rgba(0,0,0,.25)'}} onPress={onClose} accessibilityLabel="Close calendar"/>
  <View style={{backgroundColor:'#fff',borderTopLeftRadius:26,borderTopRightRadius:26,paddingTop:8,paddingHorizontal:18,paddingBottom:34,gap:12}}>
   <View style={{alignSelf:'center',width:38,height:5,borderRadius:3,backgroundColor:'#DDE5E0'}}/>
   <View style={{flexDirection:'row',alignItems:'center'}}>
    <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{width:44,height:44,justifyContent:'center'}}><Ionicons name="close" size={26} color={CT.ink}/></TouchableOpacity>
    <Text accessibilityRole="header" style={{flex:1,textAlign:'center',fontSize:18,fontWeight:'900',color:CT.ink}}>Select a Date</Text>
    <View style={{width:44}}/>
   </View>
   <View style={{flexDirection:'row',alignItems:'center'}}>
    <TouchableOpacity onPress={()=>shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-back" size={22} color={CT.ink}/></TouchableOpacity>
    <View style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>
     <Text style={{fontSize:17,fontWeight:'900',color:CT.ink}}>{m.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text>
     {loading?<ActivityIndicator size="small" color={CT.muted}/>:null}
    </View>
    <TouchableOpacity disabled={!canNext} onPress={()=>shift(1)} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{disabled:!canNext}} hitSlop={8} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:canNext?1:.25}}><Ionicons name="chevron-forward" size={22} color={CT.ink}/></TouchableOpacity>
   </View>
   <View style={{flexDirection:'row'}}>{WEEKDAYS.map((w,i)=><Text key={i} style={{flex:1,textAlign:'center',fontSize:12,fontWeight:'700',color:CT.muted}}>{w}</Text>)}</View>
   <View style={{flexDirection:'row',flexWrap:'wrap'}}>
    {cells.map((k,i)=>{
     if(!k)return <View key={'e'+i} style={{width:'14.2857%',height:46}}/>;
     const future=k>today,on=k===sel,dot=days.includes(k),d=fromKey(k);
     return <TouchableOpacity key={k} disabled={future} onPress={()=>setSel(k)} accessibilityRole="button" accessibilityState={{selected:on,disabled:future}}
      accessibilityLabel={d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})+(dot?', has activity':'')}
      style={{width:'14.2857%',height:46,alignItems:'center',justifyContent:'center'}}>
      <View style={{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:on?CT.primary:'transparent',borderWidth:k===today&&!on?1.5:0,borderColor:CT.primary}}>
       <Text style={{fontSize:16,fontWeight:on?'900':'600',color:on?'#fff':future?'#C5CFCA':CT.ink}}>{d.getDate()}</Text>
      </View>
      <View style={{width:5,height:5,borderRadius:3,marginTop:2,backgroundColor:dot?CT.primary:'transparent'}}/>
     </TouchableOpacity>;})}
   </View>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}>
    <View style={{width:6,height:6,borderRadius:3,backgroundColor:CT.primary}}/>
    <Text style={{fontSize:12,color:CT.muted,fontWeight:'600'}}>{error?'Couldn’t load activity. You can still pick a day.':'Days with Circle activity'}</Text>
   </View>
   <TouchableOpacity onPress={()=>onPick(sel)} accessibilityRole="button" style={{backgroundColor:CT.primary,borderRadius:24,paddingVertical:15,alignItems:'center'}}>
    <Text style={{color:'#fff',fontSize:16,fontWeight:'900'}}>View {label}</Text>
   </TouchableOpacity>
   <TouchableOpacity onPress={onRecent} accessibilityRole="button" style={{backgroundColor:'#F0F4F2',borderRadius:24,paddingVertical:13,alignItems:'center'}}>
    <Text style={{color:CT.ink,fontSize:14,fontWeight:'700'}}>{recentLabel}</Text>
   </TouchableOpacity>
  </View>
 </Modal>;
}
