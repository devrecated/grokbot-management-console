// chat plugin: tab, page with the shared table, old /chat?thread= links redirect, its setting shows in Settings, chat API answers.
import test from "node:test"; import assert from "node:assert/strict";
const B=process.env.BASE;
test("tab and page",async()=>{ const h=await (await fetch(B+"/p/chat")).text(); assert.match(h,/href="\/p\/chat"/); assert.match(h,/class="lv gtt"/); });
test("old /chat link redirects with thread",async()=>{ const r=await fetch(B+"/chat?thread=routine%3Ax",{redirect:"manual"}); assert.ok([307,308].includes(r.status)); assert.match(r.headers.get("location"),/\/p\/chat\?thread=routine%3Ax/); });
test("settings section",async()=>{ const h=await (await fetch(B+"/settings")).text(); assert.match(h,/id="chat"/); assert.match(h,/Always reply in Grok Bot chat/); });
test("threads api",async()=>{ const j=await (await fetch(B+"/api/chat")).json(); assert.ok(Array.isArray(j.threads)); });
