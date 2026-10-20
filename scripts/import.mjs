// Usage: ROUTINE_LOG_URL=... node scripts/import.mjs  (reads token/bypass from /workspace/grugbot-console/.env)
import fs from "fs";
const env=Object.fromEntries(fs.readFileSync("/workspace/grugbot-console/.env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const h={"content-type":"application/json",authorization:`Bearer ${env.ROUTINE_LOG_TOKEN}`,"x-vercel-protection-bypass":env.VERCEL_BYPASS};
const lines=f=>fs.readFileSync(`/workspace/grugbot-console/${f}`,"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
let n={register:0,runs:0};
for(const [f,ep] of [["registry.jsonl","register"],["runs.jsonl","runs"]]) for(const r of lines(f)){const x=await fetch(`${env.ROUTINE_LOG_URL}/api/${ep}`,{method:"POST",headers:h,body:JSON.stringify(r)}); if(x.ok) n[ep]++; else console.error(ep,x.status);}
console.log(n);
