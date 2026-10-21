"use client";
// Routines as one TanStack table (same look as Logs). Bot filter + search; Schedule/Prompt open an editor row.
import { useEffect, useMemo, useState } from "react";
import GrugTable from "./grug-table";
import { Controls, Editor } from "./routine-row";
export default function RoutinesTable({routines}){
  const [ui,setUi]=useState({}), [bot,setBot]=useState(""), [st,setSt]=useState("");
  useEffect(()=>{ setUi(u=>Object.fromEntries(routines.map(r=>[r.routine_id,{...(u[r.routine_id]||{}),pending:r.pending_action}]))); },[JSON.stringify(routines.map(r=>[r.routine_id,r.pending_action]))]);
  const U=id=>ui[id]||{}, patch=id=>o=>setUi(u=>({...u,[id]:{...u[id],...o}}));
  const bots=[...new Set(routines.map(r=>r.bot))].sort();
  const data=useMemo(()=>routines.filter(r=>(!bot||r.bot===bot)&&(!st||r.status===st)),[routines,bot,st]);
  const expanded=useMemo(()=>Object.fromEntries(Object.entries(ui).filter(([,v])=>v.mode&&!v.pending).map(([k])=>[k,true])),[ui]);
  const columns=useMemo(()=>[
    {id:"bot",header:"Bot",accessorKey:"bot",size:130,cell:c=><div title={c.getValue()} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.getValue()}</div>},
    {id:"name",header:"Routine",accessorKey:"name",size:230,cell:({row})=><>{row.original.name}<div className="muted" style={{fontSize:11}}>{row.original.routine_id}</div></>},
    {id:"sched",header:"Schedule / trigger",accessorKey:"schedule_or_trigger",size:200,cell:({row})=><>{row.original.schedule_or_trigger}{row.original.status==="paused"&&<div><span className="badge-paused">Paused</span></div>}</>},
    {id:"purpose",header:"Purpose",accessorKey:"purpose",size:300,cell:c=><span style={{whiteSpace:"normal"}}>{c.getValue()}</span>},
    {id:"last",header:"Last run",accessorFn:r=>r.last?.ts||"",size:170,cell:({row})=>row.original.last?<><span className={row.original.last.status}>{row.original.last.status}</span> {row.original.last.when}</>:<span className="muted">never</span>},
    {id:"ctl",header:"Controls",size:300,enableSorting:false,cell:({row})=><Controls r={row.original} u={U(row.original.routine_id)} patch={patch(row.original.routine_id)}/>},
  ],[ui]);
  return <GrugTable data={data} columns={columns} rowId={r=>r.routine_id} sort={[{id:"bot",desc:false}]} left={["bot","name"]} pinKey="routinePins" noun="routines" placeholder="Search routines"
    search={r=>`${r.bot} ${r.name} ${r.routine_id} ${r.schedule_or_trigger} ${r.purpose}`} expanded={expanded} onExpanded={()=>{}} sub={r=><Editor r={r} u={U(r.routine_id)} patch={patch(r.routine_id)}/>}
    toolbar={<><select value={bot} onChange={e=>setBot(e.target.value)}><option value="">All bots</option>{bots.map(b=><option key={b}>{b}</option>)}</select>
      <select value={st} onChange={e=>setSt(e.target.value)}><option value="">Active + paused</option><option value="active">Active</option><option value="paused">Paused</option></select></>}
    empty="No routines registered yet."/>;
}
