// Logs: "system" for lines no bot owns, repeats collapse into one row with a count.
import test from "node:test"; import assert from "node:assert/strict";
import { collapse, originOf } from "../lib/collapse-logs.js";
const B=process.env.BASE;
test("origin",()=>{ const bots=[{key:"bot-a",name:"Morning bot"}];
  assert.equal(originOf("exec-daemon.log",bots),"system"); assert.equal(originOf("~/.agents/bot-a/run.log",bots),"Morning bot"); });
test("collapse repeats",()=>{ const r=(id,m,src="exec-daemon.log")=>({id,ts:new Date(id*1000).toISOString(),source:src,level:"info",message:m});
  const rows=[r(6,"other"),r(5,"(previous line repeated 7 more times)"),r(4,"poll 3 ok"),r(3,"poll 2 ok"),r(2,"poll 1 ok"),r(1,"start")].map(x=>x); // newest first
  const c=collapse(rows); assert.deepEqual(c.map(x=>[x.message,x.count]),[["other",1],["poll 1 ok",10],["start",1]]);
  assert.equal(collapse([r(2,"a","x.log"),r(1,"a","y.log")]).length,2); });
test("api tags rows with origin",async()=>{ const j=await (await fetch(B+"/api/logs?range=7d")).json(); assert.ok(j.rows.length>0); assert.ok(j.rows.every(x=>typeof x.origin==="string")); assert.ok(j.rows.some(x=>x.origin==="system")); });
