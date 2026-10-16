import React,{useEffect,useState} from 'react';
import {Image,AppState,AccessibilityInfo} from 'react-native';
import MoodMascot from './MoodMascot';
import {MASCOT_FRAMES,MASCOT_FPS} from './MascotAnimationAssets';
export default function SuperdotMascot({id,size=102}:{id:string;color?:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}){
 const tired=['tired','sleepy','exhausted','fatigued'].some(v=>id.toLowerCase().includes(v));
 const [index,setIndex]=useState(0);
 const [active,setActive]=useState(AppState.currentState==='active');
 const [reduceMotion,setReduceMotion]=useState(false);
 useEffect(()=>{const a=AppState.addEventListener('change',state=>setActive(state==='active')); const m=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);return()=>{a.remove();m.remove()};},[]);
 useEffect(()=>{if(!tired||!active||reduceMotion||MASCOT_FRAMES.tired.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%MASCOT_FRAMES.tired.length),1000/MASCOT_FPS);return()=>clearInterval(timer);},[tired,active,reduceMotion]);
 if(tired&&MASCOT_FRAMES.tired.length)return <Image source={MASCOT_FRAMES.tired[index%MASCOT_FRAMES.tired.length]} style={{width:size,height:size}} resizeMode="contain" accessibilityLabel="Tired mood mascot"/>;
 return <MoodMascot mood={tired?'sadness':id} size={size}/>;
}
