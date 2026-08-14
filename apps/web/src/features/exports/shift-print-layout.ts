import type { PrintShiftData } from '../../api/client';

export type PrintPaper = 'A4' | 'A3' | 'B4';
export type PrintOrientation = 'portrait' | 'landscape';
export type PrintOptions = { paper: PrintPaper; orientation: PrintOrientation };
export const defaultAdminPrintOptions: PrintOptions = { paper: 'B4', orientation: 'landscape' };
export const defaultPersonalPrintOptions: PrintOptions = { paper: 'A4', orientation: 'landscape' };

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const shiftClass = (value: string) => value.includes('早出') ? 'shift-early' : value.includes('通常') ? 'shift-normal' : value.includes('遅出') ? 'shift-late' : value.includes('有給') ? 'shift-paid' : value.includes('夏季') ? 'shift-summer' : value.includes('半休') ? 'shift-half' : value.includes('休') ? 'shift-off' : 'shift-other';
const shortShift = (value: string) => value.includes('早出') ? '早出' : value.includes('通常') ? '通常' : value.includes('遅出') ? '遅出' : value.includes('有給') ? '有休' : value.includes('夏季') ? '夏休' : value.includes('午前半休') ? '午前休' : value.includes('午後半休') ? '午後休' : value.includes('休') ? '休' : value;
const time = (start: string | null, end: string | null) => start ? `${start}〜${end ?? ''}` : '—';
const baseStyles = (options: PrintOptions) => `@page{size:${options.paper} ${options.orientation};margin:8mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;font-size:11px;color:#17221d;margin:0}h1{color:#28705a;margin:0 0 4px}.meta{margin:0 0 12px;color:#52615a}.toolbar{margin:14px 0}.shift-badge{display:inline-block;border:1px solid #7b8781;border-radius:5px;padding:2px 6px;font-weight:800}.shift-normal{background:#e7f3ed;color:#174c38}.shift-early{background:#ffedd5;color:#7c2d12}.shift-late{background:#dbeafe;color:#172554}.shift-off{background:#fafbf9;color:#37453f}.shift-paid{background:#fff7d9;color:#713f12}.shift-summer{background:#fef3c7;color:#713f12}.shift-half{background:#f3e8ff;color:#581c87}.shift-other{background:#f1f5f9;color:#334155}@media print{.toolbar{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
const header = (data: PrintShiftData, title: string) => `<h1>AeN Shift｜${escapeHtml(data.tenantName)} ${title}</h1><p class="meta">${escapeHtml(data.month)}／${data.status === 'CONFIRMED' ? '確定済み' : '下書き'}／出力 ${escapeHtml(new Date(data.printedAt).toLocaleString('ja-JP'))}</p>`;
const button = '<div class="toolbar"><button onclick="window.print()">印刷／PDFとして保存</button></div>';

export function adminPrintHtml(data: PrintShiftData, classFilter = '', options = defaultAdminPrintOptions) {
  const assignments = classFilter ? data.assignments.filter((item) => item.assignedClass === classFilter) : data.assignments;
  const groups = new Map<string, typeof assignments>();
  for (const item of assignments) groups.set(item.employeeNumber, [...(groups.get(item.employeeNumber) ?? []), item]);
  const days = [...new Set(assignments.map((item) => item.date))].sort();
  const heading = days.map((date) => { const row = assignments.find((item) => item.date === date); return `<th>${Number(date.slice(-2))}<small>${escapeHtml(row?.weekday ?? '')}</small></th>`; }).join('');
  const rows = [...groups.values()].map((items) => {
    const first = items[0]; const byDate = new Map(items.map((item) => [item.date, item]));
    return `<tr><th class="staff-name">${escapeHtml(first.staffName)}<small>${escapeHtml(first.employeeNumber)}</small></th>${days.map((date) => { const item = byDate.get(date); return `<td>${item ? `<span class="shift-badge ${shiftClass(item.shiftType)}">${escapeHtml(shortShift(item.shiftType))}</span>` : '—'}</td>`; }).join('')}</tr>`;
  }).join('');
  const classLabels: Record<string, string> = { AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' };
  const title = classFilter ? `${classLabels[classFilter] ?? classFilter} 職員シフト表` : '全職員シフト表';
  return `<!doctype html><html lang="ja"><head><title>AeN Shift 全職員シフト表</title><style>${baseStyles(options)}.monthly{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}.monthly th,.monthly td{border:1px solid #89958f;padding:2px 1px;text-align:center;vertical-align:middle}.monthly thead th{background:#edf6f1}.monthly small{display:block;font-size:7px;font-weight:500}.monthly .staff-name{width:25mm;text-align:left;padding-left:4px;font-size:9px}.monthly .shift-badge{min-width:0;border:0;padding:1px;font-size:8px}.legend{margin-top:6px;font-size:9px}</style></head><body>${header(data, title)}${button}<table class="monthly"><thead><tr><th class="staff-name">職員</th>${heading}</tr></thead><tbody>${rows}</tbody></table><p class="legend">凡例：早出／通常／遅出／休／有休／夏休／午前休／午後休／その他</p></body></html>`;
}

export function personalCalendarPrintHtml(data: PrintShiftData, options = defaultPersonalPrintOptions) {
  const byDate = new Map(data.assignments.map((item) => [item.date, item]));
  const [year, month] = data.month.split('-').map(Number);
  const mondayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(mondayOffset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, week) => `<tr>${cells.slice(week * 7, week * 7 + 7).map((day) => {
    if (!day) return '<td class="empty"></td>';
    const item = byDate.get(`${data.month}-${String(day).padStart(2, '0')}`);
    return `<td><strong class="day-number">${day}</strong>${item ? `<span class="shift-badge ${shiftClass(item.shiftType)}">${escapeHtml(shortShift(item.shiftType))}</span><span class="time">${escapeHtml(time(item.startTime, item.endTime))}</span>` : '<span class="no-shift">勤務登録なし</span>'}</td>`;
  }).join('')}</tr>`).join('');
  const staffName = data.assignments[0]?.staffName ?? '本人';
  return `<!doctype html><html lang="ja"><head><title>AeN Shift わたしの勤務カレンダー</title><style>${baseStyles(options)}.calendar{width:100%;border-collapse:collapse;table-layout:fixed}.calendar th{border:1px solid #7b8781;background:#edf6f1;padding:6px;text-align:center}.calendar td{height:92px;border:1px solid #7b8781;padding:6px;vertical-align:top}.calendar th:nth-child(6),.calendar td:nth-child(6){background-color:#f3f7ff}.calendar th:nth-child(7),.calendar td:nth-child(7){background-color:#fff7f7}.day-number{display:block;font-size:14px;margin-bottom:7px}.calendar .shift-badge{display:block;width:max-content}.time{display:block;margin-top:6px;font-weight:700}.no-shift{display:block;color:#68756f;margin-top:8px}.empty{background:#f8faf9}</style></head><body>${header(data, `わたしの勤務カレンダー｜${escapeHtml(staffName)}`)}${button}<table class="calendar"><thead><tr>${['月','火','水','木','金','土','日'].map((day) => `<th>${day}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p>凡例：早出／通常／遅出／休／有休／午前休／午後休／その他（色に加えて文字でも表示）</p></body></html>`;
}

export function openPrintWindow(html: string) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('印刷画面を開けませんでした。ブラウザのポップアップを許可してください。');
  popup.opener = null;
  popup.document.write(html);
  popup.document.close();
}
