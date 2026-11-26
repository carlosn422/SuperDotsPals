import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,PanResponder,Pressable,StyleSheet,Text,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import SuperdotMascot from './SuperdotMascot';

export type MoreItem={key:string;title:string;detail:string;icon:React.ComponentProps<typeof Ionicons>['name']};
const purple='#6953CA',ink='#251C45',DURATION=300;
const TINTS:Record<string,{bg:string;fg:string}>={Settings:{bg:'#EEEAFE',fg:'#4B3D8F'},Health:{bg:'#FDE8EE',fg:'#A23B5A'},Trends:{bg:'#E6F0FF',fg:'#2F5FA8'},plus:{bg:'#FFF3D6',fg:'#8A6512'},help:{bg:'#E2F6EC',fg:'#2E7D57'},privacy:{bg:'#F1E9FB',fg:'#6A3FA8'}};
const SHORT:Record<string,string>={Settings:'Account & alerts',Health:'Heart, sleep',Trends:'Mood & stress',plus:'Plus & Free',help:'FAQs',privacy:'Your data'};
const TITLE:Record<string,string>={help:'Help'};
export type MoreBuddy={companion:string;onChat:()=>void;onCall:()=>void};

export default function MoreSheet({visible,items,onClose,onSelect,buddy}:{visible:boolean;items:MoreItem[];onClose:()=>void;onSelect:(key:string)=>void;buddy?:MoreBuddy}){
 const {height}=useWindowDimensions();
 const insets=useSafeAreaInsets();
 const y=useRef(new Animated.Value(height)).current,fade=useRef(new Animated.Value(0)).current;
 const closing=useRef(false);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>{
  if(!visible)return;
  closing.current=false;setMounted(true);y.setValue(height);fade.setValue(0);
  Animated.parallel([
   Animated.timing(y,{toValue:0,duration:DURATION,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
   Animated.timing(fade,{toValue:1,duration:DURATION,useNativeDriver:true})]).start();
 },[visible]);
 const dismiss=(after?:()=>void)=>{
  if(closing.current)return;
  closing.current=true;
  Animated.parallel([
   Animated.timing(y,{toValue:height,duration:DURATION,easing:Easing.in(Easing.cubic),useNativeDriver:true}),
   Animated.timing(fade,{toValue:0,duration:DURATION,useNativeDriver:true})]).start(()=>{setMounted(false);onClose();after?.()});
 };
 const dismissRef=useRef(dismiss);dismissRef.current=dismiss;
 const drag={
  onMoveShouldSetPanResponder:(_e:unknown,g:{dx:number;dy:number})=>g.dy>6&&Math.abs(g.dy)>Math.abs(g.dx),
  onMoveShouldSetPanResponderCapture:(_e:unknown,g:{dx:number;dy:number})=>g.dy>6&&Math.abs(g.dy)>Math.abs(g.dx),
  onPanResponderTerminationRequest:()=>false,
  onPanResponderMove:(_e:unknown,g:{dy:number})=>{if(g.dy>0&&!closing.current)y.setValue(g.dy)},
  onPanResponderRelease:(_e:unknown,g:{dy:number;vy:number})=>{if(g.dy>90||g.vy>0.8)dismissRef.current();else Animated.spring(y,{toValue:0,bounciness:0,useNativeDriver:true}).start()},
  onPanResponderTerminate:()=>{if(!closing.current)Animated.spring(y,{toValue:0,bounciness:0,useNativeDriver:true}).start()},
 };
 const pan=useRef(PanResponder.create(drag)).current;
 const grab=useRef(PanResponder.create({...drag,onStartShouldSetPanResponder:()=>true})).current;
 return <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={()=>dismiss()}>
  <View style={{flex:1,justifyContent:'flex-end'}}>
   <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(22,16,44,0.38)',opacity:fade}]}>
    <Pressable style={{flex:1}} accessibilityRole="button" accessibilityLabel="Close More Menu" onPress={()=>dismiss()}/>
   </Animated.View>
   <Animated.View {...pan.panHandlers} accessibilityViewIsModal style={[st.sheet,{paddingBottom:Math.max(insets.bottom,16),transform:[{translateY:y}]}]}>
    <View {...grab.panHandlers} style={st.dragZone}><View style={st.handle}/></View>
    <View {...grab.panHandlers} style={st.header}>
     <Text style={st.title} accessibilityRole="header">More</Text>
     <TouchableOpacity style={st.closeTarget} onPress={()=>dismiss()} accessibilityRole="button" accessibilityLabel="Close More Menu">
      <View style={st.closeCircle}><Ionicons name="close" size={20} color={ink}/></View>
     </TouchableOpacity>
    </View>
    {buddy?<View style={st.buddy}>
     <SuperdotMascot id={buddy.companion} size={64}/>
     <View style={{flex:1}}><Text style={st.buddyTitle}>Your buddy</Text><Text style={st.buddySub}>Call or chat about your day</Text></View>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chat with your buddy" onPress={()=>dismiss(buddy.onChat)} style={st.rb}><View style={[st.rbc,{backgroundColor:'#F4EBFF'}]}><Ionicons name="chatbubble-ellipses" size={22} color="#8A63D2"/></View><Text style={[st.rbl,{color:'#8A63D2'}]}>Chat</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Call your buddy" onPress={()=>dismiss(buddy.onCall)} style={st.rb}><View style={[st.rbc,st.callc]}><Ionicons name="call" size={22} color="#fff"/></View><Text style={[st.rbl,{color:'#2E8F64'}]}>Call</Text></TouchableOpacity>
    </View>:null}
    <View style={st.grid}>{items.map(i=>{const t=TINTS[i.key]||{bg:'#F1EDF8',fg:purple};return <TouchableOpacity key={i.key} style={[st.tile,{backgroundColor:t.bg}]} activeOpacity={0.75} onPress={()=>dismiss(()=>onSelect(i.key))} accessibilityRole="button" accessibilityLabel={i.title} accessibilityHint={i.detail}>
     <View style={st.tileIcon}><Ionicons name={i.icon} size={20} color={t.fg}/></View>
     <Ionicons name="chevron-forward" size={16} color={t.fg} style={st.tileArrow}/>
     <Text style={[st.tileTitle,{color:t.fg}]} numberOfLines={1}>{TITLE[i.key]||i.title}</Text>
     <Text style={[st.tileSub,{color:t.fg}]} numberOfLines={1}>{SHORT[i.key]||i.detail}</Text>
    </TouchableOpacity>})}</View>
   </Animated.View>
  </View>
 </Modal>;
}

const st=StyleSheet.create({
 sheet:{backgroundColor:'white',borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:18,paddingTop:8,shadowColor:'#1E2A26',shadowOpacity:0.15,shadowRadius:18,shadowOffset:{width:0,height:-4},elevation:12},
 dragZone:{alignSelf:'stretch',alignItems:'center',paddingTop:2,paddingBottom:10},
 handle:{width:40,height:5,borderRadius:3,backgroundColor:'#E2DDEC'},
 header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4},
 title:{fontSize:22,fontWeight:'900',color:ink},
 closeTarget:{width:44,height:44,alignItems:'center',justifyContent:'center',marginRight:-6},
 closeCircle:{width:32,height:32,borderRadius:16,backgroundColor:'#F1EDF8',alignItems:'center',justifyContent:'center'},
 buddy:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#DDF3E6',borderRadius:24,padding:12,marginTop:6,marginBottom:10},
 buddyTitle:{fontSize:18,fontWeight:'900',color:'#1D2B33'},buddySub:{fontSize:12,fontWeight:'700',color:'#4C7A62',marginTop:2},
 rb:{alignItems:'center',gap:3},rbc:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},rbl:{fontSize:10,fontWeight:'800'},
 callc:{backgroundColor:'#34B37E',shadowColor:'#34B37E',shadowOpacity:0.35,shadowRadius:8,shadowOffset:{width:0,height:5}},
 grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10,marginBottom:6},
 tile:{width:'48.5%',borderRadius:22,padding:14,minHeight:92},
 tileIcon:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(255,255,255,0.75)',alignItems:'center',justifyContent:'center'},
 tileArrow:{position:'absolute',right:14,top:16,opacity:0.6},
 tileTitle:{fontSize:15,fontWeight:'900',marginTop:10},tileSub:{fontSize:11,fontWeight:'700',opacity:0.75,marginTop:1},
});
