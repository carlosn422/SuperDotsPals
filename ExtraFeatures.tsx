import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const purple='#6536D9', ink='#25145C', muted='#8276A5';
function Panel({title,children}:{title:string;children:React.ReactNode}) {
 return <View style={s.panel}><Text style={s.title}>{title}</Text>{children}</View>;
}
export function CurrentHRV() {
 return <Panel title="Latest HRV reading"><View style={s.row}><View style={{flex:1}}><Text style={s.value}>67 ms</Text><Text style={s.sub}>Latest sample · 2:35 PM</Text></View><Text style={s.pill}>Above baseline</Text></View><Text style={s.sub}>30-day sample baseline: 54 ms. HRV alone does not diagnose stress.</Text></Panel>;
}
export function ExtraWellness() {
 const [minutes,setMinutes]=useState(3);
 const [noise,setNoise]=useState<'Quiet'|'Moderate'|'Loud'>('Quiet');
 return <Panel title="Mindfulness & environment"><View style={s.row}><View style={s.tile}><Text style={s.emoji}>🪷</Text><Text style={s.value}>{minutes} min</Text><Text style={s.sub}>Mindfulness today</Text><TouchableOpacity onPress={()=>setMinutes(m=>m+1)} style={s.action}><Text style={s.actionText}>+ Log minute</Text></TouchableOpacity></View><View style={s.tile}><Text style={s.emoji}>🔉</Text><Text style={s.value}>{noise}</Text><Text style={s.sub}>Sample noise level</Text><TouchableOpacity onPress={()=>setNoise(n=>n==='Quiet'?'Moderate':n==='Moderate'?'Loud':'Quiet')} style={s.action}><Text style={s.actionText}>Change sample</Text></TouchableOpacity></View></View><Text style={s.sub}>Noise is simulated, not measured by a microphone.</Text></Panel>;
}
const feelings=[['Amazed','🤩'],['Excited','🥳'],['Grateful','🥰'],['Joyful','😊'],['Satisfied','🙂'],['Hopeful','🌞'],['Amused','😆'],['Passionate','💗'],['Calm','😌'],['Overwhelmed','😵‍💫'],['Sad','🥺'],['Tense','😣']];
export function EmotionCheckin(){
 const [mood,setMood]=useState('');
 return <Panel title="How are you really feeling?"><View style={s.grid}>{feelings.map(([label,emoji])=><TouchableOpacity key={label} onPress={()=>setMood(label)} style={[s.feeling,mood===label&&s.selected]}><Text style={s.emoji}>{emoji}</Text><Text style={s.feelingText}>{label}</Text></TouchableOpacity>)}</View><Text style={s.sub}>{mood?'Logged '+mood.toLowerCase()+' for this session.':'Tap an emotion to check in.'}</Text></Panel>;
}
const explanations:Record<string,string>={
 'What does my HRV mean?':'Your fictional HRV reading is 67 ms, versus a sample baseline of 54 ms. Trends are more informative than isolated values.',
 'Why is stress elevated?':'Our sample graph shows an afternoon spike. Sleep, training, illness and other factors can affect readings; this example cannot establish a cause.',
 'How can I recover?':'A gentle walk, adequate sleep, hydration or a mindful breathing break may support general wellbeing.'
};
export function CoachDemo(){
 const [question,setQuestion]=useState(Object.keys(explanations)[0]);
 return <Panel title="Ask your little wellness buddy"><Text style={s.sub}>Preset sample explanations · No live AI is connected.</Text>{Object.keys(explanations).map(q=><TouchableOpacity key={q} style={[s.question,q===question&&s.selected]} onPress={()=>setQuestion(q)}><Text style={s.questionText}>{q} →</Text></TouchableOpacity>)}<View style={s.answer}><Text style={s.answerTitle}>✦ Superdots explains</Text><Text style={s.answerBody}>{explanations[question]}</Text></View></Panel>;
}
export function WidgetPreview(){
 const [metric,setMetric]=useState('HRV');
 return <Panel title="Widget & watch previews"><Text style={s.sub}>Visual concepts only, not installed iOS widgets or watch faces.</Text><View style={s.row}>{['HRV','Stress','Sleep'].map(t=><TouchableOpacity onPress={()=>setMetric(t)} key={t} style={[s.selector,metric===t&&s.selected]}><Text style={s.questionText}>{t}</Text></TouchableOpacity>)}</View><View style={s.widget}><Text style={s.widgetLabel}>SUPERDOTS ✦</Text><Text style={s.emoji}>{metric==='HRV'?'💜':metric==='Stress'?'🫧':'🌙'}</Text><Text style={s.widgetValue}>{metric==='HRV'?'67 ms':metric==='Stress'?'Low':'7h 42m'}</Text><Text style={s.widgetLabel}>{metric} · sample</Text></View></Panel>;
}
const s=StyleSheet.create({
 panel:{backgroundColor:'#fff',padding:19,borderRadius:23,gap:13},title:{color:ink,fontWeight:'800',fontSize:17},row:{flexDirection:'row',gap:10,alignItems:'center'},
 value:{color:ink,fontSize:24,fontWeight:'900'},sub:{color:muted,fontSize:11,lineHeight:17},pill:{color:purple,backgroundColor:'#EFE7FF',padding:10,borderRadius:14,fontSize:11,fontWeight:'800'},
 tile:{flex:1,padding:12,backgroundColor:'#F4EFFF',borderRadius:17},emoji:{fontSize:24},action:{backgroundColor:'#E5D9FF',borderRadius:10,padding:9,alignSelf:'flex-start',marginTop:10},actionText:{fontSize:10,color:purple,fontWeight:'800'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:7},feeling:{width:'31%',borderRadius:14,alignItems:'center',backgroundColor:'#F7F3FF',padding:11,borderWidth:1,borderColor:'transparent',gap:5},selected:{borderColor:purple,backgroundColor:'#EDE4FF'},feelingText:{fontSize:10,fontWeight:'700',color:ink},
 question:{backgroundColor:'#F7F3FF',borderRadius:12,padding:12},questionText:{color:ink,fontSize:12,fontWeight:'700'},answer:{backgroundColor:'#EDE6FF',padding:14,borderRadius:15,gap:7},answerTitle:{color:purple,fontWeight:'800'},answerBody:{color:ink,fontSize:12,lineHeight:19},selector:{flex:1,alignItems:'center',padding:11,backgroundColor:'#F4F0FC',borderRadius:12},widget:{backgroundColor:'#201449',borderRadius:23,padding:22,alignItems:'center',gap:9},widgetLabel:{color:'#C5B2FF',fontSize:11,fontWeight:'700'},widgetValue:{color:'white',fontSize:32,fontWeight:'900'}
});
