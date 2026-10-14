# Using the Prompt2CAD API from a coding agent

Prompt2CAD generates and refines dimensioned CAD for physical objects: furniture,
mechanical parts, products, enclosures, brackets and workshop projects.

Read [docs/api-guide.md](docs/api-guide.md), [docs/cad-inputs.md](docs/cad-inputs.md)
and [docs/models-and-billing.md](docs/models-and-billing.md) before integrating.
The canonical live contract is https://prompt2cad.com/api/v1/openapi.json.

## Integration invariants

- Read `PROMPT2CAD_API_KEY` from the server environment; do not include it in browser bundles or public examples.
- Generate in an API-created project, then refine using that same project ID.
- Include dimensions and units in the prompt; image references do not establish exact scale.
- Persist operation IDs and idempotency keys. Retrying an operation uses the same key and unchanged payload. A new operation needs a new key.
- Poll every five seconds. `202` is acceptance, not completion.
- Export only a completed generation. Check per-artifact status because formats can fail independently.
- Stop on `paused`, `awaiting_input`, `failed` or `cancelled`. Resume is a new, explicit credit-consuming segment, not an automatic retry.
- Default model: omit `model` or use `default`. Budget model: `deepseek/deepseek-v4.1-flash`. Specify the choice again on every new refinement.
- Upload CAD bytes to `/cad-files` with `fileName` and optional `units`, then pass `cadFileIds` to generation. STEP/IGES are output/interchange formats, not supported inputs.
- To modify a source, ask to use the attachment as the base. To design around it, ask to inspect the reference. Attachments remain available in later turns.
- SDK polling timeout/cancellation only stops the client wait. `cancelGeneration` explicitly requests a cooperative server stop.

## Repository maintenance

Run `npm test`, `npm run check` and Python syntax checks. Tests must remain offline.
Keep README and docs examples consistent with the live API. Do not add automatic
paid resumes. Keep source uploads and customer data out of this repository.
