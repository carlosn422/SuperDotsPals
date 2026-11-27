import {requireOptionalNativeModule,requireNativeView} from 'expo';
import type {ComponentType} from 'react';
import type {ViewProps} from 'react-native';

// The owner's own app tracking. iOS reports each 15 minutes of use per chosen app; the marks stay on this iPhone.
export type SocialMark={app:number;minutes:number;at:number;family?:boolean;member?:string};
/** Minutes in all tracked apps together on a day ("y-m-d") for one person: "you" or a family member's id. */
export type DailyUse={day:string;who:string;minutes:number};
export type SocialState={authorized:boolean;enabled:boolean;limitMinutes:number;limitHitToday:boolean;ownerToday?:number;apps:number[];groupCount:number};

type Native={
 getState():SocialState;
 configure(enabled:boolean,limitMinutes:number):void;
 marks(since:number):{app:number;minutes:number;at:number;family?:boolean;member?:string}[];
 daily?():DailyUse[];
 pickApps():Promise<number|null>;
};

const native=requireOptionalNativeModule<Native>('SocialTrack');
export const socialTrackSupported=!!native;
export const getSocialState=():SocialState|null=>native?native.getState():null;
export const configureSocialTrack=(enabled:boolean,limitMinutes:number)=>native?.configure(enabled,limitMinutes);
export const pickTrackedApps=async()=>native?native.pickApps():null;
/** Marks since `sinceMs`, with `at` in milliseconds. */
export const socialMarks=(sinceMs:number):SocialMark[]=>native?native.marks(sinceMs/1000).map(m=>({...m,at:m.at*1000,member:m.member||undefined})):[];
export const socialDaily=():DailyUse[]=>native?.daily?.()??[];

/** Apple's own name and icon for a tracked app (index from the marks); -1 is "Other apps & sites". */
export const SocialAppLabel:ComponentType<ViewProps&{app:number;iconOnly?:boolean}>|null=native?requireNativeView('SocialTrack'):null;
