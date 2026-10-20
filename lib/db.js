import { neon } from "@neondatabase/serverless";
export const sql = () => neon(process.env.DATABASE_URL);
export async function ensure(q){
  await q`create table if not exists routines(routine_id text primary key, bot text, bot_id text, name text, schedule_or_trigger text, purpose text, updated_at timestamptz)`;
  await q`create table if not exists runs(id bigserial primary key, ts timestamptz not null, bot text, routine_id text, status text check (status in ('ok','error','skipped')), summary text, unique(ts,bot,routine_id))`;
  await q`alter table routines add column if not exists status text not null default 'active'`;
  await q`alter table routines add column if not exists pending_action jsonb`;
  await q`alter table routines add column if not exists pending_since timestamptz`;
}
export function authed(req){
  const t=process.env.ROUTINE_LOG_TOKEN; const h=req.headers.get("authorization")||"";
  return !!t && h===`Bearer ${t}`;
}
export async function ensureMessages(q){
  await q`create table if not exists messages(id bigserial primary key, thread_id text not null, role text not null check (role in ('user','grokbot')), text text not null, bot text, routine_id text, delivered boolean, created_at timestamptz not null default now())`;
  await q`alter table messages add column if not exists also_chat boolean`;
  await q`create index if not exists messages_thread on messages(thread_id, created_at)`;
}
export async function ensureLogs(q){
  await q`create table if not exists logs(id bigserial primary key, ts timestamptz not null, source text not null, level text not null, message text not null)`;
  await q`create index if not exists logs_ts on logs(ts desc)`;
  await q`create table if not exists config(key text primary key, value jsonb not null, updated_at timestamptz default now())`;
}
export async function ensureBots(q){
  await q`create table if not exists bots(key text primary key, name text, title text, description text, color text, updated_at timestamptz default now())`;
  await q`create table if not exists bot_events(id bigserial primary key, ts timestamptz not null, bot text not null, kind text, tool text, target text)`;
  await q`create index if not exists bot_events_bot_ts on bot_events(bot, ts desc)`;
}
