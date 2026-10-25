import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Modal,PanResponder,Pressable,StyleSheet,Text,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export type MoreItem={key:string;title:string;detail:string;icon:React.ComponentProps<typeof Ionicons>['name']};
const purple='#6953CA',ink='#251C45',DURATION=300;

export default function MoreSheet({visible,items,onClose,onSelect}:{visible:boolean;items:MoreItem[];onClose:()=>void;onSelect:(key:string)=>void}){
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
    {items.map(i=><TouchableOpacity key={i.key} style={st.row} activeOpacity={0.7} onPress={()=>dismiss(()=>onSelect(i.key))} accessibilityRole="button" accessibilityLabel={i.title} accessibilityHint={i.detail}>
     <View style={st.icon}><Ionicons name={i.icon} size={20} color={purple}/></View>
     <View style={{flex:1}}><Text style={st.rowTitle}>{i.title}</Text><Text style={st.rowSub}>{i.detail}</Text></View>
     <Ionicons name="chevron-forward" size={18} color="#B3ABC6"/>
    </TouchableOpacity>)}
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
 row:{flexDirection:'row',alignItems:'center',gap:14,minHeight:60,paddingVertical:8},
 icon:{width:38,height:38,borderRadius:13,backgroundColor:'#F1EDF8',alignItems:'center',justifyContent:'center'},
 rowTitle:{fontSize:15,fontWeight:'800',color:ink},
 rowSub:{fontSize:12,color:'#807694',marginTop:2},
});
