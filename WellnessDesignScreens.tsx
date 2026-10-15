import React from 'react';
import {View,Text,TouchableOpacity,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SuperdotMascot from './SuperdotMascot';
import {APP_THEME} from './MoodMascot';
import {supabase} from './supabase';
import HealthDataPanel,{HealthMiniStats} from './HealthDataPanel';
import RecoveryInsights from './RecoveryInsights';
import HealthTrendOverview from './HealthTrendOverview';

const P=APP_THEME.primary,INK=APP_THEME.ink,MUTED=APP_THEME.muted;
type Props={companion:string;accent:string;onPress?:()=>void};
export function PageHero({title,highlight,detail,companion,accent,onPress,button}:{title:string;highlight:string;detail:string;companion:string;accent:string;onPress?:()=>void;button?:string}){
 return <View style={s.hero}><View style={{flex:1,gap:9,zIndex:1}}><Text style={s.heroTitle}>{title}{'\n'}<Text style={{color:accent}}>{highlight}</Text></Text><Text style={s.heroText}>{detail}</Text>{button?<TouchableOpacity onPress={onPress} style={[s.heroButton,{backgroundColor:accent}]}><Text style={{fontWeight:'900',color:'#fff'}}>{button}  →</Text></TouchableOpacity>:null}</View><View style={{width:128,alignItems:'center',justifyContent:'center'}}><SuperdotMascot id={companion} color={accent} size={135}/></View></View>
}
export function BrandHead({companion}:{companion:string}){return <View style={s.brand}><SuperdotMascot id={companion} color={P} size={41}/><Text style={s.brandWord}>Super<Text style={{color:P}}>dots.</Text></Text><View style={{flex:1}}/><SuperdotMascot id={companion} color={P} size={37}/></View>}
export function SectionHeading({title,detail}:{title:string;detail?:string}){return <View style={s.heading}><Text style={s.headingText}>{title}</Text>{detail?<Text style={s.headingDetail}>{detail}</Text>:null}</View>}
export function PastelCard({title,detail,emoji,tint,onPress}:{title:string;detail:string;emoji:string;tint:string;onPress?:()=>void}){return <TouchableOpacity disabled={!onPress} onPress={onPress} style={[s.action,{backgroundColor:tint}]}><Text style={s.actionEmoji}>{emoji}</Text><View style={{flex:1,gap:5}}><Text style={s.actionTitle}>{title}</Text><Text style={s.actionText}>{detail}</Text></View><Ionicons name="chevron-forward" color={P} size={16}/></TouchableOpacity>}
export function StatCard({title,value,detail,icon,tint,onPress}:{title:string;value:string;detail:string;icon:any;tint:string;onPress?:()=>void}){return <TouchableOpacity disabled={!onPress} onPress={onPress} style={s.stat}><View style={[s.statIcon,{backgroundColor:tint}]}><Ionicons name={icon} size={20} color={P}/></View><Text style={s.statTitle}>{title}</Text><Text style={s.statValue}>{value}</Text><Text style={s.statDetail}>{detail}</Text></TouchableOpacity>}
const moodGuides=[
 {mood:'Joy',id:'joy',detail:'Happy and energized'},
 {mood:'Sad',id:'sadness',detail:'Feeling a little low'},
 {mood:'Angry',id:'anger',detail:'Frustrated or upset'},
 {mood:'Anxious',id:'fear',detail:'Worried or stressed'},
 {mood:'Calm',id:'disgust',detail:'Calm and balanced'},
] as const;
export function MeetYourMoods({onCheckin}:{onCheckin:()=>void}){
 return <View style={{backgroundColor:'#FFFFFF',borderRadius:24,padding:17,gap:11,borderWidth:1,borderColor:APP_THEME.border}}>
   <Text style={{fontSize:19,fontWeight:'900',color:INK}}>Meet your moods</Text>
   <Text style={{fontSize:12,color:MUTED,lineHeight:18}}>Your Superdot changes with how you're feeling. Check in to see the companion that matches your mood.</Text>
   <View style={{flexDirection:'row',justifyContent:'space-between',gap:2}}>
    {moodGuides.map(item=><View key={item.mood} style={{flex:1,alignItems:'center',gap:5}}>
      <SuperdotMascot id={item.id} size={55}/>
      <Text style={{fontSize:10,fontWeight:'800',color:INK}}>{item.mood}</Text>
    </View>)}
   </View>
   <TouchableOpacity onPress={onCheckin} style={{alignSelf:'flex-start',backgroundColor:APP_THEME.primarySoft,paddingHorizontal:15,paddingVertical:10,borderRadius:18}}>
    <Text style={{fontSize:12,fontWeight:'800',color:P}}>Check in with your mood  →</Text>
   </TouchableOpacity>
 </View>;
}
export function WellnessToday({companion,accent,water,mood,onCheckin,onChat,onActions}:{companion:string;accent:string;water:number;mood:string;onCheckin:()=>void;onChat:()=>void;onActions:()=>void}){
 return <View style={s.page}><BrandHead companion={companion}/><PageHero title="A little check-in" highlight="for you" detail="Take a moment to pause and see how you're feeling today." accent={accent} companion={companion} button="Let's check in" onPress={onCheckin}/>
 <View style={[s.celebrate,{backgroundColor:'#EDF9F3'}]}><View style={{flex:1,gap:7}}><Text style={s.celebrateTitle}>You're doing <Text style={{color:accent}}>dot-tastic!</Text></Text><Text style={s.body}>Small steps count. Your Superdot is here for you.</Text></View><SuperdotMascot id={companion} color={accent} size={103}/></View>
 <MeetYourMoods onCheckin={onCheckin}/>
 <RecoveryInsights companion={companion} onChat={onChat}/>
 <SectionHeading title="Your daily wellness"/><View style={s.grid}><StatCard title="Water Intake" value={String(water)+' cups'} detail="Logged today" icon="water" tint="#E5F3FF" onPress={onActions}/><StatCard title="Mood" value={mood.trim()||'Not logged'} detail="Tap to check in" icon="happy-outline" tint="#FFF0D6" onPress={onCheckin}/></View><HealthMiniStats/>
 <TouchableOpacity onPress={onChat} style={s.chat}><SuperdotMascot id={companion} color={accent} size={68}/><View style={{flex:1}}><Text style={s.actionTitle}>Talk to your Superdot</Text><Text style={s.body}>Share how you're feeling and get support.</Text></View><Ionicons name="chevron-forward" size={20} color={accent}/></TouchableOpacity>
 <SectionHeading title="Today's highlights"/><View style={[s.celebrate,{backgroundColor:'#FFF8EC'}]}><Text style={s.body}>Log your water, mood and breathing to build a picture of your day.</Text></View>
 </View>
}
export function WellnessActions({companion,accent,water,onWater,onCaffeine,onBreathing,onChat,onMood,onJournal,caffeine}:{companion:string;accent:string;water:number;caffeine:number;onWater:()=>void;onCaffeine:()=>void;onBreathing:()=>void;onChat:()=>void;onMood:()=>void;onJournal:()=>void}){
 const [day,setDay]=React.useState(0);
 const [pastAmounts,setPastAmounts]=React.useState<{water:number;caffeine:number}>({water:0,caffeine:0});
 React.useEffect(()=>{let alive=true;if(day===0)return;
 (async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 const d=new Date();d.setDate(d.getDate()+day);d.setHours(0,0,0,0);
 const end=new Date(d);end.setDate(end.getDate()+1);
 const {data,error}=await supabase.from('habit_entries').select('habit,amount').eq('user_id',user.id).in('habit',['water','caffeine']).gte('recorded_at',d.toISOString()).lt('recorded_at',end.toISOString()).order('recorded_at',{ascending:false}).limit(100);
 if(error)throw error;if(alive)setPastAmounts({water:Number(data?.find(r=>r.habit==='water')?.amount||0),caffeine:Number(data?.find(r=>r.habit==='caffeine')?.amount||0)});
 }catch(e){console.warn('Daily habit history unavailable',e)}})();return()=>{alive=false};
 },[day]);
 const shownWater=day===0?water:pastAmounts.water,shownCaffeine=day===0?caffeine:pastAmounts.caffeine;
 const selectable=day===0;
 const dates=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i-3);return d});
 const addCard=(emoji:string,title:string,description:string,info:string,action?:()=>void)=>(
 <TouchableOpacity onPress={action} disabled={!action} style={{backgroundColor:'#fff',borderRadius:22,padding:17,flexDirection:'row',alignItems:'center',gap:14}}>
  <View style={{width:51,height:51,borderRadius:18,backgroundColor:'#E9F6F0',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:27}}>{emoji}</Text></View>
  <View style={{flex:1,gap:5}}><Text style={{fontSize:16,fontWeight:'900',color:INK}}>{title}</Text><Text style={{fontSize:12,color:MUTED}}>{description}</Text><Text style={{fontSize:11,color:'#3A9E7A'}}>{info}</Text></View>
  <Ionicons name="chevron-forward" size={19} color={MUTED}/>
 </TouchableOpacity>);
 return <View style={s.page}><BrandHead companion={companion}/>
 <SectionHeading title="Your daily actions" detail="Small steps, better days"/>
 <View style={{flexDirection:'row',justifyContent:'space-between',gap:4}}>{dates.map((d,i)=><TouchableOpacity key={i} onPress={()=>setDay(i-3)} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:18,backgroundColor:day===i-3?'#D8F6E8':'#fff',gap:4}}><Text style={{fontSize:11,color:MUTED}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}</Text><Text style={{fontWeight:'900',fontSize:16,color:INK}}>{d.getDate()}</Text>{i===3?<View style={{width:5,height:5,borderRadius:3,backgroundColor:'#50C89E'}}/>:null}</TouchableOpacity>)}</View>
 <View style={{backgroundColor:'#E4F8EE',borderRadius:24,padding:18,flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,gap:7}}><Text style={{color:'#28694F',fontWeight:'900',fontSize:13}}>✦  YOUR SUPERDOT SUGGESTS</Text><Text style={{fontWeight:'900',color:INK,fontSize:18}}>A small reset can help.</Text><Text style={s.body}>How have you been sleeping and feeling lately?</Text><TouchableOpacity onPress={onChat}><Text style={{fontWeight:'800',color:accent}}>Talk to Superdots  →</Text></TouchableOpacity></View><SuperdotMascot id={companion} color={accent} size={86}/></View>
 <SectionHeading title={day===0?"Today’s wellness":day<0?"Previous day’s wellness":"Upcoming day"} detail={day===0?"Track and reflect":"Saved entries only"}/>
 {addCard('🌙','Sleep','Review sleep and recovery','Apple Health not connected')}
 {addCard('🏃','Fitness','Movement and activity','Apple Health not connected')}
 {addCard('💧','Hydration',shownWater+' cups logged',selectable?'Tap to view and edit':'Daily history',selectable?onWater:undefined)}
 {addCard('☕','Caffeine',shownCaffeine+' cups logged',selectable?'Tap to view and edit':'Daily history',selectable?onCaffeine:undefined)}
 {addCard('🌸','Mindfulness','Take a calming pause','Open guided breathing',onBreathing)}
 {addCard('🙂','Log your feelings','How are you feeling right now?','Check in with Superdots',onMood)}
 {addCard('📖','Journal','Write about your day','View your private notes',onJournal)}
 <TouchableOpacity onPress={onChat} style={[s.chat,{backgroundColor:'#EEE7FF'}]}><SuperdotMascot id={companion} color={accent} size={72}/><View style={{flex:1,gap:4}}><Text style={s.actionTitle}>Ask your Superdot</Text><Text style={s.body}>Your private AI wellness conversation</Text></View><Ionicons name="arrow-forward" size={21} color={accent}/></TouchableOpacity>
 </View>;
}
export function WellnessTrends({companion,accent,period,onPeriod,mood}:{companion:string;accent:string;period:string;onPeriod:(p:'Day'|'Week'|'Month'|'Year')=>void;mood:string}){
 const [entries,setEntries]=React.useState<{mood:string;recorded_at:string}[]>([]);
 const [loading,setLoading]=React.useState(true);
 React.useEffect(()=>{let active=true;(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('mood_entries').select('mood,recorded_at').eq('user_id',user.id).order('recorded_at',{ascending:false}).limit(365);if(error)throw error;if(active)setEntries(data||[])}catch(error){console.warn('Mood trends unavailable',error)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 const days=period==='Day'?1:period==='Week'?7:period==='Month'?30:365;
 const today=new Date();const start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);
 const values={Happy:5,Calm:4,Okay:3,Tired:2,Anxious:1,Sad:1,Stressed:1,Overwhelmed:1,Good:4};
 const filtered=entries.filter(e=>new Date(e.recorded_at)>=start);
 const periods=period==='Day'?1:period==='Week'?7:period==='Month'?6:12;
 const groups=Array.from({length:periods},(_,i)=>{
  const d=new Date(start);d.setDate(start.getDate()+Math.floor(i*days/periods));
  const next=new Date(start);next.setDate(start.getDate()+Math.floor((i+1)*days/periods));
  const bucket=filtered.filter(e=>{const t=new Date(e.recorded_at);return t>=d&&t<next});
  const score=bucket.length?bucket.reduce((sum,e)=>sum+(values[e.mood as keyof typeof values]||3),0)/bucket.length:null;
  return {label:period==='Week'?['S','M','T','W','T','F','S'][d.getDay()]:period==='Day'?'Today':String(d.getDate()),score,count:bucket.length};
 });
 return <View style={s.page}><BrandHead companion={companion}/><PageHero title="Understand your" highlight="patterns." detail="See how your habits and mood connect over time." companion={companion} accent={accent}/>
 <View style={s.segment}>{(['Day','Week','Month','Year'] as const).map(p=><TouchableOpacity key={p} onPress={()=>onPeriod(p)} style={[s.seg,period===p&&{backgroundColor:accent}]}><Text style={{color:period===p?'#fff':MUTED,fontWeight:'800',fontSize:12}}>{p}</Text></TouchableOpacity>)}</View>
 <SectionHeading title="Mood trend"/><View style={s.white}><Text style={s.cardTitle}>How you've been feeling</Text>
 <Text style={s.big}>{loading?'Loading…':filtered.length?filtered.length+' check-ins':'No check-ins yet'}</Text>
 <Text style={s.body}>{filtered.length?'These bars represent your saved mood check-ins, not watch measurements.':'Start checking in to see your own mood history.'}</Text>
 <View style={s.bars}>{groups.map((g,i)=><View key={i} style={{flex:1,alignItems:'center',gap:6,justifyContent:'flex-end',height:105}}><View style={{width:'58%',minWidth:8,height:g.score?Math.round(g.score*15):5,borderRadius:9,backgroundColor:g.score?accent:'#EDE9F4'}}/><Text style={{fontSize:9,color:MUTED}}>{g.label}</Text></View>)}</View>
 </View>
 <HealthTrendOverview period={period}/>
 <View style={[s.white,{backgroundColor:'#FFF8E9'}]}><Text style={s.celebrateTitle}>💡 Your wellness insights</Text><Text style={s.body}>These are your recorded check-ins. Any connection between sleep, activity and mood needs real synchronized data before conclusions can be drawn.</Text></View></View>;
}
export function WellnessHealth({companion,accent,onPermissions,onChat}:{companion:string;accent:string;onPermissions:()=>void;onChat:()=>void}){
 return <View style={s.page}><BrandHead companion={companion}/>
 <PageHero title="Health signals" highlight="from your day." detail="Understand your activity, recovery and body signals through real readings." companion={companion} accent={accent}/>
 <HealthDataPanel/>
 <RecoveryInsights companion={companion} onChat={onChat}/>
 <TouchableOpacity onPress={onPermissions} style={[s.white,{backgroundColor:'#F1EAFE'}]}><Text style={s.cardTitle}>Privacy & health permissions  →</Text><Text style={s.body}>Choose what Apple Health shares with Superdots. No measurements are requested until you tap Connect.</Text></TouchableOpacity>
 </View>;
}
export function WellnessSettingsIntro({companion,accent}:{companion:string;accent:string}){
 return <View style={s.page}><BrandHead companion={companion}/><View style={[s.hero,{backgroundColor:APP_THEME.mint,minHeight:145}]}><View style={{flex:1,gap:8}}><Text style={s.heroTitle}>Your wellness,\n<Text style={{color:accent}}>your way.</Text></Text><Text style={s.heroText}>Your companion reflects how you feel. App colors remain calm and consistent.</Text></View><SuperdotMascot id={companion} size={105}/></View></View>;
}
const s=StyleSheet.create({
 page:{gap:14,paddingBottom:12},brand:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:4},brandWord:{fontSize:25,fontWeight:'900',color:INK},
 hero:{borderRadius:26,backgroundColor:'#EAE6FA',padding:20,flexDirection:'row',minHeight:202,alignItems:'center',overflow:'hidden'},heroTitle:{fontSize:29,lineHeight:34,fontWeight:'900',color:INK},heroText:{fontSize:13,lineHeight:19,color:MUTED},heroButton:{alignSelf:'flex-start',paddingVertical:11,paddingHorizontal:16,borderRadius:25,marginTop:7},
 heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:5},headingText:{fontSize:22,fontWeight:'900',color:INK},headingDetail:{fontSize:11,color:P},
 celebrate:{borderRadius:24,padding:18,flexDirection:'row',gap:10,alignItems:'center'},celebrateTitle:{fontWeight:'900',fontSize:20,color:INK,lineHeight:24},body:{color:MUTED,fontSize:12,lineHeight:18},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},stat:{backgroundColor:'#fff',borderRadius:21,padding:15,width:'48%',minHeight:137,gap:6},statIcon:{width:38,height:38,borderRadius:20,alignItems:'center',justifyContent:'center'},statTitle:{fontSize:12,fontWeight:'800',color:INK},statValue:{fontWeight:'900',fontSize:18,color:INK},statDetail:{fontSize:11,color:MUTED},
 chat:{borderRadius:23,padding:16,backgroundColor:'#EAE6FA',flexDirection:'row',gap:10,alignItems:'center'},
 action:{width:'48%',minHeight:135,borderRadius:21,padding:15,gap:7},actionEmoji:{fontSize:32},actionTitle:{fontSize:16,fontWeight:'900',color:INK},actionText:{fontSize:11,lineHeight:16,color:MUTED},
 segment:{flexDirection:'row',backgroundColor:'#EFEAFA',padding:5,borderRadius:25},seg:{flex:1,borderRadius:22,padding:11,alignItems:'center'},white:{backgroundColor:'#fff',borderRadius:22,padding:19,gap:9},cardTitle:{fontSize:15,fontWeight:'900',color:INK},big:{fontSize:23,fontWeight:'900',color:P},bars:{height:95,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-around'},bar:{width:22,borderRadius:10},caption:{fontSize:10,color:MUTED}
});
