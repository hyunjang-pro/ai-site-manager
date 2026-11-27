import React from 'react';
import { cx } from './ui.jsx';

// 원가가 어떻게 나왔는지 한눈에 — 2단계(가견적)·4단계(최종·수익)가 같은 모양으로 보여 준다.
// 어머님이 읽는 화면이라 표·전문용어 대신 '인건비 + 폐기물 = 기본 원가 → 예비비 → 보수적 원가' 흐름만 남긴다.
const pers = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('ko-KR') : '0');

export default function CostFlow({ calc, title = '이 원가는 이렇게 나왔어요', className = '' }) {
  const labor = Math.round(calc.laborTotal || 0);
  const waste = Math.round((calc.wasteTotal || 0) + (calc.equipTotal || 0));
  const material = Math.round(calc.materialTotal || 0);
  const site = Math.round(calc.surchargeExtra || 0);
  const adjust = Math.round(calc.adjustTotal || 0);
  const base = Math.round(calc.totalDirectCost || 0);
  const buffer = Math.round(calc.costBuffer || 0);
  const cost = Math.round(calc.costWithBuffer || 0);
  const plan = calc.crewPlan;

  const rows = [
    { id: 'labor', label: '인건비', value: labor, tone: 'bg-brand' },
    { id: 'waste', label: '폐기물·장비', value: waste, tone: 'bg-amber-500' },
    { id: 'material', label: '자재', value: material, tone: 'bg-cyan-500' },
    { id: 'site', label: '현장·규제', value: site, tone: 'bg-violet-500' },
    { id: 'adjust', label: '답사 변동', value: adjust, tone: adjust < 0 ? 'bg-emerald-500' : 'bg-rose-500' },
  ].filter((r) => Math.round(r.value) !== 0);
  const shown = rows.length ? rows : [{ id: 'none', label: '원가', value: base, tone: 'bg-slate-400' }];
  const barTotal = Math.max(1, shown.reduce((s, r) => s + Math.max(0, r.value), 0));

  return (
    <div className={cx('rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200', className)}>
      <p className="text-[13px] font-extrabold text-ink">{title}</p>

      {/* 어떤 돈이 얼마나 들어가는지 — 막대 한 줄 */}
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
        {shown.map((r) => (
          <span
            key={r.id}
            className={r.tone}
            style={{ width: `${Math.max(0, Math.min(100, (Math.max(0, r.value) / barTotal) * 100))}%` }}
            title={`${r.label} ${pers(r.value)}만`}
          />
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {shown.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-1.5 font-bold text-ink-2">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', r.tone)} />
              {r.label}
            </span>
            <span className={cx('num shrink-0 font-extrabold', r.value < 0 ? 'text-emerald-700' : 'text-ink')}>
              {r.value > 0 ? '+' : ''}
              {pers(r.value)}만
            </span>
          </div>
        ))}
      </div>

      {/* 기본 원가 → 예비비 → 보수적 원가 */}
      <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[12.5px] font-bold text-ink-2">
        <div className="flex items-center justify-between">
          <span>{adjust !== 0 ? '답사 변동 반영한 기본 원가' : '기본 원가'}</span>
          <span className="num font-extrabold text-ink">{pers(base)}만</span>
        </div>
        {calc.bufferRate > 0 ? (
          <div className="flex items-center justify-between">
            <span>돌발 예비비 {calc.bufferRate}%</span>
            <span className="num font-extrabold text-ink">+{pers(buffer)}만</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span>돌발 예비비</span>
            <span className="text-[11.5px] font-bold text-ink-3">차량 실비라 따로 안 잡았어요</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
          <span className="text-[13px] font-extrabold text-ink">보수적 원가</span>
          <span className="num text-[15px] font-black text-ink">{pers(cost)}만</span>
        </div>
      </div>

      {/* 추천 인원 × 일수 — 왜 그 조합이 가장 싼지 한 줄로 */}
      {plan && plan.crew ? (
        <div className="mt-2 rounded-xl bg-emerald-50 px-2.5 py-2 ring-1 ring-emerald-200">
          <p className="text-[12.5px] font-extrabold text-emerald-900">
            추천 투입 {plan.crew}명 × {plan.days}일
          </p>
          <p className="mt-0.5 text-[11.5px] font-semibold leading-4 text-emerald-800">{plan.why}</p>
        </div>
      ) : null}
    </div>
  );
}
