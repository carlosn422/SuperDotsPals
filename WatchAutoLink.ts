import {useEffect,useRef} from 'react';
import {Alert,AppState} from 'react-native';
import {supabase} from './supabase';
import {WatchPairing,getPendingWatchPairing,onWatchPairingRequest} from './modules/watch-link';

// The MoodPals watch app shares its one-time pairing code over WatchConnectivity,
// so a signed-in iPhone links it without scanning the QR code. Guests are asked to
// create an account first; the same request is approved once they have one.
export function useWatchAutoLink(isGuest:boolean,onCreateAccount:()=>void){
 const approved=useRef(new Set<string>()),prompted=useRef(new Set<string>());
 const createAccount=useRef(onCreateAccount);
 createAccount.current=onCreateAccount;
 useEffect(()=>{
  const handle=async(pairing:WatchPairing|null)=>{
   if(!pairing)return;
   if(isGuest){
    if(prompted.current.size)return;
    prompted.current.add(pairing.id);
    Alert.alert('Link your Apple Watch','Create a free account to sync MoodPals with your watch. Your check-ins, settings and plan stay with you.',[{text:'Not now',style:'cancel'},{text:'Create account',onPress:()=>createAccount.current()}]);
    return;
   }
   if(approved.current.has(pairing.id))return;
   approved.current.add(pairing.id);
   const {data,error}=await supabase.functions.invoke('watch-pairing',{body:{action:'approve',...pairing}});
   if(error||data?.status!=='approved'){approved.current.delete(pairing.id);return;}
   Alert.alert('Apple Watch linked',`${data.deviceName||'Your Apple Watch'} is now connected to MoodPals.`);
  };
  void handle(getPendingWatchPairing());
  const request=onWatchPairingRequest(pairing=>void handle(pairing));
  const app=AppState.addEventListener('change',state=>{if(state==='active')void handle(getPendingWatchPairing())});
  return()=>{request.remove();app.remove()};
 },[isGuest]);
}
