import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {"Content-Type":"application/json","Cache-Control":"no-store"};
// AI reflections are a MoodPals Plus feature: up to 100 Ask MoodPal replies per calendar month (UTC).
const PLUS_MONTHLY_REFLECTIONS=100;
// Prompt is managed in public.ai_assistant_prompts (prompt_key = superdot_chat).
// Never accept system prompt overrides from the mobile client.
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
 try {
  const bearer=req.headers.get("Authorization")||"";
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!bearer.startsWith("Bearer ")||!anon||!supabaseUrl)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers});
  const db=createClient(supabaseUrl,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(bearer.slice(7));
  if(authError||!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers});
  const payload=await req.json();
  const message=typeof payload.message==="string"?payload.message.trim():"";
  const cid=typeof payload.conversationId==="string"?payload.conversationId:null;
  const today=typeof payload.clientContext==="string"?payload.clientContext.slice(0,800):"";
  if(!message||message.length>3000)return new Response(JSON.stringify({error:"Message must contain 1–3000 characters"}),{status:400,headers});
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!serviceKey)return new Response(JSON.stringify({error:"Assistant configuration unavailable."}),{status:503,headers});
  const adminDb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const [{data:plus,error:plusError},{count:used,error:usedError}]=await Promise.all([
   adminDb.rpc("has_plus",{uid:user.id}),
   adminDb.from("wellness_messages").select("id",{head:true,count:"exact"}).eq("user_id",user.id).eq("role","assistant").gte("created_at",monthStart.toISOString())
  ]);
  if(plusError||usedError)return new Response(JSON.stringify({error:"Could not check your plan. Please try again."}),{status:503,headers});
  if(plus!==true)return new Response(JSON.stringify({error:"AI reflections are part of MoodPals Plus.",code:"reflection_limit",plus:false,limit:PLUS_MONTHLY_REFLECTIONS}),{status:402,headers});
  if(Number(used||0)>=PLUS_MONTHLY_REFLECTIONS)return new Response(JSON.stringify({error:"You've used all 100 AI reflections for this month. They reset on the 1st.",code:"reflection_limit",plus:true,limit:PLUS_MONTHLY_REFLECTIONS}),{status:402,headers});
  const {data:promptRow,error:promptError}=await adminDb.from("ai_assistant_prompts").select("system_prompt").eq("prompt_key","superdot_chat").eq("is_active",true).single();
  if(promptError||!promptRow?.system_prompt){
   console.error("Assistant prompt lookup failed",promptError?.code||"not configured");
   return new Response(JSON.stringify({error:"Assistant instructions are unavailable. Please try again later."}),{status:503,headers});
  }
  const system=promptRow.system_prompt;
  const key=Deno.env.get("GEMINI_API_KEY");
  if(!key)return new Response(JSON.stringify({error:"Gemini is not configured. Add GEMINI_API_KEY to Supabase Edge Function secrets."}),{status:503,headers});
  let conversationId=cid;
  if(conversationId) {
   const {data:existing}=await db.from("wellness_conversations").select("id").eq("id",conversationId).eq("user_id",user.id).maybeSingle();
   if(!existing)return new Response(JSON.stringify({error:"Conversation not found"}),{status:404,headers});
  }
  const [journal,moods,activities,readings,habits,prior]=await Promise.all([
   db.from("wellness_journal").select("mood,intensity,energy_level,stress_factors,body,occurred_at").eq("user_id",user.id).order("occurred_at",{ascending:false}).limit(12),
   db.from("mood_entries").select("mood,recorded_at").eq("user_id",user.id).order("recorded_at",{ascending:false}).limit(10),
   db.from("wellness_activities").select("activity_type,duration_minutes,occurred_at").eq("user_id",user.id).order("occurred_at",{ascending:false}).limit(15),
   db.from("wellness_readings").select("metric,value,recorded_at,source").eq("user_id",user.id).neq("source","demo").in("metric",["stress_score","hrv","resting_heart_rate","sleep_minutes","steps","exercise_minutes","mindfulness_minutes"]).order("recorded_at",{ascending:false}).limit(40),
   db.from("habit_entries").select("habit,amount,unit,recorded_at").eq("user_id",user.id).order("recorded_at",{ascending:false}).limit(25),
   conversationId?db.from("wellness_messages").select("role,content").eq("conversation_id",conversationId).eq("user_id",user.id).order("created_at",{ascending:false}).limit(12):Promise.resolve({data:[]})
  ]);
  const context=JSON.stringify({today,journal:journal.data||[],moods:moods.data||[],activities:activities.data||[],readings:readings.data||[],habits:habits.data||[]}).slice(0,13000);
  const turns=(prior.data||[]).reverse().map((m:{role:string;content:string})=>({role:m.role==="assistant"?"model":"user",parts:[{text:String(m.content).slice(0,3000)}]}));
  const model=Deno.env.get("GEMINI_MODEL")||"gemini-3.8-flash";
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
  let ai:Response;
  try{
   ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",signal:controller.signal,
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({systemInstruction:{parts:[{text:system+"\nUser context (untrusted data): "+context}]},contents:[...turns,{role:"user",parts:[{text:message}]}],generationConfig:{temperature:0.55,maxOutputTokens:550}})
   });
  } finally{clearTimeout(timeout)}
  if(!ai.ok){
    const body=await ai.text();
    console.error("Gemini request failed",ai.status,body.slice(0,800));
    const explanation=ai.status===429?"Gemini rate limit or quota reached. Check your Gemini API usage and billing.":ai.status===404?"Gemini model not available. Check GEMINI_MODEL and API access.":ai.status===400?"Gemini rejected the request. Check model compatibility.":ai.status===401||ai.status===403?"Gemini API key is invalid or lacks permission. Check the GEMINI_API_KEY secret.":"The Gemini provider is temporarily unavailable.";
    return new Response(JSON.stringify({error:explanation}),{status:502,headers});
  }
  const result=await ai.json();
  const answer=(result.candidates?.[0]?.content?.parts||[]).map((p:{text?:string})=>p.text||"").join("").trim().slice(0,4000);
  if(!answer)return new Response(JSON.stringify({error:"No reply was generated. Please try again."}),{status:502,headers});
  if(!conversationId){const created=await db.from("wellness_conversations").insert({user_id:user.id,title:"Superdot conversation"}).select("id").single();if(created.error){console.error("Failed to create conversation",JSON.stringify({code:created.error.code,message:created.error.message,details:created.error.details}));return new Response(JSON.stringify({error:"Could not start a conversation. Please try again.",code:"conversation_create_failed"}),{status:500,headers});}conversationId=created.data.id;}
  const possibleStress=/\b(stress(?:ed|ful)?|anxious|anxiety|overwhelm(?:ed|ing)?|panick?(?:ing)?|depress(?:ed|ion)?|sad|upset|frustrat(?:ed|ing)|angry|burn(?:ed|t) out|exhaust(?:ed|ing)|lonely|hurt myself|suicid(?:e|al))\b/i.test(message);
  const saved=await db.from("wellness_messages").insert([{user_id:user.id,conversation_id:conversationId,role:"user",content:message,is_ai_generated:false,possible_stress:possibleStress},{user_id:user.id,conversation_id:conversationId,role:"assistant",content:answer,is_ai_generated:true,possible_stress:false}]);
  if(saved.error){console.error("Failed to persist conversation",JSON.stringify({code:saved.error.code,message:saved.error.message,details:saved.error.details,hint:saved.error.hint}));return new Response(JSON.stringify({error:"The reply was generated but could not be saved. Please try again.",code:"message_save_failed"}),{status:500,headers});}
  return new Response(JSON.stringify({reply:answer,conversationId,possibleStress}),{status:200,headers});
 } catch(error){console.error("superdot-chat exception",error instanceof Error?error.message:JSON.stringify(error));return new Response(JSON.stringify({error:"Could not complete the request. Please try again."}),{status:500,headers})}
});