// ============================================================================
// National tab builders: bOverview, bHttps, bDnssec, bHeaders
// ============================================================================

function bOverview(dn, ht, hd, meta, llm, cmp) {
  const es = document.getElementById("os"),
    ec = document.getElementById("oc");
  const tot =
    (dn ? dn.length : 0) || (ht ? ht.length : 0) || (hd ? hd.length : 0);
  if (!tot) {
    es.innerHTML = "";
    ec.innerHTML =
      '<div class="lm">Upload CSV files in Data Management to see results.</div>';
    return;
  }
  cmp = cmp || {};
  const avgScore = (rows) => {
    if (!rows || !rows.length) return null;
    const sc = rows
      .map((r) => parseFloat(r.final_score))
      .filter((v) => !isNaN(v));
    return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
  };
  const dnssecPct = (rows) => {
    if (!rows || !rows.length) return null;
    return (
      (rows.filter((r) => r.dnssec_status === "Valid").length /
        rows.length) *
      100
    );
  };

  let h = sCard(
    "Institutions",
    tot,
    meta ? meta.flag + " " + meta.label + " HEIs" : "HEIs",
  );
  if (ht) {
    const cur = avgScore(ht),
      prev = avgScore(cmp.htB);
    h += sCard(
      "Average HTTPS Score",
      cur != null ? cur.toFixed(1) : "—",
      "out of 100",
      renderDeltaPill(cur, prev),
    );
  }
  if (dn) {
    const cur = dnssecPct(dn),
      prev = dnssecPct(cmp.dnB);
    const v = dn.filter((r) => r.dnssec_status === "Valid").length;
    h += sCard(
      "DNSSEC Adoption",
      cur != null ? Math.round(cur) + "%" : "—",
      v + " of " + dn.length,
      renderDeltaPill(cur, prev, { suffix: "%", decimals: 1 }),
    );
  }
  if (hd) {
    const cur = avgScore(hd),
      prev = avgScore(cmp.hdB);
    h += sCard(
      "Average Headers Score",
      cur != null ? cur.toFixed(1) : "—",
      "out of 100",
      renderDeltaPill(cur, prev),
    );
  }
  es.innerHTML = h;

  let ch = "";
  if (ht) ch += cCard("ogh", "HTTPS Grade Distribution");
  if (dn) ch += cCard("ogd", "DNSSEC Grade Distribution");
  if (hd) ch += cCard("ogs", "Security Headers Grade Distribution");
  ec.innerHTML = ch;

  if (ht) {
    const gd = gradeDistObj(ht);
    mkB("ogh", GO, [
      {
        label: "HEIs",
        data: GO.map((g) => gd[g]),
        backgroundColor: GO.map((g) => GC[g]),
        borderRadius: 4,
      },
    ]);
  }
  if (dn) {
    const gd = gradeDistObj(dn);
    mkB("ogd", GO, [
      {
        label: "HEIs",
        data: GO.map((g) => gd[g]),
        backgroundColor: GO.map((g) => GC[g]),
        borderRadius: 4,
      },
    ]);
  }
  if (hd) {
    const gd = gradeDistObj(hd);
    mkB("ogs", GO, [
      {
        label: "HEIs",
        data: GO.map((g) => gd[g]),
        backgroundColor: GO.map((g) => GC[g]),
        borderRadius: 4,
      },
    ]);
  }

  // For regional accounts: show own institution's AI recommendations below charts
  const oa = document.getElementById("oa");
  if (oa) oa.innerHTML = "";
}

function bHttps(d, dB, src) {
  const es = document.getElementById("hs"),
    ec = document.getElementById("hc");
  if (!d) {
    es.innerHTML = "";
    ec.innerHTML = '<div class="lm">No HTTPS data loaded.</div>';
    return;
  }
  const _avg = (rows) => {
    if (!rows || !rows.length) return null;
    const s = rows
      .map((r) => parseFloat(r.final_score))
      .filter((v) => !isNaN(v));
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  };
  const cur = _avg(d),
    prev = _avg(dB);
  const avg = cur != null ? cur.toFixed(2) : "—";
  // TLS 1.3 / TLS 1.0 shares are measured against every registered HEI
  // (the source list), not just the ones that returned a usable scan —
  // an institution that never got scanned still doesn't support TLS 1.3.
  // Falls back to the scanned count when no source list is loaded.
  const total = src && src.length ? src.length : d.length;
  const totalB = dB ? (src && src.length ? src.length : dB.length) : null;
  const _pct = (rows, col, base) =>
    base ? (countTrue(rows, col) / base) * 100 : null;
  const tls13Cur = _pct(d, "TLS1_3", total),
    tls13Prev = dB ? _pct(dB, "TLS1_3", totalB) : null;
  const tls1Cur = _pct(d, "TLS1", total),
    tls1Prev = dB ? _pct(dB, "TLS1", totalB) : null;
  const _bool = (v) => String(v || "").trim().toLowerCase() === "true";
  const _cleanCount = (rows) =>
    rows.filter((r) => _bool(r.valid_certificate) && !_bool(r.cert_at_risk))
      .length;
  const cleanCur = (_cleanCount(d) / d.length) * 100,
    cleanPrev = dB ? (_cleanCount(dB) / dB.length) * 100 : null;
  es.innerHTML =
    sCard(
      "Average Score",
      avg,
      "out of 100",
      renderDeltaPill(cur, prev),
    ) +
    sCard(
      "Support TLS 1.3",
      tls13Cur.toFixed(1) + "%",
      "of " + total + " registered HEIs",
      renderDeltaPill(tls13Cur, tls13Prev, { suffix: "%", decimals: 1 }),
    ) +
    sCard(
      "Certificates Validate Cleanly",
      cleanCur.toFixed(1) + "%",
      "of the " + d.length + " with a usable result",
      renderDeltaPill(cleanCur, cleanPrev, { suffix: "%", decimals: 1 }),
    ) +
    sCard(
      "Still Accept TLS 1.0",
      '<span style="color:#f97316">' + tls1Cur.toFixed(1) + "%</span>",
      "of " + total + " registered HEIs",
      renderDeltaPill(tls1Cur, tls1Prev, {
        suffix: "%",
        decimals: 1,
        inverse: true,
      }),
    );
  ec.innerHTML =
    cCard("hg", "Grade Distribution") +
    cCard("hp", "Protocol Support") +
    cCard("hf", "Security Features") +
    cCard("hn", "Average Score by NUTS2") +
    cCard("hk", "Average Score by Category") +
    cCard("ha", "Top Certificate Authorities");
  _mkCmpGrade("hg", d, dB);
  const pl = ["SSLv2", "SSLv3", "TLS1", "TLS1_1", "TLS1_2", "TLS1_3"],
    pn = ["SSLv2", "SSLv3", "TLS 1.0", "TLS 1.1", "TLS 1.2", "TLS 1.3"];
  mkB("hp", pn, [
    {
      label: "HEIs",
      data: pl.map((p) => countTrue(d, p)),
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
  ]);
  mkH(
    "hf",
    ["Valid Cert", "OCSP Stapling", "DNS CAA", "Cert Transparency"],
    [
      countTrue(d, "valid_certificate"),
      countTrue(d, "ocsp_stapling"),
      countTrue(d, "dns_caa"),
      countTrue(d, "certificate_transparency"),
    ],
    ["#10b981", "#06b6d4", "#3b82f6", "#8b5cf6"],
  );
  const an = avgBy(d, "NUTS2_Label", "final_score"),
    nk = Object.keys(an).sort();
  _mkCmpBar(
    "hn",
    nk,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "final_score") : null,
    "#3b82f6",
  );
  const ac = avgBy(d, "Category", "final_score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "hk",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "final_score") : null,
    "#06b6d4",
  );
  const caVC = valCounts(d, "certificate_authority"),
    caK = Object.entries(caVC)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  if (caK.length)
    mkD(
      "ha",
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
    );
}

function bDnssec(d, dB) {
  const es = document.getElementById("ds"),
    ec = document.getElementById("dc");
  if (!d) {
    es.innerHTML = "";
    ec.innerHTML = '<div class="lm">No DNSSEC data loaded.</div>';
    return;
  }
  const _avg = (rows) => {
    if (!rows || !rows.length) return null;
    const s = rows
      .map((r) => parseFloat(r.score))
      .filter((v) => !isNaN(v));
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  };
  const _vp = (rows) => {
    if (!rows || !rows.length) return null;
    return (
      (rows.filter((r) => r.dnssec_status === "Valid").length /
        rows.length) *
      100
    );
  };
  const valid = d.filter((r) => r.dnssec_status === "Valid").length;
  const scores = d
    .map((r) => parseFloat(r.score))
    .filter((v) => !isNaN(v));
  const avgRaw = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;
  const avg = avgRaw != null ? avgRaw.toFixed(1) : "—";
  const miss = d.filter((r) => r.dnssec_status === "Missing").length;
  const curPct = _vp(d),
    prevPct = _vp(dB);
  const curAvg = _avg(d),
    prevAvg = _avg(dB);
  const missPrev = dB
    ? dB.filter((r) => r.dnssec_status === "Missing").length
    : null;
  es.innerHTML =
    sCard("Institutions", d.length, "scanned") +
    sCard(
      "DNSSEC Valid",
      valid,
      Math.round(curPct) + "% adoption",
      renderDeltaPill(curPct, prevPct, { suffix: "%", decimals: 1 }),
    ) +
    sCard(
      "DNSSEC Missing",
      miss,
      "not configured",
      renderDeltaPill(miss, missPrev, { decimals: 0, inverse: true }),
    ) +
    sCard(
      "Average Score",
      avg,
      "out of 100",
      renderDeltaPill(curAvg, prevAvg),
    );
  ec.innerHTML =
    cCard("dst", "Adoption Status") +
    cCard("dgr", "Grade Distribution") +
    cCard("dnu", "Adoption by NUTS2") +
    cCard("dca", "Average Score by Category") +
    cCard("dns2", "Average Score by NUTS2") +
    cCard("dcs", "Adoption by Category");
  const stVC = valCounts(d, "dnssec_status"),
    stK = Object.keys(stVC);
  mkD(
    "dst",
    stK,
    stK.map((k) => stVC[k]),
    stK.map((k) =>
      k === "Valid" ? "#10b981" : k === "Missing" ? "#ef4444" : "#f59e0b",
    ),
  );
  _mkCmpGrade("dgr", d, dB);
  const nu = groupCount(d, "NUTS2_Label", "dnssec_status"),
    nk = Object.keys(nu).sort(),
    sts = [...new Set(d.map((r) => r.dnssec_status))];
  mkB(
    "dnu",
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
  const ac = avgBy(d, "Category", "score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "dca",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "score") : null,
    "#06b6d4",
  );
  const an = avgBy(d, "NUTS2_Label", "score"),
    nk2 = Object.keys(an).sort();
  _mkCmpBar(
    "dns2",
    nk2,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "score") : null,
    "#8b5cf6",
  );
  const cs = groupCount(d, "Category", "dnssec_status"),
    csk = Object.keys(cs),
    css = [...new Set(d.map((r) => r.dnssec_status))];
  mkB(
    "dcs",
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
  );
}

function bHeaders(d, dB) {
  const es = document.getElementById("shs"),
    ec = document.getElementById("shc");
  if (!d) {
    es.innerHTML = "";
    ec.innerHTML =
      '<div class="lm">No Security Headers data loaded.</div>';
    return;
  }
  const _avg = (rows) => {
    if (!rows || !rows.length) return null;
    const s = rows
      .map((r) => parseFloat(r.final_score))
      .filter((v) => !isNaN(v));
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  };
  const cur = _avg(d),
    prev = _avg(dB);
  const avg = cur != null ? cur.toFixed(1) : "—";
  const redCur = countTrue(d, "redirected_to_https"),
    redPrev = dB ? countTrue(dB, "redirected_to_https") : null;
  es.innerHTML =
    sCard("Institutions", d.length, "scanned") +
    sCard(
      "Average Score",
      avg,
      "out of 100",
      renderDeltaPill(cur, prev),
    ) +
    sCard(
      "HTTPS Redirect",
      redCur,
      "of " + d.length,
      renderDeltaPill(redCur, redPrev, { decimals: 0 }),
    ) +
    sCard(
      "Best Grade",
      Object.entries(gradeDistObj(d)).find(([, v]) => v > 0)?.[0] || "-",
      "highest",
    );
  ec.innerHTML =
    cCard("shg", "Grade Distribution") +
    cCard("shp", "Header Adoption") +
    cCard("shn", "Average Score by NUTS2") +
    cCard("shk", "Average Score by Category");
  _mkCmpGrade("shg", d, dB);
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
  const hv = hcols.map((c) => countTrue(d, c + "_presence"));
  mkH(
    "shp",
    hcols,
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
  );
  const an = avgBy(d, "NUTS2_Label", "final_score"),
    nk = Object.keys(an).sort();
  _mkCmpBar(
    "shn",
    nk,
    an,
    dB ? avgBy(dB, "NUTS2_Label", "final_score") : null,
    "#f59e0b",
  );
  const ac = avgBy(d, "Category", "final_score"),
    ck = Object.keys(ac);
  _mkCmpBar(
    "shk",
    ck,
    ac,
    dB ? avgBy(dB, "Category", "final_score") : null,
    "#06b6d4",
  );
}
