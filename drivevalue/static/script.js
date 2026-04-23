(function () {
  const form = document.getElementById('predict-form');
  const formScreen = document.getElementById('form-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const resultScreen = document.getElementById('result-screen');
  const historyScreen = document.getElementById('history-screen');

  const loaderStep = document.getElementById('loader-step');
  const progressBar = document.getElementById('progress-bar');
  const loaderChecks = document.getElementById('loader-checks');

  const priceEl = document.getElementById('price');
  const rangeEl = document.getElementById('range');
  const summaryEl = document.getElementById('vehicle-summary');
  const metricsEl = document.getElementById('metrics');
  const confFill = document.getElementById('conf-fill');
  const confScore = document.getElementById('conf-score');
  const toastEl = document.getElementById('toast');
  const recalcBtn = document.getElementById('recalc');
  const newBtn = document.getElementById('new-prediction');

  const rbZone = document.getElementById('rb-zone');
  const rbMarker = document.getElementById('rb-marker');
  const rbLow = document.getElementById('rb-low');
  const rbHigh = document.getElementById('rb-high');

  const clearHistoryBtn = document.getElementById('clear-history');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historyCountBadge = document.getElementById('tab-history-badge');
  const heCta = document.getElementById('he-cta');
  const aboutScreen = document.getElementById('about-screen');
  const tabbar = document.getElementById('tabbar');
  const appbarBack = document.getElementById('appbar-back');
  const appbarLogo = document.getElementById('appbar-logo');
  const appbarTitle = document.getElementById('appbar-title');
  const appbarSub = document.getElementById('appbar-sub');
  const splash = document.getElementById('splash');

  const HISTORY_KEY = 'drivevalue_history_v1';
  const MAX_HISTORY = 20;
  let lastPayload = null;
  let chartYear = null;
  let chartKm = null;

  const STEPS = [
    'Reading vehicle profile…',
    'Estimating depreciation curve…',
    'Cross-referencing brand factors…',
    'Computing market adjustment…',
    'Finalizing your price…',
  ];

  // ───── Chip groups ─────
  document.querySelectorAll('.chips').forEach(group => {
    const name = group.dataset.name;
    const hidden = form.querySelector(`input[name="${name}"]`);
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      hidden.value = btn.dataset.value;
      if (navigator.vibrate) navigator.vibrate(8);
    });
  });

  const APPBAR_TITLES = {
    'form-screen':    { title: 'DriveValue',    sub: 'Instant Car Pricing', back: false, tab: 'home' },
    'loading-screen': { title: 'Analyzing…',    sub: 'AI is at work',       back: false, tab: 'home' },
    'result-screen':  { title: 'Your Estimate', sub: 'AI Valuation',        back: true,  tab: 'home' },
    'history-screen': { title: 'History',       sub: 'Recent valuations',   back: false, tab: 'history' },
    'about-screen':   { title: 'About',         sub: 'How DriveValue works',back: false, tab: 'about' },
  };

  function showScreen(el) {
    [formScreen, loadingScreen, resultScreen, historyScreen, aboutScreen].forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const meta = APPBAR_TITLES[el.id] || APPBAR_TITLES['form-screen'];
    appbarTitle.textContent = meta.title;
    appbarSub.textContent = meta.sub;
    appbarBack.hidden = !meta.back;
    appbarLogo.style.marginLeft = meta.back ? '0' : '';
    // Hide tabbar on loading screen for focus
    tabbar.style.display = (el.id === 'loading-screen') ? 'none' : '';
    // Update active tab
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === meta.tab);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function runLoader(durationMs) {
    return new Promise(resolve => {
      const start = performance.now();
      let stepIdx = 0;
      loaderStep.textContent = STEPS[0];
      progressBar.style.width = '0%';
      loaderChecks.querySelectorAll('.lc-item').forEach(li => li.classList.remove('done'));

      const stepEvery = durationMs / STEPS.length;
      const stepTimer = setInterval(() => {
        const prev = loaderChecks.querySelector(`.lc-item[data-i="${stepIdx}"]`);
        if (prev) prev.classList.add('done');
        stepIdx = Math.min(stepIdx + 1, STEPS.length - 1);
        loaderStep.style.opacity = '0';
        setTimeout(() => {
          loaderStep.textContent = STEPS[stepIdx];
          loaderStep.style.opacity = '1';
        }, 180);
      }, stepEvery);

      const tick = () => {
        const elapsed = performance.now() - start;
        const pct = Math.min(100, (elapsed / durationMs) * 100);
        progressBar.style.width = pct + '%';
        if (elapsed < durationMs) requestAnimationFrame(tick);
        else {
          clearInterval(stepTimer);
          loaderChecks.querySelectorAll('.lc-item').forEach(li => li.classList.add('done'));
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  function animatePrice(target) {
    const duration = 1000;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(target * eased);
      priceEl.textContent = formatINR(value);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function formatINR(amount) {
    const s = String(Math.max(0, Math.round(amount)));
    if (s.length <= 3) return '₹' + s;
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) parts.unshift(rest);
    return '₹' + parts.join(',') + ',' + last3;
  }

  function shortINR(amount) {
    const a = Math.abs(amount);
    if (a >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
    if (a >= 100000) return '₹' + (amount / 100000).toFixed(2) + ' L';
    if (a >= 1000) return '₹' + (amount / 1000).toFixed(0) + 'k';
    return '₹' + amount;
  }

  function metricRow(icon, label, sub, value, fillPct) {
    return `
      <div class="metric-row">
        <div class="metric-icon">${icon}</div>
        <div class="metric-body">
          <div class="m-label">${label}</div>
          <div class="m-sub">${sub}</div>
          <div class="m-track"><div class="m-fill" style="width:0%" data-w="${fillPct}"></div></div>
        </div>
        <div class="metric-value">${value}</div>
      </div>
    `;
  }

  function renderRangeBar(low, mid, high) {
    const span = Math.max(1, high - low);
    // Display the full range as a soft fill under the marker
    rbZone.style.width = '100%';
    rbZone.style.left = '0%';
    const pos = ((mid - low) / span) * 100;
    rbMarker.style.left = pos + '%';
    rbLow.textContent = shortINR(low);
    rbHigh.textContent = shortINR(high);
  }

  function renderResult(data) {
    rangeEl.textContent = `Range: ${data.range_formatted}`;
    animatePrice(data.price);
    renderRangeBar(data.range_low, data.price, data.range_high);

    const s = data.summary;
    summaryEl.innerHTML = `
      <div class="summary-item"><span class="k">Vehicle</span><span class="v">${s.brand} ${escapeHtml(s.model)}</span></div>
      <div class="summary-item"><span class="k">Year</span><span class="v">${s.year} <small>· ${s.age} yr</small></span></div>
      <div class="summary-item"><span class="k">Fuel · Trans</span><span class="v">${s.fuel} · ${s.transmission}</span></div>
      <div class="summary-item"><span class="k">KM Driven</span><span class="v">${s.km_driven.toLocaleString('en-IN')} km</span></div>
      <div class="summary-item"><span class="k">Owner</span><span class="v">${s.owner}</span></div>
      <div class="summary-item"><span class="k">Engine · Mileage</span><span class="v">${s.engine}cc · ${s.mileage} km/l</span></div>
    `;

    const f = data.factors;
    const dep = Math.round(f.depreciation * 100);
    const wear = Math.round(f.km_factor * 100);
    const brandIdx = f.brand_factor;
    const brandPct = Math.min(100, Math.round((brandIdx / 2.6) * 100));

    metricsEl.innerHTML =
      metricRow('📉', 'Age Depreciation', `${s.age} years old · retains ${dep}%`, `${dep}%`, dep) +
      metricRow('🛣️', 'Wear & Tear Score', `${s.km_driven.toLocaleString('en-IN')} km clocked`, `${wear}%`, wear) +
      metricRow('🏷️', 'Brand Resale Index', brandIdx >= 1.3 ? 'Strong resale value' : brandIdx >= 0.95 ? 'Average resale value' : 'Modest resale value', `${brandIdx.toFixed(2)}×`, brandPct) +
      metricRow('⚙️', 'Engine & Mileage', `${s.engine}cc · ${s.mileage} km/l`, `${Math.round(f.engine_factor * 100)}%`, Math.round(f.engine_factor * 60));

    requestAnimationFrame(() => {
      metricsEl.querySelectorAll('.m-fill').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
    });

    // Confidence (from ML model)
    const confidence = data.confidence ?? 90;
    const label = data.confidence_label ||
      (confidence >= 88 ? 'High' : confidence >= 80 ? 'Medium' : 'Fair');
    const modelTag = data.model_used === 'RandomForestRegressor' ? ' · RF' : '';
    confScore.textContent = `${label} · ${confidence}%${modelTag}`;
    requestAnimationFrame(() => { confFill.style.width = confidence + '%'; });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function readForm() {
    const fd = new FormData(form);
    return {
      brand: fd.get('brand'),
      model: fd.get('model'),
      year: Number(fd.get('year')),
      fuel: fd.get('fuel'),
      transmission: fd.get('transmission'),
      km_driven: Number(fd.get('km_driven')),
      owner: fd.get('owner'),
      mileage: Number(fd.get('mileage')),
      engine: Number(fd.get('engine')),
    };
  }

  function validate(payload) {
    const labels = {
      brand: 'brand', model: 'model', year: 'year', fuel: 'fuel type',
      transmission: 'transmission', km_driven: 'kilometers', owner: 'ownership',
      mileage: 'mileage', engine: 'engine size'
    };
    for (const [k, label] of Object.entries(labels)) {
      const v = payload[k];
      if (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
        return `Please enter ${label}`;
      }
    }
    return null;
  }

  async function predict(payload) {
    const res = await fetch('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Prediction failed');
    }
    return res.json();
  }

  async function fetchCurves(payload) {
    try {
      const res = await fetch('/api/curves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  // ───── Chart.js ─────
  function gradientFor(ctx, area, c1, c2) {
    if (!area) return c1;
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  function buildChart(canvas, labels, data, currentValue, currentLabel, xLabel) {
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Estimated Price',
          data,
          borderColor: '#5b8cff',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          backgroundColor: (c) => gradientFor(c.chart.ctx, c.chart.chartArea, 'rgba(91,140,255,0.45)', 'rgba(91,140,255,0.02)'),
          pointRadius: labels.map(l => String(l) === String(currentLabel) ? 6 : 0),
          pointHoverRadius: 6,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#5b8cff',
          pointBorderWidth: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutCubic' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,16,48,0.95)',
            borderColor: 'rgba(91,140,255,0.4)',
            borderWidth: 1,
            padding: 10,
            titleColor: '#fff',
            titleFont: { family: 'Sora', weight: '600', size: 12 },
            bodyColor: '#cfd9ff',
            bodyFont: { family: 'Inter', size: 12 },
            callbacks: {
              title: (items) => `${xLabel}: ${items[0].label}`,
              label: (item) => `Price: ${shortINR(item.parsed.y)}`,
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
            ticks: { color: '#9ea0c8', font: { family: 'Inter', size: 10.5 }, maxRotation: 0 },
            border: { display: false },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#9ea0c8',
              font: { family: 'Inter', size: 10.5 },
              callback: (v) => shortINR(v),
            },
            border: { display: false },
          }
        }
      }
    });
  }

  function renderCharts(curves, payload) {
    if (!curves) return;
    if (chartYear) { chartYear.destroy(); chartYear = null; }
    if (chartKm) { chartKm.destroy(); chartKm = null; }

    const yearLabels = curves.year_curve.map(p => p.year);
    const yearData = curves.year_curve.map(p => p.price);
    chartYear = buildChart(
      document.getElementById('chart-year'),
      yearLabels, yearData, null, payload.year, 'Year'
    );

    const kmLabels = curves.km_curve.map(p => (p.km / 1000) + 'k');
    const kmData = curves.km_curve.map(p => p.price);
    const currentKmLabel = (Math.round(payload.km_driven / 20000) * 20000 / 1000) + 'k';
    chartKm = buildChart(
      document.getElementById('chart-km'),
      kmLabels, kmData, null, currentKmLabel, 'KM'
    );
  }

  // ───── History (localStorage) ─────
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }
  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
    updateHistoryBadge();
  }
  function pushHistory(payload, result) {
    const items = loadHistory();
    items.unshift({
      id: Date.now(),
      payload,
      price: result.price,
      price_formatted: result.price_formatted,
      range_low: result.range_low,
      range_high: result.range_high,
      confidence: result.confidence,
      timestamp: Date.now(),
    });
    saveHistory(items);
  }
  function updateHistoryBadge() {
    const items = loadHistory();
    if (items.length > 0) {
      historyCountBadge.textContent = items.length;
      historyCountBadge.hidden = false;
    } else {
      historyCountBadge.hidden = true;
    }
  }
  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }
  function brandInitials(brand) {
    const b = (brand || '?').trim();
    return b.slice(0, 2).toUpperCase();
  }
  function renderHistory() {
    const items = loadHistory();
    if (items.length === 0) {
      historyList.innerHTML = '';
      historyEmpty.hidden = false;
      return;
    }
    historyEmpty.hidden = true;
    historyList.innerHTML = items.map((it, idx) => `
      <div class="h-item" data-id="${it.id}" style="animation-delay:${idx * 30}ms">
        <div class="h-thumb">${brandInitials(it.payload.brand)}</div>
        <div class="h-body">
          <div class="h-title">${escapeHtml(it.payload.brand)} ${escapeHtml(it.payload.model)}</div>
          <div class="h-meta">${it.payload.year} · ${(+it.payload.km_driven).toLocaleString('en-IN')} km · ${escapeHtml(it.payload.fuel)}</div>
        </div>
        <div>
          <div class="h-price">${it.price_formatted}</div>
          <div class="h-time">${timeAgo(it.timestamp)}</div>
        </div>
        <button class="h-del" data-del="${it.id}" aria-label="Delete">×</button>
      </div>
    `).join('');
  }

  // ───── Submit flow ─────
  async function handleSubmit(payload) {
    showScreen(loadingScreen);
    try {
      const [data, curves] = await Promise.all([
        predict(payload),
        fetchCurves(payload),
        runLoader(2400),
      ]);
      renderResult(data);
      showScreen(resultScreen);
      // Render charts after result screen is visible (Chart.js needs sized canvas)
      requestAnimationFrame(() => renderCharts(curves, payload));
      pushHistory(payload, data);
    } catch (e) {
      showToast(e.message || 'Something went wrong');
      showScreen(formScreen);
    }
  }

  function applyPayloadToForm(p) {
    form.querySelector('[name="brand"]').value = p.brand || '';
    form.querySelector('[name="model"]').value = p.model || '';
    form.querySelector('[name="year"]').value = p.year || '';
    form.querySelector('[name="km_driven"]').value = p.km_driven || '';
    form.querySelector('[name="mileage"]').value = p.mileage || '';
    form.querySelector('[name="engine"]').value = p.engine || '';
    ['fuel', 'transmission', 'owner'].forEach(name => {
      const group = document.querySelector(`.chips[data-name="${name}"]`);
      const hidden = form.querySelector(`input[name="${name}"]`);
      if (group && hidden) {
        hidden.value = p[name] || '';
        group.querySelectorAll('.chip').forEach(c => {
          c.classList.toggle('active', c.dataset.value === p[name]);
        });
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = readForm();
    const err = validate(payload);
    if (err) { showToast(err); return; }
    lastPayload = payload;
    handleSubmit(payload);
  });

  recalcBtn.addEventListener('click', () => {
    if (lastPayload) handleSubmit(lastPayload);
  });
  newBtn.addEventListener('click', () => showScreen(formScreen));

  // Tabbar nav
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      if (navigator.vibrate) navigator.vibrate(6);
      if (t === 'home') showScreen(formScreen);
      else if (t === 'history') { renderHistory(); showScreen(historyScreen); }
      else if (t === 'about') showScreen(aboutScreen);
      else if (t === 'new') showScreen(formScreen);
    });
  });

  // Appbar back button
  appbarBack.addEventListener('click', () => {
    if (resultScreen.classList.contains('active')) showScreen(formScreen);
    else showScreen(formScreen);
  });

  // Empty-state CTA
  if (heCta) heCta.addEventListener('click', () => showScreen(formScreen));

  clearHistoryBtn.addEventListener('click', () => {
    if (loadHistory().length === 0) return;
    localStorage.removeItem(HISTORY_KEY);
    updateHistoryBadge();
    renderHistory();
    showToast('History cleared');
  });

  historyList.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      e.stopPropagation();
      const id = Number(delBtn.dataset.del);
      const items = loadHistory().filter(it => it.id !== id);
      saveHistory(items);
      renderHistory();
      return;
    }
    const item = e.target.closest('.h-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    const found = loadHistory().find(it => it.id === id);
    if (found) {
      applyPayloadToForm(found.payload);
      lastPayload = found.payload;
      handleSubmit(found.payload);
    }
  });

  // Splash dismiss after animation
  setTimeout(() => { if (splash) splash.classList.add('hide'); }, 2200);

  // Init
  updateHistoryBadge();
  showScreen(formScreen);
})();
