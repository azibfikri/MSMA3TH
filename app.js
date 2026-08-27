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
   READ HORTON PARAMETERS FROM UI
   Helper to safely read f0, fc, k from UI elements.
   FIX Issue 3: read k directly — do NOT use || fallback
               because 0 || 2.5 = 2.5 (JavaScript falsy bug)
================================================================ */
function getHortonParams() {
  const f0El = document.getElementById('pervContinuousLoss');
  const fcEl = document.getElementById('fcValue');
  const kEl  = document.getElementById('kValue');

  const f0 = f0El ? parseFloat(f0El.value) : 76.20;
  const fc = fcEl ? parseFloat(fcEl.value) : 5.97;
  // FIX: use Number() to avoid 0 || fallback bug
  const k  = kEl  ? Number(kEl.value)      : 2.5;

  return {
    f0: isFinite(f0) ? f0 : 76.20,
    fc: isFinite(fc) ? fc : 5.97,
    k:  isFinite(k)  ? k  : 2.5
  };
}

/* ================================================================
   GENERATE CONTINUOUS LOSS RATES — Horton's Equation
   f(t) = fc + (f0 - fc) × e^(-k × t)

   Returns array of length numBins.
   Index 0 of returned array = f0 (max rate, t=0)
   Index 1..N decay towards fc

   NOTE: In the TABLE display:
   - Bin 0 (first time bin): cont loss shown as 0 (only initial loss)
   - Bin 1 (second time bin): uses contRates[0] = f0 ← starts at max
   - Bin 2: uses contRates[1], Bin 3: uses contRates[2], etc.
   This shift ensures bin 1 always shows f0 exactly.

   FIX Issue 3: k=0 → constant flat line (no decay)
                uses Number() in getHortonParams() to avoid || bug
================================================================ */
function generateContRates(numBins, f0, fc, k) {
  const rates = [];
  // numBins-1 because bin 0 is always 0 in display,
  // so we generate rates for bins 1..numBins-1 only (numBins-1 values)
  // but we generate numBins values for indexing convenience
  const decayBins = numBins > 1 ? numBins - 1 : 1;

  for (let i = 0; i < numBins; i++) {
    if (k === 0) {
      // FIX Issue 3: k=0 → constant rate = f0 for ALL bins (flat line)
      rates.push(parseFloat(f0.toFixed(2)));
    } else if (decayBins === 1) {
      rates.push(parseFloat(f0.toFixed(2)));
    } else {
      // Normalised time: i=0 → t=0 (rate=f0), i=decayBins-1 → t=1 (rate≈fc)
      const t = i / (decayBins - 1);
      const rate = fc + (f0 - fc) * Math.exp(-k * t);
      rates.push(parseFloat(Math.max(fc, rate).toFixed(2)));
    }
  }
  return rates;
  // contRates[0] = f0 (used for display bin 1)
  // contRates[1] = decayed value (used for display bin 2)
  // contRates[i] used for display bin i+1
}

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
   LOSS ESTIMATION CHART — Horton Decay
   Bars = cont. loss per bin (mm)
   Line = infiltration rate decay (mm/hr) on secondary axis
   FIX Issue 3 & 5: chart reflects actual k=0 flat line correctly
================================================================ */
let lossEstChart = null;

function renderLossEstChart(labels, contRatesMmhr, contRatesMm) {
  const canvas = $('lossEstChartCanvas');
  if (!canvas) return;

  if (lossEstChart) {
    lossEstChart.destroy();
    lossEstChart = null;
  }

  if (!labels || labels.length === 0) return;

  lossEstChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Cont. Loss per Bin (mm)',
          data: contRatesMm,
          backgroundColor: 'rgba(78, 168, 255, 0.3)',
          borderColor: 'rgba(78, 168, 255, 0.7)',
          borderWidth: 1.5,
          borderRadius: 3,
          yAxisID: 'yMm',
          order: 2
        },
        {
          type: 'line',
          label: 'Infiltration Rate (mm/hr)',
          data: contRatesMmhr,
          borderColor: '#ffd166',
          borderWidth: 2.5,
          pointBackgroundColor: '#ffd166',
          pointBorderColor: '#0b0f14',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: false,
          yAxisID: 'yMmhr',
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
          callbacks: {
            label: function (ctx) {
              if (ctx.dataset.yAxisID === 'yMmhr')
                return ` Infiltration Rate: ${ctx.parsed.y.toFixed(2)} mm/hr`;
              return ` Cont. Loss: ${ctx.parsed.y.toFixed(3)} mm`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Time Bin (min)', color: '#7f8ea3', font: { size: 11 } },
          ticks: { color: '#7f8ea3', font: { size: 9 }, maxRotation: 45 },
          grid: { color: 'rgba(26,36,51,0.6)' }
        },
        yMm: {
          type: 'linear', position: 'left',
          title: { display: true, text: 'Cont. Loss per Bin (mm)', color: '#4ea8ff', font: { size: 10 } },
          ticks: { color: '#4ea8ff', font: { size: 10 } },
          grid: { color: 'rgba(26,36,51,0.6)' },
          beginAtZero: true
        },
        yMmhr: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'Infiltration Rate (mm/hr)', color: '#ffd166', font: { size: 10 } },
          ticks: { color: '#ffd166', font: { size: 10 } },
          grid: { drawOnChartArea: false },
          beginAtZero: true
        }
      }
    }
  });
}

/* ================================================================
   BUILD ESTIMATION OF LOSSES TABLE

   FIXED LOGIC (Issues 1, 2, 3, 5):

   BIN 0 (first time bin):
   - pervInitMM   = 10.00 mm (fixed)
   - contRateMmhr = 0.00  (no continuous loss yet)
   - pervContMM   = 0.00
   - impInitMM    = 1.50 mm (fixed)
   - impContMM    = 0.00
   - totalLoss    = (pervInitMM × pervPct + impInitMM × impPct) / 100
                  = (10.00 × 40 + 1.50 × 60) / 100 = 4.90

   BIN 1+ (second bin onwards):
   - pervInitMM   = 0.00
   - contRateMmhr = contRates[i-1]  ← SHIFT: bin1 uses contRates[0]=f0
   - pervContMM   = contRateMmhr / 60 × binMin
   - impInitMM    = 0.00
   - impContMM    = 0.00
   - totalLoss    = (pervContMM × pervPct + impContMM × impPct) / 100
                  = (pervContMM × pervPct) / 100

   FIX Issue 5: when k=0, fc slider is greyed out + note shown
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

  const numBins     = depthCells.length;
  const durationMin = parseFloat($('durationMin').value);
  const binMin      = durationMin / numBins;
  const pervPct     = parseFloat($('perviousArea').value) || 40;
  const impPct      = parseFloat($('imperviousArea').value) || 60;

  // Update header percentages
  if ($('lossEstPervPct')) $('lossEstPervPct').textContent = pervPct;
  if ($('lossEstImpPct'))  $('lossEstImpPct').textContent  = impPct;

  // Read Horton params safely
  const { f0, fc, k } = getHortonParams();

  // FIX Issue 5: grey out fc slider when k=0
  const fcSlider  = $('fcSlider');
  const fcDisplay = $('fcDisplay');
  const fcNote    = $('fcNote');
  if (fcSlider) {
    if (k === 0) {
      fcSlider.disabled = true;
      fcSlider.style.opacity = '0.3';
      if (fcDisplay) fcDisplay.style.color = 'var(--muted)';
      if (fcNote) {
        fcNote.textContent = 'fc has no effect when k = 0 (constant rate = f₀)';
        fcNote.style.color = 'var(--warn)';
      }
    } else {
      fcSlider.disabled = false;
      fcSlider.style.opacity = '1';
      if (fcDisplay) fcDisplay.style.color = 'var(--ok)';
      if (fcNote) {
        fcNote.textContent = 'Range based on Rawls et al. (1983) soil characteristics';
        fcNote.style.color = 'var(--muted)';
      }
    }
  }

  // Generate rates — contRates[0]=f0, contRates[1..] decay
  const contRates = generateContRates(numBins, f0, fc, k);

  tbody.innerHTML = '';
  let totalLossSum = 0;

  // Arrays for chart (skip bin 0 since cont=0, start from bin 1)
  const chartLabels    = [];
  const chartRatesMmhr = [];
  const chartRatesMm   = [];

  for (let i = 0; i < numBins; i++) {
    const binLabel = `${i * binMin}–${(i + 1) * binMin}`;

    let pervInitMM, contRateMmhr, pervContMM, impInitMM, totalLoss;

    if (i === 0) {
      // ── BIN 0: only initial losses ──
      pervInitMM   = 10.00;
      contRateMmhr = 0.00;
      pervContMM   = 0.00;
      impInitMM    = 1.50;
      // FIX Issue 1: total = (pervInit×pervPct + impInit×impPct) / 100
      totalLoss = parseFloat(((pervInitMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
    } else {
      // ── BIN 1+: continuous loss only ──
      pervInitMM   = 0.00;
      // FIX Issue 2: shift index by -1 so bin 1 uses contRates[0] = f0
      contRateMmhr = contRates[i - 1];
      pervContMM   = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
      impInitMM    = 0.00;
      // FIX Issue 2: total = (pervContMM×pervPct + 0×impPct) / 100
      totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
    }

    totalLossSum += totalLoss;

    // Chart data: show rate and mm for all bins (0 for bin 0)
    chartLabels.push(binLabel);
    chartRatesMmhr.push(contRateMmhr);
    chartRatesMm.push(pervContMM);

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

  if ($('lossEstTotal')) $('lossEstTotal').textContent = totalLossSum.toFixed(2);

  // Render chart
  renderLossEstChart(chartLabels, chartRatesMmhr, chartRatesMm);
}

/* ================================================================
   RUNOFF TABLE (Rainfall Excess)
   Same fixed logic as buildLossEstimationTable
================================================================ */
function calculateRunoffTable() {
  const tbody = $('runoffTableBody');
  if (!tbody) return;

  const depthCells  = document.querySelectorAll('#depthGrid .depthCell');
  if (depthCells.length === 0) return;

  const numBins     = depthCells.length;
  const durationMin = parseFloat($('durationMin').value);
  const binMin      = durationMin / numBins;
  const pervPct     = parseFloat($('perviousArea').value) || 40;
  const impPct      = parseFloat($('imperviousArea').value) || 60;

  const { f0, fc, k } = getHortonParams();
  const contRates = generateContRates(numBins, f0, fc, k);

  tbody.innerHTML = '';
  let sumRain = 0, sumLoss = 0, sumExcess = 0;

  depthCells.forEach((cell, i) => {
    const rainfall = parseFloat(cell.value);
    if (!isFinite(rainfall)) return;
    const lbl = cell.parentElement.querySelector('label').textContent;

    let totalLoss;
    if (i === 0) {
      // Bin 0: initial losses only
      const pervInitMM = 10.00;
      const impInitMM  = 1.50;
      totalLoss = parseFloat(((pervInitMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
    } else {
      // Bin 1+: continuous loss only, shifted index
      const contRateMmhr = contRates[i - 1];
      const pervContMM   = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
      totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
    }

    const excess    = Math.max(0, parseFloat((rainfall - totalLoss).toFixed(3)));
    const excessMms = parseFloat((excess / (binMin * 60)).toFixed(4));

    sumRain   += rainfall;
    sumLoss   += totalLoss;
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

  if ($('runoffTotalRain'))   $('runoffTotalRain').textContent   = sumRain.toFixed(3);
  if ($('runoffTotalLoss'))   $('runoffTotalLoss').textContent   = sumLoss.toFixed(2);
  if ($('runoffTotalExcess')) $('runoffTotalExcess').textContent = sumExcess.toFixed(3);
}

/* ================================================================
   LOSSES CALCULATION (wrapper)
================================================================ */
function calculateLossesTable() {
  buildLossEstimationTable();
  calculateRunoffTable();
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
  const state       = $('state').value;
  const durationMin = parseFloat($('durationMin').value);
  if (!state || !durationMin) return;

  const region      = stateToRegion[state];
  const durationKey = durationMap[durationMin];
  if (!region || !durationKey) return;

  try {
    const pattern = await fetchPattern(region, durationKey);
    if (!pattern) return;

    const binMin = pattern.bin_minutes;
    const values = pattern.values;

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

    const ptbody = $('patternTableBody');
    if (ptbody) {
      ptbody.innerHTML = '';
      const half = Math.ceil(values.length / 2);
      for (let i = 0; i < half; i++) {
        const j = i + half;
        const label1 = `${i * binMin}–${(i + 1) * binMin} min`;
        const label2 = j < values.length ? `${j * binMin}–${(j + 1) * binMin} min` : '';
        const val2   = j < values.length ? values[j].toFixed(3) : '';
        const tr = document.createElement('tr');
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
  const K   = parseFloat($('idfK').value);
  const x   = parseFloat($('idfX').value);
  const A   = parseFloat($('idfA').value);
  const n   = parseFloat($('idfN').value);
  const ARI = parseFloat($('ariYears').value);
  const durationMin = parseFloat($('durationMin').value);

  if (![K, x, A, n, ARI, durationMin].every(isFinite)) return;

  const t_hr   = durationMin / 60;
  const i_mmhr = K * Math.pow(ARI, x) / Math.pow(A + t_hr, n);
  const totalDepth = i_mmhr * t_hr;

  $('designIntensity').textContent = fmt(i_mmhr, 3);
  $('totalDepthBox').textContent   = fmt(totalDepth, 3);

  updateDepthPattern(totalDepth);
}

/* ================================================================
   DEPTH PATTERN — TABLE + HIDDEN GRID + HYETOGRAPH
================================================================ */
function updateDepthPattern(totalDepth) {
  const patternCells = document.querySelectorAll('.patternCell');
  const durationMin  = parseFloat($('durationMin').value);
  if (patternCells.length === 0 || !isFinite(totalDepth)) return;

  const binMin   = durationMin / patternCells.length;
  const labels   = [];
  const depthValues = [];
  const allDepths   = [];

  const depthGrid = $('depthGrid');
  depthGrid.innerHTML = '';

  patternCells.forEach((cell, i) => {
    const norm  = parseFloat(cell.value);
    const dv    = norm * totalDepth;
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

  const dtbody = $('depthTableBody');
  if (dtbody) {
    dtbody.innerHTML = '';
    const half2 = Math.ceil(allDepths.length / 2);
    for (let i = 0; i < half2; i++) {
      const j  = i + half2;
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
   CALCULATE BUTTON (Results tab)
   Same fixed logic as buildLossEstimationTable
================================================================ */
$('calcBtn').addEventListener('click', function () {
  const pattern     = Array.from(document.querySelectorAll('.patternCell')).map(i => parseFloat(i.value));
  const patternSum  = sum(pattern);
  const K   = parseFloat($('idfK').value);
  const x   = parseFloat($('idfX').value);
  const A   = parseFloat($('idfA').value);
  const n   = parseFloat($('idfN').value);
  const ARI = parseFloat($('ariYears').value);
  const durationMin = parseFloat($('durationMin').value);

  if (![K, x, A, n, ARI, durationMin].every(isFinite)) {
    alert('Please complete Steps 1–3 before calculating.');
    return;
  }

  const t_hr     = durationMin / 60;
  const i_mmhr   = K * Math.pow(ARI, x) / Math.pow(A + t_hr, n);
  const totalDepth = i_mmhr * t_hr;
  const binDepths  = pattern.map(f => f * totalDepth);

  const numBins = pattern.length;
  const binMin  = durationMin / numBins;
  const pervPct = parseFloat($('perviousArea').value);
  const impPct  = parseFloat($('imperviousArea').value);

  const { f0, fc, k } = getHortonParams();
  const contRates = generateContRates(numBins, f0, fc, k);

  let rows = [], sumLoss = 0, sumExcess = 0;

  binDepths.forEach((depth, b) => {
    let totalLoss;
    if (b === 0) {
      totalLoss = parseFloat(((10.00 * pervPct + 1.50 * impPct) / 100).toFixed(2));
    } else {
      const contRateMmhr = contRates[b - 1]; // shift: bin b uses contRates[b-1]
      const pervContMM   = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
      totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
    }

    const loss   = Math.min(totalLoss, depth);
    const excess = Math.max(0, depth - loss);
    const mmps   = excess / (binMin * 60);
    sumLoss   += loss;
    sumExcess += excess;

    rows.push({
      label: `${b * binMin}–${(b + 1) * binMin}`,
      frac: pattern[b], depth, loss, excess, mmps
    });
  });

  $('outI').textContent      = fmt(i_mmhr, 3);
  $('outDepth').textContent  = fmt(totalDepth, 3);
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
  $('sumDepth').textContent   = fmt(sum(binDepths), 3);
  $('sumLoss').textContent    = fmt(sumLoss, 3);
  $('sumExcess').textContent  = fmt(sumExcess, 3);
});

/* ================================================================
   INIT
================================================================ */
window.addEventListener('DOMContentLoaded', function () {
  $('state').value = '';
  $('durationMin').value = '';
});