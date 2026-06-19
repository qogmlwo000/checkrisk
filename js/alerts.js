// ============== 긴급 알림 (화면 플래시 · 알림음 · 브라우저 알림) ==============

(function () {
  const PREF_KEY = "checkrisk_alerts";
  // 마감 N분 전에 경보를 울릴 임계값 (내림차순)
  const STEPS = [60, 30, 15, 10, 5, 3, 1];

  const defaults = { flash: true, sound: false, notify: false };

  function getPrefs() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); }
    catch (e) { return Object.assign({}, defaults); }
  }
  function setPrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {}
  }
  let prefs = getPrefs();

  function $(id) { return document.getElementById(id); }

  // ---------- 비프음 (Web Audio) ----------
  let actx = null;
  function ensureCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type, gain) {
    const ctx = actx; if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function alarm(critical) {
    if (!ensureCtx()) return;
    if (critical) {
      tone(988, 0,    0.14, "square", 0.18);
      tone(740, 0.17, 0.16, "square", 0.18);
      tone(988, 0.36, 0.18, "square", 0.18);
    } else {
      tone(880, 0,    0.15, "sine", 0.14);
      tone(660, 0.17, 0.18, "sine", 0.14);
    }
  }

  // ---------- 브라우저 알림 ----------
  function notify(title, body) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const n = new Notification(title, { body, icon: "Bennett.png", tag: "checkrisk-deadline" });
      setTimeout(() => { try { n.close(); } catch (e) {} }, 8000);
    } catch (e) {}
  }

  // ---------- 화면 플래시 ----------
  function updateFlash(remainMin) {
    const fl = $("alertFlash");
    if (!fl) return;
    const URGENT = window.THRESHOLDS ? window.THRESHOLDS.URGENT_REMAIN_MIN : 60;
    const CRIT   = window.THRESHOLDS ? window.THRESHOLDS.CRITICAL_REMAIN_MIN : 10;
    if (!prefs.flash || !isFinite(remainMin) || remainMin > URGENT || remainMin < 0) {
      fl.className = ""; return;
    }
    fl.className = "on" + (remainMin <= CRIT ? " crit" : "");
  }

  // ---------- 임계 교차 감지 ----------
  let prevMin = Infinity, prevLabel = null;
  function detect(remainMin, label) {
    // 라벨(기준 마감) 변경/최초 진입 시엔 기준값만 잡고 경보 생략
    if (label !== prevLabel) { prevLabel = label; prevMin = remainMin; return; }
    const CRIT = window.THRESHOLDS ? window.THRESHOLDS.CRITICAL_REMAIN_MIN : 10;
    for (const T of STEPS) {
      if (prevMin > T && remainMin <= T) {
        const critical = T <= CRIT;
        if (prefs.sound)  alarm(critical);
        if (prefs.notify) notify(`⏰ 마감 ${T}분 전`, `Exsd ${label} 까지 약 ${T}분 남았습니다.`);
        window.showToast && window.showToast(`⏰ 마감 ${T}분 전 — Exsd ${label}`, critical ? "error" : "");
      }
    }
    prevMin = remainMin;
  }

  // main.js tick에서 매초 호출
  window.alertTick = function (remainMin, label) {
    updateFlash(remainMin);
    detect(remainMin, label);
  };

  // ---------- UI 바인딩 ----------
  function syncBell() {
    const btn = $("alertBtn");
    if (!btn) return;
    const loud = prefs.sound || prefs.notify;
    const anyOn = prefs.flash || loud;
    btn.textContent = anyOn ? "🔔" : "🔕";
    btn.classList.toggle("on", loud);
  }

  function bind() {
    prefs = getPrefs();
    const btn = $("alertBtn");
    const pop = $("alertPop");
    const cf = $("alOptFlash"), cs = $("alOptSound"), cn = $("alOptNotify");

    if (cf) cf.checked = prefs.flash;
    if (cs) cs.checked = prefs.sound;
    if (cn) cn.checked = prefs.notify;
    syncBell();

    if (btn && pop) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = pop.hidden;
        pop.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", (e) => {
        if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) {
          pop.hidden = true; btn.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (cf) cf.addEventListener("change", () => {
      prefs.flash = cf.checked; setPrefs(prefs); syncBell();
      if (!cf.checked) { const fl = $("alertFlash"); if (fl) fl.className = ""; }
    });

    if (cs) cs.addEventListener("change", () => {
      prefs.sound = cs.checked; setPrefs(prefs); syncBell();
      if (cs.checked) { ensureCtx(); alarm(false); } // 활성화 시 오디오 잠금 해제 + 테스트음
    });

    if (cn) cn.addEventListener("change", () => {
      if (cn.checked && "Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then(perm => {
          prefs.notify = (perm === "granted");
          cn.checked = prefs.notify;
          setPrefs(prefs); syncBell();
          if (perm !== "granted") window.showToast && window.showToast("브라우저 알림 권한이 거부되어 켤 수 없습니다.", "error");
          else notify("✅ 알림 설정 완료", "마감 임박 시 데스크톱 알림을 보내드립니다.");
        });
      } else {
        prefs.notify = cn.checked; setPrefs(prefs); syncBell();
      }
    });
  }

  window.initAlerts = bind;
})();
