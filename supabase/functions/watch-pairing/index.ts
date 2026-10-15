import QRCode from "npm:qrcode@1.5.4";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("")}
function random(){const a=crypto.getRandomValues(new Uint8Array(32));return Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function authed(req:Request){const bearer=req.headers.get("Authorization")||"";if(!bearer.startsWith("Bearer "))return null;const client=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});const {data:{user}}=await client.auth.getUser(bearer.slice(7));return user||null}
Deno.serve(async req=>{
 if(req.method==="GET"){
  try {
   const requestUrl=new URL(req.url),id=requestUrl.searchParams.get("id")||"",secret=requestUrl.searchParams.get("secret")||"";
   if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))return json({error:"Invalid QR"},400);
   const {data:row}=await admin.from("watch_pairing_requests").select("secret_hash,status,expires_at").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret)||row.status!=="pending"||Date.parse(row.expires_at)<Date.now())return json({error:"Expired QR"},404);
   const content="superdots://pair?id="+id+"&secret="+secret;
   const png=await QRCode.toBuffer(content,{type:"png",width:400,margin:2,errorCorrectionLevel:"M"});
   return new Response(new Uint8Array(png),{headers:{"Content-Type":"image/png","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(e){console.error("QR render failed",String(e));return json({error:"QR unavailable"},500)}
 }
 if(req.method!=="POST"||!url||!anon||!service)return json({error:"Not available"},503);
 try{
  const p=await req.json();const action=String(p.action||"");
  if(action==="start"){
   const secret=random();
   const {data,error}=await admin.from("watch_pairing_requests").insert({secret_hash:await hash(secret),device_name:String(p.deviceName||"Apple Watch").slice(0,80)}).select("id,expires_at").single();
   if(error||!data)return json({error:"Could not create link"},500);
   return json({id:data.id,secret,expiresAt:data.expires_at});
  }
  if(action==="poll"||action==="complete"){
   const id=String(p.id||""),secret=String(p.secret||"");
   if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))return json({error:"Invalid link"},400);
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret))return json({error:"Link not found"},404);
   if(row.status==="claimed")return json({status:"claimed"});
   if(Date.parse(row.expires_at)<Date.now())return json({status:"expired"});
   if(action==="complete"){
    const user=await authed(req);
    if(!user||user.id!==row.owner_id||row.status!=="approved")return json({error:"Not authorized"},403);
    await admin.from("watch_pairing_requests").update({status:"claimed",login_token_hash:null}).eq("id",id);
    await admin.from("connected_devices").update({last_seen_at:new Date().toISOString()}).eq("pairing_id",id).eq("user_id",user.id);
    return json({status:"claimed"});
   }
   return json({status:row.status,tokenHash:row.status==="approved"?row.login_token_hash:undefined});
  }
  const user=await authed(req);if(!user)return json({error:"Sign in required"},401);
  if(action==="approve"){
   const id=String(p.id||""),secret=String(p.secret||"");
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret)||row.status!=="pending"||Date.parse(row.expires_at)<Date.now())return json({error:"This QR code has expired or was already used"},400);
   if(!user.email)return json({error:"Email-based Supabase login is required for pairing"},400);
   const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email:user.email});
   const token=link?.properties?.hashed_token;
   if(linkError||!token)return json({error:"Unable to create watch session"},500);
   const {error}=await admin.from("watch_pairing_requests").update({status:"approved",owner_id:user.id,login_token_hash:token}).eq("id",id).eq("status","pending");
   if(error)return json({error:"Unable to approve"},500);
   await admin.from("connected_devices").upsert({user_id:user.id,pairing_id:id,name:row.device_name,platform:"watchos"},{onConflict:"pairing_id"});
   return json({status:"approved",deviceName:row.device_name});
  }
  if(action==="list"){
   const {data,error}=await admin.from("connected_devices").select("id,name,platform,linked_at,last_seen_at,revoked_at").eq("user_id",user.id).is("revoked_at",null).order("linked_at",{ascending:false}).limit(50);
   return error?json({error:"Unable to list"},500):json({devices:data||[]});
  }
  if(action==="remove"){
   const deviceId=String(p.deviceId||"");
   const {data:device, error:lookupError}=await admin.from("connected_devices").select("pairing_id").eq("user_id",user.id).eq("id",deviceId).maybeSingle();
   if(lookupError||!device)return json({error:"Device not found"},404);
   // Invalidate the pairing first, then permanently delete the device and pairing records.
   if(device.pairing_id){
    const {error:invalidateError}=await admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("id",device.pairing_id).eq("owner_id",user.id);
    if(invalidateError)return json({error:"Unable to invalidate device"},500);
   }
   const {error:removeError}=await admin.from("connected_devices").delete().eq("id",deviceId).eq("user_id",user.id);
   if(removeError)return json({error:"Unable to remove device"},500);
   if(device.pairing_id){
    const {error:pairingError}=await admin.from("watch_pairing_requests").delete().eq("id",device.pairing_id).eq("owner_id",user.id);
    if(pairingError)console.error("Unable to delete pairing record",pairingError.code);
   }
   return json({removed:true});
  }
  if(action==="status"){
   const {data}=await admin.from("connected_devices").select("revoked_at").eq("user_id",user.id).eq("pairing_id",String(p.id||"")).maybeSingle();
   if(data&&!data.revoked_at)await admin.from("connected_devices").update({last_seen_at:new Date().toISOString()}).eq("user_id",user.id).eq("pairing_id",String(p.id||""));
   return json({active:!!data&&!data.revoked_at});
  }
  return json({error:"Unknown action"},400);
 }catch(e){console.error("Watch pairing error",String(e));return json({error:"Unable to complete pairing"},500)}
});
