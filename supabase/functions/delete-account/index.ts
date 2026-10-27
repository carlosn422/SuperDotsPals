import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const noSession={auth:{persistSession:false,autoRefreshToken:false}};
// Signed-in accounts must have signed in again (password or Apple) within this window.
const REAUTH_MAX_AGE_S=10*60;

function jwtClaims(token:string):Record<string,unknown>{
 try{return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))}catch{return {}}
}

// Optional: revoke the user's Sign in with Apple grant. Needs a Sign in with Apple key in the function secrets
// (APPLE_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY) and a fresh authorization code from the app.
async function revokeApple(code:string):Promise<string>{
 const team=Deno.env.get("APPLE_TEAM_ID"),kid=Deno.env.get("APPLE_SIWA_KEY_ID"),pem=Deno.env.get("APPLE_SIWA_PRIVATE_KEY"),client=Deno.env.get("APPLE_SIWA_CLIENT_ID")||"com.superdotspals.wellnest";
 if(!team||!kid||!pem)return "skipped";
 const b64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const enc=(o:unknown)=>b64url(new TextEncoder().encode(JSON.stringify(o)));
 const der=Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,"").replace(/\s+/g,"")),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",der,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const unsigned=enc({alg:"ES256",kid})+"."+enc({iss:team,iat:now,exp:now+300,aud:"https://appleid.apple.com",sub:client});
 const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(unsigned)));
 const secret=unsigned+"."+b64url(sig);
 const form=(o:Record<string,string>)=>new URLSearchParams(o).toString();
 const tok=await fetch("https://appleid.apple.com/auth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form({client_id:client,client_secret:secret,code,grant_type:"authorization_code"})});
 const t=await tok.json().catch(()=>({}));
 const token=t.refresh_token||t.access_token;
 if(!token)return "token_exchange_failed";
 const rv=await fetch("https://appleid.apple.com/auth/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form({client_id:client,client_secret:secret,token,token_type_hint:t.refresh_token?"refresh_token":"access_token"})});
 return rv.ok?"revoked":"revoke_failed";
}

// Permanently deletes the caller's account. Family watch profiles are separate auth users owned by this account,
// so they are revoked and deleted first; then the caller's own watches are revoked and the caller's auth user is
// deleted, which cascades every row that references it. Safe to retry: each step tolerates already-deleted data.
Deno.serve(async req=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
  const bearer=req.headers.get("Authorization")||"";
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!bearer.startsWith("Bearer ")||!url||!anon||!service)return out({error:"Unauthorized"},401);
  const token=bearer.slice(7);
  const {data:{user},error}=await createClient(url,anon,noSession).auth.getUser(token);
  if(error||!user)return out({error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  if(body?.confirm!==true)return out({error:"Confirmation required"},400);
  const admin=createClient(url,service,noSession);
  const {data:isFamily}=await admin.rpc("is_family_profile",{uid:user.id});
  if(isFamily)return out({error:"Family watches are removed by their owner."},403);
  if(!user.is_anonymous){
   const iat=Number(jwtClaims(token).iat||0);
   if(!iat||Date.now()/1000-iat>REAUTH_MAX_AGE_S)return out({error:"Please confirm it's you again, then delete.",reauth:true},401);
  }
  const now=new Date().toISOString();
  const {data:family,error:famError}=await admin.from("family_profiles").select("profile_user_id").eq("owner_id",user.id);
  if(famError)return out({error:"Could not delete the account."},500);
  for(const {profile_user_id:id} of family||[]){
   await admin.from("family_profile_removals").upsert({profile_user_id:id,owner_id:user.id},{onConflict:"profile_user_id"});
   const revoke=await Promise.all([
    admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("owner_id",id),
    admin.from("connected_devices").update({revoked_at:now}).eq("user_id",id),
   ]);
   if(revoke.some(r=>r.error))return out({error:"Could not delete the account."},500);
   const {error:e}=await admin.auth.admin.deleteUser(id);
   if(e&&!/not.?found/i.test(e.message)){console.error("delete-account family",e.message);return out({error:"Could not delete the account."},500);}
  }
  const own=await Promise.all([
   admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("owner_id",user.id),
   admin.from("connected_devices").update({revoked_at:now}).eq("user_id",user.id),
  ]);
  if(own.some(r=>r.error))return out({error:"Could not delete the account."},500);
  const apple=typeof body?.appleAuthorizationCode==="string"&&body.appleAuthorizationCode?await revokeApple(body.appleAuthorizationCode).catch(()=>"revoke_failed"):"not_requested";
  const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
  if(deleteError&&!/not.?found/i.test(deleteError.message)){console.error("delete-account failed",deleteError.message);return out({error:"Could not delete the account."},500);}
  await admin.from("family_profile_removals").delete().eq("owner_id",user.id);
  const {count}=await admin.from("family_profiles").select("profile_user_id",{count:"exact",head:true}).eq("owner_id",user.id);
  if(count)return out({error:"Could not delete the account."},500);
  return out({deleted:true,familyProfilesDeleted:(family||[]).length,apple});
 }catch(e){console.error("delete-account exception",e instanceof Error?e.message:String(e));return out({error:"Could not delete the account."},500);}
});
