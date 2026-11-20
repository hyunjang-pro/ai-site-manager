// 통합 입력(숨고·카톡·메모) 자동 분류 — 평수 강제 없이 읽을 수 있는 것만 읽는다.
import { ratesOf } from './rates.js';

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

// 첫 통화에 물어볼 3가지 — 공종·관공서 여부에 따라 다르다. AI가 뽑은 질문이 있으면 그것을 쓴다.
const TRADE_QUESTIONS = {
  demolition: [
    '철거 범위가 전체인가요, 마감만인가요? (원상복구 포함 여부)',
    '석면·텍스·유리처럼 따로 처리해야 하는 자재가 있나요?',
  ],
  groundwork: [
    '정지(터파기) 범위가 몇 평·몇 ㎡인가요? (부지 전체인지 일부인지)',
    '성토·절토가 필요한가요? 흙은 어디로 내보내나요?',
    '굴삭기가 들어갈 길폭과 수도·전기 매설 위치는 확인하셨나요?',
  ],
  waste: [
    '폐기물이 몇 톤·몇 차 나올까요? 성상은 섞여 있나요?',
    '1톤차·2.5톤차 중 어떤 차가 들어갈 수 있나요? (진입로·주차)',
  ],
  bathroom: [
    '욕실 몇 칸인가요? 전체 철거인가요, 덧방인가요?',
    '아래층 누수 이력이 있나요? (방수·담수 범위가 달라집니다)',
  ],
  kitchen: [
    '싱크대 길이(m)와 배치를 바꾸시나요?',
    '상판 재질(인조대리석·엔지니어드)과 후드·수전 재사용 여부는요?',
  ],
  wallpaper: [
    '도배만인가요, 장판·마루까지인가요?',
    '벽지는 합지·실크 중 어느 쪽인가요?',
  ],
  plaster: [
    '바닥 면적이 몇 ㎡인가요? (도배·타일과 겁치는 부분)',
    '난방배관·단열 보강도 넣나요? 양생 3일은 괜찮으신가요?',
  ],
  window: [
    '몇 ㎡·몇 짝인가요? 어떤 사양(이중창·시스템창)인가요?',
    '기존 창호 철거·폐기물까지 포함인가요?',
  ],
  carpentry: [
    '문·몰딩 길이(m)나 개수를 알려주실 수 있나요?',
    '기성품·맞춤 중 어느 쪽이고, 도장까지 포함인가요?',
  ],
  electric: [
    '몇 개소인가요? (콘센트·스위치·조명)',
    '노출·매립 중 어느 쪽이며 분전반 증설이 필요한가요?',
  ],
  plumbing: [
    '몇 개소인가요? (수전·배관·보일러)',
    '누수 위치와 기존 배관 재질을 아시나요?',
  ],
  film: [
    '필름 시공 면적과 대상(유리·문·가구)은요?',
    '난방필름·단열필름·인테리어필름 중 어떤 건가요?',
  ],
  repair: [
    '수선할 곳이 몇 군데인가요? (사진으로 보내주시면 정확합니다)',
    '페인트·실리콘 중 어떤 마감이며, 같은 곳이 다시 생긴 적 있나요?',
  ],
  labor: [
    '며칠·몇 명이 필요한가요?',
    '작업 종류(철거·운반·잡일)와 장비 포함 여부는요?',
  ],
  combined: [
    '어디까지 하시나요? (철거·도배·욕실·주방·현관·미장·정지)',
    '문·몰딩·창호·전기는 빼는 게 맞나요?',
  ],
};

const BID_QUESTIONS = [
  '설계내역서·과업지시서를 받을 수 있나요? (물량·범위 확인)',
  '현장설명회나 입찰 참가 자격 조건이 있나요?',
];

export function firstCallQuestions(c, parsed = {}) {
  // AI가 현장·공고를 읽고 만든 질문이 있으면 그것을 그대로 쓴다.
  const ai = Array.isArray(c?.aiAnalysis?.firstCallQuestions) ? c.aiAnalysis.firstCallQuestions.filter(Boolean) : [];
  if (ai.length) return ai.slice(0, 3);

  const trade = c?.bid ? 'bid' : String(c?.trade || '');
  const qs = [...(trade === 'bid' ? BID_QUESTIONS : TRADE_QUESTIONS[trade] || [])];
  if (c?.subScopes?.length > 1 && trade === 'combined' && c.subScopes.includes('groundwork')) {
    qs.push('정지(터파기)와 철거 중 어느 쪽을 먼저 하나요? (순서·장비 대기)');
  }
  if (!qs.length) {
    qs.push('어떤 공사를 어디까지 하시나요? (범위를 사진으로 보내주시면 정확합니다)');
  }
  // 현장에서 반드시 확인해야 하는 것(층·엘리베이터, 사진, 규모)을 뒤에 채워 3개를 맞춘다.
  if (!parsed.floor && !c?.lifting?.floor) qs.push('엘리베이터가 있나요? 몇 층인가요?');
  else if (c?.lifting?.ladderAllowed === 'unknown') qs.push('건물 앞에 사다리차를 세울 수 있나요? (주차·소방통로)');
  if (qs.length < 3 && !c?.photos?.length) qs.push('현장 사진 3장(전체·문제 부위·진입로)을 보내주세요.');
  if (qs.length < 3 && (!c?.sizeValue || c?.sizeUnit === '모름')) qs.push('평수나 시공 길이를 아시나요? (모르시면 실측 때 재겠습니다)');
  if (qs.length < 3) qs.push('희망 착공일과 거주 중 여부를 알려주세요. (일정과 보양비가 달라집니다)');
  if (qs.length < 3) qs.push('현장에서 특별히 걱정되는 부분(누수·균열·소음)이 있나요?');
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

// 시공 중 추가 공사 — 글·사진 한 줄에서 항목·사유·금액·일정을 잡는다.
const CHANGE_RULES = [
  { re: /문틀|문짝|도어|문\s*교체|방화문/, item: '문틀·문짝 교체', reason: '철거 중 문틀 부식·파손 확인', amount: 25, days: 1 },
  { re: /누수|물이\s*샘|방수/, item: '누수 보수·방수 추가', reason: '기존 누수 흔적 확인', amount: 30, days: 1 },
  { re: /곰팡이|결로|습기/, item: '곰팡이 제거·방균 처리', reason: '벽체 곰팡이 확인', amount: 15, days: 1 },
  { re: /타일/, item: '타일 추가 시공', reason: '당초 범위 외 타일 추가', amount: 20, days: 1 },
  { re: /전기|콘센트|조명|배선|스위치/, item: '전기 배선·콘센트 추가', reason: '현장 요청', amount: 18, days: 0 },
  { re: /배관|수도|급수|배수|수전/, item: '급배수 배관 보수', reason: '노후 배관 확인', amount: 25, days: 1 },
  { re: /폐기물|마대|반출|톤\s*추가|차량/, item: '폐기물 추가 반출', reason: '숨은 물량·추가 철거재 발생', amount: 30, days: 0 },
  { re: /보양|가구|먼지|가림/, item: '보양·가구 이동 추가', reason: '거주 중 공사', amount: 12, days: 0 },
  { re: /몰딩|걸레받이|커튼박스/, item: '몰딩·걸레받이 교체', reason: '철거 중 파손', amount: 10, days: 0 },
  { re: /창호|샷시|유리|단열/, item: '창호·단열 보강', reason: '기존 창호 노후', amount: 35, days: 1 },
  { re: /석면|텍스/, item: '석면 조사·처리', reason: '텍스 천장 확인', amount: 30, days: 1 },
  { re: /철거|해체/, item: '추가 철거', reason: '당초 범위 외 철거', amount: 20, days: 1 },
];

export function classifyChange(text = '') {
  const s = String(text || '').trim();
  if (!s) return null;
  const hit = CHANGE_RULES.find((r) => r.re.test(s));
  if (hit) {
    return { item: hit.item, reason: s.slice(0, 60), amount: hit.amount, days: hit.days, type: 'increase' };
  }
  // 규칙에 없으면 문장을 그대로 항목으로 쓰고 기본 금액을 제안한다.
  return { item: s.split(/[.,\n]/)[0].slice(0, 30), reason: s.slice(0, 60), amount: 20, days: 0, type: 'increase' };
}

// ---- 답사 메모 일상어 인식 ----
// "폐기물 두 차는 나올듯", "한 차 더", "반 차 추가", "양 많아 보임" 을 그대로 읽는다.
const KOR_LOAD = { 한: 1, 두: 2, 세: 3, 네: 4 };

export function surveyWasteDrafts(text = '', c = null) {
  const t = String(text || '').trim();
  if (!t) return [];
  const wasteContext =
    c?.trade === 'waste' || /폐기물|쓰레기|마대|반출|수거|차량|트럭|한\s*차|두\s*차|세\s*차/.test(t);
  if (!wasteContext) return [];
  const rates = ratesOf(c);
  const oneTon = Math.round(Number(rates?.waste?.truck1) || 42.5);
  const halfTon = Math.round(Number(rates?.waste?.truckHalf) || 26);

  const kor = t.match(/(한|두|세|네)\s*차/);
  const numM = t.match(/(\d+)\s*(?:차|대)/);
  const halfOnly = /반\s*차/.test(t) && !kor && !numM;
  if (halfOnly) {
    return [
      {
        id: `waste-half-${Date.now()}`,
        item: '폐기물 반 차(0.5톤) 추가',
        reason: t,
        amount: halfTon,
        type: 'increase',
        days: 0,
      },
    ];
  }

  let declared = 0;
  if (numM) declared = Number(numM[1]) || 0;
  else if (kor) declared = KOR_LOAD[kor[1]] || 0;

  let extra = 0;
  if (declared > 1) extra = Math.max(extra, declared - 1); // "두 차" = 기본 1차 + 1대 추가
  if (/(한|1)\s*차\s*더|한\s*대\s*더|한대\s*더|차\s*추가|더\s*나올|더\s*나오/.test(t)) extra = Math.max(extra, 1);
  if (/양(?:이)?\s*(?:많|넉넉)|많아\s*보|많을\s*듯|생각보다\s*많|물량\s*(?:많|늘)/.test(t)) extra = Math.max(extra, 1);
  if (extra <= 0) return [];

  return [
    {
      id: `waste-truck-${Date.now()}`,
      item: `폐기물 ${extra}대 추가 반출 (1톤차 기준)`,
      reason: t,
      amount: oneTon * extra,
      type: 'increase',
      days: 0,
    },
  ];
}

export function detectFindings(text = '') {
  const t = String(text || '');
  const out = [];
  if (/누수|물기|습기|곰팡이|방수\s*필요|물이\s*샘/.test(t)) out.push('leak');
  if (/타일.{0,8}(남김|유지|안\s*깼|안깼)|기존\s*타일|철거\s*안\s*함|덧방/.test(t)) out.push('tileRemain');
  return out;
}

// 답사 메모 한 줄 → 견적에 더할 항목 목록 (금액 포함)
export function surveyDrafts(text = '', c = null, calc = null) {
  const t = String(text || '').trim();
  if (!t) return [];
  const out = [];
  out.push(...surveyWasteDrafts(t, c));
  const findings = detectFindings(t);
  if (findings.includes('leak')) {
    out.push({
      id: `leak-${Date.now()}`,
      item: '현장 답사: 누수 의심 → 방수 보수',
      reason: t,
      amount: 30,
      type: 'increase',
      days: 1,
    });
  }
  if (findings.includes('tileRemain')) {
    const demo = (calc?.items || []).find((i) => i.id === 'demolition')?.amount || 0;
    const waste = (calc?.items || []).find((i) => i.id === 'waste')?.amount || 0;
    const saving = Math.max(10, Math.round(demo + Math.max(0, waste - 8)));
    out.push({
      id: `tile-${Date.now()}`,
      item: '현장 답사: 기존 타일 유지(철거·폐기물 제외)',
      reason: t,
      amount: saving,
      type: 'decrease',
      days: 0,
    });
  }
  return out;
}
