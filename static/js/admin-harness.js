'use strict';
/* Admin views for managers (no code needed):
   - Company Harness: turn runtime skills and typed tools on or off, add company wording to a skill,
     and tighten tool limits. The server validates every save (routers/harness_admin.py): the core,
     citation and scope modules stay on, tools never exceed their registered ceiling, and each save is
     a new audited revision that can be restored.
   - Knowledge library: every record the assistant can search, shown as a PDF page (the publisher's
     PDF when one is stored, otherwise a clearly labelled LabClear summary PDF), with a switch to
     pause a record and a required reason.
   Interface strings are English sources translated by static/js/i18n.js; record text, skill text
   and schemas are content and keep their own language (translate="no"). */
window.LabClearAdmin = ({ el, field, button, api, post, notice, request }) => {
  const keep = (node, lang) => { node.setAttribute('translate', 'no'); if (lang) node.lang = lang; return node; };
  const langOf = s => (/[ก-๛]/.test(s || '') ? 'th' : 'en');
  const checkbox = (label, checked) => {
    const wrap = el('label', null, 'check'), input = el('input'); input.type = 'checkbox'; input.checked = checked;
    wrap.append(input, el('span', label)); return { wrap, input };
  };
  const intro = (title, description) => { const x = el('header', null, 'admin-intro'); x.append(el('h2', title), el('p', description, 'muted')); return x; };
  const badge = (text, tone = '') => el('span', text, 'badge' + (tone ? ' ' + tone : ''));
  // Plain-language names for the reviewed modules and the typed tools (ids stay visible for audit).
  const SKILLS = {
    core: ['Core rules', 'Answer only from the supplied evidence; no diagnosis, dose or invented source.'],
    'thai-style': ['Thai writing style', 'Plain, polite Thai (or the language the customer used), with numbers and units unchanged.'],
    'evidence-citation': ['Citing sources', 'Every claim carries the ID of a record whose content supports it.'],
    'scope-uncertainty': ['Scope and uncertainty', 'Says what the evidence cannot show and when to see a professional.'],
    'lay-explanation': ['Explaining a test', 'General explanation of a lab test when no confirmed report is attached.'],
    'patient-explanation': ['Explaining a confirmed report', 'Ties each value to the range printed on the customer\'s own report.'],
    'package-advice': ['Package advice', 'Suggests packages from the simulated catalog without health claims.'],
    'package-compare': ['Package comparison', 'Compares packages side by side using exact catalog prices and tests.'],
  };
  const TOOLS = {
    lookup_packages: ['Look up packages', 'Reads the simulated package catalog.'],
    compare_packages: ['Compare packages', 'Builds an exact side-by-side table of two to four packages.'],
    lookup_branches: ['Look up centers', 'Reads demo centers and opening hours.'],
    lookup_policies: ['Look up policies', 'Reads service, payment, cancellation and privacy policies.'],
    retrieve_evidence: ['Search medical knowledge', 'Searches the approved knowledge library (no AI call).'],
    get_confirmed_report_rows: ['Read the confirmed report', 'Reads only values the customer has confirmed.'],
    preview_booking: ['Prepare a booking preview', 'Prepares a preview; it never books or charges.'],
    get_external_hospital_offer: ['Official hospital packages', 'Reads reviewed links to real hospital pages; no booking or partnership.'],
  };
  const SCOPE = { catalog: 'Catalog', branches: 'Centers', policies: 'Policies', medical: 'Medical knowledge', report: 'Confirmed report' };

  async function harness() {
    const data = await api('/staff/harness'), config = data.config;
    const root = el('div', null, 'admin-harness stack');
    root.append(intro('Company Harness', 'Choose which reviewed skills and typed tools the assistants use. Every answer records the skills and tools it actually ran under "Process Explainability". Changes apply from the next message.'));
    const form = el('form', null, 'stack'); form.onsubmit = e => e.preventDefault();

    const enabled = checkbox('Use runtime skills', config.skills_enabled);
    const limit = field('Sources per search', 'number', config.retrieval_limit, 'From 1 to 8');
    limit.input.min = 1; limit.input.max = 8; limit.input.required = true;
    const tokens = field('Maximum answer length (tokens)', 'number', config.writer_max_tokens, 'From 500 to 4,000');
    tokens.input.min = 500; tokens.input.max = 4000; tokens.input.step = 100; tokens.input.required = true;
    const settings = el('div', null, 'harness-settings'); settings.append(enabled.wrap, limit.wrap, tokens.wrap);
    form.append(settings, el('p', 'Always on and not editable here: safety checks on every message and answer, ownership checks, citation checks and customer confirmation before anything is booked.', 'small muted'));

    const skillInputs = {}, toolInputs = {};
    form.append(el('h3', 'Runtime skills'), el('p', 'Reviewed instruction modules. The server picks the relevant ones for each message; switch off a module you do not want, or add company wording under it.', 'small muted'));
    for (const skill of data.skills) {
      const [name, about] = SKILLS[skill.id] || [skill.id, ''];
      const current = config.skills[skill.file] || {}, locked = data.locked_skills.includes(skill.file);
      const details = el('details', null, 'admin-disclosure'), summary = el('summary'), content = el('div', null, 'stack');
      const title = el('span'); title.append(el('strong', name), el('span', ' ' + skill.id, 'tiny muted mono'));
      keep(title.lastChild);
      const state = locked ? badge('Locked', 'neutral') : current.enabled === false ? badge('Off', 'warn') : current.guidance ? badge('Customized', 'ok') : badge('On', 'ok');
      summary.append(title, state);
      const on = checkbox('Use this skill when relevant', current.enabled !== false);
      if (locked) { on.input.disabled = true; on.input.checked = true; }
      const guidance = field('Company wording (optional)', 'textarea', current.guidance || '', 'Tone, explanation style or service wording. It is added under the reviewed text and cannot override evidence or safety rules.');
      guidance.input.maxLength = 4000; guidance.input.rows = 3;
      const base = el('details', null, 'admin-disclosure'); base.append(el('summary', 'Reviewed base instructions · ' + skill.version));
      base.append(keep(el('pre', skill.instructions, 'skill-source'), langOf(skill.instructions)));
      content.append(el('p', about), keep(el('p', skill.boundary, 'tiny muted'), 'en'), on.wrap, guidance.wrap, base);
      details.append(summary, content); form.append(details); skillInputs[skill.file] = { on, guidance };
    }

    form.append(el('h3', 'Typed tools'), el('p', 'Server-side data lookups with fixed schemas. Each assistant role can use only the data its role allows. You can pause a tool or set a lower limit; you cannot raise a limit or widen a permission.', 'small muted'));
    for (const tool of data.tools) {
      const [name, about] = TOOLS[tool.name] || [tool.name, tool.description];
      const cur = config.tools[tool.name] || {};
      const row = el('details', null, 'admin-disclosure'), summary = el('summary'), content = el('div', null, 'stack');
      const title = el('span'); title.append(el('strong', name), keep(el('span', ' ' + tool.name, 'tiny muted mono')));
      summary.append(title, cur.enabled === false ? badge('Paused', 'warn') : badge(SCOPE[tool.scope] || tool.scope, 'neutral'));
      const on = checkbox('Enabled', cur.enabled !== false);
      const timeout = field('Time limit (seconds)', 'number', cur.timeout_seconds ?? tool.timeout_seconds, 'Up to ' + tool.timeout_seconds);
      const max = field('Maximum items', 'number', cur.max_items ?? tool.max_items, 'Up to ' + tool.max_items);
      timeout.input.min = .1; timeout.input.max = tool.timeout_seconds; timeout.input.step = .1; max.input.min = 1; max.input.max = tool.max_items;
      const controls = el('div', null, 'harness-settings'); controls.append(on.wrap, timeout.wrap, max.wrap);
      const schema = el('details', null, 'admin-disclosure'); schema.append(el('summary', 'Input schema · version ' + tool.version));
      schema.append(keep(el('pre', JSON.stringify(tool.input_schema, null, 2), 'skill-source'), 'en'));
      content.append(el('p', about), el('p', 'Permission: ' + (SCOPE[tool.scope] || tool.scope) + ' (read only)', 'small muted'), controls, schema);
      row.append(summary, content); form.append(row); toolInputs[tool.name] = { on, timeout, max };
    }

    const actions = el('div', null, 'harness-save');
    const revision = el('span', null, 'small muted');
    const showRevision = (n, sha) => { revision.replaceChildren(document.createTextNode('Revision ' + n + ' · '), keep(el('span', sha.slice(0, 12), 'mono'))); };
    showRevision(config.revision, data.sha256);
    actions.append(button('Save changes', async () => {
      if (!form.reportValidity()) return;
      const skills = Object.fromEntries(Object.entries(skillInputs).map(([key, v]) => [key, { enabled: v.on.input.checked, guidance: v.guidance.input.value.trim() }]));
      const tools = Object.fromEntries(Object.entries(toolInputs).map(([key, v]) => [key, { enabled: v.on.input.checked, timeout_seconds: Number(v.timeout.input.value), max_items: Number(v.max.input.value) }]));
      const saved = await api('/staff/harness', { method: 'PUT', body: JSON.stringify({ revision: config.revision, skills_enabled: enabled.input.checked, retrieval_limit: Number(limit.input.value), writer_max_tokens: Number(tokens.input.value), skills, tools }) });
      config.revision = saved.config.revision; showRevision(config.revision, saved.sha256);
      notice('Saved. New messages use revision ' + config.revision + '.');
    }, 'btn primary'), revision);
    form.append(actions); root.append(form);

    if (data.revisions.length) {
      const history = el('details', null, 'admin-disclosure'), sel = field('Earlier revision', 'select'), box = el('div', null, 'stack');
      data.revisions.forEach(r => sel.input.append(new Option('Revision ' + r, r)));
      box.append(el('p', 'Restoring saves the earlier settings as a new revision, so the change stays in the audit log.', 'small muted'), sel.wrap,
        button('Restore this revision', async () => {
          await post('/staff/harness/restore', { revision: config.revision, target_revision: Number(sel.input.value) });
          root.replaceWith(await harness()); notice('Earlier settings restored as a new revision.');
        }, 'btn sm'));
      history.append(el('summary', 'Version history'), box); root.append(history);
    }
    return root;
  }

  const APPROVAL = { OWNER_APPROVED: ['Owner approved', 'warn'], LEGACY_REVIEWED: ['Reviewed record', 'ok'] };
  const VERIFY = { OFFLINE_AUTHORED_NOT_FETCHED: 'Source check pending', LEGACY_REVIEWED: 'Source reviewed' };

  async function knowledge() {
    const data = await api('/staff/knowledge'), root = el('div', null, 'knowledge-admin');
    root.append(intro('Knowledge library', 'Every record the assistant can search and cite. Open a record to read it as a PDF page. Owner approval and source verification are recorded separately.'));
    const filters = el('div', null, 'row');
    const search = field('Search the library', 'search', '', 'Title, publisher or topic');
    const kind = field('Show', 'select');
    [['all', 'All records'], ['OWNER_APPROVED', 'Owner approved (source check pending)'], ['LEGACY_REVIEWED', 'Reviewed records'], ['paused', 'Paused']].forEach(([v, t]) => kind.input.add(new Option(t, v)));
    filters.append(search.wrap, kind.wrap); root.append(filters);
    const layout = el('div', null, 'knowledge-layout'), list = el('div', null, 'knowledge-list'), viewer = el('section', null, 'knowledge-viewer');
    list.setAttribute('aria-label', 'Knowledge records'); viewer.setAttribute('aria-label', 'PDF display'); viewer.setAttribute('aria-live', 'polite');
    layout.append(list, viewer); root.append(layout);
    let selected = null, objectUrl = '', generation = 0;

    const choose = async row => {
      const requestId = ++generation; selected = row; renderList(); viewer.replaceChildren();
      let page = 1, pages = 1;
      const meta = el('div', null, 'knowledge-meta');
      const [approval, tone] = APPROVAL[row.approval] || [row.approval || 'Reviewed', 'neutral'];
      const badges = el('div', null, 'row');
      badges.append(badge(approval, tone), badge(VERIFY[row.verification_status] || row.verification_status || 'Source reviewed', 'neutral'),
        badge(row.document_kind === 'publisher_document' ? 'Publisher PDF' : 'LabClear summary PDF', 'neutral'), badge(row.enabled ? 'Searchable' : 'Paused', row.enabled ? 'ok' : 'warn'));
      const links = el('div', null, 'row small');
      const source = el('a', 'Original source'); source.href = row.url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.append(el('span', ' (opens in a new tab)', 'sr-only'));
      const open = el('a', 'Open PDF'); open.href = row.document_url; open.target = '_blank'; open.rel = 'noopener';
      const download = el('a', 'Download PDF'); download.href = row.document_url; download.download = row.id + '.pdf';
      links.append(source, open, download);
      meta.append(keep(el('h3', row.title), langOf(row.title)), keep(el('p', row.publisher, 'muted'), langOf(row.publisher)), badges, links,
        el('p', row.document_kind === 'publisher_document' ? 'Stored copy of the publisher\'s page, checked against its SHA-256.' : 'A LabClear summary of the linked page, not the publisher\'s original document.', 'tiny muted'));
      const on = checkbox('Searchable by the assistant', row.enabled);
      const reason = field('Reason for the change', 'text', '', 'Required, at least 3 characters. Saved in the audit log.'); reason.input.maxLength = 300;
      const publication = el('div', null, 'stack'); publication.append(on.wrap, reason.wrap, button('Save', async () => {
        if (reason.input.value.trim().length < 3) { reason.input.focus(); notice('Enter a reason for this change.', 'bad'); return; }
        await api('/staff/knowledge/' + encodeURIComponent(row.id), { method: 'PUT', body: JSON.stringify({ enabled: on.input.checked, reason: reason.input.value.trim() }) });
        row.enabled = on.input.checked; reason.input.value = ''; notice(row.enabled ? 'The record is searchable again.' : 'The record is paused and no longer searched.'); choose(row);
      }, 'btn sm'));
      const manage = el('details', null, 'admin-disclosure'); manage.append(el('summary', 'Publication'), publication);
      meta.append(manage);

      const toolbar = el('div', null, 'pdf-toolbar'), count = el('span', 'Loading…', 'small muted');
      const previous = button('Previous page', () => show(page - 1), 'btn sm'), next = button('Next page', () => show(page + 1), 'btn sm');
      const nav = el('div', null, 'row'); nav.append(previous, next); toolbar.append(count, nav);
      const stage = el('div', null, 'pdf-stage'), image = el('img', null, 'pdf-page'); image.alt = 'Page of ' + row.title; stage.append(image);
      viewer.append(meta, toolbar, stage);
      async function show(number) {
        if (number < 1 || number > pages && number !== 1) return;
        page = number; previous.disabled = next.disabled = true; count.textContent = 'Loading page ' + page + '…';
        try {
          const r = await request('/staff/knowledge/' + encodeURIComponent(row.id) + '/pages/' + page, {}, 'image/png');
          if (!r.ok) throw Error('The page could not be shown. Open the PDF instead.');
          const blob = await r.blob(); if (requestId !== generation || !root.isConnected) return;
          pages = Number(r.headers.get('X-Page-Count')) || 1; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = URL.createObjectURL(blob); image.src = objectUrl;
          count.textContent = 'Page ' + page + ' of ' + pages; previous.disabled = page <= 1; next.disabled = page >= pages;
        } catch (e) { count.textContent = e.message; }
      }
      await show(1);
    };

    function renderList() {
      list.replaceChildren(); const q = search.input.value.toLocaleLowerCase().trim(), k = kind.input.value;
      const rows = data.records.filter(r => (!q || (r.title + ' ' + r.publisher + ' ' + r.content + ' ' + r.id).toLocaleLowerCase().includes(q))
        && (k === 'all' || (k === 'paused' ? !r.enabled : r.approval === k)));
      list.append(el('p', rows.length + ' of ' + data.records.length + ' records', 'tiny muted'));
      for (const r of rows) {
        const b = button('', () => choose(r), 'knowledge-item');
        b.append(keep(el('strong', r.title), langOf(r.title)), keep(el('span', r.publisher, 'tiny'), langOf(r.publisher)));
        const tags = el('span', null, 'tiny'); tags.append(el('span', (APPROVAL[r.approval] || [r.approval || 'Reviewed record'])[0]));
        if (!r.enabled) tags.append(document.createTextNode(' · '), el('span', 'Paused'));
        b.append(tags);
        b.setAttribute('aria-pressed', String(r.id === selected?.id)); list.append(b);
      }
      if (!rows.length) list.append(el('p', 'No records match.', 'small muted'));
    }
    search.input.oninput = renderList; kind.input.onchange = renderList; renderList();
    viewer.append(el('p', 'Select a record to read it as a PDF page.', 'muted'));
    // Free the last page image when this view is removed.
    const cleanup = new MutationObserver(() => { if (!root.isConnected) { if (objectUrl) URL.revokeObjectURL(objectUrl); cleanup.disconnect(); } });
    requestAnimationFrame(() => { if (root.parentNode) cleanup.observe(root.parentNode, { childList: true }); });
    return root;
  }
  return { harness, knowledge };
};
