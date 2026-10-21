// Worker tasks: a queue in Postgres, picked up by grugbox on its normal pass (no extra wakes), signed with TASK_KEY.
//   GET  /api/p/worker-tasks/runs            catalog (what the box says it can run) + last 50 runs
//   GET  /api/p/worker-tasks/runs?id=&after= one run + its output chunks after seq
//   POST /api/p/worker-tasks/runs {task,args} queue a run (dashboard)
//   PUT  /api/p/worker-tasks/box  (Bearer)   box reports running / output chunk / done / failed
// onShip() rides on the box's normal log ship: stores the box's task catalog, hands over one queued run.
import crypto from "crypto";
import { authed } from "@/lib/db";
import { checkArgs } from "./args.js";
import TASKS from "./tasks/tasks.json";
const EXPIRE_MIN=10, MAX_OUT=64*1024;
const key=()=>process.env.TASK_KEY||"";
export const sign=(k,r)=>crypto.createHmac("sha256",k).update(`${r.id}.${r.task}.${r.args}.${r.exp}.${r.nonce}`).digest("hex");
let ready=false;
export async function ensure(q){ if(ready) return;
  await q`create table if not exists task_runs(id bigserial primary key, task text not null, args jsonb not null default '{}', state text not null default 'queued' check (state in ('queued','running','done','failed','expired')),
    nonce text not null, exp timestamptz not null, instance_id text, exit_code integer, note text, created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz)`;
  await q`create table if not exists task_output(run_id bigint not null, seq integer not null, ts timestamptz not null default now(), text text not null, primary key(run_id,seq))`;
  await q`create index if not exists task_runs_state on task_runs(state, id)`;
  ready=true; }
const catalog=async q=>(await q`select value from config where key='task_catalog'`)[0]?.value||{tasks:[]};
export async function onShip(q,{iid,body}){
  await ensure(q);
  if(Array.isArray(body?.tasks)){ const t=body.tasks.slice(0,100).map(x=>({plugin:String(x.plugin||"").slice(0,40),name:String(x.name||"").slice(0,40),description:String(x.description||"").slice(0,300),timeout_s:Number(x.timeout_s)||30,args:Array.isArray(x.args)?x.args.slice(0,10):[]})).filter(x=>/^[a-z0-9-]+$/.test(x.name));
    const v=JSON.stringify({tasks:t,instance_id:iid,at:new Date().toISOString()}); if(v.length<100000) await q`insert into config(key,value,updated_at) values('task_catalog',${v}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`; }
  await q`update task_runs set state='expired', finished_at=now() where state='queued' and exp < now()`;
  await q`update task_runs set state='failed', note='box stopped reporting', finished_at=now() where state='running' and started_at < now() - interval '30 minutes'`;
  const [r]=await q`select id::text id, task, args::text args, extract(epoch from exp)::bigint exp, nonce from task_runs where state='queued' order by id limit 1`;
  if(!r||!key()) return {};
  const t={id:r.id,task:r.task,args:r.args,exp:Number(r.exp),nonce:r.nonce}; return {task:{...t,sig:sign(key(),t)}};
}
export async function GET(req,{q}){
  await ensure(q); const p=new URL(req.url).searchParams, id=parseInt(p.get("id"))||0;
  if(id){ const [run]=await q`select * from task_runs where id=${id}`; if(!run) return Response.json({error:"no such run"},{status:404});
    const out=await q`select seq, ts, text from task_output where run_id=${id} and seq > ${parseInt(p.get("after"))||0} order by seq`; return Response.json({run,out}); }
  const runs=await q`select id, task, args, state, exit_code, note, created_at, started_at, finished_at, instance_id from task_runs order by id desc limit 50`;
  return Response.json({catalog:await catalog(q),runs,signing:!!key()});
}
export async function POST(req,{q}){
  await ensure(q); const b=await req.json().catch(()=>({}));
  if(!key()) return Response.json({error:"TASK_KEY is not set in the dashboard env, so tasks cannot be signed"},{status:400});
  const def=(await catalog(q)).tasks.find(t=>t.name===b.task); if(!def) return Response.json({error:"the box has not listed that task"},{status:400});
  const c=checkArgs(def,b.args); if(c.error) return Response.json({error:c.error},{status:400});
  if((await q`select 1 from task_runs where state in ('queued','running')`).length>=3) return Response.json({error:"3 runs already waiting; let them finish"},{status:429});
  const [r]=await q`insert into task_runs(task,args,nonce,exp) values(${def.name},${JSON.stringify(c.args)}::jsonb,${crypto.randomBytes(12).toString("hex")},now()+make_interval(mins=>${EXPIRE_MIN})) returning id`;
  return Response.json({ok:true,id:r.id});
}
export async function PUT(req,{q,path}){
  if(path[0]!=="box") return Response.json({error:"not found"},{status:404});
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  await ensure(q); const b=await req.json().catch(()=>({})), id=parseInt(b.id)||0, n=String(b.nonce||"");
  const [run]=await q`select id, state from task_runs where id=${id} and nonce=${n}`; if(!run) return Response.json({error:"no such run"},{status:404});
  if(b.state==="running"&&run.state==="queued") await q`update task_runs set state='running', started_at=now(), instance_id=${String(b.instance_id||"").slice(0,64)} where id=${id}`;
  if(typeof b.text==="string"&&b.text&&Number.isInteger(b.seq)&&["running","queued"].includes(run.state)){
    const [{n:used}]=await q`select coalesce(sum(length(text)),0)::int n from task_output where run_id=${id}`;
    if(used<MAX_OUT) await q`insert into task_output(run_id,seq,text) values(${id},${b.seq},${b.text.replace(/\u0000/g,"").slice(0,MAX_OUT-used)}) on conflict do nothing`; }
  if(["done","failed"].includes(b.state)&&["queued","running"].includes(run.state))
    await q`update task_runs set state=${b.state}, exit_code=${Number.isInteger(b.exit_code)?b.exit_code:null}, note=${b.note?String(b.note).slice(0,300):null}, started_at=coalesce(started_at,now()), finished_at=now() where id=${id}`;
  if(Math.random()<0.05){ await q`delete from task_output where run_id in (select id from task_runs where created_at < now() - interval '30 days')`; await q`delete from task_runs where created_at < now() - interval '30 days'`; }
  return Response.json({ok:true});
}
// DEMO_MODE seed: what a real box would have sent, plus a few finished runs.
export async function demo(q){
  await ensure(q);
  const tasks=TASKS.tasks.map(({script,...t})=>({plugin:"worker-tasks",...t}));
  await q`insert into config(key,value) values('task_catalog',${JSON.stringify({tasks,instance_id:"demo",at:new Date().toISOString()})}::jsonb) on conflict(key) do nothing`;
  const ago=m=>new Date(Date.now()-m*60e3).toISOString();
  const R=[["disk-usage",{},"done",0,300,"Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        98G   41G   53G  44% /\n\n412M\t/home/grug/grugbot-console\n9.1M\t/home/grug/grugbot-console/logs\n"],
    ["list-processes",{},"done",0,120,"    PID %CPU %MEM     ELAPSED COMMAND\n   2210 12.4  3.1    05:12:40 node\n   2291  4.0  1.2    05:12:31 chrome\n    911  0.3  0.0    05:13:02 grugbox\n      1  0.0  0.0    05:13:10 tini\n"],
    ["tail-log",{file:"collector.out",lines:5},"done",0,45,"shipped 12 of 12 new lines\nbots: 3 profiles, 4 events, 2 token rows shipped\nshipped 0 of 0 new lines\nshipped 7 of 7 new lines\nbots: 3 profiles, 1 events, 0 token rows shipped\n"],
    ["restart-agent",{},"done",0,20,"restart requested; grugbox re-execs after this run is reported\n"],
    ["tail-log",{file:"dpkg.log",lines:20},"failed",1,10,"dpkg.log: not found on this box\n"]];
  for(const [t,a,s,e,m,o] of R){ const [r]=await q`insert into task_runs(task,args,state,nonce,exp,instance_id,exit_code,created_at,started_at,finished_at) values(${t},${JSON.stringify(a)}::jsonb,${s},'demo',${ago(m-10)},'demo',${e},${ago(m)},${ago(m-0.5)},${ago(m-0.6)}) returning id`;
    await q`insert into task_output(run_id,seq,text) values(${r.id},1,${o})`; }
}
