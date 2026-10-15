import React from 'react';
import {View,Text,Image,ImageSourcePropType} from 'react-native';
import Svg,{Circle,Path} from 'react-native-svg';

export type Emotion='joy'|'sadness'|'anger'|'fear'|'disgust';
export const APP_THEME={primary:'#6957C8',primarySoft:'#EAE6FA',background:'#F7F7F5',surface:'#FFFFFF',ink:'#283246',muted:'#758196',mint:'#E6F4EA',border:'#E8E9ED'} as const;
export function moodToEmotion(value?:string|null):Emotion{
 const m=(value||'').trim().toLowerCase();
 if(['happy','good','great','joyful','excited','proud','energized','positive'].some(w=>m.includes(w)))return 'joy';
 if(['angry','frustrated','irritated','mad','furious'].some(w=>m.includes(w)))return 'anger';
 if(['anxious','nervous','stressed','overwhelmed','worried','afraid','scared','fear','panic'].some(w=>m.includes(w)))return 'fear';
 if(['sad','down','low','tired','exhausted','depressed','lonely'].some(w=>m.includes(w)))return 'sadness';
 return 'disgust'; // calm / okay / neutral defaults to the relaxed green character
}
export const EMOTION_COLORS:Record<Emotion,string>={joy:'#EAAF2C',sadness:'#448CCA',anger:'#DA4B31',fear:'#9B7BC8',disgust:'#57B56F'};
const FIGURES:Record<Emotion,string>={joy:'😊',sadness:'😔',anger:'😠',fear:'😟',disgust:'😌'};
// Asset sources are provided separately in the approved mascot pack.
export default function MoodMascot({mood,size=102}:{mood?:string|null;size?:number}){
 const emotion=moodToEmotion(mood);
 return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><Svg width={size} height={size} viewBox="0 0 100 100"><Circle cx="50" cy="49" r="38" fill={EMOTION_COLORS[emotion]}/><Circle cx="38" cy="42" r="4.5" fill="#25304A"/><Circle cx="63" cy="42" r="4.5" fill="#25304A"/><Path d={emotion==='joy'?'M34 57 Q50 77 67 57':emotion==='anger'?'M34 68 Q50 52 67 68':emotion==='fear'?'M42 66 Q50 53 58 66':emotion==='sadness'?'M36 66 Q50 52 65 66':'M38 60 Q50 68 65 60'} stroke="#25304A" strokeWidth="4" strokeLinecap="round" fill="none"/></Svg></View>;
}
