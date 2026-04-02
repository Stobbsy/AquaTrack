// app.js — Navigation, rendering, service worker registration

const App = (() => {
  // ── Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // ── Navigation ──
  let currentPage = 'dashboard';

  function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    const nav = document.querySelector(`[data-page="${page}"]`);
    if (el) el.classList.add('active');
    if (nav) nav.classList.add('active');
    currentPage = page;
    render(page);
  }

  // ── Rendering ──
  function render(page) {
    switch (page) {
      case 'dashboard':  renderDashboard(); break;
      case 'calculator': renderCalculator(); break;
      case 'tests':      renderTests(); break;
      case 'history':    renderHistory(); break;
      case 'settings':   renderSettings(); break;
    }
  }

  // ── Dashboard ──
  function renderDashboard() {
    const wc = Tracker.lastWaterChange();
    const feed = Tracker.lastFeeding();
    const test = Tracker.lastTest();
    const tank = Tracker.getTank();

    document.getElementById('dash-wc-time').textContent = Tracker.timeAgo(wc?.date);
    document.getElementById('dash-wc-detail').textContent = wc ? `${wc.removed}L (${wc.percentage}%)` : '—';
    document.getElementById('dash-feed-time').textContent = Tracker.timeAgo(feed?.date);
    document.getElementById('dash-feed-detail').textContent = feed?.foodType || '—';
    document.getElementById('dash-test-time').textContent = Tracker.timeAgo(test?.date);
    document.getElementById('dash-tank-vol').textContent =
      `${Math.round(Calculator.maxVolume(tank.lengthCm, tank.widthCm, tank.heightCm))}L`;

    // Test status badges on dashboard
    const testBadges = document.getElementById('dash-test-badges');
    if (test) {
      testBadges.innerHTML = ['ammonia', 'nitrite', 'nitrate', 'ph'].map(p => {
        const val = test[p];
        if (val === null || val === undefined || val === '') return '';
        const status = Tracker.getTestStatus(p, val);
        const label = { ammonia: 'NH₃', nitrite: 'NO₂', nitrate: 'NO₃', ph: 'pH' }[p];
        return `<span class="badge ${status}">${label} ${val}</span>`;
      }).join(' ');
    } else {
      testBadges.innerHTML = '';
    }
  }

  // ── Calculator ──
  function renderCalculator() {
    const tank = Tracker.getTank();
    document.getElementById('calc-tank-info').textContent =
      `${tank.lengthCm} × ${tank.widthCm} × ${tank.heightCm} cm — ${Math.round(Calculator.maxVolume(tank.lengthCm, tank.widthCm, tank.heightCm))}L`;
  }

  function doCalculate() {
    const tank = Tracker.getTank();
    const beforeCm = parseFloat(document.getElementById('calc-before').value);
    const afterCm = parseFloat(document.getElementById('calc-after').value);

    if (isNaN(beforeCm) || isNaN(afterCm)) {
      showCalcError('Please enter both measurements.');
      return;
    }

    const result = Calculator.calculate(tank, beforeCm, afterCm);
    const resultsEl = document.getElementById('calc-results');
    const errEl = document.getElementById('calc-error');

    if (!result.valid) {
      showCalcError(result.errors.join(' '));
      resultsEl.classList.remove('visible');
      return;
    }

    errEl.textContent = '';
    document.getElementById('res-volume').textContent = `${result.removed} L`;
    document.getElementById('res-percent').textContent = `${result.percentage}%`;
    document.getElementById('res-prime').textContent = `${result.primeMl} mL`;

    const capRef = document.getElementById('res-cap-ref');
    const caps = result.primeMl / 5;
    if (caps >= 1) {
      capRef.textContent = `≈ ${caps % 1 === 0 ? caps : caps.toFixed(1)} cap${caps !== 1 ? 's' : ''}`;
    } else {
      capRef.textContent = `(1 cap = 5 mL)`;
    }

    const warnEl = document.getElementById('res-warning');
    if (result.warning) {
      warnEl.textContent = result.warning;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }

    resultsEl.classList.add('visible');

    // Store result for saving
    resultsEl.dataset.removed = result.removed;
    resultsEl.dataset.percentage = result.percentage;
    resultsEl.dataset.prime = result.primeMl;
    resultsEl.dataset.before = beforeCm;
    resultsEl.dataset.after = afterCm;
  }

  function showCalcError(msg) {
    document.getElementById('calc-error').textContent = msg;
  }

  function saveWaterChange() {
    const r = document.getElementById('calc-results');
    if (!r.classList.contains('visible')) return;

    Tracker.saveWaterChange({
      removed: parseFloat(r.dataset.removed),
      percentage: parseFloat(r.dataset.percentage),
      primeMl: parseFloat(r.dataset.prime),
      beforeCm: parseFloat(r.dataset.before),
      afterCm: parseFloat(r.dataset.after)
    });

    // Reset
    r.classList.remove('visible');
    document.getElementById('calc-before').value = '';
    document.getElementById('calc-after').value = '';
    showToast('Water change saved!');
  }

  // ── Water Tests ──
  function renderTests() {
    const tests = Tracker.getTests();
    const list = document.getElementById('test-history');

    if (tests.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="icon">🧪</div>No tests recorded yet.</div>';
      return;
    }

    list.innerHTML = tests.map(t => `
      <div class="history-item" data-id="${t.id}">
        <button class="delete-btn" onclick="App.deleteTest(${t.id})" title="Delete">✕</button>
        <div class="date">${formatDate(t.date)}</div>
        <div class="details">
          ${testBadge('NH₃', 'ammonia', t.ammonia)}
          ${testBadge('NO₂', 'nitrite', t.nitrite)}
          ${testBadge('NO₃', 'nitrate', t.nitrate)}
          ${testBadge('pH', 'ph', t.ph)}
          ${t.highPh ? testBadge('Hi pH', 'highPh', t.highPh) : ''}
        </div>
      </div>
    `).join('');
  }

  function testBadge(label, param, value) {
    if (value === null || value === undefined || value === '') return '';
    const status = Tracker.getTestStatus(param, value);
    return `<span class="badge ${status}">${label} ${value}</span>`;
  }

  function saveTest() {
    const ph = document.getElementById('test-ph').value;
    const highPh = document.getElementById('test-highph').value;
    const ammonia = document.getElementById('test-ammonia').value;
    const nitrite = document.getElementById('test-nitrite').value;
    const nitrate = document.getElementById('test-nitrate').value;

    if (!ph && !ammonia && !nitrite && !nitrate) {
      showToast('Enter at least one test result.');
      return;
    }

    Tracker.saveTest({
      ph: ph || null,
      highPh: highPh || null,
      ammonia: ammonia || null,
      nitrite: nitrite || null,
      nitrate: nitrate || null
    });

    // Reset form
    document.getElementById('test-ph').value = '';
    document.getElementById('test-highph').value = '';
    document.getElementById('test-ammonia').value = '';
    document.getElementById('test-nitrite').value = '';
    document.getElementById('test-nitrate').value = '';
    document.getElementById('highph-group').style.display = 'none';
    showToast('Test saved!');
    renderTests();
  }

  function deleteTest(id) {
    Tracker.deleteTest(id);
    renderTests();
  }

  function onPhChange() {
    const val = document.getElementById('test-ph').value;
    const group = document.getElementById('highph-group');
    group.style.display = (val === '7.6') ? 'block' : 'none';
    if (val !== '7.6') document.getElementById('test-highph').value = '';
  }

  // ── Feeding ──
  function saveFeed() {
    const foodType = document.getElementById('feed-type').value.trim();
    const amount = document.getElementById('feed-amount').value.trim();
    Tracker.saveFeed({ foodType: foodType || 'Fed', amount: amount || null });
    document.getElementById('feed-type').value = '';
    document.getElementById('feed-amount').value = '';
    showToast('Feeding logged!');
    if (currentPage === 'dashboard') renderDashboard();
    if (currentPage === 'history') renderHistory();
  }

  // ── History (combined) ──
  function renderHistory() {
    renderWaterChangeHistory();
    renderFeedHistory();
  }

  function renderWaterChangeHistory() {
    const wcs = Tracker.getWaterChanges();
    const list = document.getElementById('wc-history');
    if (wcs.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="icon">💧</div>No water changes recorded.</div>';
      return;
    }
    list.innerHTML = wcs.map(w => `
      <div class="history-item" data-id="${w.id}">
        <button class="delete-btn" onclick="App.deleteWC(${w.id})" title="Delete">✕</button>
        <div class="date">${formatDate(w.date)}</div>
        <div class="details">
          <div class="detail">Volume: <span>${w.removed}L</span></div>
          <div class="detail">Changed: <span>${w.percentage}%</span></div>
          <div class="detail">Prime: <span>${w.primeMl} mL</span></div>
        </div>
      </div>
    `).join('');
  }

  function renderFeedHistory() {
    const feeds = Tracker.getFeedings();
    const list = document.getElementById('feed-history');
    if (feeds.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="icon">🐟</div>No feedings recorded.</div>';
      return;
    }
    list.innerHTML = feeds.map(f => `
      <div class="history-item" data-id="${f.id}">
        <button class="delete-btn" onclick="App.deleteFeed(${f.id})" title="Delete">✕</button>
        <div class="date">${formatDate(f.date)}</div>
        <div class="details">
          <div class="detail"><span>${f.foodType || 'Fed'}</span></div>
          ${f.amount ? `<div class="detail">Amount: <span>${f.amount}</span></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  function deleteWC(id) {
    Tracker.deleteWaterChange(id);
    renderHistory();
  }

  function deleteFeed(id) {
    Tracker.deleteFeed(id);
    renderHistory();
  }

  // ── Settings ──
  function renderSettings() {
    const tank = Tracker.getTank();
    document.getElementById('set-name').value = tank.name || '';
    document.getElementById('set-length').value = tank.lengthCm;
    document.getElementById('set-width').value = tank.widthCm;
    document.getElementById('set-height').value = tank.heightCm;
    document.getElementById('set-prime').value = tank.primeMlPer200L;
    updateSettingsVolume();
  }

  function saveSettings() {
    const tank = {
      name: document.getElementById('set-name').value.trim() || 'My Aquarium',
      lengthCm: parseFloat(document.getElementById('set-length').value) || 120,
      widthCm: parseFloat(document.getElementById('set-width').value) || 44.5,
      heightCm: parseFloat(document.getElementById('set-height').value) || 50,
      primeMlPer200L: parseFloat(document.getElementById('set-prime').value) || 5
    };
    Tracker.saveTank(tank);
    showToast('Settings saved!');
    updateSettingsVolume();
  }

  function updateSettingsVolume() {
    const l = parseFloat(document.getElementById('set-length').value) || 0;
    const w = parseFloat(document.getElementById('set-width').value) || 0;
    const h = parseFloat(document.getElementById('set-height').value) || 0;
    document.getElementById('set-volume-display').textContent =
      `Calculated volume: ${Math.round(Calculator.maxVolume(l, w, h))}L`;
  }

  function exportData() {
    const json = Tracker.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aquatrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearData() {
    if (confirm('Delete ALL logged data? (Tank settings will be kept.) This cannot be undone.')) {
      Tracker.clearAll();
      showToast('All data cleared.');
      render(currentPage);
    }
  }

  // ── Helpers ──
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  let toastTimer;
  function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: var(--accent); color: #fff; padding: 10px 24px;
        border-radius: 24px; font-size: .88rem; font-weight: 600;
        z-index: 200; opacity: 0; transition: opacity .2s;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  // ── Init ──
  function init() {
    // Nav buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Quick actions on dashboard
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.nav));
    });

    // Calculator buttons
    document.getElementById('btn-calculate').addEventListener('click', doCalculate);
    document.getElementById('btn-save-wc').addEventListener('click', saveWaterChange);

    // Test form
    document.getElementById('btn-save-test').addEventListener('click', saveTest);
    document.getElementById('test-ph').addEventListener('change', onPhChange);

    // Feed buttons
    document.getElementById('btn-quick-feed').addEventListener('click', saveFeed);

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    ['set-length', 'set-width', 'set-height'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateSettingsVolume);
    });
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-clear').addEventListener('click', clearData);

    // Initial render
    navigate('dashboard');
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    navigate, doCalculate, saveWaterChange, saveTest, deleteTest,
    saveFeed, deleteFeed, deleteWC, exportData, clearData
  };
})();
