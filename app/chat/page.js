// Chat moved to the chat plugin. Old links (/chat?thread=...) still land there.
import { redirect } from "next/navigation";
export default async function R({searchParams}){ redirect("/p/chat"+(s=>s?"?"+s:"")(new URLSearchParams(await searchParams).toString())); }
