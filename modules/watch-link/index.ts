import {requireOptionalNativeModule} from 'expo-modules-core';

export type WatchPairing={id:string;secret:string};
type WatchLinkModule={
 getPendingPairing():WatchPairing|null;
 addListener(event:'onPairingRequest',listener:(pairing:WatchPairing)=>void):{remove():void};
};

const native=requireOptionalNativeModule<WatchLinkModule>('WatchLink');

export const getPendingWatchPairing=():WatchPairing|null=>native?.getPendingPairing()??null;
export function onWatchPairingRequest(listener:(pairing:WatchPairing)=>void){
 return native?native.addListener('onPairingRequest',listener):{remove(){}};
}
