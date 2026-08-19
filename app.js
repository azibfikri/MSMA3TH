/* ================================================================
   SUPABASE CONFIG
================================================================ */
const SUPABASE_URL = 'https://xmeafzdsowstzuxaezrz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e77sEc2jvltcm_eO9UWn1Q_bmefcdZv';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

/* ================================================================
   FETCH HELPERS
================================================================ */
async function fetchStations(state) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stations?state=eq.${encodeURIComponent(state)}&order=station_id.asc`,
    { headers: HEADERS }
  );
  return await res.json();
}

async function fetchPattern(region, durationKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/temporal_patterns?region=eq.${region}&duration_key=eq.${durationKey}`,
    { headers: HEADERS }
  );
  const data = await res.json();
  return data[0];
}

/* ================================================================
   MAPPINGS
================================================================ */
const stateToRegion = {
  'Terengganu': 'Region1', 'Kelantan': 'Region1',
  'Johor': 'Region2', 'Negeri Sembilan': 'Region2',
  'Melaka': 'Region2', 'Selangor': 'Region2', 'Pahang': 'Region2',
  'Perak': 'Region3', 'Kedah': 'Region3',
  'Pulau Pinang': 'Region3', 'Perlis': 'Region3',
  'Kuala Lumpur': 'Region5'
};

const durationMap = {
  15: '5', 30: '10', 60: '15',
  180: '30', 360: '60', 720: '120', 1440: '180'
};

/* ================================================================
   SOIL PROPERTIES (Table 2.6) + Horton decay constants
   k controls how fast infiltration rate decays:
   sandy → slow decay (stays permeable longer)
   loam  → medium decay
   clay  → fast decay (saturates quickly)
================================================================ */
const soilRanges = {
  sandy: { min: 10.0, max: 25.0, k: 1.5 },
  loam: { min: 3.0, max: 10.0, k: 2.5 },
  clay: { min: 0.5, max: 3.0, k: 4.0 }
};

/* ================================================================
   HELPERS
================================================================ */
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 3) => (isFinite(x) ? Number(x).toFixed(d) : '—');
const sum = (arr) => arr.reduce((a, b) => a + (+b || 0), 0);

/* ================================================================
   HYETOGRAPH CHART
================================================================ */
let hyetographChart = null;

function renderHyetograph(labels, depthValues) {
  const canvas = $('hyetographCanvas');
  if (!canvas) return;

  if (hyetographChart) {
    hyetographChart.destroy();
    hyetographChart = null;
  }

  if (!depthValues || depthValues.length === 0) {
    $('hyetographSection').style.display = 'none';
    return;
  }

  $('hyetographSection').style.display = 'block';

  hyetographChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Rainfall Depth (mm)',
          data: depthValues,
          backgroundColor: 'rgba(78, 168, 255, 0.3)',
          borderColor: 'rgba(78, 168, 255, 0.7)',
          borderWidth: 1.5,
          borderRadius: 3,
          order: 2
        },
        {
          type: 'line',
          label: 'Distribution Curve',
          data: depthValues,
          borderColor: '#7be495',
          borderWidth: 2,
          pointBackgroundColor: '#7be495',
          pointBorderColor: '#0b0f14',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'top',
          labels: { color: '#7f8ea3', font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: {
          backgroundColor: '#111723', borderColor: '#1a2433', borderWidth: 1,
          titleColor: '#e8f0ff', bodyColor: '#7f8ea3',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} mm` }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Time (min)', color: '#7f8ea3', font: { size: 11 } },
          ticks: { color: '#7f8ea3', font: { size: 9 }, maxRotation: 45 },
          grid: { color: 'rgba(26,36,51,0.8)' }
        },
        y: {
          title: { display: true, text: 'Depth (mm)', color: '#7f8ea3', font: { size: 11 } },
          ticks: { color: '#7f8ea3', font: { size: 10 } },
          grid: { color: 'rgba(26,36,51,0.8)' },
          beginAtZero: true
        }
      }
    }
  });
}

/* ================================================================
   GENERATE CONTINUOUS LOSS RATES — Horton's Equation
   f(t) = fc + (f0 - fc) × e^(-k × t)

   f0 = maxRate (initial infiltration rate)
   fc = minRate (final/minimum infiltration rate)
   k  = decay constant (soil-dependent)
   t  = normalised time (0 → 1 across all bins)

   Physical meaning:
   - Rate starts high (soil dry, absorbs fast)
   - Drops exponentially as soil saturates
   - Flattens at minimum once fully saturated
   - Sandy: slow decay | Loam: medium | Clay: fast
================================================================ */
function generateContRates(numBins, maxRate, minRate, k) {
  const rates = [];

  // Default k if not provided
  const decayK = k || 2.5;

  for (let i = 0; i < numBins; i++) {
    if (numBins === 1) {
      rates.push(maxRate);
    } else {
      // Normalised time: 0 at first bin, 1 at last bin
      const t = i / (numBins - 1);

      // Horton's equation
      const rate = minRate + (maxRate - minRate) * Math.exp(-decayK * t);

      // Never go below minimum (fully saturated state)
      rates.push(parseFloat(Math.max(minRate, rate).toFixed(2)));
    }
  }
  return rates;
}

/* ================================================================
   BUILD ESTIMATION OF LOSSES TABLE
   Requirements:
   - Pervious: IL=10mm (row 0 only), CL interpolated max→min (mm/hr)
               CL mm = row0: 10mm, row1+: rate/60*binMin
   - Impervious: IL=1.5mm (row 0 only), CL=0 always
   - Total loss = (pervContMM * pervPct + impInitMM * impPct) / 100
   - Updates when area % or soil type changes
================================================================ */
function buildLossEstimationTable() {
  const tbody = $('lossEstTableBody');
  if (!tbody) return;

  const depthCells = document.querySelectorAll('#depthGrid .depthCell');
  if (depthCells.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px;">
      Complete Steps 1–3 to see loss estimation.</td></tr>`;
    return;
  }

  const numBins = depthCells.length;
  const durationMin = parseFloat($('durationMin').value);
  const binMin = durationMin / numBins;

  // Get user inputs
  const pervPct = parseFloat($('perviousArea').value) || 40;
  const impPct = parseFloat($('imperviousArea').value) || 60;
  const soilType = $('soilType') ? $('soilType').value : 'loam';
  const range = soilRanges[soilType] || soilRanges.loam;

  // Update header percentages
  const pervPctEl = $('lossEstPervPct');
  const impPctEl = $('lossEstImpPct');
  if (pervPctEl) pervPctEl.textContent = pervPct;
  if (impPctEl) impPctEl.textContent = impPct;

  // Generate interpolated continuous loss rates (mm/hr)
  const contRates = generateContRates(numBins, range.max, range.min, range.k);

  tbody.innerHTML = '';
  let totalLossSum = 0;

  for (let i = 0; i < numBins; i++) {
    const binLabel = `${i * binMin}–${(i + 1) * binMin}`;

    // PERVIOUS
    const pervInitMM = i === 0 ? 10.00 : 0.00;
    const contRateMmhr = contRates[i];
    // Row 0: contMM = 10mm (same as initial loss per picture)
    // Row 1+: contMM = rate/60 * binMin
    const pervContMM = i === 0 ? 10.00 : parseFloat((contRateMmhr / 60 * binMin).toFixed(2));

    // IMPERVIOUS
    const impInitMM = i === 0 ? 1.50 : 0.00;
    const impContMmhr = 0.00;
    const impContMM = 0.00;

    // TOTAL LOSS = (pervContMM * pervPct + impInitMM * impPct) / 100
    const totalLoss = parseFloat(((pervContMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
    totalLossSum += totalLoss;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted);font-size:0.8rem;">${binLabel}</td>
      <td>${pervInitMM.toFixed(2)}</td>
      <td>${contRateMmhr.toFixed(2)}</td>
      <td>${pervContMM.toFixed(2)}</td>
      <td>${impInitMM.toFixed(2)}</td>
      <td style="color:var(--muted);">0.00</td>
      <td style="color:var(--muted);">0.00</td>
      <td style="color:var(--ok);font-weight:600;">${totalLoss.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }

  // Update total row
  const totalEl = $('lossEstTotal');
  if (totalEl) totalEl.textContent = totalLossSum.toFixed(2);
}

/* ================================================================
   ON STATE CHANGE → fetch stations
================================================================ */
document.getElementById('state').addEventListener('change', async function () {
  const state = this.value;
  const stationSelect = $('stationSelect');
  stationSelect.innerHTML = '<option value="">-- Select Station --</option>';
  ['idfK', 'idfX', 'idfA', 'idfN'].forEach(id => $(id).value = '');
  if (!state) return;

  try {
    const stations = await fetchStations(state);
    stations.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.station_id;
      opt.text = `${s.station_id} – ${s.name}`;
      opt.dataset.lambda = s.lambda;
      opt.dataset.kappa = s.kappa;
      opt.dataset.theta = s.theta;
      opt.dataset.eta = s.eta;
      stationSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Error fetching stations:', err);
  }
});

/* ================================================================
   ON STATION CHANGE → autofill IDF
================================================================ */
document.getElementById('stationSelect').addEventListener('change', function () {
  const opt = this.options[this.selectedIndex];
  if (!opt.value) return;
  $('idfK').value = opt.dataset.lambda;
  $('idfX').value = opt.dataset.kappa;
  $('idfA').value = opt.dataset.theta;
  $('idfN').value = opt.dataset.eta;
  calculateDesignIntensity();
});

/* ================================================================
   ON ARI/DURATION CHANGE → fetch pattern
================================================================ */
async function onDurationOrARIChange() {
  const state = $('state').value;
  const durationMin = parseFloat($('durationMin').value);
  if (!state || !durationMin) return;

  const region = stateToRegion[state];
  const durationKey = durationMap[durationMin];
  if (!region || !durationKey) return;

  try {
    const pattern = await fetchPattern(region, durationKey);
    if (!pattern) return;

    const binMin = pattern.bin_minutes;
    const values = pattern.values;

    // Populate hidden patternGrid for compatibility
    const grid = $('patternGrid');
    grid.innerHTML = '';
    values.forEach((v, i) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <label>${i * binMin}-${(i + 1) * binMin} min</label>
        <input class="patternCell" type="number" step="0.001" value="${v}" />
      `;
      grid.appendChild(wrap);
    });

    // Column-first layout — split into 2 columns, top to bottom
    const ptbody = $('patternTableBody');
    if (ptbody) {
      ptbody.innerHTML = '';
      const half = Math.ceil(values.length / 2);
      for (let i = 0; i < half; i++) {
        const tr = document.createElement('tr');
        const j = i + half;
        const label1 = `${i * binMin}–${(i + 1) * binMin} min`;
        const label2 = j < values.length ? `${j * binMin}–${(j + 1) * binMin} min` : '';
        const val2 = j < values.length ? values[j].toFixed(3) : '';
        tr.innerHTML = `
          <td>${label1}</td>
          <td><input class="patternCellVis" type="number" step="0.001" value="${values[i].toFixed(3)}"
               data-index="${i}" style="width:80px;padding:4px 8px;text-align:center;font-size:0.85rem;" /></td>
          <td>${label2}</td>
          <td>${label2 ? `<input class="patternCellVis" type="number" step="0.001" value="${val2}"
               data-index="${j}" style="width:80px;padding:4px 8px;text-align:center;font-size:0.85rem;" />` : ''}</td>
        `;
        ptbody.appendChild(tr);
      }
    }

    calculateDesignIntensity();

  } catch (err) {
    console.error('Error fetching pattern:', err);
  }
}

document.getElementById('ariYears').addEventListener('change', onDurationOrARIChange);
document.getElementById('durationMin').addEventListener('change', onDurationOrARIChange);
document.getElementById('stationSelect').addEventListener('change', onDurationOrARIChange);

/* ================================================================
   IDF CALCULATION
================================================================ */
function calculateDesignIntensity() {
  const K = parseFloat($('idfK').value);
  const x = parseFloat($('idfX').value);
  const A = parseFloat($('idfA').value);
  const n = parseFloat($('idfN').value);
  const ARI = parseFloat($('ariYears').value);
  const durationMin = parseFloat($('durationMin').value);

  if (![K, x, A, n, ARI, durationMin].every(isFinite)) return;

  const t_hr = durationMin / 60;
  const i_mmhr = K * Math.pow(ARI, x) / Math.pow(A + t_hr, n);
  const totalDepth = i_mmhr * t_hr;

  $('designIntensity').textContent = fmt(i_mmhr, 3);
  $('totalDepthBox').textContent = fmt(totalDepth, 3);

  updateDepthPattern(totalDepth);
}

/* ================================================================
   DEPTH PATTERN — TABLE + HIDDEN GRID + HYETOGRAPH
================================================================ */
function updateDepthPattern(totalDepth) {
  const patternCells = document.querySelectorAll('.patternCell');
  const durationMin = parseFloat($('durationMin').value);
  if (patternCells.length === 0 || !isFinite(totalDepth)) return;

  const binMin = durationMin / patternCells.length;
  const labels = [];
  const depthValues = [];
  const allDepths = [];

  const depthGrid = $('depthGrid');
  depthGrid.innerHTML = '';

  patternCells.forEach((cell, i) => {
    const norm = parseFloat(cell.value);
    const dv = norm * totalDepth;
    const label = `${i * binMin}–${(i + 1) * binMin} min`;
    labels.push(label);
    depthValues.push(parseFloat(dv.toFixed(3)));
    allDepths.push({ label, dv });

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label>${label}</label>
      <input class="depthCell depth-box" type="text" value="${dv.toFixed(3)}" readonly style="text-align:center;" />
    `;
    depthGrid.appendChild(wrap);
  });

  // Depth table (column-first 2-col)
  const dtbody = $('depthTableBody');
  if (dtbody) {
    dtbody.innerHTML = '';
    const half2 = Math.ceil(allDepths.length / 2);
    for (let i = 0; i < half2; i++) {
      const j = i + half2;
      const d2 = allDepths[j];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${allDepths[i].label}</td>
        <td style="color:var(--ok);font-weight:600;">${allDepths[i].dv.toFixed(3)}</td>
        <td>${d2 ? d2.label : ''}</td>
        <td style="color:var(--ok);font-weight:600;">${d2 ? d2.dv.toFixed(3) : ''}</td>
      `;
      dtbody.appendChild(tr);
    }
  }

  renderHyetograph(labels, depthValues);
  buildLossEstimationTable();
  calculateRunoffTable();
}

/* ================================================================
   RUNOFF TABLE (Rainfall Excess)
================================================================ */
function calculateRunoffTable() {
  const tbody = $('runoffTableBody');
  if (!tbody) return;

  const depthCells = document.querySelectorAll('#depthGrid .depthCell');
  if (depthCells.length === 0) return;

  const numBins = depthCells.length;
  const durationMin = parseFloat($('durationMin').value);
  const binMin = durationMin / numBins;
  const pervPct = parseFloat($('perviousArea').value) || 40;
  const impPct = parseFloat($('imperviousArea').value) || 60;
  const soilType = $('soilType') ? $('soilType').value : 'loam';
  const range = soilRanges[soilType] || soilRanges.loam;
  const contRates = generateContRates(numBins, range.max, range.min, range.k);

  tbody.innerHTML = '';
  let sumRain = 0, sumLoss = 0, sumExcess = 0;

  depthCells.forEach((cell, i) => {
    const rainfall = parseFloat(cell.value);
    if (!isFinite(rainfall)) return;
    const lbl = cell.parentElement.querySelector('label').textContent;

    const pervContMM = i === 0 ? 10.00 : parseFloat((contRates[i] / 60 * binMin).toFixed(2));
    const impInitMM = i === 0 ? 1.50 : 0.00;

    const totalLoss = parseFloat(((pervContMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
    const excess = Math.max(0, parseFloat((rainfall - totalLoss).toFixed(3)));
    const excessMms = parseFloat((excess / (binMin * 60)).toFixed(4));

    sumRain += rainfall;
    sumLoss += totalLoss;
    sumExcess += excess;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:0.8rem;">${lbl}</td>
      <td>${rainfall.toFixed(3)}</td>
      <td>${totalLoss.toFixed(2)}</td>
      <td style="color:var(--ok);font-weight:600;">${excess.toFixed(3)}</td>
      <td>${excessMms.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Totals
  const tRain = $('runoffTotalRain'); if (tRain) tRain.textContent = sumRain.toFixed(3);
  const tLoss = $('runoffTotalLoss'); if (tLoss) tLoss.textContent = sumLoss.toFixed(2);
  const tExc = $('runoffTotalExcess'); if (tExc) tExc.textContent = sumExcess.toFixed(3);
}

/* ================================================================
   LOSSES CALCULATION (old table — kept for calculate button)
================================================================ */
function calculateLossesTable() {
  buildLossEstimationTable();
  calculateRunoffTable();
}

/* ================================================================
   CALCULATE BUTTON (Results tab)
================================================================ */
$('calcBtn').addEventListener('click', function () {
  const pattern = Array.from(document.querySelectorAll('.patternCell')).map(i => parseFloat(i.value));
  const patternSum = sum(pattern);
  const K = parseFloat($('idfK').value);
  const x = parseFloat($('idfX').value);
  const A = parseFloat($('idfA').value);
  const n = parseFloat($('idfN').value);
  const ARI = parseFloat($('ariYears').value);
  const durationMin = parseFloat($('durationMin').value);

  if (![K, x, A, n, ARI, durationMin].every(isFinite)) {
    alert('Please complete Steps 1–3 before calculating.');
    return;
  }

  const t_hr = durationMin / 60;
  const i_mmhr = K * Math.pow(ARI, x) / Math.pow(A + t_hr, n);
  const totalDepth = i_mmhr * t_hr;
  const binDepths = pattern.map(f => f * totalDepth);

  const numBins = pattern.length;
  const binMin = durationMin / numBins;
  const pervPct = parseFloat($('perviousArea').value);
  const impPct = parseFloat($('imperviousArea').value);
  const soilType = $('soilType') ? $('soilType').value : 'loam';
  const range = soilRanges[soilType] || soilRanges.loam;
  const contRates = generateContRates(numBins, range.max, range.min, range.k);
  const dt_hr = binMin / 60;

  let rows = [], sumLoss = 0, sumExcess = 0;

  binDepths.forEach((depth, b) => {
    const pervContMM = b === 0 ? 10.00 : parseFloat((contRates[b] / 60 * binMin).toFixed(2));
    const impInitMM = b === 0 ? 1.50 : 0.00;
    const loss = Math.min(parseFloat(((pervContMM * pervPct + impInitMM * impPct) / 100).toFixed(2)), depth);
    const excess = Math.max(0, depth - loss);
    const mmps = excess / (binMin * 60);
    sumLoss += loss; sumExcess += excess;

    rows.push({
      label: `${b * binMin}–${(b + 1) * binMin}`,
      frac: pattern[b], depth, loss, excess, mmps
    });
  });

  $('outI').textContent = fmt(i_mmhr, 3);
  $('outDepth').textContent = fmt(totalDepth, 3);
  $('outExcess').textContent = fmt(sumExcess, 3);

  const tbody = $('resultTable').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.label}</td>
      <td>${fmt(r.frac, 3)}</td>
      <td>${fmt(r.depth, 3)}</td>
      <td>${fmt(r.loss, 3)}</td>
      <td>${fmt(r.excess, 3)}</td>
      <td>${fmt(r.mmps, 4)}</td>
    `;
    tbody.appendChild(tr);
  });

  $('sumPattern').textContent = fmt(patternSum, 3);
  $('sumDepth').textContent = fmt(sum(binDepths), 3);
  $('sumLoss').textContent = fmt(sumLoss, 3);
  $('sumExcess').textContent = fmt(sumExcess, 3);
});

/* ================================================================
   INIT
================================================================ */
window.addEventListener('DOMContentLoaded', function () {
  $('state').value = '';
  $('durationMin').value = '';
});