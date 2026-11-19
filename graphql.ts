export type JsonObject = Record<string, any>;
export interface ForgeState {
  repos: Map<string, JsonObject>; issues: Map<string, JsonObject[]>; pulls: Map<string, JsonObject[]>;
}
const id = (x: unknown) => String(x ?? '');
const pick = (o: JsonObject | undefined, fields: string[]) => o ? Object.fromEntries(fields.filter(f => f in o).map(f => [f, o[f]])) : null;

/** A dependency-free, deliberately focused GitHub GraphQL compatibility layer. */
export function executeGraphql(query: string, variables: JsonObject = {}, state: ForgeState): JsonObject {
  if (!query.trim()) return { errors: [{ message: 'query is required' }] };
  if (/\bmutation\b/.test(query)) return { errors: [{ message: 'GraphQL mutation is not supported; use the REST API for writes' }] };
  const data: JsonObject = {};
  const aliases = [...query.matchAll(/\b(repository|viewer|node|organization|user)\s*(?:\(([^)]*)\))?\s*\{/g)];
  for (const match of aliases) {
    const [, kind, args = ''] = match;
    const field = kind;
    const arg = (name: string) => args.match(new RegExp(`${name}\\s*:\\s*(?:\\$([\\w]+)|"([^"]*)")`));
    const val = (name: string) => { const m = arg(name); return m ? (m[1] ? variables[m[1]] : m[2]) : undefined; };
    if (kind === 'repository') {
      const owner = id(val('owner')), name = id(val('name'));
      const repo = state.repos.get(`${owner}/${name}`);
      if (!repo) { data[field] = null; continue; }
      const issueField = /\bissues\s*(?:\([^)]*\))?\s*\{/.exec(query);
      const pullField = /\bpullRequests\s*(?:\([^)]*\))?\s*\{/.exec(query);
      data[field] = { ...repo, nameWithOwner: repo.full_name, databaseId: repo.id,
        owner: repo.owner, defaultBranchRef: repo.default_branch ? { name: repo.default_branch } : null,
        issues: issueField ? { nodes: (state.issues.get(`${owner}/${name}`) || []).map(x => ({ ...x, databaseId: x.id })) } : undefined,
        pullRequests: pullField ? { nodes: (state.pulls.get(`${owner}/${name}`) || []).map(x => ({ ...x, databaseId: x.id, headRefName: x.head?.ref, baseRefName: x.base?.ref })) } : undefined };
    } else if (kind === 'viewer') data[field] = { login: id(process.env.MAKEFUN_SHOP_TOKEN || 'user') };
    else data[field] = null;
  }
  if (query.includes('__typename')) data.__typename = 'Query';
  if (query.includes('__type')) data.__type = null;
  if (query.includes('__schema')) data.__schema = { queryType: { name: 'Query' }, mutationType: null, types: [] };
  if (!aliases.length && !query.includes('__')) return { errors: [{ message: 'Unsupported GraphQL query' }] };
  return { data };
}

export function projectRepository(repo: JsonObject | undefined, fields: string[]): JsonObject | null { return pick(repo, fields); }
