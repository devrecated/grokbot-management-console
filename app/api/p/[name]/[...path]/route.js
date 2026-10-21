// Plugin API: /api/p/<name>/<path...> goes to plugins/<name>/api.js GET/POST/PUT(req, {q, path}). Off plugins answer 404.
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { plugin, isOn } from "@/plugins";
export const dynamic="force-dynamic";
const go=m=>async(req,{params})=>{ const {name,path}=await params, p=plugin(name), q=sql();
  if(!p?.api?.[m]||!isOn(p,await getSettings(q))) return Response.json({error:"not found"},{status:404});
  return p.api[m](req,{q,path:path||[]}); };
export const GET=go("GET"), POST=go("POST"), PUT=go("PUT");
