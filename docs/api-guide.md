# Prompt2CAD API workflow

Base URL: `https://prompt2cad.com/api/v1`.
Create an API key at https://prompt2cad.com/developer. Every operation uses
`Authorization: Bearer YOUR_API_KEY`. The live machine-readable contract is
https://prompt2cad.com/api/v1/openapi.json.

## Generate, refine, export

1. `POST /projects` with `{ "name": "Mounting bracket" }`. Store the returned `id`.
2. `POST /projects/{projectId}/generations` with `prompt`, optional `model`,
   `imageFileIds`, `cadFileIds`, `unitSystem` (`metric`/`imperial`) and
   `executionMode` (`autonomous`/`interactive`). Store the generation `id`.
3. Poll `GET /projects/{projectId}/generations/{generationId}` every five seconds.
4. After `completed`, either submit a new refinement to the same project or request
   `POST /projects/{projectId}/exports` with `generationId` and `formats`.
5. Poll `GET /projects/{projectId}/exports/{exportId}` and inspect every artifact.
6. Download each successful artifact's `downloadUrl` using the API key.

Projects retain their conversation, geometry and CAD sources. API-created projects
are separate from web-app projects; this API does not import existing app projects.
Generation response `files` lists available CAD file IDs; export defaults to `main`.

## Idempotency and retries

Creating a project, starting a generation, requesting an export and resuming a
generation require an `Idempotency-Key`: 1–128 letters, digits, dots, underscores,
colons or hyphens. Keep the same key and payload after a network failure; a different
payload with the same key returns `409`. Use a new key for a new change.

Do not reuse the same key with a different model. The `model` field is optional;
omitting it and explicitly sending `default` are different payloads for idempotency.
Accepted operations normally return `202`; identical retries can return `200`.
Uploads do not require idempotency keys; repeated uploads create separate IDs.

Errors contain `error.code`, `error.message` and `requestId`. `429` includes
`Retry-After`; allow that delay before retrying. Resolve invalid input and conflicts
before changing a request. SDK errors preserve status, code, request ID and retry delay.
The SDK does not retry requests automatically.

## Generation state and spending

States: `accepted`, `running`, `awaiting_input`, `paused`, `completed`, `failed`,
`cancelled`. Read `usage.billedCredits` and `usage.toolCalls` for recorded usage.
Polling is read-only and never starts another generation.

Segment limits are 30 tool calls, 5,000 billed credits or 30 minutes. In-flight work
can settle beyond a threshold. A paused operation needs an explicit
`POST .../{generationId}/resume` with a new idempotency key. The SDK never performs
this paid continuation automatically.

`POST .../{generationId}/cancel` requests a cooperative stop. Work already in flight
may complete and be billed. Aborting a client request or poll is not a server cancel.

## Interactive mode

Autonomous mode is the default: the agent selects clarification defaults and approves
validated room plans. Read `assumptions` to see selected answers.

In interactive mode, `awaiting_input` exposes `questions` and `planReviews`. Use:

- `POST .../{generationId}/answers` with `{ "toolCallId": "...", "answers": [{ "id": "width", "value": 0.12 }] }`.
- `POST .../{generationId}/approval` with `{ "toolCallId": "...", "approved": true }`, or `approved: false` plus `feedback`.

Answer every question in the pending call. Internal length answers are in meters.

## References and export formats

Image uploads: `POST /files` with raw JPEG/PNG/WebP bytes and matching content type.
Use up to four `imageFileIds`. Sources are limited to 20 MiB and 40 megapixels,
normalized to JPEG with a 768-pixel longest side. Include known dimensions in the prompt.
CAD sources use a separate endpoint: see [CAD inputs](cad-inputs.md).

Exports: `step`, `dxf`, `skp`, `glb`, `dae`, `obj`, `stl`, `3mf`, `png`.
OBJ is a ZIP with OBJ/MTL. PNG is a viewport preview, not a photorealistic AI render.
DXF carries 3D geometry, not flattened 2D cutting profiles. Exported files carry
geometry, not the agent's editable source or a native downstream feature history.
Imported meshes remain mesh-based, subject to format-specific export limitations.

An export is tied to an immutable completed-generation snapshot; later refinements
do not change it. Artifacts expire seven days after export creation. Save needed
downloads in your own storage. `DELETE /projects/{projectId}` removes access to the
project and its artifacts.

Account-wide limits include 120 requests/minute, 10 image uploads/minute, 10 CAD
uploads/minute, three active generations and three active exports, one generation
per project and 20 API keys. JSON request bodies are limited to 200 KB. Check
https://prompt2cad.com/documentation/integrations/api for current limits.
