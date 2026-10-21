"use client";
import { useEffect, useState } from "react";
const B="/api/p/worker-tasks";
const fmt=(d,tz)=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"}):"";
const secs=r=>r.started_at&&r.finished_at?((new Date(r.finished_at)-new Date(r.started_at))/1000).toFixed(1)+" s":"";
export default function Runner({catalog,runs:init,tz,wait,signing,demo}){
  const tasks=catalog.tasks||[], [pick,setPick]=useState(tasks[0]?.name||""), def=tasks.find(t=>t.name===pick);
  const [args,setArgs]=useState({}), [runs,setRuns]=useState(init), [view,setView]=useState(init[0]?.id||null), [run,setRun]=useState(null), [out,setOut]=useState([]), [msg,setMsg]=useState("");
  useEffect(()=>{ setArgs(Object.fromEntries((def?.args||[]).map(a=>[a.name,a.default??""]))); },[pick]);
  useEffect(()=>{ if(!view) return; let stop=false, after=0, acc=[];
    const tickf=async()=>{ if(stop) return; try{ const j=await (await fetch(`${B}/runs?id=${view}&after=${after}`)).json(); if(j.run){ setRun(j.run); if(j.out.length){ acc=[...acc,...j.out]; after=j.out.at(-1).seq; setOut(acc); }
        if(["queued","running"].includes(j.run.state)) setTimeout(tickf,1000); else { const l=await (await fetch(`${B}/runs`)).json(); l.runs&&setRuns(l.runs); } } }catch{ setTimeout(tickf,3000); } };
    setOut([]); tickf(); return ()=>{ stop=true; }; },[view]);
  async function go(){
    const a=Object.fromEntries((def.args||[]).map(x=>[x.name,x.type==="int"?Number(args[x.name]):args[x.name]]));
    if(!confirm(`Run "${def.name}" on the box${Object.keys(a).length?" with "+JSON.stringify(a):""}?`)) return;
    const r=await fetch(`${B}/runs`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({task:def.name,args:a})}), j=await r.json().catch(()=>({}));
    if(j.demo){ setMsg("Demo: nothing runs here. The history below shows what real runs look like."); return; }
    if(!r.ok){ setMsg(j.error||"failed ("+r.status+")"); return; }
    setMsg(`Queued. The box picks it up on its next pass (up to ~${wait} s).`); const l=await (await fetch(`${B}/runs`)).json(); setRuns(l.runs||[]); setView(j.id); }
  return <div>
    <div className="card"><b>Run a task on the box</b>
      <div className="muted" style={{fontSize:13,margin:"4px 0 10px"}}>Only tasks the box lists in its own allowlist can run. Each run is signed, expires in 10 minutes, runs niced with a timeout, and output is redacted on the box.</div>
      {!signing&&<div className="warnbox">Set <code>TASK_KEY</code> in the dashboard env and in the box <code>.env</code> (same value) to turn tasks on.</div>}
      {!tasks.length?<div className="muted">The box has not listed any tasks yet. Run <code>install.sh</code> on the box.</div>:
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <select value={pick} onChange={e=>setPick(e.target.value)} aria-label="Task">{tasks.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select>
        {(def?.args||[]).map(a=><label key={a.name} style={{fontSize:13}}>{a.name}{" "}
          {a.type==="enum"?<select value={args[a.name]??""} onChange={e=>setArgs({...args,[a.name]:e.target.value})}>{a.options.map(o=><option key={o}>{o}</option>)}</select>
          :<input type={a.type==="int"?"number":"text"} min={a.min} max={a.max} value={args[a.name]??""} onChange={e=>setArgs({...args,[a.name]:e.target.value})} style={{width:a.type==="int"?80:180}}/>}</label>)}
        <button disabled={!def} onClick={go}>Run</button><span className="muted" style={{fontSize:13}}>{def?.description}</span></div>}
      {msg&&<div className="muted" style={{marginTop:8}}>{msg}</div>}</div>
    {run&&<div className="card"><b>Run #{run.id} · {run.task}</b> <span className={"pill "+run.state}>{run.state}</span>{run.exit_code!=null&&<span className="muted"> exit {run.exit_code}</span>} <span className="muted">{secs(run)}{run.note?" · "+run.note:""}</span>
      <pre className="taskout">{out.map(o=>o.text).join("")||(run.state==="queued"?`waiting for the box (next pass, up to ~${wait} s)…`:run.state==="expired"?"expired before the box picked it up":"")}</pre></div>}
    <div className="card"><b>History</b>
      <table className="compact"><thead><tr><th>#</th><th>Task</th><th>Args</th><th>State</th><th>Exit</th><th>Queued</th><th>Took</th></tr></thead><tbody>
        {runs.map(r=><tr key={r.id} onClick={()=>setView(r.id)} style={{cursor:"pointer",background:r.id===view?"#eef3fb":""}}><td>{r.id}</td><td>{r.task}</td><td style={{fontSize:12}}>{Object.keys(r.args||{}).length?JSON.stringify(r.args):""}</td>
          <td><span className={"pill "+r.state}>{r.state}</span></td><td>{r.exit_code??""}</td><td>{fmt(r.created_at,tz)}</td><td>{secs(r)}</td></tr>)}
        {!runs.length&&<tr><td colSpan={7} className="muted">No runs yet.</td></tr>}</tbody></table></div>
  </div>;
}
