const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** @param {string} month */
export function daysInMonth(month) {
  const match = monthPattern.exec(month);
  if (!match) throw new Error('month must be YYYY-MM');
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

/** @param {string} month @param {number} day */
export function clampDayToMonth(month, day) {
  return Math.min(daysInMonth(month), Math.max(1, Number.isFinite(day) ? Math.trunc(day) : 1));
}

/** @param {string} month @param {number} day */
export function dailyDateKey(month, day) {
  return `${month}-${String(clampDayToMonth(month, day)).padStart(2, '0')}`;
}

/** @param {string} month @param {number} day */
export function weekdayLabel(month, day) {
  const date = dailyDateKey(month, day);
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(`${date}T00:00:00`).getDay()];
}

/** @param {string} month @param {number} day @param {number} offset */
export function moveDayWithinMonth(month, day, offset) {
  if (!Number.isInteger(offset)) throw new Error('offset must be an integer');
  return clampDayToMonth(month, day + offset);
}

/** @param {string} month @param {Date} today */
export function initialDayForMonth(month, today = new Date()) {
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return todayMonth === month ? today.getDate() : 1;
}
