// ------- Defaults from your Excel (Question TAM) -------
const DEFAULT_PATTERN = [
  // 6 × 5-min bins; must sum ≈ 1.000
  0.097, 0.161, 0.400, 0.164, 0.106, 0.072
];

const BIN_MINUTES = 5; // 5-min step, 6 bins => 30 min total

// ------- Helpers -------
const $ = (id) => document.getElementById(id);
const fmt = (x, d=3) => (isFinite(x) ? Number(x).toFixed(d) : "—");
const sum = (arr) => arr.reduce((a,b)=>a+(+b||0),0);

// Build the temporal pattern editor
(function mountPattern(){
  const grid = $("patternGrid");
  DEFAULT_PATTERN.forEach((v, i) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <label>${i*BIN_MINUTES}-${(i+1)*BIN_MINUTES} min</label>
      <input class="patternCell" type="number" step="0.001" value="${v}" />
    `;
    grid.appendChild(wrap);
  });
})();

// Calculator core (mirrors the Excel logic closely)
function calculate(){
  // Inputs
  const loc = $("location").value.trim();
  const ARI = parseFloat($("ariYears").value);
  const durationMin = parseFloat($("durationMin").value);

  const K = parseFloat($("idfK").value);
  const x = parseFloat($("idfX").value);
  const A = parseFloat($("idfA").value);
  const n = parseFloat($("idfN").value);

  const pervPct = parseFloat($("perviousPct").value);
  const impervPct = parseFloat($("imperviousPct").value);

  const pervInit = parseFloat($("pervInitLoss").value);
  const pervCont = parseFloat($("pervContLoss").value);     // mm/hr
  const impervInit = parseFloat($("impervInitLoss").value);
  const impervCont = parseFloat($("impervContLoss").value); // mm/hr

  const pattern = Array.from(document.querySelectorAll(".patternCell")).map(i => parseFloat(i.value));
  const patternSum = sum(pattern);

  // Simple checks
  let warn = [];
  if (Math.abs(patternSum - 1) > 0.02) {
    warn.push(`Temporal pattern sums to ${patternSum.toFixed(3)} (not ~1.000).`);
  }
  if (Math.abs((pervPct + impervPct) - 100) > 0.5) {
    warn.push(`Areas sum to ${(pervPct+impervPct).toFixed(1)}% (not 100%).`);
  }

  // IDF intensity (mm/hr): i = K * ARI^x / (A + t)^n, with t in hours
  const t_hr = durationMin / 60;
  const i_mmhr = K * Math.pow(ARI, x) / Math.pow(A + t_hr, n);

  // Total design depth (mm) over the duration
  const totalDepth = i_mmhr * (durationMin/60);

  // Depth per bin from pattern
  const binDepths = pattern.map(frac => frac * totalDepth);

  // Loss per bin (area-weighted, initial + continuous):
  // We track remaining "initial loss" buckets for each surface.
  let pervInitRem = pervInit;
  let impervInitRem = impervInit;

  const dt_hr = BIN_MINUTES / 60;

  let rows = [];
  let sumLoss = 0, sumExcess = 0;

  for (let b = 0; b < binDepths.length; b++){
    const depth = binDepths[b];

    // pervious: first satisfy remaining initial loss, then continuous loss
    const pervContThis = pervCont * dt_hr; // mm in this bin
    const pervLossThis = Math.min(pervInitRem, depth) + Math.max(0, Math.min(depth - Math.min(pervInitRem, depth), pervContThis));
    pervInitRem = Math.max(0, pervInitRem - Math.min(pervInitRem, depth));

    // impervious
    const impervContThis = impervCont * dt_hr;
    const impervLossThis = Math.min(impervInitRem, depth) + Math.max(0, Math.min(depth - Math.min(impervInitRem, depth), impervContThis));
    impervInitRem = Math.max(0, impervInitRem - Math.min(impervInitRem, depth));

    // area-weighted loss
    const weightedLoss = (pervPct * pervLossThis + impervPct * impervLossThis) / 100;

    // cap loss to available depth in this bin
    const loss = Math.min(weightedLoss, depth);
    const excess = Math.max(0, depth - loss);

    const excess_mmps = excess / (BIN_MINUTES * 60); // mm/s
    sumLoss += loss;
    sumExcess += excess;

    rows.push({
      label: `${b*BIN_MINUTES}-${(b+1)*BIN_MINUTES}`,
      frac: pattern[b],
      depth,
      loss,
      excess,
      mmps: excess_mmps
    });
  }

  // Render metrics
  $("outI").textContent = fmt(i_mmhr, 3);
  $("outDepth").textContent = fmt(totalDepth, 3);

  // Render table
  const tbody = $("resultTable").querySelector("tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.label}</td>
      <td>${fmt(r.frac,3)}</td>
      <td>${fmt(r.depth,3)}</td>
      <td>${fmt(r.loss,3)}</td>
      <td>${fmt(r.excess,3)}</td>
      <td>${fmt(r.mmps,4)}</td>
    `;
    tbody.appendChild(tr);
  });

  $("sumPattern").textContent = fmt(patternSum, 3);
  $("sumDepth").textContent = fmt(sum(binDepths), 3);
  $("sumLoss").textContent = fmt(sumLoss, 3);
  $("sumExcess").textContent = fmt(sumExcess, 3);

  $("msg").textContent = warn.length ? `⚠ ${warn.join(" ")}` : "✓ Done.";
  $("msg").className = warn.length ? "bad" : "good";
}

// Wire up
$("calcBtn").addEventListener("click", calculate);

// First render
calculate();

// ---------- Tutorial Popup ----------
const tutorialSteps = [
  "👋 Welcome! This tool replicates the MSMA Time–Area Method calculator from Excel.",
  "Step 1: Enter design rainfall inputs (location, ARI, duration, IDF constants).",
  "Step 2: Adjust pervious and impervious areas, plus losses (initial & continuous).",
  "Step 3: Edit the rainfall temporal pattern fractions (they should sum ≈ 1.0).",
  "Finally, click **Calculate** to see rainfall depth, losses, and excess runoff!"
];

let tutorialIndex = 0;
const tutorialOverlay = document.getElementById("tutorial");
const tutorialStepBox = document.getElementById("tutorial-step");
const nextBtn = document.getElementById("tutorial-next");
const closeBtn = document.getElementById("tutorial-close");

function showTutorial() {
  tutorialOverlay.classList.remove("hidden");
  tutorialStepBox.innerHTML = `<p>${tutorialSteps[tutorialIndex]}</p>`;
  nextBtn.style.display = (tutorialIndex < tutorialSteps.length - 1) ? "inline-block" : "none";
}

function nextTutorial() {
  tutorialIndex++;
  if (tutorialIndex < tutorialSteps.length) {
    tutorialStepBox.innerHTML = `<p>${tutorialSteps[tutorialIndex]}</p>`;
    if (tutorialIndex === tutorialSteps.length - 1) {
      nextBtn.style.display = "none";
    }
  }
}

function closeTutorial() {
  tutorialOverlay.classList.add("hidden");
}

// Event listeners
nextBtn.addEventListener("click", nextTutorial);
closeBtn.addEventListener("click", closeTutorial);

// Always show on page load (every refresh)
window.addEventListener("load", () => {
  tutorialIndex = 0;
  showTutorial();
});


