// Our own little caveman mark (original drawing). Nod to grugbrain.dev: complexity very bad.
export default function Grug({size=34}){return <svg width={size} height={size} viewBox="0 0 64 64" aria-label="grug">
  <circle cx="32" cy="30" r="20" fill="#c99a6b"/><path d="M12 26c2-14 38-14 40 0-6-6-10-2-14-6-4 4-8 0-12 4-4-4-10 0-14 2z" fill="#4a2f1b"/>
  <rect x="20" y="25" width="24" height="4" rx="2" fill="#4a2f1b"/><circle cx="25" cy="32" r="2.5" fill="#1d2330"/><circle cx="39" cy="32" r="2.5" fill="#1d2330"/>
  <path d="M26 41q6 4 12 0" stroke="#1d2330" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  <path d="M50 46l8-20" stroke="#7a5230" strokeWidth="5" strokeLinecap="round"/><circle cx="58" cy="24" r="5" fill="#7a5230"/></svg>}
