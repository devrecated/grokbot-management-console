"use client";
// Run history as a TanStack table, same look as Logs.
import { useMemo, useState } from "react";
import GrugTable from "./grug-table";
export default function Runs({runs,names}){
  const [bot,setBot]=useState(""),[st,setSt]=useState("");
  const bots=[...new Set(runs.map(r=>r.bot))].sort();
  const data=useMemo(()=>runs.filter(r=>(!bot||r.bot===bot)&&(!st||r.status===st)),[runs,bot,st]);
  const columns=useMemo(()=>[
    {id:"t",header:"Time",accessorKey:"ts",size:190,cell:({row})=>row.original.when},
    {id:"bot",header:"Bot",accessorKey:"bot",size:130,cell:c=><div title={c.getValue()} style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.getValue()}</div>},
    {id:"rt",header:"Routine",accessorFn:r=>names[r.routine_id]||r.routine_id,size:220},
    {id:"st",header:"Status",accessorKey:"status",size:80,cell:c=><span className={c.getValue()}>{c.getValue()}</span>},
    {id:"sum",header:"Summary",accessorKey:"summary",size:560,enableSorting:false,cell:c=><span style={{whiteSpace:"normal"}}>{c.getValue()}</span>},
  ],[names]);
  return <GrugTable data={data} columns={columns} rowId={r=>String(r.id)} sort={[{id:"t",desc:true}]} left={["t"]} pinKey="runPins" noun="runs" placeholder="Search summary"
    search={r=>`${r.summary||""} ${names[r.routine_id]||""} ${r.bot}`} empty="No runs yet."
    toolbar={<><select value={bot} onChange={e=>setBot(e.target.value)}><option value="">All bots</option>{bots.map(b=><option key={b}>{b}</option>)}</select>
      <select value={st} onChange={e=>setSt(e.target.value)}><option value="">All statuses</option><option>ok</option><option>error</option><option>skipped</option></select></>}/>;
}
