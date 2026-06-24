// ============== 캡처 → 클립보드 복사 ==============

window.captureToClipboard = async function (targetId, opts = {}) {
  // 캡처가 진행 중이면 중복 실행 방지 (연타 시 오프스크린 wrapper 중첩 생성 차단)
  if (window.captureToClipboard._busy) return;

  const target = document.getElementById(targetId);
  if (!target) {
    showToast("캡처 대상 요소를 찾을 수 없습니다.", "error");
    return;
  }
  if (typeof html2canvas === "undefined") {
    showToast("html2canvas 라이브러리가 로드되지 않았습니다.", "error");
    return;
  }

  const includeHeader = opts.includeHeader !== false;

  // 1) 임시 오프스크린 wrapper 만들기
  const wrap = document.createElement("div");
  wrap.id = "__captureWrap";
  const bg = getComputedStyle(document.body).backgroundColor || "#0e1117";
  // 대상이 숨김(탭 비활성 등)이면 width 가 0 → 0크기 캔버스로 변환 실패하므로 합리적 너비로 폴백
  const targetW = target.getBoundingClientRect().width || target.scrollWidth || 960;
  Object.assign(wrap.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: targetW + "px",
    background: bg,
    padding: "0",
    margin: "0",
    boxSizing: "content-box"
  });

  // 2) 헤더 클론 (옵션)
  if (includeHeader) {
    const topbar = document.getElementById("topbar");
    if (topbar) {
      const tb = topbar.cloneNode(true);
      // 캡처용 헤더에서 인터랙티브 컨트롤 영역(동기 점·알림벨·테마 토글·알림 팝업)을 통째로 제거.
      // 정보성 요소(시계·Exsd·카운트다운·Exsd 칩)는 그대로 남긴다.
      tb.querySelectorAll(".topbar-actions").forEach(el => el.remove());
      tb.style.position = "static";
      // .now-clock 은 background-clip:text 그라디언트 글자라 html2canvas가 글자 대신
      // 단색 사각 박스로 렌더한다 → 단색 글자로 되돌려 시계가 정상적으로 보이게 한다.
      neutralizeClippedText(topbar, tb);
      // 헤더의 Exsd <select> 등도 html2canvas가 텍스트를 깨뜨려 오른쪽으로 쏠리므로
      // 본문과 동일하게 값 복사 + 정적 div 치환(freeze) 처리한다.
      syncFormValues(topbar, tb);
      freezeFieldsForCapture(topbar, tb);
      wrap.appendChild(tb);
    }
  }

  // 3) 대상 클론
  const clone = target.cloneNode(true);
  // 접힌 PACK 그룹을 캡처해도 표 내용이 보이도록 클론은 항상 펼친 상태로 강제
  clone.classList.remove("collapsed");
  clone.querySelectorAll(".collapsed").forEach(el => el.classList.remove("collapsed"));
  // 결과 이미지에서 인터랙티브 컨트롤(캡처·초기화·접기·단일 해제 버튼)과 힌트 텍스트 숨기기
  clone.querySelectorAll(".capture-btn, .card-hint, .reset-btn, .group-collapse-btn, .singu-clear")
       .forEach(el => el.remove());
  // input/select 값은 cloneNode가 복사하지 않음 → 직접 복사
  syncFormValues(target, clone);
  // html2canvas가 input/select 텍스트를 세로 중앙에 못 맞춰 아래로 밀림 →
  // 캡처 클론의 입력 필드를 정적 div로 치환해 렌더링 우회
  freezeFieldsForCapture(target, clone);

  wrap.appendChild(clone);
  // html2canvas의 measureText는 font-variant-numeric: tabular-nums 를 반영하지 못해
  // 숫자·기호·한글 사이에 빈 공백이 끼어 글자가 밀려 보인다(예: "12:55"→"12 :55", "−119분"→"−119 분").
  // 캡처 클론 전체에서 해당 설정을 꺼 글자 간격을 정상화한다. (폰트 자체는 그대로 유지)
  normalizeNumericForCapture(wrap);
  document.body.appendChild(wrap);

  window.captureToClipboard._busy = true;
  showToast("🖼 캡처 이미지 생성 중…", "");

  try {
    const canvas = await html2canvas(wrap, {
      backgroundColor: bg,
      scale: 2,
      useCORS: true,
      logging: false
    });

    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    if (!blob) {
      showToast("이미지 변환 실패", "error");
      return;
    }

    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("📋 이미지 클립보드 복사 완료 — Ctrl+V 로 붙여넣기 하세요.", "ok");
        return;
      } catch (err) {
        console.warn("Clipboard API 실패, 폴백 모달:", err);
      }
    }
    showCaptureModal(canvas);
  } catch (err) {
    console.error(err);
    showToast("캡처 중 오류가 발생했습니다.", "error");
  } finally {
    wrap.remove();
    window.captureToClipboard._busy = false;
  }
};

// cloneNode로는 input의 .value, select의 selectedIndex가 복사 안 됨 → 직접 복사
function syncFormValues(srcRoot, dstRoot) {
  const srcInputs = srcRoot.querySelectorAll("input, select, textarea");
  const dstInputs = dstRoot.querySelectorAll("input, select, textarea");
  const len = Math.min(srcInputs.length, dstInputs.length);
  for (let i = 0; i < len; i++) {
    const s = srcInputs[i], d = dstInputs[i];
    if (s.tagName === "SELECT") {
      d.value = s.value;
      // setAttribute 로도 한 번 더 보정 (html2canvas가 attribute 기반으로 그릴 수 있음)
      [...d.options].forEach(opt => opt.removeAttribute("selected"));
      const sel = [...d.options].find(o => o.value === s.value);
      if (sel) sel.setAttribute("selected", "selected");
    } else {
      d.value = s.value;
      if (s.value !== "") d.setAttribute("value", s.value);
    }
  }
}

// html2canvas는 <input>/<select> 텍스트를 세로 중앙 정렬하지 못해 값이 아래로 밀려 보인다.
// 캡처용 클론에서 각 입력 필드를 동일한 box 스타일의 정적 div로 치환해 input 렌더링을 우회한다.
function freezeFieldsForCapture(srcRoot, dstRoot) {
  const srcFields = srcRoot.querySelectorAll("input, select");
  const dstFields = dstRoot.querySelectorAll("input, select");
  const len = Math.min(srcFields.length, dstFields.length);
  for (let i = 0; i < len; i++) {
    const s = srcFields[i], d = dstFields[i];
    const cs = getComputedStyle(s);

    // 표시 텍스트 결정
    let text, empty = false;
    if (s.tagName === "SELECT") {
      const opt = s.options[s.selectedIndex];
      text = opt ? opt.textContent : s.value;
    } else if (s.value !== "") {
      text = s.value;
    } else {
      text = s.placeholder || "";
      empty = true;
    }

    const div = document.createElement("div");
    div.textContent = text;
    Object.assign(div.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      width: cs.width,
      height: s.offsetHeight + "px",
      padding: cs.padding,
      font: cs.font,
      letterSpacing: cs.letterSpacing,
      color: empty ? "var(--text-muted)" : cs.color,
      background: cs.backgroundColor,
      border: cs.border,
      borderRadius: cs.borderRadius,
      textAlign: "center",
      whiteSpace: "nowrap",
      overflow: "hidden"
    });
    d.replaceWith(div);
  }
}

// html2canvas는 background-clip:text + -webkit-text-fill-color:transparent (그라디언트 글자)를
// 지원하지 못해 글자가 통째로 단색 사각 박스로 렌더된다(예: 상단 시계).
// 캡처 클론에서 그라디언트를 풀고, 라이브 요소의 실제 글자색을 단색으로 다시 칠해 정상화한다.
function neutralizeClippedText(srcRoot, dstRoot) {
  const SEL = ".now-clock"; // background-clip:text 를 쓰는 요소
  const srcEls = [...srcRoot.querySelectorAll(SEL)];
  const dstEls = [...dstRoot.querySelectorAll(SEL)];
  const len = Math.min(srcEls.length, dstEls.length);
  for (let i = 0; i < len; i++) {
    const color = getComputedStyle(srcEls[i]).color;
    Object.assign(dstEls[i].style, {
      background: "none",
      backgroundImage: "none",
      webkitBackgroundClip: "border-box",
      backgroundClip: "border-box",
      webkitTextFillColor: color,
      color: color
    });
  }
}

// html2canvas는 tabular-nums(고정폭 숫자) 메트릭을 measureText로 못 잡아 글자가 벌어진다.
// 캡처 클론의 모든 요소에서 font-variant-numeric / font-feature-settings 를 normal 로 강제한다.
function normalizeNumericForCapture(root) {
  const apply = el => {
    el.style.fontVariantNumeric = "normal";
    el.style.fontFeatureSettings = "normal";
  };
  apply(root);
  root.querySelectorAll("*").forEach(apply);
}

function showCaptureModal(canvas) {
  // 폴백 모달이 뜨면 "생성 중…" 토스트는 더 이상 필요 없으므로 숨긴다
  const t = document.getElementById("toast");
  if (t) { clearTimeout(showToast._timer); t.className = "toast"; }
  document.getElementById("captureModal")?.remove();

  const dataUrl = canvas.toDataURL("image/png");
  const modal = document.createElement("div");
  modal.id = "captureModal";
  modal.innerHTML = `
    <div class="modal-hint">
      브라우저가 직접 클립보드 복사를 막아 미리보기로 띄웠습니다.<br/>
      <b>💾 PNG 저장</b> 하거나, 이미지 <b>우클릭 → '이미지 복사'</b> 로 사용하세요.
    </div>
    <img src="${dataUrl}" alt="capture" />
    <div class="modal-actions">
      <button class="modal-save">💾 PNG 저장</button>
      <button class="modal-close">닫기</button>
    </div>
  `;
  document.body.appendChild(modal);

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  modal.querySelector(".modal-save").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `checkrisk_capture_${stamp}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast("💾 PNG 저장 완료", "ok");
  });
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

function showToast(msg, kind = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.className = "toast"; }, 2800);
}
window.showToast = showToast;
