import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';

type Habit='water'|'caffeine';
type RecordRow={habit:string;amount:number;recorded_at:string};
const c={ink:'#25145C',purple:'#7139E9',muted:'#8276A5',mint:'#E8F8F1'};
function dayKey(v:string|Date){const d=new Date(v);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export default function HabitDetails({habit,onBack,onSaved}:{habit:Habit;onBack:()=>void;onSaved:(habit:Habit,n:number)=>void}){
 const [records,setRecords]=useState<RecordRow[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [offset,setOffset]=useState(0);
 const chosen=new Date();chosen.setDate(chosen.getDate()+offset);
 const current=dayKey(chosen);
 const today=dayKey(new Date());
 const logs=records.filter(r=>dayKey(r.recorded_at)===current&&r.habit===habit);
 const amount=logs.length?Number(logs[0].amount):0;
 const refresh=useCallback(async()=>{
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
   const earliest=new Date();earliest.setDate(earliest.getDate()-35);
   const {data,error}=await supabase.from('habit_entries').select('habit,amount,recorded_at').eq('user_id',user.id).eq('habit',habit).gte('recorded_at',earliest.toISOString()).order('recorded_at',{ascending:false}).limit(500);
   if(error)throw error;setRecords((data||[]) as RecordRow[]);
  }catch(e:any){Alert.alert('Unable to load tracking',e?.message||'Please retry')}
  finally{setLoading(false)}
 },[habit]);
 useEffect(()=>{setLoading(true);setOffset(0);void refresh()},[refresh]);
 async function change(delta:number){
  if(current!==today)return;
  const next=Math.max(0,amount+delta);setBusy(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
   const {error}=await supabase.from('habit_entries').insert({user_id:user.id,habit,amount:next,unit:'cups'});
   if(error)throw error;
   onSaved(habit,next);await refresh();
  }catch(e:any){Alert.alert('Unable to save',e?.message||'Please retry')}
  finally{setBusy(false)}
 }
 const days=Array.from({length:7},(_,i)=>{const d=new Date(chosen);d.setDate(chosen.getDate()+i-6);return d});
 const barValues=days.map(d=>{const row=records.find(r=>dayKey(r.recorded_at)===dayKey(d));return row?Number(row.amount):0});
 const goal=habit==='water'?8:3;
 return <View style={s.page}>
 <Text style={s.title}>{habit==='water'?'💧 Hydration':'☕ Caffeine'}</Text>
 <Text style={s.body}>{habit==='water'?'Keep track of the glasses of water you choose to drink.':'Track cups of caffeinated beverages and reflect on how you feel.'}</Text>
 <View style={s.dateRow}><TouchableOpacity onPress={()=>setOffset(v=>Math.max(-34,v-1))} style={s.arrow}><Ionicons name="chevron-back" size={22} color={c.ink}/></TouchableOpacity><Text style={s.date}>{current===today?'Today · ':''}{chosen.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</Text><TouchableOpacity disabled={offset>=0} onPress={()=>setOffset(v=>Math.min(0,v+1))} style={s.arrow}><Ionicons name="chevron-forward" size={22} color={offset>=0?'#CCC':c.ink}/></TouchableOpacity></View>
 <View style={s.main}><Text style={s.count}>{loading?'…':amount}</Text><Text style={s.body}>cups logged</Text>{current===today?<View style={s.counter}><TouchableOpacity disabled={busy||loading||amount===0} onPress={()=>void change(-1)} style={s.control}><Ionicons name="remove" size={28} color="#fff"/></TouchableOpacity><TouchableOpacity disabled={busy||loading} onPress={()=>void change(1)} style={s.control}><Ionicons name="add" size={28} color="#fff"/></TouchableOpacity></View>:<Text style={s.note}>Past days are read-only.</Text>}{busy?<ActivityIndicator color={c.purple}/>:null}</View>
 <View style={s.panel}><Text style={s.panelTitle}>Recent history</Text><Text style={s.body}>Based on your saved daily entries</Text><View style={s.chart}>{barValues.map((n,i)=><View key={i} style={s.column}><Text style={s.barLabel}>{n||'·'}</Text><View style={[s.bar,{height:Math.max(5,Math.min(110,n/Math.max(goal,1)*100)),backgroundColor:i===6?c.purple:'#C4EAD9'}]}/><Text style={s.day}>{days[i].toLocaleDateString(undefined,{weekday:'narrow'})}</Text></View>)}</View></View>
 <Text style={s.note}>The {habit==='water'?'8-glass reference':'3-cup chart scale'} is a display guide, not a personalized medical recommendation. Follow any guidance from your clinician.</Text>
 </View>
}
const s=StyleSheet.create({page:{paddingBottom:20,gap:15},back:{flexDirection:'row',alignItems:'center',gap:5},backText:{color:c.purple,fontWeight:'800'},title:{fontSize:29,fontWeight:'900',color:c.ink},body:{fontSize:13,lineHeight:19,color:c.muted},dateRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:'#fff',padding:10,borderRadius:20},date:{fontWeight:'800',color:c.ink,fontSize:15},arrow:{padding:6},main:{backgroundColor:c.mint,padding:28,borderRadius:26,alignItems:'center',gap:10},count:{fontSize:72,fontWeight:'900',color:c.ink},counter:{flexDirection:'row',gap:25,marginTop:12},control:{backgroundColor:c.purple,width:65,height:65,borderRadius:33,justifyContent:'center',alignItems:'center'},panel:{backgroundColor:'#fff',borderRadius:23,padding:18,gap:9},panelTitle:{fontSize:19,fontWeight:'900',color:c.ink},chart:{height:160,flexDirection:'row',justifyContent:'space-around',alignItems:'flex-end'},column:{flex:1,alignItems:'center',gap:7},bar:{width:22,borderRadius:10},barLabel:{fontSize:11,color:c.muted},day:{fontSize:11,color:c.muted},note:{fontSize:11,color:c.muted,lineHeight:16}});
