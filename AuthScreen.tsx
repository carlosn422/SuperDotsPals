import React,{useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet,KeyboardAvoidingView,ScrollView,Platform,ActivityIndicator,Alert} from 'react-native';
import {supabase} from './supabase';
export default function AuthScreen(){
 const [mode,setMode]=useState<'signin'|'signup'|'reset'>('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
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
    if(data.session){setMessage('Your account is ready!');}else{setMode('signin');setMessage('Email sent! Confirm your email, then return here and sign in with the same password.');}
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:mail,password});if(error)throw error;
   }
  }catch(e:any){setMessage(e.message || 'Something went wrong. Please try again.');}finally{setLoading(false);}
 }
 return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
 <View style={s.mascot}><Text style={{fontSize:51}}>💜</Text></View><Text style={s.logo}>superdots.</Text><Text style={s.head}>{mode==='signin'?'Welcome back!':mode==='signup'?'Join the dot club!':'Reset your password'}</Text>
 <Text style={s.desc}>{mode==='signin'?'Your tiny wellbeing buddy missed you.':mode==='signup'?'Small steps toward feeling your best.':'We’ll email you a secure password reset link.'}</Text>
 {mode==='signup'?<TextInput style={s.input} placeholder="Your name" placeholderTextColor="#9D95B7" value={name} onChangeText={setName} autoCapitalize="words"/>:null}
 <TextInput style={s.input} placeholder="Email address" placeholderTextColor="#9D95B7" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail}/>
 {mode!=='reset'?<TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor="#9D95B7" secureTextEntry autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChangeText={setPassword}/>:null}
 {message?<Text style={s.message}>{message}</Text>:null}
 <TouchableOpacity onPress={submit} disabled={loading} style={s.primary}>{loading?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>{mode==='signin'?'Sign in':mode==='signup'?'Create account':'Send reset email'}</Text>}</TouchableOpacity>
 {mode==='signin'?<TouchableOpacity onPress={()=>{setMode('reset');setMessage('')}}><Text style={s.link}>Forgot password?</Text></TouchableOpacity>:null}
 <TouchableOpacity onPress={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('')}}><Text style={s.link}>{mode==='signup'?'Already have an account? Sign in':'New here? Create an account'}</Text></TouchableOpacity>
 <Text style={s.foot}>Your data belongs to you. Health readings are sample data until Apple Health is connected.</Text>
 </ScrollView></KeyboardAvoidingView>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F6FF'},content:{flexGrow:1,justifyContent:'center',padding:27,gap:15},mascot:{alignItems:'center'},logo:{fontSize:24,fontWeight:'900',color:'#6536D9',textAlign:'center'},head:{fontSize:29,fontWeight:'900',color:'#25145C',textAlign:'center',marginTop:14},desc:{color:'#8276A5',textAlign:'center',fontSize:13,marginBottom:18},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E7DDFB',borderRadius:17,padding:16,color:'#25145C',fontSize:15},primary:{backgroundColor:'#6536D9',padding:17,borderRadius:17,alignItems:'center',marginTop:5},primaryText:{color:'#fff',fontWeight:'800',fontSize:15},link:{color:'#6536D9',textAlign:'center',fontWeight:'700',fontSize:13,marginTop:4},message:{color:'#6536D9',fontSize:12,lineHeight:18},foot:{color:'#A49BB9',fontSize:11,textAlign:'center',marginTop:20,lineHeight:16}});
