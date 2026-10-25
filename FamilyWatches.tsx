import React,{useCallback,useEffect,useState} from 'react';
import {AppState,View,Text,TouchableOpacity,TextInput,ActivityIndicator,Modal,StyleSheet,ScrollView} from 'react-native';
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
 const [profiles,setProfiles]=useState<FamilyProfile[]>([]),[slots,setSlots]=useState(1),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const d=await familyCall('list');setProfiles(d.profiles||[]);setSlots(d.slots||1)}
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
 return {profiles,slots,loading,error,load};
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

function ManageFamilyProfile({profile,onClose,onDeleted}:{profile:FamilyProfile;onClose:()=>void;onDeleted:()=>void|Promise<void>}){
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

const styles=StyleSheet.create({title:{fontWeight:'900',fontSize:20,color:'#251C45'},sub:{fontSize:12,lineHeight:19,color:'#807694'},button:{backgroundColor:purple,borderRadius:14,padding:14,alignItems:'center'},buttonText:{color:'white',fontWeight:'900'},card:{backgroundColor:'white',borderRadius:16,padding:15,gap:8,borderWidth:1,borderColor:'#EDE9F3'},chip:{borderWidth:1,borderColor:'#E2DCEC',borderRadius:18,paddingHorizontal:14,paddingVertical:8,backgroundColor:'white'},input:{borderWidth:1,borderColor:'#E2DCEC',borderRadius:12,padding:12,fontWeight:'800',letterSpacing:2,color:'#271C49'}});

const MASCOT_ID:Record<string,string>={joyful:'joy',calm:'disgust',disgust:'disgust',sad:'sadness',angry:'anger',anxious:'fear',tired:'tired'};
type MoodRow={mood:string;occurred_at:string};

// Today switcher: "Me" shows the normal Today screen; a family watch shows its moods read-only.
export function FamilySwitcher({children,disabled=false}:{children:React.ReactNode;disabled?:boolean}){
 const {profiles,load}=useFamilyProfiles(!disabled);
 const [selected,setSelected]=useState<string|null>(null),[moods,setMoods]=useState<MoodRow[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const profile=profiles.find(p=>p.id===selected)||null;
 useEffect(()=>{if(selected&&!profiles.some(p=>p.id===selected))setSelected(null)},[profiles,selected]);
 useEffect(()=>{
  if(!selected)return;
  let live=true;setLoading(true);setError('');
  void supabase.rpc('family_profile_moods',{p_profile:selected,p_limit:20}).then(({data,error})=>{
   if(!live)return;
   if(error)setError('Unable to load moods.');else setMoods((data as MoodRow[])||[]);
   setLoading(false);
  });
  return()=>{live=false};
 },[selected]);
 if(disabled||profiles.length===0)return <>{children}</>;
 const latest=moods[0];
 return <View style={{gap:14}}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
   {[{id:null as string|null,name:'Me'},...profiles.map(p=>({id:p.id as string|null,name:p.name}))].map(c=>{
    const on=c.id===selected;
    return <TouchableOpacity key={c.id||'me'} onPress={()=>{setSelected(c.id);if(c.id)void load()}} accessibilityRole="button" accessibilityState={{selected:on}} style={[styles.chip,on&&{backgroundColor:purple,borderColor:purple}]}>
     <Text style={{fontWeight:'800',color:on?'white':'#271C49'}}>{c.name}</Text>
    </TouchableOpacity>;
   })}
  </ScrollView>
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
  </View>}
 </View>;
}
