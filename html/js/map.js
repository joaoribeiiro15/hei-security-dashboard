// ============================================================================
// NUTS2 Map (dynamic per active country)
// ============================================================================

const MAP_COLORS = {
  dnssec: [
    { max: 1, fill: "#ef4444", label: "0%" },
    { max: 26, fill: "#f97316", label: "1-25%" },
    { max: 51, fill: "#f59e0b", label: "26-50%" },
    { max: 76, fill: "#34d399", label: "51-75%" },
    { max: 101, fill: "#10b981", label: "76-100%" },
  ],
  https: [
    { max: 90, fill: "#f87171", label: "< 90" },
    { max: 92, fill: "#f97316", label: "90-91" },
    { max: 94, fill: "#f59e0b", label: "92-93" },
    { max: 95, fill: "#34d399", label: "94" },
    { max: 101, fill: "#10b981", label: "95-100" },
  ],
  headers: [
    { max: 40, fill: "#ef4444", label: "< 40" },
    { max: 55, fill: "#f97316", label: "40-54" },
    { max: 65, fill: "#f59e0b", label: "55-64" },
    { max: 75, fill: "#34d399", label: "65-74" },
    { max: 101, fill: "#10b981", label: "75-100" },
  ],
  composite: [
    { max: 50, fill: "#ef4444", label: "< 50" },
    { max: 65, fill: "#f97316", label: "50-64" },
    { max: 75, fill: "#f59e0b", label: "65-74" },
    { max: 85, fill: "#34d399", label: "75-84" },
    { max: 101, fill: "#10b981", label: "85-100" },
  ],
};
const MAP_TITLES = {
  dnssec: "DNSSEC",
  https: "HTTPS / TLS",
  headers: "Security Headers",
  composite: "Global Score",
};
const MAP_UNITS = {
  dnssec: "% valid",
  https: "average score",
  headers: "average score",
  composite: "average score",
};


let mapScanner = "composite";
let mapGeo = null;
let mapCountry = null; // which country the loaded geo belongs to
let mapHl = null;
let _mapCardPage = 0;

// Geometry vintage: this app fetches the NUTS 2024 boundary files, which is
// the revision the Portuguese source list is coded against (PT19/PT1A/PT1B/
// PT1C/PT1D). No code translation is needed or wanted here: NUTS_ID values in
// the fetched geometry match the dataset's NUTS2 values verbatim, for every
// country in the dashboard.
//
// Do NOT be tempted to fetch the 2021 vintage and coarsen the Portuguese codes
// back onto the old 7-region breakdown (PT16/PT17/PT18). That mapping looks
// tidy but is wrong twice over. First, PT1A (Grande Lisboa) and PT1B
// (Península de Setúbal) would both collapse onto PT17, and a polygon can only
// carry one fill, so whichever region is written last silently wins and the
// map shows one region's score over the other's territory. Second, the
// remaining pairs are not equivalent regions: 2024 Centro dropped Oeste and
// Médio Tejo, and 2024 Alentejo dropped Lezíria do Tejo, all three going to
// the new PT1D. PT19 is a proper subset of PT16 and PT1C of PT18, so painting
// the old polygons would extend each score across land the region no longer
// covers. Only the 2024 geometry represents these regions correctly.
//
// Legal basis: Commission Delegated Regulation (EU) 2023/674 of 26 December
// 2022, in force since 1 January 2024.

// Region codes arrive from user-supplied CSVs, so they carry whatever spacing
// and casing the source registry used. They are matched against NUTS_ID by
// exact string equality, and a mismatch drops the region from the map without
// any error, which is the same silent-failure mode that made PT19/PT1A/PT1B/
// PT1C/PT1D disappear. Normalise before matching.
function normNuts(v) {
  return (v || "").toString().trim().toUpperCase();
}

// Computes composite Global Score per NUTS2 region by merging all three scanner datasets.
function getMapDataComposite(cc) {
  if (!cc) return {};
  const db = getDB(cc);
  const dn = db.dnssec, ht = db.https, hd = db.headers;
  if (!dn && !ht && !hd) return {};
  const byId = {};
  (dn || ht || hd).forEach((r) => {
    const id = (r.ID || r.ETER_ID || "").toString().trim().toUpperCase();
    if (!id || byId[id]) return;
    byId[id] = { NUTS2: r.NUTS2 || "" };
  });
  if (dn) dn.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) { row.ds = r.score; if (!row.NUTS2) row.NUTS2 = r.NUTS2 || ""; } });
  if (ht) ht.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) { row.hs_ = r.final_score; if (!row.NUTS2) row.NUTS2 = r.NUTS2 || ""; } });
  if (hd) hd.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) { row.shs = r.final_score; if (!row.NUTS2) row.NUTS2 = r.NUTS2 || ""; } });
  const groups = {};
  Object.values(byId).forEach((r) => {
    const nuts = normNuts(r.NUTS2);
    if (!nuts) return;
    const s = compositeScore(r);
    if (isNaN(s)) return;
    if (!groups[nuts]) groups[nuts] = [];
    groups[nuts].push(s);
  });
  const out = {};
  for (const k in groups) {
    const scores = groups[k];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    out[k] = {
      value: Math.round(avg * 10) / 10,
      label: "avg Global Score " + avg.toFixed(1),
      heis: scores.length,
    };
  }
  return out;
}

function getMapData(scanner, forCountry) {
  const cc = forCountry || activeCountry;
  if (!cc) return {};
  if (scanner === "composite") return getMapDataComposite(cc);
  const d = getDB(cc)[scanner];
  if (!d) return {};
  const sums = {},
    counts = {},
    valids = {},
    totals = {};
  d.forEach((r) => {
    const nuts = normNuts(r.NUTS2);
    if (!nuts) return;
    if (scanner === "dnssec") {
      totals[nuts] = (totals[nuts] || 0) + 1;
      if (r.dnssec_status === "Valid")
        valids[nuts] = (valids[nuts] || 0) + 1;
    } else {
      const v = parseFloat(r.final_score);
      if (!isNaN(v)) {
        sums[nuts] = (sums[nuts] || 0) + v;
        counts[nuts] = (counts[nuts] || 0) + 1;
      }
    }
  });
  const out = {};
  if (scanner === "dnssec") {
    for (const k in totals) {
      const pct = Math.round(((valids[k] || 0) / totals[k]) * 100);
      out[k] = {
        value: pct,
        label:
          pct + "% valid (" + (valids[k] || 0) + "/" + totals[k] + ")",
        heis: totals[k],
      };
    }
  } else {
    for (const k in sums) {
      const avg = Math.round((sums[k] / counts[k]) * 10) / 10;
      out[k] = {
        value: avg,
        label: "average score " + avg.toFixed(1),
        heis: counts[k],
      };
    }
  }
  return out;
}

function mapColor(scanner, value) {
  if (value === null || value === undefined) return _cssVar("--bdr", "#1e293b");
  const scale = MAP_COLORS[scanner];
  if (!scale) return _cssVar("--bdr", "#1e293b");
  for (const s of scale) {
    if (value < s.max) return s.fill;
  }
  return scale[scale.length - 1].fill;
}

function buildMap(geo, forCountry) {
  const container = document.getElementById("map-container");
  container.innerHTML = "";

  if (!geo || !geo.features || geo.features.length === 0) {
    container.innerHTML =
      '<div class="map-loading" style="color:var(--amber)">Map geometry not available.</div>';
    renderMapLegend(forCountry);
    renderMapCards(forCountry);
    return;
  }

  // Measure container width reliably
  const wrapEl =
    container.closest(".map-svg-wrap") || container.parentElement;
  const w = Math.max(
    (wrapEl ? wrapEl.clientWidth : 0) - 8,
    container.clientWidth,
    300,
  );
  const h = Math.round(w * 1.9);

  // Build label map from CSV data
  const mapCC = forCountry || activeCountry;
  const db = mapCC ? getDB(mapCC) : {};
  const nuts2Map = {};
  ["dnssec", "https", "headers", "source"].forEach((k) => {
    if (db[k])
      db[k].forEach((r) => {
        if (r.NUTS2 && r.NUTS2_Label) nuts2Map[normNuts(r.NUTS2)] = r.NUTS2_Label;
      });
  });

  const features = geo.features;
  const data = getMapData(mapScanner, mapCC);
  const tip = document.getElementById("map-tip");

  // Any region code in the data that matches no polygon is silently invisible:
  // the score is correct everywhere else in the dashboard, but the region is
  // never drawn. That is how the NUTS 2021/2024 mismatch went unnoticed. Report
  // it instead of failing quietly. The usual cause is a dataset coded to a
  // different NUTS vintage than the geometry fetched in loadMap().
  const polygonKeys = new Set(
    features.map((f) => nuts2Key(f.properties.NUTS_ID, mapCC || activeCountry || "no")),
  );
  const orphans = Object.keys(data).filter((k) => !polygonKeys.has(k));
  if (orphans.length > 0) {
    console.warn(
      `[map/${mapCC}] ${orphans.length} region code(s) have data but no polygon and will not be drawn: ` +
        `${orphans.join(", ")}. Check that the dataset's NUTS vintage matches the geometry.`,
    );
  }


  // Natural Earth projection, fits to mainland features only for countries
  // that have outlying overseas territories (e.g. France FRY* regions).
  // Overseas territories are still drawn but the projection is sized to the mainland.
  const mainlandFeatures =
    mapCC === "fr"
      ? features.filter((f) => !f.properties.NUTS_ID.startsWith("FRY"))
      : features;
  const proj = d3
    .geoNaturalEarth1()
    .fitSize([w, h], {
      type: "FeatureCollection",
      features: mainlandFeatures.length > 0 ? mainlandFeatures : features,
    });
  const path = d3.geoPath().projection(proj);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .style("display", "block");

  features.forEach((f) => {
    const id = f.properties.NUTS_ID;
    const dataKey = nuts2Key(id, mapCC || activeCountry || "no");
    const label = nuts2Map[dataKey] || f.properties.NAME_LATN || id;
    const d2 = data[dataKey];
    const noDataFill = mapScanner === "composite" ? "#6b7280" : "#334155";
    const fill = d2 ? mapColor(mapScanner, d2.value) : noDataFill;

    const g = svg.append("g").style("cursor", "pointer");

    g.append("path")
      .attr("d", path(f))
      .attr("fill", fill)
      .attr("stroke", _cssVar("--bg", "#0a0e1a"))
      .attr("stroke-width", mapHl === label ? 2.5 : 0.8)
      .attr("opacity", !mapHl || mapHl === label ? 1 : 0.5)
      .on("mouseenter", function (event) {
        d3.select(this).attr("stroke-width", 2.5);
        const fmt = mapScanner === "dnssec" ? (v) => v + "%" : (v) => v.toFixed(1);
        const nuts2Line = mapScanner === "composite"
          ? `<div style="color:var(--t3);font-size:.75rem;margin-bottom:2px">${id}</div>`
          : "";
        tip.innerHTML = `<div style="font-weight:700;margin-bottom:2px">${label}</div>
          ${nuts2Line}<div style="color:var(--t2)">${MAP_TITLES[mapScanner]}: <span style="color:var(--t1);font-weight:700">${d2 ? fmt(d2.value) : "N/A"}</span></div>
          ${d2 ? `<div style="color:var(--t3);margin-top:2px">${d2.heis} HEIs</div>` : ""}`;
        tip.style.opacity = "1";
      })
      .on("mousemove", function (event) {
        const rect = container.getBoundingClientRect();
        let x = event.clientX - rect.left + 14;
        let y = event.clientY - rect.top - 10;
        if (x + 185 > rect.width) x = event.clientX - rect.left - 195;
        tip.style.left = x + "px";
        tip.style.top = y + "px";
      })
      .on("mouseleave", function () {
        d3.select(this).attr("stroke-width", mapHl === label ? 2.5 : 0.8);
        tip.style.opacity = "0";
      })
      .on("click", function () {
        mapHl = mapHl === label ? null : label;
        buildMap(geo, mapCC);
        renderMapCards();
      });

    // Score label on centroid
    const [cx, cy] = path.centroid(f);
    if (!isNaN(cx) && !isNaN(cy) && d2) {
      const fmt =
        mapScanner === "dnssec" ? (v) => v + "%" : (v) => v.toFixed(1);
      svg
        .append("text")
        .attr("x", cx)
        .attr("y", cy - 4)
        .attr("text-anchor", "middle")
        .attr("font-size", w < 260 ? 7 : 9)
        .attr("fill", "rgba(255,255,255,0.92)")
        .attr("pointer-events", "none")
        .attr("font-family", "'DM Sans',sans-serif")
        .attr("font-weight", "600")
        .text(fmt(d2.value));
    }
  });

  // ── France overseas territories inset ──────────────────────────────────
  // FRY* regions (French Guiana, Martinique, Guadeloupe, Réunion, Mayotte)
  // are drawn in a small inset panel in the bottom-left corner of the SVG.
  if (mapCC === "fr") {
    const overseas = features.filter((f) =>
      f.properties.NUTS_ID.startsWith("FRY"),
    );
    if (overseas.length > 0) {
      const insetW = Math.round(w * 0.32);
      const insetH = Math.round(insetW * 0.72);
      const insetX = 4;
      const insetY = h - insetH - 4;

      // Background panel
      svg
        .append("rect")
        .attr("x", insetX)
        .attr("y", insetY)
        .attr("width", insetW)
        .attr("height", insetH)
        .attr("fill", _cssVar("--card2", "#0f172a"))
        .attr("rx", 4)
        .attr("stroke", _cssVar("--bdr", "#1e293b"))
        .attr("stroke-width", 1);

      // Label
      svg
        .append("text")
        .attr("x", insetX + 4)
        .attr("y", insetY + 9)
        .attr("font-size", 6)
        .attr("fill", _cssVar("--t3", "#64748b"))
        .attr("font-family", "'DM Sans',sans-serif")
        .text("Overseas territories");

      // Project overseas features to fit the inset box
      const insetProj = d3.geoMercator().fitExtent(
        [
          [insetX + 2, insetY + 12],
          [insetX + insetW - 2, insetY + insetH - 2],
        ],
        { type: "FeatureCollection", features: overseas },
      );
      const insetPath = d3.geoPath().projection(insetProj);

      overseas.forEach((f) => {
        const id = f.properties.NUTS_ID;
        const dataKey = nuts2Key(id, "fr");
        const d2 = data[dataKey];
        const insetNoData = mapScanner === "composite" ? "#6b7280" : "#334155";
        const fill = d2 ? mapColor(mapScanner, d2.value) : insetNoData;
        svg
          .append("path")
          .attr("d", insetPath(f))
          .attr("fill", fill)
          .attr("stroke", _cssVar("--bg", "#0a0e1a"))
          .attr("stroke-width", 0.5);
      });
    }
  }

  renderMapLegend(forCountry);
  renderMapCards(forCountry);
}

function renderMapLegend(forCountry) {
  const el = document.getElementById("map-legend");
  const resolvedCC = forCountry || activeCountry;
  const cc = resolvedCC ? countryMeta(resolvedCC) : null;
  const title = cc
    ? `${cc.flag} ${cc.label} — ${MAP_TITLES[mapScanner]} · ${MAP_UNITS[mapScanner]}`
    : `${MAP_TITLES[mapScanner]} · ${MAP_UNITS[mapScanner]}`;
  const scale = MAP_COLORS[mapScanner];
  if (!scale) return;
  const noDataFill = mapScanner === "composite" ? "#6b7280" : _cssVar("--bdr", "#1e293b");
  el.innerHTML =
    `<div class="leg-title">${title}</div>` +
    scale
      .map(
        (s) =>
          `<div class="leg-row"><span class="leg-sw" style="background:${s.fill}"></span>${s.label}</div>`,
      )
      .join("") +
    `<div class="leg-row"><span class="leg-sw" style="background:${noDataFill};border:1px solid ${noDataFill}"></span>No data</div>`;
}

function renderMapCards(forCountry) {
  const el = document.getElementById("map-rcards");
  const rmCC = forCountry || activeCountry;
  if (!rmCC) {
    el.innerHTML = "";
    return;
  }
  const data = getMapData(mapScanner, rmCC);
  const isPct = mapScanner === "dnssec";
  const isComp = mapScanner === "composite";
  const fmt = isPct ? (v) => v + "%" : (v) => v.toFixed(1);

  // Build entries from all NUTS2 codes present in the data
  const db = getDB(rmCC);
  const nuts2Map = {}; // id → label
  ["dnssec", "https", "headers", "source"].forEach((k) => {
    if (db[k])
      db[k].forEach((r) => {
        if (r.NUTS2 && r.NUTS2_Label) nuts2Map[normNuts(r.NUTS2)] = r.NUTS2_Label;
      });
  });
  // For Norway, override with canonical SSB labels and ensure all 6 regions appear
  if (rmCC === "no") {
    Object.entries(NO_NUTS2_LABELS).forEach(([id, label]) => {
      nuts2Map[id] = label;
    });
  }

  const entries = Object.entries(nuts2Map)
    .map(([id, label]) => ({ id, label, d: data[id] }))
    .sort((a, b) => (b.d ? b.d.value : -1) - (a.d ? a.d.value : -1));

  const MAP_CARD_PAGE = 10;
  const totalEntries = entries.length;
  const totalPages = Math.ceil(totalEntries / MAP_CARD_PAGE);
  _mapCardPage = Math.max(0, Math.min(_mapCardPage, totalPages - 1));
  const pageStart = _mapCardPage * MAP_CARD_PAGE;
  const pageEnd = pageStart + MAP_CARD_PAGE;
  const pageEntries = entries.slice(pageStart, pageEnd);

  const cardsHtml = pageEntries
    .map((e) => {
      const v = e.d ? e.d.value : null;
      const fill = e.d ? mapColor(mapScanner, v) : "#64748b";
      const barPct =
        v !== null
          ? Math.min(100, (isPct || isComp) ? v : Math.max(0, ((v - 40) / 60) * 100))
          : 0;
      const hl = mapHl === e.label ? " hl" : "";
      const safeLabel = e.label.replace(/'/g, "\\'");
      return `<div class="mrc${hl}" onclick="mapHl=mapHl==='${safeLabel}'?null:'${safeLabel}';buildMap(mapGeo);renderMapCards()">
      <div class="mrc-top"><span class="mrc-name">${e.label}</span><span class="mrc-val" style="color:${fill}">${v !== null ? fmt(v) : "—"}</span></div>
      <div class="mrc-sub">${e.d ? e.d.label + " · " + e.d.heis + " HEIs" : "No data loaded"}</div>
      <div class="mrc-bar"><div class="mrc-bar-fill" style="width:${barPct}%;background:${fill}"></div></div>
    </div>`;
    })
    .join("");

  let pgHtml = "";
  if (totalEntries > MAP_CARD_PAGE) {
    const prevDis = _mapCardPage <= 0 ? " disabled" : "";
    const nextDis = _mapCardPage >= totalPages - 1 ? " disabled" : "";
    pgHtml = `<div class="mrc-pg">
    <button class="mrc-pg-btn"${prevDis} onclick="_mapCardPage--;renderMapCards()">&#8592; Prev</button>
    <span class="mrc-pg-info">${pageStart + 1}–${Math.min(pageEnd, totalEntries)} of ${totalEntries}</span>
    <button class="mrc-pg-btn"${nextDis} onclick="_mapCardPage++;renderMapCards()">Next &#8594;</button>
  </div>`;
  }

  el.innerHTML = cardsHtml + pgHtml;
}

function setMapScanner(btn) {
  mapScanner = btn.dataset.ms;
  mapHl = null;
  _mapCardPage = 0;
  document
    .querySelectorAll(".mbtn")
    .forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  if (mapGeo) buildMap(mapGeo, activeCountry);
  else renderMapCards();
  renderMapLegend();
}

// Eurostat GISCO config per country:
// All countries use Eurostat LEVL_2.
// Norway NUTS2 canonical labels (SSB 2024 classification)
const NO_NUTS2_LABELS = {
  NO0A: "Vestlandet",
  NO02: "Innlandet",
  NO06: "Trøndelag",
  NO07: "Nord-Norge",
  NO08: "Oslo og Viken",
  NO09: "Agder og Sør-Østlandet",
};

// All countries use Eurostat LEVL_2.
// For Norway: Eurostat LEVL_2 has NUTS_ID like NO020, NO071, NO0A1.
// SSB NUTS2 codes in the dataset are NO02, NO07, NO0A (first 4 chars).
function geoLevl(cc) {
  return 2;
}

// Map Eurostat LEVL_2 NUTS_ID to the dataset key:
// Norway: NO020->NO02, NO071->NO07, NO0A1->NO0A
// Others: NUTS_ID is already the NUTS2 code
function nuts2Key(nutsId, cc) {
  if (cc === "no") return nutsId.slice(0, 4);
  return nutsId;
}

// localStorage key for a country's geo cache
function geoStorageKey(cc) {
  return "hei_geo_v6_" + cc;
} // v6: NUTS 2024 vintage (v5 cached the 2021 geometry, which lacks PT19/PT1A/PT1B/PT1C/PT1D)

function saveGeoCache(cc, geo) {
  try {
    localStorage.setItem(geoStorageKey(cc), JSON.stringify(geo));
  } catch (e) {
    /* storage full or unavailable — ignore */
  }
}

function loadGeoCache(cc) {
  try {
    const raw = localStorage.getItem(geoStorageKey(cc));
    if (!raw) return null;
    const geo = JSON.parse(raw);
    if (geo && geo.features && geo.features.length > 0) return geo;
  } catch (e) {
    /* corrupt — ignore */
  }
  return null;
}

function loadMap() {
  if (!activeCountry) {
    document.getElementById("map-container").innerHTML =
      '<div class="map-loading">Select a country from the bar above to view the map.</div>';
    renderMapLegend();
    renderMapCards();
    return;
  }
  if (mapCountry !== activeCountry) {
    mapGeo = null;
    mapHl = null;
    mapCountry = activeCountry;
    _mapCardPage = 0;
  }

  const snapCC = activeCountry;
  const container = document.getElementById("map-container");
  const meta = countryMeta(snapCC);

  // If geo already loaded for this country, just rebuild the SVG
  if (mapGeo) {
    requestAnimationFrame(() => buildMap(mapGeo, snapCC));
    return;
  }

  // Check localStorage cache (fast, survives reloads)
  const cached = loadGeoCache(snapCC);
  if (cached) {
    mapGeo = cached;
    requestAnimationFrame(() => buildMap(cached, snapCC));
    return;
  }

  // Fetch from Eurostat directly in the browser — always works since browser has internet
  const levl = geoLevl(snapCC);
  const cntr = snapCC.toUpperCase();
  const eurostatUrl = `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_60M_2024_4326_LEVL_${levl}.geojson`;

  container.innerHTML = `<div class="map-loading">${meta.flag} Loading ${meta.label} map from Eurostat...</div>`;

  fetch(eurostatUrl)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((raw) => {
      // Filter to this country only
      const features = (raw.features || []).filter(
        (f) => f.properties.CNTR_CODE === cntr,
      );
      if (features.length === 0)
        throw new Error("no features for " + cntr);
      const geo = { type: "FeatureCollection", features };
      saveGeoCache(snapCC, geo);
      mapGeo = geo;
      requestAnimationFrame(() => buildMap(geo, snapCC));
    })
    .catch((err) => {
      // Eurostat failed — try server proxy as last resort
      fetch(`/geo.geojson?country=${snapCC}`)
        .then((r) => r.json())
        .then((geo) => {
          if (!geo.features || geo.features.length === 0)
            throw new Error("empty from server");
          saveGeoCache(snapCC, geo);
          mapGeo = geo;
          requestAnimationFrame(() => buildMap(geo, snapCC));
        })
        .catch(() => {
          container.innerHTML = `<div class="map-loading" style="color:var(--red)">
            <strong>Could not load map for ${meta.flag} ${meta.label}</strong><br>
            <span style="font-size:.75rem;color:var(--t3);line-height:1.7">
              Requires internet access on first load.<br>
              Once loaded it is saved locally and works offline.<br>
              <a href="#" style="color:var(--cyan)" onclick="mapGeo=null;loadGeoCache&&localStorage.removeItem(geoStorageKey('${snapCC}'));loadMap();return false">Retry</a>
            </span></div>`;
        });
    });
}
