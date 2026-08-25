const FULL_WIDTH_DIGITS = '０１２３４５６７８９';
const SHIFT_MARKS = new Set(['①','②','③','④','⑤','⑥','⑦','⑧']);

function normalizeText(value) {
  if (value == null) return '';
  const protectedMarks = new Map([['①','__SHIFT_1__'],['②','__SHIFT_2__'],['③','__SHIFT_3__'],['④','__SHIFT_4__'],['⑤','__SHIFT_5__'],['⑥','__SHIFT_6__'],['⑦','__SHIFT_7__'],['⑧','__SHIFT_8__']]);
  let text=String(value); for(const [mark,token] of protectedMarks) text=text.replaceAll(mark,token);
  text=text.normalize('NFKC').replace(/[，、]/g, ',').replace(/[：]/g, ':').replace(/\s+/g, ' ').trim();
  for(const [mark,token] of protectedMarks) text=text.replaceAll(token,mark); return text;
}

function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2958465) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeTimeRange(value) {
  const text = normalizeText(value).replace(/[‐‑‒–—―ー]/g, '-');
  const match = text.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return { status: 'REVIEW', raw: value, issue: '勤務時間をHH:MM-HH:MMとして解釈できません。' };
  const [, sh, sm, eh, em] = match; const nums = [sh, sm, eh, em].map(Number);
  if (nums[0] > 23 || nums[2] > 23 || nums[1] > 59 || nums[3] > 59) return { status: 'REVIEW', raw: value, issue: '勤務時間が範囲外です。' };
  return { status: 'READY', startTime: `${sh.padStart(2,'0')}:${sm}`, endTime: `${eh.padStart(2,'0')}:${em}` };
}

function dateFor(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

function parseDateCell(value, targetYear, targetMonth) {
  const typed = excelDate(value);
  if (typed) return { status: 'READY', dates: [typed], sourceType: 'EXCEL_DATE' };
  const text = normalizeText(value);
  if (!text) return { status: 'READY', dates: [] };
  if (/●|9\/119\/14|\/\/|\/・|・\//.test(text)) return { status: 'REVIEW', raw: value, dates: [], issue: '区切りまたは記号が曖昧なため日付を確定できません。' };
  const tokens = text.split(',').map((x) => x.trim()).filter(Boolean); const dates=[]; const candidates=[];
  for (const token of tokens) {
    const ampm = /(?:p\.?m\.?|午後)/i.test(token) ? 'PM' : /(?:a\.?m\.?|午前)/i.test(token) ? 'AM' : null;
    const match = token.match(/(?:(\d{1,2})\/)?(\d{1,2})(?!\d)/);
    if (!match) { candidates.push(token); continue; }
    const month = match[1] ? Number(match[1]) : targetMonth; const day = Number(match[2]); const iso = dateFor(targetYear, month, day);
    if (!iso) { candidates.push(token); continue; }
    dates.push({ date: iso, ...(ampm ? { portion: ampm } : {}) });
    const residue = token.replace(match[0], '').replace(/(?:p\.?m\.?|a\.?m\.?|午前|午後)/ig,'').trim();
    if (residue) candidates.push(token);
  }
  return candidates.length ? { status: dates.length ? 'CANDIDATE' : 'REVIEW', raw: value, dates, candidates, issue: '日付以外の条件を含むため管理者確認が必要です。' } : { status: 'READY', dates };
}

function classifyFreeCondition(value) {
  const text=normalizeText(value); if(!text) return { status:'READY', structured:[], notes:[] };
  const structured=[]; const notes=[];
  if (/水曜.*シフト無/.test(text)) structured.push({ type:'NON_ROTATION_WORK_DAY_OF_WEEK', dayOfWeek:3 });
  if (/シフト無/.test(text) && !/水曜.*シフト無/.test(text)) structured.push({ type:'NON_ROTATION_WORK_DATE_CANDIDATE' });
  if (/③以降.*(?:無|なし)/.test(text)) structured.push({ type:'UNAVAILABLE_WORK_PATTERN_FROM', workPatternCode:'03' });
  if (/①.*月1回/.test(text)) structured.push({ type:'MAX_WORK_PATTERN_PER_MONTH', workPatternCode:'01', count:1 });
  if (/③多め/.test(text)) structured.push({ type:'PREFERRED_WORK_PATTERN', workPatternCode:'03' });
  if (/長期休暇/.test(text)) structured.push({ type:'LEAVE_RANGE_CANDIDATE' });
  if (/育児時間/.test(text)) structured.push({ type:'SHORT_TIME_WORK' });
  if (/⑥の次の日③/.test(text)) notes.push({ classification:'FUTURE_RULE', text:'特定勤務パターン翌日の希望パターン' });
  if (/火曜①か普通|木曜⑥以外/.test(text)) notes.push({ classification:'STANDARD_RULE_CANDIDATE', text:'曜日別の許可・不許可勤務パターン' });
  if (!structured.length && !notes.length) notes.push({ classification:'NOTE', text:'構造化未対応の勤務条件' });
  return { status: notes.some((x)=>x.classification==='NOTE') ? 'REVIEW' : 'CANDIDATE', structured, notes };
}

module.exports={normalizeText,normalizeTimeRange,parseDateCell,classifyFreeCondition,SHIFT_MARKS};
