import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {Platform} from 'react-native';
import {supabase} from './supabase';

// Links this phone's Expo push token to the signed-in account (circle_push_tokens), and unlinks it on sign-out.
const TOKEN_KEY='circle.pushToken';
const EAS_PROJECT_ID=(Constants.expoConfig?.extra as any)?.eas?.projectId||'7fce274d-e6b2-4944-a9b0-ef08fa13f871';

// prompt=false only registers when notifications are already allowed (safe at launch and sign-in).
export async function registerPushToken(prompt:boolean){
 try{
  let perm=await Notifications.getPermissionsAsync();
  if(!perm.granted&&prompt&&perm.canAskAgain)perm=await Notifications.requestPermissionsAsync();
  if(!perm.granted)return;
  const {data}=await supabase.auth.getSession();if(!data.session)return;
  const token=(await Notifications.getExpoPushTokenAsync({projectId:EAS_PROJECT_ID})).data;if(!token)return;
  const {error}=await supabase.rpc('circle_register_push_token',{p_token:token});
  if(!error)await AsyncStorage.setItem(TOKEN_KEY,token);
 }catch(e){if(Platform.OS==='ios')console.log('Push token unavailable (simulators cannot receive remote push):',String(e))}
}

// Signs out after removing this phone's token, so the next account on this phone doesn't share pushes with the last one.
export async function signOutAndUnregister(options?:Parameters<typeof supabase.auth.signOut>[0]){
 try{
  const token=await AsyncStorage.getItem(TOKEN_KEY);
  if(token){await supabase.from('circle_push_tokens').delete().eq('token',token);await AsyncStorage.removeItem(TOKEN_KEY);}
 }catch{}
 return supabase.auth.signOut(options);
}
