import { useEffect, useRef, useState } from 'react';

// '내가 부를/부른 금액' 입력 상태 — 2단계 가견적과 4단계 최종·수익이 같은 저장값(calledPrice)을 쓴다.
// 저장값이 비어 있으면 앱이 계산한 최종 견적(앱 계산가)이 기본값이고, 비우면 다시 앱 계산가로 돌아간다.
const toText = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return s; // 입력한 그대로 (앞자리 0도 유지)
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.max(0, Math.round(n))) : '';
};

export function useCalledPrice(c, calc, update) {
  const appPrice = Math.round(Number(calc?.appClientPrice ?? calc?.clientPrice) || 0);
  const stored = c?.calledPrice;
  const noCalled = stored === '' || stored === null || stored === undefined;
  const [draft, setDraft] = useState(() => (noCalled ? String(appPrice) : toText(stored)));
  // 사용자가 입력칸을 직접 비운 순간 — 저장값이 ''로 돌아와도 칸을 다시 채우지 않는다.
  // (예전에는 641의 마지막 '6'을 지우면 저장값 '' → 앱 계산가 641이 곧바로 되살아났다)
  const selfCleared = useRef(false);

  useEffect(() => {
    if (selfCleared.current) {
      if (noCalled) return; // 아직 사용자가 지운 빈칸 — 그대로 둔다
      selfCleared.current = false; // 다른 경로로 새 금액이 확정됨
    }
    setDraft(noCalled ? String(appPrice) : toText(stored));
  }, [stored, appPrice, noCalled]);

  const commit = (v) => {
    const clean = String(v ?? '').replace(/[^0-9]/g, '').slice(0, 7);
    setDraft(clean);
    selfCleared.current = clean === '';
    if (update) update({ calledPrice: clean });
  };
  // 빈칸으로 칸을 떠나면 앱 계산가를 다시 보여준다 (저장값은 비운 채 = 앱 계산가 기준)
  const settle = () => {
    if (String(draft).trim() !== '') return;
    selfCleared.current = false;
    setDraft(String(appPrice));
    if (update) update({ calledPrice: '' });
  };
  const num = Number(draft);
  const effective = String(draft).trim() === '' || !Number.isFinite(num) ? appPrice : Math.max(0, Math.round(num));
  const reset = () => {
    selfCleared.current = false;
    setDraft(String(appPrice));
    if (update) update({ calledPrice: '' });
  };
  return { draft, commit, settle, reset, appPrice, noCalled, effective, setDraft };
}
