# MCP server smoke tests

Read-only tests that exercise the most-used MCP tools against a real
VibeSharing API. Catches regressions in tool names, parameter shapes,
response contracts, and end-to-end auth before they reach AI clients.

## Running

```bash
# From mcp-server/
npm run build                      # tests run against dist/
VS_TEST_TOKEN=vs_... \
  VS_TEST_PROTOTYPE_ID=<uuid> \
  npm test
```

Optional: `VS_TEST_URL` overrides the API base (default `https://vibesharing.app`)
when testing against a staging deploy.

## What it covers

| Test | Asserts |
|---|---|
| Tools list | The 8 critical tool names exist (`verify_token`, `list_prototypes`, `list_collections`, `list_templates`, `resolve_target`, `get_template`, `list_versions`, `diagnose`). Catches renames/removals without a deprecation cycle. |
| `verify_token` | Token round-trips and the server identifies an org/user. |
| `list_prototypes` | Returns a non-empty text response. |
| `list_collections` | Returns a non-empty text response. |
| `list_templates` | Returns a non-empty text response. |
| `resolve_target` (no params) | Returns navigation listing. |
| `list_versions` | Fetches deploy history for `VS_TEST_PROTOTYPE_ID`. |
| `diagnose` | Returns a substantive health report. |

## What it does NOT cover

Destructive tools (`deploy_files`, `deploy_prototype`, `import_repo`,
`fork_prototype`, `share_html`, `delete_prototype`, `rollback_deploy`,
`update_prototype`) are intentionally skipped — they mutate prod state.
A separate destructive suite using a dedicated throwaway test prototype
is the next thing to add.

## Side effects on a successful run

Every test call appends a row to `mcp_usage_log` in the live DB. That's
the same telemetry every other MCP call generates. Acceptable for now;
filter it out of analytics by user agent (`vibesharing-smoke`) if needed.
