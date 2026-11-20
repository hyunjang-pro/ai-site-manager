import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardList, Compass, FileSignature, FileText, HardHat, TrendingUp } from 'lucide-react';
import { STAGES, STAGE_LABEL, TRADES } from '../lib/constants.js';
import { computeEstimate, sizeText } from '../lib/pricing.js';
import { assessAsbestos } from '../lib/asbestos.js';
import { computeWaste } from '../lib/waste.js';
import { translateDesign } from '../lib/design.js';
import { buildGates } from '../lib/gates.js';
import InfoTab from './tabs/InfoTab.jsx';
import EstimateTab from './tabs/EstimateTab.jsx';
import SurveyTab from './tabs/SurveyTab.jsx';
import ProfitTab from './tabs/ProfitTab.jsx';
import BuildTab from './tabs/BuildTab.jsx';
import DocTab from './tabs/DocTab.jsx';
import { BigButton, Pill, TradeIcon, cx } from './ui.jsx';

// 6단계 스테이지 — 정보 → 가견적 → 답사 → 최종·수익 → 시공 → 문서
export const TABS = [
  { n: 1, label: '정보', Icon: ClipboardList },
  { n: 2, label: '가견적', Icon: FileText },
  { n: 3, label: '답사', Icon: Compass },
  { n: 4, label: '최종·수익', Icon: TrendingUp },
  { n: 5, label: '시공', Icon: HardHat },
  { n: 6, label: '문서', Icon: FileSignature },
];

export default function Workspace({
  activeCase,
  updateCase,
  tab,
  setTab,
  showToast,
  apiKey,
  goHome,
  onMoveToArchive,
  completedCases = [],
  onOpenSettings,
}) {
  const [docView, setDocView] = useState('quote');
  const calc = useMemo(() => computeEstimate(activeCase), [activeCase]);
  const design = useMemo(() => translateDesign(activeCase), [activeCase]);
  const waste = useMemo(() => computeWaste(activeCase.waste, activeCase), [activeCase]);
  const asbestos = useMemo(() => assessAsbestos(activeCase.asbestos), [activeCase.asbestos]);
  const gates = useMemo(() => buildGates(activeCase, calc.trade), [activeCase, calc.trade]);

  const info = TRADES[calc.trade] || TRADES.unclassified;
  const tradeLabel = activeCase.tradeName && (calc.trade === 'custom' || calc.trade === 'unclassified') ? activeCase.tradeName : info.label;
  const stageIdx = STAGES.findIndex((s) => s.id === activeCase.stage);

  // 어느 단계로 가든 화면 맨 위부터 보여준다.
  const goTab = (n) => {
    setTab(n);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const goNext = () => {
    if (tab < 6) goTab(tab + 1);
    else goHome();
  };
  const nextTab = TABS[tab]; // tab(1~6) → 다음 단계는 TABS[tab]

  return (
    <main className="mx-auto max-w-3xl pb-44">
      {/* 현장 요약 + 장부 단계 */}
      <div className="border-b border-slate-200/70 bg-white no-print">
        <div className="px-4 pb-2 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
                <TradeIcon trade={calc.trade} size="sm" className="h-5 w-5 rounded-md" />
                <span className="truncate">
                  {tradeLabel} · {activeCase.region} · {sizeText(activeCase)}
                </span>
              </p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-2xs font-bold text-ink-3">견적</span>
                <span className="num whitespace-nowrap text-[26px] font-extrabold leading-8 tracking-tight text-ink">
                  {Math.round(calc.finalPrice).toLocaleString('ko-KR')}
                  <span className="ml-0.5 text-sm font-bold text-ink-3">만원</span>
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
              <Pill tone={calc.netProfitBuffered <= 0 ? 'bad' : calc.isUncertain ? 'warn' : 'ok'}>
                {calc.netProfitBuffered <= 0 ? '손해 위험' : calc.isUncertain ? '정보 부족' : '보호됨'}
              </Pill>
              <span className="text-2xs font-semibold text-ink-3">
                남는 돈(보수적){' '}
                <b className={cx('num whitespace-nowrap font-bold', calc.netProfitBuffered > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {Math.round(calc.netProfitBuffered)}만
                </b>
              </span>
            </div>
          </div>

          {/* 장부 단계 (가견적·실측·시공중·잔금·완료) */}
          <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
            {STAGES.map((s, i) => {
              const active = activeCase.stage === s.id;
              const passed = stageIdx > i;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    updateCase(s.id === 'closed' ? { stage: 'closed', collection: 'settled' } : { stage: s.id });
                  }}
                  className={cx(
                    'flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-bold transition',
                    active ? 'bg-brand text-white' : passed ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-ink-3'
                  )}
                >
                  {passed ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6단계 스테이지 탭 — 390px에서 3×2로 접힌다 */}
        <nav className="border-t border-slate-100" aria-label="현장 단계">
          <div className="grid grid-cols-3 gap-1 px-2 py-1.5">
            {TABS.map((t) => {
              const active = tab === t.n;
              return (
                <button
                  key={t.n}
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  onClick={() => {
                    if (t.n === 6) setDocView('quote');
                    goTab(t.n);
                  }}
                  className={cx(
                    'flex min-h-11 items-center justify-center gap-1 rounded-xl text-[12.5px] font-extrabold transition',
                    active ? 'bg-brand text-white shadow-brand' : 'bg-slate-50 text-ink-2 active:bg-slate-100'
                  )}
                >
                  <span
                    className={cx(
                      'num flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-black',
                      active ? 'bg-white/25 text-white' : 'bg-white text-ink-3'
                    )}
                  >
                    {t.n}
                  </span>
                  <t.Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={active ? 2.8 : 2.2} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="px-4 py-3.5">
        {tab === 1 ? (
          <InfoTab c={activeCase} update={updateCase} calc={calc} showToast={showToast} onGoEstimate={() => goTab(2)} />
        ) : null}
        {tab === 2 ? (
          <EstimateTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            design={design}
            waste={waste}
            showToast={showToast}
            apiKey={apiKey}
            completedCases={completedCases}
            onGoSurvey={() => goTab(3)}
            onGoDoc={() => {
              setDocView('subsidy');
              goTab(6);
            }}
          />
        ) : null}
        {tab === 3 ? <SurveyTab c={activeCase} update={updateCase} calc={calc} showToast={showToast} /> : null}
        {tab === 4 ? (
          <ProfitTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            design={design}
            showToast={showToast}
            onOpenSettings={onOpenSettings}
          />
        ) : null}
        {tab === 5 ? (
          <BuildTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            gates={gates}
            design={design}
            showToast={showToast}
            onMoveToArchive={onMoveToArchive}
            onOpenNotice={() => {
              setDocView('notice');
              goTab(6);
            }}
          />
        ) : null}
        {tab === 6 ? (
          <DocTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            design={design}
            waste={waste}
            asbestos={asbestos}
            showToast={showToast}
            completedCases={completedCases}
            docView={docView}
            setDocView={setDocView}
          />
        ) : null}
      </div>

      {/* 다음 단계 */}
      <div className="bottom-bar fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/92 px-4 pt-2.5 backdrop-blur no-print">
        <div className="mx-auto max-w-3xl">
          <BigButton variant={tab === 6 ? 'ghost' : 'primary'} className="w-full" onClick={goNext}>
            {tab < 6 ? (
              <>
                다음: {nextTab.n}단계 {nextTab.label} <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
              </>
            ) : (
              <>장부로 돌아가기</>
            )}
          </BigButton>
          <p className="mt-1 text-center text-2xs text-ink-3">
            {tab < 6 ? `${TABS[tab - 1].label} → ${nextTab.label} 순서입니다` : `현재 단계: ${STAGE_LABEL[activeCase.stage]}`}
          </p>
        </div>
      </div>
    </main>
  );
}
