import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,View,Text,TouchableOpacity,TextInput,ActivityIndicator,Modal,StyleSheet,ScrollView,Animated,Easing,PanResponder,Pressable,useWindowDimensions} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import {usePlus} from './PlusStore';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';

export type FamilyProfile={id:string;name:string;createdAt:string;lastSeenAt:string|null;connected:boolean;mood:string|null;moodAt:string|null};
const purple='#6953CA',red='#C64F67';
// Every mounted Family Watches list reloads when any screen adds or removes a profile.
const listeners=new Set<()=>void>();
export function familyProfilesChanged(){listeners.forEach(l=>l())}
const DELETED_ITEMS=['Linked profile information','Mood history and mood events','Emoji reactions from this profile','Profile-specific notifications','Assigned Circle recipients','Watch pairing and sign-in credentials','Other data owned by this profile'];

export async function familyCall(action:string,extra:Record<string,unknown>={}){
 const {data,error}=await supabase.functions.invoke('family-profiles',{body:{action,...extra}});
 if(error||data?.error){
  let message=data?.error;
  try{message=message||(await (error as any)?.context?.json())?.error}catch{}
  throw Error(message||'Request failed. Check your connection and try again.');
 }
 return data;
}

export function useFamilyProfiles(enabled=true){
 const [profiles,setProfiles]=useState<FamilyProfile[]>([]),[slots,setSlots]=useState(1),[loading,setLoading]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const d=await familyCall('list');setProfiles(d.profiles||[]);setSlots(d.slots||1);setLoaded(true)}
  catch(e:any){setError(e.message)}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  void load();
  const reload=()=>{void load()};
  listeners.add(reload);
  const appState=AppState.addEventListener('change',st=>{if(st==='active')reload()});
  return()=>{listeners.delete(reload);appState.remove()};
 },[load,enabled]);
 return {profiles,slots,loading,error,load,loaded};
}

// Family Watches section shown under Connected devices.
export default function FamilyWatches({reloadKey}:{reloadKey:number}){
 const {profiles,slots,loading,error,load}=useFamilyProfiles();
 const [managing,setManaging]=useState<FamilyProfile|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{if(reloadKey)void load()},[reloadKey,load]);
 return <View style={{gap:10}}>
  <Text style={styles.title}>Family Watches</Text>
  <Text style={styles.sub}>Apple Watches set up with Family Setup link as their own mood-only profile under your account. Open MoodPals on the family watch and scan its QR code above. {profiles.length}/{slots} used.</Text>
  {notice?<Text style={[styles.sub,{color:'#2E8B57',fontWeight:'700'}]}>{notice}</Text>:null}
  {error?<Text style={[styles.sub,{color:red}]}>{error}</Text>:null}
  {loading&&profiles.length===0?<ActivityIndicator color={purple}/>:null}
  {!loading&&profiles.length===0&&!error?<Text style={styles.sub}>No family watches yet.</Text>:null}
  {profiles.map(p=><TouchableOpacity key={p.id} style={styles.card} onPress={()=>{setNotice('');setManaging(p)}} accessibilityLabel={'Manage '+p.name}>
   <Text style={{fontWeight:'800',color:'#271C49'}}>{p.name}</Text>
   <Text style={styles.sub}>Mood-only · {p.mood?p.mood+' · ':''}{p.lastSeenAt?'Last seen '+new Date(p.lastSeenAt).toLocaleString():'Added '+new Date(p.createdAt).toLocaleDateString()}</Text>
   <Text style={{color:purple,fontWeight:'800'}}>Manage ›</Text>
  </TouchableOpacity>)}
  {managing?<ManageFamilyProfile profile={managing} onClose={()=>setManaging(null)} onDeleted={async()=>{setManaging(null);await load();familyProfilesChanged();setNotice(managing.name+' was permanently removed.')}}/>:null}
 </View>;
}

export function ManageFamilyProfile({profile,onClose,onDeleted}:{profile:FamilyProfile;onClose:()=>void;onDeleted:()=>void|Promise<void>}){
 const [confirming,setConfirming]=useState(false),[typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(){
  if(typed!=='DELETE'||busy)return;
  setBusy(true);setError('');
  try{
   const d=await familyCall('remove',{profileId:profile.id,confirm:'DELETE'});
   if(d?.deleted!==true)throw Error('Removal was not confirmed. Try again.');
   await onDeleted();
  }catch(e:any){setError(e.message)}
  finally{setBusy(false)}
 }
 return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={busy?undefined:onClose}>
  <ScrollView contentContainerStyle={{padding:22,gap:14}}>
   <TouchableOpacity disabled={busy} onPress={onClose}><Text style={{color:purple,fontWeight:'800'}}>‹ Back</Text></TouchableOpacity>
   <Text style={styles.title}>{profile.name}</Text>
   <View style={styles.card}>
    <Text style={styles.sub}>Mood-only family profile. No heart rate, HRV, sleep, activity or other Health data is collected.</Text>
    <Text style={styles.sub}>Latest mood: {profile.mood?profile.mood+' · '+new Date(profile.moodAt||'').toLocaleString():'none yet'}</Text>
    <Text style={styles.sub}>Watch: {profile.connected?'linked':'not linked'}{profile.lastSeenAt?' · last seen '+new Date(profile.lastSeenAt).toLocaleString():''}</Text>
   </View>
   {!confirming?<TouchableOpacity style={[styles.button,{backgroundColor:red}]} onPress={()=>setConfirming(true)}><Text style={styles.buttonText}>Remove Linked Profile</Text></TouchableOpacity>:
   <View style={[styles.card,{borderColor:'#F1C7D0'}]}>
    <Text style={{fontWeight:'900',color:red}}>Permanently remove {profile.name}?</Text>
    <Text style={styles.sub}>The watch is signed out first. Then this MoodPals data is permanently deleted:</Text>
    {DELETED_ITEMS.map(i=><Text key={i} style={styles.sub}>• {i}</Text>)}
    <Text style={styles.sub}>Your account, your own data, your other family watches and your Circle friends' accounts are not affected. Copies in MoodPals database backups can't be removed immediately and are erased when those backups expire. Purchases and subscriptions stay with your account.</Text>
    <Text style={[styles.sub,{fontWeight:'700'}]}>Type DELETE to confirm.</Text>
    <TextInput value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" editable={!busy} style={styles.input} accessibilityLabel="Type DELETE to confirm"/>
    {error?<Text style={[styles.sub,{color:red}]}>{error}</Text>:null}
    <TouchableOpacity disabled={typed!=='DELETE'||busy} style={[styles.button,{backgroundColor:red,opacity:typed==='DELETE'&&!busy?1:0.45}]} onPress={()=>void remove()}>
     {busy?<ActivityIndicator color="white"/>:<Text style={styles.buttonText}>Permanently Remove</Text>}
    </TouchableOpacity>
    <TouchableOpacity disabled={busy} onPress={()=>{setConfirming(false);setTyped('');setError('')}}><Text style={{color:purple,fontWeight:'800',textAlign:'center'}}>Cancel</Text></TouchableOpacity>
   </View>}
  </ScrollView>
 </Modal>;
}

function ProfileSelector({focused,profiles,selected,lastLinked,onPick,open,setOpen,onAdd,full}:{focused:boolean;profiles:FamilyProfile[];selected:string|null;lastLinked:string|null;onPick:(id:string|null)=>void;open:boolean;setOpen:(o:boolean)=>void;onAdd?:()=>void;full:boolean}){
 const many=profiles.length>1;
 const linked=profiles.find(p=>p.id===selected)||profiles.find(p=>p.id===lastLinked)||profiles[0];
 const anchor=useRef<View>(null),[top,setTop]=useState(0);
 const show=()=>{anchor.current?.measureInWindow((_x,y,_w,h)=>{setTop(y+h+6);setOpen(true)})};
 const swipe=useRef(PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_e,g)=>g.dy>8&&Math.abs(g.dy)>Math.abs(g.dx)*1.5,
  onPanResponderTerminationRequest:()=>false,
  onPanResponderRelease:(_e,g)=>{if(g.dy>24)setTimeout(()=>showRef.current(),350)},
 })).current;
 const showRef=useRef(show);showRef.current=show;
 const seg=(id:string|null,name:string,label:string)=>{
  const on=selected===id;
  return <TouchableOpacity key={id||'you'} onPress={()=>onPick(id)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:on}} style={[sel.seg,id===null&&{flexShrink:0},on&&sel.segOn]}>
   <ScrollOnceText text={name} active={on&&focused} style={[sel.segText,on&&{color:'white'}]}/>
  </TouchableOpacity>;
 };
 return <>
  <View ref={anchor} collapsable={false} {...(many?swipe.panHandlers:{})} style={sel.bar}>
   {seg(null,'You','You, my profile')}
   {seg(linked.id,shortProfileName(linked.name),shortProfileName(linked.name)+', mood-only family watch')}
   {many?<TouchableOpacity onPress={show} accessibilityRole="button" accessibilityLabel="Show all profiles" hitSlop={{top:8,bottom:8,left:4,right:8}} style={sel.arrow}>
    <Ionicons name="chevron-down" size={18} color="#271C49"/>
   </TouchableOpacity>:null}
  </View>
  {many?<ProfileList visible={open} top={top} profiles={profiles} selected={selected} onClose={()=>setOpen(false)} onPick={id=>{setOpen(false);onPick(id)}} onAdd={onAdd} full={full}/>:null}
 </>;
}

// Names wider than their slot scroll to the end once when selected (and each time Today is shown), hold 3s, then return to the start.
function ScrollOnceText({text,active,style}:{text:string;active:boolean;style:any}){
 const [w,setW]=useState(0),[cw,setCw]=useState(0);
 const x=useRef(new Animated.Value(0)).current;
 const over=w-cw;
 useEffect(()=>{
  x.stopAnimation();x.setValue(0);
  if(!active||over<=1||cw===0)return;
  const run=Animated.sequence([Animated.delay(500),Animated.timing(x,{toValue:-over,duration:Math.max(800,over*28),easing:Easing.linear,useNativeDriver:true}),Animated.delay(3000),Animated.timing(x,{toValue:0,duration:350,easing:Easing.out(Easing.cubic),useNativeDriver:true})]);
  run.start();
  return()=>run.stop();
 },[active,text,over>1,cw]);
 return <View style={{flexShrink:1,overflow:"hidden",height:22,width:w||undefined,minWidth:w?0:24}} onLayout={e=>setCw(e.nativeEvent.layout.width)} accessible={false}>
  <Animated.View style={{position:'absolute',left:0,top:0,width:4000,flexDirection:'row',transform:[{translateX:x}]}}>
   <Text onLayout={e=>setW(Math.ceil(e.nativeEvent.layout.width))} style={[style,{lineHeight:22}]}>{text}</Text>
  </Animated.View>
 </View>;
}

function ProfileList({visible,top,profiles,selected,onClose,onPick,onAdd,full}:{visible:boolean;top:number;profiles:FamilyProfile[];selected:string|null;onClose:()=>void;onPick:(id:string|null)=>void;onAdd?:()=>void;full:boolean}){
 const {height}=useWindowDimensions();
 const y=useRef(new Animated.Value(-24)).current,fade=useRef(new Animated.Value(0)).current;
 const closing=useRef(false),[mounted,setMounted]=useState(false);
 useEffect(()=>{
  if(!visible){if(mounted)dismissRef.current();return;}
  closing.current=false;setMounted(true);y.setValue(-24);fade.setValue(0);
  Animated.parallel([Animated.timing(y,{toValue:0,duration:240,easing:Easing.out(Easing.cubic),useNativeDriver:true}),Animated.timing(fade,{toValue:1,duration:240,useNativeDriver:true})]).start();
 },[visible]);
 const dismiss=(after?:()=>void)=>{
  if(closing.current)return;closing.current=true;
  Animated.parallel([Animated.timing(y,{toValue:-24,duration:200,easing:Easing.in(Easing.cubic),useNativeDriver:true}),Animated.timing(fade,{toValue:0,duration:200,useNativeDriver:true})]).start(()=>{setMounted(false);onClose();after?.()});
 };
 const dismissRef=useRef(dismiss);dismissRef.current=dismiss;
 const pan=useRef(PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_e,g)=>g.dy<-8&&Math.abs(g.dy)>Math.abs(g.dx),
  onPanResponderTerminationRequest:()=>false,
  onPanResponderMove:(_e,g)=>{if(g.dy<0&&!closing.current)y.setValue(Math.max(g.dy,-80))},
  onPanResponderRelease:(_e,g)=>{if(g.dy<-40||g.vy<-0.6)dismissRef.current();else Animated.spring(y,{toValue:0,bounciness:0,useNativeDriver:true}).start()},
  onPanResponderTerminate:()=>{if(!closing.current)Animated.spring(y,{toValue:0,bounciness:0,useNativeDriver:true}).start()},
 })).current;
 const rows=[{id:null as string|null,name:'You',sub:'My Profile'},...profiles.map(p=>({id:p.id as string|null,name:shortProfileName(p.name),sub:'Mood only · '+p.name}))];
 return <Modal visible={mounted} transparent animationType="none" onRequestClose={()=>dismiss()}>
  <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(22,16,44,0.25)',opacity:fade}]}>
   <Pressable style={{flex:1}} accessibilityRole="button" accessibilityLabel="Close profile list" onPress={()=>dismiss()}/>
  </Animated.View>
  <Animated.View {...pan.panHandlers} accessibilityViewIsModal style={[sel.panel,{top,maxHeight:Math.max(220,height-top-40),opacity:fade,transform:[{translateY:y}]}]}>
   <Text style={styles.title} accessibilityRole="header">Switch Profile</Text>
   <ScrollView style={{marginTop:8}} contentContainerStyle={{gap:6}} bounces={false}>
    {rows.map(r=>{const on=r.id===selected;return <TouchableOpacity key={r.id||'you'} onPress={()=>dismiss(()=>onPick(r.id))} accessibilityRole="button" accessibilityLabel={r.name+', '+r.sub} accessibilityState={{selected:on}} style={[sel.row,on&&sel.rowOn]}>
     <View style={{flex:1}}><Text numberOfLines={2} style={sel.rowName}>{r.name}</Text><Text numberOfLines={2} style={styles.sub}>{r.sub}</Text></View>
     {on?<Ionicons name="checkmark-circle" size={22} color={purple}/>:null}
    </TouchableOpacity>})}
    {onAdd?<TouchableOpacity onPress={()=>dismiss(onAdd)} disabled={full} accessibilityRole="button" style={[sel.add,full&&{opacity:0.5}]}>
     <Text style={{color:purple,fontWeight:'800'}}>{full?'All family watch slots used':'+ Add a Family Watch'}</Text>
    </TouchableOpacity>:null}
   </ScrollView>
  </Animated.View>
 </Modal>;
}

const sel=StyleSheet.create({
 bar:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',maxWidth:'100%',backgroundColor:'white',borderRadius:22,borderWidth:1,borderColor:'#E6E0F2',padding:4},
 seg:{flexShrink:1,minWidth:0,flexDirection:'row',alignItems:'center',minHeight:36,paddingHorizontal:16,borderRadius:18},
 segOn:{backgroundColor:purple},
 segText:{fontWeight:'800',fontSize:15,color:'#271C49'},
 arrow:{flexShrink:0,width:32,height:36,alignItems:'center',justifyContent:'center'},
 panel:{position:'absolute',left:16,right:16,backgroundColor:'white',borderRadius:24,padding:16,shadowColor:'#1E2A26',shadowOpacity:0.15,shadowRadius:18,shadowOffset:{width:0,height:6},elevation:10},
 row:{flexDirection:'row',alignItems:'center',gap:10,minHeight:56,paddingHorizontal:14,paddingVertical:8,borderRadius:16,backgroundColor:'#F7F5FB'},
 rowOn:{backgroundColor:'#EEE9FB'},
 rowName:{fontWeight:'800',fontSize:15,color:'#271C49'},
 add:{minHeight:48,borderRadius:16,backgroundColor:'#EEE9FB',alignItems:'center',justifyContent:'center',marginTop:4},
});

const styles=StyleSheet.create({title:{fontWeight:'900',fontSize:20,color:'#251C45'},sub:{fontSize:12,lineHeight:19,color:'#807694'},button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'white',fontWeight:'900'},card:{backgroundColor:'white',borderRadius:16,padding:15,gap:8,borderWidth:1,borderColor:'#EDE9F3'},chip:{borderWidth:1,borderColor:'#E2DCEC',borderRadius:18,paddingHorizontal:14,paddingVertical:8,backgroundColor:'white'},input:{borderWidth:1,borderColor:'#E2DCEC',borderRadius:12,padding:12,fontWeight:'800',letterSpacing:2,color:'#271C49'}});

export const MASCOT_ID:Record<string,string>={joyful:'joy',calm:'disgust',disgust:'disgust',sad:'sadness',angry:'anger',anxious:'fear',tired:'tired'};
type MoodRow={mood:string;occurred_at:string};

// Today switcher: "Me" shows the normal Today screen; a family watch shows its moods read-only.
type ReactionRow={id:string;mood:string;reactor_name:string;emoji:string;reacted_at:string};
const SELECTED_KEY='moodpals.familySelectedProfile';
export function shortProfileName(name:string){return name.replace(/[’']s\s+Apple\s+Watch$/i,'').replace(/\s*Apple\s+Watch$/i,'').trim()||name}

export function FamilySwitcher({children,disabled=false,onAdd,focused=true}:{children:React.ReactNode;disabled?:boolean;onAdd?:()=>void;focused?:boolean}){
 const {profiles,slots,load,loaded}=useFamilyProfiles(!disabled);
 const {isPlus,showPaywall}=usePlus();
 const [selected,setSelectedState]=useState<string|null>(null),[moods,setMoods]=useState<MoodRow[]>([]),[reactions,setReactions]=useState<ReactionRow[]>([]),[tick,setTick]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [saved,setSaved]=useState<string|null|undefined>(undefined),[lastLinked,setLastLinked]=useState<string|null>(null),[listOpen,setListOpen]=useState(false);
 const profile=profiles.find(p=>p.id===selected)||null;
 const setSelected=(id:string|null)=>{setSelectedState(id);if(id)setLastLinked(id);void (id?AsyncStorage.setItem(SELECTED_KEY,id):AsyncStorage.removeItem(SELECTED_KEY))};
 useEffect(()=>{void AsyncStorage.getItem(SELECTED_KEY).then(v=>setSaved(v))},[]);
 useEffect(()=>{if(saved&&profiles.some(p=>p.id===saved)){setSelectedState(saved);setLastLinked(saved);setSaved(null)}},[profiles,saved]);
 useEffect(()=>{if(loaded&&selected&&!profiles.some(p=>p.id===selected))setSelected(null)},[profiles,selected,loaded]);
 useEffect(()=>{
  if(!selected)return;
  let live=true;setLoading(true);setError('');
  void Promise.all([
   supabase.rpc('family_profile_moods',{p_profile:selected,p_limit:20}),
   supabase.rpc('family_profile_reactions',{p_profile:selected,p_limit:20})]).then(([m,r])=>{
   if(!live)return;
   if(m.error||r.error)setError('Unable to load moods and reactions.');
   else{setMoods((m.data as MoodRow[])||[]);setReactions((r.data as ReactionRow[])||[])}
   setLoading(false);
  });
  return()=>{live=false};
 },[selected,tick]);
 useEffect(()=>{const sub=AppState.addEventListener('change',st=>{if(st==='active')setTick(t=>t+1)});return()=>sub.remove()},[]);
 if(disabled||profiles.length===0)return <>{children}</>;
 const latest=moods[0];
 const pick=(id:string|null)=>{setSelected(id);if(id)void load()};
 const plus=isPlus||slots>1,full=profiles.length>=slots;
 const add=onAdd?()=>{setListOpen(false);if(full){if(!plus)showPaywall('family')}else onAdd()}:undefined;
 return <View style={{gap:14}}>
  <ProfileSelector focused={focused} profiles={profiles} selected={selected} lastLinked={lastLinked} onPick={pick} open={listOpen} setOpen={setListOpen} onAdd={add} full={full&&plus}/>
  {!profile?children:<View style={{gap:12}}>
   <View style={[styles.card,{alignItems:'center'}]}>
    {latest?<SuperdotMascot id={MASCOT_ID[latest.mood.toLowerCase()]||'joy'} size={130}/>:null}
    <Text style={styles.title}>{latest?latest.mood:'No mood yet'}</Text>
    <Text style={styles.sub}>{profile.name}{latest?' · '+new Date(latest.occurred_at).toLocaleString():''}</Text>
    <Text style={styles.sub}>View only · Mood-only family watch</Text>
   </View>
   {loading?<ActivityIndicator color={purple}/>:null}
   {error?<Text style={[styles.sub,{color:red}]}>{error}</Text>:null}
   {moods.length>1?<View style={styles.card}>
    <Text style={{fontWeight:'800',color:'#271C49'}}>Recent moods</Text>
    {moods.slice(1).map(m=><Text key={m.occurred_at} style={styles.sub}>{m.mood} · {new Date(m.occurred_at).toLocaleString()}</Text>)}
   </View>:null}
   {!loading||reactions.length?<View style={styles.card}>
    <Text style={{fontWeight:'800',color:'#271C49'}}>Reactions</Text>
    {reactions.length?reactions.map(r=><Text key={r.id} style={styles.sub}>{r.emoji} {r.reactor_name} · to {r.mood.toLowerCase()} · {new Date(r.reacted_at).toLocaleString()}</Text>)
     :<Text style={styles.sub}>No reactions yet.</Text>}
   </View>:null}
  </View>}
 </View>;
}
