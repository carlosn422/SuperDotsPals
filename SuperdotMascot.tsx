import React from 'react';
import MoodMascot,{AnimatedMascotFrames} from './MoodMascot';
import {MASCOT_FRAMES} from './MascotAnimationAssets';

export default function SuperdotMascot({id,size=102}:{id:string;color?:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}){
 const tired=['tired','sleepy','exhausted','fatigued'].some(v=>id.toLowerCase().includes(v));
 if(tired&&MASCOT_FRAMES.tired.length){
  return <AnimatedMascotFrames frames={MASCOT_FRAMES.tired} size={size} label="Tired mood mascot"/>;
 }
 return <MoodMascot mood={tired?'sadness':id} size={size}/>;
}
