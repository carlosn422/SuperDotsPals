import React,{useState} from 'react';
import {Modal,Pressable,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Emoji,EmojiStyle} from './EmojiCatalog';
import {usePlus} from './PlusStore';
import {PlusPaywallSheet} from './PlusPaywall';
import {CT} from './CircleComponents';

// Circle-specific Plus picker: support reactions only, not an unrelated emoji keyboard.
// Keep 3D artwork as a Plus benefit while showing older reactions unchanged in chat.
import {SUPPORT_REACTIONS,REACTION_LABELS} from './LittleSignalsData';

export default function EmojiPickerSheet({visible,title,onClose,onPick}:{visible:boolean;title:string;onClose:()=>void;onPick:(e:string,style:EmojiStyle)=>void}){
 const {isPlus,showPaywall}=usePlus();
 const [style,setStyle]=useState<EmojiStyle>('standard');
 const select=(e:string)=>{
  if(!isPlus){showPaywall('circles');return;}
  onPick(e,style);
 };
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable style={{flex:1,backgroundColor:'rgba(0,0,0,.25)'}} onPress={onClose} accessibilityLabel="Close reaction picker"/>
  <View style={{backgroundColor:'#fff',borderTopLeftRadius:26,borderTopRightRadius:26,padding:18,gap:16}}>
   <View style={{alignSelf:'center',width:38,height:5,borderRadius:3,backgroundColor:'#DDE5E0'}}/>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <Text style={{flex:1,fontSize:16,fontWeight:'900',color:CT.ink}} numberOfLines={2}>{title}</Text>
    <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={24} color={CT.muted}/></TouchableOpacity>
   </View>
   <Text style={{fontSize:13,color:CT.muted}}>Choose a supportive response.</Text>
   <View style={{flexDirection:'row',backgroundColor:'#F0F4F2',borderRadius:14,padding:3,alignSelf:'flex-start'}}>
    {(['standard','3d'] as EmojiStyle[]).map(t=><TouchableOpacity key={t} onPress={()=>setStyle(t)} accessibilityRole="button" accessibilityState={{selected:style===t}} style={{paddingHorizontal:18,paddingVertical:9,borderRadius:11,backgroundColor:style===t?'#fff':'transparent'}}><Text style={{fontWeight:'800',color:style===t?CT.primary:CT.muted}}>{t==='3d'?'3D':'Standard'}</Text></TouchableOpacity>)}
   </View>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
    {SUPPORT_REACTIONS.map(e=><TouchableOpacity key={e} onPress={()=>select(e)} accessibilityRole="button" accessibilityLabel={REACTION_LABELS[e]+(isPlus?'':', Plus')} style={{width:'30%',minWidth:88,flexGrow:1,borderRadius:16,backgroundColor:'#F5F8F6',paddingVertical:14,alignItems:'center',gap:6,opacity:isPlus?1:.55}}><Emoji e={e} style={style} size={30}/><Text style={{fontSize:11,color:CT.ink,fontWeight:'700',textAlign:'center'}}>{REACTION_LABELS[e]}</Text></TouchableOpacity>)}
   </View>
   {!isPlus?<TouchableOpacity onPress={()=>showPaywall('circles')} style={{padding:12,borderRadius:12,backgroundColor:CT.primarySoft,flexDirection:'row',gap:8,alignItems:'center'}}><Ionicons name="lock-closed" color={CT.primary} size={16}/><Text style={{flex:1,color:CT.ink,fontWeight:'700'}}>Unlock more reaction styles with Plus</Text></TouchableOpacity>:null}
  </View>
  {visible?<PlusPaywallSheet nested/>:null}
 </Modal>;
}
