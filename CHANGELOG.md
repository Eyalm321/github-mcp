# Changelog

## 2.0.0 (2026-11-24)

Breaking: 20 tools are removed (their operations are no longer in GitHub's description), so this ships as a major version.

### Added
- Tools regenerated from the current api.github.com REST description: 1,281 tools in 46 categories (was 1,112 in 44), 189 new. New categories: `agent-automations`, `agent-merge`, `agents`, `code-quality`, `copilot-spaces`; existing categories gain the operations GitHub added (for example the new Copilot usage-metrics reports).
- Every tool carries MCP annotations from its HTTP method, so clients can tell reads from writes: `GET` tools are `readOnlyHint`, `DELETE` tools `destructiveHint` and `idempotentHint`, `PUT` tools `idempotentHint`; all are `openWorldHint` (they call api.github.com). Tools register through `registerTool`.

### Removed
- `enterprise-teams`, `enterprise-team-memberships` and `enterprise-team-organizations` (17 tools): GitHub moved `/enterprises/{enterprise}/teams*` out of the api.github.com description (they are GitHub Enterprise Cloud only).
- `github_agent_tasks_create_task`: the description now has `agent-tasks/create-task-in-repo` instead; use `github_agent_tasks_create_task_in_repo`.
- `github_copilot_copilot_metrics_for_organization` and `github_copilot_copilot_metrics_for_team`: no longer in the description; the new `github_copilot_copilot_*_usage_metrics` tools cover Copilot usage metrics.

### Changed
- Requires Node 22 or later (`engines.node >=22`); Node 20 reached end of life in April 2026. CI tests Node 22 and 24; the publish workflow's build and GitHub Packages jobs run on Node 22 (the npm job stays on Node 24 for trusted publishing). `@types/node` follows the lowest supported major (^22).
- Development: `npm run generate` removes generated files the description no longer produces, so a regenerate is the whole tool set.
- Development: `npm run generate` runs the generator straight under Node's TypeScript type stripping (`scripts/generate.mts`, Node 22.18+) and `npm run dev` builds with `tsc` then starts `dist`; `ts-node` is no longer a dev dependency (it needs the TypeScript JS API, which TypeScript 7 does not ship). The published package is unchanged.
- Development: TypeScript 7.0.2 and vitest 5.1.0 (dev dependencies only; the build output is unchanged apart from declaration enum order).
- Development: generated files name `scripts/generate.mts` in their header, and the generated `src/index.ts` takes the server version from `package.json` (it said 1.0.0).

## 1.0.4 (2026-11-16)

### Security
- `hono` 4.13.14 → 4.13.16 and `@hono/node-server` 1.19.17 → 2.1.6. Both come in through `@modelcontextprotocol/sdk`, whose declared range for `@hono/node-server` (`^1.19.9 || ^2.0.5`) includes 2.x, so the 1.19.17 override is removed. This clears the remaining moderate advisories in the SDK's HTTP transport (which this stdio server never loads anyway). `npm audit --omit=dev` now reports 0 vulnerabilities. Dev-only findings in the older vitest remain, fixed by the vitest 5 follow-up.

## 1.0.3 (2026-11-15)

No tool or API changes. Same Node support.

### Security and dependencies
- `@modelcontextprotocol/sdk` 1.29.0 → 1.32.2, `zod` 4.3.6 → 4.6.7.
- `npm audit --omit=dev`: 0 critical, 0 high (3 moderate, not reachable: they are in the SDK's HTTP transport, which this stdio server never loads). Dev-only findings in the older vitest remain, fixed by the vitest 5 follow-up.
- Every dependency version is at least 14 days old (#1).

### Maintenance
- Dependabot with a 14-day cooldown (#1).
- npm publishing uses trusted publishing (OIDC). Workflow actions are pinned to commit SHAs (#2).

## Earlier versions

See the [GitHub releases](https://github.com/Eyalm321/github-mcp/releases).
