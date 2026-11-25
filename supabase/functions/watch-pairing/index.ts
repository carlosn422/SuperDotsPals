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
 const {data:approved,error}=await admin.from("watch_pairing_requests").update({status:"approved",kind:"family",owner_id:profile.id,login_token_hash:token}).eq("id",row.id).eq("status","pending").select("id");
 if(error||!approved?.length){await discard();return json({error:"This code has expired or was already used"},400)}
 await admin.from("connected_devices").upsert({user_id:profile.id,pairing_id:row.id,name:row.device_name,platform:"watchos",...(color?{watch_color:color}:{})},{onConflict:"pairing_id"});
 return json({status:"approved",deviceName:row.device_name,family:true,profileId:profile.id});
}
const CODE_WINDOW_MS=15*60*1000,CODE_MAX_FAILURES=10,SATELLITE_CODE_MS=5*60*1000,SATELLITE_MAX_CODES=6;
function sixDigits(){const a=crypto.getRandomValues(new Uint32Array(1));return String(a[0]%1000000).padStart(6,"0")}
// A family device (child iPad / spare iPhone) gets its own restricted login that owns no MoodPals data.
// It belongs to the parent's family account, not to a child; children are chosen per session.
async function satelliteBlocked(ownerId:string,installationId:string|null){
 const [{data:isFamily},{data:isSatellite}]=await Promise.all([admin.rpc("is_family_profile",{uid:ownerId}),admin.rpc("is_satellite",{uid:ownerId})]);
 if(isFamily||isSatellite)return json({error:"Link family devices from the parent's MoodPals app"},403);
 if(!installationId)return json({error:"Show a new code on the device"},400);
 const {data:ent}=await admin.rpc("screen_break_entitlement_of",{p_uid:ownerId});
 if(!ent?.allowed)return json({error:"Your 14-day free trial has ended. MoodPals Plus keeps Screen Break on."},402);
 const {data:prior}=await admin.from("family_devices").select("id,owner_id").eq("installation_id",installationId).maybeSingle();
 if(prior&&prior.owner_id!==ownerId)return json({error:"This device is linked to another family. Unlink it there first."},409);
 return null;
}
// Parent entered the code: the device must now approve the link before anything is created.
async function approveSatellite(user:{id:string},row:{id:string;device_name:string;installation_id:string|null;device_type:string|null}){
 const blocked=await satelliteBlocked(user.id,row.installation_id);if(blocked)return blocked;
 const {data:held,error}=await admin.from("watch_pairing_requests").update({status:"confirm",owner_id:user.id,login_token_hash:null,expires_at:new Date(Date.now()+SATELLITE_CODE_MS).toISOString()}).eq("id",row.id).eq("status","pending").select("id");
 if(error||!held?.length)return json({error:"This code has expired or was already used"},400);
 return json({status:"confirm",deviceName:(row.device_name||"Family iPad").slice(0,60),satellite:true});
}
// Shown on the device so it can tell who is asking: the account email (masked) plus the editable name.
async function parentIdentity(ownerId:string){
 const {data}=await admin.auth.admin.getUserById(ownerId);
 const u=data?.user,m=(u?.user_metadata||{}) as Record<string,unknown>;
 const name=([m.full_name,m.name,m.first_name].find(v=>typeof v==="string"&&v.trim()) as string|undefined)?.trim().slice(0,60);
 const [local,domain]=(u?.email||"").split("@");
 const account=local&&domain?(local.length>4?local[0]:"")+"•••@"+domain:null;
 return {parentName:name||account||"A parent",parentAccount:account};
}
// Device approved: create its login and register it under the parent's family.
async function linkSatellite(ownerId:string,row:{id:string;device_name:string;installation_id:string|null;device_type:string|null}){
 const blocked=await satelliteBlocked(ownerId,row.installation_id);if(blocked)return blocked;
 const {data:prior}=await admin.from("family_devices").select("id").eq("installation_id",row.installation_id).eq("owner_id",ownerId).maybeSingle();
 // Re-linking the same installation replaces its old login; the old device's history stays.
 if(prior){const {error}=await admin.rpc("family_device_finalize_unlink",{p_device:prior.id});if(error)return json({error:"Unable to replace the old link"},500)}
 const {data:created,error:createError}=await admin.auth.admin.createUser({email:"satellite-"+crypto.randomUUID()+"@family.moodpals.invalid",email_confirm:true,user_metadata:{satellite_device:true,owner_id:ownerId}});
 const login=created?.user;
 if(createError||!login?.email)return json({error:"Unable to link device"},500);
 const discard=async()=>{await admin.auth.admin.deleteUser(login.id)};
 const name=(row.device_name||"Family iPad").slice(0,60);
 const {data:device,error:deviceError}=await admin.from("family_devices").insert({owner_id:ownerId,auth_user_id:login.id,installation_id:row.installation_id,name,device_type:row.device_type==="iphone"?"iphone":"ipad",recovery_code:sixDigits()}).select("id").single();
 if(deviceError||!device){await discard();return json({error:"Unable to link device"},500)}
 const {data:link,error:tokenError}=await admin.auth.admin.generateLink({type:"magiclink",email:login.email});
 const token=link?.properties?.hashed_token;
 if(tokenError||!token){await admin.from("family_devices").delete().eq("id",device.id);await discard();return json({error:"Unable to link device"},500)}
 const {data:approved,error}=await admin.from("watch_pairing_requests").update({status:"approved",owner_id:login.id,login_token_hash:token}).eq("id",row.id).eq("status","confirm").select("id");
 if(error||!approved?.length){await admin.from("family_devices").delete().eq("id",device.id);await discard();return json({error:"This link request expired. Show a new code."},400)}
 return json({status:"approved",tokenHash:token,satellite:true});
}
async function approveRow(user:{id:string;email?:string},row:{id:string;device_name:string;kind:string;installation_id:string|null;device_type:string|null},color:string|null=null,family?:unknown,satellite?:unknown){
 if(row.kind==="satellite")return await approveSatellite(user,row);
 if(satellite===true)return json({error:"That code is for an Apple Watch. Add it from Apple Watch settings."},400);
 if(typeof family==="boolean"?family:row.kind==="family")return await approveFamily(user.id,row,color);
 if(!user.email)return json({error:"Email-based Supabase login is required for pairing"},400);
 // Claim the request before minting a login token: a new magic link invalidates the previous one, so a losing duplicate approve must not mint.
 const {data:claimed,error}=await admin.from("watch_pairing_requests").update({status:"approved",kind:"self",owner_id:user.id,login_token_hash:null}).eq("id",row.id).eq("status","pending").select("id");
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
   const secret=random(),satellite=p.kind==="satellite";
   const installationId=String(p.installationId||"");
   if(satellite){
    // Satellite codes are bound to one installation, last 5 minutes, and a device can't mint them endlessly.
    if(!/^[A-Za-z0-9-]{16,64}$/.test(installationId))return json({error:"Invalid device"},400);
    const {count}=await admin.from("watch_pairing_requests").select("id",{count:"exact",head:true}).eq("installation_id",installationId).gte("created_at",new Date(Date.now()-CODE_WINDOW_MS).toISOString());
    if((count||0)>=SATELLITE_MAX_CODES)return json({error:"Too many codes. Wait 15 minutes and try again."},429);
    await admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("installation_id",installationId).eq("status","pending");
   }
   // Expired requests release their codes so the pending-code unique index only covers live codes.
   await admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("status","pending").lt("expires_at",new Date().toISOString());
   for(let attempt=0;attempt<8;attempt++){
    const code=sixDigits();
    const {data,error}=await admin.from("watch_pairing_requests").insert({secret_hash:await hash(secret),pair_code:code,device_name:String(p.deviceName||(satellite?"Family iPad":"Apple Watch")).slice(0,80),kind:satellite?"satellite":p.family===true?"family":"self",
      ...(satellite?{installation_id:installationId,device_type:p.deviceType==="iphone"?"iphone":"ipad",expires_at:new Date(Date.now()+SATELLITE_CODE_MS).toISOString()}:{})}).select("id,expires_at").single();
    if(error?.code==="23505")continue;
    if(error||!data)return json({error:"Could not create link"},500);
    return json({id:data.id,secret,code,expiresAt:data.expires_at});
   }
   return json({error:"Could not create link"},500);
  }
  if(action==="confirm"){
   const id=String(p.id||""),secret=String(p.secret||"");
   if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))return json({error:"Invalid link"},400);
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret)||row.kind!=="satellite"||row.installation_id!==String(p.installationId||""))return json({error:"Link not found"},404);
   if(row.status!=="confirm"||Date.parse(row.expires_at)<Date.now())return json({error:"This link request expired. Show a new code."},400);
   if(p.accept!==true){
    await admin.from("watch_pairing_requests").update({status:"declined",login_token_hash:null}).eq("id",id).eq("status","confirm");
    return json({status:"declined"});
   }
   return await linkSatellite(row.owner_id,row);
  }
  if(action==="poll"||action==="complete"){
   const id=String(p.id||""),secret=String(p.secret||"");
   if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))return json({error:"Invalid link"},400);
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret))return json({error:"Link not found"},404);
   if(row.kind==="satellite"&&row.installation_id!==String(p.installationId||""))return json({error:"Link not found"},404);
   if(row.status==="claimed")return json({status:"claimed"});
   if(Date.parse(row.expires_at)<Date.now())return json({status:"expired"});
   if(row.kind==="satellite"&&row.status==="confirm"){
    if(action==="poll")return json({status:"confirm",...await parentIdentity(row.owner_id),expiresAt:row.expires_at,satellite:true});
   }
   if(action==="complete"){
    const user=await authed(req);
    if(!user||user.id!==row.owner_id||row.status!=="approved")return json({error:"Not authorized"},403);
    await admin.from("watch_pairing_requests").update({status:"claimed",login_token_hash:null}).eq("id",id);
    await admin.from("connected_devices").update({last_seen_at:new Date().toISOString()}).eq("pairing_id",id).eq("user_id",user.id);
    return json({status:"claimed"});
   }
   return json({status:row.status,tokenHash:row.status==="approved"?row.login_token_hash:undefined,moodOnly:row.kind==="family",satellite:row.kind==="satellite"});
  }
  const user=await authed(req);if(!user)return json({error:"Sign in required"},401);
  if(action==="approve"){
   const id=String(p.id||""),secret=String(p.secret||"");
   const {data:row}=await admin.from("watch_pairing_requests").select("*").eq("id",id).maybeSingle();
   if(!row||row.secret_hash!==await hash(secret)||row.status!=="pending"||Date.parse(row.expires_at)<Date.now())return json({error:"This code has expired or was already used"},400);
   return await approveRow(user,row,watchColor(p.color),p.family,p.satellite);
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
   return await approveRow(user,row,watchColor(p.color),p.family,p.satellite);
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
