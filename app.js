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
    const kEl = document.getElementById('kValue');

    const f0 = f0El ? parseFloat(f0El.value) : NaN;
    const fc = fcEl ? parseFloat(fcEl.value) : NaN;
    const k = kEl ? Number(kEl.value) : 2.5;

    return {
        f0: isFinite(f0) ? f0 : null, // null = user hasn't entered yet
        fc: isFinite(fc) ? fc : null,
        k: isFinite(k) ? k : 2.5
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

    const numBins = depthCells.length;
    const durationMin = parseFloat($('durationMin').value);
    const binMin = durationMin / numBins;
    const pervPct = parseFloat($('perviousArea').value) || 40;
    const impPct = parseFloat($('imperviousArea').value) || 60;

    // Update header percentages
    if ($('lossEstPervPct')) $('lossEstPervPct').textContent = pervPct;
    if ($('lossEstImpPct')) $('lossEstImpPct').textContent = impPct;

    // Read Horton params safely
    const { f0, fc, k } = getHortonParams();

    // If user hasn't entered f0 or fc yet, show placeholder message
    if (f0 === null || fc === null) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px;">
      Please enter Max. Infiltration Rate (f₀) and Min. Infiltration Rate (f꜀) above.</td></tr>`;
        if ($('lossEstTotal')) $('lossEstTotal').textContent = '–';
        return;
    }

    // FIX Issue 5: grey out fc slider when k=0
    const fcSlider = $('fcSlider');
    const fcDisplay = $('fcDisplay');
    const fcNote = $('fcNote');
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
    const chartLabels = [];
    const chartRatesMmhr = [];
    const chartRatesMm = [];

    for (let i = 0; i < numBins; i++) {
        const binLabel = `${i * binMin}–${(i + 1) * binMin}`;

        let pervInitMM, contRateMmhr, pervContMM, impInitMM, totalLoss;

        if (i === 0) {
            // ── BIN 0: only initial losses ──
            pervInitMM = 10.00;
            contRateMmhr = 0.00;
            pervContMM = 0.00;
            impInitMM = 1.50;
            // FIX Issue 1: total = (pervInit×pervPct + impInit×impPct) / 100
            totalLoss = parseFloat(((pervInitMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
        } else {
            // ── BIN 1+: continuous loss only ──
            pervInitMM = 0.00;
            // FIX Issue 2: shift index by -1 so bin 1 uses contRates[0] = f0
            contRateMmhr = contRates[i - 1];
            pervContMM = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
            impInitMM = 0.00;
            // FIX Issue 2: total = (pervContMM×pervPct + 0×impPct) / 100
            totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
        }

        totalLossSum += totalLoss;

        // Chart data: show rate and mm for all bins (0 for bin 0)
        chartLabels.push(`${i * binMin}–${(i + 1) * binMin}`);
        // Bin 0 = null so chart shows empty/gap at first bin
        chartRatesMmhr.push(i === 0 ? null : contRates[i - 1]);
        chartRatesMm.push(i === 0 ? null : parseFloat((contRates[i - 1] / 60 * binMin).toFixed(3)));

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

    const depthCells = document.querySelectorAll('#depthGrid .depthCell');
    if (depthCells.length === 0) return;

    const numBins = depthCells.length;
    const durationMin = parseFloat($('durationMin').value);
    const binMin = durationMin / numBins;
    const pervPct = parseFloat($('perviousArea').value) || 40;
    const impPct = parseFloat($('imperviousArea').value) || 60;

    const { f0, fc, k } = getHortonParams();

    if (f0 === null || fc === null) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px;">
      Please enter f₀ and f꜀ values above.</td></tr>`;
        return;
    }

    const contRates = generateContRates(numBins, f0, fc, k);

    tbody.innerHTML = '';
    let sumRain = 0, sumLoss = 0, sumExcess = 0;
    _excessMmsFull = []; // reset full-precision store

    depthCells.forEach((cell, i) => {
        const rainfall = parseFloat(cell.value);
        if (!isFinite(rainfall)) return;
        const lbl = cell.parentElement.querySelector('label').textContent;

        let totalLoss;
        if (i === 0) {
            // Bin 0: initial losses only
            const pervInitMM = 10.00;
            const impInitMM = 1.50;
            totalLoss = parseFloat(((pervInitMM * pervPct + impInitMM * impPct) / 100).toFixed(2));
        } else {
            // Bin 1+: continuous loss only, shifted index
            const contRateMmhr = contRates[i - 1];
            const pervContMM = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
            totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
        }

        const excess = Math.max(0, parseFloat((rainfall - totalLoss).toFixed(3)));
        const excessMmsFull = excess / (binMin * 60); // full precision — stored for hydrograph
        _excessMmsFull.push(excessMmsFull);
        const excessMms = parseFloat(excessMmsFull.toFixed(4)); // display only

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

    if ($('runoffTotalRain')) $('runoffTotalRain').textContent = sumRain.toFixed(3);
    if ($('runoffTotalLoss')) $('runoffTotalLoss').textContent = sumLoss.toFixed(2);
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
                const val2 = j < values.length ? values[j].toFixed(3) : '';
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
    // Refresh isochrone table time labels when bins change
    if (typeof buildIsoInputTable === 'function') buildIsoInputTable();
}

/* ================================================================
   CALCULATE BUTTON (Results tab)
   Same fixed logic as buildLossEstimationTable
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

    const { f0, fc, k } = getHortonParams();
    const contRates = generateContRates(numBins, f0, fc, k);

    let rows = [], sumLoss = 0, sumExcess = 0;

    binDepths.forEach((depth, b) => {
        let totalLoss;
        if (b === 0) {
            totalLoss = parseFloat(((10.00 * pervPct + 1.50 * impPct) / 100).toFixed(2));
        } else {
            const contRateMmhr = contRates[b - 1]; // shift: bin b uses contRates[b-1]
            const pervContMM = parseFloat((contRateMmhr / 60 * binMin).toFixed(2));
            totalLoss = parseFloat(((pervContMM * pervPct) / 100).toFixed(2));
        }

        const loss = Math.min(totalLoss, depth);
        const excess = Math.max(0, depth - loss);
        const mmps = excess / (binMin * 60);
        sumLoss += loss;
        sumExcess += excess;

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
   HYDROGRAPH — Time-Area Convolution
   Q(t) = Σ [e(τ) × A(t-τ)] / 1000  → m³/s
   e = excess per bin (mm/s, full precision), A = isochrone area (m²)
   Length = numExcessBins + numIsoBins - 1
================================================================ */
let hydrographChart = null;

// Store last computed hydrograph for display
let lastHydrographData = null;

// Full-precision excess mm/s values — set by calculateRunoffTable(), read by buildHydrograph()
let _excessMmsFull = [];

function buildHydrograph() {
    // Use full-precision values stored by calculateRunoffTable()
    // (avoids reading truncated text from DOM cells)
    const excessMms = _excessMmsFull.slice();

    if (excessMms.length === 0) return;

    const durationMin = parseFloat($('durationMin').value);
    const numBins = excessMms.length;
    const binMin = durationMin / numBins;
    const binSec = binMin * 60;

    // Get isochrone areas from input table
    const isoRows = document.querySelectorAll('#isoInputTableBody tr');
    const isoAreas = [];
    isoRows.forEach(tr => {
        const inp = tr.querySelector('input[type=number]');
        if (inp) {
            const v = parseFloat(inp.value);
            if (isFinite(v) && v > 0) isoAreas.push(v);
        }
    });

    if (isoAreas.length === 0) return;

    const numIso = isoAreas.length;
    const totalLen = numBins + numIso - 1;

    // Convolution: Q[t] = Σ e[τ] × A[t-τ] / 1000
    // e[τ] is already in mm/s, A in m², so:
    // mm/s × m² / 1000 = m/s × m² = m³/s  (because 1 mm = 0.001 m)
    // This matches SV Excel formula: =excess_mm_s * area_m2 / 1000
    const Q = new Array(totalLen).fill(0);
    for (let t = 0; t < totalLen; t++) {
        let qSum = 0;
        for (let tau = 0; tau < numBins; tau++) {
            const aIdx = t - tau;
            if (aIdx >= 0 && aIdx < numIso) {
                qSum += excessMms[tau] * isoAreas[aIdx];
            }
        }
        Q[t] = qSum / 1000;
    }

    // Build time labels (end of each bin)
    const timeLabels = [];
    for (let t = 0; t < totalLen; t++) {
        timeLabels.push((t + 1) * binMin);
    }

    // Find peak
    let peakQ = 0, peakIdx = 0;
    Q.forEach((q, i) => { if (q > peakQ) { peakQ = q; peakIdx = i; } });

    // Store for table rendering
    lastHydrographData = {
        Q, timeLabels, excessMms, isoAreas,
        binMin, binSec, numBins, numIso, totalLen,
        peakQ, peakTime: timeLabels[peakIdx]
    };

    // Update peak display
    if ($('peakQ')) $('peakQ').textContent = peakQ.toFixed(4);
    if ($('peakT')) $('peakT').textContent = timeLabels[peakIdx];

    renderHydrographChart(timeLabels, Q);
    renderConvolutionMatrix();
}

/* ================================================================
   HYDROGRAPH CHART
================================================================ */
function renderHydrographChart(timeLabels, Q) {
    const canvas = $('hydrographCanvas');
    if (!canvas) return;

    if (hydrographChart) {
        hydrographChart.destroy();
        hydrographChart = null;
    }

    hydrographChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Discharge Q (m³/s)',
                data: Q,
                borderColor: '#7be495',
                borderWidth: 2.5,
                backgroundColor: 'rgba(123,228,149,0.08)',
                pointBackgroundColor: '#7be495',
                pointBorderColor: '#0b0f14',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: true
            }]
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
                        title: ctx => `Time: ${ctx[0].label} min`,
                        label: ctx => ` Q = ${ctx.parsed.y.toFixed(4)} m³/s`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Time (min)', color: '#7f8ea3', font: { size: 11 } },
                    ticks: { color: '#7f8ea3', font: { size: 10 } },
                    grid: { color: 'rgba(26,36,51,0.8)' }
                },
                y: {
                    title: { display: true, text: 'Discharge Q (m³/s)', color: '#7f8ea3', font: { size: 11 } },
                    ticks: { color: '#7f8ea3', font: { size: 10 } },
                    grid: { color: 'rgba(26,36,51,0.8)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/* ================================================================
   CONVOLUTION MATRIX TABLE
   Mirrors SV's Excel layout:
   Rows = time steps, Cols = excess bins, last col = Q(t)
================================================================ */
function renderConvolutionMatrix() {
    const wrap = $('convMatrixWrap');
    if (!wrap || !lastHydrographData) return;

    const { Q, timeLabels, excessMms, isoAreas,
        binMin, binSec, numBins, numIso, totalLen, peakQ } = lastHydrographData;

    // Build header: Time | Area of Isochron | Excess(mm/s) cols | Q
    let html = '<table class="conv-table"><thead>';

    // Row 1 header
    html += '<tr>';
    html += '<th rowspan="3">Time<br><small>(min)</small></th>';
    html += '<th rowspan="3">Area of<br>Isochron<br><small>(m²)</small></th>';
    html += '<th rowspan="3">Excess<br><small>(mm/s)</small></th>';

    // Excess bin time range headers
    for (let b = 0; b < numBins; b++) {
        const label = `${b * binMin}–${(b + 1) * binMin}`;
        html += `<th>${label}</th>`;
    }
    html += '<th rowspan="3">Q<br><small>(m³/s)</small></th>';
    html += '</tr>';

    // Row 2: excess values as sub-header
    html += '<tr class="sub-header">';
    for (let b = 0; b < numBins; b++) {
        html += `<th style="color:var(--warn);font-size:0.72rem;">${excessMms[b].toFixed(6)}</th>`;
    }
    html += '</tr>';

    // Row 3: isochrone areas
    html += '<tr class="sub-header">';
    for (let b = 0; b < numBins; b++) {
        const areaLabel = b < numIso ? `B${b + 1}: ${isoAreas[b].toLocaleString()}` : '';
        html += `<th style="color:#4ea8ff;font-size:0.72rem;">${areaLabel}</th>`;
    }
    html += '</tr>';

    html += '</thead><tbody>';

    // Data rows
    for (let t = 0; t < totalLen; t++) {
        const isoPeak = Q[t] === peakQ;
        html += `<tr${isoPeak ? ' class="peak-row"' : ''}>`;
        html += `<td style="color:var(--muted);font-size:0.8rem;">${timeLabels[t]}</td>`;

        // Show isochrone area for rows where it applies
        const isoLabel = t < numIso ? `B${t + 1}: ${isoAreas[t].toLocaleString()}` : '';
        html += `<td style="font-size:0.8rem;color:#4ea8ff;">${isoLabel}</td>`;

        // Excess mm/s for this time step (diagonal approach)
        const excessLabel = t < numBins ? excessMms[t].toFixed(6) : '';
        html += `<td style="font-size:0.8rem;color:var(--warn);">${excessLabel}</td>`;

        // Convolution contributions per column
        for (let b = 0; b < numBins; b++) {
            const aIdx = t - b;
            let cellVal = '';
            if (aIdx >= 0 && aIdx < numIso && isFinite(excessMms[b]) && excessMms[b] > 0) {
                const contrib = excessMms[b] * isoAreas[aIdx] / 1000;
                cellVal = contrib.toFixed(7);
            }
            html += `<td style="font-size:0.78rem;${cellVal ? 'color:var(--text);' : 'color:#1a2433;'}">${cellVal || '—'}</td>`;
        }

        // Q total
        html += `<td style="font-weight:700;color:${isoPeak ? 'var(--warn)' : 'var(--ok)'};">${Q[t].toFixed(4)}</td>`;
        html += '</tr>';
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

/* ================================================================
   ISOCHRONE INPUT TABLE — build/manage in Step 4
================================================================ */
function buildIsoInputTable() {
    const tbody = $('isoInputTableBody');
    if (!tbody) return;

    // Preserve existing values
    const existing = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        const inp = tr.querySelector('input[type=number]');
        if (inp) existing.push(inp.value);
    });

    const durationMin = parseFloat($('durationMin').value) || 30;
    const numBins = document.querySelectorAll('#depthGrid .depthCell').length || 1;
    const binMin = durationMin / numBins;

    // Keep existing rows, just update labels
    const currentRows = tbody.querySelectorAll('tr').length;
    if (currentRows === 0) {
        // Add one default row
        addIsoRow();
    }

    updateIsoTotal();
}

function addIsoRow() {
    const tbody = $('isoInputTableBody');
    if (!tbody) return;

    const durationMin = parseFloat($('durationMin').value) || 30;
    const numBins = document.querySelectorAll('#depthGrid .depthCell').length || 1;
    const binMin = durationMin / numBins;

    const rowIdx = tbody.querySelectorAll('tr').length;
    const tStart = rowIdx * binMin;
    const tEnd = (rowIdx + 1) * binMin;

    const tr = document.createElement('tr');
    tr.innerHTML = `
    <td style="color:var(--muted);font-size:0.8rem;">B${rowIdx + 1}
      <span style="font-size:0.72rem;color:#1a2433;margin-left:4px;">${tStart}–${tEnd} min</span>
    </td>
    <td>
      <input type="number" min="0" step="1" placeholder="e.g. 350000"
        style="width:140px;padding:6px 10px;font-size:0.85rem;"
        oninput="updateIsoTotal()" />
    </td>
    <td>
      <button onclick="removeIsoRow(this)" style="background:transparent;border:1px solid rgba(255,107,107,0.3);
        color:var(--danger);padding:4px 10px;border-radius:6px;font-size:0.78rem;
        box-shadow:none;font-weight:600;">✕</button>
    </td>
  `;
    tbody.appendChild(tr);
    updateIsoTotal();
}

function removeIsoRow(btn) {
    const tr = btn.closest('tr');
    tr.remove();
    // Renumber remaining rows
    const tbody = $('isoInputTableBody');
    const durationMin = parseFloat($('durationMin').value) || 30;
    const numBins = document.querySelectorAll('#depthGrid .depthCell').length || 1;
    const binMin = durationMin / numBins;

    tbody.querySelectorAll('tr').forEach((row, i) => {
        const tStart = i * binMin;
        const tEnd = (i + 1) * binMin;
        const firstCell = row.querySelector('td');
        if (firstCell) {
            firstCell.innerHTML = `B${i + 1} <span style="font-size:0.72rem;color:#1a2433;margin-left:4px;">${tStart}–${tEnd} min</span>`;
        }
    });
    updateIsoTotal();
}

function updateIsoTotal() {
    let total = 0;
    document.querySelectorAll('#isoInputTableBody input[type=number]').forEach(inp => {
        const v = parseFloat(inp.value);
        if (isFinite(v)) total += v;
    });
    if ($('isoTotalEntered')) {
        $('isoTotalEntered').textContent = total > 0 ? total.toLocaleString() : '—';
    }
}

/* ================================================================
   INIT
================================================================ */
window.addEventListener('DOMContentLoaded', function () {
    $('state').value = '';
    $('durationMin').value = '';
});

/* ================================================================
   EXPORT TO EXCEL — full summary all steps + embedded chart images
   Uses SheetJS (xlsx library loaded in index.html)
   Charts captured via canvas.toDataURL() and embedded as PNG images
================================================================ */

/* Helper: capture a Chart.js canvas as a base64 PNG string (no prefix) */
function _canvasToPngBase64(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    try {
        // Draw onto a white-background offscreen canvas so dark bg renders correctly
        const off = document.createElement('canvas');
        off.width = canvas.width;
        off.height = canvas.height;
        const ctx = off.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(canvas, 0, 0);
        // Strip the data:image/png;base64, prefix — SheetJS wants raw base64
        return off.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    } catch (e) {
        console.warn('Could not capture canvas', canvasId, e);
        return null;
    }
}

/* Helper: add an image to a worksheet below its last data row */
function _addImageToSheet(wb, ws, sheetName, pngBase64, dataRowCount) {
    if (!pngBase64) return;
    try {
        const imgId = wb.addImage ? wb.addImage({
            base64: pngBase64,
            extension: 'png',
        }) : null;
        // addImage is only available on the workbook object via SheetJS Pro / full build
        // The xlsx.full.min.js CDN build supports it
        if (imgId == null) return; // not supported in this build
        // Place image starting 2 rows below last data row, col A
        const startRow = dataRowCount + 2;
        if (!ws['!images']) ws['!images'] = [];
        ws['!images'].push({
            name: sheetName + '.png',
            data: pngBase64,
            opts: { base64: true },
            type: 'base64',
            ext: 'png',
            // position: row/col are 0-indexed
            position: {
                type: 'twoCellAnchor',
                attrs: { editAs: 'oneCell' },
                from: { col: 0, colOff: 0, row: startRow, rowOff: 0 },
                to: { col: 8, colOff: 0, row: startRow + 25, rowOff: 0 }
            }
        });
    } catch (e) {
        console.warn('Image embed not supported:', e);
    }
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        alert('Excel library not loaded yet. Please wait a moment and try again.');
        return;
    }

    const wb = XLSX.utils.book_new();

    /* ── helpers ── */
    const val = (id) => {
        const el = document.getElementById(id);
        if (!el) return '—';
        return el.value !== undefined && el.value !== '' ? el.value : (el.textContent || '—');
    };
    const txt = (id) => {
        const el = document.getElementById(id);
        return el ? (el.textContent.trim() || '—') : '—';
    };

    /* ══════════════════════════════════════════════════════════════
       SHEET 1 — Project Summary (Steps 1–5 key values)
    ══════════════════════════════════════════════════════════════ */
    const summaryRows = [
        ['MSMA Time-Area Method Calculator — Summary Report'],
        ['Generated:', new Date().toLocaleString('en-MY')],
        [],
        ['STEP 1 — LOCATION'],
        ['State', txt('badgeText').replace('✓ ', '')],
        ['Station', (() => {
            const sel = document.getElementById('stationSelect');
            if (!sel) return '—';
            const opt = sel.options[sel.selectedIndex];
            return opt && opt.value ? opt.text : '—';
        })()],
        [],
        ['STEP 2 — STORM PARAMETERS'],
        ['ARI (years)', val('ariYears')],
        ['Duration (min)', val('durationMin')],
        ['IDF λ', val('idfK')],
        ['IDF κ', val('idfX')],
        ['IDF θ', val('idfA')],
        ['IDF η', val('idfN')],
        ['Rainfall Intensity i (mm/hr)', txt('designIntensity')],
        ['Total Design Rainfall P (mm)', txt('totalDepthBox')],
        [],
        ['STEP 3 — RAINFALL PATTERN'],
        ['Time Bin (min)', 'Fraction', 'Depth (mm)'],
    ];

    // Pattern rows
    const depthCells = document.querySelectorAll('#depthGrid .depthCell');
    const patternCells = document.querySelectorAll('.patternCell');
    depthCells.forEach((cell, i) => {
        const lbl = cell.parentElement ? cell.parentElement.querySelector('label').textContent : `Bin ${i + 1}`;
        const frac = patternCells[i] ? parseFloat(patternCells[i].value).toFixed(4) : '—';
        summaryRows.push([lbl, frac, parseFloat(cell.value).toFixed(3)]);
    });

    summaryRows.push([]);
    summaryRows.push(['STEP 4 — CATCHMENT & LOSSES']);
    summaryRows.push(['Pervious Area (%)', val('perviousArea')]);
    summaryRows.push(['Impervious Area (%)', val('imperviousArea')]);
    summaryRows.push(['Max Infiltration Rate f₀ (mm/hr)', val('f0Input')]);
    summaryRows.push(['Min Infiltration Rate fc (mm/hr)', val('fcInput')]);
    summaryRows.push(['Decay Constant k (1/hr)', val('kValue')]);
    summaryRows.push(['Pervious Initial Loss (mm)', '10.00 (fixed)']);
    summaryRows.push(['Impervious Initial Loss (mm)', '1.50 (fixed)']);
    summaryRows.push([]);
    summaryRows.push(['STEP 5 — HYDROGRAPH RESULTS']);
    summaryRows.push(['Intensity i (mm/hr)', txt('outI')]);
    summaryRows.push(['Total Depth P (mm)', txt('outDepth')]);
    summaryRows.push(['Total Excess (mm)', txt('outExcess')]);
    summaryRows.push(['Peak Discharge Qpeak (m³/s)', txt('peakQ')]);
    summaryRows.push(['Time to Peak (min)', txt('peakT')]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 22 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    /* ══════════════════════════════════════════════════════════════
       SHEET 2 — Hyetograph (Step 3) + chart image
    ══════════════════════════════════════════════════════════════ */
    const hyetoHeader = ['Time Bin (min)', 'Fraction', 'Depth (mm)'];
    const hyetoData = [
        ['Hyetograph — Rainfall Distribution (Step 3)'],
        [],
        hyetoHeader
    ];
    depthCells.forEach((cell, i) => {
        const lbl = cell.parentElement ? cell.parentElement.querySelector('label').textContent : `Bin ${i + 1}`;
        const frac = patternCells[i] ? parseFloat(patternCells[i].value).toFixed(4) : '—';
        hyetoData.push([lbl, frac, parseFloat(cell.value).toFixed(3)]);
    });

    const wsHyeto = XLSX.utils.aoa_to_sheet(hyetoData);
    wsHyeto['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsHyeto, 'Hyetograph');

    /* ══════════════════════════════════════════════════════════════
       SHEET 3 — Loss Estimation Table (Step 4) + decay chart image
    ══════════════════════════════════════════════════════════════ */
    const lossHeader = [
        'Time Bin (min)',
        'Perv. Initial Loss (mm)', 'Perv. Cont. Rate (mm/hr)', 'Perv. Cont. Loss (mm)',
        'Imp. Initial Loss (mm)', 'Imp. Cont. Rate (mm/hr)', 'Imp. Cont. Loss (mm)',
        'Total Loss (mm)'
    ];
    const lossData = [lossHeader];
    document.querySelectorAll('#lossEstTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 8) {
            lossData.push(Array.from(cells).map(c => {
                const v = parseFloat(c.textContent.trim());
                return isFinite(v) ? v : c.textContent.trim();
            }));
        }
    });
    lossData.push(['', '', '', '', '', '', 'Total:', parseFloat(txt('lossEstTotal')) || txt('lossEstTotal')]);

    const wsLoss = XLSX.utils.aoa_to_sheet(lossData);
    wsLoss['!cols'] = Array(8).fill({ wch: 20 });
    XLSX.utils.book_append_sheet(wb, wsLoss, 'Loss Estimation');

    /* ══════════════════════════════════════════════════════════════
       SHEET 4 — Rainfall Excess / Runoff (Step 4)
    ══════════════════════════════════════════════════════════════ */
    const runoffHeader = ['Time Bin (min)', 'Rainfall (mm)', 'Total Loss (mm)', 'Excess (mm)', 'Excess (mm/s)'];
    const runoffData = [runoffHeader];
    document.querySelectorAll('#runoffTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
            runoffData.push(Array.from(cells).map(c => {
                const v = parseFloat(c.textContent.trim());
                return isFinite(v) ? v : c.textContent.trim();
            }));
        }
    });
    runoffData.push([
        'Total',
        parseFloat(txt('runoffTotalRain')) || txt('runoffTotalRain'),
        parseFloat(txt('runoffTotalLoss')) || txt('runoffTotalLoss'),
        parseFloat(txt('runoffTotalExcess')) || txt('runoffTotalExcess'),
        '—'
    ]);

    const wsRunoff = XLSX.utils.aoa_to_sheet(runoffData);
    wsRunoff['!cols'] = Array(5).fill({ wch: 18 });
    XLSX.utils.book_append_sheet(wb, wsRunoff, 'Rainfall Excess');

    /* ══════════════════════════════════════════════════════════════
       SHEET 5 — Isochrone Zones (Step 5)
    ══════════════════════════════════════════════════════════════ */
    const isoHeader = ['Zone (Bin)', 'Area (m²)'];
    const isoData = [isoHeader];
    document.querySelectorAll('#isoInputTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        const inp = tr.querySelector('input[type=number]');
        if (cells.length >= 2 && inp) {
            isoData.push([cells[0].textContent.trim(), parseFloat(inp.value) || 0]);
        }
    });
    isoData.push(['Total', (() => {
        let t = 0;
        document.querySelectorAll('#isoInputTableBody input[type=number]').forEach(i => {
            const v = parseFloat(i.value); if (isFinite(v)) t += v;
        });
        return t;
    })()]);

    const wsIso = XLSX.utils.aoa_to_sheet(isoData);
    wsIso['!cols'] = [{ wch: 24 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsIso, 'Isochrone Zones');

    /* ══════════════════════════════════════════════════════════════
       SHEET 6 — Hydrograph Q(t) (Step 5) + chart image
    ══════════════════════════════════════════════════════════════ */
    if (lastHydrographData) {
        const { Q, timeLabels, peakQ } = lastHydrographData;
        const hydHeader = ['Time (min)', 'Q (m³/s)', 'Peak?'];
        const hydData = [hydHeader];
        Q.forEach((q, i) => {
            hydData.push([timeLabels[i], parseFloat(q.toFixed(6)), q === peakQ ? 'PEAK' : '']);
        });

        const wsHyd = XLSX.utils.aoa_to_sheet(hydData);
        wsHyd['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsHyd, 'Hydrograph Q(t)');
    }

    /* ══════════════════════════════════════════════════════════════
       SHEET 7 — Convolution Matrix (Step 5)
    ══════════════════════════════════════════════════════════════ */
    if (lastHydrographData) {
        const { Q, timeLabels, excessMms, isoAreas, binMin, numBins, numIso, totalLen, peakQ } = lastHydrographData;

        const convHead1 = ['Time (min)', 'Iso Area (m²)', 'Excess (mm/s)'];
        for (let b = 0; b < numBins; b++) convHead1.push(`${b * binMin}–${(b + 1) * binMin} min`);
        convHead1.push('Q (m³/s)');

        const convHead2 = ['', '', ''];
        for (let b = 0; b < numBins; b++) convHead2.push(parseFloat(excessMms[b].toFixed(6)));
        convHead2.push('');

        const convHead3 = ['', '', ''];
        for (let b = 0; b < numBins; b++) convHead3.push(b < numIso ? isoAreas[b] : '');
        convHead3.push('');

        const convData = [convHead1, convHead2, convHead3];

        for (let t = 0; t < totalLen; t++) {
            const row = [
                timeLabels[t],
                t < numIso ? isoAreas[t] : '',
                t < numBins ? parseFloat(excessMms[t].toFixed(6)) : ''
            ];
            for (let b = 0; b < numBins; b++) {
                const aIdx = t - b;
                if (aIdx >= 0 && aIdx < numIso && isFinite(excessMms[b]) && excessMms[b] > 0) {
                    row.push(parseFloat((excessMms[b] * isoAreas[aIdx] / 1000).toFixed(7)));
                } else {
                    row.push('');
                }
            }
            row.push(parseFloat(Q[t].toFixed(6)));
            convData.push(row);
        }

        const wsConv = XLSX.utils.aoa_to_sheet(convData);
        const colWidths = [{ wch: 12 }, { wch: 14 }, { wch: 14 }];
        for (let b = 0; b < numBins; b++) colWidths.push({ wch: 14 });
        colWidths.push({ wch: 12 });
        wsConv['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, wsConv, 'Convolution Matrix');
    }

    /* ── Save file ── */
    const stateName = (() => {
        const el = document.getElementById('badgeText');
        return el ? el.textContent.replace('✓ ', '').trim().replace(/\s+/g, '_') : 'MSMA';
    })();
    const ari = document.getElementById('ariYears') ? document.getElementById('ariYears').value : '';
    const dur = document.getElementById('durationMin') ? document.getElementById('durationMin').value : '';
    const filename = `MSMA_${stateName}_ARI${ari}_${dur}min.xlsx`;

    XLSX.writeFile(wb, filename);
}

/* ── ws_add_image: no-op stub — image embedding not supported in
   the community (free) xlsx@0.18.5 build; charts are delivered
   via exportHTMLReport() instead ── */
function ws_add_image(ws, wb, imgIdx, fromRow, fromCol, toRow, toCol) { /* noop */ }

/* ================================================================
   EXPORT HTML REPORT — full summary + embedded chart images
   Opens in a new browser tab; user can Save As → PDF or print
================================================================ */
function exportHTMLReport() {
    /* ── Capture charts as data-URIs ── */
    function chartDataUri(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        try {
            const off = document.createElement('canvas');
            off.width = canvas.width; off.height = canvas.height;
            const ctx = off.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, off.width, off.height);
            ctx.drawImage(canvas, 0, 0);
            return off.toDataURL('image/png');
        } catch (e) { return null; }
    }

    const imgHyetograph = chartDataUri('hyetographCanvas');
    const imgLossDecay = chartDataUri('lossEstChartCanvas');
    const imgHydrograph = chartDataUri('hydrographCanvas');

    /* ── Helpers ── */
    const val = id => { const e = document.getElementById(id); if (!e) return '—'; return e.value !== undefined && e.value !== '' ? e.value : (e.textContent.trim() || '—'); };
    const txt = id => { const e = document.getElementById(id); return e ? (e.textContent.trim() || '—') : '—'; };

    /* ── Build HTML string ── */
    const now = new Date().toLocaleString('en-MY');
    const state = txt('badgeText').replace('✓ ', '').trim();
    const ari = val('ariYears');
    const dur = val('durationMin');

    /* Collect pattern rows */
    const depthCells = document.querySelectorAll('#depthGrid .depthCell');
    const patternCells = document.querySelectorAll('.patternCell');
    let patternRows = '';
    depthCells.forEach((cell, i) => {
        const lbl = cell.parentElement?.querySelector('label')?.textContent || `Bin ${i + 1}`;
        const frac = patternCells[i] ? parseFloat(patternCells[i].value).toFixed(4) : '—';
        patternRows += `<tr><td>${lbl}</td><td>${frac}</td><td>${parseFloat(cell.value).toFixed(3)}</td></tr>`;
    });

    /* Loss estimation rows */
    let lossRows = '';
    document.querySelectorAll('#lossEstTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 8) lossRows += '<tr>' + Array.from(cells).map(c => `<td>${c.textContent.trim()}</td>`).join('') + '</tr>';
    });

    /* Rainfall excess rows */
    let runoffRows = '';
    document.querySelectorAll('#runoffTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) runoffRows += '<tr>' + Array.from(cells).map(c => `<td>${c.textContent.trim()}</td>`).join('') + '</tr>';
    });

    /* Isochrone rows */
    let isoRows = '';
    document.querySelectorAll('#isoInputTableBody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        const inp = tr.querySelector('input[type=number]');
        if (cells.length >= 2 && inp) isoRows += `<tr><td>${cells[0].textContent.trim()}</td><td>${inp.value || 0}</td></tr>`;
    });

    /* Hydrograph rows */
    let hydRows = '';
    if (lastHydrographData) {
        const { Q, timeLabels, peakQ } = lastHydrographData;
        Q.forEach((q, i) => {
            const isPeak = q === peakQ ? ' style="font-weight:700;color:#0a3;" class="peak"' : '';
            hydRows += `<tr${isPeak}><td>${timeLabels[i]}</td><td>${q.toFixed(6)}</td><td>${q === peakQ ? '▲ PEAK' : ''}</td></tr>`;
        });
    }

    const imgTag = (uri, alt) => uri
        ? `<img src="${uri}" alt="${alt}" style="max-width:100%;border:1px solid #ddd;border-radius:4px;margin-top:12px;">`
        : `<p style="color:#888;font-style:italic;">[Chart not yet rendered — run all steps first]</p>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MSMA Report — ${state} ARI${ari} ${dur}min</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a2535;background:#f4f7fb;padding:24px}
  h1{font-size:20px;color:#083060;margin-bottom:4px}
  .meta{color:#607090;margin-bottom:24px;font-size:12px}
  h2{font-size:14px;font-weight:700;color:#0a3d6b;border-bottom:2px solid #c8dff8;padding-bottom:4px;margin:28px 0 10px}
  h3{font-size:12px;font-weight:600;color:#2a5080;margin:16px 0 6px}
  table{border-collapse:collapse;width:100%;margin-bottom:12px;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  th{background:#0d4f8c;color:#fff;padding:7px 10px;text-align:left;font-size:11px;font-weight:600;white-space:nowrap}
  td{padding:5px 10px;border-bottom:1px solid #e8eff8;font-size:12px}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#f0f6ff}
  .kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-bottom:16px}
  .kv-item{background:#fff;border:1px solid #d0dff0;border-radius:4px;padding:8px 12px}
  .kv-label{font-size:10px;color:#607090;text-transform:uppercase;letter-spacing:.5px}
  .kv-value{font-size:14px;font-weight:600;color:#083060;margin-top:2px}
  .peak td{background:#e6ffee !important;color:#0a3a0a}
  @media print{body{background:#fff;padding:0} h2{page-break-before:always}}
</style>
</head>
<body>
<h1>MSMA Time-Area Method — Calculation Summary</h1>
<div class="meta">Generated: ${now} &nbsp;|&nbsp; State: <strong>${state}</strong> &nbsp;|&nbsp; ARI: <strong>${ari} years</strong> &nbsp;|&nbsp; Duration: <strong>${dur} min</strong></div>

<h2>Step 1 &amp; 2 — Location &amp; Storm Parameters</h2>
<div class="kv">
  <div class="kv-item"><div class="kv-label">State</div><div class="kv-value">${state}</div></div>
  <div class="kv-item"><div class="kv-label">Station</div><div class="kv-value">${(() => { const sel = document.getElementById('stationSelect'); const opt = sel?.options[sel.selectedIndex]; return opt?.value ? opt.text : '—'; })()}</div></div>
  <div class="kv-item"><div class="kv-label">ARI (years)</div><div class="kv-value">${ari}</div></div>
  <div class="kv-item"><div class="kv-label">Duration (min)</div><div class="kv-value">${dur}</div></div>
  <div class="kv-item"><div class="kv-label">Intensity i (mm/hr)</div><div class="kv-value">${txt('designIntensity')}</div></div>
  <div class="kv-item"><div class="kv-label">Total Depth P (mm)</div><div class="kv-value">${txt('totalDepthBox')}</div></div>
  <div class="kv-item"><div class="kv-label">IDF λ / κ / θ / η</div><div class="kv-value">${val('idfK')} / ${val('idfX')} / ${val('idfA')} / ${val('idfN')}</div></div>
</div>

<h2>Step 3 — Rainfall Pattern (Hyetograph)</h2>
<table><thead><tr><th>Time Bin (min)</th><th>Fraction</th><th>Depth (mm)</th></tr></thead>
<tbody>${patternRows}</tbody></table>
${imgTag(imgHyetograph, 'Hyetograph')}

<h2>Step 4 — Loss Estimation (Horton Infiltration)</h2>
<div class="kv">
  <div class="kv-item"><div class="kv-label">Pervious Area (%)</div><div class="kv-value">${val('perviousArea')}</div></div>
  <div class="kv-item"><div class="kv-label">Impervious Area (%)</div><div class="kv-value">${val('imperviousArea')}</div></div>
  <div class="kv-item"><div class="kv-label">f₀ (mm/hr)</div><div class="kv-value">${val('f0Input')}</div></div>
  <div class="kv-item"><div class="kv-label">fc (mm/hr)</div><div class="kv-value">${val('fcInput')}</div></div>
  <div class="kv-item"><div class="kv-label">k (1/hr)</div><div class="kv-value">${val('kValue')}</div></div>
</div>
<h3>Loss by Time Bin</h3>
<table><thead><tr>
  <th>Time Bin</th><th>Perv. Init (mm)</th><th>Perv. Cont Rate (mm/hr)</th><th>Perv. Cont Loss (mm)</th>
  <th>Imp. Init (mm)</th><th>Imp. Cont Rate (mm/hr)</th><th>Imp. Cont Loss (mm)</th><th>Total Loss (mm)</th>
</tr></thead><tbody>${lossRows}</tbody></table>
${imgTag(imgLossDecay, 'Horton Decay Curve')}

<h2>Step 4 — Rainfall Excess</h2>
<table><thead><tr>
  <th>Time Bin (min)</th><th>Rainfall (mm)</th><th>Total Loss (mm)</th><th>Excess (mm)</th><th>Excess (mm/s)</th>
</tr></thead><tbody>${runoffRows}</tbody></table>

<h2>Step 5 — Hydrograph Results</h2>
<div class="kv">
  <div class="kv-item"><div class="kv-label">Peak Discharge Q<sub>peak</sub></div><div class="kv-value">${txt('peakQ')} m³/s</div></div>
  <div class="kv-item"><div class="kv-label">Time to Peak</div><div class="kv-value">${txt('peakT')} min</div></div>
  <div class="kv-item"><div class="kv-label">Total Excess (mm)</div><div class="kv-value">${txt('outExcess')}</div></div>
</div>
<h3>Isochrone Zone Areas</h3>
<table><thead><tr><th>Zone (Bin)</th><th>Area (m²)</th></tr></thead><tbody>${isoRows}</tbody></table>
<h3>Hydrograph Q(t)</h3>
<table><thead><tr><th>Time (min)</th><th>Q (m³/s)</th><th></th></tr></thead><tbody>${hydRows}</tbody></table>
${imgTag(imgHydrograph, 'Hydrograph')}

</body></html>`;

    /* Open in new tab */
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) alert('Pop-up blocked — please allow pop-ups for this page and try again.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}