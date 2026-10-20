"use client";
import { useState } from "react";
export default function Runs({runs,names}){
  const [bot,setBot]=useState(""),[st,setSt]=useState(""),[s,setS]=useState("");
  const bots=[...new Set(runs.map(r=>r.bot))].sort();
  const f=runs.filter(r=>(!bot||r.bot===bot)&&(!st||r.status===st)&&(!s||(r.summary||"").toLowerCase().includes(s.toLowerCase()))).slice(0,500);
  return <><div className="filters"><select value={bot} onChange={e=>setBot(e.target.value)}><option value="">All bots</option>{bots.map(b=><option key={b}>{b}</option>)}</select>
  <select value={st} onChange={e=>setSt(e.target.value)}><option value="">All statuses</option><option>ok</option><option>error</option><option>skipped</option></select>
  <input placeholder="Search summary" value={s} onChange={e=>setS(e.target.value)}/></div>
  <table><thead><tr><th>Time</th><th>Bot</th><th>Routine</th><th>Status</th><th>Summary</th></tr></thead>
  <tbody>{f.map(r=><tr key={r.id}><td>{r.when}</td><td>{r.bot}</td><td>{names[r.routine_id]||r.routine_id}</td><td className={r.status}>{r.status}</td><td>{r.summary}</td></tr>)}
  {!f.length&&<tr><td colSpan={5} className="muted">No runs yet.</td></tr>}</tbody></table></>;
}
