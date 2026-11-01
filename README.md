# n8n Sales Automation Suite

A 21-workflow sales and CRM automation package (`00-master-100juta-orchestrator` plus 20 specialized workflows) with a deterministic JavaScript business-rule library (`logic.mjs`), offline workflow studio (`index.html`), Google Sheets CRM templates (`sheet-templates/*.csv`), and an automated local verification suite (`test.mjs`).

Live workflow studio: https://vanovri.github.io/n8n-sales-automation-suite/

## What Was Built

- **21 Importable n8n Workflows (`workflows/*.json` & `all-workflows.json`)**:
  - `00` Master Revenue Router
  - `01` Auto Lead Capture · `02` Instant WA Greeting · `03` AI Lead Qualifier · `04` Form to CRM · `05` AI DM Auto-Reply
  - `06` Auto Booking Meeting · `07` Hot Lead Sales Alert · `08` AI Quote Generator · `09` Proposal Sender · `10` AI Proposal Summary
  - `11` WA Follow-Up · `12` Proposal Follow-Up · `13` Lead Re-Engagement · `14` Invoice & Reminder · `15` Payment Success Notification
  - `16` Client Onboarding · `17` Review & Rating Request · `18` Upsell Sequence · `19` AI Competitor Monitor · `20` AI Sales Weekly Report
- **Deterministic Business Logic (`logic.mjs`)**: Input normalization, Indonesian E.164 phone formatting, lead scoring, quote/tax/discount calculation, invoice reminders, and competitor diffing.
- **Static Browser Studio (`index.html` & `studio.mjs`)**: Zero-dependency browser inspector for browsing workflow nodes, copying JSON, and downloading individual or bundled workflows.

## Verification

Run the local verification suite (requires Node.js 20+):

```bash
node build.mjs
node studio.mjs
node test.mjs
```

- `node test.mjs` runs **75 deterministic business-rule checks** and **21/21 end-to-end workflow graph simulations** against synthetic fixtures (`examples/fixtures.json`), writing the report to `reports/local-tests.json`.

## Scope & Limitations

- All workflows ship inactive (`"active": false`) and use placeholder configuration values from `config.example.json`.
- Passing JSON validation and JavaScript graph simulations verify the workflow logic and node wiring against mocked external services; they do not establish live WhatsApp (Fonnte), Midtrans payment, email, or production revenue performance.
- Developed with AI coding assistance.
