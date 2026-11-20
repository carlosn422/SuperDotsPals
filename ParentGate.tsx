import React,{useCallback,useRef,useState} from 'react';
import {Alert,Modal,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {APP_THEME as T} from './MoodMascot';
import {checkParentCode,parentFaceID,parentUnlockState,setParentUnlock} from './modules/watch-link/screenBreak';

const red='#D65B79';

// Parent check before Screen Break apps reopen on this iPhone: Face ID only, or a MoodPals code that
// switches to Face ID after two wrong tries (enforced natively, so closing the app doesn't reset it).
export function useParentGate(){
 const [ask,setAsk]=useState<{reason:string}|null>(null),[code,setCode]=useState(''),[note,setNote]=useState('');
 const pending=useRef<((ok:boolean)=>void)|null>(null);
 const finish=(ok:boolean)=>{const r=pending.current;pending.current=null;setAsk(null);setCode('');r?.(ok)};
 const gate=useCallback(async(reason:string):Promise<boolean>=>{
  const s=parentUnlockState();
  if(!s)return true;
  if(s.method==='code'&&s.hasCode&&!s.faceIdOnly)return new Promise<boolean>(resolve=>{pending.current=resolve;setNote('');setCode('');setAsk({reason})});
  return parentFaceID(reason);
 },[]);
 function enter(next:string){
  const digits=next.replace(/\D/g,'').slice(0,4);
  setCode(digits);
  if(digits.length<4||!ask)return;
  const result=checkParentCode(digits);
  if(result==='ok'){void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);finish(true);return}
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  if(result==='wrong'){setCode('');setNote('Wrong code. One more try, then Face ID is required.');return}
  const reason=ask.reason,resolve=pending.current;pending.current=null;setAsk(null);setCode('');
  setTimeout(()=>{void parentFaceID(reason).then(ok=>resolve?.(ok))},350);
 }
 const element=<Modal visible={!!ask} transparent animationType="fade" onRequestClose={()=>finish(false)}>
  <View style={g.backdrop}>
   <View style={g.card}>
    <Ionicons name="lock-closed" size={30} color={T.primary}/>
    <Text style={g.title}>Enter your MoodPals code</Text>
    <Text style={g.sub}>{ask?.reason}</Text>
    <View style={g.dots}>{[0,1,2,3].map(i=><View key={i} style={[g.dot,i<code.length&&{backgroundColor:T.primary}]}/>)}</View>
    <TextInput value={code} onChangeText={enter} autoFocus keyboardType="number-pad" secureTextEntry maxLength={4} textContentType="oneTimeCode" style={g.hidden} accessibilityLabel="MoodPals code"/>
    {note?<Text style={[g.sub,{color:red}]}>{note}</Text>:null}
    <TouchableOpacity accessibilityRole="button" onPress={()=>finish(false)} style={g.cancel}><Text style={g.cancelText}>Cancel</Text></TouchableOpacity>
   </View>
  </View>
 </Modal>;
 return {gate,element};
}

/// "Unlock with" setting for the Family screen. Changing it needs the current parent check first.
export function ParentUnlockSettings(){
 const {gate,element}=useParentGate();
 const [state,setState]=useState(()=>parentUnlockState());
 const [setting,setSetting]=useState(false),[first,setFirst]=useState(''),[code,setCode]=useState(''),[note,setNote]=useState('');
 if(!state)return null;
 const faceLabel=state.biometry==='touchID'?'Touch ID':'Face ID';
 async function choose(method:'faceID'|'code'){
  if(method==='faceID'&&state!.method==='faceID')return;
  if(!await gate('Change how Screen Break unlocks'))return;
  if(method==='faceID'){setParentUnlock('faceID');setState(parentUnlockState());return}
  setFirst('');setCode('');setNote('');setSetting(true);
 }
 function enter(next:string){
  const digits=next.replace(/\D/g,'').slice(0,4);
  setCode(digits);
  if(digits.length<4)return;
  if(!first){setFirst(digits);setCode('');setNote('');return}
  if(digits!==first){void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);setFirst('');setCode('');setNote("Codes didn't match. Try again.");return}
  if(setParentUnlock('code',digits)){setSetting(false);setState(parentUnlockState());void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
  else Alert.alert('Unable to save the code','Please try again.');
 }
 return <View style={g.settings}>
  <Text style={g.heading}>Unlock with</Text>
  <Text style={g.sub}>Needed to unlock apps, release or cancel a break, or add time on this iPhone.</Text>
  <View style={{flexDirection:'row',gap:8}}>
   {([['faceID',faceLabel,state.biometry==='touchID'?'finger-print':'scan'],['code','MoodPals code','keypad']] as const).map(([m,label,icon])=>{const on=state.method===m;return <TouchableOpacity key={m} accessibilityRole="radio" accessibilityState={{selected:on}} onPress={()=>void choose(m)} style={[g.chip,on&&g.chipOn]}>
    <Ionicons name={icon} size={18} color={on?'#fff':T.ink}/><Text style={[g.chipText,on&&{color:'#fff'}]}>{label}</Text>
   </TouchableOpacity>})}
  </View>
  {state.method==='code'?<Text style={g.sub}>Two wrong codes switch to {faceLabel} only. Tap MoodPals code to change it.</Text>:<Text style={g.sub}>{state.biometry==='none'?'This iPhone has no Face ID, so its passcode is used.':`Only ${faceLabel}; the phone passcode won't work.`}</Text>}
  {element}
  <Modal visible={setting} transparent animationType="fade" onRequestClose={()=>setSetting(false)}>
   <View style={g.backdrop}>
    <View style={g.card}>
     <Ionicons name="keypad" size={30} color={T.primary}/>
     <Text style={g.title}>{first?'Enter it again':'Choose a 4-digit code'}</Text>
     <Text style={g.sub}>Use a code your family doesn't know. It's different from your iPhone passcode.</Text>
     <View style={g.dots}>{[0,1,2,3].map(i=><View key={i} style={[g.dot,i<code.length&&{backgroundColor:T.primary}]}/>)}</View>
     <TextInput value={code} onChangeText={enter} autoFocus keyboardType="number-pad" secureTextEntry maxLength={4} textContentType="oneTimeCode" style={g.hidden} accessibilityLabel="New MoodPals code"/>
     {note?<Text style={[g.sub,{color:red}]}>{note}</Text>:null}
     <TouchableOpacity accessibilityRole="button" onPress={()=>setSetting(false)} style={g.cancel}><Text style={g.cancelText}>Cancel</Text></TouchableOpacity>
    </View>
   </View>
  </Modal>
 </View>;
}

const g=StyleSheet.create({
 backdrop:{flex:1,backgroundColor:'rgba(29,43,51,0.45)',justifyContent:'center',padding:28},
 card:{backgroundColor:'#fff',borderRadius:28,padding:24,gap:12,alignItems:'center'},
 title:{fontSize:20,fontWeight:'900',color:T.ink,textAlign:'center'},
 heading:{fontSize:17,fontWeight:'900',color:T.ink},
 sub:{fontSize:13,fontWeight:'600',color:T.muted,textAlign:'center'},
 dots:{flexDirection:'row',gap:16,marginVertical:8},
 dot:{width:16,height:16,borderRadius:8,borderWidth:2,borderColor:T.primary},
 hidden:{position:'absolute',opacity:0,width:1,height:1},
 cancel:{paddingVertical:10,paddingHorizontal:24},
 cancelText:{fontSize:15,fontWeight:'800',color:T.muted},
 settings:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:T.border},
 chip:{flex:1,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',borderRadius:18,borderWidth:1.5,borderColor:T.border,paddingVertical:12},
 chipOn:{backgroundColor:T.primary,borderColor:T.primary},
 chipText:{fontSize:14,fontWeight:'800',color:T.ink},
});
