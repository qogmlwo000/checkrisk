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
  document.getElementById("nextExsd").textContent = "Exsd " + label;
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

function bindPickSingu() {
  const wrap   = document.getElementById("pickSinguClock");
  if (!wrap) return;
  const hidden = document.getElementById("pickSinguTime"); // 진실원본 "HH:MM"
  const hEl    = document.getElementById("pickSinguH");
  const mEl    = document.getElementById("pickSinguM");
  const clear  = document.getElementById("pickSinguClear");

  const pad = n => String(n).padStart(2, "0");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // hidden("HH:MM") → 화면 세그먼트 동기화 (부수효과 없음)
  function render() {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hidden.value || "");
    if (m) {
      if (document.activeElement !== hEl) hEl.value = pad(+m[1]);
      if (document.activeElement !== mEl) mEl.value = pad(+m[2]);
      wrap.classList.add("set");
    } else {
      if (document.activeElement !== hEl) hEl.value = "";
      if (document.activeElement !== mEl) mEl.value = "";
      wrap.classList.remove("set");
    }
  }
  window.renderPickSinguClock = render;

  // 세그먼트 → hidden 반영 + 영속/재계산/원격동기화
  function commit(toast) {
    const h = parseInt(hEl.value, 10);
    const m = parseInt(mEl.value, 10);
    const val = (Number.isFinite(h) && Number.isFinite(m))
      ? pad(clamp(h, 0, 23)) + ":" + pad(clamp(m, 0, 59))
      : "";
    hidden.value = val;
    window.setPickSinguLabel(val);
    wrap.classList.toggle("set", !!val);
    window.recomputePick && window.recomputePick();
    window.onLocalChange && window.onLocalChange(hidden);
    if (toast && window.showToast) {
      window.showToast(val ? `🕒 단일 설정 시각 → ${val}` : "🕒 단일 설정 시각 해제", "ok");
    }
  }

  function onSegInput(el, isHour) {
    el.value = el.value.replace(/\D/g, "").slice(0, 2);
    if (isHour && el.value.length === 2) { mEl.focus(); mEl.select(); }
    commit(false); // 둘 중 하나라도 비면 해제, 둘 다 차면 반영
  }

  // ↑↓ / 휠 증감 (랩어라운드, 비어있으면 0부터)
  function bump(el, isHour, dir) {
    const max = isHour ? 23 : 59;
    let cur = parseInt(el.value, 10);
    if (!Number.isFinite(cur)) cur = dir > 0 ? -1 : max + 1;
    let next = cur + dir;
    if (next > max) next = 0;
    if (next < 0) next = max;
    el.value = pad(next);
    const other = isHour ? mEl : hEl;       // 다른 칸이 비면 00으로 채워 유효화
    if (other.value === "") other.value = "00";
    commit(false);
  }

  [[hEl, true], [mEl, false]].forEach(([el, isHour]) => {
    el.addEventListener("input",  () => onSegInput(el, isHour));
    el.addEventListener("change", () => commit(true));
    el.addEventListener("focus",  () => el.select());
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp")   { e.preventDefault(); bump(el, isHour, +1); }
      if (e.key === "ArrowDown") { e.preventDefault(); bump(el, isHour, -1); }
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault(); bump(el, isHour, e.deltaY < 0 ? +1 : -1);
    }, { passive: false });
  });

  // 라벨/아이콘 영역 클릭 → 시 입력 포커스
  wrap.addEventListener("click", (e) => {
    if (e.target.closest(".singu-ico, .singu-label")) hEl.focus();
  });

  if (clear) clear.addEventListener("click", () => {
    hEl.value = ""; mEl.value = ""; commit(true);
  });

  // 초기값 복원 (localStorage) — firebase 구독이 오면 이후 덮어씀
  let stored = "";
  try { stored = localStorage.getItem("checkrisk_pick_singu") || ""; } catch (e) {}
  hidden.value = stored;
  render();
}

function bindInputs() {
  document.getElementById("packGroups").addEventListener("input", (e) => {
    window.recomputePack();
    window.onLocalChange && window.onLocalChange(e.target);
  });
  const pickTbody = document.getElementById("pickTbody");
  pickTbody.addEventListener("input", (e) => {
    window.recomputePick();
    window.onLocalChange && window.onLocalChange(e.target);
  });
  pickTbody.addEventListener("change", (e) => {
    window.recomputePick();
    window.onLocalChange && window.onLocalChange(e.target);
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

  // PICK 초기화 시 단일 설정 시각도 함께 해제 (localStorage + 시계 표시 갱신)
  if (btn.dataset.resetTarget === "pickCard") {
    const si = document.getElementById("pickSinguTime");
    if (si) si.value = "";
    window.setPickSinguLabel && window.setPickSinguLabel("");
    window.renderPickSinguClock && window.renderPickSinguClock();
  }

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
  bindPickSingu();
  bindTabs();
  bindThemeToggle();
  populateExsdSelector();

  tick();
  renderExsdChips();

  setInterval(tick, 1000);
  setInterval(renderExsdChips, 60 * 1000);
});
