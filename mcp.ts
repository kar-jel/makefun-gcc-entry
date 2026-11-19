export interface McpState { repos: Map<string, Record<string, any>>; issues: Map<string, Record<string, any>[]>; pulls: Map<string, Record<string, any>[]> }
type Obj = Record<string, any>;
const rpcError = (code:number,message:string) => ({code,message});
const textResult = (value:unknown) => ({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const tools = [
 ['create_repo','Create a repository',{owner:{type:'string'},name:{type:'string'},description:{type:'string'},private:{type:'boolean'}}],['create_repository','Create a repository (alias)',{owner:{type:'string'},name:{type:'string'}}],
 ['get_repo','Get a repository',{owner:{type:'string'},repo:{type:'string'}}],['create_issue','Create an issue',{owner:{type:'string'},repo:{type:'string'},title:{type:'string'},body:{type:'string'}}],['list_issues','List repository issues',{owner:{type:'string'},repo:{type:'string'}}],
 ['create_pull_request','Create a pull request',{owner:{type:'string'},repo:{type:'string'},title:{type:'string'},head:{type:'string'},base:{type:'string'},body:{type:'string'}}],['list_pulls','List pull requests',{owner:{type:'string'},repo:{type:'string'}}],['merge_pull_request','Merge a pull request',{owner:{type:'string'},repo:{type:'string'},pull_number:{type:'number'}}]
] as const;
function invoke(name:string,a:Obj,s:McpState):unknown {
 const owner=String(a.owner||process.env.MAKEFUN_SHOP_TOKEN||'user'), repo=String(a.repo||a.name||''), key=`${owner}/${repo}`;
 if(name==='create_repo'||name==='create_repository'){if(!repo)throw rpcError(-32602,'name is required');if(s.repos.has(key))throw rpcError(-32000,'repository already exists');const value={id:s.repos.size+1,name:repo,full_name:key,owner:{login:owner},private:!!a.private,description:a.description??null,default_branch:'main'};s.repos.set(key,value);return value;}
 if(!repo)throw rpcError(-32602,'repo is required');if(!s.repos.has(key))throw rpcError(-32004,'repository not found');
 if(name==='get_repo')return s.repos.get(key)!;
 if(name==='create_issue'){if(!a.title)throw rpcError(-32602,'title is required');const list=s.issues.get(key)||[],item={id:list.length+1,number:list.length+1,title:a.title,body:a.body??'',state:'open',user:{login:owner},labels:[]};list.push(item);s.issues.set(key,list);return item;}
 if(name==='list_issues')return s.issues.get(key)||[];
 if(name==='create_pull_request'){if(!a.title||!a.head||!a.base)throw rpcError(-32602,'title, head and base are required');const list=s.pulls.get(key)||[],item={id:list.length+1,number:list.length+1,title:a.title,body:a.body??'',state:'open',head:{ref:a.head},base:{ref:a.base},merged:false};list.push(item);s.pulls.set(key,list);return item;}
 if(name==='list_pulls')return s.pulls.get(key)||[];
 if(name==='merge_pull_request'){const item=(s.pulls.get(key)||[]).find(x=>x.number===Number(a.pull_number));if(!item)throw rpcError(-32004,'pull request not found');item.merged=true;item.state='closed';return {merged:true,message:'Pull Request successfully merged'};}
 throw rpcError(-32601,`unknown tool: ${name}`);
}
export function handleMcp(request:Obj,state:McpState):Obj|null {
 const id=request.id, reply=(result:Obj)=>({jsonrpc:'2.0',id,result});
 if(request.jsonrpc!=='2.0'||typeof request.method!=='string')return {jsonrpc:'2.0',id:id??null,error:rpcError(-32600,'invalid JSON-RPC request')};
 if(request.method.startsWith('notifications/'))return null;
 try {
  if(request.method==='initialize')return reply({protocolVersion:request.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'local-forge',version:'1.0.0'}});
  if(request.method==='ping')return reply({});
  if(request.method==='tools/list')return reply({tools:tools.map(([name,description,properties])=>({name,description,inputSchema:{type:'object',properties,additionalProperties:false}}))});
  if(request.method==='tools/call'){const p=request.params||{};if(!tools.some(t=>t[0]===p.name))return {jsonrpc:'2.0',id,error:rpcError(-32602,`unknown tool: ${p.name}`)};try{return reply(textResult(invoke(p.name,p.arguments||{},state)))}catch(e:any){const msg=e?.message||'internal error';return reply({...textResult({error:msg}),isError:true});}}
  return {jsonrpc:'2.0',id,error:rpcError(-32601,`method not found: ${request.method}`)};
 }catch(e:any){return {jsonrpc:'2.0',id,error:rpcError(-32603,e?.message||'internal error')}}
}
export function handleMcpHttp(payload:unknown,state:McpState):unknown {if(Array.isArray(payload))return payload.map(x=>handleMcp(x,state)).filter(Boolean);return handleMcp(payload as Obj,state)}
