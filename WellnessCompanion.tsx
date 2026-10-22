import MoodCheckinWizard from './MoodCheckinWizard';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,Alert,ActivityIndicator} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import StressDiary from './StressDiary';
import {ChatAction,ACTION_META,actionsFor,useStressContext,StressContextBar,promptsFor,TypingBubble} from './ChatExtras';
import Ionicons from '@expo/vector-icons/Ionicons';

const feelings=['Good','Calm','Joyful','Angry','Frustrated','Stressed','Anxious','Sad','Tired','Overwhelmed'];
const activities=['Walking','Workout','Work','Meeting','Rest','Social time','Other'];
const stressFactors=['Work','Sleep','Relationships','Caffeine','Exercise','Hydration','Health','Other'];
type Entry={id:string;body:string;mood:string|null;intensity:number|null;energy_level:string|null;stress_factors:string[];occurred_at:string};
type Message={id:string;role:'user'|'assistant';content:string;created_at:string};
export default function WellnessCompanion({companion,color,initialView='checkin',onMoodSaved,onMoodPreview,onCheckinDone,onWizardNavigate,onOpenInsights,onFindVerse,onAction,onShareWithCircle}:{onShareWithCircle?:(mood:string)=>void;onAction?:(a:ChatAction)=>void;companion:string;color:string;initialView?:'checkin'|'chat'|'history';onMoodSaved?:(mood:string)=>void;onMoodPreview?:(mood:string)=>void;onCheckinDone?:()=>void;onWizardNavigate?:()=>void;onOpenInsights?:()=>void;onFindVerse?:(mood:string,answers:Record<string,string>)=>void}){
 const [mood,setMood]=useState(''),[energy,setEnergy]=useState<'energized'|'tired'|'neutral'>('neutral'),[factors,setFactors]=useState<string[]>([]),[intensity,setIntensity]=useState(5),[note,setNote]=useState(''),[activity,setActivity]=useState('Walking'),[minutes,setMinutes]=useState('20'),[events,setEvents]=useState<Entry[]>([]);
 const [view,setView]=useState<'checkin'|'chat'|'history'>(initialView);
 const [showDetails,setShowDetails]=useState(false),[showActivity,setShowActivity]=useState(false);
 const [chatText,setChatText]=useState(''),[messages,setMessages]=useState<Message[]>([]),[conversationId,setConversationId]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<string|null>(null),[failed,setFailed]=useState<{text:string;error:string}|null>(null);
 const ctx=useStressContext();
 const scroller=React.useRef<ScrollView>(null);
 async function userId(){const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');return user.id}
 async function load(){
  try{const id=await userId();const [e,c]=await Promise.all([
   supabase.from('wellness_journal').select('id,body,mood,intensity,energy_level,stress_factors,occurred_at').eq('user_id',id).order('occurred_at',{ascending:false}).limit(150),
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
 async function send(text?:string){
  const input=(text??chatText).trim();if(!input||busy)return;
  if(input.length>3000){Alert.alert('Message too long','Please shorten your message to 3,000 characters.');return;}
  setBusy(true);setPending(input);setFailed(null);if(text===undefined)setChatText('');
  try {
   const call=supabase.functions.invoke('superdot-chat',{body:{message:input,conversationId,clientContext:ctx.text}});
   const timeout=new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('MoodPal took too long to answer. Check your connection and retry.')),45000));
   const {data,error}=await Promise.race([call,timeout]);
   if(error){let msg='Could not reach MoodPal. Please try again.';try{const detail=await (error as any).context?.json?.();if(detail?.error)msg=detail.error;}catch{}throw Error(msg);}
   if(data?.error)throw Error(data.error);
   if(!data?.reply||!data?.conversationId)throw Error('MoodPal did not return a complete response.');
   setConversationId(data.conversationId);
   const now=new Date().toISOString();
   setMessages(prev=>[...prev,{id:'user-'+Date.now(),role:'user',content:input,created_at:now},{id:'ai-'+Date.now(),role:'assistant',content:data.reply,created_at:now}]);
  } catch(e:any){setFailed({text:input,error:e?.message||'Something went wrong.'})}
  finally{setBusy(false);setPending(null)}
 }
 async function saveToDiary(content:string){
  try{const id=await userId();const {error}=await supabase.from('wellness_journal').insert({user_id:id,body:('From Ask MoodPal: '+content).slice(0,10000),entry_type:'ai_summary'});if(error)throw error;await load();Alert.alert('Saved to your diary')}
  catch(e:any){Alert.alert('Could not save',e?.message||'Try again.')}
 }
 return <View style={s.container}>
 {view!=='checkin'?<><View style={s.header}><SuperdotMascot id={companion} color={color} size={66}/><View style={{flex:1}}><Text style={s.title}>{view==='chat'?'Ask MoodPal':'Stress diary'}</Text><Text style={s.sub}>{view==='chat'?'Answers based on your own readings and diary.':'See what drives your stress over time.'}</Text></View></View>
 <View style={s.tabs}>{(['chat','history'] as const).map(t=><TouchableOpacity key={t} onPress={()=>setView(t)} style={[s.tab,view===t&&{backgroundColor:color}]}><Text style={[s.tabText,view===t&&{color:'#fff'}]}>{t==='chat'?'Ask MoodPal':'Stress diary'}</Text></TouchableOpacity>)}</View></>:null}
 {view==='checkin'?<MoodCheckinWizard color={color} onShareWithCircle={onShareWithCircle} onSaved={nextMood=>onMoodSaved?.(nextMood)} onDone={()=>onCheckinDone?.()} onJournal={()=>setView('history')} onInsights={()=>onOpenInsights?.()} onFindVerse={(selectedMood,answers)=>onFindVerse?.(selectedMood,answers)} onNavigate={onWizardNavigate} onExploreAI={selectedMood=>{setChatText("I'd like to explore feeling "+selectedMood+". Please ask me one supportive, open-ended question.");setView('chat');}}/>:null}
 {view==='chat'?<View style={s.card}>
  <StressContextBar chips={ctx.chips}/>
  <ScrollView ref={scroller} style={{maxHeight:420}} contentContainerStyle={{gap:10}} onContentSizeChange={()=>scroller.current?.scrollToEnd({animated:true})}>
   {messages.length===0&&!pending?<Text style={s.sub}>Ask anything about your stress, sleep or mood. MoodPal sees today's readings above plus your recent diary.</Text>:null}
   {messages.map(m=><View key={m.id} style={{gap:6,alignSelf:m.role==='user'?'flex-end':'flex-start',maxWidth:'92%'}}>
    <View style={[s.message,{maxWidth:'100%',backgroundColor:m.role==='user'?'#DDF3E6':'#F2F4F4'}]}><Text style={s.messageText}>{m.content}</Text></View>
    {m.role==='assistant'?<View style={s.choices}>
     {actionsFor(m.content).map(a=><TouchableOpacity key={a} onPress={()=>onAction?.(a)} style={s.action}><Ionicons name={ACTION_META[a].icon} size={13} color="#2E8F64"/><Text style={s.actionText}>{ACTION_META[a].label}</Text></TouchableOpacity>)}
     <TouchableOpacity onPress={()=>void saveToDiary(m.content)} style={s.action}><Ionicons name="bookmark-outline" size={13} color="#2E8F64"/><Text style={s.actionText}>Save to diary</Text></TouchableOpacity>
    </View>:null}
   </View>)}
   {pending?<><View style={[s.message,{alignSelf:'flex-end',backgroundColor:'#DDF3E6'}]}><Text style={s.messageText}>{pending}</Text></View><TypingBubble/></>:null}
   {failed?<View style={{alignSelf:'flex-end',alignItems:'flex-end',gap:6,maxWidth:'92%'}}>
    <View style={[s.message,{maxWidth:'100%',backgroundColor:'#FDE8EC'}]}><Text style={s.messageText}>{failed.text}</Text></View>
    <Text style={[s.sub,{color:'#C2546B'}]}>Not sent: {failed.error}</Text>
    <TouchableOpacity accessibilityRole="button" onPress={()=>void send(failed.text)} style={[s.action,{backgroundColor:'#FDE8EC'}]}><Ionicons name="refresh" size={13} color="#C2546B"/><Text style={[s.actionText,{color:'#C2546B'}]}>Retry</Text></TouchableOpacity>
   </View>:null}
  </ScrollView>
  {!busy?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{promptsFor(ctx.level).map(p=><TouchableOpacity key={p} onPress={()=>void send(p)} style={s.prompt}><Text style={s.promptText}>{p}</Text></TouchableOpacity>)}</ScrollView>:null}
  <TextInput style={s.input} multiline placeholder="Ask MoodPal about your stress, sleep or mood..." placeholderTextColor="#9AA7AD" value={chatText} onChangeText={setChatText}/>
  <TouchableOpacity disabled={busy||!chatText.trim()} onPress={()=>void send()} style={[s.button,{backgroundColor:color,opacity:busy||!chatText.trim()?0.6:1}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Send</Text>}</TouchableOpacity>
  <Text style={s.disclaimer}>Powered by Gemini. MoodPal uses your readings, diary, mood and activity history to help you reflect. It is not a therapist or a medical diagnosis.</Text>
 </View>:null}
 {view==='history'?<StressDiary entries={events} onChanged={load} onAsk={text=>{setView('chat');void send(text)}}/>:null}
 <Text style={s.disclaimer}>MoodPals is for emotional reflection, not diagnosis or emergency care.</Text></View>
}
const s=StyleSheet.create({container:{gap:13},header:{flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:21,fontWeight:'900',color:'#25145C'},sub:{fontSize:12,color:'#8276A5',lineHeight:18},tabs:{flexDirection:'row',padding:4,borderRadius:16,backgroundColor:'#E4F1EA'},tab:{flex:1,padding:11,borderRadius:13,alignItems:'center'},tabText:{fontSize:12,fontWeight:'800',color:'#665487'},card:{backgroundColor:'#fff',borderRadius:23,padding:17,gap:13},heading:{fontSize:15,fontWeight:'800',color:'#25145C'},choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{backgroundColor:'#F3EFFB',borderRadius:16,paddingHorizontal:12,paddingVertical:10},choiceText:{fontSize:12,fontWeight:'700',color:'#4C3B67'},intensity:{flexDirection:'row',gap:5},point:{flex:1,height:22,borderRadius:6},input:{backgroundColor:'#F8F6FC',borderWidth:1,borderColor:'#E5E0F0',borderRadius:14,padding:13,color:'#25145C',minHeight:65,textAlignVertical:'top'},shortInput:{backgroundColor:'#F8F6FC',borderRadius:12,padding:12,color:'#25145C'},button:{borderRadius:15,padding:15,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:13},message:{maxWidth:'92%',padding:12,borderRadius:15},messageText:{color:'#352748',fontSize:12,lineHeight:19},disclaimer:{fontSize:11,color:'#9387A4',lineHeight:17},entry:{borderTopWidth:1,borderTopColor:'#EDE9F2',paddingVertical:12,gap:5},entryTitle:{fontSize:13,fontWeight:'800',color:'#25145C'},action:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#E4F6EA',borderRadius:12,paddingHorizontal:9,paddingVertical:6},actionText:{fontSize:11,fontWeight:'800',color:'#2E8F64'},prompt:{borderWidth:1,borderColor:'#BFE5CF',borderRadius:16,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#fff'},promptText:{fontSize:12,fontWeight:'700',color:'#1D2B33'}});
