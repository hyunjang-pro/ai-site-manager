// 요청서의 층(Tier) — **구조화 라벨/머리글(Tier 1)** 과 **자유 서술(Tier 2)** 을 나눈다.
// ─────────────────────────────────────────────────────────────
// 왜 필요한가 (2026-11-28 제보, 숨고 폐기물 요청서):
//   맨 윗줄에 '폐기물 처리', 라벨에 '희망 서비스 폐기물 배출 + 수거', '폐기물 양 1톤~2.5톤차'라고
//   손님이 **직접 고른 분류**가 적혀 있는데, 맨 아래 '문의/희망사항' 자유 서술의 "베이커리 철거 전"이라는
//   배경 설명 한 마디가 그 분류를 덮어써 '15평 철거'가 됐다.
//
// 숨고·당근 요청서는 정해진 칸에 답을 적은 양식이다. 그러니 그 칸(라벨)과 맨 윗줄 분류는
// **확정적인 의도 신호**로 먼저 읽고, 자유 서술은 규모·세부 품목·현장 조건을 채우는 데 쓴다.
// 다만 라벨이 '폐기물 처리'인데 자유 서술이 "철거 후 도배까지"라고 하면 그건 복합 현장이므로
// 라벨이 서술의 일부를 지우지는 않는다(아래 applyDeclared 규칙).
import { parseText } from './parse.js';
import { SCOPE_TO_TRADE } from './lexicon.js';

// 자유 서술이 시작되는 라벨 — 이 줄부터는 Tier 2다
const WISH_LABEL =
  /^(?:문의\s*\/?\s*희망\s*사항|문의사항|희망\s*사항|요청\s*사항|추가\s*요청\s*사항|상세\s*내용|요청\s*내용|문의\s*내용|기타\s*요청|기타\s*의견|전달\s*사항)\s*[:：]?\s*/;

// 라벨 이름 끝에 오는 낱말 — '폐기물 타입', '폐기물 양', '서비스 범위', '재활용 가능 여부'…
// 콜론 없이 값이 한 칸 띄어 붙은 OCR 결과도 라벨로 읽는다.
const LABEL_TAIL =
  /(?:타입|종류|양|수량|범위|여부|상태|분야|서비스|면적|유형|방법|날짜|시간|장소|위치|예산|비용|사항|규격|개수|층수|주소|연락처|옵션|조건|기간|일시|요청)$/;

// 문장 끝맺음 — 이 줄은 서술이다
const SENTENCE_END =
  /(?:합니다|하세요|주세요|해주세요|십시오|십니다|려고|려구|할게요|할게|입니다|이에요|예요|어요|아요|해요|네요|겠습니다|겠어요|까요|나요|죠|습니다|ㅂ니다|[.!?])\s*$/;

// 분류 머리글 — 짧은 한 줄짜리 공종 이름 ('폐기물 처리', '상업공간 인테리어', '철거')
const HEADLINE_TRADE =
  /폐기물|쓰레기|수거|배출|반출|집기|비품|철거|해체|원상복구|인테리어|리모델링|올\s*수리|도배|장판|벽지|마루|타일|방수|필름|도장|페인트|목공|가벽|칸막이|전기|조명|설비|배관|창호|샷시|욕실|화장실|주방|싱크대|미장|데크|간판|이사|정리/;

export function isLabelLine(line = '') {
  const s = String(line || '').trim();
  if (s.length < 4 || s.length > 40) return false;
  // '라벨: 값'
  const colon = s.match(/^(.{2,14}?)\s*[:：]\s*(\S.*)$/);
  if (colon && /[가-힣]/.test(colon[1])) return true;
  // '라벨 값' — 라벨 이름이 정해진 낱말로 끝날 때만 (문장을 라벨로 오인하지 않는다)
  const spaced = s.match(/^(.{2,12}?)\s+(\S.*)$/);
  if (spaced) {
    const label = spaced[1].replace(/\s+/g, '');
    if (LABEL_TAIL.test(label) && !SENTENCE_END.test(s)) return true;
  }
  return false;
}

// 수량·개수가 붙은 줄은 머리글이 아니라 내용이다 ('화장실 하나 철거', '간판 2개 철거')
const QUANTITY_WORD = /(?:하나|한\s|두\s|세\s|네\s|\d|개|칸|짝|군데|톤|평|㎡)/;

function isHeadline(line = '') {
  const s = String(line || '').trim();
  if (!s || s.length > 14) return false;
  if (QUANTITY_WORD.test(s)) return false;
  if (SENTENCE_END.test(s)) return false;
  if (!HEADLINE_TRADE.test(s)) return false;
  // '철거 후 도배'처럼 동작이 둘 붙은 줄은 머리글이 아니라 서술이다
  const hits = s.match(new RegExp(HEADLINE_TRADE.source, 'g')) || [];
  return hits.length <= 2 && !/\s(?:후|뒤|하고|전|전에)\s/.test(s);
}

// 요청서 → 두 층
export function readTiers(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const headerLines = [];
  const narrativeLines = [];
  let inNarrative = false;
  let labels = 0;
  let headlines = 0;

  for (const line of lines) {
    const wish = line.match(WISH_LABEL);
    if (wish) {
      inNarrative = true;
      const rest = line.slice(wish[0].length).trim();
      if (rest) narrativeLines.push(rest);
      continue;
    }
    if (inNarrative) { narrativeLines.push(line); continue; }
    if (isLabelLine(line)) { headerLines.push(line); labels += 1; continue; }
    if (SENTENCE_END.test(line)) { narrativeLines.push(line); continue; }
    if (isHeadline(line)) headlines += 1;
    headerLines.push(line);
  }

  const headerText = headerLines.join('\n').trim();
  const narrativeText = narrativeLines.join(' ').trim();
  const structured = labels > 0 || headlines > 0;
  return {
    headerText,
    narrativeText,
    headerLines,
    narrativeLines,
    labels,
    headlines,
    structured,
    // 라벨/머리글이 있는 양식일 때만 '확정 분류'로 쓴다 — 자유 문장은 엔진 판단에 맡긴다
    declaredTrade: structured ? declaredTradeOf(headerText) : null,
  };
}

// 라벨/머리글 글자만 해석해 '이 요청서가 스스로 밝힌 공종'을 뽑는다.
//  · 분류 낱말(철거·폐기물…)은 라벨이므로 **글자 그대로** 센다.
//  · 뜯는 동작의 품목 공종(데코타일 철거 → 도배)은 공종 이름이 아니므로 그 동작으로 세지 않고,
//    품목은 아래 mentions로만 센다.
//  · 두 공종이 팽팽하면 단정하지 않는다(null) — 그때는 본문 판단을 따른다.
export function declaredTradeOf(headerText = '') {
  const text = String(headerText || '').trim();
  if (!text) return null;
  const p = parseText(text);
  const score = new Map();
  const bump = (scope, n) => {
    if (!scope) return;
    const trade = SCOPE_TO_TRADE[scope] || scope;
    score.set(trade, (score.get(trade) || 0) + n);
  };
  if (/철거|해체|원상복구/.test(text)) bump('demolition', 3);
  if (/인력|인부|일용|일당|사람\s*\d*\s*명/.test(text)) bump('labor', 3);
  // 폐기물이 '포함·까지'면 철거에 딸린 일이고, '처리·수거·배출'이 서비스 자체다
  if (/폐기물\s*(?:처리|수거|배출|반출|정리)|집기\s*(?:정리|처리|수거)|비품\s*(?:정리|처리|수거)|폐업\s*(?:정리|철수)/.test(text)) {
    bump('waste', 3);
  }
  p.ops.filter((o) => o.action && o.action !== 'remove').forEach((o) => bump(o.scope, 3));
  // 같은 품목이 여러 번 나와도 한 번만 센다 — '가벽 3m 철거'의 '가벽'이 두 번 세지면 철거를 누른다
  const seen = new Set();
  p.mentions.forEach((m) => {
    const id = m.item?.id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    bump(m.item?.scope, Number(m.item?.authority) || 1);
  });
  if (!score.size) return null;
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || [null, 0];
  if (topScore < 3) return null;
  if (secondScore >= topScore) return null; // 두 공종이 팽팽하면 라벨로 단정하지 않는다
  return top;
}
