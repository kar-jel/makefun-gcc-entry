import type { IncomingMessage, ServerResponse } from 'node:http';
import { gitStore, type GitStore } from './store.ts';

const pkt = (s: string) => Buffer.from(`${(s.length + 4).toString(16).padStart(4, '0')}${s}`);
const flush = Buffer.from('0000');
const service = (name: string) => Buffer.concat([pkt(`# service=${name}\n`), flush]);
export async function handleGitHttp(req: IncomingMessage, res: ServerResponse, owner: string, repo: string, store: GitStore = gitStore): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost'), dir = store.dir(owner, repo);
  if (!await store.exists(owner, repo)) return false;
  if (url.pathname.endsWith('/info/refs')) {
    const svc = url.searchParams.get('service');
    if (svc !== 'git-upload-pack' && svc !== 'git-receive-pack') { res.writeHead(400); res.end(); return true; }
    try {
    const { stdout } = await store.run(['--git-dir', dir, svc === 'git-upload-pack' ? 'upload-pack' : 'receive-pack', '--stateless-rpc', '--advertise-refs', '.']);
      const refs = stdout.toString('binary').replace(/\x00[^\n]*/, '');
      res.writeHead(200, { 'content-type': `application/x-${svc}-advertisement`, 'cache-control': 'no-cache' });
      res.end(Buffer.concat([service(svc), Buffer.from(refs, 'binary')]));
    } catch { res.writeHead(500); res.end(); }
    return true;
  }
  const receive = url.pathname.endsWith('/git-receive-pack');
  if (!receive && !url.pathname.endsWith('/git-upload-pack')) return false;
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
  const svc = receive ? 'git-receive-pack' : 'git-upload-pack', bufs: Buffer[] = [];
  try {
    for await (const b of req) bufs.push(Buffer.from(b));
    const { stdout } = await store.run(['--git-dir', dir, receive ? 'receive-pack' : 'upload-pack', '--stateless-rpc', '.'], Buffer.concat(bufs));
    res.writeHead(200, { 'content-type': `application/x-${svc}-result`, 'cache-control': 'no-cache' });
    if (receive) res.end(stdout); else res.end(stdout);
  } catch (e) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end(String(e)); }
  return true;
}
