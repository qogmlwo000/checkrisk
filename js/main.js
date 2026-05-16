// ============== 초기화 / 이벤트 ==============

function tick() {
  const now = new Date();

  document.getElementById("nowClock").textContent = window.hhmmss(now);
  document.getElementById("nowDate").textContent =
    now.getFullYear() + "." +
    String(now.getMonth() + 1).padStart(2, "0") + "." +
    String(now.getDate()).padStart(2, "0") + " " +
    ["일","월","화","수","목","금","토"][now.getDay()];

  const { date: nextExsd, label } = window.getNextExsd(now);
  const remainMs = nextExsd.getTime() - now.getTime();
  document.getElementById("nextExsd").textContent = label;
  document.getElementById("countdown").textContent = window.msToCountdown(remainMs);

  const topbar = document.getElementById("topbar");
  const remainMin = remainMs / 60000;
  topbar.classList.toggle("urgent", remainMin <= window.THRESHOLDS.URGENT_REMAIN_MIN);
  topbar.classList.toggle("critical", remainMin <= window.THRESHOLDS.CRITICAL_REMAIN_MIN);

  if (window.recomputePack) window.recomputePack();
  if (window.recomputePick) window.recomputePick();
}

function renderExsdChips() {
  const root = document.getElementById("exsdChips");
  root.innerHTML = "";
  const now = new Date();
  const { label: nextLabel } = window.getNextExsd(now);
  const sorted = [...window.EXSD_LIST].sort();
  sorted.forEach(t => {
    const span = document.createElement("span");
    span.className = "exsd-chip";
    if (t === nextLabel) span.classList.add("next");
    span.textContent = t;
    root.appendChild(span);
  });
}

function bindInputs() {
  document.getElementById("packGroups").addEventListener("input", () => {
    window.recomputePack();
    window.onLocalChange && window.onLocalChange();
  });
  const pickTbody = document.getElementById("pickTbody");
  pickTbody.addEventListener("input", () => {
    window.recomputePick();
    window.onLocalChange && window.onLocalChange();
  });
  pickTbody.addEventListener("change", () => {
    window.recomputePick();
    window.onLocalChange && window.onLocalChange();
  });

  // 캡처 버튼 — body 전역 위임 (동적 생성 그룹 캡처 버튼 포함)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".capture-btn");
    if (!btn) return;
    const target = btn.dataset.target;
    const includeHeader = btn.dataset.includeHeader !== "false";
    window.captureToClipboard(target, { includeHeader });
  });
}

function bindTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  const select = (tab) => {
    btns.forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("main > .card").forEach(c => {
      c.hidden = c.id !== tab;
    });
    localStorage.setItem("checkrisk_tab", tab);
  };
  btns.forEach(b => b.addEventListener("click", () => select(b.dataset.tab)));
  const saved = localStorage.getItem("checkrisk_tab");
  select((saved === "packCard" || saved === "pickCard") ? saved : "packCard");
}

function bindThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const root = document.documentElement;
  const stored = localStorage.getItem("checkrisk_theme");
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  }
  syncThemeIcon();
  btn.addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("checkrisk_theme", next);
    syncThemeIcon();
  });
}
function syncThemeIcon() {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.textContent = root.getAttribute("data-theme") === "light" ? "☀️" : "🌙";
}

document.addEventListener("DOMContentLoaded", () => {
  window.renderPackTables();
  window.renderPickTable();
  bindInputs();
  bindTabs();
  bindThemeToggle();

  tick();
  renderExsdChips();

  setInterval(tick, 1000);
  setInterval(renderExsdChips, 60 * 1000);
});
