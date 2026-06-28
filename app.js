'use strict';

// ── settings (localStorage) ───────────────────────────────────────────────────
var SK = 'budgetApp.settings';
function getSettings() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
function setSettings(s) { localStorage.setItem(SK, JSON.stringify(s)); }
function lastCategory() { return localStorage.getItem('budgetApp.lastCategory') || ''; }
function setLastCategory(c) { if (c) localStorage.setItem('budgetApp.lastCategory', c); }

var state = null;        // last fetched server state
var viewMonth = null;    // 'YYYY-MM' currently shown
var serverMonth = null;  // the real current month (from server) — caps forward nav
var dashMode = 'cat';    // 'cat' | 'person'
var editingId = null;    // id of txn being edited, or null

// ── api (all POST so the token never rides in a URL) ───────────────────────────
function api() {
  var s = getSettings();
  function post(payload) {
    return fetch(s.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request => no preflight
      body: JSON.stringify(Object.assign({ token: s.token }, payload))
    }).then(function (r) { return r.json(); });
  }
  return {
    getState: function (month) { return post({ action: 'getState', month: month }); },
    add: function (tx) { return post(Object.assign({ action: 'add' }, tx)); },
    edit: function (id, tx) { return post(Object.assign({ action: 'edit', id: id }, tx)); },
    del: function (id) { return post({ action: 'delete', id: id }); }
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────
function money(n) { return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
function setMsg(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function ymLabel(ym) { var p = ym.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
function ymAdd(ym, d) { var p = ym.split('-'); var y = +p[0], m = +p[1] + d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + (m < 10 ? '0' + m : '' + m); }
function timeAgo(iso) {
  var t = new Date(iso).getTime(); if (isNaN(t)) return '';
  var s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 172800) return 'yesterday';
  var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
}
function whoClass(who) { return who === 'Iain' ? 'Iain' : (who === 'Simone' ? 'Simone' : 'other'); }
function snack(text) {
  var el = document.getElementById('snack');
  el.textContent = text; el.hidden = false;
  clearTimeout(snack._t); snack._t = setTimeout(function () { el.hidden = true; }, 1700);
}

// ── navigation ─────────────────────────────────────────────────────────────────
function show(view) {
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
  if (view === 'dash') refresh();
  if (view === 'add') {
    if (!editingId) preselectLastCategory();
    setTimeout(function () { var a = document.getElementById('amount'); if (a) a.focus(); }, 50);
  }
}
document.querySelectorAll('.tabbar button').forEach(function (b) {
  b.addEventListener('click', function () {
    if (b.dataset.view === 'add' && !editingId) resetAddForm(); // fresh add (not an edit)
    show(b.dataset.view);
  });
});

// month nav
document.getElementById('prevMonth').addEventListener('click', function () { viewMonth = ymAdd(viewMonth, -1); refresh(); });
document.getElementById('nextMonth').addEventListener('click', function () {
  if (serverMonth && viewMonth >= serverMonth) return;
  viewMonth = ymAdd(viewMonth, 1); refresh();
});

// segmented toggle
document.getElementById('segCat').addEventListener('click', function () { dashMode = 'cat'; applyMode(); });
document.getElementById('segPerson').addEventListener('click', function () { dashMode = 'person'; applyMode(); });
function applyMode() {
  document.getElementById('segCat').classList.toggle('active', dashMode === 'cat');
  document.getElementById('segPerson').classList.toggle('active', dashMode === 'person');
  document.getElementById('cats').hidden = dashMode !== 'cat';
  document.getElementById('people').hidden = dashMode !== 'person';
}

// ── dashboard ───────────────────────────────────────────────────────────────────
async function refresh() {
  var s = getSettings();
  var msg = document.getElementById('dashMsg');
  if (!s.scriptUrl || !s.token) { renderNotConnected(); return; }
  setMsg(msg, 'Loading…');
  try {
    var data = await api().getState(viewMonth || undefined);
    if (data.error) { setMsg(msg, 'Error: ' + friendly(data.error), 'error'); return; }
    state = data;
    serverMonth = data.serverMonth || data.month;
    if (!viewMonth) viewMonth = data.month;
    render(data);
    setMsg(msg, '');
  } catch (e) {
    setMsg(msg, 'Could not reach the sheet. Check your connection.', 'error');
  }
}

function friendly(err) {
  if (err === 'unauthorized') return 'wrong token — check Settings';
  if (err === 'not_found') return 'that entry changed — refreshing';
  if (err === 'server error') return 'something went wrong, try again';
  return err;
}

function render(data) {
  // month label + nav cap
  document.getElementById('monthLabel').textContent = ymLabel(data.month);
  document.getElementById('nextMonth').disabled = !!(serverMonth && data.month >= serverMonth);
  var past = document.getElementById('pastBanner');
  if (serverMonth && data.month < serverMonth) { past.hidden = false; past.textContent = 'Viewing ' + ymLabel(data.month); }
  else past.hidden = true;

  // summary + safe-to-spend
  var leftTotal = data.totalLimit - data.totalSpent;
  var safeHtml = '';
  if (data.month === serverMonth) {
    var now = new Date();
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
    if (leftTotal > 0) {
      var perDay = leftTotal / daysLeft;
      safeHtml = '<div class="safe' + (perDay < 100 ? ' tight' : '') + '">≈ ' + money(perDay) + '/day safe · ' + daysLeft + ' day' + (daysLeft > 1 ? 's' : '') + ' left</div>';
    } else {
      safeHtml = '<div class="safe over">Over budget — R0/day left</div>';
    }
  }
  document.getElementById('summary').innerHTML =
    '<div class="big ' + (leftTotal < 0 ? 'over' : '') + '">' + money(leftTotal) + ' left</div>' +
    '<div class="sub">' + money(data.totalSpent) + ' of ' + money(data.totalLimit) + ' spent</div>' + safeHtml;

  // over banner
  var over = data.categories.filter(function (c) { return c.remaining < 0; });
  var ob = document.getElementById('overBanner');
  if (over.length) {
    ob.hidden = false;
    ob.textContent = over.length === 1
      ? '⚠ ' + over[0].category + ' is over budget'
      : '⚠ ' + over.length + ' categories over budget';
  } else ob.hidden = true;

  // category cards
  document.getElementById('cats').innerHTML = data.categories.map(function (c) {
    var pct = Math.min(100, Math.max(0, c.pct));
    var cls = c.remaining < 0 ? 'over' : (c.pct >= 85 ? 'warn' : 'ok');
    var badge = c.remaining < 0 ? '<span class="badge over">OVER</span>'
      : (c.pct >= 85 ? '<span class="badge warn">' + c.pct + '%</span>' : '');
    return '<div class="cat">' +
      '<div class="cat-top"><span class="cat-name">' + esc(c.category) + badge + '</span>' +
      '<span class="cat-left ' + cls + '">' + money(c.remaining) + ' left</span></div>' +
      '<div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
      '<div class="cat-sub">' + money(c.spent) + ' / ' + money(c.limit) + '</div>' +
      '</div>';
  }).join('') || '<p class="empty">No categories in the Budget tab yet.</p>';

  renderPeople(data);
  renderRecent(data);
  buildCatChips(data.categories);
  applyMode();
}

function renderPeople(data) {
  var bp = data.byPerson || {};
  var names = Object.keys(bp).sort(function (a, b) { return bp[b] - bp[a]; });
  var el = document.getElementById('people');
  if (!names.length) { el.innerHTML = '<p class="empty">No spend logged this month.</p>'; return; }
  el.innerHTML = names.map(function (who) {
    var lines = data.categories.filter(function (c) { return c.byPerson && c.byPerson[who]; })
      .sort(function (a, b) { return b.byPerson[who] - a.byPerson[who]; })
      .map(function (c) { return '<div class="prow"><span>' + esc(c.category) + '</span><span>' + money(c.byPerson[who]) + '</span></div>'; }).join('');
    return '<div class="cat"><div class="cat-top">' +
      '<span class="cat-name"><span class="rtx-who ' + whoClass(who) + '">' + esc((who || '?').slice(0, 1)) + '</span>' + esc(who) + '</span>' +
      '<span class="cat-left">' + money(bp[who]) + '</span></div>' +
      '<div class="plist">' + (lines || '<div class="prow"><span>—</span><span>R0</span></div>') + '</div></div>';
  }).join('');
}

function renderRecent(data) {
  var list = data.recent || [];
  var el = document.getElementById('recent');
  if (!list.length) { el.innerHTML = '<p class="empty">No transactions yet this month.</p>'; return; }
  el.innerHTML = list.map(function (t) {
    var who = String(t.who || '');
    var meta = (who ? esc(who) + ' · ' : '') + timeAgo(t.ts) + (t.photo_url ? ' · 📎' : '') + (t.note ? ' · ' + esc(t.note) : '');
    return '<div class="rtx" data-id="' + esc(t.id) + '">' +
      '<span class="rtx-who ' + whoClass(who) + '">' + esc((who || '?').slice(0, 1)) + '</span>' +
      '<div class="rtx-mid">' +
      '<div class="rtx-line1"><span class="rtx-cat">' + esc(t.category) + '</span><span class="rtx-amt">' + money(t.amount) + '</span></div>' +
      '<div class="rtx-line2">' + meta + '</div>' +
      '</div>' +
      '<div class="rtx-act">' +
      '<button class="iconbtn" data-edit="' + esc(t.id) + '" aria-label="Edit">✎</button>' +
      '<button class="iconbtn del" data-del="' + esc(t.id) + '" aria-label="Delete">🗑</button>' +
      '</div></div>';
  }).join('');
  el.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { startEdit(list, b.getAttribute('data-edit')); }); });
  el.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { askDelete(b.getAttribute('data-del')); }); });
}

function renderNotConnected() {
  document.getElementById('summary').innerHTML = '';
  document.getElementById('cats').innerHTML =
    '<div class="empty"><div class="big-ic">🔗</div><h3>Getting started</h3>' +
    '<p>This phone isn\'t connected yet.</p>' +
    '<button class="savebtn" id="goSetup">Go to Setup</button></div>';
  document.getElementById('recent').innerHTML = '';
  document.getElementById('people').innerHTML = '';
  setMsg(document.getElementById('dashMsg'), '');
  var g = document.getElementById('goSetup'); if (g) g.addEventListener('click', function () { show('set'); });
}

// ── category chips (Add/Edit) ──────────────────────────────────────────────────
function buildCatChips(categories) {
  var wrap = document.getElementById('catChips');
  var current = document.getElementById('category').value;
  var names = categories.map(function (c) { return c.category; });
  if (names.indexOf('Uncategorised') < 0) names.push('Uncategorised'); // always available as a catch-all
  wrap.innerHTML = names.map(function (name) {
    return '<button type="button" class="' + (name === current ? 'selected' : '') + '" data-cat="' + esc(name) + '">' + esc(name) + '</button>';
  }).join('');
  wrap.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { selectCat(b.getAttribute('data-cat')); });
  });
}
function selectCat(cat) {
  document.getElementById('category').value = cat;
  document.querySelectorAll('#catChips button').forEach(function (b) { b.classList.toggle('selected', b.getAttribute('data-cat') === cat); });
}
function preselectLastCategory() {
  var lc = lastCategory();
  if (lc && state) { var has = state.categories.some(function (c) { return c.category === lc; }); if (has) selectCat(lc); }
}

// ── disclosures (note / photo) ──────────────────────────────────────────────────
document.getElementById('toggleNote').addEventListener('click', function () {
  var w = document.getElementById('noteWrap'); w.hidden = !w.hidden; this.hidden = true; if (!w.hidden) document.getElementById('note').focus();
});
document.getElementById('togglePhoto').addEventListener('click', function () {
  var w = document.getElementById('photoWrap'); w.hidden = !w.hidden; this.hidden = true;
});

// ── photo capture ───────────────────────────────────────────────────────────────
var photoData = null;
document.getElementById('photo').addEventListener('change', function (e) {
  var f = e.target.files[0];
  if (!f) { photoData = null; return; }
  resizeImage(f, 1280, 0.7, function (dataUrl) {
    photoData = dataUrl;
    var img = document.getElementById('preview'); img.src = dataUrl; img.hidden = false;
  });
});
function resizeImage(file, maxDim, quality, cb) {
  var img = new Image();
  img.onload = function () {
    var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', quality));
  };
  img.src = URL.createObjectURL(file);
}

// ── add / edit submit ─────────────────────────────────────────────────────────
document.getElementById('addForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var s = getSettings();
  var msg = document.getElementById('addMsg');
  if (!s.scriptUrl || !s.token) { setMsg(msg, 'Connect in Settings first.', 'error'); return; }

  var amount = parseFloat(String(document.getElementById('amount').value).replace(',', '.'));
  var category = document.getElementById('category').value;
  var note = document.getElementById('note').value;
  if (!(amount > 0)) { setMsg(msg, 'Enter an amount.', 'error'); return; }
  if (!category) { setMsg(msg, 'Pick a category.', 'error'); return; }

  var btn = document.getElementById('saveBtn');
  btn.disabled = true; setMsg(msg, editingId ? 'Updating…' : 'Saving…');
  try {
    var res = editingId
      ? await api().edit(editingId, { amount: amount, category: category, note: note })
      : await api().add({ who: s.who || 'Iain', amount: amount, category: category, note: note, photo: photoData || undefined });
    if (res.error) {
      if (res.stale) { setMsg(msg, 'That entry changed — refreshing.', 'error'); resetAddForm(); setTimeout(function () { show('dash'); }, 800); return; }
      setMsg(msg, 'Error: ' + friendly(res.error), 'error'); btn.disabled = false; return;
    }
    setLastCategory(category);
    if (res.state) { state = res.state; }
    var wasEdit = !!editingId;
    resetAddForm();
    setMsg(msg, (wasEdit ? 'Updated ✓ ' : 'Saved ✓ ') + money(amount) + ' · ' + category, 'success');
    setTimeout(function () { show('dash'); }, wasEdit ? 700 : 1400);
  } catch (err) {
    setMsg(msg, 'Save failed — check connection.', 'error');
  } finally {
    btn.disabled = false;
  }
});

function resetAddForm() {
  editingId = null;
  document.getElementById('addForm').reset();
  document.getElementById('category').value = '';
  document.querySelectorAll('#catChips button').forEach(function (b) { b.classList.remove('selected'); });
  photoData = null;
  document.getElementById('preview').hidden = true;
  document.getElementById('noteWrap').hidden = true; document.getElementById('toggleNote').hidden = false;
  document.getElementById('photoWrap').hidden = true; document.getElementById('togglePhoto').hidden = false;
  document.getElementById('editBanner').hidden = true;
  document.getElementById('saveBtn').textContent = 'Save';
  setMsg(document.getElementById('addMsg'), '');
}

function startEdit(list, id) {
  var t = list.filter(function (x) { return String(x.id) === String(id); })[0];
  if (!t) return;
  resetAddForm();
  editingId = id;
  document.getElementById('amount').value = t.amount;
  selectCat(t.category);
  if (t.note) { document.getElementById('noteWrap').hidden = false; document.getElementById('toggleNote').hidden = true; document.getElementById('note').value = t.note; }
  document.getElementById('editBanner').hidden = false;
  document.getElementById('saveBtn').textContent = 'Update';
  show('add');
}
document.getElementById('cancelEdit').addEventListener('click', function () { resetAddForm(); show('dash'); });

// ── delete (inline confirm) ─────────────────────────────────────────────────────
function askDelete(id) {
  var rowEl = document.querySelector('.rtx[data-id="' + id + '"]');
  if (!rowEl) return;
  rowEl.classList.add('confirming');
  rowEl.innerHTML = '<div class="confirm-row"><span class="q">Delete this transaction?</span>' +
    '<button class="no">Cancel</button><button class="yes">Delete</button></div>';
  rowEl.querySelector('.no').addEventListener('click', function () { renderRecent(state); });
  rowEl.querySelector('.yes').addEventListener('click', function () { doDelete(id); });
}
async function doDelete(id) {
  var msg = document.getElementById('dashMsg');
  setMsg(msg, 'Deleting…');
  try {
    var res = await api().del(id);
    if (res.error) { setMsg(msg, 'Error: ' + friendly(res.error), 'error'); if (state) render(state); return; }
    if (res.state) { state = res.state; render(res.state); }
    setMsg(msg, 'Deleted ✓', 'success');
  } catch (e) { setMsg(msg, 'Delete failed — check connection.', 'error'); }
}

// ── who chip ──────────────────────────────────────────────────────────────────
document.getElementById('whoChip').addEventListener('click', function () {
  var s = getSettings();
  s.who = (s.who === 'Iain') ? 'Simone' : 'Iain';
  setSettings(s);
  updateWhoChip();
  snack('Logging as ' + s.who);
});
function updateWhoChip() { document.getElementById('whoName').textContent = getSettings().who || '—'; }

// ── settings ─────────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  var s = getSettings();
  document.getElementById('scriptUrl').value = s.scriptUrl || '';
  document.getElementById('token').value = s.token || '';
  document.getElementById('who').value = s.who || '';
  updateWhoChip();
}
document.getElementById('setForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var who = document.getElementById('who').value;
  if (!who) { setMsg(document.getElementById('setMsg'), 'Pick who this phone is.', 'error'); return; }
  setSettings({
    scriptUrl: document.getElementById('scriptUrl').value.trim(),
    token: document.getElementById('token').value.trim(),
    who: who
  });
  updateWhoChip();
  var msg = document.getElementById('setMsg');
  setMsg(msg, 'Connecting…');
  try {
    var data = await api().getState();
    if (data && data.ok) {
      state = data; serverMonth = data.serverMonth || data.month; viewMonth = data.month;
      setMsg(msg, 'Connected ✓', 'success');
      setTimeout(function () { show('dash'); }, 700);
    } else {
      setMsg(msg, 'Problem: ' + friendly((data && data.error) || 'no response'), 'error');
    }
  } catch (err) { setMsg(msg, 'Could not connect — check the URL.', 'error'); }
});

// ── boot ───────────────────────────────────────────────────────────────────────
loadSettingsForm();
if (getSettings().scriptUrl) { show('dash'); } else { show('set'); }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
