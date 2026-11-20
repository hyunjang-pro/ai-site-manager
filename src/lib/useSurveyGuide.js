import { useEffect, useState } from 'react';
import { analyzeSurveyGuideWithGemini, getGeminiKey } from './gemini.js';
import { surveyGuideContext, surveyGuideFor } from './surveyGuide.js';

// 이 현장의 답사 가이드를 한 번만 AI로 만들어 c.surveyPlan에 저장한다.
// - Gemini 키가 있을 때만 요청하고, 실패하면 surveyPlanAt을 남겨 같은 요청을 반복하지 않는다(다시 뽑기 버튼으로 재시도).
// - AI가 없거나 실패하면 화면은 공종별 로컬 기본값을 그대로 쓴다.
export function useSurveyGuide(c, calc, update) {
  const aiOn = !!getGeminiKey();
  const tried = !!c?.surveyPlanAt;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!aiOn || !update || tried || busy) return undefined;
    let alive = true;
    setBusy(true);
    (async () => {
      const res = await analyzeSurveyGuideWithGemini({ apiKey: getGeminiKey(), context: surveyGuideContext(c, calc) });
      if (!alive) return;
      update({
        surveyPlan: res.ok ? res.data : null,
        surveyPlanAt: new Date().toISOString(),
        surveyPlanError: res.ok ? '' : String(res.reason || 'failed'),
      });
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [aiOn, tried, busy]);

  return {
    aiOn,
    busy,
    guide: surveyGuideFor(c, calc),
    retry: () => {
      if (update) update({ surveyPlan: null, surveyPlanAt: '', surveyPlanError: '' });
    },
  };
}
