// 숨고·카톡·메모·스크린샷 글자를 붙여넣으면 공종과 변수를 먼저 잡아준다.
// ─────────────────────────────────────────────────────────────
// v3.19 — 분류는 더 이상 이 파일의 if 사슬이 하지 않는다.
//   문장 해석은 engine/parse.js(절·품목·동작·수량),
//   의도·공종 결정은 engine/jobspec.js(4가지 모드 → 공종 → 규모)가 맡고,
//   여기서는 그 명세를 **화면·저장이 쓰는 patch 모양**으로 옮기고 안내 문구만 만든다.
//   (예전: 공종마다 정규식을 다시 훑는 if 사슬 → 새 문장이 오면 한 낱말이 공종을 독식)
import { REGIONS, TRADES } from './constants.js';
import { detectPartial, partialOf, PARTIAL_ITEMS } from './partial.js';
import { parseRequestSheet, sheetToText, requestSignals, preservationGate, sheetValue } from './request.js';
import { buildJobSpec } from './engine/jobspec.js';
import { itemById } from './engine/lexicon.js';

const PARTIAL_LABEL = Object.fromEntries(Object.entries(PARTIAL_ITEMS).map(([id, def]) => [id, def.label]));

// 머리글에 쓰는 짧은 이름 — '장판·마루 34평 + 욕실·화장실 2칸 …'처럼 길면 폰에서 안 읽힌다.
const PARTIAL_SHORT = {
  sign: '간판',
  sink: '싱크대',
  builtin: '붙박이',
  aircon: '에어컨',
  airconOutdoor: '실외기',
  partition: '가벽',
  window: '샷시',
  ceiling: '텍스',
  deck: '데크',
  furniture: '가구',
  floor: '장판',
  woodFloor: '마루',
  decoTile: '데코타일',
  wallpaper: '벽지',
  bathroom: '욕실',
  shelf: '선반',
  door: '문짝',
};

// 부분 철거 제목 — "안동 34평 장판·욕실2·샷시·싱크대 철거"처럼 무엇을 뜯는지 바로 보이게
export function partialTitle(items = [], { region = '', pyung = 0 } = {}) {
  const names = items.map((it) => {
    const label = PARTIAL_SHORT[it.id] || PARTIAL_LABEL[it.id] || '철거';
    const qty = Number(it.qty) || 1;
    // 현장 평수를 이미 제목에 넣었으면 장판 34평을 또 붙이지 않는다
    if (it.unit === '평' && pyung) return label;
    if (qty > 1) return `${label}${qty}${it.unit === 'm' ? 'm' : ''}`;
    return label;
  });
  const cap = names.join('·').length <= 18 ? names.length : 4;
  const head = names.slice(0, cap).join('·');
  const rest = names.length > cap ? ` 외 ${names.length - cap}` : '';
  return [region, pyung ? `${pyung}평` : '', `${head}${rest} 철거`].filter(Boolean).join(' ');
}

const TRADE_TITLE = {
  demolition: '철거',
  wallpaper: '도배·장판',
  bathroom: '욕실',
  kitchen: '주방',
  tilewaterproof: '타일·방수',
  plaster: '바닥 미장',
  carpentry: '목공·문·몰딩',
  electric: '전기·조명',
  plumbing: '설비·배관',
  film: '필름·시트지',
  groundwork: '기초·토목',
  window: '창호',
  waste: '폐기물 처리',
  labor: '인력 지원',
  repair: '부분 수선',
  combined: '전체 인테리어',
  custom: '현장',
};

// 복합 현장의 제목 — 철거+정지를 '전체 인테리어'라고 부르면 현장과 안 맞는다.
const SCOPE_TITLE = {
  demolition: '철거',
  groundwork: '기초·정지',
  wallpaper: '도배·장판',
  floor: '바닥',
  paint: '도장',
  bathroom: '욕실',
  kitchen: '주방',
  entrance: '현관',
  plaster: '바닥 미장',
  carpentry: '문·몰딩',
  electric: '전기·조명',
  window: '창호',
  film: '필름',
};
export function combinedTitle(scopes = []) {
  const names = scopes.filter((s) => SCOPE_TITLE[s]).map((s) => SCOPE_TITLE[s]);
  if (!names.length) return '전체 인테리어';
  const interiorish = scopes.some((s) => ['wallpaper', 'bathroom', 'kitchen', 'entrance'].includes(s));
  if (interiorish && names.length >= 3) return '전체 인테리어';
  return names.slice(0, 3).join('·');
}

// 현장 제목 자동 만들기 — 공종을 바꾸면 제목도 같이 맞춘다(사용자가 직접 고친 제목은 건드리지 않는다).
export function autoCaseTitle(c, tradeOverride, scopesOverride) {
  const trade = tradeOverride || c?.trade;
  const region = c?.region && c.region !== '기타' ? c.region : '';
  const size = c?.sizeValue ? `${c.sizeValue}${c.sizeUnit || ''}` : '';
  // 가벽·칸막이 목공 — '8m 철거'가 아니라 '8m 가벽·룸3 목공'으로 부른다
  if (c?.partition && (trade === 'carpentry' || c?.trade === 'carpentry')) {
    const p = c.partition;
    return [region, p.meters ? `${p.meters}m` : '', `가벽${p.rooms ? `·룸${p.rooms}` : ''} 목공`].filter(Boolean).join(' ');
  }
  const scopes = scopesOverride || (Array.isArray(c?.subScopes) ? c.subScopes : []);
  // 부분 철거는 '2개 철거' 대신 '간판 2개 철거' — 무엇을 뜯는지 제목에 남긴다
  const partial = trade === 'demolition' ? partialOf(c) : { on: false };
  if (partial.on && Array.isArray(partial.items) && partial.items.length) {
    const pyung = parseFloat(c?.sizeValue) || 0;
    return partialTitle(partial.items, { region, pyung: c?.sizeUnit === '평' ? pyung : 0 });
  }
  const label = trade === 'combined' ? combinedTitle(scopes) : TRADE_TITLE[trade] || TRADES[trade]?.short || '현장';
  return [region, size, label].filter(Boolean).join(' ') || '새 현장';
}

export function classifyRequest(rawText = '', opts = {}) {
  const text = String(rawText || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  // 요청서(숨고·카톡 양식)면 라벨과 값을 나눠 읽는다.
  const sheet = opts.sheet || parseRequestSheet(text);
  const signals = requestSignals(sheet, text);
  // 라벨을 뺀 실제 내용 — 점의 의미 판단(공실/거주/누수 등)에 쓴다
  const LABEL_WORDS = /(공실|계약|입주)\s*상태|서비스\s*분야|공간\s*유형|공급\s*면적|문의\s*\/?\s*희망사항/g;
  const contentT = signals.hasForm
    ? signals.contentText.toLowerCase().replace(/\s+/g, ' ')
    : text.toLowerCase().replace(LABEL_WORDS, ' ').replace(/\s+/g, ' ');

  // ── 문장 해석 + 의도·공종 결정 (구조화 엔진) ──────────────
  const spec = buildJobSpec(text, { sheet, signals });
  const parsed = spec.parsed;
  const facts = spec.facts;
  const t = parsed.text;

  let trade = spec.trade;
  if (trade === 'unclassified' && signals.interiorDeclared) trade = 'custom';

  const hints = [];
  const extraWorks = [];
  const excludedWorks = [];
  const excludedScopes = Array.from(new Set(parsed.excluded.scopes || []));
  if (parsed.excluded.removal) excludedWorks.push('철거');
  if (excludedScopes.includes('window')) excludedWorks.push('창호');
  if (/바닥.{0,8}미장|미장.{0,8}필요|평평하지\s*않/.test(t)) extraWorks.push('바닥 미장');
  if (/난방/.test(t)) extraWorks.push('난방 보강');
  if (/타일/.test(t) && trade === 'plaster') extraWorks.push('타일');

  // ── 규모 ────────────────────────────────────────────────
  let sizeValue = spec.size.value === '' ? '' : spec.size.value;
  let sizeUnit = spec.size.unit || TRADES[trade]?.defaultUnit || '평';
  if (sizeValue === '' || sizeValue === 0) {
    sizeValue = '';
    // 길이·개소로 계산하는 공종은 평 기본값을 쓰지 않는다
    if (['carpentry', 'electric', 'plumbing', 'repair'].includes(trade)) {
      sizeUnit = TRADES[trade]?.defaultUnit || '모름';
    }
  }
  // 부분 철거에서 평수가 있으면 현장 넓이로 남긴다
  const partial = trade === 'demolition' && spec.partial.length ? { on: true, items: spec.partial, access: facts.access, exterior: spec.partial.some((i) => PARTIAL_ITEMS[i.id]?.exterior) } : { on: false };
  if (partial.on && sizeValue && sizeUnit !== '평') {
    // 품목 단위가 섞였으면 숫자를 합치지 않는다
  }

  // ── 현장 조건 ───────────────────────────────────────────
  const floor = facts.floor || 0;
  const basement = !!facts.basement;
  const elevator = facts.elevator;

  const survey = {};
  if (/텍스|슬레이트/.test(contentT)) {
    hints.push('천장 텍스·슬레이트 — 석면 조사 대상인지 확인하세요.');
    survey.asbestosRisk = true;
  }
  if (/누수|물이\s*샘|곰팡이|물\s*(?:이|가|좀)?\s*새/.test(contentT)) {
    hints.push('누수·곰팡이 — 방수 범위와 아래층 피해를 먼저 확인하세요.');
    survey.existingLeak = true;
  }
  if (elevator === 'no') hints.push('엘리베이터 없음 — 계단 운반비가 붙습니다.');
  if (elevator === 'yes') hints.push('엘리베이터 운반 가능 — 양중비를 낮출 수 있습니다.');
  if (facts.urgent) hints.push('일정이 급함 — 인력·자재 수급부터 확인하세요.');
  // 입주·공실은 라벨이 아니라 값으로 판단한다
  const occupiedNow = signals.hasForm ? signals.occupied : facts.occupied;
  const vacantNow = signals.hasForm ? signals.vacant : facts.vacant;
  if (occupiedNow) {
    hints.push(
      signals.commercial
        ? '현재 입주·영업 중 — 손님이 쓰는 공간이라 보양·먼지막이와 공사 시간(영업 전·후)을 미리 협의하세요.'
        : '거주 중 시공 — 보양·먼지막이 비용이 붙습니다.'
    );
    survey.residential = true;
  }
  if (vacantNow) hints.push('공실 — 보양·먼지막이를 최소화할 수 있습니다.');
  if (signals.stuff && !occupiedNow) hints.push('공실인데 짐이 있음 — 짐 이동·보관 비용과 작업 공간을 먼저 확인하세요.');
  if (/보양|먼지막이|가림/.test(t)) survey.protectLevel = true;
  if (/폐기물|마대|반출/.test(t)) survey.wasteIncluded = true;
  if (/혼합\s*폐기물|섞어|섞어서/.test(t)) survey.wasteMixed = true;
  if (facts.weekend) survey.noWeekend = true;
  if (facts.night) survey.workTimeLimit = true;
  const noSiteCare = partial.on || ['waste', 'labor', 'groundwork'].includes(trade);
  if (!noSiteCare && /아파트|오피스텔|상가|사무실/.test(contentT)) {
    survey.protectLevel = true;
  }
  if (!noSiteCare && /아파트|오피스텔|관리사무소/.test(contentT)) survey.adminDeposit = true;
  if (vacantNow) survey.residential = false;
  if (elevator === 'yes') survey.materialLift = false;

  // 세부 공종 (복합)
  const subScopes = Array.from(new Set(trade === 'combined' ? spec.subScopes : []));
  if (trade === 'combined' && !subScopes.length && facts.fullInterior) {
    subScopes.push('demolition', 'wallpaper', 'floor', 'bathroom', 'kitchen', 'entrance', 'plaster');
  }
  // 뜯기만 하는 현장은 철거(·정지)만 포함으로 남긴다
  const finalScopes =
    ['demolition', 'waste', 'labor'].includes(trade) ? subScopes.filter((s) => ['demolition', 'groundwork'].includes(s)) : subScopes;

  if (excludedScopes.length) hints.push(`${excludedScopes.join(', ')} 제외 — 견적에서 빼고 손님에게 확인하세요.`);
  if (excludedWorks.length) hints.push(`${excludedWorks.join(', ')} 제외 — 견적에서 빼고 손님에게 확인하세요.`);
  if (extraWorks.includes('바닥 미장')) hints.push('바닥 미장 추가 — 미장·양생 일수를 공정에 넣으세요.');

  const budgetMatch =
    t.match(/예산\s*[:：]?\s*([\d,]+)\s*만\s*원?\s*(미만|이하|내외)?/) ||
    (sheetValue(sheet, 'budget') || '').match(/([\d,]+)\s*만\s*원?\s*(미만|이하|내외)?/);
  if (budgetMatch) hints.push(`손님 예산 ${budgetMatch[1]}만원${budgetMatch[2] || ''} — 이 안에서 범위를 잡으세요.`);
  if (/방\s*\d|욕실\s*\d|부엌|현관/.test(t)) hints.push('공간 구성이 적혀 있습니다 — 실측 때 방·욕실·주방 수를 확인하세요.');

  // 가벽·칸막이(경량벽체) — 면적이 아니라 길이(m)와 칸 수로 견적한다
  const partitionInfo =
    spec.partition && (spec.partition.meters || spec.partition.rooms || signals.dims?.meters || signals.dims?.rooms)
      ? {
          meters: spec.partition.meters || signals.dims?.meters || 0,
          rooms: spec.partition.rooms || signals.dims?.rooms || 0,
          doors: spec.partition.doors || signals.dims?.doors || spec.partition.rooms || signals.dims?.rooms || 0,
          height: 2.4,
        }
      : null;
  if (partitionInfo) {
    hints.push(
      `가벽(경량벽체) ${partitionInfo.meters || '?'}m${partitionInfo.rooms ? ` · 룸·문 ${partitionInfo.rooms}개` : ''} — 석고 2겹·방음재 여부와 천장 고정(슬라브) 상태를 확인하세요.`
    );
    if (signals.commercial) hints.push('상업공간 — 영업 중 소음·먼지, 기존 전기·조명 위치를 먼저 확인하세요.');
  }
  if (sheet.repairs?.length) {
    hints.push(`사진 글자 보정: ${sheet.repairs.map((r) => `${r.label} ${r.notes.join(', ')}`).join(' / ')} — 원본과 한 번 맞춰 보세요.`);
  }

  // ── 지역 ───────────────────────────────────────────────
  let region = '';
  for (const r of REGIONS) {
    if (r !== '기타' && t.includes(r.toLowerCase())) {
      region = r;
      break;
    }
  }
  const locMatch = text.match(/(?:경북|경상북도)\s*([가-힣]+시)(?:\s*([가-힣0-9]+(?:동|읍|면)))?/);
  const location = locMatch ? `경북 ${locMatch[1]}${locMatch[2] ? ` ${locMatch[2]}` : ''}` : '';
  const phoneMatch = text.match(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/);

  // ── 타일·방수 모드 / 미장 ────────────────────────────────
  const tileMode = trade === 'tilewaterproof' ? (/방수/.test(t) && /타일/.test(t) ? 'both' : /방수|누수/.test(t) ? 'waterproof' : 'tile') : undefined;

  // ── 폐기물 차량 ─────────────────────────────────────────
  const livingWaste = trade === 'waste' && /생활\s*폐기물|가구|침대|소파|장롱|냉장고|세탁기|이사|살림|가전/.test(t);
  const storeCleanout = /집기|비품|폐업/.test(t) && /상가|매장|음식점|식당|카페|사무실|공장|가게|점포|상점|마트|편의점|학원/.test(t);
  let wasteVehicle = 'ton1';
  if (trade === 'waste') {
    if (facts.halfTruck) wasteVehicle = 'half';
    else if (Number(sizeValue) > 1.5) wasteVehicle = 'ton25';
    else if (Number(sizeValue) > 0.7) wasteVehicle = 'ton1';
    else if (sizeValue === '' || Number(sizeValue) === 0) wasteVehicle = storeCleanout ? 'ton25' : 'ton1';
    else wasteVehicle = 'half';
    if (facts.halfTruck) {
      sizeValue = '0.5';
      sizeUnit = '톤';
    }
    if (!sizeValue || Number(sizeValue) === 0) {
      sizeValue = String({ half: 0.5, ton1: 1, ton25: 2.5 }[wasteVehicle] || 1);
      sizeUnit = '톤';
    }
  }
  const wasteVehicleLabel = { half: '반차(0.5톤)', ton1: '1톤 1차', ton25: '2.5톤' }[wasteVehicle] || '';

  // ── 안내 행 ────────────────────────────────────────────
  const rows = [
    {
      label: '공종',
      value: trade === 'combined' ? `복합 (${combinedTitle(Array.from(new Set(subScopes)))})` : TRADES[trade]?.label || '미분류',
    },
  ];
  if (sizeValue) rows.push({ label: '규모', value: `${sizeValue}${sizeUnit}` });
  if (partitionInfo) {
    rows.push({
      label: '가벽',
      value: `${partitionInfo.meters ? `${partitionInfo.meters}m` : '길이 확인 필요'}${partitionInfo.rooms ? ` · 룸·문 ${partitionInfo.rooms}개` : ''}`,
    });
  }
  if (signals.space) rows.push({ label: '공간', value: signals.space });
  if (signals.service) rows.push({ label: '요청', value: signals.service });
  if (region || location) rows.push({ label: '지역', value: location || region });
  if (floor) rows.push({ label: '층 / 엘베', value: `${floor}층 · ${elevator === 'no' ? '없음' : elevator === 'yes' ? '있음' : '확인 필요'}` });
  // 폐기물은 톤당 단가가 아니라 차량 실비(반차 26 · 1톤 42.5 · 2.5톤 75만)로 계산한다 (v3.20)
  if (trade === 'waste') rows.push({ label: '처리', value: `${wasteVehicleLabel || '1톤 1차'} · 차량 실비 기준(상차·운반·처리 포함)` });
  if (trade === 'labor') rows.push({ label: '청구 기준', value: '1명 1일 26만원(원가 19만)' });
  if (trade === 'plaster' && extraWorks.length) rows.push({ label: '추가', value: extraWorks.join(' · ') });
  if (excludedWorks.length) rows.push({ label: '제외', value: excludedWorks.join(' · ') });

  // ── 제목 ───────────────────────────────────────────────
  const titleParts = [];
  if (region) titleParts.push(region);
  else if (locMatch?.[2]) titleParts.push(locMatch[2]);
  if (sizeValue) titleParts.push(`${sizeValue}${sizeUnit}`);
  titleParts.push(
    partitionInfo
      ? `가벽${partitionInfo.rooms ? `·룸${partitionInfo.rooms}` : ''} 목공`
      : trade === 'combined'
      ? combinedTitle(Array.from(new Set(subScopes)))
      : TRADE_TITLE[trade] || '현장'
  );
  let suggestTitle = trade === 'unclassified' ? '새 현장' : titleParts.join(' ');
  if (partial.on) suggestTitle = partialTitle(partial.items, { region, pyung: sizeUnit === '평' ? parseFloat(sizeValue) || 0 : 0 });

  // ── patch ─────────────────────────────────────────────
  const patch = {
    trade,
    sizeValue: sizeValue === '' ? '' : String(sizeValue),
    sizeUnit: sizeUnit || TRADES[trade]?.defaultUnit || '평',
    rawInput: text,
    notes: text,
    parseHints: hints,
    survey,
    lifting: { floor: floor || '', elevator, ...(basement ? { basement: true } : {}) },
    extraWorks,
    excludedWorks,
    subScopes: finalScopes,
    excludedScopes,
    ...(partitionInfo ? { partition: partitionInfo } : {}),
    ...(signals.space ? { spaceType: signals.space } : {}),
    ...(sheet.source ? { source: sheet.source } : {}),
    ...(signals.service ? { serviceType: signals.service } : {}),
    ...(signals.budget || budgetMatch ? { clientBudget: (budgetMatch || [])[1] ? `${budgetMatch[1]}만원${budgetMatch[2] || ''}` : '' } : {}),
  };
  if (region) patch.region = region;
  if (location) patch.location = location;
  if (phoneMatch) patch.clientPhone = `${phoneMatch[1]}-${phoneMatch[2]}-${phoneMatch[3]}`;
  if (trade === 'labor') {
    patch.sizeValue = String(facts.people || 1);
    patch.sizeUnit = '명';
    patch.laborDays = Math.max(1, facts.days || 1);
  }
  if (trade === 'waste') patch.wasteVehicle = wasteVehicle || 'ton1';
  if (partial.on) {
    patch.demolition = { mode: 'partial', items: partial.items, access: partial.access, exterior: partial.exterior };
    patch.sizeUnit = sizeUnit;
  }
  if (facts.fullInterior) patch.fullInterior = true;
  if (spec.flags.tileRemain) patch.tileRemain = true;
  if (trade === 'tilewaterproof') patch.tileWork = { mode: tileMode };
  if (trade === 'plaster') patch.plaster = { heating: extraWorks.includes('난방 보강'), tile: extraWorks.includes('타일') };
  // 철거만 / 시공까지 — 계산 단계가 문장을 다시 읽지 않게 여기서 확정한다
  if (['bathroom', 'kitchen'].includes(trade)) patch[trade] = { scope: spec.demoOnly ? 'demo' : 'remodel', method: 'full' };
  // 규모를 못 읽은 요청 — 무엇이든 15평으로 잡지 않는다
  if (!sizeValue || sizeValue === '0') {
    if (['carpentry', 'electric', 'plumbing', 'repair'].includes(trade)) {
      patch.sizeUnconfirmed = true;
    } else {
      const roomWords = /욕실|화장실|주방|부엌|베란다|발코니|현관|원룸|투룸|방\s*\d|방 하나|데코타일|텍스|가벽|장판|마루|바닥|싱크대|붙박이|간판|창호|샷시|문짝|몰딩|타일/;
      const placeWords = /상가|상점|매장|식당|음식점|카페|사무실|공장|창고|학원|병원|약국|관공서|학교|빌딩|건물|아파트|빌라|주택|오피스텔|층|평수/;
      patch.scaleHint = placeWords.test(contentT) ? 'place' : roomWords.test(contentT) ? 'room' : '';
      patch.sizeUnknown = true;
    }
  }
  if (trade === 'custom') {
    patch.tradeName = signals.service || '부분 인테리어';
    patch.needsCheck = true;
    patch.scaleHint = 'room';
    patch.sizeUnknown = true;
    hints.push('요청서에 무엇을 시공하는지 자세히 없습니다 — 첫 통화에서 범위를 확인한 뒤 금액을 정하세요.');
  }

  // 정리본 — 원문 순서·라벨을 그대로 살리고 이 한 줄만 덧붙인다
  const autoLine = autoClassLine({ trade, partitionInfo, sizeValue, sizeUnit, tradeName: patch.tradeName });
  const summaryText = sheetToText(sheet, { autoLine }) || autoLine;
  const guard = preservationGate({ sheet, summary: summaryText, trade, tradeName: TRADES[trade]?.label || '' });

  return {
    trade,
    patch,
    rows,
    hints,
    title: suggestTitle,
    sheet,
    signals,
    spec,
    autoLine,
    summary: summaryText,
    guard,
    confidence: trade === 'unclassified' ? 'low' : parsed.ops.length + parsed.mentions.length >= 2 ? 'medium' : 'high',
    detected: trade !== 'unclassified',
  };
}

// 정리본 끝에 붙는 한 줄 — 사장님이 '앱이 뭐로 잡았는지' 바로 보게
export function autoClassLine({ trade, partitionInfo, sizeValue, sizeUnit, tradeName } = {}) {
  const label = TRADES[trade]?.short || tradeName || '';
  if (!label) return '';
  const bits = [trade === 'custom' && tradeName ? tradeName : TRADES[trade]?.label || label];
  if (partitionInfo) {
    bits.push(`가벽 ${partitionInfo.meters ? `${partitionInfo.meters}m` : '길이 확인 필요'}${partitionInfo.rooms ? ` · 룸 ${partitionInfo.rooms}개` : ''}`);
  } else if (sizeValue) {
    bits.push(`${sizeValue}${sizeUnit || ''}`);
  }
  return `※ 자동 분류: ${bits.join(' · ')}`;
}

// 사진·메모에서 읽은 글자를 '받은 내용' 칸에 넣기 좋은 짧은 요약으로 정리한다.
export function summarizeRequest(text, res) {
  const r = res || classifyRequest(text);
  const sheet = r.sheet || parseRequestSheet(text);
  const autoLine = r.autoLine || autoClassLine({ trade: r.trade, partitionInfo: r.patch?.partition, sizeValue: r.patch?.sizeValue, sizeUnit: r.patch?.sizeUnit });
  if (sheet && sheet.hasForm) {
    const body = sheetToText(sheet, { autoLine });
    if (body) return body;
  }

  const clean = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  if (!clean) return '';
  const t = clean.toLowerCase();
  const row = (label) => r.rows.find((x) => x.label === label)?.value || '';
  const lines = [];
  const push = (label, value) => {
    if (value) lines.push(`${label}: ${value}`);
  };

  // 숨고 요청서의 '문의/희망사항'은 그 자체가 핵심 요구다 — 자르지 않고 맨 위에 통째로 올린다.
  const wish = clean.match(/(?:문의\s*\/\s*희망사항|문의\/?희망사항|희망사항|요청사항)\s*[:：]?\s*([\s\S]+)/);
  if (wish) {
    const body = wish[1]
      .split(/\n(?:고객\s*정보|견적|서비스|면적|예산|추가\s*서비스)\b|\s(?:고객\s*정보|삭제하기|신고하기|견적을?\s*작성)/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    if (body) push('희망사항', body);
  }

  if (r.patch?.partition) {
    const p = r.patch.partition;
    push('가벽', `가벽 ${p.meters ? `${p.meters}m` : '(길이 확인 필요)'}${p.rooms ? ` · 룸·문 ${p.rooms}개` : ''}`);
  }
  push('지역', row('지역'));
  push('면적', row('규모'));

  const spaces = [
    ...new Set(
      (clean.match(/거실|방\s*\d|욕실|화장실|주방|부엌|베란다|발코니|현관|상가|사무실|원룸/g) || []).map((s) =>
        s.replace(/\s+/g, '').replace(/\d/g, '').replace('화장실', '욕실').replace('부엌', '주방')
      )
    ),
  ];
  if (spaces.length) push('공간', spaces.slice(0, 6).join('·'));
  push('공종', r.trade && r.trade !== 'unclassified' ? TRADES[r.trade]?.label || '' : '');

  const budget = clean.match(/예산\s*([\d,]+)\s*만\s*원?\s*(미만|이하|내외)?/);
  if (budget) push('예산', `${budget[1]}만원${budget[2] || ''}`);
  if (/공실|빈집|비어\s*있/.test(t)) push('현장 상태', '공실');
  else if (/거주|살고|사람이\s*삼/.test(t)) push('현장 상태', '거주 중');
  if (row('층 / 엘베')) push('층·엘베', row('층 / 엘베'));
  if (r.patch?.subScopes?.length) {
    const label = { bathroom: '욕실', kitchen: '주방', wallpaper: '도배', floor: '바닥', paint: '도장', entrance: '현관', demolition: '철거', plaster: '바닥 미장', groundwork: '기초·정지', window: '창호', carpentry: '문·몰딩', electric: '전기·조명', film: '필름' };
    push('포함', r.patch.subScopes.map((x) => label[x] || String(x).replace(/^x:/, '')).join('·'));
  }
  if (r.patch?.excludedWorks?.length) push('제외', r.patch.excludedWorks.join('·'));
  if (r.patch?.extraWorks?.length) push('추가', r.patch.extraWorks.join('·'));

  // 요청사항 — 원문에서 핵심이 되는 첫 줄들만 짧게
  const wants = clean
    .split(/\n|(?<!\d)\.(?!\d)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 2)
    .join(' / ');
  if (wants && !wish) push('요청', wants);
  if (autoLine) lines.push(autoLine);

  return lines.join('\n') || clean.slice(0, 120);
}
