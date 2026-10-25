import QRCode from "npm:qrcode@1.5.4";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("")}
function random(){const a=crypto.getRandomValues(new Uint8Array(32));return Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function authed(req:Request){const bearer=req.headers.get("Authorization")||"";if(!bearer.startsWith("Bearer "))return null;const client=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});const {data:{user}}=await client.auth.getUser(bearer.slice(7));return user||null}
// A Family Setup watch becomes its own mood-only sub-profile under the approving account.
// The profile has no real email; an internal address exists only so the watch can get a session.
const WATCH_COLORS=["charcoal","ivory","navy","rose","mint","lavender"];
const watchColor=(c:unknown)=>WATCH_COLORS.includes(String(c))?String(c):null;
async function approveFamily(ownerId:string,row:{id:string;device_name:string},color:string|null=null){
 const {data:isFamily}=await admin.rpc("is_family_profile",{uid:ownerId});
 if(isFamily)return json({error:"A family watch can't add other watches"},403);
 const {data:created,error:createError}=await admin.auth.admin.createUser({email:"family-"+crypto.randomUUID()+"@family.moodpals.invalid",email_confirm:true,user_metadata:{family_profile:true,owner_id:ownerId}});
 const profile=created?.user;
 if(createError||!profile?.email)return json({error:"Unable to create family profile"},500);
 const discard=async()=>{await admin.auth.admin.deleteUser(profile.id)};
 const {error:linkError}=await admin.from("family_profiles").insert({profile_user_id:profile.id,owner_id:ownerId,device_name:row.device_name||"Apple Watch"});
 if(linkError){await discard();return json({error:linkError.code==="P0001"?linkError.message:"Unable to add family watch"},linkError.code==="P0001"?409:500)}
 const {data:link,error:tokenError}=await admin.auth.admin.generateLink({type:"magiclink",email:profile.email});
 const token=link?.properties?.hashed_token;
 if(tokenError||!token){await discard();return json({error:"Unable to create watch session"},500)}
 const {data:approved,error}=await admin.from("watch_pairing_requests").update({status:"approved",owner_id:profile.id,login_token_hash:token}).eq("id",row.id).eq("status","pending").select("id");
 if(error||!approved?.length){await discard();return json({error:"This code has expired or was already used"},400)}
 await admin.from("connected_devices").upsert({user_id:profile.id,pairing_id:row.id,name:row.device_name,platform:"watchos",...(color?{watch_color:color}:{})},{onConflict:"pairing_id"});
 return json({status:"approved",deviceName:row.device_name,family:true,profileId:profile.id});
}
const CODE_WINDOW_MS=15*60*1000,CODE_MAX_FAILURES=10;
function sixDigits(){const a=crypto.getRandomValues(new Uint32Array(1));return String(a[0]%1000000).padStart(6,"0")}
async function approveRow(user:{id:string;email?:string},row:{id:string;device_name:string;kind:string},color:string|null=null){
 if(row.kind==="family")return await approveFamily(user.id,row,color);
 if(!user.email)return json({error:"Email-based Supabase login is required for pairing"},400);
 // Claim the request before minting a login token: a new magic link invalidates the previous one, so a losing duplicate approve must not mint.
 const {data:claimed,error}=await admin.from("watch_pairing_requests").update({status:"approved",owner_id:user.id,login_token_hash:null}).eq("id",row.id).eq("status","pending").select("id");
 if(error)return json({error:"Unable to approve"},500);
 if(!claimed?.length)return json({error:"This code has expired or was already used"},400);
 const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email:user.email});
 const token=link?.properties?.hashed_token;
 if(linkError||!token){await admin.from("watch_pairing_requests").update({status:"pending",owner_id:null}).eq("id",row.id).eq("status","approved");return json({error:"Unable to create watch session"},500)}
 await admin.from("watch_pairing_requests").update({login_token_hash:token}).eq("id",row.id).eq("status","approved");
 // A re-link of the same watch (e.g. after the session was signed out) keeps its earlier illustration color.
 const {data:prior}=color?{data:null}:await admin.from("connected_devices").select("watch_color").eq("user_id",user.id).eq("name",row.device_name).not("watch_color","is",null).order("linked_at",{ascending:false}).limit(1).maybeSingle();
 const keep=color??prior?.watch_color??null;
 await admin.from("connected_devices").upsert({user_id:user.id,pairing_id:row.id,name:row.device_name,platform:"watchos",
   ...(keep?{watch_color:keep}:{})},{onConflict:"pairing_id"});
 return json({status:"approved",deviceName:row.device_name});
}
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
   // Expired requests release their codes so the pending-code unique index only covers live codes.
   await admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("status","pending").lt("expires_at",new Date().toISOString());
   for(let attempt=0;attempt<8;attempt++){
    const code=sixDigits();
    const {data,error}=await admin.from("watch_pairing_requests").insert({secret_hash:await hash(secret),pair_code:code,device_name:String(p.deviceName||"Apple Watch").slice(0,80),kind:p.family===true?"family":"self"}).select("id,expires_at").single();
    if(error?.code==="23505")continue;
    if(error||!data)return json({error:"Could not create link"},500);
    return json({id:data.id,secret,code,expiresAt:data.expires_at});
   }
   return json({error:"Could not create link"},500);
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
   return json({status:row.status,tokenHash:row.status==="approved"?row.login_token_hash:undefined,moodOnly:row.kind==="family"});
  }
  const user=await authed(req);if(!user)return json({error:"Sign in required"},401);
  if(action==="approve"){
   const id=String(p.id||""),secret=String(p.secret||"");
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret)||row.status!=="pending"||Date.parse(row.expires_at)<Date.now())return json({error:"This code has expired or was already used"},400);
   return await approveRow(user,row,watchColor(p.color));
  }
  if(action==="approve_code"){
   const code=String(p.code||"").replace(/\D/g,"");
   const since=new Date(Date.now()-CODE_WINDOW_MS).toISOString();
   const {count}=await admin.from("watch_pairing_code_attempts").select("id",{count:"exact",head:true}).eq("user_id",user.id).gte("created_at",since);
   if((count||0)>=CODE_MAX_FAILURES)return json({error:"Too many wrong codes. Wait 15 minutes and try again."},429);
   const {data:row}=code.length===6?await admin.from("watch_pairing_requests").select("*").eq("pair_code",code).eq("status","pending").gt("expires_at",new Date().toISOString()).maybeSingle():{data:null};
   if(!row){
    await admin.from("watch_pairing_code_attempts").insert({user_id:user.id});
    return json({error:"That code didn't match a watch. Check the 6 digits on the watch, or show a new code."},400);
   }
   return await approveRow(user,row,watchColor(p.color));
  }
  if(action==="list"){
   const {data,error}=await admin.from("connected_devices").select("id,name,platform,linked_at,last_seen_at,revoked_at,watch_color").eq("user_id",user.id).is("revoked_at",null).order("linked_at",{ascending:false}).limit(50);
   return error?json({error:"Unable to list"},500):json({devices:data||[]});
  }
  if(action==="set_color"){
   const color=watchColor(p.color);if(!color)return json({error:"Choose one of the 6 watch colors"},400);
   const {data,error}=await admin.from("connected_devices").update({watch_color:color}).eq("id",String(p.deviceId||"")).eq("user_id",user.id).is("revoked_at",null).select("id");
   if(error)return json({error:"Unable to save color"},500);
   return data?.length?json({watchColor:color}):json({error:"Device not found"},404);
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
   const {data:family}=await admin.from("family_profiles").select("profile_user_id").eq("profile_user_id",user.id).maybeSingle();
   return json({active:!!data&&!data.revoked_at,moodOnly:!!family});
  }
  return json({error:"Unknown action"},400);
 }catch(e){console.error("Watch pairing error",String(e));return json({error:"Unable to complete pairing"},500)}
});
