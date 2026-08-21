// ============================================================================
// Scanner type detection constants and functions
// ============================================================================

const FR = {
  dnssec: "DNSSEC Scanner",
  https: "HTTPS / TLS Scanner",
  headers: "Security Headers Scanner",
  source: "HEI Source List",
  llm: "AI Risk Analysis",
};
const GC = {
  "A+": "#059669",
  A: "#10b981",
  B: "#34d399",
  C: "#fbbf24",
  D: "#f97316",
  E: "#ef4444",
  F: "#dc2626",
};
const GO = ["A+", "A", "B", "C", "D", "E", "F"];
let charts = [];

// ==========================================================================
// Country detection from CSV row
// ==========================================================================
function detectCountry(rows) {
  // 1. explicit 'country' column
  for (const r of rows) {
    if (r.country && r.country.trim())
      return r.country.trim().toLowerCase();
  }
  // 2. infer from NUTS2 prefix (first 2 chars lowercase)
  for (const r of rows) {
    const nuts = r.NUTS2 || r.nuts2 || "";
    if (nuts.length >= 2) return nuts.slice(0, 2).toLowerCase();
  }
  return null;
}

// ==========================================================================
// Scanner type detection from columns
// ==========================================================================
function detect(cols) {
  const s = new Set(cols);
  if (s.has("dnssec_status") && s.has("non_existence_proof_method"))
    return "dnssec";
  if (s.has("SSLv2") && s.has("TLS1_3") && s.has("ocsp_stapling"))
    return "https";
  if (
    s.has("x-xss-protection_presence") &&
    s.has("x-frame-options_presence")
  ) {
    if (
      s.has("header_score_by_platform") &&
      s.has("final_score") &&
      s.has("grade")
    )
      return "headers";
    return "headers_raw";
  }
  if (
    s.has("Institution_Category_Standardized") &&
    s.has("Member_of_European_University_alliance") &&
    (s.has("NUTS2_Label") || s.has("NUTS2_Label_2016"))
  ) {
    if (
      !s.has("dnssec_status") &&
      !s.has("SSLv2") &&
      !s.has("x-xss-protection_presence")
    )
      return "source";
  }
  if (
    s.has("LLM_Risk_Level") &&
    s.has("Top_Recommendations") &&
    s.has("Executive_Summary")
  )
    return "llm";
  // POLON (Polish HEI registry) format: Id, Region, Name, Name_EN, Category, Url
  if (
    s.has("Name_EN") && s.has("Category") && s.has("Url") && s.has("Id") &&
    !s.has("dnssec_status") && !s.has("SSLv2") && !s.has("x-xss-protection_presence")
  )
    return "source";
  return null;
}
