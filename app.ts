import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { executeGraphql } from './graphql.ts';
import { handleMcpHttp } from './mcp.ts';
import { handleGitHttp, gitStore } from './git/pack.ts';

const ROOT = process.env.MAKEFUN_STATE_DIR ?? join(tmpdir(), 'forge-state-' + process.pid);
mkdirSync(ROOT, { recursive: true });
const JSON_TYPE = 'application/json; charset=utf-8';
type Obj = Record<string, any>;
const repos = new Map<string, Obj>(), issues = new Map<string, Obj[]>(), pulls = new Map<string, Obj[]>(), labels = new Map<string, string[]>(), contents = new Map<string, Obj>();
const key = (o:string,r:string) => `${o}/${r}`;
const send = (res:ServerResponse,status:number,data:unknown,headers:Record<string,string>={}) => { const text=status===204?'':JSON.stringify(data)+'\n'; res.writeHead(status,{'content-type':JSON_TYPE,'content-length':Buffer.byteLength(text),'x-github-request-id':'forge-local',...headers}); res.end(text); };
async function body(req:IncomingMessage):Promise<Obj>{let s='';for await(const c of req)s+=c;if(!s)return {};try{const x=JSON.parse(s);if(!x||typeof x!=='object'||Array.isArray(x))throw 0;return x;}catch{throw new Error('malformed JSON');}}
async function persist(name:string,value:unknown){await mkdir(ROOT,{recursive:true});await writeFile(join(ROOT,encodeURIComponent(name)+'.json'),JSON.stringify(value));}
const id=(s:string)=>createHash('sha1').update(s).digest('hex');
function ghRepo(o:string,r:string){return repos.get(key(o,r));}
function repository(o:string,r:string):Obj {return ghRepo(o,r) ?? {id:parseInt(id(key(o,r)).slice(0,8),16),node_id:id(key(o,r)),name:r,full_name:key(o,r),owner:{login:o},private:false,description:null,default_branch:'main',html_url:`http://forge/${key(o,r)}`};}
let loaded=false;
async function loadState(){if(loaded)return;loaded=true;try{const rows=JSON.parse(await readFile(join(ROOT,'repos.json'),'utf8'));for(const [k,v] of rows)repos.set(k,v);}catch{} }
export function createApp():Server{return createServer(async(req,res)=>{await loadState();const method=req.method??'GET';let path='/',q=new URL(req.url??'/', 'http://entry');path=q.pathname;
try {
if(method==='GET'&&path==='/healthz')return send(res,200,{ok:true});
const gm=path.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/);
if(gm){const [,owner,repo]=gm;const known=ghRepo(owner,repo);if(!known)return send(res,404,{message:'Not Found'});try{if(!await gitStore.exists(owner,repo))await gitStore.init(owner,repo,known.default_branch??'main');if(await handleGitHttp(req,res,owner,repo))return;}catch(e){return send(res,500,{message:e instanceof Error?e.message:'Git error'});}}
if(path==='/api/v3'||path==='/api/v3/')return send(res,200,{current_user_url:'/api/v3/user'},{'x-oauth-scopes':'repo, read:org'});
if(path==='/api/v3/meta')return send(res,200,{installed_version:'1.0.0'});
if(path==='/api/graphql'&&method==='POST'){const b=await body(req);const result=executeGraphql(String(b.query??''),b.variables??{},{repos,issues,pulls});return send(res,200,result);}
if(path==='/mcp'&&method==='POST'){const b=await body(req);const result=handleMcpHttp(b,{repos,issues,pulls});if(result===null)return send(res,202,{});return send(res,200,result);}

const user=process.env.MAKEFUN_SHOP_TOKEN||'user';
if(path==='/api/v3/user/repos'&&method==='GET'){const all=[...repos.values()].filter(x=>x.owner.login===user),page=Number(q.searchParams.get('page')||1),per=Number(q.searchParams.get('per_page')||30),hdr=all.length>page*per?{'link':`<${path}?page=${page+1}&per_page=${per}>; rel="next"`}:{};return send(res,200,all.slice((page-1)*per,page*per),hdr);}
if(path==='/api/v3/user/repos'&&method==='POST'){const b=await body(req),name=String(b.name??'');if(!name)return send(res,422,{message:'name required'});const repo={...repository(user,name),...b,id:parseInt(id(key(user,name)).slice(0,8),16),owner:{login:user},name,full_name:key(user,name),default_branch:'main'};repos.set(key(user,name),repo);await gitStore.init(user,name,repo.default_branch);await persist('repos', [...repos]);return send(res,201,repo);}
const m=path.match(/^\/api\/v3\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
if(m){const [,o,r,tail='']=m,k=key(o,r),repo=ghRepo(o,r);if(!repo)return send(res,404,{message:'Not Found'});if(!tail){if(method==='GET')return send(res,200,repo);if(method==='PATCH'){const b=await body(req);Object.assign(repo,b);await persist('repos',[...repos]);return send(res,200,repo);}if(method==='DELETE'){repos.delete(k);await persist('repos',[...repos]);return send(res,204,{});}}
if(tail==='labels'&&method==='POST'){const b=await body(req),name=String(b.name??'');if(!labels.has(k))labels.set(k,[]);labels.get(k)!.push(name);await persist(`labels-${k}`,labels.get(k));return send(res,201,{...b,name});}
if(tail==='issues'&&method==='POST'){const b=await body(req);if((b.labels??[]).some((l:any)=>!labels.get(k)?.includes(typeof l==='string'?l:l.name)))return send(res,422,{message:'Validation Failed'});const a=issues.get(k)??[],item={...b,id:parseInt(id(k+'issue'+a.length).slice(0,8),16),number:a.length+1,state:'open',user:{login:user},labels:b.labels??[]};a.push(item);issues.set(k,a);await persist(`issues-${k}`,a);return send(res,201,item);}
const im=tail.match(/^issues\/(\d+)$/);if(im&&method==='GET'){const it=issues.get(k)?.find(x=>x.number===+im[1]);return it?send(res,200,it):send(res,404,{message:'Not Found'});}
if(tail==='pulls'&&method==='POST'){const b=await body(req),a=pulls.get(k)??[],item={...b,id:parseInt(id(k+'pull'+a.length).slice(0,8),16),number:a.length+1,state:'open',head:{ref:b.head},base:{ref:b.base},merged:false};a.push(item);pulls.set(k,a);await persist(`pulls-${k}`,a);return send(res,201,item);}
const pm=tail.match(/^pulls\/(\d+)(?:\/(merge))?$/);if(pm){const it=pulls.get(k)?.find(x=>x.number===+pm[1]);if(!it)return send(res,404,{message:'Not Found'});if(method==='GET'&&!pm[2])return send(res,200,it);if(method==='PUT'&&pm[2]){it.merged=true;it.state='closed';await persist(`pulls-${k}`,pulls.get(k));return send(res,200,{sha:id(k+it.number),merged:true,message:'Pull Request successfully merged'});}}
const cm=tail.match(/^contents\/(.+)$/);if(cm){const ck=k+'/'+decodeURIComponent(cm[1]);if(method==='GET'){const x=contents.get(ck);return x?send(res,200,x):send(res,404,{message:'Not Found'});}if(method==='PUT'){const b=await body(req),old=contents.get(ck);if(old&&b.sha!==old.sha)return send(res,409,{message:'sha does not match'});const sha=id(String(b.content??'')),x={name:cm[1].split('/').pop(),path:decodeURIComponent(cm[1]),sha,content:b.content,encoding:b.encoding??'utf-8',size:String(b.content??'').length};contents.set(ck,x);await persist(`content-${ck}`,x);return send(res,old?200:201,{content:x,commit:{sha:id(sha+'commit')}});}if(method==='DELETE'){if(!contents.has(ck))return send(res,404,{message:'Not Found'});contents.delete(ck);await persist(`content-${ck}`,null);return send(res,200,{commit:{sha:id(ck)}});}}
}
return send(res,404,{message:'Not Found'});
}catch(e){return send(res, e instanceof Error&&e.message==='malformed JSON'?400:500,{message:e instanceof Error?e.message:'Internal error'});}
});}
