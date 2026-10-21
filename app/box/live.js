"use client";
// Live button: asks the box to stream CPU/memory every 2 s for a few minutes. Polls only while on and the tab is visible.
import { useEffect, useRef, useState } from "react";
function Line({pts,k,max,color,w=640,h=90,t0,t1}){
  const v=pts.filter(p=>p[k]!=null); if(v.length<2) return null;
  const d=v.map(p=>`${((p.t-t0)/(t1-t0)*w).toFixed(1)},${(h-2-Math.min(p[k],max)/max*(h-4)).toFixed(1)}`).join(" ");
  return <polyline points={d} fill="none" stroke={color} strokeWidth="1.5"/>;
}
export default function Live({initialUntil,wait}){
  const [until,setUntil]=useState(initialUntil||0), [rows,setRows]=useState([]), [busy,setBusy]=useState(false), [,tick]=useState(0);
  const on=until>Date.now(), since=useRef(Date.now()-5*60e3);
  useEffect(()=>{ if(!on) return; let stop=false;
    const poll=async()=>{ if(stop||document.hidden) return; try{ const r=await (await fetch(`/api/box/live?since=${since.current}`)).json();
      if(r.rows?.length){ since.current=r.rows.at(-1).t; setRows(x=>[...x,...r.rows].filter(p=>p.t>Date.now()-5*60e3)); } if(typeof r.live_until==="number") setUntil(r.live_until); }catch{} tick(n=>n+1); };
    poll(); const id=setInterval(poll,2000); return ()=>{ stop=true; clearInterval(id); }; },[on]);
  const toggle=async()=>{ setBusy(true); try{ const r=await (await fetch("/api/box/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({on:!on})})).json(); setUntil(r.live_until||0); if(!on) setRows([]); }finally{ setBusy(false); } };
  const last=rows.at(-1), t1=Date.now(), t0=t1-5*60e3;
  return <div className="card" style={{marginBottom:16}}>
    <div style={{display:"flex",gap:12,alignItems:"center"}}><b>Live</b>
      <button disabled={busy} className={on?"ghost":""} onClick={toggle}>{on?"Stop":"Go live"}</button>
      <span className="muted">{on?(last?<>CPU <b>{last.cpu??"-"}%</b> · memory <b>{(last.mem/1024).toFixed(1)}</b> / {(last.tot/1024).toFixed(0)} GB · stops in {Math.max(0,Math.ceil((until-Date.now())/60e3))} min</>
        :`waiting for the box to check in (up to ~${wait}s), then a sample every 2 s`):"Off. Nothing extra runs on the box. Turn on to stream CPU/memory every 2 s for a few minutes."}</span></div>
    {on&&rows.length>1&&<svg width="100%" height="90" viewBox="0 0 640 90" preserveAspectRatio="none" style={{marginTop:8,background:"#f6f7f9",borderRadius:4}}>
      <Line pts={rows} k="cpu" max={100} color="#c5221f" t0={t0} t1={t1}/><Line pts={rows.map(r=>({...r,m:r.tot?100*r.mem/r.tot:null}))} k="m" max={100} color="#1a73e8" t0={t0} t1={t1}/></svg>}
    {on&&rows.length>1&&<div className="muted" style={{fontSize:12}}><span style={{color:"#c5221f"}}>CPU %</span> · <span style={{color:"#1a73e8"}}>memory % of RAM</span> · last 5 minutes, 0–100%</div>}
  </div>;
}
