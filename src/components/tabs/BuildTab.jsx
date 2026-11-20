import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Copy, Info, PackageCheck } from 'lucide-react';
import { LEAK_PRECEDENT_WARNING, waterproofStatus, STEP_GUIDES, managementChecklist } from '../../lib/gates.js';
import { dispatchMessage, neighborMessage, tileWalkNotice, waterproofNotice, contentCertDraft } from '../../lib/docs.js';
import { buildOrderGroups } from '../../lib/orders.js';
import { materialSetFor, BRAND_PRICES } from '../../lib/materials.js';
import { estimateWorkDays } from '../../lib/schedule.js';
import { BigButton, Card, CheckRow, Details, Field, Pill, ProgressTrack, SectionCard, SmallButton, TextInput, WarningBox, cx } from '../ui.jsx';
import { ChangeBlock, copyText } from './EstimateTab.jsx';
import WeatherStrip from '../WeatherStrip.jsx';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

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

export default function BuildTab({ c, update, calc, gates, design, showToast, onMoveToArchive }) {
  const [tick, setTick] = useState(0);
  const [reading, setReading] = useState(false);
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
  const wp = waterproofStatus(c.gates || {});
  const trade = calc.trade;
  const isWaterproof = trade === 'bathroom' || trade === 'combined' || (trade === 'tilewaterproof' && (c.tileWork?.mode || 'both') !== 'tile');
  const pay = calc.payments;
  const mset = materialSetFor(c, trade);
  const orderGroups = useMemo(
    () => buildOrderGroups(c, calc, design, mset),
    [c, calc, design, mset]
  );
  const orderChecks = c.orderChecks || {};
  const doneCount = orderGroups.filter((g) => orderChecks[g.id]).length;

  const mgmt = managementChecklist(c, trade);
  const startDate = c.startDate || '';
  const workDays = Math.max(1, parseInt(c.workDays, 10) || estimateWorkDays(c, calc, design?.days || 0));

  const buyAllOrder = () => {
    const next = { ...orderChecks };
    orderGroups.forEach((g) => {
      next[g.id] = true;
    });
    update({ orderChecks: next });
    showToast(`발주 ${orderGroups.length}곳을 모두 완료로 표시했습니다`);
  };

  const guide3 = STEP_GUIDES[isWaterproof ? 'waterproof' : trade] || STEP_GUIDES.generic;

  return (
    <div className="space-y-4">
      {/* 시공일 기준 날씨 */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-ink">시공 일정</p>
            <p className="mt-0.5 text-xs font-semibold text-ink-3">
              시작일을 넣으면 그날부터 공사기간({workDays}일) 날씨를 맞춰 보여드립니다.
            </p>
          </div>
          <Pill tone={startDate ? 'info' : 'warn'}>{startDate ? `${workDays}일 공사` : '날짜 미정'}</Pill>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Field label="시공 시작일">
            <TextInput
              type="date"
              value={startDate}
              onChange={(e) => update({ startDate: e.target.value, dispatch: { ...(c.dispatch || {}), date: e.target.value } })}
              aria-label="시공 시작일"
            />
          </Field>
          <Field label="공사기간 (일)">
            <TextInput
              inputMode="numeric"
              value={workDays}
              onChange={(e) => update({ workDays: e.target.value })}
              aria-label="공사기간"
            />
          </Field>
        </div>
        <div className="mt-2 flex gap-2">
          <SmallButton className="flex-1" onClick={() => update({ startDate: todayISO(), dispatch: { ...(c.dispatch || {}), date: todayISO() } })}>
            오늘 시작
          </SmallButton>
          <SmallButton className="flex-1" onClick={() => update({ startDate: '', workDays: '' })}>
            날짜 지우기
          </SmallButton>
        </div>
      </Card>

      <WeatherStrip region={c.region} startDate={startDate} days={workDays} />

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink-3">권장 순서</p>
            <p className="mt-0.5 text-lg font-extrabold leading-6 text-ink">
              {progress === gates.length ? '모두 끝났습니다' : `${nextIdx + 1}단계 · ${gates[nextIdx]?.title?.split('→')[0]?.trim()}`}
            </p>
          </div>
          <Pill tone={progress === gates.length ? 'ok' : 'info'}>{progress}/{gates.length} 완료</Pill>
        </div>
        <ProgressTrack value={progress} max={gates.length} className="mt-3" tone={progress === gates.length ? 'good' : 'brand'} />
        <p className="mt-2 text-xs leading-5 text-ink-3">
          1→2→3→4 순서가 편하지만 <b className="text-ink-2">잠그지 않았습니다.</b> 현장 사정이 바뀌면 어느 단계든 바로 열어 체크·수정하세요.
        </p>
      </Card>

      {/* 시공 타임라인 — 순서를 한눈에 */}
      <Card className="p-4">
        <p className="text-base font-extrabold text-ink">시공 타임라인</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-3">D-2 사전 준비 → 시공 당일 → 완료·잔금 순서입니다. 체크된 단계는 초록으로 바뀝니다.</p>
        <div className="mt-3 space-y-2.5">
          {[
            {
              label: 'D-2 · D-1 사전 준비',
              done: !!c.gates?.deposit && mgmt.filter((m) => m.applicable).every((m) => !!c.gates?.lift?.[m.id]),
              items: ['자재 발주', '관리실 신고·보양', '사다리차 승인'],
            },
            {
              label: '시공 당일',
              done: gates[2].done,
              items: isWaterproof ? ['철거·양중', '방수 2회', '담수 48시간', '타일·마감'] : ['철거·반출', '주공정 시공', '마감 정리'],
            },
            {
              label: '완료 · 잔금',
              done: gates[3].done,
              items: ['준공 사진', '하자 정리', '잔금 입금'],
            },
          ].map((ph, i) => (
            <div key={ph.label} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-2xs font-black', ph.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-ink-3')}>
                  {ph.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                {i < 2 ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className={cx('text-sm font-extrabold', ph.done ? 'text-emerald-700' : 'text-ink')}>{ph.label}</p>
                <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">{ph.items.join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 1. 수금 */}
      <SectionCard
        num="1"
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
                    if (v) update({ gates: { ...c.gates, deposit: true }, collection: 'deposit_paid' });
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
                if (v) update({ gates: { ...c.gates, midPaid: true }, collection: 'mid_paid' });
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
          {!c.gates?.deposit ? (
            <WarningBox>계약금 없이 자재를 주문하면, 고객이 취소할 때 자재값을 그대로 떠안습니다.</WarningBox>
          ) : null}
        </div>
      </SectionCard>

      {/* 자재 발주 — 업체별 */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
              <ClipboardList className="h-4 w-4 text-brand" /> 자재 발주 리스트 (업체별)
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">
              업체마다 취급 품목이 다릅니다. 해당 업체에만 보낼 발주 내용을 복사해 쓰세요.
            </p>
          </div>
          <Pill tone={doneCount === orderGroups.length ? 'ok' : 'warn'}>
            {doneCount}/{orderGroups.length} 발주
          </Pill>
        </div>
        {mset ? (
          <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-2xs font-bold leading-4 text-brand-strong">
            선택한 자재 세트 · {mset.label}({mset.tier}) — {mset.spec.slice(0, 2).join(' / ')}
          </p>
        ) : null}
        {BRAND_PRICES[calc.trade] ? (
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
                    className={cx(
                      'flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-bold',
                      done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-3'
                    )}
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
                <SmallButton
                  className="mt-2 w-full"
                  onClick={() => copyText(g.message, showToast, `${g.vendor} 발주 내용을 복사했습니다`)}
                >
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
      </Card>

      {/* 2. 관리실 신고 */}
      <SectionCard
        num="2"
        title="관리실 신고·보양·사다리차 승인"
        subtitle="이 4개를 해두면 철거 인부가 헛걸음하지 않습니다."
        status={statusFor(gates[1], 1)}
      >
        <div className="space-y-3">
          <StepGuide guide={STEP_GUIDES.gate2} />
          <div className="space-y-2">
            {mgmt.filter((m) => m.applicable).map((m) => (
              <CheckRow
                key={m.id}
                checked={!!c.gates?.lift?.[m.id]}
                onChange={(v) => setLiftGate({ [m.id]: v })}
                label={m.label}
                hint={m.hint}
              />
            ))}
            {mgmt.some((m) => !m.applicable) ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
                해당 없음 · {mgmt.filter((m) => !m.applicable).map((m) => `${m.label}(${m.skipWhy})`).join(', ')}
              </p>
            ) : null}
          </div>

          <Details label="이웃 인사 문자 보기">
            <p className="text-base leading-7 text-slate-700">{neighborMessage(c)}</p>
            <SmallButton className="mt-2 w-full" onClick={() => copyText(neighborMessage(c), showToast)}>
              <Copy className="h-4 w-4" /> 이웃 인사 문자 복사
            </SmallButton>
          </Details>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-600">기공 배차 문자 (전날 18시까지)</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="text-xs font-bold text-ink-3">배차 날짜</span>
                <span className="text-sm font-extrabold text-ink">{startDate || '시공 시작일 미정'}</span>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-ink-3">도착 시간</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { v: '08:00', l: '오전 8시' },
                    { v: '08:30', l: '8시 30분' },
                    { v: '09:00', l: '9시' },
                    { v: '10:00', l: '10시' },
                  ].map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => update({ dispatch: { ...(c.dispatch || {}), time: t.v } })}
                      className={cx(
                        'min-h-9 rounded-lg px-2.5 text-xs font-bold',
                        (c.dispatch?.time || '08:00') === t.v ? 'bg-ink text-white' : 'bg-white text-ink-2 ring-1 ring-slate-200'
                      )}
                    >
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{dispatchText}</pre>
            <SmallButton className="mt-2 w-full" onClick={() => copyText(dispatchText, showToast, '배차 문자를 복사했습니다')}>
              <Copy className="h-4 w-4" /> 배차 문자 복사
            </SmallButton>
            <p className="mt-2 text-sm text-slate-500">결원 1명 = 일당 18만원 + 공정 1일 지연. 기초안전보건교육 이수증을 확인하세요.</p>
          </div>
        </div>
      </SectionCard>

      {/* 3. 공정 */}
      <SectionCard
        num="3"
        title={isWaterproof ? '방수 담수 테스트 48시간' : gates[2].title.split('→')[0].trim()}
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

      {/* 4. 준공 */}
      <SectionCard
        num="4"
        title="준공 검수·잔금 받고 마무리"
        subtitle="준공 사진·하자 종결·잔금 입금이 모두 확인되면 정산 완료입니다."
        status={statusFor(gates[3], 3)}
      >
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

      {/* 시공 도중 추가 공사 — 사진·사유·금액·일정 4가지를 남긴다 */}
      <ChangeBlock c={c} update={update} showToast={showToast} num="5" />
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

  const tileText = dispatchMessage(c, calc).replace('[배차 요청]', '[타일 기공 배차]');

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

      <Details label="아래층에 보낼 안내 문자">
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
          <SmallButton className="mt-2 w-full" variant="dark" onClick={() => copyText(tileText, showToast, '타일 기공 배차 문자를 복사했습니다')}>
            <Copy className="h-4 w-4" /> 타일 기공 배차 문자 복사
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
        <CheckRow
          key={p.id}
          checked={!!c.gates?.[p.id]}
          onChange={(v) => update({ gates: { ...c.gates, [p.id]: v } })}
          label={p.label}
        />
      ))}
      <p className="mt-2 flex gap-1.5 text-sm leading-6 text-amber-800">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" /> {gate.warning}
      </p>
    </div>
  );
}
