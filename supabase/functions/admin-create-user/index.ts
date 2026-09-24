import { withSupabase } from "npm:@supabase/server@^1";

function json(data: unknown, status = 200) { return Response.json(data, { status }); }
function permissionsOf(value: unknown) {
  const out: Record<string, boolean> = {};
  if (value == null) return out;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid permissions");
  for (const [key, enabled] of Object.entries(value)) {
    if (!/^slide_[1-9][0-9]*$/.test(key) && !["planning_upload","fabric","sewing","production","admin_settings","user_admin"].includes(key)) throw new Error("Unknown permission");
    if (typeof enabled !== "boolean") throw new Error("Permission values must be true or false");
    out[key] = enabled;
  }
  return out;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      // userClaims contains id; sub belongs to the raw jwtClaims object.
      const callerId = ctx.userClaims?.id;
      if (!callerId) return json({ success:false, error:"Unauthorized user." },401);
      const db = ctx.supabaseAdmin;
      const {data:admin,error:adminError} = await db.from("site_users")
        .select("id,email,role,status,auth_user_id").eq("auth_user_id",callerId).maybeSingle();
      if (adminError) throw adminError;
      if (!admin || String(admin.role).toLowerCase()!=="admin" || String(admin.status).toLowerCase()!=="active")
        return json({success:false,error:"Only an Active Admin can manage users."},403);
      const body = await req.json();
      const action = String(body.action || "create").toLowerCase();
      if (!["create","update","delete"].includes(action)) return json({success:false,error:"Unknown action."},400);

      if (action === "delete" || action === "update") {
        if (!body.site_user_id) return json({success:false,error:"site_user_id is required."},400);
        const {data:target,error} = await db.from("site_users").select("id,email,role,status,auth_user_id")
          .eq("id",body.site_user_id).maybeSingle();
        if (error) throw error;
        if (!target) return json({success:false,error:"User not found in site_users."},404);
        if (action === "update") {
          const role=String(body.role||"").toLowerCase(),status=String(body.status||"").toLowerCase();
          if (!["admin","user"].includes(role)||!["active","disabled"].includes(status))
            return json({success:false,error:"Invalid role or status."},400);
          const permissions=permissionsOf(body.permissions);
          const {error:updateError}=await db.from("site_users").update({role,status,permissions}).eq("id",target.id);
          if(updateError)throw updateError;
          return json({success:true,action:"updated",site_user_id:target.id});
        }
        const email=String(target.email||"").trim().toLowerCase();
        if (body.email && String(body.email).trim().toLowerCase()!==email)
          return json({success:false,error:"User email does not match the selected record."},400);
        if (String(target.auth_user_id)===String(callerId)||email===String(ctx.userClaims?.email||"").toLowerCase())
          return json({success:false,error:"You cannot remove your own logged-in Admin account."},400);
        if(target.auth_user_id){
          const {error:authError}=await db.auth.admin.deleteUser(String(target.auth_user_id),false);
          if(authError)throw authError;
        }
        const {error:deleteError}=await db.from("site_users").delete().eq("id",target.id);
        if(deleteError)throw deleteError;
        return json({success:true,action:"deleted",email,auth_deleted:Boolean(target.auth_user_id)});
      }

      const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
      const role=String(body.role||"user").toLowerCase(),status=String(body.status||"active").toLowerCase();
      if(!email.includes("@")||password.length<6)return json({success:false,error:"Valid email and password of at least 6 characters are required."},400);
      if(!["admin","user"].includes(role)||!["active","disabled"].includes(status))
        return json({success:false,error:"Invalid role or status."},400);
      const permissions=permissionsOf(body.permissions);
      const {data:existing,error:existingError}=await db.from("site_users")
        .select("id,email,auth_user_id").eq("email",email).maybeSingle();
      if(existingError)throw existingError;
      let authUserId=existing?.auth_user_id?String(existing.auth_user_id):"";
      let created=false;
      if(authUserId){
        // Preserve the existing create/repair behavior for a linked account.
        const {error}=await db.auth.admin.updateUserById(authUserId,{password,email_confirm:true,user_metadata:{role}});
        if(error)throw error;
      }else{
        const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role}});
        if(error)throw error;
        if(!data?.user?.id)throw new Error("Supabase did not return the new Auth User ID.");
        authUserId=data.user.id;created=true;
      }
      const payload={email,role,status,auth_user_id:authUserId,...(body.permissions==null?{}:{permissions})};
      const result=existing?.id
        ? await db.from("site_users").update(payload).eq("id",existing.id)
        : await db.from("site_users").insert(payload);
      if(result.error){
        if(created){
          const {error:rollbackError}=await db.auth.admin.deleteUser(authUserId,false);
          if(rollbackError)throw new Error("Profile save failed and Auth cleanup failed. Contact Admin before retrying. "+result.error.message);
        }
        throw new Error("site_users save failed: "+result.error.message);
      }
      return json({success:true,action:created?"new-user-created":"existing-user-confirmed",email,auth_user_id:authUserId});
    }catch(error){
      console.error("admin-create-user error:",error);
      return json({success:false,error:error instanceof Error?error.message:String(error)},500);
    }
  }),
};
