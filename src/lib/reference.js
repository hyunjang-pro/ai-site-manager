// 실제 발행·계약 견적 60건에서 뽑은 참고 사례 (work/real-interior-quotes-2026.md)
// 금액 단위: 만원, VAT 별도(일부 포함은 note에 표시)
export const REFERENCE_CASES = [
  // 철거 (평)
  { id: 'D-02', trade: 'demolition', size: 34, unit: '평', title: '김포 34평 아파트 철거', low: 115, high: 115, note: '폐기물 1.7톤 · 사다리차 소형 2회 포함', grade: 'A', source: '집지니 2026.10' },
  { id: 'D-01', trade: 'demolition', size: 33, unit: '평', title: '시흥 33평 아파트 철거 (욕실 2곳)', low: 298, high: 298, note: '폐기물 2.9톤 · 자재 양중 15만 별도', grade: 'A', source: '집지니 2026.11' },
  { id: 'D-03', trade: 'demolition', size: 25, unit: '평', title: '용인 25평 아파트 철거', low: 297, high: 297, note: '폐기물 4.16톤(0.17톤/평) · 사다리차 대형', grade: 'A', source: '집지니 2026.11' },
  { id: 'D-04', trade: 'demolition', size: 88, unit: '평', title: '마곡 88평 상가 철거 + 원상복구', low: 950, high: 3250, note: '철거 950 + 원복 2,300', grade: 'B', source: '서울디자인 2022' },
  { id: 'R-01', trade: 'demolition', size: 15, unit: '평', title: '안동 상가 원상복구 (평당 18~28만)', low: 270, high: 420, note: '15평 환산 · 지역 시세', grade: 'D', source: '지역 집계' },

  // 욕실 (칸)
  { id: 'B-01', trade: 'bathroom', size: 1, unit: '칸', title: '24평 구축 욕실 올철거 (300×600)', low: 350, high: 350, note: '포세린+젠다이 졸리컷 30만 포함', grade: 'B', source: '블로그 시공후기 2022' },
  { id: 'B-03', trade: 'bathroom', size: 1, unit: '칸', title: '부산 600각 포세린 올철거', low: 556, high: 556, note: '도막방수 3회 · 천장돔 포함', grade: 'B', source: '업체 견적서 2023' },
  { id: 'B-04', trade: 'bathroom', size: 1, unit: '칸', title: '청주 25평 욕실(도기)+타일', low: 383, high: 383, note: '타일공 3일 105만 · 방수 20만', grade: 'A', source: '집지니 2026.08' },
  { id: 'B-05', trade: 'bathroom', size: 1, unit: '칸', title: '김포 34평 안방 욕실', low: 326, high: 326, note: '도기 135 + 타일 166 + 수전·배관 25', grade: 'A', source: '집지니 2026.10' },
  { id: 'B-02', trade: 'bathroom', size: 1, unit: '칸', title: '23평 욕실 덧방 (600각)', low: 330, high: 380, note: '철거·방수 생략, 타일공 98만', grade: 'B', source: '시공후기 2025' },

  // 주방 (m)
  { id: 'K-02', trade: 'kitchen', size: 3.9, unit: 'm', title: '양천 3.9m 전체 교체', low: 350, high: 350, note: '상하부장+상판+후드+철거·폐기', grade: 'B', source: '업체 3안 비교 2026' },
  { id: 'K-03', trade: 'kitchen', size: 3.2, unit: 'm', title: '싱크대 도급 80만/m', low: 300, high: 350, note: '3.2m 256 + 철거 45 수준', grade: 'A', source: '집지니 2026' },
  { id: 'K-01', trade: 'kitchen', size: 6.1, unit: 'm', title: '일산 34평 주방 전체', low: 690, high: 690, note: '부가세 포함 · 미드웨이·신발장 포함', grade: 'B', source: '업체 견적표 2026.03' },
  { id: 'K-06', trade: 'kitchen', size: 3.2, unit: 'm', title: '싱크대 274건 중간값', low: 451, high: 451, note: '34평 아일랜드·키큰장 없음 기준', grade: 'D', source: '얼마드나 2026.09' },

  // 도배·장판 (평)
  { id: 'W-02a', trade: 'wallpaper', size: 24, unit: '평', title: '24평 합지 + 1.8T', low: 149, high: 149, note: '공급가 · 철거 별도', grade: 'B', source: '셀핀 2023' },
  { id: 'W-02b', trade: 'wallpaper', size: 24, unit: '평', title: '24평 실크 + 2.2T', low: 245, high: 245, note: '공급가 · 철거 별도', grade: 'B', source: '셀핀 2023' },
  { id: 'W-03', trade: 'wallpaper', size: 24, unit: '평', title: '24평 하우스텝 실제 계약', low: 149, high: 149, note: '퍼티 33만 추가된 실제 금액', grade: 'B', source: '하우스텝 2021' },
  { id: 'W-05', trade: 'wallpaper', size: 32, unit: '평', title: '32평 실크 도배', low: 250, high: 250, note: '실크 도배만', grade: 'B', source: '시공후기' },
];

function sizeOf(c, calc) {
  const trade = calc?.trade || c?.trade;
  if (trade === 'kitchen') return { value: parseFloat(c?.sizeValue) || 3.2, unit: 'm' };
  if (trade === 'bathroom') return { value: parseFloat(c?.sizeValue) || 1, unit: '칸' };
  const v = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  if (!v || unit === '모름') return { value: 15, unit: '평' };
  if (unit === '㎡') return { value: v / 3.3, unit: '평' };
  if (unit === 'm') return { value: v * 1.5, unit: '평' };
  if (unit === '칸') return { value: v * 1.8, unit: '평' };
  return { value: v, unit: '평' };
}

export function similarCases(c, calc) {
  const trade = calc?.trade || c?.trade || 'wallpaper';
  const { value, unit } = sizeOf(c, calc);
  const list = REFERENCE_CASES.filter((r) => r.trade === trade);
  if (!list.length) return { items: [], verdict: null };

  const scored = list
    .map((r) => ({ ...r, distance: Math.abs(r.size - value) / Math.max(1, value) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const price = Math.round(calc?.clientPrice || 0);
  const low = Math.min(...scored.map((r) => r.low));
  const high = Math.max(...scored.map((r) => r.high));
  let verdict = { tone: 'ok', text: '사례 범위와 비슷합니다' };
  if (price > 0 && price < low * 0.9) verdict = { tone: 'bad', text: '사례보다 낮습니다 — 적자 위험' };
  else if (price > high * 1.15) verdict = { tone: 'warn', text: '사례보다 높습니다 — 수주가 어려울 수 있음' };

  return { items: scored, verdict, size: `${value}${unit}`, price, low, high };
}
