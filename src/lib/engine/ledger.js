// 4축 단가표 — 자재 / 인건비 / 장비 / 폐기물 (SSOT)
// ─────────────────────────────────────────────────────────────
// 예전에는 같은 금액이 여러 곳에서 더해졌다(laborTotal += …). 한 줄이 두 번 더해지거나
// 자재값이 노무에 섞여도 화면에는 '합계'만 보여서 잡아낼 수 없었다.
// 이제 금액은 **줄(line) 하나에 한 축**만 갖고, 합계는 줄에서 다시 센다.
//  · 한 줄은 반드시 네 축 중 하나에 속한다 (자재 · 인건비 · 장비 · 폐기물)
//  · 합계 = Σ(줄) — 별도 누산기를 두지 않으므로 같은 돈을 두 번 셀 수 없다
//  · 단가의 출처는 이 표 하나 (pricing.js·partial.js·site.js 가 같은 표를 본다)

export const AXES = ['material', 'labor', 'equip', 'waste'];

export const AXIS_LABEL = {
  material: '자재',
  labor: '인건비',
  equip: '장비',
  waste: '폐기물',
};

// 화면 분류(카테고리) → 4축. 화면에 보이는 이름은 그대로 두고 축만 붙인다.
const CATEGORY_AXIS = {
  노무: 'labor',
  자재: 'material',
  폐기물: 'waste',
  장비: 'equip',
  '추가(규제)': 'equip',
  '추가(현장)': 'labor',
  '추가(운반)': 'labor',
  '추가(구조)': 'material',
  '추가(폐기물)': 'waste',
  '추가(디테일)': 'labor',
  '추가(공고)': 'labor',
  '답사 변동': 'labor',
};

// 이름으로 축을 더 정확히 가르는 예외 — 사다리차·양중은 사람이 아니라 장비다
export function axisOf(item) {
  if (item?.axis) return item.axis;
  const cat = String(item?.category || '');
  const name = String(item?.name || '');
  if (/사다리차|고소작업차|스카이|크레인|엘리베이터|굴삭기|포크레인|집게차|장비/.test(name)) return 'equip';
  if (/보양|먼지막이|가림/.test(name)) return 'equip';
  return CATEGORY_AXIS[cat] || 'labor';
}

// ── 줄 장부 ────────────────────────────────────────────────
// 모든 금액은 이 장부를 거친다. push 하면 축별 합계·원가가 저절로 맞는다.
export function createLedger() {
  const lines = [];
  const add = (line) => {
    const row = { ...line, axis: axisOf(line), amount: Math.round(Number(line.amount) || 0) };
    lines.push(row);
    return row;
  };
  const totals = ({ excluded = [], conditional = true, adjust = false } = {}) => {
    const out = { material: 0, labor: 0, equip: 0, waste: 0 };
    lines.forEach((l) => {
      if (excluded.includes(l.id)) return;
      if (l.conditional && !conditional) return;
      if (l.isAdjust !== adjust && adjust) return; // 변동 줄만 / 변동 아닌 줄만
      out[l.axis] = (out[l.axis] || 0) + l.amount;
    });
    return out;
  };
  const sum = (opts) => {
    const t = totals(opts);
    return AXES.reduce((s, a) => s + t[a], 0);
  };
  const byAxis = (predicate = () => true) => {
    const out = { material: 0, labor: 0, equip: 0, waste: 0 };
    lines.filter(predicate).forEach((l) => {
      out[l.axis] += l.amount;
    });
    return out;
  };
  // 명세 검사 — 축이 없거나 합계와 어긋나는 줄이 있으면 잡아낸다 (테스트가 이걸 부른다)
  const audit = (total) => {
    const problems = [];
    lines.forEach((l) => {
      if (!AXES.includes(l.axis)) problems.push({ type: 'axis', line: l });
      if (!Number.isFinite(l.amount)) problems.push({ type: 'amount', line: l });
    });
    const computed = sum();
    if (Number.isFinite(total) && Math.abs(computed - total) > 0) problems.push({ type: 'total', computed, total });
    return problems;
  };
  return { lines, add, totals, sum, byAxis, audit };
}
