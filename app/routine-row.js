"use client";
import { useState, useEffect } from "react";
import { DAYS, build, isEvent } from "./schedule";
export default function RoutineRow({r, last}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState("");
  const [pending,setPending]=useState(r.pending_action);
  const [s,setS]=useState({freq:"weekdays",time:"08:00",days:[1],dom:1,n:15,minute:0,cron:"",date:"",timing:"exact"});
  const [trig,setTrig]=useState("");
  useEffect(()=>{setPending(r.pending_action);},[JSON.stringify(r.pending_action)]);
  const event=isEvent(r.schedule_or_trigger);
  const b=build(s);
  const paused=r.status==="paused";
  async function act(body){
    setBusy(true); setNote("");
    const res=await fetch("/api/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({routine_id:r.routine_id,...body})});
    const j=await res.json().catch(()=>({})); setBusy(false);
    if(!res.ok){ setNote("Error: "+(j.error||res.status)); return; }
    if(j.cancelled){ setPending(null); setNote("Cancelled"); return; }
    setPending(j.pending); setOpen(false); setNote(j.delivered?"Sent to Grok Bot":"Saved, not delivered"+(j.reason?` (${j.reason})`:""));
  }
  const set=(k,v)=>setS(x=>({...x,[k]:v}));
  const chip=d=>{const on=s.days.includes(d);return <button key={d} type="button" onClick={()=>set("days",on?s.days.filter(x=>x!==d):[...s.days,d])}
    style={{background:on?"#1d2330":"#fff",color:on?"#fff":"#1d2330",padding:"3px 8px"}}>{DAYS[d]}</button>;};
  const showTime=["daily","weekdays","weekly","monthly","once"].includes(s.freq);
  return <><tr>
    <td>{r.name}<div className="muted">{r.routine_id}</div></td>
    <td>{r.schedule_or_trigger}{paused&&<div><span className="badge-paused">Paused</span></div>}</td>
    <td>{r.purpose}</td>
    <td>{last?<><span className={last.status}>{last.status}</span> {last.when}</>:<span className="muted">never</span>}</td>
    <td style={{whiteSpace:"nowrap"}}>
      {pending?<div><span className="pending">Pending: {pending.human||pending.action}</span> <button className="link" disabled={busy} onClick={()=>act({action:"cancel"})}>cancel</button></div>:<>
      <button disabled={busy} onClick={()=>act({action:paused?"resume":"pause",human:paused?"Resume routine":"Pause routine"})}>{paused?"Resume":"Pause"}</button>{" "}
      <button disabled={busy} className="ghost" onClick={()=>setOpen(o=>!o)}>{event?"Trigger…":"Edit schedule"}</button></>}
      {note&&<div className="muted" style={{fontSize:12}}>{note}</div>}
    </td></tr>
    {open&&!pending&&<tr><td colSpan={5} className="editor">
      {event?<div>
        <div><b>Trigger:</b> <span className="muted">{r.schedule_or_trigger} (event-triggered; read-only)</span></div>
        <textarea style={{width:"100%",marginTop:6}} rows={2} placeholder="Describe the trigger change you want (e.g. 'Also run when a PR is merged in my-org/site')" value={trig} onChange={e=>setTrig(e.target.value)}/>
        <button disabled={busy||!trig.trim()} onClick={()=>act({action:"change_trigger",trigger_request:trig,human:`Change trigger: ${trig.slice(0,120)}`})}>Request trigger change</button>
      </div>:<div className="filters" style={{alignItems:"center"}}>
        <select value={s.freq} onChange={e=>set("freq",e.target.value)}>
          <option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option><option value="minutes">Every N minutes</option><option value="hours">Every N hours</option><option value="once">One-off date</option><option value="custom">Custom cron</option></select>
        {(s.freq==="minutes"||s.freq==="hours")&&<label>every <input type="number" min={1} max={s.freq==="minutes"?59:23} value={s.n} onChange={e=>set("n",e.target.value)} style={{width:60}}/> {s.freq}</label>}
        {(s.freq==="hourly"||s.freq==="hours")&&<label>at minute <input type="number" min={0} max={59} value={s.minute} onChange={e=>set("minute",e.target.value)} style={{width:60}}/></label>}
        {s.freq==="once"&&<input type="date" value={s.date} onChange={e=>set("date",e.target.value)}/>}
        {showTime&&<input type="time" value={s.time} onChange={e=>set("time",e.target.value)}/>}
        {s.freq==="weekly"&&<span style={{display:"flex",gap:4}}>{[1,2,3,4,5,6,0].map(chip)}</span>}
        {s.freq==="monthly"&&<label>day <select value={s.dom} onChange={e=>set("dom",e.target.value)}>{Array.from({length:28},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>}
        {s.freq==="custom"&&<input placeholder="m h dom mon dow" value={s.cron} onChange={e=>set("cron",e.target.value)} style={{fontFamily:"monospace"}}/>}
        <span className="muted">Timezone: ET</span>
        <select value={s.timing} onChange={e=>set("timing",e.target.value)}><option value="exact">Exact time</option><option value="flexible">Flexible (± a few min)</option></select>
        <div style={{flexBasis:"100%"}}><b>{b.human}</b>{b.cron&&<code className="muted"> {b.cron}</code>}</div>
        <button disabled={busy||!/^\S+ \S+ \S+ \S+ \S+$/.test(b.cron)} onClick={()=>act({action:"set_schedule",schedule:b.cron,timing:s.timing,human:b.human+(s.timing==="flexible"?" (flexible)":"")})}>Request change</button>
        <button className="ghost" onClick={()=>setOpen(false)}>Close</button>
      </div>}
    </td></tr>}</>;
}
