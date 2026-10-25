import React,{useMemo,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {CIRCLE_MOODS,CircleMood,MOOD_TINTS} from './LittleSignalsData';
import {MoodPalThumb} from './CircleComponents';

export type TimelineMood={mood:string;occurred_at:string};
export type TimelineReaction={id:string;mood:string;shared_at:string;reactor_name:string;emoji:string;reacted_at:string};
type Reaction={id:string;name:string;emoji:string;at:string};
type MoodEvent={key:string;mood:CircleMood;at:string;reactions:Reaction[]};
type Bubble={emoji:string;count:number;name:string;at:string};

export const RETENTION_DAYS=7;
const ink='#251C45',muted='#807694',purple='#6953CA';
const DAY_MS=864e5;
// A mood picked on the watch is shared within moments; reactions belong to that share.
const SHARE_WINDOW_BEFORE_MS=60e3,SHARE_WINDOW_AFTER_MS=10*60e3;

function circleMood(m:string):CircleMood{const c=m.charAt(0).toUpperCase()+m.slice(1).toLowerCase();return (CIRCLE_MOODS as readonly string[]).includes(c)?c as CircleMood:'Calm'}
function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x}
const time=(iso:string)=>new Date(iso).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});

// Each journal mood is one event. Its reactions are those on the share made for that mood, grouped by share, never by emotion alone.
export function buildMoodEvents(moods:TimelineMood[],reactions:TimelineReaction[]):MoodEvent[]{
 const shares=new Map<string,{mood:string;sharedAt:number;reactions:Reaction[]}>();
 for(const r of reactions){const key=r.mood.toLowerCase()+'|'+r.shared_at;const s=shares.get(key)||{mood:r.mood.toLowerCase(),sharedAt:Date.parse(r.shared_at),reactions:[]};s.reactions.push({id:r.id,name:r.reactor_name,emoji:r.emoji,at:r.reacted_at});shares.set(key,s)}
 const used=new Set<string>();
 return moods.map(m=>{
  const at=Date.parse(m.occurred_at);let best:string|null=null,gap=Infinity;
  shares.forEach((s,key)=>{const d=s.sharedAt-at;if(used.has(key)||s.mood!==m.mood.toLowerCase()||d<-SHARE_WINDOW_BEFORE_MS||d>SHARE_WINDOW_AFTER_MS)return;if(Math.abs(d)<gap){gap=Math.abs(d);best=key}});
  if(best)used.add(best);
  return {key:m.occurred_at,mood:circleMood(m.mood),at:m.occurred_at,reactions:best?shares.get(best)!.reactions:[]};
 });
}

export function reactionBubbles(reactions:Reaction[]):Bubble[]{
 const by=new Map<string,Reaction[]>();
 for(const r of reactions)by.set(r.emoji,[...(by.get(r.emoji)||[]),r]);
 return [...by.entries()].map(([emoji,list])=>{const latest=list.reduce((a,b)=>Date.parse(b.at)>Date.parse(a.at)?b:a);return {emoji,count:list.length,name:latest.name+(list.length>1?' +'+(list.length-1):''),at:latest.at}})
  .sort((a,b)=>b.count-a.count||Date.parse(b.at)-Date.parse(a.at));
}

function ReactionSummary({reactions}:{reactions:Reaction[]}){
 const bubbles=reactionBubbles(reactions);if(!bubbles.length)return <Text style={st.sub}>No reactions</Text>;
 const shown=bubbles.slice(0,3),more=bubbles.slice(3).reduce((n,b)=>n+b.count,0);
 return <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>
  {shown.map(b=><View key={b.emoji} style={st.chip}><Text style={{fontSize:15}}>{b.emoji}</Text><Text style={st.chipText}>{b.count}</Text></View>)}
  {more?<View style={st.chip}><Text style={st.chipText}>+{more}</Text></View>:null}
 </View>;
}

function MoodReactionDetails({event,onBack}:{event:MoodEvent;onBack:()=>void}){
 const bubbles=reactionBubbles(event.reactions),t=MOOD_TINTS[event.mood],date=new Date(event.at);
 return <View style={{gap:14}}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={st.back}><Ionicons name="chevron-back" size={22} color={ink}/></TouchableOpacity>
  <View style={{alignItems:'center',gap:4}}>
   <MoodPalThumb mood={event.mood} size={120} animate/>
   <Text style={[st.title,{fontSize:24}]}>{event.mood} Reactions</Text>
   <Text style={st.sub}>{date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · {time(event.at)}</Text>
  </View>
  <View style={st.card}>
   <View style={[st.chip,{alignSelf:'flex-start',backgroundColor:t.tint}]}><Text style={[st.chipText,{color:t.color}]}>{event.reactions.length} total reaction{event.reactions.length===1?'':'s'}</Text></View>
   {bubbles.length?<View style={{flexDirection:'row',flexWrap:'wrap',marginHorizontal:-4}}>
    {bubbles.map(b=><View key={b.emoji} accessible accessibilityLabel={b.emoji+' '+b.count+' from '+b.name+' at '+time(b.at)} style={{width:'33.333%',padding:4}}>
     <View style={st.bubbleCell}>
      <View style={[st.bubble,{backgroundColor:t.tint}]}><Text style={{fontSize:34}}>{b.emoji}</Text></View>
      <Text style={[st.chipText,{color:t.color}]}>{b.count}</Text>
      <Text numberOfLines={1} style={{fontWeight:'800',color:ink}}>{b.name}</Text>
      <Text style={st.sub}>{time(b.at)}</Text>
     </View>
    </View>)}
   </View>:<Text style={st.sub}>No reactions to this mood.</Text>}
  </View>
 </View>;
}

export default function FamilyTimeline({name,moods,reactions}:{name:string;moods:TimelineMood[];reactions:TimelineReaction[]}){
 const [dayOffset,setDayOffset]=useState(0),[openKey,setOpenKey]=useState<string|null>(null);
 const today=startOfDay(new Date());
 const days=Array.from({length:RETENTION_DAYS},(_,i)=>new Date(today.getTime()-(RETENTION_DAYS-1-i)*DAY_MS));
 const events=useMemo(()=>buildMoodEvents(moods,reactions),[moods,reactions]);
 const day=new Date(today.getTime()-dayOffset*DAY_MS),next=day.getTime()+DAY_MS;
 const dayEvents=events.filter(e=>{const t=Date.parse(e.at);return t>=day.getTime()&&t<next});
 const open=events.find(e=>e.key===openKey);
 if(open)return <MoodReactionDetails event={open} onBack={()=>setOpenKey(null)}/>;
 const step=(d:number)=>setDayOffset(o=>Math.min(RETENTION_DAYS-1,Math.max(0,o+d)));
 return <View style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous day" disabled={dayOffset>=RETENTION_DAYS-1} onPress={()=>step(1)} style={[st.back,dayOffset>=RETENTION_DAYS-1&&{opacity:.35}]}><Ionicons name="chevron-back" size={20} color={ink}/></TouchableOpacity>
   <View style={{alignItems:'center',flex:1}}><Text numberOfLines={1} style={st.title}>{name}'s Day</Text><Text style={st.sub}>{day.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</Text></View>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next day" disabled={dayOffset===0} onPress={()=>step(-1)} style={[st.back,dayOffset===0&&{opacity:.35}]}><Ionicons name="chevron-forward" size={20} color={ink}/></TouchableOpacity>
  </View>
  <View style={{flexDirection:'row',gap:5}}>
   {days.map((d,i)=>{const off=RETENTION_DAYS-1-i,sel=off===dayOffset;return <TouchableOpacity key={d.toISOString()} accessibilityRole="button" accessibilityState={{selected:sel}} accessibilityLabel={d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})} onPress={()=>setDayOffset(off)} style={[st.dayChip,sel&&{backgroundColor:purple,borderColor:purple}]}>
    <Text style={[st.dayMonth,sel&&{color:'white'}]}>{d.toLocaleDateString(undefined,{month:'short'})}</Text>
    <Text style={[st.dayNum,sel&&{color:'white'}]}>{d.getDate()}</Text>
    {off===0?<Text style={[st.dayMonth,{color:sel?'white':purple}]}>Today</Text>:null}
   </TouchableOpacity>})}
  </View>
  {dayEvents.length?dayEvents.map((e,i)=><View key={e.key} style={{flexDirection:'row',gap:10}}>
   <View style={{width:62,alignItems:'center'}}>
    <Text style={[st.sub,{fontSize:11}]}>{time(e.at)}</Text>
    <View style={[st.dot,{backgroundColor:MOOD_TINTS[e.mood].color}]}/>
    {i<dayEvents.length-1?<View style={[st.line,{backgroundColor:MOOD_TINTS[e.mood].color}]}/>:null}
   </View>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={e.mood+' at '+time(e.at)+', '+e.reactions.length+' reactions'} onPress={()=>setOpenKey(e.key)} style={[st.card,{flex:1,marginBottom:8}]}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
     <View style={{backgroundColor:MOOD_TINTS[e.mood].tint,borderRadius:30}}><MoodPalThumb mood={e.mood} size={52}/></View>
     <View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:16,color:ink}}>{e.mood}</Text><Text style={st.sub}>{time(e.at)}</Text></View>
     <Ionicons name="chevron-forward" size={18} color={muted}/>
    </View>
    <ReactionSummary reactions={e.reactions}/>
   </TouchableOpacity>
  </View>):<View style={st.card}><Text style={st.sub}>No mood changes on this day.</Text></View>}
 </View>;
}

const st=StyleSheet.create({
 title:{fontWeight:'900',fontSize:20,color:ink},sub:{fontSize:12,lineHeight:18,color:muted},
 card:{backgroundColor:'white',borderRadius:16,padding:12,gap:8,borderWidth:1,borderColor:'#EDE9F3'},
 back:{width:40,height:40,borderRadius:20,backgroundColor:'white',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#EDE9F3'},
 chip:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#F4F1FA',borderRadius:14,paddingHorizontal:10,paddingVertical:4},
 chipText:{fontWeight:'800',fontSize:13,color:'#5B5275'},
 dayChip:{flex:1,alignItems:'center',paddingVertical:7,borderRadius:12,borderWidth:1,borderColor:'#EDE9F3',backgroundColor:'white'},
 dayMonth:{fontSize:10,color:muted,fontWeight:'700'},dayNum:{fontSize:16,fontWeight:'800',color:ink},
 dot:{width:12,height:12,borderRadius:6,marginTop:6},line:{width:2,flex:1,opacity:.5,marginTop:2},
 bubbleCell:{alignItems:'center',gap:2,paddingVertical:10,borderRadius:16,backgroundColor:'#FBFAFD'},
 bubble:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center'},
});
