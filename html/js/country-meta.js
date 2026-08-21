// ============================================================================
// Country metadata: KNOWN_COUNTRIES, continent map, flag helper, toggleDd
// ============================================================================

// Flag helper: renders a small flag image via flagcdn.com (works on all OSes)
function flagImg(cc, size) {
  const s = size || 20;
  return `<img src="https://flagcdn.com/w${s}/${cc.toLowerCase()}.png" width="${s}" height="${Math.round(s * 0.67)}" alt="${cc.toUpperCase()}" style="border-radius:2px;vertical-align:middle;display:inline-block;object-fit:cover">`;
}

const KNOWN_COUNTRIES = {
  no: { label: "Norway", nuts_col: "NUTS2" },
  pt: { label: "Portugal", nuts_col: "NUTS2" },
  ie: { label: "Ireland", nuts_col: "NUTS2" },
  es: { label: "Spain", nuts_col: "NUTS2" },
  fr: { label: "France", nuts_col: "NUTS2" },
  de: { label: "Germany", nuts_col: "NUTS2" },
  it: { label: "Italy", nuts_col: "NUTS2" },
  pl: { label: "Poland", nuts_col: "NUTS2" },
  nl: { label: "Netherlands", nuts_col: "NUTS2" },
  be: { label: "Belgium", nuts_col: "NUTS2" },
  se: { label: "Sweden", nuts_col: "NUTS2" },
  dk: { label: "Denmark", nuts_col: "NUTS2" },
  fi: { label: "Finland", nuts_col: "NUTS2" },
  at: { label: "Austria", nuts_col: "NUTS2" },
  gr: { label: "Greece", nuts_col: "NUTS2" },
  cz: { label: "Czechia", nuts_col: "NUTS2" },
  ro: { label: "Romania", nuts_col: "NUTS2" },
  hu: { label: "Hungary", nuts_col: "NUTS2" },
  sk: { label: "Slovakia", nuts_col: "NUTS2" },
  hr: { label: "Croatia", nuts_col: "NUTS2" },
};

// SVG icons for the continent selector
const SVG_GLOBE = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" style="vertical-align:middle;flex-shrink:0"><circle cx="7.5" cy="7.5" r="6.2" stroke="currentColor" stroke-width="1.2"/><path d="M7.5 1.3 C5.8 3.8 5.8 11.2 7.5 13.7 C9.2 11.2 9.2 3.8 7.5 1.3Z" stroke="currentColor" stroke-width="1" fill="none"/><path d="M1.3 7.5 C3.8 6.5 11.2 6.5 13.7 7.5" stroke="currentColor" stroke-width="1" fill="none"/><path d="M2.2 4.5 C4.8 3.7 10.2 3.7 12.8 4.5" stroke="currentColor" stroke-width="0.8" fill="none"/><path d="M2.2 10.5 C4.8 11.3 10.2 11.3 12.8 10.5" stroke="currentColor" stroke-width="0.8" fill="none"/></svg>`;

// Europe silhouette — 37 coastal points mapped from real WGS84 coords into a 100×80 viewBox
// x = (lon_deg + 12) * 1.754   y = (72 - lat_deg) * 2.105
const SVG_EU = `<svg width="16" height="13" viewBox="0 0 100 80" style="vertical-align:middle;flex-shrink:0"><path fill="currentColor" d="M5,74 L7,76 L17,74 L25,64 L31,60 L37,58 L42,64 L46,66 L49,72 L53,66 L46,56 L53,62 L55,65 L58,70 L61,75 L64,66 L72,65 L71,59 L75,54 L80,45 L78,35 L72,25 L70,15 L68,3 L67,2 L47,2 L30,25 L31,28 L37,32 L39,36 L30,40 L25,44 L18,47 L13,50 L18,60 L6,61 L5,68 Z"/></svg>`;

const CONTINENT_MAP = {
  eu: {
    label: "Europe",
    svg: SVG_EU,
    countries: ["no","pt","ie","es","fr","de","it","pl","nl","be","se","dk","fi","at","gr","cz","ro","hu","sk","hr"],
  },
};

function getContinent(cc) {
  for (const [k, v] of Object.entries(CONTINENT_MAP)) {
    if (v.countries.includes(cc)) return k;
  }
  return "other";
}

function toggleDd(ddId) {
  const dd = document.getElementById(ddId);
  const panel = dd.querySelector(".dd-panel");
  const btn = dd.querySelector(".dd-btn");
  const isOpen = panel.classList.contains("open");
  document.querySelectorAll(".dd-panel").forEach((p) => p.classList.remove("open"));
  document.querySelectorAll(".dd-btn").forEach((b) => b.classList.remove("open"));
  if (!isOpen) {
    panel.classList.add("open");
    btn.classList.add("open");
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".cbar-dd")) {
    document.querySelectorAll(".dd-panel").forEach((p) => p.classList.remove("open"));
    document.querySelectorAll(".dd-btn").forEach((b) => b.classList.remove("open"));
  }
});

function countryMeta(cc) {
  const known = KNOWN_COUNTRIES[cc];
  return {
    label: known ? known.label : cc.toUpperCase(),
    flag: flagImg(cc),
    nuts_col: known ? known.nuts_col : "NUTS2",
  };
}
