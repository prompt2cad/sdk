import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const collection = JSON.parse(await readFile(new URL("../postman/prompt2cad.postman_collection.json", import.meta.url), "utf8"));
const requests = collection.item.flatMap(folder => folder.item);
function execute(item, listen, variables, status, json) {
  const values = new Map(Object.entries(variables));
  const pm = { execution: { skipRequest() {} }, variables: { get: key => values.get(key) }, collectionVariables: { set: (key, value) => values.set(key, value), unset: key => values.delete(key) }, response: { code: status, json: () => json } };
  for (const event of item.event.filter(event => event.listen === listen)) runInNewContext(event.script.exec.join("\n"), { pm });
  return values;
}
test("public collection has placeholders, stable operation identities and binary uploads", () => {
  assert.equal(collection.auth.bearer[0].value, "{{api_key}}");
  assert.equal(collection.variable.find(item => item.key === "api_key").value, "");
  assert.equal(collection.variable.find(item => item.key === "project_id").value, "");
  for (const item of requests.filter(item => item.request.header.some(header => header.key === "Idempotency-Key"))) {
    assert.match(item.request.header.find(header => header.key === "Idempotency-Key").value, /^\{\{run_id\}\}:/);
  }
  assert.equal(requests.find(item => item.name === "Upload CAD source bytes").request.body.mode, "file");
});
test("failed submissions do not overwrite generation IDs or state", () => {
  const item = requests.find(item => item.name === "Generate a mounting bracket");
  const values = execute(item, "test", { generation_id: "existing", generation_status: "completed" }, 409, { id: "bad" });
  assert.equal(values.get("generation_id"), "existing");
  assert.equal(values.get("generation_status"), "completed");
});
test("creating a project clears stale generation and download state", () => {
  const item = requests.find(item => item.name === "Create a generation project");
  const values = execute(item, "test", { generation_id: "old", generation_status: "completed", download_path: "old-path" }, 201, { id: "new-project" });
  assert.equal(values.get("project_id"), "new-project");
  assert.equal(values.has("generation_id"), false);
  assert.equal(values.has("generation_status"), false);
  assert.equal(values.has("download_path"), false);
});
test("successful generation and poll responses propagate current state", () => {
  const item = requests.find(item => item.name === "Poll initial generation");
  const values = execute(item, "test", {}, 200, { id: "job", status: "paused" });
  assert.equal(values.get("generation_id"), "job");
  assert.equal(values.get("generation_status"), "paused");
});
test("refinement and export block until completion", () => {
  for (const name of ["Refine with DeepSeek V4.1 Flash", "Request STEP, STL and PNG exports"]) {
    const item = requests.find(item => item.name === name);
    assert.throws(() => execute(item, "prerequest", { project_id: "project", generation_id: "job", generation_status: "running" }), /completed/);
    assert.doesNotThrow(() => execute(item, "prerequest", { project_id: "project", generation_id: "job", generation_status: "completed" }));
  }
});
test("export capture selects only successful same-API artifact paths", () => {
  const item = requests.find(item => item.name === "Poll export and select a download");
  const values = execute(item, "test", {}, 200, { artifacts: [
    { status: "failed", downloadUrl: "/api/v1/artifacts/bad/download" },
    { status: "completed", downloadUrl: "https://example.com/download" },
    { status: "completed", downloadUrl: "/api/v1/artifacts/good/download" },
  ] });
  assert.equal(values.get("download_path"), "/api/v1/artifacts/good/download");
});
