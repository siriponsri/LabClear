'use strict';
(() => {
  const base = '/api/business/organization-documents';
  let csrf = '';
  const status = document.getElementById('reference-status');
  const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'X-Business-CSRF': csrf, ...(options.headers || {}) }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Error(data.message || 'The action did not complete. Check your access and try again.');
    return data;
  }
  async function run(fn) {
    status.textContent = 'Working…';
    try { await fn(); status.textContent = 'Done'; }
    catch (error) { status.textContent = error.message; }
  }
  function preview(text) { document.getElementById('reference-preview').hidden = false; document.getElementById('reference-text').textContent = text; }
  function button(label, action) { const el = node('button', label); el.type = 'button'; el.className = 'btn sm'; el.onclick = () => run(action); return el; }
  async function refresh() {
    const data = await request(base);
    document.getElementById('reference-upload').hidden = !data.can_edit;
    const list = document.getElementById('reference-list'); list.replaceChildren();
    if (!data.documents.length) list.append(node('p', 'No documents you can access yet.'));
    const labels = { draft: 'Waiting for review', approved: 'Approved', rejected: 'Not approved', revoked: 'Revoked', deleted: 'Content deleted' };
    for (const doc of data.documents) {
      const section = node('article', ''); section.className = 'reference-record';
      const title = node('h3', doc.title); title.setAttribute('translate', 'no');   // the uploader's own title
      section.append(title, node('p', `Version ${doc.version} · ${labels[doc.state]}`));
      const actions = node('div', ''); actions.className = 'reference-actions';
      if (['draft', 'rejected', 'approved'].includes(doc.state)) actions.append(button('View content', async () => preview((await request(base + '/' + doc.id)).text)));
      if (doc.state === 'approved') {
        const link = node('a', 'Download document'); link.href = base + '/' + doc.id + '/download'; actions.append(link);
      }
      if (data.can_edit) {
        const steps = doc.state === 'draft' ? [['approve', 'Approve'], ['reject', 'Do not approve']] : doc.state === 'approved' ? [['revoke', 'Revoke document']] : [];
        if (doc.state !== 'deleted') steps.push(['delete', 'Delete content']);
        steps.forEach(([action, label]) => actions.append(button(label, async () => { await request(base + '/' + doc.id + '/' + action, { method: 'POST' }); document.getElementById('reference-preview').hidden = true; await refresh(); })));
        if (doc.state === 'approved') actions.append(button('Upload a new version', async () => {
          const form = document.getElementById('reference-upload'); form.elements.previous_id.value = doc.id;
          document.getElementById('version-note').textContent = 'New version of ' + doc.title; form.elements.title.focus();
        }));
      }
      section.append(actions); list.append(section);
    }
  }
  document.getElementById('reference-upload').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    run(async () => { const result = await request(base, { method: 'POST', body: new FormData(form) }); preview(result.preview); form.reset(); document.getElementById('version-note').textContent = 'New document'; await refresh(); });
  };
  document.getElementById('membership-form').onsubmit = event => {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
    run(async () => { await request(base + '/membership', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }); await refresh(); });
  };
  document.getElementById('reference-search').onsubmit = event => {
    event.preventDefault(); const query = new FormData(event.currentTarget).get('q');
    run(async () => {
      const data = await request(base + '/search', { method: 'POST', body: JSON.stringify({ q: query }), headers: { 'Content-Type': 'application/json' } }); const results = document.getElementById('reference-results'); results.replaceChildren();
      results.append(node('h2', 'Text from the source documents — not an answer from AI'));
      if (!data.sources.length) results.append(node('p', 'No text found in approved documents.'));
      data.sources.forEach(source => { const article = node('article', ''); const link = node('a', `${source.title} · v${source.version} · ${source.section}`); link.href = source.url; link.setAttribute('translate', 'no');
        const excerpt = node('pre', source.content); excerpt.setAttribute('translate', 'no'); article.append(link, excerpt); results.append(article); });
    });
  };
  run(async () => {
    const session = await request('/api/business/session'); csrf = session.csrf;
    document.getElementById('membership-form').hidden = session.user.role !== 'manager';
    await refresh();
  });
})();
