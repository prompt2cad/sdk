# Import and modify existing CAD/3D files

Supported inputs: DWG, DXF, SKP, OBJ, STL, GLB and self-contained glTF.
STEP, IGES and native CAD project formats are not supported inputs.

## Upload a source

```js
import { Prompt2CAD } from "@prompt2cad/sdk";
import { readFile } from "node:fs/promises";

const client = new Prompt2CAD({ apiKey: process.env.PROMPT2CAD_API_KEY });
const source = await client.uploadCadFile(await readFile("plate.stl"), {
  fileName: "plate.stl", units: "mm",
});
console.log(source.id);
```

HTTP equivalent: `POST /cad-files?fileName=plate.stl&units=mm`, raw bytes with
`Content-Type: application/octet-stream`. The filename is required. Optional
source-unit overrides: `mm`, `cm`, `m`, `in`, `ft`. Omit the override to use detected units.
Response source facts include `units`, `detectedUnits`, part counts, bounds and skipped
entities. Check those before generating. Geometry is normalized to meters internally.

## Modify and retain the source

```js
const project = await client.createProject({ name: "Modified plate" }, {
  idempotencyKey: "plate-42:project",
});
const started = await client.generate(project.id, {
  prompt: "Use the attached plate as the base. Add two 6 mm through-holes centered across its width and spaced 60 mm apart along its length. Preserve the outer shape and thickness.",
  cadFileIds: [source.id], model: "deepseek/deepseek-v4.1-flash",
}, { idempotencyKey: "plate-42:modify" });
const result = await client.waitForGeneration(project.id, started.id);
if (result.status !== "completed") throw new Error(`Stopped: ${result.status}`);
const next = await client.generate(project.id, {
  prompt: "Increase the two hole diameters to 8 mm and preserve their centers.",
  model: "deepseek/deepseek-v4.1-flash",
}, { idempotencyKey: "plate-42:refine" });
```

Up to four unique upload IDs can be supplied in `cadFileIds`. They belong to the
uploading account and can be reused in its API projects. Sources persist in the
project for later refinements; resending the IDs is not necessary.

An attachment stays inert until the agent explicitly uses it. Ask to use it as the
base for geometry edits; ask to inspect it when only dimensions/layout are needed
for a surrounding design. Imported meshes can receive supported local geometry
edits but do not automatically recover their original parametric feature history.
Each model file can contain one imported source; use another model file for a
different source.

## Format boundaries and limits

- GLB/glTF must embed buffers and images. External URLs and companion resources are rejected.
- OBJ material/texture companion files are not uploaded through this endpoint.
- DWG ACIS solids cannot be decoded; DWG/DXF support follows the app importer.
- Source: 10 MiB per upload. Normalized geometry: 8 MiB per upload.
- Retained CAD attachments: 16 MiB per project, including sources added on earlier turns.
- CAD storage: 200 MiB per account for original plus normalized files.
- Complex sources can exceed normalized size limits despite small input files.

Uploads add no customer credit debit. Generation and paid auxiliary tools consume
credits. For format details see https://prompt2cad.com/documentation/working-with-designs/importing-cad-files.
