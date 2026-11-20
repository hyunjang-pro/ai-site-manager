// 고객 예산 · 보수적 원가 · 마진으로 '이 일을 잡을지' 신호등을 만든다.
export function parseBudget(text = '') {
  const t = String(text || '').replace(/\s+/g, ' ');
  const m = t.match(/예산\s*[:：]?\s*([\d,]+)\s*만\s*원?\s*(미만|이하|내외|정도|까지)?/);
  if (m) return Math.max(0, Number(String(m[1]).replace(/,/g, '')) || 0);
  const m2 = t.match(/([\d,]+)\s*만\s*원\s*(미만|이하|내외|정도)/);
  if (m2) return Math.max(0, Number(String(m2[1]).replace(/,/g, '')) || 0);
  return 0;
}

const pct = (n) => `${Math.round(n)}%`;

// 2. 가견적 — 숨고 견적 캐시를 쓸지 판단
export function quoteSignal(calc, c) {
  const budget = parseBudget(`${c?.rawInput || ''} ${c?.notes || ''}`);
  const price = Math.round(calc.clientPrice);
  const cost = Math.round(calc.costWithBuffer);
  const margin = calc.marginBuffered;
  const days = Math.max(1, parseInt(c?.workDays, 10) || 1);
  const daily = Math.round(calc.netProfitBuffered / days);
  const reasons = [];

  let tone = 'green';
  if (budget > 0) {
    if (budget < cost) {
      tone = 'red';
      reasons.push(`고객 예산 ${budget.toLocaleString('ko-KR')}만 < 보수적 원가 ${cost.toLocaleString('ko-KR')}만 — 그대로 하면 적자입니다.`);
    } else if (price > budget) {
      tone = 'yellow';
      reasons.push(`견적 ${price.toLocaleString('ko-KR')}만 > 예산 ${budget.toLocaleString('ko-KR')}만 — 범위·사양 조율이 필요합니다.`);
    }
  }
  if (tone !== 'red') {
    if (margin <= 8 || calc.netProfitBuffered <= 0) {
      tone = 'red';
      reasons.push(`보수적 마진 ${pct(margin)} · 남는 돈 ${Math.round(calc.netProfitBuffered)}만 — 하자 한 번이면 적자입니다.`);
    } else if (margin < 18) {
      tone = 'yellow';
      reasons.push(`보수적 마진 ${pct(margin)} · 하루 ${daily}만 — 실측·범위 조율 조건으로 제안하세요.`);
    } else {
      reasons.push(`보수적 마진 ${pct(margin)} · 하루 ${daily}만 — 예비비 넣고도 남습니다.`);
    }
  }
  if (budget > 0 && budget > 0 && tone !== 'red' && price <= budget) {
    reasons.push(`고객 예산 ${budget.toLocaleString('ko-KR')}만 안에 들어옵니다.`);
  }
  const map = {
    green: { emoji: '🟢', title: '적극 추천 (견적 캐시 써도 좋습니다)', tone: 'ok' },
    yellow: { emoji: '🟡', title: '해볼 만함 (실측·범위 조율 조건으로 제안)', tone: 'warn' },
    red: { emoji: '🔴', title: '비추천 · 패스 권장 (캐시 아깝습니다)', tone: 'bad' },
  };
  return { ...map[tone], level: tone, budget, price, cost, margin, daily, reasons };
}

// 4. 최종·수익 — 답사 후 수주 판단
export function finalSignal(calc, c) {
  const budget = parseBudget(`${c?.rawInput || ''} ${c?.notes || ''}`);
  const proposal = Number(c?.negotiation?.proposal) || 0;
  const target = proposal > 0 ? proposal : Math.round(calc.clientPrice);
  const cost = Math.round(calc.costWithBuffer);
  const margin = target > 0 ? Math.round(((target - cost) / target) * 100) : 0;
  const days = Math.max(1, parseInt(c?.workDays, 10) || 1);
  const daily = Math.round((target - cost) / days);
  const risks = [];
  const logs = Array.isArray(c?.changeLogs) ? c.changeLogs : [];
  const up = logs.filter((l) => l.type !== 'decrease').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  if (up > 0) risks.push(`답사 후 +${up}만 올랐습니다`);
  if (c?.lifting?.elevator === 'no') risks.push('엘리베이터 없음(양중비·인력 위험)');
  if (c?.survey?.wasteMixed) risks.push('혼합 폐기물(처리비 3~6배)');
  if (c?.survey?.existingLeak) risks.push('누수 흔적(하자 배상 위험)');
  if (c?.survey?.loadBearingWall) risks.push('내력벽 철거(구조 검토 필요)');
  if (budget > 0 && target > budget) risks.push(`희망가 ${budget.toLocaleString('ko-KR')}만보다 ${(target - budget).toLocaleString('ko-KR')}만 높습니다`);

  let level = 'green';
  if (margin <= 0 || (budget > 0 && target > budget * 1.1)) level = 'red';
  else if (margin < 12 || risks.length >= 2 || (budget > 0 && target > budget)) level = 'yellow';

  const map = {
    green: { emoji: '🟢', title: '진행 추천 (충분히 남습니다)', tone: 'ok' },
    yellow: { emoji: '🟡', title: '조율 후 진행 (추가금 협의 또는 사양 축소 필요)', tone: 'warn' },
    red: { emoji: '🔴', title: '포기·패스 권장 (적자 또는 하자·분쟁 리스크)', tone: 'bad' },
  };
  const reasons = [];
  if (margin <= 0) reasons.push(`받는 금액 ${target.toLocaleString('ko-KR')}만 < 보수적 원가 ${cost.toLocaleString('ko-KR')}만 — 적자입니다.`);
  else reasons.push(`보수적 마진 ${pct(margin)} · 하루 ${daily}만원`);
  if (budget > 0) reasons.push(`고객 희망 ${budget.toLocaleString('ko-KR')}만 · 현재 ${target.toLocaleString('ko-KR')}만`);
  risks.slice(0, 3).forEach((r) => reasons.push(r));
  return { ...map[level], level, budget, target, cost, margin, daily, risks, reasons };
}


// AI가 준 신호를 화면 배지 형태로 바꾼다 (없으면 null)
export function aiSignalOf(ai) {
  const sig = ai?.signal;
  if (!sig || !['green', 'yellow', 'red'].includes(sig.level)) return null;
  const map = {
    green: { emoji: '🟢', tone: 'ok' },
    yellow: { emoji: '🟡', tone: 'warn' },
    red: { emoji: '🔴', tone: 'bad' },
  };
  return { ...map[sig.level], level: sig.level, title: sig.title || map[sig.level].title, reasons: sig.reason ? [sig.reason] : [] };
}
