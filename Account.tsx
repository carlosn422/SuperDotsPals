import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Image,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import type {User} from '@supabase/supabase-js';
import {appleAvailable,appleCredential,hasApple,linkApple} from './AppleAuth';
import {openManageSubscriptions} from './PlusPaywall';
import {usePlus} from './PlusStore';
import {APP_THEME as T} from './MoodMascot';

const CALM=require('./assets/mascot-animations/disgust/preview400/frame_000.png');

// Guests are Supabase anonymous users; creating an account links an email/password to the same user id, so their data and entitlements stay put.
export function useIsGuest(){
 const [guest,setGuest]=useState(false);
 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>setGuest(!!data.session?.user.is_anonymous)).catch(()=>{});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setGuest(!!s?.user.is_anonymous));
  return()=>subscription.unsubscribe();
 },[]);
 return guest;
}

const DELETED_ITEMS=['Your MoodPals profile','Your linked family profiles and their family watches','Your mood history','Your stored health and wellness data','Your Circle memberships and group assignments','Your emoji reactions and notifications','Your linked Apple Watch connections','Your account preferences and other personal information'];

export function DeleteAccountScreen({accent,onBack}:{accent:string;onBack:()=>void}){
 const {isPlus}=usePlus();
 const [user,setUser]=useState<User|null>(null),[password,setPassword]=useState(''),[typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void supabase.auth.getUser().then(({data})=>setUser(data.user))},[]);
 const guest=!!user?.is_anonymous,withPassword=!!user?.identities?.some(i=>i.provider==='email'),withApple=hasApple(user?.identities);
 const ready=typed==='DELETE'&&!busy&&!!user&&(guest||(withPassword&&password.length>0)||withApple);
 async function remove(){
  if(!ready||!user)return;
  setBusy(true);setError('');
  try{
   // Sign in again right before deleting; the server rejects sessions older than a few minutes.
   let appleAuthorizationCode:string|null=null;
   if(!guest){
    if(withPassword&&password){const {error}=await supabase.auth.signInWithPassword({email:user.email||'',password});if(error)throw Error('That password isn’t right.')}
    else{const c=await appleCredential();if(!c)return;const {error}=await supabase.auth.signInWithIdToken({provider:'apple',token:c.token,nonce:c.nonce});if(error)throw error;appleAuthorizationCode=c.code}
   }
   const {data,error}=await supabase.functions.invoke('delete-account',{body:{confirm:true,...(appleAuthorizationCode?{appleAuthorizationCode}:{})}});
   if(error||!data?.deleted){
    let msg=data?.error;
    if(!msg&&error&&'context' in error){try{msg=(await (error as any).context.json())?.error}catch{}}
    throw Error(msg||'Couldn’t delete your account. Please try again, or email hello@moodpals.com.');
   }
   await supabase.auth.signOut({scope:'local'});
   Alert.alert('Account deleted','Your MoodPals account and its data have been deleted.');
  }catch(e:any){setError(e.message||'Couldn’t delete your account.')}
  finally{setBusy(false)}
 }
 return <View style={{gap:14}}>
  <Back label="Settings" accent={accent} onPress={onBack}/>
  <Text style={[s.title,{textAlign:'left'}]}>Permanently delete your MoodPals account?</Text>
  <View style={s.card}>
   <Text style={[s.body,{textAlign:'left'}]}>Deleting your account will permanently remove:</Text>
   {DELETED_ITEMS.map(i=><Text key={i} style={[s.body,{textAlign:'left'}]}>• {i}</Text>)}
   <Text style={[s.body,{textAlign:'left',fontWeight:'800'}]}>This action cannot be undone.</Text>
  </View>
  <View style={s.card}>
   <Text style={[s.body,{textAlign:'left',fontWeight:'800'}]}>Deleting your MoodPals account does not automatically cancel your Apple subscription.</Text>
   <Text style={[s.body,{textAlign:'left'}]}>{isPlus?'You have MoodPals Plus. Cancel it through Apple if you don’t want to be charged again.':'If you ever subscribed to MoodPals Plus, manage it through Apple.'}</Text>
   <TouchableOpacity accessibilityRole="button" onPress={openManageSubscriptions}><Text style={{color:accent,fontWeight:'800'}}>Manage Subscription ›</Text></TouchableOpacity>
  </View>
  {!guest&&withPassword?<TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Your password" placeholderTextColor="#9690AF" editable={!busy} style={s.input} accessibilityLabel="Your password"/>:null}
  {!guest&&!withPassword&&withApple?<Text style={[s.body,{textAlign:'left'}]}>You’ll confirm with Apple when you tap Delete.</Text>:null}
  {!guest&&withPassword&&withApple?<Text style={[s.body,{textAlign:'left'}]}>Or leave the password empty to confirm with Apple instead.</Text>:null}
  <Text style={[s.body,{textAlign:'left',fontWeight:'700'}]}>Type DELETE to confirm.</Text>
  <TextInput value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor="#9690AF" editable={!busy} style={s.input} accessibilityLabel="Type DELETE to confirm"/>
  {error?<Text style={[s.body,{color:'#D65B79'}]}>{error}</Text>:null}
  <TouchableOpacity accessibilityRole="button" disabled={!ready} onPress={()=>void remove()} style={[s.cta,{backgroundColor:'#D65B79'},!ready&&{opacity:.45}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.ctaText}>Delete Account</Text>}</TouchableOpacity>
 </View>;
}

export function useAppleLink(){
 const [linked,setLinked]=useState(false),[available,setAvailable]=useState(false);
 const refresh=useCallback(async()=>{const {data}=await supabase.auth.getUser();setLinked(hasApple(data.user?.identities))},[]);
 useEffect(()=>{void refresh();void appleAvailable().then(setAvailable)},[refresh]);
 const link=useCallback(async()=>{
  try{if(await linkApple()==='linked'){await refresh();Alert.alert('Apple linked','You can now sign in with Apple or with your email and password. Your MoodPals data stays the same.')}}
  catch(e:any){Alert.alert('Couldn’t link Apple',e?.message||'Please try again.')}
 },[refresh]);
 return {linked,available,link};
}

function Back({label,accent,onPress}:{label:string;accent:string;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" style={s.back} onPress={onPress}><Ionicons name="chevron-back" size={18} color={accent}/><Text style={{color:accent,fontWeight:'800'}}>{label}</Text></TouchableOpacity>;
}

export function AccountRequired({accent,backLabel,onBack,onCreate}:{accent:string;backLabel:string;onBack:()=>void;onCreate:()=>void}){
 return <View style={{gap:14}}>
  <Back label={backLabel} accent={accent} onPress={onBack}/>
  <View style={[s.card,{alignItems:'center'}]}>
   <Image source={CALM} style={s.mascot}/>
   <Text style={s.title}>My Circle needs an account</Text>
   <Text style={s.body}>My Circle connects you with the people you trust, so they need a way to find you. Create a free account to invite friends and share Little Signals.</Text>
   <Text style={s.note}>Your check-ins, settings and plan stay with you.</Text>
  </View>
  <TouchableOpacity accessibilityRole="button" onPress={onCreate} style={[s.cta,{backgroundColor:accent}]}><Text style={s.ctaText}>Create account</Text></TouchableOpacity>
 </View>;
}

type Step='loading'|'details'|'confirm'|'password'|'done';

export function CreateAccountScreen({accent,onBack}:{accent:string;onBack:()=>void}){
 const [step,setStep]=useState<Step>('loading');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{void supabase.auth.getUser().then(({data:{user}})=>{
  if(!user){setStep('details');return;}
  if(!user.is_anonymous){setStep('password');return;}
  if(user.new_email){setEmail(user.new_email);setStep('confirm');return;}
  setStep('details');
 })},[]);

 const checkConfirmed=useCallback(async(showMessage:boolean)=>{
  await supabase.auth.refreshSession().catch(()=>{});
  const {data:{user}}=await supabase.auth.getUser();
  if(user&&!user.is_anonymous){setMessage('');setStep('password');return;}
  if(showMessage)setMessage('We haven’t seen your confirmation yet. Open the link in the email, then try again.');
 },[]);

 useEffect(()=>{
  if(step!=='confirm')return;
  const sub=AppState.addEventListener('change',st=>{if(st==='active')void checkConfirmed(false)});
  return()=>sub.remove();
 },[step,checkConfirmed]);

 async function run(task:()=>Promise<void>){
  setBusy(true);setMessage('');
  try{await task()}catch(e:any){setMessage(e?.message||'Something went wrong. Please try again.')}finally{setBusy(false)}
 }

 const sendEmail=()=>run(async()=>{
  const mail=email.trim().toLowerCase();
  if(!mail.includes('@'))throw Error('Please enter a valid email address.');
  const displayName=name.trim().slice(0,100);
  const {data,error}=await supabase.auth.updateUser({email:mail,...(displayName?{data:{display_name:displayName}}:{})});
  if(error){
   if(/already|registered|exists/i.test(error.message))throw Error('This email already has a MoodPals account. Use “Sign in instead” below.');
   throw error;
  }
  if(displayName&&data.user)await supabase.from('profiles').update({display_name:displayName}).eq('id',data.user.id);
  setEmail(mail);
  setStep(data.user&&!data.user.is_anonymous?'password':'confirm');
 });

 const savePassword=()=>run(async()=>{
  if(password.length<8)throw Error('Use a password with at least 8 characters.');
  const {error}=await supabase.auth.updateUser({password});if(error)throw error;
  setPassword('');setStep('done');
 });

 const signInInstead=()=>Alert.alert('Sign in to another account?','Check-ins you made as a guest stay with this guest profile and won’t move to that account.',[
  {text:'Cancel',style:'cancel'},
  {text:'Sign in',style:'destructive',onPress:()=>void supabase.auth.signOut()},
 ]);

 return <View style={{gap:14}}>
  <Back label="Settings" accent={accent} onPress={onBack}/>
  <View style={[s.card,{alignItems:'center'}]}>
   <Image source={CALM} style={s.mascot}/>
   <Text style={s.title}>{step==='done'?'You’re all set':step==='password'?'Choose a password':step==='confirm'?'Check your inbox':'Create your account'}</Text>
   <Text style={s.body}>{step==='done'?'Your MoodPals account is ready. Everything you saved as a guest is still here.'
    :step==='password'?'Your email is confirmed. Add a password so you can sign in on other devices.'
    :step==='confirm'?`We sent a confirmation link to ${email}. Open it, then come back to MoodPals.`
    :'Keep your check-ins safe, sync across devices and use My Circle. Everything you’ve saved as a guest comes with you.'}</Text>
  </View>
  {step==='loading'?<ActivityIndicator color={accent}/>:null}
  {step==='details'?<>
   <TextInput style={s.input} placeholder="Your name" placeholderTextColor="#94A39B" value={name} onChangeText={setName} autoCapitalize="words" accessibilityLabel="Your name"/>
   <TextInput style={s.input} placeholder="Email address" placeholderTextColor="#94A39B" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" accessibilityLabel="Email address"/>
  </>:null}
  {step==='password'?<TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor="#94A39B" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" accessibilityLabel="Password"/>:null}
  {message?<Text style={s.message}>{message}</Text>:null}
  {step==='details'||step==='password'||step==='confirm'||step==='done'?<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={step==='details'?sendEmail:step==='password'?savePassword:step==='confirm'?()=>void run(()=>checkConfirmed(true)):onBack} style={[s.cta,{backgroundColor:accent},busy&&{opacity:.65}]}>
   {busy?<ActivityIndicator color="#fff"/>:<Text style={s.ctaText}>{step==='details'?'Continue':step==='password'?'Save password':step==='confirm'?'I’ve confirmed my email':'Back to Settings'}</Text>}
  </TouchableOpacity>:null}
  {step==='confirm'?<View style={{gap:4}}>
   <TouchableOpacity disabled={busy} onPress={sendEmail}><Text style={[s.link,{color:accent}]}>Resend email</Text></TouchableOpacity>
   <TouchableOpacity disabled={busy} onPress={()=>{setMessage('');setStep('details')}}><Text style={[s.link,{color:accent}]}>Use a different email</Text></TouchableOpacity>
  </View>:null}
  {step==='details'?<TouchableOpacity onPress={signInInstead}><Text style={[s.link,{color:accent}]}>Already have an account? Sign in instead</Text></TouchableOpacity>:null}
 </View>;
}

const s=StyleSheet.create({
 back:{flexDirection:'row',alignItems:'center',gap:4,marginBottom:4},
 card:{backgroundColor:T.surface,borderRadius:20,padding:18,gap:8,borderWidth:1,borderColor:T.border},
 mascot:{width:96,height:96},
 title:{fontSize:22,fontWeight:'900',color:T.ink,textAlign:'center'},
 body:{fontSize:14,color:T.muted,textAlign:'center',lineHeight:20},
 note:{fontSize:12,color:T.primary,fontWeight:'800',textAlign:'center',marginTop:2},
 input:{backgroundColor:T.surface,borderWidth:1,borderColor:T.border,borderRadius:15,paddingHorizontal:15,paddingVertical:15,color:T.ink,fontSize:15},
 cta:{borderRadius:28,paddingVertical:16,alignItems:'center'},
 ctaText:{color:'#fff',fontSize:16,fontWeight:'900'},
 link:{fontWeight:'800',fontSize:13,textAlign:'center',padding:6},
 message:{fontSize:12,color:'#B4536E',textAlign:'center',lineHeight:18},
});
