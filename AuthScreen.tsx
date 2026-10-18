import React,{useState,useEffect,useRef} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet,KeyboardAvoidingView,ScrollView,Platform,ActivityIndicator,AppState} from 'react-native';
import {supabase} from './supabase';
import MoodPalMascot from './MoodPalMascot';
export default function AuthScreen(){
 const [mode,setMode]=useState<'welcome'|'signin'|'signup'|'reset'>('welcome'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [waitingForConfirmation,setWaitingForConfirmation]=useState(false);
 const currentCredentials=useRef<{email:string;password:string}|null>(null);
 const checking=useRef(false);
 async function completeConfirmation(showError=true){
  if(checking.current)return;
  const credentials=currentCredentials.current;
  if(!credentials){setMode('signin');return;}
  checking.current=true;
  try{
   const {error}=await supabase.auth.signInWithPassword(credentials);
   if(error && showError)setMessage('Confirmation may still be pending. If confirmed, try signing in below.');
   if(!error){currentCredentials.current=null;setWaitingForConfirmation(false);}
  }catch{if(showError)setMessage('Unable to check your account. Please sign in below.');}
  finally{checking.current=false;}
 }
 useEffect(()=>{
  const listener=AppState.addEventListener('change',status=>{
   if(status==='active' && currentCredentials.current)void completeConfirmation(false);
  });
  return()=>listener.remove();
 },[]);
 async function submit(){
  setMessage('');setLoading(true);
  try {
   const mail=email.trim().toLowerCase();
   if(!mail.includes('@'))throw Error('Please enter a valid email address.');
   if(mode==='reset'){
    const {error}=await supabase.auth.resetPasswordForEmail(mail,{redirectTo:'superdotspals://reset-password'});if(error)throw error;
    setMessage('If an account exists, check your email for a reset link.');return;
   }
   if(password.length<8)throw Error('Use a password with at least 8 characters.');
   if(mode==='signup'){
    const {data,error}=await supabase.auth.signUp({email:mail,password,options:{data:{display_name:name.trim().slice(0,100)}}});if(error)throw error;
    if(data.session){setMessage('Your account is ready!');}else{currentCredentials.current={email:mail,password};setWaitingForConfirmation(true);setMode('signin');setMessage('Check your inbox to confirm your email. When you return to the app, we’ll automatically check your account.');}
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:mail,password});if(error)throw error;
   }
  }catch(e:any){setMessage(e.message || 'Something went wrong. Please try again.');}finally{setLoading(false);}
 }
 if(mode==='welcome')return <View style={s.welcomePage}>
  <View style={s.welcomeBrand}>
   <Text style={s.welcomeLogo}>Mood<Text style={s.logoMint}>Pals</Text></Text>
   <Text style={s.welcomeTagline}>A kinder you,{'\n'}brighter days. 🌈</Text>
  </View>
  <View style={s.welcomeArt}>
   <View style={s.welcomeGlowLeft}/>
   <View style={s.welcomeGlowRight}/>
   <View style={s.welcomeBuddyBack}><MoodPalMascot id="buddy" size={220} animate={false}/></View>
   <View style={s.welcomeBuddyFront}><MoodPalMascot id="calm" size={208} animate={false}/></View>
  </View>
  <View style={s.welcomeActions}>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setMode('signup')} style={s.welcomePrimary}><Text style={s.welcomePrimaryText}>Get Started</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setMode('signin')} style={s.welcomeSecondary}><Text style={s.welcomeSecondaryText}>Already have an account?</Text></TouchableOpacity>
  </View>
 </View>;
 return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}>
  <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
   <View style={s.brand}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to welcome" onPress={()=>{setMode('welcome');setMessage('')}} style={s.authBack}><Text style={s.authBackText}>‹  Back</Text></TouchableOpacity>
    <Text style={s.logo}>Mood<Text style={s.logoMint}>Pals</Text></Text>
    <Text style={s.tagline}>A little check-in. A brighter day.</Text>
   </View>
   <View style={s.hero}>
    <View style={s.heroGlow}/>
    <View style={s.mascot}><MoodPalMascot id="joyful" size={154}/></View>
    <Text style={s.heroCaption}>Your friendly companion, every day.</Text>
   </View>
   <View style={s.panel}>
    <Text style={s.head}>{mode==='signin'?'Welcome back!':mode==='signup'?'Your mood journey starts here':'Reset your password'}</Text>
    <Text style={s.desc}>{mode==='signin'?'Your MoodPal is happy to see you again.':mode==='signup'?'Every feeling matters. Create an account to get started.':'Enter your email and we’ll send you a secure reset link.'}</Text>
    {mode==='signup'?<TextInput style={s.input} placeholder="Your name" placeholderTextColor="#9690AF" value={name} onChangeText={setName} autoCapitalize="words" accessibilityLabel="Your name"/>:null}
    <TextInput style={s.input} placeholder="Email address" placeholderTextColor="#9690AF" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email address"/>
    {mode!=='reset'?<TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor="#9690AF" secureTextEntry autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChangeText={setPassword} accessibilityLabel="Password"/>:null}
    {message?<Text style={s.message}>{message}</Text>:null}
    <TouchableOpacity accessibilityRole="button" onPress={submit} disabled={loading} style={[s.primary,loading&&{opacity:.65}]}>{loading?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>{mode==='signin'?'Sign in  →':mode==='signup'?'Create account  →':'Send reset email  →'}</Text>}</TouchableOpacity>
    {mode==='signin' && waitingForConfirmation?<TouchableOpacity onPress={()=>void completeConfirmation()} style={s.confirmButton}><Text style={s.confirmText}>I've confirmed my email — continue</Text></TouchableOpacity>:null}
    {mode==='signin'?<TouchableOpacity onPress={()=>{setMode('reset');setMessage('')}} style={s.secondaryAction}><Text style={s.link}>Forgot password?</Text></TouchableOpacity>:null}
    <TouchableOpacity onPress={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('')}} style={s.secondaryAction}><Text style={s.link}>{mode==='signup'?'Already have an account? Sign in':mode==='reset'?'Back to sign in':'New here? Create an account'}</Text></TouchableOpacity>
   </View>
   <Text style={s.foot}>Your reflections are private. Apple Health access is optional and requires your permission.</Text>
  </ScrollView>
 </KeyboardAvoidingView>
}
const s=StyleSheet.create({
 welcomePage:{flex:1,backgroundColor:'#FFFFFF',paddingHorizontal:26,paddingTop:65,paddingBottom:36},
 welcomeBrand:{alignItems:'center',gap:22,marginTop:14},
 welcomeLogo:{fontSize:39,fontWeight:'900',letterSpacing:-2,color:'#32217D'},
 welcomeTagline:{fontSize:21,fontWeight:'700',lineHeight:28,color:'#7260A6',textAlign:'center'},
 welcomeArt:{flex:1,minHeight:260,alignItems:'center',justifyContent:'center',overflow:'hidden'},
 welcomeGlowLeft:{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'#F4E8FF',left:-105,top:'23%'},
 welcomeGlowRight:{position:'absolute',width:260,height:260,borderRadius:130,backgroundColor:'#DDFBF4',right:-125,bottom:'15%'},
 welcomeBuddyBack:{position:'absolute',left:'9%',top:'21%'},
 welcomeBuddyFront:{position:'absolute',right:'7%',top:'37%'},
 welcomeActions:{gap:14,paddingBottom:10},
 welcomePrimary:{backgroundColor:'#8466ED',borderRadius:28,paddingVertical:18,alignItems:'center',shadowColor:'#8466ED',shadowOpacity:.17,shadowRadius:10,shadowOffset:{width:0,height:4}},
 welcomePrimaryText:{color:'#FFFFFF',fontSize:17,fontWeight:'800'},
 welcomeSecondary:{backgroundColor:'#FFFFFF',borderColor:'#CFC5EA',borderWidth:1.4,borderRadius:28,paddingVertical:17,alignItems:'center'},
 welcomeSecondaryText:{color:'#55468B',fontSize:15,fontWeight:'700'},
 authBack:{alignSelf:'flex-start',paddingVertical:7,paddingHorizontal:4},
 authBackText:{color:'#7861E8',fontWeight:'800',fontSize:13},
 page:{flex:1,backgroundColor:'#FAF8FF'},
 content:{flexGrow:1,paddingHorizontal:22,paddingTop:50,paddingBottom:34,justifyContent:'center',gap:19},
 brand:{alignItems:'center',gap:5},
 logo:{fontSize:34,fontWeight:'900',letterSpacing:-1.5,color:'#39217A'},
 logoMint:{color:'#19B7AA'},
 tagline:{fontSize:12,fontWeight:'600',color:'#77719C'},
 hero:{height:205,alignItems:'center',justifyContent:'center',backgroundColor:'#F0EBFF',borderRadius:32,overflow:'hidden',marginTop:4},
 heroGlow:{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'#E0F9F2',right:-60,bottom:-120},
 mascot:{alignItems:'center',justifyContent:'center'},
 heroCaption:{fontSize:12,fontWeight:'700',color:'#64538F',marginTop:-3},
 panel:{backgroundColor:'#FFFFFF',borderRadius:28,padding:22,borderWidth:1,borderColor:'#EDE7FA',gap:12,shadowColor:'#6E58B8',shadowOpacity:.06,shadowRadius:16,shadowOffset:{width:0,height:7},elevation:2},
 head:{fontSize:27,fontWeight:'900',color:'#2C1B66',textAlign:'center',letterSpacing:-.5},
 desc:{color:'#777198',textAlign:'center',fontSize:13,lineHeight:19,marginBottom:8},
 input:{backgroundColor:'#FBFAFF',borderWidth:1,borderColor:'#DED6F5',borderRadius:15,paddingHorizontal:15,paddingVertical:15,color:'#291D56',fontSize:15},
 primary:{backgroundColor:'#7861E8',paddingVertical:17,borderRadius:17,alignItems:'center',marginTop:6},
 primaryText:{color:'#FFFFFF',fontWeight:'800',fontSize:16},
 secondaryAction:{paddingVertical:5,alignItems:'center'},
 link:{color:'#6D57D3',textAlign:'center',fontWeight:'800',fontSize:13},
 message:{color:'#6A52B8',fontSize:12,lineHeight:18,textAlign:'center'},
 confirmButton:{backgroundColor:'#EEE8FF',padding:14,borderRadius:15,alignItems:'center'},
 confirmText:{color:'#6047C2',fontSize:13,fontWeight:'800'},
 foot:{color:'#8D87A8',fontSize:11,textAlign:'center',lineHeight:17,paddingHorizontal:12}
});
