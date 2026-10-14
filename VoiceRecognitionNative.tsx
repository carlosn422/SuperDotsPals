import React,{useEffect,useRef,useState} from 'react';
import {Text,TouchableOpacity,Alert} from 'react-native';
import * as Speech from 'expo-speech';
import Ionicons from '@expo/vector-icons/Ionicons';
import {ExpoSpeechRecognitionModule,useSpeechRecognitionEvent} from 'expo-speech-recognition';
export default function VoiceRecognition({color,busy,onResult,onSubmit}:{color:string;busy:boolean;onResult:(text:string)=>void;onSubmit:(text:string)=>Promise<void>}){
 const transcriptRef=useRef(''),voiceRequested=useRef(false),sendingVoice=useRef(false);
 const [listening,setListening]=useState(false),[voiceStatus,setVoiceStatus]=useState('');
 const [lastVoiceError,setLastVoiceError]=useState('');
 const voiceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function clearVoiceTimer(){if(voiceTimer.current){clearTimeout(voiceTimer.current);voiceTimer.current=null;}}
 useSpeechRecognitionEvent('start',()=>{clearVoiceTimer();setListening(true);setVoiceStatus('Listening… talk naturally. Tap Finish when done.');});
 useSpeechRecognitionEvent('result',event=>{const transcript=event.results?.[0]?.transcript?.trim()||'';if(transcript){transcriptRef.current=transcript;onResult(transcript);setVoiceStatus('Heard: '+transcript.slice(0,100));}});
 useSpeechRecognitionEvent('end',()=>{clearVoiceTimer();setListening(false);if(!voiceRequested.current)return;voiceRequested.current=false;const said=transcriptRef.current.trim();if(said&&!sendingVoice.current){sendingVoice.current=true;void onSubmit(said).finally(()=>{sendingVoice.current=false})}else setVoiceStatus('No speech detected. Tap again.');});
 useSpeechRecognitionEvent('error',event=>{clearVoiceTimer();voiceRequested.current=false;setListening(false);setLastVoiceError(event.message||String(event.error||'Speech recognition unavailable'));});
 async function beginListening(){
 if(busy)return;
 if(listening){setVoiceStatus('Finishing…');ExpoSpeechRecognitionModule.stop();return;}
 try{Speech.stop();transcriptRef.current='';setLastVoiceError('');setVoiceStatus('Checking permissions…');
 const permission=await ExpoSpeechRecognitionModule.requestPermissionsAsync();
 if(!permission.granted){Alert.alert('Microphone permission needed','Enable Microphone and Speech Recognition in iOS settings.');return;}
 voiceRequested.current=true;setListening(true);setVoiceStatus('Starting speech recognition…');
 ExpoSpeechRecognitionModule.start({lang:'en-US',continuous:false,interimResults:true,requiresOnDeviceRecognition:false});
 voiceTimer.current=setTimeout(()=>{if(voiceRequested.current&&!transcriptRef.current)setVoiceStatus('No words detected. Check microphone input or tap Finish.')},7000);
 }catch(e:any){clearVoiceTimer();voiceRequested.current=false;setListening(false);setLastVoiceError(e?.message||'Speech recognition unavailable.');}}
 useEffect(()=>()=>{clearVoiceTimer();voiceRequested.current=false;ExpoSpeechRecognitionModule.stop();Speech.stop()},[]);
 return <><TouchableOpacity accessibilityRole="button" accessibilityLabel={listening?'Finish recording':'Start voice conversation'} disabled={busy} onPress={()=>void beginListening()} style={{backgroundColor:listening?'#E76B8A':color,borderRadius:15,padding:14,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:7,flex:1}}><Ionicons name={listening?'stop-circle':'mic'} size={19} color="#fff"/><Text style={{color:'#fff',fontWeight:'800'}}>{listening?'Finish':'Talk'}</Text></TouchableOpacity>{lastVoiceError?<Text style={{color:'#C34567',fontSize:11}}>{lastVoiceError}</Text>:null}</>;
}
