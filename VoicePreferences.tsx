import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,ScrollView} from 'react-native';
import * as Speech from 'expo-speech';
import {supabase} from './supabase';

export type VoicePrefs={voice_gender:'female'|'male';voice_style:'gentle'|'natural';voice_speed:number;voice_identifier:string|null};
export const defaultVoice:VoicePrefs={voice_gender:'female',voice_style:'gentle',voice_speed:0.9,voice_identifier:null};
type AppleVoice=Speech.Voice;
const english=(voice:AppleVoice)=>voice.language.toLowerCase().startsWith('en');
export function pickAppleVoice(voices:AppleVoice[],pref:VoicePrefs){
 const available=voices.filter(english);
 const selected=available.find(v=>v.identifier===pref.voice_identifier);
 if(selected)return selected;
 // Apple does not provide a reliable gender property; known voice names are hints only.
 const names=pref.voice_gender==='female'?['samantha','ava','allison','susan','karen','moira','serena','victoria']:['alex','daniel','aaron','fred','tom','oliver'];
 return available.find(v=>names.some(n=>v.name.toLowerCase().includes(n)))||available[0];
}
export async function speakWithPreferences(message:string){
 const {data:{user}}=await supabase.auth.getUser();
 let pref=defaultVoice;
 if(user){const {data}=await supabase.from('user_settings').select('voice_gender,voice_style,voice_speed,voice_identifier').eq('user_id',user.id).maybeSingle();if(data)pref={...defaultVoice,...data,voice_speed:Number(data.voice_speed||0.9)};}
 const voice=pickAppleVoice(await Speech.getAvailableVoicesAsync(),pref);
 Speech.stop();
 Speech.speak(message,{language:'en-US',voice:voice?.identifier,rate:pref.voice_speed,pitch:pref.voice_style==='gentle'?0.97:1});
}
export default function VoicePreferences(){
 const [prefs,setPrefs]=useState<VoicePrefs>(defaultVoice);
 const [voices,setVoices]=useState<AppleVoice[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{let mounted=true;(async()=>{
  try{const [list,auth]=await Promise.all([Speech.getAvailableVoicesAsync(),supabase.auth.getUser()]);
   if(!mounted)return;setVoices(list.filter(english));
   if(auth.data.user){const {data,error}=await supabase.from('user_settings').select('voice_gender,voice_style,voice_speed,voice_identifier').eq('user_id',auth.data.user.id).maybeSingle();if(error)throw error;if(data)setPrefs({...defaultVoice,...data,voice_speed:Number(data.voice_speed||0.9)});}
  }catch(e:any){Alert.alert('Voice settings',e.message||'Unable to load available voices.')}finally{if(mounted)setLoading(false)}
 })();return()=>{mounted=false;Speech.stop()}},[]);
 async function save(changes:Partial<VoicePrefs>){
  const next={...prefs,...changes};setPrefs(next);setSaving(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Sign in to save your voice.');
  const {error}=await supabase.from('user_settings').update(next).eq('user_id',user.id);if(error)throw error;
  }catch(e:any){setPrefs(prefs);Alert.alert('Unable to save voice preferences',e.message||'Please retry.')}finally{setSaving(false)}
 }
 async function preview(){try{const v=pickAppleVoice(voices,prefs);Speech.stop();Speech.speak("I'm here with you. How have you been feeling today?",{language:'en-US',voice:v?.identifier,rate:prefs.voice_speed,pitch:prefs.voice_style==='gentle'?0.97:1});}catch(e:any){Alert.alert('Preview unavailable',e.message||'Try again on your iPhone.')}}
 const btn=(label:string,chosen:boolean,onPress:()=>void)=><TouchableOpacity accessibilityRole="button" accessibilityState={{selected:chosen}} onPress={onPress} style={{padding:12,borderRadius:12,backgroundColor:chosen?'#7139E9':'#F0EBFA',marginRight:8,marginTop:8}}><Text style={{color:chosen?'#fff':'#403063',fontWeight:'700'}}>{label}</Text></TouchableOpacity>;
 return <View style={{backgroundColor:'#fff',padding:18,borderRadius:22,gap:12}}>
 <Text style={{fontSize:19,fontWeight:'900',color:'#25145C'}}>Your Superdot's voice</Text>
 <Text style={{color:'#81769B'}}>Choose an Apple voice, listen to a preview, and save it to your account.</Text>
 {loading?<ActivityIndicator/>:<>
 <Text style={{fontWeight:'800',color:'#25145C'}}>Voice type</Text>
 <View style={{flexDirection:'row'}}>{btn('Female',prefs.voice_gender==='female',()=>void save({voice_gender:'female',voice_identifier:null}))}{btn('Male',prefs.voice_gender==='male',()=>void save({voice_gender:'male',voice_identifier:null}))}</View>
 <Text style={{fontWeight:'800',color:'#25145C'}}>Speaking style</Text>
 <View style={{flexDirection:'row'}}>{btn('Gentle',prefs.voice_style==='gentle',()=>void save({voice_style:'gentle'}))}{btn('Natural',prefs.voice_style==='natural',()=>void save({voice_style:'natural'}))}</View>
 <Text style={{fontWeight:'800',color:'#25145C'}}>Speed: {prefs.voice_speed.toFixed(2)}×</Text>
 <View style={{flexDirection:'row'}}>{[0.8,0.9,1,1.1].map(rate=><React.Fragment key={rate}>{btn(rate.toFixed(2)+'×',prefs.voice_speed===rate,()=>void save({voice_speed:rate}))}</React.Fragment>)}</View>
 <Text style={{fontWeight:'800',color:'#25145C'}}>Available English voices</Text>
 <Text style={{color:'#81769B',fontSize:12}}>Voice names and availability depend on voices installed on this device. Choose one to override the automatic selection.</Text>
 <ScrollView style={{maxHeight:210}} nestedScrollEnabled>{voices.map(v=><TouchableOpacity key={v.identifier} onPress={()=>void save({voice_identifier:v.identifier})} style={{padding:11,borderBottomColor:'#EEE9F9',borderBottomWidth:1}}><Text style={{color:prefs.voice_identifier===v.identifier?'#7139E9':'#25145C',fontWeight:prefs.voice_identifier===v.identifier?'900':'500'}}>{v.name} · {v.language}{prefs.voice_identifier===v.identifier?' ✓':''}</Text></TouchableOpacity>)}</ScrollView>
 {btn('▶ Preview voice',false,()=>void preview())}
 <Text style={{color:'#81769B',fontSize:11}}>{saving?'Saving…':'Voice preferences are saved to Supabase. Apple voice selection is device dependent.'}</Text>
 </>}
 </View>
}
