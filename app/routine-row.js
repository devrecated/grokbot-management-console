"use client";
// One routine in the Routines table: Controls (cell) and Editor (expanded row) share state kept by the table (ui).
import { useState } from "react";
import { DAYS, build, isEvent } from "./schedule";
import PromptEditor from "./prompt-editor";
export async function act(r,body,patch){
  patch({busy:true,note:""});
  const res=await fetch("/api/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({routine_id:r.routine_id,...body})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok) return patch({busy:false,note:"Error: "+(j.error||res.status)});
  if(j.cancelled) return patch({busy:false,pending:null,note:"Cancelled"});
  if(j.fetching) return patch({busy:false,asked:true,note:j.delivered?"Asked the bot for its prompt…":"Saved, not delivered"+(j.reason?` (${j.reason})`:"")});
  patch({busy:false,pending:j.pending,mode:null,note:j.delivered?"Sent to Grok Bot":"Saved, not delivered"+(j.reason?` (${j.reason})`:"")});
}
export function Controls({r,u,patch}){
  const pending=u.pending, paused=r.status==="paused", event=isEvent(r.schedule_or_trigger), busy=u.busy;
  const toggle=m=>patch({mode:u.mode===m?null:m});
  return <div onClick={e=>e.stopPropagation()} style={{whiteSpace:"nowrap"}}>
    {pending?<div><span className="pending">Pending: {pending.human||pending.action}</span> <button className="link" disabled={busy} onClick={()=>act(r,{action:"cancel"},patch)}>cancel</button></div>:<>
    <button disabled={busy} onClick={()=>act(r,{action:paused?"resume":"pause",human:paused?"Resume routine":"Pause routine"},patch)}>{paused?"Resume":"Pause"}</button>{" "}
    <button disabled={busy} className={u.mode==="schedule"?"":"ghost"} onClick={()=>toggle("schedule")}>{event?"Trigger…":"Schedule"}</button>{" "}
    <button disabled={busy} className={u.mode==="prompt"?"":"ghost"} onClick={()=>{ if(!r.prompt_text&&!u.asked) act(r,{action:"fetch_prompt"},patch); toggle("prompt"); }}>Prompt</button>{" "}
    <a href={`/p/chat?thread=${encodeURIComponent("routine:"+r.routine_id)}`} style={{fontSize:12}}>chat</a></>}
    {u.note&&<div className="muted" style={{fontSize:12}}>{u.note}</div>}</div>;
}
export function Editor({r,u,patch}){
  const busy=u.busy, event=isEvent(r.schedule_or_trigger), setOpen=()=>patch({mode:null});
  const [s,setS]=useState({freq:"weekdays",time:"08:00",days:[1],dom:1,n:15,minute:0,cron:"",date:"",timing:"exact"}), [trig,setTrig]=useState("");
  const b=build(s,r.tzl);
  if(u.mode==="prompt") return <PromptEditor r={r} fetching={(u.asked||(r.prompt_requested_at&&Date.now()-new Date(r.prompt_requested_at)<600000))&&!r.prompt_text}
      busy={busy} onSave={p=>act(r,{action:"set_prompt",prompt:p},patch)} onRefetch={()=>act(r,{action:"fetch_prompt"},patch)} onClose={setOpen}/>;
  const act2=body=>act(r,body,patch);
  const set=(k,v)=>setS(x=>({...x,[k]:v}));
  const chip=d=>{const on=s.days.includes(d);return <button key={d} type="button" onClick={()=>set("days",on?s.days.filter(x=>x!==d):[...s.days,d])}
    style={{background:on?"#1d2330":"#fff",color:on?"#fff":"#1d2330",padding:"3px 8px"}}>{DAYS[d]}</button>;};
  const showTime=["daily","weekdays","weekly","monthly","once"].includes(s.freq);
  return <div className="editor">
      {event?<div>
        <div><b>Trigger:</b> <span className="muted">{r.schedule_or_trigger} (event-triggered; read-only)</span></div>
        <textarea style={{width:"100%",marginTop:6}} rows={2} placeholder="Describe the trigger change you want (e.g. 'Also run when a PR is merged in my-org/site')" value={trig} onChange={e=>setTrig(e.target.value)}/>
        <button disabled={busy||!trig.trim()} onClick={()=>act2({action:"change_trigger",trigger_request:trig,human:`Change trigger: ${trig.slice(0,120)}`})}>Request trigger change</button>
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
        <span className="muted">Timezone: {r.tzl||"ET"}</span>
        <select value={s.timing} onChange={e=>set("timing",e.target.value)}><option value="exact">Exact time</option><option value="flexible">Flexible (± a few min)</option></select>
        <div style={{flexBasis:"100%"}}><b>{b.human}</b>{b.cron&&<code className="muted"> {b.cron}</code>}</div>
        <button disabled={busy||!/^\S+ \S+ \S+ \S+ \S+$/.test(b.cron)} onClick={()=>act2({action:"set_schedule",schedule:b.cron,timing:s.timing,human:b.human+(s.timing==="flexible"?" (flexible)":"")})}>Request change</button>
        <button className="ghost" onClick={()=>setOpen(false)}>Close</button>
      </div>}
    </div>;
}
