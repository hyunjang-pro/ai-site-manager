// 숨고·카톡·메모·스크린샷 글자를 붙여넣으면 공종과 변수를 먼저 잡아준다.
// 규칙 기반(오프라인 100%) — 사진은 ocr.js가 읽은 글자를 여기에 넘긴다.
import { REGIONS, TRADES } from './constants.js';

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
  window: '창호',
  waste: '폐기물 처리',
  labor: '인력 지원',
  repair: '부분 수선',
  combined: '전체 인테리어',
  custom: '현장',
};

export function classifyRequest(rawText = '') {
  const text = String(rawText || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  const t = text.toLowerCase().replace(/\s+/g, ' ');

  const excludedWorks = [];
  const extraWorks = [];
  const windowExcluded = /창호.{0,45}(안\s*해|안해|안\s*하|제외|불필요|빼|하지\s*않)/.test(t) || /창호\s*제외/.test(t);
  if (windowExcluded) excludedWorks.push('창호');
  if (/바닥.{0,8}미장|미장.{0,8}필요|평평하지\s*않/.test(t)) extraWorks.push('바닥 미장');
  if (/난방/.test(t)) extraWorks.push('난방 보강');
  if (/타일/.test(t)) extraWorks.push('타일');

  const hits = [];
  const push = (id, re, strong = false) => {
    if (re.test(t)) hits.push({ id, strong });
  };
  push('demolition', /철거|해체|원상복구|데코타일|경량벽체|가벽|집게차/);
  push('wallpaper', /도배|벽지|합지|실크|장판|초배/);
  push('bathroom', /욕실|화장실|양변기|세면대|샤워|욕조/);
  push('kitchen', /주방|싱크대|씽크대|상판|후드|수납장/);
  push('tilewaterproof', /타일|방수|줄눈|담수|에폭시/);
  push('plaster', /미장|몰탈|엑셀관|바닥미장|바닥 미장/, true);
  push('window', windowExcluded ? /__none__/ : /창호|샤시|폴딩도어|발코니|중문|방충망|유리|블라인드/);
  push('waste', /폐기물|쓰레기|수거|배출|반출|마대|처리장|한\s*차/);
  push('labor', /인부|일용|인력|인력사무소|잠부|사람.{0,6}(구해|필요)/);
  push('repair', /수선|보수|교체|문짝|몰딩|도장|페인트|걸레받이|경첩|손잡이|실리콘/);

  const ids = hits.map((h) => h.id);
  const fullInterior = /아파트\s*인테리어|집\s*전체\s*인테리어|전체\s*인테리어|풀\s*인테리어|올수리/.test(t);
  const core = ids.filter((id) => ['demolition', 'wallpaper', 'bathroom', 'kitchen'].includes(id));

  let trade = 'unclassified';
  if (fullInterior) trade = 'combined';
  else if (core.length >= 2) trade = 'combined';
  else if (ids.includes('demolition')) trade = 'demolition';
  else if (ids.includes('labor')) trade = 'labor';
  else if (ids.includes('waste')) trade = 'waste';
  else if (ids.includes('plaster')) trade = 'plaster';
  else if (ids.includes('bathroom') && ids.includes('tilewaterproof')) trade = 'bathroom';
  else if (ids.includes('window')) trade = 'window';
  else if (ids.includes('bathroom')) trade = 'bathroom';
  else if (ids.includes('kitchen')) trade = 'kitchen';
  else if (ids.includes('wallpaper')) trade = 'wallpaper';
  else if (ids.includes('tilewaterproof')) trade = 'tilewaterproof';
  else if (ids.includes('repair')) trade = 'repair';
  else if (ids.length === 1) trade = ids[0];

  // 폐기물 + 철거가 같이 있으면 실제 주작업(철거)으로
  if (trade === 'waste' && /철거|해체/.test(t)) trade = 'demolition';
  // "발코니 방수"는 창호가 아니라 타일·방수
  if (trade === 'window' && /방수|누수/.test(t) && !/창호|샤시|폴딩|중문/.test(t)) trade = 'tilewaterproof';

  const floorMatch = t.match(/(\d+)\s*층/);
  const tonMatch = t.match(/(\d+(?:\.\d+)?)\s*톤/);
  const loadMatch = t.match(/(한|두|세|네)\s*차/);
  const peopleMatch = t.match(/(\d+)\s*명/);
  const dayMatch = t.match(/(\d+)\s*일/);
  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평(?:대)?/);
  const sqm = t.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)/);
  const meter = t.match(/(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*2)/);
  const spot = t.match(/(\d+(?:\.\d+)?)\s*(?:개소|군데|곳)/);
  const kan = t.match(/(\d+(?:\.\d+)?)\s*칸/);
  const budgetMatch = t.match(/예산\s*([\d,]+)\s*만\s*원?\s*(미만|이하|내외)?/);

  let sizeValue = '';
  let sizeUnit = '';
  if (trade === 'waste') {
    if (tonMatch) sizeValue = num(tonMatch[1]);
    else if (loadMatch) sizeValue = loadMatch[1] === '한' ? 2.5 : loadMatch[1] === '두' ? 5 : 7.5;
    sizeUnit = '톤';
  } else if (trade === 'labor') {
    sizeValue = peopleMatch ? parseInt(peopleMatch[1], 10) : '';
    sizeUnit = '명';
  } else if (trade === 'bathroom') {
    sizeValue = kan ? num(kan[1]) : 1;
    sizeUnit = '칸';
  } else if (trade === 'kitchen' && meter) {
    sizeValue = num(meter[1]);
    sizeUnit = 'm';
  } else if (trade === 'tilewaterproof' || trade === 'window' || trade === 'plaster') {
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

  const elevator = /엘베|엘리베이터|승강기/.test(t) ? (/없|불가|no/.test(t) ? 'no' : 'yes') : 'unknown';
  const hints = [];
  const survey = {};
  if (/텍스|슬레이트/.test(t)) {
    hints.push('천장 텍스·슬레이트 — 석면 조사 대상인지 확인하세요.');
    survey.asbestosRisk = true;
  }
  if (/누수|물이\s*샘|곰팡이/.test(t)) {
    hints.push('누수·곰팡이 — 방수 범위와 아래층 피해를 먼저 확인하세요.');
    survey.existingLeak = true;
  }
  if (elevator === 'no') hints.push('엘리베이터 없음 — 계단 운반비가 붙습니다.');
  if (elevator === 'yes') hints.push('엘리베이터 운반 가능 — 양중비를 낮출 수 있습니다.');
  if (/급한|빨리|내일|이번\s*주/.test(t)) hints.push('일정이 급함 — 인력·자재 수급부터 확인하세요.');
  if (/거주|살고|사람이\s*삼/.test(t)) {
    hints.push('거주 중 시공 — 보양·먼지막이 비용이 붙습니다.');
    survey.residential = true;
  }
  if (/공실|빈집|비어\s*있/.test(t)) hints.push('공실 — 보양·먼지막이를 최소화할 수 있습니다.');
  if (/보양|먼지막이|가림/.test(t)) survey.protectLevel = true;
  if (/폐기물|마대|반출/.test(t)) survey.wasteIncluded = true;
  if (/혼합\s*폐기물|섞어|섞어서/.test(t)) survey.wasteMixed = true;
  if (/주말|공휴일/.test(t)) survey.noWeekend = true;
  // 요청서에 이미 적힌 조건은 처음부터 체크해 둔다 (사용자가 다시 누를 필요 없게)
  if (/아파트|오피스텔/.test(t)) {
    survey.protectLevel = true;
    survey.adminDeposit = true;
  } else if (/빌라|상가|사무실/.test(t)) {
    survey.protectLevel = true;
  }
  if (/공실|빈집|비어\s*있/.test(t)) survey.residential = false;
  if (/엘베|엘리베이터|승강기/.test(t) && /있|사용/.test(t) && !/없/.test(t)) survey.materialLift = false;
  if (excludedWorks.length) hints.push(`${excludedWorks.join(', ')} 제외 — 견적에서 빼고 손님에게 확인하세요.`);
  if (extraWorks.includes('바닥 미장')) hints.push('바닥 미장 추가 — 미장·양생 일수를 공정에 넣으세요.');
  if (budgetMatch) hints.push(`손님 예산 ${budgetMatch[1]}만원${budgetMatch[2] || ''} — 이 안에서 범위를 잡으세요.`);
  if (/방\s*\d|욕실\s*\d|부엌|현관/.test(t)) hints.push('공간 구성이 적혀 있습니다 — 실측 때 방·욕실·주방 수를 확인하세요.');

  const mode = trade === 'tilewaterproof' ? (/방수/.test(t) && /타일/.test(t) ? 'both' : /방수|누수/.test(t) ? 'waterproof' : 'tile') : undefined;

  const rows = [{ label: '공종', value: TRADES[trade]?.label || '미분류' }];
  if (sizeValue) rows.push({ label: '규모', value: `${sizeValue}${sizeUnit}` });
  if (region || location) rows.push({ label: '지역', value: location || region });
  if (floorMatch) rows.push({ label: '층 / 엘베', value: `${floorMatch[1]}층 · ${elevator === 'no' ? '없음' : elevator === 'yes' ? '있음' : '확인 필요'}` });
  if (trade === 'waste') rows.push({ label: '처리', value: `${sizeValue || 2.5}톤 기준 · 톤당 32만 + 차량비` });
  if (trade === 'labor') rows.push({ label: '청구 기준', value: '1명 1일 26만원(원가 19만)' });
  if (trade === 'plaster' && extraWorks.length) rows.push({ label: '추가', value: extraWorks.join(' · ') });
  if (excludedWorks.length) rows.push({ label: '제외', value: excludedWorks.join(' · ') });

  const titleParts = [];
  if (region) titleParts.push(region);
  else if (locMatch?.[2]) titleParts.push(locMatch[2]);
  if (sizeValue) titleParts.push(`${sizeValue}${sizeUnit}`);
  titleParts.push(TRADE_TITLE[trade] || '현장');
  const suggestTitle = trade === 'unclassified' ? '새 현장' : titleParts.join(' ');

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
  };
  if (region) patch.region = region;
  if (location) patch.location = location;
  if (trade === 'labor') patch.laborDays = dayMatch ? Math.max(1, parseInt(dayMatch[1], 10)) : 1;
  if (trade === 'tilewaterproof') patch.tileWork = { mode };
  if (trade === 'plaster') patch.plaster = { heating: extraWorks.includes('난방 보강'), tile: extraWorks.includes('타일') };

  return {
    trade,
    patch,
    rows,
    hints,
    title: suggestTitle,
    confidence: trade === 'unclassified' ? 'low' : hits.length >= 2 ? 'medium' : 'high',
    detected: trade !== 'unclassified',
  };
}

// 사진·메모에서 읽은 글자를 '받은 내용' 칸에 넣기 좋은 짧은 요약으로 정리한다.
// 폰 UI 잡글자는 ocr.cleanOcrText가 이미 지운 상태로 들어온다.
export function summarizeRequest(text, res) {
  const clean = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  if (!clean) return '';
  const r = res || classifyRequest(clean);
  const t = clean.toLowerCase();
  const row = (label) => r.rows.find((x) => x.label === label)?.value || '';
  const lines = [];
  const push = (label, value) => {
    if (value) lines.push(`${label}: ${value}`);
  };

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
  if (r.patch?.excludedWorks?.length) push('제외', r.patch.excludedWorks.join('·'));
  if (r.patch?.extraWorks?.length) push('추가', r.patch.extraWorks.join('·'));

  // 요청사항 — 원문에서 핵심이 되는 첫 줄들만 짧게
  const wants = clean
    .split(/[\n.]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 2)
    .join(' / ');
  if (wants) push('요청', wants.length > 80 ? `${wants.slice(0, 80)}…` : wants);

  return lines.join('\n') || clean.slice(0, 120);
}
