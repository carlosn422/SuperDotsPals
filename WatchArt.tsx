import React,{useEffect,useState} from 'react';
import {Image,View,Text,TouchableOpacity,Modal,ScrollView,ActivityIndicator,StyleSheet} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export const WATCH_COLORS=['charcoal','ivory','navy','rose','mint','lavender'] as const;
export type WatchColor=typeof WATCH_COLORS[number];
const IMAGES:Record<WatchColor,number>={
 charcoal:require('./assets/watches/watch_charcoal.png'),
 ivory:require('./assets/watches/watch_ivory.png'),
 navy:require('./assets/watches/watch_navy.png'),
 rose:require('./assets/watches/watch_rose.png'),
 mint:require('./assets/watches/watch_mint.png'),
 lavender:require('./assets/watches/watch_lavender.png'),
};
// The PNGs share one 320×490 canvas; the blank badge circle sits at the same spot in each.
const ASPECT=320/490,BADGE={x:.79,y:.713,d:.254};
const ink='#251C45',muted='#807694',purple='#6953CA';

export const isWatchColor=(c:unknown):c is WatchColor=>WATCH_COLORS.includes(c as WatchColor);
export const colorName=(c:WatchColor)=>c.charAt(0).toUpperCase()+c.slice(1);

// First letters of the first and last words, or first and last letters of a single word. "Tristan" → TN, "John Smith" → JS, "A" → AA.
export function watchInitials(name:string){
 const words=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/)
  .map(w=>[...w].filter(c=>c.toLowerCase()!==c.toUpperCase()).join('')).filter(Boolean);
 if(!words.length)return '--';
 const first=words[0],last=words[words.length-1];
 return (first.charAt(0)+(words.length>1?last.charAt(0):first.charAt(first.length-1))).toUpperCase();
}

export function WatchImage({color,name,width=96}:{color:WatchColor|null;name:string;width?:number}){
 const height=width/ASPECT,d=width*BADGE.d;
 return <View style={{width,height}} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
  <Image source={IMAGES[color||'charcoal']} style={{width,height}} resizeMode="contain"/>
  <View style={{position:'absolute',left:width*BADGE.x-d/2,top:height*BADGE.y-d/2,width:d,height:d,alignItems:'center',justifyContent:'center'}}>
   <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{width:d*.72,textAlign:'center',fontSize:d*.4,fontWeight:'900',color:'#3B2F63'}}>{watchInitials(name)}</Text>
  </View>
 </View>;
}

export function WatchRow({color,name,title,lines,onPress,last,label}:{color:WatchColor|null;name:string;title:string;lines:string[];onPress:()=>void;last?:boolean;label:string}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[st.row,!last&&st.divider]}>
  <WatchImage color={color} name={name} width={76}/>
  <View style={{flex:1,gap:3}}>
   <Text style={st.rowTitle}>{title}</Text>
   {lines.filter(Boolean).map(l=><Text key={l} style={st.sub}>{l}</Text>)}
  </View>
  <View style={{alignItems:'center',gap:16}}><Ionicons name="chevron-forward" size={20} color={muted}/><Ionicons name="information-circle-outline" size={26} color={purple}/></View>
 </TouchableOpacity>;
}

export function WatchColorGrid({value,onChange,name}:{value:WatchColor|null;onChange:(c:WatchColor)=>void;name:string}){
 return <View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10}}>
  {WATCH_COLORS.map(c=>{const sel=value===c;return <TouchableOpacity key={c} accessibilityRole="radio" accessibilityState={{selected:sel}} accessibilityLabel={colorName(c)+' watch'} onPress={()=>onChange(c)} style={[st.cell,sel&&st.cellOn]}>
   <WatchImage color={c} name={name} width={66}/>
   <Text style={{fontWeight:'800',color:ink,marginTop:4,fontSize:13}}>{colorName(c)}</Text>
   {sel?<Ionicons name="checkmark-circle" size={20} color={purple} style={{position:'absolute',top:5,right:5}}/>:null}
  </TouchableOpacity>})}
 </View>;
}

export const COLOR_NOTE='This only changes the picture in MoodPals. Your Apple Watch, its pairing and its sign-in stay the same.';

export function WatchColorSheet({visible,name,initial,onSave,onClose}:{visible:boolean;name:string;initial:WatchColor|null;onSave:(c:WatchColor)=>Promise<void>;onClose:()=>void}){
 const [color,setColor]=useState<WatchColor|null>(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(visible){setColor(initial);setError('')}},[visible,initial]);
 async function save(){if(!color)return;setBusy(true);setError('');try{await onSave(color);onClose()}catch(e:any){setError(e.message||'Unable to save color')}finally{setBusy(false)}}
 return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={busy?undefined:onClose}>
  <ScrollView contentContainerStyle={{padding:22,gap:14}}>
   <TouchableOpacity disabled={busy} onPress={onClose}><Text style={{color:purple,fontWeight:'800'}}>‹ Back</Text></TouchableOpacity>
   <Text style={st.title}>Watch Color</Text>
   <Text style={st.sub}>{COLOR_NOTE}</Text>
   <View style={{alignItems:'center'}}><WatchImage color={color} name={name} width={120}/></View>
   <WatchColorGrid value={color} onChange={setColor} name={name}/>
   {error?<Text style={[st.sub,{color:'#C64F67'}]}>{error}</Text>:null}
   <TouchableOpacity accessibilityRole="button" disabled={!color||color===initial||busy} onPress={()=>void save()} style={[st.button,(!color||color===initial||busy)&&{opacity:.45}]}>{busy?<ActivityIndicator color="white"/>:<Text style={{color:'white',fontWeight:'900'}}>Save Color</Text>}</TouchableOpacity>
  </ScrollView>
 </Modal>;
}

export function SectionHeader({title,action,onAction,disabled}:{title:string;action:string;onAction:()=>void;disabled?:boolean}){
 return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
  <Text style={st.title}>{title}</Text>
  <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onAction} style={[st.pill,disabled&&{opacity:.45}]}><Ionicons name="add" size={18} color={purple}/><Text style={{color:purple,fontWeight:'800'}}>{action}</Text></TouchableOpacity>
 </View>;
}

const st=StyleSheet.create({
 title:{fontWeight:'900',fontSize:20,color:ink,flexShrink:1},sub:{fontSize:12,lineHeight:18,color:muted},
 row:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:12},divider:{borderBottomWidth:1,borderBottomColor:'#EEEAF4'},
 rowTitle:{fontWeight:'800',fontSize:16,color:ink},
 cell:{width:'31.5%',alignItems:'center',paddingVertical:8,borderRadius:16,borderWidth:2,borderColor:'transparent',backgroundColor:'#FAF9FC'},
 cellOn:{borderColor:purple,backgroundColor:'#F1EDFB'},
 button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},
 pill:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#F1EDFB',borderRadius:18,paddingHorizontal:14,minHeight:36},
});
