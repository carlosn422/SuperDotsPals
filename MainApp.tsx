import SpiritualReading from './SpiritualReading';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { StatusBar, ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform, Alert, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import BreathingStudio from './BreathingStudio';
import WellnessCompanion from './WellnessCompanion';
import HabitDetails from './HabitDetails';
import WellnessReminders from './WellnessReminders';
import WellnessReportExport from './WellnessReportExport';
import {WellnessToday,WellnessActions,WellnessTrends,WellnessHealth,WellnessSettingsIntro} from './WellnessDesignScreens';
import {WatchThemesCard,SettingsItem} from './SettingsComponents';
import {APP_THEME} from './MoodMascot';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Line, Path, Rect, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';

type Tab = 'Today' | 'Actions' | 'Trends' | 'Health' | 'Settings';
type Period = 'Day' | 'Week' | 'Month' | 'Year';
const C = { ink:APP_THEME.ink, muted:APP_THEME.muted, green:APP_THEME.primary, deep:APP_THEME.primary, surface:APP_THEME.surface, bg:APP_THEME.background, mint:APP_THEME.primarySoft, peach:'#FFF0DE', orange:'#F4A570', lilac:APP_THEME.primarySoft, purple:APP_THEME.primary, line:APP_THEME.border, red:'#EC7D8C' };
const tabs: {name:Tab;icon:'home'|'sparkles'|'stats-chart'|'heart'|'settings';outline:'home-outline'|'sparkles-outline'|'stats-chart-outline'|'heart-outline'|'settings-outline'}[] = [{name:'Today',icon:'home',outline:'home-outline'},{name:'Actions',icon:'sparkles',outline:'sparkles-outline'},{name:'Trends',icon:'stats-chart',outline:'stats-chart-outline'},{name:'Health',icon:'heart',outline:'heart-outline'},{name:'Settings',icon:'settings',outline:'settings-outline'}];

function Card({children,style}: {children:React.ReactNode;style?:any}) { return <View style={[s.card,style]}>{children}</View>; }
function Chip({label,active,onPress}: {label:string;active:boolean;onPress:()=>void}) { return <TouchableOpacity onPress={onPress} style={[s.chip,active&&s.chipActive]}><Text style={[s.chipText,active&&s.chipTextActive]}>{label}</Text></TouchableOpacity>; }
function Heading({title,detail}: {title:string;detail?:string}) {return <View style={s.sectionHeader}><Text style={s.sectionTitle}>{title}</Text>{detail?<Text style={s.sectionDetail}>{detail}</Text>:null}</View>;}
function Metric({value,unit,label,sub,color=C.deep}:{value:string;unit:string;label:string;sub:string;color?:string}) {return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><View style={s.metricRow}><Text style={[s.metricValue,{color}]}>{value}</Text><Text style={s.metricUnit}>{unit}</Text></View><Text style={s.metricSub}>{sub}</Text></View>;}
function AppContent({selectedTheme,selectedCompanion,onEditProfile,onThemeChanged}:{selectedTheme:string;selectedCompanion:string;onEditProfile:()=>void;onThemeChanged:(theme:string,companion:string)=>void}) {
 const colors={accent:APP_THEME.primary,pale:APP_THEME.primarySoft};
 const insets = useSafeAreaInsets();
 const {width:pageWidth}=useWindowDimensions();
 const pager=useRef<ScrollView>(null);
 const activePosition=useRef(new Animated.Value(0)).current;
 const [navWidth,setNavWidth]=useState(0);
 const [tab,setTab]=useState<Tab>('Today');
 const actionScroll=useRef<ScrollView>(null);
 const [actionDetail,setActionDetail]=useState<'water'|'caffeine'|null>(null);
 const [actionView,setActionView]=useState<'checkin'|'chat'|'history'|'spiritual'|null>(null);
 const [actionVersion,setActionVersion]=useState(0);
 const openAction=(view:'checkin'|'chat'|'history'|'spiritual')=>{setActionDetail(null);setActionView(view);setActionVersion(v=>v+1);actionScroll.current?.scrollTo({y:0,animated:false});};
 const [settingsPage,setSettingsPage]=useState<'main'|'watch'|'health'|'notifications'|'privacy'|'help'>('main');
 const [period,setPeriod]=useState<Period>('Day');
 const [mood,setMood]=useState<string>('');
 useEffect(()=>{let active=true;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data,error}=await supabase.from('wellness_journal').select('mood').eq('user_id',user.id).not('mood','is',null).order('occurred_at',{ascending:false}).limit(1).maybeSingle();
  if(error)console.warn('Latest mood unavailable',error.message);
  if(active&&!error)setMood(data?.mood||'');
 })();return()=>{active=false}},[]);
 const [water,setWater]=useState(0);
 const [coffee,setCoffee]=useState(0);
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 const today=new Date();today.setHours(0,0,0,0);
 const {data,error}=await supabase.from('habit_entries').select('habit,amount,recorded_at').eq('user_id',user.id).in('habit',['water','caffeine']).gte('recorded_at',today.toISOString()).order('recorded_at',{ascending:false}).limit(100);
 if(error){console.warn('Loading habits failed:',error.message);return;}
 if(alive){const w=data?.find(x=>x.habit==='water');const c=data?.find(x=>x.habit==='caffeine');setWater(w?Number(w.amount):0);setCoffee(c?Number(c.amount):0);}
 })();return()=>{alive=false}},[]);
 const [breathing,setBreathing]=useState(false);
 const [companion,setCompanion]=useState<'happy'|'sleepy'>('happy');
 const [seconds,setSeconds]=useState(60);
 useEffect(()=>{if(!breathing)return;const id=setInterval(()=>setSeconds(v=>{if(v<=1){setBreathing(false);return 60;}return v-1;}),1000);return()=>clearInterval(id);},[breathing]);
 const go=(t:Tab)=>{const index=tabs.findIndex(item=>item.name===t);if(index<0)return;pager.current?.scrollTo({x:index*pageWidth,animated:true});setTab(t);setPeriod('Day');setSettingsPage('main');Animated.timing(activePosition,{toValue:index,duration:250,useNativeDriver:true}).start();};
 const onPageSettled=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{
  const index=Math.max(0,Math.min(tabs.length-1,Math.round(event.nativeEvent.contentOffset.x/pageWidth)));
  setTab(tabs[index].name);
  Animated.timing(activePosition,{toValue:index,duration:180,useNativeDriver:true}).start();
 };
 useEffect(()=>{const index=Math.max(0,tabs.findIndex(t=>t.name===tab));pager.current?.scrollTo({x:index*pageWidth,animated:false});},[pageWidth]);
 const quickAddLocks=useRef<Record<'water'|'caffeine',boolean>>({water:false,caffeine:false});
 const [quickAdding,setQuickAdding]=useState<Record<'water'|'caffeine',boolean>>({water:false,caffeine:false});
 async function quickAddHabit(habit:'water'|'caffeine'){
  if(quickAddLocks.current[habit])return;
  quickAddLocks.current[habit]=true;
  setQuickAdding(v=>({...v,[habit]:true}));
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw Error('Please sign in to log your habits.');
   const start=new Date();start.setHours(0,0,0,0);
   const {data:latest,error:loadError}=await supabase.from('habit_entries')
    .select('amount').eq('user_id',user.id).eq('habit',habit)
    .gte('recorded_at',start.toISOString())
    .order('recorded_at',{ascending:false}).limit(1).maybeSingle();
   if(loadError)throw loadError;
   const next=Number(latest?.amount||0)+1;
   const {error:saveError}=await supabase.from('habit_entries').insert({
    user_id:user.id,habit,amount:next,unit:habit==='water'?'cups':'servings'
   });
   if(saveError)throw saveError;
   if(habit==='water')setWater(next);else setCoffee(next);
  }catch(e:any){
   Alert.alert('Could not save',e?.message||'Please try again.');
  }finally{
   quickAddLocks.current[habit]=false;
   setQuickAdding(v=>({...v,[habit]:false}));
  }
 }

 return <View style={[s.safe,{paddingTop:Platform.OS==='ios'?insets.top:StatusBar.currentHeight || 0}]}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
  <View style={s.top}><View style={s.brand}><View style={[s.logo,{backgroundColor:colors.accent}]}><Text style={s.logoText}>✦</Text></View><Text style={s.brandText}>superdots<Text style={{color:colors.accent}}>.</Text></Text></View><TouchableOpacity accessibilityLabel="Open profile" onPress={()=>go('Settings')} style={s.avatar}><Text style={{fontSize:18}}>☺</Text></TouchableOpacity></View>
  <ScrollView ref={pager} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onMomentumScrollEnd={onPageSettled} directionalLockEnabled style={{flex:1}} keyboardShouldPersistTaps="handled">
  <View key="Today" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessToday companion={mood} accent={colors.accent} water={water} caffeine={coffee} mood={mood} onCheckin={()=>{go('Actions');openAction('checkin')}} onChat={()=>{go('Actions');openAction('chat')}} onActions={()=>{go('Actions');setActionView(null);setActionDetail('water')}} onCaffeine={()=>{go('Actions');setActionView(null);setActionDetail('caffeine')}} onJournal={()=>{go('Actions');openAction('history')}} onAddWater={()=>void quickAddHabit('water')} onAddCaffeine={()=>void quickAddHabit('caffeine')} addingWater={quickAdding.water} addingCaffeine={quickAdding.caffeine}/></ScrollView></View>
  <View key="Actions" style={{width:pageWidth,flex:1}}><ScrollView ref={actionScroll} style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
  {actionDetail||actionView?<TouchableOpacity onPress={()=>{setActionView(null);setActionDetail(null);actionScroll.current?.scrollTo({y:0,animated:true});}} style={{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:9}}><Ionicons name="arrow-back" size={20} color={colors.accent}/><Text style={{color:colors.accent,fontWeight:'800'}}>All actions</Text></TouchableOpacity>:null}
  {actionDetail?<HabitDetails habit={actionDetail} onBack={()=>{setActionDetail(null);actionScroll.current?.scrollTo({y:0,animated:true})}} onSaved={(habit,n)=>{if(habit==='water')setWater(n);else setCoffee(n)}}/>:
  actionView==='spiritual'?<SpiritualReading/>:
  actionView?<WellnessCompanion key={actionVersion} initialView={actionView} companion={mood} onMoodSaved={setMood} onWizardNavigate={()=>actionScroll.current?.scrollTo({y:0,animated:false})} onCheckinDone={()=>{setActionView(null);go('Today');}} onOpenInsights={()=>{setActionView(null);go('Trends');}} color={colors.accent}/>:
  <WellnessActions companion={mood} accent={colors.accent} water={water} caffeine={coffee} onCaffeine={()=>{setActionView(null);setActionDetail('caffeine');actionScroll.current?.scrollTo({y:0,animated:true})}} onWater={()=>{setActionView(null);setActionDetail('water');actionScroll.current?.scrollTo({y:0,animated:true})}} onSpiritual={()=>openAction('spiritual')} onChat={()=>openAction('chat')} onMood={()=>openAction('checkin')} onJournal={()=>openAction('history')}/>}
</ScrollView></View>
  <View key="Trends" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessTrends companion={mood} accent={colors.accent} period={period} onPeriod={setPeriod} mood={mood}/><WellnessReportExport/></ScrollView></View>
  <View key="Health" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><WellnessHealth companion={mood} accent={colors.accent} onChat={()=>{go('Actions');openAction('chat')}} onPermissions={()=>{go('Settings');setSettingsPage('health')}}/></ScrollView></View>
  <View key="Settings" style={{width:pageWidth,flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
   {settingsPage==='main'?<>
    <WellnessSettingsIntro companion={mood} accent={colors.accent}/>
    <Text style={s.mainTitle}>Settings</Text>

    <SettingsItem title="Health Data" subtitle="Permissions and wearable readings" status="Open Health to connect or sync" icon="heart-outline" accent={colors.accent} onPress={()=>setSettingsPage('health')}/>
    <SettingsItem title="Notifications" subtitle="Reminders and preferences" status="Manage daily iPhone reminders" icon="notifications-outline" accent={colors.accent} onPress={()=>setSettingsPage('notifications')}/>
    <SettingsItem title="Wellness Profile" subtitle="Goals and onboarding answers" icon="person-circle-outline" accent={colors.accent} onPress={onEditProfile}/>
    <SettingsItem title="Privacy & Data" subtitle="Account storage and security" icon="shield-checkmark-outline" accent={colors.accent} onPress={()=>setSettingsPage('privacy')}/>
    <SettingsItem title="Help & Support" subtitle="FAQs and troubleshooting" icon="help-circle-outline" accent={colors.accent} onPress={()=>setSettingsPage('help')}/>
    <TouchableOpacity style={s.settingsRow} onPress={()=>void supabase.auth.signOut()}><Ionicons name="log-out-outline" size={22} color="#D65B79"/><Text style={[s.settingsTitle,{color:'#D65B79'}]}>Sign out</Text></TouchableOpacity>
   </>:<>
    <TouchableOpacity style={s.settingsBack} onPress={()=>setSettingsPage('main')}><Ionicons name="chevron-back" size={18} color={colors.accent}/><Text style={{color:colors.accent,fontWeight:'800'}}>Settings</Text></TouchableOpacity>
    <Text style={s.mainTitle}>{({watch:'Apple Watch & Widgets',health:'Apple Health',notifications:'Notifications',privacy:'Privacy & Data',help:'Help & Support'} as const)[settingsPage]}</Text>
    {settingsPage==='watch'?<><Card><Heading title="Watch connection"/><Text style={s.bodyMuted}>The Apple Watch can sync your latest saved mood when you sign in on the watch. Apple Health measurements require iPhone permission and synchronization; live WatchConnectivity is not connected.</Text></Card></>:null}
    {settingsPage==='health'?<Card><Heading title="Health data access"/><Text style={s.bodyMuted}>Superdots can read real Apple Health measurements after you explicitly approve access. Syncing uploads selected HRV, resting heart rate, steps and sleep summaries to your private account. Permission is controlled in the Apple Health app. No clinical diagnosis is made.</Text><TouchableOpacity onPress={()=>go('Health')} style={[s.settingsAction,{backgroundColor:colors.pale}]}><Text style={[s.settingsActionText,{color:colors.accent}]}>Open Health and sync  →</Text></TouchableOpacity></Card>:null}
    {settingsPage==='notifications'?<WellnessReminders/>:null}
    {settingsPage==='privacy'?<Card><Heading title="Your information"/><Text style={s.bodyMuted}>Your profile, mood logs and habit entries are stored in Supabase under user-specific access policies. Choosing Connect and sync on the Health screen also stores selected HealthKit measurements in your account.</Text><Text style={[s.bodyMuted,{marginTop:10}]}>For account data requests or deletion, contact the app operator. An in-app export and deletion flow has not yet been implemented.</Text></Card>:null}
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
