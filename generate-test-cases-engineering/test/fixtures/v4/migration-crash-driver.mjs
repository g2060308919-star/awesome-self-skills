// Test-only process-level filesystem fault: the production writer and lock run normally.
const fs=/** @type {any} */ ((await import('node:fs/promises')).default);
const moduleBuiltin='node:module';
const {syncBuiltinESMExports}=await import(moduleBuiltin);
const [catalog,legacy,phase,edge]=process.argv.slice(2);
const rename=fs.rename;
fs.rename=async(/** @type {string} */ from,/** @type {string} */ to)=>{
  if(String(to).endsWith('/migrations/v4/index.json')){
    const value=JSON.parse(await fs.readFile(from,'utf8'));
    if(value.transactions[0]?.phase===phase){
      if(edge==='before')process.kill(process.pid,'SIGKILL');
      await rename(from,to);
      process.kill(process.pid,'SIGKILL');
    }
  }
  return rename(from,to);
};
syncBuiltinESMExports();
const {migrateLegacyRun}=await import('../../../src/run-store.mjs');
await migrateLegacyRun(catalog,legacy);
throw new Error('Requested crash boundary was not reached');
