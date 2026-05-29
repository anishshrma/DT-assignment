require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');

const Account = require('./models/Account');
const Node    = require('./models/Node');

const app  = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load render map once at startup
const renderMap = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'render-map.json'), 'utf8')
);

// Node human-readable names (used when seeding)
const NODE_NAMES = {
  K1:  'Decision-Maker Identification',
  F2:  'Revenue Scale',
  C7:  'Systems Maturity',
  D1:  'KPI Selection',
  D2:  'A-to-B Clarity',
  D3:  'Business Unlock',
  D7:  'Founder Outcome',
  I3:  'Improvement Ownership',
  I9:  'Prior Attempt Learning',
  I12: 'Intervention Type',
};

// Growth Charter markdown template
const TEMPLATE = `# Growth Charter
## {{companyName}}
### Prepared for {{founderName}}, {{founderTitle}}
*{{founderBackground}}*

---

### Company Snapshot

{{companyName}} is a {{businessDescription}}.

| | |
|---|---|
| **Revenue** | {{revenueRender}} ({{revenueActual}}, {{revenueSource}}) |
| **Systems** | {{systemsRender}}. *{{systemsDetail}}* |

---

### Growth Ambition

{{companyName}}'s highest-leverage growth opportunity is **{{kpiRender}}**.

**Where we are today:**
{{abClarityRender}}
- **Current:** {{currentValue}}
- **Target:** {{targetValue}}

**What this unlocks:**
{{unlockRender}}

---

### What This Means for {{founderName}}

{{outcomeRender}}

---

### The Execution Gap

**Who should own this improvement:**
{{ownershipRender}}

**What broke in previous attempts:**
{{priorAttemptRender}}

**What type of intervention is needed:**
{{interventionRender}}

---

### The Founder's Voice

{{verbatimTable}}

---

*Growth Charter generated from CRM nodes | {{companyName}} | {{generatedDate}}*
`;

// ─── Render helpers ───────────────────────────────────────────────────────────

function getRender(nodeId, value) {
  const node = renderMap[nodeId];
  if (!node) return `[missing render map for ${nodeId}]`;
  return node[String(value)] || `[no entry for ${nodeId} value ${value}]`;
}

function buildVerbatimTable(founderName, nodes) {
  const rows = nodes
    .filter(n => n.verbatim && n.verbatim.quote && n.verbatim.interpretation)
    .map(n => `| "${n.verbatim.quote}" | ${n.verbatim.interpretation} |`)
    .join('\n');

  if (!rows) return '_No verbatim quotes recorded._';

  return `| What ${founderName} Said | What It Means |\n|---|---|\n${rows}`;
}

function renderCharter(account, nodes) {
  // Index nodes by nodeId for easy lookup
  const n = {};
  nodes.forEach(node => { n[node.nodeId] = node; });

  // Build verbatim table first (before main regex, to avoid nested {{ issues)
  const founderName = (n.K1 && n.K1.companion && n.K1.companion.name) || 'the founder';
  const verbatimTable = buildVerbatimTable(founderName, nodes);

  const placeholders = {
    companyName:       account.companyName,
    businessDescription: account.businessDescription || '',
    founderName,
    founderTitle:      (n.K1 && n.K1.companion && n.K1.companion.title)      || '',
    founderBackground: (n.K1 && n.K1.companion && n.K1.companion.background) || '',
    revenueRender:     n.F2  ? getRender('F2',  n.F2.value)  : '',
    revenueActual:     (n.F2  && n.F2.companion  && n.F2.companion.actualRevenue)  || '',
    revenueSource:     (n.F2  && n.F2.companion  && n.F2.companion.revenueSource)  || '',
    systemsRender:     n.C7  ? getRender('C7',  n.C7.value)  : '',
    systemsDetail:     (n.C7  && n.C7.companion  && n.C7.companion.systemsInUse)   || '',
    kpiRender:         n.D1  ? getRender('D1',  n.D1.value)  : '',
    abClarityRender:   n.D2  ? getRender('D2',  n.D2.value)  : '',
    currentValue:      (n.D2  && n.D2.companion  && n.D2.companion.currentValue)   || '',
    targetValue:       (n.D2  && n.D2.companion  && n.D2.companion.targetValue)    || '',
    unlockRender:      n.D3  ? getRender('D3',  n.D3.value)  : '',
    outcomeRender:     n.D7  ? getRender('D7',  n.D7.value)  : '',
    ownershipRender:   n.I3  ? getRender('I3',  n.I3.value)  : '',
    priorAttemptRender: n.I9 ? getRender('I9',  n.I9.value)  : '',
    interventionRender: n.I12? getRender('I12', n.I12.value) : '',
    generatedDate:     new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
    verbatimTable,
  };

  // Replace {{verbatimTable}} first to avoid any {{ in quotes being caught
  let rendered = TEMPLATE.replace('{{verbatimTable}}', placeholders.verbatimTable);

  // Replace all other {{placeholder}} tokens
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(placeholders, key)
      ? placeholders[key]
      : match;
  });

  return rendered;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// List all accounts (for the dropdown)
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find({}, 'companyName').sort({ companyName: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Render the Growth Charter for one account
app.get('/api/charter/:accountId', async (req, res) => {
  try {
    const account = await Account.findById(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const nodes = await Node.find({ accountId: account._id });
    const charter = renderCharter(account, nodes);

    res.json({ charter, companyName: account.companyName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed the database with sample data
app.post('/api/seed', async (req, res) => {
  try {
    const seedData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'seed-data.json'), 'utf8')
    );

    // Upsert account
    let account = await Account.findOne({ companyName: seedData.account.companyName });
    if (!account) {
      account = await Account.create(seedData.account);
    }

    // Upsert each node
    for (const [nodeId, nodeData] of Object.entries(seedData.nodes)) {
      await Node.findOneAndUpdate(
        { accountId: account._id, nodeId },
        {
          accountId: account._id,
          nodeId,
          name:      NODE_NAMES[nodeId] || nodeId,
          value:     nodeData.value,
          companion: nodeData.companion || {},
          verbatim:  nodeData.verbatim  || {},
        },
        { upsert: true, new: true }
      );
    }

    res.json({ message: `Seeded "${account.companyName}" successfully`, accountId: account._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Part B — extract nodes from a transcript via Gemini, save, and return charter
app.post('/api/extract', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript too short or missing' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in .env' });
  }

  const prompt = `You are a CRM analyst for DeepThought, a B2B consulting company that helps manufacturing MSMEs grow. Given a conversation transcript with a company founder, extract values for the following CRM nodes. Each node has 8 possible options — pick the one that best matches what the founder described.

NODES:

D1 — KPI Selection (which number, if it moved, would change their business most):
1. More leads into the pipeline
2. Better conversion rate of leads
3. Revenue per existing customer (upsell)
4. New offerings to existing customers (cross-sell)
5. Customer satisfaction and retention
6. Turnaround time
7. Quality and compliance
8. Margins — reducing waste

D2 — A-to-B Clarity (where is the number today, where does it need to be):
1. Both A and B are precise — tracked rigorously, data-backed target
2. A is measured, B is a stretch target
3. A is measured, B is what the market demands
4. A is felt but not tracked — B is clear
5. Both are approximate — a range, not a number
6. A is known, B depends on what's realistic
7. B defined from benchmarks, A is where they fall short
8. First time quantifying this gap

D3 — Business Unlock (what moves if the KPI moves):
1. Revenue crosses a major milestone
2. Growth model starts compounding
3. New market or geography becomes viable
4. Business becomes investable or exit-ready
5. Profitability step-changes
6. Team scales — leadership layer emerges
7. Competitive position locks in
8. Business becomes what the founder envisioned

D7 — Founder Outcome (what changes for the founder personally):
1. Focus on vision and strategy, not daily execution
2. Business runs without me in every room
3. Best people grow into leaders
4. Company proves it can compound
5. Creates something worth more than my time
6. Builds the leadership layer
7. Builds what I originally set out to build
8. Enjoys running the business again

I3 — Improvement Ownership (who should drive this):
1. Dedicated person, no other responsibilities
2. Senior leader carving out time
3. The founder, with a supporting system
4. A small dedicated team
5. Each department head owns their piece
6. Someone external brings structure
7. Right person doesn't exist yet
8. Right person exists but is buried in operations

I9 — Prior Attempt Learning (what broke before):
1. Needed a dedicated person
2. Lacked a method
3. Needed shorter review cycles
4. Needed external structure
5. Lacked founder involvement in reviews
6. Started too large
7. Tracked outcomes not activities
8. First real attempt

I12 — Intervention Type (what kind of fix):
1. Process works, needs tech acceleration
2. Process works, manual bottlenecks
3. Process exists but not delivering
4. Process built for different scale
5. Parts exist, parts missing
6. No designed process — ad-hoc
7. Process hit a ceiling, need new approach
8. Function doesn't exist yet

K1 — Decision-Maker (who is the founder/leader):
Extract name, title, and background if mentioned.

F2 — Revenue Scale:
1. ₹500Cr+  2. ₹200–500Cr  3. ₹100–200Cr  4. ₹50–100Cr
5. ₹25–50Cr  6. ₹10–25Cr  7. Below ₹10Cr  8. Not disclosed
Extract actual revenue if mentioned.

C7 — Systems Maturity:
1. Full ERP integrated  2. ERP in core functions  3. ERP partial
4. Structured but no ERP  5. Piecemeal digital tools  6. Systems planned
7. Founder memory only  8. Actively resistant
Extract specific systems if mentioned.

INSTRUCTIONS:
- For each node, return the option number (1-8) that best matches the transcript
- Include the specific quote that supports your classification
- If a node cannot be determined, set value to null and note "not surfaced"
- For K1, F2, and C7, also extract companion field data
- For D2, extract currentValue and targetValue if mentioned

OUTPUT FORMAT (respond with valid JSON only, no other text, no markdown backticks):
{
  "account": {
    "companyName": "extracted company name",
    "businessDescription": "one-line description of what the company does"
  },
  "nodes": {
    "D1": { "value": 1, "evidence": "quote from transcript" },
    "D2": { "value": 4, "evidence": "quote", "companion": { "primaryMetric": "...", "currentValue": "...", "targetValue": "..." } },
    "D3": { "value": 1, "evidence": "quote" },
    "D7": { "value": 2, "evidence": "quote" },
    "I3": { "value": 8, "evidence": "quote" },
    "I9": { "value": 2, "evidence": "quote" },
    "I12": { "value": 6, "evidence": "quote" },
    "K1": { "value": 3, "companion": { "name": "...", "title": "...", "background": "..." } },
    "F2": { "value": 4, "companion": { "actualRevenue": "...", "revenueSource": "founder-stated" } },
    "C7": { "value": 5, "companion": { "systemsInUse": "..." } }
  }
}

TRANSCRIPT:
${transcript}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(502).json({ error: `Gemini API error: ${errText}` });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip markdown code fences if Gemini wraps the JSON
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Gemini returned non-JSON', raw: rawText });
    }

    // Validate: must have account and at least some nodes
    if (!extracted.account || !extracted.nodes) {
      return res.status(502).json({ error: 'Gemini response missing required fields', raw: rawText });
    }

    // Save to MongoDB
    let account = await Account.findOne({ companyName: extracted.account.companyName });
    if (!account) {
      account = await Account.create(extracted.account);
    }

    for (const [nodeId, nodeData] of Object.entries(extracted.nodes)) {
      if (!nodeData.value) continue; // skip nulls

      const verbatim = nodeData.evidence
        ? { quote: nodeData.evidence, interpretation: '' }
        : {};

      await Node.findOneAndUpdate(
        { accountId: account._id, nodeId },
        {
          accountId: account._id,
          nodeId,
          name:      NODE_NAMES[nodeId] || nodeId,
          value:     nodeData.value,
          companion: nodeData.companion || {},
          verbatim,
        },
        { upsert: true, new: true }
      );
    }

    const nodes   = await Node.find({ accountId: account._id });
    const charter = renderCharter(account, nodes);

    res.json({ charter, companyName: account.companyName, accountId: account._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/growth-charter';
const PORT      = process.env.PORT || 3000;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
