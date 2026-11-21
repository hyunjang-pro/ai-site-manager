import React, { useMemo, useState } from 'react';
import { AlertTriangle, Camera, Check, Copy, Loader2, Trash2, Wand2 } from 'lucide-react';
import { SURVEY_GROUPS, TRADES, hasScope, scopeList } from '../../lib/constants.js';
import { toPyung } from '../../lib/pricing.js';
import { ratesOf } from '../../lib/rates.js';
import { resolveSurvey, autoIncidentals } from '../../lib/site.js';
import { computeWaste, WASTE_SCOPES, vehicleRealCost } from '../../lib/waste.js';
import { assessAsbestos, ASBESTOS_CLAUSE } from '../../lib/asbestos.js';
import { parseAdjustment, parseAdjustments, PROCESS_KEYWORDS, PROCESS_TO_SURVEY, surveyDrafts } from '../../lib/parse.js';
import { analyzeSurveyWithGemini, getGeminiKey } from '../../lib/gemini.js';
import { useSurveyGuide } from '../../lib/useSurveyGuide.js';
import { ocrAnalyzeWithTimeout } from '../../lib/ocr.js';
import { fileToThumb } from '../../lib/image.js';
import { copyText } from '../../lib/clipboard.js';
import {
  AlertCard,
  BigButton,
  Card,
  CheckRow,
  Details,
  Field,
  Fold,
  Pill,
  SectionCard,
  Segmented,
  Select,
  SmallButton,
  TextArea,
  TextInput,
  WarningBox,
  cx,
} from '../ui.jsx';

// 3단계 — 답사: 메모·사진 자동 반영 + 현장 점검(운반·실측·폐기물) + 빠뜨리기 쉬운 비용.
export default function SurveyTab({ c, update, calc, showToast }) {
  const waste = useMemo(() => computeWaste(c.waste, c), [c]);
  const asbestos = useMemo(() => assessAsbestos(c.asbestos), [c.asbestos]);
  const trade = calc.trade;
  // 석면·폐기물 블록은 철거가 실제로 들어간 현장만 (도배+욕실 복합에 철거 얘기를 붙이지 않는다)
  const isDemolition = trade === 'demolition' || hasScope(c, 'demolition');
  const isGroundwork = trade === 'groundwork' || hasScope(c, 'groundwork');

  return (
    <div className="space-y-4">
      <ChangeQuick c={c} update={update} calc={calc} showToast={showToast} />

      <SurveyGuideCard c={c} update={update} calc={calc} />

      <Fold
        label="현장 점검 (운반·실측·폐기물)"
        hint="층수·엘리베이터·폐기물만 확인하면 됩니다"
        badge={<Pill tone={calc.lifting.warnings.length ? 'warn' : 'ok'}>{calc.lifting.warnings.length ? '확인 필요' : '기본'}</Pill>}
      >
        <div className="space-y-3">
          <LiftingBlock c={c} update={update} calc={calc} />

          <Details label={`실측 체크리스트 (${Object.values(c.survey || {}).filter(Boolean).length}개 체크)`}>
            <div className="space-y-4">
              {SURVEY_GROUPS.map((g) => (
                <div key={g.id}>
                  <p className="mb-2 text-sm font-extrabold text-ink">{g.title}</p>
                  <div className="space-y-2">
                    {g.items.map((it) => (
                      <CheckRow
                        key={it.id}
                        checked={!!c.survey?.[it.id]}
                        onChange={(v) => update({ survey: { ...(c.survey || {}), [it.id]: v } })}
                        label={it.label}
                        hint={it.hint}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-600">
                체크한 항목은 견적의 ‘추가 비용’으로 자동 반영됩니다. 체크를 풀면 다시 빠집니다.
              </p>
            </div>
          </Details>

          <WasteBlock c={c} update={update} waste={waste} showToast={showToast} />
          {isGroundwork ? <GroundworkBlock c={c} update={update} /> : null}
          {isDemolition ? <AsbestosBlock c={c} update={update} asbestos={asbestos} showToast={showToast} /> : null}

          <CustomChecklist c={c} update={update} showToast={showToast} />
        </div>
      </Fold>

      <MissingLines c={c} update={update} calc={calc} showToast={showToast} />
    </div>
  );
}

// 답사 현장에서 '왜·뭘' 확인해야 하는지 — AI가 연결되어 있으면 이 현장에 맞춰 만든 4가지를 보여준다.
function SurveyGuideCard({ c, update, calc }) {
  const { aiOn, busy, guide, retry } = useSurveyGuide(c, calc, update);
  return (
    <Fold
      label="답사 때 꼭 볼 것"
      hint={
        guide.source === 'ai'
          ? 'AI가 이 현장에 맞춰 고른 확인 포인트 4가지입니다.'
          : '현장에서 이 4가지만 눈으로 보면, 나중에 돈이 새는 곳을 미리 막을 수 있습니다.'
      }
      badge={
        guide.source === 'ai' ? (
          <Pill tone="info">{busy ? 'AI 확인 중' : '🤖 AI 맞춤'}</Pill>
        ) : aiOn ? (
          <Pill tone="plain">{busy ? 'AI 확인 중' : '기본 가이드'}</Pill>
        ) : (
          <Pill tone="warn">확인 4가지</Pill>
        )
      }
    >
      <div className="space-y-2">
        {guide.rows.map((r, i) => (
          <div key={i} className="rounded-2xl bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[10px] font-black text-white">
                {i + 1}
              </span>
              {r.check}
            </p>
            {r.why ? <p className="mt-1 text-[13px] font-semibold leading-5 text-rose-800">왜: {r.why}</p> : null}
            {r.how ? <p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink-2">이렇게: {r.how}</p> : null}
          </div>
        ))}
        {guide.comment ? (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-2xs font-bold leading-4 text-brand-strong">🤖 {guide.comment}</p>
        ) : null}
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-2xs font-bold leading-4 text-amber-900">
          확인한 내용은 위 <b>1. 답사 메모</b>에 한 줄로 적으면 최종 견적에 바로 반영됩니다. (예: “폐기물 두 차는 나올듯”, “벽에 물기 많아 방수 필요”)
        </p>
        {aiOn ? (
          <button type="button" onClick={retry} className="text-2xs font-bold text-brand underline underline-offset-2">
            {guide.source === 'ai' ? 'AI로 이 현장 다시 뽑기' : 'AI로 이 현장에 맞춰 뽑기'}
          </button>
        ) : (
          <p className="text-2xs font-bold text-ink-3">설정에서 Gemini API 키를 연결하면 이 현장에 맞춰 AI가 다시 골라 줍니다.</p>
        )}
      </div>
    </Fold>
  );
}

// 기초·정지 현장에서 '이건 왜 없지?' 하는 실무 확인 — 돈이 아니라 사고를 막는 체크
const GROUND_CHECKS = [
  { id: 'gw_buried', label: '지하 매설 배관·전선 위치 확인', hint: '도면·탐지기 · 모르고 파면 복구비가 우리 몫' },
  { id: 'gw_access', label: '굴삭기 진입로 폭·상부 전선 높이', hint: '안 맞으면 소형 장비로 나눠 공사해야 합니다' },
  { id: 'gw_soil', label: '잔토(남는 흙) 반출처·계량증명서', hint: '허가업체 반출 · 처리 확인서 보관' },
  { id: 'gw_compact', label: '되메우기 30cm씩 나눠 다짐', hint: '한 번에 넣으면 나중에 꺼져 재시공입니다' },
];

function GroundworkBlock({ c, update }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-extrabold text-ink">기초·정지 현장 확인</p>
      <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">금액은 안 바뀌지만, 여기서 놓치면 나중에 배상으로 나갑니다.</p>
      <div className="mt-2 space-y-2">
        {GROUND_CHECKS.map((it) => (
          <CheckRow
            key={it.id}
            checked={!!c.survey?.[it.id]}
            onChange={(v) => update({ survey: { ...(c.survey || {}), [it.id]: v } })}
            label={it.label}
            hint={it.hint}
          />
        ))}
      </div>
    </div>
  );
}

function LiftingBlock({ c, update, calc }) {
  const lift = c.lifting || {};
  const setLift = (patch) => update({ lifting: { ...lift, ...patch } });  return (
    <div className="space-y-3">
      <p className="text-base font-extrabold text-slate-800">자재·폐기물 운반 4가지</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="몇 층인가요?">
          <TextInput
            inputMode="numeric"
            value={lift.floor ?? ''}
            onChange={(e) => setLift({ floor: e.target.value })}
            placeholder="예) 3"
            aria-label="층수"
          />
        </Field>
        <Field label="엘리베이터">
          <Select value={lift.elevator || 'unknown'} onChange={(e) => setLift({ elevator: e.target.value })} aria-label="엘리베이터">
            <option value="unknown">모름</option>
            <option value="yes">있음</option>
            <option value="no">없음</option>
          </Select>
        </Field>
        <Field label="사다리차 세울 수 있나요?">
          <Select value={lift.ladderAllowed || 'unknown'} onChange={(e) => setLift({ ladderAllowed: e.target.value })} aria-label="사다리차">
            <option value="unknown">모름</option>
            <option value="yes">가능</option>
            <option value="no">불가</option>
          </Select>
        </Field>
        <Field label="현관까지 거리(m)">
          <TextInput
            inputMode="numeric"
            value={lift.carryDistance ?? ''}
            onChange={(e) => setLift({ carryDistance: e.target.value })}
            placeholder="예) 20"
            aria-label="운반 거리"
          />
        </Field>
      </div>

      {calc.lifting.options.length ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-base font-bold text-slate-700">운반 방법 고르기</p>
          <div className="space-y-2">
            {calc.lifting.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setLift({ mode: o.id })}
                className={cx(
                  'flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base',
                  (lift.mode || calc.lifting.chosen?.id) === o.id
                    ? 'border-slate-900 bg-white font-extrabold text-slate-900'
                    : 'border-slate-200 bg-white font-semibold text-slate-600'
                )}
              >
                <span>{o.label}</span>
                <span className="tabular-nums">{o.cost}만원</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLift({ mode: 'none' })}
              className={cx(
                'flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base',
                lift.mode === 'none' ? 'border-slate-900 bg-white font-extrabold text-slate-900' : 'border-slate-200 bg-white font-semibold text-slate-600'
              )}
            >
              <span>양중 없음 (고객이 1층에서 직접 하차)</span>
              <span className="tabular-nums">0만원</span>
            </button>
          </div>
          {calc.lifting.chosen?.id === 'carry' ? (
            <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
              <p className="text-2xs font-extrabold text-ink-2">인력 반출 직접 계산 (인부 × 일당 + 트럭)</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <Field label="인부 수">
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="인부 수 줄이기" onClick={() => setLift({ carryPeople: Math.max(1, (parseInt(calc.lifting.carryPeople, 10) || 1) - 1) })} className="h-9 w-8 rounded-lg bg-slate-100 font-black">−</button>
                    <TextInput
                      className="h-9 min-h-0 px-1 text-center"
                      inputMode="numeric"
                      value={lift.carryPeople ?? calc.lifting.carryPeople}
                      onChange={(e) => setLift({ carryPeople: e.target.value })}
                      aria-label="인부 수"
                    />
                    <button type="button" aria-label="인부 수 늘리기" onClick={() => setLift({ carryPeople: (parseInt(calc.lifting.carryPeople, 10) || 1) + 1 })} className="h-9 w-8 rounded-lg bg-slate-100 font-black">+</button>
                  </div>
                </Field>
                <Field label="1톤차 대수">
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="트럭 대수 줄이기" onClick={() => setLift({ truckCount: Math.max(1, (parseInt(calc.lifting.truckCount, 10) || 1) - 1) })} className="h-9 w-8 rounded-lg bg-slate-100 font-black">−</button>
                    <TextInput
                      className="h-9 min-h-0 px-1 text-center"
                      inputMode="numeric"
                      value={lift.truckCount ?? calc.lifting.truckCount}
                      onChange={(e) => setLift({ truckCount: e.target.value })}
                      aria-label="트럭 대수"
                    />
                    <button type="button" aria-label="트럭 대수 늘리기" onClick={() => setLift({ truckCount: (parseInt(calc.lifting.truckCount, 10) || 1) + 1 })} className="h-9 w-8 rounded-lg bg-slate-100 font-black">+</button>
                  </div>
                </Field>
                <Field label="금액 직접(만원)">
                  <TextInput
                    className="h-9 min-h-0 px-1 text-center"
                    inputMode="decimal"
                    value={lift.carryAmount ?? ''}
                    onChange={(e) => setLift({ carryAmount: e.target.value })}
                    placeholder={`${calc.lifting.chosen.cost}`}
                    aria-label="인력 반출 금액"
                  />
                </Field>
              </div>
              <p className="mt-1 text-2xs font-semibold text-ink-3">지금 계산: {calc.lifting.chosen.cost}만원 (일당 {ratesOf(c)?.labor?.helper || 19}만 기준)</p>
            </div>
          ) : null}

          {['ladder_half', 'ladder_day', 'ladder_small'].includes(calc.lifting.chosen?.id) ? (
            <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
              <p className="text-2xs font-extrabold text-ink-2">
                사다리차 참고 범위 · 저층 단발 15~25만 / 반나절 25~40만 / 하루 45~65만
              </p>
              <div className="mt-1.5">
                <Field label="실제 부른 금액 (만원)">
                  <TextInput
                    inputMode="decimal"
                    value={lift[`ladder_${calc.lifting.chosen.id.replace('ladder_', '')}`] ?? ''}
                    onChange={(e) => setLift({ [`ladder_${calc.lifting.chosen.id.replace('ladder_', '')}`]: e.target.value })}
                    placeholder={`${calc.lifting.chosen.cost}`}
                    aria-label="사다리차 실제 금액"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {calc.lifting.warnings.length ? (
            <div className="mt-2">
              {calc.lifting.warnings.map((w, i) => (
                <p key={i} className="mt-1 flex gap-1.5 text-sm font-bold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChangeQuick({ c, update, calc, showToast }) {
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('increase');
  const [days, setDays] = useState('0');
  const [photo, setPhoto] = useState(false);
  const [reading, setReading] = useState(false);
  const logs = Array.isArray(c.changeLogs) ? c.changeLogs : [];
  const stack = Array.isArray(c.undoStack) ? c.undoStack : [];
  const sign = type === 'decrease' ? -1 : 1;
  const amountNum = Number(amount) || 0;
  const before = Math.round(calc.clientPrice);
  const adjList = parseAdjustments(memo);
  const adj = adjList[0] || null;
  const drafts = useMemo(() => surveyDrafts(memo, c, calc), [memo, c, calc]);
  const manualReady = !!memo.trim() && amountNum > 0;
  const hasPhotos = !!(c.photos && c.photos.length);
  // 글이 한 글자라도 있거나 사진이 1장이라도 붙었으면 절대 비활성화하지 않는다.
  const canApply = memo.trim().length > 0 || hasPhotos;

  const snapshot = () => ({
    changeLogs: c.changeLogs || [],
    survey: c.survey || {},
    waste: c.waste || {},
    tileRemain: c.tileRemain || false,
  });
  const pushUndo = (patch) => update({ ...patch, undoStack: [...stack.slice(-9), snapshot()] });

  const matchLog = (log, a) => {
    const text = `${log.item || ''} ${log.reason || ''}`;
    if (a?.label && text.includes(a.label)) return true;
    const proc = PROCESS_KEYWORDS.find((p) => p.id === a?.processId);
    return !!proc && proc.words.some((w) => text.includes(w));
  };

  // 한 번에 여러 개 빼기 — "사다리차 취소, 보양 제외"처럼 두 줄을 한 번에 처리한다.
  const cancelItem = () => {
    let nextLogs = [...logs];
    const surveyPatch = { ...(c.survey || {}) };
    let wastePatch = c.waste ? { ...c.waste } : null;
    const removed = [];
    for (const a of adjList) {
      const target = [...nextLogs].reverse().find((l) => matchLog(l, a));
      if (target) {
        nextLogs = nextLogs.filter((l) => l.id !== target.id);
        removed.push(`‘${target.item}’ ${target.amount}만원`);
        continue;
      }
      const surveyId = PROCESS_TO_SURVEY[a.processId];
      if (surveyId && surveyPatch[surveyId]) {
        surveyPatch[surveyId] = false;
        removed.push(`‘${a.label}’ 비용`);
        continue;
      }
      if (a.processId === 'waste' && wastePatch?.applyActual) {
        wastePatch = { ...wastePatch, applyActual: false };
        removed.push('폐기물 실비 반영');
      }
    }
    if (!removed.length) {
      showToast('뺄 항목을 찾지 못했습니다. 아래 변동 내역에서 직접 빼주세요');
      return;
    }
    pushUndo({ changeLogs: nextLogs, survey: surveyPatch, ...(wastePatch ? { waste: wastePatch } : {}) });
    showToast(`${removed.join(' · ')} 을(를) 견적에서 뺐습니다`);
    setMemo('');
  };

  const runApply = (text, provided) => {
    if (manualReady) {
      const log = {
        id: `chg-${Date.now()}`,
        item: memo.trim(),
        reason: memo.trim(),
        amount: amountNum,
        type,
        days: Number(days) || 0,
        photo,
        agreed: false,
        at: new Date().toISOString().slice(0, 10),
        before,
        after: Math.max(0, before + sign * amountNum),
        source: 'quick',
      };
      pushUndo({ changeLogs: [...logs, log] });
      setMemo('');
      setAmount('');
      setDays('0');
      setPhoto(false);
      showToast(`최종 견적을 ${Math.max(0, before + sign * amountNum).toLocaleString('ko-KR')}만원으로 바꿨습니다`);
      return;
    }
    const found = provided && provided.length ? provided : surveyDrafts(text, c, calc);
    if (!found.length) {
      update({ notes: `${c.notes || ''} ${text}`.trim() });
      setMemo('');
      showToast('답사 메모로 저장했습니다 — “폐기물 1톤”, “누수”, “타일 남김”처럼 쓰면 금액이 자동 반영됩니다');
      return;
    }
    let running = before;
    const newLogs = found.map((a, idx) => {
      const signed = a.type === 'decrease' ? -a.amount : a.amount;
      const log = {
        id: `${a.id || 'auto'}-${idx}-${Date.now()}`,
        item: a.item,
        reason: a.reason || a.item,
        amount: a.amount,
        type: a.type,
        days: a.days || 0,
        photo: hasPhotos,
        agreed: false,
        at: new Date().toISOString().slice(0, 10),
        before: running,
        after: running + signed,
        source: provided ? 'gemini' : 'survey-auto',
      };
      running += signed;
      return log;
    });
    pushUndo({ changeLogs: [...logs, ...newLogs] });
    setMemo('');
    showToast(`답사 ${newLogs.length}건 반영 — 최종 ${running.toLocaleString('ko-KR')}만원`);
  };

  const submit = async () => {
    if (adj?.cancel) {
      cancelItem();
      return;
    }
    let text = memo.trim();
    if (!text && hasPhotos) {
      setReading(true);
      try {
        const res = await ocrAnalyzeWithTimeout(
          c.photos.map((p) => p.dataUrl).filter(Boolean),
          () => setReading(true)
        );
        if (res.isScenePhoto) {
          showToast('글자 없는 현장 사진입니다 — 답사에서 달라진 점을 한 줄 적어주세요');
          setReading(false);
          return;
        }
        text = res.text || '';
        setMemo(text);
      } catch (e) {
        showToast(/[가-힣]/.test(String(e?.message || '')) ? e.message : '사진 글자를 읽지 못했습니다. 직접 적어주세요');
        setReading(false);
        return;
      } finally {
        setReading(false);
      }
    }
    if (!text) {
      showToast('답사에서 달라진 점을 한 줄만 적어주세요');
      return;
    }
    // 키가 있으면 AI가 사진까지 보고 변동 항목을 정밀하게 뽑는다. 실패하면 로컬 규칙으로.
    if (getGeminiKey() && !manualReady) {
      setReading(true);
      try {
        const ai = await analyzeSurveyWithGemini({
          memo: text,
          photos: c.photos || [],
          context: `${c.title || ''} / ${calc.targetSummary || ''} / 최종 ${Math.round(calc.clientPrice)}만`,
        });
        if (ai.ok && ai.data.items.length) {
          if (ai.data.signal) update({ aiSurveySignal: ai.data.signal });
          runApply(text, ai.data.items);
          return;
        }
        if (!ai.ok) showToast('AI 연결 실패 — 로컬 규칙으로 계산했습니다');
      } finally {
        setReading(false);
      }
    }
    runApply(text);
  };

  const undo = () => {
    if (!stack.length) return;
    const last = stack[stack.length - 1];
    update({
      changeLogs: last.changeLogs,
      survey: last.survey,
      waste: last.waste,
      tileRemain: last.tileRemain || false,
      undoStack: stack.slice(0, -1),
    });
    showToast('직전 상태로 되돌렸습니다');
  };

  const removeLog = (id) => {
    pushUndo({ changeLogs: logs.filter((l) => l.id !== id) });
    showToast('항목을 뺐습니다. 되돌리기로 복구할 수 있습니다');
  };

  return (
    <SectionCard
      num="1"
      title="답사 메모·사진"
      subtitle={`글·사진만 넣으면 항목·금액·일정을 앱이 잡습니다. 예) ${
        hasScope(c, 'demolition') || calc.trade === 'waste'
          ? '“폐기물 두 차는 나올듯”, “집게차 하루 더 필요”'
          : hasScope(c, 'bathroom')
          ? '“아래집 누수 흔적 있음”, “배관도 갈아야 할듯”'
          : '“자재 입고 하루 늦어짐”, “작업 범위 한 곳 추가”'
      }`}
      status={<Pill tone={calc.adjustmentTotal === 0 ? 'plain' : calc.adjustmentTotal > 0 ? 'warn' : 'ok'}>누적 {calc.adjustmentTotal > 0 ? '+' : ''}{calc.adjustmentTotal}만</Pill>}
    >
      <div className="space-y-2.5">
        <TextArea
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={`예) ${
            hasScope(c, 'demolition') || calc.trade === 'waste'
              ? '폐기물 두 차는 나올듯 / 집게차 하루 더 필요'
              : hasScope(c, 'bathroom')
              ? '아래집 누수 흔적 있음 / 배관도 갈아야 할듯'
              : '자재 입고 하루 늦어짐 / 작업 범위 한 곳 추가'
          }`}
          aria-label="현장 변동 내용"
        />

        <div className="flex gap-2">
          <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50">
            <Camera className="h-4 w-4" /> 현장 사진 붙이기 ({c.photos?.length || 0})
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="현장 답사 사진"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).slice(0, 6 - (c.photos?.length || 0));
                const thumbs = await Promise.all(files.map(fileToThumb));
                update({ photos: [...(c.photos || []), ...thumbs].slice(0, 6) });
                setPhoto(true);
                showToast(`현장 사진 ${thumbs.length}장을 붙였습니다 — 글 없이 버튼만 눌러도 읽습니다`);
                e.target.value = '';
              }}
            />
          </label>
          {stack.length ? (
            <SmallButton variant="white" onClick={undo} className="shrink-0">
              ↩︎ 되돌리기
            </SmallButton>
          ) : null}
        </div>

        {adj?.cancel ? (
          <WarningBox
            tone="info"
            title={`‘${adjList.map((a) => a.label).filter(Boolean).join('·') || '해당 항목'}’ 빼기로 읽었습니다`}
          >
            금액을 넣지 않아도 됩니다. 아래 버튼을 누르면 견적에서 바로 빠집니다.
          </WarningBox>
        ) : drafts.length ? (
          <AlertCard tone="warn" title={`답사 내용에서 ${drafts.length}건을 자동 계산했습니다`}>
            {drafts.map((a, i) => (
              <p key={i} className="font-bold">
                · {a.item}{' '}
                <span className={a.type === 'decrease' ? 'text-emerald-700' : 'text-rose-700'}>
                  {a.type === 'decrease' ? '-' : '+'}
                  {a.amount}만
                </span>
                {a.days ? ` · 일정 +${a.days}일` : ''}
              </p>
            ))}
            <p className="mt-1 text-2xs">금액을 몰라도 됩니다. 아래 버튼 하나만 누르면 최종 견적과 손님 문서가 함께 바뀝니다.</p>
          </AlertCard>
        ) : memo.trim() ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
            이 문장은 아직 금액으로 바뀌지 않습니다. 버튼을 누르면 메모로 저장되고, “폐기물 1톤·두 차”, “누수”, “타일 남김”처럼 쓰면 자동 반영됩니다.
          </p>
        ) : null}

        <Details label="직접 금액 고치기 (금액을 이미 아는 경우만)">
          <div className="space-y-2">
            <Segmented
              options={[
                { value: 'increase', label: '+ 늘어남' },
                { value: 'decrease', label: '- 줄어듦' },
              ]}
              value={type}
              onChange={setType}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="금액 (만원)">
                <TextInput
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예) 25"
                  aria-label="변동 금액"
                />
              </Field>
              <Field label="일정 (일)">
                <TextInput inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="일정 영향" />
              </Field>
            </div>
            {manualReady ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                {before.toLocaleString('ko-KR')}만 →{' '}
                <span className={sign > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  {Math.max(0, before + sign * amountNum).toLocaleString('ko-KR')}만
                </span>{' '}
                ({sign > 0 ? '+' : '-'}
                {amountNum}만)
              </p>
            ) : null}
          </div>
        </Details>

        <BigButton className="w-full" disabled={reading} onClick={submit} data-can-apply={canApply ? 'yes' : 'no'}>
          {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          {adj?.cancel ? '빼기 적용' : reading ? '사진 읽는 중…' : '답사 내용으로 최종 견적 다시 내기'}
        </BigButton>
        <p className="text-center text-2xs font-semibold text-ink-3">
          {canApply ? '누르면 최종 견적과 손님 문서가 함께 바뀝니다' : '답사 내용을 한 줄 적거나 사진을 붙이면 켜집니다'}
        </p>
      </div>

      {logs.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-extrabold text-ink">무엇이 왜 바뀌었나</p>
          {[...logs].reverse().map((l) => {
            const up = l.type !== 'decrease';
            return (
              <div key={l.id} className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px] font-bold leading-5 text-ink">
                    <span className={cx('mr-1 font-black', up ? 'text-rose-600' : 'text-emerald-600')}>{up ? '▲' : '▼'}</span>
                    {l.item || l.reason || '현장 변동'}
                  </p>
                  <span className={cx('num shrink-0 text-sm font-extrabold', up ? 'text-rose-600' : 'text-emerald-600')}>
                    {up ? '+' : '-'}
                    {l.amount}만
                  </span>
                  <button
                    type="button"
                    aria-label={`${l.item || '변동'} 빼기`}
                    onClick={() => removeLog(l.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600 ring-1 ring-slate-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">
                  이유: {l.reason || l.item}
                  {l.days ? ` · 일정 +${l.days}일` : ''}
                </p>
              </div>
            );
          })}
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-extrabold text-brand-strong">
            가견적 {Math.round(calc.baseClientPrice).toLocaleString('ko-KR')}만 → 최종 견적{' '}
            {Math.round(calc.clientPrice).toLocaleString('ko-KR')}만 ({calc.adjustmentTotal > 0 ? '+' : ''}
            {calc.adjustmentTotal}만)
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}

function MissingLines({ c, update, calc }) {
  const pyung = toPyung(c.sizeValue, c.sizeUnit, 15);
  const lift = c.lifting || {};
  const trade = calc.trade;
  const isLabor = trade === 'labor';
  const isWaste = trade === 'waste';
  const noSiteCare = isLabor || isWaste;
  const hasElevator = lift.elevator === 'yes';
  const ladderOff = lift.ladderAllowed === 'no';

  const rows = [];
  rows.push({ id: 'protectLevel', label: '보양(엘베·복도·현관)', detail: '공용부 파손은 우리 배상', amount: 8 });
  if (!noSiteCare) rows.push({ id: 'adminDeposit', label: '관리사무소 신고·동의서', detail: '신고 없이 착공하면 중단될 수 있음', amount: 8 });
  if (!noSiteCare && !hasElevator) rows.push({ id: 'materialLift', label: '자재를 층까지 올리는 인력', detail: '엘베 없음 · 계단 양중', amount: 15 });
  if (!noSiteCare && !hasElevator && !ladderOff) rows.push({ id: 'ladderHalf', label: '사다리차 반나절', detail: '자재·폐기물 반출', amount: 35 });
  if (trade === 'demolition' || trade === 'waste' || hasScope({ trade, subScopes: c?.subScopes }, 'demolition')) {
    rows.push({
      id: 'wasteMixed',
      label: '혼합 폐기물 있음',
      detail: '성상 분리 안 하면 처리비 3~6배',
      amount: Math.max(15, Math.round((calc.wasteTotal || 0) * 0.35)),
    });
  }
  if (!noSiteCare) {
    rows.push({
      id: 'afterCare',
      label: `준공 청소 (${pyung}평 기준)`,
      detail: '검수에서 가장 많이 지적되는 항목',
      amount: Math.max(20, Math.round(pyung * 1.3)),
    });
  }
  if (!/공실|빈집/.test(`${c.notes || ''} ${c.rawInput || ''}`)) {
    rows.push({ id: 'residential', label: '거주 중 시공', detail: '가구 이동·먼지막이·매일 청소', amount: 12 });
  }

  // 자동 포함(현장 조건) + 사용자가 직접 켜고 끈 값을 합쳐서 보여준다 — 2단계 금액과 같은 기준
  const resolved = resolveSurvey(c);
  const autoFlags = autoIncidentals(c);
  const isOn = (row) => !!resolved[row.id];
  const isAuto = (row) => c.survey?.[row.id] === undefined && !!autoFlags[row.id];
  const amountOf = (row) => {
    const raw = c.surveyAmounts ? c.surveyAmounts[row.id] : undefined;
    if (raw === null || raw === undefined || raw === '') return row.amount;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : row.amount;
  };
  const toggle = (row) => {
    const next = { ...(c.survey || {}), [row.id]: !isOn(row) };
    const patch = { survey: next };
    // 처음 켤 때는 지금 보이는 금액을 그대로 저장해 두고, 그 뒤로는 직접 고친 값을 쓴다.
    if (!isOn(row)) patch.surveyAmounts = { ...(c.surveyAmounts || {}), [row.id]: amountOf(row) };
    update(patch);
  };
  const setAmount = (row, value) =>
    update({ surveyAmounts: { ...(c.surveyAmounts || {}), [row.id]: value === '' ? '' : Number(value) } });

  const checkedRows = rows.filter(isOn);
  const total = checkedRows.reduce((sum, r) => sum + amountOf(r), 0);

  return (
    <Fold
      label="현장 부대비용"
      hint="현장 조건에 맞는 항목은 자동으로 들어가 있습니다 — 필요 없는 것만 눌러서 빼세요"
      badge={
        <Pill tone={checkedRows.length ? 'warn' : 'plain'}>
          {checkedRows.length}/{rows.length} · {total.toLocaleString('ko-KR')}만
        </Pill>
      }
    >
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const on = isOn(r);
          return (
            <div key={r.id} className={cx('rounded-xl px-3 py-2.5 transition', on ? 'bg-brand-soft' : 'bg-slate-50')}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                  <span
                    className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                      on ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className={cx('block text-sm font-bold leading-5', on ? 'text-brand-strong' : 'text-ink-2')}>
                      {r.label}
                      {isAuto(r) ? (
                        <span className="ml-1 rounded bg-white px-1 py-0.5 text-[10px] font-extrabold text-ink-3 ring-1 ring-slate-200">자동</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-ink-3">{r.detail}</span>
                  </span>
                </button>
                {on ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      className="field-input h-10 w-16 min-h-0 px-1 text-center text-sm"
                      inputMode="numeric"
                      value={amountOf(r)}
                      aria-label={`${r.label} 금액(만원)`}
                      onChange={(e) => setAmount(r, e.target.value)}
                    />
                    <span className="text-sm font-bold text-ink-3">만</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink-3">+{r.amount}만</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hasElevator ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-2xs font-bold leading-4 text-ink-3">
          엘리베이터가 있어 ‘자재 올리기·사다리차’는 목록에서 뺐습니다. 필요한 현장만 직접 추가하세요.
        </p>
      ) : null}
      {checkedRows.length ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
          지금 {checkedRows.length}개({total.toLocaleString('ko-KR')}만원)가 원가에 반영되어 있습니다. 금액을 고치면 바로 바뀝니다.
        </p>
      ) : (
        <p className="mt-2 text-2xs font-semibold leading-4 text-ink-3">아직 체크한 항목이 없습니다. 현장에서 확인한 것만 눌러주세요.</p>
      )}
    </Fold>
  );
}

function WasteBlock({ c, update, waste, showToast }) {
  const rates = ratesOf(c);
  const real = vehicleRealCost(c.waste, waste, rates);
  const setScope = (id, patch) =>
    update({ waste: { ...c.waste, scopes: { ...c.waste.scopes, [id]: { ...c.waste.scopes?.[id], ...patch } } } });

  return (
    <Details label={`폐기물 분리 계산 (${waste.totalTons}톤)`}>
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-600">
          같은 무게라도 섞으면 처리비가 최대 6배가 됩니다. 철거 범위를 체크하면 얼마 차이나는지 계산합니다.
        </p>
        {WASTE_SCOPES.map((s) => {
          const row = c.waste?.scopes?.[s.id] || { on: false, area: s.defaultArea };
          return (
            <div key={s.id} className={cx('rounded-xl border p-2', row.on ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50')}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CheckRow checked={!!row.on} onChange={(v) => setScope(s.id, { on: v })} label={s.label} />
                </div>
                {row.on ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      className="field-input w-16 px-1 text-center"
                      inputMode="decimal"
                      value={row.area ?? ''}
                      onChange={(e) => setScope(s.id, { area: e.target.value })}
                      aria-label={`${s.label} 면적`}
                    />
                    <span className="text-sm text-slate-500">㎡</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="rounded-2xl bg-slate-100 p-3">
          <p className="text-base font-extrabold text-slate-800">예상 {waste.totalTons}톤</p>
          <div className="mt-2 space-y-1 text-base">
            <div className="flex justify-between">
              <span>나눠서 버리면</span>
              <span className="font-bold tabular-nums">{waste.separatedWon.toLocaleString('ko-KR')}원</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span>섞어서 버리면</span>
              <span className="font-bold tabular-nums">{waste.mixedWon.toLocaleString('ko-KR')}원</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-extrabold text-amber-800">
              <span>차액</span>
              <span className="tabular-nums">
                +{waste.diffWon.toLocaleString('ko-KR')}원 ({waste.multiplier}배)
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            차량 실비: 1톤차 {waste.vehicles[0].count}대 {real.oneTon}만원 · 2.5톤차 {waste.vehicles[1].count}대 {real.twoHalf}만원 (단가표 기준)
          </p>
          {waste.warnings.map((w, i) => (
            <p key={i} className="mt-2 flex gap-1.5 text-sm font-bold text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SmallButton
            variant={c.waste?.applyActual ? 'dark' : 'white'}
            onClick={() =>
              update({
                waste: {
                  ...c.waste,
                  applyActual: !c.waste?.applyActual,
                  actualCost: real.best,
                  assignMode: 'separated',
                },
              })
            }
          >
            실비 {real.best}만원 반영
          </SmallButton>
          <SmallButton
            onClick={() =>
              copyText(
                `폐기물 ${waste.totalTons}톤 / 나눠서 ${waste.separatedWon.toLocaleString('ko-KR')}원 / 섞어서 ${waste.mixedWon.toLocaleString('ko-KR')}원\n계량증명서·인계서는 사진으로 남겨두세요.`,
                showToast
              )
            }
          >
            <Copy className="h-4 w-4" /> 계산 복사
          </SmallButton>
        </div>
        <p className="text-sm text-slate-500">※ 마대는 콘크리트·목재·석고·금속·비닐 5종류로 나눠 두세요.</p>
      </div>
    </Details>
  );
}

function AsbestosBlock({ c, update, asbestos, showToast }) {
  const set = (patch) => update({ asbestos: { ...c.asbestos, ...patch } });
  return (
    <Details label={`석면(천장 텍스) 조기경보 ${asbestos.suspected ? '— 의심' : ''}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="건물 준공연도">
            <TextInput inputMode="numeric" value={c.asbestos?.builtYear ?? ''} onChange={(e) => set({ builtYear: e.target.value })} placeholder="예) 1996" />
          </Field>
          <Field label="면적(㎡)">
            <TextInput inputMode="decimal" value={c.asbestos?.areaSqm ?? ''} onChange={(e) => set({ areaSqm: e.target.value })} placeholder="예) 45" />
          </Field>
          <Field label="건물 용도">
            <Select value={c.asbestos?.usage || 'unknown'} onChange={(e) => set({ usage: e.target.value })}>
              <option value="unknown">모름</option>
              <option value="house">주택</option>
              <option value="nonhouse">상가·사무실 등</option>
              <option value="facility">설비(배관·보온재)</option>
            </Select>
          </Field>
          <Field label="천장재">
            <Select value={c.asbestos?.ceiling || 'unknown'} onChange={(e) => set({ ceiling: e.target.value })}>
              <option value="unknown">모름</option>
              <option value="tex">텍스</option>
              <option value="gypsum">석고보드</option>
              <option value="none">없음(노출)</option>
            </Select>
          </Field>
        </div>

        <WarningBox tone={asbestos.suspected ? 'bad' : 'info'} title={asbestos.suspected ? '석면 조사가 필요합니다' : '확인 결과'}>
          <p>{asbestos.summary}</p>
          {asbestos.reasons.length ? <p className="mt-1 text-sm">근거: {asbestos.reasons.join(' · ')}</p> : null}
          {asbestos.suspected ? (
            <p className="mt-2 text-sm font-bold">
              조사 없이 철거하면 작업중지 + 3년 이하 징역 또는 3천만원 이하 벌금 대상입니다. 일정은 최소 2주를 잡으세요.
            </p>
          ) : null}
        </WarningBox>

        {asbestos.suspected ? (
          <>
            <div className="rounded-2xl bg-slate-100 p-3 text-base">
              <p className="font-extrabold text-slate-800">예상 폐석면 처리비</p>
              <p className="mt-1">
                텍스 {asbestos.texArea}㎡ × 9.5kg = {asbestos.texTons}톤 → 약{' '}
                <span className="font-extrabold">{Math.round(asbestos.disposalWon / 10000).toLocaleString('ko-KR')}만원</span>
              </p>
              <p className="text-sm text-slate-600">조사·철거·운반은 별도 (사례 300만 ~ 550~750만원)</p>
            </div>

            <div>
              <p className="mb-2 text-base font-bold text-slate-700">남은 준비 순서</p>
              <ol className="space-y-1 text-sm leading-6 text-slate-700">
                {asbestos.timeline.map((t) => (
                  <li key={t.day}>
                    <span className="mr-2 inline-block w-12 font-extrabold text-slate-500">{t.day}</span>
                    <span className="font-bold">{t.title}</span> — {t.detail}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              <p className="font-extrabold">견적서에 자동으로 들어가는 특약</p>
              <p className="mt-1">“{ASBESTOS_CLAUSE}”</p>
              <SmallButton className="mt-2 w-full" onClick={() => copyText(ASBESTOS_CLAUSE, showToast)}>
                <Copy className="h-4 w-4" /> 특약 복사
              </SmallButton>
            </div>
          </>
        ) : null}
      </div>
    </Details>
  );
}



// 맞춤 실측 체크 — AI가 뽑은 이 현장 전용 항목 + 직접 추가
function CustomChecklist({ c, update, showToast }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const list = Array.isArray(c.customChecklist) ? c.customChecklist : [];
  const aiChecks = c.aiAnalysis?.surveyChecks || [];
  const added = (x) => list.some((it) => it.label === x);
  const addItem = (item) => {
    update({ customChecklist: [...(c.customChecklist || []), { id: `c-${Date.now()}`, ...item }] });
    showToast('맞춤 체크 항목을 추가했습니다');
  };
  const keyOf = (it) => `custom_${it.id || it.label}`;
  return (
    <Details label={`맞춤 실측 체크 (${list.length + aiChecks.filter((x) => !added(x.label)).length})`} defaultOpen={false}>
      <div className="space-y-2">
        {aiChecks.length ? (
          <div className="rounded-xl bg-brand-soft/60 p-2.5">
            <p className="text-2xs font-extrabold text-brand-strong">🤖 AI가 이 현장에 맞춰 뽑은 확인 항목</p>
            <div className="mt-1 space-y-1.5">
              {aiChecks.map((x, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold leading-5 text-ink">{x.label}</p>
                    {x.why ? <p className="text-2xs leading-4 text-ink-3">{x.why}</p> : null}
                    {x.amount ? <p className="text-2xs font-extrabold text-rose-700">예상 +{x.amount}만</p> : null}
                  </div>
                  {added(x.label) ? (
                    <span className="shrink-0 text-2xs font-bold text-emerald-700">추가됨</span>
                  ) : (
                    <SmallButton variant="white" className="shrink-0" onClick={() => addItem({ label: x.label, memo: x.why || '', amount: x.amount || 0 })}>
                      + 추가
                    </SmallButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {list.map((it) => {
          const key = keyOf(it);
          const on = !!c.survey?.[key];
          return (
            <div key={it.id} className={cx('rounded-xl px-3 py-2', on ? 'bg-brand-soft' : 'bg-slate-50')}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => update({ survey: { ...(c.survey || {}), [key]: !on } })} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                  <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white')}>
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className={cx('block text-sm font-bold leading-5', on ? 'text-brand-strong' : 'text-ink-2')}>{it.label}</span>
                    {it.memo ? <span className="mt-0.5 block text-xs leading-4 text-ink-3">{it.memo}</span> : null}
                  </span>
                </button>
                {on ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      className="field-input h-10 w-16 min-h-0 px-1 text-center text-sm"
                      inputMode="numeric"
                      value={c.surveyAmounts?.[key] ?? it.amount ?? 0}
                      aria-label={`${it.label} 금액(만원)`}
                      onChange={(e) => update({ surveyAmounts: { ...(c.surveyAmounts || {}), [key]: e.target.value === '' ? '' : Number(e.target.value) } })}
                    />
                    <span className="text-sm font-bold text-ink-3">만</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-extrabold text-ink-3">{it.amount ? `+${it.amount}만` : '0만'}</span>
                )}
              </div>
            </div>
          );
        })}

        {open ? (
          <div className="space-y-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <Field label="항목 제목">
              <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예) 외벽 코킹, 곰팡이 제거" aria-label="추가 항목 제목" />
            </Field>
            <Field label="메모 (왜 봐야 하나)">
              <TextInput value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예) 누수 흔적 있어 방수 필요" aria-label="추가 항목 메모" />
            </Field>
            <Field label="예상 추가금 (만원, 0 가능)">
              <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예) 15" inputMode="numeric" aria-label="추가 항목 금액" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <SmallButton variant="white" onClick={() => setOpen(false)}>취소</SmallButton>
              <SmallButton
                variant="brand"
                onClick={() => {
                  if (!label.trim()) return showToast('항목 제목을 적어주세요');
                  addItem({ label: label.trim(), memo: memo.trim(), amount: Math.max(0, Number(amount) || 0) });
                  setLabel('');
                  setMemo('');
                  setAmount('');
                  setOpen(false);
                }}
              >
                추가
              </SmallButton>
            </div>
          </div>
        ) : (
          <SmallButton variant="white" className="w-full" onClick={() => setOpen(true)}>
            + 직접 항목 추가 (제목·메모·예상 추가금)
          </SmallButton>
        )}
      </div>
    </Details>
  );
}
