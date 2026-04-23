(function () {
  const form = document.getElementById('predict-form');
  const formScreen = document.getElementById('form-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const resultScreen = document.getElementById('result-screen');
  const loaderStep = document.getElementById('loader-step');
  const progressBar = document.getElementById('progress-bar');
  const priceEl = document.getElementById('price');
  const rangeEl = document.getElementById('range');
  const summaryEl = document.getElementById('vehicle-summary');
  const metricsEl = document.getElementById('metrics');
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

      const stepEvery = durationMs / STEPS.length;
      const stepTimer = setInterval(() => {
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
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  function animatePrice(target) {
    const duration = 900;
    const start = performance.now();
    const from = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(from + (target - from) * eased);
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

  function renderResult(data) {
    rangeEl.textContent = 'Range: ' + data.range_formatted;
    animatePrice(data.price);

    const s = data.summary;
    summaryEl.innerHTML = `
      <div class="summary-item"><span class="k">Vehicle</span><span class="v">${s.brand} ${escapeHtml(s.model)}</span></div>
      <div class="summary-item"><span class="k">Year</span><span class="v">${s.year} <small style="color:var(--muted);font-weight:500">(${s.age} yr)</small></span></div>
      <div class="summary-item"><span class="k">Fuel</span><span class="v">${s.fuel}</span></div>
      <div class="summary-item"><span class="k">Transmission</span><span class="v">${s.transmission}</span></div>
      <div class="summary-item"><span class="k">KM Driven</span><span class="v">${s.km_driven.toLocaleString('en-IN')}</span></div>
      <div class="summary-item"><span class="k">Owner</span><span class="v">${s.owner}</span></div>
    `;

    const f = data.factors;
    metricsEl.innerHTML = `
      <div class="metric"><div class="label">Depreciation</div><div class="value">${Math.round(f.depreciation * 100)}%</div></div>
      <div class="metric"><div class="label">Wear Score</div><div class="value">${Math.round(f.km_factor * 100)}%</div></div>
      <div class="metric"><div class="label">Brand Index</div><div class="value">${f.brand_factor.toFixed(2)}×</div></div>
    `;
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
      const [data] = await Promise.all([predict(payload), runLoader(2200)]);
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
