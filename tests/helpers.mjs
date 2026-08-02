import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Required env:
 *   VS_TEST_TOKEN         — a deploy token (vs_...) with access to the test prototype
 *   VS_TEST_PROTOTYPE_ID  — a prototype id the token can read
 * Optional:
 *   VS_TEST_URL           — override the API base (default https://vibesharing.app)
 */
export function requireTestEnv() {
  const token = process.env.VS_TEST_TOKEN;
  const prototypeId = process.env.VS_TEST_PROTOTYPE_ID;
  const url = process.env.VS_TEST_URL || "https://vibesharing.app";
  if (!token || !prototypeId) {
    console.error(
      "Smoke tests require VS_TEST_TOKEN and VS_TEST_PROTOTYPE_ID env vars. " +
        "Set them to a deploy token and a prototype id that token can read."
    );
    process.exit(1);
  }
  return { token, prototypeId, url };
}

/**
 * Spawn the built MCP server via stdio and return a connected client.
 * Caller is responsible for calling `client.close()` when done.
 */
export async function startServer({ token, url }) {
  const serverPath = resolve(__dirname, "..", "dist", "index.js");
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: {
      ...process.env,
      VIBESHARING_TOKEN: token,
      VIBESHARING_URL: url,
    },
  });
  const client = new Client(
    { name: "vibesharing-smoke", version: "0.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client;
}

/**
 * Extract text from a tool call response. Throws if the response is empty
 * or the server reported an error.
 *
 * MCP responses can carry multiple text content blocks — the server
 * prepends update notices, welcome messages, and unread-feedback
 * preambles on first tool call of a session as separate blocks ahead of
 * the actual tool response. We concatenate all of them so assertions see
 * the full payload regardless of which block carries the tool output.
 */
export function textOf(result) {
  if (result?.isError) {
    const t = result?.content?.[0]?.text ?? "(no error text)";
    throw new Error(`Tool returned isError: ${t}`);
  }
  const blocks = (result?.content ?? []).filter(
    (b) => b?.type === "text" && typeof b.text === "string"
  );
  if (blocks.length === 0) {
    throw new Error("Tool response missing text content block");
  }
  return blocks.map((b) => b.text).join("\n\n");
}
