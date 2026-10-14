import { test } from "node:test";
import assert from "node:assert/strict";
import { Prompt2CAD, Prompt2CADError } from "../src/index.js";

const ok = value => Response.json(value);
test("sends model, imports and the caller's stable operation key without mixing AI model with geometry", async () => {
  const calls = [];
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: async (...args) => { calls.push(args); return ok({ id: "job", status: "accepted" }); } });
  await client.generate("project", { prompt: "Modify", model: "deepseek/deepseek-v4.1-flash", cadFileIds: ["source"] }, { idempotencyKey: "run:modify" });
  await client.generate("project", { prompt: "Modify", model: "deepseek/deepseek-v4.1-flash", cadFileIds: ["source"] }, { idempotencyKey: "run:modify" });
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][0], "https://prompt2cad.com/api/v1/projects/project/generations");
  assert.equal(calls[0][1].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0][1].headers["Idempotency-Key"], "run:modify");
  assert.equal(JSON.parse(calls[0][1].body).model, "deepseek/deepseek-v4.1-flash");
});
test("requires an idempotency key before any paid-operation network request", () => {
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: () => { throw new Error("Unexpected request"); } });
  assert.throws(() => client.generate("project", { prompt: "Build" }), /idempotencyKey/);
  assert.throws(() => client.resumeGeneration("project", "job", { idempotencyKey: "bad key" }), /idempotencyKey/);
});
test("uploads original binary bytes and safely encodes CAD filename and units", async () => {
  const bytes = new Uint8Array([0, 1, 255]);
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("fileName"), "plate & part.stl");
    assert.equal(parsed.searchParams.get("units"), "mm");
    assert.equal(options.body, bytes);
    assert.equal(options.headers["Content-Type"], "application/octet-stream");
    return ok({ id: "source" });
  } });
  assert.equal((await client.uploadCadFile(bytes, { fileName: "plate & part.stl", units: "mm" })).id, "source");
});
test("preserves structured API errors and retry metadata without retrying requests", async () => {
  let calls = 0;
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: async () => {
    calls++;
    return Response.json({ error: { code: "rate_limit", message: "Too many requests" }, requestId: "trace" }, { status: 429, headers: { "retry-after": "30" } });
  } });
  await assert.rejects(client.getUsage(), error => error instanceof Prompt2CADError && error.status === 429 && error.code === "rate_limit" && error.requestId === "trace" && error.retryAfter === "30");
  assert.equal(calls, 1);
});
test("polls only GET and stops on paused without authorizing another segment", async () => {
  let calls = 0;
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: async (_url, options) => {
    assert.equal(options.method, "GET");
    return ok({ status: ++calls === 1 ? "running" : "paused" });
  } });
  assert.equal((await client.waitForGeneration("project", "job", { intervalMs: 1 })).status, "paused");
  assert.equal(calls, 2);
});
test("polling honors cancellation without cancelling the server generation", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: () => { throw new Error("Unexpected request"); } });
  await assert.rejects(client.waitForGeneration("project", "job", { signal: controller.signal }), { name: "AbortError" });
});
test("artifact download authenticates only the configured API origin", async () => {
  let calls = 0;
  const client = new Prompt2CAD({ apiKey: "test-key", fetch: async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, "Bearer test-key");
    assert.equal(options.redirect, "error");
    return new Response(new Uint8Array([1, 2, 3]));
  } });
  await assert.rejects(client.downloadArtifact("https://example.com/api/v1/artifacts/id/download"), /configured API origin/);
  assert.equal(calls, 0);
  assert.deepEqual(await client.downloadArtifact("/api/v1/artifacts/id/download"), new Uint8Array([1, 2, 3]));
});
