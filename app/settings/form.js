"use client";
import { useState } from "react";
export default function Form({initial}){
  const [s,setS]=useState(initial),[note,setNote]=useState("");
  async function set(k,v){ setNote("Saving…"); const r=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({[k]:v})});
    if(r.ok){ setS(await r.json()); setNote("Saved"); } else setNote("Save failed ("+r.status+")"); }
  return <div className="bot">
    <label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input type="checkbox" checked={s.always_reply_in_chat} onChange={e=>set("always_reply_in_chat",e.target.checked)}/>
      <span><b>Always reply in Grok Bot chat</b><div className="muted">Mirror every chat reply and every pause, resume, schedule and trigger result to Grok Bot chat, as well as this dashboard.</div></span></label>
    <label style={{display:"flex",gap:8,alignItems:"flex-start",marginTop:14}}><span style={{minWidth:20}}/>
      <span><b>Ship logs from the box every</b>{" "}<select value={s.ship_interval_s} onChange={e=>set("ship_interval_s",Number(e.target.value))}>
        {[[15,"15 seconds"],[30,"30 seconds"],[60,"1 minute"],[300,"5 minutes"],[600,"10 minutes"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <div className="muted">The box checks this setting at most every 5 minutes. Shorter means fresher logs but keeps a serverless database (like Neon) awake more, which uses more of its free compute hours.</div></span></label>
    {note&&<div className="muted" style={{marginTop:8}}>{note}</div>}</div>;
}
