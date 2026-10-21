// usage plugin: tab, page with the shared table, old /usage link redirects, its settings show in Settings.
import test from "node:test"; import assert from "node:assert/strict";
import { RULES, DEFAULTS } from "../config.js";
const B=process.env.BASE;
test("tab and page",async()=>{ const h=await (await fetch(B+"/p/usage?days=7")).text(); assert.match(h,/href="\/p\/usage"/); assert.match(h,/Cost &amp; usage/); assert.match(h,/class="lv gtt"/); });
test("old /usage redirects",async()=>{ const r=await fetch(B+"/usage?days=7",{redirect:"manual"}); assert.ok([307,308].includes(r.status)); assert.match(r.headers.get("location"),/\/p\/usage\?days=7/); });
test("settings section",async()=>{ const h=await (await fetch(B+"/settings")).text(); assert.match(h,/id="usage"/); assert.match(h,/Token prices/); });
test("settings api has usage keys",async()=>{ const j=await (await fetch(B+"/api/settings")).json(); assert.equal(j.currency,"USD"); assert.ok(Array.isArray(j.token_prices)); });
test("rules",()=>{ assert.equal(DEFAULTS.currency,"USD"); assert.ok(RULES.currency("EUR")); assert.ok(!RULES.currency("eur")); assert.ok(!RULES.cost_per_run(-1));
  assert.ok(RULES.token_prices([{model:"m",input:1,output:2}])); assert.ok(!RULES.token_prices([{model:"",input:1,output:2}])); });
