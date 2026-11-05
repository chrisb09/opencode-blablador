export class DiscoveryHttpError extends Error {
  constructor(readonly status: number) {
    super("Blablador model discovery HTTP error");
  }
}

const SELECTED_MODELS: Record<string, string> = {
  "01 - GPT-OSS-120b - an open model released by OpenAI in August 2025": "GPT-OSS-120B",
  "02 - Qwen3.8-Flash-Next-NVFP4, general purpose large model": "Qwen3.8-Flash-Next-NVFP4",
  "07 - Qwen3.8-27B-FP8 - Multimodal model from Aug 2026": "Qwen3.8-27B-FP8",
  "15 - DeepSeek-V4.1-Flash on JUWELS Booster": "DeepSeek-V4.1-Flash-1017",
  "80 - MiMo-V2.6-Flash-RL on Juwels Booster": "MiMo-V2.6-Flash-RL",
  "90 - Glm-5.3-Flash on Juwels Booster": "GLM-5.3-Flash",
  "90 - Kimi-K3 1M on Juwels Booster": "Kimi-K3-1M",
  "deepseek-v4.1-flash-at-hzdr": "DeepSeek-V4.1-Flash-HZDR",
  "Muse-Spark-Open-816B-A42B - Built with Muse Spark Open": "Muse-Spark-Open-816B-A42B",
  "Swift-Qwen3.8-27b": "Swift-1.5-Qwen3.8-27B",
};

export async function discoverModels(baseURL: string, apiKey: string, request = fetch) {
  const response = await request(`${baseURL.replace(/\/+$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw new DiscoveryHttpError(response.status);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
    throw new Error("Invalid Blablador model listing");
  }
  const models: Record<string, { id: string; name: string; tool_call: boolean; limit: { context: number; output: number } }> = Object.create(null);
  for (const item of body.data) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
    const id = item.id;
    const alias = Object.hasOwn(SELECTED_MODELS, id) ? SELECTED_MODELS[id] : undefined;
    if (!alias) continue;
    const context = typeof item.max_model_len === "number" && Number.isSafeInteger(item.max_model_len) && item.max_model_len > 1
      ? item.max_model_len : 8192;
    models[alias] = { id, name: `${alias} (Blablador)`, tool_call: true, limit: { context, output: Math.min(1024, context - 1) } };
  }
  return models;
}
