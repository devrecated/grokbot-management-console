// Owner bot sends a routine's current prompt (answer to fetch_prompt). Bearer ROUTINE_LOG_TOKEN + bypass. Stored only in Neon.
import { sql, ensure, ensureMessages, authed } from "@/lib/db";
export const dynamic="force-dynamic";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const b=await req.json().catch(()=>({})); const prompt=typeof b.prompt==="string"?b.prompt:"";
  if(!prompt.trim()||prompt.length>20000) return Response.json({error:"prompt must be 1-20000 characters"},{status:400});
  const q=sql(); await ensure(q); await ensureMessages(q);
  const [r]=await q`update routines set prompt_text=${prompt}, prompt_fetched_at=now(), prompt_requested_at=null where routine_id=${b.routine_id||""} returning routine_id,name,bot`;
  if(!r) return Response.json({error:"unknown routine"},{status:404});
  await q`insert into messages(thread_id,role,text,bot,routine_id) values(${`routine:${r.routine_id}`},'grokbot',${`Prompt for ${r.name} sent to the dashboard (${prompt.length} chars).`},${r.bot},${r.routine_id})`;
  return Response.json({ok:true,chars:prompt.length});
}
