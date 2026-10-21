// Core pages and APIs answer in demo mode.
import test from "node:test"; import assert from "node:assert/strict";
const B=process.env.BASE, get=p=>fetch(B+p);
for(const p of ["/","/bots","/logs","/chat","/box","/box?r=1h","/box?from=2026-01-01&to=2026-01-02","/usage","/settings"])
  test(`page ${p}`,async()=>{ const r=await get(p); assert.equal(r.status,200); assert.match(await r.text(),/GrugBot Management Console/); });
test("box page lists sessions",async()=>{ const h=await (await get("/box?r=7d")).text(); assert.match(h,/Sessions/); assert.match(h,/a1b2c3d4/); });
test("settings api",async()=>{ const j=await (await get("/api/settings")).json(); assert.equal(typeof j.timezone,"string"); assert.equal(typeof j.plugins,"object"); });
test("unknown plugin is 404",async()=>{ assert.equal((await get("/api/p/nope/x")).status,404); });
test("demo writes are fake",async()=>{ const j=await (await fetch(B+"/api/settings",{method:"POST",body:"{}"})).json(); assert.equal(j.demo,true); });
