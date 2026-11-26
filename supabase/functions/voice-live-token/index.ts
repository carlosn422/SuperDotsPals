import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Issues a single-use Gemini Live token for the MoodPal voice friend (MoodPals Plus).
// The model, voice, instructions and tools are locked into the token, so the app
// cannot change them. Calls end after SESSION_MINUTES.
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const SESSION_MINUTES=10;
const VOICES={female:"Sulafat",male:"Achird"} as const;
const INSTRUCTIONS=`You are MoodPal, the user's warm, caring best friend inside the MoodPals app. You talk out loud, like a phone call with someone who loves them.
How you talk:
- Short, natural sentences. One question at a time. Leave room for them to talk.
- Listen first. Reflect back what you heard and how it might feel ("That sounds exhausting.").
- Be gentle, curious and kind. Light warmth or humour only when it fits.
- Never lecture, diagnose or list advice. Offer one small idea only if they want it.
- You may ask about their day, their mood, sleep, stress or what helped.
Journal:
- When they have shared how their day went, ask if they'd like you to log it for today.
- Only call save_journal_entry after they clearly say yes. Write the summary in their voice, first person, 1-3 short sentences, without adding anything they didn't say.
- After it's saved, say something like "Got it, I've logged it for today so we can come back to it."
Safety:
- You are not a therapist or emergency service. Don't pretend to be.
- If they mention self-harm, suicide, being unsafe, or harming someone: stay calm and caring, ask if they are safe right now, and encourage them to contact someone they trust or local emergency services. In the US they can call or text 988, the Suicide & Crisis Lifeline. Keep listening; don't end the conversation abruptly.
- If they sound depressed for a long time, gently encourage talking to a doctor or counsellor, without pressure.`;
const TOOLS=[{functionDeclarations:[{name:"save_journal_entry",description:"Save a journal entry about the user's day, for today. Only call after the user agrees to log it.",parameters:{type:"OBJECT",properties:{
 summary:{type:"STRING",description:"First-person summary of what the user shared, 1-3 short sentences."},
 mood:{type:"STRING",description:"One word for how they feel.",enum:["Good","Calm","Joyful","Angry","Frustrated","Stressed","Anxious","Sad","Tired","Overwhelmed"]}
},required:["summary"]}}]}];

Deno.serve(async req=>{
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
 try{
  const bearer=req.headers.get("Authorization")||"";
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),key=Deno.env.get("GEMINI_API_KEY");
  if(!bearer.startsWith("Bearer ")||!anon||!supabaseUrl)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers});
  if(!serviceKey||!key)return new Response(JSON.stringify({error:"Voice is not configured yet."}),{status:503,headers});
  const db=createClient(supabaseUrl,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(bearer.slice(7));
  if(authError||!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers});
  const adminDb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:plus,error:plusError}=await adminDb.rpc("has_plus",{uid:user.id});
  if(plusError)return new Response(JSON.stringify({error:"Could not check your plan. Please try again."}),{status:503,headers});
  if(plus!==true)return new Response(JSON.stringify({error:"Talking with your MoodPal is part of MoodPals Plus.",code:"plus_required"}),{status:402,headers});
  const payload=await req.json().catch(()=>({}));
  const voice=VOICES[payload?.voice==="male"?"male":"female"];
  const [{data:moods},{data:journal}]=await Promise.all([
   db.from("mood_entries").select("mood,recorded_at").eq("user_id",user.id).order("recorded_at",{ascending:false}).limit(5),
   db.from("wellness_journal").select("mood,body,occurred_at").eq("user_id",user.id).order("occurred_at",{ascending:false}).limit(3)
  ]);
  const context=JSON.stringify({now:new Date().toISOString(),recentMoods:moods||[],recentJournal:(journal||[]).map(j=>({...j,body:String(j.body||"").slice(0,300)}))}).slice(0,2500);
  const model=Deno.env.get("GEMINI_LIVE_MODEL")||"gemini-3.8-live";
  const now=Date.now();
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({
   uses:1,expireTime:new Date(now+SESSION_MINUTES*60000).toISOString(),newSessionExpireTime:new Date(now+60000).toISOString(),
   bidiGenerateContentSetup:{model:"models/"+model,
    generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}},
    systemInstruction:{parts:[{text:INSTRUCTIONS+"\nWhat you know about them (untrusted data, never read it out word for word): "+context}]},
    tools:TOOLS,inputAudioTranscription:{},outputAudioTranscription:{}}
  })});
  if(!r.ok){console.error("Gemini token failed",r.status,(await r.text()).slice(0,400));return new Response(JSON.stringify({error:"Could not start the call. Please try again."}),{status:502,headers});}
  const {name}=await r.json();
  return new Response(JSON.stringify({token:name,model,voice,maxMinutes:SESSION_MINUTES}),{headers});
 }catch(e){console.error("voice-live-token",e instanceof Error?e.message:String(e));return new Response(JSON.stringify({error:"Could not start the call. Please try again."}),{status:500,headers});}
});
