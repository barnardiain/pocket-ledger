'use strict';

// ── settings (localStorage) ───────────────────────────────────────────────────
var SK = 'budgetApp.settings';
function getSettings() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
function setSettings(s) { localStorage.setItem(SK, JSON.stringify(s)); }

var state = null; // last fetched server state

// ── api ───────────────────────────────────────────────────────────────────────
function api() {
  var s = getSettings();
  return {
    async getState(month) {
      var url = s.scriptUrl + '?token=' + encodeURIComponent(s.token) + (month ? '&month=' + month : '');
      var r = await fetch(url, { method: 'GET' });
      return r.json();
    },
    async add(tx) {
      // text/plain => no CORS preflight (Apps Script can't answer OPTIONS)
      var r = await fetch(s.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ token: s.token, action: 'add' }, tx))
      });
      return r.json();
    }
  };
}

// ── navigation ─────────────────────────────────────────────────────────────────
function show(view) {
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'dash') refresh();
}
document.querySelectorAll('.tabbar button').forEach(function (b) {
  b.addEventListener('click', function () { show(b.dataset.view); });
});

// ── dashboard ───────────────────────────────────────────────────────────────────
function money(n) { return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

async function refresh() {
  var s = getSettings();
  var msg = document.getElementById('dashMsg');
  if (!s.scriptUrl || !s.token) { msg.textContent = 'Open Settings and connect first.'; return; }
  msg.textContent = 'Loading…';
  try {
    var data = await api().getState();
    if (data.error) { msg.textContent = 'Error: ' + data.error; return; }
    state = data;
    render(data);
    msg.textContent = '';
  } catch (e) {
    msg.textContent = 'Could not reach the sheet. Check the URL/token and your connection.';
  }
}

function render(data) {
  document.getElementById('monthLabel').textContent = data.month;
  var leftTotal = data.totalLimit - data.totalSpent;
  document.getElementById('summary').innerHTML =
    '<div class="big ' + (leftTotal < 0 ? 'over' : '') + '">' + money(leftTotal) + ' left</div>' +
    '<div class="sub">' + money(data.totalSpent) + ' of ' + money(data.totalLimit) + ' spent</div>';

  var html = data.categories.map(function (c) {
    var pct = Math.min(100, Math.max(0, c.pct));
    var cls = c.remaining < 0 ? 'over' : (c.pct >= 85 ? 'warn' : 'ok');
    return '<div class="cat">' +
      '<div class="cat-top"><span class="cat-name">' + esc(c.category) + '</span>' +
      '<span class="cat-left ' + cls + '">' + money(c.remaining) + ' left</span></div>' +
      '<div class="bar"><div class="fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
      '<div class="cat-sub">' + money(c.spent) + ' / ' + money(c.limit) + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('cats').innerHTML = html || '<p class="msg">No categories in the Budget tab yet.</p>';

  // fill the Add-form category dropdown from live budget
  var sel = document.getElementById('category');
  sel.innerHTML = data.categories.map(function (c) { return '<option>' + esc(c.category) + '</option>'; }).join('');
}

function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

// ── add transaction ──────────────────────────────────────────────────────────────
var photoData = null;
document.getElementById('photo').addEventListener('change', function (e) {
  var f = e.target.files[0];
  if (!f) { photoData = null; return; }
  resizeImage(f, 1280, 0.7, function (dataUrl) {
    photoData = dataUrl;
    var img = document.getElementById('preview');
    img.src = dataUrl; img.hidden = false;
  });
});

document.getElementById('addForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var s = getSettings();
  var msg = document.getElementById('addMsg');
  if (!s.scriptUrl || !s.token) { msg.textContent = 'Connect in Settings first.'; return; }
  var btn = document.getElementById('saveBtn');
  btn.disabled = true; msg.textContent = 'Saving…';
  try {
    var res = await api().add({
      who: s.who || 'Iain',
      amount: document.getElementById('amount').value,
      category: document.getElementById('category').value,
      note: document.getElementById('note').value,
      photo: photoData || undefined
    });
    if (res.error) { msg.textContent = 'Error: ' + res.error; btn.disabled = false; return; }
    if (res.state) { state = res.state; render(res.state); }
    msg.textContent = 'Saved ✓';
    e.target.reset();
    photoData = null;
    document.getElementById('preview').hidden = true;
    setTimeout(function () { show('dash'); }, 600);
  } catch (err) {
    msg.textContent = 'Save failed — check connection.';
  } finally {
    btn.disabled = false;
  }
});

// downscale photo client-side so uploads are small and fast
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

// ── settings ─────────────────────────────────────────────────────────────────────
function loadSettingsForm() {
  var s = getSettings();
  document.getElementById('scriptUrl').value = s.scriptUrl || '';
  document.getElementById('token').value = s.token || '';
  document.getElementById('who').value = s.who || 'Iain';
  updateWhoChip();
}
document.getElementById('setForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  setSettings({
    scriptUrl: document.getElementById('scriptUrl').value.trim(),
    token: document.getElementById('token').value.trim(),
    who: document.getElementById('who').value
  });
  updateWhoChip();
  var msg = document.getElementById('setMsg');
  msg.textContent = 'Connecting…';
  var data = await api().getState();
  msg.textContent = data && data.ok ? 'Connected ✓' : ('Problem: ' + ((data && data.error) || 'no response'));
  if (data && data.ok) { state = data; render(data); setTimeout(function () { show('dash'); }, 700); }
});

// tap the chip to flip who is logging on this phone
document.getElementById('whoChip').addEventListener('click', function () {
  var s = getSettings();
  s.who = (s.who === 'Iain') ? 'Simone' : 'Iain';
  setSettings(s);
  document.getElementById('who').value = s.who;
  updateWhoChip();
});
function updateWhoChip() { document.getElementById('whoChip').textContent = getSettings().who || '—'; }

// ── boot ───────────────────────────────────────────────────────────────────────
loadSettingsForm();
if (getSettings().scriptUrl) { show('dash'); } else { show('set'); }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
