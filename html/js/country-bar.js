// ============================================================================
// Country bar, snapshot selector, calendar/list views
// ============================================================================

function refreshCountryBar() {
  const emptyEl = document.getElementById("cbar-empty");
  const hintEl = document.getElementById("cbar-hint");
  const continentDd = document.getElementById("continent-dd");
  const countryDd = document.getElementById("country-dd");
  const codes = Object.keys(COUNTRIES);

  if (codes.length === 0) {
    emptyEl.style.display = "";
    hintEl.textContent = "";
    continentDd.style.display = "none";
    countryDd.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  continentDd.style.display = "";
  countryDd.style.display = "";

  // Build continent groups from loaded countries
  const continentGroups = {};
  codes.forEach((cc) => {
    const cid = getContinent(cc);
    if (!continentGroups[cid]) continentGroups[cid] = [];
    continentGroups[cid].push(cc);
  });

  // ---- Continent dropdown ----
  const continentPanel = document.getElementById("continent-panel");
  const continentBtnText = document.getElementById("continent-btn-text");
  continentPanel.innerHTML = "";

  const allItem = document.createElement("div");
  allItem.className = "dd-item" + (activeContinent === null ? " on" : "");
  allItem.innerHTML = `${SVG_GLOBE}<span style="margin-left:.3rem">All continents</span><span style="font-size:.68rem;opacity:.5;margin-left:.4rem">(${codes.length})</span>`;
  allItem.addEventListener("click", () => setActiveContinent(null));
  continentPanel.appendChild(allItem);

  if (Object.keys(continentGroups).length > 1 || (Object.keys(continentGroups).length === 1 && !continentGroups["other"])) {
    const sep = document.createElement("div");
    sep.className = "dd-sep";
    continentPanel.appendChild(sep);
  }

  Object.entries(continentGroups).sort(([a],[b]) => {
    const la = CONTINENT_MAP[a] ? CONTINENT_MAP[a].label : a;
    const lb = CONTINENT_MAP[b] ? CONTINENT_MAP[b].label : b;
    return la.localeCompare(lb);
  }).forEach(([cid, ccList]) => {
    const meta = CONTINENT_MAP[cid] || { label: cid === "other" ? "Other" : cid.toUpperCase(), svg: SVG_GLOBE };
    const item = document.createElement("div");
    item.className = "dd-item" + (activeContinent === cid ? " on" : "");
    item.innerHTML = `${meta.svg}<span style="margin-left:.3rem">${meta.label}</span><span style="font-size:.68rem;opacity:.5;margin-left:.4rem">(${ccList.length})</span>`;
    item.addEventListener("click", () => setActiveContinent(cid));
    continentPanel.appendChild(item);
  });

  if (activeContinent && CONTINENT_MAP[activeContinent]) {
    const m = CONTINENT_MAP[activeContinent];
    continentBtnText.innerHTML = `${m.svg}<span style="margin-left:.3rem">${m.label}</span>`;
  } else {
    continentBtnText.innerHTML = `${SVG_GLOBE}<span style="margin-left:.3rem">All continents</span>`;
  }

  // ---- Country dropdown ----
  const filteredCodes = (activeContinent
    ? codes.filter((cc) => getContinent(cc) === activeContinent)
    : codes).sort((a, b) => countryMeta(a).label.localeCompare(countryMeta(b).label));

  if (activeCountry && !filteredCodes.includes(activeCountry)) {
    activeCountry = filteredCodes.length > 0 ? filteredCodes[0] : null;
  }

  const countryPanel = document.getElementById("country-panel");
  const countryBtnContent = document.getElementById("country-btn-content");
  countryPanel.innerHTML = "";

  filteredCodes.forEach((cc) => {
    const meta = countryMeta(cc);
    const db = COUNTRIES[cc];
    const loaded = Object.values(db).filter((v) => v !== null).length;
    const item = document.createElement("div");
    item.className = "dd-item" + (cc === activeCountry ? " on" : "");
    item.innerHTML = `<span class="cflag" style="display:inline-flex;align-items:center">${meta.flag}</span><span>${meta.label}</span><span style="font-size:.68rem;opacity:.5;margin-left:.3rem">(${loaded})</span><span class="dd-del" title="Remove country data" onclick="removeCountry('${cc}',event)">✕</span>`;
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("dd-del")) return;
      document.querySelectorAll(".dd-panel").forEach((p) => p.classList.remove("open"));
      document.querySelectorAll(".dd-btn").forEach((b) => b.classList.remove("open"));
      setActiveCountry(cc);
    });
    countryPanel.appendChild(item);
  });

  if (activeCountry && COUNTRIES[activeCountry]) {
    const meta = countryMeta(activeCountry);
    countryBtnContent.innerHTML = `<span class="cflag" style="display:inline-flex;align-items:center;margin-right:.25rem">${meta.flag}</span>${meta.label}`;
  } else {
    countryBtnContent.textContent = filteredCodes.length ? "Select country" : "No countries";
  }

  const n = codes.length;
  hintEl.textContent = n > 1 ? `${n} countries loaded` : "";
}

function setActiveCountry(cc) {
  activeCountry = cc;
  if (cc) activeContinent = getContinent(cc);
  refreshCountryBar();
  // Reset the snapshot selection to the latest stored snapshot for this
  // country, with no comparison active by default.
  const stamps = _allTimestamps(cc);
  activeSnapshotA = stamps.length ? stamps[stamps.length - 1] : null;
  activeSnapshotB = null;
  renderSnapshotBar();
  // Reset table state for the new country
  _tableSearch = "";
  _tablePageCurrent = 1;
  document.querySelectorAll(".srch").forEach((s) => { s.value = ""; });
  dashDirty = true;
  if (activeScope !== "_upload" && activeScope !== "_report") {
    buildCurrent();
    dashDirty = false;
  }
  refreshStatus();
}

function setActiveContinent(cid) {
  activeContinent = cid;
  document.querySelectorAll(".dd-panel").forEach((p) => p.classList.remove("open"));
  document.querySelectorAll(".dd-btn").forEach((b) => b.classList.remove("open"));
  const codes = Object.keys(COUNTRIES);
  const filtered = cid ? codes.filter((cc) => getContinent(cc) === cid) : codes;
  if (filtered.length > 0 && (!activeCountry || !filtered.includes(activeCountry))) {
    setActiveCountry(filtered[0]);
  } else {
    refreshCountryBar();
  }
}

function renderSnapshotBar() {
  const ctrl = document.getElementById("time-ctrl");
  if (!ctrl) return;
  if (!activeCountry) {
    ctrl.style.display = "none";
    return;
  }
  const stamps = _allTimestamps(activeCountry);
  if (stamps.length < 2) {
    ctrl.style.display = "none";
    return;
  }
  ctrl.style.display = "flex";

  const selA = document.getElementById("snap-a");
  const selB = document.getElementById("snap-b");
  const hint = document.getElementById("tp-hint");
  const stampsRev = stamps.slice().reverse();
  const opts = stampsRev
    .map((s) => `<option value="${s}">${_fmtTsLabel(s, stamps)}</option>`)
    .join("");
  selA.innerHTML = opts;
  selB.innerHTML = '<option value="">none</option>' + opts;
  selA.value = activeSnapshotA || stampsRev[0];
  selB.value = activeSnapshotB || "";
  if (hint) hint.textContent = stamps.length + " snapshots stored";

  const btn = document.getElementById("time-btn");
  if (btn)
    btn.textContent = "\u{1F550} " + _fmtTsLabel(selA.value, stamps);

  if (_snapView === "list")
    _renderSnapList(document.getElementById("snap-list-view"));
  if (_snapView === "calendar")
    _renderSnapCalendar(
      document.getElementById("snap-cal-view"),
      _calYear,
      _calMonth,
    );
}

function toggleTimePanel() {
  const panel = document.getElementById("time-panel");
  const btn = document.getElementById("time-btn");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  if (open) {
    const r = btn.getBoundingClientRect();
    panel.style.top = r.bottom + 6 + "px";
    // Always sync to the latest snapshot month on open
    const _openStamps = activeCountry ? _allTimestamps(activeCountry) : [];
    if (_openStamps.length) {
      const d = _tsToDate(_openStamps[_openStamps.length - 1]);
      _calYear = d.year;
      _calMonth = d.month;
    }
    if (_snapView === "list")
      _renderSnapList(document.getElementById("snap-list-view"));
    if (_snapView === "calendar")
      _renderSnapCalendar(
        document.getElementById("snap-cal-view"),
        _calYear,
        _calMonth,
      );
  }
}

document.addEventListener("click", function (e) {
  const panel = document.getElementById("time-panel");
  const ctrl = document.getElementById("time-ctrl");
  if (
    panel &&
    !panel.contains(e.target) &&
    ctrl &&
    !ctrl.contains(e.target)
  ) {
    panel.classList.remove("open");
    const btn = document.getElementById("time-btn");
    if (btn) btn.classList.remove("open");
  }
});

function onSnapChange() {
  const selA = document.getElementById("snap-a");
  const selB = document.getElementById("snap-b");
  activeSnapshotA = selA ? selA.value || null : activeSnapshotA;
  activeSnapshotB = selB ? selB.value || null : null;
  const stamps = activeCountry ? _allTimestamps(activeCountry) : [];
  const btn = document.getElementById("time-btn");
  if (btn && selA)
    btn.textContent = "\u{1F550} " + _fmtTsLabel(selA.value, stamps);
  if (_snapView === "list")
    _renderSnapList(document.getElementById("snap-list-view"));
  if (_snapView === "calendar")
    _renderSnapCalendar(
      document.getElementById("snap-cal-view"),
      _calYear,
      _calMonth,
    );
  if (activeScope !== "_upload" && activeScope !== "_report")
    buildCurrent();
}

// Snapshot picker: list & calendar views
let _snapView = "dropdown";
let _calYear = null,
  _calMonth = null;
let _calExpandedDay = null;

function _snapViewSwitch(mode) {
  _snapView = mode;
  document
    .querySelectorAll(".sv-btn")
    .forEach((b) => b.classList.toggle("on", b.dataset.sv === mode));
  const selA = document.getElementById("snap-a");
  const listV = document.getElementById("snap-list-view");
  const calV = document.getElementById("snap-cal-view");
  if (selA) selA.style.display = mode === "dropdown" ? "" : "none";
  if (listV) listV.style.display = mode === "list" ? "" : "none";
  if (calV) calV.style.display = mode === "calendar" ? "" : "none";
  if (mode === "list") _renderSnapList(listV);
  if (mode === "calendar") {
    const stamps = activeCountry ? _allTimestamps(activeCountry) : [];
    if (!_calYear && stamps.length) {
      const d = _tsToDate(activeSnapshotA || stamps[stamps.length - 1]);
      _calYear = d.year;
      _calMonth = d.month;
    } else if (!_calYear) {
      const now = new Date();
      _calYear = now.getFullYear();
      _calMonth = now.getMonth();
    }
    _renderSnapCalendar(calV, _calYear, _calMonth);
  }
}

function _tsToDate(ts) {
  if (!ts)
    return {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
    };
  const mf = /^(\d{4})-(\d{2})-(\d{2})/.exec(ts);
  if (mf)
    return {
      year: parseInt(mf[1]),
      month: parseInt(mf[2]) - 1,
      day: parseInt(mf[3]),
    };
  return { year: new Date().getFullYear(), month: new Date().getMonth() };
}

function _renderSnapList(container) {
  if (!container) return;
  const stamps = activeCountry ? _allTimestamps(activeCountry) : [];
  if (!stamps.length) {
    container.innerHTML =
      '<div class="lm" style="font-size:.78rem;padding:.5rem">No snapshots.</div>';
    return;
  }
  const rev = stamps.slice().reverse();
  container.innerHTML =
    '<ul class="snap-list">' +
    rev
      .map(
        (s) =>
          `<li class="${s === activeSnapshotA ? "active" : ""}" onclick="_selectSnapA('${s}')">${_fmtTsLabel(s, stamps)}</li>`,
      )
      .join("") +
    "</ul>";
}

function _selectSnapA(ts) {
  activeSnapshotA = ts;
  const selA = document.getElementById("snap-a");
  if (selA) selA.value = ts;
  const stamps = activeCountry ? _allTimestamps(activeCountry) : [];
  const btn = document.getElementById("time-btn");
  if (btn) btn.textContent = "\u{1F550} " + _fmtTsLabel(ts, stamps);
  if (_snapView === "list")
    _renderSnapList(document.getElementById("snap-list-view"));
  if (_snapView === "calendar")
    _renderSnapCalendar(
      document.getElementById("snap-cal-view"),
      _calYear,
      _calMonth,
    );
  if (activeScope !== "_upload" && activeScope !== "_report")
    buildCurrent();
}

function _calNav(delta) {
  _calMonth += delta;
  if (_calMonth > 11) {
    _calMonth = 0;
    _calYear++;
  }
  if (_calMonth < 0) {
    _calMonth = 11;
    _calYear--;
  }
  _renderSnapCalendar(
    document.getElementById("snap-cal-view"),
    _calYear,
    _calMonth,
  );
}

function _renderSnapCalendar(container, year, month) {
  if (!container) return;
  const stamps = activeCountry ? _allTimestamps(activeCountry) : [];

  // Group timestamps by YYYY-MM-DD
  const byDay = {};
  stamps.forEach((s) => {
    const d = _tsToDate(s);
    const key = `${d.year}-${String(d.month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    (byDay[key] = byDay[key] || []).push(s);
  });

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const totalDays = lastDay.getDate();

  const activeDate = _tsToDate(activeSnapshotA);
  const isActiveMonth =
    activeDate.year === year && activeDate.month === month;

  let html = `<div class="sv-cal">
    <div class="sv-cal-nav">
      <button onclick="event.stopPropagation();_calNav(-1)">&#8249;</button>
      <span>${MONTHS[month]} ${year}</span>
      <button onclick="event.stopPropagation();_calNav(1)">&#8250;</button>
    </div>
    <div class="sv-cal-grid">`;

  DOW.forEach((d) => (html += `<div class="sv-cal-dow">${d}</div>`));

  // Empty cells before day 1
  for (let i = 0; i < startDow; i++)
    html += `<div class="sv-cal-day"></div>`;

  for (let d = 1; d <= totalDays; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayStamps = byDay[key] || [];
    const isActive =
      isActiveMonth && activeDate.day === d && dayStamps.length;
    const isExpanded = _calExpandedDay === key;
    const cls = [
      "sv-cal-day",
      dayStamps.length ? "has-snap" : "",
      isActive ? "active-day" : "",
    ]
      .filter(Boolean)
      .join(" ");
    html += `<div class="${cls}"`;
    if (dayStamps.length) {
      if (dayStamps.length === 1)
        html += ` onclick="_selectSnapA('${dayStamps[0]}');_calExpandedDay=null"`;
      else
        html += ` onclick="_calExpandedDay=_calExpandedDay==='${key}'?null:'${key}';_renderSnapCalendar(document.getElementById('snap-cal-view'),${year},${month})"`;
    }
    html += `>${d}`;
    if (dayStamps.length) html += `<span class="snap-dot"></span>`;
    html += `</div>`;
    if (isExpanded && dayStamps.length > 1) {
      // insert sub-list spanning full row after this day cell — we'll append it below grid
    }
  }

  html += `</div>`; // end grid

  // Expanded day times (below grid)
  if (
    _calExpandedDay &&
    byDay[_calExpandedDay] &&
    byDay[_calExpandedDay].length > 1
  ) {
    html +=
      `<ul class="sv-day-times">` +
      byDay[_calExpandedDay]
        .slice()
        .reverse()
        .map(
          (s) =>
            `<li onclick="_calExpandedDay=null;_selectSnapA('${s}')">${_fmtTs(s)}</li>`,
        )
        .join("") +
      `</ul>`;
  }

  html += `</div>`; // end sv-cal
  container.innerHTML = html;
}

function removeCountry(cc, event) {
  event.stopPropagation();
  delete COUNTRIES[cc];
  if (activeCountry === cc) {
    const remaining = Object.keys(COUNTRIES);
    activeCountry = remaining.length > 0 ? remaining[0] : null;
  }
  if (Object.keys(COUNTRIES).length === 0) _loadedFromDir = false;
  refreshCountryBar();
  refreshInternationalVisibility();
  refreshStatus();
  dashDirty = true;
  if (activeCountry) setActiveCountry(activeCountry);
}

function refreshStatus() {
  const g = document.getElementById("fsg");
  const hm = document.getElementById("hm");
  if (!activeCountry) {
    g.innerHTML =
      '<div class="lm" style="padding:1rem 0">No country data loaded.</div>';
    hm.innerHTML = "";
    return;
  }
  const db = getDB(activeCountry);
  const meta = countryMeta(activeCountry);
  let h = `<div style="font-size:.78rem;color:var(--t3);margin-bottom:.6rem;text-transform:uppercase;letter-spacing:.05em">Showing: ${meta.flag} ${meta.label}</div>`;
  let bh = "";
  for (const k of ["dnssec", "https", "headers", "source", "llm"]) {
    const d = db[k];
    const ld = d !== null;
    h += `<div class="fsc"><div class="ind ${ld ? "y" : "n"}">${ld ? "&#10003;" : "&#8212;"}</div>
      <div class="inf"><div class="nm">${FR[k]}</div><div class="dt2">${ld ? d.length + " rows" : "Not loaded"}</div></div>
      ${ld ? `<button class="rm" onclick="clearDS('${k}')">Remove</button>` : ""}</div>`;
    bh += `<span class="bdg ${ld ? "ok" : "no"}">${FR[k]}: ${ld ? "Loaded" : "Missing"}</span>`;
  }
  g.innerHTML = h;
  hm.innerHTML = bh;
}

function clearDS(k) {
  if (!activeCountry) return;
  getDB(activeCountry)[k] = null;
  refreshStatus();
  dashDirty = true;
}
