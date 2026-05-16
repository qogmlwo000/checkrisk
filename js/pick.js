// ============== PICK 렌더 / 계산 ==============

const PICK_FIELDS = ["multi", "singu", "currHC", "htp"];

function floorId(name) {
  return "pick_" + name.replace(/[^\w가-힣]/g, "_");
}

const PICK_COL_WIDTHS = ["8%","10%","10%","10%","9%","9%","13%","9%","22%"];

window.renderPickTable = function () {
  const table = document.getElementById("pickTable");
  // colgroup (once)
  if (!table.querySelector("colgroup")) {
    const cg = document.createElement("colgroup");
    PICK_COL_WIDTHS.forEach(w => {
      const col = document.createElement("col");
      col.style.width = w;
      cg.appendChild(col);
    });
    table.insertBefore(cg, table.firstChild);
  }

  const tbody = document.getElementById("pickTbody");
  tbody.innerHTML = "";

  window.PICK_FLOORS.forEach(floor => {
    const tr = document.createElement("tr");
    tr.id = floorId(floor);
    tr.dataset.floor = floor;

    // Floor
    const fTd = document.createElement("td");
    fTd.className = "floor-cell";
    fTd.textContent = floor;
    tr.appendChild(fTd);

    // Exsd Backlog (자동)
    const ebTd = document.createElement("td");
    ebTd.className = "computed muted";
    ebTd.dataset.cell = "exsdBacklog";
    ebTd.textContent = "—";
    tr.appendChild(ebTd);

    // Backlog Multi, Singulation (입력)
    ["multi", "singu"].forEach(field => {
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

    // 현재 인원, 평균 HTP (입력)
    ["currHC", "htp"].forEach(field => {
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

    // 싱귤+멀티 예상 집품량 (자동)
    const epTd = document.createElement("td");
    epTd.className = "computed muted";
    epTd.dataset.cell = "expected";
    epTd.textContent = "—";
    tr.appendChild(epTd);

    // 리스크 유/무 (수동 select)
    const riskTd = document.createElement("td");
    const sel = document.createElement("select");
    sel.className = "risk-select";
    sel.dataset.field = "riskManual";
    ["-", "유", "무"].forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    });
    riskTd.appendChild(sel);
    tr.appendChild(riskTd);

    // 마감건 집품 예상 완료 시간 (자동)
    const etaTd = document.createElement("td");
    etaTd.className = "eta-cell computed muted";
    etaTd.dataset.cell = "eta";
    etaTd.textContent = "—";
    tr.appendChild(etaTd);

    tbody.appendChild(tr);
  });
};

function readPickRow(tr) {
  const r = { floor: tr.dataset.floor };
  PICK_FIELDS.forEach(f => {
    const el = tr.querySelector(`input[data-field="${f}"]`);
    const v = el ? parseFloat(el.value) : NaN;
    r[f] = isFinite(v) ? v : 0;
    r[f + "_has"] = el && el.value !== "";
  });
  const sel = tr.querySelector('select[data-field="riskManual"]');
  r.riskManual = sel ? sel.value : "-";
  return r;
}

function computePickRow(row, now, nextExsd) {
  const exsdBacklog = row.multi + row.singu;
  const remainH = Math.max(0, window.diffHour(nextExsd, now));
  const rate = row.currHC * row.htp; // unit/h
  const expectedPick = Math.round(rate * remainH);

  let etaMinutes = Infinity, etaClock = null, marginMin = -Infinity;
  if (rate > 0 && exsdBacklog > 0) {
    etaMinutes = (exsdBacklog / rate) * 60;
    etaClock = window.addMinutes(now, etaMinutes);
    marginMin = window.diffMin(nextExsd, etaClock);
  } else if (rate > 0 && exsdBacklog === 0) {
    etaMinutes = 0;
    etaClock = now;
    marginMin = window.diffMin(nextExsd, now);
  }

  let status = "safe"; // safe / warn / danger / idle
  if (rate <= 0 || exsdBacklog <= 0) {
    status = (exsdBacklog === 0 && (row.multi_has || row.singu_has)) ? "safe" : "idle";
  } else if (marginMin >= window.THRESHOLDS.PICK_SAFE_MIN) status = "safe";
  else if (marginMin >= window.THRESHOLDS.PICK_WARN_MIN) status = "warn";
  else status = "danger";

  return { exsdBacklog, remainH, rate, expectedPick, etaMinutes, etaClock, marginMin, status };
}

function updatePickRowUI(tr, row, calc) {
  const eb = tr.querySelector('[data-cell="exsdBacklog"]');
  const ep = tr.querySelector('[data-cell="expected"]');
  const eta = tr.querySelector('[data-cell="eta"]');

  const hasBacklogInput = row.multi_has || row.singu_has;
  if (hasBacklogInput) {
    eb.textContent = calc.exsdBacklog.toLocaleString();
    eb.classList.remove("muted");
  } else {
    eb.textContent = "—";
    eb.classList.add("muted");
  }

  if (row.currHC > 0 && row.htp > 0) {
    ep.innerHTML =
      `<span class="dual-line"><b>${calc.rate.toLocaleString()} Unit/h</b>` +
      `<span class="sub">Exsd까지 ${formatHoursMinPick(calc.remainH)} ⇒ ${calc.expectedPick.toLocaleString()} Unit</span></span>`;
    ep.classList.remove("muted");
  } else {
    ep.textContent = "—";
    ep.classList.add("muted");
  }

  eta.className = "eta-cell computed";
  if (calc.etaClock) {
    const cls = calc.status === "danger" ? "danger" : calc.status === "warn" ? "warn" : "safe";
    eta.classList.add(cls);
    const sign = calc.marginMin >= 0 ? `Exsd −${calc.marginMin}분` : `Exsd +${Math.abs(calc.marginMin)}분 지연`;
    eta.textContent = `${window.hhmm(calc.etaClock)} (${sign})`;
  } else {
    eta.classList.add("muted");
    eta.textContent = "—";
  }
}

window.recomputePick = function () {
  const now = new Date();
  const { date: nextExsd } = window.getNextExsd(now);

  const rows = [];
  document.querySelectorAll("#pickTbody tr[data-floor]").forEach(tr => {
    const row = readPickRow(tr);
    const calc = computePickRow(row, now, nextExsd);
    updatePickRowUI(tr, row, calc);
    rows.push({ tr, row, calc });
  });

  renderPickRecommend(rows, now, nextExsd);
};

// ============== PICK 층간 충원 추천 ==============
function renderPickRecommend(rows, now, nextExsd) {
  const list = document.getElementById("pickRecommendList");

  const anyEntered = rows.some(({ row }) => PICK_FIELDS.some(f => row[f + "_has"]));
  if (!anyEntered) {
    list.innerHTML = `<span class="muted">값을 입력하면 자동으로 추천이 표시됩니다.</span>`;
    return;
  }

  const SAFE = window.THRESHOLDS.PICK_SAFE_MIN; // 40
  const usable = rows.filter(({ row }) => row.currHC > 0 && row.htp > 0);

  // 부족 층 = margin < SAFE (35분 미만 위험 + 35~40 주의 모두 포함하여 SAFE 확보 시도)
  const shorts = usable.filter(({ calc }) => calc.rate > 0 && calc.marginMin < SAFE && calc.exsdBacklog > 0);
  // 여유 층 = margin >= SAFE + 10 (50분 이상)
  const slacks = usable.filter(({ calc }) => calc.marginMin >= SAFE + 10 && calc.exsdBacklog >= 0);

  if (shorts.length === 0) {
    list.innerHTML = `<span class="muted">전 층 마감 ${SAFE}분 전 완료 여유 확보 — 별도 충원 추천 없음.</span>`;
    return;
  }

  // 각 부족 층마다 필요 추가 HC 계산: marginMin이 SAFE 이상 되도록
  // eta'(extra) = backlog / ((HC+extra)*htp) * 60
  // marginMin' = diffMin(nextExsd, now + eta') >= SAFE
  // → eta' <= remainMin - SAFE
  // → (HC+extra) >= backlog / ((remainMin - SAFE)/60 * htp)
  const moves = [];
  // copy slack capacity (per floor) — currHC의 절반까지 양보, 단 양보 후 자신도 SAFE 유지
  const slackCap = slacks.map(s => {
    const remainMinNow = window.diffMin(nextExsd, now);
    const cap = Math.min(
      Math.floor(s.row.currHC / 2),
      // 자기 자신이 SAFE 유지 가능한 최대 양보치 (양보 후 margin ≥ SAFE)
      maxGiveKeepingSafe(s.row, s.calc, remainMinNow, SAFE)
    );
    return { ...s, freeHC: Math.max(0, cap) };
  }).filter(s => s.freeHC > 0)
    .sort((a, b) => b.freeHC - a.freeHC);

  shorts.sort((a, b) => a.calc.marginMin - b.calc.marginMin); // 가장 위험한 층부터

  for (const sh of shorts) {
    const remainMinNow = window.diffMin(nextExsd, now);
    const availMin = remainMinNow - SAFE;
    let needTotal = 0;
    if (availMin <= 0) {
      // 이미 SAFE를 확보할 시간 없음 — 가능한 한 많이 투입 (잔여 margin 최대화)
      needTotal = Math.max(1, Math.ceil(sh.calc.exsdBacklog / Math.max(1, sh.row.htp * Math.max(0.01, remainMinNow/60)))) - sh.row.currHC;
    } else {
      const requiredHC = Math.ceil(sh.calc.exsdBacklog / ((availMin / 60) * sh.row.htp));
      needTotal = Math.max(0, requiredHC - sh.row.currHC);
    }
    if (needTotal <= 0) needTotal = 1; // 최소 1명 추천 (보수적)

    let remaining = needTotal;
    for (const sl of slackCap) {
      if (remaining <= 0) break;
      if (sl.freeHC <= 0) continue;
      const move = Math.min(remaining, sl.freeHC);
      moves.push({ from: sl.row.floor, to: sh.row.floor, hc: move });
      sl.freeHC -= move;
      remaining -= move;
    }
    if (remaining > 0) {
      moves.push({ from: "외부", to: sh.row.floor, hc: remaining, external: true });
    }
  }

  if (moves.length === 0) {
    list.innerHTML = `<span class="muted">여유 층 없음. 부족 층의 외부 추가 인원 필요.</span>`;
    return;
  }

  list.innerHTML = moves.map(m => {
    const tag = m.external ? `외부 추가 투입 → ${m.to}` : `${m.from} → ${m.to}`;
    return `<span class="move">💡 <b>${tag} ${m.hc} HC</b> 권장</span>`;
  }).join("");
}

function formatHoursMinPick(hours) {
  if (!isFinite(hours) || hours < 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

// 양보 후 자기 층 marginMin ≥ safeMin 유지하는 최대 양보 HC
function maxGiveKeepingSafe(row, calc, remainMinNow, safeMin) {
  if (calc.exsdBacklog <= 0) return Math.floor(row.currHC / 2);
  const availMin = remainMinNow - safeMin;
  if (availMin <= 0) return 0;
  const minHC = Math.ceil(calc.exsdBacklog / ((availMin / 60) * row.htp));
  return Math.max(0, row.currHC - minHC);
}
