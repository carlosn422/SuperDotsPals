import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';

const ink='#25145C',muted='#8276A5',deep='#5D31D1',line='#EEE8FA';
function Tile({icon,title,value,detail,tint}:{icon:string;title:string;value:string;detail:string;tint:string}) {
 return <View style={[s.tile,{backgroundColor:tint}]}><Text style={s.icon}>{icon}</Text><Text style={s.tileTitle}>{title}</Text><Text style={s.value}>{value}</Text><Text style={s.detail}>{detail}</Text></View>
}
export function LifestyleOverview(){
 const [workout,setWorkout]=useState('Walking');
 const workouts=['Walking','Running','Cycling'];
 const zones:Record<string,number[]>={Walking:[70,22,8],Running:[15,40,45],Cycling:[25,52,23]};
 return <View style={s.group}>
  <Text style={s.heading}>Sleep & activity</Text>
  <Text style={s.desc}>Fictional wearable insights for your daily routine.</Text>
  <View style={s.grid}>
   <Tile icon="☾" title="Sleep" value="7h 42m" detail="86 / 100 · Good rest" tint="#EEE9FB"/>
   <Tile icon="☀" title="Daylight" value="54 min" detail="Outdoor time today" tint="#FFF1DD"/>
   <Tile icon="♟" title="Steps" value="8,462" detail="84% of sample goal" tint="#E3F7EC"/>
   <Tile icon="♡" title="Movement" value="38 min" detail="Moderate activity" tint="#FCE9ED"/>
  </View>
  <View style={s.panel}><Text style={s.panelTitle}>Sleep stages</Text>
   <View style={s.sleepRow}><View style={[s.sleepPart,{flex:18,backgroundColor:'#675FAD'}]}/><View style={[s.sleepPart,{flex:51,backgroundColor:'#AC9DE2'}]}/><View style={[s.sleepPart,{flex:26,backgroundColor:'#6BBDD5'}]}/><View style={[s.sleepPart,{flex:5,backgroundColor:'#FAC097'}]}/></View>
   <View style={s.keyRow}><Text style={s.key}>● Deep 18%</Text><Text style={s.key}>● Core 51%</Text><Text style={s.key}>● REM 26%</Text><Text style={s.key}>● Awake 5%</Text></View>
   <Text style={s.note}>Illustrative sleep-stage breakdown, not a measured result.</Text>
  </View>
  <View style={s.panel}><Text style={s.panelTitle}>Workout intensity</Text><View style={s.options}>{workouts.map(w=><TouchableOpacity key={w} onPress={()=>setWorkout(w)} style={[s.option,workout===w&&s.optionSelected]}><Text style={[s.optionText,workout===w&&s.selectedText]}>{w}</Text></TouchableOpacity>)}</View>
   <View style={s.zoneRow}>{zones[workout].map((n,i)=><View key={i} style={{flex:n,height:17,backgroundColor:['#75CEA8','#F3BD7D','#F18D98'][i],borderRadius:4}} />)}</View>
   <View style={s.legend}><Text style={s.key}>Easy {zones[workout][0]}%</Text><Text style={s.key}>Moderate {zones[workout][1]}%</Text><Text style={s.key}>Hard {zones[workout][2]}%</Text></View>
   <Text style={s.note}>Tap an activity to preview example heart-rate zones.</Text>
  </View>
 </View>
}
export function ThemePicker(){
 const [theme,setTheme]=useState('Grape');
 return <View style={s.panel}><Text style={s.panelTitle}>Companion themes</Text><Text style={s.desc}>Preview an original character palette. Watch-face customization will require a separate watchOS implementation.</Text><View style={s.options}>{[{name:'Grape',bg:'#8355FF'},{name:'Peach',bg:'#F5BE96'},{name:'Lilac',bg:'#A69BE4'}].map(t=><TouchableOpacity key={t.name} onPress={()=>setTheme(t.name)} style={[s.theme,theme===t.name&&s.themeSelected]}><View style={[s.dot,{backgroundColor:t.bg}]}><Text style={{fontSize:23}}>☺</Text></View><Text style={s.optionText}>{t.name}</Text>{theme===t.name?<Text style={{fontSize:10,color:deep,fontWeight:'800'}}>Selected</Text>:null}</TouchableOpacity>)}</View></View>
}
const s=StyleSheet.create({
 group:{gap:12},heading:{color:ink,fontSize:20,fontWeight:'900'},desc:{color:muted,fontSize:12,lineHeight:19},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},tile:{width:'48%',borderRadius:20,padding:17,minHeight:150},icon:{fontSize:23,color:deep},tileTitle:{color:muted,fontSize:12,fontWeight:'700',marginTop:9},value:{fontSize:22,color:ink,fontWeight:'900',marginTop:4},detail:{color:muted,fontSize:11,marginTop:5},panel:{backgroundColor:'#fff',borderRadius:23,padding:18,gap:12},panelTitle:{color:ink,fontWeight:'800',fontSize:16},sleepRow:{height:18,flexDirection:'row',gap:3},sleepPart:{borderRadius:4},keyRow:{flexDirection:'row',flexWrap:'wrap',gap:10},key:{fontSize:10,color:muted},note:{fontSize:11,color:muted,lineHeight:16},options:{flexDirection:'row',gap:7},option:{backgroundColor:'#F1F6F2',paddingHorizontal:13,paddingVertical:9,borderRadius:12},optionSelected:{backgroundColor:'#EBE4FF'},optionText:{fontSize:11,fontWeight:'700',color:ink},selectedText:{color:deep},zoneRow:{flexDirection:'row',gap:4},legend:{flexDirection:'row',justifyContent:'space-between'},theme:{flex:1,alignItems:'center',borderWidth:2,borderColor:'transparent',padding:8,borderRadius:14,gap:6},themeSelected:{borderColor:'#8355FF'},dot:{height:49,width:49,borderRadius:25,alignItems:'center',justifyContent:'center'}
});
