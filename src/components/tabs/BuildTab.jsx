import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Copy, Info, PackageCheck, Printer } from 'lucide-react';
import {
  LEAK_PRECEDENT_WARNING,
  waterproofStatus,
  STEP_GUIDES,
  managementChecklist,
  buildTimeline,
  evidenceFor,
} from '../../lib/gates.js';
import {
  dispatchMessage,
  neighborMessage,
  tileWalkNotice,
  waterproofNotice,
  contentCertDraft,
  constructionNotice,
} from '../../lib/docs.js';
import { buildOrderGroups } from '../../lib/orders.js';
import { defaultCrew } from '../../lib/docs.js';
import { wasteVehicle } from '../../lib/waste.js';
import { materialSetFor, BRAND_PRICES } from '../../lib/materials.js';
import { hasInteriorStyle, hasScope } from '../../lib/constants.js';
import { estimateWorkDays } from '../../lib/schedule.js';
import { kstToday, addDaysISO, korDateLabel } from '../../lib/date.js';
import { BigButton, Card, CheckRow, Details, Field, Fold, Pill, ProgressTrack, SectionCard, SmallButton, TextInput, WarningBox, cx } from '../ui.jsx';
import { copyText } from '../../lib/clipboard.js';
import { ChangeBlock } from './ChangeBlock.jsx';
import WeatherStrip from '../WeatherStrip.jsx';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function StepGuide({ guide }) {
  if (!guide) return null;
  return (
    <div className="rounded-2xl bg-slate-50 p-3.5">
      <p className="text-sm font-extrabold text-ink">이 단계에서 하는 일</p>
      <p className="mt-1 text-[13px] font-semibold leading-5 text-ink-2">{guide.what}</p>
      <p className="mt-2.5 text-xs font-extrabold text-ink-3">현장에서 확인할 것</p>
      <ul className="mt-1 space-y-1">
        {guide.checks.map((t, i) => (
          <li key={i} className="flex gap-1.5 text-[13px] font-semibold leading-5 text-ink-2">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={3} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {guide.tell ? (
        <p className="mt-2.5 rounded-xl bg-white px-3 py-2 text-[13px] font-bold leading-5 text-ink-2 ring-1 ring-slate-200">
          <span className="text-ink-3">이렇게 말하세요 · </span>
          {guide.tell}
        </p>
      ) : null}
    </div>
  );
}

// 공사기간 입력 — 입력 중에는 빈 값을 허용해 '1' 위에 '3'을 쳐도 '13'이 되지 않게 한다.
function DayCount({ value, onChange }) {
  const [text, setText] = useState(value === '' || value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    setText(value === '' || value === null || value === undefined ? '' : String(value));
  }, [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    const next = Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1;
    setText(String(next));
    onChange(String(next));
  };
  const bump = (delta) => {
    const base = parseInt(text, 10) || 1;
    const next = Math.min(99, Math.max(1, base + delta));
    setText(String(next));
    onChange(String(next));
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="공사기간 줄이기"
        onClick={() => bump(-1)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl font-black text-ink-2 active:bg-slate-200"
      >
        −
      </button>
      <input
        className="field-input min-h-11 flex-1 px-2 text-center"
        inputMode="numeric"
        value={text}
        aria-label="공사기간"
        onFocus={(e) => {
          const el = e.target;
          el.select();
          // 탭한 위치로 커서가 옮겨가도 전체 선택이 유지되게 한 번 더
          requestAnimationFrame(() => {
            try {
              el.select();
            } catch (err) {}
          });
        }}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        placeholder="1"
      />
      <button
        type="button"
        aria-label="공사기간 늘리기"
        onClick={() => bump(1)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl font-black text-ink-2 active:bg-slate-200"
      >
        +
      </button>
    </div>
  );
}

function EvidenceBlock({ c, update, calc, showToast }) {
  const group = evidenceFor(calc.trade, c);
  const spots = group.spots;
  const done = spots.filter((s) => c.evidence?.[s.id]).length;
  return (
    <SectionCard
      num="5"
      title={group.title}
      subtitle={group.hint}
      status={<Pill tone={done === spots.length ? 'ok' : 'plain'}>{done}/{spots.length}</Pill>}
    >
      <div className="space-y-2">
        {spots.map((s) => (
          <CheckRow
            key={s.id}
            checked={!!c.evidence?.[s.id]}
            onChange={(v) => update({ evidence: { ...(c.evidence || {}), [s.id]: v } })}
            label={s.label}
            hint={s.hint}
          />
        ))}
        <SmallButton
          className="w-full"
          onClick={() =>
            copyText(
              `${group.title} 촬영 안내\n${spots.map((s) => `· ${s.label} — ${s.hint}`).join('\n')}\n날짜가 보이게, 같은 자리에서 공사 전·후로 찍습니다.`,
              showToast,
              '촬영 안내를 복사했습니다'
            )
          }
        >
          <Copy className="h-4 w-4" /> 촬영 안내 복사
        </SmallButton>
      </div>
    </SectionCard>
  );
}

// 5단계 — 시공: 일정·날씨 → 타임라인 → 입금 → 발주 → 출근 안내 → 사진 체크 → 추가금
export default function BuildTab({ c, update, calc, gates, design, showToast, onMoveToArchive, onOpenNotice }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const setGate = (patch) => update({ gates: { ...c.gates, ...patch } });
  const setLiftGate = (patch) => update({ gates: { ...c.gates, lift: { ...(c.gates?.lift || {}), ...patch } } });

  const progress = gates.filter((g) => g.done).length;
  const nextIdx = gates.findIndex((g) => !g.done);
  const statusFor = (gate, idx) => {
    if (gate.done) return <Pill tone="ok">완료</Pill>;
    if (idx === nextIdx) return <Pill tone="warn">다음 할 일</Pill>;
    return <Pill tone="plain" icon={false}>권장 {idx + 1}번째</Pill>;
  };

  const dispatchText = useMemo(() => dispatchMessage(c, calc), [c, calc]);
  const noticeText = useMemo(() => constructionNotice(c, calc), [c, calc]);
  const wp = waterproofStatus(c.gates || {});
  const trade = calc.trade;
  const hasBathScope = Array.isArray(c?.subScopes) && c.subScopes.length ? c.subScopes.includes('bathroom') : true;
  const isWaterproof =
    trade === 'bathroom' ||
    (trade === 'combined' && hasBathScope) ||
    (trade === 'tilewaterproof' && (c.tileWork?.mode || 'both') !== 'tile');
  const pay = calc.payments;
  const mset = materialSetFor(c, trade);
  // 자재를 쓰는 공종만 업체별 발주를 연다 (폐기물·인력은 준비물만)
  const interiorStyle = hasInteriorStyle(c);
  // AI가 이 현장에 맞춰 뽑은 발주 리스트가 있으면 그것을 먼저 쓴다. 없을 때만 공종·세부 공종 기준 로컬 목록.
  const aiOrders = Array.isArray(c.aiAnalysis?.materialOrders) ? c.aiAnalysis.materialOrders : [];
  const orderGroups = useMemo(
    () => (aiOrders.length ? aiOrders : ['waste', 'labor'].includes(trade) ? [] : buildOrderGroups(c, calc, design, mset)),
    [c, calc, design, mset, trade, aiOrders]
  );
  const ordersFromAi = aiOrders.length > 0;
  const showOrders = orderGroups.length > 0;
  const orderChecks = c.orderChecks || {};
  const doneCount = orderGroups.filter((g) => orderChecks[g.id]).length;

  const mgmt = managementChecklist(c, trade);
  const startDate = c.startDate || '';
  const workDays = Math.max(1, parseInt(c.workDays, 10) || estimateWorkDays(c, calc, design?.days || 0));
  const aiPlan = c.aiAnalysis?.buildPlan;
  const timeline = useMemo(() => {
    const base = buildTimeline(c, calc, gates);
    if (aiPlan?.phases?.length) {
      return aiPlan.phases.map((ph, i) => ({ label: ph.label, items: ph.items, done: !!base[i]?.done }));
    }
    return base;
  }, [c, calc, gates, aiPlan]);
  const endDate = startDate ? addDaysISO(startDate, workDays - 1) : '';

  const buyAllOrder = () => {
    const next = { ...orderChecks };
    orderGroups.forEach((g) => {
      next[g.id] = true;
    });
    update({ orderChecks: next });
    showToast(`발주 ${orderGroups.length}곳을 모두 완료로 표시했습니다`);
  };

  const guideKey = isWaterproof
    ? 'waterproof'
    : trade === 'combined' && !interiorStyle
    ? (hasScope(c, 'demolition') ? 'demolition' : 'groundwork')
    : trade;
  const guide3 = STEP_GUIDES[guideKey] || STEP_GUIDES.generic;

  const aiCrew = c.aiAnalysis?.crew || [];
  const crew = c.crew && c.crew.length ? c.crew : defaultCrew(trade, c, calc);
  const crewLine = crew.map((p) => (p.unit === '대' ? `${p.role} ${p.count}대` : `${p.role} ${p.count}명`)).join(' · ');
  const vehicleLine =
    trade === 'waste'
      ? `${wasteVehicle(c).label} 1대 (약 ${wasteVehicle(c).tons}톤)`
      : trade === 'labor'
      ? '차량 없음 (현장 집결)'
      : '1톤 카고 1대 (자재·폐기물)';
  const prepByTrade =
    trade === 'waste'
      ? '마대(성상별) · 계량증명서 챙길 것 · 작업장갑 · 안전화'
      : trade === 'labor'
      ? '기초안전보건교육 이수증 · 안전화 · 장갑'
      : trade === 'demolition'
      ? '기초안전보건교육 이수증 · 안전화 · 장갑 · 마대 · 커터날'
      : '기초안전보건교육 이수증 · 안전화 · 장갑 · 보양재 · 청소도구';
  const stage3Title =
    isWaterproof
      ? '방수 담수 테스트 48시간'
      : trade === 'waste'
      ? '상차·성상분리·계근 확인'
      : ['wallpaper', 'film'].includes(trade)
      ? '밑작업·건조 및 마감 검수'
      : ['kitchen', 'plumbing'].includes(trade)
      ? '급배수·수평 및 마감 검수'
      : aiPlan?.phases?.[1]?.label || '공정·마감 검수';
  const prepLine = aiPlan?.checks?.length ? `${prepByTrade} · ${aiPlan.checks.slice(0, 2).map((x) => x.label).join(' · ')}` : prepByTrade;

  return (
    <div className="space-y-4">
      {/* 1. 시공 일정 */}
      <SectionCard num="1" title="시공 일정" subtitle="시작일을 넣으면 그날부터 공사기간 날씨를 맞춰 보여드립니다." status={<Pill tone={startDate ? 'info' : 'warn'}>{startDate ? `${korDateLabel(startDate)}~ · ${workDays}일` : '날짜 미정'}</Pill>}>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="시공 시작일">
              <TextInput
                type="date"
                value={startDate}
                onChange={(e) => update({ startDate: e.target.value, dispatch: { ...(c.dispatch || {}), date: e.target.value } })}
                aria-label="시공 시작일"
              />
            </Field>
            <Field label="공사기간 (일)">
              <DayCount
                value={c.workDays === '' || c.workDays === undefined ? workDays : c.workDays}
                onChange={(v) => update({ workDays: v })}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <SmallButton
              className="flex-1"
              onClick={() => {
                const today = kstToday();
                update({ startDate: today, dispatch: { ...(c.dispatch || {}), date: today } });
              }}
            >
              오늘 시작
            </SmallButton>
            <SmallButton className="flex-1" onClick={() => update({ startDate: '', workDays: '' })}>
              날짜 지우기
            </SmallButton>
          </div>
          {startDate ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-bold leading-4 text-ink-3">
              {korDateLabel(startDate)} ~ {korDateLabel(endDate)} · {workDays}일 (한국 시간 기준)
            </p>
          ) : null}
        </div>
      </SectionCard>

      <WeatherStrip region={c.region} startDate={startDate} days={workDays} />

      {/* 2. 공종별 타임라인 */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-ink">시공 타임라인</p>
            <p className="mt-0.5 text-xs font-semibold text-ink-3">
              {trade === 'waste'
                ? '전날 배차·인력 확정 → 당일 수거·상차·계근 → 완료 사진·정산'
                : trade === 'labor'
                ? '전날 인원·숙련 확정 → 당일 집결·작업 → 완료 확인·정산'
                : 'D-2 사전 준비 → 시공 당일 → 완료·잔금 순서입니다.'}
            </p>
          </div>
          <Pill tone={progress === gates.length ? 'ok' : 'info'}>{progress}/{gates.length} 완료</Pill>
        </div>
        <ProgressTrack value={progress} max={gates.length} className="mt-3" tone={progress === gates.length ? 'good' : 'brand'} />
        <div className="mt-3 space-y-2.5">
          {timeline.map((ph, i) => (
            <div key={ph.label} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-2xs font-black', ph.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-ink-3')}>
                  {ph.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                {i < timeline.length - 1 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className={cx('text-sm font-extrabold', ph.done ? 'text-emerald-700' : 'text-ink')}>{ph.label}</p>
                <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">{ph.items.join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-3">
          순서대로 체크하시면 됩니다. <b className="text-ink-2">필요한 항목부터 바로 열어 고칠 수 있습니다.</b>
        </p>
      </Card>

      {aiPlan && (aiPlan.checks?.length || aiPlan.tell || aiPlan.notes?.length) ? (
        <Fold label="이 현장 맞춤 시공 안내" hint="AI가 고른 확인 포인트만">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">🤖 이 현장 맞춤 시공 안내</p>
          <p className="mt-0.5 text-xs font-semibold text-ink-3">사진·요청서·층수·엘베·포함 공종을 보고 AI가 이 현장에만 해당하는 것만 골랐습니다.</p>
          {aiPlan.checks?.length ? (
            <div className="mt-2 space-y-1.5">
              {aiPlan.checks.map((x, i) => (
                <div key={i} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[13px] font-bold leading-5 text-ink">{x.label}</p>
                  {x.why ? <p className="text-2xs leading-4 text-ink-3">{x.why}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {aiPlan.tell ? (
            <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-[13px] font-bold leading-5 text-brand-strong">
              인부에게 · {aiPlan.tell}
            </p>
          ) : null}
          {aiPlan.notes?.length ? (
            <ul className="mt-2 space-y-0.5">
              {aiPlan.notes.map((n, i) => (
                <li key={i} className="text-[12.5px] font-semibold leading-5 text-amber-900">· {n}</li>
              ))}
            </ul>
          ) : null}
        </Fold>
      ) : null}

      {/* 3. 입금 확인 */}
      <SectionCard
        num="3"
        title="계약금·중도금·잔금 받기"
        subtitle="받을 금액이 각각 얼마인지 여기서 바로 보입니다. 입금 확인하면 장부 수금 상태도 같이 바뀝니다."
        status={statusFor(gates[0], 0)}
      >
        <div className="space-y-3">
          <StepGuide guide={STEP_GUIDES.gate1} />
          <div className="space-y-2">
            {pay.deposit.ratio > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-sm font-bold text-ink-2">계약금 {pay.deposit.ratio}%</span>
                  <span className="num text-base font-extrabold text-ink">{Math.round(pay.deposit.amount).toLocaleString('ko-KR')}만원</span>
                </div>
                <CheckRow
                  checked={!!c.gates?.deposit}
                  onChange={(v) => {
                    setGate({ deposit: v });
                    if (v) update({ gates: { ...c.gates, deposit: true }, collection: 'deposit_paid', paidAmount: Math.round(pay.deposit.amount) });
                  }}
                  label={`계약금 ${Math.round(pay.deposit.amount).toLocaleString('ko-KR')}만원 입금 확인`}
                  hint="통장 입금 내역을 확인하고 체크하세요"
                />
              </>
            ) : (
              <div className="rounded-xl bg-amber-50 px-3 py-2.5">
                <p className="text-sm font-extrabold text-amber-900">선금 없음 — 완료 후 전액 {Math.round(pay.balance.amount).toLocaleString('ko-KR')}만원 수금</p>
                <p className="mt-0.5 text-2xs font-semibold leading-4 text-amber-800">계약금 0%로 잡힌 현장입니다. 자재비는 우리가 먼저 쓰고, 준공 후 한 번에 받습니다.</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-bold text-ink-2">중도금 {pay.mid.ratio}%</span>
              <span className="num text-base font-extrabold text-ink">{Math.round(pay.mid.amount).toLocaleString('ko-KR')}만원</span>
            </div>
            <CheckRow
              checked={!!c.gates?.midPaid}
              onChange={(v) => {
                setGate({ midPaid: v });
                // 중도금까지 받으면 실제로 받은 돈(계약금+중도금)을 장부에 남긴다 — 남은 돈 계산이 이 값으로 맞는다
                if (v) update({ gates: { ...c.gates, midPaid: true }, collection: 'mid_paid', paidAmount: Math.round((c.gates?.deposit ? pay.deposit.amount : 0) + pay.mid.amount) });
              }}
              label={`중도금 ${Math.round(pay.mid.amount).toLocaleString('ko-KR')}만원 입금 확인`}
              hint="철거·주요 공정이 끝난 뒤 받는 금액입니다"
            />
            <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-bold text-ink-2">잔금 {pay.balance.ratio}%</span>
              <span className="num text-base font-extrabold text-ink">{Math.round(pay.balance.amount).toLocaleString('ko-KR')}만원</span>
            </div>
            <CheckRow
              checked={!!c.gates?.balancePaid}
              onChange={(v) => {
                setGate({ balancePaid: v });
                if (v) update({ gates: { ...c.gates, balancePaid: true }, collection: 'settled', paidAmount: calc.finalPrice });
              }}
              label={`잔금 ${Math.round(pay.balance.amount).toLocaleString('ko-KR')}만원 입금 확인`}
              hint="준공 검수 후 받습니다"
            />
          </div>
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            입금 확인 {[c.gates?.deposit, c.gates?.midPaid, c.gates?.balancePaid].filter(Boolean).length}/3 · 남은 금액{' '}
            {Math.max(
              0,
              Math.round(calc.finalPrice - (c.gates?.deposit ? pay.deposit.amount : 0) - (c.gates?.midPaid ? pay.mid.amount : 0) - (c.gates?.balancePaid ? pay.balance.amount : 0))
            ).toLocaleString('ko-KR')}
            만원
          </p>
          {!c.gates?.deposit && pay.deposit.ratio > 0 ? (
            <WarningBox>계약금 없이 자재를 주문하면, 고객이 취소할 때 자재값을 그대로 떠안습니다.</WarningBox>
          ) : null}
        </div>
      </SectionCard>

      {/* 4. 업체별 발주 — 켜 둔 공종의 자재·장비만 */}
      {showOrders ? (
        <Fold label="자재·장비 발주 리스트 (업체별)" hint="업체별로 복사해 보내면 됩니다">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
                <ClipboardList className="h-4 w-4 text-brand" /> 자재·장비 발주 리스트 (업체별)
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">
                {ordersFromAi
                  ? '🤖 AI가 이 현장(공종·규모)에 맞춰 뽑은 발주입니다. 업체별로 복사해 보내세요.'
                  : '업체마다 취급 품목이 다릅니다. 해당 업체에만 보낼 발주 내용을 복사해 쓰세요.'}
              </p>
            </div>
            <Pill tone={doneCount === orderGroups.length ? 'ok' : 'warn'}>
              {doneCount}/{orderGroups.length} 발주
            </Pill>
          </div>
          {mset && interiorStyle ? (
            <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-2xs font-bold leading-4 text-brand-strong">
              선택한 자재 세트 · {mset.label}({mset.tier}) — {mset.spec.slice(0, 2).join(' / ')}
            </p>
          ) : null}
          {BRAND_PRICES[calc.trade] && interiorStyle ? (
            <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
              <p className="text-2xs font-extrabold text-ink-2">브랜드별 기준 가격 (참고)</p>
              <div className="mt-1 space-y-0.5">
                {BRAND_PRICES[calc.trade].map((b) => (
                  <div key={b.label} className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
                    <span className="min-w-0 font-semibold text-ink-2">{b.label}</span>
                    <span className="shrink-0 font-extrabold text-ink-3">{b.price}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2.5">
            {orderGroups.map((g) => {
              const done = !!orderChecks[g.id];
              return (
                <div key={g.id} className={cx('rounded-2xl border p-3', done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-extrabold leading-5 text-ink">{g.vendor}</p>
                    <button
                      type="button"
                      aria-label={`${g.vendor} 발주 완료`}
                      aria-pressed={done}
                      onClick={() => update({ orderChecks: { ...orderChecks, [g.id]: !done } })}
                      className={cx('flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-bold', done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-3')}
                    >
                      {done ? <PackageCheck className="h-3.5 w-3.5" /> : null}
                      {done ? '발주 완료' : '발주 전'}
                    </button>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {g.items.map((it, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-[13px] leading-5">
                        <span className="min-w-0 text-ink-2">
                          <span className="font-bold text-ink">{it.name}</span>
                          {it.spec ? <span className="text-ink-3"> / {it.spec}</span> : null}
                        </span>
                        <span className="shrink-0 text-right font-bold tabular-nums text-ink-2">{it.qty}</span>
                      </li>
                    ))}
                  </ul>
                  {g.tips.length ? (
                    <div className="mt-1.5 rounded-xl bg-amber-50 px-2.5 py-2">
                      {g.tips.map((t, i) => (
                        <p key={i} className="flex gap-1 text-2xs font-semibold leading-4 text-amber-900">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {t}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <SmallButton className="mt-2 w-full" onClick={() => copyText(g.message, showToast, `${g.vendor} 발주 내용을 복사했습니다`)}>
                    <Copy className="h-4 w-4" /> 이 업체 발주 내용 복사
                  </SmallButton>
                </div>
              );
            })}
          </div>
          {doneCount < orderGroups.length ? (
            <SmallButton variant="dark" className="mt-2.5 w-full" onClick={buyAllOrder}>
              <Check className="h-4 w-4" /> 모두 발주 완료로 표시
            </SmallButton>
          ) : null}
        </Fold>
      ) : null}

      {/* 관리실 신고·보양 — 필요한 현장만 */}
      <SectionCard fold
        num="4"
        title="관리실 신고·보양·사다리차 승인"
        subtitle="이 4개를 해두면 인부가 헛걸음하지 않습니다. 해당 없는 항목은 자동으로 뺐습니다."
        status={statusFor(gates[1], 1)}
      >
        <div className="space-y-3">
          <StepGuide guide={STEP_GUIDES.gate2} />
          <div className="space-y-2">
            {mgmt.filter((m) => m.applicable).map((m) => (
              <CheckRow key={m.id} checked={!!c.gates?.lift?.[m.id]} onChange={(v) => setLiftGate({ [m.id]: v })} label={m.label} hint={m.hint} />
            ))}
            {mgmt.some((m) => !m.applicable) ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
                해당 없음 · {mgmt.filter((m) => !m.applicable).map((m) => `${m.label}(${m.skipWhy})`).join(', ')}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-600">이웃 인사·안내문</p>
            <p className="mt-1.5 rounded-xl bg-white px-3 py-2 text-[13px] leading-6 text-ink-2 ring-1 ring-slate-200">{neighborMessage(c)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SmallButton onClick={() => copyText(neighborMessage(c), showToast, '이웃 인사 문자를 복사했습니다')}>
                <Copy className="h-4 w-4" /> 인사 문자 복사
              </SmallButton>
              <SmallButton variant="dark" onClick={() => (onOpenNotice ? onOpenNotice() : window.print())}>
                <Printer className="h-4 w-4" /> 공사 안내문 뽑기
              </SmallButton>
            </div>
            <p className="mt-1.5 text-2xs font-semibold leading-4 text-ink-3">
              엘리베이터·현관에 붙이는 A4 안내문입니다. 6단계 문서에서 인쇄·PDF로 저장하세요.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* 오늘 투입 인원 · 차량 · 현장 브리핑 */}
      <SectionCard fold
        num="5"
        title="오늘 투입 인원 · 차량 · 현장 브리핑"
        subtitle="아침에 이 카드만 보면 누구를 몇 명, 차를 몇 대 보낼지 바로 정해집니다."
        status={<Pill tone="info">{korDateLabel(c.startDate || c.dispatch?.date || '') || '날짜 미정'}</Pill>}
      >
        <div className="space-y-2.5">
          <div className="rounded-2xl bg-brand-soft p-3">
            <p className="text-2xs font-extrabold text-brand">필요 인원</p>
            <p className="mt-1 text-[15px] font-black leading-6 text-brand-strong">
              {aiCrew.length ? aiCrew.map((p) => `${p.role} ${p.count}명`).join(' · ') : crewLine}
            </p>
            <p className="mt-0.5 text-2xs font-semibold text-brand">
              {trade === 'labor' ? '요청 인원 그대로 파견' : trade === 'waste' ? '상차·분리 인부' : '기공 + 보조 구성'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-2xs font-extrabold text-ink-3">필요 차량</p>
              <p className="mt-1 text-[13px] font-extrabold leading-5 text-ink">{vehicleLine}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-2xs font-extrabold text-ink-3">현장 환경</p>
              <p className="mt-1 text-[12.5px] font-bold leading-5 text-ink-2">
                {c.lifting?.floor ? `지상 ${c.lifting.floor}층` : '층수 미입력'} ·{' '}
                {c.lifting?.elevator === 'yes' ? '엘리베이터 있음' : c.lifting?.elevator === 'no' ? '엘리베이터 없음' : '엘베 확인 필요'}
                <br />
                {c.lifting?.ladderAllowed === 'no' ? '사다리차 불가' : c.lifting?.ladderAllowed === 'yes' ? '사다리차 가능' : '사다리차 확인 필요'} ·{' '}
                {/공실|빈집/.test(`${c.notes || ''} ${c.rawInput || ''}`) ? '공실' : '거주·사용 중'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-2xs font-extrabold text-ink-3">핵심 작업 · 제외사항</p>
            <p className="mt-1 text-[13px] font-bold leading-5 text-ink">{calc.targetSummary}</p>
            {c.excludedScopes?.length ? (
              <p className="mt-1 text-2xs font-bold leading-4 text-rose-700">제외: {c.excludedScopes.map((x) => (x === 'window' ? '창호' : x)).join(' · ')}</p>
            ) : null}
            {aiPlan?.notes?.length ? <p className="mt-1 text-2xs font-semibold leading-4 text-amber-900">{aiPlan.notes.join(' · ')}</p> : null}
          </div>

          <div className="rounded-2xl bg-amber-50 p-3">
            <p className="text-2xs font-extrabold text-amber-900">챙길 장비 · 주의사항</p>
            <p className="mt-1 text-[12.5px] font-bold leading-5 text-amber-900">{prepLine}</p>
            {calc.lifting?.warnings?.length ? (
              <p className="mt-1 text-2xs font-semibold leading-4 text-amber-800">{calc.lifting.warnings.join(' · ')}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-xs font-bold text-ink-3">출근 날짜</span>
            <span className="text-sm font-extrabold text-ink">{startDate || c.dispatch?.date || '시공 시작일 미정'}</span>
          </div>
        </div>
      </SectionCard>

      {/* 작업 전·후 사진 체크 */}
      <EvidenceBlock c={c} update={update} calc={calc} showToast={showToast} />

      {/* 공정(방수 담수 / 일반) */}
      <SectionCard fold
        num="6"
        title={stage3Title}
        subtitle={isWaterproof ? '사진 3장과 48시간이 지나야 타일 시공을 시작합니다.' : '이 공정이 끝나야 다음 공정이 안전합니다.'}
        status={statusFor(gates[2], 2)}
      >
        <div className="space-y-3">
          <StepGuide guide={guide3} />
          {isWaterproof ? (
            <WaterproofBlock c={c} update={update} wp={wp} calc={calc} showToast={showToast} tick={tick} />
          ) : (
            <GenericGateBlock gate={gates[2]} c={c} update={update} />
          )}
        </div>
      </SectionCard>

      {/* 준공 */}
      <SectionCard fold num="7" title="준공 검수·잔금 받고 마무리" subtitle="준공 사진·하자 종결·잔금 입금이 모두 확인되면 정산 완료입니다." status={statusFor(gates[3], 3)}>
        <div className="space-y-3">
          <StepGuide guide={STEP_GUIDES.gate4} />
          <CheckRow checked={!!c.gates?.donePhoto} onChange={(v) => setGate({ donePhoto: v })} label="준공 사진 있음" />
          <CheckRow checked={!!c.gates?.defect} onChange={(v) => setGate({ defect: v })} label="하자 리스트 처리 끝" />
          <CheckRow
            checked={!!c.gates?.balancePaid}
            onChange={(v) => {
              setGate({ balancePaid: v });
              if (v) update({ gates: { ...c.gates, balancePaid: true }, collection: 'settled', paidAmount: calc.finalPrice });
            }}
            label={`잔금 ${Math.round(pay.balance.amount).toLocaleString('ko-KR')}만원 입금 확인`}
            hint="준공 검수 후 지급"
          />
          <BigButton variant="green" className="w-full" disabled={!gates[3].done} onClick={() => onMoveToArchive(c.id)}>
            정산 완료 → 보관함으로
          </BigButton>
          {!gates[3].done ? <p className="text-center text-sm text-slate-500">3개를 모두 체크하면 열립니다.</p> : null}

          <Details label="미수금이 생겼을 때 (내용증명 초안)">
            <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{contentCertDraft(c, calc)}</pre>
            <SmallButton className="mt-2 w-full" onClick={() => copyText(contentCertDraft(c, calc), showToast)}>
              <Copy className="h-4 w-4" /> 내용증명 초안 복사
            </SmallButton>
          </Details>
        </div>
      </SectionCard>

      {/* 시공 중 추가 공사 */}
      <ChangeBlock c={c} update={update} showToast={showToast} num="8" />
    </div>
  );
}

function WaterproofBlock({ c, update, wp, calc, showToast, tick }) {
  const setWp = (patch) => update({ gates: { ...c.gates, waterproof: { ...(c.gates?.waterproof || {}), ...patch } } });
  const setCheck = (key, val) =>
    update({
      gates: {
        ...c.gates,
        waterproof: {
          ...(c.gates?.waterproof || {}),
          checks: { ...(c.gates?.waterproof?.checks || {}), [key]: val },
        },
      },
    });

  const tileText = dispatchMessage(c, calc);

  return (
    <div className="space-y-3">
      <WarningBox tone="bad" title="누수 배상은 한 번에 수천만원">
        {LEAK_PRECEDENT_WARNING} 물이 새면 아래층 배상으로 현장 순익이 통째로 날아갑니다.
      </WarningBox>

      <Field label="물 채우기 시작한 때" hint="48시간이 지나야 열립니다. 어제 시작했다면 어제 시각을 넣으세요.">
        <TextInput
          type="datetime-local"
          value={toLocalInput(c.gates?.waterproof?.startedAt)}
          onChange={(e) => setWp({ startedAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
        />
      </Field>

      <div className={cx('rounded-2xl border p-4', wp.ready ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50')}>
        <p className="text-base font-bold text-slate-700">{wp.remainingText}</p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white">
          <div className={cx('h-full rounded-full', wp.timeDone ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.min(100, Math.round((wp.elapsedH / 48) * 100))}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-600">사진 3장 + 아래층 확인 + 48시간이 모두 맞으면 통과입니다.</p>
      </div>

      <div className="space-y-2">
        <CheckRow checked={!!wp.checks.level} onChange={(v) => setCheck('level', v)} label="① 물 높이 표시한 사진" hint="같은 자리·같은 각도로" />
        <CheckRow checked={!!wp.checks.h24} onChange={(v) => setCheck('h24', v)} label="② 24시간 지난 사진" />
        <CheckRow checked={!!wp.checks.beforeDrain} onChange={(v) => setCheck('beforeDrain', v)} label="③ 물 빼기 직전 사진" />
        <CheckRow checked={!!wp.belowOk} onChange={(v) => setWp({ belowOk: v })} label="아래층 천장 누수 없음 확인" hint="아래집에 미리 알리고 확인하세요." />
      </div>

      <Details label="아래층에 보낸 안내 문자">
        <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{waterproofNotice(c)}</pre>
        <SmallButton className="mt-2 w-full" onClick={() => copyText(waterproofNotice(c), showToast)}>
          <Copy className="h-4 w-4" /> 안내 문자 복사
        </SmallButton>
      </Details>

      {wp.ready ? (
        <div className="rounded-2xl bg-white p-3 ring-2 ring-emerald-300">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-emerald-800">
            <CheckCircle2 className="h-5 w-5" /> 타일 기공을 불러도 됩니다.
          </p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{tileText}</pre>
          <SmallButton className="mt-2 w-full" variant="dark" onClick={() => copyText(tileText, showToast, '타일 기공 안내 문자를 복사했습니다')}>
            <Copy className="h-4 w-4" /> 타일 기공 안내 복사
          </SmallButton>
        </div>
      ) : null}
      <p className="text-sm font-bold text-slate-500">※ 4개가 다 맞지 않아도 숨기지 않습니다. 부족한 항목만 보완하면 됩니다.</p>

      <Details label="타일·줄눈 후 보행 금지 안내">
        <p className="text-base leading-7 text-slate-700">{tileWalkNotice()}</p>
        <SmallButton className="mt-2 w-full" onClick={() => copyText(tileWalkNotice(), showToast)}>
          <Copy className="h-4 w-4" /> 보행 금지 안내 복사
        </SmallButton>
      </Details>
    </div>
  );
}

function GenericGateBlock({ gate, c, update }) {
  return (
    <div className="space-y-2">
      {gate.prereqs.map((p) => (
        <CheckRow key={p.id} checked={!!c.gates?.[p.id]} onChange={(v) => update({ gates: { ...c.gates, [p.id]: v } })} label={p.label} />
      ))}
      <p className="mt-2 flex gap-1.5 text-sm leading-6 text-amber-800">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" /> {gate.warning}
      </p>
    </div>
  );
}
