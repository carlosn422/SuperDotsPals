// Display-only HRV-derived wellness estimates. Never insert these into wellness_journal,
// change the user's selected mood, or share them with Circle members.
// HRV is not a direct measurement of a person's emotional state.
import {stressPointsWithSaved,StressLevel} from './StressEngine';
import type {Reading} from './HealthDataPanel';
import type {TimelineMood} from './FamilyTimeline';

const LEVEL_MOOD:Record<StressLevel,string>={
 great:'Calm',normal:'Joyful',elevated:'Anxious',overload:'Angry'
};

export function hrvMoodEvents(readings:Reading[]):TimelineMood[]{
 const points=stressPointsWithSaved(readings);
 const events:TimelineMood[]=[];
 let previous:StressLevel|null=null;
 const seen=new Set<string>();
 for(const point of points){
  const ms=Date.parse(point.at);
  if(!Number.isFinite(ms)||ms>Date.now()||seen.has(point.at))continue;
  seen.add(point.at);
  if(point.level===previous)continue;
  previous=point.level;
  events.push({mood:LEVEL_MOOD[point.level],occurred_at:point.at,source:'hrv',stress_level:point.level,stress_score:point.score});
 }
 return events;
}

export function combinedMoodEvents(manual:TimelineMood[],readings:Reading[]):TimelineMood[]{
 return [...manual.map(m=>({...m,source:'manual' as const})),...hrvMoodEvents(readings)]
  .sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at));
}
