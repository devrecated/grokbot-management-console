"use client";
// Usage plugin settings: your rates, currency and token prices. Shown in Settings only while the plugin is on.
import { useState } from "react";
import { saveSettings } from "@/app/settings/save";
import TokenPrices from "./token-prices";
export default function UsageSettings({initial,models=[]}){
  const [s,setS]=useState(initial),[note,setNote]=useState("");
  const set=async(k,v)=>{ setNote("Saving…"); const j=await saveSettings({[k]:v}); if(j._error) return setNote(j._error); setS(j); setNote(j._rejected?"Not saved: "+j._rejected.join(", "):"Saved"); };
  return <div><div className="muted" style={{marginBottom:8}}>Grok Bot does not report prices or tokens to the box. The Usage page multiplies what it can count by your own rates, and estimates tokens from transcript size. Leave blank or 0 to show usage only.</div>
    {[["cost_per_run","per run"],["cost_per_run_minute","per run minute"],["cost_per_action","per bot action"]].map(([k,l])=>
      <label key={k} className="srow"><span><b>{l}</b> <input type="number" min="0" step="0.0001" defaultValue={s[k]} onBlur={e=>Number(e.target.value)!==s[k]&&set(k,Number(e.target.value)||0)} style={{width:110}}/> {s.currency}</span></label>)}
    <label className="srow"><span><b>Currency</b> <select value={s.currency} onChange={e=>set("currency",e.target.value)}>{["USD","EUR","GBP","PLN","CAD","AUD","JPY"].map(c=><option key={c}>{c}</option>)}</select></span></label>
    <TokenPrices value={s.token_prices} models={models} currency={s.currency} onSave={v=>set("token_prices",v)}/>
    {note&&<div className="muted">{note}</div>}</div>;
}
