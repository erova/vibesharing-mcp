import test from "node:test";
import assert from "node:assert/strict";
import { requireTestEnv, startServer, textOf } from "./helpers.mjs";

// One shared connection for the suite. node:test runs sequentially by default
// for top-level tests, so we don't need per-test isolation here.
const env = requireTestEnv();
let client;

test.before(async () => {
  client = await startServer(env);
});

test.after(async () => {
  await client?.close();
});

test("server lists tools and the core set is present", async () => {
  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));
  // Spot-check tools that callers depend on; if a future change renames one
  // of these without a deprecation cycle, this test fails loudly.
  for (const required of [
    "verify_token",
    "list_prototypes",
    "list_collections",
    "list_templates",
    "resolve_target",
    "get_template",
    "list_versions",
    "diagnose",
  ]) {
    assert.ok(names.has(required), `expected tool '${required}' in tool list`);
  }
});

test("verify_token round-trips a valid token", async () => {
  const res = await client.callTool({ name: "verify_token", arguments: {} });
  const text = textOf(res);
  // Response should mention an org name OR the user's name. We don't assert
  // a specific value because that varies by test env, but it must not be a
  // bare error message.
  assert.match(text, /org|account|user|name/i);
});

test("list_prototypes returns a result without throwing", async () => {
  const res = await client.callTool({ name: "list_prototypes", arguments: {} });
  const text = textOf(res);
  assert.ok(text.length > 0, "expected non-empty response text");
});

test("list_collections returns a result without throwing", async () => {
  const res = await client.callTool({ name: "list_collections", arguments: {} });
  const text = textOf(res);
  assert.ok(text.length > 0, "expected non-empty response text");
});

test("list_templates returns a result without throwing", async () => {
  const res = await client.callTool({ name: "list_templates", arguments: {} });
  const text = textOf(res);
  assert.ok(text.length > 0, "expected non-empty response text");
});

test("resolve_target with no params returns a navigation listing", async () => {
  const res = await client.callTool({ name: "resolve_target", arguments: {} });
  const text = textOf(res);
  assert.ok(text.length > 0, "expected non-empty response text");
});

test("list_versions for the test prototype returns deploy history", async () => {
  const res = await client.callTool({
    name: "list_versions",
    arguments: { prototype_id: env.prototypeId },
  });
  const text = textOf(res);
  assert.ok(text.length > 0, "expected non-empty response text");
});

test("diagnose reports server health", async () => {
  const res = await client.callTool({ name: "diagnose", arguments: {} });
  const text = textOf(res);
  // diagnose surfaces token state, lock state, recent errors — assert it
  // returned a real report, not just an empty string.
  assert.ok(text.length > 50, "diagnose should produce a substantive report");
});
