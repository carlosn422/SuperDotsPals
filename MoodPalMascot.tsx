import React,{useEffect,useRef} from 'react';
import {Animated,AccessibilityInfo} from 'react-native';
import Svg,{Defs,LinearGradient,Stop,Path,Ellipse,Circle,G} from 'react-native-svg';

const PALETTE={
 joyful:{light:'#FFF5AC',main:'#FFD45D',deep:'#FFB94E',face:'#4C204C',cheek:'#FFABC1'},
 calm:{light:'#D0FFE0',main:'#76E8C4',deep:'#40C7BB',face:'#244C57',cheek:'#80EFC2'},
 sad:{light:'#C5E5FF',main:'#78B8FF',deep:'#5086FF',face:'#243769',cheek:'#FFBDD7'},
 angry:{light:'#FFC3AC',main:'#FF867F',deep:'#F34C79',face:'#4E1938',cheek:'#FFA5A5'},
 anxious:{light:'#E4C7FF',main:'#B998FC',deep:'#8169ED',face:'#42326C',cheek:'#F9B7E9'},
 tired:{light:'#D6D9FF',main:'#A6B4FF',deep:'#7987F0',face:'#41406E',cheek:'#FFC4DF'}
} as const;
type Mood=keyof typeof PALETTE;
function resolveMood(id:string):Mood {
 const x=(id||'').toLowerCase();
 if(/sad|down|cry/.test(x))return 'sad';
 if(/angry|anger|mad|frustrat/.test(x))return 'angry';
 if(/anxious|fear|worr|stress|overwhelm/.test(x))return 'anxious';
 if(/tired|sleep|exhaust|fatigu/.test(x))return 'tired';
 if(/calm|disgust|relax|peace|nori/.test(x))return 'calm';
 return 'joyful';
}
export default function MoodPalMascot({id='calm',size=102,animate=true}:{id?:string;size?:number;color?:string;animate?:boolean}) {
 const mood=resolveMood(id),p=PALETTE[mood];
 const pulse=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
  if(!animate)return;
  let alive=true;let loop:Animated.CompositeAnimation|null=null;
  void AccessibilityInfo.isReduceMotionEnabled().then(reduce=>{
   if(!alive||reduce)return;
   loop=Animated.loop(Animated.sequence([
    Animated.timing(pulse,{toValue:1,duration:2100,useNativeDriver:true}),
    Animated.timing(pulse,{toValue:0,duration:2100,useNativeDriver:true})
   ]));loop.start();
  });
  return()=>{alive=false;loop?.stop();pulse.setValue(0)};
 },[animate,pulse]);
 const scale=pulse.interpolate({inputRange:[0,1],outputRange:[1,1.012]});
 const closed=mood==='joyful'||mood==='calm'||mood==='tired';
 const mouth=mood==='joyful'?'M 75 86 Q 90 105 105 86 Z':mood==='calm'?'M 81 88 Q 90 96 99 88':mood==='sad'?'M 78 98 Q 90 83 102 98':mood==='angry'?'M 79 95 Q 90 82 101 95':mood==='anxious'?'M 79 94 Q 84 85 90 94 Q 96 85 101 94':'M 87 88 Q 90 96 94 88';
 return <Animated.View accessibilityLabel={mood+' MoodPal mascot'} style={{width:size,height:size,transform:[{scale}]}}>
  <Svg width={size} height={size} viewBox="0 0 180 180">
   <Defs><LinearGradient id="palBody" x1="0" y1="0" x2="0.9" y2="1"><Stop offset="0" stopColor={p.light}/><Stop offset=".52" stopColor={p.main}/><Stop offset="1" stopColor={p.deep}/></LinearGradient><LinearGradient id="palFoot" x1="0" y1="0" x2="0.7" y2="1"><Stop offset="0" stopColor={p.light}/><Stop offset="1" stopColor={p.deep}/></LinearGradient></Defs>
   <Ellipse cx="90" cy="160" rx="61" ry="7" fill={p.deep} opacity=".15"/>
   <Path d="M 27 112 C 15 82 30 53 47 38 C 65 18 106 23 124 37 C 157 55 164 104 153 128 C 141 156 45 158 27 112 Z" fill="url(#palBody)"/>
   <Ellipse cx="58" cy="130" rx="29" ry="26" fill="url(#palFoot)"/><Ellipse cx="121" cy="130" rx="29" ry="26" fill="url(#palFoot)"/>
   <Ellipse cx="67" cy="91" rx="10" ry="7" fill={p.cheek} opacity=".65"/><Ellipse cx="115" cy="91" rx="10" ry="7" fill={p.cheek} opacity=".65"/>
   {closed?<G stroke={p.face} strokeWidth="5" strokeLinecap="round" fill="none"><Path d="M 54 73 Q 66 85 78 73"/><Path d="M 103 73 Q 115 85 127 73"/></G>:<G><Ellipse cx="69" cy="76" rx="9" ry="11" fill={p.face}/><Ellipse cx="112" cy="76" rx="9" ry="11" fill={p.face}/></G>}
   {mood==='angry'?<G stroke={p.face} strokeWidth="5" strokeLinecap="round"><Path d="M 54 61 L 79 70"/><Path d="M 126 61 L 102 70"/></G>:null}
   {mood==='anxious'||mood==='sad'?<G stroke={p.face} strokeWidth="3" strokeLinecap="round" fill="none"><Path d="M 57 64 Q 66 57 76 64"/><Path d="M 104 64 Q 115 57 123 64"/></G>:null}
   <Path d={mouth} fill={mood==='joyful'?p.face:'none'} stroke={p.face} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
   {mood==='sad'?<G fill="#D8F1FF"><Path d="M 60 82 Q 54 95 61 100 Q 69 96 60 82 Z"/><Path d="M 121 82 Q 115 95 122 100 Q 130 96 121 82 Z"/></G>:null}
   {mood==='anxious'?<G fill="none" stroke={p.deep} strokeWidth="3" opacity=".8"><Path d="M 21 57 l -5 7 l 6 7 l -5 7"/><Path d="M 159 60 l 5 8 l -5 8 l 5 8"/></G>:null}
   {mood==='tired'?<G fill={p.deep}><Circle cx="141" cy="49" r="3"/><Circle cx="152" cy="34" r="4"/></G>:null}
   {mood==='joyful'?<G fill="#FFC94E"><Ellipse cx="27" cy="48" rx="4" ry="10" transform="rotate(-35 27 48)"/><Ellipse cx="153" cy="47" rx="4" ry="10" transform="rotate(35 153 47)"/></G>:null}
  </Svg>
 </Animated.View>;
}
