import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { gitStore, type GitStore } from './store.ts';

const pkt = (s: string) => Buffer.from(`${(Buffer.byteLength(s) + 4).toString(16).padStart(4, '0')}${s}`);
const flush = Buffer.from('0000');
const service = (name: string) => Buffer.concat([pkt(`# service=${name}\n`), flush]);
export async function handleGitHttp(req: IncomingMessage, res: ServerResponse, owner: string, repo: string, store: GitStore = gitStore): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost'), dir = store.dir(owner, repo);
  if (!await store.exists(owner, repo)) return false;
  if (url.pathname.endsWith('/info/refs')) {
    const svc = url.searchParams.get('service');
    if (svc !== 'git-upload-pack' && svc !== 'git-receive-pack') { res.writeHead(400); res.end(); return true; }
    try {
      const refs = await store.run(['--git-dir', dir, 'for-each-ref', '--format=%(objectname) %(refname)']);
      const head = await store.run(['--git-dir', dir, 'symbolic-ref', '-q', 'HEAD']).catch(() => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }));
      const lines = refs.stdout.toString().trim().split('\n').filter(Boolean);
      const caps = 'report-status delete-refs ofs-delta';
      let advertisement: Buffer;
      if (svc === 'git-receive-pack' && lines.length === 0) {
        advertisement = Buffer.concat([pkt(`${'0'.repeat(40)} capabilities^{}\0 ${caps}\n`), flush]);
      } else if (lines.length) {
        const headRef = head.stdout.toString().trim();
        const symref = svc === 'git-upload-pack' && headRef ? ' symref=HEAD:' + headRef : '';
        advertisement = Buffer.concat(lines.map((line, i) => pkt(`${line}${i === 0 ? `\0${svc === 'git-receive-pack' ? ' ' + caps : 'multi_ack_detailed side-band-64k ofs-delta shallow no-progress include-tag' + symref}` : ''}\n`)).concat([flush]));
      } else if (svc === 'git-receive-pack') {
        advertisement = Buffer.concat([pkt(`${'0'.repeat(40)} capabilities^{}\0 ${caps}\n`), flush]);
      } else {
        const out = await store.run(['--git-dir', dir, 'upload-pack', '--stateless-rpc', '--advertise-refs', dir]);
        advertisement = out.stdout;
      }
      res.writeHead(200, { 'content-type': `application/x-${svc}-advertisement`, 'cache-control': 'no-cache' });
      res.end(Buffer.concat([service(svc), advertisement]));
    } catch { res.writeHead(500); res.end(); }
    return true;
  }
  const receive = url.pathname.endsWith('/git-receive-pack');
  if (!receive && !url.pathname.endsWith('/git-upload-pack')) return false;
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
  const svc = receive ? 'git-receive-pack' : 'git-upload-pack', bufs: Buffer[] = [];
  try {
    for await (const b of req) bufs.push(Buffer.from(b));
    const raw = Buffer.concat(bufs);
    const body = (req.headers['content-encoding'] || '').toLowerCase() === 'gzip' ? gunzipSync(raw) : raw;
    let stdout: Buffer;
    if (receive) {
      stdout = (await store.run(['--git-dir', dir, 'receive-pack', '--stateless-rpc', dir], body)).stdout;
    } else {
      stdout = (await store.run(['--git-dir', dir, 'upload-pack', '--stateless-rpc', dir], body)).stdout;
    }
    res.writeHead(200, { 'content-type': `application/x-${svc}-result`, 'cache-control': 'no-cache' });
    res.end(stdout);
  } catch (e) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end(String(e)); }
  return true;
}
