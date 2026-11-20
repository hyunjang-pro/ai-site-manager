// '손이 많이 가는 마감' 라이브러리 — 고정 5개 대신 자유 입력(텍스트·사진) + 자주 쓰는 칩.
// 입력한 글에서 키워드를 찾아 견적 할증률과 추가 일수를 계산한다.
import { HARD_DETAILS } from './constants.js';

export const DETAIL_LIBRARY = [
  ...HARD_DETAILS.map((d) => ({ ...d, words: detailWords(d.id, d.label) })),
  { id: 'arch', label: '아치 게이트', words: ['아치', '아치형', '아치 게이트', '아치게이트'], rate: 12, days: 1 },
  { id: 'temba', label: '우드 템바보드', words: ['템바', '템바보드', '우드보드', '슬랫'], rate: 18, days: 1 },
  { id: 'ceilingfan', label: '실링팬 보강', words: ['실링팬', '선풍기 조명'], rate: 10, days: 1 },
  { id: 'bigtile', label: '대형 포세린', words: ['대형 포세린', '대형포세린', '600×1200', '600x1200', '1200각'], rate: 12, days: 1 },
  { id: 'niche', label: '벽체 니치·선반', words: ['니치', '벽체 파기', '벽파기', '선반장'], rate: 14, days: 1 },
  { id: 'brick', label: '파벽돌·브릭', words: ['파벽돌', '브릭', '벽돌'], rate: 16, days: 2 },
  { id: 'linelight', label: '라인조명·코브', words: ['라인조명', '코브', '선형조명'], rate: 12, days: 1 },
  { id: 'woodfloor', label: '강마루·원목바닥', words: ['강마루', '원목', '마루'], rate: 10, days: 1 },
  { id: 'hiddenhinge', label: '히든힌지·무경첩', words: ['히든힌지', '무경첩'], rate: 8, days: 0 },
];

function detailWords(id, label) {
  const map = {
    jollycut: ['졸리컷', '곡면', '라운드 재단'],
    nomolding: ['무몰딩', '몰딩 없', '몰딩없'],
    hiddendoor: ['히든도어', '숨은문', '숨김문'],
    recessedfaucet: ['매립수전', '매립 수전', '벽붙이 수전'],
    indirectlight: ['간접등', '간접조명', '코브조명'],
  };
  return map[id] || [label];
}

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// 자유 입력 글에서 라이브러리 항목을 찾는다. (오탐을 줄이려 단어 길이 2 이상만)
export function parseDetailText(text = '') {
  const t = norm(text);
  if (!t) return [];
  return DETAIL_LIBRARY.filter((d) => d.words.some((w) => t.includes(norm(w))));
}

// 체크(design.details) + 자유 입력(design.customDetails) + 참고 사진 메모를 합쳐 최종 디테일 목록
export function detailRowsFor(design = {}) {
  const selected = Array.isArray(design?.details) ? design.details : [];
  const byId = DETAIL_LIBRARY.filter((d) => selected.includes(d.id));
  const parsed = parseDetailText(`${design?.customDetails || ''} ${design?.keywords || ''}`);
  const merged = [...byId];
  parsed.forEach((d) => {
    if (!merged.find((x) => x.id === d.id)) merged.push(d);
  });
  return merged;
}

export function detailTotals(rows = []) {
  const rate = Math.min(60, rows.reduce((s, d) => s + (Number(d.rate) || 0), 0));
  const days = rows.reduce((s, d) => s + (Number(d.days) || 0), 0);
  return { rate, days };
}
