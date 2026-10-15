import MoodCheckinWizard from './MoodCheckinWizard';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,Alert,ActivityIndicator} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';

const feelings=['Good','Calm','Joyful','Angry','Frustrated','Stressed','Anxious','Sad','Tired','Overwhelmed'];
const activities=['Walking','Workout','Work','Meeting','Rest','Social time','Other'];
const stressFactors=['Work','Sleep','Relationships','Caffeine','Exercise','Hydration','Health','Other'];
type Entry={id:string;body:string;mood:string|null;intensity:number|null;energy_level:string|null;stress_factors:string[];occurred_at:string};
type Message={id:string;role:'user'|'assistant';content:string;created_at:string};
export default function WellnessCompanion({companion,color,initialView='checkin',onMoodSaved,onMoodPreview,onCheckinDone}:{companion:string;color:string;initialView?:'checkin'|'chat'|'history';onMoodSaved?:(mood:string)=>void;onMoodPreview?:(mood:string)=>void;onCheckinDone?:()=>void}){
 const [mood,setMood]=useState(''),[energy,setEnergy]=useState<'energized'|'tired'|'neutral'>('neutral'),[factors,setFactors]=useState<string[]>([]),[intensity,setIntensity]=useState(5),[note,setNote]=useState(''),[activity,setActivity]=useState('Walking'),[minutes,setMinutes]=useState('20'),[events,setEvents]=useState<Entry[]>([]);
 const [view,setView]=useState<'checkin'|'chat'|'history'>(initialView);
 const [showDetails,setShowDetails]=useState(false),[showActivity,setShowActivity]=useState(false);
 const [chatText,setChatText]=useState(''),[messages,setMessages]=useState<Message[]>([]),[conversationId,setConversationId]=useState<string|null>(null),[busy,setBusy]=useState(false);
 async function userId(){const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');return user.id}
 async function load(){
  try{const id=await userId();const [e,c]=await Promise.all([
   supabase.from('wellness_journal').select('id,body,mood,intensity,energy_level,stress_factors,occurred_at').eq('user_id',id).order('occurred_at',{ascending:false}).limit(30),
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
   const {error}=await supabase.from('wellness_journal').insert({user_id:id,body,entry_type:'reflection',mood,intensity,energy_level:energy,stress_factors:factors});if(error)throw error;
   onMoodSaved?.(mood);setMood('');setEnergy('neutral');setFactors([]);setNote('');await load();Alert.alert('Saved privately','Your reflection has been recorded.');
  }catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}finally{setBusy(false)}
 }
 async function saveActivity(){
  setBusy(true);try{const id=await userId(),n=Number(minutes);if(!Number.isInteger(n)||n<0||n>1440)throw Error('Enter valid minutes from 0 to 1440');
  const {error}=await supabase.from('wellness_activities').insert({user_id:id,activity_type:activity,duration_minutes:n});if(error)throw error;
  Alert.alert('Activity recorded','This can help you review patterns alongside future moods.');
  }catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}finally{setBusy(false)}
 }
 async function send(){
  const input=chatText.trim();if(!input||busy)return;
  if(input.length>3000){Alert.alert('Message too long','Please shorten your message to 3,000 characters.');return;}
  setBusy(true);
  try {
   const {data,error}=await supabase.functions.invoke('superdot-chat',{body:{message:input,conversationId}});
   if(error){let msg='Could not reach your Superdot. Please try again.';try{const detail=await error.context?.json?.();if(detail?.error)msg=detail.error;}catch{}throw Error(msg);}
   if(data?.error)throw Error(data.error);
   if(!data?.reply||!data?.conversationId)throw Error('Your Superdot did not return a complete response.');
   setConversationId(data.conversationId);
   setChatText('');
   const now=new Date().toISOString();
   setMessages(prev=>[...prev,{id:'user-'+Date.now(),role:'user',content:input,created_at:now},{id:'ai-'+Date.now(),role:'assistant',content:data.reply,created_at:now}]);
   void (async()=>{try{const id=await userId();const {data:history,error:historyError}=await supabase.from('wellness_messages').select('id,role,content,created_at').eq('user_id',id).eq('conversation_id',data.conversationId).order('created_at',{ascending:true}).limit(80);if(!historyError&&history?.length)setMessages(history as Message[]);}catch(e){console.warn('History refresh failed',e)}})();
  } catch(e:any){Alert.alert('Unable to send',e?.message||'Please retry. Your message has not been cleared.')}
  finally{setBusy(false)}
 }
 return <View style={s.container}>
 {view!=='checkin'?<><View style={s.header}><SuperdotMascot id={companion} color={color} size={66}/><View style={{flex:1}}><Text style={s.title}>{view==='chat'?'Talk to your Superdot':'Your journal'}</Text><Text style={s.sub}>A safe space to reflect and remember.</Text></View></View>
 <View style={s.tabs}>{(['chat','history'] as const).map(t=><TouchableOpacity key={t} onPress={()=>setView(t)} style={[s.tab,view===t&&{backgroundColor:color}]}><Text style={[s.tabText,view===t&&{color:'#fff'}]}>{t==='chat'?'Talk':'Journal'}</Text></TouchableOpacity>)}</View></>:null}
 {view==='checkin'?<MoodCheckinWizard color={color} onSaved={nextMood=>onMoodSaved?.(nextMood)} onDone={()=>onCheckinDone?.()} onExploreAI={selectedMood=>{setChatText("I'd like to explore feeling "+selectedMood+". Please ask me one supportive, open-ended question.");setView('chat');}}/>:null}
 {view==='chat'?<View style={s.card}><Text style={s.heading}>Your private conversation</Text><Text style={s.disclaimer}>Powered by Gemini. The AI can use your private journal, mood and activity history to help you reflect. It is not a therapist or medical diagnosis.</Text><ScrollView style={{maxHeight:360}} contentContainerStyle={{gap:10}}>{messages.map(m=><View key={m.id} style={[s.message,{alignSelf:m.role==='user'?'flex-end':'flex-start',backgroundColor:m.role==='user'?'#EDE4FF':'#F2F4F4'}]}><Text style={s.messageText}>{m.content}</Text></View>)}</ScrollView><TextInput style={s.input} multiline placeholder="Tell your Superdot what's on your mind..." placeholderTextColor="#9D91A9" value={chatText} onChangeText={setChatText}/>
<TouchableOpacity disabled={busy||!chatText.trim()} onPress={()=>void send()} style={[s.button,{backgroundColor:color,opacity:busy||!chatText.trim()?0.6:1}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Send message</Text>}</TouchableOpacity>
</View>:null}
 {view==='history'?<View style={s.card}><Text style={s.heading}>Your journal entries</Text><Text style={s.disclaimer}>Your own notes are saved privately. Use Trends → Export wellness report to share your records when you choose.</Text>{events.length===0?<Text style={s.sub}>No reflections saved yet.</Text>:events.map(e=><View key={e.id} style={s.entry}><Text style={s.entryTitle}>{e.mood||'Reflection'} {e.intensity?('· '+e.intensity+'/10'):''}</Text><Text style={s.sub}>{new Date(e.occurred_at).toLocaleString()}</Text><Text style={s.messageText}>{e.body}</Text>{e.energy_level?<Text style={s.sub}>Energy: {e.energy_level}</Text>:null}{e.stress_factors?.length?<Text style={s.sub}>Possible contributors: {e.stress_factors.join(', ')}</Text>:null}</View>)}</View>:null}
 <Text style={s.disclaimer}>Superdots is for emotional reflection, not diagnosis or emergency care.</Text></View>
}
const s=StyleSheet.create({container:{gap:13},header:{flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:21,fontWeight:'900',color:'#25145C'},sub:{fontSize:12,color:'#8276A5',lineHeight:18},tabs:{flexDirection:'row',padding:4,borderRadius:16,backgroundColor:'#EAE4F4'},tab:{flex:1,padding:11,borderRadius:13,alignItems:'center'},tabText:{fontSize:12,fontWeight:'800',color:'#665487'},card:{backgroundColor:'#fff',borderRadius:23,padding:17,gap:13},heading:{fontSize:15,fontWeight:'800',color:'#25145C'},choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{backgroundColor:'#F3EFFB',borderRadius:16,paddingHorizontal:12,paddingVertical:10},choiceText:{fontSize:12,fontWeight:'700',color:'#4C3B67'},intensity:{flexDirection:'row',gap:5},point:{flex:1,height:22,borderRadius:6},input:{backgroundColor:'#F8F6FC',borderWidth:1,borderColor:'#E5E0F0',borderRadius:14,padding:13,color:'#25145C',minHeight:65,textAlignVertical:'top'},shortInput:{backgroundColor:'#F8F6FC',borderRadius:12,padding:12,color:'#25145C'},button:{borderRadius:15,padding:15,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:13},message:{maxWidth:'92%',padding:12,borderRadius:15},messageText:{color:'#352748',fontSize:12,lineHeight:19},disclaimer:{fontSize:11,color:'#9387A4',lineHeight:17},entry:{borderTopWidth:1,borderTopColor:'#EDE9F2',paddingVertical:12,gap:5},entryTitle:{fontSize:13,fontWeight:'800',color:'#25145C'}});
