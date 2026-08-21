// ============================================================================
// Institution chart-only builders (single-institution view)
// ============================================================================

// Helper: score colour for a numeric score 0-100
function _scoreColor(v) {
  return v >= 70
    ? _cssVar("--status-good", "#10b981")
    : v >= 40
      ? _cssVar("--status-warn", "#f59e0b")
      : _cssVar("--status-bad", "#ef4444");
}

// Render a horizontal gauge bar for a single score value
function _instScoreGauge(targetId, score, label, prevScore) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const v = parseFloat(score) || 0;
  const grade = _compGrade(v);
  const col = _scoreColor(v);
  const delta = (prevScore != null && !isNaN(parseFloat(prevScore))) ? renderDeltaPill(v, parseFloat(prevScore)) : "";
  el.innerHTML = `
    <div style="background:var(--card2);border:1px solid var(--bdr);border-radius:10px;padding:1.1rem 1.4rem;display:flex;align-items:center;gap:1.2rem">
      <div style="font-size:2.6rem;font-weight:800;color:${col};min-width:4rem;text-align:center">${grade}</div>
      <div style="flex:1">
        <div style="font-size:.82rem;color:var(--t3);margin-bottom:.35rem">${label}</div>
        <div style="background:var(--card);border-radius:6px;height:10px;overflow:hidden">
          <div style="width:${v}%;height:100%;background:${col};border-radius:6px;transition:width .5s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.3rem">
          <span style="font-size:.78rem;color:var(--t3)">${v.toFixed(1)} / 100</span>
          ${delta}
        </div>
      </div>
    </div>`;
}

// Render a feature checklist for the own institution
function _instCheckList(targetId, row, fields, labels, colours) {
  const el = document.getElementById(targetId);
  if (!el || !row) return;
  const items = fields.map((f, i) => {
    const val = row[f];
    const ok = val === true || val === "true" || val === "1" || val === 1 || val === "True";
    return `<div style="display:flex;align-items:center;gap:.55rem;padding:.3rem 0;border-bottom:1px solid var(--bdr)">
      <span style="width:.7rem;height:.7rem;border-radius:50%;background:${ok ? (colours[i] || "#10b981") : "var(--t3)"};flex-shrink:0"></span>
      <span style="font-size:.82rem;color:${ok ? "var(--t1)" : "var(--t3)"}">${labels[i]}</span>
      <span style="margin-left:auto;font-size:.78rem;color:${ok ? "#10b981" : "#ef4444"}">${ok ? "✓" : "✗"}</span>
    </div>`;
  }).join("");
  el.innerHTML = `<div style="background:var(--card2);border:1px solid var(--bdr);border-radius:10px;padding:.9rem 1.1rem">${items}</div>`;
}

// Boolean field normaliser (CSV stores "True"/"False" strings)
function _isTrue(v) { return v === true || v === "true" || v === "True" || v === 1 || v === "1"; }
// Grade color span using the global GC palette
function _gc(g) { const c = GC[g]; return c ? '<span style="color:'+c+';font-weight:700">'+g+'</span>' : (g || '—'); }
// Yes/No colored span
function _yn(v) { return v ? '<span style="color:#10b981;font-weight:600">Yes</span>' : '<span style="color:#ef4444;font-weight:600">No</span>'; }

// Build one audit test card
function _auditCard(state, title, desc, techLines) {
  const icon = state === "pass" ? "✓" : state === "warn" ? "!" : "✗";
  const tech = techLines && techLines.filter(Boolean).length
    ? `<div class="audit-tech-label">Technical details:</div><div class="audit-tech">${techLines.filter(Boolean).join("\n")}</div>`
    : "";
  let aiRec = "";
  if (state !== "pass") {
    const f = _findLlmFinding(title);
    if (f && (f.reason || f.recommendation)) {
      const label = f.reason ? "AI Recommendation" : "Recommendation";
      aiRec = `<div class="audit-ai-rec">
        <span class="audit-ai-icon">🤖</span>
        <div class="audit-ai-body">
          <div class="audit-ai-label">${label}</div>
          <div class="audit-ai-reason">${f.reason || ""}</div>
          <div class="audit-ai-fix">${(f.recommendation || "").replace(/^💡\s*/, "")}</div>
        </div>
      </div>`;
    }
  }
  return `<div class="audit-test ${state}">
    <div class="audit-test-head"><span class="audit-icon">${icon}</span><span class="audit-test-title">${title}</span></div>
    <div class="audit-test-desc">${desc}</div>${tech}${aiRec}</div>`;
}

// Section divider (line only)
function _auditSec(label) {
  return `<div class="audit-section-hdr"></div>`;
}

// Protocol group: title + description above, cards grid below
function _auditGroup(name, desc, cardsHtml) {
  return `<div class="audit-proto-row">
    <div class="audit-proto-left"><div class="ap-name">${name}</div><div class="ap-desc">${desc}</div></div>
    <div class="audit-cards-grid">${cardsHtml}</div>
  </div>`;
}

// ── Shared Institution audit renderer ────────────────────────────────────
// Returns { scoresHtml, contentHtml } — usable by bInstGlobal() and openHeiDetail()
function _buildInstGlobalHtml(r_ht, r_dn, r_hd, r_htB, r_dnB, r_hdB) {
  const _glbHeiId = (r_ht || r_dn || r_hd || {}).ID || "";
  _setCurrentLlmFindings(_glbHeiId);
  // KPI score cards
  let scoresHtml = "";
  if (r_ht) { const d = renderDeltaPill(r_ht.final_score, r_htB ? r_htB.final_score : null); scoresHtml += sCard("HTTPS / TLS", "Grade " + _gc(r_ht.grade), parseFloat(r_ht.final_score || 0).toFixed(1) + (d ? " " + d : "")); }
  if (r_dn) { const d = renderDeltaPill(r_dn.score, r_dnB ? r_dnB.score : null); const _ds = r_dn.dnssec_status || "—"; const _dsc = _ds === "Valid" ? "#10b981" : _ds === "Missing" ? "#ef4444" : _ds !== "—" ? "#f59e0b" : ""; const _dsh = _dsc ? `<span style="color:${_dsc};font-weight:600">${_ds}</span>` : _ds; scoresHtml += sCard("DNSSEC", "Grade " + _gc(r_dn.grade), parseFloat(r_dn.score || 0).toFixed(1) + " · " + _dsh + (d ? " " + d : "")); }
  if (r_hd) { const d = renderDeltaPill(r_hd.final_score, r_hdB ? r_hdB.final_score : null); scoresHtml += sCard("Sec. Headers", "Grade " + _gc(r_hd.grade), parseFloat(r_hd.final_score || 0).toFixed(1) + (d ? " " + d : "")); }
  if (!scoresHtml) scoresHtml = '<div class="lm">No score data available.</div>';

  let out = "";
  const ipVal = r_ht ? (r_ht.ip || "") : "";

  // ── CONNECTION SECURITY ──────────────────────────────────────────────────
  if (r_ht) {
    out += _auditSec("CONNECTION SECURITY");

    const hasHttps = _isTrue(r_ht.TLS1_2) || _isTrue(r_ht.TLS1_3) || _isTrue(r_ht.TLS1_1) || _isTrue(r_ht.TLS1);
    const httpsStatus = r_ht.http_status_code || "";
    const hasRedir = r_hd ? _isTrue(r_hd.redirected_to_https) : null;
    const hasSameDom = r_hd ? _isTrue(r_hd.redirected_https_to_same_domain) : null;
    const redirCard = hasRedir !== null
      ? _auditCard(hasRedir ? "pass" : "fail",
          "HTTPS Redirect",
          "Verifies that the domain automatically redirects HTTP traffic to HTTPS via a 3xx response code. " + (hasRedir ? "Traffic is correctly redirected." : "Traffic is not redirected to HTTPS."),
          [
            r_hd.http_status_code ? "HTTP Status: " + r_hd.http_status_code : null,
            r_hd.https_status_code ? "HTTPS Status: " + r_hd.https_status_code : null,
            hasSameDom !== null ? "Same domain: " + (hasSameDom ? "Yes" : "No") : null,
            r_hd.redirect_count != null ? "Redirect count: " + r_hd.redirect_count : null,
          ])
      : "";
    out += _auditGroup("HTTP/S",
      "HTTPS (<em>Hyper Text Transfer Protocol Secure</em>) adds an encryption layer on top of HTTP. Enabling HTTPS at the domain level prevents communication between the browser and the web server from being intercepted or tampered with by third parties.",
      _auditCard(hasHttps ? "pass" : "fail",
        "HTTPS Connection",
        hasHttps
          ? "The server offers a TLS-secured HTTPS endpoint and accepted the connection."
          : "No TLS protocol support was detected — the server may not be running HTTPS.",
        [
          ipVal ? "Server IP: " + ipVal : null,
          r_ht.certificate_authority ? "Issuer: " + r_ht.certificate_authority : null,
          httpsStatus ? "HTTPS response: " + httpsStatus : null,
          r_ht.banner_server ? "Server: " + r_ht.banner_server : null,
        ]) +
      redirCard);

    // HSTS group
    const hasHsts = r_hd ? _isTrue(r_hd["strict-transport-security_presence"]) : false;
    const hstsVal = r_hd ? (r_hd["strict-transport-security_config"] || "") : "";
    out += _auditGroup("HSTS",
      "HSTS (<em>HTTP Strict-Transport-Security</em>) is a response header that instructs browsers to access the domain exclusively via HTTPS, preventing downgrade attacks and connection interception. A <em>max-age</em> of at least 6 months is required.",
      _auditCard(hasHsts ? "pass" : "fail",
        "HSTS Support",
        "Verifies that the domain has HSTS correctly implemented with a <em>max-age</em> value greater than 6 months. " + (hasHsts ? "HSTS is active." : "The domain does not support HSTS."),
        hasHsts ? ["HSTS Header: " + hstsVal] : ["HSTS Header: Not Found"]));

    // TLS Versions group
    const hasSSLv2 = _isTrue(r_ht.SSLv2), hasSSLv3 = _isTrue(r_ht.SSLv3);
    const hasTLS1 = _isTrue(r_ht.TLS1), hasTLS11 = _isTrue(r_ht.TLS1_1);
    const hasTLS12 = _isTrue(r_ht.TLS1_2), hasTLS13 = _isTrue(r_ht.TLS1_3);
    const insecureActive = hasSSLv2 || hasSSLv3 || hasTLS1 || hasTLS11;
    out += _auditGroup("TLS Protocol Versions",
      "TLS (<em>Transport Layer Security</em>) is the cryptographic protocol that secures HTTPS connections. Legacy versions (SSLv2, SSLv3, TLS 1.0, TLS 1.1) contain known vulnerabilities and must be disabled. TLS 1.2 and TLS 1.3 are the currently recommended versions.",
      _auditCard(insecureActive ? "fail" : "pass",
        "Legacy protocols disabled (SSLv2, SSLv3, TLS 1.0, TLS 1.1)",
        "Verifies that outdated and insecure protocol versions are not offered by the server. " + (insecureActive ? "One or more insecure protocols are active." : "No legacy protocols are active."),
        [
          "SSLv2: " + (hasSSLv2 ? "⚠ Active" : "OK — Not offered"),
          "SSLv3: " + (hasSSLv3 ? "⚠ Active" : "OK — Not offered"),
          "TLS 1.0: " + (hasTLS1 ? "⚠ Active" : "OK — Not offered"),
          "TLS 1.1: " + (hasTLS11 ? "⚠ Active" : "OK — Not offered"),
        ]) +
      _auditCard(hasTLS13 ? "pass" : (hasTLS12 ? "warn" : "fail"),
        "TLS 1.3 Support",
        "TLS 1.3 is the most recent and secure version of the TLS protocol, featuring improved performance and removal of obsolete ciphers. " + (hasTLS13 ? "The server supports TLS 1.3." : hasTLS12 ? "The server supports TLS 1.2 but not TLS 1.3 (recommended)." : "The server supports neither TLS 1.2 nor TLS 1.3."),
        [
          "TLS 1.2: " + (hasTLS12 ? "Supported" : "Not supported"),
          "TLS 1.3: " + (hasTLS13 ? "Supported" : "Not supported"),
          _isTrue(r_ht.ALPN_HTTP2) ? "HTTP/2 (ALPN): Supported" : "HTTP/2 (ALPN): Not supported",
        ]));

    // Digital Certificate group
    const validCert = _isTrue(r_ht.valid_certificate);
    const hasCT = _isTrue(r_ht.certificate_transparency);
    const hasCaa = _isTrue(r_ht.dns_caa);
    const hasOcsp = _isTrue(r_ht.ocsp_stapling);
    out += _auditGroup("Digital Certificate",
      "The digital certificate is issued by a Certificate Authority (CA) and ensures the authenticity and integrity of the HTTPS connection. A valid certificate with a strong algorithm, issued by a trusted CA, is essential for secure communication.",
      _auditCard(validCert ? "pass" : "warn",
        "Certificate Validation",
        validCert
          ? "The certificate passed all scanner validation checks and is trusted by browsers."
          : "The scanner did not fully validate this certificate (valid_certificate: False). This may reflect SNI-mandatory trust, an incomplete chain, or an expired certificate. Review the raw scan data.",
        [
          r_ht.certificate_authority ? "Issuer: " + r_ht.certificate_authority : null,
          r_ht.certificate_signature_algorithm ? "Algorithm: " + r_ht.certificate_signature_algorithm : null,
          r_ht.key_size ? "Key size: " + r_ht.key_size : null,
          ipVal ? "IP: " + ipVal : null,
          r_ht.banner_server ? "Server: " + r_ht.banner_server : null,
        ]) +
      _auditCard(hasCT ? "pass" : "warn",
        "Certificate Transparency (CT)",
        "Certificate Transparency is a public audit mechanism that logs all issued certificates, enabling detection of fraudulent or mis-issued certificates. " + (hasCT ? "The certificate is logged in a CT log." : "No CT log proof found."),
        [hasCT ? "CT: Present" : "CT: Not found"]) +
      _auditCard(hasCaa ? "pass" : "warn",
        "DNS CAA (Certificate Authority Authorization)",
        "A CAA DNS record specifies which Certificate Authorities are allowed to issue certificates for the domain, reducing the risk of fraudulent issuance. " + (hasCaa ? "A CAA record is configured." : "No CAA record found in DNS."),
        [hasCaa ? "DNS CAA: Configured" : "DNS CAA: Not configured"]) +
      _auditCard(hasOcsp ? "pass" : "warn",
        "OCSP Stapling",
        "OCSP Stapling allows the server to include a signed certificate revocation status in the TLS handshake, improving performance and privacy. " + (hasOcsp ? "OCSP Stapling is active." : "OCSP Stapling is not active."),
        [hasOcsp ? "OCSP Stapling: Active" : "OCSP Stapling: Not active"]));
  }

  // ── DNS SECURITY ─────────────────────────────────────────────────────────
  if (r_dn) {
    out += _auditSec("DNS SECURITY");

    const dnssecValid = r_dn.dnssec_status === "Valid";
    const dnssecMissing = r_dn.dnssec_status === "Missing";
    const algos = r_dn.algorithms && r_dn.algorithms !== "[]" ? r_dn.algorithms.replace(/[\[\]'\"]/g, "") : null;
    const digests = r_dn.digest_algorithms && r_dn.digest_algorithms !== "[]" ? r_dn.digest_algorithms.replace(/[\[\]'\"]/g, "") : null;
    const nipm = r_dn.non_existence_proof_method && r_dn.non_existence_proof_method !== "Missing" ? r_dn.non_existence_proof_method : null;

    out += _auditGroup("DNSSEC",
      "DNSSEC (<em>Domain Name System Security Extensions</em>) adds cryptographic signatures to DNS responses, protecting against DNS cache poisoning and malicious redirection. Zone signing must be correctly configured and delegated up to the parent zone.",
      _auditCard(dnssecValid ? "pass" : dnssecMissing ? "fail" : "warn",
        "DNSSEC Deployment",
        "Verifies that DNSSEC is active and correctly configured for the domain. " + (dnssecValid ? "DNSSEC is active and valid." : dnssecMissing ? "DNSSEC is not configured for this domain." : "DNSSEC is present but configuration is incomplete."),
        [
          "Status: " + (r_dn.dnssec_status || "Unknown"),
          r_dn.Url || r_dn.url ? "Domain: " + (r_dn.Url || r_dn.url) : null,
          algos ? "Signing algorithms: " + algos : null,
          digests ? "Digest algorithms: " + digests : null,
          nipm ? "Non-existence proof: " + nipm : null,
        ]) +
      (dnssecValid ? _auditCard(
        algos && (algos.includes("ECDSA") || algos.includes("RSA/SHA-256") || algos.includes("RSA/SHA-512")) ? "pass" : "warn",
        "DNSSEC Signing Algorithms",
        "The algorithms used to sign DNS zones determine the cryptographic strength of DNSSEC. ECDSA P-256 (Algorithm 13) or RSA/SHA-256 (Algorithm 8) or higher are recommended (RFC 8624).",
        [algos ? "Algorithms: " + algos : "Algorithms: Not available", digests ? "Digest: " + digests : null]) : ""));
  }

  // ── HTTP SECURITY HEADERS ────────────────────────────────────────────────
  if (r_hd) {
    out += _auditSec("HTTP SECURITY HEADERS");

    const hFmt = (presence, config, name) => {
      const ok = _isTrue(presence);
      const val = config && config !== "Missing" ? config : null;
      return _auditCard(ok ? "pass" : "fail", name,
        _HEADER_DESC[name] || ("Verifies that the <strong>" + name + "</strong> header is present and correctly configured."),
        ok ? (val ? [name + ": " + val] : [name + ": Present"]) : [name + ": Not Found"]);
    };

    const hasRedir = _isTrue(r_hd.redirected_to_https);
    const hasSameDomain = _isTrue(r_hd.redirected_https_to_same_domain);
    out += _auditGroup("HTTPS Redirect",
      "Verifies that the domain correctly redirects HTTP traffic to HTTPS, and that the redirect stays on the same domain. The redirect behaviour directly affects the HTTPS and redirect component scores.",
      _auditCard(hasRedir ? "pass" : "fail",
        "Redirect to HTTPS",
        hasRedir ? "The domain correctly redirects HTTP connections to HTTPS." : "The domain does not redirect HTTP connections to HTTPS.",
        [
          "HTTP Status: " + (r_hd.http_status_code || "N/A"),
          "HTTPS Status: " + (r_hd.https_status_code || "N/A"),
          r_hd.redirect_count != null ? "Redirect count: " + r_hd.redirect_count : null,
          r_hd.final_url ? "Final URL: " + r_hd.final_url : null,
          "Same domain: " + (hasSameDomain ? "Yes" : "No"),
          r_hd.protocol_http ? "HTTP protocol: " + r_hd.protocol_http : null,
        ]));

    out += _auditGroup("Transport Security Headers",
      "Response headers that enforce secure transport and protect against downgrade attacks. <em>Strict-Transport-Security</em> (HSTS) is the primary transport security header.",
      hFmt(r_hd["strict-transport-security_presence"], r_hd["strict-transport-security_config"], "Strict-Transport-Security"));

    out += _auditGroup("Framing & Content Protection",
      "Headers that prevent the page from being embedded in frames on other origins (<em>clickjacking</em>), restrict MIME-type interpretation, and control referrer information sent to third parties.",
      hFmt(r_hd["x-frame-options_presence"], r_hd["x-frame-options_config"], "X-Frame-Options") +
      hFmt(r_hd["x-content-type-options_presence"], r_hd["x-content-type-options_config"], "X-Content-Type-Options") +
      hFmt(r_hd["referrer-policy_presence"], r_hd["referrer-policy_config"], "Referrer-Policy"));

    out += _auditGroup("Content Security Policy",
      "<em>Content-Security-Policy</em> (CSP) defines which sources are authorised to load resources (scripts, styles, images). It is the primary defence against Cross-Site Scripting (XSS) and content injection attacks.",
      hFmt(r_hd["content-security-policy_presence"], r_hd["content-security-policy_config"], "Content-Security-Policy"));

    out += _auditGroup("Cross-Origin Isolation",
      "Cross-Origin headers isolate the browsing context and resources from other origins, enabling advanced browser security features and preventing cross-origin data leaks.",
      hFmt(r_hd["cross-origin-opener-policy_presence"], r_hd["cross-origin-opener-policy_config"], "Cross-Origin-Opener-Policy") +
      hFmt(r_hd["cross-origin-embedder-policy_presence"], r_hd["cross-origin-embedder-policy_config"], "Cross-Origin-Embedder-Policy") +
      hFmt(r_hd["cross-origin-resource-policy_presence"], r_hd["cross-origin-resource-policy_config"], "Cross-Origin-Resource-Policy"));

    out += _auditGroup("Legacy & Access Control",
      "<em>X-XSS-Protection</em> was a legacy browser filter now removed from modern browsers (recommended value: <code>0</code>). <em>Access-Control-Allow-Origin</em> controls cross-origin resource access via CORS and must be configured carefully.",
      hFmt(r_hd["x-xss-protection_presence"], r_hd["x-xss-protection_config"], "X-XSS-Protection") +
      (() => {
        const pres = r_hd["access-control-allow-origin_presence"];
        const cfg  = r_hd["access-control-allow-origin_config"] || "";
        const present = _isTrue(pres);
        const wildcard = present && cfg.includes("*");
        const state = !present ? "warn" : (wildcard ? "fail" : "pass");
        return _auditCard(state, "Access-Control-Allow-Origin",
          _HEADER_DESC["Access-Control-Allow-Origin"] || "Part of the CORS mechanism — controls which origins can access this site's resources.",
          present ? ["Access-Control-Allow-Origin: " + cfg] : ["Access-Control-Allow-Origin: Not configured"]);
      })());
  }

  _currentLlmFindings = [];
  return { scoresHtml, contentHtml: out || '<div class="lm">No data available.</div>' };
}

function bInstGlobal(dn, ht, hd, htB, dnB, hdB) {
  const es = document.getElementById("io-s"), ec = document.getElementById("io-c"), er = document.getElementById("io-rank");
  if (!es) return;
  const r_ht = ht && ht[0], r_dn = dn && dn[0], r_hd = hd && hd[0];
  const r_htB = htB && htB[0], r_dnB = dnB && dnB[0], r_hdB = hdB && hdB[0];
  const { scoresHtml, contentHtml } = _buildInstGlobalHtml(r_ht, r_dn, r_hd, r_htB, r_dnB, r_hdB);
  es.innerHTML = scoresHtml;

  // Final Score card (same formula as modal and table)
  if (er) {
    const fakeRow = {
      hs_: r_ht ? r_ht.final_score : undefined,
      shs: r_hd ? r_hd.final_score : undefined,
      ds:  r_dn ? r_dn.score       : undefined,
    };
    const comp = compositeScore(fakeRow);
    const grade = _compGrade(comp);
    const gradeColor = GC[grade] || "var(--cyan)";
    const compStr = isNaN(comp) ? "—" : comp.toFixed(1);
    er.innerHTML = isNaN(comp) ? "" : `
<div class="hei-detail-ranks" style="margin-bottom:.5rem">
  <div class="hei-detail-rank-card">
    <div class="hei-detail-rank-val" style="color:${gradeColor}">Grade ${grade}</div>
    <div class="hei-detail-rank-sub">Final Score: ${compStr}/100 · HTTPS 80% + DNSSEC 20%</div>
  </div>
</div>`;
  }

  if (!ec) return;
  ec.innerHTML = contentHtml;
}

// Per-header English descriptions for the audit report
const _HEADER_DESC = {
  "Strict-Transport-Security": "The HSTS header instructs browsers to always access the domain via HTTPS, even if the user types plain HTTP. It protects against downgrade attacks and connection interception.",
  "X-Frame-Options": "Prevents the page from being loaded inside a <em>frame</em> or <em>iframe</em> from another origin, protecting against <em>clickjacking</em> attacks.",
  "X-Content-Type-Options": "With the value <em>nosniff</em>, prevents browsers from interpreting files with a MIME type different from the declared one, mitigating <em>MIME sniffing</em> attacks.",
  "Content-Security-Policy": "Defines which sources are authorised to load resources (scripts, styles, images). It is the primary defence against Cross-Site Scripting (XSS) and content injection attacks.",
  "Referrer-Policy": "Controls the information sent in the <em>Referer</em> field when a user navigates between pages, protecting user privacy and preventing leakage of internal URLs.",
  "Cross-Origin-Opener-Policy": "Isolates the browsing context, preventing pages from other origins from accessing the <em>window</em> object and enabling advanced browser security features.",
  "Cross-Origin-Embedder-Policy": "Requires all resources loaded by the page to explicitly opt into cross-origin sharing, needed to activate cross-origin isolation for performance APIs.",
  "Cross-Origin-Resource-Policy": "Prevents other domains from including the page's resources, protecting against cross-origin read attacks.",
  "X-XSS-Protection": "Activated the built-in XSS filter in older browsers. Modern browsers have removed this filter (replaced by CSP); the recommended value is <code>0</code> to avoid vulnerabilities.",
  "Access-Control-Allow-Origin": "Part of the CORS (<em>Cross-Origin Resource Sharing</em>) mechanism, controlling which external domains can access the page's resources. A permissive value (<code>*</code>) can expose sensitive data.",
};

function bInstHttps(d, dB, hd) {
  const es = document.getElementById("ih-s"), ec = document.getElementById("ih-c"), er = document.getElementById("ih-rank");
  if (!d || !d.length) { if (es) es.innerHTML = ""; if (ec) ec.innerHTML = '<div class="lm">No HTTPS data for your institution.</div>'; return; }
  const r = d[0], rB = dB && dB[0];
  _setCurrentLlmFindings(r.ID);
  const httpStatus = r.http_status_code || "—";
  const _htd = renderDeltaPill(r.final_score, rB ? rB.final_score : null);
  es.innerHTML = sCard("HTTPS / TLS", "Grade " + _gc(r.grade), parseFloat(r.final_score || 0).toFixed(1) + (_htd ? " " + _htd : ""))
    + sCard("Valid Certificate", _yn(_isTrue(r.valid_certificate)), r.certificate_authority || "—")
    + sCard("TLS 1.3", _isTrue(r.TLS1_3) ? '<span style="color:#10b981;font-weight:600">Active</span>' : '<span style="color:#ef4444;font-weight:600">Not active</span>', _isTrue(r.TLS1_2) ? "TLS 1.2 also active" : "")
    + sCard("Algorithm", r.certificate_signature_algorithm || "—", r.key_size || "")
    + sCard("HTTP Status", httpStatus, "response code");
  if (ec) {
    ec.innerHTML = `<div id="ih-gauge"></div><div id="ih-meta" style="margin-top:1rem"></div><div id="ih-chk" style="margin-top:1rem"></div>`;
    _instScoreGauge("ih-gauge", r.final_score, "HTTPS / TLS Score", rB ? rB.final_score : null);
    // Metadata bar
    const metaEl = document.getElementById("ih-meta");
    if (metaEl) {
      const scanDate = r.assessment_datetime || r.run_timestamp || "—";
      const alpn = r.ALPN || r.alpn || "—";
      const npn  = r.NPN  || r.npn  || null;
      const appBanner = r.banner_application || null;
      const appWarn = appBanner && appBanner !== "False" && appBanner !== "false" && appBanner !== "" && appBanner !== "None"
        ? `<div style="font-size:.78rem;color:#f59e0b;margin-top:.4rem">⚠ Application banner exposed: <span style="font-family:monospace">${appBanner}</span></div>` : "";
      metaEl.innerHTML = `<div style="background:var(--card2);border:1px solid var(--bdr);border-radius:10px;padding:.9rem 1.1rem;font-size:.79rem;color:var(--t3)">
        <div style="font-weight:600;color:var(--t2);margin-bottom:.5rem">Scan Details</div>
        ${r.Url || r.url ? `<div style="margin-bottom:.2rem">Domain: <span style="color:var(--t1)">${r.Url||r.url}</span></div>` : ""}
        ${r.ip ? `<div style="margin-bottom:.2rem">IP address: <span style="color:var(--t1)">${r.ip}</span></div>` : ""}
        ${r.banner_server ? `<div style="margin-bottom:.2rem">Server banner: <span style="color:var(--t1);font-family:monospace">${r.banner_server}</span></div>` : ""}
        <div style="margin-bottom:.2rem">Scan date: <span style="color:var(--t1)">${scanDate}</span></div>
        <div style="margin-bottom:.2rem">ALPN negotiated: <span style="color:var(--t1)">${alpn}</span></div>
        ${npn ? `<div style="margin-bottom:.2rem">NPN: <span style="color:var(--t1)">${npn}</span></div>` : ""}
        <div style="margin-top:.4rem;font-family:monospace;color:var(--cyan)">HTTP ${httpStatus}</div>
        ${appWarn}
      </div>`;
    }
    // Audit groups
    const el = document.getElementById("ih-chk");
    if (el) {
      const ipVal = r.ip || "";
      const httpConn = _isTrue(r.TLS1_2) || _isTrue(r.TLS1_3) || _isTrue(r.TLS1_1) || _isTrue(r.TLS1);
      const insecureActive = _isTrue(r.SSLv2) || _isTrue(r.SSLv3) || _isTrue(r.TLS1) || _isTrue(r.TLS1_1);
      const hasTLS12 = _isTrue(r.TLS1_2), hasTLS13 = _isTrue(r.TLS1_3);
      const validCert = _isTrue(r.valid_certificate);
      const hasCT = _isTrue(r.certificate_transparency);
      const hasCaa = _isTrue(r.dns_caa);
      const hasOcsp = _isTrue(r.ocsp_stapling);
      const httpsStatus = r.http_status_code || "";
      const httpsStatusOk = httpsStatus.startsWith("2") || httpsStatus.startsWith("3");
      let out = "";
      out += _auditGroup("HTTP/S",
        "HTTPS adds an encryption layer on top of HTTP. Enabling HTTPS at the domain level prevents communication between the browser and the web server from being intercepted or tampered with by third parties.",
        _auditCard(httpConn ? "pass" : "fail",
          "HTTPS Connection",
          httpConn
            ? "The server offers a TLS-secured HTTPS endpoint and accepted the connection."
            : "No TLS protocol support was detected — the server may not be running HTTPS.",
          [
            ipVal ? "Server IP: " + ipVal : null,
            r.certificate_authority ? "Issuer: " + r.certificate_authority : null,
            httpsStatus ? "HTTPS response: " + httpsStatus : null,
            r.banner_server ? "Server: " + r.banner_server : null,
          ]) +
        (httpsStatus ? _auditCard(httpsStatusOk ? "pass" : "warn",
          "HTTPS Response",
          "Verifies that the server responds correctly over HTTPS. A 2xx or 3xx response confirms the HTTPS endpoint is reachable and functional.",
          ["HTTPS Status: " + httpsStatus]) : ""));
      out += _auditGroup("TLS Protocol Versions",
        "TLS is the cryptographic protocol that secures HTTPS connections. Legacy versions (SSLv2, SSLv3, TLS 1.0, TLS 1.1) contain known vulnerabilities and must be disabled. TLS 1.2 and TLS 1.3 are the currently recommended versions.",
        _auditCard(insecureActive ? "fail" : "pass",
          "Legacy Protocols Disabled (SSLv2, SSLv3, TLS 1.0, TLS 1.1)",
          "Verifies that outdated and insecure protocol versions are not offered by the server. " + (insecureActive ? "One or more insecure protocols are active." : "No legacy protocols are active."),
          [
            "SSLv2: " + (_isTrue(r.SSLv2) ? "⚠ Active" : "OK — Not offered"),
            "SSLv3: " + (_isTrue(r.SSLv3) ? "⚠ Active" : "OK — Not offered"),
            "TLS 1.0: " + (_isTrue(r.TLS1) ? "⚠ Active" : "OK — Not offered"),
            "TLS 1.1: " + (_isTrue(r.TLS1_1) ? "⚠ Active" : "OK — Not offered"),
          ]) +
        _auditCard(hasTLS13 ? "pass" : (hasTLS12 ? "warn" : "fail"),
          "TLS 1.3 Support",
          "TLS 1.3 is the most recent and secure version, featuring improved performance and removal of obsolete ciphers. " + (hasTLS13 ? "The server supports TLS 1.3." : hasTLS12 ? "TLS 1.2 active but TLS 1.3 not yet enabled (recommended)." : "Neither TLS 1.2 nor TLS 1.3 supported."),
          [
            "TLS 1.2: " + (hasTLS12 ? "Supported" : "Not supported"),
            "TLS 1.3: " + (hasTLS13 ? "Supported" : "Not supported"),
            _isTrue(r.ALPN_HTTP2) ? "HTTP/2 (ALPN): Supported" : "HTTP/2 (ALPN): Not supported",
          ]));
      out += _auditGroup("Digital Certificate",
        "The digital certificate is issued by a Certificate Authority (CA) and ensures the authenticity and integrity of the HTTPS connection. A valid certificate with a strong algorithm, issued by a trusted CA, is essential for secure communication.",
        _auditCard(validCert ? "pass" : "warn",
          "Certificate Validation",
          validCert
            ? "The certificate passed all scanner validation checks and is trusted by browsers."
            : "The scanner did not fully validate this certificate (valid_certificate: False). This may reflect SNI-mandatory trust, an incomplete chain, or an expired certificate. Review the raw scan data.",
          [
            r.certificate_authority ? "Issuer: " + r.certificate_authority : null,
            r.certificate_signature_algorithm ? "Algorithm: " + r.certificate_signature_algorithm : null,
            r.key_size ? "Key size: " + r.key_size : null,
            ipVal ? "IP: " + ipVal : null,
            r.banner_server ? "Server: " + r.banner_server : null,
          ]) +
        _auditCard(hasCT ? "pass" : "warn",
          "Certificate Transparency (CT)",
          "CT is a public audit mechanism that logs all issued certificates, enabling detection of fraudulent or mis-issued certificates. " + (hasCT ? "The certificate is logged in a CT log." : "No CT log proof found."),
          [hasCT ? "CT: Present" : "CT: Not found"]) +
        _auditCard(hasCaa ? "pass" : "warn",
          "DNS CAA (Certificate Authority Authorization)",
          "A CAA DNS record specifies which CAs are allowed to issue certificates for the domain, reducing the risk of fraudulent issuance. " + (hasCaa ? "A CAA record is configured." : "No CAA record found in DNS."),
          [hasCaa ? "DNS CAA: Configured" : "DNS CAA: Not configured"]) +
        _auditCard(hasOcsp ? "pass" : "warn",
          "OCSP Stapling",
          "OCSP Stapling allows the server to include a signed certificate revocation status in the TLS handshake, improving performance and privacy. " + (hasOcsp ? "OCSP Stapling is active." : "OCSP Stapling is not active."),
          [
            hasOcsp ? "OCSP Stapling: Active" : "OCSP Stapling: Not active",
            _isTrue(r.ocsp_must_staple) ? "OCSP Must-Staple: Enforced" : "OCSP Must-Staple: Not enforced",
          ]));
      // HSTS group — uses headers scanner data (transport security header)
      const rh = hd && hd[0];
      if (rh) {
        const hasHsts = _isTrue(rh["strict-transport-security_presence"]);
        const hstsVal = rh["strict-transport-security_config"] && rh["strict-transport-security_config"] !== "Missing" ? rh["strict-transport-security_config"] : null;
        out += _auditGroup("HSTS — HTTP Strict-Transport-Security",
          "HSTS is a response header that instructs browsers to access the domain exclusively via HTTPS, preventing downgrade attacks and connection interception. A <em>max-age</em> of at least 6 months (15552000 seconds) is required.",
          _auditCard(hasHsts ? "pass" : "fail",
            "HSTS Deployment",
            hasHsts ? "HSTS is active — browsers will enforce HTTPS-only access for the configured duration." : "The domain does not send a Strict-Transport-Security header. Browsers may access it over plain HTTP.",
            hasHsts
              ? [hstsVal ? "Header value: " + hstsVal : "HSTS: Present (no config detail)"]
              : ["Strict-Transport-Security: Not found"]));
        // HTTPS Redirect group — uses headers scanner data
        const hasRedir = _isTrue(rh.redirected_to_https);
        const hasSameDomain = _isTrue(rh.redirected_https_to_same_domain);
        out += _auditGroup("HTTPS Redirect",
          "Verifies that the domain automatically redirects HTTP traffic to HTTPS via a 3xx response. Correct redirect to the same domain is required; cross-domain redirects may indicate misconfiguration.",
          _auditCard(hasRedir ? "pass" : "fail",
            "HTTP → HTTPS Redirect",
            hasRedir ? "HTTP requests are correctly redirected to HTTPS." : "HTTP requests are not redirected to HTTPS — users may access the site over unencrypted HTTP.",
            [
              rh.http_status_code ? "HTTP Status: " + rh.http_status_code : null,
              rh.https_status_code ? "HTTPS Status: " + rh.https_status_code : null,
              hasSameDomain !== null ? "Same domain redirect: " + (hasSameDomain ? "Yes" : "No") : null,
              rh.redirect_count != null ? "Redirect hops: " + rh.redirect_count : null,
              rh.final_url ? "Final URL: " + rh.final_url : null,
              rh.protocol_http ? "HTTP protocol: " + rh.protocol_http : null,
            ]));
      }
      el.innerHTML = out;
    }
  }
  _currentLlmFindings = [];
  if (er) er.innerHTML = "";
}

function bInstDnssec(d, dB, ht) {
  const es = document.getElementById("id-s"), ec = document.getElementById("id-c"), er = document.getElementById("id-rank");
  if (!d || !d.length) { if (es) es.innerHTML = ""; if (ec) ec.innerHTML = '<div class="lm">No DNSSEC data for your institution.</div>'; return; }
  const r = d[0], rB = dB && dB[0];
  _setCurrentLlmFindings(r.ID);
  const status = r.dnssec_status || "Unknown";
  const statusCol = status === "Valid" ? "#10b981" : status === "Missing" ? "#ef4444" : "#f59e0b";
  const algos = r.algorithms && r.algorithms !== "[]" ? r.algorithms.replace(/[\[\]'\"]/g,"") : "—";
  const digests = r.digest_algorithms && r.digest_algorithms !== "[]" ? r.digest_algorithms.replace(/[\[\]'\"]/g,"") : "—";
  const statusColInline = status === "Valid" ? "#10b981" : status === "Missing" ? "#ef4444" : "#f59e0b";
  const _dnd = renderDeltaPill(r.score, rB ? rB.score : null);
  es.innerHTML = sCard("DNSSEC", "Grade " + _gc(r.grade), parseFloat(r.score || 0).toFixed(1) + (_dnd ? " " + _dnd : ""))
    + sCard("Status", '<span style="color:'+statusColInline+';font-weight:600">'+status+'</span>', r.Url || r.url || "")
    + sCard("Algorithms", algos !== "—" ? algos : "Not configured", "signing")
    + sCard("Non-existence proof", r.non_existence_proof_method && r.non_existence_proof_method !== "Missing" ? r.non_existence_proof_method : "Not configured", "");
  if (ec) {
    const algoStr = (algos + " " + digests).toUpperCase();
    let rfcRating, rfcState;
    if (algoStr.includes("ECDSA") || algoStr.includes("13") || algoStr.includes("15") || algoStr.includes("16")) {
      rfcRating = "RECOMMENDED — ECDSA algorithm detected (RFC 8624)"; rfcState = "pass";
    } else if (algoStr.includes("RSA") && (algoStr.includes("SHA-256") || algoStr.includes("8"))) {
      rfcRating = "MUST — RSA/SHA-256 in use (RFC 8624). Consider upgrading to ECDSA."; rfcState = "warn";
    } else if (algos !== "—") {
      rfcRating = "NOT RECOMMENDED — algorithm does not meet RFC 8624 recommendations. Upgrade to ECDSA."; rfcState = "fail";
    } else {
      rfcRating = "No signing algorithms detected — DNSSEC may not be deployed."; rfcState = "fail";
    }
    const scanDate = r.assessment_datetime || r.run_timestamp || "—";
    const domain = r.Url || r.url || "";
    const nipm = r.non_existence_proof_method && r.non_existence_proof_method !== "Missing" ? r.non_existence_proof_method : null;
    ec.innerHTML = `<div id="id-gauge"></div><div id="id-groups" style="margin-top:1rem"></div>`;
    _instScoreGauge("id-gauge", r.score, "DNSSEC Score", rB ? rB.score : null);
    const grpEl = document.getElementById("id-groups");
    if (grpEl) {
      let out = "";
      out += _auditGroup("DNSSEC Deployment",
        "DNSSEC (<em>Domain Name System Security Extensions</em>) adds cryptographic signatures to DNS responses, protecting against DNS cache poisoning and malicious redirection. Zone signing must be correctly configured and delegated up to the parent zone.",
        _auditCard(status === "Valid" ? "pass" : status === "Missing" ? "fail" : "warn",
          "DNSSEC Status",
          "Verifies that DNSSEC is active and correctly configured for the domain. " + (status === "Valid" ? "DNSSEC is active and valid." : status === "Missing" ? "DNSSEC is not configured for this domain." : "DNSSEC is present but configuration is incomplete."),
          [
            "Status: " + status,
            domain ? "Domain: " + domain : null,
            algos !== "—" ? "Signing algorithms: " + algos : null,
            digests !== "—" ? "Digest algorithms: " + digests : null,
            nipm ? "Non-existence proof: " + nipm : null,
            "Scan date: " + scanDate,
          ]));
      out += _auditGroup("Signing Algorithm Compliance",
        "The algorithms used to sign DNS zones determine the cryptographic strength of DNSSEC. ECDSA P-256 (Algorithm 13) is recommended; RSA/SHA-256 (Algorithm 8) is acceptable. Weaker or unknown algorithms should be replaced per RFC 8624.",
        _auditCard(rfcState,
          "Algorithm Compliance",
          rfcRating,
          [
            algos !== "—" ? "Signing algorithms: " + algos : "Signing algorithms: Not configured",
            digests !== "—" ? "Digest algorithms: " + digests : null,
          ]));
      // TLS context — cross-reference HTTPS scanner data
      const rh = ht && ht[0];
      if (rh) {
        const tlsOk = _isTrue(rh.TLS1_2) || _isTrue(rh.TLS1_3);
        const hasTLS13 = _isTrue(rh.TLS1_3);
        const insecure = _isTrue(rh.SSLv2) || _isTrue(rh.SSLv3) || _isTrue(rh.TLS1) || _isTrue(rh.TLS1_1);
        const httpsGrade = rh.grade || "—";
        const httpsScore = parseFloat(rh.final_score || 0);
        out += _auditSec("TLS / HTTPS Context");
        out += _auditGroup("HTTPS / TLS Security",
          "DNS security and HTTPS/TLS work as complementary layers. DNSSEC protects DNS resolution integrity while HTTPS protects data in transit. Both must be correctly configured for full end-to-end security.",
          _auditCard(tlsOk ? (insecure ? "warn" : "pass") : "fail",
            "TLS Connection",
            tlsOk
              ? (insecure ? "HTTPS is running but legacy protocols are active alongside modern TLS versions." : "HTTPS is running with modern TLS protocol support.")
              : "No TLS protocol support detected for this domain.",
            [
              "HTTPS/TLS Grade: " + httpsGrade + " (" + httpsScore.toFixed(1) + ")",
              "TLS 1.3: " + (_isTrue(rh.TLS1_3) ? "Supported" : "Not supported"),
              "TLS 1.2: " + (_isTrue(rh.TLS1_2) ? "Supported" : "Not supported"),
              insecure ? "⚠ Legacy protocols active (SSLv2/SSLv3/TLS1.0/TLS1.1)" : "Legacy protocols: Not offered",
              rh.certificate_authority ? "Certificate issuer: " + rh.certificate_authority : null,
              rh.ip ? "Server IP: " + rh.ip : null,
            ]) +
          _auditCard(_isTrue(rh.dns_caa) ? "pass" : "warn",
            "DNS CAA Record",
            "A CAA record in DNS restricts which Certificate Authorities may issue certificates for this domain, complementing DNSSEC integrity. " + (_isTrue(rh.dns_caa) ? "CAA record is configured." : "No CAA record found — any CA could issue certificates for this domain."),
            [_isTrue(rh.dns_caa) ? "DNS CAA: Configured" : "DNS CAA: Not configured"]));
      }
      grpEl.innerHTML = out;
    }
  }
  _currentLlmFindings = [];
  if (er) er.innerHTML = "";
}

function bInstHeaders(d, dB, ht) {
  const es = document.getElementById("ish-s"), ec = document.getElementById("ish-c"), er = document.getElementById("ish-rank");
  if (!d || !d.length) { if (es) es.innerHTML = ""; if (ec) ec.innerHTML = '<div class="lm">No Security Headers data for your institution.</div>'; return; }
  const r = d[0], rB = dB && dB[0];
  _setCurrentLlmFindings(r.ID);
  const coreHeaders = ["x-frame-options","strict-transport-security","content-security-policy","referrer-policy","x-content-type-options"];
  const corePresent = coreHeaders.filter((h) => _isTrue(r[h + "_presence"])).length;
  const _shd = renderDeltaPill(r.final_score, rB ? rB.final_score : null);
  es.innerHTML = sCard("Sec. Headers", "Grade " + _gc(r.grade), parseFloat(r.final_score || 0).toFixed(1) + (_shd ? " " + _shd : ""))
    + sCard("HTTPS Redirect", _yn(_isTrue(r.redirected_to_https)), _isTrue(r.redirected_https_to_same_domain) ? "same domain" : "")
    + sCard("Core headers", corePresent + " / 5", "present")
    + sCard("HTTP Protocol", r.protocol_http || "—", r.redirect_count != null ? r.redirect_count + " redirect(s)" : "");
  if (ec) {
    ec.innerHTML = `<div id="ish-gauge"></div><div id="ish-breakdown" style="margin-top:1rem"></div><div id="ish-chk" style="margin-top:1rem"></div>`;
    _instScoreGauge("ish-gauge", r.final_score, "Security Headers Score", rB ? rB.final_score : null);
    // Score breakdown bars
    const breakdownEl = document.getElementById("ish-breakdown");
    if (breakdownEl) {
      const hcs = parseFloat(r.header_component_score || 0);
      const rcs = parseFloat(r.redirect_component_score || 0);
      const inconsistency = r.critical_header_inconsistency_between_platforms;
      const scanDate = r.analysis_datetime || r.run_timestamp || "—";
      const inconsistencyWarn = inconsistency && inconsistency === "True"
        ? `<div style="background:#7c2d12;border:1px solid #ef4444;border-radius:8px;padding:.6rem .9rem;font-size:.81rem;color:#fca5a5;margin-top:.7rem">⚠ Critical inconsistency between desktop/mobile platforms detected</div>` : "";
      const bar = (val, max, col) => {
        const pct = Math.min(100, Math.max(0, (val / max) * 100)).toFixed(1);
        return `<div style="background:var(--bg3);border-radius:4px;height:.55rem;overflow:hidden;margin-top:.25rem">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:4px;transition:width .4s"></div>
        </div>`;
      };
      breakdownEl.innerHTML = `<div style="background:var(--card2);border:1px solid var(--bdr);border-radius:10px;padding:.9rem 1.1rem">
        <div style="font-weight:600;color:var(--t2);font-size:.82rem;margin-bottom:.7rem">Score Breakdown</div>
        <div style="font-size:.79rem;color:var(--t3);margin-bottom:.1rem">Header component <span style="color:var(--t1);float:right">${hcs.toFixed(1)} <span style="color:var(--t3);font-size:.73rem">(60%)</span></span></div>
        ${bar(hcs, 100, "#06b6d4")}
        <div style="font-size:.79rem;color:var(--t3);margin-top:.6rem;margin-bottom:.1rem">Redirect component <span style="color:var(--t1);float:right">${rcs.toFixed(1)} <span style="color:var(--t3);font-size:.73rem">(40%)</span></span></div>
        ${bar(rcs, 100, "#8b5cf6")}
        ${r.final_url ? `<div style="font-size:.79rem;color:var(--t3);margin-top:.6rem">Final URL: <span style="color:var(--t1)">${r.final_url}</span></div>` : ""}
        <div style="font-size:.79rem;color:var(--t3);margin-top:.3rem">Scan date: <span style="color:var(--t1)">${scanDate}</span></div>
        ${inconsistencyWarn}
      </div>`;
    }
    // Audit groups
    const el = document.getElementById("ish-chk");
    if (el) {
      const hFmt = (presence, config, name) => {
        const ok = _isTrue(presence);
        const val = config && config !== "Missing" ? config : null;
        return _auditCard(ok ? "pass" : "fail", name,
          _HEADER_DESC[name] || ("Verifies that the <strong>" + name + "</strong> header is present and correctly configured."),
          ok ? (val ? [name + ": " + val] : [name + ": Present"]) : [name + ": Not Found"]);
      };
      const hasRedir = _isTrue(r.redirected_to_https);
      const hasSameDomain = _isTrue(r.redirected_https_to_same_domain);
      const cookieOk = _isTrue(r["set-cookie_presence"]);
      const cookieCfg = r["set-cookie_config"] && r["set-cookie_config"] !== "Missing" ? r["set-cookie_config"] : null;
      const cookieHasFlags = cookieCfg && cookieCfg.toLowerCase().includes("secure") && cookieCfg.toLowerCase().includes("httponly");
      const cookieState = cookieOk ? (cookieHasFlags ? "pass" : "fail") : "warn";
      let out = "";
      out += _auditGroup("HTTPS Redirect",
        "Verifies that the domain correctly redirects HTTP traffic to HTTPS, and that the redirect stays on the same domain. The redirect behaviour directly affects the redirect component score (40% of total).",
        _auditCard(hasRedir ? "pass" : "fail",
          "Redirect to HTTPS",
          hasRedir ? "The domain correctly redirects HTTP connections to HTTPS." : "The domain does not redirect HTTP connections to HTTPS.",
          [
            "HTTP Status: " + (r.http_status_code || "N/A"),
            "HTTPS Status: " + (r.https_status_code || "N/A"),
            r.redirect_count != null ? "Redirect count: " + r.redirect_count : null,
            r.final_url ? "Final URL: " + r.final_url : null,
            "Same domain: " + (hasSameDomain ? "Yes" : "No"),
            r.protocol_http ? "HTTP protocol: " + r.protocol_http : null,
          ]));
      out += _auditGroup("Transport Security",
        "Response headers that enforce secure transport and protect against downgrade attacks. <em>Strict-Transport-Security</em> (HSTS) instructs browsers to always access the domain via HTTPS, even if the user types plain HTTP.",
        hFmt(r["strict-transport-security_presence"], r["strict-transport-security_config"], "Strict-Transport-Security"));
      out += _auditGroup("Framing & Content Protection",
        "Headers that prevent the page from being embedded in frames on other origins (<em>clickjacking</em>), restrict MIME-type interpretation, and control referrer information sent to third parties.",
        hFmt(r["x-frame-options_presence"], r["x-frame-options_config"], "X-Frame-Options") +
        hFmt(r["x-content-type-options_presence"], r["x-content-type-options_config"], "X-Content-Type-Options") +
        hFmt(r["referrer-policy_presence"], r["referrer-policy_config"], "Referrer-Policy"));
      out += _auditGroup("Content Security Policy",
        "<em>Content-Security-Policy</em> (CSP) defines which sources are authorised to load resources (scripts, styles, images). It is the primary defence against Cross-Site Scripting (XSS) and content injection attacks.",
        hFmt(r["content-security-policy_presence"], r["content-security-policy_config"], "Content-Security-Policy"));
      out += _auditGroup("Cross-Origin Isolation",
        "Cross-Origin headers isolate the browsing context and resources from other origins, enabling advanced browser security features and preventing cross-origin data leaks.",
        hFmt(r["cross-origin-opener-policy_presence"], r["cross-origin-opener-policy_config"], "Cross-Origin-Opener-Policy") +
        hFmt(r["cross-origin-embedder-policy_presence"], r["cross-origin-embedder-policy_config"], "Cross-Origin-Embedder-Policy") +
        hFmt(r["cross-origin-resource-policy_presence"], r["cross-origin-resource-policy_config"], "Cross-Origin-Resource-Policy"));
      out += _auditGroup("Legacy, Access Control & Session",
        "<em>X-XSS-Protection</em> is a legacy filter now removed from modern browsers (recommended value: <code>0</code>). <em>Access-Control-Allow-Origin</em> controls cross-origin resource access via CORS. <em>Set-Cookie</em> attributes govern session token security — Secure and HttpOnly flags are required.",
        hFmt(r["x-xss-protection_presence"], r["x-xss-protection_config"], "X-XSS-Protection") +
        (() => {
          const pres = r["access-control-allow-origin_presence"];
          const cfg  = r["access-control-allow-origin_config"] || "";
          const present = _isTrue(pres);
          const wildcard = present && cfg.includes("*");
          const state = !present ? "warn" : (wildcard ? "fail" : "pass");
          return _auditCard(state, "Access-Control-Allow-Origin",
            _HEADER_DESC["Access-Control-Allow-Origin"] || "Part of the CORS mechanism — controls which origins can access this site's resources.",
            present ? ["Access-Control-Allow-Origin: " + cfg] : ["Access-Control-Allow-Origin: Not configured"]);
        })() +
        _auditCard(cookieState,
          "Set-Cookie",
          cookieOk
            ? (cookieHasFlags ? "Session cookies are present and include Secure and HttpOnly flags." : "Session cookies are present but may be missing Secure or HttpOnly flags, exposing session tokens to theft.")
            : "No Set-Cookie header detected. If this site uses sessions, verify cookie security attributes are set.",
          cookieOk ? (cookieCfg ? ["Set-Cookie: " + cookieCfg] : ["Set-Cookie: Present (no config details)"]) : ["Set-Cookie: Not present"]));
      // TLS context — cross-reference HTTPS scanner data
      const rt = ht && ht[0];
      if (rt) {
        const tlsOk = _isTrue(rt.TLS1_2) || _isTrue(rt.TLS1_3);
        const insecure = _isTrue(rt.SSLv2) || _isTrue(rt.SSLv3) || _isTrue(rt.TLS1) || _isTrue(rt.TLS1_1);
        const validCertTls = _isTrue(rt.valid_certificate);
        out += _auditSec("TLS Connection Layer");
        out += _auditGroup("TLS / HTTPS Foundation",
          "HTTP security headers operate on top of the underlying TLS connection. A well-configured TLS layer (modern protocols, strong cipher suites, valid certificate) is required for headers like HSTS and CSP to be effective.",
          _auditCard(tlsOk ? (insecure ? "warn" : "pass") : "fail",
            "TLS Protocol Support",
            tlsOk
              ? (insecure ? "Modern TLS is active but legacy protocols are also offered — disable SSLv2, SSLv3, TLS 1.0 and TLS 1.1." : "The server supports modern TLS versions only.")
              : "No TLS support detected — HTTPS headers cannot provide protection without a TLS layer.",
            [
              "HTTPS/TLS Grade: " + (rt.grade || "—") + " (" + parseFloat(rt.final_score || 0).toFixed(1) + ")",
              "TLS 1.3: " + (_isTrue(rt.TLS1_3) ? "Supported" : "Not supported"),
              "TLS 1.2: " + (_isTrue(rt.TLS1_2) ? "Supported" : "Not supported"),
              insecure ? "⚠ Legacy protocols active" : "Legacy protocols: Not offered",
              _isTrue(rt.ALPN_HTTP2) ? "HTTP/2 (ALPN): Supported" : "HTTP/2: Not supported",
            ]) +
          _auditCard(validCertTls ? "pass" : "warn",
            "Certificate",
            validCertTls
              ? "The TLS certificate passed scanner validation — the HTTPS connection is trustworthy."
              : "The TLS scanner flagged a certificate validation issue. Headers are delivered but the connection trust depends on certificate resolution.",
            [
              rt.certificate_authority ? "Issuer: " + rt.certificate_authority : null,
              rt.certificate_signature_algorithm ? "Algorithm: " + rt.certificate_signature_algorithm : null,
              rt.key_size ? "Key size: " + rt.key_size : null,
              rt.ip ? "Server IP: " + rt.ip : null,
            ]) +
          _auditCard(_isTrue(rt.ocsp_stapling) ? "pass" : "warn",
            "OCSP Stapling",
            "OCSP Stapling provides in-band certificate revocation status. " + (_isTrue(rt.ocsp_stapling) ? "Active — revocation status is included in TLS handshake." : "Not active."),
            [_isTrue(rt.ocsp_stapling) ? "OCSP Stapling: Active" : "OCSP Stapling: Not active"]));
      }
      el.innerHTML = out;
    }
  }
  _currentLlmFindings = [];
  if (er) er.innerHTML = "";
}
