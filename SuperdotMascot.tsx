import React from 'react';
import MoodMascot from './MoodMascot';
// Legacy visual interface: all existing mascot placements now respond to the mood
// instead of exposing a user-selectable character or per-character color.
export default function SuperdotMascot({id,size=102}:{id:string;color?:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}){
 return <MoodMascot mood={id} size={size}/>;
}
