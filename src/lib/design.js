// 디자인·자재 번역기 — 등급(가성비~고급) + 키워드 + 공종 → 구체 자재 조합 · 권장 추가 비율
// 등급 라벨은 공간(욕실·주방·상가·발코니)에 상관없이 쓰는 '분위기/등급' 이름이다.
// 자재 조합과 권장 추가 비율은 지금 현장의 공종(도배/욕실/주방/철거/복합)에 맞춰 달라진다.
import { TRADES } from './constants';
import { detailRowsFor, detailTotals } from './details';

export const DESIGN_PRESETS = [
  {
    id: 'value',
    label: '가성비·실속',
    desc: '임대·원복·기본 자재',
    palette: ['#FAFAF8', '#DFD8C6', '#8B939A'],
    bump: { wallpaper: 0, bathroom: 0, kitchen: 0, demolition: 0, combined: 0 },
    specs: {
      wallpaper: ['소합지 화이트(무지)', '1.8T 모노륨 아이보리', '기존 조명·몰딩 재사용'],
      bathroom: ['300×600 국산타일(무광 화이트)', '국산 도기·수전 세트', '3000K 방습등'],
      kitchen: ['LPM 아이보리 상·하부장', '인조대리석 아이보리', '기본 손잡이 + 기존 후드 재사용'],
      demolition: ['원상복구 기본 마감', '바닥 샌딩', '소모품 포함'],
      combined: ['소합지 + 1.8T 장판', '300×600 국산타일', '기본 조명'],
    },
  },
  {
    id: 'clean',
    label: '깔끔·무난',
    desc: '일반 거주·상가 표준',
    palette: ['#FFFFFF', '#E7E4DD', '#9AA1A9'],
    bump: { wallpaper: 0, bathroom: 0, kitchen: 0, demolition: 0, combined: 0 },
    specs: {
      wallpaper: ['광폭 합지 화이트/아이보리', '2.0T 모노륨 라이트오크', '기본 몰딩 + 3색 LED'],
      bathroom: ['300×600 무광 화이트 타일', '국산 크롬 수전·도기', '4000K 방습등'],
      kitchen: ['LPM 화이트 상·하부장', '인조대리석 화이트', '기본 손잡이 + 언더캐비닛등'],
      demolition: ['철거 후 평탄 마감', '데코타일 기본', '배관·몰딩 정리'],
      combined: ['광폭 합지 + 2.0T 장판', '300×600 타일', '4000K 매입등'],
    },
  },
  {
    id: 'modern',
    label: '모던·미니멀',
    desc: '무채색·군더더기 없는 마감',
    palette: ['#F4F5F6', '#9AA1A9', '#22262B'],
    bump: { wallpaper: 4, bathroom: 6, kitchen: 6, demolition: 3, combined: 5 },
    specs: {
      wallpaper: ['합지 무지 화이트/라이트그레이', '1.8T 모노륨 라이트그레이', '무몰딩 마감 + 4000K 간접등'],
      bathroom: ['600×1200 포세린 그레이(벽) + 300각 바닥타일', '무광 블랙 수전', '4000K 매입등 + 거울 간접등'],
      kitchen: ['무광 그레이 도어 상·하부장', '인조대리석 화이트 무광 상판', '매립 손잡이 + 4000K 언더등'],
      demolition: ['노출 철거 마감(천장 정리)', '무지 그레이 데코타일', '배관 은폐 정리'],
      combined: ['무지 그레이 벽지 + 1.8T 장판', '600×1200 그레이 타일', '4000K 매입등 통일'],
    },
  },
  {
    id: 'wood',
    label: '우드·따뜻한 톤',
    desc: '원목·내추럴 분위기',
    palette: ['#F5F1E8', '#C9A57A', '#96A0A8'],
    bump: { wallpaper: 5, bathroom: 6, kitchen: 6, demolition: 3, combined: 5 },
    specs: {
      wallpaper: ['광폭 합지 화이트(무지) + 오크 걸레받이 60mm', '2.2T 모노륨 오크 패턴', '3000K 다운라이트 + 무광 니켈 스위치'],
      bathroom: ['600각 포세린 화이트(벽) + 오크 패턴 바닥타일', '무광 니켈 수전·악세사리', '3000K 매입등 4인치 ×2'],
      kitchen: ['LPM 화이트 상부장 + 오크 하부장', '인조대리석 화이트 상판(무광)', '무광 니켈 손잡이 + 3000K 언더캐비닛등'],
      demolition: ['철거 후 노출 천장 정리', '오크 패턴 데코타일', '무광 니켈 배관·몰딩 정리'],
      combined: ['화이트 벽지 + 오크 장판', '600각 화이트 타일 욕실', '3000K 다운라이트 통일'],
    },
  },
  {
    id: 'premium',
    label: '고급·호텔 느낌',
    desc: '대형 자재·포인트 마감',
    palette: ['#EFE7D9', '#B79A73', '#33312E'],
    bump: { wallpaper: 8, bathroom: 12, kitchen: 12, demolition: 6, combined: 10 },
    specs: {
      wallpaper: ['실크 벽지(샴페인) + 우드 몰딩', '2.5T 모노륨 샴페인', '2700K 간접등 + 스포트'],
      bathroom: ['600×1200 대형 포세린(벽) + 600각 헤링본 바닥', '무광 니켈 매립수전 + 우드 도어', '3000K 간접등 + 거울등'],
      kitchen: ['LPM 무광 샴페인 도어', '엔지니어드 스톤 상판', '3000K 펜던트 + 언더등'],
      demolition: ['철거 후 마감재 별도 산정', '대형 타일 바닥', '매립 배관 정리'],
      combined: ['샴페인 실크 벽지', '600×1200 포세린 욕실', '매립수전 + 간접등'],
    },
  },
];

// 예전에 저장된 프리셋 id → 새 등급 id
const LEGACY_PRESET = { whitewood: 'wood', hotel: 'premium', vintage: 'wood' };

const KEYWORD_MAP = [
  { re: /가성비|실속|저렴|임대|최소|기본|원복|싸게/, id: 'value' },
  { re: /깔끔|무난|단정|평범|일반|표준/, id: 'clean' },
  { re: /미니멀|모던|무채색|그레이|블랙|화이트\s*모던|군더더기/, id: 'modern' },
  { re: /우드|원목|오크|따뜻|베이지|내추럴|북유럽|패턴|빈티지/, id: 'wood' },
  { re: /호텔|고급|스파|리조트|대형\s*타일|샴페인|럭셔리|고급스/, id: 'premium' },
];

export function guessPreset(text = '', trade = 'wallpaper') {
  const t = String(text || '');
  const hit = KEYWORD_MAP.find((k) => k.re.test(t));
  if (hit) return hit.id;
  const id = TRADES[trade]?.id;
  if (id === 'bathroom' || id === 'kitchen') return 'premium';
  return 'clean';
}

const DETAIL_QUESTIONS = {
  jollycut: '곡면 구간(기둥·아치)이 있나요? 졸리컷은 평면에는 효과가 없고, 곡면이 없으면 비용만 늘어납니다.',
  nomolding: '무몰딩은 벽 수평 오차 3mm 이내여야 합니다. 벽체 수평 보정(추가 비용)까지 포함할까요?',
  hiddendoor: '히든도어는 문틀 철거·목공 보강이 필요합니다. 문 개수와 규격(폭·높이)을 알려주세요.',
  recessedfaucet: '매립수전은 벽체 배관 이동이 필요합니다. 기존 배관 위치를 확인해도 될까요?',
  indirectlight: '간접등은 전기 배선 추가가 필요합니다. 전기 공사 범위에 포함할까요?',
};

const TRADE_QUESTIONS = {
  bathroom: [
    '600각 포세린과 300×600 국산타일의 자재비 차이는 약 10만원/칸입니다. 어느 쪽으로 확정할까요?',
    '덧방(기존 타일 위에 붙이기)은 층고와 문틀 때문에 권하지 않습니다. 전체 철거로 진행할까요?',
  ],
  wallpaper: [
    '실크와 합지는 자재비 차이가 약 20만원입니다. 실거주 예정이라면 실크를 권합니다. 어느 쪽으로 할까요?',
    '기존 벽지 제거 후 벽 상태가 나쁘면 초배를 한 번 더 해야 합니다. 추가 비용이 발생할 수 있는데 진행할까요?',
  ],
  kitchen: [
    '상판 수전 홀 위치와 싱크볼 좌/우를 확정해 주세요. 가공 후에는 변경이 어렵습니다.',
    '기존 후드와 가스레인지를 재사용할까요, 교체할까요?',
  ],
  demolition: [
    '천장 텍스 두께와 면적을 알려주세요. 석면 조사 대상 여부가 여기서 갈립니다.',
    '철거 후 원상복구 수준(바닥 샌딩 포함 여부)을 정해야 합니다. 어디까지 할까요?',
  ],
  combined: [
    '철거 범위(천장·벽체·바닥)와 남길 부분을 구분해 주세요.',
    '욕실·주방을 같은 일정에 묶으면 인력비가 줄어듭니다. 동시 시공으로 진행할까요?',
  ],
};

export function translateDesign(c, tradeHint) {
  const trade = TRADES[tradeHint || c?.trade] ? tradeHint || c.trade : 'wallpaper';
  const design = c?.design || {};
  const rawId = LEGACY_PRESET[design.preset] || design.preset;
  const presetId = DESIGN_PRESETS.find((p) => p.id === rawId)
    ? rawId
    : guessPreset(`${design.keywords || ''} ${c?.notes || ''}`, trade);
  const preset = DESIGN_PRESETS.find((p) => p.id === presetId) || DESIGN_PRESETS[1];
  // 이 공종에 자재 조합이 없으면 빈 목록 — 다른 공종(도배) 자재를 끌어오지 않는다.
  const specs = preset.specs[trade] || [];

  const detailRows = detailRowsFor(design);
  const { rate, days } = detailTotals(detailRows);
  const gradeRate = preset.bump?.[trade] ?? 0;

  const questions = [];
  detailRows.forEach((d) => {
    if (DETAIL_QUESTIONS[d.id]) questions.push(DETAIL_QUESTIONS[d.id]);
  });
  (TRADE_QUESTIONS[trade] || TRADE_QUESTIONS.combined).forEach((q) => questions.push(q));
  questions.push('고객이 보낸 참고 사진과 같은 톤으로 실제 현장 채광에서 확인했나요? 사진과 실물은 색이 다르게 보입니다.');

  const unique = Array.from(new Set(questions)).slice(0, 3);

  return {
    preset,
    presetId,
    combo: specs,
    detailRows,
    rate,
    days,
    questions: unique,
    gradeRate,
    gradeNote:
      gradeRate > 0
        ? `${preset.label} 등급은 ${TRADES[trade]?.short || '이 공종'} 기준 보통 견적에 +${gradeRate}% 더 붙습니다. 지금 금액에는 아직 넣지 않았습니다.`
        : `${preset.label} 등급은 표준 단가로 계산합니다.`,
    notice:
      rate > 0
        ? `손이 많이 가는 마감 ${detailRows.length}개를 넣었습니다 — 견적이 ${rate}% 올라가고 공사 기간이 ${days}일 늘어납니다.`
        : '손이 많이 가는 마감 없음 — 표준 단가로 계산했습니다.',
    schedule: `자재 발주 D-3 · 시공 ${2 + days}일 예상`,
  };
}
