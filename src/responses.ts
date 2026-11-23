// Blablador's /v1/responses is a translation layer over its chat backends. Most
// deployments (all except the DeepSeek-V4.1-Flash vLLM one) accept OpenAI-style
// input_text/output_text content parts, but the DeepSeek deployment rejects
// input_text outright ("DeepSeek V4.1 supports text and image content only"). It
// does accept the same text as plain string content, for any role. Flatten
// text-only content arrays to a string. Leave arrays that contain non-text parts
// (images, files) untouched: the schema requires input_text there, so rewriting
// the type would fail validation, and the DeepSeek backend cannot take images on
// this endpoint anyway.
export function normalizeResponsesBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.input)) return body;
  let changed = false;
  const input = record.input.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const entry = item as Record<string, unknown>;
    // Only message items carry role+content arrays; tool items are left alone.
    if (typeof entry.role !== "string" || !Array.isArray(entry.content)) return item;
    const content = entry.content as unknown[];
    if (content.length === 0 ||
        !content.every((part) => part && typeof part === "object" && !Array.isArray(part) &&
          typeof (part as Record<string, unknown>).text === "string")) return item;
    changed = true;
    const { type: _type, ...rest } = entry;
    return { ...rest, content: content.map((part) => (part as { text: string }).text).join("") };
  });
  return changed ? { ...record, input } : body;
}

export function isResponsesPath(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith("/responses");
  } catch {
    return false;
  }
}
