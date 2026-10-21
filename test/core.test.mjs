// Core pages and APIs answer in demo mode.
import test from "node:test"; import assert from "node:assert/strict";
const B=process.env.BASE, get=p=>fetch(B+p);
for(const p of ["/","/bots","/logs","/box","/box?r=1h","/box?from=2026-01-01&to=2026-01-02","/settings"])
  test(`page ${p}`,async()=>{ const r=await get(p); assert.equal(r.status,200); assert.match(await r.text(),/GrugBot Management Console/); });
test("box page lists sessions",async()=>{ const h=await (await get("/box?r=7d")).text(); assert.match(h,/Sessions/); assert.match(h,/a1b2c3d4/); });
test("settings api",async()=>{ const j=await (await get("/api/settings")).json(); assert.equal(typeof j.timezone,"string"); assert.equal(typeof j.plugins,"object"); });
test("unknown plugin is 404",async()=>{ assert.equal((await get("/api/p/nope/x")).status,404); });
test("demo writes are fake",async()=>{ const j=await (await fetch(B+"/api/settings",{method:"POST",body:"{}"})).json(); assert.equal(j.demo,true); });
test("box session filter drives the sessions table",async()=>{
  const all=await (await get("/box?r=14d")).text(), one=await (await get("/box?r=14d&i=a1b2c3d4e5f60718")).text();
  assert.match(all,/6<!-- --> of <!-- -->6<!-- --> <!-- -->sessions/); assert.match(one,/1<!-- --> of <!-- -->1<!-- --> <!-- -->sessions/); });
test("routines, runs, usage and chat use the shared table",async()=>{
  for(const p of ["/","/p/usage","/p/chat"]) assert.match(await (await get(p)).text(),/class="lv gtt"/); });
test("wake state",async()=>{ const j=await (await get("/api/box/wake")).json(); assert.ok(["sleeping","waking","awake"].includes(j.state)); });
test("core tabs only: Bots, Routines, Logs, Box (plus plugin tabs)",async()=>{ const h=await (await get("/bots")).text();
  for(const t of ["/bots","/logs","/box","/p/chat","/p/usage"]) assert.match(h,new RegExp(`href="${t}"`)); assert.doesNotMatch(h,/href="\/usage"/); });
test("plugin check flags undeclared env, hosts and packages",async()=>{
  const { spawnSync }=await import("child_process"); const r=spawnSync(process.execPath,["scripts/check-plugins.mjs","test/fixtures/plugins"],{encoding:"utf8"});
  assert.equal(r.status,1); for(const w of ["DATABASE_URL","collector.example.net","left-pad"]) assert.match(r.stderr,new RegExp(w));
  assert.equal(spawnSync(process.execPath,["scripts/check-plugins.mjs"]).status,0); });
test("deploy endpoint explains how to redeploy without a hook",async()=>{ const j=await (await get("/api/deploy")).json();
  assert.equal(j.method,"none"); assert.equal(typeof j.hook,"boolean"); for(const w of ["VERCEL_TOKEN","vercel.com/account/tokens","Environment Variables","System Environment Variables","restart"]) assert.ok(j.how.includes(w),w); });
test("settings shows plugin authors",async()=>{ const h=await (await get("/settings")).text(); assert.match(h,/GrugBot official plugin - Adam Siwiec/); });
