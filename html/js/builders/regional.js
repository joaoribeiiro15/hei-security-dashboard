// ============================================================================
// Regional sub-tab builders (NUTS2 / Category breakdowns per scanner)
// ============================================================================

// ── Regional institution table (NUTS2 filter) ─────────────────────────────
function _bRegionalInstTable(dn, ht, hd, src, llm, sub) {
  const containerId = sub === "global" ? "r-inst-glb" : "r-inst-" + sub;
  const container = document.getElementById(containerId);
  if (!container) return;
  const colMap = { global: null, https: ["rank","name","cat","nuts2","https"], dnssec: ["rank","name","cat","nuts2","dnssec"], headers: ["rank","name","cat","nuts2","headers"] };
  const rankMap = { global: null, https: "hs_", dnssec: "ds", headers: "shs" };
  // Collect NUTS2 values from available data
  const refRows = ht || dn || hd || src || [];
  const nuts2Vals = [...new Set(refRows.map((r) => r.NUTS2_Label).filter(Boolean))].sort();
  const selId = "r-nuts2-" + sub;
  const srchId = "rts-" + (sub === "global" ? "glb" : sub);
  const tblId = "rittw-" + (sub === "global" ? "glb" : sub);
  // Preserve existing filter selection before rebuilding UI; for non-global
  // admins seed it with the user's own NUTS2 region on the very first render.
  const prevSel = document.getElementById(selId);
  let filterVal = prevSel ? prevSel.value : "";
  if (!filterVal && AUTH && AUTH.role !== "global") {
    const allRows = [...(ht || []), ...(dn || []), ...(hd || []), ...(src || [])];
    const ownRow = allRows.find(_ownInstitutionMatch);
    if (ownRow && ownRow.NUTS2_Label) filterVal = ownRow.NUTS2_Label;
  }
  // Render filter UI (mark selected option)
  const optHtml = `<option value="">All regions</option>` + nuts2Vals.map((n) => `<option value="${n}"${n === filterVal ? " selected" : ""}>${n}</option>`).join("");
  let selHtml = `<select id="${selId}" class="snap-sel" style="font-size:.78rem;margin-right:.5rem" onchange="buildRegional('${sub}')">${optHtml}</select>`;
  container.innerHTML = `<div class="stl" style="margin-top:1.5rem;font-size:.9rem"><span class="dt" style="background:var(--blue)"></span> Institutions by Region</div><div style="display:flex;align-items:center;gap:.6rem;margin:.6rem 0">${selHtml}<div class="srch-wrap" style="margin:0"><svg class="srch-icon" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input class="srch" id="${srchId}" placeholder="Search…"/></div></div><div id="${tblId}"></div>`;
  const filterRows = (rows) => filterVal ? rows && rows.filter((r) => r.NUTS2_Label === filterVal) : rows;
  bTable(filterRows(dn), filterRows(ht), filterRows(hd), null, filterRows(src), llm, {
    cols: colMap[sub],
    targetId: tblId,
    searchId: srchId,
    rankBy: rankMap[sub],
    regionalContext: true,
  });
}

function bRegionalHttps(d, dB) {
  const ec = document.getElementById("rh-c");
  if (!ec) return;
  if (!d) {
    ec.innerHTML = '<div class="lm">No HTTPS data loaded.</div>';
    return;
  }
  ec.innerHTML =
    cCard("rh-n", "Average HTTPS Score by Region") +
    cCard("rh-k", "Average HTTPS Score by Category");
  const an = avgBy(d, "NUTS2_Label", "final_score"),
    nk = Object.keys(an).sort();
  _mkCmpBar(
    "rh-n",
    nk,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "final_score") : null,
    "#3b82f6",
  );
  const ac = avgBy(d, "Category", "final_score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "rh-k",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "final_score") : null,
    "#06b6d4",
  );
}

function bRegionalDnssec(d, dB) {
  const ec = document.getElementById("rd-c");
  if (!ec) return;
  if (!d) {
    ec.innerHTML = '<div class="lm">No DNSSEC data loaded.</div>';
    return;
  }
  ec.innerHTML =
    cCard("rd-n", "DNSSEC Adoption by Region") +
    cCard("rd-s", "Average DNSSEC Score by Region") +
    cCard("rd-k", "Average DNSSEC Score by Category");
  const nu = groupCount(d, "NUTS2_Label", "dnssec_status"),
    nk = Object.keys(nu).sort();
  const sts = [...new Set(d.map((r) => r.dnssec_status))];
  mkB(
    "rd-n",
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
  );
  const an = avgBy(d, "NUTS2_Label", "score"),
    nk2 = Object.keys(an).sort();
  _mkCmpBar(
    "rd-s",
    nk2,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "score") : null,
    "#8b5cf6",
  );
  const ac = avgBy(d, "Category", "score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "rd-k",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "score") : null,
    "#06b6d4",
  );
}

function bRegionalHeaders(d, dB) {
  const ec = document.getElementById("rs-c");
  if (!ec) return;
  if (!d) {
    ec.innerHTML =
      '<div class="lm">No Security Headers data loaded.</div>';
    return;
  }
  ec.innerHTML =
    cCard("rs-n", "Average Headers Score by Region") +
    cCard("rs-k", "Average Headers Score by Category");
  const an = avgBy(d, "NUTS2_Label", "final_score"),
    nk = Object.keys(an).sort();
  _mkCmpBar(
    "rs-n",
    nk,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "final_score") : null,
    "#f59e0b",
  );
  const ac = avgBy(d, "Category", "final_score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "rs-k",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "final_score") : null,
    "#06b6d4",
  );
}
