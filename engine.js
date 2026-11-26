/* Growth Center analytics engine — pure functions over the raw source tables.
   Rules (from the dataset's Read me / Field guide):
   - Deduplicate identical rows that share a stable ID (import retries).
   - "As of" a date = end of that day in Asia/Kolkata (23:59:59 +05:30).
   - Histories hold full-state versions: use the latest version <= cut-off per entity; never sum history states.
   - Only events/versions/records that exist at the cut-off count (no future leakage).
   - Outreach attempts, contacts, responding brands, qualified brands and confirmed partnerships are different populations.
   - Confirmed value is a reported INR amount, not proof of cash receipt. Cash collected comes only from the payments log. */
(function (root) {
  'use strict';
  const OPEN_STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating'];
  const STAGE_ORDER = ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn'];
  const PROPOSAL_PLUS = ['proposal_sent', 'negotiating', 'partner_confirmed'];
  const ROOT_EVENTS = ['outreach_sent', 'introduction_received', 'web_inbound'];

  const t = (s) => (s ? Date.parse(s) : NaN);
  const cutoff = (asOf) => Date.parse(asOf + 'T23:59:59.999+05:30');
  const DAY = 86400000;
  const round = (x, d = 1) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
  const pct = (a, b) => (b ? round((100 * a) / b, 1) : null);
  const uniq = (arr) => [...new Set(arr)];
  const istDate = (ms) => new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);

  function dedupe(rows, key) {
    const seen = new Map(); const out = []; let retries = 0; const conflicts = [];
    for (const r of rows || []) {
      const id = r[key];
      if (id == null) { out.push(r); continue; }
      const sig = JSON.stringify(r);
      if (seen.has(id)) {
        if (seen.get(id).includes(sig)) { retries++; continue; }
        conflicts.push(id); seen.get(id).push(sig); out.push(r); continue;
      }
      seen.set(id, [sig]); out.push(r);
    }
    return { rows: out, retries, conflicts };
  }

  // Build a cleaned, indexed view of the database. Memoised on db.rev.
  const cache = new WeakMap();
  function clean(db) {
    const c = cache.get(db);
    if (c && c.rev === db.rev) return c;
    const s = db.source;
    const di = dedupe(s.interactions, 'interaction_id');
    const dq = dedupe(s.qualification_history, 'history_id');
    const doh = dedupe(s.opportunity_history, 'history_id');
    const out = {
      rev: db.rev,
      event: s.event[0],
      targets: [...s.targets].sort((a, b) => t(a.effective_at) - t(b.effective_at)),
      brands: s.brands, contacts: s.contacts, campaigns: s.campaigns,
      interactions: di.rows, qual: dq.rows, oppHist: doh.rows,
      opps: s.opportunities, activations: s.activations || [],
      quality: { interaction_retries_removed: di.retries, qualification_retries_removed: dq.retries, opportunity_history_retries_removed: doh.retries,
        conflicting_ids: [...di.conflicts, ...dq.conflicts, ...doh.conflicts] },
    };
    out.brandById = new Map(out.brands.map((b) => [b.brand_id, b]));
    out.campById = new Map(out.campaigns.map((x) => [x.sponsor_campaign_id, x]));
    out.oppById = new Map(out.opps.map((o) => [o.opportunity_id, o]));
    out.contactById = new Map(out.contacts.map((x) => [x.contact_id, x]));
    cache.set(db, out);
    return out;
  }

  function latestBy(rows, key, cut) {
    const m = new Map();
    for (const r of rows) {
      const e = t(r.effective_at); if (!(e <= cut)) continue;
      const p = m.get(r[key]);
      if (!p || e > t(p.effective_at) || (e === t(p.effective_at) && String(r.history_id) > String(p.history_id))) m.set(r[key], r);
    }
    return m;
  }

  function teamMap(db) {
    const c = clean(db); const m = {};
    for (const r of [...c.brands, ...c.campaigns, ...c.oppHist]) if (r.owner_id && r.owner_name) m[r.owner_id] = r.owner_name;
    for (const r of db.app.team || []) m[r.owner_id] = r.owner_name;
    return m;
  }

  function meta(db, id) { return (db.app.campaign_meta || {})[id] || {}; }

  // Snapshot: everything as of the cut-off date.
  function snapshot(db, asOf) {
    const c = clean(db); const cut = cutoff(asOf);
    const inter = c.interactions.filter((r) => t(r.occurred_at) <= cut);
    const qualLatest = latestBy(c.qual, 'brand_id', cut);
    const ohLatest = latestBy(c.oppHist, 'opportunity_id', cut);
    const reached = new Map(); // opportunity_id -> set of stages reached so far
    for (const h of c.oppHist) { if (t(h.effective_at) > cut) continue; if (!reached.has(h.opportunity_id)) reached.set(h.opportunity_id, new Set()); reached.get(h.opportunity_id).add(h.stage); }
    const opps = c.opps.filter((o) => t(o.created_at) <= cut).map((o) => {
      const v = ohLatest.get(o.opportunity_id) || {};
      const b = c.brandById.get(o.brand_id) || {};
      const camp = c.campById.get(o.sponsor_campaign_id) || {};
      const stage = v.stage || 'no_history';
      const lastChange = v.effective_at ? t(v.effective_at) : t(o.created_at);
      return {
        opportunity_id: o.opportunity_id, opportunity_name: o.opportunity_name, brand_id: o.brand_id, brand_name: b.brand_name || o.brand_name,
        industry: b.industry || null, campaign_id: o.sponsor_campaign_id, campaign_name: camp.campaign_name || o.originating_campaign_name,
        channel: camp.channel || null, support_type: o.support_type, stage, is_open: OPEN_STAGES.includes(stage),
        proposed_value_inr: v.proposed_value_inr ?? null, confirmed_value_inr: stage === 'partner_confirmed' ? (v.confirmed_value_inr || 0) : 0,
        owner_id: v.owner_id || null, owner_name: v.owner_name || null, created_at: o.created_at, last_change_at: v.effective_at || o.created_at,
        days_since_last_change: Math.floor((cut - lastChange) / DAY),
        stages_reached: [...(reached.get(o.opportunity_id) || [])].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)),
        primary_contact_name: o.primary_contact_name,
      };
    });
    const target = c.targets.filter((x) => t(x.effective_at) <= cut).slice(-1)[0] || null;
    const payments = (db.app.payments || []).filter((p) => t(p.received_at) <= cut);
    const brands = c.brands.filter((b) => t(b.created_at) <= cut);
    return { c, cut, asOf, inter, qualLatest, ohLatest, opps, target, payments, brands };
  }

  function applyFilters(S, f = {}) {
    const { c } = S;
    const brandOk = (id) => { const b = c.brandById.get(id); if (!b) return !f.industry; return !f.industry || b.industry === f.industry; };
    const inter = S.inter.filter((r) => (!f.campaign_id || r.sponsor_campaign_id === f.campaign_id) && (!f.owner_id || r.owner_id === f.owner_id) && brandOk(r.brand_id));
    const qual = [...S.qualLatest.values()].filter((q) => (!f.campaign_id || q.sponsor_campaign_id === f.campaign_id) && brandOk(q.brand_id) && (!f.owner_id || (c.brandById.get(q.brand_id) || {}).owner_id === f.owner_id));
    const opps = S.opps.filter((o) => (!f.campaign_id || o.campaign_id === f.campaign_id) && (!f.owner_id || o.owner_id === f.owner_id) && brandOk(o.brand_id));
    const brands = S.brands.filter((b) => brandOk(b.brand_id) && (!f.owner_id || b.owner_id === f.owner_id));
    return { inter, qual, opps, brands };
  }

  function stageWinRates(S) {
    // Empirical: of opportunities that have reached stage X (as of cut-off), share whose latest stage is partner_confirmed.
    const res = {};
    for (const st of OPEN_STAGES) {
      const r = S.opps.filter((o) => o.stages_reached.includes(st));
      const w = r.filter((o) => o.stage === 'partner_confirmed').length;
      res[st] = { reached: r.length, confirmed: w, win_rate: r.length ? w / r.length : 0 };
    }
    return res;
  }

  function funnel(db, asOf, f = {}) {
    const S = snapshot(db, asOf); const F = applyFilters(S, f);
    const brandsWith = (pred) => uniq(F.inter.filter(pred).map((r) => r.brand_id)).length;
    const conf = F.opps.filter((o) => o.stage === 'partner_confirmed');
    const open = F.opps.filter((o) => o.is_open);
    const confIds = new Set(conf.map((o) => o.opportunity_id));
    const pays = S.payments.filter((p) => !f.campaign_id || (S.opps.find((o) => o.opportunity_id === p.opportunity_id) || {}).campaign_id === f.campaign_id);
    const collected = pays.reduce((a, p) => a + (+p.amount_inr || 0), 0);
    const wr = stageWinRates(S);
    const projDeals = conf.length + open.reduce((a, o) => a + (wr[o.stage] ? wr[o.stage].win_rate : 0), 0);
    const projValue = conf.reduce((a, o) => a + o.confirmed_value_inr, 0) + open.reduce((a, o) => a + (wr[o.stage] ? wr[o.stage].win_rate : 0) * (o.proposed_value_inr || 0), 0);
    const qualified = F.qual.filter((q) => q.qualification_status === 'qualified').length;
    const statusCounts = {}; F.qual.forEach((q) => (statusCounts[q.qualification_status] = (statusCounts[q.qualification_status] || 0) + 1));
    const stages = {}; F.opps.forEach((o) => (stages[o.stage] = (stages[o.stage] || 0) + 1));
    const roots = F.inter.filter((r) => ROOT_EVENTS.includes(r.event_type));
    const filtered = !!(f.campaign_id || f.owner_id || f.industry);
    const out = {
      as_of: asOf, filters: f,
      steps: [
        { key: 'brands_in_research', label: 'Brands in research', value: filtered && f.campaign_id ? brandsWith(() => true) : F.brands.length },
        { key: 'brands_reached', label: 'Brands reached', value: uniq(roots.map((r) => r.brand_id)).length },
        { key: 'brands_responded', label: 'Brands that replied', value: brandsWith((r) => r.event_type === 'replied') },
        { key: 'brands_positive', label: 'Brands with positive reply / inbound', value: brandsWith((r) => (r.event_type === 'replied' && r.outcome === 'positive') || r.event_type === 'web_inbound') },
        { key: 'brands_meeting_held', label: 'Brands with meeting held', value: brandsWith((r) => r.event_type === 'meeting_held') },
        { key: 'brands_qualified', label: 'Qualified brands (latest status)', value: qualified },
        { key: 'opportunities', label: 'Opportunities created', value: F.opps.length },
        { key: 'proposals', label: 'Opportunities that reached proposal', value: F.opps.filter((o) => o.stages_reached.some((s) => PROPOSAL_PLUS.includes(s))).length },
        { key: 'confirmed', label: 'Confirmed partnerships (latest stage)', value: conf.length },
      ],
      activity: {
        outreach_attempts: uniq(roots.map((r) => r.attempt_id)).length,
        outreach_sent_events: F.inter.filter((r) => r.event_type === 'outreach_sent').length,
        contacts_touched: uniq(F.inter.map((r) => r.contact_id)).length,
        replies: F.inter.filter((r) => r.event_type === 'replied').length,
        positive_replies: F.inter.filter((r) => r.event_type === 'replied' && r.outcome === 'positive').length,
        meetings_booked: F.inter.filter((r) => r.event_type === 'meeting_booked').length,
        meetings_held: F.inter.filter((r) => r.event_type === 'meeting_held').length,
        opt_outs: F.inter.filter((r) => r.event_type === 'opt_out').length,
      },
      qualification_status_counts: statusCounts,
      opportunity_stage_counts: stages,
      value: {
        confirmed_value_inr: conf.reduce((a, o) => a + o.confirmed_value_inr, 0),
        confirmed_cash_value_inr: conf.filter((o) => o.support_type === 'cash').reduce((a, o) => a + o.confirmed_value_inr, 0),
        confirmed_in_kind_value_inr: conf.filter((o) => o.support_type !== 'cash').reduce((a, o) => a + o.confirmed_value_inr, 0),
        open_pipeline_face_value_inr: open.reduce((a, o) => a + (o.proposed_value_inr || 0), 0),
        open_opportunities: open.length,
        cash_collected_inr: collected,
        payments_recorded: pays.length,
        confirmed_deals_with_payment: uniq(pays.filter((p) => confIds.has(p.opportunity_id)).map((p) => p.opportunity_id)).length,
        avg_confirmed_value_inr: conf.length ? Math.round(conf.reduce((a, o) => a + o.confirmed_value_inr, 0) / conf.length) : null,
      },
      target: S.target ? { version: S.target.target_version, effective_at: S.target.effective_at, qualified_brands_goal: S.target.qualified_brands_goal, confirmed_partnerships_goal: S.target.confirmed_partnerships_goal,
        qualified_attainment_pct: pct(qualified, S.target.qualified_brands_goal), confirmed_attainment_pct: pct(conf.length, S.target.confirmed_partnerships_goal),
        qualified_gap: S.target.qualified_brands_goal - qualified, confirmed_gap: S.target.confirmed_partnerships_goal - conf.length } : null,
      projection: { method: 'Stage-weighted: confirmed deals + sum over open deals of the empirical win rate of their current stage (computed from this dataset as of the cut-off). A model estimate, not a fact.',
        projected_confirmed_deals: round(projDeals, 1), projected_confirmed_value_inr: Math.round(projValue),
        stage_win_rates: Object.fromEntries(Object.entries(wr).map(([k, v]) => [k, { ...v, win_rate: round(v.win_rate * 100, 1) + '%' }])) },
    };
    return out;
  }

  const MATURE_DAYS = 21; // first touch -> opportunity ~5d + opportunity -> confirmed ~10d in 2025, plus buffer
  function campaignRecommendation(r) {
    if (r.status === 'stopped') return { call: 'STOPPED', basis: 'team', reason: 'Marked stopped by the team.' };
    if (r.mature_brands >= 8) {
      const conv = r.mature_conversion_pct || 0; const tail = r.open_opportunities ? ` ${r.open_opportunities} open deals (oldest ${r.oldest_open_days}d without change).` : '';
      if (conv >= 35) return { call: 'SCALE', basis: 'lagging', reason: `${conv}% of mature brands (first touched ≥${MATURE_DAYS}d ago, n=${r.mature_brands}) became confirmed partners — above the 35% scale bar.` };
      if (conv >= 15) return { call: 'CHANGE', basis: 'lagging', reason: `${conv}% mature-cohort conversion (n=${r.mature_brands}): between 15% and 35% — fix fit or follow-up before adding volume.` };
      return { call: 'STOP', basis: 'lagging', reason: `${conv}% mature-cohort conversion (n=${r.mature_brands}) — below the 15% stop bar.${tail}` };
    }
    if (r.brands_reached >= 5 && (r.meeting_rate_pct || 0) >= 50) return { call: 'LEAN-SCALE', basis: 'leading', reason: `Leading indicator: ${r.meeting_rate_pct}% of ${r.brands_reached} reached brands already had a meeting (≥50%). Too early for conversion (${r.mature_brands} mature brands).` };
    if (r.brands_reached >= 15 && (r.meeting_rate_pct || 0) < 20) return { call: 'WARNING', basis: 'leading', reason: `Leading indicator: only ${r.meeting_rate_pct}% of ${r.brands_reached} reached brands got a meeting (<20%). Expect weak conversion; test a fix now.` };
    return { call: 'NEED-DATA', basis: 'none', reason: `Only ${r.mature_brands} mature brands and ${r.brands_reached} reached — not enough evidence yet.` };
  }

  function campaignTable(db, asOf) {
    const S = snapshot(db, asOf); const c = S.c;
    const camps = c.campaigns.filter((x) => t(x.created_at) <= S.cut);
    return camps.map((camp) => {
      const id = camp.sponsor_campaign_id; const m = meta(db, id);
      const ii = S.inter.filter((r) => r.sponsor_campaign_id === id);
      const roots = ii.filter((r) => ROOT_EVENTS.includes(r.event_type));
      const bR = uniq(roots.map((r) => r.brand_id)).length;
      const bRep = uniq(ii.filter((r) => r.event_type === 'replied').map((r) => r.brand_id)).length;
      const bPos = uniq(ii.filter((r) => (r.event_type === 'replied' && r.outcome === 'positive') || r.event_type === 'web_inbound').map((r) => r.brand_id)).length;
      const bMeet = uniq(ii.filter((r) => r.event_type === 'meeting_held').map((r) => r.brand_id)).length;
      const q = [...S.qualLatest.values()].filter((x) => x.sponsor_campaign_id === id);
      const op = S.opps.filter((o) => o.campaign_id === id);
      const conf = op.filter((o) => o.stage === 'partner_confirmed');
      const open = op.filter((o) => o.is_open);
      const value = conf.reduce((a, o) => a + o.confirmed_value_inr, 0);
      const firstTouch = new Map(); for (const r of roots) { const tt = t(r.occurred_at); if (!firstTouch.has(r.brand_id) || tt < firstTouch.get(r.brand_id)) firstTouch.set(r.brand_id, tt); }
      const mature = [...firstTouch.entries()].filter(([, tt]) => tt <= S.cut - MATURE_DAYS * DAY).map(([b]) => b);
      const confBrands = new Set(conf.map((o) => o.brand_id)); const matureConf = mature.filter((b) => confBrands.has(b)).length;
      const spent = m.spent_inr ?? null; const budget = m.budget_inr ?? null;
      const r = {
        campaign_id: id, campaign_name: camp.campaign_name, channel: camp.channel, objective: camp.objective, owner_name: m.owner_name || camp.owner_name,
        status: m.status || 'active', planned_start_at: camp.planned_start_at, planned_end_at: camp.planned_end_at,
        budget_inr: budget, spent_inr: spent, budget_source: m.budget_source || (budget == null ? 'not recorded' : 'user-entered'),
        outreach_attempts: uniq(roots.map((r) => r.attempt_id)).length, brands_reached: bR,
        reply_rate_pct: pct(bRep, bR), positive_rate_pct: pct(bPos, bR), meeting_rate_pct: pct(bMeet, bR),
        brands_meeting_held: bMeet,
        qualified_brands: q.filter((x) => x.qualification_status === 'qualified').length,
        dormant_brands: q.filter((x) => x.qualification_status === 'dormant').length,
        unqualified_brands: q.filter((x) => x.qualification_status === 'unqualified').length,
        opportunities: op.length, confirmed: conf.length, confirmed_value_inr: value,
        confirmed_cash_value_inr: conf.filter((o) => o.support_type === 'cash').reduce((a, o) => a + o.confirmed_value_inr, 0),
        lost_or_withdrawn: op.filter((o) => ['lost', 'withdrawn'].includes(o.stage)).length,
        open_opportunities: open.length, open_pipeline_value_inr: open.reduce((a, o) => a + (o.proposed_value_inr || 0), 0),
        oldest_open_days: open.length ? Math.max(...open.map((o) => o.days_since_last_change)) : null,
        brand_to_confirmed_pct: pct(conf.length, bR),
        mature_brands: mature.length, mature_confirmed_brands: matureConf, mature_conversion_pct: pct(matureConf, mature.length),
        cost_per_confirmed_inr: spent != null && conf.length ? Math.round(spent / conf.length) : null,
        cost_per_qualified_inr: spent != null && q.filter((x) => x.qualification_status === 'qualified').length ? Math.round(spent / q.filter((x) => x.qualification_status === 'qualified').length) : null,
        notes: m.notes || '',
      };
      r.recommendation = campaignRecommendation(r);
      return r;
    });
  }

  function stalled(db, asOf, days = 14) {
    const S = snapshot(db, asOf);
    return S.opps.filter((o) => o.is_open && o.days_since_last_change >= days).sort((a, b) => b.days_since_last_change - a.days_since_last_change);
  }

  function trend(db, asOf, everyDays = 7) {
    const c = clean(db); const start = Date.parse(c.event.history_start + 'T12:00:00+05:30'); const end = cutoff(asOf);
    const pts = []; let d = start;
    while (d < end) { pts.push(istDate(d)); d += everyDays * DAY; }
    pts.push(asOf);
    return uniq(pts).map((day) => {
      const f = funnel(db, day);
      const g = Object.fromEntries(f.steps.map((s) => [s.key, s.value]));
      return { date: day, qualified: g.brands_qualified, confirmed: g.confirmed, meetings_brands: g.brands_meeting_held, opportunities: g.opportunities,
        confirmed_value_inr: f.value.confirmed_value_inr, cash_collected_inr: f.value.cash_collected_inr,
        qualified_goal: f.target ? f.target.qualified_brands_goal : null, confirmed_goal: f.target ? f.target.confirmed_partnerships_goal : null };
    });
  }

  function breakdown(db, asOf, dimension) {
    const S = snapshot(db, asOf); const c = S.c; const team = teamMap(db);
    const keyOfBrand = (bid) => { const b = c.brandById.get(bid) || {}; return dimension === 'industry' ? b.industry : dimension === 'owner' ? team[b.owner_id] || b.owner_id : null; };
    const groups = {};
    const g = (k) => (groups[k ?? 'unknown'] ||= { group: k ?? 'unknown', brands_reached: new Set(), brands_meeting_held: new Set(), qualified_brands: 0, opportunities: 0, confirmed: 0, confirmed_value_inr: 0, open_pipeline_value_inr: 0 });
    for (const r of S.inter) {
      const k = dimension === 'channel' ? r.channel : dimension === 'campaign' ? (c.campById.get(r.sponsor_campaign_id) || {}).campaign_name : dimension === 'owner' ? team[r.owner_id] || r.owner_id : keyOfBrand(r.brand_id);
      if (dimension === 'support_type') continue;
      if (ROOT_EVENTS.includes(r.event_type)) g(k).brands_reached.add(r.brand_id);
      if (r.event_type === 'meeting_held') g(k).brands_meeting_held.add(r.brand_id);
    }
    for (const q of S.qualLatest.values()) {
      if (q.qualification_status !== 'qualified' || dimension === 'support_type') continue;
      const k = dimension === 'channel' ? (c.campById.get(q.sponsor_campaign_id) || {}).channel : dimension === 'campaign' ? (c.campById.get(q.sponsor_campaign_id) || {}).campaign_name : keyOfBrand(q.brand_id);
      g(k).qualified_brands++;
    }
    for (const o of S.opps) {
      const k = dimension === 'channel' ? o.channel : dimension === 'campaign' ? o.campaign_name : dimension === 'support_type' ? o.support_type : dimension === 'owner' ? o.owner_name : o.industry;
      const x = g(k); x.opportunities++; if (o.stage === 'partner_confirmed') { x.confirmed++; x.confirmed_value_inr += o.confirmed_value_inr; } if (o.is_open) x.open_pipeline_value_inr += o.proposed_value_inr || 0;
    }
    return Object.values(groups).map((x) => ({ ...x, brands_reached: x.brands_reached.size, brands_meeting_held: x.brands_meeting_held.size,
      brand_to_confirmed_pct: dimension === 'support_type' ? null : pct(x.confirmed, x.brands_reached.size) })).sort((a, b) => b.confirmed_value_inr - a.confirmed_value_inr);
  }

  function brandDetails(db, asOf, nameOrId) {
    const S = snapshot(db, asOf); const c = S.c; const q = String(nameOrId || '').trim().toLowerCase();
    const matches = c.brands.filter((b) => b.brand_id.toLowerCase() === q || b.brand_name.toLowerCase() === q);
    const fuzzy = matches.length ? matches : c.brands.filter((b) => b.brand_name.toLowerCase().includes(q));
    if (!fuzzy.length) return { found: false, message: `No brand matches "${nameOrId}" in the data.` };
    if (fuzzy.length > 1 && !matches.length) return { found: false, ambiguous: true, candidates: fuzzy.slice(0, 15).map((b) => b.brand_name) };
    const b = fuzzy[0];
    if (t(b.created_at) > S.cut) return { found: false, message: `${b.brand_name} was not in the data yet as of ${asOf}.` };
    return {
      found: true, brand: b,
      contacts: c.contacts.filter((x) => x.brand_id === b.brand_id && t(x.created_at) <= S.cut).map((x) => ({ contact_id: x.contact_id, contact_name: x.contact_name, job_title: x.job_title })),
      latest_qualification: S.qualLatest.get(b.brand_id) || null,
      qualification_history: c.qual.filter((x) => x.brand_id === b.brand_id && t(x.effective_at) <= S.cut).sort((a, b2) => t(a.effective_at) - t(b2.effective_at)).map((x) => ({ effective_at: x.effective_at, status: x.qualification_status, reason: x.reason, source_campaign: x.source_campaign_name })),
      interactions: S.inter.filter((x) => x.brand_id === b.brand_id).sort((a, b2) => t(a.occurred_at) - t(b2.occurred_at)).map((x) => ({ occurred_at: x.occurred_at, contact: x.contact_name, campaign: x.campaign_name, event: x.event_type, outcome: x.outcome, summary: x.summary })),
      opportunities: S.opps.filter((o) => o.brand_id === b.brand_id),
      activations: c.activations.filter((a) => a.brand_id === b.brand_id && t(a.linked_at) <= S.cut),
      payments: S.payments.filter((p) => S.opps.some((o) => o.opportunity_id === p.opportunity_id && o.brand_id === b.brand_id)),
    };
  }

  // Generic, as-of-aware table access for questions the fixed reports don't cover.
  function tableRows(db, asOf, table) {
    const S = snapshot(db, asOf); const c = S.c; const team = teamMap(db);
    switch (table) {
      case 'brands': return S.brands.map((b) => { const q = S.qualLatest.get(b.brand_id); return { ...b, owner_name: team[b.owner_id] || b.owner_name, latest_qualification_status: q ? q.qualification_status : null, latest_qualification_source_campaign: q ? q.source_campaign_name : null }; });
      case 'contacts': return c.contacts.filter((x) => t(x.created_at) <= S.cut);
      case 'campaigns': return campaignTable(db, asOf).map((r) => ({ ...r, recommendation: r.recommendation.call }));
      case 'interactions': return S.inter.map((r) => ({ ...r, industry: (c.brandById.get(r.brand_id) || {}).industry }));
      case 'qualification_history': return c.qual.filter((x) => t(x.effective_at) <= S.cut);
      case 'qualification_latest': return [...S.qualLatest.values()].map((q) => ({ ...q, industry: (c.brandById.get(q.brand_id) || {}).industry }));
      case 'opportunities': return S.opps.map((o) => ({ ...o, stages_reached: o.stages_reached.join('>') }));
      case 'opportunity_history': return c.oppHist.filter((x) => t(x.effective_at) <= S.cut);
      case 'activations': return c.activations.filter((a) => t(a.linked_at) <= S.cut);
      case 'tasks': return db.app.tasks || [];
      case 'payments': return S.payments;
      case 'targets': return c.targets;
      default: return null;
    }
  }

  function matchFilter(row, f) {
    const v = row[f.field]; const x = f.value; const op = f.op || 'eq';
    const num = (z) => (typeof z === 'number' ? z : parseFloat(z));
    switch (op) {
      case 'eq': return String(v ?? '').toLowerCase() === String(x ?? '').toLowerCase();
      case 'neq': return String(v ?? '').toLowerCase() !== String(x ?? '').toLowerCase();
      case 'contains': return String(v ?? '').toLowerCase().includes(String(x ?? '').toLowerCase());
      case 'in': return (Array.isArray(x) ? x : String(x).split(',')).map((s) => String(s).trim().toLowerCase()).includes(String(v ?? '').toLowerCase());
      case 'gt': return num(v) > num(x); case 'gte': return num(v) >= num(x);
      case 'lt': return num(v) < num(x); case 'lte': return num(v) <= num(x);
      case 'before': return t(v) < t(x); case 'after': return t(v) > t(x);
      case 'is_null': return v == null || v === ''; case 'not_null': return !(v == null || v === '');
      default: return true;
    }
  }

  function query(db, asOf, q) {
    const rows = tableRows(db, asOf, q.table);
    if (!rows) return { error: `Unknown table "${q.table}". Available: ${TABLES.join(', ')}` };
    if (rows.length) {
      const fields = new Set(Object.keys(rows[0]));
      const bad = [...(q.filters || []).map((f) => f.field), ...(q.group_by || []), ...(q.metrics || []).map((m) => m.field).filter(Boolean)].filter((x) => !fields.has(x));
      if (bad.length) return { error: `Unknown field(s) ${bad.join(', ')} for table ${q.table}.`, available_fields: [...fields] };
    }
    const filtered = rows.filter((r) => (q.filters || []).every((f) => matchFilter(r, f)));
    const metrics = q.metrics && q.metrics.length ? q.metrics : null;
    const agg = (rs) => {
      const o = {};
      for (const m of metrics) {
        const vals = rs.map((r) => r[m.field]).filter((v) => v != null && v !== '');
        const nums = vals.map(Number).filter((v) => isFinite(v));
        const name = m.as || `${m.op}${m.field ? '_' + m.field : ''}`;
        o[name] = m.op === 'count' ? rs.length : m.op === 'count_distinct' ? new Set(vals.map(String)).size : m.op === 'sum' ? nums.reduce((a, b) => a + b, 0)
          : m.op === 'avg' ? (nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length, 2) : null) : m.op === 'min' ? (nums.length ? Math.min(...nums) : null)
          : m.op === 'max' ? (nums.length ? Math.max(...nums) : null) : m.op === 'median' ? (nums.length ? median(nums) : null) : null;
      }
      return o;
    };
    let result;
    if (q.group_by && q.group_by.length) {
      const groups = new Map();
      for (const r of filtered) { const k = JSON.stringify(q.group_by.map((g) => r[g] ?? null)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      result = [...groups.entries()].map(([k, rs]) => ({ ...Object.fromEntries(q.group_by.map((g, i) => [g, JSON.parse(k)[i]])), ...(metrics ? agg(rs) : { count: rs.length }) }));
    } else if (metrics) result = [agg(filtered)];
    else result = filtered.map((r) => (q.fields && q.fields.length ? Object.fromEntries(q.fields.map((f) => [f, r[f]])) : r));
    if (q.sort_by) { const d = q.sort_dir === 'asc' ? 1 : -1; result.sort((a, b) => ((a[q.sort_by] ?? -Infinity) > (b[q.sort_by] ?? -Infinity) ? d : -d)); }
    const limit = Math.min(q.limit || 50, 200);
    return { table: q.table, as_of: asOf, matched_rows: filtered.length, returned: Math.min(result.length, limit), truncated: result.length > limit, rows: result.slice(0, limit) };
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const TABLES = ['brands', 'contacts', 'campaigns', 'interactions', 'qualification_history', 'qualification_latest', 'opportunities', 'opportunity_history', 'activations', 'tasks', 'payments', 'targets'];

  // Safe arithmetic (no eval): + - * / ^ % ( ) and decimals.
  function calculate(expr) {
    const s = String(expr).replace(/,/g, '').replace(/\s+/g, '');
    if (!/^[0-9+\-*/^%().]+$/.test(s)) return { error: 'Only numbers and + - * / ^ % ( ) are allowed.' };
    let i = 0;
    const peek = () => s[i];
    function num() { let st = i; while (/[0-9.]/.test(s[i] || '')) i++; if (st === i) throw new Error('number expected at ' + i); return parseFloat(s.slice(st, i)); }
    function factor() { if (peek() === '-') { i++; return -factor(); } if (peek() === '+') { i++; return factor(); } if (peek() === '(') { i++; const v = expr0(); if (s[i++] !== ')') throw new Error('missing )'); return v; } return num(); }
    function power() { let b = factor(); if (peek() === '^') { i++; return b ** power(); } return b; }
    function term() { let v = power(); while ('*/%'.includes(peek() || 'x')) { const o = s[i++]; const r = power(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
    function expr0() { let v = term(); while ('+-'.includes(peek() || 'x')) { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    try { const v = expr0(); if (i !== s.length) throw new Error('unexpected input at ' + i); return { expression: expr, result: round(v, 6) }; } catch (e) { return { error: e.message }; }
  }

  // Replay the decision rules at every weekly review in the history to see when each campaign would have been called.
  function backtest(db, asOf, everyDays = 7) {
    const c = clean(db); const end = cutoff(asOf || c.event.history_end);
    let d = Date.parse(c.event.history_start + 'T12:00:00+05:30'); while (new Date(d + 5.5 * 3600000).getUTCDay() !== 1) d += DAY; // first Monday
    const reviews = []; for (; d <= end; d += everyDays * DAY) reviews.push(istDate(d));
    const timeline = reviews.map((day) => ({ date: day, calls: Object.fromEntries(campaignTable(db, day).map((r) => [r.campaign_id, { call: r.recommendation.call, basis: r.recommendation.basis, brands: r.brands_reached, meeting_rate_pct: r.meeting_rate_pct, mature: r.mature_brands, mature_conv_pct: r.mature_conversion_pct, confirmed: r.confirmed }])) }));
    const finalT = campaignTable(db, asOf || c.event.history_end);
    const camps = finalT.map((r) => {
      const first = (pred) => { const x = timeline.find((p) => p.calls[r.campaign_id] && pred(p.calls[r.campaign_id])); return x ? x.date : null; };
      const warn = first((k) => ['WARNING', 'STOP'].includes(k.call)); const stop = first((k) => k.call === 'STOP');
      const lean = first((k) => ['LEAN-SCALE', 'SCALE'].includes(k.call)); const scale = first((k) => k.call === 'SCALE');
      const after = (date) => {
        if (!date) return null; const cutD = cutoff(date);
        const ii = c.interactions.filter((x) => x.sponsor_campaign_id === r.campaign_id && t(x.occurred_at) > cutD && t(x.occurred_at) <= end);
        const ops = c.opps.filter((o) => o.sponsor_campaign_id === r.campaign_id && t(o.created_at) > cutD && t(o.created_at) <= end);
        const snap = snapshot(db, asOf || c.event.history_end); const opsNow = snap.opps.filter((o) => ops.some((x) => x.opportunity_id === o.opportunity_id));
        return { outreach_sends_after: ii.filter((x) => x.event_type === 'outreach_sent').length, new_brands_touched_after: uniq(ii.filter((x) => ROOT_EVENTS.includes(x.event_type)).map((x) => x.brand_id)).length,
          meetings_after: ii.filter((x) => x.event_type === 'meeting_held').length, opportunities_created_after: ops.length, of_which_confirmed: opsNow.filter((o) => o.stage === 'partner_confirmed').length,
          confirmed_value_after_inr: opsNow.filter((o) => o.stage === 'partner_confirmed').reduce((a, o) => a + o.confirmed_value_inr, 0), still_open: opsNow.filter((o) => o.is_open).length };
      };
      return { campaign_id: r.campaign_id, campaign_name: r.campaign_name, final_call: r.recommendation.call, final_confirmed: r.confirmed, final_value_inr: r.confirmed_value_inr,
        first_warning_or_stop: warn, first_stop: stop, first_lean_scale_or_scale: lean, first_scale: scale, activity_after_first_warning: after(warn), activity_after_first_stop: after(stop) };
    });
    return { reviews: reviews.length, every_days: everyDays, rules: 'Leading: WARNING if ≥15 brands and meeting rate <20%; LEAN-SCALE if ≥5 brands and meeting rate ≥50%. Lagging (once ≥8 brands are ≥21 days past first touch): SCALE ≥35%, CHANGE 15–35%, STOP <15% mature-cohort conversion.', campaigns: camps, timeline };
  }

  // ---------- 2026 plan / scenario model (Slide 1) ----------
  const PLAN_STREAMS = [
    { key: 'renewals', name: 'Renewals & upsell (2025 partners)', anchor: null },
    { key: 'warm', name: 'Warm alumni/partner intros', anchor: ['SC02'] },
    { key: 'creator', name: 'Creator & community referrals', anchor: ['SC05'] },
    { key: 'inbound', name: 'Inbound partner page + startup events', anchor: ['SC04'] },
    { key: 'abm', name: 'Targeted title-sponsor ABM', anchor: ['SC01', 'SC03', 'SC06'] },
  ];
  const PLAN_PRESETS = {
    base: { cash_share: 0.89, collection: 0.85, streams: { renewals: [24, 0.80, 0.75, 0.75, 105000], warm: [25, 0.85, 0.85, 0.80, 95000], creator: [35, 0.70, 0.65, 0.75, 85000], inbound: [40, 0.70, 0.55, 0.75, 90000], abm: [30, 0.30, 0.40, 0.25, 300000] } },
    stretch: { cash_share: 0.90, collection: 0.92, streams: { renewals: [24, 0.85, 0.85, 0.85, 120000], warm: [30, 0.90, 0.85, 0.85, 100000], creator: [45, 0.75, 0.70, 0.80, 90000], inbound: [55, 0.75, 0.60, 0.80, 95000], abm: [40, 0.35, 0.45, 0.30, 400000] } },
  };
  const LEVERS = ['prospects', 'conversation_rate', 'proposal_rate', 'sign_rate', 'avg_deal_inr'];
  function planFrom(preset) { const p = PLAN_PRESETS[preset] || PLAN_PRESETS.base; return { cash_share: p.cash_share, collection: p.collection, streams: Object.fromEntries(Object.entries(p.streams).map(([k, v]) => [k, Object.fromEntries(LEVERS.map((l, i) => [l, v[i]]))])) }; }
  function evalPlan(plan) {
    const lines = PLAN_STREAMS.map((st) => { const v = plan.streams[st.key]; const conv = v.prospects * v.conversation_rate, prop = conv * v.proposal_rate, signed = prop * v.sign_rate;
      return { key: st.key, stream: st.name, ...v, conversations: round(conv, 1), proposals: round(prop, 1), signed: round(signed, 1), end_to_end_pct: round(100 * v.conversation_rate * v.proposal_rate * v.sign_rate, 1), signed_value_inr: Math.round(signed * v.avg_deal_inr) }; });
    const signedValue = lines.reduce((a, l) => a + l.signed_value_inr, 0); const cash = signedValue * plan.cash_share; const collected = cash * plan.collection;
    return { lines, totals: { prospects: lines.reduce((a, l) => a + l.prospects, 0), conversations: round(lines.reduce((a, l) => a + l.conversations, 0), 1), proposals: round(lines.reduce((a, l) => a + l.proposals, 0), 1), signed: round(lines.reduce((a, l) => a + l.signed, 0), 1), signed_value_inr: signedValue, cash_signed_inr: Math.round(cash), cash_collected_inr: Math.round(collected) } };
  }
  function runScenario(db, plan) {
    const res = evalPlan(plan); const base = res.totals.cash_collected_inr;
    // Sensitivity. The funnel is multiplicative, so +10% on ANY lever of a stream adds the same amount: rank streams, plus the two cash levers.
    const sens = PLAN_STREAMS.map((st) => { const p2 = JSON.parse(JSON.stringify(plan)); p2.streams[st.key].prospects *= 1.1; return { lever: `+10% on any lever of ${st.name} (volume, a conversion rate or deal size)`, delta_cash_collected_inr: evalPlan(p2).totals.cash_collected_inr - base }; });
    { const p2 = { ...plan, collection: Math.min(1, plan.collection + 0.05) }; sens.push({ lever: '+5 pts collection before the fest (e.g. 50% advance at signing)', delta_cash_collected_inr: evalPlan(p2).totals.cash_collected_inr - base }); }
    { const p2 = { ...plan, cash_share: Math.min(1, plan.cash_share + 0.05) }; sens.push({ lever: '+5 pts cash share (fewer in-kind deals)', delta_cash_collected_inr: evalPlan(p2).totals.cash_collected_inr - base }); }
    sens.sort((a, b) => b.delta_cash_collected_inr - a.delta_cash_collected_inr);
    const c = clean(db); const ct = campaignTable(db, c.event.history_end); const f = funnel(db, c.event.history_end);
    const anchors = Object.fromEntries(PLAN_STREAMS.map((st) => { if (!st.anchor) return [st.key, { note: 'No renewal history in the 2025 data — pure assumption.' }]; const rows = ct.filter((r) => st.anchor.includes(r.campaign_id));
      const br = rows.reduce((a, r) => a + r.brands_reached, 0), cf = rows.reduce((a, r) => a + r.confirmed, 0), val = rows.reduce((a, r) => a + r.confirmed_value_inr, 0);
      return [st.key, { campaigns: rows.map((r) => r.campaign_name), brands_reached_2025: br, confirmed_2025: cf, brand_to_confirmed_pct_2025: pct(cf, br), avg_deal_2025_inr: cf ? Math.round(val / cf) : null }]; }));
    return { ...res, assumptions: { cash_share: plan.cash_share, collection_before_fest: plan.collection }, baseline_2025: { confirmed_cash_value_inr: f.value.confirmed_cash_value_inr, confirmed_value_inr: f.value.confirmed_value_inr, confirmed: f.steps.find((x) => x.key === 'confirmed').value },
      multiple_vs_2025_cash: f.value.confirmed_cash_value_inr ? round(res.totals.cash_collected_inr / f.value.confirmed_cash_value_inr, 2) : null, anchors_2025: anchors, sensitivity: sens,
      note: 'Plan model for a 2026 Bengaluru festival. Rates are assumptions anchored on 2025 data (see anchors_2025); this is not observed data.' };
  }

  function dataDictionary(db) {
    const c = clean(db);
    return {
      event: c.event, timezone_rule: 'As-of date = end of that day in Asia/Kolkata. Later records never leak into earlier snapshots.',
      tables: {
        brands: 'Target sponsor brands (industry, owner).', contacts: 'People at brands. Same name ≠ same person (use contact_id).',
        campaigns: 'Sponsor acquisition campaigns (channel, objective, owner, planned dates) + app-managed status/budget.',
        interactions: 'Outreach and response events (outreach_sent, delivered, replied[positive/neutral/not_interested/wrong_contact], meeting_booked, meeting_held, opt_out, introduction_received, web_inbound). Planned dates are not actuals.',
        qualification_history: 'Full-state brand assessments: unreviewed, engaged, qualified, unqualified, dormant. Use latest per brand.',
        opportunities: 'Potential partnerships (cash or in_kind) with originating campaign; latest stage from opportunity_history.',
        activations: 'Links confirmed partnerships to attendee campaigns — association only, NOT causal uplift.',
        tasks: 'App-managed action items.', payments: 'App-managed cash receipts logged by the team (source data has none).', targets: 'Dated target versions (qualified brands goal, confirmed partnerships goal).',
      },
      not_in_data: [
        'Cash actually received / bank receipts (confirmed_value_inr is a reported value, not cash). Only payments logged in this app count as collected.',
        'Real 2025 marketing spend per campaign (budgets shown are simulated or user-entered and flagged as such).',
        'Causal impact of sponsor activations on attendees.', 'Reasons for lost deals beyond stage labels; deal-level contract terms; sponsor satisfaction or renewal history.',
        'Anything about 2026 Bengaluru plans beyond the strategy assumptions (that is a plan, not data).',
      ],
      data_quality: c.quality,
    };
  }

  const api = { PLAN_STREAMS, PLAN_PRESETS, LEVERS, planFrom, runScenario, backtest, MATURE_DAYS, OPEN_STAGES, STAGE_ORDER, TABLES, cutoff, clean, snapshot, funnel, campaignTable, stalled, trend, breakdown, brandDetails, query, tableRows, calculate, dataDictionary, teamMap, stageWinRates, istDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
