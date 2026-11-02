import {requireOptionalNativeModule} from 'expo-modules-core';

export type WatchPairing={id:string;secret:string};
export type WatchStatus={paired:boolean;installed:boolean;reachable:boolean};
type WatchLinkModule={
 getPendingPairing():WatchPairing|null;
 getWatchStatus():WatchStatus;
 requestPairing():boolean;
 sendMood(mood:string,at:number,user:string):boolean;
 addListener(event:'onPairingRequest',listener:(pairing:WatchPairing)=>void):{remove():void};
};

const native=requireOptionalNativeModule<WatchLinkModule>('WatchLink');

export const getPendingWatchPairing=():WatchPairing|null=>native?.getPendingPairing()??null;
export function onWatchPairingRequest(listener:(pairing:WatchPairing)=>void){
 return native?native.addListener('onPairingRequest',listener):{remove(){}};
}
export const getWatchStatus=():WatchStatus=>native?.getWatchStatus()??{paired:false,installed:false,reachable:false};
export const requestWatchPairing=():boolean=>native?.requestPairing()??false;
// Latest saved mood (wellness_journal row) for the watch complication; the watch ignores older ones.
export function sendMoodToWatch(mood:string,occurredAt:string,userId:string):boolean{
 const at=Math.floor(new Date(occurredAt).getTime()/1000);
 if(!native||!mood||!userId||!Number.isFinite(at)||at<=0)return false;
 return native.sendMood(mood,at,userId);
}
