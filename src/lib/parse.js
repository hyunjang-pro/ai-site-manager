// 통합 입력(숨고·카톡·메모) 자동 분류 — 평수 강제 없이 읽을 수 있는 것만 읽는다.
export function parseInput(text = '') {
  const t = String(text || '').toLowerCase();
  const scores = { demolition: 0, wallpaper: 0, bathroom: 0, kitchen: 0 };

  if (/철거|원상복구|텍스|경량벽체|집게차|폐기물|석고벽|가벽|데코타일/.test(t)) scores.demolition += 3;
  if (/도배|합지|실크|장판|초배|정배|벽지/.test(t)) scores.wallpaper += 3;
  if (/욕실|화장실|타일|양변기|세면대|방수|포세린|600각|덧방|아메리칸|샤워/.test(t)) scores.bathroom += 3;
  if (/주방|싱크대|씽크대|인조대리석|상판|후드|수납장/.test(t)) scores.kitchen += 3;

  let trade = 'unclassified';
  const kinds = Object.entries(scores).filter(([, v]) => v > 0).map(([k]) => k);
  if (kinds.length >= 2) trade = 'combined';
  else if (kinds.length === 1) trade = kinds[0];

  let sizeValue = '';
  let sizeUnit = '';
  let floor = '';

  const floorMatch = t.match(/(\d+)\s*층/);
  if (floorMatch) floor = parseInt(floorMatch[1], 10);

  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평/);
  const sqm = t.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)/);
  const meter = t.match(/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!2)/);
  const kan = t.match(/(\d+(?:\.\d+)?)\s*(?:칸|개소)/);
  const ton = t.match(/(\d+(?:\.\d+)?)\s*(?:톤|차)/);

  if (trade === 'kitchen' && meter) {
    sizeValue = parseFloat(meter[1]);
    sizeUnit = 'm';
  } else if (trade === 'bathroom' && kan) {
    sizeValue = parseFloat(kan[1]);
    sizeUnit = '칸';
  } else if (pyung) {
    sizeValue = parseFloat(pyung[1]);
    sizeUnit = '평';
  } else if (sqm) {
    sizeValue = parseFloat(sqm[1]);
    sizeUnit = '㎡';
  } else if (meter) {
    sizeValue = parseFloat(meter[1]);
    sizeUnit = 'm';
  } else if (kan) {
    sizeValue = parseFloat(kan[1]);
    sizeUnit = '칸';
  } else if (ton) {
    sizeValue = parseFloat(ton[1]);
    sizeUnit = '톤';
  }

  const hints = [];
  if (/텍스|슬레이트/.test(t)) hints.push('천장 텍스·슬레이트 — 석면 조사가 필요한지 확인하세요.');
  if (/누수|곰팡이|균열|크랙/.test(t)) hints.push('누수·곰팡이 흔적 — 보수 범위를 먼저 확인하세요.');
  if (/엘베\s*없|엘리베이터\s*없/.test(t)) hints.push('엘리베이터 없음 — 계단 운반비가 붙습니다.');
  if (/집게차/.test(t)) hints.push('집게차 투입 — 장비비 약 30만원이 붙습니다.');
  if (/급한|빨리|이번\s*주|내일/.test(t)) hints.push('일정이 급함 — 인력·자재 수급부터 확인하세요.');
  if (/숨고/.test(t)) hints.push('숨고 요청서 — 48시간 안에 닫히고 최대 10명이 견적을 냅니다. 30분 안에 1차 답변을 남기세요.');

  const keywords = [];
  ['화이트', '우드', '모던', '미니멀', '호텔', '빈티지', '카페', '가성비', '실속', '그레이', '블랙', '원목'].forEach((k) => {
    if (t.includes(k.toLowerCase())) keywords.push(k);
  });

  return { trade, sizeValue, sizeUnit, floor, hints, keywords, detected: kinds.length > 0 };
}

export function firstCallQuestions(c, parsed = {}) {
  const qs = [];
  if (!parsed.floor && !c?.lifting?.floor) qs.push('엘리베이터가 있나요? 몇 층인가요?');
  else if (c?.lifting?.ladderAllowed === 'unknown') qs.push('건물 앞에 사다리차를 세울 수 있나요? (주차·소방통로)');
  if (!c?.photos?.length) qs.push('철거·시공 범위 사진 3장(바닥·욕실·주방)을 보내주세요.');
  if (!c?.sizeValue || c?.sizeUnit === '모름') qs.push('평수나 시공 길이를 아시나요? (모르시면 실측 때 재겠습니다)');
  if (!qs.length) qs.push('희망 착공일과 거주 중 여부를 알려주세요. (일정과 보양비가 달라집니다)');
  while (qs.length < 3) qs.push('현장에서 특별히 걱정되는 부분(누수·균열·소음)이 있나요?');
  return qs.slice(0, 3);
}


// 현장 변동 메모에서 "빼기/취소"를 읽는다 — "미장 불필요", "사다리차 제외" 등
const CANCEL_RE = /(불필요|필요\s*없|필요없|제외|취소|안\s*함|안함|삭제|없애|철회|미시공|하지\s*않)/;

export const PROCESS_KEYWORDS = [
  { id: 'plaster', label: '미장', words: ['미장', '몰탈', '바닥 미장'] },
  { id: 'ladder', label: '사다리차', words: ['사다리차'] },
  { id: 'lift', label: '자재 양중', words: ['양중'] },
  { id: 'protect', label: '보양', words: ['보양', '먼지막이'] },
  { id: 'waste', label: '폐기물', words: ['폐기물', '마대'] },
  { id: 'cleanup', label: '준공 청소', words: ['준공청소', '준공 청소', '청소'] },
  { id: 'admin', label: '관리사무소 신고', words: ['관리사무소', '관리실', '신고'] },
  { id: 'waterproof', label: '방수', words: ['방수'] },
  { id: 'tile', label: '타일', words: ['타일'] },
  { id: 'wallpaper', label: '도배', words: ['도배', '벽지'] },
  { id: 'demolition', label: '철거', words: ['철거'] },
];

export function parseAdjustment(text = '') {
  const t = String(text || '');
  if (!CANCEL_RE.test(t)) return null;
  const hit = PROCESS_KEYWORDS.find((p) => p.words.some((w) => t.includes(w)));
  return {
    cancel: true,
    processId: hit?.id || null,
    label: hit?.label || null,
  };
}

// 공정 → 체크박스(견적 항목) 연결
export const PROCESS_TO_SURVEY = {
  lift: 'materialLift',
  ladder: 'ladderSmall',
  protect: 'protectLevel',
  cleanup: 'afterCare',
  admin: 'adminDeposit',
};
