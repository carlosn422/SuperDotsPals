import React from 'react';
import {Image} from 'react-native';
import {AnimatedMascotFrames} from './MoodMascot';
import {MASCOT_FRAMES} from './MascotAnimationAssets';
import {MASCOT_PREVIEW_FRAMES} from './MascotPreviewAssets';

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
export default function SuperdotMascot({id,size=102,animate=true,preview=false,playDurationMs,startDelayMs=0}:{id:string;color?:string;size?:number;animate?:boolean;preview?:boolean;playDurationMs?:number;startDelayMs?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}) {
 const key=frameKey(id);
 const frames=preview?MASCOT_PREVIEW_FRAMES[key]:MASCOT_FRAMES[key];
 if(!animate)return <Image source={frames[0]} style={{width:size,height:size}} resizeMode="contain" accessibilityLabel={key+' MoodPal preview'}/>;
 return <AnimatedMascotFrames key={key} frames={frames} size={size} playDurationMs={playDurationMs} startDelayMs={startDelayMs} label={key==='disgust'?'Calm MoodPal':key+' MoodPal'}/>;
}
