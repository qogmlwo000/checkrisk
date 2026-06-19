// ============== 종합 현황 요약 바 ==============
// PACK / PICK 계산 결과(window.__packRows, window.__pickRows)를 집계해
// 상단 요약 바를 갱신한다. recomputePack / recomputePick 끝에서 호출됨.

(function () {
  const PACK_HAS = ["prevQty", "prevHC", "currHC", "htp", "backlog", "allBacklog"];
  const PICK_HAS = ["multi", "singu", "currHC", "htp"];

  const hasAny = (row, fields) => fields.some(f => row[f + "_has"]);
  const num = n => (isFinite(n) ? Math.round(n) : 0).toLocaleString();

  function $(id) { return document.getElementById(id); }

  // 마감 여유 텍스트 (기존 표기 규칙과 동일)
  function marginText(base, marginMin) {
    if (!isFinite(marginMin)) return "—";
    return marginMin >= 0
      ? `${base} −${marginMin}분`
      : `${base} +${Math.abs(marginMin)}분 지연`;
  }

  window.refreshSummary = function () {
    const packRows = window.__packRows || [];
    const pickRows = window.__pickRows || [];

    // ---------- PACK 집계 ----------
    const packEntered = packRows.filter(({ row }) => hasAny(row, PACK_HAS));
    const packUsable  = packRows.filter(({ row }) => row.currHC > 0 && row.htp > 0);
    const packRisk    = packUsable.filter(({ calc }) => calc.shortage > 0);
    const packSlack   = packUsable.filter(({ calc }) => calc.shortage === 0 && calc.slack > 0);
    const totalShortage = packRisk.reduce((s, x) => s + x.calc.shortage, 0);
    const totalExtraHC  = packRisk.reduce((s, x) => s + x.calc.extraHC, 0);

    // ---------- PICK 집계 ----------
    const pickEntered = pickRows.filter(({ row }) => hasAny(row, PICK_HAS));
    const pickUsable  = pickRows.filter(({ row }) => row.currHC > 0 && row.htp > 0);
    const pickDanger  = pickUsable.filter(({ calc }) => calc.exsdBacklog > 0 && calc.cur.status === "danger");
    const pickWarn    = pickUsable.filter(({ calc }) => calc.exsdBacklog > 0 && calc.cur.status === "warn");

    const anyInput = packEntered.length > 0 || pickEntered.length > 0;

    // ---------- 최우선(가장 급한) 항목 — PACK·PICK 통합 ----------
    const candidates = [];
    packUsable.forEach(({ row, calc }) => {
      if (calc.etaClock && row.backlog > 0)
        candidates.push({ name: row.pp, tag: "PACK", base: "Exsd 10분전", margin: calc.marginMin });
    });
    pickUsable.forEach(({ row, calc }) => {
      if (calc.cur.etaClock && calc.exsdBacklog > 0)
        candidates.push({ name: row.floor, tag: "PICK", base: "Exsd", margin: calc.cur.marginMin });
    });
    candidates.sort((a, b) => a.margin - b.margin);
    const urgent = candidates[0] || null;

    // ---------- 전체 상태 결정 ----------
    let state = "idle", text = "대기 중", sub = "값을 입력하면 자동 집계됩니다";
    const dangerN = packRisk.length + pickDanger.length;
    const warnN   = pickWarn.length;
    if (!anyInput) {
      state = "idle"; text = "대기 중"; sub = "값을 입력하면 자동 집계됩니다";
    } else if (dangerN > 0) {
      state = "danger"; text = "위험";
      sub = `리스크 ${dangerN}건 · 충원 +${totalExtraHC} HC 필요`;
    } else if (warnN > 0) {
      state = "warn"; text = "주의";
      sub = `마감 임박 ${warnN}건 — 모니터링 권장`;
    } else {
      state = "safe"; text = "안전";
      sub = "전 항목 마감 여유 확보";
    }

    // ---------- DOM 갱신 ----------
    const bar = $("summaryBar");
    if (bar) bar.className = "summary-bar" + (state !== "idle" ? " is-" + state : "");

    const st = $("sumStatus");
    if (st) st.className = "sum-status s-" + state;
    setText("sumStatusText", text);
    setText("sumStatusSub", sub);

    // PACK 타일
    tile("tilePack", "tilePackVal", packRisk.length,
      packEntered.length === 0 ? "" : (packRisk.length > 0 ? "alert" : "good"),
      "tilePackSub",
      packEntered.length === 0 ? "대기 중"
        : (packRisk.length > 0 ? `여유 ${packSlack.length} PP` : "전 PP 안전"));

    // PICK 타일
    tile("tilePick", "tilePickVal", pickDanger.length,
      pickEntered.length === 0 ? "" : (pickDanger.length > 0 ? "alert" : (pickWarn.length > 0 ? "warn" : "good")),
      "tilePickSub",
      pickEntered.length === 0 ? "대기 중"
        : (pickWarn.length > 0 ? `주의 ${pickWarn.length}층` : "전 층 안전"));

    // 총 부족 Unit
    valTile("tileShortage", "tileShortageVal", totalShortage, "Unit",
      totalShortage > 0 ? "alert" : (packEntered.length ? "good" : ""));

    // 추가 필요 HC
    valTile("tileHC", "tileHCVal", totalExtraHC, "HC",
      totalExtraHC > 0 ? "alert" : (packEntered.length ? "good" : ""));

    // 최우선 항목
    const uTile = $("tileUrgent");
    if (urgent) {
      setHTML("tileUrgentVal", `${urgent.name} <small>${urgent.tag}</small>`);
      setText("tileUrgentSub", marginText(urgent.base, urgent.margin));
      if (uTile) uTile.className = "sum-tile urgent-item" + (urgent.margin < 0 ? " alert" : (urgent.margin < 20 ? " warn" : " good"));
    } else {
      setText("tileUrgentVal", "—");
      setText("tileUrgentSub", anyInput ? "마감 여유 확보" : "가장 급한 마감");
      if (uTile) uTile.className = "sum-tile urgent-item";
    }
  };

  function setText(id, t) { const el = $(id); if (el) el.textContent = t; }
  function setHTML(id, h) { const el = $(id); if (el) el.innerHTML = h; }

  function tile(tileId, valId, count, cls, subId, subTxt) {
    const t = $(tileId);
    if (t) t.className = "sum-tile" + (cls ? " " + cls : "");
    setText(valId, count);
    setText(subId, subTxt);
  }
  function valTile(tileId, valId, n, unit, cls) {
    const t = $(tileId);
    if (t) t.className = "sum-tile" + (cls ? " " + cls : "");
    setHTML(valId, `${num(n)}<small>${unit}</small>`);
  }
})();
