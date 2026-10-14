import { setTimeout as sleep } from "node:timers/promises";

export class Prompt2CADError extends Error {
  constructor(response, payload) {
    super(payload?.error?.message ?? `Prompt2CAD request failed (${response.status})`);
    this.name = "Prompt2CADError";
    this.status = response.status;
    this.code = payload?.error?.code;
    this.requestId = payload?.requestId ?? response.headers.get("x-request-id");
    this.retryAfter = response.headers.get("retry-after");
  }
}

/** Server-side client. Operations that spend credits are always explicit. */
export class Prompt2CAD {
  constructor({ apiKey, baseUrl = "https://prompt2cad.com/api/v1", fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new TypeError("A Prompt2CAD apiKey is required");
    this.apiKey = apiKey;
    this.baseUrl = new URL(baseUrl.replace(/\/$/, ""));
    if (this.baseUrl.username || this.baseUrl.password) throw new TypeError("baseUrl cannot contain credentials");
    this.fetch = fetchImpl;
  }

  async request(path, { method = "GET", json, bytes, contentType, idempotencyKey, signal } = {}) {
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    if (contentType) headers["Content-Type"] = contentType;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await this.fetch(`${this.baseUrl.href}/${path}`, {
      method, headers, signal, redirect: "error", body: json !== undefined ? JSON.stringify(json) : bytes,
    });
    if (!response.ok) {
      let payload;
      try { payload = await response.json(); } catch { /* non-JSON platform failure */ }
      throw new Prompt2CADError(response, payload);
    }
    return response.status === 204 ? undefined : response.json();
  }

  operation(path, json, idempotencyKey, signal) {
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
      throw new TypeError("idempotencyKey must contain 1–128 letters, digits, dots, underscores, colons or hyphens");
    }
    return this.request(path, { method: "POST", json, idempotencyKey, signal });
  }

  getUsage({ signal } = {}) { return this.request("usage", { signal }); }
  createProject(input, { idempotencyKey, signal } = {}) { return this.operation("projects", input, idempotencyKey, signal); }
  getProject(projectId, { signal } = {}) { return this.request(`projects/${encodeURIComponent(projectId)}`, { signal }); }
  deleteProject(projectId, { signal } = {}) { return this.request(`projects/${encodeURIComponent(projectId)}`, { method: "DELETE", signal }); }
  generate(projectId, input, { idempotencyKey, signal } = {}) {
    return this.operation(`projects/${encodeURIComponent(projectId)}/generations`, input, idempotencyKey, signal);
  }
  getGeneration(projectId, generationId, { signal } = {}) { return this.request(this.generationPath(projectId, generationId), { signal }); }
  generationPath(projectId, generationId) { return `projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(generationId)}`; }
  cancelGeneration(projectId, generationId, { signal } = {}) {
    return this.request(`${this.generationPath(projectId, generationId)}/cancel`, { method: "POST", signal });
  }
  resumeGeneration(projectId, generationId, { idempotencyKey, signal } = {}) {
    return this.operation(`${this.generationPath(projectId, generationId)}/resume`, {}, idempotencyKey, signal);
  }
  answerQuestions(projectId, generationId, input, { signal } = {}) {
    return this.request(`${this.generationPath(projectId, generationId)}/answers`, { method: "POST", json: input, signal });
  }
  approvePlan(projectId, generationId, input, { signal } = {}) {
    return this.request(`${this.generationPath(projectId, generationId)}/approval`, { method: "POST", json: input, signal });
  }
  uploadCadFile(bytes, { fileName, units, signal } = {}) {
    if (!fileName) throw new TypeError("fileName is required for a CAD upload");
    const query = new URLSearchParams({ fileName });
    if (units) query.set("units", units);
    return this.request(`cad-files?${query}`, { method: "POST", bytes, contentType: "application/octet-stream", signal });
  }
  uploadImage(bytes, { mimeType, signal } = {}) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new TypeError("mimeType must be image/jpeg, image/png or image/webp");
    return this.request("files", { method: "POST", bytes, contentType: mimeType, signal });
  }
  exportModel(projectId, input, { idempotencyKey, signal } = {}) {
    return this.operation(`projects/${encodeURIComponent(projectId)}/exports`, input, idempotencyKey, signal);
  }
  getExport(projectId, exportId, { signal } = {}) { return this.request(`projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(exportId)}`, { signal }); }

  /** Returns on any state other than accepted/running. Never resumes or retries a paid operation. */
  async poll(read, { intervalMs = 5000, timeoutMs = 35 * 60 * 1000, signal } = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("Polling intervalMs and timeoutMs must be positive finite numbers");
    }
    const pollingSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    while (true) {
      pollingSignal.throwIfAborted();
      const result = await read(pollingSignal);
      if (!["accepted", "running"].includes(result.status)) return result;
      await sleep(intervalMs, undefined, { signal: pollingSignal });
    }
  }
  waitForGeneration(projectId, generationId, options) {
    return this.poll(signal => this.getGeneration(projectId, generationId, { signal }), options);
  }
  waitForExport(projectId, exportId, options) {
    return this.poll(signal => this.getExport(projectId, exportId, { signal }), options);
  }

  async downloadArtifact(downloadUrl, { signal } = {}) {
    const url = new URL(downloadUrl, this.baseUrl);
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(`${this.baseUrl.pathname}/artifacts/`) || url.username || url.password) {
      throw new TypeError("downloadUrl must be an artifact URL on the configured API origin");
    }
    const response = await this.fetch(url.href, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal, redirect: "error" });
    if (!response.ok) {
      let payload;
      try { payload = await response.json(); } catch { /* non-JSON platform failure */ }
      throw new Prompt2CADError(response, payload);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
