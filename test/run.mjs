// npm test: boot the built app in DEMO_MODE on a free port, then run core tests (test/*.test.mjs) and every
// plugin's tests (plugins/*/test/*.test.mjs) against it with node:test. Needs `npm run build` first.
import { spawn, spawnSync } from "child_process"; import fs from "fs";
const port=String(3900+Math.floor(Math.random()*90)), BASE=`http://127.0.0.1:${port}`;
// Plugin safety check first: undeclared env, hosts or packages fail the run.
if(spawnSync(process.execPath,["scripts/check-plugins.mjs"],{stdio:"inherit"}).status) process.exit(1);
// Only plugins bundled into this build are tested against it (see plugins/load.mjs).
const { CATALOG }=await import("../plugins/catalog.gen.js"), inBuild=new Set(CATALOG.filter(p=>p.bundled).map(p=>p.name));
const files=[...fs.readdirSync("test").filter(f=>f.endsWith(".test.mjs")).map(f=>"test/"+f),
  ...fs.readdirSync("plugins").filter(d=>inBuild.has(d)).flatMap(d=>fs.existsSync(`plugins/${d}/test`)?fs.readdirSync(`plugins/${d}/test`).filter(f=>f.endsWith(".test.mjs")).map(f=>`plugins/${d}/test/${f}`):[])];
const missing=fs.readdirSync("plugins").filter(d=>fs.existsSync(`plugins/${d}/plugin.json`)&&!files.some(f=>f.startsWith(`plugins/${d}/`)));
if(missing.length){ console.error("every plugin needs a test: missing in "+missing.join(", ")); process.exit(1); }
const env={...process.env,DEMO_MODE:"1",PORT:port}; for(const k of ["DATABASE_URL","GROKBOT_WEBHOOK_URL","GROKBOT_WEBHOOK_KEY","GROK_BOT_WEBHOOK_URL","GROK_BOT_WEBHOOK_KEY"]) delete env[k];
const app=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",port],{env,stdio:["ignore","ignore","inherit"],detached:true});
const stop=()=>{ try{ process.kill(-app.pid); }catch{} };
let ok=false; for(let i=0;i<60&&!ok;i++){ await new Promise(r=>setTimeout(r,500)); ok=await fetch(BASE+"/api/settings").then(r=>r.ok).catch(()=>false); }
if(!ok){ console.error("app did not start (did you run npm run build?)"); stop(); process.exit(1); }
const r=spawnSync(process.execPath,["--test",...files],{stdio:"inherit",env:{...process.env,BASE}});
stop(); process.exit(r.status??1);
