// ============================================================================
// Modals: AI recommendations modal, HEI detail modal, FAQ modals
// ============================================================================

let _aiModalData = {}; // rowId → llm row, populated by bTable
let _heiDetailRows = {}; // normId → enriched row, populated by bTable for global admin
let _heiDetailAllRanked = []; // full ranked list for national rank computation

function openAiModal(heiId) {
  const rec = _aiModalData[String(heiId).toUpperCase()];
  if (!rec) return;
  const overlay = document.getElementById("ai-modal-overlay");
  const heiEl = document.getElementById("ai-modal-hei");
  const bodyEl = document.getElementById("ai-modal-body");

  const riskColor =
    {
      Minimal: _cssVar("--risk-minimal", "#10b981"),
      Low: _cssVar("--risk-low", "#06b6d4"),
      Medium: _cssVar("--risk-medium", "#f59e0b"),
      High: _cssVar("--risk-high", "#ef4444"),
      Critical: _cssVar("--risk-high", "#ef4444"),
    }[rec.LLM_Risk_Level] || _cssVar("--t2", "#94a3b8");
  const recs = (rec.Top_Recommendations || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const recsHtml = recs
    .map(
      (r, i) =>
        `<div class="ai-rec-item"><span class="ai-rec-num">${i + 1}</span><span>${r}</span></div>`,
    )
    .join("");

  heiEl.textContent = rec.HEI_Name || heiId;
  bodyEl.innerHTML = `
    <div class="ai-risk-row">
      <span class="ai-risk-badge" style="border-color:${riskColor};color:${riskColor}">${rec.LLM_Risk_Level} Risk</span>
      <span class="ai-risk-score">Score: <strong>${rec.LLM_Risk_Score || "—"}</strong></span>
    </div>
    ${rec.Executive_Summary ? `<p class="ai-exec">${rec.Executive_Summary}</p>` : ""}
    <div class="ai-recs-title">Top Recommendations</div>
    <div class="ai-recs-list">${recsHtml}</div>
    ${rec.Compliance_Notes ? `<div class="ai-notes">${rec.Compliance_Notes}</div>` : ""}
    ${rec.Analysis_Source === "rule_based" ? `<p style="color:var(--t3);font-size:.75rem;margin-top:.6rem;font-style:italic">&#9881; Rule-based analysis (LLM unavailable at scan time)</p>` : ""}
  `;
  overlay.classList.add("on");
  document.body.style.overflow = "hidden";
}

function closeAiModal() {
  document.getElementById("ai-modal-overlay").classList.remove("on");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeAiModal(); closeHeiDetail(); }
});

// ==========================================================================
// HEI Detail Modal (global admin row click)
// ==========================================================================
function openHeiDetail(id) {
  const key = String(id).trim().toUpperCase();
  const r = _heiDetailRows[key];
  if (!r) return;

  // Find raw scanner rows for this institution from its country's data
  const cc = r._cc || activeCountry;
  const db = COUNTRIES[cc] || {};
  const normKey = key;
  const r_ht = db.https ? db.https.find((row) => (row.ID ? String(row.ID).trim().toUpperCase() : "") === normKey) : null;
  const r_dn = db.dnssec ? db.dnssec.find((row) => (row.ID ? String(row.ID).trim().toUpperCase() : "") === normKey) : null;
  const r_hd = db.headers ? db.headers.find((row) => (row.ID ? String(row.ID).trim().toUpperCase() : "") === normKey) : null;

  // National rank and regional rank
  const natRank = r._rank || "—";
  const natTotal = r._natTotal || "—";
  const natPct = (r._rank && r._natTotal) ? Math.round((r._rank / r._natTotal) * 100) : null;

  const peers = Object.values(_heiDetailRows)
    .filter((x) => x._cc === cc && x.NUTS2_Label && x.NUTS2_Label === r.NUTS2_Label)
    .sort((a, b) => (b._comp || 0) - (a._comp || 0));
  const regIdx = peers.findIndex((x) => x.ID === r.ID);
  const regRank = regIdx >= 0 ? regIdx + 1 : null;
  const regTotal = peers.length;
  const regPct = (regRank && regTotal) ? Math.round((regRank / regTotal) * 100) : null;

  const compStr = isNaN(r._comp) ? "—" : r._comp.toFixed(1);
  const compGradeModal = _compGrade(r._comp);
  const compGradeColor = GC[compGradeModal] || "var(--cyan)";

  // Build the full institution audit content (same as regional admin sees)
  const { scoresHtml, contentHtml } = _buildInstGlobalHtml(r_ht, r_dn, r_hd, null, null, null);

  // Rank summary bar
  const rankParts = [];
  if (natRank !== "—") rankParts.push(`<div class="hei-detail-rank-card"><div class="hei-detail-rank-val">#${natRank}</div><div class="hei-detail-rank-sub">National rank · of ${natTotal}${natPct !== null ? " · top " + natPct + "%" : ""}</div></div>`);
  if (regRank && r.NUTS2_Label) rankParts.push(`<div class="hei-detail-rank-card"><div class="hei-detail-rank-val">#${regRank}</div><div class="hei-detail-rank-sub">Regional rank · of ${regTotal}${regPct !== null ? " · top " + regPct + "%" : ""} · ${r.NUTS2_Label}</div></div>`);
  rankParts.push(`<div class="hei-detail-rank-card"><div class="hei-detail-rank-val" style="color:${compGradeColor}">Grade ${compGradeModal}</div><div class="hei-detail-rank-sub">Final Score: ${compStr}/100 · HTTPS 80% + DNSSEC 20%</div></div>`);
  const rankHtml = `<div class="hei-detail-ranks">${rankParts.join("")}</div>`;

  const aiHtml = "";

  const urlDisplay = r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.url}</a>` : "";

  document.getElementById("hei-detail-content").innerHTML = `
  <div class="hei-detail-name">${r.Name || "—"}</div>
  <div class="hei-detail-meta">
    ${r.ID ? `<span>ID: <code>${r.ID}</code></span>` : ""}
    ${r.Category ? `<span>${r.Category}</span>` : ""}
    ${r.NUTS2_Label ? `<span>${r.NUTS2_Label}</span>` : ""}
    ${urlDisplay ? `<span>${urlDisplay}</span>` : ""}
  </div>
  <div class="g4">${scoresHtml}</div>
  ${rankHtml}
  <div style="margin-top:1.4rem;padding-left:.5rem">${contentHtml}</div>
  ${aiHtml}
`;
  const overlay = document.getElementById("hei-detail-overlay");
  overlay.classList.add("on");
  const box = overlay.querySelector(".hei-detail-box");
  if (box) box.scrollTop = 0;
  document.body.style.overflow = "hidden";
}

function closeHeiDetail() {
  document.getElementById("hei-detail-overlay").classList.remove("on");
  document.body.style.overflow = "";
}

function openModal(id) {
  document.getElementById("modal-" + id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById("modal-" + id).classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape")
    ["https", "dnssec", "headers"].forEach(closeModal);
});
