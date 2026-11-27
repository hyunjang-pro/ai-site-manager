// 문장 → 절(clause) → 토큰(품목·수량·동작) 으로 나누는 바닥층.
// 예전에는 공종마다 정규식이 따로 문장 전체를 훑어서 "주방" 하나가 싱크대 교체로,
// "타일" 하나가 욕실 올수리로 튀었다. 여기서는 **절 단위**로 잘라 두고,
// 그 안에서 품목·수량·동작을 짝지어 읽는다. (인접어 판단의 기준 좌표가 된다)
//
// 단위: 평 · ㎡ · m · 칸 · 개/개소/곳 · 짝 · 대 · 명 · 일 · 톤 · 층 · 식 · 롤

const KOR_DIGIT = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

// 수량 뒤에 붙는 단위 — 한글 수사('두 칸')를 숫자로 바꿔 두면 뒤 단계가 한 가지 형태만 읽으면 된다.
const QUANTITY_UNITS = ['명', '개소', '군데', '곳', '개', '칸', '짝', '대', '일', '층', '톤', '식', '롤', '장', '면', 'm', '미터'];

export function normalizeText(raw = '') {
  return String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[\u00a0\u3000]/g, ' ')
    .trim();
}

// '두 칸' → '2칸', '세명' → '3명'. 단위가 붙은 수사만 바꾼다.
// ('한 차'는 트럭 한 대라는 뜻이라 톤수 계산 쪽에서 따로 읽는다)
export function normalizeNumerals(text = '') {
  let out = String(text || '');
  const unitAlt = QUANTITY_UNITS.join('|');
  out = out.replace(new RegExp(`(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(${unitAlt})(?=$|만|씩|[^가-힣])`, 'g'), (m, k, u) => {
    const n = KOR_DIGIT[k];
    // '세'는 '세입자' 같은 말과 겹치지 않게 단위가 바로 붙은 경우만 이미 걸러졌다
    return n ? `${n}${u}` : m;
  });
  // "화장실이 두갠데" — 구어체 개수
  out = out.replace(/(한|두|세|네|다섯|여섯)\s*[갠개]\b/g, (m, k) => `${KOR_DIGIT[k]}개`);
  // "방 하나" · "욕실 하나"
  out = out.replace(/(방|욕실|화장실|창|문|베란다|발코니)\s*(?:이|가)?\s*(한|두|세|네)\s*(?:개|칸|짝)?/g, (m, w, k) => `${w} ${KOR_DIGIT[k]}개`);
  return out;
}

// 절 나누기 — 쉼표·가운뎃점·덧셈·줄바꿈, 그리고 접속 조사(랑·와·과·및·하고)에서 끊는다.
// 끊는 이유: "장판 제거, 화장실 2개 철거"처럼 품목마다 동작이 다른 문장에서
// 앞 절의 동작(제거)이 뒤 절(철거)로 새지 않게 하기 위해서다.
// '·'는 품목 목록('타일·도기')이라 절을 끊지 않는다 — 목록 뒤의 동작이 모두에 걸린다
const CONNECTOR = /(\s*(?:,|\+|;|\/|\n|\s및\s|\s랑\s|\s이랑\s|\s와\s|\s과\s|\s하고\s|\s그리고\s|\s한데\s)\s*)/;

export function splitClauses(text = '') {
  const normalized = normalizeText(text);
  const parts = [];
  let cursor = 0;
  const raw = normalized;
  // 접속 조사는 공백으로 둘러싸인 것만 끊는다 ('결과'·'물과' 같은 단어 보호)
  const re = new RegExp(CONNECTOR.source, 'g');
  let m;
  while ((m = re.exec(raw))) {
    const head = raw.slice(cursor, m.index);
    if (head.trim()) parts.push(head.trim());
    cursor = m.index + m[0].length;
    if (m[0].includes('\n')) {
      // 줄바꿈은 절 경계로만 쓰고, 다음 줄이 이어지는 문장이면 뒤에서 합친다
    }
  }
  const tail = raw.slice(cursor);
  if (tail.trim()) parts.push(tail.trim());
  if (!parts.length) return normalized ? [normalized] : [];
  // 한두 글자 조각('등', '그')은 버린다 — 품목이 아니다
  return parts.filter((p) => /[가-힣0-9]/.test(p)).map((p) => p.trim());
}

// 문장 안 위치를 유지한 채 절 목록을 돌려준다 (품목과 수량의 거리 계산용)
export function clauseSpans(text = '') {
  const normalized = normalizeText(text);
  const spans = [];
  let start = 0;
  const re = new RegExp(CONNECTOR.source, 'g');
  let m;
  while ((m = re.exec(normalized))) {
    spans.push({ text: normalized.slice(start, m.index), start, end: m.index });
    start = m.index + m[0].length;
  }
  spans.push({ text: normalized.slice(start), start, end: normalized.length });
  return spans
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0)
    .map((s) => ({ ...s, start: s.start + (normalized.slice(s.start, s.end).length - normalized.slice(s.start, s.end).trimStart().length) }));
}

// '하루·이틀·사흘·나흘' 같은 날 수사 — 인력 지원 일수로 읽는다
const KOR_DAYS = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 이레: 7 };
export function korDays(text = '') {
  const m = /(하루|이틀|사흘|나흘|닷새|엿새|이레)/.exec(String(text || ''));
  return m ? KOR_DAYS[m[1]] : 0;
}

export function korNumber(word) {
  if (!word) return 0;
  const n = Number(word);
  if (Number.isFinite(n)) return n;
  return KOR_DIGIT[word] || 0;
}

// 숫자 + 단위를 모두 찾는다. 같은 숫자가 여러 단위에 걸릴 수 있으므로(예: '2.5톤 1대')
// 단위별로 따로 뽑고, 품목과의 거리로 짝을 정한다.
const UNIT_PATTERNS = [
  { key: 'pyung', re: /(\d+(?:\.\d+)?)\s*평(?:대)?/g, unit: '평' },
  { key: 'sqm', re: /(\d+(?:\.\d+)?)\s*(?:㎡|m2|m²|제곱미터)/g, unit: '㎡' },
  { key: 'meter', re: /(\d+(?:\.\d+)?)\s*(?:m|미터)(?!\s*[2²])/g, unit: 'm' },
  { key: 'kan', re: /(\d+)\s*칸/g, unit: '칸' },
  { key: 'count', re: /(\d+(?:\.\d+)?)\s*(?:개소|군데|곳|개)(?![가-힣])/g, unit: '개' },
  { key: 'pair', re: /(\d+)\s*(?:짝|틀)(?![가-힣])/g, unit: '짝' },
  { key: 'unit', re: /(\d+)\s*대(?![가-힣])/g, unit: '대' },
  { key: 'ton', re: /(\d+(?:\.\d+)?)\s*톤/g, unit: '톤' },
  { key: 'floor', re: /(\d+)\s*층/g, unit: '층' },
  { key: 'day', re: /(\d+)\s*일(?![가-힣])/g, unit: '일' },
  { key: 'people', re: /(\d+)\s*명/g, unit: '명' },
  { key: 'car', re: /(\d+)\s*차(?![가-힣])/g, unit: '차' },
  { key: 'sheet', re: /(\d+)\s*식(?![가-힣])/g, unit: '식' },
  { key: 'roll', re: /(\d+)\s*롤/g, unit: '롤' },
];

export function findQuantities(text = '') {
  const t = normalizeNumerals(normalizeText(text));
  const out = [];
  for (const { key, re, unit } of UNIT_PATTERNS) {
    const rx = new RegExp(re.source, 'g');
    let m;
    while ((m = rx.exec(t))) {
      out.push({ key, unit, value: parseFloat(m[1]), start: m.index, end: m.index + m[0].length });
    }
  }
  // "반차"는 0.5톤
  const half = /반\s*차/.exec(t);
  if (half) out.push({ key: 'ton', unit: '톤', value: 0.5, start: half.index, end: half.index + half[0].length, half: true });
  return out.sort((a, b) => a.start - b.start);
}

// 톤 범위 — '1톤~2.5톤차', '1~2.5톤', '1톤에서 2.5톤'
// 숨고 요청서는 '폐기물 양 1톤~2.5톤차'처럼 차량 범위를 적는다. 점 하나를 집으면 작은 차가 잡혀
// 비용을 빠뜨리므로, 범위를 읽어 큰 차로 잡고 범위 자체는 안내에 남긴다.
export function findTonRange(text = '') {
  const t = normalizeNumerals(normalizeText(text));
  const m = /(\d+(?:\.\d+)?)\s*(?:톤)?\s*(?:~|∼|-|–|에서|부터)\s*(\d+(?:\.\d+)?)\s*톤/.exec(t);
  if (!m) return null;
  const min = parseFloat(m[1]);
  const max = parseFloat(m[2]);
  if (!(min > 0) || !(max > 0) || max <= min) return null;
  return { min, max, start: m.index, end: m.index + m[0].length };
}

export function distanceToRange(pos, range) {
  if (pos < range.start) return range.start - pos;
  if (pos > range.end) return pos - range.end;
  return 0;
}
