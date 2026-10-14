import { mkdir, writeFile } from "node:fs/promises";

const variables = [
  ["base_url", "https://prompt2cad.com/api/v1"], ["origin", "https://prompt2cad.com"],
  ["api_key", ""], ["run_id", ""], ["project_id", ""], ["generation_id", ""],
  ["generation_status", ""], ["export_id", ""], ["download_path", ""],
  ["cad_file_id", ""], ["image_file_id", ""], ["cad_file_name", "plate.stl"], ["cad_units", "mm"],
  ["model", "default"],
];
const script = (listen, code) => ({ listen, script: { type: "text/javascript", exec: code.trim().split("\n") } });
const capture = (key, source = "id") => script("test", `
if (pm.response.code >= 200 && pm.response.code < 300) {
  const data = pm.response.json();
  if (data.${source}) pm.collectionVariables.set("${key}", data.${source});
  ${key === "generation_id" ? 'if (data.status) pm.collectionVariables.set("generation_status", data.status);' : ""}
  ${key === "project_id" ? '["generation_id", "generation_status", "export_id", "download_path"].forEach(key => pm.collectionVariables.unset(key));' : ""}
  ${key === "export_id" ? 'pm.collectionVariables.unset("download_path");' : ""}
}`);
const requireVariables = keys => script("prerequest", keys.map(key => `if (!pm.variables.get("${key}")) { pm.execution.skipRequest(); throw new Error("Set ${key} by completing the preceding workflow step first."); }`).join("\n"));
const completed = script("prerequest", 'if (pm.variables.get("generation_status") !== "completed") { pm.execution.skipRequest(); throw new Error("Poll the generation until completed before refining or exporting."); }');
function request(name, method, path, description, { body, key, events = [], binary = false, headers = [] } = {}) {
  const [pathname, queryString] = path.split("?");
  const url = path.startsWith("{{origin}}") ? path : {
    raw: `{{base_url}}${path}`,
    host: ["{{base_url}}"],
    path: pathname.replace(/^\//, "").split("/"),
    ...(queryString ? { query: queryString.split("&").map(pair => { const [key, value] = pair.split("="); return { key, value }; }) } : {}),
  };
  return { name, request: {
    method, header: [
      ...(key ? [{ key: "Idempotency-Key", value: `{{run_id}}:${key}` }] : []),
      ...(body ? [{ key: "Content-Type", value: "application/json" }] : []), ...headers,
    ],
    url, description,
    ...(body ? { body: { mode: "raw", raw: JSON.stringify(body, null, 2), options: { raw: { language: "json" } } } } : {}),
    ...(binary ? { body: { mode: "file", file: { src: "" } } } : {}),
  }, event: events, response: [] };
}
const project = (name, key) => request(name, "POST", "/projects", "Creates a project and stores project_id. No CAD generation or credit debit occurs here.", {
  body: { name: "Prompt2CAD integration example" }, key, events: [capture("project_id")],
});
const generation = (name, prompt, key, extra = {}, required = [], refine = false) => request(name, "POST", "/projects/{{project_id}}/generations", "Starts a credit-consuming generation/refinement. Saves generation_id. Poll manually every five seconds; 202 means accepted, not completed.", {
  body: { prompt, model: "{{model}}", ...extra }, key,
  events: [requireVariables(["project_id", ...required]), ...(refine ? [completed] : []), capture("generation_id")],
});
const poll = name => request(name, "GET", "/projects/{{project_id}}/generations/{{generation_id}}", "Read-only status and usage. Send every five seconds until completed. Stop on paused, awaiting_input, failed or cancelled. This collection never resumes a paid segment automatically.", {
  events: [requireVariables(["project_id", "generation_id"]), capture("generation_id")],
});
const collection = {
  info: {
    _postman_id: "f46baf25-4732-4cc1-b87b-e921f852c9d2",
    name: "Prompt2CAD API — Generate, Modify CAD, Refine and Export",
    description: "Official Prompt2CAD API workflows. Set api_key in a private environment or replace the bearer token with a Postman Vault reference. Run requests one at a time in the documented order; do not Run All because generations are asynchronous and spend credits. run_id is generated once if empty; retain it when retrying unchanged operations and change it for a new workflow. Default model: default. Budget model: deepseek/deepseek-v4.1-flash. Docs: https://prompt2cad.com/documentation/integrations/api · SDK: https://github.com/prompt2cad/sdk · OpenAPI: https://prompt2cad.com/api/v1/openapi.json. Exports and uploads add no customer credit debit; generation and paid auxiliary tools use the account credit balance.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{api_key}}", type: "string" }] },
  variable: variables.map(([key, value]) => ({ key, value, type: "string" })),
  event: [script("prerequest", 'if (!pm.variables.get("run_id")) pm.collectionVariables.set("run_id", pm.variables.replaceIn("{{$guid}}"));')],
  item: [
    { name: "01 — Credits and project", item: [
      request("Read account credits", "GET", "/usage", "Read account credits and limits without starting generation."),
      project("Create a generation project", "project"),
    ] },
    { name: "02 — Generate and refine", description: "Generate, then poll to completion before refining. The refinement example selects the budget model explicitly.", item: [
      generation("Generate a mounting bracket", "Create an L bracket, 100 mm wide, with 60 mm legs, 6 mm walls and two 8 mm mounting holes.", "generate"),
      poll("Poll initial generation"),
      generation("Refine with DeepSeek V4.1 Flash", "Increase the bracket width to 120 mm. Keep the leg lengths, wall thickness and hole diameters unchanged.", "refine", { model: "deepseek/deepseek-v4.1-flash" }, [], true),
      poll("Poll refinement"),
    ] },
    { name: "03 — Modify an existing CAD file", description: "Creates a separate project. Choose a local plate.stl in the binary upload body. Check source units and bounds before generating. STEP/IGES are not supported inputs.", item: [
      project("Create a CAD modification project", "cad-project"),
      request("Upload CAD source bytes", "POST", "/cad-files?fileName={{cad_file_name}}&units={{cad_units}}", "Select a local file in Body → binary. Supported: DWG, DXF, SKP, OBJ, STL, GLB and self-contained glTF. Source 10 MiB, normalized geometry 8 MiB, retained sources 16 MiB/project. Each retry creates a new upload ID.", {
        binary: true, headers: [{ key: "Content-Type", value: "application/octet-stream" }], events: [capture("cad_file_id")],
      }),
      generation("Modify the imported plate", "Use the attached plate as the base. Add two 6 mm through-holes, centered across its width and spaced 60 mm apart along its length. Preserve the outer shape and thickness.", "cad-modify", { cadFileIds: ["{{cad_file_id}}"], model: "deepseek/deepseek-v4.1-flash" }, ["cad_file_id"]),
      poll("Poll CAD modification"),
      generation("Refine the imported plate", "Increase the two hole diameters to 8 mm; preserve their centers and the plate. Use the existing project source without re-uploading.", "cad-refine", { model: "deepseek/deepseek-v4.1-flash" }, [], true),
      poll("Poll CAD refinement"),
    ] },
    { name: "04 — Optional image reference", description: "Creates a separate project. Choose a PNG in the binary body; for JPEG/WebP adjust Content-Type accordingly. Include physical dimensions in the prompt.", item: [
      project("Create an image-reference project", "image-project"),
      request("Upload reference image", "POST", "/files", "Select a local PNG using Body → binary. Stores image_file_id. Image limits: 20 MiB and 40 megapixels; normalized to JPEG at a 768-pixel longest side.", {
        binary: true, headers: [{ key: "Content-Type", value: "image/png" }], events: [capture("image_file_id")],
      }),
      generation("Generate from the reference image", "Model the bracket shown in this reference. Its base is 100 mm wide; use 6 mm walls and 8 mm mounting holes.", "image-generate", { imageFileIds: ["{{image_file_id}}"] }, ["image_file_id"]),
      poll("Poll image-reference generation"),
    ] },
    { name: "05 — Export the completed revision", description: "Exports the current completed generation. Immutable snapshot; later changes do not alter this export. Artifacts expire after seven days. Change formats to any supported output as needed.", item: [
      request("Request STEP, STL and PNG exports", "POST", "/projects/{{project_id}}/exports", "Requests three formats. OBJ is ZIP/MTL; DXF is 3D geometry; PNG is a viewport preview. Export each completed generation with a distinct operation key.", {
        body: { generationId: "{{generation_id}}", formats: ["step", "stl", "png"] }, key: "export:{{generation_id}}",
        events: [requireVariables(["project_id", "generation_id"]), completed, capture("export_id")],
      }),
      request("Poll export and select a download", "GET", "/projects/{{project_id}}/exports/{{export_id}}", "Read export status and check every artifact: individual formats can fail. Saves the first successful artifact download path; edit download_path to download another completed artifact.", {
        events: [requireVariables(["project_id", "export_id"]), script("test", `
if (pm.response.code >= 200 && pm.response.code < 300) {
  const data = pm.response.json();
  const artifact = (data.artifacts || []).find(item => item.status === "completed" && /^\\/api\\/v1\\/artifacts\\/[^/]+\\/download$/.test(item.downloadUrl || ""));
  if (artifact) pm.collectionVariables.set("download_path", artifact.downloadUrl);
}`)],
      }),
      request("Download a completed artifact", "GET", "{{origin}}{{download_path}}", "Authenticated binary download. Use Send and Download in Postman to save it locally. Artifacts are retained for seven days.", {
        events: [requireVariables(["download_path"]), script("prerequest", 'if (!/^\\/api\\/v1\\/artifacts\\/[^/]+\\/download$/.test(pm.variables.get("download_path"))) { pm.execution.skipRequest(); throw new Error("Use a download path returned by this API export."); }')],
      }),
    ] },
  ],
};
await mkdir(new URL("../postman/", import.meta.url), { recursive: true });
await writeFile(new URL("../postman/prompt2cad.postman_collection.json", import.meta.url), JSON.stringify(collection, null, 2) + "\n");
console.log(`Generated ${collection.item.reduce((total, folder) => total + folder.item.length, 0)} documented requests`);
