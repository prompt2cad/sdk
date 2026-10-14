# Prompt2CAD SDK and examples

Official SDK, examples and integration documentation for the [Prompt2CAD API](https://prompt2cad.com/cad-api).

Generate dimensioned CAD from text, modify supported CAD/3D files, refine the same project, and export STEP, DXF, SKP, GLB, DAE, OBJ, STL, 3MF or PNG.

This repository is maintained by Prompt2CAD. Support: support@prompt2cad.com.

## Install

Requires Node.js 22 or later. Install directly from GitHub:

```bash
npm install github:prompt2cad/sdk
```

This initial release is distributed on GitHub; it is not yet published on npm.
ES modules and TypeScript declarations are included, with no runtime dependencies.

Create an API key at [Developer settings](https://prompt2cad.com/developer) and set
`PROMPT2CAD_API_KEY` in your server environment. Generation uses account credits.

## Generate and export CAD

```js
import { Prompt2CAD } from "@prompt2cad/sdk";
import { writeFile } from "node:fs/promises";

const client = new Prompt2CAD({ apiKey: process.env.PROMPT2CAD_API_KEY });
// Persist this identifier in your integration to reuse it after a restart.
const run = "bracket-order-42";
const project = await client.createProject({ name: "Motor bracket" }, {
  idempotencyKey: `${run}:project`,
});
const started = await client.generate(project.id, {
  prompt: "Create an L bracket 100 mm wide, with 60 mm legs, 6 mm walls and two 8 mm mounting holes.",
  model: "default",
}, { idempotencyKey: `${run}:generate` });

const generation = await client.waitForGeneration(project.id, started.id);
if (generation.status !== "completed") throw new Error(`Stopped: ${generation.status}`);
const startedExport = await client.exportModel(project.id, {
  generationId: generation.id, formats: ["step", "png"],
}, { idempotencyKey: `${run}:export` });
const exported = await client.waitForExport(project.id, startedExport.id);
if (exported.status !== "completed") throw new Error(`Export stopped: ${exported.status}`);
for (const artifact of exported.artifacts) {
  if (artifact.status === "completed" && artifact.downloadUrl) {
    await writeFile(artifact.filename, await client.downloadArtifact(artifact.downloadUrl));
  } else {
    console.error(artifact.error);
  }
}
```

## Modify an existing CAD/3D file

```js
import { readFile } from "node:fs/promises";

const source = await client.uploadCadFile(await readFile("plate.stl"), {
  fileName: "plate.stl", units: "mm",
});
const plateProject = await client.createProject({ name: "Modified plate" }, {
  idempotencyKey: `${run}:plate-project`,
});
const started = await client.generate(plateProject.id, {
  prompt: "Use the attached plate as the base. Add two 6 mm through-holes spaced 60 mm apart along its length and centered across its width. Preserve the outer shape and thickness.",
  cadFileIds: [source.id],
  model: "deepseek/deepseek-v4.1-flash",
}, { idempotencyKey: `${run}:modify` });
const modified = await client.waitForGeneration(plateProject.id, started.id);
if (modified.status !== "completed") throw new Error(`Stopped: ${modified.status}`);

// Same project retains the source and geometry. No re-upload is necessary.
const refined = await client.generate(plateProject.id, {
  prompt: "Increase the two hole diameters to 8 mm; preserve their centers and the plate.",
  model: "deepseek/deepseek-v4.1-flash",
}, { idempotencyKey: `${run}:refine` });
```

Use a new project for a different independent design. Sources are references until
the agent explicitly uses them; imported meshes do not automatically become native
parametric feature trees. See [CAD inputs](docs/cad-inputs.md) for formats and limits.

## Choose the model

| Request value | Behavior | Input USD / million tokens | Output USD / million tokens |
| --- | --- | ---: | ---: |
| `default` or omitted | Configured default, currently Gemini 3.8 Flash | 1.50 | 7.50 |
| `deepseek/deepseek-v4.1-flash` | Lower-cost DeepSeek V4.1 Flash | 1.10 | 3.30 |

Rates checked October 14, 2026. Output includes reasoning. Model choice applies to
that generation and its resumes; specify it again on the next refinement.
Actual usage, caching and paid auxiliary tools affect cost. See [models and billing](docs/models-and-billing.md).

## Documentation for developers and coding agents

- [API workflows, authentication and errors](docs/api-guide.md)
- [CAD imports and modifications](docs/cad-inputs.md)
- [Model selection and credits](docs/models-and-billing.md)
- [SDK methods and polling behavior](docs/sdk-reference.md)
- [Agent integration instructions](AGENTS.md)
- [Hosted API quickstart](https://prompt2cad.com/documentation/integrations/api)
- [Live OpenAPI specification](https://prompt2cad.com/api/v1/openapi.json)

## Run examples locally

```bash
git clone https://github.com/prompt2cad/sdk.git
cd sdk
# Set PROMPT2CAD_API_KEY through your environment or secret manager.
node examples/generate.mjs
CAD_UNITS=mm node examples/modify-cad.mjs plate.stl
python3 examples/generate.py
```

These examples create paid generations. Set `RUN_ID` to a stable identifier when
restarting the same workflow. For CAD example retries, also set `CAD_FILE_ID` to
reuse the printed upload ID. Set `PROMPT2CAD_MODEL=deepseek/deepseek-v4.1-flash`
to select DeepSeek in the generation examples. Python uses only the standard library.

Tests are offline and never call the paid API:

```bash
npm test
npm run check
```

The MIT license applies to this client code. Hosted API use is governed by the
[Prompt2CAD terms](https://prompt2cad.com/terms).
