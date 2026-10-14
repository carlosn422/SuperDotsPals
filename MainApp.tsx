import React, { useMemo, useState, useEffect } from 'react';
import { StatusBar, ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {supabase} from './supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Rect, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import {LifestyleOverview, ThemePicker} from './LifestyleFeatures';
import {CurrentHRV,ExtraWellness,EmotionCheckin,CoachDemo,WidgetPreview} from './ExtraFeatures';

type Tab = 'Today' | 'Trends' | 'Habits' | 'You';
type Period = 'Day' | 'Week' | 'Month' | 'Year';
type Mood = 'Calm' | 'Okay' | 'Anxious' | 'Happy' | 'Tired';
const C = { ink:'#25145C', muted:'#8276A5', green:'#7644F5', deep:'#5D31D1', surface:'#FFFFFF', bg:'#F8F6FF', mint:'#EBE4FF', peach:'#FFF0DE', orange:'#F4A570', lilac:'#F0EBFF', purple:'#A997FA', line:'#EEE8FA', red:'#EC7D8C' };
const hrvDay = [40,48,44,58,53,64,48,74,62,55,67,58,78,71,57,60,82,69];
const hrvWeek = [42,48,55,44,63,59,72,67,61,74,70,78,64,76];
const hrvMonth = [41,46,44,49,54,50,61,58,55,66,63,72,67,73];
const hrvYear = [38,42,40,49,45,54,57,53,60,63,61,69];
const stressDay = [16,20,14,12,23,17,26,39,61,49,70,55,42,32,57,48,28,22,35,16,19,14,10,17];
const tabs: {name:Tab; icon:'home'|'stats-chart'|'heart'|'person-circle'; outline:'home-outline'|'stats-chart-outline'|'heart-outline'|'person-circle-outline'}[] = [{name:'Today',icon:'home',outline:'home-outline'},{name:'Trends',icon:'stats-chart',outline:'stats-chart-outline'},{name:'Habits',icon:'heart',outline:'heart-outline'},{name:'You',icon:'person-circle',outline:'person-circle-outline'}];

function Card({children,style}: {children:React.ReactNode;style?:any}) { return <View style={[s.card,style]}>{children}</View>; }
function Chip({label,active,onPress}: {label:string;active:boolean;onPress:()=>void}) { return <TouchableOpacity onPress={onPress} style={[s.chip,active&&s.chipActive]}><Text style={[s.chipText,active&&s.chipTextActive]}>{label}</Text></TouchableOpacity>; }
function Heading({title,detail}: {title:string;detail?:string}) {return <View style={s.sectionHeader}><Text style={s.sectionTitle}>{title}</Text>{detail?<Text style={s.sectionDetail}>{detail}</Text>:null}</View>;}
function Sparkline({values,color=C.green,height=112,filled=false}: {values:number[];color?:string;height?:number;filled?:boolean}) {
 const width=310,pad=12,min=Math.min(...values)-8,max=Math.max(...values)+8;
 const p=values.map((v,i)=>[pad+(i/(values.length-1))*(width-pad*2), height-pad-(v-min)/(max-min)*(height-pad*2)]);
 const d=p.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
 return <Svg viewBox={'0 0 '+width+' '+height} width="100%" height={height}>
  {[0.25,0.5,0.75].map((v,i)=><Line key={i} x1="0" y1={height*v} x2={width} y2={height*v} stroke={C.line} strokeDasharray="4 5"/>)}
  {filled?<Path d={d+' L '+p[p.length-1][0]+' '+height+' L '+p[0][0]+' '+height+' Z'} fill={C.mint} opacity={0.7}/>:null}
  <Path d={d} stroke={color} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  <Circle cx={p[p.length-1][0]} cy={p[p.length-1][1]} r="5" fill={color} stroke="#fff" strokeWidth="2"/>
 </Svg>;
}
function StressChart() {return <Svg width="100%" height="104" viewBox="0 0 310 104">
 {[0,1,2].map(i=><Line key={i} x1="0" y1={20+i*30} x2="310" y2={20+i*30} stroke={C.line} strokeDasharray="4 5"/>)}
 {stressDay.map((v,i)=><Rect key={i} x={5+i*12.6} y={99-v*.88} width={7.5} height={v*.88} rx="3" fill={v>55?C.orange:C.purple} opacity=".87"/>)}
 </Svg>;}
function Friend({size=136,mood='great'}:{size?:number;mood?:'great'|'okay'}) {
 const great=mood==='great';
 return <View style={{height:size+26,alignItems:'center',justifyContent:'center'}}>
  <Svg width={size} height={size+20} viewBox="0 0 180 188">
   <Path d="M60 40 L49 20 M119 40 L133 20" stroke="#6945D8" strokeWidth="9" strokeLinecap="round"/>
   <Circle cx="47" cy="17" r="10" fill="#B59CFF"/><Circle cx="135" cy="17" r="10" fill="#B59CFF"/>
   <Path d="M45 139 Q22 150 20 129 M135 139 Q158 150 160 129" stroke="#7048DB" strokeWidth="12" fill="none" strokeLinecap="round"/>
   <Path d="M68 150 L59 172 M112 150 L121 172" stroke="#7048DB" strokeWidth="12" strokeLinecap="round"/>
   <Path d="M90 33 C126 33 153 58 153 96 C153 132 126 159 90 159 C54 159 27 132 27 96 C27 58 54 33 90 33" fill="#8355FF"/>
   <Circle cx="57" cy="61" r="10" fill="#A88CFF" opacity=".7"/><Circle cx="126" cy="130" r="9" fill="#A88CFF" opacity=".6"/>
   <Circle cx="65" cy="89" r="17" fill="#FFFFFF"/><Circle cx="114" cy="89" r="17" fill="#FFFFFF"/>
   <Circle cx="69" cy="90" r="8" fill="#25145C"/><Circle cx="110" cy="90" r="8" fill="#25145C"/>
   <Circle cx="72" cy="87" r="3" fill="#FFFFFF"/><Circle cx="113" cy="87" r="3" fill="#FFFFFF"/>
   <Circle cx="43" cy="114" r="10" fill="#FF9CBF" opacity=".75"/><Circle cx="137" cy="114" r="10" fill="#FF9CBF" opacity=".75"/>
   <Path d={great?"M75 115 Q90 134 106 115":"M77 119 Q90 112 103 119"} stroke="#25145C" strokeWidth="5" fill="none" strokeLinecap="round"/>
   <Path d="M65 43 Q90 28 116 43" stroke="#BCA7FF" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </Svg>
 </View>;
}
function Metric({value,unit,label,sub,color=C.deep}:{value:string;unit:string;label:string;sub:string;color?:string}) {return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><View style={s.metricRow}><Text style={[s.metricValue,{color}]}>{value}</Text><Text style={s.metricUnit}>{unit}</Text></View><Text style={s.metricSub}>{sub}</Text></View>;}
function AppContent() {
 const insets = useSafeAreaInsets();
 const [tab,setTab]=useState<Tab>('Today');
 const [period,setPeriod]=useState<Period>('Day');
 const [mood,setMood]=useState<Mood|' '>(' ');
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('mood_entries').select('mood').eq('user_id',user.id).order('recorded_at',{ascending:false}).limit(1).maybeSingle();if(error){console.warn('Loading mood failed:',error.message);return;}if(alive&&data&&['Calm','Okay','Anxious','Happy','Tired'].includes(data.mood))setMood(data.mood as Mood)})();return()=>{alive=false}},[]);
 const [water,setWater]=useState(4);
 const [coffee,setCoffee]=useState(1);
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('habit_entries').select('habit,amount').eq('user_id',user.id).in('habit',['water','caffeine']).order('recorded_at',{ascending:false}).limit(100);if(error){console.warn('Loading habits failed:',error.message);return;}if(alive&&data){const w=data.find(x=>x.habit==='water');const c=data.find(x=>x.habit==='caffeine');if(w)setWater(Number(w.amount));if(c)setCoffee(Number(c.amount));}})();return()=>{alive=false}},[]);
 const [breathing,setBreathing]=useState(false);
 const [companion,setCompanion]=useState<'happy'|'sleepy'>('happy');
 const [seconds,setSeconds]=useState(60);
 useEffect(()=>{if(!breathing)return;const id=setInterval(()=>setSeconds(v=>{if(v<=1){setBreathing(false);return 60;}return v-1;}),1000);return()=>clearInterval(id);},[breathing]);
 const values=useMemo(()=>period==='Day'?hrvDay:period==='Week'?hrvWeek:period==='Month'?hrvMonth:hrvYear,[period]);
 const go=(t:Tab)=>{setTab(t);setPeriod('Day');};
 async function saveHabit(habit:'water'|'caffeine',amount:number){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('habit_entries').insert({user_id:user.id,habit,amount,unit:'cups'});if(error)console.warn('Save habit failed:',error.message);}
 async function saveMood(m:Mood){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('mood_entries').insert({user_id:user.id,mood:m});if(error)console.warn('Save mood failed:',error.message);}
 return <View style={[s.safe,{paddingTop:Platform.OS==='ios'?insets.top:StatusBar.currentHeight || 0}]}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
  <View style={s.top}><View style={s.brand}><View style={s.logo}><Text style={s.logoText}>✦</Text></View><Text style={s.brandText}>superdots<Text style={{color:C.green}}>.</Text></Text></View><TouchableOpacity accessibilityLabel="Open profile" onPress={()=>go('You')} style={s.avatar}><Text style={{fontSize:18}}>☺</Text></TouchableOpacity></View>
  <ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
  {tab==='Today'? <>
   <View style={s.greeting}><Text style={s.eyebrow}>TUESDAY, OCTOBER 13</Text><Text style={s.mainTitle}>A little check-in <Text style={{color:C.deep}}>for you.</Text></Text><Text style={s.intro}>A tiny buddy for your biggest feelings 💜</Text></View>
   <View style={s.hero}><View style={s.heroBubbles}><View style={s.bubbleOne}/><View style={s.bubbleTwo}/></View><Text style={s.heroTiny}>YOUR DAILY READINESS</Text><TouchableOpacity onPress={()=>setCompanion(v=>v==='happy'?'sleepy':'happy')} accessibilityLabel="Tap your companion to change expression"><Friend mood={companion==='happy'?'great':'okay'}/></TouchableOpacity><Text style={s.heroTitle}>You're doing dot-tastic!</Text><Text style={s.heroDescription}>Your little buddy says: take a happy breath!</Text>
    <View style={s.scale}><View style={[s.scaleSegment,{backgroundColor:'#F398AB'}]}/><View style={[s.scaleSegment,{backgroundColor:'#F8BE8D'}]}/><View style={[s.scaleSegment,{backgroundColor:'#B9BBE9'}]}/><View style={[s.scaleSegment,{backgroundColor:C.green,flex:2.3}]}/><View style={s.scaleDot}/></View>
    <Text style={s.updated}>●  Updated 25 min ago  ·  Sample data</Text>
   </View>
   <View style={s.metricsRow}><Card style={{flex:1,padding:16}}><Metric label="AVERAGE HRV" value="61" unit="ms" sub="↑ 12% vs. baseline"/></Card><Card style={{flex:1,padding:16}}><Metric label="RESTING HEART RATE" value="67" unit="bpm" sub="Within your range" color="#7C80C9"/></Card></View>
   <CurrentHRV/>
   <Card><Heading title="HRV throughout today" detail="View trends →"/><View style={s.chartTop}><Text style={s.chartNumber}>78 <Text style={s.chartUnit}>ms</Text></Text><Text style={s.goodPill}>● Great</Text></View><Sparkline values={hrvDay} filled/><View style={s.axis}><Text style={s.axisText}>6 AM</Text><Text style={s.axisText}>10 AM</Text><Text style={s.axisText}>2 PM</Text><Text style={s.axisText}>6 PM</Text></View></Card>
   <Card><Heading title="Real-time stress" detail="Today"/><View style={s.chartTop}><Text style={s.chartNumber}>26<Text style={s.chartUnit}> / 100</Text></Text><Text style={[s.goodPill,{backgroundColor:C.peach,color:'#BA7946'}]}>● Low stress</Text></View><StressChart/><View style={s.axis}><Text style={s.axisText}>12 AM</Text><Text style={s.axisText}>6 AM</Text><Text style={s.axisText}>12 PM</Text><Text style={s.axisText}>6 PM</Text></View></Card>
   <TouchableOpacity style={s.insight} onPress={()=>go('Trends')}><View style={s.insightIcon}><Text style={{fontSize:23}}>✦</Text></View><View style={{flex:1}}><Text style={s.insightTitle}>A gentle reminder</Text><Text style={s.insightText}>You seem more balanced after a good night's sleep. Keep it up!</Text></View><Text style={s.arrow}>›</Text></TouchableOpacity>
  </>:null}
  {tab==='Trends'? <>
   <Text style={s.eyebrow}>YOUR WELLBEING JOURNEY</Text><Text style={s.mainTitle}>Progress, not perfection.</Text><Text style={s.intro}>See how your body responds over time.</Text>
   <View style={s.period}>{(['Day','Week','Month','Year'] as Period[]).map(p=><Chip key={p} label={p} active={period===p} onPress={()=>setPeriod(p)}/>)}</View>
   <Card style={{marginTop:8}}><Heading title="HRV trend" detail="↗ +12%"/><Text style={s.bigValue}>61 <Text style={s.bigUnit}>ms average</Text></Text><Text style={s.bodyMuted}>A higher HRV can reflect improved recovery.</Text><Sparkline values={values} color={C.green} height={185} filled/><View style={s.axis}><Text style={s.axisText}>{period==='Day'?'Morning':'Start'}</Text><Text style={s.axisText}>Midpoint</Text><Text style={s.axisText}>{period==='Day'?'Evening':'Recent'}</Text></View></Card>
   <Card><Heading title="Stress balance"/><View style={s.balanceRow}><View style={[s.balanceBlock,{backgroundColor:C.mint}]}><Text style={s.balanceValue}>72%</Text><Text style={s.balanceLabel}>Restful</Text></View><View style={[s.balanceBlock,{backgroundColor:C.peach}]}><Text style={s.balanceValue}>28%</Text><Text style={s.balanceLabel}>Elevated</Text></View></View><Text style={s.bodyMuted}>Based on fictional readings for this demo.</Text></Card>
   <LifestyleOverview/>
   <CoachDemo/>
   <Card><Heading title="Your weekly highlights"/><Text style={s.listText}>✦   Your best recovery was on Saturday.</Text><Text style={s.listText}>☾   7h 42m average sleep this week.</Text><Text style={s.listText}>♡   Morning HRV is trending upward.</Text></Card>
  </>:null}
  {tab==='Habits'? <>
   <Text style={s.eyebrow}>SMALL STEPS, BIG CHANGES</Text><Text style={s.mainTitle}>Care for yourself.</Text><Text style={s.intro}>How are you feeling right now?</Text>
   <Card><Heading title="Mood check-in" detail={mood===' '?'Not logged':'Saved ✓'}/><View style={s.moods}>{([{name:'Calm',emoji:'😌'},{name:'Okay',emoji:'🙂'},{name:'Anxious',emoji:'😟'},{name:'Happy',emoji:'🥰'},{name:'Tired',emoji:'😴'}] as {name:Mood;emoji:string}[]).map(m=><TouchableOpacity key={m.name} onPress={()=>{setMood(m.name);void saveMood(m.name)}} style={[s.mood,mood===m.name&&s.moodActive]}><Text style={{fontSize:27}}>{m.emoji}</Text><Text style={s.moodLabel}>{m.name}</Text></TouchableOpacity>)}</View>{mood!==' '?<Text style={s.feedback}>Thanks for checking in. Your {mood.toLowerCase()} mood is logged for this session.</Text>:null}</Card>
   <Card><Heading title="Daily habits" detail="Today"/><View style={s.habitLine}><View><Text style={s.habitTitle}>💧  Water</Text><Text style={s.bodyMuted}>{water} glasses logged</Text></View><View style={s.counter}><TouchableOpacity onPress={()=>{const n=Math.max(0,water-1);setWater(n);void saveHabit('water',n)}}><Text style={s.counterText}>−</Text></TouchableOpacity><Text style={s.counterNumber}>{water}</Text><TouchableOpacity onPress={()=>{const n=water+1;setWater(n);void saveHabit('water',n)}}><Text style={s.counterText}>+</Text></TouchableOpacity></View></View><View style={s.habitLine}><View><Text style={s.habitTitle}>☕  Caffeine</Text><Text style={s.bodyMuted}>{coffee} cups logged</Text></View><View style={s.counter}><TouchableOpacity onPress={()=>{const n=Math.max(0,coffee-1);setCoffee(n);void saveHabit('caffeine',n)}}><Text style={s.counterText}>−</Text></TouchableOpacity><Text style={s.counterNumber}>{coffee}</Text><TouchableOpacity onPress={()=>{const n=coffee+1;setCoffee(n);void saveHabit('caffeine',n)}}><Text style={s.counterText}>+</Text></TouchableOpacity></View></View></Card>
   <LifestyleOverview/>
   <ExtraWellness/>
   <EmotionCheckin/>
   <View style={s.breathe}><Text style={s.breatheOver}>TAKE A MOMENT</Text><Text style={s.breatheTitle}>Just breathe.</Text><Text style={s.breatheBody}>A minute of mindful breathing may help you feel grounded.</Text><View style={s.breatheCircle}><Text style={s.breatheTimer}>{seconds}s</Text><Text style={s.breatheSmall}>{breathing?'Breathe gently':'Ready when you are'}</Text></View><TouchableOpacity style={s.breatheButton} onPress={()=>{setBreathing(v=>!v);if(seconds===0)setSeconds(60);}}><Text style={s.breatheButtonText}>{breathing?'Pause exercise':seconds<60?'Resume breathing':'Start 1-minute reset'}</Text></TouchableOpacity><TouchableOpacity onPress={()=>{setBreathing(false);setSeconds(60)}}><Text style={s.reset}>Reset timer</Text></TouchableOpacity></View>
  </>:null}
  {tab==='You'? <>
   <Text style={s.eyebrow}>YOUR PERSONAL SPACE</Text><Text style={s.mainTitle}>Your wellbeing.</Text><View style={s.profile}><View style={s.profileAvatar}><Text style={{fontSize:30}}>☺</Text></View><View><Text style={s.profileName}>Your demo profile</Text><Text style={s.bodyMuted}>Finding your balance, one day at a time</Text></View></View>
   <Card><Heading title="Your baseline"/><View style={s.baseline}><Metric label="30-DAY HRV" value="54" unit="ms" sub="Sample baseline"/><Metric label="RESTING HR" value="69" unit="bpm" sub="Sample baseline"/></View></Card>
   <Card><Heading title="Data source"/><View style={s.settingLine}><Text style={s.habitTitle}>♡  Apple Health</Text><Text style={s.settingValue}>Not connected</Text></View><Text style={s.bodyMuted}>This prototype uses sample readings only. It does not access Apple Health, detect medical conditions, or send notifications.</Text></Card>
   <TouchableOpacity style={s.card} onPress={()=>supabase.auth.signOut()}><Text style={{color:C.deep,fontWeight:'800',textAlign:'center'}}>Sign out</Text></TouchableOpacity>
   <ThemePicker/>
   <WidgetPreview/>
   <Card><Heading title="About this demo"/><Text style={s.about}>Wellnest is an original educational prototype of a stress and recovery tracker for iPhone. The visualization is inspired by general wellness app conventions, not a clinical scoring system.</Text><Text style={[s.about,{marginTop:10}]}>All values are illustrative and should not be used for health decisions.</Text></Card>
  </>:null}
  <Text style={s.disclaimer}>DEMO DATA ONLY  ·  NOT MEDICAL ADVICE</Text>
  </ScrollView>
  <View style={[s.tabBar,{height:59+insets.bottom,paddingBottom:insets.bottom}]}>{tabs.map(t=><TouchableOpacity key={t.name} accessibilityRole="tab" accessibilityState={{selected:tab===t.name}} style={s.tab} onPress={()=>go(t.name)}><Ionicons name={tab===t.name?t.icon:t.outline} size={23} color={tab===t.name?C.deep:'#A9A5B7'}/><Text style={[s.tabLabel,tab===t.name&&s.tabSelected]}>{t.name}</Text></TouchableOpacity>)}</View>
 </View>;
}
export default function MainApp(){return <AppContent/>}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},
 top:{height:62,paddingHorizontal:24,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.bg},
 brand:{flexDirection:'row',alignItems:'center',gap:9},logo:{backgroundColor:C.green,width:29,height:29,borderRadius:11,alignItems:'center',justifyContent:'center'},logoText:{color:'white',fontSize:20,fontWeight:'900'},brandText:{fontSize:22,fontWeight:'800',letterSpacing:-1,color:C.ink},
 avatar:{height:38,width:38,borderRadius:19,backgroundColor:C.mint,alignItems:'center',justifyContent:'center'},
 scroll:{paddingHorizontal:20,paddingTop:12,paddingBottom:32,gap:15},
 greeting:{marginBottom:4},eyebrow:{fontSize:10,letterSpacing:2,fontWeight:'800',color:C.deep,marginBottom:8},mainTitle:{fontSize:30,lineHeight:36,fontWeight:'800',letterSpacing:-1.1,color:C.ink},intro:{color:C.muted,marginTop:7,fontSize:13},
 hero:{backgroundColor:'#EDE5FF',borderRadius:28,padding:20,alignItems:'center',overflow:'hidden',position:'relative',minHeight:343},
 heroBubbles:{position:'absolute',top:0,left:0,right:0,bottom:0},bubbleOne:{position:'absolute',width:150,height:150,borderRadius:75,backgroundColor:'#DDCEFF',top:-66,left:-58},bubbleTwo:{position:'absolute',width:130,height:130,borderRadius:65,backgroundColor:'#E3D6FF',right:-50,top:25},
 heroTiny:{fontSize:11,fontWeight:'800',letterSpacing:2,color:C.deep,marginTop:3},heroTitle:{fontWeight:'900',color:C.ink,fontSize:27,letterSpacing:-1,marginTop:-1},heroDescription:{fontSize:12,color:'#7D6BBA',textAlign:'center',marginTop:7,marginBottom:19},
 scale:{height:12,width:'86%',flexDirection:'row',gap:4,position:'relative',marginBottom:16,alignItems:'center'},scaleSegment:{flex:1,height:9,borderRadius:10},scaleDot:{position:'absolute',left:'65%',width:19,height:19,borderRadius:10,backgroundColor:'white',borderColor:C.green,borderWidth:5},updated:{fontSize:10,color:'#826ABF',fontWeight:'600'},
 card:{backgroundColor:'#fff',borderRadius:23,padding:20,shadowColor:'#4A268A',shadowOpacity:.04,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:1},
 metricsRow:{flexDirection:'row',gap:11},metric:{minWidth:0},metricLabel:{fontSize:9,letterSpacing:.8,color:C.muted,fontWeight:'800'},metricRow:{flexDirection:'row',alignItems:'baseline',gap:3,marginTop:9},metricValue:{fontSize:31,fontWeight:'900',letterSpacing:-1.5},metricUnit:{fontSize:12,fontWeight:'700',color:C.muted},metricSub:{fontSize:10,color:C.muted,marginTop:5},
 sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},sectionTitle:{fontSize:16,color:C.ink,fontWeight:'800',letterSpacing:-.4},sectionDetail:{fontSize:11,color:C.deep,fontWeight:'700'},
 chartTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},chartNumber:{fontSize:25,fontWeight:'900',color:C.ink},chartUnit:{fontSize:13,color:C.muted,fontWeight:'600'},goodPill:{backgroundColor:C.mint,color:C.deep,paddingHorizontal:11,paddingVertical:7,borderRadius:12,fontSize:11,fontWeight:'800'},axis:{flexDirection:'row',justifyContent:'space-between',marginTop:6},axisText:{fontSize:10,color:'#ACB9AE'},insight:{borderRadius:21,padding:17,backgroundColor:C.lilac,flexDirection:'row',gap:14,alignItems:'center'},insightIcon:{backgroundColor:'#DCCBFF',height:45,width:45,borderRadius:16,alignItems:'center',justifyContent:'center'},insightTitle:{color:C.ink,fontWeight:'800',fontSize:14,marginBottom:4},insightText:{fontSize:11,color:'#6F7289',lineHeight:17},arrow:{fontSize:26,color:'#A39BD0'},
 period:{flexDirection:'row',backgroundColor:'#EDE7FA',borderRadius:17,padding:5,gap:6,marginTop:7},chip:{flex:1,paddingVertical:10,borderRadius:12,alignItems:'center'},chipActive:{backgroundColor:'#fff'},chipText:{fontSize:12,color:C.muted,fontWeight:'700'},chipTextActive:{color:C.deep},bigValue:{fontSize:41,color:C.deep,fontWeight:'900'},bigUnit:{fontSize:15,color:C.muted,fontWeight:'600'},bodyMuted:{fontSize:12,color:C.muted,lineHeight:19,marginTop:3},balanceRow:{flexDirection:'row',gap:10,marginTop:4,marginBottom:11},balanceBlock:{flex:1,borderRadius:17,padding:19},balanceValue:{fontSize:28,fontWeight:'900',color:C.ink},balanceLabel:{fontSize:12,color:C.muted,marginTop:5,fontWeight:'700'},listText:{color:C.ink,fontSize:13,marginVertical:10},
 moods:{flexDirection:'row',justifyContent:'space-between',gap:5},mood:{flex:1,alignItems:'center',paddingVertical:11,paddingHorizontal:2,borderRadius:14,backgroundColor:C.bg,borderWidth:1,borderColor:'transparent'},moodActive:{backgroundColor:C.mint,borderColor:C.green},moodLabel:{fontSize:10,color:C.ink,fontWeight:'700',marginTop:8},feedback:{marginTop:15,color:C.deep,fontWeight:'600',fontSize:12},
 habitLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:15,borderTopWidth:1,borderTopColor:C.line},habitTitle:{fontSize:14,color:C.ink,fontWeight:'800'},counter:{flexDirection:'row',gap:13,alignItems:'center',backgroundColor:C.bg,paddingVertical:7,paddingHorizontal:12,borderRadius:14},counterText:{color:C.deep,fontSize:20,fontWeight:'700',width:22,textAlign:'center'},counterNumber:{color:C.ink,fontSize:16,fontWeight:'800',minWidth:17,textAlign:'center'},
 breathe:{backgroundColor:'#DDF2EA',borderRadius:24,alignItems:'center',padding:23},breatheOver:{fontSize:10,color:C.deep,fontWeight:'800',letterSpacing:2},breatheTitle:{fontSize:29,color:C.ink,fontWeight:'900',marginTop:7},breatheBody:{textAlign:'center',color:'#698879',fontSize:12,lineHeight:18,marginTop:8},breatheCircle:{width:178,height:178,borderRadius:89,backgroundColor:C.green,borderColor:'#CBB7FF',borderWidth:17,marginVertical:21,alignItems:'center',justifyContent:'center'},breatheTimer:{fontSize:37,color:'#fff',fontWeight:'900'},breatheSmall:{fontSize:10,color:'#F8F4FF'},breatheButton:{backgroundColor:C.deep,paddingHorizontal:25,paddingVertical:15,borderRadius:16},breatheButtonText:{color:'#fff',fontWeight:'800',fontSize:13},reset:{fontSize:11,color:C.deep,marginTop:15,fontWeight:'700'},
 profile:{flexDirection:'row',gap:13,alignItems:'center',paddingVertical:15},profileAvatar:{width:62,height:62,borderRadius:23,backgroundColor:C.mint,alignItems:'center',justifyContent:'center'},profileName:{fontSize:17,fontWeight:'800',color:C.ink},baseline:{flexDirection:'row',justifyContent:'space-between'},settingLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:9},settingValue:{fontSize:11,fontWeight:'700',color:C.muted},about:{fontSize:13,lineHeight:20,color:C.muted},disclaimer:{textAlign:'center',fontSize:9,letterSpacing:1.1,fontWeight:'700',color:'#ABB7AE',marginVertical:9},
 tabBar:{backgroundColor:'#fff',flexDirection:'row',borderTopColor:C.line,borderTopWidth:1},tab:{flex:1,alignItems:'center',justifyContent:'center',gap:3},tabIcon:{color:'#ABB6AD',fontSize:25,fontWeight:'800'},tabLabel:{fontSize:10,color:'#ABB6AD',fontWeight:'700'},tabSelected:{color:C.deep}
});
