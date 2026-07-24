export function assignmentKey(staffId, workDate) {
  return `${staffId}:${workDate.slice(0, 10)}`;
}
