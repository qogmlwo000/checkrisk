// ============== Firebase 익명 인증 + Firestore 실시간 공유 ==============
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9XQEP43pmW4Ej6bts0DTQ5K_igU2UM30",
  authDomain: "gwj2checkrisk.firebaseapp.com",
  projectId: "gwj2checkrisk",
  storageBucket: "gwj2checkrisk.firebasestorage.app",
  messagingSenderId: "316015437581",
  appId: "1:316015437581:web:9dfa15013bcb6049353244",
  measurementId: "G-PJD297JMSH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHARED_DOC = doc(db, "sharedRisk", "main");
const SESSION_ID = (() => {
  const k = "checkrisk_session";
  let s = sessionStorage.getItem(k);
  if (!s) {
    s = "s_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
    sessionStorage.setItem(k, s);
  }
  return s;
})();

// DOM 준비 보장 (module 스크립트지만 onSnapshot은 비동기로 더 나중에 올 수도 있음)
const domReady = new Promise(res => {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    // 다음 틱 — main.js의 DOMContentLoaded 핸들러가 먼저 실행되도록
    setTimeout(res, 0);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(res, 0), { once: true });
  }
});

let dot;
function setDot(state, title) {
  dot = dot || document.getElementById("syncDot");
  if (!dot) return;
  dot.classList.remove("connected", "syncing", "error");
  if (state) dot.classList.add(state);
  if (title) dot.title = title;
}
setDot("syncing", "Firebase 연결 중…");

// ============== 상태 ↔ DOM ==============
function collectState() {
  const pack = {};
  document.querySelectorAll("#packGroups tr[data-pp]").forEach(tr => {
    const o = {};
    tr.querySelectorAll("input[data-field]").forEach(inp => {
      o[inp.dataset.field] = inp.value;
    });
    pack[tr.dataset.pp] = o;
  });
  const pick = {};
  document.querySelectorAll("#pickTbody tr[data-floor]").forEach(tr => {
    const o = {};
    tr.querySelectorAll("input[data-field], select[data-field]").forEach(inp => {
      o[inp.dataset.field] = inp.value;
    });
    pick[tr.dataset.floor] = o;
  });
  const singuEl = document.getElementById("pickSinguTime");
  const pickSingu = singuEl ? singuEl.value : "";
  return { pack, pick, pickSingu };
}
// 원격값 적용 — 단, 내가 지금 편집(포커스) 중인 칸은 건너뜀(타이핑 보호)
function setVal(inp, v) {
  if (!inp) return;
  if (inp === document.activeElement) return;     // 편집 중인 칸은 덮어쓰지 않음
  if (inp.value !== v) inp.value = v;
}
function applyState(state) {
  if (!state) return;
  const { pack = {}, pick = {}, pickSingu } = state;
  Object.entries(pack).forEach(([pp, vals]) => {
    const tr = document.querySelector(`#packGroups tr[data-pp="${cssEscape(pp)}"]`);
    if (!tr || !vals) return;
    Object.entries(vals).forEach(([f, v]) => {
      setVal(tr.querySelector(`input[data-field="${f}"]`), v);
    });
  });
  Object.entries(pick).forEach(([fl, vals]) => {
    const tr = document.querySelector(`#pickTbody tr[data-floor="${cssEscape(fl)}"]`);
    if (!tr || !vals) return;
    Object.entries(vals).forEach(([f, v]) => {
      setVal(tr.querySelector(`[data-field="${f}"]`), v);
    });
  });
  if (pickSingu !== undefined) {
    const singuEl = document.getElementById("pickSinguTime");
    if (singuEl && singuEl.value !== (pickSingu || "")) {
      singuEl.value = pickSingu || "";
      window.setPickSinguLabel && window.setPickSinguLabel(singuEl.value);
      window.renderPickSinguClock && window.renderPickSinguClock();
    }
  }
  window.recomputePack && window.recomputePack();
  window.recomputePick && window.recomputePick();
}
function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"');
}

// ============== 쓰기 (변경된 칸만 부분 병합, 디바운스) ==============
let writeTimer = null;
let applyingRemote = false;
const pending = new Map();   // key -> { scope, id, field, value }

// 변경된 element → 어느 칸인지 식별
function elPath(el) {
  if (!el) return null;
  if (el.id === "pickSinguTime") return { scope: "pickSingu" };
  const field = el.dataset && el.dataset.field;
  if (!field) return null;
  const tr = el.closest && el.closest("tr");
  if (!tr) return null;
  if (tr.dataset.pp)    return { scope: "pack", id: tr.dataset.pp, field };
  if (tr.dataset.floor) return { scope: "pick", id: tr.dataset.floor, field };
  return null;
}
function queueField(el) {
  const p = elPath(el);
  if (!p) return false;
  if (p.scope === "pickSingu") {
    const s = document.getElementById("pickSinguTime");
    pending.set("singu", { ...p, value: s ? s.value : "" });
  } else {
    pending.set(`${p.scope}${p.id}${p.field}`, { ...p, value: el.value });
  }
  return true;
}
function queueAll() {
  document.querySelectorAll("#packGroups input[data-field]").forEach(queueField);
  document.querySelectorAll("#pickTbody [data-field]").forEach(queueField);
  const s = document.getElementById("pickSinguTime");
  if (s) queueField(s);
}

// pending → 부분 nested 객체 (점 포함 키 PP·층 이름도 그대로 보존됨)
async function flushWrites() {
  if (pending.size === 0) return;
  if (!auth.currentUser) { scheduleWrite(); return; }  // 인증 대기 시 재시도
  const state = {};
  for (const it of pending.values()) {
    if (it.scope === "pickSingu") { state.pickSingu = it.value; continue; }
    (state[it.scope] = state[it.scope] || {});
    (state[it.scope][it.id] = state[it.scope][it.id] || {});
    state[it.scope][it.id][it.field] = it.value;
  }
  pending.clear();
  try {
    setDot("syncing", "동기화 중…");
    await domReady;
    await setDoc(SHARED_DOC, {
      state,                                  // 변경 칸만 — merge로 나머지는 보존
      lastWriterId: SESSION_ID,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setDot("connected", `공유 중 · 세션 ${SESSION_ID.slice(0,10)}`);
  } catch (e) {
    console.error("[firebase] write failed:", e);
    setDot("error", "쓰기 실패: " + (e.code || e.message));
  }
}
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flushWrites, 500);
}

// 최초 문서 생성용 — 전체 상태 1회 시드
async function seedFull() {
  if (!auth.currentUser) return;
  try {
    await domReady;
    await setDoc(SHARED_DOC, {
      state: collectState(),
      lastWriterId: SESSION_ID,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("[firebase] seed failed:", e);
  }
}

// el: 변경된 입력 요소. 생략(초기화 등 일괄)이면 현재 DOM 전체를 큐잉
window.onLocalChange = function (el) {
  if (applyingRemote) return;          // 원격 적용 중 발생한 input 이벤트 무시
  if (el === undefined) queueAll();
  else if (!queueField(el)) queueAll();
  scheduleWrite();
};

// ============== 인증 후 구독 ==============
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(err => {
      console.error("[firebase] 익명 로그인 실패:", err);
      setDot("error", "익명 로그인 실패: " + (err.code || err.message) + " — Console에서 Anonymous Authentication 활성화 필요");
    });
    return;
  }
  setDot("connected", `공유 중 · 세션 ${SESSION_ID.slice(0,10)}`);

  // 실시간 구독
  onSnapshot(SHARED_DOC, async (snap) => {
    await domReady;
    if (!snap.exists()) {
      seedFull();
      return;
    }
    const data = snap.data();
    if (data.lastWriterId === SESSION_ID) return; // 내가 쓴 거면 스킵
    applyingRemote = true;
    try { applyState(data.state); } finally { applyingRemote = false; }
  }, (err) => {
    console.error("[firebase] 구독 실패:", err);
    setDot("error", "구독 실패: " + (err.code || err.message));
  });
});
