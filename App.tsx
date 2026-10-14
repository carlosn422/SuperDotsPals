import React,{useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Session} from '@supabase/supabase-js';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {supabase} from './supabase';
import AuthScreen from './AuthScreen';
import MainApp from './MainApp';
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}).catch(()=>setReady(true));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 return <SafeAreaProvider>{!ready?<View style={{flex:1,justifyContent:'center',backgroundColor:'#F8F6FF'}}><ActivityIndicator color="#6536D9"/></View>:session?<MainApp/>:<AuthScreen/>}</SafeAreaProvider>;
}
