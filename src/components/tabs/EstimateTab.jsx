import React, { useMemo } from 'react';
import { AlertTriangle, Camera, Check, Copy, Info, Landmark, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { TRADES, hasInteriorStyle } from '../../lib/constants.js';
import { DESIGN_PRESETS } from '../../lib/design.js';
import { BRAND_PRICES, combinedBrandPrices, combinedScopeSpecs, materialSetFor, materialSetsFor } from '../../lib/materials.js';
import { DETAIL_LIBRARY } from '../../lib/details.js';
import { firstCallQuestions, parseInput } from '../../lib/parse.js';
import { similarCases } from '../../lib/reference.js';
import { verifyEstimate } from '../../lib/verify.js';
import { subsidyInfo, SUBSIDY_CHECKS, SUBSIDY_DOCS, SUBSIDY_AGENCY, subsidyLimitText } from '../../lib/subsidy.js';
import { subsidyNotice, subsidyAgencyNotice } from '../../lib/docs.js';
import { fileToThumb } from '../../lib/image.js';
import { copyText } from '../../lib/clipboard.js';
import { useSurveyGuide } from '../../lib/useSurveyGuide.js';
import {
  BigButton,
  Card,
  CheckRow,
  Details,
  Field,
  Fold,
  Hero,
  Metric,
  Pill,
  RangeMeter,
  SectionCard,
  SmallButton,
  TextArea,
  TextInput,
  WarningBox,
  cx,
} from '../ui.jsx';
import WasteVehicleSwitch from '../WasteVehicleSwitch.jsx';
import SignalBanner from '../SignalBanner.jsx';
import { quoteSignal, parseBudget, aiSignalOf } from '../../lib/budget.js';

// 2단계 — 가견적: 1차 금액 · (마감 공종만) 스타일·자재 · 3자 시세 검증 · 답사 가이드.
export default function EstimateTab({ c, update, calc, design, showToast, completedCases = [], onGoDoc, onGoSurvey }) {
  const verify = useMemo(() => verifyEstimate(c, calc), [c, calc]);
  const ref = useMemo(() => similarCases(c, calc, completedCases), [c, calc, completedCases]);
  const hasSurvey = Math.abs(calc.adjustmentTotal) > 0 || (c.changeLogs || []).length > 0;
  const info = TRADES[c.trade] || TRADES.unclassified;
  const mset = materialSetFor(c, calc.trade);
  const msets = materialSetsFor(calc.trade);
  // 인테리어·마감 공종만 스타일·자재 카드를 보여준다 (철거·폐기물·기초·정지·인력은 자재 등급 개념이 없다)
  const showStyleCard = hasInteriorStyle(c);
  // '분위기(호텔식·우드 등)'는 감성 마감 공종에만 어울린다.
  // 바닥 미장은 몰탈 등급, 타일·방수는 타일 크기·방수 방식이라 분위기 대신 '자재 등급'으로 부른다.
  // 관공서 공고는 '호텔식 분위기'를 고르는 일이 없다 — 공고는 자재 등급만 참고로 둔다.
  const isBidCase = !!c?.bid;
  const showMood = !isBidCase && !['plaster', 'tilewaterproof'].includes(calc.trade);
  const styleTitle = isBidCase
    ? '자재 등급·사양'
    : calc.trade === 'plaster'
    ? '바닥 자재 등급 (몰탈)'
    : calc.trade === 'tilewaterproof'
    ? '타일·방수 자재 등급'
    : '스타일·자재 정하기';
  const styleSubtitle = isBidCase
    ? '설계내역서를 받기 전이라 자재 등급·사양만 참고로 정해 둡니다. 등급을 바꾸면 원가 계산이 함께 바뀝니다.'
    : calc.trade === 'plaster'
    ? '일반·고강도·자동수평 몰탈 중 무엇으로 할지에 따라 자재비와 두께·양생 기간이 달라집니다.'
    : calc.trade === 'tilewaterproof'
    ? '타일 크기(300각·600각·대형)와 방수 방식으로 자재비가 바뀝니다.'
    : '고객이 “깔끔하게”라고만 해도 쓸 자재를 정해 드립니다. 지금 공종에 맞춰 자재가 바뀝니다.';

  // 복합(집 전체)이면 포함 공종별 자재 사양을 등급마다 전부 보여준다.
  const scopesForSpec = Array.isArray(c.subScopes) ? c.subScopes : [];
  const scopeMode = calc.trade === 'combined' && scopesForSpec.length > 0;
  const specLinesFor = (set) => {
    if (!scopeMode) return set.spec;
    const lines = combinedScopeSpecs(design?.presetId, scopesForSpec, set.tier);
    return lines.length ? lines : set.spec;
  };
  const brandRows = () => {
    if (scopeMode) {
      const rows = combinedBrandPrices(scopesForSpec);
      if (rows.length) return rows;
    }
    return BRAND_PRICES[calc.trade] || [];
  };
  const selectedSpec = scopeMode ? combinedScopeSpecs(design?.presetId, scopesForSpec, mset?.tier || '표준') : null;
  const showBrand = scopeMode ? brandRows().length > 0 : !!BRAND_PRICES[calc.trade];

  return (
    <div className="space-y-4">
      <SignalBanner
        signal={aiSignalOf(c.aiAnalysis) || quoteSignal(calc, c)}
        caption={`견적 ${Math.round(calc.clientPrice).toLocaleString('ko-KR')}만 · 보수적 원가 ${Math.round(calc.costWithBuffer).toLocaleString('ko-KR')}만${parseBudget(`${c.rawInput || ''} ${c.notes || ''}`) ? ` · 고객 예산 ${parseBudget(`${c.rawInput || ''} ${c.notes || ''}`).toLocaleString('ko-KR')}만` : ''}`}
      />

      {calc.trade === 'waste' ? <WasteVehicleSwitch c={c} update={update} showToast={showToast} /> : null}

      {/* ① 가견적 (답사 전) — 진한 히어로 + 보수적 원가 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-2xs font-black text-white">①</span>
          가견적 (답사 전 예상)
        </p>
        <span className="text-2xs font-bold text-ink-3">{hasSurvey ? '답사 반영 전 금액' : '지금 계산된 견적 · 변동 가능'}</span>
      </div>
      <Hero
        eyebrow="1차 가견적 (답사 전 · 변동 가능)"
        value={Math.round(hasSurvey ? calc.baseClientPrice : calc.finalPrice).toLocaleString('ko-KR')}
        unit="만원"
        sub={`${c.includeVat ? '부가세 포함' : '부가세 별도'} · 실측 후 확정 · 예비비 ${calc.bufferRate}% 포함`}
        badge={
          <span className={cx('rounded-lg px-2 py-1 text-2xs font-extrabold', calc.isBelowBreakEven ? 'bg-rose-500/25 text-rose-200' : 'bg-emerald-400/20 text-emerald-300')}>
            {calc.isBelowBreakEven ? '원가 이하' : calc.isUncertain ? '정보 부족' : '보호됨'}
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center">
            <p className="text-[10px] font-bold text-blue-200">보수적 원가</p>
            <p className="num whitespace-nowrap text-[15px] font-black leading-5 text-white">{Math.round(calc.costWithBuffer).toLocaleString('ko-KR')}<span className="ml-0.5 text-[10px] font-bold text-blue-200">만</span></p>
          </div>
          <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center">
            <p className="text-[10px] font-bold text-blue-200">보수적 남는 돈</p>
            <p className={cx('num whitespace-nowrap text-[15px] font-black leading-5', calc.netProfitBuffered > 0 ? 'text-emerald-300' : 'text-rose-300')}>{calc.netProfitBuffered > 0 ? '+' : ''}{Math.round(calc.netProfitBuffered).toLocaleString('ko-KR')}<span className="ml-0.5 text-[10px] font-bold text-blue-200">만</span></p>
          </div>
          <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center">
            <p className="text-[10px] font-bold text-blue-200">남는 비율</p>
            <p className="num whitespace-nowrap text-[15px] font-black leading-5 text-white">{calc.marginBuffered}%</p>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold leading-4 text-blue-200">
          기본 원가 {Math.round(calc.totalDirectCost).toLocaleString('ko-KR')}만 + 예비비 {Math.round(calc.costBuffer).toLocaleString('ko-KR')}만({calc.bufferRate}%)을 미리 넣었습니다
        </p>
      </Hero>

      {calc.isBid ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-bold leading-5 text-amber-900 ring-1 ring-amber-200">
          공고 수주금액 {calc.bidPriceMan.toLocaleString('ko-KR')}만 → 실행원가 하한 {calc.bidCostFloor.toLocaleString('ko-KR')}만(80%).
          <span className="mt-0.5 block font-semibold text-amber-800">
            관공서 공고는 설계내역서·물량 확인 전까지 실행원가를 수주금액의 ~80%로 보수적으로 잡습니다.
          </span>
        </p>
      ) : null}

      <Card className={cx('mt-2 p-4', calc.isBelowBreakEven && 'ring-1 ring-rose-200')}>
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <RangeMeter min={calc.rangeMin} base={calc.clientPrice} max={calc.rangeMax} />
          <p className="mt-2 text-2xs leading-4 text-ink-3">
            최소 = 경북·안동 인건비·단순 공정 기준 / 최대 = 폐기물·운반·자재가 늘어난 경우. 실측 뒤 기준값으로 확정합니다.
          </p>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Metric label="기본 원가" value={calc.totalDirectCost} />
          <Metric label="남는 돈(기본)" value={calc.netProfit} tone={calc.netProfit > 0 ? 'good' : 'bad'} />
          <Metric label="예비비" value={calc.costBuffer} tone="warn" unit="만" />
        </div>

        <div className="mt-3 flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          <p className="text-sm leading-5 text-ink-2">{calc.targetSummary}</p>
        </div>

        {calc.adjustmentTotal !== 0 ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
            현장 변동 {calc.adjustmentTotal > 0 ? '+' : ''}
            {calc.adjustmentTotal}만원 반영됨 · 처음 {Math.round(calc.baseClientPrice).toLocaleString('ko-KR')}만 → 지금{' '}
            {Math.round(calc.clientPrice).toLocaleString('ko-KR')}만
          </p>
        ) : null}

        {calc.isBelowBreakEven ? (
          <div className="mt-3">
            <WarningBox tone="bad" title="이 가격이면 손해입니다">
              원가 {Math.round(calc.totalDirectCost)}만원보다 고객가가 낮습니다. 권장가{' '}
              <span className="font-extrabold">{calc.suggestedPrice}만원</span>으로 올리거나, 수익 탭에서 비용을 줄이세요.
            </WarningBox>
          </div>
        ) : null}

        {calc.isUncertain ? (
          <div className="mt-3">
            <WarningBox>
              아직 모르는 것: {calc.missingInfos.join(', ')} — 이 상태로 금액을 확정하면 나중에 손해를 볼 수 있습니다.
            </WarningBox>
          </div>
        ) : null}

        <Details label="첫 통화 때 물어볼 3가지" className="mt-4">
          <ol className="list-decimal space-y-1 pl-5">
            {firstCallQuestions(c, parseInput(`${c.rawInput} ${c.notes}`)).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </Details>

        <Details label={`비슷한 실제 사례 보기 (${ref.items.length}건 · 우리 완료 ${ref.ownCount || 0}건 포함)`} className="mt-2">
          <div className="space-y-2">
            {ref.verdict ? <Pill tone={ref.verdict.tone}>{ref.verdict.text}</Pill> : null}
            {ref.items.map((r) => (
              <div key={r.id} data-similar-case className={cx('rounded-xl bg-white p-3 ring-1', r.own ? 'ring-brand/30' : 'ring-slate-100')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
                    {r.own ? <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-extrabold text-brand">우리 현장</span> : null}
                    <span className="min-w-0">{r.title}</span>
                  </p>
                  <p className="num shrink-0 text-sm font-extrabold text-ink">
                    {r.low === r.high ? r.low : `${r.low}~${r.high}`}만
                  </p>
                </div>
                <p className="text-xs text-ink-3">{r.note}</p>
                <p className="text-2xs text-ink-4">{r.source}</p>
              </div>
            ))}
            {ref.items.length ? (
              <p className="text-sm text-slate-600">
                우리 견적 {ref.price}만원 · 사례 {ref.low}~{ref.high}만원 (부가세 별도 기준)
              </p>
            ) : null}
            <p className="text-xs text-slate-400">
              실제 발행·계약 견적에서 뽑은 참고값입니다. 평수·층수·철거 범위에 따라 달라집니다.
            </p>
          </div>
        </Details>
      </Card>

      {/* 2. 스타일·자재 — 마감 공종만 */}
      {showStyleCard ? (
      <Fold label={styleTitle} hint={styleSubtitle}>
      <div className="space-y-3">
          {showMood ? (
          <>
          <div>
            <p className="text-sm font-bold text-ink-2">어떤 분위기로 할까요?</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {DESIGN_PRESETS.map((p, idx) => {
                const on = design.presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => update({ design: { ...c.design, preset: p.id } })}
                    className={cx(
                      'rounded-xl p-2.5 text-left transition',
                      DESIGN_PRESETS.length % 2 === 1 && idx === DESIGN_PRESETS.length - 1 ? 'col-span-2' : '',
                      on ? 'bg-brand-soft ring-2 ring-brand' : 'bg-slate-50 ring-1 ring-slate-200/60 active:bg-slate-100'
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {(p.palette || []).map((color) => (
                        <span
                          key={color}
                          className="h-5 w-5 rounded-full ring-1 ring-black/5"
                          style={{ background: color }}
                        />
                      ))}
                      {on ? <Check className="ml-auto h-4 w-4 text-brand" strokeWidth={3} /> : null}
                    </span>
                    <span className={cx('mt-1.5 block text-sm font-extrabold', on ? 'text-brand-strong' : 'text-ink')}>
                      {p.label}
                    </span>
                    <span className="mt-0.5 block text-2xs leading-4 text-ink-3">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="고객이 한 말 / 참고 사진 키워드"
            hint="예) 밝은 우드, 호텔처럼, 그냥 깔끔하게 — 이 말로 등급을 다시 고릅니다."
          >
            <div className="flex gap-1.5">
              <TextInput
                value={c.design?.keywords || ''}
                onChange={(e) => update({ design: { ...c.design, keywords: e.target.value } })}
                placeholder="예) 밝은 우드, 호텔식으로"
              />
              <SmallButton
                variant="brand"
                className="shrink-0"
                aria-label="키워드로 등급 고르기"
                onClick={() => {
                  const next = translateDesign({ ...c, design: { ...c.design, preset: '' } });
                  update({ design: { ...c.design, preset: next.presetId } });
                  showToast(`“${next.preset.label}” 등급으로 골랐습니다`);
                }}
              >
                <Sparkles className="h-5 w-5" />
              </SmallButton>
            </div>
          </Field>
          </>
          ) : null}

          {/* 추천 자재 세트 — 탭 한 번으로 견적·손님 견적서·발주 리스트가 함께 바뀐다 */}
          <div>
            <p className="text-sm font-extrabold text-ink">추천 자재 세트</p>
            <p className="mt-0.5 text-xs font-semibold text-ink-3">
              {showMood
                ? '고객이 “실속으로” “호텔처럼”이라고만 해도 여기서 고르면 됩니다. 가격·견적서 사양·업체별 발주가 같이 바뀝니다.'
                : '등급을 고르면 자재비·견적서 사양·업체별 발주가 같이 바뀝니다.'}
            </p>
            {msets ? (
              <div className="mt-1.5 space-y-1.5">
                {msets.map((set) => {
                  const on = mset?.id === set.id;
                  return (
                    <button
                      key={set.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const prevMul = mset?.mul || 1;
                        const patch = { materialSet: set.id };
                        if (c.customClientPrice !== '' && c.customClientPrice !== null && c.customClientPrice !== undefined) {
                          const margin = Math.max(5, Math.min(60, Number(c.marginRate) || 20)) / 100;
                          const baseCost = Math.round(calc.materialTotal / prevMul);
                          const delta = Math.round((baseCost * (set.mul - prevMul)) / (1 - margin));
                          patch.customClientPrice = Math.max(0, Math.round(Number(c.customClientPrice) || 0) + delta);
                        }
                        update(patch);
                        showToast(`‘${set.label}’로 바꿨습니다 — 견적·견적서·발주 리스트를 함께 바꿨습니다`);
                      }}
                      className={cx(
                        'w-full rounded-xl p-3 text-left transition',
                        on ? 'bg-brand-soft ring-2 ring-brand' : 'bg-slate-50 ring-1 ring-slate-200/70 active:bg-slate-100'
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cx('text-sm font-extrabold', on ? 'text-brand-strong' : 'text-ink')}>
                          {set.label}
                          <span className="ml-1.5 rounded bg-white px-1 py-0.5 text-[10px] font-extrabold text-ink-3 ring-1 ring-slate-200">{set.tier}</span>
                        </span>
                        {on ? <Check className="h-4 w-4 shrink-0 text-brand" strokeWidth={3} /> : <span className="text-2xs font-bold text-ink-3">탭해서 선택</span>}
                      </span>
                      <span className="mt-0.5 block text-2xs font-bold text-ink-3">{set.brand} · {set.pick}</span>
                      <span className="mt-1 block space-y-0.5">
                        {specLinesFor(set).map((sp, i) => (
                          <span key={i} className="block text-[12px] font-semibold leading-4 text-ink-2">· {sp}</span>
                        ))}
                      </span>
                      <span className="mt-1.5 flex gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-2xs font-semibold leading-4 text-amber-900">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" /> {set.tip}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-ink-3">
                이 공종은 자재 등급 선택이 없습니다(인력·처리 중심). 공종을 바꾸면 추천 세트가 나옵니다.
              </p>
            )}
          </div>

          {showBrand ? (
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <p className="text-2xs font-extrabold text-ink-2">브랜드별 기준 가격 (참고 · 부가세 별도)</p>
              <div className="mt-1 space-y-0.5">
                {brandRows().map((b) => (
                  <div key={b.label} className="flex items-baseline justify-between gap-2 py-0.5 text-[11px] leading-4">
                    <span className="min-w-0 font-semibold text-ink-2">
                      {b.label}
                      <span className="ml-1 text-ink-4">· {b.note}</span>
                    </span>
                    <span className="shrink-0 font-extrabold text-ink">{b.price}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-extrabold text-ink">
                {mset ? mset.label : design.preset.label} · {scopeMode ? '포함 공종 전체' : info.short} 자재
              </p>
              {design.gradeRate > 0 ? (
                <Pill tone="warn">권장 +{design.gradeRate}%</Pill>
              ) : (
                <Pill tone="plain">추가 없음</Pill>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {(selectedSpec && selectedSpec.length ? selectedSpec : mset ? mset.spec : design.combo).map((s, i) => (
                <li key={i} className="flex gap-1.5 text-sm leading-5 text-ink-2">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            {design.gradeRate > 0 ? <p className="mt-2 text-2xs leading-4 text-ink-3">{design.gradeNote}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <SmallButton
                onClick={() =>
                  copyText(
                    `${mset ? mset.label : design.preset.label} (${scopeMode ? '집 전체' : info.short})\n${(selectedSpec && selectedSpec.length ? selectedSpec : mset ? mset.spec : design.combo).join('\n')}`,
                    showToast
                  )
                }
              >
                <Copy className="h-4 w-4" /> 자재 복사
              </SmallButton>
              {design.gradeRate > 0 ? (
                <SmallButton
                  variant="brand"
                  onClick={() => {
                    const amount = Math.max(
                      1,
                      Math.round((Math.round(calc.baseClientPrice) * design.gradeRate) / 100)
                    );
                    const before = Math.round(calc.clientPrice);
                    update({
                      changeLogs: [
                        ...(Array.isArray(c.changeLogs) ? c.changeLogs : []),
                        {
                          id: `chg-${Date.now()}`,
                          item: `${design.preset.label} 등급`,
                          reason: `${design.preset.label} 등급 권장 +${design.gradeRate}%`,
                          amount,
                          type: 'increase',
                          days: 0,
                          photo: false,
                          agreed: false,
                          at: new Date().toISOString().slice(0, 10),
                          before,
                          after: before + amount,
                          source: 'quick',
                        },
                      ],
                    });
                    showToast(`+${design.gradeRate}% (${amount}만원)를 견적에 넣었습니다`);
                  }}
                >
                  +{design.gradeRate}% 넣기
                </SmallButton>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-sm font-extrabold text-ink">추가 디테일 · 레퍼런스</p>
            <p className="mb-1.5 mt-0.5 text-xs leading-4 text-ink-3">
              고객이 원하는 마감을 글로 적거나 사진을 올리세요. 키워드를 읽어 <b className="text-ink-2">공정 추가비(+%)·추가 일수</b>로 자동 계산합니다.
            </p>
            <TextArea
              rows={2}
              value={c.design?.customDetails || ''}
              onChange={(e) => update({ design: { ...(c.design || {}), customDetails: e.target.value } })}
              placeholder="예) 아치 게이트, 라인조명, 우드 템바보드, 대형 포세린, 실링팬 보강"
              aria-label="추가 디테일 입력"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DETAIL_LIBRARY.slice(0, 10).map((d) => {
                const on = (c.design?.details || []).includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        design: {
                          ...(c.design || {}),
                          details: on ? (c.design.details || []).filter((x) => x !== d.id) : [...(c.design?.details || []), d.id],
                        },
                      })
                    }
                    className={cx(
                      'rounded-lg px-2 py-1 text-2xs font-bold transition',
                      on ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : 'bg-slate-100 text-ink-2 active:bg-slate-200'
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-ink-2 active:bg-slate-50">
              <Camera className="h-4 w-4" /> 참고 사진 올리기 ({(c.design?.refPhotos || []).length}/3)
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                aria-label="디테일 참고 사진"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []).slice(0, 3 - (c.design?.refPhotos || []).length);
                  const thumbs = await Promise.all(files.map(fileToThumb));
                  update({ design: { ...(c.design || {}), refPhotos: [...(c.design?.refPhotos || []), ...thumbs].slice(0, 3) } });
                  showToast(`참고 사진 ${thumbs.length}장을 붙였습니다`);
                  e.target.value = '';
                }}
              />
            </label>
            {(c.design?.refPhotos || []).length ? (
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {(c.design?.refPhotos || []).map((ph, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg bg-slate-100">
                    <img src={ph.dataUrl} alt={ph.name || '참고'} className="h-16 w-full object-cover" />
                    <button
                      type="button"
                      aria-label="참고 사진 삭제"
                      onClick={() => update({ design: { ...(c.design || {}), refPhotos: (c.design.refPhotos || []).filter((_, idx) => idx !== i) } })}
                      className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded bg-white/90 text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {design.detailRows.length ? (
              <div className="mt-2 space-y-1">
                {design.detailRows.map((d) => {
                  const base = Math.round((calc.laborTotal || 0) + (calc.materialTotal || 0));
                  const amount = Math.max(1, Math.round((base * d.rate) / 100));
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5">
                      <span className="min-w-0 text-[13px] font-bold text-amber-900">{d.label}</span>
                      <span className="shrink-0 text-2xs font-extrabold text-amber-800">
                        +{d.rate}% · 약 {amount}만 · +{d.days}일
                      </span>
                    </div>
                  );
                })}
                <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-2xs font-bold text-ink-2">
                  합계 +{design.rate}% · 공사 기간 +{design.days}일 → 견적에 반영됩니다
                </p>
              </div>
            ) : (
              <p className="mt-2 text-2xs font-semibold leading-4 text-ink-3">아직 추가한 디테일이 없습니다. 위 칩을 누르거나 글로 적어보세요.</p>
            )}
          </div>

          {design.rate > 0 ? (
            <WarningBox title={`견적 +${design.rate}% · 공사 기간 +${design.days}일`}>{design.notice}</WarningBox>
          ) : null}

          <Details label="고객에게 다시 확인할 것">
            <ol className="list-decimal space-y-2 pl-4 text-sm leading-6">
              {design.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </Details>
        </div>
      </Fold>
      ) : null}

      <Fold label="시세 검증 · 빠진 비용" hint="전문가 시세와 비교하고, 빠뜨린 비용이 있는지 봅니다">
        <VerifyCard verify={verify} calc={calc} c={c} update={update} showToast={showToast} />
      </Fold>

      <Fold label="점포철거비 지원금" hint="손님이 공단에서 돌려받는 돈 — 상가·철거 현장만">
        <SubsidyCard c={c} update={update} showToast={showToast} onOpenDoc={onGoDoc} />
      </Fold>
    </div>
  );
}

const MISSING_TO_SURVEY = { protect: 'protectLevel', admin: 'adminDeposit', lift: 'materialLift', clean: 'afterCare', waste: 'wasteIncluded' };

function VerifyCard({ verify, calc, c, update, showToast }) {
  const tone = verify.verdict.tone === 'ok' ? 'good' : verify.verdict.tone === 'bad' ? 'bad' : verify.verdict.tone === 'info' ? 'info' : 'warn';
  const missingNow = verify.missing.filter((m) => !m.ok);
  const { aiOn, busy, guide, retry } = useSurveyGuide(c, calc, update);
  const fillMissing = () => {
    const next = { ...(c?.survey || {}) };
    missingNow.forEach((m) => {
      const sid = MISSING_TO_SURVEY[m.id];
      if (sid) next[sid] = true;
    });
    if (update) update({ survey: next });
    if (showToast) showToast(`빠진 비용 ${missingNow.length}가지를 견적에 넣었습니다`);
  };
  const tips = guide.tips;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-ink">
            <ShieldCheck className="h-5 w-5 text-slate-900" strokeWidth={2.4} />
            2026 최신 시세 3자 검증
          </p>
          <p className="mt-0.5 text-xs font-semibold text-ink-3">예비비 {calc.bufferRate}% 넣은 원가 → 전문가·시세 입장에서 다시 봤습니다</p>
        </div>
        <Pill tone={tone}>{verify.verdict.label}</Pill>
      </div>

      <div className="px-4 pb-4 pt-3">
        <div
          className={cx(
            'rounded-2xl px-3.5 py-3',
            tone === 'good' ? 'bg-emerald-50' : tone === 'bad' ? 'bg-rose-50' : tone === 'info' ? 'bg-blue-50' : 'bg-amber-50'
          )}
        >
          <p className="text-base font-extrabold leading-6 text-ink">{verify.verdict.headline}</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink-2">{verify.verdict.detail}</p>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {verify.rows.map((r, i) => (
            <div key={r.label} className={cx('flex items-center justify-between gap-2 px-3 py-2', i % 2 ? 'bg-slate-50' : 'bg-white')}>
              <span className="text-xs font-bold text-ink-3">{r.label}</span>
              <span
                className={cx(
                  'num text-right text-sm font-extrabold',
                  r.tone === 'good' ? 'text-emerald-600' : r.tone === 'bad' ? 'text-rose-600' : r.tone === 'warn' ? 'text-amber-700' : r.tone === 'brand' ? 'text-brand-strong' : 'text-ink'
                )}
                title={r.hint || ''}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-ink">빠진 비용 체크</p>
            {missingNow.length ? <Pill tone="bad">{missingNow.length}가지 빠짐</Pill> : <Pill tone="ok">모두 반영</Pill>}
          </div>
          {/* 다 반영됐으면 목록을 접어 스크롤을 줄인다 (3단계 '빠뜨리기 쉬운 비용'과 중복 방지) */}
          {missingNow.length ? (
          <div className="grid grid-cols-2 gap-1.5">
            {verify.missing.map((m) => (
              <div
                key={m.id}
                className={cx('rounded-xl px-2.5 py-2', m.ok ? 'bg-emerald-50' : 'bg-rose-50 ring-1 ring-rose-200')}
                title={m.why}
              >
                <p className={cx('flex items-center gap-1 text-[11px] font-extrabold leading-4', m.ok ? 'text-emerald-700' : 'text-rose-700')}>
                  {m.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <AlertTriangle className="h-3 w-3" strokeWidth={3} />}
                  {m.label}
                </p>
                <p className="text-[10px] font-semibold text-ink-3">{m.ok ? '반영됨' : `빠짐 · ${m.cost}`}</p>
              </div>
            ))}
          </div>
          ) : null}
          {missingNow.length ? (
            <BigButton className="mt-2 w-full" onClick={fillMissing}>
              <Wand2 className="h-5 w-5" /> 빠진 비용 한 번에 넣기 ({missingNow.length}가지)
            </BigButton>
          ) : (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-2xs font-bold leading-4 text-emerald-800">
              보양·폐기물·양중·관리실 신고·준공 청소까지 견적에 들어가 있습니다. 현장에서 달라진 것만 3. 답사에 적으세요.
            </p>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-amber-900">
              <AlertTriangle className="h-4 w-4" /> 답사 시 꼭 확인하세요 (추가 비용 발생 경우의 수)
            </p>
            {guide.source === 'ai' ? (
              <Pill tone="info">{busy ? 'AI가 고르는 중' : '🤖 AI 맞춤'}</Pill>
            ) : aiOn ? (
              <Pill tone="plain">{busy ? 'AI가 고르는 중' : '기본 가이드'}</Pill>
            ) : (
              <Pill tone="plain">공종별 기본</Pill>
            )}
          </div>
          <ul className="mt-1.5 space-y-1">
            {tips.map((t, i) => (
              <li key={i} className="flex gap-1.5 text-[13px] font-semibold leading-5 text-amber-900">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          {guide.comment ? (
            <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-2xs font-semibold leading-4 text-amber-900">
              🤖 {guide.comment}
            </p>
          ) : null}
          <p className="mt-2 text-2xs font-bold leading-4 text-amber-800">
            이 중 하나라도 걸리면 견적이 올라갑니다. 확인한 내용은 3. 답사에 적으면 바로 반영됩니다.
            {aiOn ? (
              <button type="button" onClick={retry} className="ml-1 underline underline-offset-2">
                AI로 다시 뽑기
              </button>
            ) : null}
          </p>
        </div>

        <p className="mt-2.5 text-xs leading-5 text-ink-2">{verify.advice}</p>
        <p className="mt-1 text-2xs text-ink-4">
          근거: 2026 하반기 대한건설협회 노임(철거공 261,108원·타일공 294,379원) · 2026.1.1 건설폐기물 중간처리단가(혼합 72,721원/톤) · 우리 실견적 419건 DB
        </p>
      </div>
    </Card>
  );
}

function SubsidyCard({ c, update, showToast, onOpenDoc }) {
  const info = subsidyInfo(c);
  const checks = c.subsidyCheck || {};
  const done = SUBSIDY_CHECKS.filter((q) => checks[q.id]).length;
  const toggle = (id) => update && update({ subsidyCheck: { ...checks, [id]: !checks[id] } });
  // 상가·점포 철거 현장에서만 보여준다 (욕실·도배 등 주거 공사에는 해당 없음)
  if (!info.storeish) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Landmark className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-6 text-ink">점포철거비 지원금 (최대 600만원)</h3>
          <p className="mt-0.5 text-xs leading-4 text-ink-3">
            손님이 공단에서 돌려받는 돈입니다. 우리 견적에 더하는 금액이 아닙니다.
          </p>
        </div>
        <Pill tone={info.applicable ? 'info' : 'plain'}>{info.applicable ? '대상 가능' : '대상 확인'}</Pill>
      </div>

      <div className="p-4 pt-3">
        <div className="rounded-xl bg-brand-soft px-3 py-3">
          <p className="text-2xs font-bold text-brand">이 현장 예상 한도</p>
          <p className="num mt-0.5 text-[26px] font-extrabold leading-8 tracking-tight text-brand-strong">
            {Math.round(info.limit).toLocaleString('ko-KR')}
            <span className="ml-0.5 text-sm font-bold">만원</span>
          </p>
          <p className="mt-0.5 text-2xs leading-4 text-brand">{subsidyLimitText(info)} · 부가세 제외</p>
        </div>

        {/* 1) 대상 판별 체크리스트 */}
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-ink">대상인지 확인 (하나라도 아니면 지원 불가)</p>
            <Pill tone={done === SUBSIDY_CHECKS.length ? 'ok' : 'warn'}>
              {done}/{SUBSIDY_CHECKS.length}
            </Pill>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {SUBSIDY_CHECKS.map((q) => (
              <CheckRow
                key={q.id}
                checked={!!checks[q.id]}
                onChange={() => toggle(q.id)}
                label={q.label}
                hint={q.hint}
              />
            ))}
          </div>
          <p className="mt-1.5 text-2xs font-semibold leading-4 text-ink-3">
            전부 체크되면 손님께 “받을 수 있다”고 말해도 됩니다. 하나라도 비면 공단에 먼저 확인하세요.
          </p>
        </div>

        {/* 2) 필요 서류 6종 */}
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-extrabold text-ink-2">필요 서류 6종 (누가 준비하는지)</p>
          <div className="mt-1.5 space-y-1">
            {SUBSIDY_DOCS.map((d, i) => (
              <div key={d.id} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200/70">
                <div className="min-w-0">
                  <p className="text-2xs font-bold leading-4 text-ink">
                    {i + 1}. {d.label}
                  </p>
                  <p className="mt-0.5 text-2xs leading-4 text-ink-3">{d.hint}</p>
                </div>
                <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold', d.owner === '우리' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-2')}>
                  {d.owner}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3) 대행 수수료 안내 */}
        <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-extrabold text-amber-900">서류 대행, 비용은?</p>
          <ul className="mt-1 space-y-1 text-2xs font-semibold leading-4 text-amber-900">
            <li>· {SUBSIDY_AGENCY.freeNote}</li>
            <li>· {SUBSIDY_AGENCY.paidNote}</li>
            <li>· {SUBSIDY_AGENCY.caution}</li>
          </ul>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            <SmallButton variant="brand" className="w-full" onClick={() => copyText(subsidyNotice(c), showToast, '지원금 안내 문자를 복사했습니다')}>
              <Copy className="h-4 w-4" /> 손님에게 보낼 지원금 안내 복사
            </SmallButton>
            <SmallButton className="w-full" onClick={() => copyText(subsidyAgencyNotice(c), showToast, '대행 안내 문자를 복사했습니다')}>
              <Copy className="h-4 w-4" /> 서류 대행 안내 문자 복사
            </SmallButton>
            {onOpenDoc ? (
              <SmallButton variant="dark" className="w-full" onClick={() => onOpenDoc()}>
                <Landmark className="h-4 w-4" /> 지원금 제출용 공사내역서 뽑기
              </SmallButton>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-ink-3">
          <span>신청 {info.applyUrl}</span>
          <span className="num font-bold text-ink-2">{info.phone}</span>
        </div>

        <Details label="지원이 안 되는 경우" className="mt-2">
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-ink-2">
            <li>자가 건물이거나 무상으로 빌린 점포</li>
            <li>건축물대장상 용도가 주거용인 곳</li>
            <li>이미 점포철거비를 받은 사업자(1회만 가능)</li>
            <li>업체를 거치지 않은 자력 철거, 현금 거래</li>
            <li>2025년 7월 11일 이전에 폐업했다면 한도가 400만원입니다</li>
          </ul>
        </Details>
      </div>
    </Card>
  );
}

// 현장에서 눈으로 보고 O/X만 누르면 최종 견적이 바로 바뀌는 체크리스트.
