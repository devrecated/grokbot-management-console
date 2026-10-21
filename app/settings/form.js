"use client";
// Settings, saved one field at a time (templates on "Save"). Plain controls, no libs.
import { useState } from "react";
import { DEFAULT_TEMPLATES, render, templates } from "@/lib/alert-templates";
import TokenPrices from "./token-prices";
const TZS=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu","America/Sao_Paulo","UTC","Europe/London","Europe/Berlin","Europe/Warsaw","Africa/Johannesburg","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Australia/Sydney"];
const secs=v=>v<60?`${v} seconds`:v===60?"1 minute":`${v/60} minutes`;
const Row=({title,children,help})=><label className="srow"><span><b>{title}</b> {children}{help&&<div className="muted">{help}</div>}</span></label>;
const Sel=({v,opts,on,fmt=x=>x})=><select value={v} onChange={e=>on(isNaN(e.target.value)?e.target.value:Number(e.target.value))}>{opts.map(o=><option key={o} value={o}>{fmt(o)}</option>)}</select>;
export default function Form({initial,mail,models=[],plugins=[]}){
  const [s,setS]=useState(initial),[note,setNote]=useState(""),[kind,setKind]=useState("fail");
  const [t,setT]=useState(templates(initial)),[test,setTest]=useState("");
  async function save(patch){ setNote("Saving…"); const r=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
    if(r.ok){ const j=await r.json(); setS(j); setNote(j._rejected?"Not saved: "+j._rejected.join(", "):"Saved"); } else setNote("Save failed ("+r.status+")"); }
  const set=(k,v)=>save({[k]:v});
  const p=kind==="ok"?"alert_ok":"alert_fail";
  const vars={routine:"Morning digest",bot:"bot-a",status:kind==="ok"?"ok":"error",time:new Date().toLocaleString("en-US",{timeZone:s.timezone,year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}),error:kind==="ok"?"Sent 3 items.":"fetch failed: 502 from upstream",link:"#"};
  // Save "" when a template equals the default, so later default changes still reach it.
  const tplPatch=Object.fromEntries(Object.entries(t).map(([k,v])=>[k,v===DEFAULT_TEMPLATES[k]?"":v]));
  async function sendTest(){ setTest("Sending…"); const r=await fetch("/api/alerts/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...tplPatch,alert_to:s.alert_to,kind})});
    const j=await r.json().catch(()=>({})); setTest(j.sent?"Sent. Check the inbox.":"Not sent: "+(j.reason||r.status)); }
  return <div>
    <div className="bot"><h3>General</h3>
      <label className="srow"><input type="checkbox" checked={s.always_reply_in_chat} onChange={e=>set("always_reply_in_chat",e.target.checked)}/>
        <span><b>Always reply in Grok Bot chat</b><div className="muted">Mirror every chat reply and every pause, resume, schedule and trigger result to Grok Bot chat, as well as this dashboard.</div></span></label>
      <Row title="Show times in" help="Every time on the dashboard and in alert emails uses this zone. Schedules still run in the zone the routine was set up in.">
        <Sel v={s.timezone} opts={TZS.includes(s.timezone)?TZS:[s.timezone,...TZS]} on={v=>set("timezone",v)}/></Row></div>

    <div className="bot"><h3>Box</h3>
      <Row title="Ship logs from the box every" help="Shorter means fresher logs but keeps a serverless database (like Neon) awake more, which uses more of its free compute hours.">
        <Sel v={s.ship_interval_s} opts={[15,30,60,300,600]} fmt={secs} on={v=>set("ship_interval_s",v)}/></Row>
      <Row title="Send a heartbeat every" help="Heartbeat carries one CPU and memory sample for the Box page. Tiny, but it also wakes the database.">
        <Sel v={s.heartbeat_interval_s} opts={[30,60,300,600]} fmt={secs} on={v=>set("heartbeat_interval_s",v)}/></Row>
      <Row title="Call the box stale after" help="The top-bar dot turns grey when no heartbeat came in this long.">
        <Sel v={s.stale_box_minutes} opts={[2,5,10,30,60]} fmt={v=>`${v} minutes`} on={v=>set("stale_box_minutes",v)}/></Row>
      <Row title="Keep logs for" help="Older log lines are deleted on the next ship. Max 200k lines either way.">
        <Sel v={s.log_retention_days} opts={[1,3,7,14,30]} fmt={v=>`${v} day${v===1?"":"s"}`} on={v=>set("log_retention_days",v)}/></Row>
      <div className="muted">The box reads these at most every 5 minutes.</div></div>

    <div className="bot"><h3>Email alerts</h3>
      {!mail.configured&&<div className="warnbox">No email provider is set up, so nothing will be sent. Set <code>SMTP_URL</code> (like <code>smtps://user:pass@smtp.example.com:465</code>) and <code>ALERT_FROM</code> in the Vercel project env, then redeploy.</div>}
      {mail.configured&&<div className="muted" style={{marginBottom:8}}>Sending through SMTP as <b>{mail.from}</b>.</div>}
      <label className="srow"><input type="checkbox" checked={s.alert_emails} onChange={e=>set("alert_emails",e.target.checked)}/><span><b>Email me when a routine run fails</b><div className="muted">One email per failed run, never more.</div></span></label>
      <label className="srow"><input type="checkbox" checked={s.alert_on_success} onChange={e=>set("alert_on_success",e.target.checked)}/><span><b>Also email on success</b></span></label>
      <Row title="Send to"><input type="email" defaultValue={s.alert_to} placeholder="you@example.com" onBlur={e=>e.target.value!==s.alert_to&&set("alert_to",e.target.value.trim())} style={{width:260}}/></Row>
      <div style={{display:"flex",gap:8,margin:"12px 0 6px",alignItems:"center"}}><b>Template</b>
        <button className={kind==="fail"?"":"ghost"} onClick={()=>setKind("fail")}>Failure</button><button className={kind==="ok"?"":"ghost"} onClick={()=>setKind("ok")}>Success</button>
        <span className="muted">Variables: {"{{routine}} {{bot}} {{status}} {{time}} {{error}} {{link}}"}</span></div>
      <div className="tplgrid"><div>
        <input value={t[p+"_subject"]} onChange={e=>setT({...t,[p+"_subject"]:e.target.value})} style={{width:"100%",marginBottom:6}} aria-label="Subject"/>
        <textarea value={t[p+"_html"]} onChange={e=>setT({...t,[p+"_html"]:e.target.value})} rows={16} style={{width:"100%",fontFamily:"ui-monospace,monospace",fontSize:12}} aria-label="HTML body"/>
        <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>save(tplPatch)}>Save templates</button>
          <button className="ghost" onClick={()=>setT({...t,[p+"_subject"]:DEFAULT_TEMPLATES[p+"_subject"],[p+"_html"]:DEFAULT_TEMPLATES[p+"_html"]})}>Reset to default</button>
          <button className="ghost" disabled={!mail.configured||!s.alert_to} onClick={sendTest}>Send test email</button>{test&&<span className="muted">{test}</span>}</div></div>
        <div><div className="muted">Preview · <b>{render(t[p+"_subject"],vars,false)}</b></div>
          <iframe title="preview" sandbox="" srcDoc={render(t[p+"_html"],vars,true)} style={{width:"100%",height:380,border:"1px solid #ddd",borderRadius:6,background:"#fff"}}/></div></div></div>

    <div className="bot"><h3>Cost estimate rates</h3>
      <div className="muted" style={{marginBottom:8}}>Grok Bot does not report prices or tokens to the box. The Usage page multiplies what it can count by your own rates, and estimates tokens from transcript size. Leave blank or 0 to show usage only.</div>
      {[["cost_per_run","per run"],["cost_per_run_minute","per run minute"],["cost_per_action","per bot action"]].map(([k,l])=>
        <Row key={k} title={l}><input type="number" min="0" step="0.0001" defaultValue={s[k]} onBlur={e=>Number(e.target.value)!==s[k]&&set(k,Number(e.target.value)||0)} style={{width:110}}/> {s.currency}</Row>)}
      <Row title="Currency"><Sel v={s.currency} opts={["USD","EUR","GBP","PLN","CAD","AUD","JPY"]} on={v=>set("currency",v)}/></Row>
      <TokenPrices value={s.token_prices} models={models} currency={s.currency} onSave={v=>set("token_prices",v)}/></div>
    <div className="bot"><h3>Plugins</h3>
      <div className="muted" style={{marginBottom:8}}>Each folder in <code>plugins/</code> is a plugin. Off = no tab, its API answers 404 and the box gets nothing from it.</div>
      {plugins.map(p=><label key={p.name} className="srow"><input type="checkbox" checked={(s.plugins||{})[p.name]??p.enabled} onChange={e=>set("plugins",{...(s.plugins||{}),[p.name]:e.target.checked})}/>
        <span><b>{p.title}</b> <code>{p.name}</code><div className="muted">{p.description}</div></span></label>)}
      {!plugins.length&&<div className="muted">No plugins installed.</div>}</div>
    {note&&<div className="muted savenote">{note}</div>}</div>;
}
