import type { Plugin } from "@opencode-ai/plugin";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverModels, DiscoveryHttpError } from "./models.js";

const BASE_URL = "https://api.blablador.fz-juelich.de/v1";
const BOOTSTRAP_ID = "99 - Kimi-K3-1M - our best (and slowest) model as of August 2026";

// The plugin SDK has no auth-read API during config; use OpenCode's own store,
// without writing a second copy. OPENCODE_AUTH_CONTENT takes precedence there.
async function storedKey(): Promise<string | undefined> {
  try {
    const content = process.env.OPENCODE_AUTH_CONTENT || await readFile(
      join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "auth.json"), "utf8",
    );
    const entry = JSON.parse(content)?.blablador;
    return entry?.type === "api" && typeof entry.key === "string" ? entry.key : undefined;
  } catch {
    return undefined;
  }
}

const plugin: Plugin = async () => ({
  auth: {
    provider: "blablador",
    methods: [{ type: "api", label: "Blablador API key" }],
  },
  config: async (cfg) => {
    cfg.provider ??= {};
    const existing = cfg.provider.blablador ?? {};
    const options = existing.options ?? {};
    const baseURL = typeof options.baseURL === "string" ? options.baseURL : BASE_URL;
    const apiKey = typeof options.apiKey === "string" ? options.apiKey : (await storedKey()) || process.env.BLABLADOR_API_KEY;
    let discovered: Awaited<ReturnType<typeof discoverModels>> = {};
    if (apiKey) {
      try {
        discovered = await discoverModels(baseURL, apiKey);
      } catch (error) {
        console.warn(error instanceof DiscoveryHttpError
          ? `Blablador model discovery failed (HTTP ${error.status}).`
          : "Blablador model discovery failed.");
      }
    }
    const models = { ...discovered, ...existing.models };
    for (const [id, model] of Object.entries(existing.models ?? {})) {
      if (discovered[id]) models[id] = { ...discovered[id], ...model };
    }
    if (Object.keys(models).length === 0) {
      models["Kimi-K3-1M"] = { id: BOOTSTRAP_ID, name: "Kimi-K3-1M (Blablador)", tool_call: true, limit: { context: 8192, output: 1024 } };
    }
    cfg.provider.blablador = {
      name: "Blablador",
      npm: "@ai-sdk/openai-compatible",
      env: ["BLABLADOR_API_KEY"],
      ...existing,
      options: { baseURL, ...options },
      models,
    };
  },
});

export default plugin;
