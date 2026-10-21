import { CONFIGS } from "../plugins/config.gen.js";
// Dashboard settings: one row in `config` (key 'settings'). Add new keys to DEFAULTS and, if they need limits, to RULES.
// Plugins add their own keys from plugins/<name>/config.js (DEFAULTS, RULES); they are merged in below.
// Empty template strings mean "use the default template" (lib/alerts.js).
export const SHIP_INTERVALS=[15,30,60,300,600], HEARTBEAT_INTERVALS=[30,60,300,600], RETENTION_DAYS=[1,3,7,14,30], STALE_MINUTES=[2,5,10,30,60];
export const DEFAULTS={
  ship_interval_s:60, heartbeat_interval_s:60, log_retention_days:7, stale_box_minutes:10,
  timezone:"America/New_York",
  alert_emails:false, alert_on_success:false, alert_to:"",
  alert_fail_subject:"", alert_fail_html:"", alert_ok_subject:"", alert_ok_html:"",
  live_minutes:5,
  // plugin on/off: {name:true|false}. Missing = the plugin.json default.
  plugins:{},
};
for(const c of Object.values(CONFIGS)) Object.assign(DEFAULTS,c.DEFAULTS);
const validTz=t=>{ try{ new Intl.DateTimeFormat("en-US",{timeZone:t}); return true; }catch{ return false; } };
const RULES={
  ship_interval_s:v=>SHIP_INTERVALS.includes(v), heartbeat_interval_s:v=>HEARTBEAT_INTERVALS.includes(v),
  log_retention_days:v=>RETENTION_DAYS.includes(v), stale_box_minutes:v=>STALE_MINUTES.includes(v),
  timezone:v=>v.length<64&&validTz(v), alert_to:v=>v===""||(/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v)&&v.length<200),
  alert_fail_subject:v=>v.length<=300, alert_ok_subject:v=>v.length<=300, alert_fail_html:v=>v.length<=20000, alert_ok_html:v=>v.length<=20000,
  live_minutes:v=>[2,5,10].includes(v),
  ...Object.assign({},...Object.values(CONFIGS).map(c=>c.RULES||{})),
  plugins:v=>v&&!Array.isArray(v)&&Object.keys(v).length<=50&&Object.entries(v).every(([k,x])=>/^[a-z0-9-]{2,40}$/.test(k)&&typeof x==="boolean"),
};
export async function getSettings(q){
  await q`create table if not exists config(key text primary key, value jsonb not null, updated_at timestamptz default now())`;
  const [c]=await q`select value from config where key='settings'`;
  return {...DEFAULTS,...(c?.value||{})};
}
export async function saveSettings(q,patch){
  const cur=await getSettings(q); const next={...cur}, bad=[];
  for(const k of Object.keys(DEFAULTS)) if(k in patch){
    const v=patch[k];
    if(typeof v===typeof DEFAULTS[k]&&(!RULES[k]||RULES[k](v))) next[k]=v; else bad.push(k);
  }
  await q`insert into config(key,value,updated_at) values('settings',${JSON.stringify(next)}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`;
  return bad.length?{...next,_rejected:bad}:next;
}
