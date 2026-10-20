// Shared Grok Bot webhook forwarder. Config comes from the database `config` table (key grokbot_webhook); env fallback only if valid.
export async function getWebhook(q){
  let url="", key="";
  try{ await q`create table if not exists config(key text primary key, value jsonb not null, updated_at timestamptz default now())`;
    const [c]=await q`select value from config where key='grokbot_webhook'`; url=String(c?.value?.url||"").trim(); key=String(c?.value?.key||"").replace(/[\r\n]/g,"").trim(); }
  catch(e){ console.error("[webhook] config read failed", e?.message); }
  if(!url.startsWith("https://")||!key){ const eu=(process.env.GROKBOT_WEBHOOK_URL||"").trim(), ek=(process.env.GROKBOT_WEBHOOK_KEY||"").replace(/[\r\n]/g,"").trim();
    if(eu.startsWith("https://")&&ek){url=eu;key=ek;} else {url="";key="";} }
  return {url,key};
}
export async function forward(q, payload){
  const {url,key}=await getWebhook(q);
  if(!url||!key) return {delivered:false, reason:"webhook not configured"};
  try{
    const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    if(r.ok) return {delivered:true, reason:null};
    console.error("[webhook] non-2xx", r.status, (await r.text().catch(()=>"")).slice(0,200));
    return {delivered:false, reason:`webhook ${r.status}`};
  }catch(e){
    const c=e?.cause; const reason=`webhook unreachable: ${e?.name||"Error"}${c?.code?` ${c.code}`:""}${(c?.message||e?.message)?` - ${String(c?.message||e?.message).replaceAll(key,"[key]").slice(0,160)}`:""}`;
    console.error("[webhook] fetch failed", reason); return {delivered:false, reason};
  }
}
