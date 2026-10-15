import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,Switch,ScrollView,Linking} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
type Passage={id:number;reference:string;verse_text:string;translation:string;source_url:string};
const moods=['Joyful','Calm','Sad','Angry','Anxious','Tired'];
const purple='#6C56D3',ink='#251C45',muted='#817899';
export default function SpiritualReading(){
 const [step,setStep]=useState<'start'|'mood'|'questions'|'result'|'favorites'>('start');
 const [mood,setMood]=useState(''),[useHistory,setUseHistory]=useState(false);
 const [questions,setQuestions]=useState<string[]>([]),[index,setIndex]=useState(0),[answers,setAnswers]=useState<Record<string,string>>({});
 const [passage,setPassage]=useState<Passage|null>(null),[reflection,setReflection]=useState(''),[busy,setBusy]=useState(false);
 const [favorites,setFavorites]=useState<{passage_id:number;scripture_passages:Passage}[]>([]);
 const [isFavorite,setIsFavorite]=useState(false);
 const btn=(label:string,fn:()=>void,filled=true)=><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={fn} style={{backgroundColor:filled?purple:'#F1EDFA',padding:14,borderRadius:14,alignItems:'center',opacity:busy?0.6:1}}><Text style={{color:filled?'white':'#57478F',fontWeight:'800'}}>{label}</Text></TouchableOpacity>;
 async function invoke(action:'questions'|'recommend',extra:Record<string,unknown>={}){
  const {data,error}=await supabase.functions.invoke('spiritual-reading',{body:{action,mood,useHistory,...extra}});
  if(error||data?.error)throw Error(data?.error||'Could not load reading.');
  return data;
 }
 async function generateQuestions(){setBusy(true);try{const data=await invoke('questions');setQuestions(data.questions||[]);setAnswers({});setIndex(0);setStep('questions')}catch(e:any){Alert.alert('Unable to prepare questions',e.message)}finally{setBusy(false)}}
 async function recommend(skip=false){setBusy(true);try{const data=await invoke('recommend',{questions,answers:skip?{}:answers});setPassage(data.passage);setReflection(data.reflection);setIsFavorite(false);setStep('result')}catch(e:any){Alert.alert('Unable to find Scripture',e.message)}finally{setBusy(false)}}
 async function saveFavorite(){if(!passage)return;setBusy(true);try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in.');
 if(isFavorite){const {error}=await supabase.from('scripture_favorites').delete().eq('user_id',user.id).eq('passage_id',passage.id);if(error)throw error;setIsFavorite(false)}
 else{const {error}=await supabase.from('scripture_favorites').upsert({user_id:user.id,passage_id:passage.id},{onConflict:'user_id,passage_id'});if(error)throw error;setIsFavorite(true)}
 }catch(e:any){Alert.alert('Unable to save favorite',e.message)}finally{setBusy(false)}}
 async function showFavorites(){setBusy(true);try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Sign in first');
 const {data,error}=await supabase.from('scripture_favorites').select('passage_id,scripture_passages(id,reference,verse_text,translation,source_url)').eq('user_id',user.id).order('created_at',{ascending:false});if(error)throw error;
 const list=(data||[]).map((x:any)=>({...x,scripture_passages:Array.isArray(x.scripture_passages)?x.scripture_passages[0]:x.scripture_passages})).filter((x:any)=>x.scripture_passages);
 setFavorites(list);setStep('favorites')}catch(e:any){Alert.alert('Unable to load favorites',e.message)}finally{setBusy(false)}}
 const radio=(label:string,selected:boolean,onPress:()=>void)=><TouchableOpacity key={label} onPress={onPress} style={{padding:13,borderRadius:14,borderWidth:1,borderColor:selected?purple:'#EAE5F3',backgroundColor:selected?'#EEE9FF':'white',flexDirection:'row',alignItems:'center',gap:10}}><Ionicons name={selected?'radio-button-on':'radio-button-off'} size={20} color={selected?purple:'#A49CB4'}/><Text style={{color:ink,flex:1}}>{label}</Text></TouchableOpacity>;
 return <View style={{gap:15,paddingBottom:25}}>
 <View style={{flexDirection:'row',alignItems:'center',gap:10,justifyContent:'space-between'}}><Text style={{fontSize:25,fontWeight:'900',color:ink}}>Spiritual Reading</Text><TouchableOpacity onPress={()=>void showFavorites()} accessibilityLabel="Favorite verses"><Ionicons name="bookmark-outline" color={purple} size={25}/></TouchableOpacity></View>
 {step==='start'?<View style={{backgroundColor:'#EFEBFF',borderRadius:24,padding:18,gap:15}}>
  <View style={{alignItems:'center'}}><SuperdotMascot id="Calm" size={110}/></View>
  <Text style={{fontSize:22,fontWeight:'900',color:ink}}>Let's find encouragement for how you feel.</Text>
  <Text style={{color:muted,lineHeight:20}}>Answer a few gentle questions, then discover a verified Bible passage and a personal reflection.</Text>
  <View style={{backgroundColor:'#FFFFFF',padding:12,borderRadius:15,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{fontWeight:'800',color:ink}}>Use my recent wellness records</Text><Text style={{fontSize:11,color:muted}}>Optional: mood, habits, and connected Apple Health data. Only shared with Gemini for this reading when enabled.</Text></View><Switch value={useHistory} onValueChange={setUseHistory} trackColor={{true:purple}}/></View>
  {btn('Start spiritual reading →',()=>setStep('mood'))}
  <Text style={{fontSize:11,color:muted}}>Uses World English Bible (public domain). AI-generated reflections are not Scripture or medical advice.</Text>
 </View>:null}
 {step==='mood'?<View style={{backgroundColor:'white',padding:16,borderRadius:22,gap:14}}>
  <Text style={{color:ink,fontSize:20,fontWeight:'900'}}>How are you feeling?</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{moods.map(m=><TouchableOpacity key={m} onPress={()=>setMood(m)} style={{width:'48%',backgroundColor:mood===m?'#F0EAFF':'#FAF9FC',borderColor:mood===m?purple:'#EBE7F1',borderWidth:1,borderRadius:15,alignItems:'center',padding:10,gap:4}}><SuperdotMascot id={m} size={64}/><Text style={{fontWeight:'800',color:ink}}>{m}</Text></TouchableOpacity>)}</View>
  {mood?btn('Continue →',()=>void generateQuestions()):null}
  {btn('Back',()=>setStep('start'),false)}
 </View>:null}
 {step==='questions'?<View style={{backgroundColor:'white',padding:17,borderRadius:22,gap:13}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><SuperdotMascot id={mood} size={58}/><View style={{flex:1}}><Text style={{color:ink,fontWeight:'800'}}>{mood}</Text><Text style={{color:muted,fontSize:11}}>Question {index+1} of {questions.length}</Text></View></View>
  <Text style={{fontSize:19,fontWeight:'900',color:ink}}>{questions[index]}</Text>
  {['Yes','A little','No','Not sure','Prefer not to say'].map(x=>radio(x,answers[questions[index]]===x,()=>setAnswers(a=>({...a,[questions[index]]:x}))))}
  <View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}>{btn('Back',()=>index?setIndex(i=>i-1):setStep('mood'),false)}</View><View style={{flex:2}}>{btn(index===questions.length-1?'Find my verse →':'Next →',()=>index===questions.length-1?void recommend():setIndex(i=>i+1))}</View></View>
  <TouchableOpacity onPress={()=>void recommend(true)} style={{alignItems:'center',padding:8}}><Text style={{color:purple}}>Skip questions & find a verse</Text></TouchableOpacity>
 </View>:null}
 {step==='result'&&passage?<View style={{backgroundColor:'#F2EEFF',borderRadius:22,padding:16,gap:13}}>
  <View style={{alignItems:'center',gap:5}}><SuperdotMascot id={mood} size={105}/><Text style={{color:purple,fontSize:12,fontWeight:'900'}}>A PASSAGE FOR YOU</Text></View>
  <Text style={{fontSize:22,fontWeight:'900',color:ink}}>{passage.reference}</Text>
  <Text style={{fontSize:15,lineHeight:24,color:ink}}>{passage.verse_text}</Text>
  <Text style={{fontSize:11,color:muted}}>World English Bible · {passage.translation}</Text>
  <View style={{backgroundColor:'white',padding:13,borderRadius:15,gap:6}}><Text style={{fontWeight:'900',color:ink}}>A reflection for today</Text><Text style={{color:muted,lineHeight:21}}>{reflection}</Text></View>
  {btn(isFavorite?'Remove from favorites':'♡ Save favorite verse',()=>void saveFavorite())}
  {btn('Read from source',()=>void Linking.openURL(passage.source_url),false)}
  {btn('Another reading',()=>void recommend(),false)}
  {btn('Start again',()=>{setMood('');setStep('start')},false)}
 </View>:null}
 {step==='favorites'?<View style={{backgroundColor:'white',padding:16,borderRadius:22,gap:12}}>
  <Text style={{color:ink,fontSize:19,fontWeight:'900'}}>Favorite verses</Text>
  {favorites.length?favorites.map(f=><View key={f.passage_id} style={{padding:12,borderRadius:14,backgroundColor:'#F3EFFB',gap:5}}><Text style={{color:ink,fontWeight:'900'}}>{f.scripture_passages.reference}</Text><Text style={{color:muted,lineHeight:19}}>{f.scripture_passages.verse_text}</Text><TouchableOpacity onPress={()=>void Linking.openURL(f.scripture_passages.source_url)}><Text style={{color:purple,fontWeight:'800'}}>Read passage →</Text></TouchableOpacity></View>):<Text style={{color:muted}}>Your saved verses will appear here.</Text>}
  {btn('Back to spiritual reading',()=>setStep(passage?'result':'start'))}
 </View>:null}
 {busy?<ActivityIndicator color={purple}/>:null}
 </View>;
}
