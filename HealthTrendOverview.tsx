import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSavedHealth} from './HealthDataPanel';
type Metric='hrv'|'steps'|'sleep_minutes'|'resting_heart_rate';
const PURPLE='#7139E9',INK='#25145C',MUTED='#8276A5';
function median(values:number[]){const x=[...values].sort((a,b)=>a-b);return x.length?x[Math.floor(x.length/2)]:null}
export default function HealthTrendOverview({period}:{period:string}){
 const {readings,loading}=useSavedHealth();
 const duration=period==='Day'?1:period==='Week'?7:period==='Month'?30:365;
 const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-duration+1);
 const filtered=readings.filter(r=>new Date(r.recorded_at)>=start);
 const cards:[Metric,string,string,string][]=[['hrv','HRV','ms','pulse-outline'],['steps','Steps','steps','walk-outline'],['sleep_minutes','Sleep','min','moon-outline'],['resting_heart_rate','Resting heart rate','bpm','heart-outline']];
 const bucketsCount=duration===1?1:duration===7?7:duration===30?6:10;
 function series(metric:Metric){
  return Array.from({length:bucketsCount},(_,i)=>{const a=new Date(start);a.setDate(a.getDate()+Math.floor(i*duration/bucketsCount));const b=new Date(start);b.setDate(b.getDate()+Math.floor((i+1)*duration/bucketsCount));
   const values=filtered.filter(r=>r.metric===metric&&new Date(r.recorded_at)>=a&&new Date(r.recorded_at)<b).map(r=>r.value).filter(x=>Number.isFinite(x)&&x>=0);
   const value=values.length?(metric==='steps'&&bucketsCount>1?values.reduce((sum,n)=>sum+n,0):median(values)):null;
   return {value,count:values.length,label:duration===7?['S','M','T','W','T','F','S'][a.getDay()]:String(a.getDate())};
  });
 }
 return <View style={s.container}><Text style={s.heading}>Apple Health trends</Text><Text style={s.sub}>Only real measurements synced from your device are shown. HRV and resting heart rate are not stress diagnoses.</Text>
 <View style={s.grid}>{cards.map(([metric,name,unit,icon])=>{
  const points=series(metric),exists=points.some(p=>p.value!==null),max=Math.max(1,...points.map(p=>p.value||0)),values=filtered.filter(r=>r.metric===metric).map(r=>r.value);
  const typical=metric==='steps'?values[0]??null:median(values);
  return <View key={metric} style={s.card}><View style={s.top}><Ionicons name={icon as any} size={19} color={PURPLE}/><Text style={s.label}>{name}</Text></View><Text style={s.value}>{loading?'…':typical!==null?Math.round(typical).toLocaleString():'—'} <Text style={s.unit}>{typical!==null?unit:''}</Text></Text>
  {exists?<View style={s.chart}>{points.map((p,i)=><View key={i} style={{flex:1,alignItems:'center',justifyContent:'flex-end',gap:5}}><View style={{height:Math.max(5,Math.min(85,((p.value||0)/max)*85)),width:Math.max(6,Math.min(17,110/bucketsCount)),borderRadius:8,backgroundColor:p.value===null?'#F0EDF5':i===points.length-1?PURPLE:'#C1AAFF'}}/><Text style={s.day}>{p.label}</Text></View>)}</View>:<View style={s.empty}><Text style={s.sub}>No synced data for this period</Text></View>}
 </View>})}</View></View>;
}
const s=StyleSheet.create({container:{gap:12},heading:{fontSize:22,fontWeight:'900',color:INK},sub:{fontSize:11,lineHeight:16,color:MUTED},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{width:'48%',backgroundColor:'#fff',padding:14,borderRadius:23,gap:8,minHeight:185},top:{flexDirection:'row',gap:7,alignItems:'center'},label:{fontSize:12,fontWeight:'800',color:INK,flex:1},value:{fontSize:19,fontWeight:'900',color:INK},unit:{fontSize:10,fontWeight:'600',color:MUTED},chart:{flexDirection:'row',alignItems:'flex-end',height:100,gap:1},day:{fontSize:9,color:MUTED},empty:{flex:1,justifyContent:'center'}});
