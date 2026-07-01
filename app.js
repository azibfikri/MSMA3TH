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
    `${SUPABASE_URL}/rest/v1/stations?state=eq.${encodeURIComponent(state)}&order=name.asc`,
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
  return data[0]; // return first match
}

/* ================================================================
   STATE → REGION MAPPING
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
   ON STATE CHANGE → load stations from Supabase
================================================================ */
document.getElementById('state').addEventListener('change', async function () {
  const state = this.value;
  const stationSelect = document.getElementById('stationSelect');

  // Reset station dropdown
  stationSelect.innerHTML = '<option value="">-- Select Station --</option>';

  // Clear IDF fields
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
   ON STATION CHANGE → autofill IDF coefficients
================================================================ */
document.getElementById('stationSelect').addEventListener('change', function () {
  const opt = this.options[this.selectedIndex];
  if (!opt.value) return;

  $('idfK').value = opt.dataset.lambda;
  $('idfX').value = opt.dataset.kappa;
  $('idfA').value = opt.dataset.theta;
  $('idfN').value = opt.dataset.eta;

  // Trigger intensity calculation if duration already selected
  calculateDesignIntensity();
});

/* ================================================================
   ON DURATION/ARI CHANGE → fetch temporal pattern + calculate
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

    // Update pattern grid
    const grid = $('patternGrid');
    grid.innerHTML = '';
    const binMin = pattern.bin_minutes;

    pattern.values.forEach((v, i) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <label>${i * binMin}-${(i + 1) * binMin} min</label>
        <input class="patternCell" type="number" step="0.001" value="${v}" />
      `;
      grid.appendChild(wrap);
    });

    // Set grid class based on number of bins
    const len = pattern.values.length;
    grid.className = 'row' + (len <= 6 ? ' six' : len <= 12 ? ' twelve' : ' twentyfour');

    // Recalculate
    calculateDesignIntensity();

  } catch (err) {
    console.error('Error fetching pattern:', err);
  }
}

document.getElementById('ariYears').addEventListener('change', onDurationOrARIChange);
document.getElementById('durationMin').addEventListener('change', onDurationOrARIChange);

/* ================================================================
   IDF INTENSITY CALCULATION
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
  if ($('totalDepthBox')) $('totalDepthBox').textContent = fmt(totalDepth, 3);

  updateDepthPattern(totalDepth);
}

/* ================================================================
   DEPTH PATTERN UPDATE
================================================================ */
function updateDepthPattern(totalDepth) {
  const patternCells = document.querySelectorAll('.patternCell');
  const depthGrid = $('depthGrid');
  if (!depthGrid) return;

  depthGrid.innerHTML = '';
  patternCells.forEach(cell => {
    const norm = parseFloat(cell.value);
    const depthVal = norm * totalDepth;
    const timeLabel = cell.parentElement.querySelector('label').textContent;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label>${timeLabel}</label>
      <input class="depthCell depth-box" type="text" 
             value="${depthVal.toFixed(3)}" readonly style="text-align:center;" />
    `;
    depthGrid.appendChild(wrap);
  });

  depthGrid.className = $('patternGrid').className;
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
  const impCont = 0.0;

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
   CALCULATE BUTTON
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

  let warn = [];
  if (Math.abs(patternSum - 1) > 0.02) warn.push(`Pattern sums to ${patternSum.toFixed(3)} (not ~1.000).`);

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

  let rows = [];
  let sumLoss = 0, sumExcess = 0;

  binDepths.forEach((depth, b) => {
    const piu = Math.min(pervInitRem, depth); pervInitRem -= piu;
    const pcu = Math.min(pervCont * dt_hr, Math.max(0, depth - piu));
    const iiu = Math.min(impInitRem, depth); impInitRem -= iiu;

    const loss = Math.min((pervArea * (piu + pcu) + impArea * iiu) / 100, depth);
    const excess = Math.max(0, depth - loss);
    const mmps = excess / (binMin * 60);
    sumLoss += loss; sumExcess += excess;

    rows.push({
      label: `${b * binMin}-${(b + 1) * binMin}`,
      frac: pattern[b], depth, loss, excess, mmps
    });
  });

  $('outI').textContent = fmt(i_mmhr, 3);
  $('outDepth').textContent = fmt(totalDepth, 3);

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

  $('msg').textContent = warn.length ? `⚠ ${warn.join(' ')}` : '✓ Done.';
  $('msg').className = warn.length ? 'bad' : 'good';
});

/* ================================================================
   INIT
================================================================ */
window.addEventListener('DOMContentLoaded', function () {
  $('state').value = '';
  $('durationMin').value = '';
});