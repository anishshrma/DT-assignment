# Growth Charter Renderer — DT R1 Assignment

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your env file
cp .env.example .env
# Edit .env: add your MONGO_URI and GEMINI_API_KEY

# 3. Start the server (MongoDB must be running)
npm start

# For development with auto-reload:
npm run dev

# 4. Open the app
open http://localhost:3000
```

## Usage

### Part A — Render from seed data
1. Click **Seed sample data** — loads Sureflow Formulations into MongoDB
2. Select the company from the dropdown
3. Click **Generate Charter** — renders the Growth Charter from stored node values

### Part B — Extract from transcript
1. Paste a founder conversation transcript into the text area
2. Click **Extract & Generate Charter**
3. The app sends the transcript to Gemini, extracts node values as JSON, saves to MongoDB, and renders the charter

## How it works

```
Transcript / Seed data
       ↓
MongoDB (accounts + nodes collections)
       ↓
server.js fetches account + all nodes
       ↓
renderCharter() builds placeholder map from node values + companion fields
       ↓
render-map.json converts value (1–8) → narrative text
       ↓
Template regex replaces all {{placeholders}}
       ↓
Markdown charter returned to browser → rendered with marked.js
```

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express app — all routes and rendering logic |
| `models/Account.js` | Mongoose schema for companies |
| `models/Node.js` | Mongoose schema for CRM nodes |
| `data/render-map.json` | All 10 nodes × 8 values → narrative text |
| `data/seed-data.json` | Sureflow Formulations sample data |
| `public/index.html` | Frontend — selector, transcript input, charter viewer |

## Guardrails against AI hallucination (Part B)

1. **Strict JSON-only prompt** — Gemini is instructed to return valid JSON with no preamble or markdown fences. The server strips fences and validates before parsing.
2. **Null handling** — if Gemini returns `null` for a node (transcript doesn't surface it), that node is skipped rather than saved with a bad value.
3. **Value bounds** — Node schema enforces `min: 1, max: 8`. Any out-of-range value from Gemini will be rejected by Mongoose.
4. **Evidence field** — the prompt requires a supporting quote for every classification. This forces the model to ground its answer in the transcript rather than infer freely.
5. **Error surfacing** — if Gemini returns non-JSON or an unexpected shape, the server returns a 502 with the raw text so you can inspect what went wrong.
