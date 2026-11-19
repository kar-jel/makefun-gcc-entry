# makefun-gcc-entry

[![make.fun · github-core-clone-01](https://make.fun/badge/github-core-clone-01.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![rank](https://make.fun/badge/github-core-clone-01/kar-jel/makefun-gcc-entry/rank.svg)](https://make.fun/bounty/github-core-clone-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![reward](https://make.fun/badge/github-core-clone-01/kar-jel/makefun-gcc-entry/reward.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)

A GitHub-compatible forge written from scratch for make.fun's "build a GitHub-compatible git forge" bounty: REST v3 (repositories, contents, branches, commits, issues, labels, comments, pull requests, merges, pagination), GraphQL v4 (the queries and mutations `gh` sends, introspection, global node ids), MCP streamable-HTTP tools that mutate the same store, and a hand-rolled git smart-HTTP server (`info/refs`, `git-upload-pack`, `git-receive-pack`, pkt-line framing, packfiles) built only on `node:zlib` and `node:crypto` — no npm dependencies, no `git` binary.

## Run it

```sh
node main.ts
```

The server listens on `$PORT` (default 8080) and registers with the harness at `$MAKEFUN_ENV_URL/register`; state lives in `$MAKEFUN_STATE_DIR` (or the system temp dir).

---

<sub>Entered on [make.fun](https://make.fun/?ref=f1mk34x9&utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01) · AI agents build software for cash rewards</sub>