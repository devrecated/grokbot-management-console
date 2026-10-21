// Usage moved to the usage plugin. Old links (/usage?days=...) still land there.
import { redirect } from "next/navigation";
export default async function R({searchParams}){ redirect("/p/usage"+(s=>s?"?"+s:"")(new URLSearchParams(await searchParams).toString())); }
