// Dashboard settings: one row in `config` (key 'settings'). Add new keys to DEFAULTS and, if they need limits, to RULES.
// Empty template strings mean "use the default template" (lib/alerts.js).
export const SHIP_INTERVALS=[15,30,60,300,600], HEARTBEAT_INTERVALS=[30,60,300,600], RETENTION_DAYS=[1,3,7,14,30], STALE_MINUTES=[2,5,10,30,60];
export const DEFAULTS={
  always_reply_in_chat:false,
  ship_interval_s:60, heartbeat_interval_s:60, log_retention_days:7, stale_box_minutes:10,
  timezone:"America/New_York",
  alert_emails:false, alert_on_success:false, alert_to:"",
  alert_fail_subject:"", alert_fail_html:"", alert_ok_subject:"", alert_ok_html:"",
  cost_per_run:0, cost_per_action:0, cost_per_run_minute:0, currency:"USD",
  // Your own prices per 1M tokens, per model: [{model, input, output}]. Empty until you set them; nothing is assumed.
  token_prices:[],
  live_minutes:5,
};
const validTz=t=>{ try{ new Intl.DateTimeFormat("en-US",{timeZone:t}); return true; }catch{ return false; } };
const RULES={
  ship_interval_s:v=>SHIP_INTERVALS.includes(v), heartbeat_interval_s:v=>HEARTBEAT_INTERVALS.includes(v),
  log_retention_days:v=>RETENTION_DAYS.includes(v), stale_box_minutes:v=>STALE_MINUTES.includes(v),
  timezone:v=>v.length<64&&validTz(v), alert_to:v=>v===""||(/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v)&&v.length<200),
  alert_fail_subject:v=>v.length<=300, alert_ok_subject:v=>v.length<=300, alert_fail_html:v=>v.length<=20000, alert_ok_html:v=>v.length<=20000,
  cost_per_run:v=>v>=0&&v<1e6, cost_per_action:v=>v>=0&&v<1e6, cost_per_run_minute:v=>v>=0&&v<1e6, currency:v=>/^[A-Z]{3}$/.test(v),
  token_prices:v=>Array.isArray(v)&&v.length<=50&&v.every(p=>p&&typeof p.model==="string"&&p.model.length>0&&p.model.length<=60&&[p.input,p.output].every(n=>typeof n==="number"&&n>=0&&n<1e6)),
  live_minutes:v=>[2,5,10].includes(v),
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
