import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Prompt2CAD } from "../src/index.js";

const client = new Prompt2CAD({ apiKey: process.env.PROMPT2CAD_API_KEY });
const run = process.env.RUN_ID ?? randomUUID();
const model = process.env.PROMPT2CAD_MODEL ?? "default";
const project = await client.createProject({ name: "Mounting bracket" }, { idempotencyKey: `${run}:project` });
const started = await client.generate(project.id, {
  prompt: "Create an L bracket, 100 mm wide, with 6 mm walls, 60 mm legs and two 8 mm mounting holes.", model,
}, { idempotencyKey: `${run}:generate` });
console.log({ run, projectId: project.id, generationId: started.id });
const generation = await client.waitForGeneration(project.id, started.id);
if (generation.status !== "completed") throw new Error(`Generation stopped: ${JSON.stringify(generation)}`);
const exported = await client.exportModel(project.id, {
  generationId: generation.id, formats: ["step", "png"],
}, { idempotencyKey: `${run}:export` });
const result = await client.waitForExport(project.id, exported.id);
if (result.status !== "completed") throw new Error(`Export stopped: ${JSON.stringify(result)}`);
for (const artifact of result.artifacts) {
  if (artifact.status !== "completed" || !artifact.downloadUrl) { console.error(artifact); continue; }
  await writeFile(artifact.filename, await client.downloadArtifact(artifact.downloadUrl));
  console.log(`Saved ${artifact.filename}`);
}
