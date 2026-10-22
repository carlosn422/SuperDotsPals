import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import SuperdotMascot from './SuperdotMascot';
import {supabase} from './supabase';
import {COMPANIONS} from './SettingsComponents';

// A watch theme is a character, an accent colour and one face per stress level.
// The launch themes are the five companions with the existing MoodPals; a new character only needs its own faces.
export const WATCH_LEVELS=[
 {id:'great',label:'Great',face:'Calm',color:'#4DBA80'},
 {id:'normal',label:'Normal',face:'Joyful',color:'#8A9CF0'},
 {id:'elevated',label:'Elevated',face:'Anxious',color:'#F2A670'},
 {id:'overload',label:'Overload',face:'Angry',color:'#ED7087'},
] as const;
export const WATCH_THEMES=COMPANIONS.map(c=>({id:c.id,name:c.name,color:c.color,tint:c.tint,bio:c.personality}));
type WatchTheme=typeof WATCH_THEMES[number];
const ink='#1D2B33',muted='#6E7D86';
const card={backgroundColor:'#fff',borderRadius:22,padding:16,shadowColor:'#1D2B33',shadowOpacity:.06,shadowRadius:12,shadowOffset:{width:0,height:4}} as const;

function Face({theme,mood,size}:{theme:WatchTheme;mood:string;size:number}){
 return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:theme.tint,alignItems:'center',justifyContent:'center',overflow:'hidden'}}><SuperdotMascot id={mood} size={size*0.86} preview animate={false}/></View>;
}

function WatchMock({theme,small}:{theme:WatchTheme;small?:boolean}){
 const w=small?120:150;
 return <View style={{width:w,height:w*1.2,borderRadius:w*0.28,backgroundColor:'#2A2A2E',padding:7}}>
  <View style={{flex:1,borderRadius:w*0.23,backgroundColor:'#000',alignItems:'center',justifyContent:'center',gap:3}}>
   <Text style={{position:'absolute',top:8,right:12,color:'#fff',fontSize:10,fontWeight:'700'}}>10:09</Text>
   <SuperdotMascot id="Joyful" size={w*0.45} preview animate={false}/>
   <Text numberOfLines={1} adjustsFontSizeToFit style={{color:'#fff',fontSize:small?9:11,fontWeight:'800',paddingHorizontal:6}}>Stress Normal · 42</Text>
   <View style={{backgroundColor:theme.color,borderRadius:12,paddingHorizontal:12,paddingVertical:4}}><Text style={{color:'#fff',fontSize:9,fontWeight:'800'}}>Measure now</Text></View>
  </View>
 </View>;
}

function ComplicationMock({theme}:{theme:WatchTheme}){
 return <View style={{width:120,height:144,borderRadius:34,backgroundColor:'#2A2A2E',padding:7}}>
  <View style={{flex:1,borderRadius:28,backgroundColor:'#000',padding:10,gap:8,justifyContent:'center'}}>
   <Text style={{color:'#fff',fontSize:22,fontWeight:'800',textAlign:'center'}}>10:09</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#151517',borderRadius:12,padding:6}}>
    <View style={{width:30,height:30,borderRadius:15,borderWidth:3,borderColor:theme.color,alignItems:'center',justifyContent:'center'}}><SuperdotMascot id="Calm" size={20} preview animate={false}/></View>
    <View><Text style={{color:'#9a9a9f',fontSize:8}}>MoodPals</Text><Text style={{color:WATCH_LEVELS[0].color,fontSize:11,fontWeight:'800'}}>Great · 28</Text></View>
   </View>
  </View>
 </View>;
}

export default function WatchThemesScreen({onBack}:{onBack:()=>void}){
 const [current,setCurrent]=useState<string|null>(null);
 const [selected,setSelected]=useState<WatchTheme|null>(null);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const {data}=await supabase.from('user_settings').select('watch_theme').eq('user_id',user.id).maybeSingle();setCurrent((data as any)?.watch_theme||'bloop');})()},[]);
 const active=WATCH_THEMES.find(t=>t.id===current)||WATCH_THEMES[0];
 const apply=async(t:WatchTheme)=>{
  setSaving(true);
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in again.');
   const {error}=await supabase.from('user_settings').update({watch_theme:t.id,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(error)throw error;
   setCurrent(t.id);setSelected(null);
   Alert.alert(t.name+' is your watch theme','Your Apple Watch switches the next time the MoodPals watch app syncs — within about a minute while it’s open. Watch-face complications follow right after.');
  }catch(e:any){Alert.alert('Couldn’t save the theme',e?.message||'Please try again.')}finally{setSaving(false)}
 };
 const back=<TouchableOpacity onPress={selected?()=>setSelected(null):onBack} accessibilityRole="button" style={{flexDirection:'row',alignItems:'center',gap:4,paddingVertical:6,alignSelf:'flex-start'}}><Ionicons name="chevron-back" size={18} color={active.color}/><Text style={{color:active.color,fontWeight:'800'}}>{selected?'Watch Themes':'Settings'}</Text></TouchableOpacity>;
 if(selected)return <View style={{gap:14}}>
  {back}
  <View style={[card,{alignItems:'center',gap:8}]}><Face theme={selected} mood="Calm" size={96}/><Text style={{fontSize:26,fontWeight:'900',color:ink}}>{selected.name}</Text><Text style={{color:muted,textAlign:'center'}}>{selected.bio}. Colours your watch app, stress card and complications.</Text></View>
  <View style={[card,{gap:12}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>Status preview</Text>
   <View style={{flexDirection:'row',justifyContent:'space-between'}}>{WATCH_LEVELS.map(l=><View key={l.id} style={{alignItems:'center',gap:5}}><Face theme={selected} mood={l.face} size={62}/><Text style={{fontSize:12,fontWeight:'800',color:l.color}}>{l.label}</Text></View>)}</View>
  </View>
  <View style={[card,{gap:12}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>Watch preview</Text>
   <View style={{flexDirection:'row',justifyContent:'space-around'}}><View style={{alignItems:'center',gap:6}}><WatchMock theme={selected} small/><Text style={{color:muted,fontSize:12}}>Watch app</Text></View><View style={{alignItems:'center',gap:6}}><ComplicationMock theme={selected}/><Text style={{color:muted,fontSize:12}}>Complication</Text></View></View>
  </View>
  <TouchableOpacity disabled={saving||current===selected.id} onPress={()=>void apply(selected)} accessibilityRole="button" style={{backgroundColor:selected.color,borderRadius:18,paddingVertical:15,alignItems:'center',opacity:saving||current===selected.id?.6:1}}>
   {saving?<ActivityIndicator color="#fff"/>:<Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>{current===selected.id?'In use on your watch':'Use on Watch'}</Text>}
  </TouchableOpacity>
 </View>;
 return <View style={{gap:14}}>
  {back}
  <Text style={{fontSize:28,fontWeight:'900',color:ink}}>Watch Themes</Text>
  <View style={[card,{alignItems:'center',gap:8}]}>
   {current===null?<ActivityIndicator color={active.color}/>:<><WatchMock theme={active}/><Text style={{fontSize:20,fontWeight:'900',color:ink}}>{active.name}</Text>
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name="sync-outline" size={14} color={active.color}/><Text style={{color:muted,fontSize:12}}>Syncs to your watch automatically</Text></View></>}
  </View>
  <View style={[card,{gap:14}]}><Text style={{fontWeight:'900',color:ink,fontSize:16}}>MoodPals Themes</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:16}}>{WATCH_THEMES.map(t=>{const on=t.id===current;return <TouchableOpacity key={t.id} onPress={()=>setSelected(t)} accessibilityRole="button" accessibilityLabel={t.name+(on?', in use':'')} style={{width:'31%',alignItems:'center',gap:6}}>
    <View style={{borderWidth:3,borderColor:on?t.color:'transparent',borderRadius:46,padding:2}}><Face theme={t} mood="Calm" size={78}/></View>
    {on?<View style={{position:'absolute',top:62,right:12,backgroundColor:t.color,borderRadius:10,width:20,height:20,alignItems:'center',justifyContent:'center'}}><Ionicons name="checkmark" size={14} color="#fff"/></View>:null}
    <Text style={{fontWeight:'800',color:ink,fontSize:13}}>{t.name}</Text></TouchableOpacity>})}{Array.from({length:(3-WATCH_THEMES.length%3)%3}).map((_,i)=><View key={'pad'+i} style={{width:'31%'}}/>)}</View>
   <Text style={{color:muted,fontSize:12}}>More characters are coming soon.</Text>
  </View>
 </View>;
}
