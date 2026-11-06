import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Text,TouchableOpacity,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {supabase} from './supabase';
import {usePlus} from './PlusStore';

type Group={id:string;name:string;icon:string;color:string;is_default:boolean;circle_group_members:{member_id:string}[]};
const green='#34B37E',ink='#1D2B33',muted='#6E7D86';

// Which Circle group receives moods picked on this watch. Friends by default; other groups need Plus.
export default function WatchShareGroup({kind,id}:{kind:'watch'|'family';id:string}){
 const {isPlus,showPaywall}=usePlus();
 const [groups,setGroups]=useState<Group[]>([]),[current,setCurrent]=useState<string|null>(null),[saving,setSaving]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{let on=true;(async()=>{
  const [g,c]=await Promise.all([
   supabase.from('circle_groups').select('id,name,icon,color,is_default,circle_group_members(member_id)').order('is_default',{ascending:false}).order('created_at'),
   kind==='watch'?supabase.rpc('watch_share_groups'):supabase.from('family_profile_groups').select('group_id').eq('profile_user_id',id)]);
  if(!on)return;
  if(g.error||c.error){setError('Couldn’t load your groups.');return;}
  setGroups((g.data as any)||[]);
  const rows=(c.data as any[])||[];
  setCurrent(kind==='watch'?rows.find(r=>r.device_id===id)?.group_id||null:rows[0]?.group_id||null);
 })();return()=>{on=false}},[kind,id]);
 async function pick(g:Group){
  if(g.id===current||saving)return;
  if(!g.is_default&&!isPlus){showPaywall('circles');return;}
  const prev=current;setCurrent(g.id);setSaving(g.id);setError('');
  const {error:e}=kind==='watch'?await supabase.rpc('watch_set_share_group',{p_device:id,p_group:g.id}):await supabase.rpc('family_set_share_group',{p_profile:id,p_group:g.id});
  if(e){setCurrent(prev);setError(e.message||'Couldn’t save. Try again.');}
  setSaving(null);
 }
 return <View style={{backgroundColor:'#fff',borderRadius:22,padding:16,gap:6}}>
  <Text accessibilityRole="header" style={{fontSize:16,fontWeight:'900',color:ink}}>Mood updates go to</Text>
  <Text style={{fontSize:12,color:muted,lineHeight:17}}>Moods picked on this watch are shared with this group.</Text>
  {!groups.length&&!error?<ActivityIndicator color={green} style={{marginVertical:10}}/>:null}
  {groups.map(g=>{const on=g.id===current;const locked=!g.is_default&&!isPlus;const n=g.circle_group_members?.length||0;
   return <TouchableOpacity key={g.id} onPress={()=>void pick(g)} accessibilityRole="radio" accessibilityState={{selected:on}} accessibilityLabel={g.name+(locked?', requires Plus':'')}
    style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,borderTopWidth:1,borderTopColor:'#EEF3F0'}}>
    <View style={{width:38,height:38,borderRadius:13,backgroundColor:(g.color||green)+'22',alignItems:'center',justifyContent:'center'}}><Ionicons name={(g.icon||'people') as any} size={19} color={g.color||green}/></View>
    <View style={{flex:1}}><Text style={{fontWeight:'800',color:ink,fontSize:14}}>{g.name}</Text><Text style={{fontSize:11,color:muted}}>{n} {n===1?'member':'members'}{g.is_default?' · Default':''}</Text></View>
    {locked?<View style={{backgroundColor:'#F1EAFF',borderRadius:10,paddingHorizontal:8,paddingVertical:3}}><Text style={{fontSize:11,fontWeight:'900',color:'#7139E9'}}>Plus</Text></View>
     :saving===g.id?<ActivityIndicator color={green}/>:<Ionicons name={on?'checkmark-circle':'ellipse-outline'} size={24} color={on?green:'#C9D2CE'}/>}
   </TouchableOpacity>})}
  {error?<Text style={{fontSize:12,color:'#C64F67',fontWeight:'700'}}>{error}</Text>:null}
 </View>;
}
