// ============================================================================
// Report Generator — A4 PDF via jsPDF
// ============================================================================
const PDF_W = 595.28; // A4 width in pt
const PDF_H = 841.89; // A4 height in pt
const PDF_M = 40; // margin in pt
const PDF_CW = PDF_W - 2 * PDF_M; // content width

function _rptChartImg(type, labels, datasets, opts, w, h) {
  const dpr = 2;
  const logW = w || 700,
    logH = h || 400;
  const canvas = document.createElement("canvas");
  canvas.width = logW * dpr;
  canvas.height = logH * dpr;
  canvas.style.width = logW + "px";
  canvas.style.height = logH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, logW, logH);

  // Temporarily override Chart.js global defaults to light theme
  const _savedColor = Chart.defaults.color;
  const _savedBorder = Chart.defaults.borderColor;
  const _savedFontSize = Chart.defaults.font.size;
  const _savedBg = Chart.defaults.backgroundColor;
  Chart.defaults.color = "#334155";
  Chart.defaults.borderColor = "#e2e8f0";
  Chart.defaults.backgroundColor = "rgba(0,0,0,0)";
  Chart.defaults.font.size = 14;

  // Font sizes must be very large because the canvas will be shrunk into ~250pt PDF width
  const TICK_SIZE = 28;
  const LEGEND_SIZE = 28;

  // Build clean options with guaranteed large fonts
  const merged = {
    responsive: false,
    animation: false,
    maintainAspectRatio: false,
    layout: { padding: { top: 16, bottom: 16, left: 10, right: 10 } },
    plugins: {
      legend: {
        display: datasets.length > 1,
        labels: {
          color: "#1e293b",
          font: { size: LEGEND_SIZE, weight: "600" },
          padding: 20,
          boxWidth: 22,
        },
      },
    },
  };

  // Merge opts but protect font sizes
  if (opts) {
    if (opts.cutout) merged.cutout = opts.cutout;
    if (opts.indexAxis) merged.indexAxis = opts.indexAxis;
    if (opts.layout)
      merged.layout = Object.assign(merged.layout, opts.layout);
    // Merge plugins.legend carefully
    if (opts.plugins && opts.plugins.legend) {
      if (opts.plugins.legend.display !== undefined)
        merged.plugins.legend.display = opts.plugins.legend.display;
      if (opts.plugins.legend.position)
        merged.plugins.legend.position = opts.plugins.legend.position;
      if (opts.plugins.legend.labels) {
        merged.plugins.legend.labels = Object.assign(
          {},
          merged.plugins.legend.labels,
          opts.plugins.legend.labels,
        );
        // Force minimum font size
        merged.plugins.legend.labels.font = {
          size: Math.max(
            LEGEND_SIZE,
            (opts.plugins.legend.labels.font || {}).size || 0,
          ),
          weight: "600",
        };
      }
    }
    // Merge scales
    if (opts.scales) {
      merged.scales = {};
      Object.keys(opts.scales).forEach((ax) => {
        merged.scales[ax] = Object.assign({}, opts.scales[ax]);
        // Force tick font
        if (!merged.scales[ax].ticks) merged.scales[ax].ticks = {};
        merged.scales[ax].ticks.font = { size: TICK_SIZE, weight: "500" };
        merged.scales[ax].ticks.color = "#334155";
        // Keep other tick props
        if (opts.scales[ax].ticks) {
          if (opts.scales[ax].ticks.precision !== undefined)
            merged.scales[ax].ticks.precision =
              opts.scales[ax].ticks.precision;
        }
      });
    }
  }

  // For bar/line, ensure both axes exist with big ticks
  if (type === "bar" || type === "line") {
    if (!merged.scales) merged.scales = {};
    ["x", "y"].forEach((ax) => {
      if (!merged.scales[ax]) merged.scales[ax] = {};
      if (!merged.scales[ax].ticks) merged.scales[ax].ticks = {};
      merged.scales[ax].ticks.font = { size: TICK_SIZE, weight: "500" };
      merged.scales[ax].ticks.color =
        merged.scales[ax].ticks.color || "#334155";
      if (!merged.scales[ax].grid)
        merged.scales[ax].grid = { color: "#e5e7eb" };
    });
  }

  const cfg = {
    type,
    data: { labels, datasets },
    options: merged,
    plugins: [
      {
        id: "rptWhiteBg",
        beforeDraw: (chart) => {
          const c = chart.ctx;
          c.save();
          c.globalCompositeOperation = "destination-over";
          c.fillStyle = "#ffffff";
          c.fillRect(0, 0, chart.width, chart.height);
          c.restore();
        },
      },
    ],
  };
  const c = new Chart(ctx, cfg);
  // White bg is guaranteed by plugin, so JPEG compression is safe
  const img = canvas.toDataURL("image/jpeg", 0.85);
  c.destroy();

  // Restore global Chart.js defaults (dark dashboard theme)
  Chart.defaults.color = _savedColor;
  Chart.defaults.borderColor = _savedBorder;
  Chart.defaults.backgroundColor = _savedBg;
  Chart.defaults.font.size = _savedFontSize;

  return img;
}

function _rptDoughnutImg(labels, data, colors, w, h) {
  return _rptChartImg(
    "doughnut",
    labels,
    [
      {
        data,
        backgroundColor: colors,
        borderColor: "#fff",
        borderWidth: 2,
      },
    ],
    {
      cutout: "55%",
      plugins: { legend: { display: true, position: "bottom" } },
    },
    w || 700,
    h || 440,
  );
}
function _rptBarImg(labels, datasets, stacked, w, h) {
  return _rptChartImg(
    "bar",
    labels,
    datasets,
    {
      scales: {
        x: { stacked: !!stacked, grid: { display: false } },
        y: {
          stacked: !!stacked,
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
    w || 700,
    h || 440,
  );
}
function _rptHBarImg(labels, data, colors, w, h) {
  return _rptChartImg(
    "bar",
    labels,
    [
      {
        data,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 30,
      },
    ],
    {
      indexAxis: "y",
      layout: { padding: { left: 16, right: 28, top: 12, bottom: 12 } },
      scales: {
        x: { beginAtZero: true },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
    w || 700,
    h || Math.max(440, labels.length * 44),
  );
}

// ── PDF drawing primitives ──
function _pdfSetProgress(pct, label, detail) {
  document.getElementById("rpt-prog-bar").style.width = pct + "%";
  if (label)
    document.getElementById("rpt-prog-label").textContent = label;
  if (detail !== undefined)
    document.getElementById("rpt-prog-detail").textContent = detail;
}

function _pdfEnsureSpace(doc, y, need) {
  if (y + need > PDF_H - PDF_M) {
    doc.addPage();
    return PDF_M;
  }
  return y;
}

function _pdfSectionTitle(doc, y, num, title) {
  y = _pdfEnsureSpace(doc, y, 40);
  if (y > PDF_M + 10) y += 12;
  doc.setFillColor(14, 165, 233);
  doc.circle(PDF_M + 8, y + 5, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(String(num), PDF_M + 8, y + 8.5, { align: "center" });
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text(title, PDF_M + 22, y + 9);
  y += 18;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(PDF_M, y, PDF_W - PDF_M, y);
  y += 10;
  return y;
}

function _pdfStatRow(doc, y, stats) {
  y = _pdfEnsureSpace(doc, y, 52);
  const n = stats.length;
  const gap = 8;
  const boxW = (PDF_CW - (n - 1) * gap) / n;
  stats.forEach((s, i) => {
    const x = PDF_M + i * (boxW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, boxW, 44, 4, 4, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(s.label.toUpperCase(), x + boxW / 2, y + 12, {
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(String(s.value), x + boxW / 2, y + 29, { align: "center" });
    if (s.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(s.sub, x + boxW / 2, y + 38, { align: "center" });
    }
  });
  return y + 52;
}

function _pdfChartPair(doc, y, img1, cap1, img2, cap2) {
  const cw = (PDF_CW - 10) / 2; // ~252pt
  const ch = Math.round(cw / 1.59); // match canvas aspect ratio 700:440
  y = _pdfEnsureSpace(doc, y, ch + 25);
  if (img1) {
    doc.addImage(img1, "JPEG", PDF_M, y, cw, ch);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(cap1, PDF_M + cw / 2, y + ch + 10, { align: "center" });
  }
  if (img2) {
    doc.addImage(img2, "JPEG", PDF_M + cw + 10, y, cw, ch);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(cap2, PDF_M + cw + 10 + cw / 2, y + ch + 10, {
      align: "center",
    });
  }
  return y + ch + 22;
}

function _pdfChartFull(doc, y, img, cap, aspectRatio) {
  const ch = Math.round(PDF_CW / (aspectRatio || 1.59));
  y = _pdfEnsureSpace(doc, y, ch + 25);
  doc.addImage(img, "JPEG", PDF_M, y, PDF_CW, ch);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(cap, PDF_M + PDF_CW / 2, y + ch + 10, { align: "center" });
  return y + ch + 22;
}

function _pdfGradeTable(doc, y, gd, total) {
  y = _pdfEnsureSpace(doc, y, 45);
  const cols = GO.length + 2;
  const colW = PDF_CW / cols;
  const hdrY = y;
  doc.setFillColor(30, 58, 95);
  doc.rect(PDF_M, hdrY, PDF_CW, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Grade", PDF_M + 4, hdrY + 9);
  GO.forEach((g, i) =>
    doc.text(g, PDF_M + (i + 1) * colW + colW / 2, hdrY + 9, {
      align: "center",
    }),
  );
  doc.text("Total", PDF_M + (cols - 1) * colW + colW / 2, hdrY + 9, {
    align: "center",
  });
  let ry = hdrY + 14;
  doc.setFillColor(248, 250, 252);
  doc.rect(PDF_M, ry, PDF_CW, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Count", PDF_M + 4, ry + 8);
  GO.forEach((g, i) =>
    doc.text(String(gd[g]), PDF_M + (i + 1) * colW + colW / 2, ry + 8, {
      align: "center",
    }),
  );
  doc.text(String(total), PDF_M + (cols - 1) * colW + colW / 2, ry + 8, {
    align: "center",
  });
  ry += 12;
  doc.setFillColor(255, 255, 255);
  doc.rect(PDF_M, ry, PDF_CW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.text("%", PDF_M + 4, ry + 8);
  GO.forEach((g, i) =>
    doc.text(
      ((gd[g] / total) * 100).toFixed(1) + "%",
      PDF_M + (i + 1) * colW + colW / 2,
      ry + 8,
      { align: "center" },
    ),
  );
  doc.text("100%", PDF_M + (cols - 1) * colW + colW / 2, ry + 8, {
    align: "center",
  });
  doc.setDrawColor(226, 232, 240);
  doc.rect(PDF_M, hdrY, PDF_CW, ry + 12 - hdrY);
  return ry + 18;
}

function _pdfTable(doc, y, headers, rows, colWidths) {
  const fontSize = 6.5;
  const hdrH = 14;
  const baseRowH = 13;
  const lineH = 8; // height per text line
  y = _pdfEnsureSpace(doc, y, hdrH + baseRowH * 2);

  // Header
  doc.setFillColor(30, 58, 95);
  doc.rect(PDF_M, y, PDF_CW, hdrH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(255, 255, 255);
  let cx = PDF_M;
  headers.forEach((h, i) => {
    doc.text(h, cx + 2, y + 10, { maxWidth: colWidths[i] - 3 });
    cx += colWidths[i];
  });
  y += hdrH;

  // Rows with dynamic height
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  rows.forEach((row, ri) => {
    // Calculate max lines needed for this row
    let maxLines = 1;
    row.forEach((cell, ci) => {
      const txt = String(cell || "-");
      const lines = doc.splitTextToSize(txt, colWidths[ci] - 4);
      if (lines.length > maxLines) maxLines = lines.length;
    });
    maxLines = Math.min(maxLines, 5);
    const rowH = Math.max(baseRowH, maxLines * lineH + 4);

    y = _pdfEnsureSpace(doc, y, rowH);

    // Alternating row background
    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(PDF_M, y, PDF_CW, rowH, "F");
    }

    // Draw cell borders
    doc.setDrawColor(235, 238, 242);
    doc.setLineWidth(0.3);
    doc.line(PDF_M, y + rowH, PDF_W - PDF_M, y + rowH);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(fontSize);
    cx = PDF_M;
    row.forEach((cell, ci) => {
      const txt = String(cell || "-");
      const lines = doc.splitTextToSize(txt, colWidths[ci] - 4);
      const renderLines = lines.slice(0, 5);
      renderLines.forEach((line, li) => {
        doc.text(line, cx + 2, y + 9 + li * lineH);
      });
      cx += colWidths[ci];
    });
    y += rowH;
  });
  return y + 4;
}

// Serialises the live NUTS2 SVG map to a JPEG data URL, preserving the
// SVG's native viewBox aspect ratio so the map is never distorted.
// Returns { img, aspectRatio } or null.
async function _rptMapImg() {
  const svgEl = document.querySelector("#map-container svg");
  if (!svgEl) return null;
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  const vbW = vb && vb.width  > 0 ? vb.width  : 500;
  const vbH = vb && vb.height > 0 ? vb.height : Math.round(vbW * 1.9);
  const aspectRatio = vbW / vbH;
  return new Promise((resolve) => {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const cvs = document.createElement("canvas");
      cvs.width  = vbW * scale;
      cvs.height = vbH * scale;
      const ctx = cvs.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      URL.revokeObjectURL(url);
      resolve({ img: cvs.toDataURL("image/jpeg", 0.85), aspectRatio });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Places a map image (potentially portrait) respecting its aspect ratio.
// Constrains to 60% of content width or available page height, whichever is
// the binding constraint, then centres horizontally.
function _pdfMapFull(doc, y, img, cap, aspectRatio) {
  const ar = aspectRatio || (1 / 1.9);
  const MAX_W = PDF_CW * 0.6;
  const MAX_H = PDF_H - PDF_M - y - 30;
  let mW = MAX_W;
  let mH = mW / ar;
  if (mH > MAX_H) {
    mH = MAX_H;
    mW = mH * ar;
  }
  mW = Math.round(mW);
  mH = Math.round(mH);
  if (mH < 80) { return y; } // too small to be useful -- skip
  y = _pdfEnsureSpace(doc, y, mH + 22);
  const mX = PDF_M + (PDF_CW - mW) / 2;
  doc.addImage(img, "JPEG", mX, y, mW, mH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(cap, PDF_M + PDF_CW / 2, y + mH + 10, { align: "center" });
  return y + mH + 22;
}

// Builds the Cross-Country Comparison PDF section.
// Skipped silently when fewer than two countries are loaded.
async function _rptSectionIntl(doc, y, secNum) {
  const ccs = Object.keys(COUNTRIES);
  if (ccs.length < 2) return { y, secNum };

  secNum++;
  doc.addPage();
  y = PDF_M;
  y = _pdfSectionTitle(doc, y, secNum, "Cross-Country Comparison");

  const avgFn = (rows, col) => {
    if (!rows || !rows.length) return 0;
    const v = rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const pctFn = (rows, status, col) => {
    if (!rows || !rows.length) return 0;
    return (rows.filter((r) => r[col] === status).length / rows.length) * 100;
  };

  const metricLabels = ["Global Score", "HTTPS Score", "DNSSEC Adoption %", "Headers Score"];
  const countryColors = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ef4444", "#06b6d4"];
  const datasets = ccs.map((cc, i) => {
    const db = getDB(cc), meta = countryMeta(cc);
    return {
      label: meta.label,
      data: [
        avgCompositeForCountry(cc) || 0,
        avgFn(db.https, "final_score"),
        pctFn(db.dnssec, "Valid", "dnssec_status"),
        avgFn(db.headers, "final_score"),
      ],
      backgroundColor: countryColors[i % countryColors.length],
      borderRadius: 4,
    };
  });

  const chartImg = _rptBarImg(metricLabels, datasets, false, 700, 440);
  y = _pdfChartFull(doc, y, chartImg, "Average scores by country and scanner dimension");

  // Summary stats table
  const tHeaders = ["Country", "HEIs", "Global Score", "HTTPS Score", "DNSSEC %", "Headers Score"];
  const tWidths = [
    PDF_CW * 0.22,
    PDF_CW * 0.08,
    PDF_CW * 0.175,
    PDF_CW * 0.175,
    PDF_CW * 0.175,
    PDF_CW * 0.175,
  ];
  const fmt = (v) => (v !== null && !isNaN(v) && v !== 0) ? v.toFixed(1) : "-";
  const tRows = ccs.map((cc) => {
    const db = getDB(cc), meta = countryMeta(cc);
    const n = (db.https || db.dnssec || db.headers || []).length;
    const comp = avgCompositeForCountry(cc);
    const ht = avgFn(db.https, "final_score");
    const dn = pctFn(db.dnssec, "Valid", "dnssec_status");
    const hd = avgFn(db.headers, "final_score");
    return [meta.label, String(n), fmt(comp), fmt(ht), fmt(dn) + "%", fmt(hd)];
  });
  y = _pdfTable(doc, y + 8, tHeaders, tRows, tWidths);

  return { y, secNum };
}

async function generateReport() {
  if (!activeCountry) {
    document.getElementById("report-status").innerHTML =
      '<div style="color:var(--red);font-size:.85rem;padding:.5rem 0">No country selected. Upload data and select a country first.</div>';
    return;
  }
  const btn = document.getElementById("btn-gen-report");
  btn.disabled = true;
  btn.style.opacity = ".5";
  document.getElementById("report-status").innerHTML = "";
  document.getElementById("rpt-progress").style.display = "block";
  _pdfSetProgress(2, "Initialising PDF...", "Preparing A4 document");
  await new Promise((r) => setTimeout(r, 60));
  try {
    await _doGeneratePDF();
  } catch (e) {
    document.getElementById("report-status").innerHTML =
      '<div style="color:var(--red);font-size:.85rem;padding:.5rem 0">Error: ' +
      e.message +
      "</div>";
    console.error(e);
  }
  btn.disabled = false;
  btn.style.opacity = "1";
}

async function _doGeneratePDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    document.getElementById("report-status").innerHTML =
      '<div style="color:var(--red);font-size:.85rem;padding:.5rem 0">jsPDF library failed to load. Check your internet connection and reload the page.</div>';
    document.getElementById("rpt-progress").style.display = "none";
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const db = getDB(activeCountry);
  const meta = countryMeta(activeCountry);
  const dn = normCat(db.dnssec);
  const ht = normCat(db.https);
  const hd = normCat(db.headers);
  const src = normCat(db.source);

  const title =
    document.getElementById("rpt-title").value.trim() ||
    "Web Security Assessment Report";
  const author = document.getElementById("rpt-author").value.trim();
  const incOverview = document.getElementById("rpt-sec-overview").checked;
  const incHttps = document.getElementById("rpt-sec-https").checked;
  const incDnssec = document.getElementById("rpt-sec-dnssec").checked;
  const incHeaders = document.getElementById("rpt-sec-headers").checked;
  const incTable = document.getElementById("rpt-sec-table").checked;

  const tot =
    (dn ? dn.length : 0) || (ht ? ht.length : 0) || (hd ? hd.length : 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let secNum = 0;
  _pdfSetProgress(5, "Building cover page...", "");

  // ═══ COVER PAGE ═══
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, PDF_W, 6, "F");

  // Render flag via flagcdn.com, fallback to country code text
  const _flagImgSize = 64;
  try {
    const _flagUrl = `https://flagcdn.com/w160/${activeCountry.toLowerCase()}.png`;
    const _flagLoaded = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const fc = document.createElement("canvas");
        fc.width = 256;
        fc.height = 256;
        const fctx = fc.getContext("2d");
        fctx.drawImage(img, 0, 0, 256, 256);
        try {
          const dataUrl = fc.toDataURL("image/png");
          doc.addImage(
            dataUrl,
            "PNG",
            PDF_W / 2 - _flagImgSize / 2,
            210,
            _flagImgSize,
            _flagImgSize,
          );
          resolve(true);
        } catch (e) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = _flagUrl;
      setTimeout(() => resolve(false), 4000);
    });
    if (!_flagLoaded) {
      // Fallback: draw country code in a styled circle
      doc.setFillColor(241, 245, 249);
      doc.circle(PDF_W / 2, 242, 36, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(59, 130, 246);
      doc.text(activeCountry.toUpperCase(), PDF_W / 2, 248, {
        align: "center",
      });
    }
  } catch (e) {
    doc.setFillColor(241, 245, 249);
    doc.circle(PDF_W / 2, 242, 36, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(59, 130, 246);
    doc.text(activeCountry.toUpperCase(), PDF_W / 2, 248, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title, PDF_CW);
  doc.text(titleLines, PDF_W / 2, 310, { align: "center" });
  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246);
  doc.text(meta.label, PDF_W / 2, 310 + titleLines.length * 30 + 14, {
    align: "center",
  });
  const metaY = 310 + titleLines.length * 30 + 50;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const metaLines = [];
  if (author) metaLines.push("Author: " + author);
  metaLines.push("Generated: " + dateStr);
  metaLines.push("Institutions analysed: " + tot);
  metaLines.push(
    "Domains: " +
      [
        ht ? "HTTPS/TLS" : null,
        dn ? "DNSSEC" : null,
        hd ? "Security Headers" : null,
      ]
        .filter(Boolean)
        .join(", "),
  );
  metaLines.forEach((l, i) =>
    doc.text(l, PDF_W / 2, metaY + i * 18, { align: "center" }),
  );
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(PDF_M, PDF_H - 60, PDF_W - PDF_M, PDF_H - 60);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "HEI Web Security Assessment Platform",
    PDF_W / 2,
    PDF_H - 45,
    { align: "center" },
  );

  await new Promise((r) => setTimeout(r, 30));
  let stepsDone = 1;
  const totalSteps =
    [incOverview, incHttps, incDnssec, incHeaders, incTable].filter(
      Boolean,
    ).length + 2 + (Object.keys(COUNTRIES).length >= 2 ? 1 : 0);

  // ═══ SCORING REFERENCE PAGE ═══
  {
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering Scoring Reference...",
      "",
    );
    await new Promise((r) => setTimeout(r, 20));
    doc.addPage();
    let y = PDF_M;

    // Title
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, PDF_W, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Scoring Reference", PDF_M, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Methodology used to compute grades and scores for each security dimension.",
      PDF_M,
      y + 24,
    );
    y += 36;

    const _scoreSectionTitle = (title) => {
      y = _pdfEnsureSpace(doc, y, 32);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(title, PDF_M, y + 8);
      doc.setDrawColor(14, 165, 233);
      doc.setLineWidth(1.2);
      doc.line(PDF_M, y + 12, PDF_M + 60, y + 12);
      doc.setLineWidth(0.3);
      y += 18;
    };

    const _scoreTable = (rows) => {
      const colW = [PDF_CW * 0.12, PDF_CW * 0.22, PDF_CW * 0.66];
      const rowH = 11;
      y = _pdfEnsureSpace(doc, y, 14 + rows.length * rowH);
      // Header
      doc.setFillColor(30, 58, 95);
      doc.rect(PDF_M, y, PDF_CW, 13, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      ["Grade", "Score Range", "Interpretation"].forEach((h, i) => {
        const cx =
          PDF_M +
          [0, colW[0], colW[0] + colW[1]].reduce(
            (a, b, j) => (j <= i ? a + b : a),
            0,
          );
        doc.text(h, cx + 3, y + 9);
      });
      y += 13;
      rows.forEach((row, ri) => {
        const [grade, range, desc] = row;
        doc.setFillColor(
          ri % 2 === 0 ? 248 : 255,
          ri % 2 === 0 ? 250 : 255,
          ri % 2 === 0 ? 252 : 255,
        );
        doc.rect(PDF_M, y, PDF_CW, rowH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(grade, PDF_M + 3, y + 7.5);
        doc.setFont("helvetica", "normal");
        doc.text(range, PDF_M + colW[0] + 3, y + 7.5);
        doc.text(desc, PDF_M + colW[0] + colW[1] + 3, y + 7.5);
        y += rowH;
      });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(
        PDF_M,
        y - rows.length * rowH - 13,
        PDF_CW,
        rows.length * rowH + 13,
      );
      y += 8;
    };

    const _scoreNote = (text) => {
      y = _pdfEnsureSpace(doc, y, 16);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(text, PDF_CW - 6);
      doc.text(lines, PDF_M + 3, y + 8);
      y += lines.length * 9 + 6;
    };

    // HTTPS / TLS
    _scoreSectionTitle("HTTPS / TLS");
    _scoreTable([
      [
        "A+",
        "93–96 + extras",
        "TLS 1.2/1.3 only, valid cert, OCSP stapling and/or DNS CAA",
      ],
      ["A", "93–96", "TLS 1.2/1.3 only, valid certificate"],
      ["B", "88–94", "TLS 1.0 or 1.1 still enabled"],
      ["C–F", "< 88", "Legacy protocols or certificate problems"],
    ]);

    // DNSSEC
    _scoreSectionTitle("DNSSEC");
    _scoreTable([
      [
        "A",
        "88–100",
        "ECDSAP256SHA256 (algorithm 13), RFC 8624 RECOMMENDED",
      ],
      ["B", "75–87", "ED25519 or RSA with strong digest"],
      ["C", "50–74", "Deprecated algorithm"],
      ["F", "0", "DNSSEC not deployed"],
    ]);

    // Security Headers
    _scoreSectionTitle("HTTP Security Headers");
    _scoreNote(
      "Formula: final_score = header_component × 0.60 + redirect_component × 0.40",
    );
    _scoreTable([
      ["A", "≥ 80", "Most headers present and correctly configured"],
      ["B", "65–79", "Core headers present; advanced headers missing"],
      ["C", "50–64", "Partial header coverage"],
      ["D", "40–49", "Minimal coverage"],
      ["E", "33–39", "Very few headers"],
      ["F", "< 33", "No HTTPS redirect or almost no security headers"],
    ]);

    // Composite
    _scoreSectionTitle("Composite Ranking (#)");
    _scoreNote(
      "The # column uses a weighted composite: Global = HTTPS_domain x 0.80 + DNSSEC x 0.20, where HTTPS_domain = TLS x 0.80 + Headers x 0.20. Weights are renormalized when a scanner is absent. Ordered best to worst; stable regardless of sort direction.",
    );
  }

  // ═══ OVERVIEW ═══
  if (incOverview && tot > 0) {
    secNum++;
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering Executive Summary...",
      "Section " + secNum,
    );
    await new Promise((r) => setTimeout(r, 30));
    doc.addPage();
    let y = PDF_M;
    y = _pdfSectionTitle(doc, y, secNum, "Executive Summary");
    const stats = [
      { label: "Institutions", value: tot, sub: meta.label + " HEIs" },
    ];
    if (ht) {
      const sc = ht
        .map((r) => parseFloat(r.final_score))
        .filter((v) => !isNaN(v));
      stats.push({
        label: "Average HTTPS Score",
        value: (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1),
        sub: "out of 100",
      });
    }
    if (dn) {
      const v = dn.filter((r) => r.dnssec_status === "Valid").length;
      stats.push({
        label: "DNSSEC Adoption",
        value: Math.round((v / dn.length) * 100) + "%",
        sub: v + " of " + dn.length,
      });
    }
    if (hd) {
      const sc = hd
        .map((r) => parseFloat(r.final_score))
        .filter((v) => !isNaN(v));
      stats.push({
        label: "Average Headers Score",
        value: (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1),
        sub: "out of 100",
      });
    }
    y = _pdfStatRow(doc, y, stats);
    if (ht) {
      const gd = gradeDistObj(ht);
      const img = _rptBarImg(GO, [
        {
          label: "HEIs",
          data: GO.map((g) => gd[g]),
          backgroundColor: GO.map((g) => GC[g]),
          borderRadius: 4,
        },
      ]);
      if (dn) {
        const gd2 = gradeDistObj(dn);
        y = _pdfChartPair(
          doc,
          y,
          img,
          "HTTPS/TLS Grade Distribution",
          _rptBarImg(GO, [
            {
              label: "HEIs",
              data: GO.map((g) => gd2[g]),
              backgroundColor: GO.map((g) => GC[g]),
              borderRadius: 4,
            },
          ]),
          "DNSSEC Grade Distribution",
        );
      } else {
        y = _pdfChartFull(doc, y, img, "HTTPS/TLS Grade Distribution");
      }
    }
    if (hd) {
      const gd = gradeDistObj(hd);
      const img = _rptBarImg(GO, [
        {
          label: "HEIs",
          data: GO.map((g) => gd[g]),
          backgroundColor: GO.map((g) => GC[g]),
          borderRadius: 4,
        },
      ]);
      if (!ht && dn) {
        const gd2 = gradeDistObj(dn);
        y = _pdfChartPair(
          doc,
          y,
          _rptBarImg(GO, [
            {
              label: "HEIs",
              data: GO.map((g) => gd2[g]),
              backgroundColor: GO.map((g) => GC[g]),
              borderRadius: 4,
            },
          ]),
          "DNSSEC Grade Distribution",
          img,
          "Security Headers Grade Distribution",
        );
      } else {
        y = _pdfChartFull(
          doc,
          y,
          img,
          "Security Headers Grade Distribution",
        );
      }
    }
  }

  // ═══ HTTPS / TLS ═══
  if (incHttps && ht) {
    secNum++;
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering HTTPS/TLS Analysis...",
      "Section " + secNum,
    );
    await new Promise((r) => setTimeout(r, 30));
    doc.addPage();
    let y = PDF_M;
    y = _pdfSectionTitle(doc, y, secNum, "HTTPS / TLS Analysis");
    const scores = ht
      .map((r) => parseFloat(r.final_score))
      .filter((v) => !isNaN(v));
    const avg = (
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(1);
    y = _pdfStatRow(doc, y, [
      { label: "Institutions", value: ht.length, sub: "scanned" },
      { label: "Average Score", value: avg, sub: "out of 100" },
      {
        label: "Valid Certificates",
        value: countTrue(ht, "valid_certificate"),
        sub: "of " + ht.length,
      },
      {
        label: "TLS 1.3",
        value: countTrue(ht, "TLS1_3"),
        sub: "of " + ht.length,
      },
    ]);
    const gd = gradeDistObj(ht);
    const pl = ["SSLv2", "SSLv3", "TLS1", "TLS1_1", "TLS1_2", "TLS1_3"],
      pn = ["SSLv2", "SSLv3", "TLS 1.0", "TLS 1.1", "TLS 1.2", "TLS 1.3"];
    y = _pdfChartPair(
      doc,
      y,
      _rptDoughnutImg(
        GO,
        GO.map((g) => gd[g]),
        GO.map((g) => GC[g]),
      ),
      "Grade Distribution",
      _rptBarImg(pn, [
        {
          label: "HEIs",
          data: pl.map((p) => countTrue(ht, p)),
          backgroundColor: [
            "#ef4444",
            "#ef4444",
            "#f97316",
            "#f97316",
            "#10b981",
            "#059669",
          ],
          borderRadius: 4,
        },
      ]),
      "Protocol Support",
    );
    y = _pdfChartPair(
      doc,
      y,
      _rptHBarImg(
        ["Valid Cert", "OCSP Stapling", "DNS CAA", "Cert Transparency"],
        [
          countTrue(ht, "valid_certificate"),
          countTrue(ht, "ocsp_stapling"),
          countTrue(ht, "dns_caa"),
          countTrue(ht, "certificate_transparency"),
        ],
        ["#10b981", "#06b6d4", "#3b82f6", "#8b5cf6"],
      ),
      "Security Features",
      (() => {
        const an = avgBy(ht, "NUTS2_Label", "final_score"),
          nk = Object.keys(an).sort();
        return nk.length
          ? _rptBarImg(nk, [
              {
                label: "Average",
                data: nk.map((k) => an[k]),
                backgroundColor: "#3b82f6",
                borderRadius: 4,
              },
            ])
          : null;
      })(),
      "Average Score by NUTS2 Region",
    );
    const ac = avgBy(ht, "Category", "final_score"),
      ck = Object.keys(ac);
    const caVC = valCounts(ht, "certificate_authority"),
      caK = Object.entries(caVC)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    if (ck.length || caK.length) {
      y = _pdfChartPair(
        doc,
        y,
        ck.length
          ? _rptBarImg(ck, [
              {
                label: "Average",
                data: ck.map((k) => ac[k]),
                backgroundColor: ["#06b6d4", "#8b5cf6"],
                borderRadius: 4,
              },
            ])
          : null,
        "Average Score by Category",
        caK.length
          ? _rptDoughnutImg(
              caK.map((x) => x[0]),
              caK.map((x) => x[1]),
              caK.map(
                (_, i) =>
                  [
                    "#3b82f6",
                    "#06b6d4",
                    "#8b5cf6",
                    "#10b981",
                    "#f59e0b",
                    "#ef4444",
                    "#ec4899",
                    "#14b8a6",
                    "#6366f1",
                    "#f97316",
                  ][i % 10],
              ),
            )
          : null,
        "Top Certificate Authorities",
      );
    }
    y = _pdfGradeTable(doc, y, gd, ht.length);
    const mapResult = await _rptMapImg();
    if (mapResult) y = _pdfMapFull(doc, y, mapResult.img, "NUTS2 Regional Overview - Global Score", mapResult.aspectRatio);
  }

  // ═══ DNSSEC ═══
  if (incDnssec && dn) {
    secNum++;
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering DNSSEC Analysis...",
      "Section " + secNum,
    );
    await new Promise((r) => setTimeout(r, 30));
    doc.addPage();
    let y = PDF_M;
    y = _pdfSectionTitle(doc, y, secNum, "DNSSEC Analysis");
    const valid = dn.filter((r) => r.dnssec_status === "Valid").length;
    const miss = dn.filter((r) => r.dnssec_status === "Missing").length;
    const scores = dn
      .map((r) => parseFloat(r.score))
      .filter((v) => !isNaN(v));
    const avg = (
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(1);
    y = _pdfStatRow(doc, y, [
      { label: "Institutions", value: dn.length, sub: "scanned" },
      {
        label: "DNSSEC Valid",
        value: valid,
        sub: Math.round((valid / dn.length) * 100) + "% adoption",
      },
      { label: "DNSSEC Missing", value: miss, sub: "not configured" },
      { label: "Average Score", value: avg, sub: "out of 100" },
    ]);
    const gd = gradeDistObj(dn);
    const stVC = valCounts(dn, "dnssec_status"),
      stK = Object.keys(stVC);
    y = _pdfChartPair(
      doc,
      y,
      _rptDoughnutImg(
        stK,
        stK.map((k) => stVC[k]),
        stK.map((k) =>
          k === "Valid"
            ? "#10b981"
            : k === "Missing"
              ? "#ef4444"
              : "#f59e0b",
        ),
      ),
      "Adoption Status",
      _rptDoughnutImg(
        GO,
        GO.map((g) => gd[g]),
        GO.map((g) => GC[g]),
      ),
      "Grade Distribution",
    );
    const nu = groupCount(dn, "NUTS2_Label", "dnssec_status"),
      nk = Object.keys(nu).sort(),
      sts = [...new Set(dn.map((r) => r.dnssec_status))];
    const an = avgBy(dn, "NUTS2_Label", "score"),
      nk2 = Object.keys(an).sort();
    y = _pdfChartPair(
      doc,
      y,
      _rptBarImg(
        nk,
        sts.map((s) => ({
          label: s,
          data: nk.map((n) => (nu[n] || {})[s] || 0),
          backgroundColor:
            s === "Valid"
              ? "#10b981"
              : s === "Missing"
                ? "#ef4444"
                : "#f59e0b",
          borderRadius: 4,
        })),
        true,
      ),
      "Adoption by NUTS2 Region",
      nk2.length
        ? _rptBarImg(nk2, [
            {
              label: "Average",
              data: nk2.map((k) => an[k]),
              backgroundColor: "#8b5cf6",
              borderRadius: 4,
            },
          ])
        : null,
      "Average Score by NUTS2 Region",
    );
    const ac = avgBy(dn, "Category", "score"),
      ck = Object.keys(ac);
    const cs = groupCount(dn, "Category", "dnssec_status"),
      csk = Object.keys(cs),
      css = [...new Set(dn.map((r) => r.dnssec_status))];
    if (ck.length || csk.length) {
      y = _pdfChartPair(
        doc,
        y,
        ck.length
          ? _rptBarImg(ck, [
              {
                label: "Average",
                data: ck.map((k) => ac[k]),
                backgroundColor: ["#06b6d4", "#8b5cf6"],
                borderRadius: 4,
              },
            ])
          : null,
        "Average Score by Category",
        csk.length
          ? _rptBarImg(
              csk,
              css.map((s) => ({
                label: s,
                data: csk.map((c) => (cs[c] || {})[s] || 0),
                backgroundColor:
                  s === "Valid"
                    ? "#10b981"
                    : s === "Missing"
                      ? "#ef4444"
                      : "#f59e0b",
                borderRadius: 4,
              })),
              true,
            )
          : null,
        "Adoption by Category",
      );
    }
    y = _pdfGradeTable(doc, y, gd, dn.length);
  }

  // ═══ SECURITY HEADERS ═══
  if (incHeaders && hd) {
    secNum++;
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering Security Headers...",
      "Section " + secNum,
    );
    await new Promise((r) => setTimeout(r, 30));
    doc.addPage();
    let y = PDF_M;
    y = _pdfSectionTitle(
      doc,
      y,
      secNum,
      "HTTP Security Headers Analysis",
    );
    const scores = hd
      .map((r) => parseFloat(r.final_score))
      .filter((v) => !isNaN(v));
    const avg = (
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(1);
    y = _pdfStatRow(doc, y, [
      { label: "Institutions", value: hd.length, sub: "scanned" },
      { label: "Average Score", value: avg, sub: "out of 100" },
      {
        label: "HTTPS Redirect",
        value: countTrue(hd, "redirected_to_https"),
        sub: "of " + hd.length,
      },
      {
        label: "Best Grade",
        value:
          Object.entries(gradeDistObj(hd)).find(([, v]) => v > 0)?.[0] ||
          "-",
        sub: "highest",
      },
    ]);
    const gd = gradeDistObj(hd);
    const hcols = [
      "x-xss-protection",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "strict-transport-security",
      "content-security-policy",
      "cross-origin-resource-policy",
      "cross-origin-embedder-policy",
      "cross-origin-opener-policy",
      "access-control-allow-origin",
    ];
    const hv = hcols.map((c) => countTrue(hd, c + "_presence"));
    y = _pdfChartPair(
      doc,
      y,
      _rptDoughnutImg(
        GO,
        GO.map((g) => gd[g]),
        GO.map((g) => GC[g]),
      ),
      "Grade Distribution",
      _rptHBarImg(
        hcols.map((c) => c.replace(/-/g, " ")),
        hv,
        hcols.map(
          (_, i) =>
            [
              "#3b82f6",
              "#06b6d4",
              "#8b5cf6",
              "#10b981",
              "#f59e0b",
              "#ef4444",
              "#ec4899",
              "#14b8a6",
              "#6366f1",
              "#f97316",
            ][i % 10],
        ),
      ),
      "Header Adoption",
    );
    const an = avgBy(hd, "NUTS2_Label", "final_score"),
      nk = Object.keys(an).sort();
    const ac = avgBy(hd, "Category", "final_score"),
      ck = Object.keys(ac);
    if (nk.length || ck.length) {
      y = _pdfChartPair(
        doc,
        y,
        nk.length
          ? _rptBarImg(nk, [
              {
                label: "Average",
                data: nk.map((k) => an[k]),
                backgroundColor: "#f59e0b",
                borderRadius: 4,
              },
            ])
          : null,
        "Average Score by NUTS2 Region",
        ck.length
          ? _rptBarImg(ck, [
              {
                label: "Average",
                data: ck.map((k) => ac[k]),
                backgroundColor: ["#06b6d4", "#8b5cf6"],
                borderRadius: 4,
              },
            ])
          : null,
        "Average Score by Category",
      );
    }
    // Header adoption table
    y = _pdfEnsureSpace(doc, y, 14 + hcols.length * 11 + 10);
    const htHeaders = [
      "Security Header",
      "Present",
      "Absent",
      "Adoption Rate",
    ];
    const htWidths = [
      PDF_CW * 0.5,
      PDF_CW * 0.15,
      PDF_CW * 0.15,
      PDF_CW * 0.2,
    ];
    const htRows = hcols.map((c, i) => [
      c,
      hv[i],
      hd.length - hv[i],
      ((hv[i] / hd.length) * 100).toFixed(1) + "%",
    ]);
    y = _pdfTable(doc, y, htHeaders, htRows, htWidths);
    y = _pdfGradeTable(doc, y, gd, hd.length);
  }

  // ═══ CROSS-COUNTRY COMPARISON ═══
  if (Object.keys(COUNTRIES).length >= 2) {
    stepsDone++;
    _pdfSetProgress(
      Math.round((stepsDone / totalSteps) * 85),
      "Rendering Cross-Country Comparison...",
      "",
    );
    await new Promise((r) => setTimeout(r, 20));
    const intlResult = await _rptSectionIntl(doc, PDF_M, secNum);
    secNum = intlResult.secNum;
  }

  // ═══ INSTITUTIONS TABLE ═══
  if (incTable) {
    const base = src || dn || ht || hd;
    if (base) {
      secNum++;
      stepsDone++;
      _pdfSetProgress(
        Math.round((stepsDone / totalSteps) * 85),
        "Rendering Institutions Table...",
        "Section " + secNum + " (" + base.length + " rows)",
      );
      await new Promise((r) => setTimeout(r, 30));
      doc.addPage();
      let y = PDF_M;
      y = _pdfSectionTitle(doc, y, secNum, "Institutions Table");
      const byId = {};
      base.forEach((r) => {
        byId[r.ID] = {
          ID: r.ID,
          Name: r.Name,
          Category: r.Category,
          NUTS2_Label: r.NUTS2_Label,
          url: r.url || r.Url || r.URL || "",
        };
      });
      if (dn)
        dn.forEach((r) => {
          if (byId[r.ID]) {
            byId[r.ID].dg = r.grade;
            byId[r.ID].ds = r.score;
            byId[r.ID].dst = r.dnssec_status;
          }
        });
      if (ht)
        ht.forEach((r) => {
          if (byId[r.ID]) {
            byId[r.ID].hg = r.grade;
            byId[r.ID].hs_ = r.final_score;
          }
        });
      if (hd)
        hd.forEach((r) => {
          if (byId[r.ID]) {
            byId[r.ID].shg = r.grade;
            byId[r.ID].shs = r.final_score;
          }
        });
      const rows = Object.values(byId);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(rows.length + " institutions listed.", PDF_M, y);
      y += 12;
      const tHeaders = ["ID", "Name", "Category", "NUTS2"];
      const tWidths = [
        PDF_CW * 0.08,
        PDF_CW * 0.32,
        PDF_CW * 0.08,
        PDF_CW * 0.12,
      ];
      if (ht) {
        tHeaders.push("HTTPS", "Score");
        tWidths.push(PDF_CW * 0.05, PDF_CW * 0.05);
      }
      if (dn) {
        tHeaders.push("DNSSEC", "Score", "Status");
        tWidths.push(PDF_CW * 0.05, PDF_CW * 0.05, PDF_CW * 0.07);
      }
      if (hd) {
        tHeaders.push("Hdrs", "Score");
        tWidths.push(PDF_CW * 0.05, PDF_CW * 0.05);
      }
      const totalW = tWidths.reduce((a, b) => a + b, 0);
      const normWidths = tWidths.map((w) => (w / totalW) * PDF_CW);
      const tRows = rows.map((r) => {
        const row = [
          r.ID || "-",
          r.Name || "-",
          r.Category || "-",
          r.NUTS2_Label || "-",
        ];
        if (ht) {
          row.push(r.hg || "-", r.hs_ || "-");
        }
        if (dn) {
          row.push(r.dg || "-", r.ds || "-", r.dst || "-");
        }
        if (hd) {
          row.push(r.shg || "-", r.shs || "-");
        }
        return row;
      });
      y = _pdfTable(doc, y, tHeaders, tRows, normWidths);
    }
  }

  // ═══ PAGE NUMBERS + FOOTER ═══
  _pdfSetProgress(90, "Adding page numbers...", "");
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Page " + i + " of " + pageCount, PDF_W / 2, PDF_H - 20, {
      align: "center",
    });
    if (i > 1) {
      doc.text(
        "HEI Web Security Assessment - " + meta.label,
        PDF_M,
        PDF_H - 20,
      );
      doc.text(dateStr, PDF_W - PDF_M, PDF_H - 20, { align: "right" });
    }
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, PDF_W, 3, "F");
  }

  // ═══ SAVE ═══
  _pdfSetProgress(95, "Saving PDF...", "");
  await new Promise((r) => setTimeout(r, 30));
  const cc = activeCountry.toUpperCase();
  const fname =
    "HEI_Security_Report_" +
    cc +
    "_" +
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    ".pdf";
  doc.save(fname);
  _pdfSetProgress(100, "Report downloaded!", fname);
  document.getElementById("report-status").innerHTML =
    '<div style="color:var(--green);font-size:.85rem;padding:.5rem 0">PDF report saved as <strong>' +
    fname +
    "</strong> (" +
    pageCount +
    " pages, A4 format).</div>";
  setTimeout(() => {
    document.getElementById("rpt-progress").style.display = "none";
  }, 3000);
}
