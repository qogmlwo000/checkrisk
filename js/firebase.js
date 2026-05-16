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
  return { pack, pick };
}
function applyState(state) {
  if (!state) return;
  const { pack = {}, pick = {} } = state;
  Object.entries(pack).forEach(([pp, vals]) => {
    const tr = document.querySelector(`#packGroups tr[data-pp="${cssEscape(pp)}"]`);
    if (!tr) return;
    Object.entries(vals).forEach(([f, v]) => {
      const inp = tr.querySelector(`input[data-field="${f}"]`);
      if (inp && inp.value !== v) inp.value = v;
    });
  });
  Object.entries(pick).forEach(([fl, vals]) => {
    const tr = document.querySelector(`#pickTbody tr[data-floor="${cssEscape(fl)}"]`);
    if (!tr) return;
    Object.entries(vals).forEach(([f, v]) => {
      const inp = tr.querySelector(`[data-field="${f}"]`);
      if (inp && inp.value !== v) inp.value = v;
    });
  });
  window.recomputePack && window.recomputePack();
  window.recomputePick && window.recomputePick();
}
function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"');
}

// ============== 쓰기 (디바운스) ==============
let writeTimer = null;
let applyingRemote = false;
async function pushLocal() {
  if (!auth.currentUser) return;
  try {
    setDot("syncing", "동기화 중…");
    await domReady;
    await setDoc(SHARED_DOC, {
      state: collectState(),
      lastWriterId: SESSION_ID,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setDot("connected", `공유 중 · 세션 ${SESSION_ID.slice(0,10)}`);
  } catch (e) {
    console.error("[firebase] write failed:", e);
    setDot("error", "쓰기 실패: " + (e.code || e.message));
  }
}
window.onLocalChange = function () {
  if (applyingRemote) return;          // 원격 적용 중에 발생한 input 이벤트 무시
  if (!auth.currentUser) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(pushLocal, 500);
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
      pushLocal();
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
