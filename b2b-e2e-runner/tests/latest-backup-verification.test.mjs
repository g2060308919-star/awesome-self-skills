import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, lstat, readlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const python = process.env.PYTHON || '/usr/bin/python3';
const verifier = fileURLToPath(new URL('../scripts/verify-source-backup.py', import.meta.url));
const makeArchive = String.raw`
import sys,io,json,tarfile,hashlib,posixpath
archive,variant=sys.argv[1:]
root='b2b-e2e-runner-v2-source'
files={p:('source '+p+'\n').encode() for p in ['SKILL.md','package.json','package-lock.json','scripts/run-artifacts.mjs','scripts/cdp-fetch-proxy.mjs','scripts/lib/mock-scenario.mjs','references/workflow.md','references/proxy-protocol.md','references/result-model.md','tests/minimal.test.mjs','.project-config']}
if variant=='missing':del files['scripts/run-artifacts.mjs']
entries=[];members=[]
def add(name,data=b'',kind='file',mode=0o644,link=''):
 members.append((name,data,kind,mode,link))
add(root,kind='directory',mode=0o755);add(root+'/source',kind='directory',mode=0o755)
dirs=set()
for p in files:
 parent=posixpath.dirname(p)
 while parent:
  dirs.add(parent);parent=posixpath.dirname(parent)
for p in sorted(dirs):
 entries.append({'path':p,'type':'directory','mode':'0o755'});add(root+'/source/'+p,kind='directory',mode=0o755)
for p,data in files.items():
 mode=0o755 if p=='scripts/run-artifacts.mjs' else 0o644
 entries.append({'path':p,'type':'file','mode':oct(mode),'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 add(root+'/source/'+p,b'changed bytes' if variant=='hash' and p=='SKILL.md' else data,mode=0o600 if variant=='mode' and p=='SKILL.md' else mode)
link='../../outside' if variant=='symlink' else 'run-artifacts.mjs'
entries.append({'path':'scripts/runner','type':'symlink','mode':'0o777','target':link,'sha256':hashlib.sha256(link.encode()).hexdigest()});add(root+'/source/scripts/runner',kind='symlink',mode=0o777,link=link)
restore=b'Extract into a new directory and compare; never automatically overwrite.\n'
manifest={'format':'source-backup-manifest-v1','source':{'root':'/fixture/source','kind':'local test'},'restore_requirements':{'node':'>=22'},'exclusions':[],'entries':entries,'metadata':{'RESTORE.md':{'sha256':hashlib.sha256(restore).hexdigest()}}}
if variant=='manifest-traversal':manifest['entries'][0]['path']='../escape'
add(root+'/RESTORE.md',restore);add(root+'/manifest.json',json.dumps(manifest).encode())
if variant=='traversal':add(root+'/../escape',b'escape')
if variant=='absolute':add('/tmp/backup-verification-escape',b'escape')
if variant=='unlisted':add(root+'/source/unlisted.mjs',b'unknown')
with tarfile.open(archive,'w:gz') as t:
 for name,data,kind,mode,link in members:
  item=tarfile.TarInfo(name);item.mode=mode
  if kind=='directory':item.type=tarfile.DIRTYPE
  elif kind=='symlink':item.type=tarfile.SYMTYPE;item.linkname=link
  else:item.size=len(data)
  t.addfile(item,io.BytesIO(data) if kind=='file' else None)
`;
async function setup(t, variant = 'valid') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-backup-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = path.join(root, 'source.tar.gz');
  const created = spawnSync(python, ['-c', makeArchive, archive, variant], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const execute = (...args) => spawnSync(python, [verifier, archive, ...args], { encoding: 'utf8' });
  return { root, archive, execute };
}

test('A02 valid source backup verifies read-only and safely restores files, hidden source, modes and internal link to a new directory', async t => {
  const { root, archive, execute } = await setup(t);
  const original = await readFile(archive);
  const checked = execute();
  assert.equal(checked.status, 0, checked.stderr + checked.stdout);
  assert.equal(JSON.parse(checked.stdout).archive_sha256, createHash('sha256').update(original).digest('hex'));
  const output = path.join(root, 'new-restoration');
  const restored = execute('--extract-to', output);
  assert.equal(restored.status, 0, restored.stderr + restored.stdout);
  assert.equal(JSON.parse(restored.stdout).extracted_verified, true);
  const source = path.join(output, 'b2b-e2e-runner-v2-source/source');
  assert.match(await readFile(path.join(source, '.project-config'), 'utf8'), /source/);
  assert.equal((await lstat(path.join(source, 'scripts/run-artifacts.mjs'))).mode & 0o777, 0o755);
  assert.equal(await readlink(path.join(source, 'scripts/runner')), 'run-artifacts.mjs');
  assert.deepEqual(await readFile(archive), original);
});

for (const [variant, code] of [['traversal','UNSAFE_PATH'], ['absolute','UNSAFE_PATH'], ['manifest-traversal','UNSAFE_PATH'], ['missing','MISSING_REQUIRED'], ['hash','HASH_MISMATCH'], ['mode','MODE_MISMATCH'], ['symlink','UNSAFE_SYMLINK'], ['unlisted','MANIFEST_MISMATCH']]) {
  test(`A02 rejects ${variant} before creating extraction target and leaves the archive unchanged`, async t => {
    const { root, archive, execute } = await setup(t, variant);
    const before = await readFile(archive);
    const output = path.join(root, 'new-restoration');
    const result = execute('--extract-to', output);
    assert.equal(result.status, 2, result.stderr + result.stdout);
    assert.equal(JSON.parse(result.stdout).error, code);
    await assert.rejects(lstat(output), { code: 'ENOENT' });
    assert.deepEqual(await readFile(archive), before);
  });
}

test('A02 refuses an existing extraction directory and preserves existing files', async t => {
  const { root, execute } = await setup(t);
  const output = path.join(root, 'existing'); await mkdir(output);
  await writeFile(path.join(output, 'keep.txt'), 'keep');
  const result = execute('--extract-to', output);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error, 'DESTINATION_EXISTS');
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'keep');
});
