import React from 'react';
import {View,Text,TouchableOpacity,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SuperdotMascot from './SuperdotMascot';
import {Image as RNImage} from 'react-native';
import {APP_THEME} from './MoodMascot';
import {supabase} from './supabase';
import HealthDataPanel,{HealthMiniStats,useSavedHealth} from './HealthDataPanel';
import RecoveryInsights from './RecoveryInsights';
import HealthTrendOverview from './HealthTrendOverview';
import {StressHero,EnergyCard,HrvTrendCard,HeartRateCard,HealthActionsGrid,StressTrendCard} from './StressDashboard';

const P=APP_THEME.primary,INK=APP_THEME.ink,MUTED=APP_THEME.muted;
type Props={companion:string;accent:string;onPress?:()=>void};
export function PageHero({title,highlight,detail,companion,accent,onPress,button}:{title:string;highlight:string;detail:string;companion:string;accent:string;onPress?:()=>void;button?:string}){
 const {latest,loading}=useSavedHealth();
 const hrv=latest('hrv');
 const valid=hrv&&Number.isFinite(hrv.value)&&hrv.value>=0&&!Number.isNaN(Date.parse(hrv.recorded_at));
 const updated=valid?new Date(hrv.recorded_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):null;
 return <View style={[s.hero,{flexDirection:'column',alignItems:'stretch',gap:15}]}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <View style={{flex:1,gap:9,zIndex:1}}>
    <Text style={s.heroTitle}>{title}{'\n'}<Text style={{color:accent}}>{highlight}</Text></Text>
    <Text style={s.heroText}>{detail}</Text>
   </View>
   <View style={{width:118,alignItems:'center',justifyContent:'center',gap:3,backgroundColor:'rgba(255,255,255,0.7)',borderRadius:22,paddingVertical:14,paddingHorizontal:8}}>
    <Text style={{fontSize:12,fontWeight:'800',color:MUTED}}>HRV</Text>
    <Text style={{fontSize:30,fontWeight:'900',color:accent}}>{valid?Math.round(hrv.value):'—'}<Text style={{fontSize:13,fontWeight:'800'}}> ms</Text></Text>
    <Text style={{fontSize:9,color:MUTED,textAlign:'center'}}>{updated?`Last read ${updated}`:loading?'Loading Apple Health…':'No synced HRV reading'}</Text>
   </View>
  </View>
  {button?<TouchableOpacity accessibilityRole="button" onPress={onPress} style={[s.heroButton,{backgroundColor:accent}]}><Text style={{fontWeight:'900',fontSize:17,color:'#fff'}}>{button}  →</Text></TouchableOpacity>:null}
 </View>;
}
export function BrandHead(_:{companion:string}){return <View style={s.brand}><RNImage source={require('./assets/branding/moodpals-logo.png')} accessibilityRole="image" accessibilityLabel="MoodPals" style={{height:32,width:32*607/97}} resizeMode="contain"/></View>}
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
   <Text style={{fontSize:19,fontWeight:'900',color:INK}}>Meet your MoodPals</Text>
   <Text style={{fontSize:12,color:MUTED,lineHeight:18}}>Your MoodPal changes with how you're feeling. Check in to see the companion that matches your mood.</Text>
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
export function WellnessToday({companion,accent,water,caffeine,mood,onCheckin,onChat,onActions,onCaffeine,onJournal,onAddWater,onAddCaffeine,addingWater,addingCaffeine}:{companion:string;accent:string;water:number;caffeine:number;mood:string;onCheckin:()=>void;onChat:()=>void;onActions:()=>void;onCaffeine:()=>void;onJournal:()=>void;onAddWater:()=>void;onAddCaffeine:()=>void;addingWater:boolean;addingCaffeine:boolean}){
 const today=new Date();
 const date=today.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 const row=(icon:any,label:string,detail:string,onPress:()=>void,quickAdd?:()=>void,adding=false)=>(
  <TouchableOpacity onPress={onPress} style={{backgroundColor:'#FFFFFF',paddingVertical:13,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:12,borderBottomColor:'#F0EEF5',borderBottomWidth:1}}>
   <View style={{width:39,height:39,borderRadius:13,backgroundColor:label==='Water'?'#EEF5FF':label==='Caffeine'?'#FFF7E8':APP_THEME.primarySoft,alignItems:'center',justifyContent:'center'}}><Ionicons name={icon} color={label==='Water'?'#4A8CFF':label==='Caffeine'?'#F4B400':accent} size={21}/></View>
   <View style={{flex:1,gap:3}}><Text style={{fontWeight:'800',color:INK,fontSize:14}}>{label}</Text><Text style={{color:MUTED,fontSize:11}}>{detail}</Text></View>
   {quickAdd?<TouchableOpacity accessibilityRole="button" accessibilityLabel={'Add one '+(label==='Water'?'cup of water':'caffeine serving')} disabled={adding} onPress={quickAdd} style={{width:38,height:38,borderRadius:19,backgroundColor:APP_THEME.primarySoft,alignItems:'center',justifyContent:'center',opacity:adding?0.5:1}}><Ionicons name={adding?'ellipsis-horizontal':'add'} color={accent} size={23}/></TouchableOpacity>:<Ionicons name="chevron-forward" color={accent} size={18}/>}
  </TouchableOpacity>
 );
 return <View style={[s.page,{gap:17}]}>
  <StressHero mood={companion} onCheckin={onCheckin}/>
  <EnergyCard/>
  <HrvTrendCard/>
  <HeartRateCard/>
  <View style={{gap:10}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontWeight:'900',fontSize:19,color:INK}}>Today</Text><Text style={{color:MUTED,fontSize:12}}>{date}</Text></View>
   <View style={{borderRadius:20,overflow:'hidden',borderColor:APP_THEME.border,borderWidth:1}}>
    {row('water','Water',water+' of 8 cups · daily goal',onActions,onAddWater,addingWater)}
    {row('cafe','Caffeine',caffeine+' '+(caffeine===1?'serving':'servings')+' logged today',onCaffeine,onAddCaffeine,addingCaffeine)}
    {row('book-outline','Journal','View your private reflections',onJournal)}
    {row('happy-outline','Mood',mood||'Not checked in yet',onCheckin)}
   </View>
  </View>
  <RecoveryInsights companion={companion} onChat={onChat}/>
</View>;
}
export function WellnessActions({companion,accent,water,onWater,onCaffeine,onSpiritual,onChat,onMood,onJournal,onBreathing,caffeine}:{companion:string;accent:string;water:number;caffeine:number;onWater:()=>void;onCaffeine:()=>void;onSpiritual:()=>void;onChat:()=>void;onMood:()=>void;onJournal:()=>void;onBreathing:()=>void}){
 const [day,setDay]=React.useState(0);
 const [pastAmounts,setPastAmounts]=React.useState({water:0,caffeine:0});
 const [activitySummary,setActivitySummary]=React.useState<{count:number;minutes:number}>({count:0,minutes:0});
 React.useEffect(()=>{let active=true;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const start=new Date();start.setDate(start.getDate()+day);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const {data,error}=await supabase.from('wellness_activities').select('duration_minutes').eq('user_id',user.id).gte('occurred_at',start.toISOString()).lt('occurred_at',end.toISOString());
  if(error){console.warn('Loading recorded activities failed',error.message);return;}
  if(active)setActivitySummary({count:data?.length||0,minutes:(data||[]).reduce((sum,r)=>sum+Number(r.duration_minutes||0),0)});
 })();return()=>{active=false}},[day]);
 React.useEffect(()=>{let alive=true;if(day===0)return;
 (async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 const d=new Date();d.setDate(d.getDate()+day);d.setHours(0,0,0,0);
 const end=new Date(d);end.setDate(end.getDate()+1);
 const {data,error}=await supabase.from('habit_entries').select('habit,amount').eq('user_id',user.id).in('habit',['water','caffeine']).gte('recorded_at',d.toISOString()).lt('recorded_at',end.toISOString()).order('recorded_at',{ascending:false}).limit(100);
 if(error)throw error;if(alive)setPastAmounts({water:Number(data?.find(r=>r.habit==='water')?.amount||0),caffeine:Number(data?.find(r=>r.habit==='caffeine')?.amount||0)});
 }catch(e){console.warn('Daily habit history unavailable',e)}})();return()=>{alive=false};
 },[day]);
 const shownWater=day===0?water:pastAmounts.water,shownCaffeine=day===0?caffeine:pastAmounts.caffeine;
 const dates=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i-6);return d});
 const item=(icon:any,title:string,detail:string,tint:string,press?:()=>void)=>(
 <TouchableOpacity disabled={!press} onPress={press} style={{backgroundColor:'#fff',borderRadius:18,paddingHorizontal:15,paddingVertical:16,flexDirection:'row',alignItems:'center',gap:13,borderWidth:1,borderColor:'#ECEAF2'}}>
  <View style={{width:43,height:43,backgroundColor:tint,borderRadius:15,alignItems:'center',justifyContent:'center'}}><Ionicons name={icon} size={21} color={accent}/></View>
  <View style={{flex:1,gap:3}}><Text style={{fontSize:15,fontWeight:'800',color:INK}}>{title}</Text><Text style={{fontSize:12,color:MUTED}}>{detail}</Text></View>
  {press?<Ionicons name="chevron-forward" size={18} color="#A6A1B5"/>:null}
 </TouchableOpacity>);
 return <View style={[s.page,{gap:15}]}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <View><Text style={{fontSize:29,fontWeight:'900',color:INK}}>Actions</Text><Text style={{color:MUTED,fontSize:12,marginTop:2}}>Actions to relieve stress and build healthy habits</Text></View>
  </View>
  <View style={{flexDirection:'row',gap:5}}>{dates.map((d,i)=><TouchableOpacity key={i} onPress={()=>setDay(i-6)} style={{flex:1,alignItems:'center',paddingVertical:11,borderRadius:17,backgroundColor:day===i-6?APP_THEME.primarySoft:'#FFFFFF',gap:4,borderWidth:day===i-6?1.5:1,borderColor:day===i-6?accent:'#ECEAF2'}}>
    <Text style={{fontSize:10,fontWeight:'700',color:MUTED}}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</Text><Text style={{fontWeight:'900',fontSize:15,color:day===i-6?accent:INK}}>{d.getDate()}</Text>
   </TouchableOpacity>)}</View>
  {day!==0?<Text style={{color:MUTED,fontSize:12}}>Viewing past entries. Choose today to log new actions.</Text>:null}
  <TouchableOpacity onPress={onMood} style={{backgroundColor:'#E8F5EF',borderRadius:23,padding:18,flexDirection:'row',alignItems:'center',gap:13}}>
   <View style={{flex:1,gap:7}}><Text style={{fontSize:11,letterSpacing:1,fontWeight:'900',color:'#3B8A6A'}}>YOUR DAILY CHECK-IN</Text>
    <Text style={{fontSize:20,fontWeight:'900',color:INK}}>How are you feeling?</Text>
    <Text style={{fontSize:12,color:MUTED,lineHeight:18}}>Name the emotion, then add details only if you want to.</Text>
    <Text style={{fontSize:13,fontWeight:'800',color:accent,marginTop:3}}>Check in  →</Text></View>
   <SuperdotMascot id={companion} size={91}/>
  </TouchableOpacity>
  <View style={{gap:9}}><SectionHeading title="Daily essentials"/>
   <View style={{flexDirection:'row',gap:10}}>
    <TouchableOpacity onPress={day===0?onWater:undefined} disabled={day!==0} style={{flex:1,backgroundColor:'#FFFFFF',borderRadius:20,padding:16,borderWidth:1,borderColor:'#ECEAF2',gap:7}}>
     <Ionicons name="water" size={24} color="#4A8CFF"/><Text style={{fontSize:14,fontWeight:'800',color:INK}}>Water</Text>
     <Text style={{fontSize:20,fontWeight:'900',color:INK}}>{shownWater} / 8 cups</Text><Text style={{fontSize:11,color:MUTED}}>{day===0?'Tap to log':'Recorded that day'}</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={day===0?onCaffeine:undefined} disabled={day!==0} style={{flex:1,backgroundColor:'#FFFFFF',borderRadius:20,padding:16,borderWidth:1,borderColor:'#ECEAF2',gap:7}}>
     <Ionicons name="cafe" size={24} color="#F4B400"/><Text style={{fontSize:14,fontWeight:'800',color:INK}}>Caffeine</Text>
     <Text style={{fontSize:20,fontWeight:'900',color:INK}}>{shownCaffeine} {shownCaffeine===1?'serving':'servings'}</Text><Text style={{fontSize:11,color:MUTED}}>{day===0?'Tap to log':'Recorded that day'}</Text>
    </TouchableOpacity>
   </View>
  </View>
  <View style={{gap:9}}><SectionHeading title="Mind & reflection"/>
   <View style={{backgroundColor:"#FFFFFF",borderRadius:17,padding:13,borderWidth:1,borderColor:"#ECEAF2"}}><Text style={{color:INK,fontSize:13,fontWeight:"800"}}>Activities logged: {activitySummary.count}</Text><Text style={{color:MUTED,fontSize:12}}>{activitySummary.minutes} minutes recorded {day===0?"today":"on this day"}</Text></View>
   {item('book-outline','Spiritual Reading','Personalized Scripture and encouragement','#E7F5ED',onSpiritual)}
   {item('book-outline','Your journal','Review your private reflections','#F4EBFF',onJournal)}
   {item('chatbubble-ellipses-outline','Ask AI about your stress','Chat with MoodPals about your readings','#EFE9FF',onChat)}
   {item('leaf-outline','Breathing break','Calm, box and unwind exercises','#E4F6EA',onBreathing)}
  </View>
  {day===0?<View style={{gap:9}}><SectionHeading title="Body & recovery" detail="Apple Health"/><HealthActionsGrid onMindfulness={onBreathing}/></View>:null}
 </View>;
}
export function WellnessTrends({companion,accent,period,onPeriod,mood}:{companion:string;accent:string;period:string;onPeriod:(p:'Day'|'Week'|'Month'|'Year')=>void;mood:string}){
 const [entries,setEntries]=React.useState<{mood:string;occurred_at:string}[]>([]);
 const [loading,setLoading]=React.useState(true);
 React.useEffect(()=>{let active=true;(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('wellness_journal').select('mood,occurred_at').eq('user_id',user.id).not('mood','is',null).order('occurred_at',{ascending:false}).limit(365);if(error)throw error;if(active)setEntries(data||[])}catch(error){console.warn('Mood trends unavailable',error)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[mood]);
 const days=period==='Day'?1:period==='Week'?7:period==='Month'?30:365;
 const today=new Date();const start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);
 const filtered=entries.filter(e=>new Date(e.occurred_at)>=start);
 const periods=period==='Day'?1:period==='Week'?7:period==='Month'?6:12;
 const groups=Array.from({length:periods},(_,i)=>{
  const d=new Date(start);d.setDate(start.getDate()+Math.floor(i*days/periods));
  const next=new Date(start);next.setDate(start.getDate()+Math.floor((i+1)*days/periods));
  const bucket=filtered.filter(e=>{const t=new Date(e.occurred_at);return t>=d&&t<next});
  return {label:period==='Week'?['S','M','T','W','T','F','S'][d.getDay()]:period==='Day'?'Today':String(d.getDate()),count:bucket.length};
 });
 const maxCount=Math.max(1,...groups.map(g=>g.count));
 return <View style={s.page}><PageHero title="Your stress," highlight="visualized." detail="Hourly, daily, monthly and yearly trends from your own readings." companion={companion} accent={accent}/>
 <View style={s.segment}>{(['Day','Week','Month','Year'] as const).map(p=><TouchableOpacity key={p} onPress={()=>onPeriod(p)} style={[s.seg,period===p&&{backgroundColor:accent}]}><Text style={{color:period===p?'#fff':MUTED,fontWeight:'800',fontSize:12}}>{p}</Text></TouchableOpacity>)}</View>
 <StressTrendCard period={period as any}/>
<SectionHeading title="Mood trend"/><View style={s.white}><Text style={s.cardTitle}>How you've been feeling</Text>
 <Text style={s.big}>{loading?'Loading…':filtered.length?filtered.length+' check-ins':'No check-ins yet'}</Text>
 <Text style={s.body}>{filtered.length?'These bars show how many mood check-ins you logged, not a stress or health score.':'Start checking in to see your own mood history.'}</Text>
 <View style={s.bars}>{groups.map((g,i)=><View key={i} style={{flex:1,alignItems:'center',gap:6,justifyContent:'flex-end',height:105}}><View style={{width:'58%',minWidth:8,height:g.count?Math.max(10,Math.round(g.count/maxCount*75)):5,borderRadius:9,backgroundColor:g.count?accent:'#EDE9F4'}}/><Text style={{fontSize:9,color:MUTED}}>{g.label}</Text></View>)}</View>
 </View>
 <HealthTrendOverview period={period}/>
 <View style={[s.white,{backgroundColor:'#FFF8E9'}]}><Text style={s.celebrateTitle}>💡 Your wellness insights</Text><Text style={s.body}>These are your recorded check-ins. Any connection between sleep, activity and mood needs real synchronized data before conclusions can be drawn.</Text></View></View>;
}
export function WellnessHealth({companion,accent,onPermissions,onChat}:{companion:string;accent:string;onPermissions:()=>void;onChat:()=>void}){
 return <View style={s.page}>
 <PageHero title="Health signals" highlight="from your day." detail="Understand your activity, recovery and body signals through real readings." companion={companion} accent={accent}/>
 <HealthDataPanel/>
 <RecoveryInsights companion={companion} onChat={onChat}/>
 <TouchableOpacity onPress={onPermissions} style={[s.white,{backgroundColor:'#F1EAFE'}]}><Text style={s.cardTitle}>Privacy & health permissions  →</Text><Text style={s.body}>Choose what Apple Health shares with Superdots. No measurements are requested until you tap Connect.</Text></TouchableOpacity>
 </View>;
}
export function WellnessSettingsIntro({companion,accent}:{companion:string;accent:string}){
 return <View style={s.page}><View style={[s.hero,{backgroundColor:APP_THEME.mint,minHeight:145}]}><View style={{flex:1,gap:8}}><Text style={s.heroTitle}>Your wellness,{'\n'}<Text style={{color:accent}}>your way.</Text></Text><Text style={s.heroText}>Your companion reflects how you feel. App colors remain calm and consistent.</Text></View></View></View>;
}
const s=StyleSheet.create({
 page:{gap:14,paddingBottom:12},brand:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:4},brandWord:{fontSize:25,fontWeight:'900',color:INK},
 hero:{borderRadius:26,backgroundColor:APP_THEME.mint,padding:20,flexDirection:'row',minHeight:202,alignItems:'center',overflow:'hidden'},heroTitle:{fontSize:29,lineHeight:34,fontWeight:'900',color:INK},heroText:{fontSize:13,lineHeight:19,color:MUTED},heroButton:{alignSelf:'stretch',minHeight:56,paddingVertical:14,paddingHorizontal:16,borderRadius:15,alignItems:'center',justifyContent:'center'},
 heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:5},headingText:{fontSize:22,fontWeight:'900',color:INK},headingDetail:{fontSize:11,color:P},
 celebrate:{borderRadius:24,padding:18,flexDirection:'row',gap:10,alignItems:'center'},celebrateTitle:{fontWeight:'900',fontSize:20,color:INK,lineHeight:24},body:{color:MUTED,fontSize:12,lineHeight:18},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},stat:{backgroundColor:'#fff',borderRadius:21,padding:15,width:'48%',minHeight:137,gap:6},statIcon:{width:38,height:38,borderRadius:20,alignItems:'center',justifyContent:'center'},statTitle:{fontSize:12,fontWeight:'800',color:INK},statValue:{fontWeight:'900',fontSize:18,color:INK},statDetail:{fontSize:11,color:MUTED},
 chat:{borderRadius:23,padding:16,backgroundColor:'#EAE6FA',flexDirection:'row',gap:10,alignItems:'center'},
 action:{width:'48%',minHeight:135,borderRadius:21,padding:15,gap:7},actionEmoji:{fontSize:32},actionTitle:{fontSize:16,fontWeight:'900',color:INK},actionText:{fontSize:11,lineHeight:16,color:MUTED},
 segment:{flexDirection:'row',backgroundColor:'#EFEAFA',padding:5,borderRadius:25},seg:{flex:1,borderRadius:22,padding:11,alignItems:'center'},white:{backgroundColor:'#fff',borderRadius:22,padding:19,gap:9},cardTitle:{fontSize:15,fontWeight:'900',color:INK},big:{fontSize:23,fontWeight:'900',color:P},bars:{height:95,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-around'},bar:{width:22,borderRadius:10},caption:{fontSize:10,color:MUTED}
});
