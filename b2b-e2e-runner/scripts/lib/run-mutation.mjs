import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
// One short filesystem transaction protects the existing authoritative ledger.
// A stale lock is never stolen: uncertain ownership needs explicit inspection.
export async function withRunMutation(runRoot,operation) {
 const lockPath=path.join(runRoot,'.ledger-write.lock');
 const deadline=Date.now()+5000; let lock;
 while(!lock) {
  try { lock=await open(lockPath,'wx',0o600); }
  catch(error) { if(error.code!=='EEXIST') throw error; if(Date.now()>=deadline) { const busy=new Error('Run 账本正在写入或存在待核验遗留锁；未修改日志'); busy.code='RUN_WRITE_BUSY'; throw busy; } await setTimeout(20); }
 }
 try { await lock.writeFile(JSON.stringify({pid:process.pid,created_at:new Date().toISOString()})); return await operation(); }
 finally { await lock.close(); await unlink(lockPath); }
}
