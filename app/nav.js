export default function Nav({right}){return <header><span style={{display:"flex",gap:18,alignItems:"center"}}><a href="/" style={{color:"#fff",textDecoration:"none"}}><b>Routines &amp; runs</b></a></span>
  <span style={{display:"flex",gap:16,alignItems:"center"}}>{right}<a href="/settings" style={{color:"#fff"}}>⚙ Settings</a></span></header>}
