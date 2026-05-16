// ============== PACK 렌더 / 계산 ==============

const PACK_COLS = [
  { label: "PP",                            width: "11%" },
  { label: "전 타임<br/>출고량",            width: "9%"  },
  { label: "전 타임<br/>출고 인원",         width: "8%"  },
  { label: "현 인원",                       width: "8%"  },
  { label: "HTP",                           width: "7%"  },
  { label: "Exsd 10분전<br/>예상 Capa",     width: "11%" },
  { label: "Exsd Backlog",                  width: "10%" },
  { label: "All Exsd<br/>Backlog",          width: "10%" },
  { label: "리스크 유/무",                  width: "26%" }
];

const PACK_FIELDS = ["prevQty", "prevHC", "currHC", "htp", "backlog", "allBacklog"];

// 행 id 만들기 (PP 이름 정규화)
function ppId(name) {
  return "pack_" + name.replace(/[^\w가-힣]/g, "_");
}

// 초기 렌더
window.renderPackTables = function () {
  const root = document.getElementById("packGroups");
  root.innerHTML = "";

  window.PACK_GROUPS.forEach(group => {
    const wrap = document.createElement("div");
    wrap.className = "pack-group";
    wrap.dataset.captureGroup = group.name;
    wrap.id = "packGroup_" + group.name.replace(/[^\w가-힣]/g, "_");

    const title = document.createElement("div");
    title.className = "pack-group-title";

    const titleInner = document.createElement("span");
    titleInner.className = "pack-group-title-inner";

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "group-collapse-btn";
    collapseBtn.dataset.collapseGroup = group.name;
    collapseBtn.textContent = "▼ 접기";
    titleInner.appendChild(collapseBtn);

    const titleText = document.createElement("span");
    titleText.textContent = group.name;
    titleInner.appendChild(titleText);
    title.appendChild(titleInner);

    const grpCapBtn = document.createElement("button");
    grpCapBtn.className = "capture-btn capture-btn-sm";
    grpCapBtn.dataset.target = wrap.id;
    grpCapBtn.dataset.includeHeader = "true";
    grpCapBtn.textContent = `📋 ${group.name} 캡처 복사`;
    title.appendChild(grpCapBtn);

    wrap.appendChild(title);

    const body = document.createElement("div");
    body.className = "pack-group-body";
    wrap.appendChild(body);

    const tbl = document.createElement("table");
    tbl.className = "pack-table";

    // colgroup for fixed column widths
    const cg = document.createElement("colgroup");
    PACK_COLS.forEach(c => {
      const col = document.createElement("col");
      col.style.width = c.width;
      cg.appendChild(col);
    });
    tbl.appendChild(cg);

    // thead
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    PACK_COLS.forEach(c => {
      const th = document.createElement("th");
      th.innerHTML = c.label;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

    // tbody
    const tbody = document.createElement("tbody");
    group.pps.forEach(pp => {
      const tr = document.createElement("tr");
      tr.id = ppId(pp);
      tr.dataset.pp = pp;
      tr.dataset.group = group.name;

      // PP 셀
      const ppTd = document.createElement("td");
      ppTd.className = "pp-cell";
      ppTd.textContent = pp;
      tr.appendChild(ppTd);

      // 입력 칸: 전 타임 출고량, 전 타임 출고 인원, 현 인원, HTP
      ["prevQty", "prevHC", "currHC", "htp"].forEach(field => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.dataset.field = field;
        input.placeholder = "-";
        td.appendChild(input);
        tr.appendChild(td);
      });

      // 자동 계산 칸: Exsd 10분전 출고 예상 Capa
      const capaTd = document.createElement("td");
      capaTd.className = "computed muted";
      capaTd.dataset.cell = "capa";
      capaTd.textContent = "—";
      tr.appendChild(capaTd);

      // 입력 칸: Exsd Backlog, All Exsd Backlog
      ["backlog", "allBacklog"].forEach(field => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.dataset.field = field;
        input.placeholder = "-";
        td.appendChild(input);
        tr.appendChild(td);
      });

      // 리스크 셀 (자동)
      const riskTd = document.createElement("td");
      riskTd.className = "risk-cell";
      riskTd.dataset.cell = "risk";
      riskTd.textContent = "—";
      tr.appendChild(riskTd);

      tbody.appendChild(tr);

      // 설명 행 (전체 칼럼 span)
      const trDesc = document.createElement("tr");
      const descTd = document.createElement("td");
      descTd.colSpan = PACK_COLS.length;
      descTd.className = "pack-row-desc";
      descTd.dataset.cell = "desc";
      descTd.textContent = "수치를 입력하면 자동 분석이 표시됩니다.";
      trDesc.appendChild(descTd);
      tbody.appendChild(trDesc);
    });

    tbl.appendChild(tbody);
    body.appendChild(tbl);
    root.appendChild(wrap);

    // 접힘 상태 복원
    const stored = localStorage.getItem("checkrisk_pack_collapsed_" + group.name);
    if (stored === "1") setGroupCollapsed(wrap, collapseBtn, true);
    collapseBtn.addEventListener("click", () => {
      const next = !wrap.classList.contains("collapsed");
      setGroupCollapsed(wrap, collapseBtn, next);
      localStorage.setItem("checkrisk_pack_collapsed_" + group.name, next ? "1" : "0");
    });
  });
};

function setGroupCollapsed(wrap, btn, collapsed) {
  wrap.classList.toggle("collapsed", collapsed);
  btn.textContent = collapsed ? "▶ 펼치기" : "▼ 접기";
}

// 한 행 데이터 읽기
function readPackRow(tr) {
  const r = { pp: tr.dataset.pp, group: tr.dataset.group };
  PACK_FIELDS.forEach(f => {
    const el = tr.querySelector(`input[data-field="${f}"]`);
    const v = el ? parseFloat(el.value) : NaN;
    r[f] = isFinite(v) ? v : 0;
    r[f + "_has"] = el && el.value !== "";
  });
  return r;
}

// 한 행 계산
function computePackRow(row, remainH_to_pre_exsd, preExsd, now) {
  const { currHC, htp, backlog, allBacklog } = row;
  const h = Math.max(0, remainH_to_pre_exsd);
  const ratePerH = currHC * htp;                       // 시간당 처리량 (Unit/h)
  const expectedCapa = Math.round(ratePerH * h);
  const shortage = Math.max(0, backlog - expectedCapa);
  let extraHC = 0;
  if (shortage > 0) {
    if (h > 0 && htp > 0) extraHC = Math.ceil(shortage / (htp * h));
    else if (htp > 0)     extraHC = Math.ceil(shortage / htp);
    else                  extraHC = 0;
  }
  const slack = expectedCapa - backlog;
  const allBacklogHours = ratePerH > 0 ? allBacklog / ratePerH : Infinity;

  // ETA: 현 인원으로 backlog 처리 완료 시각
  let etaClock = null, marginMin = -Infinity, etaStatus = "idle";
  if (ratePerH > 0 && backlog > 0) {
    const etaMin = (backlog / ratePerH) * 60;
    etaClock = window.addMinutes(now, etaMin);
    marginMin = window.diffMin(preExsd, etaClock);
    if      (marginMin >= 5)  etaStatus = "safe";
    else if (marginMin >= 0)  etaStatus = "warn";
    else                      etaStatus = "danger";
  } else if (ratePerH > 0 && backlog === 0) {
    etaClock = now;
    marginMin = window.diffMin(preExsd, now);
    etaStatus = "safe";
  }

  return { expectedCapa, shortage, extraHC, slack, ratePerH, allBacklogHours,
           remainH: h, preExsd, etaClock, marginMin, etaStatus };
}

// 렌더 한 행 업데이트
function updatePackRowUI(tr, row, calc) {
  const capaCell = tr.querySelector('[data-cell="capa"]');
  const riskCell = tr.querySelector('[data-cell="risk"]');
  // 설명행은 다음 tr
  const descRow = tr.nextElementSibling;
  const descCell = descRow ? descRow.querySelector('[data-cell="desc"]') : null;

  const anyInput = PACK_FIELDS.some(f => row[f + "_has"]);

  if (calc.remainH <= 0 || (row.currHC === 0 && row.htp === 0)) {
    capaCell.innerHTML = anyInput ? "0" : "—";
    capaCell.classList.toggle("muted", !anyInput);
  } else {
    let html = `<span class="dual-line"><b>${calc.expectedCapa.toLocaleString()}</b>`;
    if (calc.etaClock) {
      const sign = calc.marginMin >= 0 ? `−${calc.marginMin}분` : `+${Math.abs(calc.marginMin)}분 지연`;
      html += `<span class="eta-pack ${calc.etaStatus}">ETA ${window.hhmm(calc.etaClock)} (${sign})</span>`;
    }
    html += `</span>`;
    capaCell.innerHTML = html;
    capaCell.classList.remove("muted");
  }

  if (!anyInput) {
    riskCell.className = "risk-cell";
    riskCell.textContent = "—";
    if (descCell) {
      descCell.className = "pack-row-desc";
      descCell.textContent = "수치를 입력하면 자동 분석이 표시됩니다.";
    }
    return;
  }

  const ratePerHTxt = `${calc.ratePerH.toLocaleString()} Unit/h`;
  const remainTxt = `${formatHoursMin(calc.remainH)}`;       // 예: 1시간 35분
  const preExsdTxt = calc.preExsd ? window.hhmm(calc.preExsd) : "";
  const allBacklogTime = isFinite(calc.allBacklogHours) ? formatHoursMin(calc.allBacklogHours) : "—";

  if (calc.shortage > 0) {
    riskCell.className = "risk-cell risk-on";
    riskCell.innerHTML = `<span class="dual-line">🚨Risk ─ <b>${calc.shortage.toLocaleString()} Unit</b> / <b>+${calc.extraHC} HC</b> 충원 필요 추정<span class="sub">(Exsd 10분전 ${preExsdTxt} 기준)</span></span>`;
    if (descCell) {
      descCell.className = "pack-row-desc has-risk";
      descCell.innerHTML =
        `<span class="basis">Exsd 10분전(${preExsdTxt}) 기준</span>` +
        `현 <b>${row.currHC}명</b> × HTP <b>${row.htp}</b> = <b>${ratePerHTxt}</b>, ` +
        `남은 <b>${remainTxt}</b> 동안 <b>${calc.expectedCapa.toLocaleString()} Unit</b> 출고 가능 → ` +
        `Backlog <b>${row.backlog.toLocaleString()}</b> 중 <b class="k-risk">${calc.shortage.toLocaleString()} Unit 부족</b> → ` +
        `<b class="k-risk">+${calc.extraHC} HC</b> 더 투입 시 마감 가능. ` +
        `All Exsd Backlog <b>${row.allBacklog.toLocaleString()}</b>은 현 인원 그대로면 약 <b>${allBacklogTime}</b> 소요.`;
    }
  } else {
    riskCell.className = "risk-cell risk-off";
    const slackTxt = calc.slack > 0 ? `여유 ${calc.slack.toLocaleString()} Unit` : "동률";
    riskCell.textContent = `✅ 안전 (${slackTxt})`;
    if (descCell) {
      descCell.className = "pack-row-desc";
      descCell.innerHTML =
        `<span class="basis">Exsd 10분전(${preExsdTxt}) 기준</span>` +
        `현 <b>${row.currHC}명</b> × HTP <b>${row.htp}</b> = <b>${ratePerHTxt}</b>, ` +
        `남은 <b>${remainTxt}</b> 동안 <b>${calc.expectedCapa.toLocaleString()} Unit</b> 출고 가능 → ` +
        `Backlog <b>${row.backlog.toLocaleString()}</b> 대비 ` +
        (calc.slack > 0 ? `<b class="k-ok">+${calc.slack.toLocaleString()} Unit 여유</b>. ` : `동률. `) +
        `All Exsd Backlog <b>${row.allBacklog.toLocaleString()}</b>은 현 인원 그대로면 약 <b>${allBacklogTime}</b> 소요.`;
    }
  }
}

// ============== 🤖 AI 가이드 ==============
function renderAIGuide(rows, now, preExsd) {
  const body = document.getElementById("aiGuideBody");
  if (!body) return;

  const usable = rows.filter(({ row }) => row.currHC > 0 && row.htp > 0);
  if (usable.length === 0) {
    body.innerHTML = `<div class="muted">현 인원·HTP를 가진 PP가 없습니다. 값을 입력하면 AI가 운영안을 제시합니다.</div>`;
    return;
  }

  // 1) 부족/여유 분리
  const shortages = usable
    .filter(({ calc }) => calc.shortage > 0)
    .map(({ row, calc }) => ({ row, calc }))
    .sort((a, b) => b.calc.shortage - a.calc.shortage);

  const slacks = usable
    .filter(({ calc, row }) => calc.slack > 0 && row.currHC > 1)
    .map(({ row, calc }) => {
      const h = Math.max(0.01, calc.remainH);
      let freeHC = Math.floor(calc.slack / (row.htp * h));
      freeHC = Math.min(freeHC, Math.max(0, Math.floor(row.currHC / 2)));
      return { row, calc, freeHC };
    })
    .filter(s => s.freeHC > 0)
    .sort((a, b) => b.freeHC - a.freeHC);

  // 2) 전체 합계
  const totalAll = rows.reduce((s, x) => s + (x.row.allBacklog || 0), 0);
  const totalCurrHC = usable.reduce((s, x) => s + x.row.currHC, 0);
  const weightedHTP = totalCurrHC > 0
    ? usable.reduce((s, x) => s + x.row.htp * x.row.currHC, 0) / totalCurrHC
    : 0;
  const totalRate = usable.reduce((s, x) => s + x.calc.ratePerH, 0);
  const allHours = totalRate > 0 ? totalAll / totalRate : Infinity;

  // 다음 Exsd부터 마지막 Exsd까지의 가용 시간 (대략 — 다음 Exsd 기준 표시)
  const minToPreExsd = Math.max(0, window.diffMin(preExsd, now));

  let html = "";

  // === 섹션 1: 즉시 조치 (Exsd 10분전 마감) ===
  html += `<div class="gi-section"><div class="gi-section-title">⏱ 즉시 조치 (Exsd 10분전 ${window.hhmm(preExsd)} 기준)</div>`;
  if (shortages.length === 0) {
    html += `<div class="gi-item"><span class="k-ok">전 PP 마감 여유 확보</span> — 별도 충원 불필요.</div>`;
  } else {
    shortages.slice(0, 3).forEach((sh, idx) => {
      const rank = ["🥇 1순위(긴급)","🥈 2순위","🥉 3순위"][idx] || `${idx+1}순위`;
      html += `<div class="gi-item">${rank}: <span class="pp-chip">${sh.row.pp}</span> ` +
              `<span class="k-risk">${sh.calc.shortage.toLocaleString()} Unit 부족</span> → ` +
              `<b>+${sh.calc.extraHC} HC</b> 필요`;

      // 어디서 가져올지 추천 (그리디)
      let need = sh.calc.extraHC;
      const picks = [];
      slacks.forEach(sl => {
        if (need <= 0) return;
        if (sl.freeHC <= 0) return;
        const move = Math.min(need, sl.freeHC);
        picks.push({ from: sl.row.pp, hc: move });
        sl._reserved = (sl._reserved || 0) + move; // 임시 예약 (다른 부족 PP와 중복 회피)
        sl.freeHC -= move;
        need -= move;
      });
      if (picks.length > 0) {
        const moves = picks.map(p => `<span class="pp-chip">${p.from}</span> → <b>${p.hc} HC</b>`).join(", ");
        html += `<div style="margin-left:14px;margin-top:2px;font-size:11.5px;color:var(--text-dim);">↳ 이동 추천: ${moves}${need > 0 ? `, <span class="k-warn">외부 ${need} HC 추가 필요</span>` : ""}</div>`;
      } else {
        html += `<div style="margin-left:14px;margin-top:2px;font-size:11.5px;color:var(--text-dim);">↳ 내부 여유 PP 없음 — <span class="k-warn">외부 ${need} HC 투입 필요</span></div>`;
      }
      html += `</div>`;
    });
  }
  html += `</div>`;

  // === 섹션 2: All Exsd Backlog 운영 시야 ===
  if (totalAll > 0) {
    html += `<div class="gi-section"><div class="gi-section-title">🗂 All Exsd Backlog 운영 시야</div>`;
    html += `<div class="gi-item">총 PACK All Backlog <b>${totalAll.toLocaleString()} Unit</b> · 현 PACK 가용 인원 <b>${totalCurrHC}명</b> · 평균 HTP <b>${Math.round(weightedHTP)}</b> → 시간당 <b>${Math.round(totalRate).toLocaleString()} Unit/h</b>.</div>`;
    if (isFinite(allHours)) {
      html += `<div class="gi-item">현 인원 그대로면 All Backlog 처리에 <b>약 ${formatHoursMin(allHours)}</b> 소요 예상.`;
      // 다음 Exsd가 아닌 그 이후 작업도 포함되므로 단순히 다음 Exsd까지의 비교는 부정확.
      // 그래도 다음 Exsd 기준 가용 시간과 비교
      const allMin = Math.round(allHours * 60);
      if (allMin <= minToPreExsd) {
        html += ` <span class="k-ok">⇒ 다음 Exsd 안에 전량 처리 가능.</span>`;
      } else {
        html += ` <span class="k-warn">⇒ 다음 Exsd(10분전) 안에 전량 처리는 어려움. 누적 작업 분산 필요.</span>`;
      }
      html += `</div>`;
    }
    // 카테고리별 분포
    const groupAgg = {};
    rows.forEach(({ row, calc }) => {
      if (!groupAgg[row.group]) groupAgg[row.group] = { all: 0, rate: 0, hc: 0 };
      groupAgg[row.group].all  += row.allBacklog || 0;
      groupAgg[row.group].rate += calc.ratePerH;
      groupAgg[row.group].hc   += row.currHC;
    });
    const segs = Object.entries(groupAgg)
      .filter(([_, v]) => v.all > 0 || v.hc > 0)
      .map(([g, v]) => {
        const h = v.rate > 0 ? v.all / v.rate : 0;
        return `<span class="pp-chip">${g}</span> ${v.all.toLocaleString()}U · ${v.hc}명 · 시간당 ${Math.round(v.rate).toLocaleString()}/h (${v.all > 0 ? formatHoursMin(h) : "—"})`;
      });
    if (segs.length) {
      html += `<div class="gi-item">카테고리 분포: ${segs.join(" · ")}</div>`;
    }
  }
  html += `</div>`;

  // === 섹션 3: 권장 운영안 ===
  html += `<div class="gi-section"><div class="gi-section-title">📋 권장 운영안</div>`;
  if (shortages.length > 0) {
    const top = shortages[0];
    html += `<div class="gi-item"><b>① 1차 액션</b> — 즉시 <span class="pp-chip">${top.row.pp}</span> 충원 우선 처리. 보강 후 마감 ETA 재확인.</div>`;
  } else {
    html += `<div class="gi-item"><b>① 현 상태 유지</b> — 모든 PP 마감 여유 확보. 인원 재배치 불필요.</div>`;
  }
  if (slacks.length > 0 && shortages.length > 0) {
    const donors = slacks.slice(0, 2).map(s => `<span class="pp-chip">${s.row.pp}</span>(여유 ${s.freeHC + (s._reserved||0)}명)`).join(", ");
    html += `<div class="gi-item"><b>② 인원 재배치</b> — ${donors}는 현재 마감 여유가 있어 충원 자원으로 활용 권장.</div>`;
  }
  if (totalAll > 0 && isFinite(allHours)) {
    const allMin = Math.round(allHours * 60);
    if (allMin > minToPreExsd) {
      html += `<div class="gi-item"><b>③ 누적 분산</b> — All Backlog가 다음 Exsd 한 타임 내 처리 불가. 다음 타임으로 일부 이월/분산 처리 또는 추가 인력 투입 고려.</div>`;
    } else {
      html += `<div class="gi-item"><b>③ 마감 안정</b> — 다음 Exsd 내 All Backlog 처리 가능. 현 운영 유지하며 모니터링.</div>`;
    }
  }
  html += `</div>`;

  body.innerHTML = html;
}

// hours(소수) → "X시간 Y분" 또는 "Y분"
function formatHoursMin(hours) {
  if (!isFinite(hours) || hours < 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

// PACK 전체 재계산
window.recomputePack = function () {
  const now = new Date();
  const { date: nextExsd } = window.getNextExsd(now);
  const preExsd = new Date(nextExsd.getTime() - window.THRESHOLDS.PACK_PRE_EXSD_MIN * 60000);
  const remainH = Math.max(0, window.diffHour(preExsd, now));

  const rows = [];
  document.querySelectorAll("#packGroups tr[data-pp]").forEach(tr => {
    const row = readPackRow(tr);
    const calc = computePackRow(row, remainH, preExsd, now);
    updatePackRowUI(tr, row, calc);
    rows.push({ tr, row, calc });
  });

  renderPackRecommend(rows);
  renderAIGuide(rows, now, preExsd);
};

// ============== PACK 충원 추천 (카테고리 교차 허용) ==============
function renderPackRecommend(rows) {
  const list = document.getElementById("packRecommendList");

  // 입력 자체가 거의 없는 상태
  const anyEntered = rows.some(({ row }) => PACK_FIELDS.some(f => row[f + "_has"]));
  if (!anyEntered) {
    list.innerHTML = `<span class="muted">값을 입력하면 자동으로 추천이 표시됩니다.</span>`;
    return;
  }

  // 여유/부족 분리 — currHC와 htp가 모두 의미있는 행만 (HC>=1 필요)
  const usable = rows.filter(({ row }) => row.currHC > 0 && row.htp > 0);
  const shortages = usable
    .filter(({ calc }) => calc.shortage > 0)
    .map(({ row, calc }) => ({ row, calc, needHC: calc.extraHC }))
    .sort((a, b) => b.needHC - a.needHC);

  const slacks = usable
    .filter(({ calc, row }) => calc.slack > 0 && row.currHC > 1)
    // 여유 HC = floor(slack / (htp * remainH)), 최소 1, 단 본인 currHC-1 까지만
    .map(({ row, calc }) => {
      const h = Math.max(0.01, calc.remainH);
      let freeHC = Math.floor(calc.slack / (row.htp * h));
      // 보수적: 본인 인원의 절반 이하만 이동, 최소 1명은 양보 가능 시
      freeHC = Math.min(freeHC, Math.max(0, Math.floor(row.currHC / 2)));
      return { row, calc, freeHC };
    })
    .filter(s => s.freeHC > 0)
    .sort((a, b) => b.freeHC - a.freeHC);

  if (shortages.length === 0) {
    list.innerHTML = `<span class="muted">현재 입력 기준 PACK 전 PP가 안전 — 별도 충원 추천 없음.</span>`;
    return;
  }
  if (slacks.length === 0) {
    list.innerHTML =
      `<span class="muted">여유 PP가 없어 자체 충원이 불가합니다. </span>` +
      `<b>외부 인원 추가 투입 필요</b> ─ 총 부족 ${shortages.reduce((s, x) => s + x.calc.shortage, 0).toLocaleString()} Unit / ${shortages.reduce((s, x) => s + x.needHC, 0)} HC 추정.`;
    return;
  }

  // 그리디 매칭
  const moves = [];
  for (const sh of shortages) {
    let need = sh.needHC;
    for (const sl of slacks) {
      if (need <= 0) break;
      if (sl.freeHC <= 0) continue;
      const move = Math.min(need, sl.freeHC);
      moves.push({ from: sl.row.pp, fromGroup: sl.row.group, to: sh.row.pp, toGroup: sh.row.group, hc: move });
      sl.freeHC -= move;
      need -= move;
    }
    if (need > 0) {
      moves.push({ from: "외부", fromGroup: "—", to: sh.row.pp, toGroup: sh.row.group, hc: need, external: true });
    }
  }

  list.innerHTML = moves.map(m => {
    const tag = m.external ? "외부 추가 투입 필요" : `${m.from} → ${m.to}`;
    return `<span class="move">💡 <b>${tag} ${m.hc} HC</b> 권장</span>`;
  }).join("");
};
