import React, { useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Plus, Search, SlidersHorizontal, Wallet, X } from 'lucide-react';
import {
  COLLECTION_LABEL,
  COLLECTION_STAGES,
  REGIONS,
  STAGES,
  STAGE_LABEL,
  TRADES,
  TRADE_LIST,
} from '../lib/constants.js';
import { computeEstimate, sizeText } from '../lib/pricing.js';
import {
  BigButton,
  Card,
  Details,
  Hero,
  Modal,
  Pill,
  RangeMeter,
  TradeIcon,
  cx,
} from './ui.jsx';

const STAGE_TONE = {
  prelim: 'info',
  survey: 'plain',
  working: 'ok',
  balance: 'warn',
  closed: 'lock',
};

const STAGE_DOT = {
  prelim: 'bg-brand',
  survey: 'bg-indigo-400',
  working: 'bg-emerald-500',
  balance: 'bg-amber-500',
  closed: 'bg-slate-300',
};

function monthKey(dateStr) {
  if (!dateStr) return '날짜 없음';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '날짜 없음';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export default function HomeScreen({ cases, onOpen, onUpdate, onNew, onDelete, savedAt, bids = { open: 0, soon: 0 }, onOpenBids }) {
  const [view, setView] = useState('active');
  const [stageFilter, setStageFilter] = useState(null);
  const [region, setRegion] = useState('전체');
  const [tradeF, setTradeF] = useState('전체');
  const [collection, setCollection] = useState('전체');
  const [query, setQuery] = useState('');
  const [pickFor, setPickFor] = useState(null);
  const [closedMonths, setClosedMonths] = useState({});

  const withCalc = useMemo(() => cases.map((c) => ({ ...c, _calc: computeEstimate(c) })), [cases]);

  const counts = useMemo(() => {
    const out = { prelim: 0, survey: 0, working: 0, balance: 0, closed: 0 };
    withCalc.forEach((c) => {
      out[c.stage] = (out[c.stage] || 0) + 1;
    });
    return out;
  }, [withCalc]);

  const activeValue = useMemo(
    () =>
      withCalc
        .filter((c) => c.stage !== 'closed')
        .reduce((sum, c) => sum + (c._calc?.clientPrice || 0), 0),
    [withCalc]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withCalc
      .filter((c) => (view === 'active' ? c.stage !== 'closed' : c.stage === 'closed'))
      .filter((c) => (stageFilter ? c.stage === stageFilter : true))
      .filter((c) => (region === '전체' ? true : c.region === region))
      .filter((c) => (tradeF === '전체' ? true : c.trade === tradeF))
      .filter((c) => (collection === '전체' ? true : c.collection === collection))
      .filter((c) =>
        q ? `${c.title} ${c.clientName} ${c.location} ${c.notes}`.toLowerCase().includes(q) : true
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [withCalc, view, stageFilter, region, tradeF, collection, query]);

  const groups = useMemo(() => {
    const map = {};
    filtered.forEach((c) => {
      const k = monthKey(c.createdAt);
      if (!map[k]) map[k] = [];
      map[k].push(c);
    });
    return Object.entries(map);
  }, [filtered]);

  const resetFilters = () => {
    setStageFilter(null);
    setRegion('전체');
    setTradeF('전체');
    setCollection('전체');
    setQuery('');
  };

  const activeFilterCount =
    (region !== '전체' ? 1 : 0) + (tradeF !== '전체' ? 1 : 0) + (collection !== '전체' ? 1 : 0);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-44 pt-4">
      {/* 오늘 장부 — 진한 네이비 히어로 */}
      <Hero
        eyebrow={`${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · 오늘 장부`}
        value={Math.round(activeValue).toLocaleString('ko-KR')}
        unit="만원"
        sub={`진행 중 ${counts.prelim + counts.survey + counts.working + counts.balance}곳 · 정산 완료 ${counts.closed}곳`}
        badge={<span className="rounded-lg bg-emerald-400/20 px-2 py-1 text-2xs font-extrabold text-emerald-300">보수적 원가 적용</span>}
        className="mb-3"
      >
        <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white/10 p-1.5">
          {STAGES.slice(0, 4).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setView('active');
                setStageFilter(stageFilter === s.id ? null : s.id);
                window.scrollTo({ top: 240, behavior: 'smooth' });
              }}
              className={cx(
                'rounded-xl px-1 py-1.5 text-center transition',
                stageFilter === s.id ? 'bg-white/25 ring-1 ring-white/40' : 'active:bg-white/15'
              )}
            >
              <span className="block text-[10px] font-bold text-blue-200">{s.label}</span>
              <span className="num mt-0.5 block text-lg font-black leading-6 text-white">
                {counts[s.id] || 0}
                <span className="ml-0.5 text-[10px] font-bold text-blue-300">건</span>
              </span>
            </button>
          ))}
        </div>
      </Hero>

      {/* 관공서 일감 입구 */}
      {onOpenBids ? (
        <button
          type="button"
          onClick={onOpenBids}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border-2 border-blue-900/10 bg-white px-4 py-3 text-left shadow-card active:bg-slate-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 text-white">
            <Building2 className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
              관공서 일감
              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-600">
                {bids.soon > 0 ? `D-5 안에 ${bids.soon}건` : '매일 갱신'}
              </span>
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-ink-3">
              안동·경북 접수 중 {bids.open}건 · 투찰가·남는 돈 바로 계산
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
        </button>
      ) : null}

      {/* 진행 중 / 정산 완료 */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1">
        <button
          type="button"
          onClick={() => {
            setView('active');
            setStageFilter(null);
          }}
          className={cx(
            'min-h-10 rounded-lg text-sm font-bold transition',
            view === 'active' ? 'bg-white text-ink shadow-card' : 'text-ink-3'
          )}
        >
          진행 중
        </button>
        <button
          type="button"
          onClick={() => {
            setView('closed');
            setStageFilter(null);
          }}
          className={cx(
            'min-h-10 rounded-lg text-sm font-bold transition',
            view === 'closed' ? 'bg-white text-ink shadow-card' : 'text-ink-3'
          )}
        >
          정산 완료 보관함
        </button>
      </div>

      {/* 찾기 */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="현장·고객 검색"
            className="field-input min-h-12 pl-10 pr-10 text-sm"
            aria-label="검색"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <details className="group relative">
          <summary
            className={cx(
              'chip min-h-12 cursor-pointer gap-1.5 px-3',
              activeFilterCount
                ? 'border-brand/30 bg-brand-soft text-brand'
                : 'border-slate-200 bg-white text-ink-2'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            필터{activeFilterCount ? ` ${activeFilterCount}` : ''}
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-2xl bg-white p-4 shadow-float ring-1 ring-slate-200/70">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">지역</span>
              <select className="field-input min-h-12 text-sm" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="전체">전체 지역</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">공종</span>
              <select className="field-input min-h-12 text-sm" value={tradeF} onChange={(e) => setTradeF(e.target.value)}>
                <option value="전체">전체 공종</option>
                {TRADE_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">수금 상태</span>
              <select className="field-input min-h-12 text-sm" value={collection} onChange={(e) => setCollection(e.target.value)}>
                <option value="전체">전체</option>
                {COLLECTION_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={resetFilters}
              className="chip min-h-11 w-full border-slate-200 bg-slate-50 text-ink-2"
            >
              필터 초기화
            </button>
          </div>
        </details>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <Card className="px-5 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold text-ink">조건에 맞는 현장이 없습니다</p>
          <p className="mt-1 text-sm text-ink-3">필터를 풀거나 새 현장을 만들어 보세요.</p>
          {activeFilterCount || stageFilter || query ? (
            <button
              type="button"
              onClick={resetFilters}
              className="chip mt-4 min-h-11 border-slate-200 bg-white text-ink-2"
            >
              필터 초기화
            </button>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([month, list]) => {
            const collapsed = !!closedMonths[month];
            return (
              <section key={month}>
                <button
                  type="button"
                  onClick={() => setClosedMonths((p) => ({ ...p, [month]: !p[month] }))}
                  className="mb-2 flex w-full items-center justify-between px-1 py-1 text-left"
                >
                  <span className="text-xs font-bold text-ink-3">
                    {month} <span className="text-slate-400">· {list.length}건</span>
                  </span>
                  <ChevronDown className={cx('h-4 w-4 text-slate-400 transition', collapsed ? '' : 'rotate-180')} />
                </button>
                {!collapsed ? (
                  <div className="space-y-2.5">
                    {list.map((c) => (
                      <CaseCard
                        key={c.id}
                        c={c}
                        openPick={pickFor === c.id}
                        onTogglePick={() => setPickFor(pickFor === c.id ? null : c.id)}
                        onOpen={() => onOpen(c.id)}
                        onUpdate={(patch) => onUpdate(c.id, patch)}
                        onDelete={() => onDelete(c.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {/* 새 현장 */}
      <div className="bottom-bar fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/92 px-4 pt-2.5 backdrop-blur no-print">
        <div className="mx-auto max-w-3xl">
          <BigButton className="w-full" onClick={onNew}>
            <Plus className="h-5 w-5" strokeWidth={2.6} /> 새 현장 만들기
          </BigButton>
          <p className="mt-1.5 text-center text-2xs font-medium text-ink-3">공종을 고르면 단가와 시공 순서가 자동으로 잡힙니다</p>
        </div>
      </div>

    </main>
  );
}

function CaseCard({ c, openPick, onTogglePick, onOpen, onUpdate, onDelete }) {
  const calc = c._calc;
  const info = TRADES[c.trade] || TRADES.unclassified;
  const lowBalance = c.collection === 'balance_wait' && calc.remainingRatio < 20;

  const price = Math.round(calc.finalPrice);
  const base = Math.round(calc.clientPrice);
  const min = Math.round(calc.rangeMin);
  const max = Math.round(calc.rangeMax);

  return (
    <Card className="overflow-hidden scroll-mb-32">
      <button type="button" onClick={onOpen} className="w-full px-4 pb-3 pt-3.5 text-left">
        <div className="flex items-start gap-3">
          <TradeIcon trade={c.trade} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-5 tracking-tight text-ink">
                {c.title}
              </h3>
              <Pill tone={STAGE_TONE[c.stage] || 'plain'} icon={false} dot>
                {STAGE_LABEL[c.stage]}
              </Pill>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-ink-3">
              {c.region} · {info.short} · {sizeText(c)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="num text-[23px] font-extrabold leading-7 tracking-tight text-ink">
            {price.toLocaleString('ko-KR')}
            <span className="ml-0.5 text-sm font-bold text-ink-3">만원</span>
          </p>
          <p className="num pb-0.5 text-2xs font-medium text-ink-4">{c.createdAt}</p>
        </div>


      </button>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onTogglePick}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 text-xs font-bold text-ink-2 active:bg-slate-200"
          aria-expanded={openPick}
        >
          <Wallet className="h-3.5 w-3.5 text-slate-500" />
          {COLLECTION_LABEL[c.collection] || '계약금 대기'}
          <ChevronDown className={cx('h-3.5 w-3.5 text-slate-400 transition', openPick ? 'rotate-180' : '')} />
        </button>
        <span className="truncate text-right text-xs font-bold leading-4">
          {lowBalance ? (
            <span className="text-amber-600">잔금 {calc.remainingRatio}% · 20% 이상 권장</span>
          ) : calc.isBelowBreakEven ? (
            <span className="text-rose-600">원가 이하 — 손해</span>
          ) : (
            <span className="text-emerald-600">
              순익 {Math.round(calc.netProfit)}만 · {calc.marginPercent}%
            </span>
          )}
        </span>
      </div>

      {openPick ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-3">
          <p className="mb-2 text-xs font-bold text-ink-2">수금 상태·받은 돈</p>
          <div className="grid grid-cols-2 gap-1.5">
            {COLLECTION_STAGES.map((s) => {
              const amountOf = (id) =>
                id === 'deposit_wait' || id === 'deposit_paid'
                  ? calc.payments.deposit.amount
                  : id === 'mid_paid'
                  ? calc.payments.mid.amount
                  : calc.payments.balance.amount;
              // 상태를 고르면 '지금까지 받은 돈'도 같이 맞춘다 (부분 입금은 아래 칸에 직접 적는다)
              const paidSoFar = (id) => {
                const dep = calc.payments.deposit.amount;
                const mid = calc.payments.mid.amount;
                if (id === 'deposit_wait') return 0;
                if (id === 'deposit_paid') return dep;
                if (id === 'mid_paid' || id === 'balance_wait') return dep + mid;
                return calc.finalPrice;
              };
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onUpdate({ collection: s.id, paidAmount: Math.round(paidSoFar(s.id)) });
                    onTogglePick();
                  }}
                  className={cx(
                    'min-h-11 rounded-xl px-2 py-1 text-sm font-bold transition',
                    c.collection === s.id
                      ? 'bg-brand text-white shadow-brand'
                      : 'bg-white text-ink-2 ring-1 ring-slate-200'
                  )}
                >
                  {s.label}
                  <span className={cx('block text-[10px] font-bold', c.collection === s.id ? 'text-white/80' : 'text-ink-3')}>
                    {Math.round(amountOf(s.id)).toLocaleString('ko-KR')}만원
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <label className="block">
              <span className="text-2xs font-bold text-ink-3">실제로 받은 돈 (만원) — 계약금만·일부만 받았으면 여기에 적으세요</span>
              <input
                inputMode="numeric"
                value={c.paidAmount ?? ''}
                onChange={(e) => onUpdate({ paidAmount: e.target.value === '' ? 0 : Number(e.target.value) || 0 })}
                aria-label="실제로 받은 돈"
                className="num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-base font-extrabold text-ink outline-none focus:border-brand focus:bg-white"
              />
            </label>
            <p className="mt-1 text-2xs font-bold text-ink-3">
              총 {Math.round(calc.finalPrice).toLocaleString('ko-KR')}만 중 받은 돈 {Math.round(Number(c.paidAmount) || 0).toLocaleString('ko-KR')}만 · 남은 돈{' '}
              <b className="text-rose-600">{Math.max(0, Math.round(calc.finalPrice - (Number(c.paidAmount) || 0))).toLocaleString('ko-KR')}만</b>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`"${c.title}" 현장을 삭제할까요? 되돌릴 수 없습니다.`)) onDelete();
            }}
            className="mt-2 min-h-10 w-full rounded-lg text-sm font-bold text-rose-600"
          >
            이 현장 삭제
          </button>
        </div>
      ) : null}
    </Card>
  );
}
