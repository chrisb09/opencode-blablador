// Blablador's /v1/responses is a translation layer over its chat backends and is
// stricter than the OpenAI schema in two ways that break default SDK requests:
//
// 1. Every input_image must carry a `detail` field. @ai-sdk/openai omits it when
//    no imageDetail option is set, which fails validation for every model.
// 2. The DeepSeek-V4.1-Flash deployment rejects input_text parts outright
//    ("DeepSeek V4.1 supports text and image content only"), so a message that
//    mixes text and an image cannot be sent as one content array. It accepts the
//    text as plain string content and the image in a separate item.
//
// This normalizer therefore:
//   - flattens text-only content arrays to a string (works for any role),
//   - adds detail:"auto" to every input_image part,
//   - splits mixed text/image content into order-preserving items: text runs
//     become string-content messages and image/file runs stay content arrays.
// Non-message items (function_call_output, reasoning, etc.) are left untouched.
const DEFAULT_IMAGE_DETAIL = "auto";

type JsonRecord = Record<string, unknown>;

function isTextPart(part: unknown): part is JsonRecord & { text: string } {
  return !!part && typeof part === "object" && !Array.isArray(part) &&
    typeof (part as JsonRecord).text === "string";
}

function withImageDetail(part: unknown): unknown {
  if (!part || typeof part !== "object" || Array.isArray(part)) return part;
  const value = part as JsonRecord;
  if (value.type !== "input_image" || value.detail !== undefined) return part;
  return { ...value, detail: DEFAULT_IMAGE_DETAIL };
}

function isMessage(item: unknown): item is JsonRecord & { content: unknown[] } {
  return !!item && typeof item === "object" && !Array.isArray(item) &&
    typeof (item as JsonRecord).role === "string" && Array.isArray((item as JsonRecord).content);
}

function normalizeMessage(entry: JsonRecord & { content: unknown[] }): JsonRecord[] {
  const { type: _type, ...rest } = entry;
  const content = entry.content;
  if (content.length === 0) return [entry];

  const textOnly = content.every(isTextPart);
  const hasMedia = content.some((part) => !isTextPart(part));
  const hasText = content.some(isTextPart);

  // All text: join into a plain string, which every backend accepts for any role.
  if (textOnly) {
    return [{ ...rest, content: content.map((part) => (part as { text: string }).text).join("") }];
  }

  // Media only (no text): keep one content array, ensuring image detail is set.
  if (!hasText && hasMedia) {
    const normalized = content.map(withImageDetail);
    const unchanged = normalized.every((part, index) => part === content[index]);
    return [unchanged ? entry : { ...rest, content: normalized }];
  }

  // Mixed text and media: split into order-preserving items so backends that
  // reject input_text next to an image still receive the text as a string.
  const out: JsonRecord[] = [];
  let text = "";
  let media: unknown[] = [];
  const flushText = () => { if (text) { out.push({ ...rest, content: text }); text = ""; } };
  const flushMedia = () => { if (media.length) { out.push({ ...rest, content: media }); media = []; } };
  for (const part of content) {
    if (isTextPart(part)) {
      flushMedia();
      text += part.text;
    } else {
      flushText();
      media.push(withImageDetail(part));
    }
  }
  flushText();
  flushMedia();
  return out.length ? out : [entry];
}

export function normalizeResponsesBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as JsonRecord;
  if (!Array.isArray(record.input)) return body;
  let changed = false;
  const input = record.input.flatMap((item) => {
    if (!isMessage(item)) return [item];
    const normalized = normalizeMessage(item);
    if (normalized.length !== 1 || normalized[0] !== item) changed = true;
    return normalized;
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
