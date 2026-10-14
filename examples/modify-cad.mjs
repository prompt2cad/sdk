import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Prompt2CAD } from "../src/index.js";

const filePath = process.argv[2];
if (!filePath) throw new Error("Usage: node examples/modify-cad.mjs plate.stl");
const client = new Prompt2CAD({ apiKey: process.env.PROMPT2CAD_API_KEY });
const run = process.env.RUN_ID ?? randomUUID();
const model = process.env.PROMPT2CAD_MODEL ?? "deepseek/deepseek-v4.1-flash";
// Set CAD_FILE_ID when restarting to reuse an existing upload.
const source = process.env.CAD_FILE_ID ? { id: process.env.CAD_FILE_ID } : await client.uploadCadFile(await readFile(filePath), {
  fileName: basename(filePath), units: process.env.CAD_UNITS ?? "mm",
});
console.log({ run, cadFileId: source.id });
const project = await client.createProject({ name: "Modified plate" }, { idempotencyKey: `${run}:project` });
const started = await client.generate(project.id, {
  prompt: "Use the attached plate as the base. Add two 6 mm through-holes spaced 60 mm apart along its length, centered across its width. Preserve its outer shape and thickness.",
  cadFileIds: [source.id], model,
}, { idempotencyKey: `${run}:modify` });
console.log({ projectId: project.id, generationId: started.id });
const modified = await client.waitForGeneration(project.id, started.id);
if (modified.status !== "completed") throw new Error(`Generation stopped: ${JSON.stringify(modified)}`);
const next = await client.generate(project.id, {
  prompt: "Increase those two hole diameters to 8 mm. Keep their centers and the plate unchanged.", model,
}, { idempotencyKey: `${run}:refine` });
const refined = await client.waitForGeneration(project.id, next.id);
if (refined.status !== "completed") throw new Error(`Refinement stopped: ${JSON.stringify(refined)}`);
console.log({ projectId: project.id, generationId: refined.id, billedCredits: refined.usage.billedCredits });
// Export with client.exportModel(project.id, {generationId: refined.id, formats: ["stl"]}, ...).
