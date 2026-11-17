import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {packCanvas} from "./pack.ts";

// After a member taps Done (or the owner clears), shows the Circle's latest drawing on the Lock Screen of every member
// who picked that Circle for their widget: updates their running Live Activity, or starts one with push-to-start.
const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const P8=Deno.env.get("APNS_KEY_P8")||"",KEY_ID=Deno.env.get("APNS_KEY_ID")||"",TEAM_ID=Deno.env.get("APNS_TEAM_ID")||"Y355786FS4";
const TOPIC=(Deno.env.get("APNS_TOPIC")||"com.superdotspals.wellnest")+".push-type.liveactivity";
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json"}});
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

const b64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
let jwt:{token:string;at:number}|null=null;
async function apnsJwt(){
 const now=Math.floor(Date.now()/1000);
 if(jwt&&now-jwt.at<45*60)return jwt.token;
 const der=Uint8Array.from(atob(P8.replace(/-----[^-]+-----|\\n|\s/g,"")),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",der,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const enc=(o:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(o)));
 const body=enc({alg:"ES256",kid:KEY_ID})+"."+enc({iss:TEAM_ID,iat:now});
 const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(body)));
 jwt={token:body+"."+b64url(sig),at:now};
 return jwt.token;
}

type Target={token:string;kind:"start"|"update";env:string;user_id:string;device:string|null};
// Tries the token's environment first, then the other one (Debug builds use the sandbox).
async function send(t:Target,aps:Record<string,unknown>){
 const hosts=t.env==="sandbox"?["api.sandbox.push.apple.com","api.push.apple.com"]:["api.push.apple.com","api.sandbox.push.apple.com"];
 for(const host of hosts){
  const r=await fetch(`https://${host}/3/device/${t.token}`,{method:"POST",headers:{authorization:"bearer "+await apnsJwt(),"apns-topic":TOPIC,"apns-push-type":"liveactivity","apns-priority":"10"},body:JSON.stringify({aps})});
  if(r.ok)return true;
  const reason=(await r.json().catch(()=>({})) as {reason?:string}).reason;
  if(r.status===400&&reason==="BadDeviceToken")continue;
  if(r.status===410||reason==="BadDeviceToken"||reason==="DeviceTokenNotForTopic")break;
  console.warn("APNs",r.status,reason);return false;
 }
 await admin.from("circle_drawing_live_tokens").delete().eq("token",t.token);
 return false;
}

Deno.serve(async req=>{
 const bearer=req.headers.get("Authorization")||"";
 if(!bearer.startsWith("Bearer "))return json({error:"Sign in first"},401);
 const client=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await client.auth.getUser(bearer.slice(7));
 if(!user)return json({error:"Sign in first"},401);
 const {group}=await req.json().catch(()=>({})) as {group?:string};
 if(!group||!/^[0-9a-f-]{36}$/i.test(group))return json({error:"Missing group"},400);
 const {data:member}=await client.rpc("circle_drawing_member",{p_group:group});
 if(!member)return json({error:"You are not in this Circle."},403);
 if(!P8||!KEY_ID)return json({sent:0,reason:"APNs key not configured"});

 const [{data:canvas},{data:circle},{data:targets}]=await Promise.all([
  admin.from("circle_group_canvas").select("background,strokes,version").eq("group_id",group).maybeSingle(),
  admin.from("circle_groups").select("name").eq("id",group).maybeSingle(),
  admin.rpc("circle_drawing_live_targets",{p_group:group}),
 ]);
 if(!canvas)return json({sent:0});
 const state=packCanvas(canvas.strokes||[],canvas.background,canvas.version);
 const now=Math.floor(Date.now()/1000);
 const alert={title:circle?.name||"MoodPals",body:"New drawing"};
 // Per phone: update its running card, or start one when it has none.
 const byDevice=new Map<string,Target[]>();
 for(const t of (targets||[]) as Target[]){const k=t.user_id+"/"+(t.device||t.token);byDevice.set(k,[...(byDevice.get(k)||[]),t]);}
 let sent=0;
 await Promise.all([...byDevice.values()].map(async ts=>{
  const ping=ts[0].user_id===user.id?{}:{alert};
  let ok=false;
  for(const t of ts.filter(t=>t.kind==="update"))ok=(await send(t,{timestamp:now,event:"update","content-state":state,"stale-date":now+8*3600,...ping}))||ok;
  if(!ok)for(const t of ts.filter(t=>t.kind==="start"))ok=(await send(t,{timestamp:now,event:"start","content-state":state,"attributes-type":"CircleDrawingAttributes",attributes:{group},"stale-date":now+8*3600,...ping}))||ok;
  if(ok)sent++;
 }));
 return json({sent});
});
