/** @param {Date} date */
export function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey() {
  return formatMonthKey(new Date());
}

/** @param {string} month @param {number} offset */
export function moveMonthKey(month, offset) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match || !Number.isInteger(offset)) throw new Error('month must be YYYY-MM and offset must be an integer');
  const absolute = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
}

export function monthChangeReset() {
  return { changes: {}, precheck: null, generationWarnings: [], generationResult: null, message: '' };
}
