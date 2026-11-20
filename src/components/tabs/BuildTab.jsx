import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Lock } from 'lucide-react';
import { LEAK_PRECEDENT_WARNING, waterproofStatus } from '../../lib/gates.js';
import { dispatchMessage, orderMessage, neighborMessage, tileWalkNotice, waterproofNotice, contentCertDraft } from '../../lib/docs.js';
import { BigButton, Card, CheckRow, Details, Field, Pill, ProgressTrack, SectionCard, SmallButton, TextInput, WarningBox, cx } from '../ui.jsx';
import { copyText } from './EstimateTab.jsx';
import WeatherStrip from '../WeatherStrip.jsx';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function BuildTab({ c, update, calc, gates, design, showToast, onMoveToArchive }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const setGate = (patch) => update({ gates: { ...c.gates, ...patch } });
  const setLiftGate = (patch) => update({ gates: { ...c.gates, lift: { ...(c.gates?.lift || {}), ...patch } } });

  const currentIdx = gates.findIndex((g) => !g.done);
  const progress = gates.filter((g) => g.done).length;

  const statusFor = (gate, idx) => {
    if (gate.done) return <Pill tone="ok">완료</Pill>;
    if (idx === currentIdx) return <Pill tone="warn">지금 할 일</Pill>;
    return <Pill tone="lock">잠김</Pill>;
  };
  const isOpen = (idx) => gates.slice(0, idx).every((g) => g.done);
  const lockHint = (idx) => `${idx}단계까지 완료하면 열립니다`;

  const orderText = useMemo(() => orderMessage(c, calc, design), [c, calc, design]);
  const dispatchText = useMemo(() => dispatchMessage(c, calc), [c, calc]);
  const wp = waterproofStatus(c.gates || {});

  const trade = calc.trade;
  const isWaterproof = trade === 'bathroom' || trade === 'combined';

  return (
    <div className="space-y-4">
      <WeatherStrip region={c.region} />

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink-3">지금 차례</p>
            <p className="mt-0.5 text-lg font-extrabold leading-6 text-ink">
              {progress === 4 ? '모두 끝났습니다' : `${currentIdx + 1}단계 · ${gates[currentIdx]?.title?.split('→')[0]?.trim()}`}
            </p>
          </div>
          <Pill tone={progress === 4 ? 'ok' : 'info'}>{progress}/4 완료</Pill>
        </div>
        <ProgressTrack value={progress} max={4} className="mt-3" tone={progress === 4 ? 'good' : 'brand'} />
        <p className="mt-2 text-xs leading-5 text-ink-3">
          순서대로만 하면 됩니다. 앞 단계를 체크해야 다음 카드가 열립니다.
        </p>
      </Card>

      {/* 1단계 */}
      <SectionCard num="1" title="계약금 받기" subtitle="계약금이 들어와야 자재를 주문합니다." status={statusFor(gates[0], 0)} locked={!isOpen(0)} lockHint={lockHint(1)}>
        <div className="space-y-3">
          <CheckRow
            checked={!!c.gates?.deposit}
            onChange={(v) => setGate({ deposit: v })}
            label="계약금 입금 확인"
            hint="입금 내역을 확인하고 체크하세요."
          />
          {c.gates?.deposit ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> 이제 자재 발주와 관리실 신고를 해도 됩니다.</p>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-600">자재 발주 문자 (10% 여유분 포함)</p>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{orderText}</pre>
                <SmallButton className="mt-2 w-full" onClick={() => copyText(orderText, showToast, '발주 문자를 복사했습니다')}>
                  <Copy className="h-4 w-4" /> 발주 문자 복사
                </SmallButton>
              </div>
            </>
          ) : (
            <WarningBox>계약금 없이 자재를 주문하면, 고객이 취소할 때 자재값을 그대로 떠안습니다.</WarningBox>
          )}
        </div>
      </SectionCard>

      {/* 2단계 */}
      <SectionCard
        num="2"
        title="관리실 신고·보양·사다리차 승인"
        subtitle="이 4개를 체크해야 철거 인부를 부를 수 있습니다."
        status={statusFor(gates[1], 1)}
        locked={!isOpen(1)}
        lockHint="1단계(계약금)를 완료하면 열립니다"
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <CheckRow checked={!!c.gates?.lift?.notice} onChange={(v) => setLiftGate({ notice: v })} label="관리실 공사 신고" />
            <CheckRow checked={!!c.gates?.lift?.protect} onChange={(v) => setLiftGate({ protect: v })} label="엘리베이터·복도 보양" />
            <CheckRow checked={!!c.gates?.lift?.neighbor} onChange={(v) => setLiftGate({ neighbor: v })} label="이웃 인사·안내문" />
            <CheckRow
              checked={!!c.gates?.lift?.ladder}
              onChange={(v) => setLiftGate({ ladder: v })}
              label="사다리차 설치 승인"
              hint="승인 없이 철거를 시작하면 지연 1순위가 됩니다."
            />
          </div>

          <Details label="이웃 인사 문자 보기">
            <p className="text-base leading-7 text-slate-700">{neighborMessage(c)}</p>
            <SmallButton className="mt-2 w-full" onClick={() => copyText(neighborMessage(c), showToast)}>
              <Copy className="h-4 w-4" /> 이웃 인사 문자 복사
            </SmallButton>
          </Details>

          {gates[1].done ? (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-600">기공 배차 문자 (전날 18시까지)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="날짜">
                  <TextInput type="date" value={c.dispatch?.date || ''} onChange={(e) => update({ dispatch: { ...c.dispatch, date: e.target.value } })} />
                </Field>
                <Field label="도착 시간">
                  <TextInput type="time" value={c.dispatch?.time || '08:00'} onChange={(e) => update({ dispatch: { ...c.dispatch, time: e.target.value } })} />
                </Field>
              </div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{dispatchText}</pre>
              <SmallButton className="mt-2 w-full" onClick={() => copyText(dispatchText, showToast, '배차 문자를 복사했습니다')}>
                <Copy className="h-4 w-4" /> 배차 문자 복사
              </SmallButton>
              <p className="mt-2 text-sm text-slate-500">결원 1명 = 일당 18만원 + 공정 1일 지연. 기초안전보건교육 이수증을 확인하세요.</p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-400"><Lock className="h-4 w-4" /> 위 4개를 모두 체크하면 배차 문자가 열립니다.</p>
          )}
        </div>
      </SectionCard>

      {/* 3단계 */}
      <SectionCard
        num="3"
        title={isWaterproof ? '방수 물 채움 테스트 48시간' : gates[2].title.split('→')[0].trim()}
        subtitle={isWaterproof ? '사진 3장과 48시간이 지나야 타일 기공을 부를 수 있습니다.' : '완료해야 다음 공정으로 갑니다.'}
        status={statusFor(gates[2], 2)}
        locked={!isOpen(2)}
        lockHint="2단계(관리실 신고·사다리차 승인)를 완료하면 열립니다"
      >
        {isWaterproof ? (
          <WaterproofBlock c={c} update={update} wp={wp} calc={calc} showToast={showToast} tick={tick} />
        ) : (
          <GenericGateBlock gate={gates[2]} c={c} update={update} />
        )}
      </SectionCard>

      {/* 4단계 */}
      <SectionCard
        num="4"
        title="준공 검수·잔금 받고 마무리"
        subtitle="3개를 모두 체크해야 정산 완료로 넘어갑니다."
        status={statusFor(gates[3], 3)}
        locked={!isOpen(3)}
        lockHint="3단계를 완료하면 열립니다"
      >
        <div className="space-y-3">
          <CheckRow checked={!!c.gates?.donePhoto} onChange={(v) => setGate({ donePhoto: v })} label="준공 사진 있음" />
          <CheckRow checked={!!c.gates?.defect} onChange={(v) => setGate({ defect: v })} label="하자 리스트 처리 끝" />
          <CheckRow
            checked={!!c.gates?.balancePaid}
            onChange={(v) => {
              setGate({ balancePaid: v });
              if (v) update({ collection: 'settled', paidAmount: calc.finalPrice });
            }}
            label="잔금 입금 확인"
            hint={`남은 금액 ${Math.round(calc.remaining)}만원`}
          />
          <BigButton
            variant="green"
            className="w-full"
            disabled={!gates[3].done}
            onClick={() => onMoveToArchive(c.id)}
          >
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

      <div
        className={cx(
          'rounded-2xl border p-4',
          wp.ready ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
        )}
      >
        <p className="text-base font-bold text-slate-700">{wp.remainingText}</p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white">
          <div
            className={cx('h-full rounded-full', wp.timeDone ? 'bg-emerald-500' : 'bg-amber-500')}
            style={{ width: `${Math.min(100, Math.round((wp.elapsedH / 48) * 100))}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-slate-600">사진 3장 + 아래층 확인 + 48시간이 모두 맞아야 열립니다.</p>
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
          <p className="flex items-center gap-1.5 text-base font-extrabold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> 타일 기공을 불러도 됩니다.</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{tileText}</pre>
          <SmallButton className="mt-2 w-full" variant="dark" onClick={() => copyText(tileText, showToast, '타일 기공 배차 문자를 복사했습니다')}>
            <Copy className="h-4 w-4" /> 타일 기공 배차 문자 복사
          </SmallButton>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-400"><Lock className="h-4 w-4" /> 위 조건이 모두 맞아야 타일 기공 배차 버튼이 열립니다.</p>
      )}

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
      <p className="mt-2 flex gap-1.5 text-sm leading-6 text-amber-800"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" /> {gate.warning}</p>
    </div>
  );
}
