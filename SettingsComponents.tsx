import React from 'react';
import {View,Text,TouchableOpacity,ScrollView,StyleSheet,Alert} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SuperdotMascot from './SuperdotMascot';

export const COMPANIONS=[
 {id:'bloop',name:'Bloop',theme:'grape',color:'#7139E9',tint:'#EEE5FF',personality:'Curious and cuddly'},
 {id:'poppy',name:'Poppy',theme:'coral',color:'#E76B8A',tint:'#FFE7EE',personality:'Warm and cheerful'},
 {id:'mochi',name:'Mochi',theme:'sky',color:'#488CD9',tint:'#E2F1FF',personality:'Calm and cozy'},
 {id:'zuzu',name:'Zuzu',theme:'sunny',color:'#E3A426',tint:'#FFF4CE',personality:'Bright and bubbly'},
 {id:'nori',name:'Nori',theme:'mint',color:'#3BA986',tint:'#E1F8ED',personality:'Soft and peaceful'}
] as const;

export function PromoBanner({companion}:{companion:string}){
 return <View style={s.promo}>
  <View style={s.promoCircle}/>
  <View style={{flex:1,zIndex:1,gap:9}}><Text style={s.promoTitle}>A little more care, every day.</Text><Text style={s.promoSubtitle}>Explore what's coming to Superdots Pro.</Text><TouchableOpacity onPress={()=>Alert.alert('Superdots Pro','Plans and trials are not available yet. No purchase will be started.')} style={s.promoButton}><Text style={s.promoButtonText}>Coming soon  →</Text></TouchableOpacity></View>
  <View style={{zIndex:1}}><SuperdotMascot id={companion} color={COMPANIONS.find(c=>c.id===companion)?.color||'#7139E9'} size={106}/></View>
 </View>;
}
export function ThemeCard({selected,onOpen}:{selected:string;onOpen:()=>void}){
 const current=COMPANIONS.find(c=>c.id===selected)||COMPANIONS[0];
 return <TouchableOpacity accessibilityRole="button" onPress={onOpen} style={s.themeCard}>
  <View style={{flex:1,gap:4}}><Text style={s.title}>Choose your Superdot theme</Text><Text style={s.subtitle}>Meet your buddies and customize your app</Text><Text style={[s.micro,{color:current.color}]}>Current: {current.name}</Text></View>
  <View style={{alignItems:'center',gap:5}}><SuperdotMascot id={selected} color={current.color} size={53}/><Ionicons name="chevron-forward" size={15} color="#9E98A8"/></View>
 </TouchableOpacity>;
}
export function ThemeGallery({selected,onSelect,saving}:{selected:string;onSelect:(id:string,theme:string)=>void;saving:boolean}){
 return <View style={{gap:15}}><Text style={s.subtitle}>Pick a companion to personalize your app colors. Your selection is saved to Supabase and can sync to your Apple Watch when signed in there.</Text>
 <View style={s.gallery}>{COMPANIONS.map(c=><TouchableOpacity key={c.id} disabled={saving} onPress={()=>onSelect(c.id,c.theme)} accessibilityRole="radio" accessibilityState={{checked:selected===c.id}} style={[s.character,{backgroundColor:selected===c.id?c.tint:'#FFFFFF',borderColor:selected===c.id?c.color:'#E9E9EF'}]}><SuperdotMascot id={c.id} color={c.color} size={96}/><Text style={s.characterName}>{c.name}</Text><Text style={s.characterDescription}>{c.personality}</Text>{selected===c.id?<Text style={[s.selected,{color:c.color}]}>✓ Selected</Text>:null}</TouchableOpacity>)}</View>
 </View>;
}
export function WatchThemesCard({onOpen}:{onOpen:()=>void}){
 return <View style={s.watchCard}>
  <TouchableOpacity onPress={onOpen} style={s.watchTop}><View style={s.iconBadge}><Ionicons name="watch-outline" size={25} color="#6C6680"/></View><View style={{flex:1,gap:4}}><Text style={s.title}>Apple Watch Faces & Widgets</Text><Text style={s.subtitle}>Companions, complications and widgets</Text><Text style={s.micro}>Theme sync available in the watch app</Text></View><View style={s.watchMock}><Ionicons name="watch" size={32} color="#5A448C"/><Text style={{fontSize:8,color:'#6D5992'}}>♥</Text></View><Ionicons name="chevron-forward" size={17} color="#9E98A8"/></TouchableOpacity>
  <View style={s.separator}/>
  <Text style={s.subtitle}>Choose a Superdot theme in Settings, then sync it from the watch app. Custom face creation and redemption are not available yet.</Text>
 </View>;
}
type SettingIcon='heart-outline'|'notifications-outline'|'shield-checkmark-outline'|'help-circle-outline'|'git-network-outline'|'person-circle-outline';
export function SettingsItem({title,subtitle,status,icon,onPress,accent='#7139E9'}:{title:string;subtitle:string;status?:string;icon:SettingIcon;onPress:()=>void;accent?:string}){
 return <TouchableOpacity onPress={onPress} accessibilityRole="button" style={s.settingRow}><View style={[s.iconBadge,{backgroundColor:'#F1EFF5'}]}><Ionicons name={icon} size={23} color={accent}/></View><View style={{flex:1,gap:3}}><Text style={s.title}>{title}</Text><Text style={s.subtitle}>{subtitle}</Text>{status?<Text style={s.micro}>{status}</Text>:null}</View><Ionicons name="chevron-forward" size={17} color="#AAA4AF"/></TouchableOpacity>;
}
const s=StyleSheet.create({
 promo:{backgroundColor:'#C9F5EA',borderRadius:24,padding:20,minHeight:165,flexDirection:'row',alignItems:'center',overflow:'hidden',position:'relative',gap:5,shadowColor:'#42796D',shadowOpacity:0.08,shadowRadius:14,elevation:2},
 promoCircle:{position:'absolute',width:210,height:210,borderRadius:110,backgroundColor:'#BDEFF3',right:-75,top:-55},
 promoTitle:{fontSize:22,lineHeight:26,fontWeight:'900',color:'#185748'},promoSubtitle:{fontSize:11,color:'#4E8F82',lineHeight:17},promoButton:{alignSelf:'flex-start',backgroundColor:'#62BDA0',paddingVertical:9,paddingHorizontal:17,borderRadius:20},promoButtonText:{fontSize:12,color:'#fff',fontWeight:'800'},
 themeCard:{backgroundColor:'#fff',borderRadius:23,padding:17,flexDirection:'row',alignItems:'center',gap:10,shadowColor:'#202020',shadowOpacity:0.05,shadowRadius:10,elevation:2},
 title:{fontSize:15,fontWeight:'800',color:'#252132'},subtitle:{fontSize:12,color:'#888493',lineHeight:17},micro:{fontSize:10,color:'#519881',fontWeight:'700'},
 gallery:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10},character:{width:'48%',minHeight:175,borderWidth:2,borderRadius:22,padding:12,alignItems:'center',justifyContent:'center',gap:5,shadowColor:'#302749',shadowOpacity:.04,shadowRadius:8,elevation:1},
 characterName:{fontSize:16,fontWeight:'900',color:'#25145C'},characterDescription:{fontSize:11,color:'#8276A5',textAlign:'center'},selected:{fontSize:11,fontWeight:'800'},
 watchCard:{backgroundColor:'#fff',borderRadius:24,padding:17,gap:13,shadowColor:'#202020',shadowOpacity:0.06,shadowRadius:11,elevation:2},watchTop:{flexDirection:'row',alignItems:'center',gap:9},iconBadge:{backgroundColor:'#EDEAF1',width:44,height:44,borderRadius:15,justifyContent:'center',alignItems:'center'},watchMock:{backgroundColor:'#EDE7FD',borderRadius:11,padding:5,alignItems:'center'},separator:{height:1,backgroundColor:'#EEEFF0'},badge:{borderRadius:6,backgroundColor:'#B8C6E7',paddingVertical:3,paddingHorizontal:6},badgeText:{fontSize:9,fontWeight:'800',color:'#fff'},actionRow:{flexDirection:'row',gap:8},watchAction:{flex:1,paddingVertical:13,borderRadius:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:5},actionText:{fontSize:11,fontWeight:'800',color:'#382C46'},
 settingRow:{backgroundColor:'#fff',borderRadius:21,padding:15,flexDirection:'row',alignItems:'center',gap:12,shadowColor:'#272039',shadowOpacity:0.04,shadowRadius:10,elevation:1}
});
