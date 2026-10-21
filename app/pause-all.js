"use client";
// One button for every routine. Confirm first; the inbox routine does the real work and confirms each routine.
import { useState } from "react";
export default function PauseAll({active,paused}){
  const [note,setNote]=useState(""),[busy,setBusy]=useState(false);
  async function go(action){
    const n=action==="pause_all"?active:paused;
    if(!confirm(`${action==="pause_all"?"Pause":"Resume"} all ${n} routine${n===1?"":"s"}? Grok Bot gets one request and confirms each routine.`)) return;
    setBusy(true); const r=await fetch("/api/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action})});
    const j=await r.json().catch(()=>({})); setBusy(false);
    setNote(j.demo?j.note:!r.ok?"Error: "+(j.error||r.status):j.count===0?j.note:`${j.count} routine${j.count===1?"":"s"} pending. `+(j.delivered?"Sent to Grok Bot.":"Saved, not delivered"+(j.reason?` (${j.reason})`:"")));
    if(r.ok&&j.count&&!j.demo) setTimeout(()=>location.reload(),800);
  }
  return <span style={{display:"flex",gap:8,alignItems:"center"}}>
    {note&&<span className="muted">{note}</span>}
    <button disabled={busy||!active} onClick={()=>go("pause_all")}>Pause all</button>
    <button className="ghost" disabled={busy||!paused} onClick={()=>go("resume_all")}>Resume all</button></span>;
}
