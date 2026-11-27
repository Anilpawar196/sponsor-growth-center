/* Sponsor Growth Center — UI, persistence, management actions and the AI analyst client. */
(function () {
  'use strict';
  const E = window.Engine;
  const LS_KEY = 'sgc_db_v1', LS_CHAT = 'sgc_chat_v1', LS_SET = 'sgc_settings_v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (v) => (v == null ? '—' : '₹' + Math.round(v).toLocaleString('en-IN'));
  const lakh = (v) => (v == null ? '—' : '₹' + (v / 100000).toFixed(1) + 'L');
  const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
  const pctS = (v) => (v == null ? '—' : v + '%');

  let db = null;
  const ui = { tab: 'overview', asOf: null, filters: {}, pipeFilter: { stage: 'open', campaign: '', owner: '', q: '' } };
  let settings = JSON.parse(localStorage.getItem(LS_SET) || '{}');

  // ---------------- persistence ----------------
  function seedApp(source) {
    return {
      team: [{ owner_id: 'T01', owner_name: 'Riya Kapoor' }, { owner_id: 'T02', owner_name: 'Kabir Shah' }, { owner_id: 'T03', owner_name: 'Meera Iyer' }, { owner_id: 'T05', owner_name: 'Nisha Rao' }],
      // Simulated budgets: the source data has no spend. Flagged everywhere as simulated.
      campaign_meta: {
        SC01: { status: 'active', budget_inr: 25000, spent_inr: 22000, budget_source: 'simulated', notes: 'Email tooling + list research (simulated cost).' },
        SC02: { status: 'active', budget_inr: 15000, spent_inr: 12000, budget_source: 'simulated', notes: 'Partner thank-you kits (simulated cost).' },
        SC03: { status: 'active', budget_inr: 30000, spent_inr: 28000, budget_source: 'simulated', notes: 'LinkedIn premium seats (simulated cost).' },
        SC04: { status: 'active', budget_inr: 20000, spent_inr: 15000, budget_source: 'simulated', notes: 'Partner page + form (simulated cost).' },
        SC05: { status: 'active', budget_inr: 45000, spent_inr: 39000, budget_source: 'simulated', notes: 'Creator referral fees (simulated cost).' },
        SC06: { status: 'active', budget_inr: 10000, spent_inr: 8000, budget_source: 'simulated', notes: 'Re-engagement sequences (simulated cost).' },
      },
      tasks: [
        { id: 'TK001', title: 'Send renewal-ready ROI recap to the 3 activated partners (Beardo, Mosaic Mobility, Maple Devices)', owner: 'Riya Kapoor', due: '2025-04-25', status: 'todo', priority: 'high', campaign_id: 'SC02', opportunity_id: '', source: 'seed (simulated)', created_at: '2025-04-14T10:00:00+05:30', notes: '' },
        { id: 'TK002', title: 'Review 8 negotiating deals from cold channels and decide close-or-drop', owner: 'Meera Iyer', due: '2025-04-08', status: 'in_progress', priority: 'high', campaign_id: '', opportunity_id: '', source: 'seed (simulated)', created_at: '2025-04-01T10:00:00+05:30', notes: '' },
        { id: 'TK003', title: 'Recruit 10 more creator referrers for next cycle', owner: 'Nisha Rao', due: '2025-04-30', status: 'todo', priority: 'medium', campaign_id: 'SC05', opportunity_id: '', source: 'seed (simulated)', created_at: '2025-04-14T10:00:00+05:30', notes: '' },
        { id: 'TK004', title: 'Pause bulk discovery email sends until reply quality improves', owner: 'Kabir Shah', due: '2025-03-31', status: 'done', priority: 'medium', campaign_id: 'SC01', opportunity_id: '', source: 'seed (simulated)', created_at: '2025-03-20T10:00:00+05:30', notes: '' },
      ],
      payments: [], audit: [], seq: 1,
    };
  }
  function save() { db.rev = (db.rev || 0) + 1; try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { toast('Could not save to browser storage: ' + e.message); } }
  function audit(action, detail) { db.app.audit.unshift({ at: new Date().toISOString(), as_of: ui.asOf, action, detail }); db.app.audit = db.app.audit.slice(0, 300); }
  function stamp() { const s = db.app.seq++; const mm = String(Math.floor(s / 60) % 60).padStart(2, '0'); const ss = String(s % 60).padStart(2, '0'); return `${ui.asOf}T23:${mm}:${ss}+05:30`; }
  function nextId(prefix) { return prefix + String(db.app.seq++).padStart(4, '0'); }
  async function loadSource() { const r = await fetch('data/source.json', { cache: 'no-store' }); if (!r.ok) throw new Error('Could not load data/source.json'); return r.json(); }
  async function init() {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { try { db = JSON.parse(saved); } catch (e) { db = null; } }
    if (!db) { const source = await loadSource(); db = { rev: 1, source, app: seedApp(source) }; save(); }
    db.rev = (db.rev || 0) + 1;
    const ev = db.source.event[0];
    ui.asOf = ev.history_end; $('#asOf').value = ui.asOf; $('#eventName').textContent = ev.event_name + (ev.fictional ? ' · fictional dataset' : '');
    bind(); render(); renderChat();
  }

  // ---------------- helpers ----------------
  const team = () => E.teamMap(db);
  const ownerOptions = (sel) => Object.values(team()).sort().map((n) => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const campaigns = () => db.source.campaigns;
  const campName = (id) => (campaigns().find((c) => c.sponsor_campaign_id === id) || {}).campaign_name || id || '';
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600); }
  function modal(html, onMount) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); onMount && onMount($('#modalCard')); }
  function closeModal() { $('#modal').classList.add('hidden'); }

  function bind() {
    $$('#tabs button').forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b)); render(); }));
    $('#asOf').onchange = (e) => { if (e.target.value) { ui.asOf = e.target.value; render(); renderChatHeader(); } };
    $('#btnEventDay').onclick = () => { ui.asOf = db.source.event[0].event_starts_at.slice(0, 10); $('#asOf').value = ui.asOf; render(); renderChatHeader(); };
    $('#btnLatest').onclick = () => { ui.asOf = db.source.event[0].history_end; $('#asOf').value = ui.asOf; render(); renderChatHeader(); };
    $('#btnChat').onclick = () => toggleChat();
    $('#chatClose').onclick = () => toggleChat(false);
    $('#chatReset').onclick = () => { chat.contents = []; chat.display = []; persistChat(); renderChat(); };
    $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
    $('#chatForm').onsubmit = (e) => { e.preventDefault(); const v = $('#chatText').value.trim(); if (v) { $('#chatText').value = ''; ask(v); } };
    $('#chatText').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act, id = a.dataset.id;
      const fn = ACTIONS[act]; if (fn) fn(id, a);
    });
  }
  function toggleChat(open) { const el = $('#chat'); const o = open ?? el.classList.contains('hidden'); el.classList.toggle('hidden', !o); document.body.classList.toggle('chat-open', o); if (o) { renderChatHeader(); $('#chatText').focus(); } }

  // ---------------- render ----------------
  function render() {
    const v = $('#view');
    try {
      if (ui.tab === 'overview') v.innerHTML = viewOverview();
      else if (ui.tab === 'campaigns') v.innerHTML = viewCampaigns();
      else if (ui.tab === 'pipeline') v.innerHTML = viewPipeline();
      else if (ui.tab === 'tasks') v.innerHTML = viewTasks();
      else if (ui.tab === 'playbook') v.innerHTML = viewPlaybook();
      else v.innerHTML = viewData();
    } catch (e) { console.error(e); v.innerHTML = `<div class="card bad">Render error: ${esc(e.message)}</div>`; }
    const open = (db.app.tasks || []).filter((t) => t.status !== 'done' && t.due && t.due < ui.asOf).length;
    $('#taskBadge').textContent = open || '';
    if (ui.tab === 'pipeline') { const s = $('#pipeSearch'); if (s && ui._focusSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); ui._focusSearch = false; } }
  }

  function kpi(label, value, sub, prog, cls = '') {
    return `<div class="card kpi"><div class="l">${label}</div><div class="v ${cls}">${value}</div>${prog != null ? `<div class="bar"><i style="width:${Math.min(100, Math.max(0, prog))}%"></i></div>` : ''}<div class="s">${sub || ''}</div></div>`;
  }

  function viewOverview() {
    const f = E.funnel(db, ui.asOf, ui.filters);
    const g = Object.fromEntries(f.steps.map((s) => [s.key, s.value]));
    const T = f.target; const camp = E.campaignTable(db, ui.asOf); const st = E.stalled(db, ui.asOf, 14);
    const tr = E.trend(db, ui.asOf, 7);
    const confCls = T && T.confirmed_attainment_pct >= 100 ? 'good' : T && T.confirmed_attainment_pct >= 80 ? 'warn' : 'bad';
    const qualCls = T && T.qualified_attainment_pct >= 100 ? 'good' : 'warn';
    const max = Math.max(...f.steps.map((s) => s.value), 1);
    const funnelRows = f.steps.map((s, i) => { const prev = i ? f.steps[i - 1].value : null; return `<div class="row"><div>${s.label}</div><div><div class="fb" style="width:${(100 * s.value) / max}%"></div></div><div class="n"><b>${num(s.value)}</b></div><div class="conv">${prev ? Math.round((100 * s.value) / prev) + '% of prev' : ''}</div></div>`; }).join('');
    const scale = camp.filter((c) => c.recommendation.call === 'SCALE'), stop = camp.filter((c) => c.recommendation.call === 'STOP'), warn = camp.filter((c) => c.recommendation.call === 'WARNING');
    const alerts = [];
    if (T && T.confirmed_gap > 0) alerts.push(`<b class="bad">Confirmed partnerships ${g.confirmed}/${T.confirmed_partnerships_goal}</b> (${T.version}) — gap of ${T.confirmed_gap}. Projected at current stage win rates: ${f.projection.projected_confirmed_deals}. <span class="link" data-act="askAI" data-id="Why are we behind on the confirmed partnerships target and what should we do about it?">Ask analyst why →</span>`);
    if (st.length) alerts.push(`<b class="warn">${st.length} open deals stalled ≥14 days</b> (${lakh(st.reduce((a, o) => a + (o.proposed_value_inr || 0), 0))} face value), oldest ${st[0].days_since_last_change} days. <span class="link" data-act="goPipeline" data-id="stalled">Review →</span> · <span class="link" data-act="quickTask" data-id="stalled">Create follow-up task</span>`);
    if (stop.length) alerts.push(`<b class="bad">${stop.map((c) => esc(c.campaign_name)).join(', ')}</b>: ${stop.reduce((a, c) => a + c.brands_reached, 0)} brands reached, ${stop.reduce((a, c) => a + c.confirmed, 0)} confirmed — below the 15% stop bar. <span class="link" data-act="askAI" data-id="Should we stop the cold outreach campaigns? Show the evidence.">Ask analyst →</span> · <span class="link" data-act="goTab" data-id="playbook">When would we have known? →</span>`);
    if (warn.length) alerts.push(`<b class="warn">Early warning: ${warn.map((c) => esc(c.campaign_name)).join(', ')}</b> — meeting rate below 20% on ≥15 brands (leading indicator). <span class="link" data-act="askAI" data-id="What do the leading indicators say about our campaigns right now?">Ask analyst →</span>`);
    if (scale.length) alerts.push(`<b class="good">${scale.map((c) => esc(c.campaign_name)).join(', ')}</b> convert ≥35% of reached brands into partners — candidates to scale. <span class="link" data-act="askAI" data-id="Which campaigns should we scale and by how much?">Ask analyst →</span>`);
    if (f.value.confirmed_cash_value_inr > 0 && f.value.cash_collected_inr === 0) alerts.push(`<b class="warn">No payments recorded</b> against ${lakh(f.value.confirmed_cash_value_inr)} of confirmed cash value. Confirmed value ≠ cash received. <span class="link" data-act="goPipeline" data-id="confirmed">Log payments →</span>`);
    const overdue = (db.app.tasks || []).filter((t) => t.status !== 'done' && t.due && t.due < ui.asOf);
    if (overdue.length) alerts.push(`<b class="bad">${overdue.length} overdue task(s)</b>. <span class="link" data-act="goTab" data-id="tasks">Open tasks →</span>`);
    const filt = `<div class="toolbar"><span class="muted">Filter:</span>
      <select data-filter="campaign_id"><option value="">All campaigns</option>${campaigns().map((c) => `<option value="${c.sponsor_campaign_id}" ${ui.filters.campaign_id === c.sponsor_campaign_id ? 'selected' : ''}>${esc(c.campaign_name)}</option>`).join('')}</select>
      <select data-filter="industry"><option value="">All industries</option>${[...new Set(db.source.brands.map((b) => b.industry))].sort().map((x) => `<option ${ui.filters.industry === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select data-filter="owner_id"><option value="">All owners</option>${Object.entries(team()).map(([id, n]) => `<option value="${id}" ${ui.filters.owner_id === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <span class="muted tiny">Snapshot = end of ${ui.asOf} IST · duplicates removed · latest version per entity</span></div>`;
    setTimeout(() => $$('[data-filter]').forEach((s) => (s.onchange = () => { ui.filters[s.dataset.filter] = s.value || undefined; render(); })), 0);
    return `${filt}
    <div class="grid g4">
      ${kpi('Confirmed partnerships', `${g.confirmed}${T ? ' / ' + T.confirmed_partnerships_goal : ''}`, T ? `${pctS(T.confirmed_attainment_pct)} of goal · ${esc(T.version)}` : 'No target in force', T ? T.confirmed_attainment_pct : null, confCls)}
      ${kpi('Qualified brands', `${g.brands_qualified}${T ? ' / ' + T.qualified_brands_goal : ''}`, T ? `${pctS(T.qualified_attainment_pct)} of goal` : '', T ? T.qualified_attainment_pct : null, qualCls)}
      ${kpi('Confirmed value', lakh(f.value.confirmed_value_inr), `Cash ${lakh(f.value.confirmed_cash_value_inr)} · in-kind ${lakh(f.value.confirmed_in_kind_value_inr)} · avg ${inr(f.value.avg_confirmed_value_inr)}`)}
      ${kpi('Cash collected', lakh(f.value.cash_collected_inr), f.value.payments_recorded ? `${f.value.payments_recorded} payment(s) · ${Math.round((100 * f.value.cash_collected_inr) / (f.value.confirmed_cash_value_inr || 1))}% of confirmed cash` : 'No payments logged — source data has no receipts', f.value.confirmed_cash_value_inr ? (100 * f.value.cash_collected_inr) / f.value.confirmed_cash_value_inr : null, f.value.cash_collected_inr ? '' : 'warn')}
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Sponsor funnel (brands → partnerships)</h3><div class="funnel">${funnelRows}</div>
        <div class="muted tiny" style="margin-top:6px">Activity: ${num(f.activity.outreach_attempts)} outreach attempts · ${num(f.activity.contacts_touched)} contacts · ${f.activity.replies} replies (${f.activity.positive_replies} positive) · ${f.activity.meetings_held} meetings held · ${f.activity.opt_outs} opt-outs. Open pipeline ${f.value.open_opportunities} deals / ${lakh(f.value.open_pipeline_face_value_inr)} face value.</div></div>
      <div class="card"><h3>Alerts &amp; decisions</h3><ul class="alerts">${alerts.join('') ? alerts.map((a) => `<li>${a}</li>`).join('') : '<li class="muted">No alerts.</li>'}</ul></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Progress vs target over time</h3>${trendChart(tr)}<div class="legend"><span><i style="background:#2f6f5e"></i>Confirmed partnerships</span><span><i style="background:#2c5d8f"></i>Qualified brands</span><span><i style="background:#bbb"></i>Goal in force (dashed)</span></div></div>
      <div class="card"><h3>Projection &amp; pipeline by stage</h3>
        <p style="margin:0 0 8px">Projected confirmed deals: <b>${f.projection.projected_confirmed_deals}</b> · projected value <b>${lakh(f.projection.projected_confirmed_value_inr)}</b> <span class="tag sim">model</span></p>
        <table><tr><th>Stage</th><th class="n">Deals</th><th class="n">Hist. win rate</th></tr>
        ${E.STAGE_ORDER.map((s) => `<tr><td>${s}</td><td class="n">${f.opportunity_stage_counts[s] || 0}</td><td class="n">${f.projection.stage_win_rates[s] ? f.projection.stage_win_rates[s].win_rate : ''}</td></tr>`).join('')}</table>
        <div class="muted tiny" style="margin-top:6px">${esc(f.projection.method)}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Channel league table</h3>${campaignTableHTML(camp, true)}</div>`;
  }

  function trendChart(tr) {
    const W = 640, H = 210, P = 30; const maxY = Math.max(...tr.map((p) => Math.max(p.qualified, p.qualified_goal || 0, p.confirmed_goal || 0)), 10);
    const x = (i) => P + (i * (W - P - 10)) / Math.max(1, tr.length - 1); const y = (v) => H - P - (v * (H - P - 10)) / maxY;
    const line = (k, col, dash) => `<polyline fill="none" stroke="${col}" stroke-width="${dash ? 1.5 : 2.5}" ${dash ? 'stroke-dasharray="5 4"' : ''} points="${tr.map((p, i) => (p[k] == null ? '' : `${x(i)},${y(p[k])}`)).join(' ')}"/>`;
    const ticks = [0, Math.round(maxY / 2), maxY].map((v) => `<text x="4" y="${y(v) + 4}" font-size="10" fill="#889">${v}</text><line x1="${P}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#eef"/>`).join('');
    const labels = tr.map((p, i) => (i % 2 === 0 || i === tr.length - 1 ? `<text x="${x(i)}" y="${H - 8}" font-size="10" fill="#889" text-anchor="middle">${p.date.slice(5)}</text>` : '')).join('');
    const dots = tr.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.confirmed)}" r="3" fill="#2f6f5e"><title>${p.date}: ${p.confirmed} confirmed, ${p.qualified} qualified, ${lakh(p.confirmed_value_inr)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%">${ticks}${line('qualified_goal', '#9ab', true)}${line('confirmed_goal', '#bbb', true)}${line('qualified', '#2c5d8f')}${line('confirmed', '#2f6f5e')}${dots}${labels}</svg>`;
  }

  function campaignTableHTML(camp, compact) {
    return `<div class="tablewrap"><table><tr><th>Campaign</th><th>Channel</th><th>Status</th><th class="n">Attempts</th><th class="n">Brands reached</th><th class="n">Reply %</th><th class="n">Meeting %</th><th class="n">Qualified</th><th class="n">Opps</th><th class="n">Confirmed</th><th class="n">Value</th><th class="n">Open / stalled</th><th class="n">Brand→partner</th><th class="n">Mature cohort</th><th class="n">Spent</th><th class="n">₹ / partner</th><th>Call</th>${compact ? '' : '<th></th>'}</tr>
      ${camp.map((c) => `<tr><td><b>${esc(c.campaign_name)}</b><div class="muted tiny">${esc(c.owner_name || '')}</div></td><td>${esc(c.channel)}</td><td>${esc(c.status)}</td><td class="n">${c.outreach_attempts}</td><td class="n">${c.brands_reached}</td><td class="n">${pctS(c.reply_rate_pct)}</td><td class="n">${pctS(c.meeting_rate_pct)}</td><td class="n">${c.qualified_brands}</td><td class="n">${c.opportunities}</td><td class="n"><b>${c.confirmed}</b></td><td class="n">${lakh(c.confirmed_value_inr)}</td><td class="n">${c.open_opportunities}${c.oldest_open_days != null ? ` <span class="muted tiny">(${c.oldest_open_days}d)</span>` : ''}</td><td class="n">${pctS(c.brand_to_confirmed_pct)}</td><td class="n">${c.mature_brands ? `${pctS(c.mature_conversion_pct)} <span class="muted tiny">n=${c.mature_brands}</span>` : '—'}</td><td class="n">${inr(c.spent_inr)}${c.budget_source === 'simulated' ? ' <span class="tag sim">sim</span>' : ''}</td><td class="n">${inr(c.cost_per_confirmed_inr)}</td><td><span class="tag ${c.recommendation.call.split(' ')[0]}" title="${esc(c.recommendation.reason)}">${esc(c.recommendation.call)}</span></td>${compact ? '' : `<td><button class="small" data-act="editCampaign" data-id="${c.campaign_id}">Edit</button></td>`}</tr>`).join('')}</table></div>
      <div class="muted tiny" style="margin-top:6px">Call rules — lagging (once ≥8 brands are ≥21 days past first touch): SCALE ≥35% of that mature cohort confirmed · CHANGE 15–35% · STOP &lt;15%. Leading (before that): LEAN-SCALE if meeting rate ≥50% on ≥5 brands · WARNING if &lt;20% on ≥15 brands · else NEED-DATA. Hover a call for the reason. Qualified = brands whose latest assessment is “qualified”, credited to that assessment's source campaign. Spend is simulated unless edited.</div>`;
  }

  function viewCampaigns() {
    const camp = E.campaignTable(db, ui.asOf);
    const tot = camp.reduce((a, c) => ({ b: a.b + (c.budget_inr || 0), s: a.s + (c.spent_inr || 0) }), { b: 0, s: 0 });
    return `<div class="toolbar"><h2 style="margin:0">Campaigns</h2><span class="muted">Budget ${inr(tot.b)} · spent ${inr(tot.s)} <span class="tag sim">simulated unless edited</span></span><span style="flex:1"></span><button class="primary" data-act="newCampaign">+ New campaign</button></div>
      <div class="card">${campaignTableHTML(camp, false)}</div>
      <div class="grid g3" style="margin-top:12px">${camp.map((c) => `<div class="card"><h3>${esc(c.campaign_name)} <span class="tag ${c.recommendation.call.split(' ')[0]}">${esc(c.recommendation.call)}</span></h3><div class="muted tiny">${esc(c.objective)}</div><p style="font-size:13px">${esc(c.recommendation.reason)}</p>${c.notes ? `<div class="note">${esc(c.notes)}</div>` : ''}<div style="margin-top:8px;display:flex;gap:6px"><button class="small" data-act="editCampaign" data-id="${c.campaign_id}">Edit</button><button class="small" data-act="askAI" data-id="Diagnose the ${esc(c.campaign_name)} campaign: what is working, what is not, and should we scale, change or stop it?">Ask analyst</button><button class="small" data-act="quickTask" data-id="camp:${c.campaign_id}">+ Task</button></div></div>`).join('')}</div>`;
  }

  function viewPipeline() {
    const S = E.snapshot(db, ui.asOf); const pf = ui.pipeFilter; const st = new Set(E.stalled(db, ui.asOf, 14).map((o) => o.opportunity_id));
    let rows = S.opps;
    if (pf.stage === 'open') rows = rows.filter((o) => o.is_open); else if (pf.stage === 'stalled') rows = rows.filter((o) => st.has(o.opportunity_id)); else if (pf.stage) rows = rows.filter((o) => o.stage === pf.stage);
    if (pf.campaign) rows = rows.filter((o) => o.campaign_id === pf.campaign); if (pf.owner) rows = rows.filter((o) => o.owner_name === pf.owner);
    if (pf.q) rows = rows.filter((o) => (o.opportunity_name + o.brand_name).toLowerCase().includes(pf.q.toLowerCase()));
    rows = [...rows].sort((a, b) => b.days_since_last_change - a.days_since_last_change);
    const paid = {}; S.payments.forEach((p) => (paid[p.opportunity_id] = (paid[p.opportunity_id] || 0) + (+p.amount_inr || 0)));
    setTimeout(() => {
      $$('[data-pf]').forEach((s) => (s.onchange = () => { ui.pipeFilter[s.dataset.pf] = s.value; render(); }));
      const q = $('#pipeSearch'); if (q) q.oninput = () => { ui.pipeFilter.q = q.value; ui._focusSearch = true; render(); };
    }, 0);
    return `<div class="toolbar"><h2 style="margin:0">Pipeline</h2>
      <select data-pf="stage"><option value="">All stages</option><option value="open" ${pf.stage === 'open' ? 'selected' : ''}>Open</option><option value="stalled" ${pf.stage === 'stalled' ? 'selected' : ''}>Stalled ≥14d</option>${E.STAGE_ORDER.map((s) => `<option ${pf.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select data-pf="campaign"><option value="">All campaigns</option>${campaigns().map((c) => `<option value="${c.sponsor_campaign_id}" ${pf.campaign === c.sponsor_campaign_id ? 'selected' : ''}>${esc(c.campaign_name)}</option>`).join('')}</select>
      <select data-pf="owner"><option value="">All owners</option>${ownerOptions(pf.owner)}</select>
      <input id="pipeSearch" placeholder="Search brand…" value="${esc(pf.q)}">
      <span class="muted">${rows.length} deals · ${lakh(rows.reduce((a, o) => a + (o.stage === 'partner_confirmed' ? o.confirmed_value_inr : o.proposed_value_inr || 0), 0))}</span>
      <span style="flex:1"></span><button class="primary" data-act="newOpp">+ New opportunity</button></div>
      <div class="card tablewrap"><table><tr><th>Opportunity</th><th>Campaign</th><th>Type</th><th>Stage</th><th class="n">Proposed</th><th class="n">Confirmed</th><th class="n">Collected</th><th>Owner</th><th class="n">Days since change</th><th></th></tr>
      ${rows.map((o) => `<tr><td><span class="link" data-act="brand" data-id="${o.brand_id}">${esc(o.brand_name)}</span><div class="muted tiny">${esc(o.opportunity_name)} · ${esc(o.industry || '')}</div></td><td>${esc(o.campaign_name)}</td><td>${esc(o.support_type)}</td><td><span class="tag ${o.stage === 'partner_confirmed' ? 'SCALE' : ['lost', 'withdrawn'].includes(o.stage) ? 'stop' : ''}">${o.stage}</span>${st.has(o.opportunity_id) ? ' <span class="tag CHANGE">stalled</span>' : ''}</td><td class="n">${inr(o.proposed_value_inr)}</td><td class="n">${o.confirmed_value_inr ? inr(o.confirmed_value_inr) : '—'}</td><td class="n">${paid[o.opportunity_id] ? inr(paid[o.opportunity_id]) : '—'}</td><td>${esc(o.owner_name || '')}</td><td class="n">${o.days_since_last_change}</td>
        <td style="white-space:nowrap"><button class="small" data-act="editOpp" data-id="${o.opportunity_id}">Update</button> ${o.stage === 'partner_confirmed' && o.support_type === 'cash' ? `<button class="small" data-act="payment" data-id="${o.opportunity_id}">+ Payment</button>` : ''} <button class="small ghost" data-act="quickTask" data-id="opp:${o.opportunity_id}">+ Task</button></td></tr>`).join('')}</table></div>
      <div class="muted tiny" style="margin-top:6px">Updates are saved as a new full-state history version effective on the selected as-of date (${ui.asOf}), so earlier snapshots stay unchanged.</div>`;
  }

  function viewTasks() {
    const tasks = db.app.tasks || []; const col = (s) => tasks.filter((t) => t.status === s).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    const card = (t) => `<div class="task ${t.status !== 'done' && t.due && t.due < ui.asOf ? 'overdue' : ''}"><b>${esc(t.title)}</b><div class="meta">${esc(t.owner || 'Unassigned')} · due ${esc(t.due || '—')} · ${esc(t.priority || '')}${t.campaign_id ? ' · ' + esc(campName(t.campaign_id)) : ''}${t.opportunity_id ? ' · ' + esc(t.opportunity_id) : ''}</div>${t.notes ? `<div class="meta">${esc(t.notes)}</div>` : ''}<div class="meta">Source: ${esc(t.source || 'manual')}</div>
      <div class="acts">${t.status !== 'todo' ? `<button class="small" data-act="taskMove" data-id="${t.id}|todo">To do</button>` : ''}${t.status !== 'in_progress' ? `<button class="small" data-act="taskMove" data-id="${t.id}|in_progress">In progress</button>` : ''}${t.status !== 'done' ? `<button class="small" data-act="taskMove" data-id="${t.id}|done">Done ✓</button>` : ''}<button class="small ghost" data-act="editTask" data-id="${t.id}">Edit</button><button class="small ghost danger" data-act="delTask" data-id="${t.id}">Delete</button></div></div>`;
    return `<div class="toolbar"><h2 style="margin:0">Tasks &amp; action items</h2><span class="muted">${tasks.filter((t) => t.status !== 'done').length} open · overdue is judged against the as-of date</span><span style="flex:1"></span><button class="primary" data-act="editTask" data-id="">+ New task</button></div>
      <div class="kanban">${[['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']].map(([s, l]) => `<div class="kcol"><h3>${l} (${col(s).length})</h3>${col(s).map(card).join('')}</div>`).join('')}</div>`;
  }

  function viewData() {
    const dd = E.dataDictionary(db); const c = E.clean(db);
    return `<h2>Data &amp; settings</h2><div class="grid g2">
      <div class="card"><h3>Data in use</h3><table>${Object.entries(db.source).map(([k, v]) => `<tr><td>${k}</td><td class="n">${v.length} rows</td></tr>`).join('')}<tr><td>tasks (app)</td><td class="n">${db.app.tasks.length}</td></tr><tr><td>payments (app)</td><td class="n">${db.app.payments.length}</td></tr></table>
        <p class="tiny muted">Cleaning applied: removed ${dd.data_quality.interaction_retries_removed} duplicate interaction rows, ${dd.data_quality.qualification_retries_removed} duplicate qualification versions, ${dd.data_quality.opportunity_history_retries_removed} duplicate opportunity versions (import retries with identical IDs and payloads). Conflicting IDs: ${dd.data_quality.conflicting_ids.length ? esc(dd.data_quality.conflicting_ids.join(', ')) : 'none'}.</p>
        <div class="toolbar"><button data-act="importFile">Import .xlsx / .json</button><button data-act="exportJson">Export JSON</button><button class="danger" data-act="resetData">Reset to original data</button></div>
        <input type="file" id="fileIn" accept=".xlsx,.json" style="display:none">
        <p class="tiny muted">Import a modified copy of the original Sponsor Dataset.xlsx (same sheet names and columns) to test changed data; app-managed tasks, payments and budgets are kept. All changes are saved in this browser.</p></div>
      <div class="card"><h3>Source facts vs assumptions</h3><ul class="alerts">
        <li><span class="tag src">source</span> Brands, contacts, campaigns, interactions, qualification and opportunity histories, activations and targets come from the RISA Sponsor Dataset (synthetic CampusFest 2025).</li>
        <li><span class="tag sim">simulated</span> Campaign budgets/spend and the four seed tasks were added so budget and execution features can be demonstrated; they are flagged wherever shown.</li>
        <li><span class="tag">app</span> Payments start empty: the dataset has no bank receipts. “Cash collected” only counts payments logged here.</li>
        <li><b>Not in the data:</b> ${dd.not_in_data.map(esc).join(' · ')}</li></ul></div>
      <div class="card"><h3>Targets (dated versions)</h3><table><tr><th>Version</th><th>Effective</th><th class="n">Qualified goal</th><th class="n">Confirmed goal</th></tr>${c.targets.map((t) => `<tr><td>${esc(t.target_version)}</td><td>${esc(t.effective_at.slice(0, 16).replace('T', ' '))}</td><td class="n">${t.qualified_brands_goal}</td><td class="n">${t.confirmed_partnerships_goal}</td></tr>`).join('')}</table><button style="margin-top:8px" data-act="newTarget">+ New target version (effective ${ui.asOf})</button></div>
      <div class="card"><h3>AI analyst settings</h3><div class="form"><label>Gemini API key (optional)</label><input id="setKey" type="password" placeholder="Only if the server has no key" value="${esc(settings.apiKey || '')}"><label>Model override</label><input id="setModel" placeholder="e.g. gemini-2.5-flash" value="${esc(settings.model || '')}"></div><button style="margin-top:8px" data-act="saveSettings">Save settings</button><p class="tiny muted">The deployed server holds the key in an environment variable. A key entered here stays in this browser and is used only if the server has none.</p></div>
      ${evalHTML()}
      <div class="card" style="grid-column:1/-1"><h3>Change log (latest 30)</h3><table><tr><th>When</th><th>As-of</th><th>Action</th><th>Detail</th></tr>${db.app.audit.slice(0, 30).map((a) => `<tr><td class="tiny">${esc(a.at.slice(0, 19).replace('T', ' '))}</td><td>${esc(a.as_of)}</td><td>${esc(a.action)}</td><td class="tiny">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan=4 class="muted">No changes yet.</td></tr>'}</table></div></div>`;
  }

  // ---------------- Replay (backtest) & 2026 plan simulator ----------------
  function currentPlan() { if (!db.app.plan) db.app.plan = { preset: 'base', goal_inr: 5000000, ...E.planFrom('base') }; return db.app.plan; }
  function viewPlaybook() {
    const bt = E.backtest(db, ui.asOf);
    const cold = bt.campaigns.filter((c) => c.first_warning_or_stop);
    const totalColdSends = cold.reduce((a, c) => a + E.clean(db).interactions.filter((x) => x.sponsor_campaign_id === c.campaign_id && x.event_type === 'outreach_sent' && Date.parse(x.occurred_at) <= E.cutoff(ui.asOf)).length, 0);
    const wasted = cold.reduce((a, c) => a + (c.activity_after_first_warning ? c.activity_after_first_warning.outreach_sends_after : 0), 0);
    const wastedOpps = cold.reduce((a, c) => a + (c.activity_after_first_warning ? c.activity_after_first_warning.opportunities_created_after : 0), 0);
    const wastedConf = cold.reduce((a, c) => a + (c.activity_after_first_warning ? c.activity_after_first_warning.of_which_confirmed : 0), 0);
    const heat = `<div class="tablewrap"><table class="heat"><tr><td></td>${bt.timeline.map((p) => `<td class="tiny muted" style="text-align:center">${p.date.slice(5)}</td>`).join('')}</tr>
      ${bt.campaigns.map((c) => `<tr><td class="tiny" style="padding-right:8px;white-space:nowrap"><b>${esc(c.campaign_name)}</b></td>${bt.timeline.map((p) => { const k = p.calls[c.campaign_id]; if (!k) return '<td></td>'; return `<td><div class="cell c-${k.call}" title="${p.date}: ${k.call} (${k.basis}) · ${k.brands} brands · meeting ${k.meeting_rate_pct ?? '—'}% · mature ${k.mature} (${k.mature_conv_pct ?? '—'}% conv) · ${k.confirmed} confirmed">${k.call.replace('NEED-DATA', '·').replace('LEAN-SCALE', 'LEAN')}</div></td>`; }).join('')}</tr>`).join('')}</table></div>
      <div class="legend"><span><i style="background:#1f7a4d"></i>SCALE</span><span><i style="background:#7cc19c"></i>LEAN-SCALE (leading)</span><span><i style="background:#d9a23a"></i>CHANGE</span><span><i style="background:#f0b86b"></i>WARNING (leading)</span><span><i style="background:#b23b3b"></i>STOP</span><span><i style="background:#cfd8e3"></i>need data</span></div>`;
    const cards = bt.campaigns.map((c) => { const a = c.activity_after_first_warning;
      return `<div class="card"><h3>${esc(c.campaign_name)} <span class="tag ${c.final_call}">${c.final_call} now</span></h3>
        ${c.first_warning_or_stop ? `<p style="margin:0 0 6px">First flagged <b>${c.first_warning_or_stop}</b>${c.first_stop && c.first_stop !== c.first_warning_or_stop ? `, STOP from <b>${c.first_stop}</b>` : ''}.</p><p class="tiny" style="margin:0">After the first flag the team still sent <b>${a.outreach_sends_after}</b> outreach messages to <b>${a.new_brands_touched_after}</b> new brands and opened <b>${a.opportunities_created_after}</b> deals → <b class="${a.of_which_confirmed ? 'good' : 'bad'}">${a.of_which_confirmed} confirmed</b> (${a.still_open} still open).</p>`
        : c.first_lean_scale_or_scale ? `<p style="margin:0 0 6px">Leading signal to scale on <b>${c.first_lean_scale_or_scale}</b>${c.first_scale ? `; confirmed SCALE on <b>${c.first_scale}</b>` : ''}.</p><p class="tiny" style="margin:0">Final: ${c.final_confirmed} confirmed, ${lakh(c.final_value_inr)}. Earlier investment here was the missed opportunity.</p>` : '<p class="tiny muted">No signal fired.</p>'}</div>`; }).join('');
    const plan = currentPlan(); const R = E.runScenario(db, plan); const T = R.totals; const goal = plan.goal_inr || 0;
    const rateIn = (k, l) => `<input type="number" step="1" min="0" max="100" data-plan="${k}|${l}" value="${Math.round(plan.streams[k][l] * 1000) / 10}">`;
    const simRows = R.lines.map((l) => { const an = R.anchors_2025[l.key];
      return `<tr><td><b>${esc(l.stream)}</b><div class="tiny muted">${an.note ? esc(an.note) : `2025: ${an.confirmed_2025}/${an.brands_reached_2025} brands → ${an.brand_to_confirmed_pct_2025}%${an.avg_deal_2025_inr ? ', avg ' + inr(an.avg_deal_2025_inr) : ''}`}</div></td>
        <td><input type="number" min="0" data-plan="${l.key}|prospects" value="${plan.streams[l.key].prospects}"></td><td>${rateIn(l.key, 'conversation_rate')}%</td><td>${rateIn(l.key, 'proposal_rate')}%</td><td>${rateIn(l.key, 'sign_rate')}%</td>
        <td><input type="number" min="0" step="5000" data-plan="${l.key}|avg_deal_inr" value="${plan.streams[l.key].avg_deal_inr}" style="width:95px"></td><td class="n">${l.end_to_end_pct}%</td><td class="n">${l.signed}</td><td class="n"><b>${lakh(l.signed_value_inr)}</b></td></tr>`; }).join('');
    setTimeout(() => {
      $$('[data-plan]').forEach((inp) => (inp.onchange = () => { const [k, l] = inp.dataset.plan.split('|'); const v = +inp.value; const p = currentPlan();
        if (k === 'cash_share' || k === 'collection') p[k] = v / 100; else if (k === 'goal_inr') p.goal_inr = v * 100000; else p.streams[k][l] = l.endsWith('_rate') ? Math.min(1, Math.max(0, v / 100)) : Math.max(0, v);
        p.preset = 'custom'; audit('plan_update', `${k} ${l || ''} = ${v}`); save(); render(); }));
    }, 0);
    return `<div class="hero"><h2>If this Growth Center had existed in 2025…</h2>
      <div class="grid g3" style="margin-top:8px"><div><div class="big">${(() => { const d = cold.map((c) => c.first_warning_or_stop).sort()[0]; return d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'; })()}</div><div class="muted">first date a weekly Monday review would have flagged cold outreach</div></div>
      <div><div class="big">${wasted} / ${totalColdSends}</div><div class="muted">cold sends made <i>after</i> the rules had flagged that channel</div></div>
      <div><div class="big">${wastedOpps} → ${wastedConf}</div><div class="muted">deals opened after the flag → confirmed. That team time belonged in warm intros &amp; referrals.</div></div></div>
      <p class="muted tiny" style="margin:10px 0 0">Replay = the dashboard's own decision rules re-run at each of ${bt.reviews} weekly reviews using only data available on that date (no hindsight). ${esc(bt.rules)}</p></div>
      <div class="card" style="margin-top:12px"><h3>Call at each weekly review (hover a cell for the evidence)</h3>${heat}
      <p class="tiny muted">Honest read: the leading indicator (meeting rate) caught Brand Discovery Email on its own, but LinkedIn and Revival had decent meeting rates (27–45%) that never turned into deals. For cold channels, meetings are a weak signal, so the 21-day cohort conversion rule is what catches them.</p></div>
      <div class="grid g3" style="margin-top:12px">${cards}</div>
      <h2 style="margin-top:22px">2026 Bengaluru plan simulator <span class="tag sim">plan model, not data</span></h2>
      <div class="toolbar presets"><button class="${plan.preset === 'base' ? 'active' : ''}" data-act="planPreset" data-id="base">Base case</button><button class="${plan.preset === 'stretch' ? 'active' : ''}" data-act="planPreset" data-id="stretch">Stretch case</button>${plan.preset === 'custom' ? '<span class="tag">custom (edited)</span>' : ''}
        <span class="muted">Cash share <input type="number" data-plan="cash_share" value="${Math.round(plan.cash_share * 100)}" style="width:60px">% · Collected before fest <input type="number" data-plan="collection" value="${Math.round(plan.collection * 100)}" style="width:60px">% · Goal ₹<input type="number" step="1" data-plan="goal_inr" value="${goal / 100000}" style="width:70px">L</span>
        <button class="small" data-act="askAI" data-id="Using the 2026 plan simulator, what is the cheapest way to close the gap to our cash goal? Compare levers with numbers.">Ask analyst to optimise</button></div>
      <div class="grid" style="grid-template-columns:1.75fr 1fr"><div class="card tablewrap sim"><table><tr><th>Stream (2025 anchor)</th><th>Prospects</th><th>Conv.</th><th>Proposal</th><th>Sign</th><th>Avg deal ₹</th><th class="n">End-to-end</th><th class="n">Signed</th><th class="n">Signed value</th></tr>${simRows}
        <tr><td><b>Total</b></td><td>${T.prospects}</td><td colspan="4" class="muted tiny">${T.conversations} conversations · ${T.proposals} proposals</td><td></td><td class="n"><b>${T.signed}</b></td><td class="n"><b>${lakh(T.signed_value_inr)}</b></td></tr></table></div>
        <div class="card"><div class="kpi"><div class="l">Cash collected before the fest</div><div class="v ${T.cash_collected_inr >= goal ? 'good' : 'warn'}">${lakh(T.cash_collected_inr)}</div><div class="s">Signed ${lakh(T.signed_value_inr)} × ${Math.round(plan.cash_share * 100)}% cash = ${lakh(T.cash_signed_inr)} × ${Math.round(plan.collection * 100)}% collected · ${R.multiple_vs_2025_cash}× 2025's confirmed cash (${lakh(R.baseline_2025.confirmed_cash_value_inr)})</div>
          <div class="bar"><i style="width:${goal ? Math.min(100, (100 * T.cash_collected_inr) / goal) : 0}%"></i></div><div class="s">${goal ? (T.cash_collected_inr >= goal ? `Clears the ${lakh(goal)} goal by ${lakh(T.cash_collected_inr - goal)}` : `${lakh(goal - T.cash_collected_inr)} short of the ${lakh(goal)} goal`) : ''}</div></div>
          <h3 style="margin-top:14px">Which lever moves cash most?</h3><table>${R.sensitivity.map((x) => `<tr><td class="tiny">${esc(x.lever)}</td><td class="n"><b>+${lakh(x.delta_cash_collected_inr)}</b></td></tr>`).join('')}</table>
          <p class="tiny muted">The funnel is multiplicative, so +10% on any lever of a stream adds the same amount. Collection discipline beats most acquisition levers.</p></div></div>`;
  }

  // ---------------- actions (management) ----------------
  const ACTIONS = {
    goTab: (id) => { ui.tab = id; $$('#tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === id)); render(); },
    goPipeline: (id) => { ui.pipeFilter.stage = id === 'confirmed' ? 'partner_confirmed' : id; ACTIONS.goTab('pipeline'); },
    askAI: (q) => { toggleChat(true); ask(q); },
    brand: (id) => brandDrawer(id),
    editCampaign: (id) => campaignForm(id),
    newCampaign: () => campaignForm(null),
    editOpp: (id) => oppForm(id),
    newOpp: () => newOppForm(),
    payment: (id) => paymentForm(id),
    editTask: (id) => taskForm(id || null),
    quickTask: (id) => quickTask(id),
    taskMove: (v) => { const [id, s] = v.split('|'); const t = db.app.tasks.find((x) => x.id === id); if (t) { t.status = s; audit('task_status', `${id} → ${s}`); save(); render(); } },
    delTask: (id) => { if (!confirm('Delete this task?')) return; db.app.tasks = db.app.tasks.filter((x) => x.id !== id); audit('task_delete', id); save(); render(); },
    exportJson: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' })); a.download = 'growth-center-export.json'; a.click(); },
    resetData: async () => { if (!confirm('Reset all data (source + tasks + payments + budgets) to the original dataset? This cannot be undone.')) return; const source = await loadSource(); db = { rev: (db.rev || 0) + 1, source, app: seedApp(source) }; save(); toast('Reset to original data'); render(); },
    importFile: () => { const inp = $('#fileIn'); inp.onchange = () => importFile(inp.files[0]); inp.click(); },
    newTarget: () => targetForm(),
    saveSettings: () => { settings.apiKey = $('#setKey').value.trim(); settings.model = $('#setModel').value.trim(); localStorage.setItem(LS_SET, JSON.stringify(settings)); toast('Settings saved'); },
    closeModal: () => closeModal(),
    confirmProposal: (id) => confirmProposal(id),
    rejectProposal: (id) => rejectProposal(id),
    suggest: (q) => ask(q),
    planPreset: (id) => { db.app.plan = { preset: id, goal_inr: (db.app.plan && db.app.plan.goal_inr) || 5000000, ...E.planFrom(id) }; audit('plan_preset', id); save(); render(); },
    runEval: () => runEval(),
  };

  function campaignForm(id) {
    const c = id ? campaigns().find((x) => x.sponsor_campaign_id === id) : null; const m = id ? db.app.campaign_meta[id] || {} : {};
    modal(`<h3>${c ? 'Edit campaign' : 'New campaign'}</h3><div class="form">
      <label>Name</label><input id="f_name" value="${esc(c ? c.campaign_name : '')}" ${c ? 'disabled' : ''}>
      <label>Channel</label><select id="f_channel" ${c ? 'disabled' : ''}>${['email', 'linkedin', 'introduction', 'web_inbound', 'event', 'other'].map((x) => `<option ${c && c.channel === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label>Objective</label><input id="f_obj" value="${esc(c ? c.objective : '')}" ${c ? 'disabled' : ''}>
      <label>Owner</label><select id="f_owner">${ownerOptions(m.owner_name || (c && c.owner_name))}</select>
      <label>Status</label><select id="f_status">${['planned', 'active', 'paused', 'stopped', 'completed'].map((x) => `<option ${(m.status || 'active') === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label>Budget (₹)</label><input id="f_budget" type="number" min="0" value="${m.budget_inr ?? ''}">
      <label>Spent (₹)</label><input id="f_spent" type="number" min="0" value="${m.spent_inr ?? ''}">
      <label>Notes</label><textarea id="f_notes" rows="2">${esc(m.notes || '')}</textarea></div>
      ${m.budget_source === 'simulated' ? '<p class="tiny muted">Budget is currently simulated. Saving a changed amount marks it as user-entered.</p>' : ''}
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Save</button></div>`, (el) => {
      $('#f_save', el).onclick = () => {
        let cid = id;
        if (!c) { const name = $('#f_name', el).value.trim(); if (!name) return toast('Name required'); cid = 'SC' + String(db.source.campaigns.length + 1).padStart(2, '0'); while (db.source.campaigns.some((x) => x.sponsor_campaign_id === cid)) cid += 'x';
          const owner = $('#f_owner', el).value; const oid = Object.entries(team()).find(([, n]) => n === owner)?.[0] || '';
          db.source.campaigns.push({ campaign_name: name, channel: $('#f_channel', el).value, objective: $('#f_obj', el).value, audience: '', owner_name: owner, planned_start_at: stamp(), planned_end_at: null, created_at: stamp(), sponsor_campaign_id: cid, owner_id: oid }); }
        const prev = db.app.campaign_meta[cid] || {}; const b = $('#f_budget', el).value, s = $('#f_spent', el).value;
        const nb = b === '' ? null : +b, ns = s === '' ? null : +s;
        db.app.campaign_meta[cid] = { ...prev, owner_name: $('#f_owner', el).value, status: $('#f_status', el).value, budget_inr: nb, spent_inr: ns, notes: $('#f_notes', el).value,
          budget_source: nb == null && ns == null ? 'not recorded' : nb === prev.budget_inr && ns === prev.spent_inr ? prev.budget_source || 'user-entered' : 'user-entered' };
        audit(c ? 'campaign_update' : 'campaign_create', `${campName(cid)}: status ${db.app.campaign_meta[cid].status}, budget ${nb}, spent ${ns}`); save(); closeModal(); render(); toast('Campaign saved');
      };
    });
  }

  function oppForm(id) {
    const S = E.snapshot(db, ui.asOf); const o = S.opps.find((x) => x.opportunity_id === id); if (!o) return;
    modal(`<h3>Update ${esc(o.opportunity_name)}</h3><div class="form">
      <label>Stage</label><select id="f_stage">${E.STAGE_ORDER.map((s) => `<option ${o.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label>Proposed value (₹)</label><input id="f_prop" type="number" min="0" value="${o.proposed_value_inr ?? ''}">
      <label>Confirmed value (₹)</label><input id="f_conf" type="number" min="0" value="${o.confirmed_value_inr || ''}" placeholder="Defaults to proposed when confirmed">
      <label>Owner</label><select id="f_owner">${ownerOptions(o.owner_name)}</select></div>
      <p class="tiny muted">Saved as a new history version effective ${ui.asOf}.</p>
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Save version</button></div>`, (el) => {
      $('#f_save', el).onclick = () => {
        const stage = $('#f_stage', el).value; const prop = $('#f_prop', el).value === '' ? null : +$('#f_prop', el).value; let conf = $('#f_conf', el).value === '' ? null : +$('#f_conf', el).value;
        if (stage === 'partner_confirmed' && !conf) conf = prop || 0; if (stage !== 'partner_confirmed') conf = 0;
        const owner = $('#f_owner', el).value; const oid = Object.entries(team()).find(([, n]) => n === owner)?.[0] || '';
        db.source.opportunity_history.push({ opportunity_name: o.opportunity_name, brand_name: o.brand_name, stage, proposed_value_inr: prop, confirmed_value_inr: conf, owner_name: owner, effective_at: stamp(), history_id: nextId('OHU'), opportunity_id: o.opportunity_id, brand_id: o.brand_id, owner_id: oid });
        audit('opportunity_update', `${o.brand_name}: ${o.stage} → ${stage}, proposed ${prop}, confirmed ${conf}`); save(); closeModal(); render(); toast('Opportunity updated');
      };
    });
  }

  function newOppForm() {
    const brands = db.source.brands.slice().sort((a, b) => a.brand_name.localeCompare(b.brand_name));
    modal(`<h3>New opportunity</h3><div class="form">
      <label>Brand</label><input id="f_brand" list="brandList" placeholder="Type a brand"><datalist id="brandList">${brands.map((b) => `<option value="${esc(b.brand_name)}">`).join('')}</datalist>
      <label>Source campaign</label><select id="f_camp">${campaigns().map((c) => `<option value="${c.sponsor_campaign_id}">${esc(c.campaign_name)}</option>`).join('')}</select>
      <label>Support type</label><select id="f_type"><option>cash</option><option>in_kind</option></select>
      <label>Stage</label><select id="f_stage">${E.OPEN_STAGES.map((s) => `<option>${s}</option>`).join('')}</select>
      <label>Proposed value (₹)</label><input id="f_prop" type="number" min="0">
      <label>Owner</label><select id="f_owner">${ownerOptions()}</select></div>
      <p class="tiny muted">A brand not in the list is added as a new brand.</p>
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Create</button></div>`, (el) => {
      $('#f_save', el).onclick = () => {
        const bn = $('#f_brand', el).value.trim(); if (!bn) return toast('Brand required');
        let b = db.source.brands.find((x) => x.brand_name.toLowerCase() === bn.toLowerCase()); const owner = $('#f_owner', el).value; const oid = Object.entries(team()).find(([, n]) => n === owner)?.[0] || ''; const at = stamp();
        if (!b) { b = { brand_name: bn, industry: 'Unassigned', owner_name: owner, created_at: at, brand_id: nextId('AU'), owner_id: oid }; db.source.brands.push(b); }
        const id = nextId('OU'); const name = `${b.brand_name} festival partnership` + (db.source.opportunities.some((x) => x.brand_id === b.brand_id) ? ' (new)' : '');
        db.source.opportunities.push({ opportunity_name: name, brand_name: b.brand_name, primary_contact_name: '', originating_campaign_name: campName($('#f_camp', el).value), support_type: $('#f_type', el).value, created_at: at, opportunity_id: id, brand_id: b.brand_id, primary_contact_id: '', sponsor_campaign_id: $('#f_camp', el).value });
        db.source.opportunity_history.push({ opportunity_name: name, brand_name: b.brand_name, stage: $('#f_stage', el).value, proposed_value_inr: +$('#f_prop', el).value || 0, confirmed_value_inr: 0, owner_name: owner, effective_at: at, history_id: nextId('OHU'), opportunity_id: id, brand_id: b.brand_id, owner_id: oid });
        audit('opportunity_create', `${name} (${campName($('#f_camp', el).value)})`); save(); closeModal(); render(); toast('Opportunity created');
      };
    });
  }

  function paymentForm(id) {
    const o = E.snapshot(db, ui.asOf).opps.find((x) => x.opportunity_id === id);
    modal(`<h3>Log payment · ${esc(o.brand_name)}</h3><div class="form"><label>Amount (₹)</label><input id="f_amt" type="number" min="1" value="${o.confirmed_value_inr}"><label>Received on</label><input id="f_date" type="date" value="${ui.asOf}"><label>Reference</label><input id="f_ref" placeholder="UTR / invoice no."></div>
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Save payment</button></div>`, (el) => {
      $('#f_save', el).onclick = () => { const amt = +$('#f_amt', el).value; if (!(amt > 0)) return toast('Enter an amount'); const d = $('#f_date', el).value || ui.asOf;
        db.app.payments.push({ payment_id: nextId('PAY'), opportunity_id: id, brand_name: o.brand_name, amount_inr: amt, received_at: `${d}T18:00:00+05:30`, reference: $('#f_ref', el).value, logged_at: new Date().toISOString() });
        audit('payment_logged', `${o.brand_name}: ${inr(amt)} on ${d}`); save(); closeModal(); render(); toast('Payment logged'); };
    });
  }

  function taskForm(id, preset = {}) {
    const t = id ? db.app.tasks.find((x) => x.id === id) : { title: '', owner: '', due: ui.asOf, status: 'todo', priority: 'medium', campaign_id: '', opportunity_id: '', notes: '', ...preset };
    modal(`<h3>${id ? 'Edit task' : 'New task'}</h3><div class="form">
      <label>Title</label><input id="f_title" value="${esc(t.title)}"><label>Owner</label><select id="f_owner"><option value="">Unassigned</option>${ownerOptions(t.owner)}</select>
      <label>Due</label><input id="f_due" type="date" value="${esc(t.due || '')}"><label>Status</label><select id="f_status">${['todo', 'in_progress', 'done'].map((s) => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label>Priority</label><select id="f_pri">${['high', 'medium', 'low'].map((s) => `<option ${t.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label>Campaign</label><select id="f_camp"><option value="">—</option>${campaigns().map((c) => `<option value="${c.sponsor_campaign_id}" ${t.campaign_id === c.sponsor_campaign_id ? 'selected' : ''}>${esc(c.campaign_name)}</option>`).join('')}</select>
      <label>Opportunity ID</label><input id="f_opp" value="${esc(t.opportunity_id || '')}"><label>Notes</label><textarea id="f_notes" rows="2">${esc(t.notes || '')}</textarea></div>
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Save</button></div>`, (el) => {
      $('#f_save', el).onclick = () => {
        const v = { title: $('#f_title', el).value.trim(), owner: $('#f_owner', el).value, due: $('#f_due', el).value, status: $('#f_status', el).value, priority: $('#f_pri', el).value, campaign_id: $('#f_camp', el).value, opportunity_id: $('#f_opp', el).value.trim(), notes: $('#f_notes', el).value };
        if (!v.title) return toast('Title required');
        if (id) Object.assign(t, v); else db.app.tasks.push({ id: nextId('TK'), ...v, source: preset.source || 'manual', created_at: stamp() });
        audit(id ? 'task_update' : 'task_create', v.title); save(); closeModal(); render(); toast('Task saved');
      };
    });
  }

  function quickTask(key) {
    if (key === 'stalled') { const st = E.stalled(db, ui.asOf, 14); return taskForm(null, { title: `Chase or close ${st.length} stalled deals (oldest ${st[0] ? st[0].days_since_last_change : 0}d)`, priority: 'high', notes: st.slice(0, 8).map((o) => o.brand_name).join(', ') }); }
    if (key.startsWith('camp:')) { const id = key.slice(5); return taskForm(null, { title: `Review ${campName(id)}`, campaign_id: id }); }
    if (key.startsWith('opp:')) { const o = E.snapshot(db, ui.asOf).opps.find((x) => x.opportunity_id === key.slice(4)); return taskForm(null, { title: `Follow up: ${o.brand_name} (${o.stage})`, owner: o.owner_name, opportunity_id: o.opportunity_id, campaign_id: o.campaign_id }); }
  }

  function targetForm() {
    const cur = E.funnel(db, ui.asOf).target || {};
    modal(`<h3>New target version</h3><div class="form"><label>Label</label><input id="f_lbl" value="Revised plan ${ui.asOf}"><label>Qualified brands goal</label><input id="f_q" type="number" value="${cur.qualified_brands_goal || ''}"><label>Confirmed partnerships goal</label><input id="f_c" type="number" value="${cur.confirmed_partnerships_goal || ''}"></div>
      <div class="acts"><button data-act="closeModal">Cancel</button><button class="primary" id="f_save">Save</button></div>`, (el) => {
      $('#f_save', el).onclick = () => { db.source.targets.push({ effective_at: `${ui.asOf}T09:00:00+05:30`, qualified_brands_goal: +$('#f_q', el).value, confirmed_partnerships_goal: +$('#f_c', el).value, target_version: $('#f_lbl', el).value }); audit('target_create', $('#f_lbl', el).value); save(); closeModal(); render(); toast('Target saved'); };
    });
  }

  function brandDrawer(bid) {
    const d = E.brandDetails(db, ui.asOf, bid); if (!d.found) return toast(d.message || 'Not found');
    const b = d.brand; const q = d.latest_qualification;
    modal(`<h3>${esc(b.brand_name)} <span class="tag">${esc(b.industry)}</span></h3><div class="muted tiny">Owner ${esc(b.owner_name)} · ${esc(b.brand_id)} · latest status <b>${esc(q ? q.qualification_status : 'none')}</b>${q ? ' — ' + esc(q.reason) : ''}</div>
      <div class="drawer-section"><b>Contacts</b><div class="tiny">${d.contacts.map((c) => `${esc(c.contact_name)} (${esc(c.job_title)})`).join(' · ') || '—'}</div></div>
      <div class="drawer-section"><b>Opportunities</b><div class="tiny">${d.opportunities.map((o) => `${esc(o.opportunity_name)}: <b>${o.stage}</b> ${inr(o.confirmed_value_inr || o.proposed_value_inr)}`).join('<br>') || '—'}</div></div>
      <div class="drawer-section"><b>Timeline</b><div class="timeline">${[...d.interactions.map((i) => ({ at: i.occurred_at, txt: `${i.event} · ${i.outcome} · ${i.contact} · ${i.campaign}` })), ...d.qualification_history.map((h) => ({ at: h.effective_at, txt: `<b>status → ${h.status}</b> (${h.reason})` }))].sort((a, b2) => a.at.localeCompare(b2.at)).map((x) => `<div><span class="muted">${esc(x.at.slice(0, 16).replace('T', ' '))}</span> ${x.txt.startsWith('<b>') ? x.txt : esc(x.txt)}</div>`).join('')}</div></div>
      <div class="drawer-section form"><label>Change status</label><div><select id="f_qs">${['unreviewed', 'engaged', 'qualified', 'unqualified', 'dormant'].map((s) => `<option ${q && q.qualification_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select> <input id="f_qr" placeholder="Reason" style="width:55%"></div>
      <label>Log interaction</label><div><select id="f_ev">${['outreach_sent', 'replied:positive', 'replied:neutral', 'replied:not_interested', 'meeting_booked', 'meeting_held', 'opt_out'].map((s) => `<option>${s}</option>`).join('')}</select> <select id="f_ic">${campaigns().map((c) => `<option value="${c.sponsor_campaign_id}">${esc(c.campaign_name)}</option>`).join('')}</select></div></div>
      <div class="acts"><button data-act="closeModal">Close</button><button id="f_logi">Log interaction</button><button class="primary" id="f_saveq">Save status</button></div>`, (el) => {
      $('#f_saveq', el).onclick = () => { const s = $('#f_qs', el).value; const camp = q ? q.sponsor_campaign_id : ''; db.source.qualification_history.push({ brand_name: b.brand_name, qualification_status: s, reason: $('#f_qr', el).value || 'Updated in Growth Center', source_campaign_name: campName(camp), effective_at: stamp(), history_id: nextId('BQU'), brand_id: b.brand_id, sponsor_campaign_id: camp }); audit('qualification_update', `${b.brand_name} → ${s}`); save(); closeModal(); render(); toast('Status saved'); };
      $('#f_logi', el).onclick = () => { const [ev, out] = $('#f_ev', el).value.split(':'); const cid = $('#f_ic', el).value; const camp = campaigns().find((c) => c.sponsor_campaign_id === cid); const ct = d.contacts[0] || {};
        const outcome = out || { outreach_sent: 'sent', meeting_booked: 'scheduled', meeting_held: 'attended', opt_out: 'do_not_contact' }[ev];
        db.source.interactions.push({ brand_name: b.brand_name, contact_name: ct.contact_name || '', campaign_name: camp.campaign_name, channel: camp.channel, event_type: ev, outcome, summary: 'Logged in Growth Center.', occurred_at: stamp(), interaction_id: nextId('SIU'), attempt_id: ev === 'outreach_sent' ? nextId('SAU') : '', origin_interaction_id: null, brand_id: b.brand_id, contact_id: ct.contact_id || '', sponsor_campaign_id: cid, owner_id: camp.owner_id });
        audit('interaction_logged', `${b.brand_name}: ${ev} ${outcome}`); save(); closeModal(); render(); toast('Interaction logged'); };
    });
  }

  // xlsx import: dates read as raw serials and converted to IST wall-clock text (no browser-timezone drift).
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.name.endsWith('.json')) { const j = JSON.parse(await file.text()); if (j.source && j.app) db = j; else if (j.brands) db.source = j; else throw new Error('Unrecognised JSON'); }
      else {
        if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the xlsx parser (needs internet).')); document.head.appendChild(s); });
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const map = { Event: 'event', Targets: 'targets', Brands: 'brands', 'Sponsor contacts': 'contacts', 'Sponsor campaigns': 'campaigns', 'Sponsor interactions': 'interactions', 'Brand qualification': 'qualification_history', 'Partner opportunities': 'opportunities', 'Opportunity history': 'opportunity_history', 'Sponsor activations': 'activations' };
        const src = {};
        for (const [sheet, key] of Object.entries(map)) {
          const ws = wb.Sheets[sheet]; if (!ws) throw new Error('Missing sheet: ' + sheet);
          src[key] = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null }).map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = convertCell(k, v); return o; });
        }
        db.source = src;
      }
      audit('import', file.name); save(); toast('Imported ' + file.name); ui.asOf = db.source.event[0].history_end; $('#asOf').value = ui.asOf; render();
    } catch (e) { alert('Import failed: ' + e.message); }
  }
  function convertCell(k, v) {
    const isDate = /(_at|^history_start|^history_end)$/.test(k);
    if (!isDate || v == null || v === '') return v;
    let iso;
    if (typeof v === 'number') { const ms = Math.round((v - 25569) * 86400000); iso = new Date(ms).toISOString().slice(0, 19); }
    else iso = String(v).replace(' ', 'T').slice(0, 19);
    if (k === 'history_start' || k === 'history_end') return iso.slice(0, 10);
    return /[+-]\d\d:\d\d$|Z$/.test(String(v)) ? String(v) : iso + '+05:30';
  }

  // =====================================================================
  //                       AI GROWTH ANALYST (Gemini)
  // =====================================================================
  const chat = JSON.parse(localStorage.getItem(LS_CHAT) || 'null') || { contents: [], display: [], proposals: {} };
  chat.proposals ||= {};
  function persistChat() { try { localStorage.setItem(LS_CHAT, JSON.stringify({ contents: chat.contents.slice(-40), display: chat.display.slice(-60), proposals: chat.proposals })); } catch (e) {} }
  const SUGGEST = ['Why did we miss the confirmed partnerships target?', 'When would we have known cold email was failing?', 'What if renewals only hit 30%? Can we still make ₹40L?', 'Which campaigns should we scale, change or stop?', 'Which stalled deals should we chase first?', 'How much cash have we actually collected?', 'Compare industries by confirmed value', 'What did the funnel look like on 1 March?'];

  function systemPrompt() {
    const ev = db.source.event[0];
    return `You are the embedded AI Growth Analyst inside the Sponsor Growth Center for ${ev.event_name} (a fictional ${ev.currency} dataset; event ${ev.event_starts_at} to ${ev.event_ends_at}; records ${ev.history_start} to ${ev.history_end}).
The user is on the sponsorship growth team. The dashboard's selected as-of date is ${ui.asOf} (end of day, Asia/Kolkata). Use it unless the user names another date.

GROUNDING RULES (strict):
1. Every number you state must come from a tool result in this conversation. Never use outside knowledge or guess numbers. If you have not fetched it, call a tool.
2. For any arithmetic beyond reading a value (ratios, differences, growth, per-unit cost, what-ifs) call the calculate tool and use its result.
3. Data changes: always re-fetch with tools for each new question; never reuse numbers from earlier turns if the data could have changed.
4. Keep populations distinct: outreach attempts ≠ contacts ≠ brands reached ≠ responding brands ≠ qualified brands ≠ opportunities ≠ confirmed partnerships. A positive reply is not qualification; qualification is not a confirmed partnership.
5. Confirmed value is a reported amount, NOT cash received. Cash collected = payments logged in the app only. Activations are associations, not causal uplift. Campaign budgets/spend marked "simulated" are illustrative, say so whenever you use them.
6. If the data cannot answer (e.g. bank receipts, real 2025 spend, causal impact, reasons not recorded, future outcomes), say clearly "The data can't answer that" and explain what is missing and what would be needed. Use get_data_dictionary when unsure what exists.
7. Distinguish EVIDENCE (from data) from ASSUMPTION/JUDGEMENT (your inference). Label recommendations with the evidence they rest on and their uncertainty, especially with small samples (<10).
8. Decision rules used by the team (also in get_campaign_performance): lagging, once ≥8 brands are ≥21 days past first touch: SCALE if ≥35% of that mature cohort became confirmed partners, CHANGE 15–35%, STOP <15%. Leading, before that: LEAN-SCALE if meeting rate ≥50% on ≥5 brands, WARNING if <20% on ≥15 brands. Deals with no stage change for ≥14 days are "stalled". get_backtest replays these rules on history; run_scenario is the 2026 Bengaluru plan model (assumptions — label it as a plan, not data).
9. ACTIONS: you cannot change data directly. To create a task or change a campaign, call propose_task / propose_campaign_update; the user must confirm in the UI. Only propose when the user asks for an action or clearly agrees; describe what you proposed and that it awaits confirmation.
10. Answer follow-up questions using conversation context (e.g. "that campaign", "those deals"), re-querying as needed.

STYLE: concise, human and direct. Lead with the answer, then 2–5 bullets of evidence (with numbers and the as-of date), then a recommendation if relevant. Use INR with lakh notation where helpful (₹1L = ₹100,000). Use a small markdown table only when comparing several items.`;
  }

  const S_ = (d) => ({ type: 'STRING', description: d }), N_ = (d) => ({ type: 'NUMBER', description: d }), I_ = (d) => ({ type: 'INTEGER', description: d });
  const ASOF = S_('Snapshot date YYYY-MM-DD (end of day IST). Omit to use the dashboard date.');
  const TOOLS = [{ functionDeclarations: [
    { name: 'get_overview', description: 'Full sponsor funnel (brands reached → replied → positive → meetings → qualified → opportunities → proposals → confirmed), activity counts, qualification and stage counts, confirmed/cash/in-kind value, open pipeline, cash collected, target in force with attainment and gap, and stage-weighted projection. Optional filters.', parameters: { type: 'OBJECT', properties: { as_of: ASOF, campaign: S_('Campaign name or ID to filter'), industry: S_('Industry to filter'), owner: S_('Team member name to filter') } } },
    { name: 'get_campaign_performance', description: 'Per-campaign table: attempts, brands reached, reply/positive/meeting rates, qualified, opportunities, confirmed, value, open/stalled pipeline, lost, brand→confirmed %, budget/spend (with source flag), cost per partner, and a rule-based SCALE/CHANGE/STOP call with reason.', parameters: { type: 'OBJECT', properties: { as_of: ASOF } } },
    { name: 'get_breakdown', description: 'Compare groups by brands reached, meetings, qualified, opportunities, confirmed, confirmed value, open pipeline, brand→confirmed %.', parameters: { type: 'OBJECT', properties: { dimension: { type: 'STRING', enum: ['industry', 'owner', 'channel', 'campaign', 'support_type'] }, as_of: ASOF }, required: ['dimension'] } },
    { name: 'list_stalled_deals', description: 'Open opportunities with no stage change for at least N days (default 14), oldest first, with stage, value, owner, campaign.', parameters: { type: 'OBJECT', properties: { min_days: I_('Minimum days without change, default 14'), as_of: ASOF } } },
    { name: 'get_trend', description: 'Time series from the start of the records to the as-of date: qualified brands, confirmed partnerships, meetings, opportunities, confirmed value, cash collected, and goals in force at each point.', parameters: { type: 'OBJECT', properties: { as_of: ASOF, interval_days: I_('Spacing in days, default 7') } } },
    { name: 'get_brand_details', description: 'Everything about one brand: contacts, qualification history, interaction timeline, opportunities, activations, payments.', parameters: { type: 'OBJECT', properties: { brand: S_('Brand name or ID'), as_of: ASOF }, required: ['brand'] } },
    { name: 'query_data', description: 'Flexible as-of-aware query over cleaned tables for questions the reports do not cover. Tables: brands, contacts, campaigns, interactions, qualification_history, qualification_latest, opportunities (latest stage joined: stage, proposed_value_inr, confirmed_value_inr, support_type, campaign_name, channel, industry, owner_name, days_since_last_change, stages_reached), opportunity_history, activations, tasks, payments, targets. If a field name is wrong the error lists available fields.', parameters: { type: 'OBJECT', properties: {
      table: { type: 'STRING', enum: E.TABLES }, as_of: ASOF,
      filters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { field: S_('Field name'), op: { type: 'STRING', enum: ['eq', 'neq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'is_null', 'not_null'] }, value: S_('Comparison value (comma-separated for in)') }, required: ['field', 'op'] } },
      group_by: { type: 'ARRAY', items: { type: 'STRING' } },
      metrics: { type: 'ARRAY', items: { type: 'OBJECT', properties: { op: { type: 'STRING', enum: ['count', 'count_distinct', 'sum', 'avg', 'median', 'min', 'max'] }, field: S_('Field (not needed for count)'), as: S_('Output name') }, required: ['op'] } },
      fields: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Columns to return when not aggregating' }, sort_by: S_('Field to sort by'), sort_dir: { type: 'STRING', enum: ['asc', 'desc'] }, limit: I_('Max rows, default 50') }, required: ['table'] } },
    { name: 'calculate', description: 'Exact arithmetic. Use for every ratio, difference, percentage, growth or what-if calculation.', parameters: { type: 'OBJECT', properties: { expression: S_('Arithmetic expression, e.g. (2240000-1505000)/1505000*100') }, required: ['expression'] } },
    { name: 'get_data_dictionary', description: 'What data exists, cleaning rules applied, and what the data does NOT contain. Use before saying something cannot be answered.' },
    { name: 'get_backtest', description: 'Replay of the dashboard decision rules at every weekly Monday review in the history (no hindsight): when each campaign was first flagged WARNING/STOP or LEAN-SCALE/SCALE, and what activity (sends, new brands, deals, confirmations) happened after the flag. Use for "when would we have known", "what did we waste", leading-indicator questions.', parameters: { type: 'OBJECT', properties: { as_of: ASOF } } },
    { name: 'run_scenario', description: 'What-if on the 2026 Bengaluru plan model (Slide 1): streams renewals, warm, creator, inbound, abm; levers prospects, conversation_rate, proposal_rate, sign_rate, avg_deal_inr; plus cash_share and collection. Returns signed value, cash signed, cash collected, multiple vs 2025, 2025 anchors per stream, sensitivity, and gap to goal. This is a plan model built on assumptions, not observed data. Does not save anything.', parameters: { type: 'OBJECT', properties: {
      preset: { type: 'STRING', enum: ['current', 'base', 'stretch'], description: 'Starting point; current = the plan saved in the simulator' },
      changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { stream: { type: 'STRING', enum: ['renewals', 'warm', 'creator', 'inbound', 'abm'] }, lever: { type: 'STRING', enum: ['prospects', 'conversation_rate', 'proposal_rate', 'sign_rate', 'avg_deal_inr'] }, value: N_('New value. Rates in percent (e.g. 60 = 60%), prospects as a count, deal size in INR') }, required: ['stream', 'lever', 'value'] } },
      cash_share_pct: N_('Cash share of signed value, percent'), collection_pct: N_('Share of cash signed that is collected before the fest, percent'), goal_lakh: N_('Cash-collected goal in lakh INR') } } },
    { name: 'list_tasks', description: 'Current tasks/action items with owner, due date, status, priority, linked campaign/opportunity.', parameters: { type: 'OBJECT', properties: { status: { type: 'STRING', enum: ['todo', 'in_progress', 'done', 'open', 'all'] }, owner: S_('Owner name') } } },
    { name: 'propose_task', description: 'Propose a new task. It is NOT created until the user clicks Confirm in the UI.', parameters: { type: 'OBJECT', properties: { title: S_('Short actionable title'), owner: S_('Team member name'), due_date: S_('YYYY-MM-DD'), priority: { type: 'STRING', enum: ['high', 'medium', 'low'] }, campaign: S_('Related campaign name or ID'), opportunity_id: S_('Related opportunity ID'), rationale: S_('Why, citing the data') }, required: ['title', 'rationale'] } },
    { name: 'propose_campaign_update', description: 'Propose changing a campaign status, budget, spend or notes. NOT applied until the user confirms in the UI.', parameters: { type: 'OBJECT', properties: { campaign: S_('Campaign name or ID'), status: { type: 'STRING', enum: ['planned', 'active', 'paused', 'stopped', 'completed'] }, budget_inr: N_('New budget'), spent_inr: N_('New spent'), notes: S_('Notes'), rationale: S_('Why, citing the data') }, required: ['campaign', 'rationale'] } },
  ] }];

  const resolveCampaign = (x) => { if (!x) return null; const s = String(x).toLowerCase(); const c = campaigns().find((c) => c.sponsor_campaign_id.toLowerCase() === s || c.campaign_name.toLowerCase() === s) || campaigns().find((c) => c.campaign_name.toLowerCase().includes(s)); return c || null; };
  const resolveOwner = (x) => { if (!x) return null; const s = String(x).toLowerCase(); const e = Object.entries(team()).find(([id, n]) => id.toLowerCase() === s || n.toLowerCase() === s) || Object.entries(team()).find(([, n]) => n.toLowerCase().includes(s)); return e ? { id: e[0], name: e[1] } : null; };
  const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));

  function runTool(name, a = {}) {
    const asOf = validDate(a.as_of) ? a.as_of : ui.asOf;
    const note = a.as_of && !validDate(a.as_of) ? { warning: `as_of "${a.as_of}" is not YYYY-MM-DD; used ${ui.asOf}` } : {};
    switch (name) {
      case 'get_overview': {
        const f = {}; const miss = [];
        if (a.campaign) { const c = resolveCampaign(a.campaign); c ? (f.campaign_id = c.sponsor_campaign_id) : miss.push(`campaign "${a.campaign}" not found`); }
        if (a.owner) { const o = resolveOwner(a.owner); o ? (f.owner_id = o.id) : miss.push(`owner "${a.owner}" not found`); }
        if (a.industry) { const ind = [...new Set(db.source.brands.map((b) => b.industry))].find((i) => i.toLowerCase() === String(a.industry).toLowerCase()); ind ? (f.industry = ind) : miss.push(`industry "${a.industry}" not found`); }
        if (miss.length) return { error: miss.join('; '), available_campaigns: campaigns().map((c) => c.campaign_name), available_owners: Object.values(team()), available_industries: [...new Set(db.source.brands.map((b) => b.industry))] };
        return { ...note, ...E.funnel(db, asOf, f) };
      }
      case 'get_campaign_performance': return { ...note, as_of: asOf, campaigns: E.campaignTable(db, asOf) };
      case 'get_breakdown': return { ...note, as_of: asOf, dimension: a.dimension, groups: E.breakdown(db, asOf, a.dimension || 'industry') };
      case 'list_stalled_deals': { const d = E.stalled(db, asOf, a.min_days || 14); return { ...note, as_of: asOf, min_days: a.min_days || 14, count: d.length, total_face_value_inr: d.reduce((x, o) => x + (o.proposed_value_inr || 0), 0), deals: d.map((o) => ({ opportunity_id: o.opportunity_id, brand: o.brand_name, stage: o.stage, proposed_value_inr: o.proposed_value_inr, owner: o.owner_name, campaign: o.campaign_name, days_since_last_change: o.days_since_last_change, last_change_at: o.last_change_at })) }; }
      case 'get_trend': return { ...note, as_of: asOf, points: E.trend(db, asOf, a.interval_days || 7) };
      case 'get_brand_details': return { ...note, as_of: asOf, ...E.brandDetails(db, asOf, a.brand) };
      case 'query_data': return { ...note, ...E.query(db, asOf, a) };
      case 'calculate': return E.calculate(a.expression);
      case 'get_data_dictionary': return E.dataDictionary(db);
      case 'get_backtest': { const b = E.backtest(db, asOf); return { ...note, as_of: asOf, reviews: b.reviews, rules: b.rules, campaigns: b.campaigns }; }
      case 'run_scenario': {
        const p = a.preset === 'base' || a.preset === 'stretch' ? { ...E.planFrom(a.preset), goal_inr: currentPlan().goal_inr } : JSON.parse(JSON.stringify(currentPlan()));
        const applied = [];
        for (const ch of a.changes || []) { if (!p.streams[ch.stream] || !E.LEVERS.includes(ch.lever)) { applied.push({ ...ch, error: 'unknown stream or lever' }); continue; } const v = ch.lever.endsWith('_rate') ? (ch.value > 1 ? ch.value / 100 : ch.value) : ch.value; p.streams[ch.stream][ch.lever] = v; applied.push({ ...ch, applied_value: v }); }
        if (a.cash_share_pct != null) p.cash_share = a.cash_share_pct > 1 ? a.cash_share_pct / 100 : a.cash_share_pct;
        if (a.collection_pct != null) p.collection = a.collection_pct > 1 ? a.collection_pct / 100 : a.collection_pct;
        if (a.goal_lakh != null) p.goal_inr = a.goal_lakh * 100000;
        const r = E.runScenario(db, p); return { starting_point: a.preset || 'current', changes_applied: applied, goal_inr: p.goal_inr || null, gap_to_goal_inr: p.goal_inr ? p.goal_inr - r.totals.cash_collected_inr : null, ...r };
      }
      case 'list_tasks': { let t = db.app.tasks; if (a.status && a.status !== 'all') t = t.filter((x) => (a.status === 'open' ? x.status !== 'done' : x.status === a.status)); if (a.owner) t = t.filter((x) => (x.owner || '').toLowerCase().includes(String(a.owner).toLowerCase())); return { as_of_for_overdue: ui.asOf, count: t.length, tasks: t.map((x) => ({ ...x, overdue: x.status !== 'done' && x.due && x.due < ui.asOf, campaign: campName(x.campaign_id) })) }; }
      case 'propose_task': {
        const o = a.owner ? resolveOwner(a.owner) : null; const c = a.campaign ? resolveCampaign(a.campaign) : null;
        const pid = 'P' + Date.now().toString(36);
        chat.proposals[pid] = { kind: 'task', status: 'pending', data: { title: a.title, owner: o ? o.name : '', due: validDate(a.due_date) ? a.due_date : '', priority: a.priority || 'medium', campaign_id: c ? c.sponsor_campaign_id : '', opportunity_id: a.opportunity_id || '', notes: a.rationale || '' } };
        pendingCards.push(pid);
        return { status: 'awaiting_user_confirmation', proposal_id: pid, preview: chat.proposals[pid].data, warnings: [a.owner && !o ? `owner "${a.owner}" not found; left unassigned` : null, a.campaign && !c ? `campaign "${a.campaign}" not found` : null].filter(Boolean) };
      }
      case 'propose_campaign_update': {
        const c = resolveCampaign(a.campaign); if (!c) return { error: `Campaign "${a.campaign}" not found`, available: campaigns().map((x) => x.campaign_name) };
        const pid = 'P' + Date.now().toString(36); const ch = {}; ['status', 'budget_inr', 'spent_inr', 'notes'].forEach((k) => a[k] != null && (ch[k] = a[k]));
        chat.proposals[pid] = { kind: 'campaign', status: 'pending', data: { campaign_id: c.sponsor_campaign_id, campaign_name: c.campaign_name, changes: ch, rationale: a.rationale } };
        pendingCards.push(pid);
        return { status: 'awaiting_user_confirmation', proposal_id: pid, preview: chat.proposals[pid].data };
      }
      default: return { error: 'Unknown tool ' + name };
    }
  }
  let pendingCards = [];

  async function callModel(contents) {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt() }] }, tools: TOOLS, userKey: settings.apiKey || undefined, model: settings.model || undefined }) });
    let j; try { j = await r.json(); } catch (e) { throw new Error(`AI service returned ${r.status}. Is the /api/chat backend deployed?`); }
    if (!r.ok || j.error) throw new Error(j.error || `AI service error ${r.status}`);
    return j;
  }

  async function runAgent(contents, onStep) {
    const toolsUsed = [], results = []; pendingCards = [];
    for (let step = 0; step < 10; step++) {
      const res = await callModel(contents);
      const content = res.content || { role: 'model', parts: [] };
      if (!content.role) content.role = 'model';
      contents.push(content);
      const calls = (content.parts || []).filter((p) => p.functionCall);
      if (!calls.length) {
        const txt = (content.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim();
        return { text: txt || '(No answer returned. Try rephrasing.)', tools: toolsUsed, results, model: res.model, cards: pendingCards.slice() };
      }
      const responses = calls.map((p) => {
        const { name, args } = p.functionCall; let out;
        try { out = runTool(name, args || {}); } catch (e) { out = { error: e.message }; }
        toolsUsed.push(name + (args && args.table ? `(${args.table})` : args && args.dimension ? `(${args.dimension})` : ''));
        let str = JSON.stringify(out); if (str.length > 60000) { out = { truncated: true, note: 'Result too large; narrow the query (filters/group_by/limit).', preview: str.slice(0, 60000) }; str = JSON.stringify(out); }
        results.push(str);
        const fr = { name, response: { result: out } }; if (p.functionCall.id) fr.id = p.functionCall.id;
        return { functionResponse: fr };
      });
      contents.push({ role: 'user', parts: responses });
      onStep && onStep(toolsUsed);
    }
    return { text: 'I stopped after 10 tool steps without a final answer. Please narrow the question.', tools: toolsUsed, results, cards: pendingCards.slice() };
  }

  // ---- Grounding check: is every number in the answer traceable to a tool result? (heuristic) ----
  const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  function answerNumbers(text) {
    let t = String(text).replace(/\d{4}-\d{2}-\d{2}(T[\d:.+]+)?/g, ' ').replace(new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})[a-z]*`, 'gi'), ' ').replace(new RegExp(`\\b(${MONTHS})[a-z]*\\s+\\d{1,2}\\b`, 'gi'), ' ')
      .replace(/\b(19|20)\d\d\b/g, ' ').replace(/^\s*\d+[.)]\s/gm, ' ').replace(/\b(SC|TK|OHU|OU|AU|PAY|SI|SA|BQ|OH|O|A|T|C|L|SCON)\d+\b/g, ' ').replace(/≥|≤|>=|<=/g, ' ');
    const out = []; const re = /(₹\s?)?(\d[\d,]*(?:\.\d+)?)\s?(%|lakhs?\b|L\b|k\b|K\b|Cr\b|crores?\b|x\b|×)?/g; let m;
    while ((m = re.exec(t))) { let v = parseFloat(m[2].replace(/,/g, '')); if (!isFinite(v)) continue; const u = (m[3] || '').toLowerCase();
      if (u.startsWith('l')) v *= 1e5; else if (u === 'k') v *= 1e3; else if (u.startsWith('cr')) v *= 1e7;
      out.push({ raw: m[0].trim(), v, unit: u }); }
    return out;
  }
  function toolNumbers(results) {
    const nums = [];
    const walk = (x) => { if (x == null) return; if (typeof x === 'number') nums.push(x); else if (typeof x === 'string') { (x.match(/-?\d+(?:\.\d+)?/g) || []).forEach((n) => nums.push(parseFloat(n))); } else if (Array.isArray(x)) x.forEach(walk); else if (typeof x === 'object') Object.values(x).forEach(walk); };
    results.forEach((r) => { try { walk(JSON.parse(r)); } catch (e) {} });
    return nums;
  }
  function numMatch(v, nums, unit) {
    const tol = (t) => (Math.abs(t) >= 1000 ? Math.max(Math.abs(t) * 0.015, unit && unit.startsWith('l') ? 5000 : 0) : 0.06);
    return nums.some((t) => Math.abs(t - v) <= tol(t) || (unit === '%' && Math.abs(t * 100 - v) <= 0.6) || Math.abs(Math.abs(t) - v) <= tol(t));
  }
  function grounding(text, results) {
    const nums = toolNumbers(results); const found = answerNumbers(text).filter((x) => !(x.v <= 1 && !x.unit && Number.isInteger(x.v)));
    if (!found.length) return null;
    const untraced = found.filter((x) => !numMatch(x.v, nums, x.unit)).map((x) => x.raw);
    return { total: found.length, traced: found.length - untraced.length, untraced: [...new Set(untraced)] };
  }

  let busy = false;
  async function ask(text) {
    if (busy) return; busy = true; $('#chatSend').disabled = true;
    const mark = chat.contents.length;
    chat.display.push({ role: 'user', text }); chat.contents.push({ role: 'user', parts: [{ text: `[as-of ${ui.asOf}] ${text}` }] });
    renderChat(true);
    try {
      const r = await runAgent(chat.contents, (t) => renderChat(true, t));
      chat.display.push({ role: 'bot', text: r.text, tools: r.tools, model: r.model, cards: r.cards, grounding: grounding(r.text, r.results) });
    } catch (e) {
      chat.display.push({ role: 'err', text: e.message });
      chat.contents.length = mark; // drop the failed turn so the next question starts clean
    }
    busy = false; $('#chatSend').disabled = false; persistChat(); renderChat();
  }

  // ---- AI self-test: questions with expected answers recomputed from the CURRENT data ----
  const HONEST = /(can't|cannot|can not|isn't|is not|not (in|available|recorded|tracked|captured|possible|enough|proof|evidence|been)|no (data|record|payment|evidence|information|receipt|cash)|0 payments?|zero payments?|doesn't|does not|unable|insufficient|don't have|do not have|not establish|association|not proof|not cash|≠)/i;  function evalCases() {
    const A = ui.asOf; const f = E.funnel(db, A); const g = Object.fromEntries(f.steps.map((x) => [x.key, x.value])); const ct = E.campaignTable(db, A);
    const byName = (n) => ct.find((c) => c.campaign_name === n) || {}; const topVal = Math.max(...ct.map((c) => c.confirmed_value_inr));
    const S = E.snapshot(db, A); const ik = S.opps.filter((o) => o.stage === 'partner_confirmed' && o.support_type !== 'cash');
    const qi = E.query(db, A, { table: 'qualification_latest', filters: [{ field: 'qualification_status', op: 'eq', value: 'qualified' }], group_by: ['industry'], metrics: [{ op: 'count' }] }).rows; const qmax = Math.max(...qi.map((r) => r.count));
    const li = byName('Brand Leader LinkedIn'); const f0301 = E.funnel(db, '2025-03-01');
    return [
      { q: 'How many confirmed partnerships do we have, and what is the current goal?', nums: [g.confirmed, f.target && f.target.confirmed_partnerships_goal] },
      { q: 'What is the total confirmed partnership value?', nums: [f.value.confirmed_value_inr] },
      { q: 'How many unique brands did the Brand Discovery Email campaign reach?', nums: [byName('Brand Discovery Email').brands_reached] },
      { q: 'Which campaign has produced the most confirmed value?', names: ct.filter((c) => c.confirmed_value_inr === topVal).map((c) => c.campaign_name), any: true },
      { q: 'How many open deals have gone 14 or more days without a stage change?', nums: [E.stalled(db, A, 14).length] },
      { q: 'How many confirmed partnerships did we have as of 1 March 2025, and which target plan was in force then?', nums: [f0301.steps.find((x) => x.key === 'confirmed').value], names: [f0301.target ? f0301.target.version : ''] },
      { q: 'What is the average confirmed value of in-kind partnerships?', nums: [ik.length ? ik.reduce((a, o) => a + o.confirmed_value_inr, 0) / ik.length : 0] },
      { q: 'Which industry has the most qualified brands right now?', names: qi.filter((r) => r.count === qmax).map((r) => r.industry), any: true },
      { q: 'How much cash have we actually received from sponsors?', nums: [f.value.cash_collected_inr], honest: f.value.cash_collected_inr === 0 },
      { q: 'Did the Beardo sponsor activation increase festival attendance?', honest: true },
      { q: 'How much did we spend on the Brand Leader LinkedIn campaign?', nums: li.spent_inr != null ? [li.spent_inr] : [], words: li.budget_source === 'simulated' ? ['simulat'] : [], honest: li.spent_inr == null },
      { q: 'What percentage of brands reached by Creator Network Referrals became confirmed partners?', nums: [byName('Creator Network Referrals').brand_to_confirmed_pct] },
    ];
  }
  function gradeCase(c, text) {
    const nums = answerNumbers(text); const why = [];
    for (const n of c.nums || []) { if (n == null) continue; const ok = nums.some((x) => Math.abs(x.v - n) <= Math.max(Math.abs(n) * 0.015, n >= 100000 ? 5000 : 0.06) || (n === 0 && /\b(no|zero|nil|₹0|0)\b/i.test(text))); if (!ok) why.push(`missing ${n}`); }
    if (c.names && c.names.length) { const hits = c.names.filter((n) => n && text.toLowerCase().includes(n.toLowerCase())); if (c.any ? !hits.length : hits.length < c.names.filter(Boolean).length) why.push(`expected ${c.names.join(' / ')}`); }
    for (const w of c.words || []) if (!text.toLowerCase().includes(w)) why.push(`should mention "${w}"`);
    if (c.honest && !HONEST.test(text)) why.push('should say the data cannot fully answer');
    return { pass: !why.length, why };
  }
  async function runEval() {
    if (busy) return toast('Wait for the current chat answer'); busy = true;
    const cases = evalCases(); const out = []; db.app.eval_last = { started: new Date().toISOString(), as_of: ui.asOf, results: out, running: true }; render();
    for (const c of cases) {
      try { const contents = [{ role: 'user', parts: [{ text: `[as-of ${ui.asOf}] ${c.q}` }] }]; const r = await runAgent(contents); const gr = gradeCase(c, r.text);
        out.push({ q: c.q, pass: gr.pass, why: gr.why, answer: r.text.slice(0, 600), tools: r.tools, grounding: grounding(r.text, r.results) }); }
      catch (e) { out.push({ q: c.q, pass: false, why: ['error: ' + e.message], answer: '', tools: [] }); }
      save(); render(); await new Promise((res) => setTimeout(res, 2500));
    }
    db.app.eval_last.running = false; db.app.eval_last.finished = new Date().toISOString(); audit('ai_self_test', `${out.filter((x) => x.pass).length}/${out.length} passed`); save(); busy = false; render();
  }
  function evalHTML() {
    const e = db.app.eval_last;
    const list = e ? `<p><b>${e.results.filter((x) => x.pass).length}/${e.results.length} passed</b> ${e.running ? '<span class="typing">running…</span>' : ''} <span class="muted tiny">as of ${esc(e.as_of)} · ${esc((e.finished || e.started).slice(0, 19).replace('T', ' '))} UTC</span></p>
      <table><tr><th>Question</th><th>Result</th><th>Answer (excerpt)</th></tr>${e.results.map((r) => `<tr><td class="tiny">${esc(r.q)}<div class="tools">${(r.tools || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div></td><td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}<div class="tiny muted">${esc((r.why || []).join('; '))}</div>${r.grounding ? `<div class="tiny muted">grounding ${r.grounding.traced}/${r.grounding.total}</div>` : ''}</td><td class="tiny">${esc(r.answer)}</td></tr>`).join('')}</table>` : '<p class="muted">Not run yet.</p>';
    return `<div class="card" style="grid-column:1/-1"><h3>AI analyst self-test</h3><p class="tiny muted">${evalCases().length} questions (exact numbers, past snapshots, ties, simulated-data honesty, causal and cash traps). Expected answers are <b>recomputed from the current data</b>, so the test still works after you edit or import data. Each question runs in a fresh conversation. Grading is automatic: numbers within 1.5%, names, and "data can't answer" language where required.</p>
      <button class="primary" data-act="runEval" ${busy ? 'disabled' : ''}>Run self-test</button>${list}</div>`;
  }

  function confirmProposal(pid) {
    const p = chat.proposals[pid]; if (!p || p.status !== 'pending') return;
    let msg;
    if (p.kind === 'task') { const id = nextId('TK'); db.app.tasks.push({ id, ...p.data, status: 'todo', source: 'AI analyst (user-confirmed)', created_at: stamp() }); audit('task_create', `${p.data.title} (via AI analyst)`); msg = `User confirmed proposal ${pid}: task ${id} "${p.data.title}" was created${p.data.owner ? ' for ' + p.data.owner : ''}${p.data.due ? ', due ' + p.data.due : ''}.`; }
    else { const m = db.app.campaign_meta[p.data.campaign_id] ||= {}; const ch = p.data.changes; Object.assign(m, ch); if (ch.budget_inr != null || ch.spent_inr != null) m.budget_source = 'user-entered'; audit('campaign_update', `${p.data.campaign_name}: ${JSON.stringify(ch)} (via AI analyst)`); msg = `User confirmed proposal ${pid}: campaign ${p.data.campaign_name} updated with ${JSON.stringify(ch)}.`; }
    p.status = 'confirmed'; save(); chat.contents.push({ role: 'user', parts: [{ text: '[UI event] ' + msg }] }, { role: 'model', parts: [{ text: 'Noted, ' + msg.replace('User confirmed', 'confirmed') }] });
    chat.display.push({ role: 'sys', text: '✓ ' + msg.replace(`User confirmed proposal ${pid}: `, '') }); persistChat(); renderChat(); render(); toast('Saved — dashboard updated');
  }
  function rejectProposal(pid) { const p = chat.proposals[pid]; if (!p || p.status !== 'pending') return; p.status = 'rejected'; chat.contents.push({ role: 'user', parts: [{ text: `[UI event] User rejected proposal ${pid}; nothing was changed.` }] }, { role: 'model', parts: [{ text: 'Understood, nothing was changed.' }] }); chat.display.push({ role: 'sys', text: '✕ Proposal dismissed, nothing changed.' }); persistChat(); renderChat(); }

  function renderChatHeader() { $('#chatAsOf').textContent = `Grounded in live app data · as of ${ui.asOf} IST`; }
  function proposalCard(pid) {
    const p = chat.proposals[pid]; if (!p) return '';
    const body = p.kind === 'task' ? `<b>Create task:</b> ${esc(p.data.title)}<div class="tiny muted">Owner ${esc(p.data.owner || 'unassigned')} · due ${esc(p.data.due || '—')} · ${esc(p.data.priority)}${p.data.campaign_id ? ' · ' + esc(campName(p.data.campaign_id)) : ''}</div><div class="tiny">${esc(p.data.notes)}</div>`
      : `<b>Update campaign ${esc(p.data.campaign_name)}:</b> ${esc(Object.entries(p.data.changes).map(([k, v]) => `${k} → ${v}`).join(', '))}<div class="tiny">${esc(p.data.rationale || '')}</div>`;
    const acts = p.status === 'pending' ? `<div class="acts"><button class="primary small" data-act="confirmProposal" data-id="${pid}">Confirm</button><button class="small" data-act="rejectProposal" data-id="${pid}">Dismiss</button></div>` : `<div class="tiny ${p.status === 'confirmed' ? 'good' : 'muted'}" style="margin-top:6px">${p.status === 'confirmed' ? '✓ Confirmed and saved' : 'Dismissed'}</div>`;
    return `<div class="proposal">${body}${acts}</div>`;
  }
  function renderChat(typing, toolsSoFar) {
    renderChatHeader();
    const body = $('#chatBody');
    if (!chat.display.length) body.innerHTML = `<div class="msg bot"><p>Hi! I'm your sponsorship growth analyst. I answer from the live data in this app (as of the date at the top), do the maths in code, and can create tasks or change campaigns <b>after you confirm</b>. If the data can't answer something, I'll say so.</p></div>`;
    else body.innerHTML = chat.display.map((m) => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>` : m.role === 'sys' ? `<div class="msg sys">${esc(m.text)}</div>` : m.role === 'err' ? `<div class="msg err">⚠ ${esc(m.text)}</div>`
      : `<div class="msg bot">${md(m.text)}${m.tools && m.tools.length ? `<div class="tools">${m.tools.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}${m.grounding ? `<div class="ground ${m.grounding.untraced.length ? 'warn' : ''}" title="Heuristic: every number in the answer is matched against numbers returned by the tools in this turn.">${m.grounding.untraced.length ? '⚠' : '✓'} Grounding check: ${m.grounding.traced}/${m.grounding.total} numbers traced to app data${m.grounding.untraced.length ? ' · not found in tool results: ' + esc(m.grounding.untraced.slice(0, 6).join(', ')) : ''}</div>` : ''}</div>${(m.cards || []).map(proposalCard).join('')}`).join('');
    if (typing) body.innerHTML += `<div class="typing">Analysing${toolsSoFar && toolsSoFar.length ? ' · ' + esc(toolsSoFar.join(', ')) : ''}…</div>`;
    $('#chatSuggest').innerHTML = SUGGEST.map((s) => `<button data-act="suggest" data-id="${esc(s)}">${esc(s)}</button>`).join('');
    body.scrollTop = body.scrollHeight;
  }
  function md(src) {
    const lines = String(src).split('\n'); let html = ''; let list = null; let tbl = [];
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
    const flushTbl = () => { if (tbl.length) { const rows = tbl.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)); html += '<table>' + rows.map((r, i) => '<tr>' + r.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => (i ? `<td>${inline(c.trim())}</td>` : `<th>${inline(c.trim())}</th>`)).join('') + '</tr>').join('') + '</table>'; tbl = []; } };
    for (const l of lines) {
      if (/^\s*\|.*\|\s*$/.test(l)) { flushList(); tbl.push(l); continue; } else flushTbl();
      let m;
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^#{1,4}\s+(.*)/))) { flushList(); html += `<p><b>${inline(m[1])}</b></p>`; }
      else if (l.trim()) { flushList(); html += `<p>${inline(l)}</p>`; } else flushList();
    }
    flushList(); flushTbl(); return html;
  }

  window.addEventListener('DOMContentLoaded', () => init().catch((e) => { $('#view').innerHTML = `<div class="card bad">Failed to start: ${esc(e.message)}</div>`; }));
  window.__SGC = { get db() { return db; }, ui, runTool, ask, chat, grounding, answerNumbers, evalCases, gradeCase };
})();
