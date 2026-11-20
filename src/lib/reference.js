// 실제 발행·계약 견적 + 2026 지역 시세에서 뽑은 참고 사례.
// 금액 단위: 만원, VAT 별도(일부 포함은 note에 표시), grade: A=공개 견적서, B=시공후기, C=지역 시세 집계, D=범위 추정
export const REFERENCE_CASES = [
  // 철거 (평)
  { id: 'D-02', trade: 'demolition', size: 34, unit: '평', title: '김포 34평 아파트 철거', low: 115, high: 115, note: '폐기물 1.7톤 · 사다리차 소형 2회 포함', grade: 'A', source: '집지니 2026.10' },
  { id: 'D-01', trade: 'demolition', size: 33, unit: '평', title: '시흥 33평 아파트 철거 (욕실 2곳)', low: 298, high: 298, note: '폐기물 2.9톤 · 자재 양중 15만 별도', grade: 'A', source: '집지니 2026.11' },
  { id: 'D-03', trade: 'demolition', size: 25, unit: '평', title: '용인 25평 아파트 철거', low: 297, high: 297, note: '폐기물 4.16톤(0.17톤/평) · 사다리차 대형', grade: 'A', source: '집지니 2026.11' },
  { id: 'D-04', trade: 'demolition', size: 88, unit: '평', title: '마곡 88평 상가 철거 + 원상복구', low: 950, high: 3250, note: '철거 950 + 원복 2,300', grade: 'B', source: '서울디자인 2022' },
  { id: 'R-01', trade: 'demolition', size: 15, unit: '평', title: '안동 상가 원상복구 (평당 18~28만)', low: 270, high: 420, note: '15평 환산 · 지역 시세', grade: 'D', source: '지역 집계' },
  { id: 'R-02', trade: 'demolition', size: 20, unit: '평', title: '예천 상가 1층 철거', low: 380, high: 560, note: '경량벽체·천장, 집게차 1회 포함', grade: 'C', source: '경북 시세 집계 2026' },

  // 욕실 (칸)
  { id: 'B-01', trade: 'bathroom', size: 1, unit: '칸', title: '24평 구축 욕실 올철거 (300×600)', low: 350, high: 350, note: '포세린+젠다이 졸리컷 30만 포함', grade: 'B', source: '블로그 시공후기 2022' },
  { id: 'B-03', trade: 'bathroom', size: 1, unit: '칸', title: '부산 600각 포세린 올철거', low: 556, high: 556, note: '도막방수 3회 · 천장돔 포함', grade: 'B', source: '업체 견적서 2023' },
  { id: 'B-04', trade: 'bathroom', size: 1, unit: '칸', title: '청주 25평 욕실(도기)+타일', low: 383, high: 383, note: '타일공 3일 · 방수 2회 · 도기 교체', grade: 'A', source: '집지니 2026.08' },
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
  { id: 'W-06', trade: 'wallpaper', size: 15, unit: '평', title: '15평 합지+장판 (원룸)', low: 120, high: 165, note: '엘베 없음 3층 · 계단 운반 포함', grade: 'C', source: '경북 시세 집계 2026' },

  // 타일·방수
  { id: 'T-01', trade: 'tilewaterproof', size: 2, unit: '평', title: '베란다 6㎡ 방수+타일', low: 70, high: 95, note: '철거+방수 2회+담수시험', grade: 'C', source: '지역 업체 견적 2026' },
  { id: 'T-02', trade: 'tilewaterproof', size: 6, unit: '평', title: '옥상 20㎡ 우레탄 방수', low: 110, high: 160, note: '2회 도포+보강테이프, 담수 별도', grade: 'C', source: '경북 시세 집계 2026' },
  { id: 'T-03', trade: 'tilewaterproof', size: 1.2, unit: '평', title: '욕실 바닥 4㎡ 타일만', low: 38, high: 60, note: '철거 없이 덧방 기준', grade: 'D', source: '지역 집계' },

  // 미장·바닥
  { id: 'P-01', trade: 'plaster', size: 6, unit: '평', title: '거실 20㎡ 바닥 미장', low: 50, high: 72, note: '고강도 몰탈 30mm + 양생 3일', grade: 'C', source: '경북 시세 집계 2026' },
  { id: 'P-02', trade: 'plaster', size: 12, unit: '평', title: '상가 40㎡ 미장+레벨', low: 90, high: 130, note: '전면 메쉬 포함', grade: 'C', source: '지역 업체 견적 2026' },

  // 창호·발코니
  { id: 'C-01', trade: 'window', size: 2, unit: '평', title: '발코니 6㎡ 시스템창', low: 150, high: 210, note: '3중 로이유리 · 방충망 포함', grade: 'C', source: '경북 시세 집계 2026' },
  { id: 'C-02', trade: 'window', size: 4, unit: '평', title: '아파트 창호 12㎡ 교체', low: 300, high: 390, note: 'PVC 이중창 기준', grade: 'C', source: '지역 업체 견적 2026' },

  // 폐기물
  { id: 'G-01', trade: 'waste', size: 2, unit: '톤', title: '폐기물 2톤 수거·처리', low: 60, high: 85, note: '성상 분리 기준, 1톤차 1대', grade: 'C', source: '2026 처리단가 기준' },
  { id: 'G-02', trade: 'waste', size: 5, unit: '톤', title: '상가 철거 폐기물 5톤', low: 170, high: 240, note: '2.5톤차 2대 · 혼합 반출 시 +40%', grade: 'C', source: '2026 처리단가 기준' },

  // 인력
  { id: 'L-01', trade: 'labor', size: 2, unit: '평', title: '일용 3명 1일 파견', low: 72, high: 84, note: '기공1+보조2, 식대 포함', grade: 'C', source: '경북 인력사무소 시세 2026' },
  { id: 'L-02', trade: 'labor', size: 5, unit: '평', title: '철거 인력 2명 3일', low: 130, high: 165, note: '4대보험·안전관리 포함', grade: 'C', source: '경북 인력사무소 시세 2026' },

  // 부분 수선
  { id: 'S-01', trade: 'repair', size: 1, unit: '개소', title: '문틀 교체 1개소', low: 15, high: 25, note: '문틀+몰딩 마감', grade: 'C', source: '지역 시세 집계 2026' },
  { id: 'S-02', trade: 'repair', size: 3, unit: '개소', title: '욕실 실리콘·타일 보수 3개소', low: 28, high: 45, note: '줄눈·실리콘 재시공', grade: 'C', source: '지역 시세 집계 2026' },

  // 복합 인테리어 (평)
  { id: 'M-01', trade: 'combined', size: 15, unit: '평', title: '안동 15평 전체 인테리어', low: 1450, high: 2100, note: '철거+도배+욕실1+주방, 엘베 없음', grade: 'C', source: '경북 시세 집계 2026' },
  { id: 'M-02', trade: 'combined', size: 24, unit: '평', title: '24평 복합(도배+욕실+주방)', low: 2100, high: 2900, note: '부분 철거 · 창호 제외', grade: 'C', source: '경북 시세 집계 2026' },
  { id: 'M-03', trade: 'combined', size: 32, unit: '평', title: '32평 아파트 전체 리모델링', low: 3000, high: 4500, note: '철거+도배+욕실2+주방+바닥', grade: 'D', source: '지역 집계' },
];

// 사례가 3건 미만인 공종을 위한 최소 보장 범위 (만원). 단위는 sizeOf 기준.
const TRADE_FALLBACK = {
  demolition: { low: 250, high: 420, note: '15평 원상복구 기준 지역 시세', source: '경북 시세 집계' },
  wallpaper: { low: 120, high: 260, note: '합지~실크+장판 기준', source: '지역 시세 집계' },
  bathroom: { low: 320, high: 560, note: '1칸 전체 철거 기준', source: '지역 시세 집계' },
  kitchen: { low: 300, high: 520, note: '3.2m 상·하부장+상판 기준', source: '지역 시세 집계' },
  tilewaterproof: { low: 45, high: 110, note: '방수+타일 소규모 기준', source: '지역 시세 집계' },
  plaster: { low: 50, high: 96, note: '바닥 미장 20㎡ 기준', source: '지역 시세 집계' },
  window: { low: 150, high: 320, note: '발코니·거실 창호 기준', source: '지역 시세 집계' },
  waste: { low: 60, high: 190, note: '2~5톤 처리 기준', source: '2026 처리단가' },
  labor: { low: 72, high: 150, note: '2~3명·1~3일 기준', source: '경북 인력 시세' },
  repair: { low: 15, high: 45, note: '부분 수선 1~3개소 기준', source: '지역 시세 집계' },
  combined: { low: 1450, high: 2900, note: '15~24평 복합 리모델링 기준', source: '경북 시세 집계' },
  custom: { low: 300, high: 900, note: '현장 조건별 범위', source: '지역 집계' },
  unclassified: { low: 300, high: 900, note: '공종 확정 전 범위', source: '지역 집계' },
};

function sizeOf(c, calc) {
  const trade = calc?.trade || c?.trade;
  if (trade === 'kitchen') return { value: parseFloat(c?.sizeValue) || 3.2, unit: 'm' };
  if (trade === 'bathroom') return { value: parseFloat(c?.sizeValue) || 1, unit: '칸' };
  const unit = c?.sizeUnit || '평';
  const v = parseFloat(c?.sizeValue) || 0;
  if (!v || unit === '모름') return { value: 15, unit: '평' };
  if (unit === '㎡') return { value: +(v / 3.3).toFixed(1), unit: '평' };
  if (unit === 'm') return { value: +(v * 1.5).toFixed(1), unit: '평' };
  if (unit === '칸') return { value: +(v * 1.8).toFixed(1), unit: '평' };
  if (unit === '톤') return { value: v, unit: '톤' };
  if (unit === '개소' || unit === '개') return { value: v, unit: '개소' };
  return { value: v, unit: '평' };
}

// 보관함(정산 완료)에 쌓인 '우리 현장'을 먼저 보여주고, 그 뒤에 외부 사례를 붙인다.
// 어떤 공종이든 최소 3건은 항상 나온다 — 빈 화면이 뜨지 않는다.
export function similarCases(c, calc, completedCases = []) {
  const trade = calc?.trade || c?.trade || 'wallpaper';
  const { value, unit } = sizeOf(c, calc);
  const price = Math.round(calc?.clientPrice || 0);

  const own = (completedCases || [])
    .filter((x) => (x.trade || trade) === trade && x.id !== c?.id)
    .map((x) => {
      const p = Number(x._price ?? x.clientPrice ?? x.customClientPrice ?? 0);
      return {
        id: `own-${x.id}`,
        trade,
        size: parseFloat(x.sizeValue) || value,
        unit: x.sizeUnit || unit,
        title: x.title || '우리 완료 현장',
        low: Math.round(p),
        high: Math.round(p),
        note: `${x.region || ''} · ${x.createdAt || ''} 정산 완료`.replace(/^ · /, ''),
        grade: '우리',
        source: '보관함 완료 현장',
        own: true,
        distance: Math.abs((parseFloat(x.sizeValue) || value) - value) / Math.max(1, value),
      };
    })
    .filter((x) => x.low > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);

  const db = REFERENCE_CASES.filter((r) => r.trade === trade)
    .map((r) => ({ ...r, distance: Math.abs(r.size - value) / Math.max(1, value) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(3, 5 - own.length));

  let items = [...own, ...db];
  if (items.length < 3) {
    const fb = TRADE_FALLBACK[trade] || TRADE_FALLBACK.custom;
    const label = { combined: '복합 인테리어', tilewaterproof: '타일·방수', plaster: '바닥 미장', window: '창호', waste: '폐기물', labor: '인력', repair: '부분 수선', custom: '현장' }[trade] || '공사';
    const fills = [
      { id: `${trade}-fb1`, title: `${value}${unit} ${label} 시세 범위`, low: fb.low, high: fb.high, note: fb.note, grade: 'D', source: fb.source },
      { id: `${trade}-fb2`, title: `${label} 소규모 기준`, low: Math.round(fb.low * 0.55), high: Math.round(fb.high * 0.7), note: '규모가 작을 때 최소 출동비 포함', grade: 'D', source: '지역 집계' },
      { id: `${trade}-fb3`, title: `${label} 대형·복합 기준`, low: Math.round(fb.high * 1.1), high: Math.round(fb.high * 1.5), note: '면적·층수·철거 범위가 클 때', grade: 'D', source: '지역 집계' },
    ];
    for (const f of fills) {
      if (items.length >= 3) break;
      if (!items.find((x) => x.id === f.id)) items.push({ ...f, size: value, unit, distance: 1 });
    }
  }

  const low = Math.min(...items.map((r) => r.low));
  const high = Math.max(...items.map((r) => r.high));
  let verdict = { tone: 'ok', text: '사례 범위와 비슷합니다' };
  if (price > 0 && price < low * 0.9) verdict = { tone: 'bad', text: '사례보다 낮습니다 — 적자 위험' };
  else if (price > high * 1.15) verdict = { tone: 'warn', text: '사례보다 높습니다 — 수주가 어려울 수 있음' };

  return { items, verdict, size: `${value}${unit}`, price, low, high, ownCount: own.length };
}
