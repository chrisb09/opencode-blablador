import { describe, expect, test, mock } from "bun:test";
import plugin from "../src/index.js";
import { discoverModels } from "../src/models.js";

describe("discovery", () => {
  test("keeps selected models with friendly IDs and original API IDs", async () => {
    const request = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://example.test/v1/models");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fake-key");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeDefined();
      return Response.json({ data: [
        { id: "01 - GPT-OSS-120b - an open model released by OpenAI in August 2025" }, { id: "alias-code" }, { id: "alias_embeddings" },
        { id: "org/model-embedding" }, { id: "reranker" }, { id: "whisper-large" },
        { id: "gpt-3.5-turbo" }, { id: "text-davinci-003" },
        { id: "service-anonymizer" }, { id: "org/video-generator" },
        { id: "innocent", root: "org/embedding-model" },
        { id: "private", root: "org/anonymiser" }, { id: "render", root: "org/video-model" },
        { id: "other", type: "embedding" }, { id: " org/invalid " }, { id: 42 },
        { id: "07 - Qwen3.8-27B-FP8 - Multimodal model from Aug 2026", max_model_len: 32768 },
      ] });
    });
    const models = await discoverModels("https://example.test/v1/", "fake-key", request as typeof fetch);
    expect(Object.keys(models)).toEqual(["GPT-OSS-120B", "Qwen3.8-27B-FP8"]);
    expect(models["GPT-OSS-120B"]).toEqual({ id: "01 - GPT-OSS-120b - an open model released by OpenAI in August 2025", name: "GPT-OSS-120B (Blablador)", tool_call: true, limit: { context: 8192, output: 1024 } });
    expect(models["Qwen3.8-27B-FP8"].limit).toEqual({ context: 32768, output: 1024 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test("rejects HTTP and malformed responses", async () => {
    await expect(discoverModels("https://example.test", "x", async () => new Response("", { status: 401 }))).rejects.toMatchObject({ status: 401 });
    await expect(discoverModels("https://example.test", "x", async () => Response.json({ data: {} }))).rejects.toThrow("Invalid");
  });

  test("validates context and keeps output below it", async () => {
    const items = [2, 100, 1024, 1025, 0, 1, -1, 3.5, "4096", null, Number.MAX_SAFE_INTEGER + 1];
    for (const [index, max_model_len] of items.entries()) {
      const models = await discoverModels("https://example.test", "x", async () => Response.json({
        data: [{ id: "Swift-Qwen3.8-27b", max_model_len }],
      }));
      const expected = [{ context: 2, output: 1 }, { context: 100, output: 99 }, { context: 1024, output: 1023 }, { context: 1025, output: 1024 }][index] ?? { context: 8192, output: 1024 };
      expect(models["Swift-1.5-Qwen3.8-27B"].limit).toEqual(expected);
    }
  });
});

describe("plugin", () => {
  test("bootstraps without a key and replaces it with successful discovery", async () => {
    const oldContent = process.env.OPENCODE_AUTH_CONTENT;
    const oldEnv = process.env.BLABLADOR_API_KEY;
    const oldFetch = globalThis.fetch;
    const bootstrap = "99 - Kimi-K3-1M - our best (and slowest) model as of August 2026";
    const request = mock(async () => Response.json({ data: [{ id: "Swift-Qwen3.8-27b" }] }));
    process.env.OPENCODE_AUTH_CONTENT = "{}";
    delete process.env.BLABLADOR_API_KEY;
    globalThis.fetch = request as typeof fetch;
    try {
      const hooks = await plugin({} as never);
      const before: import("@opencode-ai/sdk").Config = {};
      await hooks.config!(before);
      expect(before.provider!.blablador.models).toEqual({
        "Kimi-K3-1M": { id: bootstrap, name: "Kimi-K3-1M (Blablador)", tool_call: true, limit: { context: 8192, output: 1024 } },
      });
      expect(request).not.toHaveBeenCalled();

      const after: import("@opencode-ai/sdk").Config = { provider: { blablador: { options: { apiKey: "fake-key" } } } };
      await hooks.config!(after);
      expect(Object.keys(after.provider!.blablador.models!)).toEqual(["Swift-1.5-Qwen3.8-27B"]);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldContent === undefined) delete process.env.OPENCODE_AUTH_CONTENT; else process.env.OPENCODE_AUTH_CONTENT = oldContent;
      if (oldEnv === undefined) delete process.env.BLABLADOR_API_KEY; else process.env.BLABLADOR_API_KEY = oldEnv;
    }
  });

  test("bootstraps when discovery is empty or unavailable, but not with configured models", async () => {
    const oldFetch = globalThis.fetch;
    const oldWarn = console.warn;
    const request = mock(async () => Response.json({ data: [] }));
    globalThis.fetch = request as typeof fetch;
    console.warn = mock(() => {});
    try {
      const hooks = await plugin({} as never);
      const empty: import("@opencode-ai/sdk").Config = { provider: { blablador: { options: { apiKey: "fake-key" } } } };
      await hooks.config!(empty);
      expect(Object.keys(empty.provider!.blablador.models!)).toEqual(["Kimi-K3-1M"]);

      globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
      const unavailable: import("@opencode-ai/sdk").Config = { provider: { blablador: { options: { apiKey: "fake-key" } } } };
      await hooks.config!(unavailable);
      expect(unavailable.provider!.blablador.models).toEqual(empty.provider!.blablador.models);

      const manual: import("@opencode-ai/sdk").Config = { provider: { blablador: { options: { apiKey: "fake-key" }, models: { manual: { name: "Manual" } } } } };
      await hooks.config!(manual);
      expect(manual.provider!.blablador.models).toEqual({ manual: { name: "Manual" } });
    } finally {
      globalThis.fetch = oldFetch;
      console.warn = oldWarn;
    }
  });

  test("discovers with stored auth and lets user models override discoveries", async () => {
    const oldContent = process.env.OPENCODE_AUTH_CONTENT;
    const oldEnv = process.env.BLABLADOR_API_KEY;
    const oldFetch = globalThis.fetch;
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({ blablador: { type: "api", key: "stored-test" } });
    process.env.BLABLADOR_API_KEY = "env-test";
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer stored-test");
      return Response.json({ data: [{ id: "Swift-Qwen3.8-27b" }, { id: "deepseek-v4.1-flash-at-hzdr" }] });
    }) as typeof fetch;
    try {
      const hooks = await plugin({} as never);
      const cfg = { provider: { blablador: { models: { "Swift-1.5-Qwen3.8-27B": { name: "Configured", tool_call: false } } } } };
      await hooks.config!(cfg);
      expect(cfg.provider.blablador.models["Swift-1.5-Qwen3.8-27B"].name).toBe("Configured");
      expect(cfg.provider.blablador.models["Swift-1.5-Qwen3.8-27B"].tool_call).toBe(false);
      expect((cfg.provider.blablador.models["Swift-1.5-Qwen3.8-27B"] as { id?: string }).id).toBe("Swift-Qwen3.8-27b");
      expect(Object.keys(cfg.provider.blablador.models)).toContain("DeepSeek-V4.1-Flash-HZDR");
    } finally {
      globalThis.fetch = oldFetch;
      if (oldContent === undefined) delete process.env.OPENCODE_AUTH_CONTENT; else process.env.OPENCODE_AUTH_CONTENT = oldContent;
      if (oldEnv === undefined) delete process.env.BLABLADOR_API_KEY; else process.env.BLABLADOR_API_KEY = oldEnv;
    }
  });

  test("preserves explicit configuration and tolerates discovery errors", async () => {
    const oldContent = process.env.OPENCODE_AUTH_CONTENT;
    const oldEnv = process.env.BLABLADOR_API_KEY;
    const oldFetch = globalThis.fetch;
    const oldWarn = console.warn;
    const warn = mock(() => {});
    console.warn = warn;
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({ blablador: { type: "api", key: "stored-test" } });
    process.env.BLABLADOR_API_KEY = "env-test";
    const request = mock(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer configured-test");
      throw new Error("secret-key https://secret.example offline");
    });
    globalThis.fetch = request as typeof fetch;
    try {
      const hooks = await plugin({} as never);
      const cfg = { provider: { blablador: { name: "Custom", options: { baseURL: "https://example.test/v1", apiKey: "configured-test", extra: true }, models: { manual: { name: "Manual" } } } } };
      await hooks.config!(cfg);
      expect(cfg.provider.blablador.name).toBe("Custom");
      expect(cfg.provider.blablador.options.extra).toBe(true);
      expect(cfg.provider.blablador.models).toEqual({ manual: { name: "Manual" } });
      expect(request).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Blablador model discovery failed.");
      expect(hooks.auth?.methods[0].type).toBe("api");
    } finally {
      globalThis.fetch = oldFetch;
      console.warn = oldWarn;
      if (oldContent === undefined) delete process.env.OPENCODE_AUTH_CONTENT; else process.env.OPENCODE_AUTH_CONTENT = oldContent;
      if (oldEnv === undefined) delete process.env.BLABLADOR_API_KEY; else process.env.BLABLADOR_API_KEY = oldEnv;
    }
  });

  test("warns with status only, and is quiet without credentials", async () => {
    const oldContent = process.env.OPENCODE_AUTH_CONTENT;
    const oldEnv = process.env.BLABLADOR_API_KEY;
    const oldFetch = globalThis.fetch;
    const oldWarn = console.warn;
    const warn = mock(() => {});
    const request = mock(async () => new Response("secret response body", { status: 403 }));
    console.warn = warn;
    globalThis.fetch = request as typeof fetch;
    process.env.OPENCODE_AUTH_CONTENT = "{}";
    delete process.env.BLABLADOR_API_KEY;
    try {
      const hooks = await plugin({} as never);
      await hooks.config!({});
      expect(warn).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      await hooks.config!({ provider: { blablador: { options: { apiKey: "secret-key", baseURL: "https://secret.example/v1" } } } });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Blablador model discovery failed (HTTP 403).");
    } finally {
      globalThis.fetch = oldFetch;
      console.warn = oldWarn;
      if (oldContent === undefined) delete process.env.OPENCODE_AUTH_CONTENT; else process.env.OPENCODE_AUTH_CONTENT = oldContent;
      if (oldEnv === undefined) delete process.env.BLABLADOR_API_KEY; else process.env.BLABLADOR_API_KEY = oldEnv;
    }
  });
});
