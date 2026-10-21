"use client";
// Usage as a TanStack tree table: one row per bot, its routines underneath. Values arrive formatted from the server.
import { useMemo } from "react";
import GrugTable from "@/app/grug-table";
export default function UsageTable({rows,rated,anyTok,anyPrice,total,days}){
  const num=(k,h,size=90)=>({id:k,header:h,accessorFn:r=>r[k]?.v??r[k]??0,size,cell:({row})=>{ const x=row.original[k]; const t=x?.t??x; return row.depth?<span>{t}</span>:<b>{t}</b>; }});
  const columns=useMemo(()=>[
    {id:"name",header:"Bot / routine",accessorKey:"name",size:260,cell:({row})=>row.depth?<>{row.original.name}<div className="muted" style={{fontSize:11}}>{row.original.id}</div></>
      :<span onClick={row.getToggleExpandedHandler()} style={{cursor:"pointer"}}>{row.getIsExpanded()?"▾":"▸"} <b>{row.original.name}</b></span>},
    num("n","Runs",70),num("err","Failed",70),num("mins","Run minutes",150),num("acts","Actions",80),
    ...(rated?[num("est","Estimate",100)]:[]),...(anyTok?[num("calls","Model calls",100),num("tok","Tokens in / out",150),...(anyPrice?[num("tcost","Token cost (est.)",130)]:[])]:[]),
  ],[rated,anyTok,anyPrice]);
  return <GrugTable data={rows} columns={columns} rowId={(r,i,p)=>p?p.id+"/"+r.id:r.id} getSubRows={r=>r.subRows} sort={[{id:"n",desc:true}]} left={["name"]} pinKey="usagePins" noun="bots"
    placeholder="Search bots and routines" search={r=>`${r.name} ${r.id}`} empty={`No runs or actions in the last ${days} days.`}
    footer={rated&&<tr><td colSpan={6} style={{textAlign:"right"}}>Total estimate, last {days} days</td><td colSpan={columns.length-5}>~{total}</td></tr>}/>;
}
