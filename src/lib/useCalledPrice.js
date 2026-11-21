import { useEffect, useState } from 'react';

// '내가 부를/부른 금액' 입력 상태 — 2단계 가견적과 4단계 최종·수익이 같은 저장값(calledPrice)을 쓴다.
// 저장값이 비어 있으면 앱이 계산한 최종 견적(앱 계산가)이 기본값이고, 비우면 다시 앱 계산가로 돌아간다.
export function useCalledPrice(c, calc, update) {
  const appPrice = Math.round(Number(calc?.appClientPrice ?? calc?.clientPrice) || 0);
  const stored = c?.calledPrice;
  const noCalled = stored === '' || stored === null || stored === undefined;
  const [draft, setDraft] = useState(() => (noCalled ? String(appPrice) : String(stored)));

  useEffect(() => {
    setDraft(noCalled ? String(appPrice) : String(stored));
  }, [stored, appPrice, noCalled]);

  const commit = (v) => {
    const clean = String(v ?? '').replace(/[^0-9]/g, '').slice(0, 7);
    setDraft(clean);
    if (update) update({ calledPrice: clean });
  };
  const num = Number(draft);
  const effective = String(draft).trim() === '' || !Number.isFinite(num) ? appPrice : Math.max(0, Math.round(num));
  const reset = () => {
    setDraft(String(appPrice));
    if (update) update({ calledPrice: '' });
  };
  return { draft, commit, reset, appPrice, noCalled, effective, setDraft };
}
