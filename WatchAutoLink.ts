import {useEffect,useRef} from 'react';
import {Alert,AppState} from 'react-native';
import {supabase} from './supabase';
import {WatchPairing,getPendingWatchPairing,onWatchPairingRequest} from './modules/watch-link';

// The MoodPals watch app shares its one-time pairing code over WatchConnectivity,
// so a signed-in iPhone links it without scanning the QR code.
export function useWatchAutoLink(isGuest:boolean){
 const handled=useRef(new Set<string>());
 useEffect(()=>{
  if(isGuest)return;
  const approve=async(pairing:WatchPairing|null)=>{
   if(!pairing||handled.current.has(pairing.id))return;
   handled.current.add(pairing.id);
   const {data,error}=await supabase.functions.invoke('watch-pairing',{body:{action:'approve',...pairing}});
   if(!error&&data?.status==='approved')Alert.alert('Apple Watch linked',`${data.deviceName||'Your Apple Watch'} is now connected to MoodPals.`);
  };
  void approve(getPendingWatchPairing());
  const request=onWatchPairingRequest(pairing=>void approve(pairing));
  const app=AppState.addEventListener('change',state=>{if(state==='active')void approve(getPendingWatchPairing())});
  return()=>{request.remove();app.remove()};
 },[isGuest]);
}
