import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import SuperdotMascot from './SuperdotMascot';
import {supabase} from './supabase';

// Watch themes are colours. Keep in sync with WatchTheme.swift and StressComplication.swift.
export const WATCH_LEVELS=[
 {id:'great',label:'Great',face:'Calm',color:'#4DBA80'},
 {id:'normal',label:'Normal',face:'Joyful',color:'#8A9CF0'},
 {id:'elevated',label:'Elevated',face:'Anxious',color:'#F2A670'},
 {id:'overload',label:'Overload',face:'Angry',color:'#ED7087'},
] as const;
export const WATCH_THEMES=[
 {id:'purple',label:'Purple',color:'#7139E9',tint:'#EEE5FF'},
 {id:'pink',label:'Pink',color:'#E76B8A',tint:'#FFE7EE'},
 {id:'blue',label:'Blue',color:'#488CD9',tint:'#E2F1FF'},
 {id:'gold',label:'Gold',color:'#E3A426',tint:'#FFF4CE'},
 {id:'green',label:'Green',color:'#3BA986',tint:'#E1F8ED'},
 {id:'teal',label:'Teal',color:'#2BB3B1',tint:'#DDF6F5'},
 {id:'orange',label:'Orange',color:'#F07B3F',tint:'#FFEBDD'},
 {id:'red',label:'Red',color:'#E04F5F',tint:'#FFE3E6'},
] as const;
type WatchTheme=typeof WATCH_THEMES[number];
const ink='#1D2B33',muted='#6E7D86';
const card={backgroundColor:'#fff',borderRadius:22,padding:16,shadowColor:'#1D2B33',shadowOpacity:.06,shadowRadius:12,shadowOffset:{width:0,height:4}} as const;

// Mirrors the watch home screen (ContentView.swift): accent glow, mascot, mood, stress line, compact Measure now, colour dot.
function WatchMock({theme,width=150}:{theme:WatchTheme;width?:number}){
 const k=width/150;
 return <View style={{width,height:width*1.2,borderRadius:38*k,backgroundColor:'#2A2A2E',padding:7*k}}>
  <View style={{flex:1,borderRadius:32*k,backgroundColor:'#000',overflow:'hidden',alignItems:'center',paddingTop:16*k}}>
   <View style={{position:'absolute',top:-60*k,left:-20*k,right:-20*k,height:130*k,borderRadius:80*k,backgroundColor:theme.color,opacity:.28}}/>
   <Text style={{position:'absolute',top:7*k,right:13*k,color:'#fff',fontSize:10*k,fontWeight:'700'}}>10:09</Text>
   <SuperdotMascot id="Calm" size={52*k} preview animate={false}/>
   <Text style={{color:'#fff',fontSize:12*k,fontWeight:'800'}}>Calm</Text>
   <Text style={{color:'#8E8E93',fontSize:8*k}}>Tap to change mood</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:3*k,marginTop:3*k}}><SuperdotMascot id="Anxious" size={10*k} preview animate={false}/><Text style={{color:'#fff',fontSize:7*k}}>Stress Elevated · 68</Text></View>
   <View style={{flexDirection:'row',alignItems:'center',gap:4*k,marginTop:5*k}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:3*k,backgroundColor:theme.color,borderRadius:10*k,paddingHorizontal:9*k,paddingVertical:3*k}}><Ionicons name="heart-circle" size={9*k} color="#fff"/><Text style={{color:'#fff',fontSize:8*k,fontWeight:'800'}}>Measure now</Text></View>
    <View style={{width:14*k,height:14*k,borderRadius:7*k,backgroundColor:theme.color,borderWidth:1.5,borderColor:'#fff'}}/>
   </View>
  </View>
 </View>;
}

// Mirrors the corner + rectangular complications (StressComplication.swift), tinted with the theme colour.
function ComplicationMock({theme}:{theme:WatchTheme}){
 return <View style={{width:120,height:144,borderRadius:31,backgroundColor:'#2A2A2E',padding:6}}>
  <View style={{flex:1,borderRadius:26,backgroundColor:'#000',padding:9,justifyContent:'space-between'}}>
   <Text style={{color:'#fff',fontSize:22,fontWeight:'800',textAlign:'center',marginTop:8}}>10:09</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#151517',borderRadius:12,padding:6}}>
    <SuperdotMascot id="Anxious" size={26} preview animate={false}/>
    <View style={{flex:1,gap:2}}><Text style={{color:'#9a9a9f',fontSize:8}}>MoodPals</Text><Text style={{color:theme.color,fontSize:11,fontWeight:'800'}}>Elevated · 68</Text>
     <View style={{height:3,borderRadius:2,backgroundColor:'#333'}}><View style={{width:'68%',height:3,borderRadius:2,backgroundColor:theme.color}}/></View></View>
   </View>
  </View>
 </View>;
}

function Swatch({theme,on,size=64}:{theme:WatchTheme;on:boolean;size?:number}){
 return <View style={{borderWidth:3,borderColor:on?theme.color:'transparent',borderRadius:size,padding:3}}>
  <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:theme.color,alignItems:'center',justifyContent:'center'}}>{on?<Ionicons name="checkmark" size={size*0.45} color="#fff"/>:null}</View>
 </View>;
}


const GUIDE_STEPS=['Long press your watch face','Tap Edit','Swipe left to Complications','Tap a slot, then choose MoodPals','Pick Mood, Mood & Stress or Stress score'];
// Modular face with the three MoodPals complications (StressComplication.swift).
function ModularFaceMock({theme}:{theme:WatchTheme}){
 return <View style={{width:170,height:204,borderRadius:42,backgroundColor:'#2A2A2E',padding:7}}>
  <View style={{flex:1,borderRadius:36,backgroundColor:'#000',padding:12,gap:8}}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
    <View style={{width:34,height:34,borderRadius:17,backgroundColor:'#1C1C1E',alignItems:'center',justifyContent:'center'}}><SuperdotMascot id="Calm" size={28} preview animate={false}/></View>
    <Text style={{color:'#fff',fontSize:22,fontWeight:'700'}}>10:09</Text>
   </View>
   <View style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#151517',borderRadius:12,padding:6}}>
    <SuperdotMascot id="Calm" size={34} preview animate={false}/>
    <View style={{flex:1,gap:2}}><Text style={{color:theme.color,fontSize:13,fontWeight:'800'}}>Calm</Text><Text style={{color:'#9a9a9f',fontSize:9}}>Great · 28</Text>
     <View style={{height:3,borderRadius:2,backgroundColor:'#333'}}><View style={{width:'28%',height:3,borderRadius:2,backgroundColor:theme.color}}/></View></View>
   </View>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}>
    <View style={{width:34,height:34,borderRadius:17,borderWidth:3,borderColor:theme.color,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:11,fontWeight:'800'}}>28</Text></View>
    <View style={{width:34,height:34,borderRadius:17,backgroundColor:'#1C1C1E'}}/>
    <View style={{width:34,height:34,borderRadius:17,backgroundColor:'#1C1C1E'}}/>
   </View>
  </View>
 </View>;
}

function AddToWatchFaceGuide({theme}:{theme:WatchTheme}){
 const [step,setStep]=useState(0);
 useEffect(()=>{const t=setInterval(()=>setStep(s=>(s+1)%GUIDE_STEPS.length),1800);return()=>clearInterval(t)},[]);
 return <View style={{gap:14}}>
  <View style={[card,{alignItems:'center',gap:10}]}><ModularFaceMock theme={theme}/><Text style={{color:muted,textAlign:'center'}}>See your MoodPal and the time together, without opening the app.</Text></View>
  <View style={[card,{gap:10}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>How to add it</Text>
   {GUIDE_STEPS.map((t,i)=><View key={t} style={{flexDirection:'row',alignItems:'center',gap:10,opacity:i===step?1:.55}}>
    <View style={{width:26,height:26,borderRadius:13,backgroundColor:i===step?theme.color:theme.tint,alignItems:'center',justifyContent:'center'}}><Text style={{color:i===step?'#fff':theme.color,fontWeight:'900'}}>{i+1}</Text></View>
    <Text style={{color:ink,fontWeight:i===step?'800':'600',flex:1}}>{t}</Text></View>)}
  </View>
  <View style={[card,{gap:8}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>MoodPals complications</Text>
   {[['Mood','Your MoodPal — round and corner slots'],['Mood & Stress','MoodPal, mood and stress bar — large slot on Modular faces'],['Stress score','Your latest score with a ring']].map(([a,b])=><View key={a}><Text style={{color:theme.color,fontWeight:'800'}}>{a}</Text><Text style={{color:muted,fontSize:12}}>{b}</Text></View>)}
  </View>
 </View>;
}

export default function WatchThemesScreen({onBack}:{onBack:()=>void}){
 const [current,setCurrent]=useState<string|null>(null);
 const [selected,setSelected]=useState<WatchTheme|null>(null);
 const [saving,setSaving]=useState(false);
 const [guide,setGuide]=useState(false);
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data}=await supabase.from('user_settings').select('watch_theme').eq('user_id',user.id).maybeSingle();setCurrent((data as any)?.watch_theme||'purple');})()},[]);
 const active=WATCH_THEMES.find(t=>t.id===current)||WATCH_THEMES[0];
 const apply=async(t:WatchTheme)=>{
  setSaving(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in again.');
   const {error}=await supabase.from('user_settings').update({watch_theme:t.id,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(error)throw error;
   setCurrent(t.id);setSelected(null);
   Alert.alert('Sending to your watch','Your Apple Watch shows a short loading screen, then switches to the new colour the next time the MoodPals watch app syncs — within about a minute while it’s open. Complications follow right after.');
  }catch(e:any){Alert.alert('Couldn’t save the theme',e?.message||'Please try again.')}finally{setSaving(false)}
 };
 const back=<TouchableOpacity onPress={guide?()=>setGuide(false):selected?()=>setSelected(null):onBack} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:4,paddingVertical:6,alignSelf:'flex-start'}}><Ionicons name="chevron-back" size={18} color={active.color}/><Text style={{color:active.color,fontWeight:'800'}}>{guide||selected?'Watch Themes':'Settings'}</Text></TouchableOpacity>;
 if(guide)return <View style={{gap:14}}>{back}<Text style={{fontSize:28,fontWeight:'900',color:ink}}>Add to Watch Face</Text><AddToWatchFaceGuide theme={active}/></View>;
 if(selected)return <View style={{gap:14}}>
  {back}
  <View style={[card,{alignItems:'center',gap:10}]}><WatchMock theme={selected} width={170}/><Text style={{color:muted,textAlign:'center'}}>This is how the MoodPals watch app will look.</Text></View>
  <View style={[card,{gap:12}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>Status preview</Text>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}>{WATCH_LEVELS.map(l=><View key={l.id} style={{alignItems:'center',gap:5}}><View style={{width:62,height:62,borderRadius:31,backgroundColor:selected.tint,alignItems:'center',justifyContent:'center'}}><SuperdotMascot id={l.face} size={52} preview animate={false}/></View><Text style={{fontSize:12,fontWeight:'800',color:l.color}}>{l.label}</Text></View>)}</View>
  </View>
  <View style={[card,{gap:12,alignItems:'center'}]}><Text style={{fontWeight:'900',color:ink,fontSize:16,alignSelf:'flex-start'}}>Watch face complication</Text><ComplicationMock theme={selected}/></View>
  <TouchableOpacity disabled={saving||current===selected.id} onPress={()=>void apply(selected)} accessibilityRole="button" style={{backgroundColor:selected.color,borderRadius:18,paddingVertical:15,alignItems:'center',opacity:saving||current===selected.id?.6:1}}>
   {saving?<ActivityIndicator color="#fff"/>:<Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>{current===selected.id?'In use on your watch':'Use on Watch'}</Text>}
  </TouchableOpacity>
 </View>;
 return <View style={{gap:14}}>
  {back}
  <Text style={{fontSize:28,fontWeight:'900',color:ink}}>Watch Themes</Text>
  <View style={[card,{alignItems:'center',gap:8}]}>
   {current===null?<ActivityIndicator color={active.color}/>:<><WatchMock theme={active} width={170}/>
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="sync-outline" size={14} color={active.color}/><Text style={{color:muted,fontSize:12}}>Syncs to your watch automatically</Text></View></>}
  </View>
  <TouchableOpacity onPress={()=>setGuide(true)} accessibilityRole="button" style={[card,{flexDirection:'row',alignItems:'center',gap:12}]}>
   <View style={{width:40,height:40,borderRadius:20,backgroundColor:active.tint,alignItems:'center',justifyContent:'center'}}><Ionicons name="watch-outline" size={22} color={active.color}/></View>
   <View style={{flex:1}}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>Add to Watch Face</Text><Text style={{color:muted,fontSize:12}}>See your mood next to the time</Text></View>
   <Ionicons name="chevron-forward" size={18} color={muted}/></TouchableOpacity>
  <View style={[card,{gap:14}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>Colours</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:14}}>{WATCH_THEMES.map(t=><TouchableOpacity key={t.id} onPress={()=>setSelected(t)} accessibilityRole="button" accessibilityLabel={t.label+(t.id===current?', in use':'')} style={{width:'24%',alignItems:'center'}}><Swatch theme={t} on={t.id===current}/></TouchableOpacity>)}</View>
  </View>
 </View>;
}
