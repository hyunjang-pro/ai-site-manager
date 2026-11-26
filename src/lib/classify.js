// 숨고·카톡·메모·스크린샷 글자를 붙여넣으면 공종과 변수를 먼저 잡아준다.
// 규칙 기반(오프라인 100%) — 사진은 ocr.js가 읽은 글자를 여기에 넘긴다.
import { REGIONS, TRADES } from './constants.js';
import { detectPartial, partialOf, PARTIAL_ITEMS } from './partial.js';
import { isDemoOnlyText } from './scope.js';
import { parseRequestSheet, sheetToText, requestSignals, preservationGate, sheetValue } from './request.js';

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

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

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
  bathroom: '욕실',
  kitchen: '주방',
  entrance: '현관',
  plaster: '바닥 미장',
  carpentry: '문·몰딩',
  electric: '전기·조명',
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
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  // 요청서(숨고·카톡 양식)면 라벨과 값을 나눠 읽는다.
  //  - 라벨은 라벨이고 값만 내용이다 ("공실 상태"라는 라벨 때문에 '공실'로 읽히던 것 방지)
  //  - 서비스 분야·공간 유형·공급면적처러 명시된 값을 추론보다 우선한다
  const sheet = opts.sheet || parseRequestSheet(text);
  const signals = requestSignals(sheet, text);
  // 라벨을 뺀 실제 내용 — 점의 의미 판단(공실/거주/누수 등)에 쓴다
  const contentT = signals.hasForm ? signals.contentText.toLowerCase().replace(/\s+/g, ' ') : t;
  // "철거는 하지 마세요" — 부정된 철거를 동작으로 읽지 않는다
  const removalNegated = /(철거|해체|제거)\s*(?:는|은|를)?\s*(?:안\s*하|하지\s*마|하지\s*않|빼|제외|불필요)/.test(t);
  const removalIntent = signals.removal && !removalNegated;

  const excludedWorks = [];
  const extraWorks = [];
  const subScopes = [];
  const excludedScopes = [];
  if (removalNegated) excludedWorks.push('철거');
  const windowExcluded = /창호.{0,45}(안\s*해|안해|안\s*하|제외|불필요|빼|하지\s*않)/.test(t) || /창호\s*제외/.test(t);
  if (windowExcluded) excludedWorks.push('창호');
  if (/바닥.{0,8}미장|미장.{0,8}필요|평평하지\s*않/.test(t)) extraWorks.push('바닥 미장');
  if (/난방/.test(t)) extraWorks.push('난방 보강');
  if (/타일/.test(t)) extraWorks.push('타일');

  const hits = [];
  const push = (id, re, strong = false) => {
    if (re.test(t)) hits.push({ id, strong });
  };
  // '철거'는 **동작어가 있을 때만**이다. 예전에는 재료 이름(가벽·경량벽체·데코타일)까지 철거로 쳐서
  // "8m 가벽 룸3개 만들기"(만들기)가 '상가·주택 철거 6평'으로 계산됐다.
  if (removalIntent) hits.push({ id: 'demolition', strong: false });
  push('wallpaper', /도배|벽지|합지|실크|장판|마루|초배/);
  push('bathroom', /욕실|화장실|양변기|세면대|샤워|욕조/);
  // 부엌·싱크·상부장·하부장·후드까지 주방으로 읽는다 ("부엌을 전면 인테리어" → 주방)
  push('kitchen', /주방|부엌|싱크|씽크|상판|후드|수납장|상부장|하부장|조리대|아일랜드|식기세척기/);
  push('tilewaterproof', /타일|방수|줄눈|담수|에폭시/);
  push('plaster', /미장|몰탈|엑셀관|바닥미장|바닥 미장/, true);
  push('window', windowExcluded ? /__none__/ : /창호|샤시|샷시|폴딩도어|발코니|중문|방충망|유리|블라인드/);
  push('waste', /폐기물|쓰레기|수거|배출|반출|마대|처리장|한\s*차/);
  push('labor', /인부|일용|인력|인력사무소|잠부|사람.{0,6}(구해|필요)/);
  push('repair', /수선|보수|교체|문짝|몰딩|도장|페인트|걸레받이|경첩|손잡이|실리콘/);
  // 가벽·칸막이·경량벽체는 **목공(경량벽체) 작업**이다 — 뜯는 말이 함께 있을 때만 철거(부분 철거)로 내려간다
  push('carpentry', /목공|문틀|문짝|몰딩|가구|데크|선반|파티션|합판|가벽|경량\s*벽체|경량벽체|칸막이|판넬\s*벽|신발장|붙박이\s*장/);
  push('electric', /전기\s*(공사|배선|증설)|콘센트|조명|스위치|분전반|누전|형광등|LED|배선/);
  push('plumbing', /배관|급수|배수|수도|보일러|하수구|막힘|수전|세면기|변기\s*(막힘|교체)/);
  push('film', /필름|시트지|래핑|유리\s*필름/);
  push('groundwork', /토목|터파기|기초\s*(공사|타설|콘크리트)|맨땅|콘크리트\s*타설|배수로|정원\s*공사|포장\s*공사|성토|절토|굴삭기|포크레인|아스콘|옹벽|부지\s*정지|정지\s*(작업|공사)|땅\s*고르|지반\s*(공사|복구)|노면\s*복구|부지\s*(정리|고르|공사)/);

  const ids = hits.map((h) => h.id);
  // '전체 인테리어·올수리' — 다만 "욕실 올수리", "주방 전체 교체"처럼 한 공간만 새로 하는 일은 전체가 아니다.
  // (라벨 '공간 유형: 아파트'를 '아파트 인테리어'로 읽어 욕실 올수리를 복합 인테리어 1,476만으로 만들던 것)
  const fullPhrase = /집\s*전체|아파트\s*인테리어|전체\s*인테리어|전체\s*공사|전체를|풀\s*인테리어|올\s*리모델링/.test(contentT);
  const fullWord =
    fullPhrase ||
    (/올\s*수리|올수리|리모델링/.test(contentT) && !/욕실|화장실|주방|부엌|현관|베란다|샷시|도배/.test(contentT));
  const fullInterior = !!fullWord;
  if (fullInterior) {
    // '전체 인테리어'면 철거·도배·장판·욕실·주방·현관·미장이 기본 포함이다.
    subScopes.push('demolition', 'wallpaper', 'bathroom', 'kitchen', 'entrance', 'plaster');
  }
  const core = ids.filter((id) => ['demolition', 'wallpaper', 'bathroom', 'kitchen'].includes(id));
  // '철거 + 정지'처럼 두 가지 일이 한 현장에 같이 오면 한 공종만 고르면 나머지가 견적에서 빠진다.
  const withGroundwork =
    ids.includes('groundwork') && ids.some((id) => ['demolition', 'wallpaper', 'bathroom', 'kitchen', 'entrance', 'plaster'].includes(id));

  let trade = 'unclassified';
  const partitionJob = signals.partition && !removalIntent;
  // 욕실·주방 하나만 철거·교체하는 현장은 복합이 아니라 그 공종이다 (철거는 그 공정 안에 포함)
  const pyungNum = parseFloat((t.match(/(\d+(?:\.\d+)?)\s*평/) || [])[1] || 0);
  // 방 하나(욕실 1칸·주방)를 뜯는 일은 큰 현장이 아니다 — "음식점 25평 철거"와 구분한다
  const roomUnit = /(욕실|화장실)\s*\d*\s*칸/.test(t) || (/욕실|화장실|주방|부엌/.test(t) && pyungNum > 0 && pyungNum < 8);
  const bigPlaceJob =
    !roomUnit &&
    (pyungNum >= 8 || /원상복구|전체\s*철거|전부\s*철거|폐업|매장|음식점|식당|카페|사무실|공장/.test(t));
  const oneRoom =
    !bigPlaceJob &&
    ((ids.includes('bathroom') && !ids.includes('wallpaper') && !ids.includes('kitchen')) ||
      (ids.includes('kitchen') && !ids.includes('wallpaper') && !ids.includes('bathroom')));
  if (fullInterior) trade = 'combined';
  else if (withGroundwork) trade = 'combined';
  else if (oneRoom && (ids.includes('demolition') || ids.includes('tilewaterproof'))) trade = ids.includes('bathroom') ? 'bathroom' : 'kitchen';
  else if (core.length >= 2) trade = 'combined';
  else if (ids.includes('demolition')) trade = 'demolition';
  else if (ids.includes('labor')) trade = 'labor';
  else if (ids.includes('waste')) trade = 'waste';
  else if (ids.includes('plaster')) trade = 'plaster';
  else if (ids.includes('groundwork')) trade = 'groundwork';
  else if (ids.includes('carpentry')) trade = 'carpentry';
  else if (ids.includes('electric')) trade = 'electric';
  else if (ids.includes('plumbing')) trade = 'plumbing';
  else if (ids.includes('film')) trade = 'film';
  else if (ids.includes('bathroom') && ids.includes('tilewaterproof')) trade = 'bathroom';
  else if (ids.includes('window')) trade = 'window';
  else if (ids.includes('bathroom')) trade = 'bathroom';
  else if (ids.includes('kitchen')) trade = 'kitchen';
  else if (ids.includes('wallpaper')) trade = 'wallpaper';
  else if (ids.includes('tilewaterproof')) trade = 'tilewaterproof';
  else if (ids.includes('repair')) trade = 'repair';
  else if (ids.length === 1) trade = ids[0];

  // ── 명시된 요청을 추론보다 우선한다 ─────────────────────────────
  // '서비스 분야: 부분 인테리어' + '가벽 룸3개 만들기' = 목공(경량벽체) 현장이다.
  // 뜯는 말이 없는데 철거로 내려가면 6평 철거·폐기물 멘트가 나간다.
  if (partitionJob && ['unclassified', 'demolition', 'carpentry'].includes(trade)) trade = 'carpentry';
  // '인테리어'라고 적혀 있는데 안에 뭐가 있는지 못 찾았으면 — 철거로 기울지 말고 '직접 확인' 현장으로
  if (trade === 'unclassified' && signals.interiorDeclared) trade = 'custom';

  // 폐기물 + 철거가 같이 있으면 실제 주작업(철거)으로
  if (trade === 'waste' && /철거|해체/.test(t)) trade = 'demolition';
  // "샷시 철거 후 새로 설치"·"장판 철거하고 새 장판"처럼 철거 뒤 시공까지 말했으면
  // 철거가 아니라 그 공종(창호·도배·욕실·주방) 현장이다.
  if (!fullInterior && ['demolition', 'combined'].includes(trade) && /설치|교체|새로|새\s*(장판|벽지|타일|샷시|창|문|도기|싱크대|마루|바닥)|시공|깔아/.test(t)) {
    const finishIds = ids.filter((id) => ['wallpaper', 'bathroom', 'kitchen', 'window', 'tilewaterproof', 'carpentry', 'electric', 'plumbing', 'film', 'plaster'].includes(id));
    if (finishIds.length === 1) trade = finishIds[0];
    else if (ids.includes('window') && /(샷시|샤시|창호)[^\n]{0,12}(설치|교체)/.test(t)) trade = 'window';
  }
  // "발코니 방수"는 창호가 아니라 타일·방수
  if (trade === 'window' && /방수|누수/.test(t) && !/창호|샤시|폴딩|중문/.test(t)) trade = 'tilewaterproof';
  // 상가 폐업 집기·비품 정리는 철거가 아니라 폐기물 수거 현장이다
  if ((/집기|비품/.test(t) || (/폐업/.test(t) && /정리|수거/.test(t))) && !/원상복구/.test(t)) trade = 'waste';
  // '수거·폐기만' 하는 요청 (이사 후 가구 정리 등) — 시공이 들어가면 해당 없다
  if (
    /폐기물|쓰레기|수거|집기|비품|버리|치우/.test(t) &&
    !/철거|해체|원상복구|설치|교체|제작|보수|시공|만들/.test(t)
  ) {
    trade = 'waste';
  }

  // ── 뜯기만 하는 요청은, 공간 이름(장판·화장실·샷시·부엌)이 여러 개 나와도 인테리어가 아니다 ──
  // ("32평 올철거 장판 마루 씽크대 화장실2 샷시", "34평 아파트 장판만 제거 …")
  // '시공·설치·교체·도배' 같은 새로 만드는 말이 한 개도 없으면 복합 인테리어로 올리지 않는다.
  // 단 '철거 + 부지 정지·전기·배관'처럼 다른 공종이 진짜 같이 있는 현장은 복합 그대로 둔다.
  const otherTrades = ids.some((id) => ['groundwork', 'electric', 'plumbing', 'plaster', 'film'].includes(id));
  if (trade === 'combined' && ids.includes('demolition') && !otherTrades && isDemoOnlyText(t)) trade = 'demolition';

  // ── '하나만 갈아 끼우는' 수선은 올수리·창호 교체가 아니다 ──
  // "학교 화장실 변기 1개 교체"가 욕실 올수리 566만으로 나가면 안 된다.
  const fixtureOnly =
    /변기|양변기|세면대|수전|샤워기|도기/.test(t) &&
    /교체|갈아|바꾸/.test(t) &&
    !/타일|방수|철거|올수리|전체\s*교체|리모델링|인테리어/.test(t);
  if (fixtureOnly && trade === 'bathroom') trade = 'repair';
  if (/중문|방화문|문짝|도어/.test(t) && /교체|설치|갈아/.test(t) && !/창호|샷시|샤시/.test(t) && ['window', 'bathroom'].includes(trade)) trade = 'repair';
  // 바닥 데코타일 시공은 타일·방수(㎡)가 아니라 장판과 같은 평당 바닥 공사다.
  // 단 '상가 15평 철거 후 데코타일'처럼 건물 전체 철거가 앞에 있으면 복합으로 묶어 둔다.
  if (/데코타일/.test(t) && /시공|깔|교체|새/.test(t) && !/원상복구|올수리|전체/.test(t)) {
    if (/철거|제거/.test(t) && (pyungNum >= 8 || /상가|사무실|매장|카페|식당|학원|병원/.test(t))) trade = 'combined';
    else if (['tilewaterproof', 'demolition'].includes(trade)) trade = 'wallpaper';
  }
  // "장판만 제거"·"벽지 뜯기" — '제거'만 적힌 마감재는 도배 시공이 아니라 철거 현장이다
  if (trade === 'wallpaper' && /제거|철거|뜯|까\s*내/.test(t) && isDemoOnlyText(t)) trade = 'demolition';

  // ── 소형·부분 철거(개수 단위) ──
  // "간판 두개 철거", "싱크대 철거"를 15평 전체 철거로 계산하면 400~500만원이 나온다.
  const partial = detectPartial(t);
  if (partial.on) {
    // 품목이 하나뿐인 욕실·주방 철거는 그 공종에서 '철거만'으로 계산한다
    const only = partial.items.length === 1 ? partial.items[0].id : '';
    trade = only === 'bathroom' ? 'bathroom' : only === 'sink' && /주방|부엌/.test(t) ? 'kitchen' : 'demolition';
  }

  // "욕실 타일 20㎡"는 욕실 리모델링이 아니라 타일·방수 면적 공사다.
  const explicitSqm = t.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)/);
  if (trade === 'bathroom' && ids.includes('tilewaterproof') && explicitSqm && !/올수리|리모델링|인테리어|전체\s*교체/.test(t)) {
    trade = 'tilewaterproof';
  }

  const floorMatch = t.match(/(\d+)\s*층/);
  const tonMatch = t.match(/(\d+(?:\.\d+)?)\s*톤/);
  const loadMatch = t.match(/(한|두|세|네)\s*차/);
  const peopleMatch = t.match(/(\d+)\s*명/);
  const dayMatch = t.match(/(\d+)\s*일/);
  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평(?:대)?/);
  const sqm = t.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)/);
  const meter = t.match(/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*2)/);
  const spot = t.match(/(\d+(?:\.\d+)?)\s*(?:개소|군데|곳|개)/);
  const kan = t.match(/(\d+(?:\.\d+)?)\s*칸/);
  // "욕실 하나", "화장실 두 칸"처럼 숫자를 한글로 적는 경우가 많다
  const kanWord =
    t.match(/(한|두|세|네|다섯|여섯)\s*칸/) ||
    t.match(/(?:욕실|화장실)\s*(\d+|[한두세네]|다섯|여섯)\s*(?:개|칸|곳)?/);
  const KOR_NUM = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };
  const budgetMatch = t.match(/예산\s*([\d,]+)\s*만\s*원?\s*(미만|이하|내외)?/);

  let sizeValue = '';
  let sizeUnit = '';
  const livingWaste = trade === 'waste' && /생활\s*폐기물|가구|침대|소파|장롱|냉장고|세탁기|이사|살림|가전|집기/.test(t);
  const sitePyung = parseFloat((t.match(/(\d+(?:\.\d+)?)\s*평/) || [])[1] || 0);
  if (partial.on) {
    // 부분 철거는 품목 수량이 곧 규모다 (간판 2개 · 샷시 2짝 · 가벽 3m).
    // 단위가 섞여 있으면 숫자를 합치지 않는다 (장판 15평 + 욕실 2칸 = 17? 뜻이 없다).
    const units = Array.from(new Set(partial.items.map((it) => it.unit)));
    if (sitePyung > 0) {
      // "34평 아파트 장판만 제거 …" — 평수는 현장 넓이로만 쓰고 금액은 품목 단위로 계산한다
      sizeValue = String(sitePyung);
      sizeUnit = '평';
    } else if (units.length === 1) {
      const total = partial.items.reduce((sum, it) => sum + (Number(it.qty) || 1), 0);
      sizeValue = String(Math.round(total * 10) / 10);
      sizeUnit = units[0];
    } else {
      sizeValue = '';
      sizeUnit = '모름';
    }
  } else if (trade === 'waste') {
    if (tonMatch) {
      sizeValue = num(tonMatch[1]);
    } else if (loadMatch) {
      // 생활폐기물 '한차'는 1톤 트럭 1차가 기본 (2.5톤 아님). 상가·공장 철거 한차는 2.5톤.
      const n = { 한: 1, 두: 2, 세: 3, 네: 4 }[loadMatch[1]] || 1;
      sizeValue = livingWaste ? n : n === 1 ? 2.5 : n * 2.5;
    } else if (livingWaste) {
      sizeValue = 1;
    }
    sizeUnit = '톤';
  } else if (trade === 'labor') {
    sizeValue = peopleMatch ? parseInt(peopleMatch[1], 10) : '';
    sizeUnit = '명';
  } else if (trade === 'bathroom') {
    sizeValue = kan ? num(kan[1]) : kanWord ? Number(kanWord[1]) || KOR_NUM[kanWord[1]] || 1 : 1;
    sizeUnit = '칸';
  } else if (trade === 'kitchen' && meter) {
    sizeValue = num(meter[1]);
    sizeUnit = 'm';
  } else if (['carpentry', 'electric', 'plumbing'].includes(trade)) {
    if (partitionJob && signals.dims.meters) {
      // 가벽·칸막이는 길이(m)가 규모다 ('룸3개'를 3개소로 읽지 않는다)
      sizeValue = signals.dims.meters;
      sizeUnit = 'm';
    } else if (spot) {
      sizeValue = num(spot[1]);
      sizeUnit = '개소';
    } else if (meter && (trade === 'carpentry' || trade === 'plumbing')) {
      sizeValue = num(meter[1]);
      sizeUnit = 'm';
    } else if (pyung) {
      sizeValue = num(pyung[1]);
      sizeUnit = '평';
    }
  } else if (['tilewaterproof', 'window', 'plaster', 'film', 'groundwork'].includes(trade)) {
    if (sqm) {
      sizeValue = num(sqm[1]);
      sizeUnit = '㎡';
    } else if (pyung) {
      sizeValue = num(pyung[1]);
      sizeUnit = '평';
    }
  } else if (trade === 'repair') {
    sizeValue = spot ? num(spot[1]) : 1;
    sizeUnit = '개소';
  } else if (pyung) {
    sizeValue = num(pyung[1]);
    sizeUnit = '평';
  } else if (sqm) {
    sizeValue = num(sqm[1]);
    sizeUnit = '㎡';
  } else if (meter) {
    sizeValue = num(meter[1]);
    sizeUnit = 'm';
  } else if (kan) {
    sizeValue = num(kan[1]);
    sizeUnit = '칸';
  }

  // 지역·현장 위치
  let region = '';
  for (const r of REGIONS) {
    if (r !== '기타' && t.includes(r.toLowerCase())) {
      region = r;
      break;
    }
  }
  const locMatch = text.match(/(?:경북|경상북도)\s*([가-힣]+시)(?:\s*([가-힣0-9]+(?:동|읍|면)))?/);
  const location = locMatch ? `경북 ${locMatch[1]}${locMatch[2] ? ` ${locMatch[2]}` : ''}` : '';
  // 글에 적힌 연락처 — 숨고 요청서·카톡에 같이 오는 경우가 많다 (없으면 빈칸 = 사용자가 채운다)
  const phoneMatch = text.match(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/);

  // 엘리베이터 — "엘리베이터로 운반/사용"은 있음, "엘리베이터 없음"만 없음으로 읽는다.
  // (문장 어딘가의 '불가·no'를 엘베로 오인하지 않게 엘베 단어 뒤 8자만 본다)
  const elevatorWord = /엘(?:베|리베이터|레베이터|리베이타)|승강기/.test(t);
  const elevatorNo = /엘(?:베|리베이터|레베이터|리베이타)[^\n]{0,10}?(?:없|불가|미사용|안\s*씀)|승강기[^\n]{0,10}?없/.test(t);
  const elevatorYes =
    /엘(?:베|리베이터|레베이터|리베이타)[^\n]{0,12}?(?:운반|사용|이용|있|가능)|승강기[^\n]{0,10}?(?:사용|운반|있)/.test(t);
  const elevator = elevatorNo ? 'no' : elevatorYes ? 'yes' : elevatorWord ? 'unknown' : 'unknown';
  const hints = [];
  const survey = {};
  if (/텍스|슬레이트/.test(contentT)) {
    hints.push('천장 텍스·슬레이트 — 석면 조사 대상인지 확인하세요.');
    survey.asbestosRisk = true;
  }
  if (/누수|물이\s*샘|곰팡이/.test(contentT)) {
    hints.push('누수·곰팡이 — 방수 범위와 아래층 피해를 먼저 확인하세요.');
    survey.existingLeak = true;
  }
  if (elevator === 'no') hints.push('엘리베이터 없음 — 계단 운반비가 붙습니다.');
  if (elevator === 'yes') hints.push('엘리베이터 운반 가능 — 양중비를 낮출 수 있습니다.');
  if (/급한|빨리|내일|이번\s*주/.test(t)) hints.push('일정이 급함 — 인력·자재 수급부터 확인하세요.');
  // 입주·공실은 **라벨이 아니라 값**으로 판단한다 ('공실 상태: 짐 있음 / 계약 상태: 현재 입주 중')
  const occupiedNow = signals.hasForm ? signals.occupied : /거주|살고|사람이\s*삼|입주\s*중|영업\s*중/.test(contentT);
  const vacantNow = signals.hasForm ? signals.vacant : /공실|빈집|비어\s*있/.test(contentT);
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
  if (/주말|공휴일/.test(t)) survey.noWeekend = true;
  // 요청서에 이미 적힌 조건은 처음부터 체크해 둔다 (사용자가 다시 누를 필요 없게)
  // 단, 간판·폐기물처럼 공용부를 쓰지 않는 현장에는 보양·관리소 신고를 붙이지 않는다.
  const noSiteCare = partial.on || ['waste', 'labor', 'groundwork'].includes(trade);
  if (!noSiteCare && /아파트|오피스텔/.test(contentT)) {
    survey.protectLevel = true;
    survey.adminDeposit = true;
  } else if (!noSiteCare && /빌라|상가|사무실/.test(contentT)) {
    survey.protectLevel = true;
  }
  if (vacantNow) survey.residential = false;
  if (elevator === 'yes') survey.materialLift = false;
  // 집 전체·복합 현장의 세부 포함 공종 — 욕실·부엌·도배·현관·철거·미장을 하나도 빠뜨리지 않는다
  if (/욕실|화장실/.test(t) || /욕실\s*\d/.test(t)) subScopes.push('bathroom');
  if (/부엌|주방|싱크|상부장|하부장/.test(t)) subScopes.push('kitchen');
  if (/도배|벽지|장판|마루|데코타일|합지|실크/.test(t)) subScopes.push('wallpaper');
  if (/현관|중문|신발장|현관\s*타일/.test(t)) subScopes.push('entrance');
  if (/철거|해체|원상복구/.test(t)) subScopes.push('demolition');
  if (/미장|몰탈|바닥\s*평탄/.test(t)) subScopes.push('plaster');
  if (/토목|터파기|정지|성토|절토|굴삭기|포크레인|기초|배수로|옹벽|아스콘|맨땅/.test(t)) subScopes.push('groundwork');
  if (/창호|샤시|샷시|유리|중문/.test(t) && /(안\s*해|안해|안\s*하|제외|불필요|빼|기존\s*유지|그대로)/.test(t)) excludedScopes.push('window');
  if (excludedScopes.length) hints.push(`${excludedScopes.join(', ')} 제외 — 견적에서 빼고 손님에게 확인하세요.`);
  if (excludedWorks.length) hints.push(`${excludedWorks.join(', ')} 제외 — 견적에서 빼고 손님에게 확인하세요.`);
  if (extraWorks.includes('바닥 미장')) hints.push('바닥 미장 추가 — 미장·양생 일수를 공정에 넣으세요.');
  if (budgetMatch) hints.push(`손님 예산 ${budgetMatch[1]}만원${budgetMatch[2] || ''} — 이 안에서 범위를 잡으세요.`);
  if (/방\s*\d|욕실\s*\d|부엌|현관/.test(t)) hints.push('공간 구성이 적혀 있습니다 — 실측 때 방·욕실·주방 수를 확인하세요.');
  // 가벽·칸막이(경량벽체) — 면적(평)이 아니라 길이(m)와 칸 수로 견적하는 현장이다
  const partitionInfo =
    partitionJob && (signals.dims.meters || signals.dims.rooms)
      ? {
          meters: signals.dims.meters,
          rooms: signals.dims.rooms,
          doors: signals.dims.doors || signals.dims.rooms,
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

  const mode = trade === 'tilewaterproof' ? (/방수/.test(t) && /타일/.test(t) ? 'both' : /방수|누수/.test(t) ? 'waterproof' : 'tile') : undefined;

  // 폐기물 차량 — 1톤 1차가 기본, 2.5톤 명시나 상가·공장 철거 한차만 2.5톤
  const hasHalfWord = /반\s*차|반차량/.test(t);
  const storeCleanout = /집기|비품|폐업/.test(t) && /상가|매장|음식점|식당|카페|사무실|공장/.test(t);
  const wasteVehicleId =
    trade === 'waste'
      ? hasHalfWord
        ? 'half'
        : sizeValue === '' || sizeValue === undefined || sizeValue === '0'
        ? storeCleanout
          ? 'ton25'
          : 'ton1'
        : num(sizeValue) <= 0.7
        ? 'half'
        : num(sizeValue) <= 1.5
        ? 'ton1'
        : 'ton25'
      : '';
  if (trade === 'waste' && hasHalfWord) {
    sizeValue = '0.5';
    sizeUnit = '톤';
  }
  // 규모를 안 적은 폐기물 현장도 차량 톤수를 규모로 보여 준다 ('톤'만 남지 않게)
  if (trade === 'waste' && (!sizeValue || sizeValue === '0')) {
    sizeValue = String({ half: 0.5, ton1: 1, ton25: 2.5 }[wasteVehicleId] || 1);
    sizeUnit = '톤';
  }
  const wasteVehicleLabel = { half: '반차(0.5톤)', ton1: '1톤 1차', ton25: '2.5톤' }[wasteVehicleId] || '';

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
  if (floorMatch) rows.push({ label: '층 / 엘베', value: `${floorMatch[1]}층 · ${elevator === 'no' ? '없음' : elevator === 'yes' ? '있음' : '확인 필요'}` });
  if (trade === 'waste') rows.push({ label: '처리', value: `${wasteVehicleLabel || '1톤 1차'} · 톤당 32만(차량·상차 포함)` });
  if (trade === 'labor') rows.push({ label: '청구 기준', value: '1명 1일 26만원(원가 19만)' });
  if (trade === 'plaster' && extraWorks.length) rows.push({ label: '추가', value: extraWorks.join(' · ') });
  if (excludedWorks.length) rows.push({ label: '제외', value: excludedWorks.join(' · ') });

  const titleParts = [];
  if (region) titleParts.push(region);
  else if (locMatch?.[2]) titleParts.push(locMatch[2]);
  if (sizeValue) titleParts.push(`${sizeValue}${sizeUnit}`);
  // 복합이면 실제로 켠 세부 공종으로 제목을 만든다 (철거+정지는 '전체 인테리어'가 아니다)
  titleParts.push(
    partitionInfo
      ? `가벽${partitionInfo.rooms ? `·룸${partitionInfo.rooms}` : ''} 목공`
      : trade === 'combined'
      ? combinedTitle(Array.from(new Set(subScopes)))
      : TRADE_TITLE[trade] || '현장'
  );
  // 부분 철거는 '2개 철거'가 아니라 '간판 2개 철거'로 — 무엇을 뜯는지 제목에 보이게
  let suggestTitle = trade === 'unclassified' ? '새 현장' : titleParts.join(' ');
  if (partial.on) {
    suggestTitle = partialTitle(partial.items, { region, pyung: sitePyung });
  }

  // 뜯기만 하는 현장(철거·폐기물·인력)에 '도배·장판·욕실·주방 포함' 칩이 켜지면
  // 화면에서는 시공까지 하는 현장처럼 보인다 — 철거 현장은 철거(·정지)만 포함으로 남긴다.
  const scopeIds = Array.from(new Set(subScopes));
  const finalScopes =
    ['demolition', 'waste', 'labor'].includes(trade) ? scopeIds.filter((s) => ['demolition', 'groundwork'].includes(s)) : scopeIds;

  const patch = {
    trade,
    sizeValue: sizeValue === '' ? '' : String(sizeValue),
    sizeUnit: sizeUnit || TRADES[trade]?.defaultUnit || '평',
    rawInput: text,
    notes: text,
    parseHints: hints,
    survey,
    lifting: { floor: floorMatch ? parseInt(floorMatch[1], 10) : '', elevator },
    extraWorks,
    excludedWorks,
    subScopes: finalScopes,
    excludedScopes: Array.from(new Set(excludedScopes)),
    ...(partitionInfo ? { partition: partitionInfo } : {}),
    ...(signals.space ? { spaceType: signals.space } : {}),
    ...(sheet.source ? { source: sheet.source } : {}),
    ...(signals.service ? { serviceType: signals.service } : {}),
    ...(signals.budget || budgetMatch ? { clientBudget: (budgetMatch || [])[1] ? `${budgetMatch[1]}만원${budgetMatch[2] || ''}` : '' } : {}),
  };
  // 규모를 안 적은 요청 — 무엇이든 15평으로 잡으면 "데코타일 철거"가 461만원이 된다.
  // 한 공간(욕실·방·바닥) 요청인지, 매장·건물 요청인지 구분해 기본값을 나눈다.
  // 단 길이(m)·개소로 계산하는 공종(목공·전기·설비·수선)은 **평 기본값을 쓰지 않는다.**
  //  예전에는 '가벽 룸 만들기'에 면적이 없으면 6평 철거로 떨어졌다.
  if (!sizeValue || sizeValue === '0') {
    const unitTrade = ['carpentry', 'electric', 'plumbing', 'repair'].includes(trade);
    if (unitTrade) {
      patch.sizeUnit = sizeUnit && sizeUnit !== '평' ? sizeUnit : TRADES[trade]?.defaultUnit || '모름';
      patch.sizeUnconfirmed = true;
    } else {
      const roomWords = /욕실|화장실|주방|부엌|베란다|발코니|현관|원룸|투룸|방\s*\d|방 하나|데코타일|텍스|가벽|장판|마루|바닥|싱크대|붙박이|간판|창호|샷시|문짝|몰딩|타일/;
      const placeWords = /상가|상점|매장|식당|음식점|카페|사무실|공장|창고|학원|병원|약국|관공서|학교|빌딩|건물|아파트|빌라|주택|오피스텔|층|평수/;
      patch.scaleHint = placeWords.test(contentT) ? 'place' : roomWords.test(contentT) ? 'room' : '';
      patch.sizeUnknown = true;
    }
  }
  if (region) patch.region = region;
  if (location) patch.location = location;
  if (phoneMatch) patch.clientPhone = `${phoneMatch[1]}-${phoneMatch[2]}-${phoneMatch[3]}`;
  if (trade === 'labor') patch.laborDays = dayMatch ? Math.max(1, parseInt(dayMatch[1], 10)) : 1;
  if (trade === 'waste') patch.wasteVehicle = wasteVehicleId || 'ton1';
  if (partial.on) {
    patch.demolition = { mode: 'partial', items: partial.items, access: partial.access, exterior: partial.exterior };
    patch.sizeUnit = sizeUnit;
  }
  if (fullInterior) patch.fullInterior = true;
  if (trade === 'custom') {
    // '부분 인테리어'라고만 적혀 있고 무엇을 하는지 없는 요청 — 공종 이름은 손님이 쓴 말로 두고,
    // 금액은 범위를 확인한 뒤 확정하라고 알린다. 규모도 모르므로 큰 평수를 지어내지 않는다(6평 기준).
    patch.tradeName = signals.service || '부분 인테리어';
    patch.needsCheck = true;
    patch.scaleHint = 'room';
    patch.sizeUnknown = true;
    hints.push('요청서에 무엇을 시공하는지 자세히 없습니다 — 첫 통화에서 범위를 확인한 뒤 금액을 정하세요.');
  }
  if (/덧방/.test(t)) patch.tileRemain = true;
  if (trade === 'tilewaterproof') patch.tileWork = { mode };
  if (trade === 'plaster') patch.plaster = { heating: extraWorks.includes('난방 보강'), tile: extraWorks.includes('타일') };

  // 정리본 — 원문 순서·라벨을 그대로 살리고 이 한 줄만 덧붙인다
  const autoLine = autoClassLine({ trade, partitionInfo, sizeValue, sizeUnit, tradeName: patch.tradeName });
  const summaryText = sheetToText(sheet, { autoLine }) || autoLine;
  // 보존 게이트 — 원문 핵심 줄이 정리본에서 사라졌거나, 명시된 서비스와 공종이 어긋나는지
  const guard = preservationGate({ sheet, summary: summaryText, trade, tradeName: TRADES[trade]?.label || '' });

  return {
    trade,
    patch,
    rows,
    hints,
    title: suggestTitle,
    sheet,
    signals,
    autoLine,
    summary: summaryText,
    guard,
    confidence: trade === 'unclassified' ? 'low' : hits.length >= 2 ? 'medium' : 'high',
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
// 폰 UI 잡글자는 ocr.cleanOcrText가 이미 지운 상태로 들어온다.
//
//  ① 양식(숨고·카톡 요청서)이면 — **원문 순서·라벨 그대로** 남긴다. 항목을 골라 다시 쓰지 않는다.
//     (예전에는 목록에 없는 '공간 유형·서비스 분야·공급면적·공실/계약 상태'가 조용히 사라졌다)
//  ② 자유 문장이면 — 짧은 요약(공종·규모·요청)을 쓴다.
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
      (clean.match(/거실|방\s*\d|욕실|화장실|주방|부엌|베란다|발코니|현관|상가|사무실|원룸|사무실/g) || []).map((s) =>
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
    const label = { bathroom: '욕실', kitchen: '주방', wallpaper: '도배·장판', entrance: '현관', demolition: '철거', plaster: '바닥 미장', groundwork: '기초·정지', window: '창호', carpentry: '문·몰딩', electric: '전기·조명' };
    push('포함', r.patch.subScopes.map((x) => label[x] || String(x).replace(/^x:/, '')).join('·'));
  }
  if (r.patch?.excludedWorks?.length) push('제외', r.patch.excludedWorks.join('·'));
  if (r.patch?.extraWorks?.length) push('추가', r.patch.extraWorks.join('·'));

  // 요청사항 — 원문에서 핵심이 되는 첫 줄들만 짧게
  const wants = clean
    .split(/\n|(?<!\d)\.(?!\d)/) // '2.5톤'의 소수점에서 문장을 끊지 않는다
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 2)
    .join(' / ');
  if (wants && !wish) push('요청', wants);
  if (autoLine) lines.push(autoLine);

  return lines.join('\n') || clean.slice(0, 120);
}
