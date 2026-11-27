// 절의 담화 역할 — **요청 행위**인가, **배경·시점·조건·제외**인가.
// ─────────────────────────────────────────────────────────────
// 왜 필요한가 (2026-11-28 제보, 숨고 폐기물 요청서):
//   "베이커리 철거 전 중고 판매 처리 불가능한 물품과 포장재, 식자재, 음식물 등등 폐기물처리하려고 합니다."
//   → '철거'가 주공종으로 잡혀 '안동 15평 철거 371만'이 나갔다. 손님이 하는 말은
//      "철거 **전에** 폐기물을 치워 달라"인데, 배경 설명 속 낱말 하나가 요청을 덮어쓴 것이다.
//
// 예전에는 '~전/후' 같은 낱말을 하나씩 예외 처리하는 방식이었다. 그 방식은
//   "리모델링 하려다 도배만", "기존 인테리어 뜯지 않고 필름만", "카페 폐업해서 집기 치워요"
// 같은 변형이 나올 때마다 다시 뚫린다. 그래서 규칙을 하나로 세운다.
//
//   ① 공종을 뒤집을 수 있는 낱말(철거·인테리어·도배·폐기물…) 뒤에
//   ② 시점(전·예정·하려다·중)·원인(해서·때문에)·제외(지 않고·말고·빼고) 표지가 붙으면
//   ③ 그 낱말은 **요청이 아니라 배경**이다 — 공종 후보에서 빼고, 그 구간은 지운 글자로 본다(foreground).
//
// '~후·~뒤'는 배경이 아니라 **순서**다. "철거 후 도배"는 철거도 우리가 하는 일이므로 그대로 둔다.
import { clauseSpans } from './text.js';

// 공종을 뒤집을 수 있는 낱말만 넣는다. '이사·폐업·입주'처럼 공종을 정하지 않는 사건 낱말은 넣지 않는다
// (넣으면 "상가 12평 폐업해서 다 뜯어내고"의 '12평'·'상가'까지 지워져 규모를 잃는다).
const TRADE_WORD =
  /철거|해체|제거|철거공사|인테리어|리모델링|올\s*수리|올수리|도배|장판|마루|타일|방수|필름|도장|페인트|목공|전기|설비|배관|폐기물|미장|창호|샷시|가벽|칸막이|욕실|화장실|주방|싱크대|데크|간판|조명|뜯|부수|부숴|교체|설치|원상복구/g;

// 낱말과 표지 사이에 낄 수 있는 것 — 조사(을·를·이·가…)와 '하'(하려다·하기 전)
const P = '(?:을|를|이|가|은|는|도|만|과|와|랑|이랑)?';
const AUX = '(?:하|할|하기|하는|한|했|해|하시)?';
// 표지 뒤에 이어질 수 있는 것 — 조사·서술어 어미. ('전체'·'중고'·'전기'를 '전'·'중'으로 오인하지 않게)
const TAIL = '(?=$|[\\s,.·:;!?()\\[\\]{}"”’]|에|에는|에도|에는요|까지|부터|인|이며|이라|입니다|인데|이었다|였다|인가|이라도|인지)';

const PROSPECTIVE = new RegExp(
  `^\\s*${P}\\s*(?:처리|공사|작업|철거|해체|시공|교체|설치|견적|비용|일정)?\\s*${AUX}\\s*` +
    `(?:전|이전|직전|앞두고|앞뒤|앞두고\s*있|하려다|려다|하려던|하려고\\s*했|하기로|중)${TAIL}`
);
const CAUSE = new RegExp(`^\\s*${P}\\s*(?:해서|해서요|때문에|이라서|라서|여서)`);
const EXCLUSION = new RegExp(`^\\s*${P}\\s*${AUX}\\s*(?:지\\s*(?:않|말)|않고|말고|빼고|제외|없이|안\\s*하|안\\s*해|안\\s*함|안\\s*됨)`);

const MAX_WINDOW = 18;

function merge(spans) {
  if (!spans.length) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (s.word && !last.words.includes(s.word)) last.words.push(s.word);
      if (s.kind && !last.kinds.includes(s.kind)) last.kinds.push(s.kind);
      continue;
    }
    out.push({ start: s.start, end: s.end, kind: s.kind, kinds: [s.kind], words: s.word ? [s.word] : [] });
  }
  return out;
}

// 배경 구간 — [수식어 … 낱말 … 표지] 까지. 절 경계를 넘지 않는다.
// 수식어('욕실 공사 전에'의 '욕실')도 같이 지워야 공간 이름이 공종을 다시 잡지 않는다.
// 다만 숫자·수량은 지우지 않는다 — '15평 철거 전'에서 15평은 규모이기 때문이다.
const MAX_BACK = 12;

export function backgroundSpans(text = '') {
  const t = String(text || '');
  if (!t) return [];
  const clauses = clauseSpans(t);
  const clauseAt = (pos) => clauses.find((c) => pos >= c.start && pos <= c.end) || null;
  const spans = [];
  const re = new RegExp(TRADE_WORD.source, 'g');
  let m;
  while ((m = re.exec(t))) {
    if (!m[0]) { re.lastIndex += 1; continue; }
    const wordEnd = m.index + m[0].length;
    const clause = clauseAt(m.index);
    const limit = Math.min(clause ? clause.end : t.length, wordEnd + MAX_WINDOW);
    const after = t.slice(wordEnd, limit);
    let kind = '';
    let len = 0;
    const pm = after.match(PROSPECTIVE);
    if (pm) { kind = 'prospective'; len = pm[0].length; }
    else {
      const cm = after.match(CAUSE);
      if (cm) { kind = 'cause'; len = cm[0].length; }
      else {
        const em = after.match(EXCLUSION);
        if (em) { kind = 'exclusion'; len = em[0].length; }
      }
    }
    // 앞에 '제외·빼고·말고'가 붙은 낱말도 배경이다 ('제외: 철거' 라벨, '철거 빼고')
    let start = m.index;
    const floor = Math.max(clause ? clause.start : 0, m.index - MAX_BACK);
    if (!kind) {
      const before = t.slice(floor, m.index);
      // 라벨 형태('제외: 철거', '제외 항목: 철거')만 본다.
      // '빼고'는 앞 낱말을 빼는 말이라('인테리어 빼고 도배만') 뒤 낱말에 적용하면 안 된다 — 그건 after 표지가 처리한다.
      const pm2 = /(?:^|[\n,·;])\s*(?:제외|불필요)\s*(?:항목|공정|공사|공종)?\s*[:：]\s*$/.exec(before);
      if (pm2) {
        kind = 'exclusion';
        start = Math.max(floor, m.index - (pm2[0].length - (pm2[0].match(/^[\n,·;]?\s*/) || [''])[0].length));
      }
    }
    if (!kind) continue;
    // 앞 수식어까지 넓힌다 — 한글·공백만, 숫자/문장부호에서 멈춘다
    let start2 = start;
    while (start2 > floor && /[가-힣\s]/.test(t[start2 - 1])) start2 -= 1;
    while (start2 < m.index && /\s/.test(t[start2])) start2 += 1;
    spans.push({ start: start2, end: wordEnd + len, kind, word: m[0].trim() });
  }
  return merge(spans);
}

// 배경 구간을 공백으로 바꾼 같은 길이의 글자 — 위치(offset)가 그대로라 절·수량 좌표가 흔들리지 않는다.
export function blankSpans(text = '', spans = []) {
  const t = String(text || '');
  if (!spans.length) return t;
  let out = '';
  let cursor = 0;
  for (const s of spans) {
    if (s.end <= cursor) continue;
    if (s.start > cursor) out += t.slice(cursor, s.start);
    out += ' '.repeat(Math.max(0, s.end - Math.max(cursor, s.start)));
    cursor = Math.max(cursor, s.end);
  }
  return out + t.slice(cursor);
}

// 문장 하나 → { foreground: 요청만 남긴 글자, spans, words }
export function readDiscourse(text = '') {
  const spans = backgroundSpans(text);
  return {
    spans,
    foreground: blankSpans(text, spans),
    words: Array.from(new Set(spans.flatMap((s) => s.words))),
    excluded: Array.from(new Set(spans.flatMap((s) => (s.kinds.includes('exclusion') ? s.words : [])))),
    prospective: Array.from(new Set(spans.flatMap((s) => (s.kinds.includes('prospective') ? s.words : [])))),
  };
}
