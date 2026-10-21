"use client";
// Your own prices per 1M tokens for each model the box has seen. Blank = no cost shown. Nothing is assumed.
import { useState } from "react";
export default function TokenPrices({value,models,currency,onSave}){
  const known=new Set(value.map(p=>p.model));
  const [rows,setRows]=useState([...value.map(p=>({model:p.model,input:String(p.input),output:String(p.output)})),...models.filter(m=>!known.has(m)).map(m=>({model:m,input:"",output:""}))]);
  const upd=(i,k,v)=>setRows(rows.map((r,j)=>j===i?{...r,[k]:v}:r));
  const save=()=>onSave(rows.filter(r=>r.model.trim()&&r.input!==""&&r.output!=="").map(r=>({model:r.model.trim(),input:Number(r.input)||0,output:Number(r.output)||0})));
  return <div style={{marginTop:14}}><b>Token prices</b> <span className="muted">({currency} per 1M tokens, your numbers)</span>
    <div className="muted" style={{margin:"4px 0 6px"}}>Used for the "estimated from transcripts" cost on the Usage page. Look up your real price; placeholders are examples only.</div>
    <table style={{width:"auto"}}><thead><tr><th>Model</th><th>Input</th><th>Output</th><th/></tr></thead><tbody>
      {rows.map((r,i)=><tr key={i}><td><input value={r.model} onChange={e=>upd(i,"model",e.target.value)} placeholder="model name" style={{width:220}}/></td>
        <td><input type="number" min="0" step="0.01" value={r.input} onChange={e=>upd(i,"input",e.target.value)} placeholder="e.g. 3.00" style={{width:90}}/></td>
        <td><input type="number" min="0" step="0.01" value={r.output} onChange={e=>upd(i,"output",e.target.value)} placeholder="e.g. 15.00" style={{width:90}}/></td>
        <td><button className="link" onClick={()=>setRows(rows.filter((_,j)=>j!==i))}>remove</button></td></tr>)}</tbody></table>
    <div style={{display:"flex",gap:8,marginTop:6}}><button className="ghost" onClick={()=>setRows([...rows,{model:"",input:"",output:""}])}>Add model</button><button onClick={save}>Save prices</button></div></div>;
}
