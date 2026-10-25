import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const noSession={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,service,noSession);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Family Watches owned by the signed-in primary account: list and permanent removal.
Deno.serve(async req=>{
 if(req.method!=="POST"||!url||!anon||!service)return json({error:"Not available"},503);
 try{
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({error:"Sign in required"},401);
  const {data:{user}}=await createClient(url,anon,noSession).auth.getUser(bearer.slice(7));
  if(!user)return json({error:"Sign in required"},401);
  const p=await req.json().catch(()=>({}));const action=String(p.action||"");
  if(action==="list"){
   const {data:rows,error}=await admin.from("family_profiles").select("profile_user_id,device_name,created_at").eq("owner_id",user.id).order("created_at");
   if(error)return json({error:"Unable to load family watches"},500);
   const ids=(rows||[]).map(r=>r.profile_user_id);
   const [{data:devices},{data:moods},{data:plus}]=await Promise.all([
    ids.length?admin.from("connected_devices").select("user_id,last_seen_at").in("user_id",ids).is("revoked_at",null):Promise.resolve({data:[]}),
    ids.length?admin.from("wellness_journal").select("user_id,mood,occurred_at").in("user_id",ids).not("mood","is",null).order("occurred_at",{ascending:false}).limit(200):Promise.resolve({data:[]}),
    admin.rpc("has_plus",{uid:user.id}),
   ]);
   const profiles=(rows||[]).map(r=>{
    const device=(devices||[]).find(d=>d.user_id===r.profile_user_id),mood=(moods||[]).find(m=>m.user_id===r.profile_user_id);
    return {id:r.profile_user_id,name:r.device_name,createdAt:r.created_at,lastSeenAt:device?.last_seen_at??null,connected:!!device,mood:mood?.mood??null,moodAt:mood?.occurred_at??null};
   });
   return json({profiles,slots:plus===true?5:1});
  }
  if(action==="remove"){
   const id=String(p.profileId||"");
   if(!uuid.test(id))return json({error:"Profile not found"},404);
   if(p.confirm!=="DELETE")return json({error:"Type DELETE to confirm"},400);
   const {data:row}=await admin.from("family_profiles").select("owner_id").eq("profile_user_id",id).maybeSingle();
   if(!row){
    // Retried after a completed removal: report the confirmed result again.
    const {data:done}=await admin.from("family_profile_removals").select("owner_id").eq("profile_user_id",id).maybeSingle();
    return done?.owner_id===user.id?json({deleted:true}):json({error:"Profile not found"},404);
   }
   if(row.owner_id!==user.id)return json({error:"Profile not found"},404);
   const {error:markError}=await admin.from("family_profile_removals").upsert({profile_user_id:id,owner_id:user.id},{onConflict:"profile_user_id"});
   if(markError)return json({error:"Unable to remove profile"},500);
   // Revoke the watch first so it can no longer sign in or sync, then delete the profile user.
   const now=new Date().toISOString();
   const revoke=await Promise.all([
    admin.from("watch_pairing_requests").update({status:"expired",login_token_hash:null}).eq("owner_id",id),
    admin.from("connected_devices").update({revoked_at:now}).eq("user_id",id),
   ]);
   if(revoke.some(r=>r.error))return json({error:"Unable to revoke the watch"},500);
   // Deleting the auth user ends its refresh tokens and cascades every profile-owned row.
   const {error:deleteError}=await admin.auth.admin.deleteUser(id);
   if(deleteError&&!/not.?found/i.test(deleteError.message))return json({error:"Unable to remove profile"},500);
   const {count}=await admin.from("family_profiles").select("profile_user_id",{count:"exact",head:true}).eq("profile_user_id",id);
   if(count)return json({error:"Unable to remove profile"},500);
   return json({deleted:true});
  }
  return json({error:"Unknown action"},400);
 }catch(e){console.error("family-profiles error",e instanceof Error?e.message:String(e));return json({error:"Unable to complete request"},500)}
});
