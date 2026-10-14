# Official Prompt2CAD Postman collection

- [Public Postman API Network workspace](https://www.postman.com/prompt2cad/prompt2cad-api/overview)
- [Published API documentation](https://documenter.getpostman.com/view/58957039/2sBYHRVh9f)

Import [prompt2cad.postman_collection.json](prompt2cad.postman_collection.json) in
Postman. This collection contains manual workflows for generation, refinement,
CAD imports/modification, image references, export polling and artifact download.

1. Set `api_key` in a private local environment, or replace the collection bearer
   token with your Postman Vault reference. The public collection contains no key.
2. Open the collection documentation and run requests individually, in order.
   Generation uses credits. Do not Run All: generation is asynchronous and later
   steps require a completed result.
3. Poll each generation every five seconds until `completed` before refining or exporting.
4. Choose the binary source manually in the upload request body. Uploaded files are
   not distributed with this collection.
5. Check each export artifact and use Send and Download for completed files.

The collection stores project, generation, upload and export IDs from successful
responses in local collection variables. `run_id` is generated once if empty.
Retain it and the unchanged payload for retries; set a new `run_id` for a new
independent workflow. To request another export in the same project, change its
idempotency suffix or use a new operation key. Do not publish populated credentials
or real customer operation IDs back to the shared source collection.

`model` defaults to `default`. Set it to `deepseek/deepseek-v4.1-flash` for the
budget agent; the refinement/CAD examples already select DeepSeek explicitly.

Paused and interactive jobs need explicit handling; this collection does not
automatically resume paid segments or answer clarification questions.

Docs: https://prompt2cad.com/documentation/integrations/api

Maintainers: regenerate the collection with `node scripts/generate-postman.mjs`.
Validate it with `npm test`; validation is offline and never spends API credits.
