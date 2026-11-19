import { createApp } from '../app.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const server = createApp();
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as any).port, base = `http://127.0.0.1:${port}`;
const post = await fetch(base + '/api/v3/user/repos', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({name:'smoke'}) });
if (post.status !== 201) throw new Error(`create status ${post.status}`);
const tmp = await mkdtemp(join(tmpdir(), 'git-http-'));
try {
  execFileSync('git', ['clone', base + '/user/smoke.git', join(tmp, 'clone')], { stdio: 'inherit' });
  execFileSync('git', ['-C', join(tmp,'clone'), 'config', 'user.name', 'Tester']);
  execFileSync('git', ['-C', join(tmp,'clone'), 'config', 'user.email', 't@example.test']);
  await import('node:fs/promises').then(fs=>fs.writeFile(join(tmp,'clone','test.txt'),'smart http works\n'));
  execFileSync('git', ['-C', join(tmp,'clone'), 'add', 'test.txt']); execFileSync('git', ['-C', join(tmp,'clone'), 'commit', '-m', 'test']);
  execFileSync('git', ['-C', join(tmp,'clone'), 'push', 'origin', 'main'], { stdio: 'inherit' });
  const verify = join(tmp,'verify'); execFileSync('git', ['clone', base + '/user/smoke.git', verify], { stdio: 'inherit' });
  const contents = await import('node:fs/promises').then(fs=>fs.readFile(join(verify,'test.txt'),'utf8'));
  if (contents !== 'smart http works\n') throw new Error('clone verification mismatch');
  console.log('PASS: create repository, clone empty, push commit, clone pushed content');
} finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(tmp,{recursive:true,force:true}); }
