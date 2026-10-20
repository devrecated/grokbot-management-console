// Dashboard settings, one row in Neon `config` (key 'settings'). Add new keys to DEFAULTS.
export const DEFAULTS={always_reply_in_chat:false};
export async function getSettings(q){
  await q`create table if not exists config(key text primary key, value jsonb not null, updated_at timestamptz default now())`;
  const [c]=await q`select value from config where key='settings'`;
  return {...DEFAULTS,...(c?.value||{})};
}
export async function saveSettings(q,patch){
  const cur=await getSettings(q); const next={...cur};
  for(const k of Object.keys(DEFAULTS)) if(k in patch&&typeof patch[k]===typeof DEFAULTS[k]) next[k]=patch[k];
  await q`insert into config(key,value,updated_at) values('settings',${JSON.stringify(next)}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`;
  return next;
}
