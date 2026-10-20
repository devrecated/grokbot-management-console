// Plain Postgres through node-postgres. Any Postgres works: Neon, Supabase, RDS, a box in your closet.
// sql() returns a tagged template: await q`select * from t where id=${id}` gives an array of rows.
// DEMO_MODE=1 swaps in an in-memory Postgres (PGlite) seeded from lib/demo-fixtures.js. No DATABASE_URL needed.
import pg from "pg";
export const DEMO = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
let pool, demo;
function sslFor(url){
  // sslmode in the URL wins. DATABASE_SSL=no-verify for self-signed certs, DATABASE_SSL=off for local Postgres.
  const m=process.env.DATABASE_SSL;
  if(m==="off") return false;
  if(m==="no-verify") return {rejectUnauthorized:false};
  if(/sslmode=disable/.test(url)) return false;
  if(/sslmode=/.test(url)) return undefined;
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)?false:{rejectUnauthorized:true};
}
function getPool(){
  if(pool) return pool;
  const url=process.env.DATABASE_URL||""; const ssl=sslFor(url);
  // sslmode=require means "encrypt, check the cert" in node-postgres; strip it when we set ssl ourselves.
  const cs=ssl===undefined?url:url.replace(/([?&])sslmode=[^&]*&?/,"$1").replace(/[?&]$/,"");
  pool=new pg.Pool({connectionString:cs, ...(ssl===undefined?{}:{ssl}), max:3, idleTimeoutMillis:5000, connectionTimeoutMillis:10000});
  pool.on("error",e=>console.error("[db] pool error", e.message));
  return pool;
}
const toText=(strings)=>strings.reduce((a,s,i)=>a+"$"+i+s);
export function sql(){
  const run=DEMO?async(t,p)=>{ demo??=import("./demo-db.js").then(m=>m.open()); return (await (await demo).query(t,p)).rows; }
               :async(t,p)=>(await getPool().query(t,p)).rows;
  return (strings,...vals)=>run(toText(strings),vals.map(v=>v===undefined?null:v));
}
const done=new Set();
const once=(k,f)=>async q=>{ if(done.has(k)) return; await f(q); done.add(k); };
export const ensure=once("routines",async function(q){
  await q`create table if not exists routines(routine_id text primary key, bot text, bot_id text, name text, schedule_or_trigger text, purpose text, updated_at timestamptz)`;
  await q`create table if not exists runs(id bigserial primary key, ts timestamptz not null, bot text, routine_id text, status text check (status in ('ok','error','skipped')), summary text, unique(ts,bot,routine_id))`;
  await q`alter table routines add column if not exists status text not null default 'active'`;
  await q`alter table routines add column if not exists pending_action jsonb`;
  await q`alter table routines add column if not exists pending_since timestamptz`;
  await q`alter table routines add column if not exists prompt_text text`;
  await q`alter table routines add column if not exists prompt_fetched_at timestamptz`;
  await q`alter table routines add column if not exists prompt_requested_at timestamptz`;
});
export function authed(req){
  const t=process.env.ROUTINE_LOG_TOKEN; const h=req.headers.get("authorization")||"";
  return !!t && h===`Bearer ${t}`;
}
export const ensureMessages=once("Messages",async function(q){
  await q`create table if not exists messages(id bigserial primary key, thread_id text not null, role text not null check (role in ('user','grokbot')), text text not null, bot text, routine_id text, delivered boolean, created_at timestamptz not null default now())`;
  await q`alter table messages add column if not exists also_chat boolean`;
  // older installs named the human role differently; fold anything that is not grokbot into 'user'
  await q`alter table messages drop constraint if exists messages_role_check`;
  await q`update messages set role='user' where role not in ('user','grokbot')`;
  await q`alter table messages add constraint messages_role_check check (role in ('user','grokbot'))`;
  await q`create index if not exists messages_thread on messages(thread_id, created_at)`;
});
export const ensureLogs=once("Logs",async function(q){
  await q`create table if not exists logs(id bigserial primary key, ts timestamptz not null, source text not null, level text not null, message text not null)`;
  await q`create index if not exists logs_ts on logs(ts desc)`;
  await q`alter table logs add column if not exists instance_id text`;
  await q`create table if not exists config(key text primary key, value jsonb not null, updated_at timestamptz default now())`;
});
export const ensureBots=once("Bots",async function(q){
  await q`create table if not exists bots(key text primary key, name text, title text, description text, color text, updated_at timestamptz default now())`;
  await q`create table if not exists bot_events(id bigserial primary key, ts timestamptz not null, bot text not null, kind text, tool text, target text)`;
  await q`create index if not exists bot_events_bot_ts on bot_events(bot, ts desc)`;
});
// One row per box boot. Upserted on every ship; last_ping drives the top-bar status dot.
export const ensureHeartbeats=once("Heartbeats",async function(q){
  await q`create table if not exists heartbeats(instance_id text primary key, machine_id text, hostname text, boot_time timestamptz, version text, first_seen timestamptz default now(), last_ping timestamptz default now())`;
});
export async function heartbeat(q, i){
  if(!i||typeof i!=="object"||!/^[0-9a-f]{8,64}$/.test(i.instance_id||"")) return null;
  await ensureHeartbeats(q);
  const bt=Number(i.boot_time)>0?new Date(Number(i.boot_time)*1000).toISOString():null, mid=/^[0-9a-f]{8,64}$/.test(i.machine_id||"")?i.machine_id:null;
  await q`insert into heartbeats(instance_id,machine_id,hostname,boot_time,version) values(${i.instance_id},${mid},${String(i.hostname||"").slice(0,64)},${bt},${String(i.version||"").slice(0,40)})
    on conflict(instance_id) do update set last_ping=now(), hostname=excluded.hostname, version=excluded.version, machine_id=coalesce(excluded.machine_id,heartbeats.machine_id)`;
  await q`delete from heartbeats where last_ping < now() - interval '30 days'`;
  return i.instance_id;
}
