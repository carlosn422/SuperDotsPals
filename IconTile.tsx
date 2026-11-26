import React from 'react';
import {View} from 'react-native';
import Svg,{Defs,LinearGradient,Rect,Stop} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Rounded icon tile with a soft two-tone gradient and a filled glyph in the accent color. */
export function IconTile({icon,color,size=44}:{icon:string;color:string;size?:number}){
 const filled=icon.replace(/-outline$/,'') as keyof typeof Ionicons.glyphMap;
 const id='tile'+color.replace('#','');
 return <View style={{width:size,height:size}} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
  <Svg width={size} height={size} style={{position:'absolute'}}>
   <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={color} stopOpacity={0.12}/><Stop offset="1" stopColor={color} stopOpacity={0.3}/></LinearGradient></Defs>
   <Rect x={0} y={0} width={size} height={size} rx={size*0.32} fill={'url(#'+id+')'}/>
   <Rect x={size*0.12} y={size*0.08} width={size*0.76} height={size*0.3} rx={size*0.15} fill="#fff" opacity={0.35}/>
  </Svg>
  <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Ionicons name={filled in Ionicons.glyphMap?filled:icon as any} size={size*0.52} color={color}/></View>
 </View>;
}
