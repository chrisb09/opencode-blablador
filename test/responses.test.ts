import { describe, expect, test } from "bun:test";
import { isResponsesPath, normalizeResponsesBody } from "../src/responses.js";
import { transportFrom } from "../src/models.js";

describe("transport setting", () => {
  test("defaults to responses and accepts the chat-completions opt-out", () => {
    expect(transportFrom({}, {})).toBe("responses");
    expect(transportFrom(undefined, {})).toBe("responses");
    expect(transportFrom({ transport: "responses" }, {})).toBe("responses");
    expect(transportFrom({ transport: "chat-completions" }, {})).toBe("chat-completions");
    expect(transportFrom({}, { BLABLADOR_TRANSPORT: "chat-completions" })).toBe("chat-completions");
    expect(transportFrom({}, { BLABLADOR_TRANSPORT: "  responses  " })).toBe("responses");
  });

  test("rejects unknown transports but treats null/undefined as unset", () => {
    for (const transport of ["grpc", "Responses", "", 1]) {
      expect(() => transportFrom({ transport }, {})).toThrow("Invalid Blablador transport");
    }
    expect(transportFrom({ transport: null }, {})).toBe("responses");
    expect(transportFrom({ transport: undefined }, {})).toBe("responses");
    expect(() => transportFrom({}, { BLABLADOR_TRANSPORT: "anthropic" })).toThrow("Invalid Blablador transport");
  });
});

describe("responses body normalizer", () => {
  test("flattens text-only content arrays for every role", () => {
    const body = { model: "m", input: [
      { role: "user", content: [{ type: "input_text", text: "hello " }] },
      { role: "assistant", content: [{ type: "output_text", text: "hi" }] },
      { type: "function_call_output", call_id: "c1", output: "keep" },
    ] };
    expect(normalizeResponsesBody(body)).toEqual({ model: "m", input: [
      { role: "user", content: "hello " },
      { role: "assistant", content: "hi" },
      { type: "function_call_output", call_id: "c1", output: "keep" },
    ] });
  });

  test("joins multiple text parts and drops the item type", () => {
    const body = { input: [{ role: "user", type: "message", content: [{ type: "input_text", text: "a" }, { type: "input_text", text: "b" }] }] };
    expect(normalizeResponsesBody(body).input[0]).toEqual({ role: "user", content: "ab" });
  });

  test("leaves string, empty, and non-message content untouched", () => {
    const cases = [
      { input: [{ role: "user", content: "already a string" }] },
      { input: [{ role: "user", content: [] }] },
      { input: "plain prompt" },
      { model: "m" },
    ];
    for (const body of cases) expect(normalizeResponsesBody(body)).toBe(body);
  });

  test("adds detail:auto to image-only content without text", () => {
    const image = { type: "input_image", image_url: "data:x" };
    const body = { input: [{ role: "user", content: [image, { type: "input_image", image_url: "data:y", detail: "high" }] }] };
    expect(normalizeResponsesBody(body).input).toEqual([{ role: "user", content: [
      { type: "input_image", image_url: "data:x", detail: "auto" },
      { type: "input_image", image_url: "data:y", detail: "high" },
    ] }]);
  });

  test("splits mixed text and image content into order-preserving items", () => {
    const body = { input: [{ role: "user", content: [
      { type: "input_text", text: "describe " },
      { type: "input_image", image_url: "data:x" },
      { type: "input_text", text: "now" },
    ] }] };
    expect(normalizeResponsesBody(body).input).toEqual([
      { role: "user", content: "describe " },
      { role: "user", content: [{ type: "input_image", image_url: "data:x", detail: "auto" }] },
      { role: "user", content: "now" },
    ]);
  });

  test("coalesces adjacent text runs and image runs when splitting", () => {
    const body = { input: [{ role: "user", content: [
      { type: "input_image", image_url: "data:a" },
      { type: "input_image", image_url: "data:b" },
      { type: "input_text", text: "one" },
      { type: "input_text", text: " two" },
    ] }] };
    expect(normalizeResponsesBody(body).input).toEqual([
      { role: "user", content: [
        { type: "input_image", image_url: "data:a", detail: "auto" },
        { type: "input_image", image_url: "data:b", detail: "auto" },
      ] },
      { role: "user", content: "one two" },
    ]);
  });

  test("only normalizes message items, preserving tool and reasoning items", () => {
    const reasoning = { type: "reasoning", id: "r1", summary: [] };
    const toolOut = { type: "function_call_output", call_id: "c1", output: "keep" };
    const msg = { role: "assistant", content: [{ type: "output_text", text: "hi" }] };
    expect(normalizeResponsesBody({ input: [reasoning, msg, toolOut] }).input).toEqual([
      reasoning, { role: "assistant", content: "hi" }, toolOut,
    ]);
  });

  test("returns non-objects untouched", () => {
    for (const value of [null, undefined, "x", 1, [], true]) expect(normalizeResponsesBody(value)).toBe(value);
  });

  test("recognizes only the responses path", () => {
    expect(isResponsesPath("https://host/v1/responses")).toBe(true);
    expect(isResponsesPath("https://host/v1/responses?x=1")).toBe(true);
    expect(isResponsesPath("https://host/v1/chat/completions")).toBe(false);
    expect(isResponsesPath("not a url")).toBe(false);
  });
});
