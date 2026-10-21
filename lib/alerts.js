// Email alerts for routine runs. One path: SMTP via nodemailer. Env: SMTP_URL (smtp[s]://user:pass@host:port), ALERT_FROM.
// Recipient, on/off and templates live in Settings. A run alerts at most once (runs.alerted_at).
import nodemailer from "nodemailer";
import { DEMO } from "@/lib/db";
import { DEFAULT_TEMPLATES, VARS, render, templates } from "@/lib/alert-templates";
export { DEFAULT_TEMPLATES, VARS, render, templates };
export const provider=()=>process.env.SMTP_URL?{kind:"smtp",from:process.env.ALERT_FROM||"grugbot@localhost"}:null;
export function message(s,kind,vars){
  const t=templates(s), p=kind==="ok"?"alert_ok":"alert_fail";
  return {subject:render(t[p+"_subject"],vars,false).slice(0,300),html:render(t[p+"_html"],vars,true),
    text:`${vars.routine} (${vars.bot}): ${vars.status} at ${vars.time}. ${vars.error||""}\n${vars.link}`};
}
export async function send(to,msg){
  const p=provider(); if(!p) return {sent:false,reason:"no email provider configured (set SMTP_URL and ALERT_FROM)"};
  if(DEMO) return {sent:false,reason:"demo mode never sends email"};
  try{ const t=nodemailer.createTransport(process.env.SMTP_URL,{connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000});
    const r=await t.sendMail({from:p.from,to,...msg}); return {sent:true,id:r.messageId}; }
  catch(e){ return {sent:false,reason:`smtp error: ${e.code||e.name}`}; }
}
// Called after a run is stored. Claims the run (alerted_at) first so retries and duplicates never send twice.
export async function alertRun(q,s,run,origin){
  if(!s.alert_emails||!s.alert_to||!provider()) return null;
  const kind=run.status==="error"?"fail":run.status==="ok"&&s.alert_on_success?"ok":null; if(!kind) return null;
  const [c]=await q`update runs set alerted_at=now() where id=${run.id} and alerted_at is null returning id`; if(!c) return null;
  const [r]=await q`select name from routines where routine_id=${run.routine_id}`;
  const vars={routine:r?.name||run.routine_id,bot:run.bot,status:run.status,error:run.summary||"",link:`${origin}/?routine=${encodeURIComponent(run.routine_id)}`,
    time:new Date(run.ts).toLocaleString("en-US",{timeZone:s.timezone,year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})};
  const res=await send(s.alert_to,message(s,kind,vars));
  return res;
}
