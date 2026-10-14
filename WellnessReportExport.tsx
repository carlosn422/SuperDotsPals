import React,{useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {supabase} from './supabase';
const COLORS={ink:'#25145C',violet:'#7139E9',muted:'#8276A5'};
function escapeHtml(x:unknown){return String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function dayKey(x:string){const d=new Date(x);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function dateCell(v:string){return escapeHtml(new Date(v).toLocaleDateString())}
function table(headers:string[],items:(string|number)[][]){
 return '<table><thead><tr>'+headers.map(h=>'<th>'+escapeHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+ (items.length?items.map(row=>'<tr>'+row.map(value=>'<td>'+escapeHtml(value)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">No records for this period</td></tr>')+'</tbody></table>';
}
export default function WellnessReportExport(){
 const [days,setDays]=useState<7|30|90>(30),[busy,setBusy]=useState(false);
 async function generate(){
  setBusy(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Sign in before exporting your report.');
   if(!(await Sharing.isAvailableAsync()))throw Error('The system share sheet is not available on this device.');
   const from=new Date();from.setDate(from.getDate()-days);from.setHours(0,0,0,0);
   const iso=from.toISOString();
   const [moods,habits,journal,readings]=await Promise.all([
    supabase.from('mood_entries').select('mood,recorded_at').eq('user_id',user.id).gte('recorded_at',iso).order('recorded_at',{ascending:false}).limit(500),
    supabase.from('habit_entries').select('habit,amount,unit,recorded_at').eq('user_id',user.id).gte('recorded_at',iso).order('recorded_at',{ascending:false}).limit(1000),
    supabase.from('wellness_journal').select('mood,intensity,body,occurred_at').eq('user_id',user.id).gte('occurred_at',iso).order('occurred_at',{ascending:false}).limit(400),
    supabase.from('wellness_readings').select('metric,value,source,recorded_at').eq('user_id',user.id).eq('source','healthkit').gte('recorded_at',iso).order('recorded_at',{ascending:false}).limit(1500)
   ]);
   for(const q of [moods,habits,journal,readings])if(q.error)throw q.error;
   const unique=new Map<string,{habit:string;amount:number;unit:string;recorded_at:string}>();
   for(const r of habits.data||[]){const k=dayKey(r.recorded_at)+'-'+r.habit;if(!unique.has(k))unique.set(k,r);}
   const sorted=[...unique.values()].sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at));
   const notes=(journal.data||[]).map(r=>[dateCell(r.occurred_at),r.mood||'—',r.intensity??'—',r.body?.slice(0,700)||'']);
   const html=`<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#25145C;padding:24px}
    h1{color:#7139E9;font-size:26px;margin:0 0 8px}.small{font-size:11px;color:#6A6280}
    h2{font-size:17px;padding:9px 0;border-bottom:2px solid #E9DFFC;margin-top:26px}
    table{border-collapse:collapse;width:100%;font-size:10px;table-layout:fixed}
    th,td{padding:7px;border-bottom:1px solid #E8E3F1;text-align:left;word-break:break-word}
    th{background:#F0E8FF} .notice{background:#F1F8F3;padding:12px;font-size:11px;line-height:1.5;border-radius:10px}
    footer{margin-top:26px;font-size:10px;color:#6A6280}
    </style></head><body><h1>Superdots wellness report</h1>
    <p class="small">Generated ${escapeHtml(new Date().toLocaleString())} · Previous ${days} days</p>
    <div class="notice">This is a user-requested export of self-reported wellness information and permitted Apple Health measurements. These records are not a medical diagnosis, clinical stress score, or proof of causation. Missing data are not estimated.</div>
    <h2>Mood check-ins (${moods.data?.length||0})</h2>
    ${table(['Date','Reported mood'],(moods.data||[]).map(r=>[dateCell(r.recorded_at),r.mood]))}
    <h2>Habits (latest saved total per day)</h2>
    ${table(['Date','Habit','Total','Unit'],sorted.map(r=>[dateCell(r.recorded_at),r.habit,r.amount,r.unit]))}
    <h2>Private journal and reflections</h2>
    ${table(['Date','Mood','Intensity','User note'],notes)}
    <h2>Apple Health measurements (${readings.data?.length||0})</h2>
    ${table(['Date','Measurement','Value','Source'],(readings.data||[]).map(r=>[dateCell(r.recorded_at),r.metric,r.value,'Apple Health']))}
    <footer>Superdots · Created locally on your device for sharing at your request. Verify measurements with your healthcare professional if using this for care.</footer>
    </body></html>`;
   const result=await Print.printToFileAsync({html});
   await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:'Share Superdots wellness report'});
  }catch(e:any){Alert.alert('Report unavailable',e?.message||'Please try again')}finally{setBusy(false)}
 }
 return <View style={s.panel}><View style={{flexDirection:'row',gap:9,alignItems:'center'}}><Ionicons name="document-text-outline" size={24} color={COLORS.violet}/><View style={{flex:1}}><Text style={s.title}>Export wellness report</Text><Text style={s.sub}>Mood, habits, journal and real HealthKit measurements</Text></View></View>
 <Text style={s.sub}>Select a period. The report is generated on your phone and opens the iOS share sheet only when you choose Export.</Text>
 <View style={s.row}>{([7,30,90] as const).map(n=><TouchableOpacity key={n} disabled={busy} onPress={()=>setDays(n)} style={[s.chip,{backgroundColor:days===n?COLORS.violet:'#F1EAFC'}]}><Text style={{color:days===n?'#fff':COLORS.ink,fontWeight:'800'}}>{n} days</Text></TouchableOpacity>)}</View>
 <TouchableOpacity disabled={busy} onPress={()=>void generate()} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Ionicons name="share-outline" size={20} color="#fff"/>}<Text style={{color:'#fff',fontWeight:'900'}}>{busy?'Preparing report…':'Generate & share PDF'}</Text></TouchableOpacity>
 </View>;
}
const s=StyleSheet.create({panel:{backgroundColor:'#fff',borderRadius:23,padding:17,gap:15},title:{fontSize:18,fontWeight:'900',color:COLORS.ink},sub:{fontSize:12,lineHeight:18,color:COLORS.muted},row:{flexDirection:'row',gap:9},chip:{paddingVertical:10,paddingHorizontal:17,borderRadius:14},button:{padding:15,borderRadius:16,backgroundColor:COLORS.violet,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}});
