# JavaScript SDK reference

```js
import { Prompt2CAD, Prompt2CADError } from "@prompt2cad/sdk";
const client = new Prompt2CAD({ apiKey: process.env.PROMPT2CAD_API_KEY });
```

Node.js 22+, ESM, no runtime dependencies. Optional constructor `baseUrl` changes the
API environment; default is `https://prompt2cad.com/api/v1`. Optional `fetch` supports
testing or custom transport. TypeScript declarations are included.

| Method | Input | Operation key required |
| --- | --- | --- |
| `getUsage(options?)` | Read credits and limits | No |
| `createProject({name}, options)` | Create an API project | Yes |
| `getProject(projectId, options?)` | Recent lightweight generation summaries | No |
| `deleteProject(projectId, options?)` | Delete a project and access to artifacts | No |
| `generate(projectId, input, options)` | Generate or refine | Yes |
| `getGeneration(projectId, generationId, options?)` | Read status, usage and results | No |
| `cancelGeneration(projectId, generationId, options?)` | Request cooperative cancellation | No |
| `resumeGeneration(projectId, generationId, options)` | Explicitly continue a paused segment | Yes |
| `answerQuestions(projectId, generationId, input, options?)` | Interactive answers | No |
| `approvePlan(projectId, generationId, input, options?)` | Interactive plan decision | No |
| `uploadCadFile(bytes, {fileName, units?, signal?})` | Binary CAD/3D source | No |
| `uploadImage(bytes, {mimeType, signal?})` | JPEG, PNG or WebP bytes | No |
| `exportModel(projectId, {generationId, formats, fileId?}, options)` | Export a completed revision | Yes |
| `getExport(projectId, exportId, options?)` | Read per-format export status | No |
| `downloadArtifact(downloadUrl, options?)` | Authenticated download as `Uint8Array` | No |

Operations that require keys take `{idempotencyKey, signal?}`. Other request options
take `{signal?}`. Generation input supports `prompt`, `model`, `cadFileIds`,
`imageFileIds`, `executionMode` and `unitSystem`. See [API guide](api-guide.md).

## Polling

`waitForGeneration(projectId, generationId, options?)` and
`waitForExport(projectId, exportId, options?)` poll with GET every five seconds.
Options: `intervalMs`, `timeoutMs` (default 35 minutes), `signal`.
They return as soon as the status is neither `accepted` nor `running`, including
`paused`, `awaiting_input`, `failed`, `cancelled` and `expired`. Check the result
before refining/exporting. They do not automatically answer questions, resume,
start another generation or retry a failed network request.

A timeout or abort stops only the local wait. Retain the server operation IDs to
reconnect, or explicitly call `cancelGeneration` to request server cancellation.

## Errors

`Prompt2CADError` includes `status`, `code`, `requestId`, `retryAfter`. Example:

```js
try {
  await client.getUsage();
} catch (error) {
  if (error instanceof Prompt2CADError) {
    console.error(error.status, error.code, error.requestId);
  }
  throw error;
}
```

Network errors and aborts propagate from fetch. Retry the same operation with its
original key and payload when appropriate. Downloads accept only artifact URLs on
the configured API origin; HTTP redirects are rejected.
