import "./globals.css";
import { REPO_URL } from "@/lib/links";
import { DEMO } from "@/lib/db";
export const metadata={title:"GrugBot Console"};
export default function L({children}){return <html lang="en"><head>{DEMO&&<script src="/demo-shim.js"/>}</head><body>
  {DEMO&&<div className="demo-bar">Demo with made-up data. Click around: changes are faked in your browser and vanish when you close the tab. <a href={REPO_URL}>Get your own</a></div>}
  {children}</body></html>}
