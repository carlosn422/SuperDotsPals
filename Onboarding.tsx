import React,{useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,ActivityIndicator,Alert} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
export const DOTS=[
 {id:'bloop',name:'Bloop',theme:'grape',color:'#7139E9',light:'#EEE5FF',face:'●',description:'Curious & cuddly'},
 {id:'poppy',name:'Poppy',theme:'coral',color:'#E76B8A',light:'#FFE7EE',face:'✿',description:'Warm & cheerful'},
 {id:'mochi',name:'Mochi',theme:'sky',color:'#488CD9',light:'#E2F1FF',face:'✦',description:'Cool & calm'},
 {id:'zuzu',name:'Zuzu',theme:'sunny',color:'#E3A426',light:'#FFF4CE',face:'★',description:'Bright & bubbly'},
 {id:'nori',name:'Nori',theme:'mint',color:'#3BA986',light:'#E1F8ED',face:'♥',description:'Soft & peaceful'}
] as const;
const goals=['Understand stress','Improve sleep','Build healthy habits','Track fitness','Improve recovery'];
const contexts=['Apple Watch owner','Regular exercise','Shift work','Trouble sleeping','Prefer not to share'];
export default function Onboarding({done}:{done:()=>void}){
 const [step,setStep]=useState(0),[age,setAge]=useState(''),[sex,setSex]=useState(''),[selectedGoals,setGoals]=useState<string[]>([]),[selectedContexts,setContexts]=useState<string[]>([]),[dot,setDot]=useState('bloop'),[loading,setLoading]=useState(false);
 const picked=DOTS.find(x=>x.id===dot)||DOTS[0];
 const toggle=(v:string,arr:string[],set:(v:string[])=>void)=>set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);
 async function finish(){
  setLoading(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('Please sign in again.');
   const year=age.trim()?new Date().getFullYear()-Number(age):null;
   if(year!==null&&(Number(age)<13||Number(age)>120||!Number.isInteger(Number(age))))throw Error('Enter an age between 13 and 120 or leave it blank.');
   const {error:e1}=await supabase.from('profiles').update({birth_year:year,sex:sex||null,health_goals:selectedGoals,health_context:selectedContexts}).eq('id',user.id);if(e1)throw e1;
   const {error:e2}=await supabase.from('user_settings').update({theme:picked.theme,companion:picked.id}).eq('user_id',user.id);if(e2)throw e2;
   const {error:e3}=await supabase.from('profiles').update({onboarding_completed_at:new Date().toISOString()}).eq('id',user.id);if(e3)throw e3;
   done();
  }catch(e:any){Alert.alert('Could not save onboarding',e.message||'Please try again.');}finally{setLoading(false);}
 }
 function choice(v:string,active:boolean,press:()=>void){return <TouchableOpacity key={v} onPress={press} style={[s.choice,active&&{borderColor:picked.color,backgroundColor:picked.light}]}><Text style={[s.choiceText,active&&{color:picked.color}]}>{active?'✓  ':''}{v}</Text></TouchableOpacity>}
 return <View style={s.root}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
 <Text style={s.brand}>✦ superdots.</Text><Text style={s.progress}>STEP {step+1} OF 4</Text><View style={s.track}><View style={[s.fill,{width:((step+1)*25)+'%',backgroundColor:picked.color}]}/></View>
 {step===0?<><Text style={s.title}>Let's get to know you 💜</Text><Text style={s.sub}>A little about you helps us put your wellness journey in context. Everything here is optional.</Text><Text style={s.label}>Your age</Text><TextInput keyboardType="number-pad" maxLength={3} placeholder="Age (optional)" placeholderTextColor="#AAA0C1" value={age} onChangeText={setAge} style={s.input}/><Text style={s.label}>How do you describe your sex?</Text><Text style={s.hint}>Optional. Some physiological reference ranges can vary by sex, but we won't use this to make medical claims.</Text><View style={s.options}>{[['Female','female'],['Male','male'],['Other','other'],['Prefer not to say','prefer_not_to_say']].map(([name,value])=>choice(name,sex===value,()=>setSex(value)))}</View></>:null}
 {step===1?<><Text style={s.title}>What brings you here? ✨</Text><Text style={s.sub}>Pick the things you want to focus on. You can choose more than one.</Text><View style={s.options}>{goals.map(v=>choice(v,selectedGoals.includes(v),()=>toggle(v,selectedGoals,setGoals)))}</View></>:null}
 {step===2?<><Text style={s.title}>A little health context 🌱</Text><Text style={s.sub}>These details are optional and private. We'll never treat them as a diagnosis.</Text><View style={s.options}>{contexts.map(v=>choice(v,selectedContexts.includes(v),()=>{if(v==='Prefer not to share')setContexts(['Prefer not to share']);else toggle(v,selectedContexts.filter(x=>x!=='Prefer not to share'),setContexts) }))}</View><Text style={s.hint}>Apple Health access is not requested during onboarding. When available, it will need separate explicit permission.</Text></>:null}
 {step===3?<><Text style={s.title}>Choose your Superdot! 🎉</Text><Text style={s.sub}>Meet your five original little buddies. Your choice will change the app's colors.</Text><View style={s.dotGrid}>{DOTS.map(d=><TouchableOpacity key={d.id} onPress={()=>setDot(d.id)} style={[s.dotCard,{borderColor:dot===d.id?d.color:'#EFE9FB',backgroundColor:dot===d.id?d.light:'white'}]}><SuperdotMascot id={d.id} color={d.color} size={102}/><Text style={s.dotName}>{d.name}</Text><Text style={s.dotDesc}>{d.description}</Text>{dot===d.id?<Text style={{color:d.color,fontSize:11,fontWeight:'800'}}>✓ Selected</Text>:null}</TouchableOpacity>)}</View></>:null}
 <View style={s.buttons}>{step>0?<TouchableOpacity onPress={()=>setStep(v=>v-1)} style={s.back}><Text style={s.backText}>Back</Text></TouchableOpacity>:null}<TouchableOpacity disabled={loading} onPress={()=>{if(step<3)setStep(x=>x+1);else void finish()}} style={[s.primary,{backgroundColor:picked.color}]}>{loading?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>{step===3?'Meet my Superdot!':'Continue'}</Text>}</TouchableOpacity></View>
 {step<3?<TouchableOpacity onPress={()=>setStep(x=>x+1)}><Text style={s.skip}>Skip for now</Text></TouchableOpacity>:null}
 <Text style={s.privacy}>Your selections are saved to your private profile. You can change them later.</Text>
 </ScrollView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#F9F6FF'},content:{padding:25,paddingTop:70,paddingBottom:50,gap:15},brand:{fontSize:20,fontWeight:'900',color:'#6433CE'},progress:{fontSize:10,letterSpacing:2,color:'#8976AD',fontWeight:'800',marginTop:19},track:{height:6,backgroundColor:'#E9E0FA',borderRadius:10,overflow:'hidden'},fill:{height:'100%',borderRadius:10},title:{fontSize:31,color:'#28145E',fontWeight:'900',marginTop:19,lineHeight:38},sub:{color:'#8B7EAD',lineHeight:21,fontSize:14},label:{fontWeight:'800',color:'#28145E',marginTop:13,fontSize:14},hint:{color:'#9A8DAE',fontSize:11,lineHeight:18},input:{padding:16,borderWidth:1,borderColor:'#E4DBF5',borderRadius:17,backgroundColor:'#fff',fontSize:16,color:'#28145E'},options:{gap:10,marginTop:5},choice:{padding:16,borderRadius:16,borderWidth:2,borderColor:'#EEE9F6',backgroundColor:'#fff'},choiceText:{fontWeight:'700',color:'#37245F'},buttons:{flexDirection:'row',gap:10,marginTop:20},back:{borderRadius:17,padding:16,backgroundColor:'#EEE8F8',alignItems:'center',justifyContent:'center'},backText:{color:'#6445B1',fontWeight:'800'},primary:{padding:17,borderRadius:17,alignItems:'center',flex:1},primaryText:{color:'white',fontWeight:'900'},skip:{fontWeight:'700',color:'#8A78B6',textAlign:'center'},privacy:{color:'#AA9BC2',fontSize:10,textAlign:'center',lineHeight:17,marginTop:10},dotGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,justifyContent:'center'},dotCard:{width:'47%',padding:13,borderWidth:2,borderRadius:21,alignItems:'center',gap:5},dotBody:{width:83,height:80,borderRadius:34,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,position:'relative',marginBottom:7},eye:{width:14,height:19,borderRadius:8,backgroundColor:'white'},smile:{position:'absolute',bottom:9,color:'#28145E',fontSize:27,fontWeight:'900'},dotName:{color:'#28145E',fontWeight:'900',fontSize:16},dotDesc:{color:'#8E80A5',fontSize:10,textAlign:'center'}});
