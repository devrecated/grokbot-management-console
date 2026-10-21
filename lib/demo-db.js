// In-memory Postgres (PGlite) for DEMO_MODE, filled from demo-fixtures.js on first use.
// The real queries run against it unchanged. Writes from the browser never reach here (see middleware.js).
import { PGlite } from "@electric-sql/pglite";
import * as F from "./demo-fixtures.js";
import { ensure, ensureMessages, ensureLogs, ensureBots, ensureHeartbeats } from "./db.js";
let rnd=7; const r=()=>((rnd=(rnd*1103515245+12345)%2147483648)/2147483648);
const pick=a=>a[Math.floor(r()*a.length)];
const ago=m=>new Date(Date.now()-m*60000).toISOString();
export async function open(){
  const db=new PGlite();
  const q=(s,...v)=>db.query(s.reduce((a,x,i)=>a+"$"+i+x),v).then(x=>x.rows);
  await ensure(q); await ensureMessages(q); await ensureLogs(q); await ensureBots(q); await ensureHeartbeats(q);
  for(const b of F.bots) await q`insert into bots(key,name,title,description,color) values(${b.key},${b.name},${b.title},${b.description},${b.color})`;
  for(const x of F.routines) await q`insert into routines(routine_id,bot,bot_id,name,schedule_or_trigger,purpose,status,prompt_text,prompt_fetched_at,updated_at)
    values(${x.routine_id},${x.bot},${x.bot_id},${x.name},${x.schedule_or_trigger},${x.purpose},${x.status},${x.prompt_text||null},${x.prompt_text?ago(600):null},${ago(5000)})`;
  // runs: a week of history
  const runs=[];
  for(const x of F.routines){ const every=x.routine_id==="rt_demo_triage"?30:x.routine_id==="rt_demo_ci"?180:x.routine_id==="rt_demo_deep"||x.routine_id==="rt_demo_digest"?4000:1440;
    for(let m=10+Math.floor(r()*every); m<7*1440; m+=every){ if(x.status==="paused"&&m<2000) continue;
      const s=r(); runs.push([ago(m),x.bot,x.routine_id,s<0.86?"ok":s<0.95?"error":"skipped",pick(F.summaries[x.routine_id]),Math.round(20+r()*(x.routine_id==="rt_demo_deep"?1500:300))]); } }
  await q`insert into runs(ts,bot,routine_id,status,summary,duration_s) select * from unnest(${runs.map(x=>x[0])}::timestamptz[],${runs.map(x=>x[1])}::text[],${runs.map(x=>x[2])}::text[],${runs.map(x=>x[3])}::text[],${runs.map(x=>x[4])}::text[],${runs.map(x=>x[5])}::int[]) on conflict do nothing`;
  // estimated tokens: a few model calls inside each run's window, like the box would ship (sizes only)
  const key=Object.fromEntries(F.bots.map(b=>[b.name,b.key])), tk={};
  for(const x of runs){ const n=2+Math.floor(r()*(x[5]/40)), mdl=x[2]==="rt_demo_deep"?"example-model-large":"example-model-small";
    const k=new Date(Math.floor(new Date(x[0])/60e3)*60e3).toISOString()+"|"+key[x[1]]+"|"+mdl, t=tk[k]??=[0,0,0]; t[0]+=n; t[1]+=n*(9000+Math.floor(r()*30000)); t[2]+=n*(300+Math.floor(r()*1500)); }
  const TK=Object.entries(tk).map(([k,v])=>[...k.split("|"),...v]);
  await q`insert into token_usage(minute,bot,model,calls,input,output) select * from unnest(${TK.map(x=>x[0])}::timestamptz[],${TK.map(x=>x[1])}::text[],${TK.map(x=>x[2])}::text[],${TK.map(x=>x[3])}::int[],${TK.map(x=>x[4])}::bigint[],${TK.map(x=>x[5])}::bigint[])`;
  for(const t of F.threads) for(const [role,m,text] of t.msgs) await q`insert into messages(thread_id,role,text,bot,routine_id,delivered,created_at) values(${t.thread_id},${role},${text},${t.bot},${t.routine_id},${true},${ago(m)})`;
  // bot activity: tool names and times only, like the real feed
  const ev=[]; for(let i=0;i<600;i++){ const b=pick(F.bots); ev.push([ago(r()*7*1440),b.key,"tool",pick(F.tools),pick(["Research Bot","Inbox Bot","Deploy Bot","Garden Bot"])]); }
  await q`insert into bot_events(ts,bot,kind,tool,target) select * from unnest(${ev.map(x=>x[0])}::timestamptz[],${ev.map(x=>x[1])}::text[],${ev.map(x=>x[2])}::text[],${ev.map(x=>x[3])}::text[],${ev.map(x=>x[4])}::text[])`;
  // logs: about 3000 lines over two days, newest first in the viewer
  const lg=[]; for(let i=0;i<3000;i++){ const [src,lvl]=r()<0.9?pick(F.logSources.slice(0,6)):pick(F.logSources.slice(6)); const m=r()*2*1440;
    lg.push([ago(m),src,lvl,pick(F.logLines[src]),m<2900?F.instances[0].instance_id:F.instances[1].instance_id]); }
  lg.sort((a,b)=>a[0]<b[0]?-1:1);
  await q`insert into logs(ts,source,level,message,instance_id) select * from unnest(${lg.map(x=>x[0])}::timestamptz[],${lg.map(x=>x[1])}::text[],${lg.map(x=>x[2])}::text[],${lg.map(x=>x[3])}::text[],${lg.map(x=>x[4])}::text[])`;
  for(const h of F.instances) await q`insert into heartbeats(instance_id,machine_id,hostname,boot_time,version,first_seen,last_ping) values(${h.instance_id},${h.machine_id},${h.hostname},${ago(h.bootMinAgo)},${h.version},${ago(h.bootMinAgo)},${ago(h.pingMinAgo)})`;
  for(const h of F.instances){ await q`update heartbeats set os_info=${JSON.stringify(h.os)}::jsonb where instance_id=${h.instance_id}`;
    // one CPU/memory sample a minute while the box was up: a quiet base with routine bursts
    // two VM sleeps per session (no samples, then a clock jump), like a paused and resumed box
    const nap=[[h.bootMinAgo-400,h.bootMinAgo-560],[h.bootMinAgo-1500,h.bootMinAgo-1620]];
    const sm=[]; for(let m=h.bootMinAgo; m>=h.pingMinAgo; m-=1){ if(nap.some(([a,b])=>m<=a&&m>b)) continue; const burst=(m%180)<6||(m%1440)<25; sm.push([ago(m),Math.round((burst?35+r()*50:2+r()*8)*10)/10,Math.round(1800+(burst?2500:0)+r()*400+(h.bootMinAgo-m)*0.15),h.os.ram_mb,Math.round((burst?1.5+r()*2:0.1+r()*0.3)*100)/100]); }
    await q`insert into box_samples(instance_id,ts,cpu,mem_used_mb,mem_total_mb,load1) select ${h.instance_id}, * from unnest(${sm.map(x=>x[0])}::timestamptz[],${sm.map(x=>x[1])}::real[],${sm.map(x=>x[2])}::int[],${sm.map(x=>x[3])}::int[],${sm.map(x=>x[4])}::real[])`;
    await q`update box_samples set agent_cpu=round((0.05+random()*0.3)::numeric,2), agent_rss_mb=round((8+random()*3)::numeric,1), agent_pass_ms=(120+random()*200)::int where instance_id=${h.instance_id}`;
    for(const [a,b] of nap) await q`update box_samples set slept_s=${(a-b)*60} where instance_id=${h.instance_id} and ts=(select min(ts) from box_samples where instance_id=${h.instance_id} and ts>=${ago(b)})`; }
  await q`insert into config(key,value) values('settings',${JSON.stringify(F.settings)}::jsonb)`;
  const catalog={tracked:[{source:"journalctl",what:"System journal"},{source:"dmesg",what:"Kernel messages"},{source:"ss -s",what:"Network summary, counts only"},{source:"Grok Bot process output",what:"Routine start, finish and retry lines"},{source:"routine-log",what:"The shipper itself"}],
    excluded:[{what:"Shell histories",why:"Can hold commands and secrets"},{what:"Agent transcripts",why:"Private conversation content"},{what:".env and token files",why:"Secrets"}],notes:"Demo data. Nothing here is real."};
  await q`insert into config(key,value) values('log_catalog',${JSON.stringify(catalog)}::jsonb)`;
  return db;
}
