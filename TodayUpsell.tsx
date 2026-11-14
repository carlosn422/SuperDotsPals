import React from 'react';
import {StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SuperdotMascot from './SuperdotMascot';
import {SW} from './StressTheme';
import {PlusFeature,usePlus} from './PlusStore';

const PLUS='#7B5CE6',PLUS_SOFT='#F1ECFF';

export function PlusBadge(){return <View style={s.badge}><Text style={s.badgeText}>PLUS</Text></View>;}

// compact: smaller version that sits in the corner of the Today mascot card.
export function UpgradePill({compact=false}:{compact?:boolean}={}){
 const {isPlus,showPaywall}=usePlus();
 if(isPlus)return null;
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Upgrade to MoodPals Plus" onPress={()=>showPaywall('general')} hitSlop={6} style={[s.pill,compact&&{paddingHorizontal:10,minHeight:30,gap:5}]}>
  <Ionicons name="sparkles" size={compact?13:15} color={PLUS}/><Text style={[s.pillText,compact&&{fontSize:13}]}>Upgrade</Text>
 </TouchableOpacity>;
}

const BARS=[38,62,45,80,55,70,30,66,48,74,58,40,68,52];
export function LockedPreviewCard({title,body,feature}:{title:string;body:string;feature:PlusFeature}){
 const {isPlus,showPaywall}=usePlus();
 if(isPlus)return null;
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${title}, MoodPals Plus feature. ${body} Opens upgrade options`} activeOpacity={0.85} onPress={()=>showPaywall(feature)} style={s.card}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={[s.cardTitle,{color:SW.muted}]}>{title}</Text><PlusBadge/></View>
  <View style={s.preview}>
   <View style={s.bars}>{BARS.map((h,i)=><View key={i} style={[s.bar,{height:`${h}%`,backgroundColor:i%3===0?'#C9C3DE':i%3===1?'#D6E3DC':'#E3DDD0'}]}/>)}</View>
   <View style={s.lockOverlay}>
    <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Ionicons name="lock-closed" size={16} color={SW.muted}/><Text style={s.lockText}>Unlock Plus to view</Text></View>
    <View style={s.lockButton}><Text style={s.lockButtonText}>See Plus</Text></View>
   </View>
  </View>
  <Text style={s.body}>{body}</Text>
 </TouchableOpacity>;
}

export function PlusOfferCard({onAllPlans}:{onAllPlans:()=>void}){
 const {isPlus,showPaywall,prices}=usePlus();
 if(isPlus)return null;
 return <View style={[s.card,{backgroundColor:PLUS_SOFT,gap:10}]}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   <View style={{flex:1,gap:4}}>
    <Text style={s.offerEyebrow}>✦ MoodPals Plus ✦</Text>
    <Text style={s.offerPrice}>{prices.annual.price}<Text style={s.offerPeriod}> / {prices.annual.period}</Text></Text>
    <Text style={s.body}>{prices.annual.note?prices.annual.note+' · ':''}or {prices.monthly.price} / {prices.monthly.period}</Text>
   </View>
   <SuperdotMascot id="joy" size={76}/>
  </View>
  <Text style={s.body}>Full trends history, AI reflections, more groups, watch colours and family watches.</Text>
  <View style={s.offerActions}>
   <TouchableOpacity accessibilityRole="button" onPress={()=>showPaywall('general')} style={s.offerAction}><Text style={s.offerActionText}>Try Plus</Text></TouchableOpacity>
   <View style={{width:1,backgroundColor:'#DCD3F7'}}/>
   <TouchableOpacity accessibilityRole="button" onPress={onAllPlans} style={s.offerAction}><Text style={s.offerActionText}>All Plans</Text></TouchableOpacity>
  </View>
 </View>;
}

export function InviteFriendsCard({onInvite}:{onInvite:()=>void}){
 const orbit=(id:string,pos:object,size=40)=><View style={[s.orbit,pos,{width:size+8,height:size+8,borderRadius:(size+8)/2}]}><SuperdotMascot id={id} size={size} animate={false}/></View>;
 return <View style={{gap:10}}>
  <Text style={s.section}>Share with your circle</Text>
  <View style={[s.card,{alignItems:'center',paddingTop:8}]}>
   <View style={s.art}>
    <View style={[s.ring,{width:190,height:190,borderRadius:95,opacity:0.5}]}/>
    <View style={[s.ring,{width:130,height:130,borderRadius:65}]}/>
    <View style={{flexDirection:'row',alignItems:'flex-end'}}><SuperdotMascot id="disgust" size={74}/><View style={{marginLeft:-18}}><SuperdotMascot id="joy" size={96}/></View></View>
    {orbit('tired',{top:6,left:18})}
    {orbit('anger',{top:14,right:16})}
    {orbit('sadness',{bottom:22,left:38},32)}
    {orbit('fear',{bottom:16,right:30},36)}
   </View>
   <Text style={s.inviteTitle}>Stay close to the ones you care about</Text>
   <Text style={[s.body,{textAlign:'center'}]}>Invite friends and family to your private circle to share moods and send little signals.</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Invite friends" onPress={onInvite} style={s.invite}><Ionicons name="person-add-outline" size={18} color="#fff"/><Text style={s.inviteText}>Invite</Text></TouchableOpacity>
  </View>
 </View>;
}

const s=StyleSheet.create({
 badge:{backgroundColor:PLUS,borderRadius:7,paddingHorizontal:7,paddingVertical:2},badgeText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:0.5},
 pill:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#fff',borderRadius:18,paddingHorizontal:14,minHeight:36,borderWidth:1,borderColor:'#E3DAFB',shadowColor:'#5B3FC4',shadowOpacity:0.08,shadowRadius:8,shadowOffset:{width:0,height:3}},
 pillText:{color:PLUS,fontWeight:'900',fontSize:14},
 card:{backgroundColor:SW.card,borderRadius:24,padding:17,gap:12,shadowColor:'#2D4A3E',shadowOpacity:0.06,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:2},
 cardTitle:{fontSize:19,fontWeight:'800',color:SW.ink},body:{color:SW.muted,fontSize:13,lineHeight:18},
 preview:{height:140,borderRadius:16,overflow:'hidden',backgroundColor:'#F6F7F7'},
 bars:{flex:1,flexDirection:'row',alignItems:'flex-end',gap:6,padding:12,opacity:0.55},bar:{flex:1,borderRadius:5},
 lockOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(246,247,247,0.55)',alignItems:'center',justifyContent:'center',gap:10},
 lockText:{color:SW.muted,fontWeight:'800',fontSize:15},lockButton:{backgroundColor:SW.green,borderRadius:18,paddingHorizontal:26,paddingVertical:9},lockButtonText:{color:'#fff',fontWeight:'900',fontSize:14},
 offerEyebrow:{color:PLUS,fontWeight:'900',fontSize:13},offerPrice:{color:PLUS,fontWeight:'900',fontSize:30},offerPeriod:{fontSize:15,fontWeight:'800'},
 offerActions:{flexDirection:'row',borderTopWidth:1,borderTopColor:'#DCD3F7',paddingTop:4},offerAction:{flex:1,alignItems:'center',justifyContent:'center',minHeight:44},offerActionText:{color:PLUS,fontWeight:'800',fontSize:15},
 section:{fontWeight:'900',fontSize:19,color:SW.ink},
 art:{width:'100%',height:200,alignItems:'center',justifyContent:'center'},ring:{position:'absolute',backgroundColor:'#DDF2E5'},
 orbit:{position:'absolute',backgroundColor:'#fff',alignItems:'center',justifyContent:'center',shadowColor:'#2D4A3E',shadowOpacity:0.1,shadowRadius:6,shadowOffset:{width:0,height:2}},
 inviteTitle:{fontSize:18,fontWeight:'900',color:SW.ink,textAlign:'center'},
 invite:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:SW.green,borderRadius:24,minHeight:48,alignSelf:'stretch',marginHorizontal:24},inviteText:{color:'#fff',fontWeight:'900',fontSize:17},
});
