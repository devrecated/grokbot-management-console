import Nav from "../nav";
import Grug from "./grug";
import Viewer from "./viewer";
export const dynamic="force-dynamic";
export default function Logs(){
  return <><Nav/><main>
    <Viewer grug={<Grug/>}/>
    <footer className="muted" style={{fontSize:12,margin:"24px 0"}}>Kept 7 days, max 200k lines, shipped from the box every minute while it is on. Built the <a href="https://grugbrain.dev" target="_blank" rel="noreferrer">grug brain</a> way.</footer>
  </main></>;
}
