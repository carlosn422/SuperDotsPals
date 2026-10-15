import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ActivityIndicator,Alert} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';

const moods=['Joyful','Calm','Sad','Angry','Anxious','Tired'] as const;
const fallback:Record<string,string[]>={
 Joyful:['What helped you feel good today?','Did someone or something brighten your day?','Would you like to remember this moment?'],
 Calm:['Did you get a chance to rest today?','Has something helped you feel grounded?','Would you like to make more time for this?'],
 Sad:['Was something disappointing or difficult today?','Have you felt disconnected from others?','Would support from someone help?'],
 Angry:['Did something feel frustrating or unfair?','Were your boundaries or expectations challenged?','Would some space or a pause help?'],
 Anxious:['Is there something upcoming you are worried about?','Have responsibilities felt overwhelming?','Could rest or reassurance help?'],
 Tired:['Did you sleep less than you wanted?','Has your day been physically or mentally demanding?','Have you had enough time to recover?']
};
const choices=['Yes','A little','No','Not sure','Prefer not to say'];
export default function MoodCheckinWizard({color,onSaved,onExploreAI,onDone}:{color:string;onSaved:(mood:string)=>void;onExploreAI:(mood:string)=>void;onDone:()=>void}){
 const [step,setStep]=useState<0|1|2|3>(0),[mood,setMood]=useState<string>(''),[questions,setQuestions]=useState<string[]>([]),[answers,setAnswers]=useState<Record<string,string>>({}),[note,setNote]=useState(''),[questionIndex,setQuestionIndex]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!mood)return;let active=true;setQuestions(fallback[mood]||[]);setAnswers({});setQuestionIndex(0);
 (async()=>{const {data,error}=await supabase.from('mood_questions').select('question').eq('mood',mood).eq('is_active',true).order('sort_order',{ascending:true}).limit(3);
 if(active&&!error&&data?.length)setQuestions(data.map(q=>q.question));})();
 return()=>{active=false}},[mood]);
 async function save(withDetails:boolean){
  if(!mood||busy)return;
  setBusy(true);
  try{const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('Please sign in.');
   const {error}=await supabase.from('wellness_journal').insert({user_id:user.id,entry_type:'reflection',body:note.trim()||'Mood check-in',mood,reflection_answers:withDetails?answers:{},stress_factors:[]});
   if(error)throw error;
   setStep(3);onSaved(mood);
  }catch(e:any){Alert.alert('Could not save your mood',e.message||'Please try again.')}finally{setBusy(false)}
 }
 const button=(title:string,onPress:()=>void,filled=true,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled||busy} onPress={onPress} style={{backgroundColor:filled?color:'#F3EFFB',padding:15,borderRadius:16,alignItems:'center',opacity:disabled?0.5:1}}><Text style={{fontWeight:'800',color:filled?'white':'#514079'}}>{title}</Text></TouchableOpacity>;
 return <View style={{backgroundColor:'white',borderRadius:24,padding:18,gap:15}}>
  <Text style={{fontWeight:'900',fontSize:22,color:'#251C45'}}>{step===0?'How are you feeling?':step===1?'Would you like to share more?':step===2?'Let’s explore that feeling':'Mood saved!'}</Text>
  {step<3?<Text style={{fontSize:12,color:'#82799C'}}>Step {step+1} of 3 · All details are optional</Text>:null}
  {mood?<View style={{alignItems:'center',gap:4}}><SuperdotMascot id={mood} size={94}/><Text style={{color:'#5C4B83',fontWeight:'700'}}>{mood}</Text></View>:null}
  {step===0?<><Text style={{color:'#7B728C'}}>Select the feeling that fits best right now.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>{moods.map(m=><TouchableOpacity key={m} onPress={()=>setMood(m)} style={{width:'30%',minWidth:80,paddingVertical:12,alignItems:'center',backgroundColor:mood===m?'#E9E3FF':'#F7F5FA',borderRadius:16,borderWidth:mood===m?2:1,borderColor:mood===m?color:'#F0EDF4'}}><SuperdotMascot id={m} size={57}/><Text style={{fontSize:12,fontWeight:'800',color:'#342957'}}>{m}</Text></TouchableOpacity>)}</View>
   {button('Continue →',()=>setStep(1),true,!mood)}</>:null}
  {step===1?<><Text style={{color:'#726989',lineHeight:20}}>You can save your mood now, or answer a few short questions to understand what might have contributed.</Text>
   {button('Yes, ask me a few questions',()=>setStep(2))}
   {button('Just save my mood',()=>void save(false),false)}
   {button('Back',()=>setStep(0),false)}</>:null}
  {step===2?<><Text style={{color:'#8B82A0'}}>Question {questionIndex+1} of {questions.length||3}</Text>
   <Text style={{fontSize:17,fontWeight:'800',color:'#2C2350'}}>{questions[questionIndex]}</Text>
   {choices.map(choice=><TouchableOpacity key={choice} onPress={()=>setAnswers(prev=>({...prev,[questions[questionIndex]]:choice}))} style={{padding:13,borderRadius:13,borderWidth:1,borderColor:answers[questions[questionIndex]]===choice?color:'#EEEAF3',backgroundColor:answers[questions[questionIndex]]===choice?'#ECE7FF':'white'}}><Text style={{color:'#382C5F'}}>{choice}</Text></TouchableOpacity>)}
   {questionIndex===(questions.length||3)-1?<><TextInput placeholder="Add a note (optional)" multiline maxLength={1000} value={note} onChangeText={setNote} style={{minHeight:68,borderWidth:1,borderColor:'#EEEAF3',borderRadius:13,padding:12,textAlignVertical:'top'}}/>{button('Save check-in',()=>void save(true))}</>:button('Next question →',()=>setQuestionIndex(i=>i+1))}
   {button('Skip questions & save',()=>void save(true),false)}
   {button('Back',()=>questionIndex?setQuestionIndex(i=>i-1):setStep(1),false)}
  </>:null}
  {step===3?<><Text style={{color:'#766B8C'}}>Your check-in is saved privately in Superdots.</Text>{button('Back to Today',onDone)}{button('Explore this feeling with AI (optional)',()=>onExploreAI(mood),false)}<Text style={{fontSize:11,color:'#8F87A0'}}>AI is only used if you choose to explore further.</Text></>:null}
  {busy?<ActivityIndicator color={color}/>:null}
 </View>;
}
