import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { won } from '../../lib/pricing.js';
import { BigButton, Card, Details, Field, Metric, Money, Pill, SectionCard, SmallButton, TextInput, Toggle, WarningBox, cx } from '../ui.jsx';
import { copyText } from './EstimateTab.jsx';
import { ratesOf } from '../../lib/rates.js';

export default function ProfitTab({ c, update, calc, showToast, onOpenSettings }) {
  const listPrice = Math.round(calc.clientPrice);
  const cost = Math.round(calc.costWithBuffer);
  const baseCost = Math.round(calc.totalDirectCost);
  const defense = Math.round(calc.minimumDefense);

  const initial = Number(c.negotiation?.proposal) || listPrice;
  const [proposal, setProposal] = useState(initial);

  const result = useMemo(() => {
    const price = Number(proposal) || 0;
    const net = price - cost;
    const margin = price > 0 ? Math.round((net / price) * 100) : 0;
    const below = net <= 0;
    const thin = !below && price < defense;
    return { price, net, margin, below, thin };
  }, [proposal, cost, defense]);

  const suggestions = useMemo(() => {
    const material = Math.round(calc.materialTotal);
    const labor = Math.round(calc.laborTotal);
    const items = [];
    if (material > 20)
      items.push({
        id: 'material',
        label: '자재를 한 등급 낮추기',
        saving: Math.round(material * 0.08),
        how: '예) 600각 포세린 → 300×600 국산타일, 2.2T 장판 → 1.8T',
      });
    if (calc.detailSurcharge?.rate > 0)
      items.push({
        id: 'detail',
        label: '어려운 마감 빼기',
        saving: Math.round((labor + material) * (calc.detailSurcharge.rate / 100)),
        how: `예) ${calc.detailSurcharge.rows.map((d) => d.label).join(', ')} 제외`,
      });
    if (labor > 30)
      items.push({
        id: 'helper',
        label: '보조 인력 하루 줄이기',
        saving: 15,
        how: '현장 정리·운반을 직접 도우면 가능합니다',
      });
    items.push({ id: 'clean', label: '준공 청소·보양 범위 조정', saving: 8, how: '고객이 청소를 직접 하겠다고 할 때' });
    return items;
  }, [calc]);

  const pers = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '0');

  // 고객에게 보내는 말에는 내 순수익·남는 돈을 절대 쓰지 않는다.
  const message = useMemo(() => {
    if (result.below || result.thin) {
      return `사장님, 인건비와 폐기물 처리 실비가 워낙 올라서 ${pers(result.price)}만원으로는 손해라 어렵습니다. ${pers(defense)}만원까지 맞춰주시면 바로 진행하겠습니다.`;
    }
    return '사장님, 말씀하신 금액 선에서 인력·자재 빠짐없이 챙겨서 꼼꼼히 책임 시공하겠습니다.';
  }, [result, defense]);

  const sliderMax = Math.max(Math.ceil(listPrice * 1.5), Math.ceil((Number(proposal) || 0) * 1.2), 500);
  const sliderMin = Math.max(0, Math.floor(cost * 0.7));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <p className="text-xs font-bold text-ink-3">이 견적에서 보수적으로 남는 돈</p>
          <Pill tone={calc.netProfitBuffered <= 0 ? 'bad' : calc.marginBuffered < 12 ? 'warn' : 'ok'}>
            {calc.netProfitBuffered <= 0 ? '원가 이하' : calc.marginBuffered < 12 ? '위험' : '좋음'}
          </Pill>
        </div>
        <p
          className={cx(
            'num mt-1 text-[36px] font-black leading-[44px] tracking-tight',
            calc.netProfitBuffered > 0 ? 'text-emerald-600' : 'text-rose-600'
          )}
        >
          {pers(calc.netProfitBuffered)}
          <span className="ml-1 text-base font-bold text-ink-3">만원</span>
        </p>
        <p className="mt-0.5 text-sm font-semibold text-ink-3">
          {pers(calc.clientPrice)}만원에 팔면 · 보수적 원가 {pers(cost)}만(예비비 {calc.bufferRate}% {pers(calc.costBuffer)}만 포함) · 남는 비율 {calc.marginBuffered}%
        </p>
        <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-2xs font-bold text-ink-3">
          예비비를 빼면 실제 기대 {pers(calc.netProfit)}만({calc.marginPercent}%) · 기본 원가 {pers(baseCost)}만
        </p>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Metric label="보수적 원가" value={cost} />
          <Metric label="최소 방어선" value={defense} tone="warn" />
          <Metric label="부른 금액" value={listPrice} />
        </div>
      </Card>

      {/* 네고 시뮬레이터 */}
      <SectionCard num="1" title="고객이 깎자고 할 때" subtitle="숫자를 바꾸면 남는 돈이 바로 바뀝니다.">
        <div className="space-y-3">
          <Field label="고객이 부른 금액 (만원)">
            <TextInput
              inputMode="numeric"
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              onBlur={() => update({ negotiation: { ...c.negotiation, proposal: Number(proposal) || 0 } })}
            />
          </Field>

          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={Number(proposal) || 0}
            onChange={(e) => setProposal(Number(e.target.value))}
            onMouseUp={() => update({ negotiation: { ...c.negotiation, proposal: Number(proposal) || 0 } })}
            onTouchEnd={() => update({ negotiation: { ...c.negotiation, proposal: Number(proposal) || 0 } })}
            className="h-3 w-full accent-slate-900"
            aria-label="제안 금액"
          />

          <div>
            <div className="relative h-2 rounded-full bg-slate-100">
              <div
                className={cx(
                  'absolute inset-y-0 left-0 rounded-full',
                  result.below ? 'bg-rose-400' : result.thin ? 'bg-amber-400' : 'bg-brand'
                )}
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, ((Number(proposal || 0) - sliderMin) / (sliderMax - sliderMin || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-2xs font-semibold text-ink-3">
              <span>원가 {pers(cost)}</span>
              <span>부른 금액 {pers(listPrice)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[5, 10, 20].map((d) => (
              <SmallButton
                key={d}
                onClick={() => {
                  const next = Math.max(0, listPrice - d);
                  setProposal(next);
                  update({ negotiation: { ...c.negotiation, proposal: next } });
                }}
              >
                -{d}만
              </SmallButton>
            ))}
            <SmallButton onClick={() => { setProposal(listPrice); update({ negotiation: { ...c.negotiation, proposal: listPrice } }); }}>
              원래 값
            </SmallButton>
          </div>

          {Number(proposal) !== listPrice ? (
            <SmallButton
              variant="dark"
              className="w-full"
              onClick={() => {
                update({ customClientPrice: Number(proposal) || 0 });
                showToast(`${pers(Number(proposal))}만원을 이 현장 견적에 적용했습니다`);
              }}
            >
              이 금액을 이 현장 견적으로 적용
            </SmallButton>
          ) : null}

          <div
            className={cx(
              'rounded-2xl border p-4',
              result.below ? 'border-rose-300 bg-rose-50' : result.thin ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
            )}
          >
            <p className="text-base font-bold text-slate-700">{pers(result.price)}만원에 하면</p>
            <p className={cx('mt-1 text-3xl font-extrabold tabular-nums', result.below ? 'text-rose-700' : 'text-slate-900')}>
              {result.net >= 0 ? '+' : ''}
              {pers(result.net)}
              <span className="ml-0.5 text-base font-bold text-ink-3">만원</span>
            </p>
            <p className="mt-1 text-base font-bold">
              {result.below
                ? `원가보다 ${pers(Math.abs(result.net))}만원 손해입니다. 이 가격엔 팔면 안 됩니다.`
                : result.thin
                ? `최소 방어선(${pers(defense)}만)보다 낮습니다. 하자 한 번이면 손해입니다.`
                : `남는 비율 ${result.margin}% — 진행해도 됩니다.`}
            </p>
          </div>

          <Details label="이 가격에 맞추는 방법 (원가 줄이기)">
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-xl bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-slate-800">{s.label}</p>
                    <p className="text-base font-extrabold tabular-nums text-emerald-700">-{s.saving}만</p>
                  </div>
                  <p className="text-sm text-slate-500">{s.how}</p>
                </div>
              ))}
              <p className="text-sm text-slate-500">
                예: 자재 등급을 낮추면 원가가 {suggestions[0].saving}만원 줄어, {pers(cost - suggestions[0].saving)}만원에도 남는 돈이 생깁니다.
              </p>
            </div>
          </Details>

          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-sm font-bold text-slate-300">고객에게 이렇게 말하세요</p>
            <p className="mt-1 text-base leading-7">{message}</p>
            <SmallButton className="mt-3 w-full border-slate-700 bg-slate-800 text-white" onClick={() => copyText(message, showToast)}>
              <Copy className="h-4 w-4" /> 설득 멘트 복사
            </SmallButton>
          </div>
        </div>
      </SectionCard>

      {/* 알선료 — 인력 지원일 때만 간단히, 나머지는 설정 링크만 */}
      <button
        type="button"
        onClick={() => onOpenSettings && onOpenSettings()}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-card active:bg-slate-50"
      >
        <span>
          <span className="block text-sm font-extrabold text-ink">인력 소개비(알선료) {c.agencyFeeRate ?? 10}%</span>
          <span className="block text-2xs font-semibold text-ink-3">일용 소개비 상한 10% · 설정에서 바꿉니다</span>
        </span>
        <span className="text-2xs font-extrabold text-brand">설정 열기</span>
      </button>

      {/* 상세 */}
      <Card className="p-4">
        <Details label="원가 내역 · 남는 비율 · 지급 비율 바꾸기">
          <div className="space-y-4">
            <div className="space-y-1">
              {calc.items
                .filter((i) => i.amount !== 0)
                .map((i) => {
                  const excluded = (c.excludedItems || []).includes(i.id);
                  return (
                    <div
                      key={i.id}
                      className={cx(
                        'flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm',
                        excluded ? 'opacity-50' : ''
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cx('font-bold text-slate-800', excluded ? 'line-through' : '')}>{i.name}</p>
                        {i.detail ? <p className="text-slate-500">{i.detail}</p> : null}
                      </div>
                      <p
                        className={cx(
                          'shrink-0 font-extrabold tabular-nums',
                          excluded ? 'text-slate-400 line-through' : i.amount < 0 ? 'text-emerald-700' : 'text-slate-700'
                        )}
                      >
                        {pers(i.amount)}만
                      </p>
                      <button
                        type="button"
                        aria-label={`${i.name} ${excluded ? '다시 포함' : '제외'}`}
                        onClick={() =>
                          update({
                            excludedItems: excluded
                              ? (c.excludedItems || []).filter((x) => x !== i.id)
                              : [...(c.excludedItems || []), i.id],
                          })
                        }
                        className={cx(
                          'flex min-h-9 shrink-0 items-center rounded-full border px-2.5 text-xs font-bold',
                          excluded
                            ? 'border-slate-200 bg-white text-slate-500'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        )}
                      >
                        {excluded ? '제외됨' : '포함'}
                      </button>
                    </div>
                  );
                })}
              <div className="flex justify-between pt-2 text-base font-extrabold">
                <span>원가 합계</span>
                <span className="tabular-nums">{pers(cost)}만원</span>
              </div>
              {calc.excludedAmount ? (
                <p className="text-sm text-slate-500">
                  제외한 항목 {calc.excludedIds.length}개 · -{pers(calc.excludedAmount)}만원
                </p>
              ) : null}
            </div>

            <Field label={`남는 비율 ${c.marginRate}%`} hint="고객에게 받는 금액 = 원가 ÷ (1 − 남는 비율)">
              <input
                type="range"
                min={5}
                max={55}
                step={1}
                value={Number(c.marginRate) || 20}
                onChange={(e) => update({ marginRate: Number(e.target.value), customClientPrice: '' })}
                className="h-3 w-full accent-slate-900"
              />
            </Field>

            <Field label="고객에게 받을 금액 직접 정하기 (만원)" hint="비우면 남는 비율로 자동 계산합니다.">
              <TextInput
                inputMode="numeric"
                value={c.customClientPrice ?? ''}
                onChange={(e) => update({ customClientPrice: e.target.value })}
                placeholder={`자동: ${calc.suggestedPrice}만원`}
              />
            </Field>

            <Toggle
              checked={!!c.includeVat}
              onChange={(v) => update({ includeVat: v })}
              label="부가세 10% 따로 받기"
              hint={c.includeVat ? '견적서에 부가세를 따로 표시합니다' : '견적 금액에 부가세를 더하지 않습니다'}
            />

            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'deposit', label: '계약금' },
                { key: 'mid', label: '중도금' },
                { key: 'balance', label: '잔금' },
              ].map((p) => (
                <Field key={p.key} label={`${p.label} %`}>
                  <TextInput
                    inputMode="numeric"
                    value={c.paymentPlan?.[p.key] ?? 0}
                    onChange={(e) =>
                      update({ paymentPlan: { ...(c.paymentPlan || {}), [p.key]: Number(e.target.value) || 0 } })
                    }
                  />
                </Field>
              ))}
            </div>
            {calc.balanceRatio < 20 ? (
              <WarningBox>잔금 비율이 {calc.balanceRatio}%입니다. 20% 이상을 권장합니다(최종 검수·하자 보수 후 지급).</WarningBox>
            ) : null}

            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-base font-extrabold text-slate-800">이 현장에 적용된 단가표</p>
              <p className="mt-0.5 text-sm text-slate-500">
                현장을 만든 날의 값입니다. 설정에서 단가를 바꿔도 이 현장 금액은 그대로입니다.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {[
                  ['철거 기공', 'labor.demolition', '만/일'],
                  ['보조·잡부', 'labor.helper', '만/일'],
                  ['도배 기공', 'labor.wallpaper', '만/일'],
                  ['타일 기공', 'labor.bathroom', '만/일'],
                  ['주방 기공', 'labor.kitchen', '만/일'],
                  ['2.5톤 폐기물', 'waste.truckMixed', '만/대'],
                  ['집게차', 'waste.grapple', '만/회'],
                  ['사다리차 반나절', 'ladder.half', '만'],
                ].map(([label, path, unit]) => {
                  const r = ratesOf(c);
                  const [a, b] = path.split('.');
                  return (
                    <div key={path} className="flex justify-between gap-1">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {r[a]?.[b]} {unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Details>
      </Card>
    </div>
  );
}
