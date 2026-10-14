import React,{useEffect,useRef,useState} from 'react';
import {Text,TouchableOpacity,Alert,Modal,View,StyleSheet,ActivityIndicator} from 'react-native';
import * as Speech from 'expo-speech';
import Ionicons from '@expo/vector-icons/Ionicons';
import {ExpoSpeechRecognitionModule,useSpeechRecognitionEvent} from 'expo-speech-recognition';
export default function VoiceRecognition({color,busy,onResult,onSubmit}:{color:string;busy:boolean;onResult:(text:string)=>void;onSubmit:(text:string)=>Promise<void>}){
 const transcriptRef=useRef(''),voiceRequested=useRef(false),sendingVoice=useRef(false);
 const [listening,setListening]=useState(false),[voiceStatus,setVoiceStatus]=useState('');
 const [open,setOpen]=useState(false);
 const [lastVoiceError,setLastVoiceError]=useState('');
 const voiceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function clearVoiceTimer(){if(voiceTimer.current){clearTimeout(voiceTimer.current);voiceTimer.current=null;}}
 useSpeechRecognitionEvent('start',()=>{clearVoiceTimer();setListening(true);setVoiceStatus('Listening… talk naturally. Tap Finish when done.');});
 useSpeechRecognitionEvent('result',event=>{const transcript=event.results?.[0]?.transcript?.trim()||'';if(transcript){transcriptRef.current=transcript;onResult(transcript);setVoiceStatus('Heard: '+transcript.slice(0,100));}});
 useSpeechRecognitionEvent('end',()=>{clearVoiceTimer();setListening(false);if(!voiceRequested.current)return;voiceRequested.current=false;const said=transcriptRef.current.trim();if(said&&!sendingVoice.current){sendingVoice.current=true;void onSubmit(said).finally(()=>{sendingVoice.current=false;setVoiceStatus('Ready to talk again')})}else setVoiceStatus('No speech detected. Tap again.');});
 useSpeechRecognitionEvent('error',event=>{clearVoiceTimer();voiceRequested.current=false;setListening(false);setLastVoiceError(event.message||String(event.error||'Speech recognition unavailable'));});
 async function beginListening(){
 if(busy)return;
 if(listening){setVoiceStatus('Finishing…');ExpoSpeechRecognitionModule.stop();return;}
 try{setOpen(true);Speech.stop();transcriptRef.current='';setLastVoiceError('');setVoiceStatus('Checking permissions…');
 const permission=await ExpoSpeechRecognitionModule.requestPermissionsAsync();
 if(!permission.granted){Alert.alert('Microphone permission needed','Enable Microphone and Speech Recognition in iOS settings.');return;}
 voiceRequested.current=true;setListening(true);setVoiceStatus('Starting speech recognition…');
 ExpoSpeechRecognitionModule.start({lang:'en-US',continuous:false,interimResults:true,requiresOnDeviceRecognition:false});
 voiceTimer.current=setTimeout(()=>{if(voiceRequested.current&&!transcriptRef.current)setVoiceStatus('No words detected. Check microphone input or tap Finish.')},7000);
 }catch(e:any){clearVoiceTimer();voiceRequested.current=false;setListening(false);setLastVoiceError(e?.message||'Speech recognition unavailable.');}}
 useEffect(()=>()=>{clearVoiceTimer();voiceRequested.current=false;ExpoSpeechRecognitionModule.stop();Speech.stop()},[]);
 return <>
 <TouchableOpacity accessibilityRole="button" accessibilityLabel="Talk to Superdots" disabled={busy} onPress={()=>void beginListening()} style={styles.launch}><Text style={styles.launchText}>✦  Talk to Superdots</Text></TouchableOpacity>
 <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>{voiceRequested.current=false;ExpoSpeechRecognitionModule.stop();setOpen(false)}}>
  <View style={styles.screen}>
   <TouchableOpacity style={styles.close} onPress={()=>{voiceRequested.current=false;ExpoSpeechRecognitionModule.stop();Speech.stop();setOpen(false)}}><Text style={styles.closeText}>✕  Close</Text></TouchableOpacity>
   <View style={styles.center}><Text style={styles.eyebrow}>SUPERDOTS VOICE</Text><View style={[styles.orb,{backgroundColor:listening?'#8351F6':'#B7A2F3'}]}><Text style={styles.orbIcon}>{listening?'◉':'✦'}</Text></View>
   <Text style={styles.headline}>{busy?'Thinking…':listening?'I’m listening':'Your Superdot is here'}</Text>
   <Text style={styles.status}>{lastVoiceError||voiceStatus||'Tap the microphone to start talking.'}</Text>
   {busy?<ActivityIndicator color="#7139E9" size="large"/>:null}
   </View>
   <TouchableOpacity disabled={busy} style={styles.micButton} onPress={()=>void beginListening()}><Text style={styles.micText}>{listening?'■  Finish':'🎙  Talk'}</Text></TouchableOpacity>
   <Text style={styles.foot}>Your words are transcribed and sent to your private Gemini conversation.</Text>
  </View>
 </Modal>
 </>;
}
const styles=StyleSheet.create({launch:{backgroundColor:'#7139E9',padding:16,borderRadius:20,alignItems:'center',flex:1},launchText:{color:'#fff',fontWeight:'900',fontSize:15},screen:{flex:1,backgroundColor:'#F8F4FF',padding:25,paddingTop:70},close:{alignSelf:'flex-start',padding:8},closeText:{fontWeight:'800',color:'#5C428C'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:28},eyebrow:{color:'#8D75C6',fontSize:12,fontWeight:'900',letterSpacing:3},orb:{height:190,width:190,borderRadius:100,alignItems:'center',justifyContent:'center',shadowColor:'#7139E9',shadowOpacity:0.35,shadowRadius:28,shadowOffset:{width:0,height:6}},orbIcon:{fontSize:80,color:'#fff'},headline:{fontSize:26,fontWeight:'900',textAlign:'center',color:'#25145C'},status:{fontSize:15,lineHeight:23,color:'#75669C',textAlign:'center'},micButton:{backgroundColor:'#7139E9',borderRadius:30,padding:21,alignItems:'center'},micText:{color:'#fff',fontSize:19,fontWeight:'900'},foot:{textAlign:'center',color:'#9387AA',fontSize:11,marginTop:17,marginBottom:15}});
