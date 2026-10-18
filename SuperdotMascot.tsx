import React from 'react';
import {AnimatedMascotFrames} from './MoodMascot';
import {MASCOT_FRAMES} from './MascotAnimationAssets';

// All iPhone mascot placements, including mood selection and the home hero,
// use the locally packaged PNG animation sequences.
function frameKey(id:string):keyof typeof MASCOT_FRAMES {
 const mood=(id||'').trim().toLowerCase();
 if (/tired|sleep|exhaust|fatigu/.test(mood))return 'tired';
 if (/sad|sadness|down|cry|low/.test(mood))return 'sadness';
 if (/angry|anger|mad|frustrat|irritat/.test(mood))return 'anger';
 if (/anxious|fear|worr|stress|nervous|overwhelm|afraid/.test(mood))return 'fear';
 if (/calm|disgust|relax|peace|nori/.test(mood))return 'disgust';
 return 'joy';
}
export default function SuperdotMascot({id,size=102}:{id:string;color?:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}) {
 const key=frameKey(id);
 return <AnimatedMascotFrames key={key} frames={MASCOT_FRAMES[key]} size={size} label={key==='disgust'?'Calm MoodPal':key+' MoodPal'}/>;
}
