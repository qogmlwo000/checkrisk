// ============== 초기화 / 이벤트 ==============

function tick() {
  const now = new Date();

  document.getElementById("nowClock").textContent = window.hhmmss(now);
  document.getElementById("nowDate").textContent =
    now.getFullYear() + "." +
    String(now.getMonth() + 1).padStart(2, "0") + "." +
    String(now.getDate()).padStart(2, "0") + " " +
    ["일","월","화","수","목","금","토"][now.getDay()];

  const { date: activeExsd, label } = window.getActiveExsd(now);
  const remainMs = activeExsd.getTime() - now.getTime();
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
  const { label: activeLabel } = window.getActiveExsd(now);
  const sorted = [...window.EXSD_LIST].sort();
  sorted.forEach(t => {
    const span = document.createElement("span");
    span.className = "exsd-chip";
    if (t === activeLabel) span.classList.add("next");
    span.textContent = t;
    root.appendChild(span);
  });
}

function populateExsdSelector() {
  const sel = document.getElementById("exsdSelect");
  if (!sel) return;
  // 옵션 채우기 (기본 "자동" 옵션은 HTML에 이미 있음)
  const sorted = [...window.EXSD_LIST].sort();
  sorted.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = `Exsd ${t}`;
    sel.appendChild(opt);
  });
  sel.value = window.getSelectedExsdLabel();
  syncExsdSelectorStyle();

  sel.addEventListener("change", () => {
    window.setSelectedExsdLabel(sel.value);
    syncExsdSelectorStyle();
    tick();                       // 즉시 topbar/계산 갱신
    renderExsdChips();
    if (window.showToast) {
      const label = sel.value === "auto" ? "다음 Exsd (자동)" : `Exsd ${sel.value}`;
      window.showToast(`⏰ 기준 마감 시간 변경 → ${label}`, "ok");
    }
  });
}
function syncExsdSelectorStyle() {
  const sel = document.getElementById("exsdSelect");
  if (!sel) return;
  sel.classList.toggle("manual", sel.value !== "auto");
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
    const cap = e.target.closest(".capture-btn");
    if (cap) {
      const target = cap.dataset.target;
      const includeHeader = cap.dataset.includeHeader !== "false";
      window.captureToClipboard(target, { includeHeader });
      return;
    }
    const rst = e.target.closest(".reset-btn");
    if (rst) handleReset(rst);
  });
}

function handleReset(btn) {
  // 대상 결정 + 라벨
  let inputs = [], label = "";
  if (btn.dataset.resetGroup) {
    const grp = btn.dataset.resetGroup;
    const root = document.querySelector(`.pack-group[data-capture-group="${cssE(grp)}"]`);
    if (!root) return;
    inputs = root.querySelectorAll("input, select");
    label = grp;
  } else if (btn.dataset.resetTarget) {
    const t = document.getElementById(btn.dataset.resetTarget);
    if (!t) return;
    inputs = t.querySelectorAll("input, select");
    label = btn.dataset.resetTarget === "pickCard" ? "PICK" : btn.dataset.resetTarget;
  } else {
    return;
  }

  if (!confirm(`${label} 입력값을 모두 초기화하시겠습니까?\n(실시간 공유 중인 다른 사용자 화면도 함께 초기화됩니다.)`)) return;

  inputs.forEach(el => {
    if (el.tagName === "SELECT") el.value = "-";
    else el.value = "";
  });

  // 재계산 + 원격 동기화
  window.recomputePack && window.recomputePack();
  window.recomputePick && window.recomputePick();
  window.onLocalChange && window.onLocalChange();

  if (window.showToast) window.showToast(`✅ ${label} 초기화 완료`, "ok");
}
function cssE(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); }

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
  populateExsdSelector();

  tick();
  renderExsdChips();

  setInterval(tick, 1000);
  setInterval(renderExsdChips, 60 * 1000);
});
