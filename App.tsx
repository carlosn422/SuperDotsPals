import React,{useEffect,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Session} from '@supabase/supabase-js';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {supabase} from './supabase';
import AuthScreen from './AuthScreen';
import MainApp from './MainApp';
import Onboarding,{DOTS} from './Onboarding';
export default function App(){
 const [editingProfile,setEditingProfile]=useState(false);
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[onboarded,setOnboarded]=useState<boolean|null>(null),[theme,setTheme]=useState('grape'),[selectedCompanion,setSelectedCompanion]=useState('bloop');
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}).catch(()=>setReady(true));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{let active=true;if(!session?.user){setOnboarded(null);setEditingProfile(false);return;}setOnboarded(null);(async()=>{const [{data:p,error:e1},{data:t,error:e2}]=await Promise.all([supabase.from('profiles').select('onboarding_completed_at').eq('id',session.user.id).maybeSingle(),supabase.from('user_settings').select('theme,companion').eq('user_id',session.user.id).maybeSingle()]);if(!active)return;if(e1||e2){console.warn('Onboarding lookup failed:',e1?.message||e2?.message);setOnboarded(false);return;}setOnboarded(!!p?.onboarding_completed_at);setTheme(t?.theme||'grape');setSelectedCompanion(t?.companion||'bloop')})();return()=>{active=false}},[session?.user.id]);
 async function complete(){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('user_settings').select('theme,companion').eq('user_id',user.id).maybeSingle();setTheme(data?.theme||'grape');setSelectedCompanion(data?.companion||'bloop');setOnboarded(true);setEditingProfile(false)}
 return <SafeAreaProvider>{!ready?<View style={{flex:1,justifyContent:'center',backgroundColor:'#F8F6FF'}}><ActivityIndicator color="#6536D9"/></View>:session?(onboarded===null?<View style={{flex:1,justifyContent:'center',backgroundColor:'#F8F6FF'}}><ActivityIndicator color="#6536D9"/></View>:(editingProfile||!onboarded)?<Onboarding editing={editingProfile} onCancel={()=>setEditingProfile(false)} done={()=>void complete()}/>:<MainApp selectedTheme={theme} selectedCompanion={selectedCompanion} onEditProfile={()=>setEditingProfile(true)} onThemeChanged={(nextTheme,nextCompanion)=>{setTheme(nextTheme);setSelectedCompanion(nextCompanion)}}/>):<AuthScreen/>}</SafeAreaProvider>;
}
