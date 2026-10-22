import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const noSession={auth:{persistSession:false,autoRefreshToken:false}};

// Deletes the caller's own auth user. Every public table references auth.users with
// ON DELETE CASCADE, so all of the user's MoodPals data is removed with it.
Deno.serve(async req=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
  const bearer=req.headers.get("Authorization")||"";
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!bearer.startsWith("Bearer ")||!url||!anon||!service)return out({error:"Unauthorized"},401);
  const {data:{user},error}=await createClient(url,anon,noSession).auth.getUser(bearer.slice(7));
  if(error||!user)return out({error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  if(body?.confirm!==true)return out({error:"Confirmation required"},400);
  const {error:deleteError}=await createClient(url,service,noSession).auth.admin.deleteUser(user.id);
  if(deleteError){console.error("delete-account failed",deleteError.message);return out({error:"Could not delete the account."},500);}
  return out({deleted:true});
 }catch(e){console.error("delete-account exception",e instanceof Error?e.message:String(e));return out({error:"Could not delete the account."},500);}
});
