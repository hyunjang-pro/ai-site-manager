// 해석된 문장 → '일감 명세(JobSpec)'.
// ─────────────────────────────────────────────────────────────
// 여기서 정하는 것: 의도 모드 → 공종 → 규모 → 세부 공종 → 현장 조건.
// 화면·견적·문서는 모두 이 명세 하나만 본다. (예전에는 classify·pricing·docs가
// 각자 문장을 다시 읽어서 같은 현장이 화면마다 다른 금액이 됐다)
import { itemById, SCOPE_LABEL, PLACES } from './lexicon.js';
import { parseText } from './parse.js';
import { isDemoOnlyText } from '../scope.js';

// 4가지 의도 모드 — 사람을 보내는 일 / 관공서 공고 / 단독 부분 교체 / 일반·복합 공사
export const MODES = {
  labor: '인력 지원',
  bid: '관공서 공고',
  part: '단독 부분 교체',
  general: '일반·복합 공사',
};

const SMALL_SCOPE_PYUNG = 6;

// 공종별 기본 규모 — 규모를 안 적은 요청이 15평으로 튀지 않게
const DEFAULT_SCALE = {
  demolition: { value: 15, unit: '평' },
  wallpaper: { value: 24, unit: '평' },
  bathroom: { value: 1, unit: '칸' },
  kitchen: { value: 3.2, unit: 'm' },
  tilewaterproof: { value: 12, unit: '㎡' },
  plaster: { value: 10, unit: '평' },
  window: { value: 6, unit: '㎡' },
  electric: { value: 4, unit: '개소' },
  plumbing: { value: 1, unit: '개소' },
  film: { value: 9.9, unit: '㎡' },
  repair: { value: 1, unit: '개소' },
  groundwork: { value: 20, unit: '㎡' },
  waste: { value: 1, unit: '톤' },
  labor: { value: 1, unit: '명' },
  combined: { value: 15, unit: '평' },
  carpentry: { value: 3, unit: 'm' },
};

const UNIT_TO_SIZE = { 평: '평', '㎡': '㎡', m: 'm', 칸: '칸', 개: '개소', 개소: '개소', 짝: '개소' };

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

// ── 의도 모드 ────────────────────────────────────────────
function detectMode(parsed, signals, text) {
  const t = text.toLowerCase();
  const facts = parsed.facts;
  const areaAny = facts.pyung > 0 || facts.sqm > 0 || facts.tons > 0;
  // 관공서 공고 — 예정가·기초금액·공고번호
  if (/예정가|기초금액|기초\s*금액|공고\s*번호|나라장터|입찰/.test(t) || opts_bid(signals)) return 'bid';
  // 인력 지원 — 사람 수 + 직종/일당, 규모(평·㎡)를 말하지 않았을 때
  const peopleWord = /\d+\s*명/.test(t) || /(한|두|세|네|다섯|여섯)\s*명/.test(t);
  const crewWord = /인부|일용|인력|사람|잡부|기공|철거공|타일공|목수|미장공|용접공|설비공|전기공|도배공|보조|기능공/.test(t);
  const supplyVerb = /지원|보내|파견|구해|필요|대기|일당|사람만/.test(t);
  const dayPair = /\d+\s*명[^.\n]{0,12}\d+\s*일/.test(t) || /\d+\s*일[^.\n]{0,8}\d+\s*명/.test(t);
  if (peopleWord && crewWord && (supplyVerb || dayPair) && !areaAny) return 'labor';
  // 단독 부분 교체 — "상판만", "~만 교체" 하나에만 동작이 붙었을 때
  const onlyOps = parsed.ops.filter((o) => o.action !== 'remove');
  if (onlyOps.length === 1 && onlyOps[0].only) return 'part';
  return 'general';
}

function opts_bid(signals) {
  return false;
}

// ── 공종 정하기 ──────────────────────────────────────────
// 규칙은 '동작이 있는 일'만 본다. 표면(surface)과 장소 이름은 공종을 정하지 않는다.
// 공종 이름 매핑 — 동작 이름(paint)과 장부 공종(repair)이 다르다
const SCOPE_TO_TRADE = { paint: 'repair', waterproof: 'tilewaterproof' };
function tradeOfScope(scope) {
  return SCOPE_TO_TRADE[scope] || scope;
}

function chooseTrade(parsed, mode, text) {
  const f = parsed.facts;
  const ops = parsed.ops;
  if (mode === 'labor') return 'labor';

  const removeOps = ops.filter((o) => o.action === 'remove');
  const buildOps = ops.filter((o) => o.action && o.action !== 'remove' && o.action !== 'collect');
  const spaces = new Set(parsed.spaces.map((s) => s.id));

  // ⓪ 원상복구·올철거 — 뜯는 말이 따로 없어도 건물을 비우는 일이다
  if (f.wholeStrip && !buildOps.length && !removeOps.some((o) => o.action === 'remove' && o.itemId !== 'waste')) return 'demolition';

  // 폐기물 수거만 하는 요청
  if (ops.length && ops.every((o) => o.itemId === 'waste' || o.action === 'collect')) return 'waste';

  // ① 전체 인테리어·리모델링 — 여러 공간을 새로 하는 일
  const remodelScopes = unique(buildOps.map((o) => o.scope)).filter((sc) => sc && sc !== 'repair');
  if (f.fullInterior || (f.remodelWord && remodelScopes.length >= 2)) {
    return 'combined';
  }
  // ①-2 철거한 품목이 철거가 아니라 다른 공종의 일이면 복합이다 ("철거 + 부지 정지")
  const removeOfWork = removeOps.filter((o) => (o.baseScope || o.itemScope) && !['demolition', 'waste', null].includes(o.baseScope || o.itemScope) && o.itemId !== 'whole');
  const hasWholeRemoval = removeOps.some((o) => o.itemId === 'whole');
  if ((hasWholeRemoval || buildOps.length) && removeOfWork.length && removeOfWork.some((o) => ['groundwork', 'electric', 'plumbing', 'tilewaterproof', 'plaster'].includes(o.baseScope || o.itemScope))) {
    return 'combined';
  }

  // ② 철거 + 기초·토목은 복합 (한 공종만 고르면 나머지가 견적에서 빠진다)
  if (buildOps.some((o) => o.scope === 'groundwork') && (removeOps.length || buildOps.some((o) => ['wallpaper', 'bathroom', 'kitchen', 'tilewaterproof', 'plaster'].includes(o.scope)))) {
    return 'combined';
  }
  // ③ 철거만 — 뜯는 일뿐이면 철거 현장이다
  const demoOnly = isDemoOnlyText(text);
  if (removeOps.length && !buildOps.length) {
    const items = removeOps.map((o) => o.itemId);
    if (items.every((id) => itemById(id)?.scope === 'waste')) {
      // "15평 상가 철거 원상복구, 폐기물 포함" — 건물을 비우는 일은 폐기물 수거가 아니다
      const buildingScale = (f.pyung >= 6 || f.wholeStrip) && (PLACES.commercial.test(text) || PLACES.residential.test(text) || f.wholeStrip);
      return buildingScale ? 'demolition' : 'waste';
    }
    // "주방 철거" — 품목 이름 없이 장소만 말한 해체는 그 공간의 철거다 (건물 평수를 말했으면 전체 철거)
    if (items.length === 1 && items[0] === 'whole' && spaces.has('kitchen') && !(f.pyung >= 6)) return 'kitchen';
    if (items.length === 1 && items[0] === 'whole' && spaces.has('bathroom') && !(f.pyung >= 6)) return 'bathroom';
    if (demoOnly) {
      const onlyBath = items.every((id) => ['bathroom', 'toilet', 'basin', 'faucet', 'tile', 'waterproof'].includes(id)) && items.includes('bathroom');
      if (onlyBath) return 'bathroom';
      const onlySink = items.length === 1 && items[0] === 'sink' && spaces.has('kitchen');
      if (onlySink) return 'kitchen';
      return 'demolition';
    }
  }
  // ④ 철거 + 시공이 섞이면, 시공 공종들로 복합 여부를 본다
  const buildScopes = unique(buildOps.map((o) => o.scope));
  const realScopes = buildScopes.filter((s) => s && s !== 'repair');
  // 서로 다른 일을 뜯고 새로 하는 것이면 복합이다 (칸막이 철거 + 페인트·바닥)
  const removeItems = unique(removeOps.map((o) => o.itemId));
  const buildItems = unique(buildOps.map((o) => o.itemId));
  const separateRemoval = removeOps.length > 0 && (removeOps.some((o) => o.itemId === 'whole') || removeItems.some((id) => !buildItems.includes(id)));
  if (removeOps.length && buildOps.length && separateRemoval) return 'combined';
  if (realScopes.length >= 2) {
    const craftOnly = realScopes.every((sc) => ['carpentry', 'window', 'repair'].includes(sc));
    if (craftOnly && realScopes.includes('carpentry')) return 'carpentry';
    return 'combined';
  }
  if (realScopes.length === 1) return tradeOfScope(realScopes[0]);
  if (buildScopes.length === 1) return tradeOfScope(buildScopes[0]);

  if (removeOps.length) {
    // 철거만 있는데 "새로" 같은 말 때문에 buildOps가 비어 있는 경우
    const items = removeOps.map((o) => o.itemId);
    const onlyBath = items.every((id) => ['bathroom', 'toilet', 'basin'].includes(id)) && items.some((id) => id === 'bathroom');
    if (onlyBath) return 'bathroom';
    return 'demolition';
  }

  // ⑤ 동작이 하나도 안 잡혔다 — 장소·품목 이름만으로 공종을 정한다 (상담 단계 문장)
  const idleScopes = unique(parsed.mentions.map((m) => m.item?.scope)).filter((s) => s && s !== 'repair' && s !== 'waste');
  if (idleScopes.length === 1) return idleScopes[0];
  if (idleScopes.length >= 2) return 'combined';
  if (spaces.has('bathroom')) return 'bathroom';
  if (spaces.has('kitchen')) return 'kitchen';
  return 'unclassified';
}

// ── 규모 ─────────────────────────────────────────────────
function chooseSize(trade, parsed, ops, mode) {
  const f = parsed.facts;
  const tradeOps = ops.filter((o) => o.scope === trade || o.itemScope === trade);
  const pick = (itemIds, unitMap) => {
    for (const id of itemIds) {
      const op = tradeOps.find((o) => o.itemId === id && o.qty > 0);
      if (op) return { value: op.qty, unit: unitMap || UNIT_TO_SIZE[op.unit] || op.unit };
    }
    return null;
  };
  if (mode === 'labor') {
    const people = f.people || 1;
    return { value: people, unit: '명' };
  }
  if (trade === 'demolition') {
    // 부분 철거는 품목 수량이 규모, 전체 철거는 평수
    const partial = parsed.ops.some((o) => o.action === 'remove' && o.itemId !== 'whole' && itemById(o.itemId)?.partialId);
    if (partial && !f.wholeStrip) {
      if (f.pyung > 0) return { value: f.pyung, unit: '평' };
      const items = partialItems(parsed);
      const units = unique(items.map((i) => i.unit));
      if (units.length === 1) {
        const total = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
        return { value: Math.round(total * 10) / 10, unit: units[0] };
      }
      return { value: '', unit: '모름' };
    }
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
    return { value: '', unit: '평' };
  }
  if (trade === 'bathroom') {
    const kans = f.baths || pick(['bathroom'])?.value || 1;
    return { value: kans, unit: '칸' };
  }
  if (trade === 'kitchen') {
    const m = pick(['sink', 'counter', 'cabinet']);
    if (m && m.unit === 'm') return m;
    if (f.pyung > 0 && /주방|부엌/.test(f.text) === false) return { value: f.pyung, unit: '평' };
    return { value: 3.2, unit: 'm' };
  }
  if (trade === 'wallpaper') {
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    const op = pick(['wallpaper', 'floor', 'woodFloor', 'decoTile', 'epoxy']);
    if (op && op.unit === '평') return op;
    if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
    return { value: 24, unit: '평' };
  }
  if (trade === 'tilewaterproof' || trade === 'plaster' || trade === 'window' || trade === 'film' || trade === 'groundwork') {
    const op = tradeOps.find((o) => o.qty > 0 && ['㎡', '평', 'm'].includes(o.unit));
    if (op) return { value: op.qty, unit: op.unit };
    if (trade === 'film') {
      if (f.pyung > 0) return { value: f.pyung, unit: '평' };
      return { value: '', unit: '㎡', resolved: true };
    }
    if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    const def = DEFAULT_SCALE[trade];
    return { value: def.value, unit: def.unit };
  }
  if (trade === 'electric' || trade === 'plumbing') {
    const op = pick(trade === 'electric' ? ['light', 'outlet', 'panel'] : ['pipe', 'faucet']);
    if (op && op.value > 0) return { value: op.value, unit: '개소' };
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    return { value: 1, unit: '개소' };
  }
  if (trade === 'repair') {
    if (f.pyung > 0 && /도장|페인트|도색|탄성|발수|코팅|벽|천장/.test(f.text)) return { value: f.pyung, unit: '평' };
    if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
    const mesh = ops.find((o) => o.itemId === 'mosquito' && o.qty > 0);
    if (mesh) return { value: mesh.qty, unit: '개소' };
    const doorQty = f.doors || ops.find((o) => o.itemId === 'door' && o.qty > 0)?.qty;
    if (doorQty) return { value: doorQty, unit: '개소' };
    const anyQty = ops.find((o) => o.qty > 0 && o.action !== 'remove');
    if (anyQty) return { value: anyQty.qty, unit: '개소' };
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    return { value: 1, unit: '개소' };
  }
  if (trade === 'waste') {
    if (f.tons > 0) return { value: f.tons, unit: '톤' };
    if (f.halfTruck) return { value: 0.5, unit: '톤' };
    return { value: '', unit: '톤' };
  }
  if (trade === 'carpentry') {
    const part = parsePartition(parsed);
    if (part.meters) return { value: part.meters, unit: 'm' };
    const op = ops.find((o) => ['partition', 'insulation', 'molding'].includes(o.itemId) && o.qty > 0);
    if (op) return { value: op.qty, unit: op.unit === 'm' ? 'm' : 'm' };
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    return { value: '', unit: 'm' };
  }
  if (trade === 'combined') {
    if (f.pyung > 0) return { value: f.pyung, unit: '평' };
    if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
    return { value: '', unit: '평' };
  }
  if (f.pyung > 0) return { value: f.pyung, unit: '평' };
  if (f.sqm > 0) return { value: f.sqm, unit: '㎡' };
  return { value: '', unit: '평' };
}

// 가벽(경량벽체) 길이·룸 수 — "8m 가벽으로 룸3개"
export function parsePartition(parsed) {
  const t = parsed.text;
  const meters = (/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*[2²])/.exec(t) || [])[1];
  const rooms = (/(?:룸|방)\s*(\d+)\s*(?:개|칸)/.exec(t) || [])[1];
  const doors = (/(?:문|도어)\s*(\d+)\s*(?:개|짝|틀)/.exec(t) || [])[1];
  return { meters: meters ? parseFloat(meters) : 0, rooms: rooms ? Number(rooms) : 0, doors: doors ? Number(doors) : 0 };
}

// ── 부분 철거 품목 ────────────────────────────────────────
const PARTIAL_DEFAULT = {
  sign: { qty: 1, unit: '개' }, sink: { qty: 1, unit: '개' }, builtin: { qty: 1, unit: '개' }, aircon: { qty: 1, unit: '대' },
  airconOutdoor: { qty: 1, unit: '대' }, partition: { qty: 3, unit: 'm' }, window: { qty: 1, unit: '짝' }, ceiling: { qty: 5, unit: '평' },
  deck: { qty: 1, unit: '식' }, furniture: { qty: 1, unit: '개' }, floor: { qty: 10, unit: '평' }, decoTile: { qty: 10, unit: '평' },
  woodFloor: { qty: 10, unit: '평' }, wallpaper: { qty: 15, unit: '평' }, bathroom: { qty: 1, unit: '칸' }, shelf: { qty: 1, unit: '개' },
  door: { qty: 1, unit: '개' },
};

const ROOM_WORDS = /안방|거실|방\s*\d|방\s*하나|화장실|욕실|부엌|주방|베란다|발코니|현관|샷시|창호|싱크대|씽크대|선반|붙박이|문짝|에어컨|간판/;
const AREA_ONLY_ITEMS = ['floor', 'wallpaper', 'woodFloor', 'decoTile', 'ceiling'];

function partialItems(parsed) {
  const out = [];
  const seen = new Set();
  const ids = parsed.ops.filter((o) => o.action === 'remove').map((o) => itemById(o.itemId)?.partialId).filter(Boolean);
  const allArea = ids.length > 0 && ids.every((id) => AREA_ONLY_ITEMS.includes(id));
  const wholePhrase = /원상복구|올\s*철거|전체\s*해체|전부\s*철거/.test(parsed.text) || (/전체\s*철거/.test(parsed.text) && !allArea);
  if (wholePhrase) return [];
  // 개수까지 적어 준 물건(붙박이장 3개·샷시 2짝)은 그 물건만 뜯는 현장이다
  const countedObject = parsed.ops.some(
    (o) => o.action === 'remove' && o.qty > 0 && !AREA_ONLY_ITEMS.includes(itemById(o.itemId)?.partialId) && ['개', '대', '짝', 'm', '칸', '틀'].includes(o.unit)
  );
  // '학원 25평 칸막이 철거'처럼 장소+평수만 있고 방 이름이 없으면 건물 전체 철거다
  if (parsed.facts.pyung >= 6 && !ROOM_WORDS.test(parsed.text) && !allArea && !countedObject) return [];
  // 실외기를 뜯으면 벽걸이를 따로 세지 않는다
  const hasOutdoor = ids.includes('airconOutdoor');
  parsed.ops.forEach((o) => {
    if (o.action !== 'remove') return;
    const def = itemById(o.itemId);
    if (!def?.partialId) return;
    if (hasOutdoor && def.partialId === 'aircon') return;
    if (seen.has(def.partialId)) return;
    seen.add(def.partialId);
    const base = PARTIAL_DEFAULT[def.partialId] || { qty: 1, unit: '개' };
    // 문장에 적힌 수량만 쓴다 — 없으면 품목 표의 기본 수량
    let qty = o.qty > 0 ? o.qty : base.qty;
    // '칸막이 6개'는 6m가 아니라 칸막이 여섯 면(1면 3m)이다
    if (def.partialId === 'partition' && o.qty > 0 && o.unit === '개') qty = o.qty * 3;
    // 샷시는 '몇 짝'으로 센다 — 24평 같은 면적 숫자를 창 개수로 읽지 않는다
    if (def.partialId === 'window' && !(o.qty > 0 && ['짝', '개'].includes(o.unit))) qty = base.qty;
    // "거실·안방 샷시" — 창은 방·베란다마다 하나씩이다
    if (def.partialId === 'window' && !(o.qty > 0 && ['짝', '개'].includes(o.unit))) {
      const rooms = (parsed.text.match(/거실|안방|작은방|큰방|아이방|베란다|발코니/g) || []).length;
      if (rooms > 1) qty = Math.min(6, rooms);
    }
    out.push({ id: def.partialId, qty: Math.round(qty * 10) / 10, unit: base.unit });
  });
  return out;
}

function itemUnitOfPartial(id) {
  const map = {
    sign: '개', sink: '개', builtin: '개', aircon: '대', airconOutdoor: '대', partition: 'm', window: '짝',
    ceiling: '평', deck: '식', furniture: '개', floor: '평', decoTile: '평', woodFloor: '평', wallpaper: '평',
    bathroom: '칸', shelf: '개', door: '개',
  };
  return map[id] || '개';
}

// ── 세부 공종(복합) ──────────────────────────────────────
const SUB_SCOPE_OF = {
  demolition: 'demolition',
  wallpaper: 'wallpaper',
  bathroom: 'bathroom',
  kitchen: 'kitchen',
  tilewaterproof: null, // 타일·방수는 복합 세부 칩이 없다 — 필요하면 별도 공종
  plaster: 'plaster',
  carpentry: 'carpentry',
  electric: 'electric',
  plumbing: null,
  film: 'film',
  paint: 'paint',
  window: 'window',
  groundwork: 'groundwork',
  waste: 'demolition',
};

const FULL_PACKAGE = ['demolition', 'wallpaper', 'floor', 'bathroom', 'kitchen', 'entrance', 'plaster'];
function subScopesOf(parsed, trade) {
  const scopes = parsed.facts.fullInterior ? [...FULL_PACKAGE] : [];
  parsed.ops.forEach((o) => {
    if (o.action === 'remove') {
      scopes.push('demolition');
      const base = o.baseScope || o.itemScope;
      if (base && ['groundwork', 'electric', 'plumbing', 'plaster', 'carpentry'].includes(base)) scopes.push(SUB_SCOPE_OF[base] || null);
      return;
    }
    else if (o.scope === 'wallpaper') {
      // 바닥만 새로 까는 일과 도배를 나눈다
      if (['floor', 'woodFloor', 'decoTile', 'epoxy'].includes(o.itemId)) scopes.push('floor');
      else scopes.push('wallpaper');
    } else if (o.scope === 'repair') scopes.push('paint');
    else scopes.push(SUB_SCOPE_OF[o.scope] || null);
  });
  parsed.mentions.forEach((m) => {
    if (m.item?.id === 'entrance' || m.item?.id === 'showcase') scopes.push('entrance');
  });
  if (/현관|중문|신발장/.test(parsed.text)) scopes.push('entrance');
  if (/바닥|장판|마루|데코타일/.test(parsed.text)) scopes.push('floor');
  const out = unique(scopes);
  return out;
}

export function buildJobSpec(rawText, { sheet = null, signals = null } = {}) {
  const text = String(rawText || '');
  const parsed = parseText(text);
  const sig = signals || {};
  const mode = detectMode(parsed, sig, parsed.text);
  let trade = chooseTrade(parsed, mode, parsed.text);
  const f = parsed.facts;

  // '올수리'는 전체 인테리어다 — 단 "욕실 올수리"처럼 한 공간만 새로 하는 말이면 아니다
  if (!f.fullInterior && /올\s*수리|올수리|리모델링/.test(parsed.text) && !/욕실\s*(?:1|한|두|2)|화장실\s*(?:1|한|두|2)|주방\s*만|부엌\s*만/.test(parsed.text)) {
    f.fullInterior = true;
    if (trade === 'unclassified') trade = 'combined';
  }

  // 가벽(경량벽체) 요청 — 뜯는 말이 없으면 목공 현장이다
  const partInfo = parsePartition(parsed);
  const wantsPartition = /가벽|칸막이|경량\s*벽체|경량벽체|룸\s*(?:만들|나누)|방\s*(?:만들|나누)/.test(parsed.text);
  const removingPartition = parsed.ops.some((o) => o.itemId === 'partition' && o.action === 'remove');
  if (wantsPartition && !removingPartition && ['unclassified', 'demolition', 'carpentry'].includes(trade)) trade = 'carpentry';
  if (sig.partition && !sig.removal && ['unclassified', 'demolition', 'carpentry'].includes(trade)) trade = 'carpentry';

  // 욕실 한 칸을 올수리하며 타일·방수·도기를 말한 것은 복합이 아니라 욕실 공사다
  if (trade === 'combined' && f.baths > 0 && /욕실|화장실/.test(parsed.text)) {
    const scopes = unique(parsed.ops.map((o) => (o.action === 'remove' ? 'demolition' : o.scope)));
    const bathFamily = scopes.every((sc) => ['bathroom', 'tilewaterproof', 'demolition', 'plumbing', 'repair'].includes(sc));
    if (bathFamily && scopes.some((sc) => sc === 'bathroom' || sc === 'tilewaterproof')) trade = 'bathroom';
  }

  // 누수로 천장을 뜯는 일은 평수 철거가 아니라 부분 수선이다
  if (['demolition', 'combined', 'repair'].includes(trade) && /누수|물\s*(?:이|가|좀)?\s*새/.test(parsed.text) && /천장/.test(parsed.text) && !f.pyung && !f.sqm) {
    trade = 'repair';
  }
  let size = chooseSize(trade, parsed, parsed.ops, mode);
  const isPartialDemo = trade === 'demolition' && !f.wholeStrip && parsed.ops.some((o) => o.action === 'remove' && itemById(o.itemId)?.partialId);
  if (!size.value && !size.resolved && trade !== 'unclassified' && trade !== 'waste' && !isPartialDemo) {
    const def = DEFAULT_SCALE[trade];
    if (def && !['carpentry', 'electric', 'plumbing', 'repair'].includes(trade)) size = { value: def.value, unit: def.unit, defaulted: true };
  }

  const subScopes = subScopesOf(parsed, trade);
  // 뜯는 품목이 정해져 있으면 부분 철거다 — '전체 철거'라는 말이 붙어도
  // 마감재 한 가지만(장판·데코타일·텍스)이면 그 면적만 뜯는 현장이다.
  const partial = trade === 'demolition' ? partialItems(parsed) : [];
  const demoOnly = isDemoOnlyText(parsed.text);

  // 현장 성격
  const place = PLACES.commercial.test(parsed.text) ? 'commercial' : PLACES.residential.test(parsed.text) ? 'residential' : '';

  return {
    mode,
    trade,
    tradeLabel: SCOPE_LABEL[trade] || '',
    size,
    parsed,
    facts: f,
    partial,
    subScopes,
    demoOnly,
    place,
    partition: wantsPartition ? partInfo : null,
    // 설정 스위치·문서가 쓰는 플래그
    flags: {
      fullInterior: f.fullInterior,
      wholeStrip: f.wholeStrip,
      structural: f.structural,
      silk: f.silk,
      floorThick: f.floorThick,
      tile600: f.tile600,
      american: f.american,
      paintElastic: f.paintElastic,
      paintWater: f.paintWater,
      paintWall: f.paintWall,
      paintCeiling: f.paintCeiling,
      hood: f.hood,
      epoxy: f.epoxy,
      centralDoor: /중문|3연동/.test(parsed.text),
      mosquito: /방충망/.test(parsed.text),
      tileRemain: /덧방/.test(parsed.text),
      counterOnly: parsed.ops.some((o) => o.itemId === 'counter' && o.only),
      sinkOnly: parsed.ops.every((o) => o.itemId !== 'sink') && parsed.ops.some((o) => o.itemId === 'counter'),
      insulation: /이보드|단열|결로/.test(parsed.text),
      heating: /난방/.test(parsed.text),
      tileWithPlaster: /미장/.test(parsed.text) && /타일/.test(parsed.text),
    },
  };
}
