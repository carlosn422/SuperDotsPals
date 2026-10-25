import {Platform} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {supabase} from './supabase';

export type AppleCredential={token:string;nonce:string;code:string|null;name:string;email:string|null};

export async function appleAvailable(){return Platform.OS==='ios'&&await AppleAuthentication.isAvailableAsync().catch(()=>false)}

// Apple signs a SHA-256 of the nonce; Supabase gets the raw nonce and checks it against the identity token.
// Returns null when the user cancels.
export async function appleCredential():Promise<AppleCredential|null>{
 const nonce=Crypto.randomUUID()+Crypto.randomUUID();
 const hashed=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,nonce);
 try{
  const c=await AppleAuthentication.signInAsync({requestedScopes:[AppleAuthentication.AppleAuthenticationScope.FULL_NAME,AppleAuthentication.AppleAuthenticationScope.EMAIL],nonce:hashed});
  if(!c.identityToken)throw Error('Apple didn’t return a sign-in token. Please try again.');
  // Apple only sends the name on the very first authorization.
  const name=[c.fullName?.givenName,c.fullName?.familyName].filter(Boolean).join(' ').trim();
  return {token:c.identityToken,nonce,code:c.authorizationCode,name,email:c.email};
 }catch(e:any){
  if(e?.code==='ERR_REQUEST_CANCELED')return null;
  throw e;
 }
}

export async function signInWithApple():Promise<boolean>{
 const c=await appleCredential();if(!c)return false;
 const {data,error}=await supabase.auth.signInWithIdToken({provider:'apple',token:c.token,nonce:c.nonce});
 if(error)throw error;
 if(c.name&&!data.user?.user_metadata?.display_name)await supabase.auth.updateUser({data:{display_name:c.name.slice(0,100)}});
 return true;
}

// Adds Apple as a second way to sign in to the CURRENT user; the user id and all data stay the same.
export async function linkApple():Promise<'linked'|'canceled'>{
 const c=await appleCredential();if(!c)return 'canceled';
 const {error}=await supabase.auth.linkIdentity({provider:'apple',token:c.token,nonce:c.nonce});
 if(error){
  if(/already|exists|linked/i.test(error.message))throw Error('This Apple ID is already used by another MoodPals account. Sign in with Apple to use that account, or delete it first.');
  if(/manual linking/i.test(error.message))throw Error('Linking Apple isn’t turned on yet. Please try again later.');
  throw error;
 }
 return 'linked';
}

export const hasApple=(identities?:{provider:string}[]|null)=>!!identities?.some(i=>i.provider==='apple');
