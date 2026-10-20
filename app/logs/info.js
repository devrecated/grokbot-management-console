// (i) tooltip listing what the box tracks. Content comes from ship-config.json "catalog", sent by the box shipper.
export default function Info({catalog}){
  const c=catalog||{};
  const Sec=({t,items,a,b})=>items?.length?<><div className="tip-h">{t}</div><ul>{items.map((x,i)=><li key={i}><b>{x[a]}</b>: {x[b]}</li>)}</ul></>:null;
  return <span className="info" tabIndex={0} aria-label="What is tracked">i
    <span className="tip" role="tooltip">{catalog?<>
      <Sec t="Tracked" items={c.tracked} a="source" b="what"/>
      <Sec t="Excluded on purpose" items={c.excluded} a="what" b="why"/>
      <Sec t="Unavailable" items={c.unavailable} a="what" b="why"/>
      {c.notes&&<div className="muted" style={{marginTop:6}}>{c.notes}</div>}</>:<span>The box has not sent its source list yet.</span>}</span></span>;
}
