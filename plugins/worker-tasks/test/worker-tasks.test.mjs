// worker-tasks: page renders, API lists the demo catalog + runs, run output reads back, args are checked.
import test from "node:test"; import assert from "node:assert/strict";
import { checkArgs } from "../args.js";
const B=process.env.BASE, api="/api/p/worker-tasks";
test("tab and page",async()=>{ const h=await (await fetch(B+"/p/worker-tasks")).text(); assert.match(h,/href="\/p\/worker-tasks"/); assert.match(h,/Run a task on the box/); assert.match(h,/restart-agent/); });
test("catalog and history",async()=>{ const j=await (await fetch(B+api+"/runs")).json();
  assert.deepEqual(j.catalog.tasks.map(t=>t.name).sort(),["disk-usage","flush-spool","list-processes","restart-agent","tail-log"]); assert.ok(j.runs.length>=3);
  const o=await (await fetch(`${B}${api}/runs?id=${j.runs[0].id}`)).json(); assert.ok(o.out.length>0); });
test("box endpoint is not open in demo",async()=>{ const r=await fetch(B+api+"/box",{method:"PUT",body:"{}"}); assert.equal((await r.json()).demo,true); });
test("args are typed",()=>{ const def={args:[{name:"file",type:"enum",options:["a"]},{name:"lines",type:"int",min:1,max:500,default:50}]};
  assert.deepEqual(checkArgs(def,{file:"a"}).args,{file:"a",lines:50}); assert.ok(checkArgs(def,{file:"../etc/passwd"}).error);
  assert.ok(checkArgs(def,{file:"a",lines:9999}).error); assert.ok(checkArgs(def,{file:"a",x:1}).error); });
