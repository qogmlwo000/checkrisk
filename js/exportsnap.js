// ============== 내보내기(CSV) + 스냅샷(저장/복원) ==============

(function () {
  const SNAP_KEY = "checkrisk_snapshots";
  const SNAP_MAX = 20;

  function cssE(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }
  function $(id) { return document.getElementById(id); }

  // ---------- 상태 수집 / 적용 ----------
  function collectState() {
    const pack = {};
    document.querySelectorAll("#packGroups tr[data-pp]").forEach(tr => {
      const o = {};
      tr.querySelectorAll("input[data-field]").forEach(inp => { o[inp.dataset.field] = inp.value; });
      pack[tr.dataset.pp] = o;
    });
    const pick = {};
    document.querySelectorAll("#pickTbody tr[data-floor]").forEach(tr => {
      const o = {};
      tr.querySelectorAll("input[data-field], select[data-field]").forEach(inp => { o[inp.dataset.field] = inp.value; });
      pick[tr.dataset.floor] = o;
    });
    const singuEl = $("pickSinguTime");
    return { pack, pick, pickSingu: singuEl ? singuEl.value : "" };
  }

  function applyState(state) {
    if (!state) return;
    const { pack = {}, pick = {}, pickSingu = "" } = state;
    Object.entries(pack).forEach(([pp, vals]) => {
      const tr = document.querySelector(`#packGroups tr[data-pp="${cssE(pp)}"]`);
      if (!tr || !vals) return;
      Object.entries(vals).forEach(([f, v]) => {
        const el = tr.querySelector(`input[data-field="${f}"]`);
        if (el) el.value = v;
      });
    });
    Object.entries(pick).forEach(([fl, vals]) => {
      const tr = document.querySelector(`#pickTbody tr[data-floor="${cssE(fl)}"]`);
      if (!tr || !vals) return;
      Object.entries(vals).forEach(([f, v]) => {
        const el = tr.querySelector(`[data-field="${f}"]`);
        if (el) el.value = v;
      });
    });
    const singuEl = $("pickSinguTime");
    if (singuEl) {
      singuEl.value = pickSingu || "";
      window.setPickSinguLabel && window.setPickSinguLabel(singuEl.value);
      window.renderPickSinguClock && window.renderPickSinguClock();
    }
    window.recomputePack && window.recomputePack();
    window.recomputePick && window.recomputePick();
    window.onLocalChange && window.onLocalChange(); // 실시간 공유에도 반영
  }

  // ---------- CSV 내보내기 ----------
  function csvEscape(v) {
    const s = (v === null || v === undefined) ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function rowCSV(arr) { return arr.map(csvEscape).join(","); }

  function buildCSV() {
    window.recomputePack && window.recomputePack();
    window.recomputePick && window.recomputePick();
    const hhmm = window.hhmm || (d => "");
    const lines = [];
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${window.hhmmss ? window.hhmmss(now) : ""}`;

    lines.push(rowCSV([`Check Risk 내보내기`, stamp]));
    lines.push("");

    // PACK
    lines.push(rowCSV(["[PACK]"]));
    lines.push(rowCSV([
      "그룹","PP","전타임 출고량","전타임 출고인원","현 인원","HTP",
      "Exsd 10분전 예상Capa","Exsd Backlog","All Exsd Backlog",
      "리스크","부족 Unit","추가 HC","예상 완료"
    ]));
    (window.__packRows || []).forEach(({ row, calc }) => {
      const risk = calc.shortage > 0 ? "위험" : (row.currHC > 0 && row.htp > 0 ? "안전" : "-");
      lines.push(rowCSV([
        row.group, row.pp, row.prevQty, row.prevHC, row.currHC, row.htp,
        calc.expectedCapa, row.backlog, row.allBacklog,
        risk, calc.shortage || "", calc.extraHC || "",
        calc.etaClock ? hhmm(calc.etaClock) : ""
      ]));
    });
    lines.push("");

    // PICK
    lines.push(rowCSV(["[PICK]"]));
    const singu = window.getPickSinguLabel ? window.getPickSinguLabel() : "";
    if (singu) lines.push(rowCSV(["단일 설정 시각", singu]));
    lines.push(rowCSV([
      "Floor","Multi","Singulation","Exsd Backlog","현 인원","HTP",
      "예상 집품량","리스크(수동)","예상 완료(현재)","마감 여유(분)"
    ]));
    (window.__pickRows || []).forEach(({ row, calc }) => {
      const c = calc.cur || {};
      lines.push(rowCSV([
        row.floor, row.multi, row.singu, calc.exsdBacklog, row.currHC, row.htp,
        c.expectedPick != null ? c.expectedPick : "",
        row.riskManual && row.riskManual !== "-" ? row.riskManual : "",
        c.etaClock ? hhmm(c.etaClock) : "",
        isFinite(c.marginMin) ? c.marginMin : ""
      ]));
    });

    return "﻿" + lines.join("\r\n"); // BOM → Excel 한글 깨짐 방지
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function doExport() {
    const now = new Date();
    const fn = `checkrisk_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}.csv`;
    try {
      download(fn, buildCSV());
      window.showToast && window.showToast("📥 CSV 내보내기 완료 — Excel에서 열어보세요.", "ok");
    } catch (e) {
      console.error(e);
      window.showToast && window.showToast("내보내기 실패: " + (e.message || e), "error");
    }
  }

  // ---------- 스냅샷 저장소 ----------
  function loadSnaps() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveSnaps(arr) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr.slice(0, SNAP_MAX))); }
    catch (e) {}
  }

  function countFilled(state) {
    let n = 0;
    Object.values(state.pack || {}).forEach(o => Object.values(o).forEach(v => { if (v !== "" && v != null) n++; }));
    Object.values(state.pick || {}).forEach(o => Object.values(o).forEach(v => { if (v !== "" && v != null && v !== "-") n++; }));
    return n;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const days = ["일","월","화","수","목","금","토"];
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} (${days[d.getDay()]}) ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function renderList() {
    const list = $("snapList");
    if (!list) return;
    const snaps = loadSnaps();
    if (snaps.length === 0) {
      list.innerHTML = `<div class="snap-empty">저장된 스냅샷이 없습니다.<br/>현재 입력 상태를 저장해 두면 언제든 복원할 수 있어요.</div>`;
      return;
    }
    list.innerHTML = "";
    snaps.forEach(snap => {
      const item = document.createElement("div");
      item.className = "snap-item";
      item.innerHTML = `
        <div class="si-main">
          <div class="si-name">${escapeHTML(snap.name)}</div>
          <div class="si-time">${fmtTime(snap.ts)}</div>
        </div>
        <span class="si-badge">${snap.filled || 0}칸</span>
        <button class="snap-btn" data-restore="${snap.id}">↩ 복원</button>
        <button class="snap-btn danger" data-del="${snap.id}" title="삭제">🗑</button>`;
      list.appendChild(item);
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
  }

  function saveCurrent() {
    const nameEl = $("snapName");
    const state = collectState();
    const filled = countFilled(state);
    if (filled === 0) {
      window.showToast && window.showToast("저장할 입력값이 없습니다.", "error");
      return;
    }
    const now = new Date();
    const auto = `${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")} 스냅샷`;
    const name = (nameEl && nameEl.value.trim()) || auto;
    const snaps = loadSnaps();
    snaps.unshift({ id: "snap_" + now.getTime().toString(36), name, ts: now.getTime(), filled, state });
    saveSnaps(snaps);
    if (nameEl) nameEl.value = "";
    renderList();
    window.showToast && window.showToast(`📸 '${name}' 저장됨`, "ok");
  }

  function bind() {
    const exportBtn = $("exportBtn");
    const snapBtn   = $("snapshotBtn");
    const modal     = $("snapModal");
    const closeBtn  = $("snapClose");
    const saveBtn   = $("snapSaveBtn");
    const nameEl    = $("snapName");
    const list      = $("snapList");

    if (exportBtn) exportBtn.addEventListener("click", doExport);

    const openModal = () => { if (modal) { modal.hidden = false; renderList(); setTimeout(() => nameEl && nameEl.focus(), 30); } };
    const closeModal = () => { if (modal) modal.hidden = true; };

    if (snapBtn) snapBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (modal) modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && modal && !modal.hidden) closeModal(); });

    if (saveBtn) saveBtn.addEventListener("click", saveCurrent);
    if (nameEl) nameEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveCurrent(); } });

    if (list) list.addEventListener("click", e => {
      const rb = e.target.closest("[data-restore]");
      const db = e.target.closest("[data-del]");
      if (rb) {
        const snap = loadSnaps().find(s => s.id === rb.dataset.restore);
        if (!snap) return;
        if (!confirm(`'${snap.name}' 스냅샷으로 복원하시겠습니까?\n현재 입력값을 덮어쓰며, 실시간 공유 중인 다른 화면에도 반영됩니다.`)) return;
        applyState(snap.state);
        closeModal();
        window.showToast && window.showToast(`↩ '${snap.name}' 복원 완료`, "ok");
      } else if (db) {
        const snaps = loadSnaps().filter(s => s.id !== db.dataset.del);
        saveSnaps(snaps);
        renderList();
      }
    });
  }

  window.initExportSnap = bind;
})();
