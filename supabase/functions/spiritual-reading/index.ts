import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const moods=["Joyful","Calm","Sad","Angry","Anxious","Tired"];
const fallback:Record<string,string>={Joyful:"Psalm 118:24",Calm:"Psalm 46:10",Sad:"Psalm 34:18",Angry:"James 1:19",Anxious:"Philippians 4:6–7",Tired:"Matthew 11:28–30"};
const simpleQuestions:Record<string,string[]>={Joyful:["What has brought you joy today?","Would you like to express gratitude for something?"],Calm:["What has helped you feel grounded?","Would you like to make room for quiet reflection?"],Sad:["What has been weighing on your heart?","Would comfort or connection help today?"],Angry:["Has a conflict or an unmet expectation affected you?","Would you like to reflect on a patient response?"],Anxious:["Is uncertainty or a responsibility weighing on you?","Would reassurance or a moment of rest help?"],Tired:["Has rest been difficult lately?","Would taking a gentler pace help today?"]};
function safeJson(input:string){try{return JSON.parse(input.replace(/^\x60\x60\x60(?:json)?/,"").replace(/\x60\x60\x60$/,"").trim())}catch{return {}}}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
  const bearer=req.headers.get("Authorization")||"";
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!bearer.startsWith("Bearer ")||!url||!anon)return out({error:"Unauthorized"},401);
  const db=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(bearer.slice(7));
  if(authError||!user)return out({error:"Unauthorized"},401);
  const input=await req.json().catch(()=>({}));
  const mood=String(input.mood||"");if(!moods.includes(mood))return out({error:"Choose a valid mood"},400);
  const action=input.action==="recommend"?"recommend":"questions";
  const useHistory=input.useHistory===true;
  const answers=(input.answers&&typeof input.answers==="object"&&!Array.isArray(input.answers))?Object.fromEntries(Object.entries(input.answers).slice(0,4).map(([k,v])=>[String(k).slice(0,150),String(v).slice(0,250)])):{};
  let history:Record<string,unknown>={};
  if(useHistory){
   const [j,h,r]=await Promise.all([
    db.from("wellness_journal").select("mood,occurred_at").eq("user_id",user.id).not("mood","is",null).order("occurred_at",{ascending:false}).limit(5),
    db.from("habit_entries").select("habit,amount,unit,recorded_at").eq("user_id",user.id).order("recorded_at",{ascending:false}).limit(10),
    db.from("wellness_readings").select("metric,value,recorded_at").eq("user_id",user.id).eq("source","healthkit").order("recorded_at",{ascending:false}).limit(10)
   ]);
   history={pastMoods:j.data||[],recentHabits:h.data||[],healthReadings:r.data||[]};
  }
  const {data:catalog,error:catalogError}=await db.from("scripture_passages").select("id,reference,translation,verse_text,topics,source_url").order("id");
  if(catalogError||!catalog?.length)return out({error:"Scripture catalog unavailable"},503);
  const key=Deno.env.get("GEMINI_API_KEY");
  const models=[...new Set([Deno.env.get("SPIRITUAL_GEMINI_MODEL"),"gemini-2.5-flash","gemini-2.5-flash-lite"].filter(Boolean))] as string[];
  let aiResult:any=null,usedAI=false;
  let aiAllowed=Boolean(key);
  if(aiAllowed){const since=new Date(Date.now()-24*60*60*1000).toISOString();const {count,error:usageError}=await db.from("spiritual_ai_usage").select("id",{head:true,count:"exact"}).eq("user_id",user.id).gte("created_at",since);if(usageError||Number(count||0)>=10)aiAllowed=false;}
  if(aiAllowed){
   const instruction=action==="questions"?
   "Generate THREE thoughtful and DISTINCT emotionally supportive questions that help understand WHY a person feels their selected mood, in a wellness app. Tailor to the mood and available history, without claiming health data caused the feeling. Favor open exploration of real-life events, relationships, stressors and hopes. For EACH question provide FOUR short, specific multiple choice answers (never generic Yes/No) plus an optional Other option handled by the app. Do not diagnose or pressure faith. Return JSON only: {\"items\":[{\"question\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"]}, ...]}. Question max 120 characters, choice max 55.":
   "Select ONE reference from the provided verified Bible catalog ONLY. Never invent Bible text or a reference. Offer a warm two-sentence reflection that does not diagnose or promise a cure. Return JSON only: {\"reference\":\"exact supplied reference\",\"reflection\":\"...\"}. Reflection <=300 characters.";
   const context={mood,answers,history,availableReferences:action==="recommend"?catalog.map(p=>({reference:p.reference,topics:p.topics})):undefined};
   for(const model of models){
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),12000);
    try{
     const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
      method:"POST",signal:abort.signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:"user",parts:[{text:JSON.stringify(context).slice(0,3300)}]}],generationConfig:{temperature:0.3,maxOutputTokens:650,responseMimeType:"application/json"}})
     });
     if(response.ok){const json=await response.json();const generated=(json.candidates?.[0]?.content?.parts||[]).map((x:{text?:string})=>x.text||"").join("");aiResult=safeJson(generated);usedAI=true;await db.from("spiritual_ai_usage").insert({user_id:user.id,action,input_tokens:json.usageMetadata?.promptTokenCount||null,output_tokens:json.usageMetadata?.candidatesTokenCount||null});break;}
     const detail=await response.text();
     console.warn("Spiritual Gemini unavailable",model,response.status,detail.slice(0,220));
     if(response.status!==404)break;
    }catch(e){console.warn("Spiritual Gemini failed",model,String(e))}
    finally{clearTimeout(timer)}
   }
  }
  if(action==="questions"){
   const items=Array.isArray(aiResult?.items)?aiResult.items.filter((x:any)=>typeof x?.question==="string"&&x.question.length>10&&x.question.length<=120&&Array.isArray(x.choices)&&x.choices.length===4&&x.choices.every((c:unknown)=>typeof c==="string"&&(c as string).length>1&&(c as string).length<=55)).slice(0,3):[];
   const moodChoices:Record<string,string[][]>={
    Joyful:[["A meaningful accomplishment","Time with someone I love","An unexpected good moment","Feeling grateful for life"],["A person who supported me","A small everyday blessing","An opportunity or breakthrough","I am still figuring it out"],["Celebrating with someone","Remembering this moment","Sharing kindness with others","Taking time for gratitude"]],
    Calm:[["Time away from distractions","An encouraging conversation","Prayer or quiet reflection","Feeling prepared"],["Rest and recovery","Feeling connected","Being outdoors","Having fewer worries"],["Protecting my quiet time","Making space for prayer","Setting healthy boundaries","Sharing peace with others"]],
    Sad:[["A loss or disappointment","Feeling lonely","An ongoing difficult situation","I cannot pinpoint it"],["A friend or family member","Space to process feelings","A reminder of hope","Rest and compassion"],["Someone listening to me","A reassuring passage","A small step forward","Time for myself"]],
    Angry:[["A difficult conversation","Feeling treated unfairly","Too many demands","Unmet expectations"],["Feeling unheard","A crossed boundary","Stress building up","Something unexpected"],["Time to cool down","A kind conversation","Help setting a boundary","Guidance to respond patiently"]],
    Anxious:[["An upcoming decision","Work or family responsibilities","Uncertainty about the future","Something hard to explain"],["Having too much to do","Fear of letting someone down","A difficult relationship","Not enough rest"],["Reassurance and perspective","One manageable next step","Support from someone","Quiet time to reflect"]],
    Tired:[["Not enough sleep","An emotionally demanding day","Too many responsibilities","Feeling unmotivated"],["Physical exhaustion","Feeling mentally drained","Not enough downtime","Something weighing on me"],["Permission to rest","Help with a responsibility","Some quiet time","Encouragement to slow down"]]
   };
   const fallbackItems=[...simpleQuestions[mood], "What would feel most supportive for you right now?"].map((question,i)=>({question,choices:moodChoices[mood][i]}));
   return out({items:items.length===3?items:fallbackItems,usedAI:items.length===3&&usedAI});
  }
  const selected=catalog.find(p=>p.reference===aiResult?.reference)||catalog.find(p=>p.reference===fallback[mood])||catalog[0];
  const reflection=typeof aiResult?.reflection==="string"&&aiResult.reflection.length<=300?aiResult.reflection:"This passage offers a starting point for prayer and reflection on what matters to you today.";
  const saved=await db.from("spiritual_sessions").insert({user_id:user.id,mood,answers,passage_id:selected.id,reflection,questions:Array.isArray(input.questions)?input.questions.slice(0,3):[]}).select("id").single();
  if(saved.error)return out({error:"Could not save your reading. Please retry."},500);
  return out({sessionId:saved.data.id,passage:selected,reflection,usedAI:usedAI&&selected.reference===aiResult?.reference});
 }catch(e){console.error("Spiritual reading error",String(e));return out({error:"Unable to prepare the reading. Please try again."},500)}
});
