import { useEffect, useRef, useState } from 'react';
import { analyzeExpertAuditWithGemini, getGeminiKey } from './gemini.js';
import { expertAudit } from './expertAudit.js';

// 전문가 감리 검증 — Gemini 키가 있으면 이 현장 조건으로 독립 리포트를 한 번 받아 c.expertAudit에 저장한다.
// 키가 없거나 실패하면 화면은 로컬 규칙(expertAudit)만으로도 시장 밴드·숨은 리스크·계약 방어를 보여준다.
export function useExpertAudit(c, calc, update) {
  const aiOn = !!getGeminiKey();
  const tried = !!c?.expertAuditAt;
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!aiOn || !update || tried || started.current) return undefined;
    started.current = true;
    setBusy(true);
    const audit = expertAudit(c, calc, []);
    const context = [
      `공종: ${calc?.tradeLabel || ''}${c?.tradeName ? ` (${c.tradeName})` : ''}`,
      `규모: ${c?.sizeValue ?? ''}${c?.sizeUnit || ''}`,
      `지역: ${c?.location || c?.region || ''}`,
      `건물: ${c?.asbestos?.usage === 'house' ? '주거' : c?.asbestos?.usage === 'nonhouse' ? '상가·비주거' : '모름'}${c?.asbestos?.builtYear ? ` · ${c.asbestos.builtYear}년 준공` : ''}`,
      `층수·엘베: ${c?.lifting?.floor || '?'}층 · 엘베 ${c?.lifting?.elevator === 'yes' ? '있음' : c?.lifting?.elevator === 'no' ? '없음' : '모름'} · 사다리차 ${c?.lifting?.ladderAllowed === 'yes' ? '가능' : c?.lifting?.ladderAllowed === 'no' ? '불가' : '모름'}`,
      `가견적: ${Math.round(Number(calc?.clientPrice) || 0)}만원 · 보수적 원가 ${Math.round(Number(calc?.costWithBuffer) || 0)}만원`,
      `시장 밴드: ${audit.market.low}~${audit.market.high}만원 (평균 ${audit.market.avg}만)`,
      `현장 내용: ${String(c?.rawInput || c?.notes || c?.siteCondition || '').slice(0, 500)}`,
    ]
      .filter((line) => line && !line.endsWith(': '))
      .join('\n');
    (async () => {
      const res = await analyzeExpertAuditWithGemini({ apiKey: getGeminiKey(), context });
      update({ expertAudit: res.ok ? res.data : null, expertAuditAt: new Date().toISOString(), expertAuditError: res.ok ? '' : String(res.reason || 'failed') });
      setBusy(false);
    })();
    return undefined;
  }, [aiOn, tried, update]);

  return {
    aiOn,
    busy,
    retry: () => {
      started.current = false;
      if (update) update({ expertAudit: null, expertAuditAt: '', expertAuditError: '' });
    },
  };
}
