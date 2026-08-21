// ============================================================================
// Chart helpers
// ============================================================================

function mk(id, type, labels, ds, opts) {
  const x = document.getElementById(id);
  if (!x) return;
  // Destroy any orphaned Chart.js instance on this canvas (e.g. one that was
  // created by a concurrent RAF that fired after charts[] was already cleared).
  // Prevents the "Canvas is already in use" error that silently aborts rendering.
  const orphan = Chart.getChart ? Chart.getChart(x) : null;
  if (orphan) {
    orphan.destroy();
    const oi = charts.indexOf(orphan);
    if (oi >= 0) charts.splice(oi, 1);
  }
  const c = new Chart(x, {
    type,
    data: { labels, datasets: ds },
    options: Object.assign(
      {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: ds.length > 1 } },
      },
      opts || {},
    ),
  });
  charts.push(c);
}
function mkD(id, l, d, c) {
  mk(
    id,
    "doughnut",
    l,
    [
      {
        data: d,
        backgroundColor: c,
        borderColor: _cssVar("--card", "#111827"),
        borderWidth: 2,
      },
    ],
    {
      cutout: "55%",
      plugins: { legend: { display: true, position: "bottom" } },
    },
  );
}
function mkB(id, l, ds, s) {
  mk(id, "bar", l, ds, {
    scales: {
      x: { stacked: !!s, grid: { display: false } },
      y: { stacked: !!s, beginAtZero: true, ticks: { precision: 0 } },
    },
  });
}
// Grade distribution: doughnut when no comparison; grouped bar (A vs B) when comparison active.
function _mkCmpGrade(id, d, dB) {
  const gd = gradeDistObj(d);
  if (!dB) {
    mkD(
      id,
      GO,
      GO.map((g) => gd[g]),
      GO.map((g) => GC[g]),
    );
    return;
  }
  const gdB = gradeDistObj(dB);
  mkB(id, GO, [
    {
      label: "Snapshot A",
      data: GO.map((g) => gd[g]),
      backgroundColor: GO.map((g) => GC[g]),
      borderRadius: 4,
    },
    {
      label: "Snapshot B",
      data: GO.map((g) => gdB[g]),
      backgroundColor: GO.map((g) => GC[g] + "70"),
      borderRadius: 4,
    },
  ]);
}
// Avg-by-group bar, optionally overlaid with snapshot B (dimmed bars).
function _mkCmpBar(id, keys, dataA, dataB, colorA) {
  const ds = [
    {
      label: "Snapshot A",
      data: keys.map((k) => dataA[k] || 0),
      backgroundColor: colorA,
      borderRadius: 4,
    },
  ];
  if (dataB)
    ds.push({
      label: "Snapshot B",
      data: keys.map((k) => dataB[k] || 0),
      backgroundColor: colorA + "70",
      borderRadius: 4,
    });
  mkB(id, keys, ds);
}
function mkH(id, l, d, c) {
  mk(
    id,
    "bar",
    l,
    [{ data: d, backgroundColor: c, borderRadius: 4, barThickness: 20 }],
    {
      indexAxis: "y",
      scales: {
        x: { beginAtZero: true, grid: { color: _cssVar("--bdr", "#1e293b") } },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  );
}

function _mkLine(id, labels, datasets, opts) {
  opts = opts || {};
  const el = document.getElementById(id);
  if (!el) return;
  const ctx = el.getContext("2d");
  const textColor = _cssVar("--t2", "#94a3b8");
  const legendColor = _cssVar("--t1", "#cbd5e1");
  const gridColor = _cssVar("--bdr", "#1e293b");
  charts.push(
    new Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { color: legendColor } },
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: {
            min: 0,
            max: opts.yMax || undefined,
            ticks: { color: textColor },
            grid: { color: gridColor },
            title: opts.yLabel
              ? { display: true, text: opts.yLabel, color: legendColor }
              : undefined,
          },
        },
      },
    }),
  );
}

// Render an inline pill that summarises the delta between two metric values
// (signed numeric difference). Returns '' if no comparison is active or the
// values cannot be compared.
function renderDeltaPill(curr, prev, opts) {
  if (
    curr === null ||
    prev === null ||
    curr === undefined ||
    prev === undefined
  )
    return "";
  if (isNaN(curr) || isNaN(prev)) return "";
  opts = opts || {};
  const decimals = opts.decimals !== undefined ? opts.decimals : 1;
  const suffix = opts.suffix || "";
  const inverse = opts.inverse === true; // true when "lower is better"
  const d =
    Math.round((curr - prev) * Math.pow(10, decimals)) /
    Math.pow(10, decimals);
  if (d === 0)
    return `<span class="delta-pill delta-eq">±0${suffix}</span>`;
  const isUp = d > 0;
  const cls = isUp !== inverse ? "delta-up" : "delta-dn";
  const arrow = isUp ? "▲" : "▼";
  const sign = isUp ? "+" : "";
  return `<span class="delta-pill ${cls}">${arrow} ${sign}${d.toFixed(decimals)}${suffix}</span>`;
}
