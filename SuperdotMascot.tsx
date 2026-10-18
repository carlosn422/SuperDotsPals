import React from 'react';
import MoodPalMascot from './MoodPalMascot';

// Compatibility wrapper for existing screens. MoodPals uses one silhouette and
// varies its palette/expression instead of switching between unrelated characters.
export default function SuperdotMascot(props:{id:string;color?:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}) {
 return <MoodPalMascot id={props.id} size={props.size??102}/>;
}
