// 변동 내역 이름표 — 화면에서 '무엇 때문에 돈이 붙었는지' 바로 읽히게 만든다.
// 예) 예전 저장값 '고급·호텔 느낌 등급' → '자재·마감 등급 (고급·호텔 느낌 · 기본 대비)'
export function gradeChangeLabel(label) {
  const name = String(label || '').trim() || '선택 등급';
  return `자재·마감 등급 (${name} · 기본 대비)`;
}

// 저장된 변동 내역(예전 라벨 포함)을 화면용 이름으로 바꾼다.
export function changeLabel(log) {
  const item = String(log?.item || '').trim();
  const reason = String(log?.reason || '').trim();
  const grade = item.match(/^(.+?)\s*등급$/);
  if (grade) return gradeChangeLabel(grade[1]);
  return item || reason;
}

// 새로 쌓는 변동 내역의 이유 문장도 같은 말로 맞춘다.
export function gradeChangeReason(label, rate) {
  const name = String(label || '').trim() || '선택 등급';
  return `자재·마감 등급을 ${name}으로 올림 — 기본 자재 대비 +${rate}%`;
}
