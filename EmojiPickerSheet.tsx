import React,{useEffect,useMemo,useState} from 'react';
import {FlatList,Modal,Pressable,Text,TextInput,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {EMOJI_GROUPS,Emoji,EmojiItem,EmojiStyle,emojiItem} from './EmojiCatalog';
import {usePlus} from './PlusStore';
import {PlusPaywallSheet} from './PlusPaywall';
import {CT} from './CircleComponents';

const RECENT_KEY='circle.recentEmoji';
const ICONS:Record<string,keyof typeof Ionicons.glyphMap>={recent:'time-outline',smileys:'happy-outline',animals:'paw-outline',food:'fast-food-outline',activity:'football-outline',travel:'car-outline',objects:'bulb-outline',symbols:'shapes-outline',flags:'flag-outline'};
const COLS=8;

// Plus emoji sheet: every emoji in Standard (Apple) or 3D (Fluent) art. Free accounts see it greyed out; a tap opens the paywall.
export default function EmojiPickerSheet({visible,title,onClose,onPick}:{visible:boolean;title:string;onClose:()=>void;onPick:(e:string,style:EmojiStyle)=>void}){
 const {isPlus,showPaywall}=usePlus();
 const {width,height}=useWindowDimensions();
 const [style,setStyle]=useState<EmojiStyle>('standard');
 const [query,setQuery]=useState('');
 const [recent,setRecent]=useState<string[]>([]);
 const [tab,setTab]=useState('smileys');
 useEffect(()=>{if(!visible)return;setQuery('');AsyncStorage.getItem(RECENT_KEY).then(v=>{const r:string[]=v?JSON.parse(v):[];setRecent(r);setTab(t=>r.length&&t==='smileys'?'recent':t)}).catch(()=>{})},[visible]);

 const items:EmojiItem[]=useMemo(()=>{
  const q=query.trim().toLowerCase();
  if(q)return EMOJI_GROUPS.flatMap(g=>g.items).filter(i=>i.name.includes(q));
  if(tab==='recent')return recent.map(e=>emojiItem(e)).filter((i):i is EmojiItem=>!!i);
  return EMOJI_GROUPS.find(g=>g.id===tab)?.items||[];
 },[query,tab,recent]);
 const cell=Math.floor((width-24)/COLS);
 const tabs=[...(recent.length?['recent']:[]),...EMOJI_GROUPS.map(g=>g.id)];

 const pick=(e:string)=>{
  if(!isPlus){showPaywall('circles');return}
  const next=[e,...recent.filter(x=>x!==e)].slice(0,COLS*3);
  setRecent(next);AsyncStorage.setItem(RECENT_KEY,JSON.stringify(next)).catch(()=>{});
  onPick(e,style);
 };

 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable style={{flex:1,backgroundColor:'rgba(0,0,0,.25)'}} onPress={onClose} accessibilityLabel="Close emoji picker"/>
  <View style={{height:Math.round(height*.66),backgroundColor:'#fff',borderTopLeftRadius:26,borderTopRightRadius:26,paddingTop:8}}>
   <View style={{alignSelf:'center',width:38,height:5,borderRadius:3,backgroundColor:'#DDE5E0',marginBottom:10}}/>
   <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:10}}>
    <Text numberOfLines={1} style={{flex:1,fontSize:15,fontWeight:'900',color:CT.ink}}>{title}</Text>
    <View style={{flexDirection:'row',backgroundColor:'#F0F4F2',borderRadius:14,padding:3}}>
     {(['standard','3d'] as EmojiStyle[]).map(s=><TouchableOpacity key={s} onPress={()=>setStyle(s)} accessibilityRole="button" accessibilityState={{selected:style===s}}
      style={{paddingHorizontal:12,paddingVertical:6,borderRadius:11,backgroundColor:style===s?'#fff':'transparent'}}>
      <Text style={{fontSize:13,fontWeight:'800',color:style===s?CT.primary:CT.muted}}>{s==='3d'?'3D':'Standard'}</Text></TouchableOpacity>)}
    </View>
    <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={24} color={CT.muted}/></TouchableOpacity>
   </View>
   {!isPlus?<TouchableOpacity onPress={()=>showPaywall('circles')} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:8,marginHorizontal:16,marginTop:10,backgroundColor:CT.primarySoft,borderRadius:14,paddingHorizontal:12,paddingVertical:9}}>
    <Ionicons name="lock-closed" size={15} color={CT.primary}/><Text style={{flex:1,fontSize:13,fontWeight:'700',color:CT.ink}}>Every emoji, in Standard and 3D, comes with Plus</Text><Text style={{fontSize:13,fontWeight:'900',color:CT.primary}}>Unlock</Text>
   </TouchableOpacity>:null}
   <View style={{flexDirection:'row',alignItems:'center',gap:6,marginHorizontal:16,marginTop:10,borderRadius:12,borderWidth:1,borderColor:CT.line,paddingHorizontal:10}}>
    <Ionicons name="search" size={16} color={CT.muted}/>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={CT.muted} autoCorrect={false} style={{flex:1,paddingVertical:8,fontSize:15,color:CT.ink}}/>
   </View>
   {!query?<View style={{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:12,marginTop:8}}>
    {tabs.map(t=><TouchableOpacity key={t} onPress={()=>setTab(t)} accessibilityRole="tab" accessibilityLabel={t==='recent'?'Recent':EMOJI_GROUPS.find(g=>g.id===t)?.title} accessibilityState={{selected:tab===t}}
     style={{paddingHorizontal:6,paddingVertical:6,borderBottomWidth:2,borderBottomColor:tab===t?CT.primary:'transparent'}}><Ionicons name={ICONS[t]} size={20} color={tab===t?CT.primary:CT.muted}/></TouchableOpacity>)}
   </View>:null}
   <FlatList key={style+tab+query} data={items} keyExtractor={i=>i.e} numColumns={COLS} keyboardShouldPersistTaps="handled" initialNumToRender={COLS*8} windowSize={7}
    contentContainerStyle={{paddingHorizontal:12,paddingTop:6,paddingBottom:30}}
    ListEmptyComponent={<Text style={{textAlign:'center',color:CT.muted,marginTop:30}}>No emoji found</Text>}
    renderItem={({item})=><TouchableOpacity onPress={()=>pick(item.e)} accessibilityRole="button" accessibilityLabel={item.name+(isPlus?'':', Plus')}
     style={{width:cell,height:cell,alignItems:'center',justifyContent:'center',opacity:isPlus?1:.35}}><Emoji e={item.e} style={style} size={Math.round(cell*.62)}/></TouchableOpacity>}/>
  </View>
  {visible?<PlusPaywallSheet nested/>:null}
 </Modal>;
}
