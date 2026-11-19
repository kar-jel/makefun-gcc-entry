import { mkdir, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

export class GitStore {
  readonly root: string;
  constructor(root = join(process.cwd(), 'state', 'git')) { this.root = resolve(root); }
  private path(owner: string, repo: string) {
    const valid = /^[A-Za-z0-9_.-]+$/;
    if (!valid.test(owner) || !valid.test(repo) || owner === '.' || owner === '..' || repo === '.' || repo === '..') throw new Error('invalid repository path');
    return join(this.root, owner, `${repo}.git`);
  }
  async exists(owner: string, repo: string) {
    try { return (await stat(join(this.path(owner, repo), 'HEAD'))).isFile(); } catch { return false; }
  }
  async init(owner: string, repo: string, defaultBranch = 'main') {
    const dir = this.path(owner, repo);
    await mkdir(join(this.root, owner), { recursive: true });
    if (!await this.exists(owner, repo)) await this.run(['init', '--bare', '--initial-branch', defaultBranch, dir]);
    await this.run(['--git-dir', dir, 'config', 'http.receivepack', 'true']);
    return dir;
  }
  async run(args: string[], input?: Buffer) {
    return new Promise<{ stdout: Buffer; stderr: Buffer }>((resolvePromise, reject) => {
      const p = spawn('git', args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } });
      const out: Buffer[] = [], err: Buffer[] = [];
      p.stdout.on('data', b => out.push(b)); p.stderr.on('data', b => err.push(b));
      p.on('error', reject); p.on('close', code => code === 0 ? resolvePromise({ stdout: Buffer.concat(out), stderr: Buffer.concat(err) }) : reject(new Error(Buffer.concat(err).toString() || `git exited ${code}`)));
      if (input) p.stdin.end(input); else p.stdin.end();
    });
  }
  async remove(owner: string, repo: string) { await rm(this.path(owner, repo), { recursive: true, force: true }); }
  dir(owner: string, repo: string) { return this.path(owner, repo); }
}
export const gitStore = new GitStore();
