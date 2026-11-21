import React, { useMemo, useState } from 'react';
import { ArrowRight, Building2, CalendarClock, ExternalLink, FileDown, Filter, Landmark, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { BIDS, BIDS_META, bidPreview, bidStats, dLabel, daysLeft, filterBids, wonText } from '../lib/bids.js';
import { WORK_TYPES } from '../lib/constants.js';
import { AlertCard, BigButton, Card, Hero, Modal, Pill, SectionLabel, cx } from './ui.jsx';

const PRICE_FILTERS = [
  { id: 0, label: '전체 금액' },
  { id: 20000000, label: '2,000만 이하' },
  { id: 50000000, label: '5,000만 이하' },
];

const REGION_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'andong', label: '안동시' },
  { id: 'gyeongbuk', label: '경북·인근' },
];

function statusTone(bid) {
  if (bid.status === 'closed') return 'lock';
  const d = daysLeft(bid.deadline);
  if (d !== null && d <= 2) return 'warn';
  return 'ok';
}

export default function BidsScreen({ onImport }) {
  const [region, setRegion] = useState('all');
  const [work, setWork] = useState('all');
  const [maxPrice, setMaxPrice] = useState(0);
  const [noLicenseOnly, setNoLicenseOnly] = useState(false);
  const [hideRestricted, setHideRestricted] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [selected, setSelected] = useState(null);

  const stats = useMemo(() => bidStats(BIDS), []);
  const list = useMemo(
    () => filterBids(BIDS, { region, work, maxPrice, noLicenseOnly, hideRestricted, openOnly }),
    [region, work, maxPrice, noLicenseOnly, hideRestricted, openOnly]
  );
  const reset = () => {
    setRegion('all');
    setWork('all');
    setMaxPrice(0);
    setNoLicenseOnly(false);
    setHideRestricted(false);
    setOpenOnly(true);
  };
  const activeFilters = (region !== 'all' ? 1 : 0) + (work !== 'all' ? 1 : 0) + (maxPrice ? 1 : 0) + (noLicenseOnly ? 1 : 0) + (hideRestricted ? 1 : 0);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
      <Hero
        eyebrow={`🏛️ 관공서 일감 · ${BIDS_META.collectedAt} 기준`}
        value={String(stats.open)}
        unit="건 접수 중"
        sub={`안동시 ${stats.andong}건 · D-5 안에 마감 ${stats.soon}건`}
        badge={<span className="rounded-lg bg-white/10 px-2 py-1 text-2xs font-extrabold text-blue-100">나라장터 실제 공고</span>}
      >
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white/10 p-1.5 text-center">
          <div>
            <p className="text-[11px] font-bold text-blue-200">안동시</p>
            <p className="num text-lg font-black text-white">{stats.andong}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-blue-200">경북·인근</p>
            <p className="num text-lg font-black text-white">{stats.open - stats.andong}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-blue-200">전체 수집</p>
            <p className="num text-lg font-black text-white">{stats.total}</p>
          </div>
        </div>
      </Hero>

      {/* 지역 */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
        {REGION_FILTERS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRegion(r.id)}
            className={cx(
              'min-h-10 rounded-lg text-sm font-extrabold transition',
              region === r.id ? 'bg-slate-900 text-white shadow-card' : 'text-ink-2'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 공종 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {WORK_TYPES.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setWork(w.id)}
            className={cx(
              'rounded-xl border px-3 py-2 text-xs font-extrabold',
              work === w.id ? 'border-brand bg-brand text-white shadow-brand' : 'border-slate-200 bg-white text-ink-2'
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* 금액·조건 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRICE_FILTERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setMaxPrice(p.id)}
            className={cx(
              'rounded-xl border px-2.5 py-1.5 text-2xs font-extrabold',
              maxPrice === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-ink-2'
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNoLicenseOnly((v) => !v)}
          className={cx(
            'inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-2xs font-extrabold',
            noLicenseOnly ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-ink-2'
          )}
        >
          {noLicenseOnly ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
          면허 없는 건만
        </button>
        <button
          type="button"
          onClick={() => setHideRestricted((v) => !v)}
          className={cx(
            'rounded-xl border px-2.5 py-1.5 text-2xs font-extrabold',
            hideRestricted ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-ink-2'
          )}
        >
          특수 제한 제외
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between px-0.5">
        <p className="text-xs font-bold text-ink-3">
          {list.length}건{activeFilters ? ` · 필터 ${activeFilters}` : ''}
        </p>
        <div className="flex items-center gap-2">
          {activeFilters ? (
            <button type="button" onClick={reset} className="text-2xs font-bold text-brand">
              초기화
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            className={cx('text-2xs font-bold', openOnly ? 'text-ink-3' : 'text-rose-600')}
          >
            {openOnly ? '마감 지난 공고도 보기' : '접수 중만 보기'}
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-2.5">
        {list.length === 0 ? (
          <Card className="px-4 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Building2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-base font-extrabold text-ink">조건에 맞는 공고가 없습니다</p>
            <p className="mt-1 text-sm leading-5 text-ink-3">
              {noLicenseOnly
                ? '지금 접수 중인 공고 중 1,500만 원 미만 경미공사는 없습니다. 안동시는 1,500만 원 미만을 1인 수의계약으로 집행해 공고가 뜨지 않습니다 — 안동시 계약담당(054-840-5114)에게 직접 문의하세요.'
                : '필터를 풀거나 마감 지난 공고를 켜 보세요. 새 공고는 매일 갱신됩니다.'}
            </p>
            <button type="button" onClick={reset} className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
              필터 초기화
            </button>
          </Card>
        ) : (
          list.map((bid) => <BidRow key={bid.id} bid={bid} onOpen={() => setSelected(bid)} />)
        )}
      </div>

      <AlertCard tone="info" title="투찰 전 꼭 확인하세요" className="mt-4">
        가격은 공고 화면의 추정가격 기준이고, 예상 투찰가 = 추정가 × 88% · 낙찰하한 = 추정가 × 87.745%로 계산한 참고값입니다. 실제 투찰은 나라장터 원문·공고문·내역서를 확인한 뒤 하세요.
      </AlertCard>

      <BidDetail bid={selected} onClose={() => setSelected(null)} onImport={onImport} />
    </main>
  );
}

function BidRow({ bid, onOpen }) {
  const p = bidPreview(bid);
  const closed = bid.status === 'closed';
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <Card className={cx('overflow-hidden px-4 py-3.5', closed && 'opacity-80')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={statusTone(bid)} icon={false} dot>
                {closed ? '마감' : dLabel(bid.deadline)}
              </Pill>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-extrabold text-ink-2">{bid.trade}</span>
              {bid.regionKey === 'andong' ? (
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-extrabold text-blue-700">안동</span>
              ) : null}
            </div>
            <h3 className="mt-1.5 line-clamp-2 text-[15px] font-extrabold leading-5 tracking-tight text-ink">{bid.title}</h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-ink-3">
              {bid.org}
              {bid.restrictionNote ? ` · ${bid.restrictionNote}` : ''}
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <div>
            <p className="text-[11px] font-bold text-ink-3">추정가격</p>
            <p className="num text-lg font-black leading-6 text-ink">{wonText(p.est)}원</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-ink-3">예상 투찰가 (88%)</p>
            <p className="num text-sm font-extrabold text-brand-strong">{wonText(p.bidPrice)}원</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-ink-3">예상 남는 돈</p>
            <p className={cx('num text-sm font-extrabold', p.profit > 0 ? 'text-emerald-600' : 'text-rose-600')}>+{wonText(p.profit)}원</p>
          </div>
        </div>

        <p className="mt-1.5 truncate text-2xs font-semibold text-ink-3">
          면허: {bid.licenseRequired ? (bid.licenses || []).join(' · ') || '공고문 확인' : '제한 없음'}
        </p>
      </Card>
    </button>
  );
}

function BidDetail({ bid, onClose, onImport }) {
  if (!bid) return null;
  const p = bidPreview(bid);
  const closed = bid.status === 'closed';
  const rows = [
    { label: '추정가격', value: `${wonText(p.est)}원`, tone: 'plain' },
    { label: '예상 투찰가 (×88%)', value: `${wonText(p.bidPrice)}원`, tone: 'brand' },
    { label: '낙찰하한 (×87.745%)', value: `${wonText(p.floor)}원`, tone: 'warn' },
    { label: `예상 원가 (원가율 ${Math.round(p.costRatio * 100)}%)`, value: `${wonText(p.cost)}원`, tone: 'plain' },
    { label: '예상 남는 돈', value: `${p.profit >= 0 ? '+' : ''}${wonText(p.profit)}원 (${p.margin}%)`, tone: p.profit > 0 ? 'good' : 'bad' },
    { label: '부가세 (별도)', value: `${wonText(p.vat)}원`, tone: 'plain' },
  ];

  return (
    <Modal open onClose={onClose} title={bid.title} subtitle={`${bid.noticeNo} · ${bid.org}`}>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={statusTone(bid)}>{closed ? '마감된 공고' : dLabel(bid.deadline)}</Pill>
        <Pill tone="plain" icon={false}>{bid.trade}</Pill>
        <Pill tone="info" icon={false}>{bid.region}</Pill>
        {bid.competition ? <Pill tone="plain" icon={false}>보통 {bid.competition}개사</Pill> : null}
      </div>

      <div className="rounded-2xl bg-slate-50 p-3.5">
        <h3 className="text-base font-extrabold leading-6 text-ink">{bid.title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-2">{bid.summary}</p>
        <p className="mt-1.5 text-2xs font-bold text-amber-700">{bid.note}</p>
      </div>

      <div>
        <SectionLabel>투찰가·남는 돈 미리보기</SectionLabel>
        <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
          {rows.map((r, i) => (
            <div key={r.label} className={cx('flex items-center justify-between gap-2 px-3.5 py-2.5', i % 2 ? 'bg-slate-50' : 'bg-white')}>
              <span className="text-xs font-bold text-ink-3">{r.label}</span>
              <span
                className={cx(
                  'num text-sm font-extrabold',
                  r.tone === 'good' ? 'text-emerald-600' : r.tone === 'bad' ? 'text-rose-600' : r.tone === 'brand' ? 'text-brand-strong' : r.tone === 'warn' ? 'text-amber-700' : 'text-ink'
                )}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-2xs leading-4 text-ink-3">
          낙찰하한 기준으로 쓰면 남는 돈이 {wonText(p.floor - p.cost)}원까지 줄어듭니다. 인건비·폐기물이 오르면 이 마진은 더 얇아집니다.
          추정가격은 부가세 제외 금액이라, 실제 투찰은 원문의 <b>기초금액(부가세 포함)</b>으로 다시 계산하세요.
        </p>
      </div>

      <div>
        <SectionLabel>참가 조건</SectionLabel>
        <div className="space-y-1.5 text-sm">
          <p><b className="text-ink-3">면허</b> · {(bid.licenses || []).join(' / ') || (bid.licenseRequired ? '공고문 확인 필요' : '제한 없음')}</p>
          <p><b className="text-ink-3">지역</b> · {bid.restrictionNote || '제한 없음'}</p>
          <p><b className="text-ink-3">마감</b> · {bid.deadline ? bid.deadline.replace('T', ' ').slice(0, 16) : '-'}</p>
          <p><b className="text-ink-3">현장</b> · {bid.site}</p>
        </div>
      </div>

      {closed && bid.result ? (
        <AlertCard tone="info" title="이미 끝난 공고 — 다음 공고의 기준으로 쓰세요">
          낙찰 {bid.result.winner} · {wonText(bid.result.amount)}원 ({bid.result.rate}%) · {bid.result.bidders}개사 참여
        </AlertCard>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <a
          href={bid.g2b}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-sm font-bold text-white"
        >
          <Landmark className="h-4 w-4" /> 나라장터 원문
        </a>
        <a
          href={bid.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2"
        >
          <ExternalLink className="h-4 w-4" /> 공고 상세
        </a>
      </div>

      {!closed ? (
        <BigButton className="w-full" onClick={() => onImport(bid)}>
          <FileDown className="h-5 w-5" /> 내 장부로 가져오기 (신청 준비)
        </BigButton>
      ) : (
        <BigButton variant="ghost" className="w-full" onClick={() => onImport(bid)}>
          <FileDown className="h-5 w-5" /> 같은 공종으로 새 현장 준비
        </BigButton>
      )}
      <p className="text-center text-2xs text-ink-3">가져오면 1→2→3→4단계 현장 장부로 이어집니다</p>
    </Modal>
  );
}
