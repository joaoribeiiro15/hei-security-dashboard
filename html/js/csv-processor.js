// ============================================================================
// CSV upload/filter/process functions
// ============================================================================

// ── Directory-upload file filter ────────────────────────────────────────────
// Directories to always exclude (noise, intermediate outputs, backups)
const SRC_EXCL_DIRS = [
  "/errors/",
  "/bkp/",
  "/test/",
  "/original/",
  "/tables/",
  "/charts/",
  "/choropleth_map/",
  "/data/results/dnssec/",
  "/data/results/sh/",
  "/analysis/",
];
// File name prefixes that indicate intermediate/noise files (not scanner outputs)
const SRC_EXCL_PREFIXES = [
  "final_result_",
  "final_classification_",
  "nuts_scores",
];
// File name substrings that indicate error logs
const SRC_EXCL_CONTAINS = ["_errors_"];
// Raw (unscored) header scan files — excluded in favour of the scored consolidated file
const HEADERS_EXCL_RAW = ["_desktop.csv", "_mobile.csv"];
// Preferred consolidated headers file (scored, one row per HEI)
const HEADERS_PREFERRED = "sh_final_result_with_scores_unique_hei.csv";
// Non-unique headers file excluded when the unique version is present
const HEADERS_EXCL_IF_PREFERRED = ["sh_final_result_with_scores.csv"];

// Mirror of server.py _strip_stamp: extract (baseName, timestamp) from a
// possibly-timestamped filename like "foo__2026-04-29T13-50-53.csv".
// Returns [baseName, ts] where ts may be null.
function _stripStamp(name) {
  const m = name.match(
    /^(.+?)__(\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2})?)(\.[^.]+)$/,
  );
  return m ? [m[1] + m[3], m[2]] : [name, null];
}

function _filterSrcFiles(fileList) {
  const files = Array.from(fileList);
  const hasDirUpload = files.some(
    (f) => f.webkitRelativePath && f.webkitRelativePath.includes("/"),
  );
  if (!hasDirUpload) return files; // individual file drop — pass through unchanged

  // ── Step 1: basic exclusion pass ────────────────────────────────────────
  const candidates = [];
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const name = f.name;
    if (!rel.endsWith(".csv")) continue;
    if (SRC_EXCL_DIRS.some((d) => rel.includes(d))) continue;
    if (SRC_EXCL_PREFIXES.some((p) => name.startsWith(p))) continue;
    if (SRC_EXCL_CONTAINS.some((s) => name.includes(s))) continue;
    if (HEADERS_EXCL_RAW.some((s) => name.endsWith(s))) continue;
    const inSource = rel.includes("/source/");
    const inResults =
      rel.includes("/results/") || rel.includes("/reports/");
    if (!inSource && !inResults) continue;
    candidates.push(f);
  }

  // ── Step 2: detect what consolidated files are present ──────────────────
  const hasDnssecConsol = candidates.some(
    (f) => f.name === "dnssec_consolidated_result.csv",
  );
  const hasHttpsConsol = candidates.some(
    (f) => f.name === "https_consolidate_result.csv",
  );
  const hasHeadersUnique = candidates.some(
    (f) => f.name === HEADERS_PREFERRED,
  );

  // ── Step 3: deduplicate by filename, preferring the most central path ───
  // Path priority: src/results/ or src/source/ (Thesis-Scripts central dir) = 0
  //                src/.../reports/ (individual scanner consolidated)        = 1
  //                src/.../results/ (individual scanner per-scan output)     = 2
  function pathPriority(rel) {
    if (rel.startsWith("src/results/") || rel.startsWith("src/source/"))
      return 0;
    if (rel.includes("/reports/")) return 1;
    return 2;
  }
  const byName = {};
  candidates
    .slice()
    .sort(
      (a, b) =>
        pathPriority(a.webkitRelativePath || a.name) -
        pathPriority(b.webkitRelativePath || b.name),
    )
    .forEach((f) => {
      if (!byName[f.name]) byName[f.name] = f;
    });

  // ── Step 4: apply consolidation deduplication ───────────────────────────
  const result = [];
  for (const [name, f] of Object.entries(byName)) {
    const [baseName] = _stripStamp(name);
    if (hasDnssecConsol && name.endsWith("_dnssec_scanner.csv")) continue;
    if (hasHttpsConsol && name.endsWith("_https_scanner.csv")) continue;
    if (hasHeadersUnique && HEADERS_EXCL_IF_PREFERRED.includes(baseName))
      continue;
    result.push(f);
  }

  return result;
}

function _attachZone(zoneId, inputId) {
  const uz = document.getElementById(zoneId);
  const fi = document.getElementById(inputId);
  if (!uz || !fi) return;
  uz.addEventListener("click", function (e) {
    if (e.target === fi) return;
    fi.click();
  });
  uz.addEventListener("dragover", function (e) {
    e.preventDefault();
    uz.classList.add("ov");
  });
  uz.addEventListener("dragleave", function () {
    uz.classList.remove("ov");
  });
  uz.addEventListener("drop", function (e) {
    e.preventDefault();
    uz.classList.remove("ov");
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  });
  fi.addEventListener("change", function () {
    if (fi.files.length) processFiles(fi.files);
  });
}
_attachZone("uz", "fi");
_attachZone("uz2", "fi2");

// Track whether the current data came from a directory upload
let _loadedFromDir = false;

// ============================================================================
// Shared CSV parsing: used both by manual upload (/upload) and by the
// server auto-load (/data). `opts.fromServer = true` adds a "Pre-loaded
// from the Server" badge to each entry shown in Data Management.
// ============================================================================
function _processReadResults(readResults, opts) {
  opts = opts || {};
  const fromServer = !!opts.fromServer;
  const badge = fromServer
    ? ' <span class="pl-badge">📁 Pre-loaded from the Server</span>'
    : "";
  const nameTag = (n) => (fromServer ? "🖥️ Server · " + n : n);

  const el = document.getElementById("ur");
  const prevHtml = el ? el.innerHTML : "";
  const results = [];

  readResults.forEach((r) => {
    if (r.error) {
      results.push(
        uriHtml(nameTag(r.name), "er", null, "Read error: " + r.error),
      );
      return;
    }
    try {
      const parsed = Papa.parse(r.text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });
      const cols = parsed.meta.fields || [];
      const key = detect(cols);
      if (!key) {
        results.push(
          uriHtml(
            nameTag(r.name),
            "er",
            null,
            "Could not identify scanner type. Columns: " +
              cols.slice(0, 8).join(", "),
          ),
        );
        return;
      }
      if (key === "headers_raw") {
        results.push(
          uriHtml(
            nameTag(r.name),
            "wn",
            "Security Headers (raw)",
            "Missing scores. Upload the scored version instead.",
          ),
        );
        return;
      }
      const skip = { raw_result: 1, raw_result_http: 1, raw_headers: 1 };
      const keepCols = cols.filter((c) => !skip[c]);
      const rawRows = parsed.data.map((row) => {
        const o = {};
        keepCols.forEach((k) => {
          o[k] = row[k];
        });
        return o;
      });

      // Normalise column names to match the platform's expectations
      const normRows = rawRows.map((row) => {
        const rr = { ...row };
        if (!rr.ID && rr.ETER_ID) rr.ID = rr.ETER_ID;
        if (!rr.ID && rr.Id) rr.ID = rr.Id; // POLON format uses "Id"
        if (!rr.NUTS2_Label) {
          if (rr.NUTS2_Label_2016) rr.NUTS2_Label = rr.NUTS2_Label_2016;
          else if (rr.NUTS2_Label_2021) rr.NUTS2_Label = rr.NUTS2_Label_2021;
          else if (rr.Region && rr.Region.trim()) rr.NUTS2_Label = rr.Region.trim();
        }
        return rr;
      });

      // Infer country from filename prefix as last-resort fallback.
      // Accepts both underscore ("PL_https_scanner.csv") and hyphen ("PL-heis.csv")
      // as the separator so files from different scanners/registries all resolve.
      const _basename = r.name.split("/").pop().split("\\").pop();
      const _prefixM = _basename.match(/^([A-Za-z]{2})[-_]/);
      const filenameCc = _prefixM ? _prefixM[1].toLowerCase() : null;

      // Split rows by country (DE + FR + IT may coexist in a single consolidated file)
      // LLM files use HEI_ID prefix (e.g. "NO-HEI-001" → "no") or URL TLD as fallback
      const byCountry = {};
      normRows.forEach((row) => {
        let cc = null;
        if (row.country && row.country.trim()) {
          cc = row.country.trim().toLowerCase();
        } else if (row.NUTS2) {
          cc = row.NUTS2.slice(0, 2).toLowerCase();
        } else if (key === "llm") {
          // LLM CSV: infer from HEI_ID prefix like "NO-HEI-001"
          const hid = (row.HEI_ID || "").trim();
          if (hid.length >= 2) cc = hid.slice(0, 2).toLowerCase();
          // Fallback: infer from URL TLD (www.uia.no → "no")
          if (!cc || cc === "--") {
            const url = (row.URL || "")
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "");
            const parts = url.split(".");
            if (parts.length >= 2)
              cc = parts[parts.length - 1].split("/")[0];
          }
        }
        if (!cc && filenameCc) cc = filenameCc;
        if (!cc) return;
        if (!byCountry[cc]) byCountry[cc] = [];
        byCountry[cc].push(row);
      });

      const countries = Object.keys(byCountry);
      if (countries.length === 0) {
        results.push(
          uriHtml(
            nameTag(r.name),
            "er",
            null,
            'Could not detect country from data. Ensure a "country", "NUTS2", "HEI_ID" column is present, or name the file with a 2-letter country prefix (e.g. PL_scan.csv).',
          ),
        );
        return;
      }

      countries.forEach((cc) => {
        const rows = byCountry[cc];
        _storeSnapshot(cc, key, rows);
        const meta = countryMeta(cc);
        const ts = _extractRunTimestamp(rows);
        const tsSuffix = ts
          ? ` <span style="opacity:.6">· ${ts.replace("T", " ").replace(/-/g, ":").replace("::", "-")}</span>`
          : "";
        results.push(
          uriHtml(
            nameTag(r.name),
            "ok",
            `${meta.flag} ${meta.label} — ${FR[key]}${badge}${tsSuffix}`,
            rows.length + " rows loaded.",
          ),
        );
        if (!activeCountry) {
          if (opts._skipBuild) {
            activeCountry = cc;
            if (cc) activeContinent = getContinent(cc);
          } else {
            setActiveCountry(cc);
          }
        }
      });

      // Rebuild the map if it was the active section (map is now in National>>Global)
      if (
        activeScope === "national" &&
        activeSub === "global" &&
        mapGeo
      ) {
        requestAnimationFrame(() => buildMap(mapGeo, activeCountry));
        renderMapCards();
      }
    } catch (e) {
      results.push(
        uriHtml(nameTag(r.name), "er", null, "Parse error: " + e.message),
      );
    }
  });

  if (el) {
    el.innerHTML = (opts._append ? prevHtml : "") + results.join("");
  }
  refreshCountryBar();
  refreshStatus();
  refreshInternationalVisibility();
  renderSnapshotBar();
  dashDirty = true;
  if (!opts._skipBuild && activeCountry && activeScope !== "_upload" && activeScope !== "_report") {
    buildCurrent();
    dashDirty = false;
  }
}

function processFiles(fileList) {
  const files = Array.from(fileList);
  const isDirUpload = files.some(
    (f) => f.webkitRelativePath && f.webkitRelativePath.includes("/"),
  );

  // If there is already data loaded from a previous directory upload,
  // and this new upload is also a directory, warn before replacing everything.
  if (
    isDirUpload &&
    _loadedFromDir &&
    Object.keys(COUNTRIES).length > 0
  ) {
    const folderName = files[0].webkitRelativePath.split("/")[0];
    const currentCountries = Object.keys(COUNTRIES)
      .map((cc) => {
        const m = countryMeta(cc);
        return m.label;
      })
      .join(", ");
    const ok = window.confirm(
      `You already have data loaded (${currentCountries}).\n\nUploading "${folderName}/" will add to or overwrite the existing datasets.\n\nContinue?`,
    );
    if (!ok) {
      document.getElementById("fi").value = "";
      document.getElementById("fi2").value = "";
      return;
    }
  }

  const toUpload = _filterSrcFiles(fileList);
  const el = document.getElementById("ur");

  if (toUpload.length === 0) {
    el.innerHTML = uriHtml(
      "src/",
      "wn",
      "No result CSVs found",
      "Ensure you are uploading the src/ directory from the Thesis Scripts project " +
        "and that scans have been run (src/results/ must contain CSV files).",
    );
    return;
  }

  if (isDirUpload) _loadedFromDir = true;

  el.innerHTML =
    '<div style="color:var(--t2);font-size:.85rem">Reading ' +
    toUpload.length +
    " file(s)...</div>";
  const form = new FormData();
  for (const f of toUpload) form.append("files", f);

  fetch("/upload", { method: "POST", body: form })
    .then((resp) => {
      if (!resp.ok) throw new Error("Server error: " + resp.status);
      return resp.json();
    })
    .then((readResults) => {
      _processReadResults(readResults, { fromServer: false });
      document.getElementById("fi").value = "";
      document.getElementById("fi2").value = "";
    })
    .catch((err) => {
      el.innerHTML = uriHtml(
        "Upload",
        "er",
        null,
        "Upload failed: " + err.message,
      );
    });
}

function uriHtml(name, cls, det, msg) {
  return `<div class="uri"><div class="d2 ${cls}"></div><div>
    <div class="fn">${name}</div>${det ? `<div class="det">${det}</div>` : ""}
    <div class="msg">${msg}</div></div></div>`;
}
