import React,{useEffect,useState} from 'react';
import {View,Text,TouchableOpacity,ActivityIndicator,Alert,StyleSheet} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import {supabase} from './supabase';

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});
const TIMES=[{hour:8,name:'8 AM'},{hour:9,name:'9 AM'},{hour:12,name:'12 PM'},{hour:18,name:'6 PM'},{hour:21,name:'9 PM'}];
const prefs={enabled:false,hour:9,minute:0};
export default function WellnessReminders(){
 const [enabled,setEnabled]=useState(false),[hour,setHour]=useState(9);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [account,setAccount]=useState<string|null>(null);
 const storageKey=(id:string)=>'superdots-reminder-'+id;
 useEffect(()=>{let mounted=true;(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('Please sign in');
 const {data,error}=await supabase.from('user_settings').select('daily_reminders_enabled,daily_reminder_hour').eq('user_id',user.id).maybeSingle();if(error)throw error;
 const notificationId=await AsyncStorage.getItem(storageKey(user.id));
 const scheduled=notificationId?(await Notifications.getAllScheduledNotificationsAsync()).some(n=>n.identifier===notificationId):false;
 if(mounted){setAccount(user.id);setHour(Number(data?.daily_reminder_hour??9));setEnabled(scheduled);}
 }catch(e:any){Alert.alert('Reminders unavailable',e?.message||'Please retry')}finally{if(mounted)setLoading(false)}})();return()=>{mounted=false}},[]);
 async function apply(shouldEnable:boolean,nextHour=hour){
  if(!account)return;
  setBusy(true);try{
   if(shouldEnable){const permission=await Notifications.getPermissionsAsync();
    if(!permission.granted){const requested=await Notifications.requestPermissionsAsync();if(!requested.granted)throw Error('Notifications were not allowed. Enable them in iPhone Settings.');}
   }
   const previous=await AsyncStorage.getItem(storageKey(account));
   let nextId:string|null=null;
   if(shouldEnable){
    nextId=await Notifications.scheduleNotificationAsync({
     content:{title:'A moment for you 💜',body:'How are you feeling today? Your Superdot is here for a quick check-in.',data:{screen:'Actions'},sound:false},
     trigger:{type:Notifications.SchedulableTriggerInputTypes.DAILY,hour:nextHour,minute:0}
    });
   }
   const {error}=await supabase.from('user_settings').update({daily_reminders_enabled:shouldEnable,daily_reminder_hour:nextHour,daily_reminder_minute:0}).eq('user_id',account);
   if(error){if(nextId)await Notifications.cancelScheduledNotificationAsync(nextId);throw error;}
   if(previous)await Notifications.cancelScheduledNotificationAsync(previous);
   if(nextId)await AsyncStorage.setItem(storageKey(account),nextId);else await AsyncStorage.removeItem(storageKey(account));
   setEnabled(shouldEnable);setHour(nextHour);
  }catch(e:any){Alert.alert('Could not update reminders',e?.message||'Please try again')}finally{setBusy(false)}
 }
 return <View style={s.root}><Text style={s.title}>Gentle daily reminders</Text><Text style={s.sub}>Schedule a local iPhone notification to check in with your Superdot. It won't send your health readings in a notification.</Text>
 {loading?<ActivityIndicator color="#7139E9"/>:<><TouchableOpacity disabled={busy} onPress={()=>void apply(!enabled)} style={s.toggle}><View style={{flex:1,gap:4}}><Text style={s.name}>Daily wellness check-in</Text><Text style={s.sub}>{enabled?'Scheduled on this device':'Off on this device'}</Text></View><Ionicons name={enabled?'notifications':'notifications-off-outline'} size={26} color={enabled?'#3BA986':'#A99FC0'}/></TouchableOpacity>
 <Text style={s.name}>Reminder time</Text><View style={s.grid}>{TIMES.map(t=><TouchableOpacity key={t.hour} disabled={busy} onPress={()=>void apply(enabled,t.hour)} style={[s.chip,{backgroundColor:hour===t.hour?'#7139E9':'#F1EBFD'}]}><Text style={{color:hour===t.hour?'#fff':'#5D4199',fontWeight:'800'}}>{t.name}</Text></TouchableOpacity>)}</View>
 <Text style={s.foot}>{enabled?'A reminder is scheduled every day at '+TIMES.find(x=>x.hour===hour)?.name+'.':'Enable reminders to schedule daily check-ins.'} Times follow your phone's local time.</Text>
 {busy?<ActivityIndicator color="#7139E9"/>:null}</>}
 </View>
}
const s=StyleSheet.create({root:{backgroundColor:'#fff',borderRadius:23,padding:18,gap:16},title:{fontSize:20,color:'#25145C',fontWeight:'900'},name:{fontSize:15,color:'#25145C',fontWeight:'800'},sub:{color:'#8276A5',fontSize:12,lineHeight:18},toggle:{borderWidth:1,borderColor:'#EEE8FA',borderRadius:16,padding:15,flexDirection:'row',alignItems:'center'},grid:{flexDirection:'row',flexWrap:'wrap',gap:9},chip:{padding:11,borderRadius:15},foot:{color:'#8276A5',fontSize:11,lineHeight:16}});
