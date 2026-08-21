// ============================================================================
// Navigation — two-level: scope × sub-tab
// ============================================================================
let dashDirty = true;

function navigate(scope, sub) {
  const newSub = sub !== undefined && sub !== null ? sub : "global";
  if (scope === activeScope && newSub === activeSub) return;
  activeScope = scope;
  activeSub = newSub;

  document
    .querySelectorAll(".scope-btn")
    .forEach((b) => b.classList.toggle("on", b.dataset.scope === scope));

  const subTabsEl = document.getElementById("sub-tabs");
  const isAdmin = scope === "_upload" || scope === "_report";
  if (subTabsEl) subTabsEl.style.display = isAdmin ? "none" : "";

  document
    .querySelectorAll(".sub-tab")
    .forEach((b) =>
      b.classList.toggle("on", b.dataset.sub === activeSub),
    );

  document
    .querySelectorAll(".sec")
    .forEach((s) => s.classList.remove("on"));
  const secId = isAdmin
    ? "sec-" + scope.slice(1)
    : `sec-${scope}-${activeSub}`;
  const sec = document.getElementById(secId);
  if (sec) sec.classList.add("on");

  if (!isAdmin) buildCurrent();
}

document
  .querySelectorAll(".scope-btn")
  .forEach((b) =>
    b.addEventListener("click", () =>
      navigate(b.dataset.scope, "global"),
    ),
  );

document
  .querySelectorAll(".sub-tab")
  .forEach((b) =>
    b.addEventListener("click", () =>
      navigate(activeScope, b.dataset.sub),
    ),
  );
