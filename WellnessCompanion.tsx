import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,Alert,ActivityIndicator} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';
const NativeVoice=Constants.appOwnership==='expo'?null:require('./VoiceRecognitionNative').default;

const feelings=['Good','Calm','Stressed','Anxious','Sad','Tired','Overwhelmed'];
const activities=['Walking','Workout','Work','Meeting','Rest','Social time','Other'];
type Entry={id:string;body:string;mood:string|null;intensity:number|null;occurred_at:string};
type Message={id:string;role:'user'|'assistant';content:string;created_at:string};
export default function WellnessCompanion({companion,color}:{companion:string;color:string}){
 const [mood,setMood]=useState(''),[intensity,setIntensity]=useState(5),[note,setNote]=useState(''),[activity,setActivity]=useState('Walking'),[minutes,setMinutes]=useState('20'),[events,setEvents]=useState<Entry[]>([]);
 const [view,setView]=useState<'checkin'|'chat'|'history'>('checkin');
 const [chatText,setChatText]=useState(''),[messages,setMessages]=useState<Message[]>([]),[conversationId,setConversationId]=useState<string|null>(null),[busy,setBusy]=useState(false);
 async function userId(){const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');return user.id}
 async function load(){
  try{const id=await userId();const [e,c]=await Promise.all([
   supabase.from('wellness_journal').select('id,body,mood,intensity,occurred_at').eq('user_id',id).order('occurred_at',{ascending:false}).limit(30),
   supabase.from('wellness_conversations').select('id').eq('user_id',id).order('created_at',{ascending:false}).limit(1)
  ]);
  if(e.error)throw e.error;setEvents((e.data||[]) as Entry[]);
  const cid=c.data?.[0]?.id;if(cid){setConversationId(cid);const {data,error}=await supabase.from('wellness_messages').select('id,role,content,created_at').eq('conversation_id',cid).order('created_at',{ascending:true}).limit(80);if(error)throw error;setMessages((data||[]) as Message[])}
  }catch(err:any){Alert.alert('Unable to load your journal',err?.message||'Please retry')}
 }
 useEffect(()=>{void load()},[]);
 async function saveCheckin(){
  if(!mood){Alert.alert('Choose a feeling','Select how you feel before saving.');return}
  setBusy(true);
  try{const id=await userId();const body=note.trim()||'Mood check-in';
   const {error}=await supabase.from('wellness_journal').insert({user_id:id,body,entry_type:'reflection',mood,intensity});if(error)throw error;
   setMood('');setNote('');await load();Alert.alert('Saved privately','Your reflection has been recorded.');
  }catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}finally{setBusy(false)}
 }
 async function saveActivity(){
  setBusy(true);try{const id=await userId(),n=Number(minutes);if(!Number.isInteger(n)||n<0||n>1440)throw Error('Enter valid minutes from 0 to 1440');
  const {error}=await supabase.from('wellness_activities').insert({user_id:id,activity_type:activity,duration_minutes:n});if(error)throw error;
  Alert.alert('Activity recorded','This can help you review patterns alongside future moods.');
  }catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}finally{setBusy(false)}
 }
 async function send(spoken?:string,readAloud=false){
  const input=(spoken??chatText).trim();if(!input||busy)return;
  if(input.length>3000){Alert.alert('Message too long','Please shorten your message to 3,000 characters.');return;}
  setBusy(true);
  try {
   const {data,error}=await supabase.functions.invoke('superdot-chat',{body:{message:input,conversationId}});
   if(error){let msg='Could not reach your Superdot. Please try again.';try{const detail=await error.context?.json?.();if(detail?.error)msg=detail.error;}catch{}throw Error(msg);}
   if(data?.error)throw Error(data.error);
   if(!data?.reply||!data?.conversationId)throw Error('Your Superdot did not return a complete response.');
   setConversationId(data.conversationId);
   if(data.possibleStress)console.info('Possible stress marker saved.');
   setChatText('');
   if(readAloud){Speech.speak(data.reply,{language:'en-US',rate:0.95});}
   const id=await userId();
   const {data:history,error:historyError}=await supabase.from('wellness_messages').select('id,role,content,created_at').eq('user_id',id).eq('conversation_id',data.conversationId).order('created_at',{ascending:true}).limit(80);
   if(historyError)throw historyError;
   setMessages((history||[]) as Message[]);
  } catch(e:any){Alert.alert('Unable to send',e?.message||'Please retry. Your message has not been cleared.')}
  finally{setBusy(false)}
 }
 return <View style={s.container}><View style={s.header}><SuperdotMascot id={companion} color={color} size={66}/><View style={{flex:1}}><Text style={s.title}>Talk to your Superdot</Text><Text style={s.sub}>A safe space to reflect, understand and remember.</Text></View></View>
 <View style={s.tabs}>{(['checkin','chat','history'] as const).map(t=><TouchableOpacity key={t} onPress={()=>setView(t)} style={[s.tab,view===t&&{backgroundColor:color}]}><Text style={[s.tabText,view===t&&{color:'#fff'}]}>{t==='checkin'?'Check in':t==='chat'?'Talk':'Journal'}</Text></TouchableOpacity>)}</View>
 {view==='checkin'?<View style={s.card}><Text style={s.heading}>How are you feeling?</Text><View style={s.choices}>{feelings.map(f=><TouchableOpacity key={f} onPress={()=>setMood(f)} style={[s.choice,mood===f&&{backgroundColor:color}]}><Text style={[s.choiceText,mood===f&&{color:'#fff'}]}>{f}</Text></TouchableOpacity>)}</View><Text style={s.heading}>Intensity: {intensity}/10</Text><View style={s.intensity}>{Array.from({length:10},(_,i)=><TouchableOpacity key={i} onPress={()=>setIntensity(i+1)} style={[s.point,{backgroundColor:intensity===i+1?color:'#E8E2F0'}]}/>)}</View><TextInput style={s.input} placeholder="What happened? What might have contributed?" placeholderTextColor="#9D91A9" multiline value={note} onChangeText={setNote}/><TouchableOpacity disabled={busy} onPress={()=>void saveCheckin()} style={[s.button,{backgroundColor:color}]}><Text style={s.buttonText}>Save mood & reflection</Text></TouchableOpacity>
 <Text style={s.heading}>Log a helpful activity</Text><View style={s.choices}>{activities.map(x=><TouchableOpacity key={x} onPress={()=>setActivity(x)} style={[s.choice,activity===x&&{backgroundColor:color}]}><Text style={[s.choiceText,activity===x&&{color:'#fff'}]}>{x}</Text></TouchableOpacity>)}</View><TextInput style={s.shortInput} keyboardType="number-pad" placeholder="Minutes" value={minutes} onChangeText={setMinutes}/><TouchableOpacity disabled={busy} onPress={()=>void saveActivity()} style={[s.button,{backgroundColor:'#E9E1FA'}]}><Text style={[s.buttonText,{color:color}]}>Record activity</Text></TouchableOpacity></View>:null}
 {view==='chat'?<View style={s.card}><Text style={s.heading}>Your private conversation</Text><Text style={s.disclaimer}>Powered by Gemini. The AI can use your private journal, mood and activity history to help you reflect. It is not a therapist or medical diagnosis.</Text><ScrollView style={{maxHeight:360}} contentContainerStyle={{gap:10}}>{messages.map(m=><View key={m.id} style={[s.message,{alignSelf:m.role==='user'?'flex-end':'flex-start',backgroundColor:m.role==='user'?'#EDE4FF':'#F2F4F4'}]}><Text style={s.messageText}>{m.content}</Text></View>)}</ScrollView><Text style={s.disclaimer}>{NativeVoice?'Tap Talk to speak and hear a response.':'Expo Go supports text chat. Voice requires a development build.'}</Text>
<TextInput style={s.input} multiline placeholder="Tell your Superdot what's on your mind..." placeholderTextColor="#9D91A9" value={chatText} onChangeText={setChatText}/>
<View style={{flexDirection:'row',gap:10}}>
 {NativeVoice?<NativeVoice busy={busy} color={color} onResult={setChatText} onSubmit={(message:string)=>send(message,true)}/>:null}
 <TouchableOpacity disabled={busy} onPress={()=>void send()} style={[s.button,{backgroundColor:'#EDE6FF',flex:1}]}>{busy?<ActivityIndicator color={color}/>:<Text style={[s.buttonText,{color}]}>Send text</Text>}</TouchableOpacity>
</View></View>:null}
 {view==='history'?<View style={s.card}><Text style={s.heading}>Your journal entries</Text><Text style={s.disclaimer}>Your own notes are saved privately. A future doctor export will distinguish notes from AI summaries and health measurements.</Text>{events.length===0?<Text style={s.sub}>No reflections saved yet.</Text>:events.map(e=><View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.mood||'Reflection'} {e.intensity?('· '+e.intensity+'/10'):''}</Text><Text style={s.sub}>{new Date(e.occurred_at).toLocaleString()}</Text><Text style={s.messageText}>{e.body}</Text></View>)}</View>:null}
 <Text style={s.disclaimer}>Superdots is for emotional reflection, not diagnosis or emergency care.</Text></View>
}
const s=StyleSheet.create({container:{gap:13},header:{flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:21,fontWeight:'900',color:'#25145C'},sub:{fontSize:12,color:'#8276A5',lineHeight:18},tabs:{flexDirection:'row',padding:4,borderRadius:16,backgroundColor:'#EAE4F4'},tab:{flex:1,padding:11,borderRadius:13,alignItems:'center'},tabText:{fontSize:12,fontWeight:'800',color:'#665487'},card:{backgroundColor:'#fff',borderRadius:23,padding:17,gap:13},heading:{fontSize:15,fontWeight:'800',color:'#25145C'},choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{backgroundColor:'#F3EFFB',borderRadius:16,paddingHorizontal:12,paddingVertical:10},choiceText:{fontSize:12,fontWeight:'700',color:'#4C3B67'},intensity:{flexDirection:'row',gap:5},point:{flex:1,height:22,borderRadius:6},input:{backgroundColor:'#F8F6FC',borderWidth:1,borderColor:'#E5E0F0',borderRadius:14,padding:13,color:'#25145C',minHeight:65,textAlignVertical:'top'},shortInput:{backgroundColor:'#F8F6FC',borderRadius:12,padding:12,color:'#25145C'},button:{borderRadius:15,padding:15,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:13},message:{maxWidth:'92%',padding:12,borderRadius:15},messageText:{color:'#352748',fontSize:12,lineHeight:19},disclaimer:{fontSize:11,color:'#9387A4',lineHeight:17},entry:{borderTopWidth:1,borderTopColor:'#EDE9F2',paddingVertical:12,gap:5},entryTitle:{fontSize:13,fontWeight:'800',color:'#25145C'}});
