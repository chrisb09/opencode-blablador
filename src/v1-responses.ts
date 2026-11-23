import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { isResponsesPath, normalizeResponsesBody } from "./responses.js";

// V1's generic model resolution calls sdk.languageModel(modelID), which routes
// @ai-sdk/openai to Chat Completions. This shim — referenced from
// provider.blablador.npm via a file:// URL when the responses transport is
// configured — routes it to the OpenAI Responses API instead, the only Blablador
// endpoint that reports cached prompt tokens for most models. It also normalizes
// replayed messages to the string-content dialect the DeepSeek deployment
// accepts. Loaded by the host only in that mode; the default transport stays
// dependency-free.
type ResponsesModel = ReturnType<OpenAIProvider["responses"]>;
type ResponsesOptions = Parameters<ResponsesModel["doStream"]>[0];

function rewrite(url: string, init: RequestInit | undefined): RequestInit | undefined {
  if (!init || typeof init.body !== "string" || !isResponsesPath(url)) return init;
  try {
    const parsed = JSON.parse(init.body);
    const body = normalizeResponsesBody(parsed);
    return body === parsed ? init : { ...init, body: JSON.stringify(body) };
  } catch {
    return init;
  }
}

// The Responses model reads providerOptions under "openai" and defaults store to
// true, which makes it send server-side item_reference items that Blablador
// rejects. OpenCode disables store and remaps the option keys only for the
// literal @ai-sdk/openai npm, which this file:// shim masks. Blablador is
// stateless, so force store:false and carry the provider's own options over to
// the "openai" key.
function stateless(options: ResponsesOptions, name: string): ResponsesOptions {
  const providerOptions = { ...((options.providerOptions ?? {}) as Record<string, Record<string, unknown>>) };
  const merged: Record<string, unknown> = { ...(providerOptions.openai ?? {}) };
  if (name !== "openai" && providerOptions[name]) Object.assign(merged, providerOptions[name]);
  merged.store = false;
  providerOptions.openai = merged;
  if (name !== "openai") delete providerOptions[name];
  return { ...options, providerOptions: providerOptions as ResponsesOptions["providerOptions"] };
}

export function createBlabladorResponses(options: Record<string, unknown>): { languageModel: (modelID: string) => ResponsesModel } {
  const name = typeof options.name === "string" && options.name ? options.name : "blablador";
  const base = typeof options.fetch === "function" ? (options.fetch as typeof globalThis.fetch) : globalThis.fetch;
  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    return base(input, rewrite(url, init));
  };
  const provider = createOpenAI({
    apiKey: typeof options.apiKey === "string" && options.apiKey ? options.apiKey : undefined,
    baseURL: typeof options.baseURL === "string" && options.baseURL ? options.baseURL : undefined,
    fetch: fetchImpl,
    headers: typeof options.headers === "object" && options.headers !== null && !Array.isArray(options.headers)
      ? (options.headers as Record<string, string>)
      : undefined,
    name: typeof options.name === "string" && options.name ? options.name : undefined,
  });
  return {
    languageModel: (modelID: string) => {
      const model = provider.responses(modelID);
      const wrapped = Object.create(model) as ResponsesModel;
      wrapped.doStream = (call) => model.doStream(stateless(call, name));
      wrapped.doGenerate = (call) => model.doGenerate(stateless(call, name));
      return wrapped;
    },
  };
}
