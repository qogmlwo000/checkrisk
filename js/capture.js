// ============== 캡처 → 클립보드 복사 ==============

window.captureToClipboard = async function (targetId, opts = {}) {
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
  Object.assign(wrap.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: target.getBoundingClientRect().width + "px",
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
      // 캡처용 헤더는 동기 토글/상태점 등 인터랙티브 요소 제거
      tb.querySelectorAll(".theme-toggle, .sync-dot").forEach(el => el.remove());
      tb.style.position = "static";
      wrap.appendChild(tb);
    }
  }

  // 3) 대상 클론
  const clone = target.cloneNode(true);
  // 캡처 버튼은 결과 이미지에서 숨기기
  clone.querySelectorAll(".capture-btn, .card-hint").forEach(el => el.remove());
  // input/select 값은 cloneNode가 복사하지 않음 → 직접 복사
  syncFormValues(target, clone);
  // html2canvas가 input/select 텍스트를 세로 중앙에 못 맞춰 아래로 밀림 →
  // 캡처 클론의 입력 필드를 정적 div로 치환해 렌더링 우회
  freezeFieldsForCapture(target, clone);

  wrap.appendChild(clone);
  document.body.appendChild(wrap);

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

function showCaptureModal(canvas) {
  document.getElementById("captureModal")?.remove();

  const dataUrl = canvas.toDataURL("image/png");
  const modal = document.createElement("div");
  modal.id = "captureModal";
  modal.innerHTML = `
    <div class="modal-hint">
      ⚠ 직접 클립보드 복사가 차단되었습니다.<br/>
      아래 이미지에 <b>우클릭 → '이미지 복사'</b> 로 클립보드에 담아주세요.
    </div>
    <img src="${dataUrl}" alt="capture" />
    <button class="modal-close">닫기</button>
  `;
  document.body.appendChild(modal);
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
