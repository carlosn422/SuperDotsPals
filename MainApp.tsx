import React, { useMemo, useState, useEffect, useRef } from 'react';
import { StatusBar, ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform, Alert, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import BreathingStudio from './BreathingStudio';
import WellnessCompanion from './WellnessCompanion';
import {WellnessToday,WellnessActions,WellnessTrends,WellnessHealth,WellnessSettingsIntro} from './WellnessDesignScreens';
import VoicePreferences from './VoicePreferences';
import {PromoBanner,ThemeCard,ThemeGallery,WatchThemesCard,SettingsItem} from './SettingsComponents';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Rect, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import {LifestyleOverview, ThemePicker} from './LifestyleFeatures';
import {CurrentHRV,ExtraWellness,EmotionCheckin,CoachDemo,WidgetPreview} from './ExtraFeatures';

type Tab = 'Today' | 'Actions' | 'Trends' | 'Health' | 'Settings';
type Period = 'Day' | 'Week' | 'Month' | 'Year';
type Mood = 'Calm' | 'Okay' | 'Anxious' | 'Happy' | 'Tired';
const C = { ink:'#25145C', muted:'#8276A5', green:'#7644F5', deep:'#5D31D1', surface:'#FFFFFF', bg:'#F8F6FF', mint:'#EBE4FF', peach:'#FFF0DE', orange:'#F4A570', lilac:'#F0EBFF', purple:'#A997FA', line:'#EEE8FA', red:'#EC7D8C' };
const hrvDay = [40,48,44,58,53,64,48,74,62,55,67,58,78,71,57,60,82,69];
const hrvWeek = [42,48,55,44,63,59,72,67,61,74,70,78,64,76];
const hrvMonth = [41,46,44,49,54,50,61,58,55,66,63,72,67,73];
const hrvYear = [38,42,40,49,45,54,57,53,60,63,61,69];
const stressDay = [16,20,14,12,23,17,26,39,61,49,70,55,42,32,57,48,28,22,35,16,19,14,10,17];
const tabs: {name:Tab;icon:'home'|'sparkles'|'stats-chart'|'heart'|'settings';outline:'home-outline'|'sparkles-outline'|'stats-chart-outline'|'heart-outline'|'settings-outline'}[] = [{name:'Today',icon:'home',outline:'home-outline'},{name:'Actions',icon:'sparkles',outline:'sparkles-outline'},{name:'Trends',icon:'stats-chart',outline:'stats-chart-outline'},{name:'Health',icon:'heart',outline:'heart-outline'},{name:'Settings',icon:'settings',outline:'settings-outline'}];

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
function Metric({value,unit,label,sub,color=C.deep}:{value:string;unit:string;label:string;sub:string;color?:string}) {return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><View style={s.metricRow}><Text style={[s.metricValue,{color}]}>{value}</Text><Text style={s.metricUnit}>{unit}</Text></View><Text style={s.metricSub}>{sub}</Text></View>;}
function AppContent({selectedTheme,selectedCompanion,onEditProfile,onThemeChanged}:{selectedTheme:string;selectedCompanion:string;onEditProfile:()=>void;onThemeChanged:(theme:string,companion:string)=>void}) {
 const palettes:Record<string,{accent:string,pale:string}>={grape:{accent:'#7139E9',pale:'#EEE5FF'},coral:{accent:'#E76B8A',pale:'#FFE7EE'},sky:{accent:'#488CD9',pale:'#E2F1FF'},sunny:{accent:'#E3A426',pale:'#FFF4CE'},mint:{accent:'#3BA986',pale:'#E1F8ED'}};
 const colors=palettes[selectedTheme]||palettes.grape;
 const [themeSaving,setThemeSaving]=useState(false);
 async function chooseSuperdot(id:string,theme:string){setThemeSaving(true);try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');const {error}=await supabase.from('user_settings').update({theme,companion:id}).eq('user_id',user.id);if(error)throw error;onThemeChanged(theme,id);}catch(e:any){Alert.alert('Could not update your Superdot',e?.message||'Please retry.')}finally{setThemeSaving(false)}}
 const insets = useSafeAreaInsets();
 const {width:pageWidth}=useWindowDimensions();
 const pager=useRef<ScrollView>(null);
 const activePosition=useRef(new Animated.Value(0)).current;
 const [navWidth,setNavWidth]=useState(0);
 const [tab,setTab]=useState<Tab>('Today');
 const actionScroll=useRef<ScrollView>(null);
 const [actionView,setActionView]=useState<'checkin'|'chat'|'history'>('checkin');
 const [actionVersion,setActionVersion]=useState(0);
 const openAction=(view:'checkin'|'chat'|'history')=>{setActionView(view);setActionVersion(v=>v+1);actionScroll.current?.scrollTo({y:680,animated:true});};
 const [settingsPage,setSettingsPage]=useState<'main'|'themes'|'watch'|'health'|'notifications'|'privacy'|'help'|'voice'>('main');
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
 const go=(t:Tab)=>{const index=tabs.findIndex(item=>item.name===t);if(index<0)return;pager.current?.scrollTo({x:index*pageWidth,animated:true});setTab(t);setPeriod('Day');setSettingsPage('main');Animated.timing(activePosition,{toValue:index,duration:250,useNativeDriver:true}).start();};
 const onPageSettled=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{
  const index=Math.max(0,Math.min(tabs.length-1,Math.round(event.nativeEvent.contentOffset.x/pageWidth)));
  setTab(tabs[index].name);
  Animated.timing(activePosition,{toValue:index,duration:180,useNativeDriver:true}).start();
 };
 useEffect(()=>{const index=Math.max(0,tabs.findIndex(t=>t.name===tab));pager.current?.scrollTo({x:index*pageWidth,animated:false});},[pageWidth]);
 async function saveHabit(habit:'water'|'caffeine',amount:number){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('habit_entries').insert({user_id:user.id,habit,amount,unit:'cups'});if(error)console.warn('Save habit failed:',error.message);}
 async function saveMood(m:Mood){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('mood_entries').insert({user_id:user.id,mood:m});if(error)console.warn('Save mood failed:',error.message);}
 return <View style={[s.safe,{paddingTop:Platform.OS==='ios'?insets.top:StatusBar.currentHeight || 0}]}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
  <View style={s.top}><View style={s.brand}><View style={[s.logo,{backgroundColor:colors.accent}]}><Text style={s.logoText}>✦</Text></View><Text style={s.brandText}>superdots<Text style={{color:colors.accent}}>.</Text></Text></View><TouchableOpacity accessibilityLabel="Open profile" onPress={()=>go('Settings')} style={s.avatar}><Text style={{fontSize:18}}>☺</Text></TouchableOpacity></View>
  <ScrollView ref={pager} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onMomentumScrollEnd={onPageSettled} directionalLockEnabled style={{flex:1}} keyboardShouldPersistTaps="handled">
  <View key="Today" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessToday companion={selectedCompanion} accent={colors.accent} water={water} mood={mood} onCheckin={()=>go('Actions')} onChat={()=>go('Actions')} onActions={()=>go('Actions')}/></ScrollView></View>
  <View key="Actions" style={{width:pageWidth,flex:1}}><ScrollView ref={actionScroll} style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessActions companion={selectedCompanion} accent={colors.accent} water={water} onWater={()=>{const n=water+1;setWater(n);void saveHabit('water',n)}} onBreathing={()=>actionScroll.current?.scrollToEnd({animated:true})} onChat={()=>openAction('chat')} onMood={()=>openAction('checkin')} onJournal={()=>openAction('history')}/><WellnessCompanion key={actionVersion} initialView={actionView} companion={selectedCompanion} color={colors.accent}/><BreathingStudio accent={colors.accent} tint={colors.pale}/></ScrollView></View>
  <View key="Trends" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessTrends companion={selectedCompanion} accent={colors.accent} period={period} onPeriod={setPeriod} mood={mood}/></ScrollView></View>
  <View key="Health" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessHealth companion={selectedCompanion} accent={colors.accent} onPermissions={()=>{go('Settings');setSettingsPage('health')}}/></ScrollView></View>
  <View key="Settings" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
   {settingsPage==='main'?<>
    <WellnessSettingsIntro companion={selectedCompanion} accent={colors.accent} onThemes={()=>setSettingsPage('themes')}/>
    <Text style={s.mainTitle}>Settings</Text>
    <PromoBanner companion={selectedCompanion}/>
    <ThemeCard selected={selectedCompanion} onOpen={()=>setSettingsPage('themes')}/>
    <WatchThemesCard onOpen={()=>setSettingsPage('watch')}/>
    <TouchableOpacity onPress={()=>setSettingsPage('voice')} style={{backgroundColor:'#fff',padding:17,borderRadius:22,flexDirection:'row',alignItems:'center',gap:12}}><Ionicons name="mic-outline" size={24} color={colors.accent}/><View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:15,color:'#25145C'}}>Superdot Voice</Text><Text style={{color:'#8276A5',fontSize:12}}>Choose, preview, and save your voice</Text></View><Ionicons name="chevron-forward" size={17} color="#9E98A8"/></TouchableOpacity>
    <SettingsItem title="Health Data" subtitle="Permissions and wearable readings" status="Not connected" icon="heart-outline" accent={colors.accent} onPress={()=>setSettingsPage('health')}/>
    <SettingsItem title="Notifications" subtitle="Reminders and preferences" status="Not enabled" icon="notifications-outline" accent={colors.accent} onPress={()=>setSettingsPage('notifications')}/>
    <SettingsItem title="Wellness Profile" subtitle="Goals and onboarding answers" icon="person-circle-outline" accent={colors.accent} onPress={onEditProfile}/>
    <SettingsItem title="Privacy & Data" subtitle="Account storage and security" icon="shield-checkmark-outline" accent={colors.accent} onPress={()=>setSettingsPage('privacy')}/>
    <SettingsItem title="Help & Support" subtitle="FAQs and troubleshooting" icon="help-circle-outline" accent={colors.accent} onPress={()=>setSettingsPage('help')}/>
    <TouchableOpacity style={s.settingsRow} onPress={()=>void supabase.auth.signOut()}><Ionicons name="log-out-outline" size={22} color="#D65B79"/><Text style={[s.settingsTitle,{color:'#D65B79'}]}>Sign out</Text></TouchableOpacity>
   </>:<>
    <TouchableOpacity style={s.settingsBack} onPress={()=>setSettingsPage('main')}><Ionicons name="chevron-back" size={18} color={colors.accent}/><Text style={{color:colors.accent,fontWeight:'800'}}>Settings</Text></TouchableOpacity>
    <Text style={s.mainTitle}>{({themes:'Choose your Superdot',watch:'Apple Watch & Widgets',health:'Apple Health',notifications:'Notifications',privacy:'Privacy & Data',help:'Help & Support',voice:'Superdot Voice'} as const)[settingsPage]}</Text>
    {settingsPage==='voice'?<VoicePreferences/>:null}
    {settingsPage==='themes'?<ThemeGallery selected={selectedCompanion} saving={themeSaving} onSelect={(id,theme)=>void chooseSuperdot(id,theme)}/>:null}
    {settingsPage==='watch'?<><Card><Heading title="Watch connection"/><Text style={s.bodyMuted}>The watch app has optional Supabase theme synchronization. Sign in to Theme sync on your Apple Watch, then refresh to apply your chosen Superdot. Live WatchConnectivity is not connected yet.</Text></Card><WidgetPreview/></>:null}
    {settingsPage==='health'?<Card><Heading title="Health data access"/><Text style={s.bodyMuted}>Apple Health is not connected. Your displayed HRV, resting heart rate, stress and sleep measurements are sample data. A future HealthKit integration will explicitly ask permission before reading any information.</Text></Card>:null}
    {settingsPage==='notifications'?<Card><Heading title="Reminder settings"/><Text style={s.bodyMuted}>You can save notification preferences during onboarding, but system push or local notifications have not been implemented. No reminders are currently sent.</Text><TouchableOpacity style={[s.settingsAction,{backgroundColor:colors.pale}]} onPress={onEditProfile}><Text style={[s.settingsActionText,{color:colors.accent}]}>Edit my preferences  →</Text></TouchableOpacity></Card>:null}
    {settingsPage==='privacy'?<Card><Heading title="Your information"/><Text style={s.bodyMuted}>Your profile, selected companion, mood logs and habit entries are stored in Supabase with user-specific row-level security. This demo does not upload HealthKit readings.</Text><Text style={[s.bodyMuted,{marginTop:10}]}>For account data requests or deletion, contact the app operator. An in-app export and deletion flow has not yet been implemented.</Text></Card>:null}
    {settingsPage==='help'?<Card><Heading title="Need help?"/><Text style={s.bodyMuted}>To change onboarding answers, open Settings and select Customize my profile. For login issues, use Forgot password on the sign-in screen. Watch and health syncing are upcoming features.</Text></Card>:null}
   </>}
  </ScrollView></View>
  </ScrollView>

  <View style={[s.navDock,{paddingBottom:Math.max(insets.bottom,8)}]}>
   <View style={s.tabBar} onLayout={e=>setNavWidth(e.nativeEvent.layout.width)}>
    {navWidth>0?<Animated.View pointerEvents="none" style={[s.slidingPill,{backgroundColor:'#E9DEFF',width:(navWidth-8)/tabs.length,transform:[{translateX:activePosition.interpolate({inputRange:[0,4],outputRange:[0,4*(navWidth-8)/tabs.length]})}]}]}/>:null}
    {tabs.map(t=>{
    const active=tab===t.name;
    return <TouchableOpacity key={t.name} accessibilityRole="tab" accessibilityLabel={t.name}
      accessibilityState={{selected:active}} activeOpacity={0.8}
      style={s.tab} onPress={()=>go(t.name)}>
      <Ionicons name={t.name==='Actions'?'play':t.name==='Trends'?'bar-chart':t.name==='Health'?'heart':t.name==='Settings'?'settings':'today'} size={23} color={active?colors.accent:'#151515'}/>
      <Text numberOfLines={1} style={[s.tabLabel,{color:active?colors.accent:'#171717',fontWeight:active?'900':'700'}]}>{t.name}</Text>
    </TouchableOpacity>
   })}</View>
  </View>
 </View>;
}
export default function MainApp({selectedTheme='grape',selectedCompanion='bloop',onEditProfile=()=>{},onThemeChanged=()=>{}}:{selectedTheme?:string;selectedCompanion?:string;onEditProfile?:()=>void;onThemeChanged?:(theme:string,companion:string)=>void}){return <AppContent selectedTheme={selectedTheme} selectedCompanion={selectedCompanion} onEditProfile={onEditProfile} onThemeChanged={onThemeChanged}/>}
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
 navDock:{backgroundColor:'transparent',paddingHorizontal:12,paddingTop:4},tabBar:{backgroundColor:'#F8FAF9',borderRadius:35,borderWidth:1.5,borderColor:'#FFFFFF',flexDirection:'row',height:67,padding:4,shadowColor:'#312C42',shadowOpacity:0.14,shadowOffset:{width:0,height:6},shadowRadius:18,elevation:8},tab:{flex:1,alignItems:'center',justifyContent:'center',gap:3,borderRadius:30},tabActive:{backgroundColor:'#E6E6E6'},slidingPill:{position:'absolute',left:4,top:4,bottom:4,borderRadius:30},tabIcon:{color:'#ABB6AD',fontSize:25,fontWeight:'800'},tabLabel:{fontSize:10,color:'#151515',fontWeight:'700'},tabSelected:{color:C.deep},settingsHero:{backgroundColor:'#fff',borderRadius:23,padding:17,flexDirection:'row',alignItems:'center',gap:14},settingsHeroTitle:{fontSize:18,color:C.ink,fontWeight:'900'},settingsRow:{backgroundColor:'#fff',borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:11},settingsIcon:{height:43,width:43,borderRadius:14,alignItems:'center',justifyContent:'center'},settingsTitle:{fontSize:14,fontWeight:'800',color:C.ink},settingsSubtitle:{fontSize:11,color:C.muted,lineHeight:16},settingsStatus:{fontSize:10,fontWeight:'700',color:'#B07A9B'},settingsBack:{flexDirection:'row',alignItems:'center',gap:4,marginBottom:10},settingsAction:{padding:12,borderRadius:12,marginTop:12},settingsActionText:{fontSize:12,fontWeight:'800'}
});
