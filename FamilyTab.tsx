import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Switch,StyleSheet} from 'react-native';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {useFamilyProfiles,ManageFamilyProfile,familyProfilesChanged,MASCOT_ID,type FamilyProfile} from './FamilyWatches';

type MoodRow={mood:string;occurred_at:string};
type Reaction={id:string;mood:string;reactor_name:string;emoji:string;reacted_at:string};
type Group={id:string;name:string;allowed_moods:string[]};
const purple='#6953CA',red='#C64F67',ink='#271C49';

function FamilyCard({profile,groups,onManage}:{profile:FamilyProfile;groups:Group[];onManage:()=>void}){
 const [moods,setMoods]=useState<MoodRow[]>([]),[reactions,setReactions]=useState<Reaction[]>([]),[shared,setShared]=useState<string[]>([]);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{
  const [m,r,g]=await Promise.all([
   supabase.rpc('family_profile_moods',{p_profile:profile.id,p_limit:6}),
   supabase.rpc('family_profile_reactions',{p_profile:profile.id,p_limit:10}),
   supabase.from('family_profile_groups').select('group_id').eq('profile_user_id',profile.id)]);
  setLoaded(true);
  if(m.error||r.error||g.error){setError('Unable to load this family watch.');return;}
  setError('');setMoods((m.data as MoodRow[])||[]);setReactions((r.data as Reaction[])||[]);
  setShared(((g.data||[]) as {group_id:string}[]).map(x=>x.group_id));
 },[profile.id]);
 useEffect(()=>{void load();const t=setInterval(()=>{void load()},30000);return()=>clearInterval(t)},[load,profile.moodAt]);
 const toggle=async(id:string,on:boolean)=>{
  setBusy(id);setError('');
  const {error:e}=on?await supabase.from('family_profile_groups').insert({profile_user_id:profile.id,group_id:id})
   :await supabase.from('family_profile_groups').delete().eq('profile_user_id',profile.id).eq('group_id',id);
  if(e)setError('Unable to update sharing.');else setShared(s=>on?[...s,id]:s.filter(x=>x!==id));
  setBusy(null);
 };
 const latest=moods[0];
 return <View style={styles.card}>
  <View style={{alignItems:'center',gap:4}}>
   {latest?<SuperdotMascot id={MASCOT_ID[latest.mood.toLowerCase()]||'joy'} size={110}/>:null}
   <Text style={styles.title}>{profile.name}</Text>
   <Text style={styles.sub}>{latest?latest.mood+' · '+new Date(latest.occurred_at).toLocaleString():loaded?'No mood yet':'Loading…'}</Text>
   {moods.length>1?<Text style={styles.sub}>Earlier: {moods.slice(1).map(m=>m.mood).join(', ')}</Text>:null}
  </View>
  {error?<Text style={[styles.sub,{color:red}]}>{error}</Text>:null}
  <Text style={styles.heading}>Reactions</Text>
  {reactions.length?reactions.map(r=><Text key={r.id} style={styles.sub}>{r.emoji} {r.reactor_name} · to {r.mood.toLowerCase()} · {new Date(r.reacted_at).toLocaleString()}</Text>)
   :<Text style={styles.sub}>No reactions yet.</Text>}
  <Text style={styles.heading}>Shares with</Text>
  <Text style={styles.sub}>Moods picked on the watch notify everyone checked here.</Text>
  <View style={styles.row}><Text style={styles.rowTitle}>You</Text><Switch value disabled accessibilityLabel="You, always notified"/></View>
  {groups.map(g=><View key={g.id} style={styles.row}>
   <View style={{flex:1}}><Text style={styles.rowTitle}>{g.name}</Text><Text style={styles.sub}>{(g.allowed_moods||[]).join(', ')||'No moods allowed'}</Text></View>
   {busy===g.id?<ActivityIndicator color={purple}/>:<Switch value={shared.includes(g.id)} onValueChange={on=>void toggle(g.id,on)} trackColor={{true:purple}} accessibilityLabel={'Share with '+g.name}/>}
  </View>)}
  {groups.length===0?<Text style={styles.sub}>Create groups in Circle to share with more people.</Text>:null}
  <TouchableOpacity onPress={onManage} accessibilityRole="button" accessibilityLabel={'Manage '+profile.name}><Text style={{color:purple,fontWeight:'800'}}>Manage / Remove ›</Text></TouchableOpacity>
 </View>;
}

export default function FamilyTab({onAdd}:{onAdd:()=>void}){
 const {profiles,slots,loading,error,load}=useFamilyProfiles();
 const [groups,setGroups]=useState<Group[]>([]),[managing,setManaging]=useState<FamilyProfile|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{void supabase.from('circle_groups').select('id,name,allowed_moods').order('created_at').then(({data})=>setGroups((data as Group[])||[]))},[profiles.length]);
 return <View style={{gap:14}}>
  <Text style={[styles.title,{fontSize:28}]}>Family</Text>
  <Text style={styles.sub}>Mood-only Apple Watches linked under your account. {profiles.length}/{slots} used.</Text>
  {notice?<Text style={[styles.sub,{color:'#2E8B57',fontWeight:'700'}]}>{notice}</Text>:null}
  {error?<Text style={[styles.sub,{color:red}]}>{error}</Text>:null}
  {loading&&profiles.length===0?<ActivityIndicator color={purple}/>:null}
  {!loading&&profiles.length===0&&!error?<View style={[styles.card,{alignItems:'center'}]}>
   <Text style={styles.heading}>No family watches yet</Text>
   <Text style={[styles.sub,{textAlign:'center'}]}>Open MoodPals on a watch set up with Family Setup, then scan its QR code.</Text>
   <TouchableOpacity style={styles.button} onPress={onAdd} accessibilityRole="button"><Text style={{color:'white',fontWeight:'800'}}>Add a family watch</Text></TouchableOpacity>
  </View>:null}
  {profiles.map(p=><FamilyCard key={p.id} profile={p} groups={groups} onManage={()=>{setNotice('');setManaging(p)}}/>)}
  {managing?<ManageFamilyProfile profile={managing} onClose={()=>setManaging(null)} onDeleted={async()=>{setManaging(null);await load();familyProfilesChanged();setNotice(managing.name+' was permanently removed.')}}/>:null}
 </View>;
}

const styles=StyleSheet.create({
 card:{backgroundColor:'white',borderRadius:22,padding:16,gap:8,borderWidth:1,borderColor:'#ECE6F7'},
 title:{fontWeight:'900',fontSize:20,color:'#251C45'},
 heading:{fontWeight:'800',color:ink,marginTop:6},
 sub:{fontSize:12,lineHeight:18,color:'#807694'},
 row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:4},
 rowTitle:{fontWeight:'700',color:ink},
 button:{backgroundColor:purple,borderRadius:16,paddingVertical:12,paddingHorizontal:20,marginTop:6},
});
