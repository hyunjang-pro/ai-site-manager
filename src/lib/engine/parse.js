// 문장 → 일(work) 단위 구조.
// ─────────────────────────────────────────────────────────────
// 1) 절을 나누고 (text.js)
// 2) 절 안에서 품목·동작·수량을 찾아 **서로 짝짓는다** (이 파일)
// 3) 짝지은 일을 공종으로 올린다 (jobspec.js)
//
// 핵심은 '한 낱말이 공종을 독식하지 않게' 하는 것이다.
//  · 동작(도장·도배·필름·방수·철거)이 자기 공종을 들고 온다 → "문짝 도장"은 목공이 아니라 도장
//  · 품목은 authority(공종 지목 강도)가 가장 높은 하나만 공종을 정한다 → "주방 벽 타일"은 주방이 아니라 타일
//  · 도장·필름·코킹은 **표면** 공사다 — 그 대상(문짝·샷시·싱크대)은 별도 공종이 아니라 대상일 뿐
//  · 수량 단위가 공종을 좁힌다 → "욕실 1칸 타일"은 욕실(칸) · "욕실 타일 20㎡"는 타일(㎡)
import { ITEMS, SPACES, PLACES, itemById } from './lexicon.js';
import { normalizeText, normalizeNumerals, clauseSpans, findQuantities, korDays } from './text.js';

// 동작 낱말 — 자기 공종을 들고 오는 것(scope 있음)과 품목에 붙는 일반 동작으로 나눈다.
const ACTION_LEXICON = [
  { key: 'remove', scope: 'demolition', re: /철거|해체|제거|뜯|떼어|떼|까\s*내|깨|부수|부숴|분해|비우|비워|치우|치워|치울|버리|버려|빼\s*주|없애|없앨|반출|수거|걷어|뜯어/ },
  { key: 'wallpaper', scope: 'wallpaper', re: /도배/ },
  { key: 'paint', scope: 'paint', re: /도장|도색|페인트|탄성\s*코트|탄성코트|코팅|발수/ },
  { key: 'film', scope: 'film', re: /필름|시트지|래핑|리폼/ },
  { key: 'waterproof', scope: 'tilewaterproof', re: /방수|담수/ },
  { key: 'repair', scope: 'repair', re: /수선|보수|코킹|실리콘|메꾸|때우|막아|조정|조절|잡아/ },
  { key: 'install', scope: null, re: /설치|시공|교체|갈아|바꾸|새로|새\s*(?:장판|마루|벽지|타일|샷시|창|문|도기|싱크대|바닥|데코타일|조명|필름)|신규|깔아|깔기|깔아주|깔|붙이|붙여|바르|만들|세우|확장|증설|추가|보강|덧방|올리|내리|씌우|씌워|뽑아/ },
];

// 표면 공사 — 이 동작이 붙은 다른 품목은 별도 공종이 아니라 대상이다
const SURFACE_SCOPES = new Set(['film', 'paint', 'repair']);
// 동작 이름과 같은 품목 (도장·필름·코킹은 그 자체가 일이다)
const SELF_WORK = { paint: 'paint', film: 'film', caulk: 'repair', repair: 'repair', wallpaper: 'wallpaper', waterproof: 'tilewaterproof' };
// 표면이 될 수 없는 품목 — 바닥·타일·벽지·미장·전기·배관은 그 자체가 공정이다
const NOT_SURFACE = new Set(['wallpaper', 'floor', 'woodFloor', 'decoTile', 'epoxy', 'tile', 'waterproof', 'plaster', 'groundwork', 'light', 'outlet', 'panel', 'pipe', 'waste', 'labor', 'bathroom']);

// ── 부정·제외 먼저 걷어내기 ────────────────────────────────
function findExclusions(text) {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const spans = [];
  const removed = [];
  const pushSpan = (m) => { if (m) spans.push({ start: m.index, end: m.index + m[0].length }); };
  const removalNeg = /(철거|해체|제거)\s*(?:는|은|를)?\s*(?:안\s*하|하지\s*마|하지\s*않|안\s*함|빼|제외|불필요)/g;
  let m;
  while ((m = removalNeg.exec(t))) { pushSpan(m); removed.push('철거'); }
  const windowNeg = /창호[^.\n]{0,45}?(?:안\s*해|안해|안\s*하|제외|불필요|빼|하지\s*않)|창호\s*제외/g;
  const excludedScopes = [];
  while ((m = windowNeg.exec(t))) { pushSpan(m); excludedScopes.push('window'); }
  return { spans, removed, excludedScopes };
}

function inSpans(pos, spans) {
  return spans.some((s) => pos >= s.start && pos <= s.end);
}

// ── 품목 찾기 (겹치면 긴 낱말 우선) ────────────────────────
function findMentions(text, actions = []) {
  const raw = [];
  for (const item of ITEMS) {
    const re = new RegExp(item.terms.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      raw.push({ itemId: item.id, start: m.index, end: m.index + m[0].length, len: m[0].length, text: m[0] });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  raw.sort((a, b) => a.start - b.start || b.len - a.len);
  const kept = [];
  for (const m of raw) {
    if (kept.some((k) => m.start < k.end && k.start < m.end)) continue; // 겹치는 짧은 낱말은 버린다
    kept.push(m);
  }
  // 붙어 있는 같은 품목('텍스' + '천장 철거')은 한 번으로 센다
  const merged = [];
  kept.sort((a, b) => a.start - b.start).forEach((m) => {
    const prev = merged[merged.length - 1];
    const swallowsAction = actions.some((a) => a.start < m.end && a.end > prev?.end);
    if (prev && prev.itemId === m.itemId && m.start - prev.end <= 2 && !swallowsAction && !/[·,+\/]/.test(text.slice(prev.end, m.start))) {
      prev.end = Math.max(prev.end, m.end);
      prev.len = prev.end - prev.start;
      prev.text = text.slice(prev.start, prev.end);
      return;
    }
    merged.push({ ...m });
  });
  return merged;
}

function findActions(text, excludedSpans) {
  const out = [];
  for (const def of ACTION_LEXICON) {
    const re = new RegExp(def.re.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex += 1; continue; }
      if (inSpans(m.index, excludedSpans)) continue;
      // '철거랑 부지 정지' — 동작 뒤에 접속 조사가 붙으면 뒤 품목에 걸리는 말이 아니다
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 3);
      out.push({ key: def.key, scope: def.scope, start: m.index, end: m.index + m[0].length, text: m[0], closesHere: /^\s*(?:랑|이랑|와|과)\s/.test(tail) || /^\s*(?:랑|이랑)\b/.test(tail) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// 한 품목에 붙는 동작 — 품목 뒤쪽(한국어는 동사가 뒤)을 먼저 보고, 없으면 앞쪽을 본다.
function bindAction(mention, clause, actions) {
  const inClause = actions.filter((a) => a.start >= clause.start && a.end <= clause.end);
  // 품목 이름 자체가 동작인 경우 (도배·필름·페인트·방수) — 같은 자리에 겹쳐 있으면 그 동작이다
  const self = inClause.find((a) => a.start <= mention.start + 1 && a.end >= mention.end - 1);
  if (self) return self;
  const after = inClause.filter((a) => a.start >= mention.end - 1 && !a.closesHere).sort((a, b) => a.start - b.start);
  const before = inClause.filter((a) => a.end <= mention.start + 1 && !a.closesHere).sort((a, b) => b.start - a.start);
  const near = (list, limit) => list.find((a) => Math.abs(a.start - mention.end) <= limit || Math.abs(mention.start - a.end) <= limit);
  return near(after, 12) || near(before, 12) || after[0] || before[0] || null;
}

// 수량 짝짓기 — 품목과 단위가 맞는 숫자를 가장 가까운 것부터.
const UNIT_ALIASES = {
  평: ['평'],
  '㎡': ['㎡', '평'],
  m: ['m'],
  칸: ['칸', '개'],
  개: ['개', '짝', '대', '개소', '식'],
  개소: ['개', '개소', '곳'],
  짝: ['짝', '개'],
  대: ['대', '개'],
  명: ['명'],
  톤: ['톤', '차'],
  일: ['일'],
  식: ['식'],
};

function pickQuantity(mention, clause, quantities, mentions) {
  const allowed = UNIT_ALIASES[itemById(mention.itemId)?.unit] || ['개'];
  const inClause = quantities.filter((q) => q.start >= clause.start && q.end <= clause.end && !q.floor);
  const grade = (q) => (allowed.includes(q.unit) ? 0 : 1);
  const dist = (q) => (q.end <= mention.start ? mention.start - q.end : q.start - mention.end);
  // 다른 품목에 더 가까운 숫자는 그 품목 몫이다
  const ownedBy = (q) => {
    let best = null;
    for (const m of mentions) {
      if (m === mention) continue;
      const d = m.end <= q.start ? q.start - m.end : m.start - q.end;
      if (!best || d < best.d) best = { m, d };
    }
    return best && best.d < dist(q) * 0.6 ? best.m : null;
  };
  const candidates = inClause
    .filter((q) => !ownedBy(q))
    .map((q) => ({ q, grade: grade(q), dist: dist(q) }))
    .filter((c) => c.grade === 0 || (c.dist <= 10 && !['평', '㎡', '톤', '층', '명', '일', 'm'].includes(c.q.unit)))
    .sort((a, b) => a.grade - b.grade || a.dist - b.dist);
  if (!candidates.length) return null;
  const { q } = candidates[0];
  return { value: q.value, unit: q.unit, key: q.key };
}

// ── 절 하나 해석 ──────────────────────────────────────────
function resolveClause(clause, ctx) {
  const { mentions, actions, quantities, spaces, allSpaceIds, allMentions } = ctx;
  const cMentions = mentions.filter((m) => m.start >= clause.start && m.end <= clause.end);
  const cActions = actions.filter((a) => a.start >= clause.start && a.end <= clause.end);
  const spaceIds = spaces.filter((s) => s.start >= clause.start && s.end <= clause.end).map((s) => s.id);

  const resolved = cMentions.map((mItem) => {
    const item = itemById(mItem.itemId);
    const action = bindAction(mItem, clause, actions);
    const qty = pickQuantity(mItem, clause, quantities, cMentions);
    const tail = clause.text.slice(mItem.end - clause.start, mItem.end - clause.start + 8);
    const head = clause.text.slice(Math.max(0, mItem.start - clause.start - 6), mItem.start - clause.start);
    const only = /^\s*(?:만|만큼)/.test(tail) || /(?:만)\s*$/.test(head) || item.onlyTerm?.test(clause.text);
    const until = /까지|도\s|까지도/.test(tail);
    return {
      ...mItem,
      item,
      action: action ? action.key : null,
      actionScope: action ? action.scope : null,
      actionStart: action ? action.start : -1,
      actionText: action ? action.text : '',
      qty: qty ? qty.value : 0,
      qtyUnit: qty ? qty.unit : item.unit,
      only,
      until,
      spaceId: spaceIds[0] || null,
      clauseText: clause.text,
    };
  });

  // 공종 후보 — 동작이 들고 온 공종 > 품목 공종
  resolved.forEach((r) => {
    r.scopeCandidate = r.actionScope || r.item.scope;
    r.authority = r.actionScope ? 3 : r.item.authority;
  });

  // 바닥·타일·벽지·전기·배관은 그 자체가 공정이다 — 옆 동작(도배·교체)이 공종을 바꾸지 않는다
  resolved.forEach((r) => {
    const otherBetween = cMentions.some((m) => {
      if (m === r) return false;
      if (r.actionStart >= 0 && r.actionStart < r.start) return m.start >= r.actionStart && m.end <= r.start;
      if (r.actionStart > r.end) return m.start >= r.end && m.end <= r.actionStart;
      return false;
    });
    if (NOT_SURFACE.has(r.item.id) && r.action && r.action !== 'remove' && r.actionScope && r.item.scope !== r.actionScope && otherBetween) {
      r.scopeCandidate = r.item.scope;
      r.authority = 3;
      r.action = 'install';
      r.actionScope = null;
    }
  });

  // 단위·장소로 뜻을 좁힌다 (범위 한정자)
  resolved.forEach((r) => {
    const inBath = spaceIds.includes('bathroom') || allSpaceIds.has('bathroom') || r.spaceId === 'bathroom' || cMentions.some((m) => m.itemId === 'bathroom');
    const inKitchen = spaceIds.includes('kitchen') || r.spaceId === 'kitchen' || allSpaceIds.has('kitchen') || allMentions.some((m) => m.itemId === 'sink');
    const kanUnit = r.qty > 0 && (r.qtyUnit === '칸' || (r.qtyUnit === '개' && r.item.id === 'bathroom'));
    const sqmUnit = r.qty > 0 && r.qtyUnit === '㎡';
    // 욕실 '칸' 단위면 욕실 공사 — '욕실 1칸 타일만'은 타일 면적 공사가 아니다
    if (inBath && ['tile', 'waterproof', 'toilet', 'basin', 'faucet'].includes(r.item.id) && kanUnit && !sqmUnit) {
      r.scopeCandidate = 'bathroom';
      r.authority = 4;
    }
    // 욕실 문맥의 타일·방수에 면적이 없으면 욕실 한 칸 공사다 ("욕실 타일 철거하고 새 타일")
    if (inBath && ['tile', 'waterproof'].includes(r.item.id) && !sqmUnit && !(r.qty > 0)) {
      r.scopeCandidate = 'bathroom';
      r.authority = 4;
    }
    // 주방 싱크대를 갈면서 타일을 말하면 그 타일은 주방 공사의 일부다 (면적을 적었으면 타일 공사)
    if (inKitchen && r.item.id === 'tile' && !sqmUnit && allMentions.some((m) => ['sink', 'counter', 'cabinet'].includes(m.itemId))) {
      r.scopeCandidate = 'kitchen';
      r.authority = 3;
    }
    // 주방 + 타일(면적) = 타일 공사 (싱크대·상판이 함께 말해지지 않았을 때)
    if (inKitchen && r.item.id === 'tile' && sqmUnit) {
      r.scopeCandidate = 'tilewaterproof';
      r.authority = 4;
    }
    // 수전·배관이 함께 나오면 세면대·변기도 그 배관 공사의 대상이다 ("세면대 수전 교체")
    if (['basin', 'toilet'].includes(r.item.id) && allMentions.some((m) => ['faucet', 'pipe'].includes(m.itemId))) {
      r.scopeCandidate = 'plumbing';
      r.authority = 1;
    }
    // 기초·맨땅과 함께 말한 데크는 목공이 아니라 토목 구조물이다
    if (r.item.id === 'deck' && allMentions.some((m) => m.itemId === 'groundwork')) {
      r.scopeCandidate = 'groundwork';
      r.authority = 1;
    }
    // 후드·덕트는 타일과 함께 말하면 타일 공사의 부속이다 ("주방 후드랑 타일")
    if (r.item.id === 'hood' && (allMentions.some((m) => m.itemId === 'tile') || /타일/.test(clause.text))) {
      r.scopeCandidate = 'tilewaterproof';
      r.authority = 1;
    }
    // 배관·수도가 함께 나오면 싱크대는 배관 공사의 대상이다 ("싱크대 수전 배관 교체")
    if (['sink', 'counter'].includes(r.item.id) && cMentions.some((m) => ['pipe', 'faucet'].includes(m.itemId))) {
      r.scopeCandidate = 'plumbing';
      r.authority = 1;
    }
    // 가벽과 함께 말한 문은 목공이다
    if (r.item.id === 'door' && allMentions.some((m) => m.itemId === 'partition')) {
      r.scopeCandidate = 'carpentry';
      r.authority = 3;
    }
    // '욕실 타일 20㎡' — 면적으로 말한 타일·방수가 있으면 욕실은 장소일 뿐이다
    if (r.item.id === 'bathroom' && resolved.some((m) => m !== r && ['tile', 'waterproof'].includes(m.item.id) && m.qty > 0 && m.qtyUnit === '㎡')) {
      r.contextOnly = true;
    }
    // 욕실 올수리 문맥의 도기·수전은 욕실 공사로 묶는다
    if (inBath && ['toilet', 'basin', 'faucet'].includes(r.item.id) && /올\s*수리|리모델링|전체|인테리어|도기/.test(clause.text)) {
      r.scopeCandidate = 'bathroom';
      r.authority = 3;
    }
  });

  // 욕실 도기·수전만 갈아 끼우는 일은 욕실 올수리가 아니라 부분 수선이다
  const fixtureItems = resolved.filter((r) => !['bathroom', 'repair', 'caulk'].includes(r.item.id));
  const onlyFixtures = fixtureItems.length > 0 && fixtureItems.every((r) => ['toilet', 'basin', 'faucet'].includes(r.item.id));
  const remodelWords = /올\s*수리|리모델링|인테리어|전체|타일|방수|철거|도기/.test(clause.text);
  if (onlyFixtures && !remodelWords) {
    fixtureItems.forEach((r) => {
      r.scopeCandidate = r.item.id === 'faucet' ? 'plumbing' : 'repair';
      r.authority = 3;
    });
    resolved.filter((r) => r.item.id === 'bathroom').forEach((r) => { r.contextOnly = true; });
  }

  return { clause, mentions: resolved, actions: cActions, spaceIds };
}

export function parseText(rawInput = '') {
  const text = normalizeText(rawInput);
  const normalized = normalizeNumerals(text);
  const { spans: exclusions, removed, excludedScopes } = findExclusions(normalized);
  const clauses = clauseSpans(normalized);
  const actions = findActions(normalized, exclusions);
  const mentions = findMentions(normalized, actions).filter((m) => !inSpans(m.start, exclusions));
  const quantities = findQuantities(normalized);
  const spaces = [];
  for (const sp of SPACES) {
    const re = new RegExp(sp.terms.source, 'g');
    let m;
    while ((m = re.exec(normalized))) spaces.push({ id: sp.id, label: sp.label, start: m.index, end: m.index + m[0].length });
  }
  spaces.sort((a, b) => a.start - b.start);

  const allSpaceIds = new Set(spaces.map((s) => s.id));
  // 욕실 문맥은 문서 전체로 본다 — "욕실 타일 철거하고 / 새 타일 시공"처럼 절이 나뉘어도 같은 현장이다
  const ctx = { mentions, actions, quantities, spaces, allSpaceIds, allMentions: mentions };
  const clauseResults = clauses.map((c) => resolveClause({ ...c, text: normalized.slice(c.start, c.end) }, ctx));

  // 동작이 없는 절은 이웃 절의 동작을 물려받는다 ("부엌 선반" + "씽크대 철거")
  clauseResults.forEach((cr, i) => {
    if (cr.actions.length) return;
    const next = clauseResults[i + 1];
    const prev = clauseResults[i - 1];
    const inherit = next && next.actions.length ? next.actions[0] : prev && prev.actions.length ? prev.actions[prev.actions.length - 1] : null;
    cr.inherited = inherit;
    cr.mentions.forEach((r) => {
      if (!r.action && inherit) {
        r.action = inherit.key;
        r.actionScope = inherit.scope;
        r.actionStart = inherit.start;
        r.actionText = inherit.text;
        r.inheritedAction = true;
      }
    });
  });

  // ── 일(work)로 올리기 ──────────────────────────────────
  const ops = [];
  const surfaces = [];
  const boundActions = new Set();
  clauseResults.forEach((cr) => {
    const clauseAction = cr.actions[0] || cr.inherited || null;
    const surfaceOp = clauseAction && SURFACE_SCOPES.has(clauseAction.scope) ? clauseAction : null;
    cr.mentions.forEach((r) => {
      if (r.contextOnly) { surfaces.push({ itemId: r.item.id, label: r.item.label, scope: r.scopeCandidate, qty: r.qty, unit: r.qtyUnit, contextOnly: true }); return; }
      const act = r.action;
      if (!act) {
        // 동작이 아예 없는 문장 — 시공 품목이면 '새로 한다'로 본다 (도배·장판·타일·필름·욕실 올수리)
        if ((r.item.install || r.item.defaultAction) && !clauseAction) {
          ops.push(opOf(r, r.item.defaultAction || 'install', r.item.scope === 'waste' ? 'waste' : r.scopeCandidate, cr));
        } else if (clauseAction) {
          // 코킹·필름처럼 동작 이름이 곧 품목인 것은 그 동작의 일이다 ("샷시 실리콘 코킹")
          if (r.item.id === 'caulk' && clauseAction.scope === 'repair') {
            ops.push(opOf(r, 'install', 'repair', cr));
            return;
          }
          // 같은 절에 동작이 있어도, 그 품목이 '표면'이 아니라 진짜 공정이면 일로 올린다 (… 도배 장판 욕실 1칸)
          if (NOT_SURFACE.has(r.item.id)) {
            ops.push(opOf(r, 'install', r.scopeCandidate, cr));
          } else {
            surfaces.push({ itemId: r.item.id, label: r.item.label, scope: r.scopeCandidate, qty: r.qty, unit: r.qtyUnit });
          }
        }
        return;
      }
      // 물려받은 동작은 원래 절의 품목 몫이다 — 여기서 '묶였다'고 표시하면
      // 앞 절의 '철거'가 통째 철거로 잡히지 않는다 ("철거 + 부지 정지")
      if (r.actionStart >= 0 && !r.inheritedAction) boundActions.add(r.actionStart);
      // 도장·필름·코킹 대상은 별도 공종이 아니라 표면이다 ("문짝 도장" = 도장, "샷시 필름" = 필름)
      if (r.actionScope && SELF_WORK[r.item.id] === r.actionScope) {
        ops.push(opOf(r, 'install', r.actionScope, cr));
        return;
      }
      if (r.actionScope && SURFACE_SCOPES.has(r.actionScope) && !NOT_SURFACE.has(r.item.id)) {
        surfaces.push({ itemId: r.item.id, label: r.item.label, scope: r.actionScope, qty: r.qty, unit: r.qtyUnit });
        return;
      }
      // 표면 동작이 바닥·타일 같은 공정 품목에 잘못 붙었으면 그 품목 자기 공종의 시공으로 되돌린다
      if (r.actionScope && SURFACE_SCOPES.has(r.actionScope) && NOT_SURFACE.has(r.item.id)) {
        ops.push(opOf(r, 'install', r.item.scope, cr));
        return;
      }
      // 표면 공사(도장·필름)는 공종당 한 줄로 모은다 — '샷시 문짝 싱크대 필름'이 세 줄이 되지 않게
      if (surfaceOp && r.actionStart === surfaceOp.start && ops.some((o) => o.action === surfaceOp.key && o.scope === surfaceOp.scope)) {
        surfaces.push({ itemId: r.item.id, label: r.item.label, scope: surfaceOp.scope, qty: r.qty, unit: r.qtyUnit });
        return;
      }
      const scope = act === 'remove' ? (r.item.scope === 'waste' ? 'waste' : 'demolition') : r.actionScope || r.scopeCandidate;
      ops.push(opOf(r, act, scope, cr));
    });
  });

  // ── 장소만 말한 시공 ───────────────────────────────────
  // "주방 전면 교체"·"욕실 리모델링"처럼 품목 이름을 안 적어도 그 공간의 대표 공사다.
  clauseResults.forEach((cr) => {
    const acts = cr.actions.filter((a) => a.key === 'install' || a.key === 'remove');
    if (!acts.length) return;
    const ids = cr.mentions.map((m) => m.item.id);
    const installAct = acts.find((a) => a.key === 'install');
    if (!installAct) return;
    const nearSpace = (sid) =>
      (spaces || []).some((sp) => sp.id === sid && sp.start >= cr.clause.start && sp.end <= cr.clause.end && Math.abs(sp.start - installAct.start) <= 8);
    if (nearSpace('kitchen') && !ids.some((id) => ['sink', 'counter', 'cabinet', 'hood'].includes(id))) {
      if (!ops.some((o) => o.clause === cr.clause && ['sink', 'counter'].includes(o.itemId))) {
        const meter = /(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*[2²])/.exec(cr.clause.text);
        ops.push({ itemId: 'sink', label: '싱크대', scope: 'kitchen', action: 'install', qty: meter ? parseFloat(meter[1]) : 0, unit: 'm', clause: cr.clause, space: 'kitchen' });
      }
    }
    if (nearSpace('bathroom') && !ids.some((id) => ['bathroom', 'tile', 'waterproof', 'toilet', 'basin', 'faucet'].includes(id))) {
      ops.push({ itemId: 'bathroom', label: '욕실·화장실', scope: 'bathroom', action: 'install', qty: 0, unit: '칸', clause: cr.clause, space: 'bathroom' });
    }
  });

  // 같은 품목이 두 번 나오고 하나가 '철거'면 나머지는 새로 시공하는 것이다 ("기존 마루 철거 후 강마루")
  clauseResults.forEach((cr) => {
    const counts = {};
    cr.mentions.forEach((m) => { counts[m.item.id] = (counts[m.item.id] || 0) + 1; });
    Object.keys(counts).forEach((id) => {
      if (counts[id] < 2) return;
      // 뜯는 말이 붙은 품목 + 동작 없이 다시 나온 품목 ("마루 철거 후 강마루")
      // '철거 후 강마루'처럼 '후·뒤'로 이어지는 품목은 새로 시공하는 것이다
      const removeWord = cr.mentions.find((m) => m.item.id === id && m.action === 'remove')?.text || '';
      const escaped = removeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const afterWord = new RegExp(`(?:철거|제거|해체)\\s*(?:후|뒤|하고)[^.\\n]{0,10}${escaped}`).test(cr.clause.text);
      if (!afterWord) return;
      if (ops.some((o) => o.clause === cr.clause && o.itemId === id && o.action === 'install')) return;
      if (!ops.some((o) => o.clause === cr.clause && o.itemId === id && o.action === 'remove')) return;
      const template = ops.find((o) => o.clause === cr.clause && o.itemId === id && o.action === 'remove');
      ops.push({ ...template, action: 'install', scope: itemById(id)?.scope || template.scope });
    });
  });

  // 품목에 붙지 않은 '새로 설치' — 같은 절에서 뜯은 품목을 다시 시공하는 것이다
  // ("장판 다 뜯고 새로 깔아주세요", "샷시 철거 후 새로 설치")
  clauseResults.forEach((cr) => {
    const clauseOps = ops.filter((o) => o.clause === cr.clause);
    if (!clauseOps.length) return;
    const unboundInstall = cr.actions.find((a) => a.key === 'install' && !boundActions.has(a.start));
    if (!unboundInstall) return;
    clauseOps.forEach((o) => {
      if (o.action !== 'remove') return;
      if (ops.some((x) => x.clause === cr.clause && x.itemId === o.itemId && x.action === 'install')) return;
      ops.push({ ...o, action: 'install', scope: itemById(o.itemId)?.scope || o.scope, qty: o.qty, only: o.only });
      boundActions.add(unboundInstall.start);
    });
  });

  // 품목에 붙지 않은 '철거' — '철거'만 있는 문장은 건물 전체 철거다
  actions.forEach((a) => {
    if (boundActions.has(a.start)) return;
    if (a.key !== 'remove') return;
    if (ops.some((o) => o.action === 'remove' && o.itemId === 'whole')) return;
    ops.push({ itemId: 'whole', label: '전체', scope: 'demolition', action: 'remove', qty: 0, unit: '', only: false, space: null, text: a.text, wholeAction: true });
  });

  // 같은 품목·같은 동작이 두 번 잡히면 한 줄로 (실리콘 코킹처럼 낱말이 겹칠 때)
  const seen = new Set();
  const deduped = [];
  ops.forEach((o) => {
    const key = `${o.itemId}|${o.action}|${o.scope}|${o.qty}|${o.only}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(o);
  });
  ops.length = 0;
  ops.push(...deduped);

  const facts = readFacts(normalized, clauseResults, spaces);

  // 공종별로 한 일을 묶는다 (예: 욕실 문맥의 타일·도기 → 욕실 공사 한 건)
  return {
    text: normalized,
    clauses: clauseResults.map((c) => c.clause),
    mentions: clauseResults.flatMap((c) => c.mentions),
    actions,
    quantities,
    spaces,
    ops,
    surfaces,
    excluded: { removal: removed.length > 0, scopes: excludedScopes },
    facts,
  };
}

function spaceIdsIn(cr) {
  return cr.spaceIds || [];
}

function opOf(r, action, scope, cr) {
  return {
    itemId: r.item.id,
    baseScope: r.item.scope,
    label: r.item.label,
    scope,
    itemScope: r.scopeCandidate,
    action,
    qty: r.qty,
    unit: r.qtyUnit,
    only: r.only,
    until: r.until,
    space: r.spaceId,
    clause: cr.clause,
    text: r.text,
  };
}

// 문장에서 바로 읽는 사실 — 규모·층·엘베·지역·현장 성격
function readFacts(text, clauseResults, spaces) {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const q = findQuantities(t);
  const first = (key) => q.find((x) => x.key === key);
  const pyungQ = first('pyung');
  const sqmQ = first('sqm');
  const floorQ = first('floor');
  const tonQ = first('ton');
  const peopleQ = first('people');
  const dayQ = first('day');
  const korDay = korDays(t);
  const kanQ = first('kan');
  const countQ = q.filter((x) => x.key === 'count');
  const pairQ = q.filter((x) => x.key === 'pair');

  // 화장실·욕실 개수 — '화장실 2개'는 칸 수다
  let baths = kanQ ? kanQ.value : 0;
  if (!baths) {
    const bathMention = /(욕실|화장실)[^.\n]{0,6}?(\d+)\s*(?:개|곳|칸)/.exec(t);
    if (bathMention) baths = Number(bathMention[2]) || 0;
  }
  if (!baths) {
    const bathCount = clauseResults
      .flatMap((c) => c.mentions)
      .filter((m) => m.item?.id === 'bathroom')
      .reduce((max, m) => (m.qty > max ? m.qty : max), 0);
    baths = bathCount || (/욕실|화장실/.test(t) ? 1 : 0);
  }
  const rooms = (/(?:방|룸)\s*(\d+)\s*(?:개|칸)/.exec(t) || [])[1] || (/방\s*하나/.test(t) ? 1 : 0);
  const doors = (/(?:문|도어)\s*(\d+)\s*(?:짝|개|틀)/.exec(t) || [])[1];
  const windows = pairQ.length ? pairQ[0].value : 0;

  // 요청서 라벨('서비스 분야: 부분 인테리어')은 내용이 아니다
  const masked = t.replace(/부분\s*인테리어|부분인테리어|부분\s*시공/g, ' ');
  const elevatorWord = /엘(?:베|리베이터|레베이터)|승강기/.test(t);
  const elevatorNo = /엘(?:베|리베이터|레베이터)[^.\n]{0,10}?(?:없|불가|미사용|안\s*씀)|승강기[^.\n]{0,6}?없/.test(t);
  const elevatorYes = /엘(?:베|리베이터|레베이터)[^.\n]{0,12}?(?:운반|사용|이용|있|가능)|승강기[^.\n]{0,10}?(?:사용|운반|있)/.test(t);

  return {
    pyung: pyungQ ? pyungQ.value : 0,
    sqm: sqmQ ? sqmQ.value : /포크레인|포클레인|굴삭기|미니\s*굴삭/.test(t) ? 20 * Math.max(1, (dayQ ? dayQ.value : 0) || 1) : 0,
    floor: floorQ ? floorQ.value : 0,
    tons: tonQ ? tonQ.value : 0,
    halfTruck: /반\s*차/.test(t),
    people: peopleQ ? peopleQ.value : 0,
    days: dayQ ? dayQ.value : korDay,
    baths: Number(baths) || 0,
    rooms: Number(rooms) || 0,
    doors: Number(doors) || 0,
    windows,
    counts: countQ.map((c) => c.value),
    elevator: elevatorNo ? 'no' : elevatorYes ? 'yes' : elevatorWord ? 'unknown' : 'unknown',
    basement: /지하\s*\d?\s*층|반지하|b1|비1층/i.test(t),
    commercial: PLACES.commercial.test(t),
    residential: PLACES.residential.test(t),
    vacant: /공실|빈집|비어\s*있/.test(t) && !/입주\s*중|영업\s*중|거주\s*중/.test(t),
    occupied: /입주\s*중|영업\s*중|거주\s*중|살고\s*있|사람이\s*살/.test(t),
    access: /스카이|고소작업|크레인|붐\s*리프트|리프트차/.test(t) ? 'sky' : /사다리/.test(t) ? 'ladder' : '',
    night: /야간|심야|밤\s*작업|철야/.test(t),
    weekend: /주말|공휴일/.test(t),
    urgent: /급한|빨리|내일|이번\s*주/.test(t),
    fullInterior: /집\s*전체|아파트\s*인테리어|전체\s*인테리어|전체\s*공사|전체를|풀\s*인테리어|올\s*리모델링/.test(masked),
    // '부분 인테리어'는 요청서의 서비스 분류 라벨이다 — 전체 인테리어로 읽지 않는다
    remodelWord: /올\s*수리|올수리|리모델링|인테리어/.test(masked),
    wholeStrip: /올\s*철거|전체\s*철거|전부\s*철거|원상복구|다\s*뜯|전체\s*해체/.test(t),
    structural: /구옥|빈집|단독주택|건물\s*(?:철거|완파)|건물\s*전체|완파|지붕\s*철거|창고\s*철거|공장\s*철거/.test(t),
    paintWall: /벽\s*(?:만|도장|페인트)|벽체/.test(t),
    paintCeiling: /천장/.test(t),
    silk: /실크/.test(t),
    floorThick: /4\.5|4\.5t|4\.5mm/.test(t) ? '4.5' : /2\.2|2\.2t|2\.2mm/.test(t) ? '2.2' : '1.8',
    tile600: /600\s*각|포세린/.test(t),
    american: /아메리칸/.test(t),
    paintElastic: /탄성/.test(t),
    paintWater: /발수/.test(t),
    hood: /후드/.test(t),
    epoxy: /에폭시/.test(t),
    text: t,
  };
}
