// '화장실 하나 철거'처럼 새로 짓는 게 아니라 뜯기만 하는 요청을 가려낸다.
// 예전에는 욕실·주방 견적이 무조건 '올수리(타일+도기 교체)'로 계산돼서
// 철거만 원하는 손님에게 641만·1,254만(2칸) 같은 금액이 나갔다.
//
// 기준은 '뜯는 말'과 '새로 만드는 말'의 대비다. 품목 이름(타일·싱크대·장판·선반)은
// 그 자체로는 시공 의사가 아니다 — "싱크대 철거"는 철거, "싱크대 교체"는 시공이다.

const NEW_BUILD =
  /올수리|올\s*수리|리모델링|인테리어|교체|설치|새로|신규|시공|깔아|깔기|깔아주|붙이|붙여|바르|도배\s*(해|하|할|까지|를\s*해)|장판\s*(깔|시공)|타일\s*(시공|교체|붙)|방수\s*(공사|시공)|도기\s*교체|철거\s*후|철거하고\s*(새|다시|타일|도기|마감|포세린|아메리칸)|포세린|600각|아메리칸스탠다드/;
const REMOVE_WORDS = /철거|해체|제거|부수|부숴|뜯|떼|까\s*내|깨|반출|폐기|비우|치우|버리|빼|없애/;

function textOf(c) {
  // 제목·공종 이름·자동 요약('공종: 욕실 리모델링')은 앱이 붙인 것이다 — 손님이 쓴 글(notes)만 본다.
  const own = [c?.notes, c?.supplement].filter(Boolean).join(' ').trim();
  return (own || String(c?.rawInput || '')).toLowerCase();
}

// 글에 '뜯는 말'은 있고 '새로 만드는 말'은 없을 때만 철거만.
export function isDemoOnlyText(text = '') {
  const t = String(text || '').toLowerCase();
  if (!REMOVE_WORDS.test(t)) return false;
  return !NEW_BUILD.test(t);
}

// 욕실 1칸을 '철거만' 하는 현장인가 (자재·도기·타일 시공 없음)
export function bathroomDemoOnly(c) {
  if (!c || c.trade !== 'bathroom') return false;
  // 현장에서 이미 정한 값이 있으면 그게 우선
  if (c?.bathroom?.scope === 'demo') return true;
  if (c?.bathroom?.scope === 'remodel') return false;
  return isDemoOnlyText(textOf(c));
}

// 주방도 같은 기준 — '주방 철거'에 3.2m 싱크대 교체값이 붙으면 안 된다.
export function kitchenDemoOnly(c) {
  if (!c || c.trade !== 'kitchen') return false;
  if (c?.kitchen?.scope === 'demo') return true;
  if (c?.kitchen?.scope === 'remodel') return false;
  return isDemoOnlyText(textOf(c));
}
