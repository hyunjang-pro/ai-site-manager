import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Info, TrendingDown, Wallet } from 'lucide-react';
import { won } from '../../lib/pricing.js';
import { BigButton, Card, Details, Field, Metric, Money, Pill, SectionCard, SmallButton, TextInput, Toggle, WarningBox, cx } from '../ui.jsx';
import { copyText } from '../../lib/clipboard.js';
import { ratesOf } from '../../lib/rates.js';
import { resolveSurvey } from '../../lib/site.js';
import { estimateWorkDays } from '../../lib/schedule.js';
import AfterPreview, { PREVIEW_TRADES } from '../AfterPreview.jsx';
import SignalBanner from '../SignalBanner.jsx';
import CostFlow from '../CostFlow.jsx';
import MarketBandCard from '../MarketBandCard.jsx';
import { finalSignal, aiSignalOf } from '../../lib/budget.js';
import { clientHonorific } from '../../lib/docs.js';
import { materialSetFor, materialSetsFor } from '../../lib/materials.js';
import { hasInteriorStyle } from '../../lib/constants.js';
import { changeLabel } from '../../lib/changelog.js';
import { useCalledPrice } from '../../lib/useCalledPrice.js';

export default function ProfitTab({ c, update, calc, design, showToast, onOpenSettings }) {
  const listPrice = Math.round(calc.clientPrice);
  const cost = Math.round(calc.costWithBuffer);
  const baseCost = Math.round(calc.totalDirectCost);
  const defense = Math.round(calc.minimumDefense);
  const workDays = Math.max(1, parseInt(c.workDays, 10) || estimateWorkDays(c, calc, design?.days || 0));
  const dailyProfit = Math.round(calc.netProfitBuffered / workDays);
  const defenseGap = Math.max(0, defense - cost);
  // 화면에 보이는 두 숫자(가견적 → 최종)의 실제 차이 — 배지·신호등 문구를 이 값으로 통일한다
  const finalDelta = Math.round(Number(calc.clientPrice)) - Math.round(Number(calc.baseClientPrice));
  // 변동 내역 — '앱 계산가'와 '손님과 합의한 금액'을 나눠서 보여준다 (숫자가 안 맞아 보이지 않게)
  const logs = (calc.changeLogs || []).filter((l) => Number(l.amount) !== 0);
  const appDelta = Math.round(Number(calc.appClientPrice)) - Math.round(Number(calc.baseClientPrice));
  const calledAdjust = Math.round(Number(calc.clientPrice)) - Math.round(Number(calc.appClientPrice));

  const initial = Number(c.negotiation?.proposal) || listPrice;
  const [proposal, setProposal] = useState(initial);

  // ---- 내가 부른 금액(손님 합의가) — 이 화면의 기준 금액 (2단계 가견적과 같은 저장값) ----
  const {
    draft: calledDraft,
    commit: commitCalled,
    settle: settleCalled,
    reset: resetCalled,
    appPrice,
    noCalled,
    effective: effectiveCalled,
  } = useCalledPrice(c, calc, update);
  const nudgeCalled = (delta) => commitCalled(String(Math.max(0, effectiveCalled + delta)));
  const restoreAppPrice = () => {
    resetCalled();
    showToast(`앱 계산가 ${appPrice.toLocaleString('ko-KR')}만원으로 되돌렸습니다`);
  };
  const [negoOpen, setNegoOpen] = useState(false);
  useEffect(() => {
    // 손님이 실제로 깎자고 했을 때만 펼친다
    if (Number(proposal) < listPrice) setNegoOpen(true);
  }, [proposal, listPrice]);

  const result = useMemo(() => {
    const price = Number(proposal) || 0;
    const net = price - cost;
    const margin = price > 0 ? Math.round((net / price) * 100) : 0;
    reportNet(price);
    return { price, net, margin, below: net <= 0, thin: !net ? false : net > 0 && price < defense };
    function reportNet() {}
  }, [proposal, cost, defense]);

  const pers = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '0');

  // ---- 원가 구성 비중 ----
  const parts = [
    { id: 'labor', label: '인건비', value: Math.round(calc.laborTotal), tone: 'bg-brand' },
    { id: 'waste', label: '폐기물·운반', value: Math.round(calc.wasteTotal + calc.equipTotal), tone: 'bg-amber-500' },
    { id: 'material', label: '자재', value: Math.round(calc.materialTotal), tone: 'bg-cyan-500' },
    { id: 'site', label: '현장·규제', value: Math.round(calc.surchargeExtra || 0), tone: 'bg-violet-500' },
    { id: 'adjust', label: '답사 변동', value: Math.round(calc.adjustTotal || 0), tone: Math.round(calc.adjustTotal || 0) < 0 ? 'bg-emerald-500' : 'bg-rose-500' },
    { id: 'buffer', label: `예비비 ${calc.bufferRate}%`, value: Math.round(calc.costBuffer), tone: 'bg-slate-400' },
  ].filter((p) => p.value > 0);
  const partsTotal = Math.max(1, parts.reduce((s, p) => s + Math.max(0, p.value), 0));

  // ---- 실전 원가 절감 스위치 ----
  const itemAmount = (id) => Math.round((calc.items || []).find((i) => i.id === id)?.amount || 0);
  const mset = materialSetFor(c, calc.trade);
  const sets = materialSetsFor(calc.trade);
  // 철거·폐기물·기초·정지·인력은 자재 등급이 견적을 바꾸지 않는다 → 대안 목록에도 넣지 않는다
  const interior = hasInteriorStyle(c);
  const budgetSet = sets?.find((s) => s.tier === '실속');
  const gradeSaving =
    budgetSet && mset && mset.id !== budgetSet.id
      ? Math.max(0, Math.round(calc.materialTotal * (1 - budgetSet.mul / mset.mul)))
      : 0;

  const switches = [
    {
      id: 'selfWaste',
      label: '폐기물 직접 분리',
      saving: itemAmount('mixedWaste'),
      on: !c.survey?.wasteMixed,
      onLabel: '분리 중',
      offLabel: '혼합 반출 중',
      show: itemAmount('mixedWaste') > 0,
      action: () => update({ survey: { ...(c.survey || {}), wasteMixed: !c.survey?.wasteMixed } }),
    },
    {
      id: 'helper',
      label: '보조 인력 1명 줄이기',
      saving: Math.round(ratesOf(c)?.labor?.helper || 17),
      on: !!c.cuts?.helper,
      onLabel: '줄임',
      offLabel: '2명 투입',
      show: cfgHasHelper(calc.trade),
      action: () => update({ cuts: { ...(c.cuts || {}), helper: !c.cuts?.helper } }),
    },
    {
      id: 'clean',
      label: '준공 청소 빼기',
      saving: itemAmount('clean'),
      on: !resolveSurvey(c).afterCare,
      onLabel: '뺌',
      offLabel: '포함',
      show: itemAmount('clean') > 0,
      action: () => update({ survey: { ...(c.survey || {}), afterCare: !resolveSurvey(c).afterCare } }),
    },
    {
      id: 'grade',
      label: '자재 등급 한 단계 낮추기',
      saving: gradeSaving,
      on: !budgetSet || mset?.id === budgetSet.id,
      onLabel: '실속',
      offLabel: mset ? `${mset.tier}` : '표준',
      show: interior && !!budgetSet && !!mset,
      action: () => update({ materialSet: budgetSet?.id || '' }),
    },
  ].filter((s) => s.show && Math.round(s.saving) > 0);

  // 반올림한 값으로 합계를 낸다 — 0.4만처럼 남는 소수가 '−0만'으로 찍히지 않게
  const savingsTotal = Math.round(switches.filter((s) => s.on).reduce((sum, s) => sum + s.saving, 0));

  // 공종에 맞는 '진짜 아끼는' 대안만 — 0만원짜리는 목록에서 뺀다.
  const isFinishTrade = ['wallpaper', 'bathroom', 'kitchen', 'tilewaterproof', 'window', 'plaster', 'combined', 'custom', 'repair'].includes(calc.trade);
  const allowsHelper = ['demolition', 'wallpaper', 'bathroom', 'kitchen', 'plaster', 'tilewaterproof', 'combined', 'custom'].includes(calc.trade);
  const detailSaving = Math.round(((calc.laborTotal || 0) + (calc.materialTotal || 0)) * ((design?.rate || 0) / 100));
  const liftSaving = Math.round(calc.lifting?.cost || 0);
  const wasteSepSaving = itemAmount('mixedWaste');
  const alternatives = [
    isFinishTrade && interior && gradeSaving > 0
      ? {
          id: 'grade',
          label: '자재 등급 한 단계 낮추기',
          note: '예) 600각 포세린 → 300×600 국산, 실크 → 광폭합지',
          saving: gradeSaving,
          action: () => update({ materialSet: budgetSet?.id || '', customClientPrice: '' }),
        }
      : null,
    isFinishTrade && design?.detailRows?.length && detailSaving > 0
      ? {
          id: 'detail',
          label: '어려운 마감·디테일 빼기',
          note: design.detailRows.map((d) => d.label).join(', '),
          saving: detailSaving,
          action: () => update({ design: { ...(c.design || {}), details: [], customDetails: '' } }),
        }
      : null,
    isFinishTrade && itemAmount('clean') > 0
      ? {
          id: 'clean',
          label: '준공 청소는 손님이 직접',
          note: '고객이 직접 하겠다고 할 때만',
          saving: itemAmount('clean'),
          action: () => update({ survey: { ...(c.survey || {}), afterCare: false } }),
        }
      : null,
    !isFinishTrade && liftSaving > 0
      ? {
          id: 'lift',
          label: '고객이 1층에서 직접 하차 (양중비 절감)',
          note: '차량이 현장 앞까지 오면 양중 인력·사다리차를 빼도 됩니다',
          saving: liftSaving,
          action: () => update({ lifting: { ...(c.lifting || {}), mode: 'none' } }),
        }
      : null,
    !isFinishTrade && allowsHelper
      ? {
          id: 'helperAlt',
          label: '보조 인부 1명 감축',
          note: '현장 정리·운반을 우리가 직접 하는 조건',
          saving: Math.round(ratesOf(c)?.labor?.helper || 17),
          action: () => update({ cuts: { ...(c.cuts || {}), helper: !c.cuts?.helper } }),
        }
      : null,
    !isFinishTrade && wasteSepSaving > 0
      ? {
          id: 'sep',
          label: '혼합 폐기물 성상 분리',
          note: '섞어 버리면 처리비가 3~6배 — 나누기만 해도 줄어듭니다',
          saving: wasteSepSaving,
          action: () => update({ survey: { ...(c.survey || {}), wasteMixed: false } }),
        }
      : null,
  ].filter((x) => x && Math.round(x.saving) > 0);


  // 고객에게 보내는 말에는 내 순수익·남는 돈을 절대 쓰지 않는다.
  // 상가면 사장님, 집·아파트면 고객님 — 앱 공종 이름이 아니라 손님이 적어 준 말로 고른다
  const who = clientHonorific(c, calc);
  const message = useMemo(() => {
    if (result.below || result.thin) {
      return `${who}, 인건비와 폐기물 처리 실비가 워낙 올라서 ${pers(result.price)}만원으로는 손해라 어렵습니다. ${pers(defense)}만원까지 맞춰주시면 바로 진행하겠습니다.`;
    }
    return `${who}, 말씀하신 금액 선에서 인력·자재 빠짐없이 챙겨서 꼼꼼히 책임 시공하겠습니다.`;
  }, [result, defense, who]);

  const sliderMax = Math.max(Math.ceil(listPrice * 1.5), Math.ceil((Number(proposal) || 0) * 1.2), 500);
  const sliderMin = Math.max(0, Math.floor(cost * 0.7));

  const applyPlan = (deposit, mid, balance) => {
    update({ paymentPlan: { deposit, mid, balance } });
    showToast(`수금 비율을 ${deposit}/${mid}/${balance}로 바꿨습니다`);
  };

  return (
    <div className="space-y-4">
      {/* ① 최종 금액 — 4단계의 기준 금액. 바꾸면 순익·수금·홈 카드·견적서가 같이 바뀐다 */}
      <Card className="overflow-hidden p-0 ring-2 ring-brand/30">
        <div className="flex items-center justify-between gap-2 bg-brand-soft px-4 pb-2 pt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-brand-strong">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-2xs font-black text-white">1</span>
            최종 금액 정하기
          </p>
          <span className="rounded-lg bg-white px-1.5 py-0.5 text-2xs font-extrabold text-brand">이 금액으로 계산</span>
        </div>
        <div className="p-4">
          <p className="text-[13px] font-bold text-ink-2">손님에게 부를 금액</p>
          <div className="mt-1 flex items-end gap-2">
            <input
              inputMode="numeric"
              aria-label="내가 부른 금액(만원)"
              value={calledDraft}
              onChange={(e) => commitCalled(e.target.value)}
              onBlur={() => settleCalled()}
              className="num w-full min-w-0 border-b-2 border-slate-200 bg-transparent pb-1 text-right text-[34px] font-black leading-none tracking-tight text-ink outline-none placeholder:text-slate-300 focus:border-brand"
              placeholder={String(appPrice)}
            />
            <span className="shrink-0 pb-2 text-sm font-bold text-ink-3">만원</span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[-10, -5, 5, 10].map((d) => (
              <SmallButton key={d} className="min-w-[58px] flex-1" onClick={() => nudgeCalled(d)} aria-label={`${d > 0 ? '플러스' : '마이너스'} ${Math.abs(d)}만원`}>
                {d > 0 ? `+${d}` : d}만
              </SmallButton>
            ))}
            <SmallButton
              variant={noCalled ? 'soft' : 'white'}
              className="flex-[1.4] whitespace-nowrap"
              onClick={restoreAppPrice}
              disabled={noCalled}
            >
              앱 계산가로 되돌리기
            </SmallButton>
          </div>

          <p className="mt-2 text-2xs font-semibold leading-4 text-ink-3">
            앱 계산가 <b className="num text-ink-2">{pers(appPrice)}만원</b>
            {calc.adjustmentTotal ? ` (답사 변동 ${calc.adjustmentTotal > 0 ? '+' : ''}${calc.adjustmentTotal}만 반영)` : ''}
            {' · '}비우면 앱 계산가로 계산합니다
          </p>

          {/* ② 이 금액에서 남는 돈 */}
          <p className="mt-4 flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-2xs font-black text-white">2</span>
            이 금액에서 남는 돈
          </p>
          <div
            className={cx(
              'mt-1.5 rounded-2xl p-3 ring-1',
              calc.netProfitBuffered <= 0
                ? 'bg-rose-50 ring-rose-200'
                : effectiveCalled < defense
                ? 'bg-amber-50 ring-amber-200'
                : 'bg-emerald-50 ring-emerald-200'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-ink-3">손에 쥐는 돈</p>
                <p
                  data-testid="called-net"
                  className={cx(
                    'num mt-0.5 whitespace-nowrap text-[clamp(26px,7.5vw,32px)] font-black leading-9 tracking-tight',
                    calc.netProfitBuffered > 0 ? 'text-emerald-600' : 'text-rose-600'
                  )}
                >
                  {calc.netProfitBuffered > 0 ? '+' : ''}
                  {pers(calc.netProfitBuffered)}
                  <span className="ml-1 text-sm font-bold text-ink-3">만원</span>
                </p>
              </div>
              <Pill tone={calc.netProfitBuffered <= 0 ? 'bad' : calc.marginBuffered < 12 || effectiveCalled < defense ? 'warn' : 'ok'}>
                {calc.netProfitBuffered <= 0 ? '적자' : calc.marginBuffered < 12 || effectiveCalled < defense ? '방어선 이하' : '좋음'}
              </Pill>
            </div>
            <p className="mt-1 text-sm font-extrabold text-ink-2">
              남는 비율 <b data-testid="called-margin" className="num text-ink">{calc.marginBuffered}%</b>
              <span className="ml-1 text-2xs font-bold text-ink-3">(보수적 원가 {pers(cost)}만 기준)</span>
            </p>
            <p className="mt-1 rounded-xl bg-white/70 px-2.5 py-1.5 text-[12.5px] font-extrabold text-emerald-800">
              {/* 관공서 공고는 공사기간을 모른다 — '공사 1일 기준 하루 1,809만원' 같은 숫자가 나오면 안 된다 */}
              {calc.isBid ? (
                <>
                  공사 기간은 공고문에서 확인하세요
                  <span className="mt-0.5 block text-2xs font-bold text-emerald-700">기간을 넣으면 하루 수익까지 계산됩니다</span>
                </>
              ) : (
                <>
                  하루 뛰면 {pers(dailyProfit)}만원 · 공사 {workDays}일 기준
                  <span className="mt-0.5 block text-2xs font-bold text-emerald-700">총 남는 돈 ÷ 공사일수</span>
                </>
              )}
            </p>
          </div>

          {calc.netProfitBuffered <= 0 ? (
            <p className="mt-2 rounded-xl bg-rose-600 px-3 py-2 text-[13px] font-extrabold leading-5 text-white">
              이 금액은 보수적 원가({pers(cost)}만)보다 {pers(Math.abs(calc.netProfitBuffered))}만원 적자입니다. 하자·추가비 한 번이면 그대로 손해입니다.
            </p>
          ) : effectiveCalled < defense ? (
            <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-[13px] font-extrabold leading-5 text-amber-900">
              최소 방어선({pers(defense)}만)보다 낮습니다. 이 아래로 계약하면 내 일당·유류비도 못 건지는 선입니다.
            </p>
          ) : null}

          {/* 원가가 어떻게 나왔는지 — 기본 원가 + 답사 변동 = 최종 원가 흐름 (2단계와 같은 모양) */}
          <CostFlow calc={calc} className="mt-3" title="이 원가는 이렇게 나왔어요" />

          {/* 이 금액이 어디로 나가는지 — 수금 분할과 손님 문서 총액 */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              { key: 'deposit', label: '계약금' },
              { key: 'mid', label: '중도금' },
              { key: 'balance', label: '잔금' },
            ].map((p) => (
              <div key={p.key} className="rounded-xl bg-slate-50 px-2 py-1.5 text-center">
                <p className="text-2xs font-bold text-ink-3">
                  {p.label} {calc.payments[p.key].ratio}%
                </p>
                <p className="num mt-0.5 text-[15px] font-extrabold text-ink">
                  {Math.round(calc.payments[p.key].amount).toLocaleString('ko-KR')}
                  <span className="ml-0.5 text-2xs font-bold text-ink-3">만</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-2xs font-semibold leading-4 text-ink-3">
            6단계 손님 견적서 총액도 <b className="num text-ink-2">{pers(calc.finalPrice)}만원</b>
            {c.includeVat ? ' (부가세 포함)' : ' (부가세 별도)'}으로 같습니다. 홈 장부 카드 금액·순익도 함께 바뀝니다.
          </p>
        </div>
      </Card>

      {/* 보통 시세 안내 — 최종 금액을 정하기 전에 '이 정도가 보통'을 확인한다 */}
      <MarketBandCard calc={calc} />

      <SignalBanner signal={aiSignalOf(c.aiSurveySignal) || aiSignalOf(c.aiAnalysis) || finalSignal(calc, c)} caption="이 금액으로 진행해도 되는지 앱이 판단했습니다." />

      {/* 가견적 → 최종 비교 — 배지는 화면에 보이는 두 숫자의 차이와 반드시 같게 */}
      <Card className={cx('p-4', calc.adjustmentTotal !== 0 && 'ring-1 ring-brand/25')}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-extrabold text-ink">가견적 → 최종 견적</p>
          <Pill tone={finalDelta === 0 ? 'plain' : finalDelta > 0 ? 'warn' : 'ok'} data-testid="glance-badge">
            {finalDelta === 0 ? '변동 없음' : `${finalDelta > 0 ? '+' : ''}${finalDelta}만`}
          </Pill>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3">
          <div className="min-w-0 flex-1 text-center">
            <p className="text-2xs font-bold text-ink-3">가견적 (답사 전)</p>
            <p className="num mt-0.5 whitespace-nowrap text-lg font-black text-ink" data-testid="glance-base">{pers(calc.baseClientPrice)}<span className="ml-0.5 text-2xs font-bold text-ink-3">만</span></p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1 text-center">
            <p className="text-2xs font-bold text-brand">최종 견적</p>
            <p className="num mt-0.5 whitespace-nowrap text-[clamp(18px,6vw,24px)] font-black text-brand-strong" data-testid="glance-final">{pers(calc.clientPrice)}<span className="ml-0.5 text-2xs font-bold text-ink-3">만</span></p>
          </div>
        </div>
        {calc.hasCalledPrice ? (
          <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-2xs font-bold leading-4 text-brand-strong">
            손님과 합의한 <b>{pers(calc.calledPrice)}만원</b>으로 계산합니다. 앱이 계산한 금액은 {pers(calc.appClientPrice)}만원이고,
            위 배지는 처음 가견적 대비 실제 차이입니다.
          </p>
        ) : null}
        {logs.length ? (
          calc.hasCalledPrice ? (
            // 내가 부른 금액을 썼을 때 — 앱 계산 변동은 접어 두고, 펼치면 두 단계를 함께 보여준다
            <Details
              className="mt-2"
              label="앱 계산 변동 내역 보기"
              right={
                <span className="num text-xs font-extrabold text-ink-2">
                  {appDelta > 0 ? '+' : ''}
                  {appDelta}만
                </span>
              }
            >
              <div className="space-y-1">
                <p className="text-2xs font-bold leading-4 text-ink-3">
                  앱이 계산한 금액 기준입니다 — 가견적 {pers(calc.baseClientPrice)}만 → 앱 계산가 {pers(calc.appClientPrice)}만
                </p>
                {logs.map((l) => {
                  const up = l.type !== 'decrease';
                  return (
                    <div key={l.id} className="flex items-start justify-between gap-2 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                      <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-5 text-ink-2">
                        <span className={cx('mr-1 font-black', up ? 'text-rose-600' : 'text-emerald-600')}>{up ? '▲' : '▼'}</span>
                        {changeLabel(l)}
                      </p>
                      <span className={cx('num shrink-0 text-xs font-extrabold', up ? 'text-rose-600' : 'text-emerald-600')}>
                        {up ? '+' : '-'}
                        {Math.abs(Number(l.amount) || 0)}만
                      </span>
                    </div>
                  );
                })}
                <div className="rounded-xl bg-white px-2.5 py-2 ring-1 ring-brand/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] font-bold text-ink-2">손님과 합의한 금액으로 조정</p>
                    <span className="num shrink-0 text-xs font-extrabold text-brand-strong">
                      {calledAdjust > 0 ? '+' : ''}
                      {calledAdjust}만
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">
                    앱 계산가 {pers(calc.appClientPrice)}만 → 최종 {pers(calc.clientPrice)}만
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5">
                  <p className="text-2xs font-extrabold text-ink-2">
                    처음 가견적 {pers(calc.baseClientPrice)}만 → 최종 {pers(calc.clientPrice)}만
                  </p>
                  <span className="num shrink-0 text-xs font-extrabold text-ink">
                    {finalDelta > 0 ? '+' : ''}
                    {finalDelta}만
                  </span>
                </div>
              </div>
            </Details>
          ) : (
            <div className="mt-2 space-y-1">
              {logs.map((l) => {
                const up = l.type !== 'decrease';
                return (
                  <div key={l.id} className="flex items-start justify-between gap-2 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                    <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-5 text-ink-2">
                      <span className={cx('mr-1 font-black', up ? 'text-rose-600' : 'text-emerald-600')}>{up ? '▲' : '▼'}</span>
                      {changeLabel(l)}
                    </p>
                    <span className={cx('num shrink-0 text-xs font-extrabold', up ? 'text-rose-600' : 'text-emerald-600')}>
                      {up ? '+' : '-'}
                      {Math.abs(Number(l.amount) || 0)}만
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
            아직 답사 변동이 없습니다. 3단계 답사에서 달라진 점을 적으면 여기에 이유와 함께 쌓입니다.
          </p>
        )}
      </Card>

      {/* 네고 시뮬레이터 */}
      <SectionCard fold num="3" title="③ 손님이 깎자고 할 때" subtitle="숫자를 바꾸면 남는 돈이 바로 바뀝니다. 가격만 깎지 말고 범위·자재로 맞추세요.">
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

          <button
            type="button"
            onClick={() => setNegoOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 text-sm font-extrabold text-ink-2"
            aria-expanded={negoOpen}
          >
            <span>{negoOpen ? '가격 깎자는 이야기 접기' : '손님이 가격 깎자고 할 때만 열어보기'}</span>
            <span className="text-xs text-ink-3">{negoOpen ? '▴' : '▾'}</span>
          </button>

          {negoOpen ? (
            <div className="space-y-3">
              {alternatives.length ? (
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-sm font-extrabold text-ink">가격을 맞추려면 이렇게 줄이세요</p>
                  <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">
                    이 공종에서 실제로 돈이 줄어드는 것만 골랐습니다. 누르면 원가·견적이 함께 바뀝니다.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {alternatives.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={a.action}
                        className="flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-slate-200 active:bg-slate-100"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-ink">{a.label}</span>
                          <span className="block text-2xs font-semibold leading-4 text-ink-3">{a.note}</span>
                        </span>
                        <span className="shrink-0 text-sm font-extrabold text-emerald-700">−{pers(a.saving)}만</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-3 py-2.5 text-2xs font-semibold leading-4 text-ink-3">
                  이 현장은 더 줄일 항목이 없습니다. 가격을 낮추면 그만큼 남는 돈이 줄어듭니다.
                </p>
              )}

              {Number(proposal) !== listPrice ? (
                <SmallButton
                  variant="dark"
                  className="w-full"
                  onClick={() => {
                    commitCalled(String(Math.max(0, Math.round(Number(proposal) || 0))));
                    showToast(`${pers(Number(proposal))}만원으로 견적을 확정했습니다`);
                  }}
                >
                  <Check className="h-4 w-4" /> 이 금액으로 견적 확정
                </SmallButton>
              ) : null}

              <div className="rounded-2xl bg-slate-900 p-4 text-white">
                <p className="text-sm font-bold text-slate-300">고객에게 이렇게 말하세요</p>
                <p className="mt-1 text-base leading-7">{message}</p>
                <SmallButton className="mt-3 w-full border-slate-700 bg-slate-800 text-white" onClick={() => copyText(message, showToast)}>
                  <Copy className="h-4 w-4" /> 설득 멘트 복사
                </SmallButton>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* 원가·방어선 — 내가 부른 금액에서 무엇이 남는지의 근거 (기본은 접어 둔다) */}
      <SectionCard
        fold
        title={`보수적 원가 ${pers(cost)}만원은 이렇게 나옵니다`}
        subtitle="원가·방어선 근거 — 필요할 때만 펼쳐 보세요"
        status={<Pill tone="plain">원가 근거</Pill>}
      >
        <div className="space-y-3">
        <p className="text-2xs font-semibold leading-4 text-ink-3">
          이 원가를 빼고 남는 돈이 위 ‘손에 쥐는 돈’입니다. 원가를 줄이면 같은 금액에서 더 남습니다.
        </p>

        <div className="mt-2 rounded-2xl bg-slate-50 p-3">
          <p className="mt-1 text-[13px] font-semibold leading-5 text-ink-2">
            {[
              ['인건비', calc.laborTotal],
              ['폐기물·운반', calc.wasteTotal + calc.equipTotal],
              ['자재', calc.materialTotal],
              ['현장·규제', calc.surchargeExtra || 0],
              ['답사 변동', calc.adjustTotal || 0],
            ]
              .filter(([, v]) => Math.round(v) > 0)
              .map(([label, v]) => `${label} ${pers(v)}`)
              .join(' + ')}{' '}
            = 기본 원가 <b className="text-ink">{pers(baseCost)}</b>
            <br />+ 돌발 예비비 {calc.bufferRate}%({pers(calc.costBuffer)}) = <b className="text-ink">{pers(cost)}만원</b>
          </p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white">
            {parts.map((p) => (
              <span
                key={p.id}
                className={p.tone}
                style={{ width: `${Math.max(0, Math.min(100, (Math.max(0, p.value) / partsTotal) * 100))}%` }}
                title={`${p.label} ${pers(p.value)}만`}
              />
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-2xs font-bold text-ink-3">
                <span className="flex items-center gap-1">
                  <span className={cx('h-1.5 w-1.5 rounded-full', p.tone)} />
                  {p.label}
                </span>
                <span className="num text-ink-2">{pers(p.value)}만</span>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-2xs font-extrabold text-ink-3">항목별 산출 근거 (왜 이 금액인지)</p>
            {calc.items
              .filter((i) => !i.excluded && Number(i.amount) !== 0)
              .map((i) => (
                <div key={i.id} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold leading-4 text-ink">
                      {i.name}
                      {/* 조건부 비용은 원가 합계에 안 들어간다 — '별도'라고 적어 두지 않으면 항목 합이 안 맞아 보인다 */}
                      {i.conditional ? (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[11px] font-extrabold text-amber-800">별도 · 발생 시</span>
                      ) : null}
                    </p>
                    {i.detail ? <p className="text-[11px] leading-4 text-ink-3">{i.detail}</p> : null}
                  </div>
                  <span className={cx('num shrink-0 whitespace-nowrap text-[12px] font-extrabold', i.conditional ? 'text-ink-3' : i.amount < 0 ? 'text-emerald-700' : 'text-ink-2')}>
                    {i.amount > 0 ? '+' : ''}
                    {pers(i.amount)}만
                  </span>
                </div>
              ))}
            <p className="text-2xs font-semibold leading-4 text-ink-3">
              위 항목을 더하면 보수적 원가 {pers(cost)}만원입니다 (기본 원가 {pers(baseCost)} + 예비비 {pers(calc.costBuffer)})
            </p>
          </div>

          {calc.isBid ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-2.5 py-2 text-[12px] font-bold leading-5 text-amber-900">
              관공서 공고는 설계내역서 확인 전까지 실행원가를 수주금액의 ~80%로 잡습니다 (수주 {pers(calc.bidPriceMan)}만 → 하한 {pers(calc.bidCostFloor)}만).
            </p>
          ) : null}
          <p className="mt-2 border-t border-slate-200 pt-2 text-[13px] font-semibold leading-5 text-ink-2">
            <b className="text-ink">최소 방어선 {pers(defense)}만원</b> = 보수적 원가 {pers(cost)} + 최소 안전마진 5%(
            {pers(defenseGap)}) → 이 아래로 계약하면 내 일당·유류비도 못 건지는 적자선입니다.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="보수적 원가" value={cost} />
          <Metric label="최소 방어선" value={defense} tone="warn" />
          <Metric label="내가 부른 금액" value={listPrice} />
        </div>
        </div>
      </SectionCard>

      {/* 원가·마진·수금 — 숫자를 직접 만질 때만 */}
      <SectionCard fold title="원가·수금 세부 조절" subtitle="남는 비율·단가를 직접 바꿉니다. 안 바꿔도 됩니다.">
        <div className="space-y-3">
          <Field label={`남는 비율 ${c.marginRate}%`} hint="고객에게 받는 금액 = 원가 ÷ (1 − 남는 비율). 움직이면 ‘내가 부른 금액’을 지우고 이 비율로 다시 계산합니다.">
            <input
              type="range"
              min={5}
              max={55}
              step={1}
              value={Number(c.marginRate) || 20}
              onChange={(e) => update({ marginRate: Number(e.target.value), customClientPrice: '', calledPrice: '' })}
              className="h-3 w-full accent-slate-900"
            />
          </Field>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
            지금은 <b className="num text-ink-2">{pers(listPrice)}만원</b>으로 계산합니다
            {!noCalled ? ' (내가 부른 금액)' : ` (앱 계산가 ${pers(appPrice)}만원)`}. 금액은 맨 위 ‘내가 부른 금액’에서 바꾸세요.
          </div>

          <Toggle
            checked={!!c.includeVat}
            onChange={(v) => update({ includeVat: v })}
            label="부가세 10% 따로 받기"
            hint={c.includeVat ? `견적서에 부가세 ${Math.round(calc.vatAmount).toLocaleString('ko-KR')}만원을 따로 표시합니다` : '견적 금액에 부가세를 더하지 않습니다'}
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                <Wallet className="h-4 w-4 text-slate-500" /> 계약금 · 중도금 · 잔금
              </p>
              <Pill tone={calc.planSum === 100 ? 'ok' : 'bad'}>합계 {calc.planSum}%</Pill>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              <SmallButton onClick={() => applyPlan(0, 0, 100)}>일 끝나고 전액</SmallButton>
              <SmallButton onClick={() => applyPlan(50, 0, 50)}>선금·잔금 반반</SmallButton>
              <SmallButton onClick={() => applyPlan(30, 40, 30)}>표준 분할</SmallButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'deposit', label: '계약금' },
                { key: 'mid', label: '중도금' },
                { key: 'balance', label: '잔금' },
              ].map((p) => (
                <div key={p.key}>
                  <Field label={`${p.label} %`}>
                    <TextInput
                      inputMode="numeric"
                      value={c.paymentPlan?.[p.key] ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        update({ paymentPlan: { ...(c.paymentPlan || {}), [p.key]: e.target.value.replace(/[^\d.]/g, '') } })
                      }
                      aria-label={`${p.label} 비율`}
                    />
                  </Field>
                  <p className="num mt-1 rounded-lg bg-slate-50 py-1.5 text-center text-[15px] font-extrabold text-ink">
                    {Math.round(calc.payments[p.key].amount).toLocaleString('ko-KR')}
                    <span className="ml-0.5 text-2xs font-bold text-ink-3">만원</span>
                  </p>
                </div>
              ))}
            </div>
            {calc.planSum !== 100 ? (
              <WarningBox tone="bad" title={`비율 합계가 ${calc.planSum}%입니다`}>
                계약금·중도금·잔금을 합쳐 100%가 되어야 금액이 정확합니다.
                <button
                  type="button"
                  onClick={() => applyPlan(30, 40, 30)}
                  className="ml-2 rounded-lg bg-white px-2 py-1 text-xs font-extrabold text-rose-700 ring-1 ring-rose-200"
                >
                  30/40/30으로 맞추기
                </button>
              </WarningBox>
            ) : calc.balanceRatio < 20 ? (
              <WarningBox>잔금 비율이 {calc.balanceRatio}%입니다. 20% 이상을 권장합니다(최종 검수·하자 보수 후 지급).</WarningBox>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-2xs font-bold leading-4 text-ink-3">
                총 {Math.round(calc.finalPrice).toLocaleString('ko-KR')}만원 = 계약금{' '}
                {Math.round(calc.payments.deposit.amount).toLocaleString('ko-KR')} + 중도금{' '}
                {Math.round(calc.payments.mid.amount).toLocaleString('ko-KR')} + 잔금{' '}
                {Math.round(calc.payments.balance.amount).toLocaleString('ko-KR')}만원
              </p>
            )}
          </div>

          <Details label="원가 내역 · 항목별 포함/제외" defaultOpen>
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
                          excluded ? 'border-slate-200 bg-white text-slate-500' : 'border-emerald-300 bg-emerald-50 text-emerald-800'
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
            </div>
          </Details>

          <Details label="이 현장에 적용된 단가표">
            <p className="text-sm text-slate-500">현장을 만든 날의 값입니다. 설정에서 단가를 바꿔도 이 현장 금액은 그대로입니다.</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {[
                ['철거 기공', 'labor.demolition', '만/일'],
                ['보조·잡부', 'labor.helper', '만/일'],
                ['도배 기공', 'labor.wallpaper', '만/일'],
                ['타일 기공', 'labor.bathroom', '만/일'],
                ['주방 기공', 'labor.kitchen', '만/일'],
                ['목수', 'labor.carpenter', '만/일'],
                ['전기·조명공', 'labor.electrician', '만/일'],
                ['설비·배관공', 'labor.plumber', '만/일'],
                ['미장·방수공', 'labor.plasterer', '만/일'],
                ['필름공', 'labor.film', '만/일'],
                ['장판·마루공', 'labor.floor', '만/일'],
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
          </Details>
        </div>
      </SectionCard>
      {/* 원가 절감 스위치 */}
      {switches.length ? (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
                <TrendingDown className="h-4 w-4 text-emerald-600" /> 원가 절감 스위치
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">실제로 돈이 아껴지는 것만 켜고 끄세요. 켜면 원가·하루 순수익이 바로 바뀝니다.</p>
            </div>
            <Pill tone={savingsTotal > 0 ? 'ok' : 'plain'}>{savingsTotal > 0 ? `−${pers(savingsTotal)}만` : '켠 항목 없음'}</Pill>
          </div>
          <div className="mt-2 space-y-1.5">
            {switches.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.on}
                onClick={s.action}
                className={cx(
                  'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition',
                  s.on ? 'bg-emerald-50' : 'bg-slate-50 active:bg-slate-100'
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{s.label}</span>
                  <span className="block text-2xs font-semibold text-ink-3">
                    {s.on ? `켜짐 · ${s.onLabel}` : `꺼짐 · ${s.offLabel}`}
                  </span>
                </span>
                <span className={cx('shrink-0 text-sm font-extrabold', s.on ? 'text-emerald-700' : 'text-ink-3')}>+{pers(s.saving)}만 절약</span>
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
            <Info className="mr-1 inline h-3 w-3" /> 지금 켠 절감액 합계는 {pers(savingsTotal)}만원입니다. 손님에게 약속하기 전에 실제로 가능한지 먼저 확인하세요.
          </p>
        </Card>
      ) : null}


      {calc.trade === 'labor' ? (
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
      ) : null}

      {PREVIEW_TRADES.includes(calc.trade) ? (
        <AfterPreview
          c={c}
          update={update}
          calc={calc}
          design={design}
          showToast={showToast}
          title="④ 손님께 보여줄 완공 사진"
        />
      ) : null}

    </div>
  );
}

function cfgHasHelper(trade) {
  return ['demolition', 'wallpaper', 'bathroom', 'combined', 'plaster', 'custom'].includes(trade);
}
