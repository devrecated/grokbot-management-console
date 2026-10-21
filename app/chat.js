"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import GrugTable from "./grug-table";
import { tzLabel } from "@/lib/tz";
export default function Chat({routines,alwaysChat,tz="America/New_York"}){
  const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" "+tzLabel(tz);
  const [threads,setThreads]=useState([]),[tid,setTid]=useState(null),[msgs,setMsgs]=useState([]);
  const [text,setText]=useState(""),[bot,setBot]=useState(""),[rid,setRid]=useState(""),[busy,setBusy]=useState(false),[note,setNote]=useState(""),[also,setAlso]=useState(false);
  const end=useRef(null);
  const awaiting=!!tid&&msgs.length>0&&msgs[msgs.length-1].role==="user"&&Date.now()-new Date(msgs[msgs.length-1].created_at)<30*60000;
  useEffect(()=>{const t=new URLSearchParams(location.search).get("thread"); if(t) setTid(t);},[]);
  const bots=[...new Set(routines.map(r=>r.bot))].sort();
  async function load(){
    const r=await fetch(`/api/chat${tid?`?thread_id=${encodeURIComponent(tid)}`:""}`,{cache:"no-store"}); if(!r.ok) return;
    const j=await r.json(); setThreads(j.threads); if(tid) setMsgs(j.messages);
  }
  useEffect(()=>{load(); const i=setInterval(()=>{if(document.visibilityState==="visible") load();},awaiting?5000:30000); return ()=>clearInterval(i);},[tid,awaiting]);
  useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[msgs.length]);
  async function send(){
    if(!text.trim()) return; setBusy(true); setNote("");
    const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({thread_id:tid,text,bot:bot||null,routine_id:rid||null,also_chat:also})});
    const j=await r.json().catch(()=>({})); setBusy(false);
    if(r.ok){ setText(""); if(!tid) setTid(j.thread_id); setNote(j.delivered?"Delivered to Grok Bot":"Saved, not delivered"+(j.reason?` (${j.reason})`:"")); load(); }
    else setNote("Error: "+(j.error||r.status));
  }
  const cur=threads.find(t=>t.thread_id===tid);
  const pickT=t=>{ setTid(t); if(!t) setMsgs([]); history.replaceState(null,"",t?"/chat?thread="+encodeURIComponent(t):"/chat"); };
  const tcols=useMemo(()=>[
    {id:"th",header:"Thread",accessorFn:t=>t.thread_id.startsWith("routine:")?(t.routine_id||t.thread_id.slice(8)):t.first_text,size:190,cell:({row:{original:t}})=><><div style={{whiteSpace:"normal"}}>{t.thread_id.startsWith("routine:")?<b>{t.routine_id||t.thread_id.slice(8)}</b>:(t.first_text||"").slice(0,60)}</div><div className="muted" style={{fontSize:11}}>{t.bot||"Any bot"}</div></>},
    {id:"last",header:"Last",accessorFn:t=>+new Date(t.last_at),size:110,cell:({row})=><span className="muted" style={{fontSize:11}}>{fmt(row.original.last_at)}</span>},
  ],[tz]);
  return <div className="chat chat-full">
    <div className="threads gt-threads"><GrugTable data={threads} columns={tcols} rowId={t=>t.thread_id} sort={[{id:"last",desc:true}]} pinKey="threadPins" noun="threads" placeholder="Search threads"
      search={t=>`${t.thread_id} ${t.bot||""} ${t.routine_id||""} ${t.first_text||""}`} onRow={t=>pickT(t.thread_id)} rowClass={t=>t.thread_id===tid?"sel":""} height="calc(100vh - 230px)"
      toolbar={<button className={!tid?"":"ghost"} onClick={()=>pickT(null)}>+ New</button>} empty="No threads yet."/></div>
    <div className="pane">
      <div className="msgs">{!tid&&<p className="muted">Start a new thread. Pick a bot and routine to point Grok Bot at it.</p>}
        {msgs.map(m=><div key={m.id} className={`msg ${m.role}`}>{m.text}<div className="muted" style={{fontSize:11}}>{m.role==="user"?"You":"Grok Bot"} · {fmt(m.created_at)}{m.role==="user"&&m.delivered===false?" · not delivered":""}</div></div>)}<div ref={end}/></div>
      {!tid&&<div className="filters"><select value={bot} onChange={e=>{setBot(e.target.value);setRid("");}}><option value="">Any bot</option>{bots.map(b=><option key={b}>{b}</option>)}</select>
        <select value={rid} onChange={e=>setRid(e.target.value)}><option value="">Any routine</option>{routines.filter(r=>!bot||r.bot===bot).map(r=><option key={r.routine_id} value={r.routine_id}>{r.name}</option>)}</select></div>}
      {cur&&<div className="muted" style={{marginBottom:6}}>{cur.bot||"Any bot"}{cur.routine_id?` · ${cur.routine_id}`:""}</div>}
      <div className="compose"><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Message Grok Bot" onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))send();}}/>
        {alwaysChat?<a href="/settings" className="muted" style={{whiteSpace:"nowrap",alignSelf:"center"}}>Replies also go to Grok Bot chat</a>:<label style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}><input type="checkbox" checked={also} onChange={e=>setAlso(e.target.checked)}/>Also this message</label>}
        <button disabled={busy||!text.trim()} onClick={send}>Send</button></div>
      {note&&<div className="muted" style={{marginTop:6}}>{note}</div>}
    </div></div>;
}
