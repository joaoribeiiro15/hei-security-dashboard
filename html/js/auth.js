// ============================================================================
// Authentication: verify the simulated JWT minted by /login before letting
// the app run. If anything is wrong we bounce back to /login and stop.
// ============================================================================
const SESSION_KEY = "hei_auth";
const TOY_SECRET = "CHANGE_ME"; // Must match TOY_SECRET in .env
let AUTH = null; // populated by restoreSession() - { sub, role, country, displayName }

// HMAC-SHA256 token verification (mirrors server.py _toy_sign)
async function _verifyTokenAsync(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [hdr, pld, sig] = parts;

    const keyData = new TextEncoder().encode(TOY_SECRET);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    function b64urlToBytes(s) {
      const pad =
        s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
      const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    }

    const sigBytes = b64urlToBytes(sig);
    const msgBytes = new TextEncoder().encode(hdr + "." + pld);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      msgBytes,
    );
    if (!valid) return null;

    const pad =
      pld.length % 4 === 2 ? "==" : pld.length % 4 === 3 ? "=" : "";
    const payloadJson = decodeURIComponent(
      escape(atob((pld + pad).replace(/-/g, "+").replace(/_/g, "/"))),
    );
    const payload = JSON.parse(payloadJson);
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.sub || !payload.role) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (_) {}
  window.location.href = "/login";
}

// ============================================================================
// Role-based access control: which scopes each role may access
// ============================================================================
const SCOPE_ROLES = {
  global: [
    "national",
    "regional",
    "international",
    "_upload",
    "_report",
  ],
  regional: ["national", "regional", "institution", "international"],
};

function applyTabVisibility() {
  if (!AUTH) return;
  const allowed = new Set(SCOPE_ROLES[AUTH.role] || []);
  const btnData = document.getElementById("btn-data");
  const btnReport = document.getElementById("btn-report");
  if (btnData)
    btnData.style.display = allowed.has("_upload") ? "" : "none";
  if (btnReport)
    btnReport.style.display = allowed.has("_report") ? "" : "none";
  // Show/hide Institution tab based on role
  document.querySelectorAll(".scope-btn").forEach((btn) => {
    const sc = btn.dataset.scope;
    if (sc && sc !== "international" && sc !== "institution") return;
    if (sc === "institution")
      btn.style.display = allowed.has("institution") ? "" : "none";
  });
  document.body.classList.remove("role-global", "role-regional");
  document.body.classList.add("role-" + AUTH.role);
}

function refreshInternationalVisibility() {
  const btn = document.getElementById("scope-intl");
  if (!btn) return;
  const visible = Object.keys(COUNTRIES).length >= 2;
  btn.style.display = visible ? "" : "none";
  if (!visible && activeScope === "international")
    navigate("national", "global");
}

// Re-interprets a mojibake string (UTF-8 bytes decoded as Latin-1) as UTF-8.
// Returns the original string unchanged when it is already correct Unicode
// or not decodable as UTF-8 (so the function is safe to call unconditionally).
function _fixMojibake(str) {
  if (!str) return str;
  try {
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 255) return str; // genuine high-plane char, not mojibake
    }
    const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return str;
  }
}

function renderUserChip() {
  if (!AUTH) return;
  const chip = document.getElementById("user-chip");
  const avatar = document.getElementById("uc-avatar");
  const uname = document.getElementById("uc-name");
  const urole = document.getElementById("uc-role");
  const lo = document.getElementById("uc-logout");
  if (!chip) return;
  chip.style.display = "";
  avatar.textContent = (AUTH.sub || "?").charAt(0).toUpperCase();
  uname.textContent = AUTH.sub;
  const roleLabel = AUTH.role === "regional" && AUTH.displayName
    ? _fixMojibake(AUTH.displayName).replace(/\s*\bAdmin\b\s*$/i, "").trim()
    : ({ global: "Global Admin", regional: "Regional Admin" }[AUTH.role] || AUTH.role);
  urole.textContent = roleLabel;
  lo.onclick = logout;
}

// ============================================================================
// Auto-load from the server's data/ directory (GET /data)
// ============================================================================
async function _autoLoadDataDir() {
  const urEl = document.getElementById("ur");

  // 1. Fetch manifest [{name, size}, ...]
  let manifest;
  try {
    const resp = await fetch("/data", { method: "GET" });
    if (!resp.ok) throw new Error("Server returned " + resp.status);
    manifest = await resp.json();
  } catch (err) {
    console.warn("[autoLoad] GET /data failed:", err);
    if (urEl)
      urEl.innerHTML =
        '<div style="color:var(--amber);font-size:.82rem;padding:.5rem 0">Server auto-load unavailable (' +
        err.message + "). Manual upload still works.</div>";
    return;
  }

  if (!Array.isArray(manifest) || manifest.length === 0) {
    if (urEl)
      urEl.innerHTML =
        '<div style="color:var(--t3);font-size:.82rem;padding:.5rem 0">No pre-loaded files on the server. ' +
        'Upload CSVs manually or drop them into <code style="background:var(--card2);padding:.1rem .35rem;border-radius:4px">data/</code> on the host.</div>';
    return;
  }

  const total = manifest.length;
  let loaded = 0;
  let errored = 0;

  const progressHtml = () =>
    '<div style="color:var(--t2);font-size:.82rem;padding:.4rem 0">Loading server data: ' +
    loaded + " / " + total + " files" +
    (errored ? ' <span style="color:var(--amber)">(' + errored + " errors)</span>" : "") +
    "</div>";

  if (urEl) urEl.innerHTML = progressHtml();

  // 2. Fetch and process each file sequentially
  for (const item of manifest) {
    let result;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 60000);
      const resp = await fetch("/file?name=" + encodeURIComponent(item.name),
                               { method: "GET", signal: controller.signal });
      clearTimeout(tid);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      result = await resp.json();
    } catch (err) {
      errored++;
      result = { name: item.name, text: "", error: err.message };
    }

    // _append accumulates badges; _skipBuild defers chart rendering to end
    _processReadResults([result], { fromServer: true, _append: true, _skipBuild: true });
    loaded++;

    // Update progress line (always the firstChild of urEl)
    if (urEl && loaded < total) {
      const first = urEl.firstChild;
      if (first) first.outerHTML = progressHtml();
    }
  }

  // Remove progress line when done
  if (urEl && urEl.firstChild &&
      (urEl.firstChild.textContent || "").startsWith("Loading server data")) {
    urEl.firstChild.remove();
  }
}

// Hides the floating "Loading data..." overlay shown during the initial
// server data fetch. Uses a fade (via the .hide class) rather than yanking
// display:none immediately, matching the .ai-modal-overlay fade convention.
function _hideLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.classList.add("hide");
  if (window._loadingDotsTimer) {
    clearInterval(window._loadingDotsTimer);
    window._loadingDotsTimer = null;
  }
}

// ============================================================================
// Activate an authenticated session: render chip, restrict tabs, filter the
// country bar to the user's own country (non-admin), pull data from /data.
// ============================================================================
function activateSession() {
  renderUserChip();
  applyTabVisibility();
  // Regional accounts land on Institution; global admins land on National
  navigate(AUTH.role === "global" ? "national" : "institution", "global");
  // Pull pre-loaded data from the server, then prune countries for non-admin users
  _autoLoadDataDir().then(() => {
    if (AUTH.role !== "global" && AUTH.country) {
      Object.keys(COUNTRIES).forEach((cc) => {
        if (cc !== AUTH.country) delete COUNTRIES[cc];
      });
      if (activeCountry !== AUTH.country) {
        activeCountry = COUNTRIES[AUTH.country] ? AUTH.country : null;
        if (activeCountry) activeContinent = getContinent(activeCountry);
      }
      refreshCountryBar();
      refreshStatus();
    }
    refreshInternationalVisibility();
    renderSnapshotBar();
    if (activeScope !== "_upload" && activeScope !== "_report") {
      buildCurrent();
      dashDirty = false;
    }
    // Only reveal the dataset status chips once loading has fully settled —
    // showing them mid-load flashes "Missing" for scanners whose file just
    // hasn't been fetched yet, which reads as a broken/incomplete load.
    const hm = document.getElementById("hm");
    if (hm) hm.style.display = "";
    _hideLoadingOverlay();
  });
}

async function restoreSession() {
  let token = null;
  try {
    token = sessionStorage.getItem(SESSION_KEY);
  } catch (_) {}
  const payload = await _verifyTokenAsync(token);
  if (!payload) {
    window.location.href = "/login";
    return false;
  }
  AUTH = payload;
  return true;
}
