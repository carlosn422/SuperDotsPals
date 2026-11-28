import React,{useEffect,useRef,useState} from 'react';
import {Alert,AppState,Modal,View,Text,TouchableOpacity,StyleSheet,Animated,Easing,ActivityIndicator,Image} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {activateKeepAwakeAsync,deactivateKeepAwake} from 'expo-keep-awake';
import {AudioContext,AudioRecorder,AudioManager} from 'react-native-audio-api';
import {supabase} from './supabase';
import SuperdotMascot from './SuperdotMascot';
import {APP_THEME} from './MoodMascot';
import {MINUTE_PACKS,MinutePackId,usePlus} from './PlusStore';
import {useReduceMotion} from './CircleComponents';

export type VoiceGender='female'|'male';
export type VoicePalId='maya'|'lily'|'grace'|'leo'|'sam'|'max';
type VoicePal={id:VoicePalId;name:string;gender:VoiceGender;vibe:string;tint:string;photo:number;hello:number};
export const VOICE_PALS:VoicePal[]=[
 {id:'maya',name:'Maya',gender:'female',vibe:'Warm',tint:'#DDF5EA',photo:require('./assets/voice/pals/maya.jpg'),hello:require('./assets/voice/pals/maya.m4a')},
 {id:'lily',name:'Lily',gender:'female',vibe:'Bright',tint:'#FFE6D6',photo:require('./assets/voice/pals/lily.jpg'),hello:require('./assets/voice/pals/lily.m4a')},
 {id:'grace',name:'Grace',gender:'female',vibe:'Gentle',tint:'#ECE6FF',photo:require('./assets/voice/pals/grace.jpg'),hello:require('./assets/voice/pals/grace.m4a')},
 {id:'leo',name:'Leo',gender:'male',vibe:'Friendly',tint:'#DDEEFF',photo:require('./assets/voice/pals/leo.jpg'),hello:require('./assets/voice/pals/leo.m4a')},
 {id:'sam',name:'Sam',gender:'male',vibe:'Easy-going',tint:'#E3F1DC',photo:require('./assets/voice/pals/sam.jpg'),hello:require('./assets/voice/pals/sam.m4a')},
 {id:'max',name:'Max',gender:'male',vibe:'Upbeat',tint:'#FFF3CC',photo:require('./assets/voice/pals/max.jpg'),hello:require('./assets/voice/pals/max.m4a')},
];
export const voicePal=(id:VoicePalId)=>VOICE_PALS.find(p=>p.id===id)??VOICE_PALS[0];
const PAL_KEY='moodpals.voicePal';
const RING=require('./assets/voice/ring.m4a');
// Free users hear a recorded sample call (played from the app, no Gemini) that ends with a diary entry.
const SAMPLE_LINES:{who:'pal'|'you';text:string}[]=[
 {who:'pal',text:"Hey! I'm so glad you called. How was your day?"},
 {who:'you',text:"Honestly, kind of rough. My boss moved my deadline up, and I've been stressed all afternoon."},
 {who:'pal',text:"Oof, that's a lot to carry. What part is weighing on you the most?"},
 {who:'you',text:"I guess I'm worried I won't finish in time."},
 {who:'pal',text:"That makes sense. Want me to add this to your diary, so you can look back on it later?"},
 {who:'you',text:'Yes, please.'},
 {who:'pal',text:"Done. And maybe take a short walk tonight. You've earned a little break."}
];
const SAMPLE_DIARY="My boss moved my deadline up and I was stressed all afternoon. I'm worried I won't finish in time.";
const SAMPLE_CALLS:Record<VoicePalId,{clip:number;times:number[];end:number}>={
 maya:{clip:require('./assets/voice/samples/maya.m4a'),times:[0.0,3.83,9.96,14.96,17.97,22.72,25.01],end:29.82},
 lily:{clip:require('./assets/voice/samples/lily.m4a'),times:[0.0,4.15,10.6,15.43,18.3,23.21,25.28],end:29.9},
 grace:{clip:require('./assets/voice/samples/grace.m4a'),times:[0.0,3.52,10.53,15.56,18.5,23.4,25.23],end:30.02},
 leo:{clip:require('./assets/voice/samples/leo.m4a'),times:[0.0,3.48,10.1,14.51,18.06,22.27,24.58],end:28.89},
 sam:{clip:require('./assets/voice/samples/sam.m4a'),times:[0.0,3.38,10.0,14.49,17.71,22.08,24.29],end:28.49},
 max:{clip:require('./assets/voice/samples/max.m4a'),times:[0.0,3.67,10.24,15.05,17.83,22.69,25.27],end:29.88}
};

// Messages carry ~100 KB of base64 audio several times a second, so decode in bulk instead of
// growing a string one character at a time.
const decoder=typeof TextDecoder==='function'?new TextDecoder():null;
function utf8(b:Uint8Array){
 if(decoder)return decoder.decode(b);
 const u=new Uint16Array(b.length);let n=0;
 for(let i=0;i<b.length;){
  const c=b[i++];
  let cp=c<0x80?c:c<0xe0?((c&31)<<6)|(b[i++]&63):c<0xf0?((c&15)<<12)|((b[i++]&63)<<6)|(b[i++]&63):((c&7)<<18)|((b[i++]&63)<<12)|((b[i++]&63)<<6)|(b[i++]&63);
  if(cp>0xffff){cp-=0x10000;u[n++]=0xd800|(cp>>10);u[n++]=0xdc00|(cp&1023)}else u[n++]=cp;
 }
 let s='';
 for(let i=0;i<n;i+=0x2000)s+=String.fromCharCode.apply(null,u.subarray(i,Math.min(n,i+0x2000)) as any);
 return s;
}
const WS='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
type Phase='connecting'|'listening'|'speaking'|'ended'|'error';
type Saved={id:string;summary:string};

export async function loadVoiceGender():Promise<VoiceGender>{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return 'female';
 const {data}=await supabase.from('user_settings').select('voice_gender').eq('user_id',user.id).maybeSingle();
 return data?.voice_gender==='male'?'male':'female';
}

export async function loadVoicePal():Promise<VoicePalId>{
 const saved=await AsyncStorage.getItem(PAL_KEY).catch(()=>null);
 if(VOICE_PALS.some(p=>p.id===saved))return saved as VoicePalId;
 return (await loadVoiceGender())==='male'?'leo':'maya';
}
export async function saveVoicePal(id:VoicePalId){
 await AsyncStorage.setItem(PAL_KEY,id).catch(()=>{});
 const {data:{user}}=await supabase.auth.getUser();
 if(user)await supabase.from('user_settings').update({voice_gender:voicePal(id).gender}).eq('user_id',user.id);
}

// Plays a bundled clip on the speaker at media volume, like a call; returns a stop function.
// Previews, the ring and calls share one speaker setup so the volume buttons control them all the same way.
const SPEAKER={ios:{category:'playAndRecord' as const,mode:'default' as const,options:['defaultToSpeaker','allowBluetoothHFP','allowBluetoothA2DP'] as ('defaultToSpeaker'|'allowBluetoothHFP'|'allowBluetoothA2DP')[]}};
const VOICE_GAIN=1.25;

// One shared context plays every clip, so switching buddies or starting a sample never races a closing context.
let clipCtx:AudioContext|null=null,clipStop=()=>{},clipGen=0;
export async function playClip(clip:number,onEnd:()=>void){
 const gen=++clipGen;
 clipStop();
 AudioManager.setSystemOptions(SPEAKER);
 await AudioManager.setAudioSessionActivity(true).catch(()=>{});
 try{
  if(!clipCtx||clipCtx.state==='closed')clipCtx=new AudioContext();
  const ctx=clipCtx;
  if(ctx.state!=='running')await ctx.resume().catch(()=>{});
  const buf=await ctx.decodeAudioData(clip);
  if(gen!==clipGen){onEnd();return ()=>{}}
  const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);
  let done=false;
  const end=()=>{if(done)return;done=true;if(clipStop===stop)clipStop=()=>{};onEnd();if(clipGen===gen)void ctx.suspend().catch(()=>{})};
  const stop=()=>{if(done)return;try{src.stop()}catch{}end()};
  src.onended=end;clipStop=stop;src.start();
  return stop;
 }catch{onEnd();return ()=>{}}
}
const B64=Uint8Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',c=>c.charCodeAt(0));
let pcm=new Uint8Array(0),b64=new Uint8Array(0);
// Mic frames (10 a second) as base64 PCM16, reusing the same buffers for every frame.
function toBase64(f:Float32Array){
 const n=f.length*2;
 if(pcm.length!==n){pcm=new Uint8Array(n);b64=new Uint8Array(Math.ceil(n/3)*4)}
 for(let i=0;i<f.length;i++){const v=Math.max(-1,Math.min(1,f[i]))*0x7fff|0;pcm[i*2]=v&255;pcm[i*2+1]=(v>>8)&255}
 let o=0;
 for(let i=0;i<n;i+=3){
  const a=pcm[i],b=i+1<n?pcm[i+1]:0,c=i+2<n?pcm[i+2]:0;
  b64[o++]=B64[a>>2];b64[o++]=B64[((a&3)<<4)|(b>>4)];
  b64[o++]=i+1<n?B64[((b&15)<<2)|(c>>6)]:61;b64[o++]=i+2<n?B64[c&63]:61;
 }
 return String.fromCharCode.apply(null,b64 as any);
}
// The previous call's audio shutdown; the next call waits for it so the two never overlap.
let teardown:Promise<void>=Promise.resolve();

export default function VoiceFriend({visible,onClose,companion='calm',topic}:{visible:boolean;onClose:()=>void;companion?:string;topic?:string}){
 const {showPaywall,minutePrices,buyMinutes,isPlus,plusKnown}=usePlus();
 const sample=plusKnown&&!isPlus;
 const [sampleDone,setSampleDone]=useState(false),[speaker,setSpeaker]=useState(''),[palName,setPalName]=useState('');
 const [limit,setLimit]=useState<{cap:number;resetsAt?:string;left?:number}|null>(null),[low,setLow]=useState<{cap:number;left:number}|null>(null),[lowOk,setLowOk]=useState(false),[attempt,setAttempt]=useState(0),[pack,setPack]=useState<MinutePackId>('minutes_30'),[buying,setBuying]=useState(false);
 const reduce=useReduceMotion();
 useEffect(()=>{if(!visible)setLowOk(false)},[visible]);
 useEffect(()=>{if(!visible)return;void activateKeepAwakeAsync('voice-call').catch(()=>{});return()=>{void deactivateKeepAwake('voice-call').catch(()=>{})}},[visible]);
 const [phase,setPhase]=useState<Phase>('connecting'),[caption,setCaption]=useState(''),[muted,setMuted]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const mutedRef=useRef(false);mutedRef.current=muted;
 const interruptRef=useRef<()=>void>(()=>{});
 const pulse=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(phase!=='speaking'||reduce){pulse.setValue(0);return}
  const a=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:700,easing:Easing.inOut(Easing.ease),useNativeDriver:true})]));
  a.start();return()=>a.stop()},[phase,reduce]);

 useEffect(()=>{if(!visible)return;
  let alive=true,ws:WebSocket|null=null,ctx:AudioContext|null=null,recorder:AudioRecorder|null=null,timer:any=null,wrapT:any=null,byeT:any=null,silT:any=null,lastHeard=0,nudged=0,decoding=Promise.resolve(),turn=0,playEnd=0,lastChunk=0,hangup:any=null,callId:string|null=null,callStart=0;
  const use={inText:0,inAudio:0,outText:0,outAudio:0};
  // Reports the call's real length and tokens once, when the socket closes or the screen goes away.
  let finished=false;
  const finish=()=>{if(finished||!callId)return;finished=true;supabase.rpc('finish_voice_call',{p_call_id:callId,p_seconds:Math.round((Date.now()-callStart)/1000),p_input_text:use.inText,p_input_audio:use.inAudio,p_output_text:use.outText,p_output_audio:use.outAudio}).then(()=>{},()=>{})};
  let micStopped:Promise<unknown>=Promise.resolve();
  const stopMic=()=>{const r=recorder;recorder=null;if(!r)return;try{r.clearOnAudioReady()}catch{}micStopped=r.stop().catch(()=>{})};
  // Leaving the app hangs up, so Gemini never keeps running in the background.
  const appSub=AppState.addEventListener('change',st=>{if(st==='background'&&alive)onClose()});
  const add=(d:any[]|undefined,into:'in'|'out')=>{for(const x of d||[]){const n=Number(x?.tokenCount)||0;if(x?.modality==='AUDIO')use[into==='in'?'inAudio':'outAudio']+=n;else use[into==='in'?'inText':'outText']+=n}};
  setPhase('connecting');setCaption('');setError('');setSaved(null);setMuted(false);setLimit(null);setLow(null);setSampleDone(false);setSpeaker('');
  if(sample){
   // Captions and the ending run on the clock, so the sample always finishes even if an audio event is missed.
   let stop=()=>{},tick:any=null,ringT:any=null,endT:any=null;
   const clear=()=>{clearInterval(tick);clearTimeout(ringT);clearTimeout(endT)};
   (async()=>{
    const pal=voicePal(await loadVoicePal()),call=SAMPLE_CALLS[pal.id];
    if(!alive)return;setPalName(pal.name);
    let started=false,ended=false;
    const finish=()=>{if(ended||!alive)return;ended=true;clear();setSpeaker('');setCaption('');setSaved({id:'',summary:SAMPLE_DIARY});setSampleDone(true);setPhase('ended')};
    const begin=async()=>{
     if(started||!alive)return;started=true;clearTimeout(ringT);
     const start=Date.now();
     tick=setInterval(()=>{const t=(Date.now()-start)/1000;let i=0;while(i+1<call.times.length&&call.times[i+1]<=t)i++;const l=SAMPLE_LINES[i];setSpeaker(l.who==='pal'?pal.name:'You');setCaption(l.text);setPhase(l.who==='pal'?'speaking':'listening')},150);
     endT=setTimeout(finish,(call.end+1.5)*1000);
     stop=await playClip(call.clip,finish);
     if(!alive)stop();
    };
    ringT=setTimeout(()=>void begin(),3500);
    stop=await playClip(RING,()=>void begin());
    if(!alive)stop();
   })();
   return()=>{alive=false;clear();stop();appSub.remove()};
  }
  const fail=(m:string)=>{if(!alive)return;setError(m);setPhase('error')};
  (async()=>{
   try{
    if(await AudioManager.requestRecordingPermissions()!=='Granted')return fail('Allow the microphone for MoodPals in iPhone Settings to talk with your pal.');
    const pal=voicePal(await loadVoicePal());
    // About a minute or less to talk: let them choose before the call starts.
    if(!lowOk){const {data:mv}=await supabase.rpc('my_voice_minutes').single();const left=Number((mv as any)?.minutes_left);
     if(left>=1&&left<2){if(alive)setLow({cap:Number((mv as any)?.cap)||15,left});return}}
    if(!alive)return;
    const {data,error:fnError}=await supabase.functions.invoke('voice-live-token',{body:{voice:pal.gender,pal:pal.id}});
    if(fnError){let msg='Could not start the call. Please try again.';try{const d=await (fnError as any).context?.json?.();if(d?.code==='plus_required'){onClose();showPaywall('reflections');return}if(d?.code==='voice_limit'){if(alive){setLimit({cap:Number(d.cap)||15,resetsAt:d.resetsAt});setPhase('ended')}return}if(d?.error)msg=d.error}catch{}return fail(msg)}
    if(!alive||!data?.token)return;
    callId=data.callId||null;callStart=Date.now();
    await teardown;if(!alive)return;
    AudioManager.setSystemOptions(SPEAKER);
    await AudioManager.setAudioSessionActivity(true);
    if(!alive){void AudioManager.setAudioSessionActivity(false).catch(()=>{});return}
    ctx=new AudioContext({sampleRate:24000});
    // One soft ring while the call connects; the pal says hi when it ends.
    const ringCtx=ctx;let ringEnd=Date.now()+1900;
    playEnd=ctx.currentTime+1.9;
    void ringCtx.decodeAudioData(RING).then(buf=>{if(!alive)return;const src=ringCtx.createBufferSource();src.buffer=buf;src.connect(ringCtx.destination);src.start();ringEnd=Date.now()+buf.duration*1000;playEnd=Math.max(playEnd,ringCtx.currentTime+buf.duration)}).catch(()=>{});
    const queue=ctx.createBufferQueueSource(),voice=ctx.createGain();voice.gain.value=VOICE_GAIN;queue.connect(voice);voice.connect(ctx.destination);queue.start();
    interruptRef.current=()=>{turn++;queue.clearBuffers();playEnd=0;setPhase('listening')};
    ws=new WebSocket(WS+encodeURIComponent(data.token));
    ws.binaryType='arraybuffer';
    timer=setTimeout(()=>{ws?.close();fail('Could not connect. Please try again.')},15000);
    ws.onopen=()=>ws?.send(JSON.stringify({setup:{model:'models/'+data.model}}));
    ws.onclose=()=>{clearTimeout(timer);clearTimeout(wrapT);clearInterval(byeT);clearInterval(silT);stopMic();finish();if(alive)setPhase(p=>p==='error'?p:'ended')};
    ws.onerror=()=>fail('The call dropped. Check your connection and try again.');
    ws.onmessage=async e=>{
     const m=JSON.parse(typeof e.data==='string'?e.data:utf8(new Uint8Array(e.data as ArrayBuffer)));
     if(m.setupComplete){
      clearTimeout(timer);
      if(!alive)return;
      const mic=new AudioRecorder({iosVoiceProcessing:false});recorder=mic;
      mic.onAudioReady({sampleRate:16000,bufferLength:1600,channelCount:1},({buffer,numFrames})=>{
       // The mic stays closed while the pal talks (plus a short tail) so it never hears itself; that is why
       // voice processing is off: it moves the call to iOS call volume, out of step with previews and the ring.
       if(mutedRef.current||ws?.readyState!==1||!ctx||ctx.currentTime<playEnd+0.35)return;
       ws.send(JSON.stringify({realtimeInput:{audio:{data:toBase64(buffer.getChannelData(0).subarray(0,numFrames)),mimeType:'audio/pcm;rate=16000'}}}));
      });
      await mic.start();
      if(recorder!==mic){try{mic.clearOnAudioReady()}catch{}void mic.stop().catch(()=>{})}
      const hello=JSON.stringify({realtimeInput:{text:topic?`(The call just started. I tapped "${topic}". Greet me warmly in one short sentence and gently ask about it.)`:'(The call just started. Greet me warmly in one short sentence and ask how my day was.)'}});
      setTimeout(()=>{if(alive&&ws?.readyState===1)ws.send(hello)},Math.max(0,ringEnd-Date.now()-600));
      setPhase('listening');
      const total=(data.maxMinutes||5)*60000,quiet=()=>!!ctx&&Date.now()-lastChunk>900&&ctx.currentTime>playEnd+0.3;
      wrapT=setTimeout(()=>{if(ws?.readyState===1)ws.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:'(Note: time is almost up.)'}]}],turnComplete:false}}))},Math.max(0,total-60000));
      byeT=setTimeout(()=>{const at=Date.now();byeT=setInterval(()=>{if(!alive||ws?.readyState!==1||hangup){clearInterval(byeT);return}if(quiet()||Date.now()-at>8000){clearInterval(byeT);ws.send(JSON.stringify({realtimeInput:{text:'(Note: time is up.)'}}))}},400)},Math.max(0,total-20000));
      timer=setTimeout(()=>{ws?.close()},total+25000);
      // Long silence: check in once, then let them go kindly.
      lastHeard=Date.now();
      silT=setInterval(()=>{if(!alive||ws?.readyState!==1||hangup||mutedRef.current||!quiet()||nudged>=2)return;if(Date.now()-Math.max(lastHeard,lastChunk)<(nudged?15000:20000))return;nudged++;lastHeard=Date.now();ws.send(JSON.stringify({realtimeInput:{text:nudged===1?"(Note: they've been quiet.)":'(Note: still quiet.)'}}))},1000);
     }
     const sc=m.serverContent;
     if(sc){
      if(sc.interrupted){turn++;queue.clearBuffers();playEnd=0;setPhase('listening')}
      const id=turn;
      for(const p of sc.modelTurn?.parts||[])if(p.inlineData?.data){
       const chunk=p.inlineData.data;lastChunk=Date.now();setPhase('speaking');
       decoding=decoding.then(async()=>{if(id!==turn||!ctx)return;const b=await ctx.decodePCMInBase64(chunk,24000,1);if(id===turn&&ctx){queue.enqueueBuffer(b);playEnd=Math.max(playEnd,ctx.currentTime)+b.duration}}).catch(()=>{});
      }
      if(sc.inputTranscription?.text){setCaption('');lastHeard=Date.now();nudged=0}
      if(sc.outputTranscription?.text)setCaption(c=>(c+sc.outputTranscription.text).slice(-220));
      if(sc.turnComplete)setTimeout(()=>{if(alive)setPhase(p=>p==='speaking'?'listening':p)},400);
     }
     if(m.toolCall){
      const responses=await Promise.all((m.toolCall.functionCalls||[]).map(async(f:any)=>{
       if(f.name==='end_call'){
        // Hang up once the goodbye has finished playing, like a real call. The mic stops and the model
        // gets no tool response, so it has nothing to answer and can't say goodbye again.
        stopMic();
        const started=Date.now();
        if(!hangup)hangup=setInterval(()=>{if(!alive||!ctx)return;const idle=Date.now()-lastChunk>900&&ctx.currentTime>playEnd+0.4;if(idle||Date.now()-started>10000){clearInterval(hangup);void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);onClose()}},250);
        return null;
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
      const replies=responses.filter(Boolean);
      if(replies.length)ws?.send(JSON.stringify({toolResponse:{functionResponses:replies}}));
     }
     if(m.usageMetadata){add(m.usageMetadata.promptTokensDetails,'in');add(m.usageMetadata.responseTokensDetails,'out');use.outText+=Number(m.usageMetadata.thoughtsTokenCount)||0}
     if(m.goAway)setTimeout(()=>ws?.close(),1000);
    };
   }catch(e:any){fail(e?.message||'Could not start the call.')}
  })();
  return()=>{alive=false;clearTimeout(timer);clearTimeout(wrapT);clearInterval(byeT);clearInterval(silT);clearInterval(hangup);
   appSub.remove();finish();stopMic();try{ws?.close()}catch{}
   // Stop the mic, then the speaker, then release the audio session, in that order. Nothing touches
   // the audio context after this point.
   const c=ctx;ctx=null;interruptRef.current=()=>{};
   teardown=micStopped.then(()=>c?.close()).catch(()=>{}).then(()=>AudioManager.setAudioSessionActivity(false)).then(()=>{},()=>{})};
 },[visible,attempt,sample,lowOk]);

 async function buy(){
  setBuying(true);
  try{
   if(!await buyMinutes(pack))return;
   // The store webhook credits the minutes a moment after the purchase.
   for(let i=0;i<15;i++){
    const {data}=await supabase.rpc('my_voice_minutes').single();
    if(Number((data as any)?.minutes_left)>=(limit?.left??0)+1){setLimit(null);setLowOk(true);setAttempt(a=>a+1);return}
    await new Promise(r=>setTimeout(r,1500));
   }
   Alert.alert('Almost there','Your minutes are on their way. Try calling again in a minute.');
  }finally{setBuying(false)}
 }
 async function undo(){if(!saved)return;const id=saved.id;setSaved(null);await supabase.from('wellness_journal').delete().eq('id',id)}
 const status=phase==='connecting'?'Calling your pal…':phase==='speaking'?'Speaking':phase==='listening'?(muted?'Muted':'Listening'):phase==='ended'?'Call ended':'';
 const scale=pulse.interpolate({inputRange:[0,1],outputRange:[1,1.12]});
 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  {limit?<View style={st.root}>
   <SuperdotMascot id={companion} size={120}/>
   <View style={st.limitBubble}><Ionicons name="hourglass" size={26} color="#8A63D2"/></View>
   <Text style={st.limitTitle} accessibilityRole="header">{limit.left?'Get more minutes':"You're out of call minutes"}</Text>
   <Text style={st.limitBody}>{limit.left?'Extra minutes are added right away, so we can keep talking.':`Your ${limit.cap} Plus minutes come back${limit.resetsAt?' on '+new Date(limit.resetsAt).toLocaleDateString(undefined,{month:'long',day:'numeric',timeZone:'UTC'}):' next month'}. Need more time now?`}</Text>
   <View style={st.packs}>{MINUTE_PACKS.map(p=>{const on=pack===p.id,best=p.minutes===60;return <TouchableOpacity key={p.id} accessibilityRole="radio" accessibilityState={{checked:on}} accessibilityLabel={`${p.minutes} minutes, ${minutePrices[p.id]}${best?', best value':''}`} onPress={()=>setPack(p.id)} style={[st.pack,on&&st.packOn]}>
    {best?<View style={st.best}><Text style={st.bestText}>Best value</Text></View>:null}
    <Text style={st.packMin}>{p.minutes}</Text><Text style={st.packUnit}>minutes</Text><Text style={st.packPrice}>{minutePrices[p.id]}</Text>
   </TouchableOpacity>})}</View>
   <TouchableOpacity accessibilityRole="button" disabled={buying} onPress={()=>void buy()} style={[st.buy,buying&&{opacity:0.6}]}>
    {buying?<ActivityIndicator color="#fff"/>:<Ionicons name="call" size={20} color="#fff"/>}
    <Text style={st.buyText}>{`Get ${MINUTE_PACKS.find(p=>p.id===pack)!.minutes} minutes · ${minutePrices[pack]}`}</Text>
   </TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={limit.left?()=>{setLimit(null);setLowOk(true)}:onClose}><Text style={st.later}>{limit.left?'Talk anyway':'Maybe later'}</Text></TouchableOpacity>
   <Text style={[st.note,{marginTop:'auto'}]}>Extra minutes don't expire. They're used after your monthly Plus minutes.</Text>
  </View>:low?<View style={st.root}>
   <SuperdotMascot id={companion} size={120}/>
   <View style={st.limitBubble}><Ionicons name="hourglass" size={26} color="#8A63D2"/></View>
   <Text style={st.limitTitle} accessibilityRole="header">We're low on minutes</Text>
   <Text style={st.limitBody}>I'd love to talk! We only have about a minute left, though. Want to get a few more minutes first?</Text>
   <TouchableOpacity accessibilityRole="button" onPress={()=>{setLimit({cap:low.cap,left:low.left});setLow(null)}} style={st.buy}><Ionicons name="add-circle" size={20} color="#fff"/><Text style={st.buyText}>Get more minutes</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setLowOk(true)}><Text style={st.later}>Talk anyway</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={st.later}>Maybe later</Text></TouchableOpacity>
  </View>:<View style={st.root}>
   {sample?<View style={st.sampleTag}><Ionicons name="play-circle" size={22} color="#8A63D2"/><Text style={st.sampleTagText}>Sample call</Text></View>:null}
   <Text style={st.status} accessibilityLiveRegion="polite">{sample&&phase!=='connecting'?(sampleDone?'Sample ended':speaker+' is talking'):status}</Text>
   <TouchableOpacity activeOpacity={0.85} disabled={sample||phase!=='speaking'} accessibilityRole="button" accessibilityLabel="Interrupt your pal" onPress={()=>interruptRef.current()} style={st.stage}>
    <Animated.View style={[st.ring,{transform:[{scale}]}]}/>
    <ConnectingWave active={phase==='connecting'||phase==='speaking'}/>
   </TouchableOpacity>
   <Text style={[st.note,{opacity:phase==='speaking'&&!sample?1:0}]}>Tap to jump in</Text>
   {sampleDone?<View style={st.turn}>
    <Text style={st.limitTitle} accessibilityRole="header">Now it's your turn</Text>
    <Text style={st.limitBody}>{`Talk with ${palName||'your pal'} anytime about anything, and your diary writes itself. Part of MoodPals Plus.`}</Text>
   </View>:error?<Text style={st.error}>{error}</Text>:<View style={{alignItems:'center'}}>{speaker?<Text style={st.speaker}>{speaker}</Text>:null}<Text style={st.caption} numberOfLines={4}>{caption}</Text></View>}
   {saved?<View style={st.saved} accessible accessibilityLabel={'Logged for today: '+saved.summary}>
    <Ionicons name="book" size={20} color="#8A63D2"/>
    <View style={{flex:1}}><Text style={st.savedTitle}>{sample?'Sample diary entry':'Logged for today'}</Text><Text style={st.savedBody} numberOfLines={sample?3:2}>{saved.summary}</Text></View>
    {sample?null:<TouchableOpacity accessibilityRole="button" onPress={()=>void undo()} style={st.undo}><Text style={st.undoText}>Undo</Text></TouchableOpacity>}
   </View>:null}
   {sampleDone?<View style={{alignSelf:'stretch',alignItems:'center',gap:6}}>
    <TouchableOpacity accessibilityRole="button" onPress={()=>{onClose();showPaywall('reflections')}} style={st.buy}><Ionicons name="sparkles" size={20} color="#fff"/><Text style={st.buyText}>Get Plus</Text></TouchableOpacity>
    <View style={{flexDirection:'row',gap:18}}>
     <TouchableOpacity accessibilityRole="button" onPress={()=>setAttempt(a=>a+1)}><Text style={st.later}>Play again</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={st.later}>Maybe later</Text></TouchableOpacity>
    </View>
   </View>:null}
   <View style={st.controls}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={muted?'Unmute':'Mute'} disabled={sample||(phase!=='listening'&&phase!=='speaking')} onPress={()=>setMuted(m=>!m)} style={[st.round,{backgroundColor:muted?APP_THEME.ink:'#fff'}]}>
     <Ionicons name={muted?'mic-off':'mic'} size={28} color={muted?'#fff':APP_THEME.ink}/>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="End call" onPress={onClose} style={[st.round,st.end]}>
     <Ionicons name="call" size={30} color="#fff" style={{transform:[{rotate:'135deg'}]}}/>
    </TouchableOpacity>
   </View>
   <Text style={st.note}>Your MoodPal is a caring friend, not a therapist. In a crisis in the US, call or text 988.</Text>
  </View>}
 </Modal>;
}
const TOPICS=[{e:'😮‍💨',l:'Rough day'},{e:'😊',l:'Good news'},{e:'😴',l:"Can't sleep"}];
// The pal is the call button: tap it, or a quick start, to call.
// Sound bars in the call circle; they move while the call connects and while the pal talks.
const WAVE=[0.45,0.7,1,0.8,0.55,0.9,0.6];
function ConnectingWave({active}:{active:boolean}){
 const reduce=useReduceMotion()||!active;
 const bars=useRef(WAVE.map(()=>new Animated.Value(0))).current;
 useEffect(()=>{if(reduce)return;
  const loops=bars.map((v,i)=>Animated.loop(Animated.sequence([Animated.delay(i*110),Animated.timing(v,{toValue:1,duration:420,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:420,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),Animated.delay((WAVE.length-1-i)*110)])));
  loops.forEach(l=>l.start());return()=>loops.forEach(l=>l.stop())},[reduce]);
 return <View accessible importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={wv.row}>
  {WAVE.map((h,i)=><Animated.View key={i} style={[wv.bar,{height:88*h,opacity:0.55+0.45*h},reduce?null:{transform:[{scaleY:bars[i].interpolate({inputRange:[0,1],outputRange:[0.3,1]})}]}]}/>)}
 </View>;
}
const wv=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,height:96},bar:{width:12,borderRadius:6,backgroundColor:APP_THEME.primary}});

export function BuddyCall({companion,name,onCall}:{companion:string;name?:string;onCall:(topic?:string)=>void}){
 const reduce=useReduceMotion();
 const p=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(reduce)return;const a=Animated.loop(Animated.timing(p,{toValue:1,duration:2200,easing:Easing.out(Easing.ease),useNativeDriver:true}));a.start();return()=>a.stop()},[reduce]);
 const [palId,setPalId]=useState<VoicePalId>('maya'),[picking,setPicking]=useState(false);
 useEffect(()=>{void loadVoicePal().then(setPalId)},[]);
 const pal=voicePal(palId),close=()=>setPicking(false);
 const choose=(id:VoicePalId)=>{setPalId(id);void saveVoicePal(id)};
 const wave={transform:[{scale:p.interpolate({inputRange:[0,1],outputRange:[0.85,1.12]})}],opacity:p.interpolate({inputRange:[0,1],outputRange:[0.8,0]})};
 return <View style={b.wrap}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Call your buddy" activeOpacity={0.85} onPress={()=>onCall()} style={b.stage}>
   <Animated.View style={[b.ring,{width:300,height:300,borderRadius:150},reduce?null:wave]}/>
   <View style={[b.ring,{width:250,height:250,borderRadius:125,borderColor:'rgba(52,179,126,0.4)'}]}/>
   <View style={b.face}><SuperdotMascot id={companion} size={160}/></View>
   <View style={b.say}><Text style={b.sayText}>Hey{name?' '+name:''}! 👋 Wanna talk?</Text></View>
   <View style={b.tap}><Ionicons name="call" size={18} color="#fff"/><Text style={b.tapText}>Tap me to call</Text></View>
  </TouchableOpacity>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Your buddy: '+pal.name+'. Change buddy'} onPress={()=>setPicking(true)} style={b.voice}>
   <Image source={pal.photo} style={b.chipPhoto}/><Text style={b.voiceText}>{pal.name}</Text><Ionicons name="chevron-forward" size={13} color="#2E8F64"/>
  </TouchableOpacity>
  <Modal visible={picking} transparent animationType="slide" onRequestClose={close}>
   <TouchableOpacity activeOpacity={1} onPress={close} style={b.backdrop}>
    <TouchableOpacity activeOpacity={1} style={b.sheet}>
     <View style={b.grab}/>
     <Text style={b.sheetTitle}>Pick your buddy</Text>
     <Text style={b.sheetSub}>Tap to hear them say hi</Text>
     <VoicePalGrid value={palId} onPick={choose}/>
     <TouchableOpacity accessibilityRole="button" onPress={close} style={b.done}><Text style={b.doneText}>Done</Text></TouchableOpacity>
    </TouchableOpacity>
   </TouchableOpacity>
  </Modal>
  <View style={b.quick}>{TOPICS.map(t=><TouchableOpacity key={t.l} accessibilityRole="button" accessibilityLabel={'Call about: '+t.l} onPress={()=>onCall(t.l)} style={b.q}><Text style={b.qText}>{t.e} {t.l}</Text></TouchableOpacity>)}</View>
 </View>;
}
export function RoundButton({icon,label,tint,bg,a11y,onPress}:{icon:any;label:string;tint:string;bg:string;a11y:string;onPress:()=>void}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={b.rb}>
  <View style={[b.rbc,{backgroundColor:bg,shadowColor:tint}]}><Ionicons name={icon} size={26} color={bg==='#34B37E'?'#fff':tint}/></View>
  <Text style={[b.rbl,{color:tint}]}>{label}</Text>
 </TouchableOpacity>;
}
// Six buddies with a portrait each; tapping one picks it and plays its hello.
export function VoicePalGrid({value,onPick}:{value:VoicePalId;onPick:(id:VoicePalId)=>void}){
 const [playing,setPlaying]=useState<VoicePalId|null>(null);
 const stop=useRef<()=>void>(()=>{});
 useEffect(()=>()=>stop.current(),[]);
 const tap=async(p:VoicePal)=>{stop.current();onPick(p.id);void Haptics.selectionAsync();setPlaying(p.id);stop.current=await playClip(p.hello,()=>setPlaying(x=>x===p.id?null:x))};
 return <View style={g.grid}>{VOICE_PALS.map(p=>{const on=value===p.id,live=playing===p.id;
  return <TouchableOpacity key={p.id} accessibilityRole="radio" accessibilityState={{checked:on}} accessibilityLabel={p.name+', '+p.vibe+(p.gender==='female'?', female voice':', male voice')} accessibilityHint="Picks this buddy and plays a hello" onPress={()=>void tap(p)} style={[g.card,{backgroundColor:p.tint},on&&g.on]}>
   <View><Image source={p.photo} style={g.photo}/>{on&&<View style={g.check}><Ionicons name="checkmark" size={13} color="#fff"/></View>}</View>
   <Text style={g.name}>{p.name}</Text>
   <View style={g.vibeRow}><Ionicons name={live?'volume-high':'play'} size={12} color="#5B6B63"/><Text style={g.vibe} numberOfLines={1}>{live?'Saying hi':p.vibe}</Text></View>
  </TouchableOpacity>})}</View>;
}
const g=StyleSheet.create({
 grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},
 card:{width:'31.5%',alignItems:'center',borderRadius:22,paddingVertical:12,paddingHorizontal:6,gap:4,borderWidth:2.5,borderColor:'transparent'},
 on:{borderColor:'#34B37E'},
 photo:{width:72,height:72,borderRadius:36,borderWidth:3,borderColor:'#fff'},
 check:{position:'absolute',right:-2,bottom:-2,width:24,height:24,borderRadius:12,backgroundColor:'#34B37E',borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
 name:{fontSize:16,fontWeight:'900',color:APP_THEME.ink},
 vibeRow:{flexDirection:'row',alignItems:'center',gap:3},vibe:{fontSize:12,fontWeight:'700',color:'#5B6B63'},
});
const b=StyleSheet.create({
 chipPhoto:{width:22,height:22,borderRadius:11},
 sheetSub:{fontSize:13,fontWeight:'700',color:'#6B7C73',textAlign:'center',marginTop:-8,marginBottom:4},
 done:{alignSelf:'flex-end',backgroundColor:'#34B37E',borderRadius:22,paddingHorizontal:28,paddingVertical:12,marginTop:4},doneText:{color:'#fff',fontSize:16,fontWeight:'900'},
 voice:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#E4F6EA',borderRadius:16,paddingLeft:4,paddingRight:11,paddingVertical:4},voiceText:{fontSize:13,fontWeight:'800',color:'#2E8F64'},
 backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(20,30,35,0.35)'},
 sheet:{backgroundColor:'#fff',borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,paddingBottom:40,gap:12},
 grab:{alignSelf:'center',width:40,height:5,borderRadius:3,backgroundColor:'#DCE3E0'},
 sheetTitle:{fontSize:19,fontWeight:'900',color:APP_THEME.ink,textAlign:'center',marginBottom:4},
 opt:{flexDirection:'row',alignItems:'center',gap:12,borderRadius:20,padding:12,backgroundColor:'#F6F9F7',borderWidth:2,borderColor:'transparent'},optOn:{borderColor:'#34B37E',backgroundColor:'#EEF9F2'},
 optIc:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},optText:{flex:1,fontSize:16,fontWeight:'900',color:APP_THEME.ink},
 play:{width:40,height:40,borderRadius:20,backgroundColor:'#34B37E',alignItems:'center',justifyContent:'center'},
 rb:{alignItems:'center',gap:4},rbc:{width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center',shadowOpacity:0.3,shadowRadius:8,shadowOffset:{width:0,height:5}},rbl:{fontSize:11,fontWeight:'800'},
 wrap:{gap:14},stage:{height:330,alignItems:'center',justifyContent:'center'},
 ring:{position:'absolute',borderWidth:2,borderColor:'rgba(52,179,126,0.25)'},
 face:{width:200,height:200,borderRadius:100,backgroundColor:'#E4F6EA',alignItems:'center',justifyContent:'center',shadowColor:'#34B37E',shadowOpacity:0.25,shadowRadius:15,shadowOffset:{width:0,height:10}},
 say:{position:'absolute',top:6,left:4,backgroundColor:'#fff',borderRadius:18,borderBottomLeftRadius:4,paddingHorizontal:12,paddingVertical:9,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:8,shadowOffset:{width:0,height:3}},
 sayText:{fontSize:15,fontWeight:'800',color:APP_THEME.ink},
 tap:{position:'absolute',bottom:14,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#34B37E',borderRadius:24,paddingHorizontal:20,paddingVertical:12,shadowColor:'#34B37E',shadowOpacity:0.35,shadowRadius:10,shadowOffset:{width:0,height:6}},
 tapText:{fontSize:16,fontWeight:'900',color:'#fff'},
 quick:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8},
 q:{backgroundColor:'#fff',borderWidth:1,borderColor:'#DCEBE2',borderRadius:18,paddingHorizontal:13,paddingVertical:9},qText:{fontSize:14,fontWeight:'800',color:APP_THEME.ink},
});
const st=StyleSheet.create({
 limitBubble:{width:56,height:56,borderRadius:28,backgroundColor:'#ECE6FF',alignItems:'center',justifyContent:'center',marginTop:-34,borderWidth:3,borderColor:'#fff'},
 limitTitle:{fontSize:24,fontWeight:'900',color:APP_THEME.ink,textAlign:'center'},
 limitBody:{fontSize:15,lineHeight:21,color:APP_THEME.muted,textAlign:'center',paddingHorizontal:8},
 packs:{flexDirection:'row',gap:10,alignSelf:'stretch',marginTop:6},
 pack:{flex:1,alignItems:'center',backgroundColor:'#fff',borderRadius:20,paddingVertical:16,borderWidth:2,borderColor:'#fff',shadowColor:'#2D4A3E',shadowOpacity:0.08,shadowRadius:8,shadowOffset:{width:0,height:3}},
 packOn:{borderColor:APP_THEME.primary,backgroundColor:'#F7FDF9'},
 best:{position:'absolute',top:-10,backgroundColor:'#8A63D2',borderRadius:10,paddingHorizontal:8,paddingVertical:3},bestText:{color:'#fff',fontSize:10,fontWeight:'900'},
 packMin:{fontSize:30,fontWeight:'900',color:APP_THEME.ink},packUnit:{fontSize:12,fontWeight:'700',color:APP_THEME.muted},packPrice:{fontSize:15,fontWeight:'900',color:APP_THEME.primary,marginTop:6},
 buy:{flexDirection:'row',gap:10,alignSelf:'stretch',alignItems:'center',justifyContent:'center',backgroundColor:APP_THEME.primary,borderRadius:28,paddingVertical:16},buyText:{color:'#fff',fontSize:16,fontWeight:'900'},
 later:{fontSize:14,fontWeight:'800',color:APP_THEME.primary,padding:6},
 root:{flex:1,backgroundColor:APP_THEME.primarySoft,alignItems:'center',paddingTop:90,paddingBottom:40,paddingHorizontal:24,gap:18},
 status:{fontSize:15,fontWeight:'800',color:APP_THEME.primary,letterSpacing:0.4},
 stage:{width:240,height:240,alignItems:'center',justifyContent:'center'},
 ring:{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'#fff',opacity:0.7},
 caption:{fontSize:18,lineHeight:25,fontWeight:'700',color:APP_THEME.ink,textAlign:'center',minHeight:100},
 error:{fontSize:15,color:'#C2546B',textAlign:'center',minHeight:100},
 sampleTag:{flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'#F4EBFF',borderRadius:18,paddingHorizontal:16,paddingVertical:8,marginBottom:-8},sampleTagText:{fontSize:16,fontWeight:'900',color:'#8A63D2'},
 speaker:{fontSize:13,fontWeight:'900',color:APP_THEME.primary,marginBottom:4},turn:{alignItems:'center',gap:8},
 saved:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#F4EBFF',borderRadius:18,padding:12,alignSelf:'stretch'},
 savedTitle:{fontSize:14,fontWeight:'900',color:'#8A63D2'},savedBody:{fontSize:12,color:APP_THEME.muted,marginTop:2},
 undo:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:12,paddingVertical:7},undoText:{fontSize:13,fontWeight:'800',color:'#8A63D2'},
 controls:{flexDirection:'row',justifyContent:'space-between',alignSelf:'stretch',marginTop:'auto',paddingHorizontal:30},
 round:{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',shadowColor:'#2D4A3E',shadowOpacity:0.12,shadowRadius:10,shadowOffset:{width:0,height:4}},
 end:{backgroundColor:'#E5484D'},
 note:{fontSize:11,color:APP_THEME.muted,textAlign:'center'},
});
