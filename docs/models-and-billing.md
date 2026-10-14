# Model choice and credit billing

Every generation request can choose `model`:

```js
await client.generate(projectId, {
  prompt: "Widen the bracket to 120 mm and preserve the mounting holes.",
  model: "deepseek/deepseek-v4.1-flash",
}, { idempotencyKey: "order-42:refine-2" });
```

Omit `model` or set `default` for the configured default CAD agent (currently Gemini
3.8 Flash). Set `deepseek/deepseek-v4.1-flash` for the lower-cost alternative.
Unknown model IDs return `400`. This choice is available through the API without
enabling the experimental model picker in the app.

Model choice applies to one generation and its continuations/resumes. A subsequent
refinement defaults again unless it specifies DeepSeek. Switching models retains
the project conversation and geometry. Generation responses report the selected option
in `model`; `default` is an alias rather than a permanent provider version pin.

## Customer rates

Checked October 14, 2026; USD per million tokens:

| Model | Input | Output, including reasoning |
| --- | ---: | ---: |
| Default (Gemini 3.8 Flash) | $1.50 | $7.50 |
| DeepSeek V4.1 Flash | $1.10 | $3.30 |

One credit is one US cent. Billing uses actual token usage. Provider-reported cached
input is charged at 20% of the input rate. Successful non-zero-token calls have a
minimum one-credit charge. Lower token rates do not guarantee a fixed total design
cost: different models can use different token counts/iterations, and paid auxiliary
tools retain their separate charges.

The API and app share one account balance. API exports/downloads are available
during the trial without a top-up. Uploads and exports add no customer credit debit.
Top up through the app when more generation credits are needed.

Use `client.getUsage()` for balance and `generation.usage.billedCredits` for a turn's
recorded debit. Up-front credit reservations may temporarily hold more than the
final charge; unused reservations are released on settlement.

Canonical billing documentation: https://prompt2cad.com/documentation/billing/credits.
