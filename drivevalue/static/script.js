(function () {
  const form = document.getElementById('predict-form');
  const formScreen = document.getElementById('form-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const resultScreen = document.getElementById('result-screen');
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

  let lastPayload = null;

  const STEPS = [
    'Reading vehicle profile…',
    'Estimating depreciation curve…',
    'Cross-referencing brand factors…',
    'Computing market adjustment…',
    'Finalizing your price…',
  ];

  // Chip groups → hidden input
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

  function showScreen(el) {
    [formScreen, loadingScreen, resultScreen].forEach(s => s.classList.remove('active'));
    el.classList.add('active');
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
        // mark previous done
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
        if (elapsed < durationMs) {
          requestAnimationFrame(tick);
        } else {
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
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    return '₹' + parts.join(',') + ',' + last3;
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

  function renderResult(data) {
    rangeEl.textContent = `Range: ${data.range_formatted}`;
    animatePrice(data.price);

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

    // animate fills
    requestAnimationFrame(() => {
      metricsEl.querySelectorAll('.m-fill').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
    });

    // confidence — derive from km/age plausibility
    let confidence = 92;
    if (s.age > 12) confidence -= 8;
    if (s.km_driven > 150000) confidence -= 6;
    if (s.km_driven < 1000) confidence -= 4;
    confidence = Math.max(72, Math.min(96, confidence));
    const label = confidence >= 88 ? 'High' : confidence >= 80 ? 'Medium' : 'Fair';
    confScore.textContent = `${label} · ${confidence}%`;
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
    const res = await fetch('/api/predict', {
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

  async function handleSubmit(payload) {
    showScreen(loadingScreen);
    try {
      const [data] = await Promise.all([predict(payload), runLoader(2400)]);
      renderResult(data);
      showScreen(resultScreen);
    } catch (e) {
      showToast(e.message || 'Something went wrong');
      showScreen(formScreen);
    }
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

  newBtn.addEventListener('click', () => {
    showScreen(formScreen);
  });
})();
