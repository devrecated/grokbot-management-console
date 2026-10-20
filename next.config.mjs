// pglite ships a wasm file next to its JS, so keep it out of the bundle (only used in DEMO_MODE).
export default { serverExternalPackages:["@electric-sql/pglite","pg"] };
