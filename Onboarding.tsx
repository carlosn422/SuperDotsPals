import React,{useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,StyleSheet,ActivityIndicator,Alert} from 'react-native';
import {supabase} from './supabase';
import Svg,{Circle,Ellipse,Path,Rect,Polygon,Line} from 'react-native-svg';
export const DOTS=[
 {id:'bloop',name:'Bloop',theme:'grape',color:'#7139E9',light:'#EEE5FF',face:'●',description:'Curious & cuddly'},
 {id:'poppy',name:'Poppy',theme:'coral',color:'#E76B8A',light:'#FFE7EE',face:'✿',description:'Warm & cheerful'},
 {id:'mochi',name:'Mochi',theme:'sky',color:'#488CD9',light:'#E2F1FF',face:'✦',description:'Cool & calm'},
 {id:'zuzu',name:'Zuzu',theme:'sunny',color:'#E3A426',light:'#FFF4CE',face:'★',description:'Bright & bubbly'},
 {id:'nori',name:'Nori',theme:'mint',color:'#3BA986',light:'#E1F8ED',face:'♥',description:'Soft & peaceful'}
] as const;
const goals=['Understand stress','Improve sleep','Build healthy habits','Track fitness','Improve recovery'];
const contexts=['Apple Watch owner','Regular exercise','Shift work','Trouble sleeping','Prefer not to share'];
function Mascot({id,color}:{id:string;color:string}){
 const eyes=(x1:number,x2:number,y=45)=><><Ellipse cx={x1} cy={y} rx="5" ry="7" fill="white"/><Ellipse cx={x2} cy={y} rx="5" ry="7" fill="white"/></>;
 const mouth=(y=60)=><Path d={`M 38 ${y} Q 44 ${y+9} 50 ${y}`} stroke="#28145E" strokeWidth="3" strokeLinecap="round" fill="none"/>;
 return <Svg width={102} height={102} viewBox="0 0 88 88">
 {id==='bloop'?<><Circle cx="44" cy="44" r="28" fill={color}/>{[[19,19],[33,13],[50,12],[66,21],[16,48],[72,48],[29,71],[58,72]].map(([x,y],i)=><Circle key={i} cx={x} cy={y} r="6" fill={color}/>)}<Circle cx="44" cy="42" r="19" fill="white"/><Circle cx="47" cy="43" r="11" fill="#28145E"/><Circle cx="51" cy="38" r="4" fill="white"/><Path d="M57 62 Q62 67 67 61" stroke="#28145E" strokeWidth="3" fill="none" strokeLinecap="round"/></>:null}
 {id==='poppy'?<><Circle cx="44" cy="20" r="17" fill={color}/><Circle cx="64" cy="32" r="17" fill={color}/><Circle cx="64" cy="56" r="17" fill={color}/><Circle cx="44" cy="68" r="17" fill={color}/><Circle cx="24" cy="56" r="17" fill={color}/><Circle cx="24" cy="32" r="17" fill={color}/><Circle cx="44" cy="44" r="24" fill="#FFC7D3"/>{eyes(36,52)}{mouth(56)}<Circle cx="26" cy="52" r="5" fill="#F7A0AB"/><Circle cx="62" cy="52" r="5" fill="#F7A0AB"/></>:null}
 {id==='mochi'?<><Path d="M15 34 C15 22 27 16 36 19 C45 8 66 14 70 30 C83 40 76 61 66 67 C55 78 31 77 21 66 C10 59 9 44 15 34 Z" fill={color}/><Ellipse cx="30" cy="24" rx="13" ry="9" fill="#8BC4FA"/>{eyes(35,54,46)}<Path d="M38 60 Q44 64 50 60" stroke="#28145E" strokeWidth="3" strokeLinecap="round" fill="none"/></>:null}
 {id==='zuzu'?<><Polygon points="44,5 53,24 75,15 66,36 85,44 66,53 75,74 53,64 44,84 35,64 13,74 22,53 3,44 22,36 13,15 35,24" fill={color}/><Circle cx="44" cy="44" r="24" fill="#FFD96A"/>{eyes(35,53,41)}<Path d="M35 55 Q44 69 53 55" stroke="#28145E" strokeWidth="3" fill="none" strokeLinecap="round"/></>:null}
 {id==='nori'?<><Path d="M44 5 C58 23 80 34 74 57 C71 74 56 81 44 81 C22 81 12 63 17 45 C22 26 36 13 44 5 Z" fill={color}/><Path d="M44 13 Q31 35 33 70" fill="none" stroke="#9FE2C8" strokeWidth="4" strokeLinecap="round"/><Path d="M34 46 Q41 41 48 46 M53 46 Q60 41 67 46" stroke="#28145E" strokeWidth="3" strokeLinecap="round" fill="none"/><Path d="M44 58 Q51 65 57 58" stroke="#28145E" strokeWidth="3" strokeLinecap="round" fill="none"/><Circle cx="31" cy="53" r="4" fill="#FFC0CA"/><Circle cx="69" cy="53" r="4" fill="#FFC0CA"/></>:null}
 </Svg>;
}
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
 {step===3?<><Text style={s.title}>Choose your Superdot! 🎉</Text><Text style={s.sub}>Meet your five original little buddies. Your choice will change the app's colors.</Text><View style={s.dotGrid}>{DOTS.map(d=><TouchableOpacity key={d.id} onPress={()=>setDot(d.id)} style={[s.dotCard,{borderColor:dot===d.id?d.color:'#EFE9FB',backgroundColor:dot===d.id?d.light:'white'}]}><Mascot id={d.id} color={d.color}/><Text style={s.dotName}>{d.name}</Text><Text style={s.dotDesc}>{d.description}</Text>{dot===d.id?<Text style={{color:d.color,fontSize:11,fontWeight:'800'}}>✓ Selected</Text>:null}</TouchableOpacity>)}</View></>:null}
 <View style={s.buttons}>{step>0?<TouchableOpacity onPress={()=>setStep(v=>v-1)} style={s.back}><Text style={s.backText}>Back</Text></TouchableOpacity>:null}<TouchableOpacity disabled={loading} onPress={()=>{if(step<3)setStep(x=>x+1);else void finish()}} style={[s.primary,{backgroundColor:picked.color}]}>{loading?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>{step===3?'Meet my Superdot!':'Continue'}</Text>}</TouchableOpacity></View>
 {step<3?<TouchableOpacity onPress={()=>setStep(x=>x+1)}><Text style={s.skip}>Skip for now</Text></TouchableOpacity>:null}
 <Text style={s.privacy}>Your selections are saved to your private profile. You can change them later.</Text>
 </ScrollView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#F9F6FF'},content:{padding:25,paddingTop:70,paddingBottom:50,gap:15},brand:{fontSize:20,fontWeight:'900',color:'#6433CE'},progress:{fontSize:10,letterSpacing:2,color:'#8976AD',fontWeight:'800',marginTop:19},track:{height:6,backgroundColor:'#E9E0FA',borderRadius:10,overflow:'hidden'},fill:{height:'100%',borderRadius:10},title:{fontSize:31,color:'#28145E',fontWeight:'900',marginTop:19,lineHeight:38},sub:{color:'#8B7EAD',lineHeight:21,fontSize:14},label:{fontWeight:'800',color:'#28145E',marginTop:13,fontSize:14},hint:{color:'#9A8DAE',fontSize:11,lineHeight:18},input:{padding:16,borderWidth:1,borderColor:'#E4DBF5',borderRadius:17,backgroundColor:'#fff',fontSize:16,color:'#28145E'},options:{gap:10,marginTop:5},choice:{padding:16,borderRadius:16,borderWidth:2,borderColor:'#EEE9F6',backgroundColor:'#fff'},choiceText:{fontWeight:'700',color:'#37245F'},buttons:{flexDirection:'row',gap:10,marginTop:20},back:{borderRadius:17,padding:16,backgroundColor:'#EEE8F8',alignItems:'center',justifyContent:'center'},backText:{color:'#6445B1',fontWeight:'800'},primary:{padding:17,borderRadius:17,alignItems:'center',flex:1},primaryText:{color:'white',fontWeight:'900'},skip:{fontWeight:'700',color:'#8A78B6',textAlign:'center'},privacy:{color:'#AA9BC2',fontSize:10,textAlign:'center',lineHeight:17,marginTop:10},dotGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,justifyContent:'center'},dotCard:{width:'47%',padding:13,borderWidth:2,borderRadius:21,alignItems:'center',gap:5},dotBody:{width:83,height:80,borderRadius:34,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,position:'relative',marginBottom:7},eye:{width:14,height:19,borderRadius:8,backgroundColor:'white'},smile:{position:'absolute',bottom:9,color:'#28145E',fontSize:27,fontWeight:'900'},dotName:{color:'#28145E',fontWeight:'900',fontSize:16},dotDesc:{color:'#8E80A5',fontSize:10,textAlign:'center'}});
