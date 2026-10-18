import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ActivityIndicator,Alert,Switch} from 'react-native';
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
type MoodQuestion={question:string;choices:string[]};
const defaultChoices=['Something specific happened','An ongoing situation','My energy or rest','I am not sure yet'];
export default function MoodCheckinWizard({color,onSaved,onExploreAI,onDone,onJournal,onInsights,onFindVerse,onNavigate}:{color:string;onSaved:(mood:string)=>void;onExploreAI:(mood:string)=>void;onDone:()=>void;onJournal:()=>void;onInsights:()=>void;onFindVerse:(mood:string,answers:Record<string,string>)=>void;onNavigate?:()=>void}){
 const [useHistory,setUseHistory]=useState(false);
 const [loadingQuestions,setLoadingQuestions]=useState(false);
 const [savedAnswers,setSavedAnswers]=useState<Record<string,string>>({});
 const [step,setStep]=useState<0|1|2|3>(0),[mood,setMood]=useState<string>(''),[questions,setQuestions]=useState<MoodQuestion[]>([]),[answers,setAnswers]=useState<Record<string,string>>({}),[note,setNote]=useState(''),[questionIndex,setQuestionIndex]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!mood||step!==2)return;let active=true;setLoadingQuestions(true);setQuestions((fallback[mood]||[]).map(question=>({question,choices:defaultChoices})));setAnswers({});setQuestionIndex(0);
 (async()=>{try{
 const {data,error}=await supabase.functions.invoke('spiritual-reading',{body:{action:'questions',mood,useHistory}});
 if(error||!Array.isArray(data?.items)||!data.items.length)throw Error('Questions unavailable');
 const items=data.items.filter((item:any)=>typeof item?.question==='string'&&Array.isArray(item.choices)&&item.choices.length===4).slice(0,3);
 if(active&&items.length)setQuestions(items);
 }catch(e){console.warn('Using local reflection questions',e)}finally{if(active)setLoadingQuestions(false)}})();
 return()=>{active=false}},[mood,step]);

 async function save(withDetails:boolean){
  if(!mood||busy)return;
  setBusy(true);
  try{const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('Please sign in.');
   const {error}=await supabase.from('wellness_journal').insert({user_id:user.id,entry_type:'reflection',body:note.trim()||'Mood check-in',mood,reflection_answers:withDetails?answers:{},stress_factors:[]});
   if(error)throw error;
   const completedAnswers=withDetails?{...answers}:{};
   setSavedAnswers(completedAnswers);
   onSaved(mood);
   onFindVerse(mood,completedAnswers);
  }catch(e:any){Alert.alert('Could not save your mood',e.message||'Please try again.')}finally{setBusy(false)}
 }
 const shownQuestions=questions.length?questions:(fallback[mood]||[]).map(question=>({question,choices:defaultChoices}));


 const currentItem=shownQuestions[questionIndex]||{question:'What might have contributed to this feeling?',choices:defaultChoices};
 const currentQuestion=currentItem.question;
 const changeStep=(n:0|1|2|3)=>{setStep(n);onNavigate?.()};
 const nextQuestion=()=>{setQuestionIndex(n=>Math.min(n+1,shownQuestions.length-1));onNavigate?.()};
 const backQuestion=()=>{if(questionIndex===0)changeStep(1);else {setQuestionIndex(n=>n-1);onNavigate?.()}};
 const primary=(label:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled||busy||loadingQuestions} onPress={onPress} style={{backgroundColor:color,paddingVertical:14,paddingHorizontal:16,borderRadius:13,alignItems:'center',opacity:disabled||busy?0.55:1}}><Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>{label}</Text></TouchableOpacity>;
 const secondary=(label:string,onPress:()=>void)=><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={{paddingVertical:13,paddingHorizontal:12,borderWidth:1,borderColor:'#ECE8F6',borderRadius:13,alignItems:'center'}}><Text style={{color:'#574780',fontWeight:'800',fontSize:13}}>{label}</Text></TouchableOpacity>;
 const option=(label:string,action:()=>void,selected=false)=><TouchableOpacity key={label} accessibilityRole="radio" accessibilityState={{selected}} onPress={action} style={{flexDirection:'row',alignItems:'center',minHeight:42,borderWidth:1,borderColor:selected?color:'#EDEAF2',backgroundColor:selected?'#F0ECFC':'#FFFFFF',borderRadius:13,paddingHorizontal:11,gap:8}}><View style={{width:16,height:16,borderRadius:8,borderWidth:1.5,borderColor:selected?color:'#C8C4D2',justifyContent:'center',alignItems:'center'}}>{selected?<View style={{width:8,height:8,borderRadius:4,backgroundColor:color}}/>:null}</View><Text style={{color:'#342B52',fontWeight:selected?'700':'500',fontSize:13}}>{label}</Text></TouchableOpacity>;
 return <View style={{backgroundColor:'#FFFFFF',paddingHorizontal:17,paddingTop:18,paddingBottom:20,borderRadius:28,gap:13}}>
  {step<3?<View style={{gap:8}}>
   <Text style={{fontSize:11,color:'#81799A',textAlign:'center'}}>Step {step+1} of 3</Text>
   <View style={{flexDirection:'row',gap:5}}>{[0,1,2].map(i=><View key={i} style={{height:4,borderRadius:3,flex:1,backgroundColor:step>=i?color:'#E8E5F0'}}/>)}</View>
  </View>:null}
  {step===0?<View style={{gap:13}}>
   <Text style={{fontSize:23,fontWeight:'900',color:'#251C45'}}>How are you feeling today?</Text>
   <Text style={{color:'#817892',fontSize:12}}>Choose the mood that best fits right now.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
    {moods.map(m=><TouchableOpacity key={m} accessibilityRole="radio" accessibilityState={{selected:mood===m}} onPress={()=>setMood(m)} style={{width:'48.7%',alignItems:'center',borderWidth:mood===m?1.5:1,borderColor:mood===m?color:'#EEEAF3',borderRadius:22,backgroundColor:mood===m?'#EEE8FF':'#FBF9FF',paddingVertical:13,gap:7}}>
     <SuperdotMascot id={m} size={96}/>
     <Text style={{fontWeight:'800',fontSize:15,color:'#26165C'}}>{m}</Text>
    </TouchableOpacity>)}
   </View>
   {mood?<View style={{flexDirection:'row',alignItems:'center',padding:9,gap:10,backgroundColor:'#F8F6FC',borderRadius:13}}><SuperdotMascot id={mood} size={44}/><View style={{flex:1}}><Text style={{fontWeight:'800',color:'#332655',fontSize:13}}>{mood}</Text><Text style={{fontSize:11,color:'#817892'}}>Your MoodPal reflects how you feel.</Text></View></View>:null}
   {primary('Continue →',()=>changeStep(1),!mood)}
  </View>:null}
  {step===1?<View style={{gap:13,alignItems:'stretch'}}>
   <View style={{alignItems:'center',paddingTop:9}}><SuperdotMascot id={mood} size={116}/></View>
   <Text style={{fontSize:21,fontWeight:'900',color:'#251C45',textAlign:'center'}}>Would you like to share more?</Text>
   <Text style={{color:'#817892',fontSize:13,lineHeight:20,textAlign:'center'}}>Save your mood now or answer a few optional questions to explore what may have contributed.</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:9,backgroundColor:'#F8F6FC',padding:11,borderRadius:12}}><View style={{flex:1}}><Text style={{color:'#342B52',fontSize:12,fontWeight:'800'}}>Use my recent wellness history</Text><Text style={{color:'#817892',fontSize:11}}>Optional: share recent mood, habits and connected health readings with Gemini to personalize questions.</Text></View><Switch value={useHistory} onValueChange={setUseHistory} trackColor={{true:color}}/></View>
   <TouchableOpacity onPress={()=>changeStep(2)} style={{padding:14,borderRadius:14,borderWidth:1,borderColor:color,backgroundColor:'#F6F3FF'}}><Text style={{color:color,fontSize:14,fontWeight:'800'}}>Yes, ask me a few questions  →</Text><Text style={{color:'#8C82A3',fontSize:11,marginTop:3}}>3 personalized questions, powered by AI when available</Text></TouchableOpacity>
   <TouchableOpacity onPress={()=>void save(false)} disabled={busy} style={{padding:14,borderRadius:14,borderWidth:1,borderColor:'#EDEAF2'}}><Text style={{fontSize:14,fontWeight:'800',color:'#342B52'}}>Just save my mood  →</Text><Text style={{fontSize:11,color:'#8C82A3',marginTop:3}}>Skip questions and finish now</Text></TouchableOpacity>
   {secondary('Back to moods',()=>changeStep(0))}
  </View>:null}
  {step===2?<View style={{gap:12}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}><SuperdotMascot id={mood} size={56}/><View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:14,color:'#281F49'}}>{mood}</Text><Text style={{fontSize:11,color:'#8980A0'}}>Let's explore this feeling</Text></View><Text style={{fontSize:11,color:'#817892'}}>{questionIndex+1} of {shownQuestions.length}</Text></View>
   <View style={{height:4,backgroundColor:'#EDEAF4',borderRadius:3,overflow:'hidden'}}><View style={{width:`${(questionIndex+1)/Math.max(shownQuestions.length,1)*100}%` as `${number}%`,height:4,backgroundColor:color,borderRadius:3}}/></View>
   <View style={{position:'relative',gap:12}}>
   <Text style={{fontSize:17,fontWeight:'900',color:'#251C45',lineHeight:24}}>{currentQuestion}</Text>
   <View accessibilityRole="radiogroup" style={{gap:7}}>{[...currentItem.choices,'Other / prefer not to say'].map(c=>option(c,()=>setAnswers(v=>({...v,[currentQuestion]:c})),answers[currentQuestion]===c))}</View>
   {questionIndex===shownQuestions.length-1?<TextInput placeholder="Add a note (optional)" placeholderTextColor="#A59DB5" multiline maxLength={1000} value={note} onChangeText={setNote} style={{minHeight:63,borderWidth:1,borderColor:'#ECE8F3',borderRadius:13,padding:11,textAlignVertical:'top',color:'#30284C'}}/>:null}

    {loadingQuestions?<View accessibilityRole="progressbar" style={{position:'absolute',top:0,bottom:0,left:0,right:0,zIndex:5,borderRadius:16,backgroundColor:'rgba(248,246,253,0.97)',justifyContent:'center',alignItems:'center',padding:18,gap:14}}>
     <ActivityIndicator size="large" color={color}/>
     <Text style={{color:'#352653',fontWeight:'900',fontSize:15,textAlign:'center'}}>Personalizing your questions…</Text>
     <Text style={{color:'#807694',fontSize:12,textAlign:'center'}}>Finding thoughtful questions for how you feel</Text>
    </View>:null}
   </View>
   <View style={{flexDirection:'row',gap:8}}>
    <View style={{flex:1}}>{secondary('Back',backQuestion)}</View>
    <View style={{flex:2}}>{primary(questionIndex===shownQuestions.length-1?'Finish check-in':'Next →',()=>questionIndex===shownQuestions.length-1?void save(true):nextQuestion())}</View>
   </View>
   <TouchableOpacity onPress={()=>void save(true)} disabled={busy} style={{alignItems:'center',paddingVertical:6}}><Text style={{fontSize:12,color:'#766A95'}}>Skip remaining questions & save</Text></TouchableOpacity>
  </View>:null}
  {step===3?<View style={{gap:13,alignItems:'stretch',paddingTop:11}}>
   <View style={{alignItems:'center',gap:7}}><Text style={{fontSize:35,color:color}}>✓</Text><SuperdotMascot id={mood} size={107}/><Text style={{fontSize:22,fontWeight:'900',color:'#251C45'}}>Check-in complete!</Text><Text style={{color:'#827892',textAlign:'center',fontSize:12,lineHeight:18}}>Your mood has been saved privately.</Text></View>
   <View style={{backgroundColor:'#F2EFFB',borderRadius:13,padding:12,flexDirection:'row',alignItems:'center',gap:9}}><SuperdotMascot id={mood} size={54}/><View style={{flex:1}}><Text style={{fontSize:11,color:'#817892'}}>Your mood today</Text><Text style={{fontSize:15,fontWeight:'900',color:'#30264D'}}>{mood}</Text><Text style={{fontSize:11,color:'#817892'}}>{new Date().toLocaleString()}</Text></View></View>
   <Text style={{fontSize:15,fontWeight:'900',color:'#30264D'}}>What's next?</Text>
   {[
    {icon:'📜',title:'Find a Bible verse for me',sub:'Find encouragement matched to your check-in',go:()=>onFindVerse(mood,savedAnswers)},
    {icon:'💬',title:'Talk to your Superdot',sub:'Explore this feeling through AI text chat',go:()=>onExploreAI(mood)},
    {icon:'📖',title:'Write in your journal',sub:'Reflect on your thoughts',go:onJournal},
    {icon:'💡',title:'View insights',sub:'See your patterns over time',go:onInsights},
   ].map(item=><TouchableOpacity key={item.title} accessibilityRole="button" onPress={item.go} style={{borderWidth:1,borderColor:'#ECE9F4',borderRadius:14,padding:11,flexDirection:'row',alignItems:'center',gap:11}}>
    <View style={{backgroundColor:'#F1ECFF',width:40,height:40,borderRadius:12,justifyContent:'center',alignItems:'center'}}><Text style={{fontSize:22}}>{item.icon}</Text></View>
    <View style={{flex:1,gap:3}}><Text style={{fontWeight:'800',color:'#30264D',fontSize:13}}>{item.title}</Text><Text style={{color:'#89809B',fontSize:11}}>{item.sub}</Text></View>
   </TouchableOpacity>)}
   {primary('Back to Home',onDone)}
  </View>:null}
  {busy?<ActivityIndicator color={color}/>:null}
 </View>;

}
