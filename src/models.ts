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

const VISION_MODELS = new Set([
  "Qwen3.8-Flash-Next-NVFP4",
  "Qwen3.8-27B-FP8",
  "DeepSeek-V4.1-Flash-1017",
  "MiMo-V2.6-Flash-RL",
  "GLM-5.3-Flash",
  "DeepSeek-V4.1-Flash-HZDR",
  "Muse-Spark-Open-816B-A42B",
  "Swift-1.5-Qwen3.8-27B",
]);

type DiscoveredModel = {
  id: string;
  name: string;
  tool_call: boolean;
  attachment?: boolean;
  modalities?: { input: ("text" | "image")[]; output: "text"[] };
  limit: { context: number; input?: number; output: number };
};

function tokenLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 1 ? value : undefined;
}

export function modelLimit(alias: string, context: number, advertised?: unknown) {
  const defaults: Record<string, number> = {
    "Kimi-K3-1M": 1048576,
    "DeepSeek-V4.1-Flash-1017": 384000,
    "GPT-OSS-120B": 131072,
  };
  const output = Math.min(
    typeof advertised === "number" && Number.isSafeInteger(advertised) && advertised > 0
      ? advertised : defaults[alias] ?? 32768,
    65536,
    Math.max(1, Math.floor(context * 0.2)),
    context - 1,
  );
  // v1 subtracts at most 20k from input for its default compaction reserve.
  const reserve = Math.min(20000, 32000, output);
  const input = Math.min(Math.floor(context * 0.8), context - output + reserve);
  return context >= 16384 || output > reserve
    ? { context, input: Math.max(1, input), output }
    : { context, output };
}

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
  const models: Record<string, DiscoveredModel> = Object.create(null);
  for (const item of body.data) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
    const id = item.id;
    const alias = Object.hasOwn(SELECTED_MODELS, id) ? SELECTED_MODELS[id] : undefined;
    if (!alias) continue;
    const context = tokenLimit(item.max_model_len) ?? tokenLimit(item.max_input_tokens) ?? 8192;
    const model: DiscoveredModel = { id, name: `${alias} (Blablador)`, tool_call: true, limit: modelLimit(alias, context, item.max_output_tokens) };
    if (VISION_MODELS.has(alias)) {
      model.attachment = true;
      model.modalities = { input: ["text", "image"], output: ["text"] };
    }
    models[alias] = model;
  }
  return models;
}
