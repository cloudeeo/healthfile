# HealthFile: the family's health records, understood at home

Name: **HealthFile**.

## 1. What it is

A small web application for one family, running on the home server next to `qvac serve`. You photograph or upload a medical document (a lab report, a specialist's letter, a prescription, a vaccination record, a discharge summary) and it is read, filed under the right person with its date and type, and made searchable. You then ask in your own language: "when was my last thyroid check and what was the TSH?", "what did the paediatrician write in March?", "plot my cholesterol over the last three years", "explain this report in plain words". Reminders for medication and follow-ups come from the same place. Nothing leaves the house: every model runs on the home server, and the page shows what left it (nothing, by design).

It is a **record organiser and reader**, not a diagnostic tool. It finds, transcribes, charts and explains what the family's own documents say, always citing the document, and it sends every question of the kind "what should I do" to the doctor. This boundary is a product decision (see section 9), not a disclaimer.

## 2. Why this, why now, why here

- Health records are the one family dataset nobody wants on someone else's cloud. Local is the requirement, not a preference.
- QVAC just shipped the parts this needs: Qwen3.5-4B with vision through `qvac serve`, EmbeddingGemma and TurboVec 1.1.2 (vector search 2–8× faster in SDK 0.24), and MedPsy, Tether's own on-device medical model (Apache 2.0, GGUF, Q4_K_M 2.7 GB).
- Everything built so far is reused: the chat and queue of qvac-dashboard, its voice and vision paths, the BotPsy agent and its shared reminders, home-router's document search. What is new is the product layer: ingestion with structured extraction, people, a timeline, charts, an export.
- The author's own ground: 25 years in health IT, two CE-marked diagnostic software products, the SaMD and AI Act perimeter. The line between "helps you read your records" and "medical device" is exactly the line this product must hold, and holding it deliberately is part of what makes it credible.

## 3. Who uses it

A family of two to six people on the same tailnet, from phones and laptops. One member is the admin (adds people, removes documents). Children's documents belong to their parents' view. v0.1 has no per-person login: whoever is on the tailnet sees the family file; adult-only sections are a later feature (section 11).

## 4. Models and where they run

| Role | Model | Where | Notes |
| --- | --- | --- | --- |
| Reading a page (photo or PDF page) | Qwen3.5-4B, with projector | GPU | already served as `qwen35-4b`; structured JSON extraction |
| Answering questions, summaries, charts' captions | Qwen3.5-4B (default) or Qwen3.6-35B (CPU, when asked for quality) | GPU / CPU | `reasoning_budget: 0` for speed |
| Explaining a report in plain words | **MedPsy-4B Q4_K_M** | GPU | English-only and text-only per its card: measured in Italian before relying on it; fallback is the general model |
| Embeddings | EmbeddingGemma 300M | CPU | `/v1/embeddings`; vector search through `qvac serve` vector stores (TurboVec) |
| Voice in, voice out | Whisper small (it/fr/en), Supertonic 3 | GPU | already served |
| Tools (reminders, calculator, dates) | BotPsy-0.8B | GPU | the agent of qvac-dashboard v1.5 |

VRAM budget on the RTX 3060 (12 GB): today 10.2 GB with `qwen4b` (Qwen3-4B, text-only) loaded. MedPsy Q4_K_M needs about 3 GB with its context. **`qwen4b` goes, MedPsy comes in**; Jarvis (home-router) switches its LLM alias to `qwen35-4b`, which is the same family with vision on top. To be measured at the first restart.

## 5. Ingestion

1. **Capture.** Upload from the page (camera on the phone, file picker, drag and drop), one or more images or a PDF. Formats: JPEG, PNG, HEIC (converted server-side with `heif-convert` when present, otherwise refused with a message), PDF (pages rendered with `pdftoppm` at 150 dpi). Limits: 20 MB per file, 30 pages per document.
2. **Reading.** Each page goes to the vision model with a fixed prompt that asks for one JSON object: `{ language, kind, date, person_hint, issuer, title, text, values: [{ name, value, unit, reference, flag }], medications: [{ name, dose, schedule }], follow_ups: [{ what, when }] }`. `kind` is one of `lab_report`, `letter`, `prescription`, `vaccination`, `imaging_report`, `discharge`, `invoice`, `insurance`, `other`. `text` is a faithful transcription (the source of truth for search); `values` are the analytes of a lab report with the reference range as printed. A second pass with the text-only model repairs JSON that does not parse. Multi-page documents are merged: pages' `text` concatenated, `values` unioned.
3. **Review.** Nothing is filed without a look: the page shows the image next to what was read (person, date, kind, title, and the values in a table with the original crop under each row), the user corrects and confirms. Corrections are stored as such (`reviewed_by`, `edited_fields`) and count in the accuracy measurements.
4. **Filing.** The document gets an id, the original file is kept as uploaded (never modified), a 1,200 px preview per page is made, `text` is chunked (by page, then by about 600 tokens with overlap) and embedded, the values go to the `measurements` table normalised to a canonical analyte name and unit when the mapping is known (a table of about 60 common analytes in it/fr/en: emocromo, glicemia, colesterolo, TSH, creatinina, …), otherwise kept as printed.

Duplicates: a document whose text is 95 % similar to an existing one of the same person and date is flagged before filing.

## 6. Finding, asking, charting

- **Timeline** per person: documents by date, filterable by kind; each opens to its pages and extracted content, with the review state.
- **Values**: a table of analytes per person with the latest value, the reference range and the trend; clicking one draws the series over time with the reference band, one point per document, each point linking to its page. Charts follow the `dataviz` conventions already used in the dashboard.
- **Ask**: a chat scoped to one person or to the family. Retrieval over the chunks (vector search, top 8, plus the `measurements` rows that match an analyte named in the question); the answer is written by the general model with a preface that lists the passages and says: answer only from these, quote numbers with their units and dates, cite `[doc 12, p. 2]` after every fact, and say "I did not find this in the documents" when it is not there. The page renders citations as links to the page image. The question's language is answered in kind (it/fr/en).
- **Explain this report**: on any document, a button sends its `text` to MedPsy with a prompt that asks for a plain-language reading for a non-clinician: what the document is, what each flagged value means in general, which questions to bring to the doctor, and nothing about what to do. The output is shown with the source text beside it and a fixed line: "This is a reading aid. Your doctor decides." Measured in Italian against the general model (section 10); the UI uses whichever wins, per language.
- **Voice**: dictate questions and have answers read, as in the dashboard chat.
- **Reminders**: medication schedules and follow-ups found at ingestion are proposed as reminders (confirm to create); they live in the shared agent store and show on the dashboard strip too.
- **Export**: for one person, a date range, or one visit: a PDF (and Markdown) with the timeline, the values table, the charts and the documents' previews, to hand to a doctor. Generated locally.

## 7. Privacy and what leaves the house

- All model calls go to `qvac serve` on loopback; the app has **no web tools** and no outbound fetch at all. The status line shows "0 outbound calls" and a count of documents, and the agent's tools are limited to reminders, dates and the calculator.
- Files and the database live under `~/.local/share/healthfile/` with mode 0700; the originals are never rewritten; deletion is real (file and rows) and asks twice.
- Access is by tailnet membership (as the dashboard); an optional family PIN on the page in v0.1, per-person access later.
- Logs never contain document text, values or names: ingestion logs document ids, page counts and timings only.
- Backups: a `healthfile export --all` command writes an encrypted archive (age or a passphrase with `openssl enc`) the admin can copy elsewhere; the restore is the inverse. v0.2.

## 8. Architecture

Node 22, no framework, the same shape as qvac-dashboard: `src/` server (ingest, store, search, ask, explain, export, agent), `public/` a static page (vanilla JS, i18n it/fr/en, light and dark), `test/` with `node --test`, mock mode for development and screenshots. Storage: `node:sqlite` for documents, pages, measurements, people, reminders and review state; files on disk by document id; vectors in a `qvac serve` vector store per family (fallback: cosine search over an SQLite table when vector stores are not available). Runs as a systemd user unit on omen01, published on the tailnet like the dashboard. Modules copied from qvac-dashboard at the start (stream, queue, voice, i18n, agent store, redaction) rather than imported, so the two can evolve apart; what proves common moves to a shared package later.

Phone: v0.1 is the web page with the camera input, installable as a PWA (manifest, icon, offline shell). A native capture app with the QVAC SDK on the phone itself is the step after, once ingestion is solid on the server.

## 9. Not a medical device, on purpose

The product reads, files, searches, charts and explains the family's own documents. It does not interpret symptoms, does not suggest diagnoses, treatments or dosages, does not compute risk scores, and does not generate alerts from values. The "explain" feature describes what a document says and what questions to ask; its prompt forbids recommendations, and its output always sits next to the source and under the fixed line that the doctor decides. The reminders repeat what a prescription or a letter says, with the document cited. These are design constraints checked by tests (prompt content, refusal of "what should I take" questions with a redirect to the doctor, no outbound calls), and they are what keeps the product outside the medical-device definitions (MDR Art. 2, the AI Act's high-risk annexes) while giving the family most of the value. A page in the README says this in plain words, because it is also the most honest thing one can publish about a tool like this.

## 10. Measurements (qvac-lab style)

- **Extraction accuracy** on a synthetic corpus (section 12): per field (date, kind, person, issuer) and per lab value (name, value, unit, range), exact match; per page and per document; time per page and VRAM, Qwen3.5-4B alone vs with the JSON repair pass. Target for v0.1: 95 % of values exact on clean scans, measured, not assumed.
- **Retrieval**: 40 questions in Italian with a known answer document; hit in top 8, and whether the answer cites the right document.
- **Explain**: 20 synthetic reports, MedPsy vs Qwen3.5-4B vs Qwen3.6-35B in Italian and English, rated blind by the author on four points (correct, plain, cites the document, no advice). This is the first external measurement of MedPsy in a non-English language.
- **Load**: two people uploading while a third asks, on the same queue.
- Everything one run, orders of magnitude, in `MEASUREMENTS.md`, the same honesty as the rest.

## 11. Milestones

1. **M1, ingestion (weeks 1–2):** capture, reading, review, filing; the synthetic corpus and the extraction measurement; the person and timeline pages. Demo: photograph a (fictional) lab report with the phone, see it read and filed.
2. **M2, finding (week 3):** values table and charts, Ask with citations, voice.
3. **M3, understanding (week 4):** MedPsy explain with the measurement, reminders from documents, export for the doctor, the README page on scope.
4. **Later:** per-person access and adult-only sections, encrypted backup, HEIC on the phone, the native capture app, delegated inference so a phone away from home can still ask through the mesh.

## 12. Synthetic data

A generator (`scripts/make-corpus.mjs`) writes a fictional family (surname and names invented, no real issuer names: "Laboratorio Analisi Demo", "Studio Pediatrico Esempio") with two years of documents in Italian, some French: lab reports with plausible analytes and a slow trend (so charts have a story), paediatric letters, a vaccination card, two prescriptions, one imaging report, invoices from the health insurer and a lab, an insurance policy with its coverage table. Rendered to PDF with reportlab in a few layouts, then to images with a little rotation, blur and shadow, as phone photos. Ground truth kept in JSON next to each file. Public demos use only this corpus.

## 13. Decisions (18 November 2026)

- Name: **HealthFile**.
- Scope of documents: everything medical the family keeps, from prescriptions and invoices to diagnoses, insurance policies and reports. `kind` therefore also has `insurance` (policies, coverage letters, reimbursement statements) and the invoice is a first-class kind, not a decoy.
- One public repository, `cloudeeo/healthfile`, with the synthetic corpus committed.
- MedPsy Q4_K_M downloaded to `~/models` on omen01; the `qwen4b` → MedPsy swap on the GPU is done at M3.
