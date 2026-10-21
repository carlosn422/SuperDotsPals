import React,{useMemo,useState} from 'react';
import {View,Text,TouchableOpacity,TextInput,StyleSheet,Alert,ActivityIndicator} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import {useStress,SW} from './StressDashboard';
import {STRESS_LEVELS,StressLevel,StressPoint,LEVEL_ORDER,levelFor,median} from './StressEngine';

export type DiaryEntry={id:string;body:string;mood:string|null;intensity:number|null;energy_level:string|null;stress_factors:string[];occurred_at:string};
const AUTO_BODIES=['Mood check-in','Watch mood check-in'];
const FACTORS=['Work','Sleep','Relationships','Caffeine','Exercise','Hydration','Health','Other'];
const TIPS:Record<string,string>={
 Work:'Try a one-minute breathing break before your busiest meetings.',
 Sleep:'A consistent bedtime is one of the strongest levers for HRV.',
 Caffeine:'Try keeping caffeine before 2pm and notice how your evenings feel.',
 Hydration:'Keep water within reach. Mild dehydration can raise heart rate.',
 Exercise:'Short walks tend to help; very hard sessions can lower HRV the next day.',
 Relationships:'Reaching out to someone you trust can take the edge off.',
 Health:'If symptoms persist, consider checking in with a healthcare professional.',
 Other:'Keep logging, and patterns become clearer after a week or two.'
};
const PROMPTS:Record<StressLevel|'none',string>={
 great:'What went well today?',normal:"What's one thing you're grateful for today?",
 elevated:"What's on your mind right now?",overload:'What feels heaviest right now? Name it, then breathe.',none:'How are you feeling right now?'
};
const dayKey=(d:Date)=>d.toDateString();

export function stressAt(points:StressPoint[],iso:string){
 const t=new Date(iso).getTime();let best:StressPoint|null=null,gap=3*3600000;
 for(const p of points){const g=Math.abs(new Date(p.at).getTime()-t);if(g<=gap){gap=g;best=p}}
 return best;
}

export function diaryInsights(entries:DiaryEntry[],points:StressPoint[]){
 const tagged=entries.map(e=>({e,p:stressAt(points,e.occurred_at)})).filter(x=>x.p);
 const byFactor=new Map<string,number[]>();
 tagged.forEach(({e,p})=>(e.stress_factors||[]).forEach(f=>byFactor.set(f,[...(byFactor.get(f)||[]),p!.score])));
 const overall=median(tagged.map(x=>x.p!.score));
 const rows=[...byFactor.entries()].filter(([,v])=>v.length>=2).map(([factor,scores])=>({factor,count:scores.length,high:scores.filter(s=>s>=60).length,avg:Math.round(median(scores)!)}));
 return {rows:rows.sort((a,b)=>b.avg-a.avg).slice(0,4),overall:overall===null?null:Math.round(overall),tagged:tagged.length};
}

export function weeklySummary(entries:DiaryEntry[],points:StressPoint[]){
 const since=Date.now()-7*86400000;
 const days=new Map<string,{date:Date;scores:number[]}>();
 points.filter(p=>new Date(p.at).getTime()>=since).forEach(p=>{const d=new Date(p.at),k=dayKey(d);const cur=days.get(k)||{date:d,scores:[]};cur.scores.push(p.score);days.set(k,cur)});
 const daily=[...days.values()].map(d=>({date:d.date,score:Math.round(median(d.scores)!)})).sort((a,b)=>a.score-b.score);
 const week=entries.filter(e=>new Date(e.occurred_at).getTime()>=since);
 const counts=new Map<string,number>();week.forEach(e=>(e.stress_factors||[]).forEach(f=>counts.set(f,(counts.get(f)||0)+1)));
 const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([f])=>f);
 return {best:daily[0]||null,hardest:daily.length>1?daily[daily.length-1]:null,entries:week.length,top,tip:top[0]?TIPS[top[0]]||TIPS.Other:TIPS.Other};
}

const weekday=(d:Date)=>d.toLocaleDateString(undefined,{weekday:'long'});

export default function StressDiary({entries,onChanged,onAsk}:{entries:DiaryEntry[];onChanged:()=>Promise<void>|void;onAsk?:(text:string)=>void}){
 const {points,today}=useStress();
 const [filter,setFilter]=useState<StressLevel|'all'>('all');
 const [draft,setDraft]=useState(''),[tags,setTags]=useState<string[]>([]),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<string|null>(null),[editText,setEditText]=useState('');
 const insights=useMemo(()=>diaryInsights(entries,points),[entries,points]);
 const summary=useMemo(()=>weeklySummary(entries,points),[entries,points]);
 const annotated=useMemo(()=>entries.map(e=>({e,p:stressAt(points,e.occurred_at)})),[entries,points]);
 const shown=annotated.filter(x=>filter==='all'||x.p?.level===filter);
 const groups:{key:string;date:Date;items:typeof shown}[]=[];
 shown.forEach(x=>{const d=new Date(x.e.occurred_at),k=dayKey(d);const g=groups.find(g=>g.key===k);if(g)g.items.push(x);else groups.push({key:k,date:d,items:[x]})});

 async function uid(){const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');return user.id}
 async function save(){
  const body=draft.trim();if(!body)return;setBusy(true);
  try{const {error}=await supabase.from('wellness_journal').insert({user_id:await uid(),body,entry_type:'reflection',stress_factors:tags});if(error)throw error;setDraft('');setTags([]);await onChanged()}
  catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}finally{setBusy(false)}
 }
 async function saveEdit(id:string){
  const body=editText.trim();if(!body)return;setBusy(true);
  try{const {error}=await supabase.from('wellness_journal').update({body}).eq('id',id).eq('user_id',await uid());if(error)throw error;setEditing(null);await onChanged()}
  catch(e:any){Alert.alert('Could not update',e?.message||'Try again.')}finally{setBusy(false)}
 }
 function remove(id:string){
  Alert.alert('Delete entry?','This removes it from your diary permanently.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{
   try{const {error}=await supabase.from('wellness_journal').delete().eq('id',id).eq('user_id',await uid());if(error)throw error;await onChanged()}catch(e:any){Alert.alert('Could not delete',e?.message||'Try again.')}
  }}]);
 }

 return <View style={{gap:12}}>
  <View style={[st.card,{backgroundColor:SW.mint}]}>
   <View style={st.row}><Ionicons name="calendar" size={18} color={SW.green}/><Text style={st.title}>Your week</Text></View>
   {summary.best||summary.entries?<>
    <View style={{flexDirection:'row',gap:10}}>
     <Mini label="Calmest day" value={summary.best?weekday(summary.best.date):'—'} color={summary.best?STRESS_LEVELS[levelFor(summary.best.score)].color:SW.muted}/>
     <Mini label="Hardest day" value={summary.hardest?weekday(summary.hardest.date):'—'} color={summary.hardest?STRESS_LEVELS[levelFor(summary.hardest.score)].color:SW.muted}/>
     <Mini label="Entries" value={String(summary.entries)} color={SW.ink}/>
    </View>
    {summary.top.length?<Text style={st.body}>Most logged contributors: <Text style={{fontWeight:'800'}}>{summary.top.join(', ')}</Text></Text>:null}
    <Text style={st.body}>💡 {summary.tip}</Text>
   </>:<Text style={st.muted}>Write a few entries and sync Apple Health. Your weekly recap appears here.</Text>}
  </View>

  {insights.rows.length?<View style={st.card}>
   <View style={st.row}><Ionicons name="analytics" size={18} color={SW.green}/><Text style={st.title}>What drives your stress</Text></View>
   {insights.rows.map(r=><View key={r.factor} style={{gap:5}}>
    <View style={st.between}><Text style={st.factor}>{r.factor}</Text><Text style={[st.muted,{color:STRESS_LEVELS[levelFor(r.avg)].color,fontWeight:'800'}]}>{STRESS_LEVELS[levelFor(r.avg)].label} · {r.avg}</Text></View>
    <View style={st.track}><View style={{width:`${r.avg}%`,height:8,borderRadius:4,backgroundColor:STRESS_LEVELS[levelFor(r.avg)].color}}/></View>
    <Text style={st.muted}>Logged {r.count}×, {r.high} during Elevated or Overload stress{insights.overall!==null?` (your typical entry: ${insights.overall})`:''}.</Text>
   </View>)}
   <Text style={st.muted}>Based on your stress score within 3 hours of each entry. These are patterns, not causes.</Text>
  </View>:null}

  <View style={st.card}>
   <Text style={st.title}>{PROMPTS[today?.level||'none']}</Text>
   <TextInput style={st.input} multiline value={draft} onChangeText={setDraft} placeholder="Write freely. Only you can see this." placeholderTextColor="#9AA7AD" maxLength={10000}/>
   <View style={st.chips}>{FACTORS.map(f=>{const on=tags.includes(f);return <TouchableOpacity key={f} onPress={()=>setTags(on?tags.filter(x=>x!==f):[...tags,f])} style={[st.chip,on&&{backgroundColor:SW.green}]}><Text style={[st.chipText,on&&{color:'#fff'}]}>{f}</Text></TouchableOpacity>})}</View>
   <TouchableOpacity disabled={busy||!draft.trim()} onPress={()=>void save()} style={[st.button,{opacity:busy||!draft.trim()?0.5:1}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={st.buttonText}>Save entry</Text>}</TouchableOpacity>
  </View>

  <View style={st.chips}>{(['all',...LEVEL_ORDER.slice().reverse()] as const).map(l=><TouchableOpacity key={l} onPress={()=>setFilter(l)} style={[st.chip,filter===l&&{backgroundColor:l==='all'?SW.ink:STRESS_LEVELS[l].color}]}><Text style={[st.chipText,filter===l&&{color:'#fff'}]}>{l==='all'?'All entries':STRESS_LEVELS[l].label}</Text></TouchableOpacity>)}</View>

  {groups.length===0?<View style={st.card}><Text style={st.muted}>{entries.length?'No entries at this stress level.':'No entries yet. Your first reflection starts the timeline.'}</Text></View>:groups.map(g=>{
   const scores=g.items.map(x=>x.p?.score).filter((v):v is number=>v!==undefined);
   const dayScore=scores.length?Math.round(median(scores)!):null;
   return <View key={g.key} style={st.card}>
    <View style={st.between}><Text style={st.title}>{g.date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</Text>
     {dayScore!==null?<View style={[st.pill,{backgroundColor:STRESS_LEVELS[levelFor(dayScore)].tint}]}><Text style={{color:STRESS_LEVELS[levelFor(dayScore)].color,fontWeight:'800',fontSize:12}}>{STRESS_LEVELS[levelFor(dayScore)].label}</Text></View>:null}
    </View>
    {g.items.map(({e,p})=>{const auto=AUTO_BODIES.includes(e.body);const color=p?STRESS_LEVELS[p.level].color:'#D5DDE0';
     return <View key={e.id} style={st.entry}>
      <View style={[st.bar,{backgroundColor:color}]}/>
      <View style={{flex:1,gap:5}}>
       <View style={st.between}>
        <Text style={st.factor}>{e.mood||'Reflection'}{e.intensity?` · ${e.intensity}/10`:''}</Text>
        <Text style={st.muted}>{new Date(e.occurred_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</Text>
       </View>
       {editing===e.id?<>
        <TextInput style={st.input} multiline value={editText} onChangeText={setEditText} autoFocus maxLength={10000}/>
        <View style={{flexDirection:'row',gap:8}}><TouchableOpacity onPress={()=>void saveEdit(e.id)} style={[st.small,{backgroundColor:SW.green}]}><Text style={{color:'#fff',fontWeight:'800'}}>Save</Text></TouchableOpacity><TouchableOpacity onPress={()=>setEditing(null)} style={st.small}><Text style={{fontWeight:'800',color:SW.ink}}>Cancel</Text></TouchableOpacity></View>
       </>:auto?<Text style={st.muted}>{e.body}</Text>:<Text style={st.body}>{e.body}</Text>}
       <View style={st.chips}>
        {p?<View style={[st.tag,{backgroundColor:STRESS_LEVELS[p.level].tint}]}><Text style={[st.tagText,{color}]}>Stress {STRESS_LEVELS[p.level].label} · {p.score} · HRV {Math.round(p.hrv)}ms</Text></View>:null}
        {(e.stress_factors||[]).map(f=><View key={f} style={st.tag}><Text style={st.tagText}>{f}</Text></View>)}
        {e.energy_level&&e.energy_level!=='neutral'?<View style={st.tag}><Text style={st.tagText}>{e.energy_level==='tired'?'Tired':'Energized'}</Text></View>:null}
       </View>
       {editing!==e.id?<View style={{flexDirection:'row',gap:16}}>
        {onAsk?<TouchableOpacity onPress={()=>onAsk(`Help me reflect on this diary entry from ${new Date(e.occurred_at).toLocaleString()}: "${e.body.slice(0,500)}"${e.mood?` (mood: ${e.mood})`:''}${p?` My stress level then was ${STRESS_LEVELS[p.level].label}.`:''}`)}><Text style={st.link}>Ask MoodPal</Text></TouchableOpacity>:null}
        {!auto?<TouchableOpacity onPress={()=>{setEditing(e.id);setEditText(e.body)}}><Text style={st.link}>Edit</Text></TouchableOpacity>:null}
        <TouchableOpacity onPress={()=>remove(e.id)}><Text style={[st.link,{color:'#C2546B'}]}>Delete</Text></TouchableOpacity>
       </View>:null}
      </View>
     </View>})}
   </View>})}
 </View>;
}

function Mini({label,value,color}:{label:string;value:string;color:string}){return <View style={{flex:1,backgroundColor:'#fff',borderRadius:14,padding:10,gap:3}}><Text style={st.muted}>{label}</Text><Text style={{fontSize:14,fontWeight:'800',color}} numberOfLines={1}>{value}</Text></View>}

const st=StyleSheet.create({
 card:{backgroundColor:'#fff',borderRadius:22,padding:16,gap:11},row:{flexDirection:'row',alignItems:'center',gap:7},between:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 title:{fontSize:16,fontWeight:'800',color:SW.ink,flexShrink:1},body:{fontSize:13,lineHeight:19,color:SW.ink},muted:{fontSize:11,lineHeight:16,color:SW.muted},factor:{fontSize:14,fontWeight:'800',color:SW.ink},
 track:{height:8,borderRadius:4,backgroundColor:'#EEF3F0'},input:{backgroundColor:SW.bg,borderRadius:14,padding:12,minHeight:70,color:SW.ink,textAlignVertical:'top',fontSize:13},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:6},chip:{backgroundColor:'#EEF3F0',borderRadius:14,paddingHorizontal:11,paddingVertical:7},chipText:{fontSize:12,fontWeight:'700',color:SW.ink},
 button:{backgroundColor:SW.green,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'800'},
 pill:{borderRadius:12,paddingHorizontal:10,paddingVertical:4},entry:{flexDirection:'row',gap:10,paddingTop:10,borderTopWidth:1,borderTopColor:'#EEF3F0'},bar:{width:4,borderRadius:2},
 tag:{backgroundColor:'#F1F5F3',borderRadius:10,paddingHorizontal:8,paddingVertical:4},tagText:{fontSize:10,fontWeight:'700',color:SW.muted},link:{fontSize:12,fontWeight:'800',color:SW.green},
 small:{borderRadius:10,paddingHorizontal:14,paddingVertical:8,backgroundColor:'#EEF3F0'}
});
