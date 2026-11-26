import React,{useEffect,useRef,useState} from 'react';
import {Modal,View,Text,TouchableOpacity,StyleSheet,Animated,Easing,ActivityIndicator} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {AudioContext,AudioRecorder,AudioManager} from 'react-native-audio-api';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {APP_THEME} from './MoodMascot';
import {usePlus} from './PlusStore';
import {useReduceMotion} from './CircleComponents';

export type VoiceGender='female'|'male';
export const VOICE_DEMOS:Record<VoiceGender,number>={female:require('./assets/voice/demo-female.m4a'),male:require('./assets/voice/demo-male.m4a')};
const WS='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
type Phase='connecting'|'listening'|'speaking'|'ended'|'error';
type Saved={id:string;summary:string};

export async function loadVoiceGender():Promise<VoiceGender>{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return 'female';
 const {data}=await supabase.from('user_settings').select('voice_gender').eq('user_id',user.id).maybeSingle();
 return data?.voice_gender==='male'?'male':'female';
}

// Plays a bundled demo clip; returns a stop function.
export async function playVoiceDemo(g:VoiceGender,onEnd:()=>void){
 const ctx=new AudioContext();
 try{
  const buf=await ctx.decodeAudioData(VOICE_DEMOS[g]);
  const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);
  src.onended=()=>{onEnd();void ctx.close()};src.start();
  return ()=>{try{src.stop()}catch{}};
 }catch{onEnd();void ctx.close();return ()=>{}}
}

function toBase64(f:Float32Array){
 const bytes=new Uint8Array(f.length*2);
 for(let i=0;i<f.length;i++){const v=Math.max(-1,Math.min(1,f[i]))*0x7fff|0;bytes[i*2]=v&255;bytes[i*2+1]=(v>>8)&255}
 let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,Array.from(bytes.subarray(i,i+0x8000)));
 return btoa(s);
}

export default function VoiceFriend({visible,onClose,companion='calm'}:{visible:boolean;onClose:()=>void;companion?:string}){
 const {showPaywall}=usePlus();
 const reduce=useReduceMotion();
 const [phase,setPhase]=useState<Phase>('connecting'),[caption,setCaption]=useState(''),[muted,setMuted]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const mutedRef=useRef(false);mutedRef.current=muted;
 const interruptRef=useRef<()=>void>(()=>{});
 const pulse=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(phase!=='speaking'||reduce){pulse.setValue(0);return}
  const a=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true})]));
  a.start();return()=>a.stop()},[phase,reduce]);

 useEffect(()=>{if(!visible)return;
  let alive=true,ws:WebSocket|null=null,ctx:AudioContext|null=null,recorder:AudioRecorder|null=null,timer:any=null,decoding=Promise.resolve(),turn=0,playEnd=0,lastChunk=0,hangup:any=null,callId:string|null=null,callStart=0;
  const use={inText:0,inAudio:0,outText:0,outAudio:0};
  const add=(d:any[]|undefined,into:'in'|'out')=>{for(const x of d||[]){const n=Number(x?.tokenCount)||0;if(x?.modality==='AUDIO')use[into==='in'?'inAudio':'outAudio']+=n;else use[into==='in'?'inText':'outText']+=n}};
  setPhase('connecting');setCaption('');setError('');setSaved(null);setMuted(false);
  const fail=(m:string)=>{if(!alive)return;setError(m);setPhase('error')};
  (async()=>{
   try{
    if(await AudioManager.requestRecordingPermissions()!=='Granted')return fail('Allow the microphone for MoodPals in iPhone Settings to talk with your pal.');
    const gender=await loadVoiceGender();
    const {data,error:fnError}=await supabase.functions.invoke('voice-live-token',{body:{voice:gender}});
    if(fnError){let msg='Could not start the call. Please try again.';try{const d=await (fnError as any).context?.json?.();if(d?.code==='plus_required'){onClose();showPaywall('reflections');return}if(d?.error)msg=d.error}catch{}return fail(msg)}
    if(!alive||!data?.token)return;
    callId=data.callId||null;callStart=Date.now();
    AudioManager.setSystemOptions({ios:{category:'playAndRecord',mode:'voiceChat',options:['defaultToSpeaker','allowBluetoothHFP']}});
    await AudioManager.setAudioSessionActivity(true);
    ctx=new AudioContext({sampleRate:24000});
    const queue=ctx.createBufferQueueSource();queue.connect(ctx.destination);queue.start();
    interruptRef.current=()=>{turn++;queue.clearBuffers();playEnd=0;setPhase('listening')};
    ws=new WebSocket(WS+encodeURIComponent(data.token));
    ws.onopen=()=>ws?.send(JSON.stringify({setup:{model:'models/'+data.model}}));
    ws.onclose=()=>{if(alive)setPhase(p=>p==='error'?p:'ended')};
    ws.onerror=()=>fail('The call dropped. Check your connection and try again.');
    ws.onmessage=async e=>{
     const m=JSON.parse(typeof e.data==='string'?e.data:await new Response(e.data as any).text());
     if(m.setupComplete){
      recorder=new AudioRecorder({iosVoiceProcessing:true});
      recorder.onAudioReady({sampleRate:16000,bufferLength:1600,channelCount:1},({buffer,numFrames})=>{
       // The mic stays closed while the pal talks (plus a short tail) so it never hears itself.
       if(mutedRef.current||ws?.readyState!==1||!ctx||ctx.currentTime<playEnd+0.35)return;
       ws.send(JSON.stringify({realtimeInput:{audio:{data:toBase64(buffer.getChannelData(0).subarray(0,numFrames)),mimeType:'audio/pcm;rate=16000'}}}));
      });
      await recorder.start();
      ws?.send(JSON.stringify({realtimeInput:{text:'(The call just started. Greet me warmly in one short sentence and ask how my day was.)'}}));
      setPhase('listening');
      timer=setTimeout(()=>{ws?.close()},(data.maxMinutes||10)*60000);
     }
     const sc=m.serverContent;
     if(sc){
      if(sc.interrupted){turn++;queue.clearBuffers();playEnd=0;setPhase('listening')}
      const id=turn;
      for(const p of sc.modelTurn?.parts||[])if(p.inlineData?.data){
       const chunk=p.inlineData.data;lastChunk=Date.now();setPhase('speaking');
       decoding=decoding.then(async()=>{if(id!==turn||!ctx)return;const b=await ctx.decodePCMInBase64(chunk,24000,1);if(id===turn&&ctx){queue.enqueueBuffer(b);playEnd=Math.max(playEnd,ctx.currentTime)+b.duration}}).catch(()=>{});
      }
      if(sc.inputTranscription?.text)setCaption('');
      if(sc.outputTranscription?.text)setCaption(c=>(c+sc.outputTranscription.text).slice(-220));
      if(sc.turnComplete)setTimeout(()=>{if(alive)setPhase(p=>p==='speaking'?'listening':p)},400);
     }
     if(m.toolCall){
      const responses=await Promise.all((m.toolCall.functionCalls||[]).map(async(f:any)=>{
       if(f.name==='end_call'){
        // Hang up once the goodbye has finished playing, like a real call.
        const started=Date.now();
        if(!hangup)hangup=setInterval(()=>{if(!alive||!ctx)return;const idle=Date.now()-lastChunk>900&&ctx.currentTime>playEnd+0.4;if(idle||Date.now()-started>10000){clearInterval(hangup);void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);onClose()}},250);
        return {id:f.id,name:f.name,response:{result:'hanging up'}};
       }
       if(f.name!=='save_journal_entry')return {id:f.id,name:f.name,response:{error:'unknown tool'}};
       try{
        const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('signed out');
        const summary=String(f.args?.summary||'').trim().slice(0,2000);if(!summary)throw Error('empty');
        const {data:row,error}=await supabase.from('wellness_journal').insert({user_id:user.id,body:summary,entry_type:'reflection',mood:f.args?.mood||null,stress_factors:[]}).select('id').single();
        if(error)throw error;if(alive)setSaved({id:row.id,summary});
        return {id:f.id,name:f.name,response:{result:'saved for today'}};
       }catch{return {id:f.id,name:f.name,response:{error:'could not save'}}}
      }));
      ws?.send(JSON.stringify({toolResponse:{functionResponses:responses}}));
     }
     if(m.usageMetadata){add(m.usageMetadata.promptTokensDetails,'in');add(m.usageMetadata.responseTokensDetails,'out');use.outText+=Number(m.usageMetadata.thoughtsTokenCount)||0}
     if(m.goAway)setTimeout(()=>ws?.close(),1000);
    };
   }catch(e:any){fail(e?.message||'Could not start the call.')}
  })();
  return()=>{alive=false;clearTimeout(timer);clearInterval(hangup);
   if(callId)void supabase.rpc('finish_voice_call',{p_call_id:callId,p_seconds:Math.round((Date.now()-callStart)/1000),p_input_text:use.inText,p_input_audio:use.inAudio,p_output_text:use.outText,p_output_audio:use.outAudio});try{recorder?.clearOnAudioReady();void recorder?.stop()}catch{}try{ws?.close()}catch{}void ctx?.close().catch(()=>{});void AudioManager.setAudioSessionActivity(false).catch(()=>{})};
 },[visible]);

 async function undo(){if(!saved)return;const id=saved.id;setSaved(null);await supabase.from('wellness_journal').delete().eq('id',id)}
 const status=phase==='connecting'?'Calling your pal…':phase==='speaking'?'Speaking':phase==='listening'?(muted?'Muted':'Listening'):phase==='ended'?'Call ended':'';
 const scale=pulse.interpolate({inputRange:[0,1],outputRange:[1,1.12]});
 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  <View style={st.root}>
   <Text style={st.status} accessibilityLiveRegion="polite">{status}</Text>
   <TouchableOpacity activeOpacity={0.85} disabled={phase!=='speaking'} accessibilityRole="button" accessibilityLabel="Interrupt your pal" onPress={()=>interruptRef.current()} style={st.stage}>
    <Animated.View style={[st.ring,{transform:[{scale}]}]}/>
    <SuperdotMascot id={companion} size={170}/>
   </TouchableOpacity>
   <Text style={[st.note,{opacity:phase==='speaking'?1:0}]}>Tap your pal to jump in</Text>
   {phase==='connecting'?<ActivityIndicator color={APP_THEME.primary}/>:null}
   {error?<Text style={st.error}>{error}</Text>:<Text style={st.caption} numberOfLines={4}>{caption}</Text>}
   {saved?<View style={st.saved} accessible accessibilityLabel={'Logged for today: '+saved.summary}>
    <Ionicons name="book" size={20} color="#8A63D2"/>
    <View style={{flex:1}}><Text style={st.savedTitle}>Logged for today</Text><Text style={st.savedBody} numberOfLines={2}>{saved.summary}</Text></View>
    <TouchableOpacity accessibilityRole="button" onPress={()=>void undo()} style={st.undo}><Text style={st.undoText}>Undo</Text></TouchableOpacity>
   </View>:null}
   <View style={st.controls}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={muted?'Unmute':'Mute'} disabled={phase!=='listening'&&phase!=='speaking'} onPress={()=>setMuted(m=>!m)} style={[st.round,{backgroundColor:muted?APP_THEME.ink:'#fff'}]}>
     <Ionicons name={muted?'mic-off':'mic'} size={28} color={muted?'#fff':APP_THEME.ink}/>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="End call" onPress={onClose} style={[st.round,st.end]}>
     <Ionicons name="call" size={30} color="#fff" style={{transform:[{rotate:'135deg'}]}}/>
    </TouchableOpacity>
   </View>
   <Text style={st.note}>Your MoodPal is a caring friend, not a therapist. In a crisis in the US, call or text 988.</Text>
  </View>
 </Modal>;
}
const st=StyleSheet.create({
 root:{flex:1,backgroundColor:APP_THEME.primarySoft,alignItems:'center',paddingTop:90,paddingBottom:40,paddingHorizontal:24,gap:18},
 status:{fontSize:15,fontWeight:'800',color:APP_THEME.primary,letterSpacing:0.4},
 stage:{width:240,height:240,alignItems:'center',justifyContent:'center'},
 ring:{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'#fff',opacity:0.7},
 caption:{fontSize:18,lineHeight:25,fontWeight:'700',color:APP_THEME.ink,textAlign:'center',minHeight:100},
 error:{fontSize:15,color:'#C2546B',textAlign:'center',minHeight:100},
 saved:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#F4EBFF',borderRadius:18,padding:12,alignSelf:'stretch'},
 savedTitle:{fontSize:14,fontWeight:'900',color:'#8A63D2'},savedBody:{fontSize:12,color:APP_THEME.muted,marginTop:2},
 undo:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:12,paddingVertical:7},undoText:{fontSize:13,fontWeight:'800',color:'#8A63D2'},
 controls:{flexDirection:'row',justifyContent:'space-between',alignSelf:'stretch',marginTop:'auto',paddingHorizontal:30},
 round:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',shadowColor:'#2D4A3E',shadowOpacity:0.12,shadowRadius:10,shadowOffset:{width:0,height:4}},
 end:{backgroundColor:'#E5484D'},
 note:{fontSize:11,color:APP_THEME.muted,textAlign:'center'},
});
