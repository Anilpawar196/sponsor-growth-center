# Sponsor Growth Center: RISA Labs Growth APM Assignment

**Author:** P Anil (22BT30021), IIT Kharagpur
**Challenge chosen:** B, Sponsorship Growth (maximise sponsorship cash collected before the festival)
**City:** Bengaluru

**Deliverables**
1. `P_Anil_RISA_Growth_APM_Strategy.pdf`: the 3-slide strategy
2. A working product: analytics dashboard, campaign/pipeline/task management, and an embedded AI Growth Analyst (this repo, deployed on Vercel)
3. This README

---

## 1. Summary

The 2025 data has a clear story. **All 24 confirmed partnerships (₹22.4L, of which ₹20.0L cash) came from warm and inbound channels**: partner introductions, creator referrals and the partner interest form. Cold email, LinkedIn and dormant-revival outreach reached 148 brands with 322 sends and closed **zero**. Their 26 open deals (₹14.4L face value) stalled for weeks.

My 2026 plan moves the team's effort onto those warm channels, adds a renewal stream (24 existing partners), and time-boxes one high-upside title-sponsor bet:

| | 2025 actual | 2026 base | 2026 stretch |
|---|---|---|---|
| Signed deals | 24 | ~50 | ~75 |
| Signed value | ₹22.4L | ₹48.3L | ₹80.6L |
| Cash signed | ₹20.0L | ₹43.0L | ₹72.5L |
| **Cash collected before the fest** | not recorded | **₹36.6L** | **₹66.7L** |

### What makes this submission different
1. **The alert rules are backtested.** The app replays its own scale/change/stop rules at each of 13 weekly reviews in 2025, using only data available on each date. They flag cold email on **3 Feb** (leading indicator) and stop it on **17 Feb**. **218 of the 322 cold sends** happened after the flag, and the 14 deals they opened closed **0**. Creator referrals showed "lean scale" on 3 Feb. (*Replay & 2026 plan* tab)
2. **Leading and lagging indicators, with a cohort fix.** Judging a channel by "brands reached → confirmed" punishes fast-growing channels, because deals take ~15 days to close. So the lagging rule only judges brands **≥21 days past first touch**, and the meeting rate acts as the leading signal before that. The replay also shows an honest limit: meeting rate caught cold email, but LinkedIn and Revival had decent meeting rates that never converted.
3. **A live plan simulator** for the Slide 1 model, anchored to 2025 rates computed from the data, with a sensitivity ranking. Key insight: **+5 points of pre-fest collection adds ₹2.15L, more than +10% on any single acquisition channel.** The chatbot can run what-ifs on it.
4. **A grounding check on every chatbot answer.** Each number in the reply is traced back to the tool results for that turn, and any number that can't be traced is flagged.
5. **A built-in AI self-test.** 12 trap questions (exact counts, past snapshots, ties, simulated-spend honesty, "did the activation increase attendance?", "how much cash was received?"). Expected answers are recomputed from the **current** data, so it still works after reviewers change the data.

---

## 2. Why Bengaluru

The sponsor pool in the data is startups and consumer brands: consumer products, F&B, mobility, education and media. Bengaluru has the deepest pool of those brands. The *Bengaluru Innovation Report 2026* (KDEM, 3one4 Capital, Tracxn data) reports ~3,810 active funded startups since 2010, nearly 2× Mumbai's 1,982, and 57 unicorns, about 44% of India's total. In practice that means more marketing budgets aimed at students, more alumni founders who can make warm intros, and a large student audience to sell.

Sources: [The South First, Bengaluru Innovation Report 2026](https://thesouthfirst.com/karnataka/bengaluru-consolidates-position-as-indias-ai-capital-dominates-funding/), [YourStory, Bengaluru Innovation Report 2026](https://yourstory.com/2026/11/bengaluru-leads-india-in-ai-startup-funding-innovation-report-2026).

---

## 3. Data: what I used and how I cleaned it

**Source:** RISA *Sponsor Dataset.xlsx*, a synthetic dataset for "CampusFest 2025" (event 12–13 Apr 2025, records 15 Jan to 20 Apr 2025). It has 10 data sheets: Event, Targets, Brands (180), Sponsor contacts (270), Sponsor campaigns (6), Sponsor interactions (953 rows), Brand qualification history (434), Partner opportunities (58), Opportunity history (230) and Sponsor activations (3). It's converted, unchanged, to `data/source.json`.

**Cleaning rules.** These follow the dataset's own *Read me* and *Field guide*, and the engine (`engine.js`) applies them live every time:

| Rule | Implementation |
|---|---|
| Import retries repeat rows with the same stable ID | Rows with an identical ID **and** identical payload are dropped: 3 interactions, 1 qualification version, 2 opportunity versions. Same ID with a different payload is kept and flagged; there are none in the source. |
| A selected date means end of that day in IST | Cut-off = `YYYY-MM-DDT23:59:59.999+05:30` |
| Histories are full-state versions | Latest version ≤ cut-off per brand or opportunity. History states are never summed. |
| No future leakage | Records created, events occurring and versions effective after the cut-off are excluded. Re-checked: as of 1 Mar the dashboard shows 10 confirmed and 40 qualified, under the *launch* plan targets (40 / 20). |
| Different populations | Attempts ≠ contacts ≠ brands reached ≠ replying brands ≠ qualified brands ≠ opportunities ≠ confirmed partnerships. Each one is counted separately. |
| Join on IDs, not names | Three different contacts are all named "Meera Rao", and one brand (Beardo) has 2 opportunities, so all joins use IDs. |
| Planned ≠ actual | Campaign planned dates are never used as activity. |
| Reported value ≠ cash | `confirmed_value_inr` is shown as "confirmed value". **Cash collected only counts payments logged in the app.** The source has no receipts. |
| Activations ≠ uplift | Activations are shown as associations only. |

**Key facts as of 20 Apr 2025 (source data):**
- Funnel: 180 brands reached → 109 replied → 77 positive reply or inbound → 60 meetings held → 60 qualified → 58 opportunities → 46 reached proposal → **24 confirmed**
- Targets: revised plan (effective 15 Mar) = 55 qualified / 28 confirmed. Actual 60 (109%) / 24 (85.7%).
- Value: ₹22.4L confirmed (₹20.0L cash across 20 deals, ₹2.4L in-kind across 4). Median deal ₹92.5K, max ₹2.0L.
- Cycle: first touch → opportunity ≈ 5 days (median). Opportunity → confirmed ≈ 10 days. Negotiating → confirmed 24/39 = 62%.
- Cobalt Learning signed ₹80K on 25 Feb and **withdrew** on 20 Mar. This is the evidence that signed ≠ cash.
- One owner (Kabir Shah) held 126 of 180 target brands, mostly in the cold email campaign.

| Campaign | Attempts | Brands reached | Meetings (brands) | Qualified | Opps | Confirmed | Value |
|---|---|---|---|---|---|---|---|
| Warm Partner Introductions | 9 | 8 | 8 | 8 | 9 | 8 | ₹7.85L |
| Creator Network Referrals | 21 | 19 | 15 | 15 | 9 | 9 | ₹7.85L |
| Partner Interest Form | 18 | 17 | 13 | 13 | 7 | 7 | ₹6.70L |
| Brand Discovery Email | 224 | 91 | 7 | 7 | 11 | 0 | ₹0 |
| Brand Leader LinkedIn | 54 | 37 | 10 | 10 | 12 | 0 (1 withdrawn) | ₹0 |
| Past Conversation Revival | 44 | 20 | 7 | 7 | 10 | 0 | ₹0 |

---

## 4. Slide 1 model: detailed calculations

Funnel per stream: **prospects × conversation % × proposal % × sign % = signed deals; × average deal = signed value.**

**Base case**

| Stream | Prospects | Conv. | Proposal | Sign | End-to-end | Signed | Avg deal | Signed value |
|---|---|---|---|---|---|---|---|---|
| Renewals & upsell (2025 partners) | 24 | 80% | 75% | 75% | 45.0% | 10.8 | ₹1,05,000 | ₹11,34,000 |
| Warm alumni/partner intros | 25 | 85% | 85% | 80% | 57.8% | 14.5 | ₹95,000 | ₹13,72,750 |
| Creator & community referrals | 35 | 70% | 65% | 75% | 34.1% | 11.9 | ₹85,000 | ₹10,15,219 |
| Inbound page + startup events | 40 | 70% | 55% | 75% | 28.9% | 11.6 | ₹90,000 | ₹10,39,500 |
| Title-sponsor ABM | 30 | 30% | 40% | 25% | 3.0% | 0.9 | ₹3,00,000 | ₹2,70,000 |
| **Total** | **154** | | | | | **49.6** | | **₹48,31,469** |

- Cash share 89% (2025: ₹20.0L cash ÷ ₹22.4L total) → cash signed ₹43,00,007
- Collection before the festival 85% *(assumption)* → **₹36,55,006 ≈ ₹36.6L**

**Stretch case:** renewals 24 × 85/85/85% × ₹1.2L; intros 30 × 90/85/85% × ₹1.0L; referrals 45 × 75/70/80% × ₹90K; inbound 55 × 75/60/80% × ₹95K; ABM 40 × 35/45/30% × ₹4L. That gives signed value ₹80,57,430 × 90% cash = ₹72,51,687 × 92% collection = **₹66,71,552**.

**How the rates were chosen**
- Warm intros: 2025 rate was 8/8 brands = 100%. Modelled at 58%, a ~40% haircut for the small sample and lower quality as volume doubles.
- Creator referrals: 9/19 = 47% → modelled 34%. Partner form: 7/17 = 41% → 29%.
- Cold channels: 0/148 → title ABM modelled at only 3% (base), and it's treated as an option bet.
- Renewals: **no renewal history exists in the data.** 45% is my assumption, based on my own sponsorship experience (SPICMACAY, IIT KGP) and the fact that the 2025 partners already know the event.
- Deal sizes are anchored on the 2025 average (₹93K) and median (₹92.5K). Renewals and title deals carry assumed tier uplifts.

**Capacity check.** Base needs ~102 conversations and ~67 proposals, about 1.5–1.7× 2025's 60 meetings and 46 proposals. That's feasible if the cold-email capacity is redeployed.

**Timeline.** Opportunity → signed takes ~10 days, plus invoicing. The last deals must sign by about T-18 days for cash to land before the fest.

---

## 5. Prioritisation framework (Slide 2)

**Score = expected base ₹ collected × evidence confidence ÷ team effort (weeks)**
- Confidence: high = proven in 2025 data; medium = analogous evidence; low = untested.

| Rank | Bet | Base ₹ collected (stretch) | Evidence confidence | Call |
|---|---|---|---|---|
| 1 | Warm intro engine | ₹10.4L (₹16.2L) | High (8/8 in 2025) | Double down |
| 2 | Renewals & upsell | ₹8.6L (₹14.6L) | Medium (no renewal data), cheapest and earliest cash | Double down |
| 3 | Creator referral program (5% success fee) | ₹7.7L (₹14.1L) | High (47%) | Scale |
| 4 | Inbound magnet (page + startup meetups) | ₹7.9L (₹15.6L) | Medium-high (41%, low volume) | Scale if ≥4 leads/week |
| 5 | Title-sponsor ABM | ₹2.0L (₹6.3L) | Low (cold = 0% in 2025) | Time-box, gate on 28 Feb |

**Rejected:** mass cold email (224 attempts → 0 deals), dormant revival blasts (44 → 0), paid sponsorship marketplaces (no evidence). Total acquisition budget ₹2.4L *(assumption)*, about 6.6% of base cash.

---

## 6. Experiment thresholds (Slide 3) and the backtest

The per-bet thresholds on Slide 3 are set at about 50–70% of the 2025 rate to scale, and about 25% of it to stop. The app's channel "call" works like this:
- **Lagging** (once ≥8 brands are ≥21 days past first touch; 21 days = first touch→opp ~5 days + opp→signed ~10 days + buffer): **SCALE** if ≥35% of that mature cohort is confirmed · **CHANGE** 15–35% · **STOP** <15%
- **Leading** (before that): **LEAN-SCALE** if meeting rate ≥50% on ≥5 brands · **WARNING** if meeting rate <20% on ≥15 brands · otherwise **NEED-DATA**
- **Stalled deal** = no stage change for ≥14 days

**Backtest** (weekly Monday reviews from 20 Jan, data as of each date only):

| Campaign | First signal | Firm call | Activity after first flag |
|---|---|---|---|
| Brand Discovery Email | WARNING 3 Feb (0% meetings on 22 brands) | STOP 17 Feb | 180 sends, 78 new brands, 8 deals → 0 confirmed |
| Brand Leader LinkedIn | none (meeting rate 27–33%) | STOP 3 Mar | 24 sends, 18 new brands, 4 deals → 0 |
| Past Conversation Revival | none (meeting rate ~40%) | STOP 3 Mar | 14 sends, 5 new brands, 2 deals → 0 |
| Creator Network Referrals | LEAN-SCALE 3 Feb | SCALE 10 Mar | (final 9 confirmed, ₹7.85L) |
| Partner Interest Form | LEAN-SCALE 17 Feb | SCALE 17 Mar | (7 confirmed, ₹6.70L) |
| Warm Partner Introductions | LEAN-SCALE 24 Feb | SCALE 7 Apr | (8 confirmed, ₹7.85L; small sample) |

**Total: 218 of 322 cold sends came after the flag; the 14 deals they opened closed 0.**

---

## 7. The product

### Features
- **Measure:** funnel from brands to confirmed partnerships as of any date; KPI cards against the target version in force; confirmed, cash and in-kind value; cash collected; open pipeline; weekly trend against the dashed goal; a stage-weighted projection using win rates computed from the live data.
- **Diagnose:** channel league table (reply, meeting, qualified, confirmed, brand→partner %, spend, ₹ per partner, oldest stalled deal); alerts for target gaps, stalled deals, zero-yield campaigns, scale candidates, confirmed value with no payment, and overdue tasks. Filters by campaign, industry and owner.
- **Decide:** a rule-based leading/lagging call per campaign (SCALE, LEAN-SCALE, CHANGE, WARNING, STOP), with the reason shown. Every alert has "Ask analyst" and "Create task" shortcuts.
- **Replay & 2026 plan:** the backtest heatmap (call per campaign per weekly review, with hover evidence) and the 2026 plan simulator (presets, editable levers, sensitivity, goal gap; saved).
- **Manage:**
  - campaigns: create, edit status/budget/spend/owner/notes
  - opportunities: update stage/value/owner (saved as a new history version), create new
  - brands: change qualification, log interactions
  - payments: log cash receipts
  - targets: add new versions
  - tasks: kanban board with overdue flags

  Every edit is saved (browser localStorage), written to a change log, and immediately updates all analytics. Edits are stamped at the selected as-of date, so earlier snapshots never change.
- **Data:** import a modified `Sponsor Dataset.xlsx` (same sheets and columns) or a JSON export; export; reset to the original data. Simulated fields (campaign budgets, 4 seed tasks) are tagged `sim` / "simulated" everywhere.

### AI Growth Analyst: architecture
```
Browser (live data in localStorage)                     Vercel function /api/chat
  user question ─────────────────────────────────────▶  Gemini (function calling)
  ◀──── functionCall(name, args) ───────────────────────
  run tool in JS on the CURRENT data (engine.js)
  ── functionResponse(result) ──────────────────────▶   Gemini
  ◀──── final answer text (or more tool calls) ─────────
```
- **Grounded:** the model only sees data returned by tools. There are 14 tools: overview/funnel, campaign performance, breakdowns, stalled deals, trend, brand details, a flexible `query_data` (filter, group, aggregate over 12 cleaned tables), `calculate` (safe arithmetic parser, no `eval`), data dictionary, `get_backtest`, `run_scenario` (plan what-ifs), tasks, and two **propose** tools.
- **Grounding check:** after each answer, every number in the text is matched (within 1.5%, allowing for lakh/K/% formats) against the numbers returned by that turn's tools. The result is shown as "✓ 9/9 numbers traced" or a warning listing the untraced numbers. It's a heuristic, labelled as such.
- **Self-test** (*Data & settings → Run self-test*): 12 questions, each in a fresh conversation, auto-graded against expected values recomputed from the current data.
- **Reliable calculations:** all maths runs in code (engine or `calculate`). The system prompt forbids stating any number that didn't come from a tool.
- **Changed data:** tools run on the live data on every question, so edits and imports are reflected immediately. The prompt tells the model to re-query rather than reuse old numbers.
- **Execution with confirmation:** `propose_task` and `propose_campaign_update` only create a card. Nothing changes until the user clicks **Confirm**, and the confirmation is fed back into the conversation so follow-ups know about it.
- **Uncertainty:** `get_data_dictionary` lists what the data does *not* contain (bank receipts, real spend, causal uplift, loss reasons, renewal history). The analyst is instructed to say "the data can't answer that", explain what's missing, and separate evidence from judgement, especially for small samples.
- **Follow-ups:** the full conversation, including tool results, is kept, so "that campaign" or "those deals" resolve correctly.
- The API key stays on the server (`GEMINI_API_KEY`). The model is tried in order: `GEMINI_MODEL` → `gemini-2.5-flash` → `gemini-flash-latest` → `gemini-2.0-flash`, with retry on 429/5xx.

### Demo workflow (insight → action)
1. Overview shows **24/28 confirmed** and an alert for 26 stalled deals.
2. Ask: *"Why did we miss the confirmed partnerships target?"* The analyst pulls the overview and campaign table and explains that all 24 deals came from warm/inbound channels, cold channels closed 0, and 26 cold-sourced deals are stalled.
3. Follow-up: *"Which of those should we chase first?"* It calls `list_stalled_deals` and ranks by stage and value (e.g. the 8 negotiating deals).
4. *"Create a task for Riya to close or drop the negotiating ones by 25 April."* A proposal card appears → click **Confirm** → the task shows on the Tasks board and the change log.
5. *"How much cash have we actually collected?"* It answers ₹0 logged, explains that confirmed value is not cash and the dataset has no receipts, and suggests logging payments.
6. *"When would we have known cold email was failing?"* It calls `get_backtest`: warning 3 Feb, stop 17 Feb, 180 sends after that.
7. *"What if renewals only convert 30%? Can we still make ₹40L?"* It calls `run_scenario` and returns the new total, the gap, and the cheapest levers to close it.
8. Log a payment or move a deal to confirmed in Pipeline, then ask again. The answer and the dashboard both change.

---

## 8. Setup

### Deploy on Vercel (recommended)
1. Create a free Gemini API key at https://aistudio.google.com/apikey
2. Push this folder to a new GitHub repository (on github.com: *New repository → Add file → Upload files*, and drag in **everything inside this folder**, including the `api` and `data` folders).
3. On https://vercel.com: *Add New → Project → Import* that repository. Framework preset: **Other**. Leave the build settings empty.
4. Under *Environment Variables*, add `GEMINI_API_KEY` = your key. Optionally add `GEMINI_MODEL` (e.g. `gemini-2.5-flash`).
5. Click **Deploy** and open the URL. If you add the key after deploying, use *Redeploy*.

### Run locally
```bash
# Node 18+ required, no npm install needed
GEMINI_API_KEY=your_key node server.js      # Windows PowerShell: $env:GEMINI_API_KEY="your_key"; node server.js
# open http://localhost:3000
```

### Files
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | UI, management actions, persistence, AI analyst client and tools |
| `engine.js` | Pure analytics engine (cleaning, as-of snapshots, funnel, campaigns, trend, breakdowns, query, calculator) |
| `api/chat.js` | Vercel serverless proxy to Gemini (holds the key) |
| `server.js` | Zero-dependency local server |
| `data/source.json` | The original sponsor dataset, converted 1:1 from the xlsx |

---

## 9. Testing done
- **Engine numbers vs an independent pandas analysis** of the xlsx: funnel, targets, value, per-campaign table, stalled deals and as-of snapshots all match exactly. Examples: 24 confirmed, ₹22.4L, 60 qualified, 26 stalled; on 1 Mar, 10 confirmed / 40 qualified under the launch plan.
- **Headless-browser end-to-end tests** (Playwright + Chrome) with a mocked model:
  - every tab renders with no console errors
  - moving a deal to confirmed changes 24 → 25 everywhere
  - logging a payment updates cash collected
  - all changes survive a reload
  - a past snapshot (1 Mar) is unchanged by later edits
  - campaign status edits work
  - the full chat loop runs: parallel tool calls, a propose → Confirm task creation, and follow-ups
  - the replay, simulator edits and presets, the `run_scenario` tool, the grounding check (it flags an invented number) and the self-test runner all work
- **Backtest verified independently:** the weekly campaign states were recomputed in a separate script and match.
- **Not tested here:** live Gemini responses. The build environment had no internet access, so the model's answer quality has to be checked after deploying with a real key.

## 10. Tools used
- **Claude (Anthropic):** AI assistant used for data analysis, generating the app code, drafting the slides and this README. I reviewed the logic and numbers and own the decisions.
- **Python (pandas):** independent verification of every metric.
- **Google Gemini API:** the in-app AI analyst.
- **Vercel:** hosting. **Google Chrome headless / Playwright:** PDF rendering and UI tests.
- No UI frameworks or templates; charts are hand-written SVG. SheetJS (CDN) is loaded only when importing an xlsx.

## 11. Known limitations
- Data is stored **per browser** (localStorage): edits persist across reloads on the same browser but are not shared between users. A shared database (e.g. Supabase) is the next step.
- Campaign budgets/spend are **simulated** (the source has none), so ₹-per-partner figures are illustrative.
- The projection is a simple stage-weighted model built on a small sample (58 opportunities).
- The 2026 model's renewal rate, collection rate, deal-size uplifts and budgets are assumptions, labelled as such. The 2025 data has no renewal or payment history.
- The xlsx import expects the original sheet and column names.
- The AI analyst depends on the Gemini API (free-tier rate limits may apply). LLM answers can still be imperfect, so tool names are shown under every answer for traceability.
