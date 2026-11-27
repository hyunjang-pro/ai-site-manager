import React from 'react';
import { Check, Info, TrendingUp, TriangleAlert } from 'lucide-react';
import { Card, cx } from './ui.jsx';
import { marketHeadline } from '../lib/engine/sanity.js';

// 「보통 시세 안내」 — 어머님·아버님이 한눈에 읽는 카드.
// · 보통 이 작업이 얼마인지 (시세 범위)
// · 지금 견적이 왜 이 금액인지 (원가 구성 + 남긴 돈)
// · 앱이 시세 밖으로 나간 값을 자동으로 되돌렸으면 그 사실까지
// 글자는 크고 문장은 짧게, 전문용어(마진율·부대비·적산)는 화면에 쓰지 않는다.
const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR');

const TONE = {
  in: { pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', label: '시세 안에 있어요', Icon: Check },
  lowish: { pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', label: '시세 안에 있어요', Icon: Check },
  highish: { pill: 'bg-amber-50 text-amber-800', bar: 'bg-amber-500', label: '보통보다 조금 높아요', Icon: TriangleAlert },
  low: { pill: 'bg-amber-50 text-amber-800', bar: 'bg-amber-500', label: '보통보다 낮아요', Icon: TriangleAlert },
  over: { pill: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500', label: '시세보다 많이 높아요', Icon: TriangleAlert },
  below: { pill: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500', label: '시세보다 많이 낮아요', Icon: TriangleAlert },
  none: { pill: 'bg-slate-100 text-ink-2', bar: 'bg-slate-400', label: '확인 필요', Icon: Info },
};

export default function MarketBandCard({ calc, className = '', compact = false }) {
  const s = calc?.sanity;
  const band = s?.band;
  if (!s || !band || s.disabled || !s.checked) return null;

  const price = Math.round(s.fullPrice || s.price || calc.clientPrice || 0);
  const tone = TONE[s.position] || TONE.none;
  const span = Math.max(1, band.max - band.min);
  const pct = (v) => Math.max(0, Math.min(100, ((v - band.min) / span) * 100));
  const inside = s.position === 'in' || s.position === 'lowish' || s.position === 'highish';
  const headline = marketHeadline(band);
  const why = s.why || '';
  const surchargeNote =
    Number(s.surchargeShare) > 0.04
      ? ` · 현장 할증 ${Math.round(price * Number(s.surchargeShare))}만은 빼고 봤어요`
      : '';

  return (
    <Card className={cx('p-4', className)} data-testid="market-band">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
          <TrendingUp className="h-4 w-4 text-brand" strokeWidth={2.6} />
          보통 시세 안내
        </p>
        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-2xs font-extrabold leading-4', tone.pill)}>
          <tone.Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
          {tone.label}
        </span>
      </div>

      {/* 보통 시세 — 큰 글씨 한 줄 */}
      <p className="mt-2 text-[15.5px] font-extrabold leading-6 text-ink" data-testid="market-headline">
        {headline}
      </p>

      {compact ? null : (
        <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-ink-3">우리 견적</p>
            <p className="text-xs font-bold text-ink-3">
              보통 <span className="num text-ink-2">{band.low}~{band.high}</span>만
            </p>
          </div>
          <p className="num mt-0.5 text-[22px] font-black leading-7 tracking-tight text-ink">
            {fmt(price)}
            <span className="ml-1 text-sm font-bold text-ink-3">만원</span>
          </p>
          {/* 시세 막대 — 회색 트랙(하한~상한) 안에 초록 구간(보통 시세), 지금 견적은 표식 하나 */}
          <div className="relative mt-2 h-3" aria-hidden>
            <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-slate-200" />
            <div
              className="absolute top-1 h-1 rounded-full bg-emerald-300"
              style={{ left: `${pct(band.low)}%`, width: `${Math.max(2, pct(band.high) - pct(band.low))}%` }}
            />
            <span
              className={cx('absolute -top-0.5 h-4 w-1.5 rounded-full ring-2 ring-white', tone.bar)}
              style={{ left: `calc(${pct(price)}% - 3px)` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-bold text-ink-4">
            <span>{band.min}만</span>
            <span>{band.max}만</span>
          </div>
        </div>
      )}

      {/* 왜 이 금액인지 — 어머님이 읽어도 바로 이해되는 두 줄 */}
      {why ? (
        <p className="mt-2 text-[14px] font-semibold leading-6 text-ink-2" data-testid="market-why">
          {why}
        </p>
      ) : null}

      {s.adjusted ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold leading-5 text-amber-900 ring-1 ring-amber-200">
          {s.cannotFix === 'costAboveMax'
            ? '원가가 이미 시세보다 높아요. 물량·범위를 한 번 더 확인하세요.'
            : '앱이 시세에 맞춰 금액을 자동으로 조정했어요.'}
        </p>
      ) : null}

      <p className="mt-1.5 text-[11.5px] font-semibold leading-4 text-ink-3">
        {String(band.basis).split(' · ')[0]} · 2026년 지역 시세{surchargeNote}
      </p>
    </Card>
  );
}
