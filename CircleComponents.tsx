import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,StyleSheet,Switch,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import SuperdotMascot from './SuperdotMascot';
import {APP_THEME} from './MoodMascot';
import {CircleMood,MOOD_TINTS,signalById,timeAgo} from './LittleSignalsData';
import {friendName,useCircle} from './CircleStore';

export const CT={...APP_THEME,line:'#EEF3F0',danger:'#D65B79'};

export function useReduceMotion(){
 const [reduce,setReduce]=useState(false);
 useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduce(v)});
  const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduce);return()=>{alive=false;sub.remove()}},[]);
 return reduce;
}

export function Avatar({initials,color,size=40}:{initials:string;color:string;size?:number}){
 return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:color,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'900',fontSize:size*0.42}}>{initials}</Text></View>;
}
// Static first frame of the existing optimized preview sequence — no extra decoding in lists.
export function MoodPalThumb({mood,size=44,animate=false}:{mood:CircleMood;size?:number;animate?:boolean}){
 return <SuperdotMascot id={mood} size={size} preview animate={animate}/>;
}
export function MoodTag({mood}:{mood:CircleMood}){const t=MOOD_TINTS[mood];return <View style={{backgroundColor:t.tint,paddingHorizontal:9,paddingVertical:4,borderRadius:10,alignSelf:'flex-start'}}><Text style={{color:t.color,fontWeight:'800',fontSize:11}}>{mood}</Text></View>;}
export function CCard({children,style}:{children:React.ReactNode;style?:any}){return <View style={[cs.card,style]}>{children}</View>;}
export function CHeading({title,detail,action,onAction}:{title:string;detail?:string;action?:string;onAction?:()=>void}){
 return <View style={{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:4}}>
  <View style={{flex:1}}><Text style={cs.heading}>{title}</Text>{detail?<Text style={cs.muted}>{detail}</Text>:null}</View>
  {action?<TouchableOpacity onPress={onAction} accessibilityRole="button"><Text style={{color:CT.primary,fontWeight:'800',fontSize:13}}>{action}</Text></TouchableOpacity>:null}
 </View>;
}
export function CRow({icon,title,subtitle,right,onPress,tint=CT.primarySoft,color=CT.primary,last,leading}:{icon?:any;title:string;subtitle?:string;right?:React.ReactNode;onPress?:()=>void;tint?:string;color?:string;last?:boolean;leading?:React.ReactNode}){
 return <TouchableOpacity disabled={!onPress} onPress={onPress} accessibilityRole={onPress?'button':undefined} style={[cs.row,last&&{borderBottomWidth:0}]}>
  {leading||(icon?<View style={[cs.rowIcon,{backgroundColor:tint}]}><Ionicons name={icon} size={20} color={color}/></View>:null)}
  <View style={{flex:1,gap:2}}><Text style={cs.rowTitle}>{title}</Text>{subtitle?<Text style={cs.rowSub}>{subtitle}</Text>:null}</View>
  {right!==undefined?right:onPress?<Ionicons name="chevron-forward" size={18} color={CT.primary}/>:null}
 </TouchableOpacity>;
}
export function ToggleRow({title,subtitle,value,onChange,last}:{title:string;subtitle?:string;value:boolean;onChange:(v:boolean)=>void;last?:boolean}){
 return <CRow title={title} subtitle={subtitle} last={last} right={<Switch value={value} onValueChange={onChange} trackColor={{true:CT.primary,false:'#DDE5E1'}}/>}/>;
}
export function PrimaryButton({label,onPress,icon,disabled}:{label:string;onPress:()=>void;icon?:any;disabled?:boolean}){
 return <TouchableOpacity disabled={disabled} onPress={onPress} accessibilityRole="button" style={[cs.primary,disabled&&{opacity:.45}]}>{icon?<Ionicons name={icon} size={18} color="#fff"/>:null}<Text style={cs.primaryText}>{label}</Text></TouchableOpacity>;
}
export function SoftButton({label,onPress,icon,danger,disabled}:{label:string;onPress:()=>void;icon?:any;danger?:boolean;disabled?:boolean}){
 const c=danger?CT.danger:CT.primary;
 return <TouchableOpacity disabled={disabled} onPress={onPress} accessibilityRole="button" style={[cs.soft,{backgroundColor:danger?'#FDECF1':CT.primarySoft},disabled&&{opacity:.45}]}>{icon?<Ionicons name={icon} size={17} color={c}/>:null}<Text style={{color:c,fontWeight:'800',fontSize:14}}>{label}</Text></TouchableOpacity>;
}
export function Chip({label,selected,onPress,color=CT.primary}:{label:string;selected:boolean;onPress:()=>void;color?:string}){
 return <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" accessibilityState={{checked:selected}} style={[cs.chip,selected&&{backgroundColor:color,borderColor:color}]}><Text style={{fontWeight:'800',fontSize:12,color:selected?'#fff':CT.ink}}>{label}</Text></TouchableOpacity>;
}
export function EmptyState({mood='Calm',title,detail,action,onAction}:{mood?:CircleMood;title:string;detail:string;action?:string;onAction?:()=>void}){
 return <CCard style={{alignItems:'center',gap:8,paddingVertical:24}}><MoodPalThumb mood={mood} size={74}/><Text style={[cs.heading,{textAlign:'center'}]}>{title}</Text><Text style={[cs.muted,{textAlign:'center',lineHeight:18}]}>{detail}</Text>{action&&onAction?<View style={{alignSelf:'stretch',marginTop:6}}><SoftButton label={action} onPress={onAction}/></View>:null}</CCard>;
}
export function OfflineBanner(){
 const {offline}=useCircle();if(!offline)return null;
 return <View style={cs.offline}><Ionicons name="cloud-offline-outline" size={18} color="#8A6A12"/><Text style={{flex:1,color:'#6F5610',fontSize:12,lineHeight:17}}>You’re offline. Showing what was last saved on this iPhone. Signals and reactions will send when you reconnect.</Text></View>;
}
export function SampleDataNote(){return <View style={cs.sample}><Ionicons name="flask-outline" size={14} color="#7A6FA0"/><Text style={{color:'#7A6FA0',fontSize:11,fontWeight:'700'}}>Prototype · sample friends and data only</Text></View>;}

// Lightweight React Native animation around an existing mascot (no new frame sequences).
export function SignalBurst({mood,emoji,size=150,play=true}:{mood:CircleMood;emoji:string;size?:number;play?:boolean}){
 const reduce=useReduceMotion();
 const glow=useRef(new Animated.Value(0)).current;
 const floats=useRef([0,1,2,3,4].map(()=>new Animated.Value(0))).current;
 const pop=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
  if(!play)return;
  if(reduce){pop.setValue(1);glow.setValue(.6);return;}
  pop.setValue(0);floats.forEach(f=>f.setValue(0));
  const anim=Animated.parallel([
   Animated.spring(pop,{toValue:1,friction:5,tension:90,useNativeDriver:true}),
   Animated.loop(Animated.sequence([Animated.timing(glow,{toValue:1,duration:1100,useNativeDriver:true}),Animated.timing(glow,{toValue:.35,duration:1100,useNativeDriver:true})]),{iterations:3}),
   Animated.stagger(260,floats.map(f=>Animated.timing(f,{toValue:1,duration:2200,easing:Easing.out(Easing.quad),useNativeDriver:true}))),
  ]);
  anim.start();return()=>anim.stop();
 },[play,reduce,emoji]);
 const tint=MOOD_TINTS[mood];
 return <View style={{width:size*1.6,height:size*1.35,alignItems:'center',justifyContent:'flex-end'}} accessibilityLabel={'Little Signal '+emoji}>
  <Animated.View style={{position:'absolute',bottom:size*0.05,width:size*1.1,height:size*1.1,borderRadius:size,backgroundColor:tint.tint,opacity:glow,transform:[{scale:glow.interpolate({inputRange:[0,1],outputRange:[.9,1.08]})}]}}/>
  {!reduce?floats.map((f,i)=><Animated.Text key={i} style={{position:'absolute',bottom:size*0.55,left:size*0.8+(i-2)*size*0.22,fontSize:16+(i%2)*6,opacity:f.interpolate({inputRange:[0,.15,.8,1],outputRange:[0,1,.8,0]}),transform:[{translateY:f.interpolate({inputRange:[0,1],outputRange:[0,-size*0.8]})},{translateX:f.interpolate({inputRange:[0,1],outputRange:[0,(i%2?1:-1)*12]})}]}}>{i%2?'✨':emoji}</Animated.Text>):null}
  <SuperdotMascot id={mood} size={size} preview animate={!reduce}/>
  <Animated.View style={{position:'absolute',top:size*0.12,right:size*0.18,transform:[{scale:pop}]}}><View style={cs.bubble}><Text style={{fontSize:size*0.2}}>{emoji}</Text></View></Animated.View>
 </View>;
}

export function LittleSignalsTodayCard({onOpenSignals,onSend}:{onOpenSignals:()=>void;onSend:()=>void}){
 const store=useCircle();
 const today=store.signals.filter(s=>Date.now()-new Date(s.at).getTime()<864e5);
 const latest=today[0];const unseen=today.filter(s=>!s.seen).length;
 const reactions=store.myMoods.filter(m=>m.active).reduce((n,m)=>n+m.reactions.length,0);
 return <View style={[cs.card,{gap:12}]}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{fontWeight:'900',fontSize:17,color:CT.ink}}>Little Signals</Text>{unseen?<View style={cs.badge}><Text style={{color:'#fff',fontSize:11,fontWeight:'900'}}>{unseen} new</Text></View>:null}</View>
   <TouchableOpacity onPress={onOpenSignals} accessibilityRole="button"><Text style={{color:CT.primary,fontWeight:'800',fontSize:12}}>See all</Text></TouchableOpacity>
  </View>
  <TouchableOpacity onPress={onOpenSignals} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:12}}>
   {latest?<><View style={cs.signalEmoji}><Text style={{fontSize:24}}>{signalById(latest.signal).emoji}</Text></View>
    <View style={{flex:1,gap:2}}><Text style={cs.rowTitle}>{signalById(latest.signal).notify(friendName(store,latest.friendId))}</Text><Text style={cs.rowSub}>{timeAgo(latest.at)}{today.length>1?' · '+(today.length-1)+' more today':''}{reactions?' · '+reactions+' reactions':''}</Text></View></>:
    <><View style={cs.signalEmoji}><Text style={{fontSize:24}}>🫶</Text></View><View style={{flex:1}}><Text style={cs.rowTitle}>No signals yet today</Text><Text style={cs.rowSub}>Send a little support to someone in your circle.</Text></View></>}
  </TouchableOpacity>
  <SoftButton label="Send a Little Signal" icon="heart-outline" onPress={onSend} disabled={!store.friends.length}/>
 </View>;
}

export function ShareWithCircleCard({mood,onShare,onKeepPrivate}:{mood:string;onShare:()=>void;onKeepPrivate:()=>void}){
 const [choice,setChoice]=useState<'private'|null>(null);
 return <View style={{borderWidth:1,borderColor:'#ECE9F4',borderRadius:14,padding:12,gap:10}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{backgroundColor:CT.primarySoft,width:40,height:40,borderRadius:12,justifyContent:'center',alignItems:'center'}}><Ionicons name="people-outline" size={20} color={CT.primary}/></View>
   <View style={{flex:1,gap:2}}><Text style={{fontWeight:'800',color:'#30264D',fontSize:13}}>Share this mood?</Text><Text style={{color:'#89809B',fontSize:11,lineHeight:15}}>Optional. Only your {mood.toLowerCase()} MoodPal is shared — never your notes, Health data or stress score.</Text></View></View>
  {choice==='private'?<Text style={{color:'#89809B',fontSize:12,textAlign:'center'}}>Kept private. Only you can see this check-in.</Text>:
  <View style={{flexDirection:'row',gap:9}}>
   <TouchableOpacity accessibilityRole="button" onPress={()=>{setChoice('private');onKeepPrivate()}} style={[cs.soft,{flex:1,backgroundColor:'#F2EFFB'}]}><Text style={{color:'#30264D',fontWeight:'800',fontSize:13}}>Keep Private</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={onShare} style={[cs.soft,{flex:1,backgroundColor:CT.primary}]}><Text style={{color:'#fff',fontWeight:'800',fontSize:13}}>Share with My Circle</Text></TouchableOpacity>
  </View>}
 </View>;
}

export const cs=StyleSheet.create({
 card:{backgroundColor:'#fff',borderRadius:23,padding:16,shadowColor:'#4A268A',shadowOpacity:.04,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:1},
 heading:{fontSize:16,fontWeight:'800',color:CT.ink,letterSpacing:-.3},
 title:{fontSize:30,lineHeight:36,fontWeight:'800',letterSpacing:-1.1,color:CT.ink},
 muted:{color:CT.muted,fontSize:12,marginTop:2},
 row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderBottomWidth:1,borderBottomColor:CT.line},
 rowIcon:{width:39,height:39,borderRadius:13,alignItems:'center',justifyContent:'center'},
 rowTitle:{fontWeight:'800',color:CT.ink,fontSize:14},rowSub:{color:CT.muted,fontSize:11,lineHeight:15},
 primary:{backgroundColor:CT.primary,borderRadius:18,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
 primaryText:{color:'#fff',fontWeight:'900',fontSize:15},
 soft:{borderRadius:16,paddingVertical:12,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
 chip:{paddingHorizontal:13,paddingVertical:8,borderRadius:16,borderWidth:1.5,borderColor:CT.border,backgroundColor:'#fff'},
 offline:{flexDirection:'row',gap:9,alignItems:'center',backgroundColor:'#FFF6D6',borderRadius:16,padding:12},
 sample:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'center',backgroundColor:'#F1EEFA',paddingHorizontal:10,paddingVertical:5,borderRadius:12},
 bubble:{backgroundColor:'#fff',borderRadius:30,padding:8,shadowColor:'#000',shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:3}},
 badge:{backgroundColor:'#E76B8A',borderRadius:10,paddingHorizontal:7,paddingVertical:2},
 signalEmoji:{width:46,height:46,borderRadius:16,backgroundColor:'#FFF1F4',alignItems:'center',justifyContent:'center'},
});
