import React from 'react';
import {View,Text,StyleSheet,TouchableOpacity} from 'react-native';
import SuperdotMascot from './SuperdotMascot';
import {useSavedHealth} from './HealthDataPanel';
const PURPLE='#7139E9',INK='#25145C',MUTED='#8276A5';
function median(arr:number[]){const s=[...arr].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2}
export default function RecoveryInsights({companion,onChat}:{companion:string;onChat:()=>void}){
 const {readings,loading}=useSavedHealth();
 const cutoff=Date.now()-21*86400000;
 const series=readings.filter(r=>r.metric==='hrv'&&r.value>0&&new Date(r.recorded_at).getTime()>=cutoff);
 const uniqueDays=new Set(series.map(r=>new Date(r.recorded_at).toDateString())).size;
 const sufficient=series.length>=8&&uniqueDays>=3;
 const latest=series[0]||null;
 const baseline=sufficient?median(series.slice(1).map(v=>v.value)):null;
 const delta=baseline&&latest?(latest.value-baseline)/baseline:0;
 const heading=loading?'Loading your recent readings':!latest?'Your recovery story starts with real data':!sufficient?'Building your personal baseline':delta<-.15?'Your latest HRV is below your recent median':delta>.15?'Your latest HRV is above your recent median':'Your latest HRV is near your recent median';
 const message=!latest?'Connect Apple Health to see your own patterns.':!sufficient?'We need several readings across multiple days before making comparisons.':'HRV changes can have many causes, including sleep, activity, illness and stress. A comparison is not a diagnosis.';
 return <View style={s.box}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><SuperdotMascot id={companion} color={PURPLE} size={63}/><View style={{flex:1,gap:5}}><Text style={s.eyebrow}>YOUR PERSONAL WELLNESS PATTERN</Text><Text style={s.title}>{heading}</Text></View></View>
 {latest?<View style={s.readings}><View><Text style={s.value}>{Math.round(latest.value)} <Text style={s.unit}>ms HRV</Text></Text><Text style={s.unit}>Latest reading</Text></View><View><Text style={s.value}>{baseline?Math.round(baseline)+' ms':'—'}</Text><Text style={s.unit}>Recent median</Text></View></View>:null}
 <Text style={s.description}>{message}</Text><TouchableOpacity onPress={onChat}><Text style={s.link}>Reflect with your MoodPals  →</Text></TouchableOpacity></View>;
}
const s=StyleSheet.create({box:{backgroundColor:'#EEF8F2',borderRadius:25,padding:17,gap:13},eyebrow:{fontSize:10,letterSpacing:0.7,fontWeight:'900',color:'#438C72'},title:{fontSize:17,lineHeight:22,fontWeight:'900',color:INK},readings:{backgroundColor:'#fff',borderRadius:16,padding:12,flexDirection:'row',justifyContent:'space-between'},value:{fontSize:19,fontWeight:'900',color:INK},unit:{fontSize:11,color:MUTED},description:{fontSize:12,lineHeight:19,color:MUTED},link:{fontSize:12,fontWeight:'900',color:PURPLE}});
