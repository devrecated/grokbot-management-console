// Settings > "Send test email" (Vercel Authentication protects it). Uses the templates in the request body so unsaved edits can be tried.
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { message, send, provider } from "@/lib/alerts";
export const dynamic="force-dynamic";
export async function GET(){ const p=provider(); return Response.json({configured:!!p,kind:p?.kind||null,from:p?.from||null}); }
export async function POST(req){
  const b=await req.json().catch(()=>({})), s={...(await getSettings(sql())),...Object.fromEntries(Object.entries(b).filter(([k,v])=>k.startsWith("alert_")&&typeof v==="string"))};
  if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s.alert_to||"")) return Response.json({sent:false,reason:"set a recipient first"},{status:400});
  const vars={routine:"Morning digest",bot:"bot-a",status:b.kind==="ok"?"ok":"error",time:new Date().toLocaleString("en-US",{timeZone:s.timezone,year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}),
    error:b.kind==="ok"?"Sent 3 items.":"Test alert: this is what a failure email looks like.",link:new URL(req.url).origin};
  const m=message(s,b.kind==="ok"?"ok":"fail",vars); m.subject="[test] "+m.subject;
  return Response.json(await send(s.alert_to,m));
}
