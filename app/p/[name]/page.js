// A plugin's page: /p/<name> renders plugins/<name>/page.js inside the normal layout, if the plugin is on.
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { plugin, isOn } from "@/plugins";
import Nav from "../../nav";
export const dynamic="force-dynamic";
export default async function P({params,searchParams}){
  const {name}=await params, p=plugin(name), q=sql(), s=await getSettings(q);
  const body=!p?.Page?<div className="card">No plugin page called <code>{name}</code>.</div>
    :!isOn(p,s)?<div className="card"><b>{p.title}</b> is turned off. Turn it on in <a href="/settings">Settings</a>.</div>
    :<p.Page q={q} searchParams={await searchParams} settings={s}/>;
  return <><Nav active={"p:"+name}/><main>{body}</main></>;
}
