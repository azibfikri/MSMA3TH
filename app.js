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
          display: true,
          position: 'top',
          labels: { color: '#7f8ea3', font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: {
          backgroundColor: '#111723',
          borderColor: '#1a2433',
          borderWidth: 1,
          titleColor: '#e8f0ff',
          bodyColor: '#7f8ea3',
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} mm`
          }
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

    // Populate normalized pattern TABLE (2-column layout)
    const ptbody = $('patternTableBody');
    ptbody.innerHTML = '';
    for (let i = 0; i < values.length; i += 2) {
      const tr = document.createElement('tr');
      const label1 = `${i * binMin}–${(i + 1) * binMin} min`;
      const label2 = (i + 1 < values.length) ? `${(i + 1) * binMin}–${(i + 2) * binMin} min` : '';
      const val2 = (i + 1 < values.length) ? values[i + 1].toFixed(3) : '';
      tr.innerHTML = `
        <td>${label1}</td>
        <td><input class="patternCellVis" type="number" step="0.001" value="${values[i].toFixed(3)}" 
             data-index="${i}" style="width:80px;padding:4px 8px;text-align:center;font-size:0.85rem;" /></td>
        <td>${label2}</td>
        <td>${label2 ? `<input class="patternCellVis" type="number" step="0.001" value="${val2}" 
             data-index="${i + 1}" style="width:80px;padding:4px 8px;text-align:center;font-size:0.85rem;" />` : ''}</td>
      `;
      ptbody.appendChild(tr);
    }

    calculateDesignIntensity();

  } catch (err) {
    console.error('Error fetching pattern:', err);
  }
}

document.getElementById('ariYears').addEventListener('change', onDurationOrARIChange);
document.getElementById('durationMin').addEventListener('change', onDurationOrARIChange);

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

  // Clear hidden depthGrid
  const depthGrid = $('depthGrid');
  depthGrid.innerHTML = '';

  // Build depth table (2-column layout)
  const dtbody = $('depthTableBody');
  dtbody.innerHTML = '';

  const allDepths = [];
  patternCells.forEach((cell, i) => {
    const norm = parseFloat(cell.value);
    const dv = norm * totalDepth;
    const label = `${i * binMin}–${(i + 1) * binMin} min`;
    labels.push(label);
    depthValues.push(parseFloat(dv.toFixed(3)));
    allDepths.push({ label, dv });

    // Add to hidden depthGrid for calculateLossesTable
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label>${label}</label>
      <input class="depthCell depth-box" type="text" value="${dv.toFixed(3)}" readonly style="text-align:center;" />
    `;
    depthGrid.appendChild(wrap);
  });

  // Populate depth table in 2-column format
  for (let i = 0; i < allDepths.length; i += 2) {
    const tr = document.createElement('tr');
    const d2 = allDepths[i + 1];
    tr.innerHTML = `
      <td>${allDepths[i].label}</td>
      <td style="color:var(--ok);font-weight:600;">${allDepths[i].dv.toFixed(3)}</td>
      <td>${d2 ? d2.label : ''}</td>
      <td style="color:var(--ok);font-weight:600;">${d2 ? d2.dv.toFixed(3) : ''}</td>
    `;
    dtbody.appendChild(tr);
  }

  // Render hyetograph
  renderHyetograph(labels, depthValues);

  // Trigger losses table
  calculateLossesTable();
}

/* ================================================================
   LOSSES CALCULATION
================================================================ */
function calculateLossesTable() {
  const tbody = $('lossesTableBody');
  if (!tbody) return;

  const depthCells = document.querySelectorAll('#depthGrid .depthCell');
  const pervArea = parseFloat($('perviousArea').value) / 100;
  const impArea = parseFloat($('imperviousArea').value) / 100;
  const pervInit = 10.0;
  const pervCont = parseFloat($('pervContinuousLoss').value);
  const impInit = parseFloat($('impInitialLoss').value);

  if (depthCells.length === 0) return;

  const durationMin = parseFloat($('durationMin').value);
  const binH = (durationMin / depthCells.length) / 60;

  let pervIR = pervInit, impIR = impInit;
  let sumR = 0, sumL = 0, sumE = 0;
  tbody.innerHTML = '';

  depthCells.forEach(cell => {
    const r = parseFloat(cell.value);
    if (!isFinite(r)) return;
    const lbl = cell.parentElement.querySelector('label').textContent;

    const piu = Math.min(pervIR, r); pervIR -= piu;
    const pcu = Math.min(pervCont * binH, Math.max(0, r - piu));
    const iiu = Math.min(impIR, r); impIR -= iiu;

    const loss = (pervArea * (piu + pcu)) + (impArea * iiu);
    const excess = Math.max(0, r - loss);
    sumR += r; sumL += loss; sumE += excess;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lbl}</td>
      <td>${r.toFixed(2)}</td>
      <td>${piu.toFixed(2)}</td>
      <td>${pcu.toFixed(2)}</td>
      <td>${iiu.toFixed(2)}</td>
      <td style="color:var(--muted);">0.00</td>
      <td>${loss.toFixed(2)}</td>
      <td style="color:var(--ok);font-weight:600;">${excess.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  $('totalRainfall').textContent = sumR.toFixed(2);
  $('totalLoss').textContent = sumL.toFixed(2);
  $('totalExcess').textContent = sumE.toFixed(2);
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

  let pervInitRem = 10.0;
  let impInitRem = parseFloat($('impInitialLoss').value);
  const pervArea = parseFloat($('perviousArea').value);
  const impArea = parseFloat($('imperviousArea').value);
  const pervCont = parseFloat($('pervContinuousLoss').value);
  const binMin = durationMin / pattern.length;
  const dt_hr = binMin / 60;

  let rows = [], sumLoss = 0, sumExcess = 0;

  binDepths.forEach((depth, b) => {
    const piu = Math.min(pervInitRem, depth); pervInitRem -= piu;
    const pcu = Math.min(pervCont * dt_hr, Math.max(0, depth - piu));
    const iiu = Math.min(impInitRem, depth); impInitRem -= iiu;

    const loss = Math.min((pervArea * (piu + pcu) + impArea * iiu) / 100, depth);
    const excess = Math.max(0, depth - loss);
    const mmps = excess / (binMin * 60);
    sumLoss += loss; sumExcess += excess;

    rows.push({ label: `${b * binMin}–${(b + 1) * binMin}`, frac: pattern[b], depth, loss, excess, mmps });
  });

  // Update summary cards
  $('outI').textContent = fmt(i_mmhr, 3);
  $('outDepth').textContent = fmt(totalDepth, 3);
  $('outExcess').textContent = fmt(sumExcess, 3);

  // Results table
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