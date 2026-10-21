// Plugin registry helpers. PLUGINS comes from the generated file; on/off lives in Settings (config.settings.plugins).
import { PLUGINS } from "./index.gen.js";
export { PLUGINS };
export const isOn=(p,s)=>(s?.plugins||{})[p.name]??p.enabled;
export const enabledPlugins=s=>PLUGINS.filter(p=>isOn(p,s));
export const plugin=name=>PLUGINS.find(p=>p.name===name);
