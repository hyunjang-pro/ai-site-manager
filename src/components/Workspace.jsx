import React, { useMemo } from 'react';
import { ArrowRight, Check, FileSignature, FileText, HardHat, TrendingUp } from 'lucide-react';
import { STAGES, STAGE_LABEL, TRADES } from '../lib/constants.js';
import { computeEstimate, sizeText } from '../lib/pricing.js';
import { assessAsbestos } from '../lib/asbestos.js';
import { computeWaste } from '../lib/waste.js';
import { translateDesign } from '../lib/design.js';
import { buildGates } from '../lib/gates.js';
import EstimateTab from './tabs/EstimateTab.jsx';
import ProfitTab from './tabs/ProfitTab.jsx';
import BuildTab from './tabs/BuildTab.jsx';
import DocTab from './tabs/DocTab.jsx';
import { BigButton, Pill, TradeIcon, cx } from './ui.jsx';

export const TABS = [
  { n: 1, label: '견적·실측', short: '견적', Icon: FileText },
  { n: 2, label: '수익·값 지키기', short: '수익', Icon: TrendingUp },
  { n: 3, label: '시공·발주', short: '시공', Icon: HardHat },
  { n: 4, label: '손님 문서', short: '문서', Icon: FileSignature },
];

export default function Workspace({ activeCase, updateCase, tab, setTab, showToast, apiKey, goHome, onMoveToArchive, completedCases = [], onOpenSettings }) {
  const calc = useMemo(() => computeEstimate(activeCase), [activeCase]);
  const design = useMemo(() => translateDesign(activeCase), [activeCase]);
  const waste = useMemo(() => computeWaste(activeCase.waste, activeCase), [activeCase]);
  const asbestos = useMemo(() => assessAsbestos(activeCase.asbestos), [activeCase.asbestos]);
  const gates = useMemo(() => buildGates(activeCase, calc.trade), [activeCase, calc.trade]);

  const info = TRADES[calc.trade] || TRADES.unclassified;
  const stageIdx = STAGES.findIndex((s) => s.id === activeCase.stage);

  const goNext = () => {
    if (tab < 4) {
      setTab(tab + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      goHome();
    }
  };

  return (
    <main className="mx-auto max-w-3xl pb-48">
      {/* 현장 요약 + 단계 */}
      <div className="border-b border-slate-200/70 bg-white no-print">
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
                <TradeIcon trade={calc.trade} size="sm" className="h-5 w-5 rounded-md" />
                <span className="truncate">
                  {info.label} · {activeCase.region} · {sizeText(activeCase)}
                </span>
              </p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-2xs font-bold text-ink-3">견적</span>
                <span className="num text-[26px] font-extrabold leading-8 tracking-tight text-ink">
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
                <b className={cx('num font-bold', calc.netProfitBuffered > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {Math.round(calc.netProfitBuffered)}만
                </b>
              </span>
            </div>
          </div>

          {/* 진행 단계 */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5">
            {STAGES.map((s, i) => {
              const active = activeCase.stage === s.id;
              const passed = stageIdx > i;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    updateCase(
                      s.id === 'closed' ? { stage: 'closed', collection: 'settled' } : { stage: s.id }
                    );
                  }}
                  className={cx(
                    'flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-bold transition',
                    active
                      ? 'bg-brand text-white'
                      : passed
                      ? 'bg-brand-soft text-brand'
                      : 'bg-slate-100 text-ink-3'
                  )}
                >
                  {passed ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* 순서 탭 */}
        <nav className="border-t border-slate-100">
          <div className="grid grid-cols-4 gap-1 px-2">
            {TABS.map((t) => {
              const active = tab === t.n;
              return (
                <button
                  key={t.n}
                  type="button"
                  onClick={() => {
                    setTab(t.n);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={cx(
                    'relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-2xs font-bold transition',
                    active ? 'text-brand' : 'text-ink-3'
                  )}
                >
                  <t.Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.6 : 2} />
                  <span className="whitespace-nowrap">
                    {t.n}단계 · {t.short}
                  </span>
                  {active ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-brand" /> : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="px-4 py-3.5">
        {tab === 1 ? (
          <EstimateTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            design={design}
            waste={waste}
            asbestos={asbestos}
            showToast={showToast}
            apiKey={apiKey}
            completedCases={completedCases}
            onGoNext={() => {
              setTab(2);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoDoc={() => {
              setTab(4);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : null}
        {tab === 2 ? <ProfitTab c={activeCase} update={updateCase} calc={calc} showToast={showToast} onOpenSettings={onOpenSettings} /> : null}
        {tab === 3 ? (
          <BuildTab
            c={activeCase}
            update={updateCase}
            calc={calc}
            gates={gates}
            design={design}
            showToast={showToast}
            onMoveToArchive={onMoveToArchive}
          />
        ) : null}
        {tab === 4 ? (
          <DocTab c={activeCase} update={updateCase} calc={calc} design={design} waste={waste} asbestos={asbestos} showToast={showToast} completedCases={completedCases} />
        ) : null}
      </div>

      {/* 다음 단계 */}
      <div className="bottom-bar fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/92 px-4 pt-2.5 backdrop-blur no-print">
        <div className="mx-auto max-w-3xl">
          <BigButton variant={tab === 4 ? 'ghost' : 'primary'} className="w-full" onClick={goNext}>
            {tab < 4 ? (
              <>
                다음: {TABS[tab].n}단계 {TABS[tab].label} <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
              </>
            ) : (
              <>장부로 돌아가기</>
            )}
          </BigButton>
          <p className="mt-1 text-center text-2xs text-ink-3">
            {tab < 4
              ? `${TABS[tab - 1].label} → ${TABS[tab].label} 순서입니다`
              : `현재 단계: ${STAGE_LABEL[activeCase.stage]}`}
          </p>
        </div>
      </div>
    </main>
  );
}
