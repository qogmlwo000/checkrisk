// ============== 시간 유틸 ==============

// "HH:MM" → 오늘 기준 Date (해당 시간이 이미 지났으면 +1일)
function parseExsdToDate(hhmm, baseDate) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= baseDate.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// 현재 기준 다음 Exsd Date 반환 (없으면 익일 첫 Exsd)
window.getNextExsd = function (now = new Date()) {
  const candidates = window.EXSD_LIST.map(t => parseExsdToDate(t, now));
  candidates.sort((a, b) => a - b);
  return { date: candidates[0], label: hhmm(candidates[0]) };
};

// 다음 Exsd까지 남은 시간 (ms)
window.getRemainMs = function (now = new Date()) {
  const { date } = window.getNextExsd(now);
  return date.getTime() - now.getTime();
};

// HH:MM 포맷
function hhmm(d) {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
window.hhmm = hhmm;

// HH:MM:SS 포맷
window.hhmmss = function (d) {
  return hhmm(d) + ":" + String(d.getSeconds()).padStart(2, "0");
};

// ms → "HH:MM:SS" 카운트다운 (음수면 00:00:00)
window.msToCountdown = function (ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
};

// 분 단위 차이 (시간 a - 시간 b), 부호 유지
window.diffMin = function (a, b) {
  return Math.round((a.getTime() - b.getTime()) / 60000);
};

// 시간 단위 차이 (소수), 부호 유지
window.diffHour = function (a, b) {
  return (a.getTime() - b.getTime()) / 3600000;
};

// 현재 시각 + minutes → 새 Date
window.addMinutes = function (d, minutes) {
  return new Date(d.getTime() + minutes * 60000);
};
