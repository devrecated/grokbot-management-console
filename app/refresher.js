"use client";
// Live updates without a reload: re-fetch server data every 5s while any routine change is pending,
// every 60s otherwise, and never while the tab is hidden (keeps Vercel usage low).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function Refresher({pending}){ const r=useRouter();
  useEffect(()=>{ const ms=pending?5000:60000;
    const tick=()=>{ if(document.visibilityState==="visible") r.refresh(); };
    const i=setInterval(tick,ms); const v=()=>{ if(document.visibilityState==="visible") tick(); };
    document.addEventListener("visibilitychange",v); return ()=>{clearInterval(i);document.removeEventListener("visibilitychange",v);}; },[pending]);
  return null; }
