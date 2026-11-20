import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Copy, Landmark, Loader2, RefreshCw, ScanText, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
  BATHROOM_METHODS,
  DEMOLITION_SCOPES,
  EVIDENCE_SPOTS,
  HARD_DETAILS,
  MISSING_LINES,
  SIZE_UNITS,
  SURVEY_GROUPS,
  TRADES,
  TRADE_LIST,
  WASTE_TYPE_LABEL,
} from '../../lib/constants.js';
import { computeEstimate, sizeText, toPyung, won } from '../../lib/pricing.js';
import { computeWaste, vehicleRealCost, WASTE_SCOPES, WASTE_UNIT_PRICE } from '../../lib/waste.js';
import { ratesOf, getRate } from '../../lib/rates.js';
import { assessAsbestos, ASBESTOS_CLAUSE } from '../../lib/asbestos.js';
import { DESIGN_PRESETS, translateDesign } from '../../lib/design.js';
import { similarCases } from '../../lib/reference.js';
import { firstCallQuestions, parseAdjustment, parseInput, PROCESS_KEYWORDS, PROCESS_TO_SURVEY } from '../../lib/parse.js';
import { classifyRequest } from '../../lib/classify.js';
import { ocrWithTimeout } from '../../lib/ocr.js';
import { verifyEstimate } from '../../lib/verify.js';
import { analyzeWithGemini } from '../../lib/ai.js';
import { changeMessage, subsidyNotice } from '../../lib/docs.js';
import { subsidyInfo, SUBSIDY_CONDITIONS, SUBSIDY_DOCS } from '../../lib/subsidy.js';
import {
  AlertCard,
  BigButton,
  Card,
  CheckRow,
  Hero,
  Details,
  Field,
  Metric,
  Money,
  Pill,
  RangeMeter,
  SectionCard,
  Select,
  Segmented,
  SmallButton,
  TextArea,
  Toggle,
  TextInput,
  WarningBox,
  cx,
} from '../ui.jsx';

async function fileToThumb(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve({ name: file.name, dataUrl: '' });
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const max = 560;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.72) });
        } catch (e) {
          resolve({ name: file.name, dataUrl: '' });
        }
      };
      img.onerror = () => resolve({ name: file.name, dataUrl: '' });
      img.src = reader.result;
    };
    reader.onerror = () => resolve({ name: file.name, dataUrl: '' });
    reader.readAsDataURL(file);
  });
}

export function copyText(text, showToast, msg = '복사했습니다') {
  const done = () => showToast && showToast(msg);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
    } else {
      fallback(text, done);
    }
  } catch (e) {
    fallback(text, done);
  }
}

function fallback(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch (e) {
    // ignore
  }
}

export default function EstimateTab({ c, update, calc, design, waste, asbestos, showToast, apiKey }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrHint, setOcrHint] = useState('');
  const [supplement, setSupplement] = useState(c.supplement || '');
  const fileRef = useRef(null);
  const verify = useMemo(() => verifyEstimate(c, calc), [c, calc]);

  const info = TRADES[c.trade] || TRADES.unclassified;
  const ref = useMemo(() => similarCases(c, calc), [c, calc]);
  const setLift = (patch) => update({ lifting: { ...c.lifting, ...patch } });
  const setSurvey = (id, val) => update({ survey: { ...c.survey, [id]: val } });

  const applyClassified = (res, extra = {}) => {
    const patch = { ...res.patch, ...extra, notes: res.patch.notes || c.notes };
    if (res.trade && res.trade !== 'unclassified') patch.trade = res.trade;
    if (res.title) patch.title = res.title;
    update(patch);
    const t = TRADES[patch.trade || c.trade];
    showToast(`${t?.short || '공종'}으로 자동 선택했습니다 — 아래에서 고쳐도 됩니다`);
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      let text = `${c.rawInput || ''} ${c.notes || ''} ${supplement || ''}`.trim();
      if (!text && c.photos?.length) {
        setOcrHint('사진에서 글자 읽는 중…');
        const read = await ocrWithTimeout(
          c.photos.map((p) => p.dataUrl).filter(Boolean),
          (pct) => setOcrHint(`사진 글자 읽는 중… ${pct || 0}%`)
        );
        text = read;
      }
      if (!text) {
        showToast('내용이 없습니다. 요청 글을 넣거나 사진을 올려주세요');
        return;
      }
      const res = classifyRequest(text);
      applyClassified(res, { rawInput: text });
    } catch (e) {
      showToast(e.message || '사진 글자를 읽지 못했습니다');
    } finally {
      setAnalyzing(false);
      setOcrHint('');
    }
  };

  const readPhotos = async () => {
    if (!c.photos?.length) {
      showToast('먼저 숨고·카톡 스크린샷을 올려주세요');
      return;
    }
    setAnalyzing(true);
    setOcrHint('사진에서 글자 읽는 중…');
    try {
      const read = await ocrWithTimeout(
        c.photos.map((p) => p.dataUrl).filter(Boolean),
        (pct) => setOcrHint(`사진 글자 읽는 중… ${pct || 0}%`)
      );
      const res = classifyRequest(read);
      applyClassified(res, { rawInput: read });
    } catch (e) {
      showToast(e.message || '사진 글자를 읽지 못했습니다');
    } finally {
      setAnalyzing(false);
      setOcrHint('');
    }
  };

  const onPhotos = async (files) => {
    const list = Array.from(files || []).slice(0, 6);
    const thumbs = await Promise.all(list.map(fileToThumb));
    update({ photos: [...(c.photos || []), ...thumbs].slice(0, 6) });
    showToast(`사진 ${thumbs.length}장을 붙였습니다`);
  };

  return (
    <div className="space-y-4">
      {/* 예상 견적 — 진한 히어로 + 보수적 원가 */}
      <Hero
        eyebrow={calc.adjustmentTotal ? '현장 답사 반영 · 최종 확정 견적' : '지금 계산된 견적'}
        value={Math.round(calc.finalPrice).toLocaleString('ko-KR')}
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
            <p className="num text-base font-black leading-5 text-white">{Math.round(calc.costWithBuffer).toLocaleString('ko-KR')}<span className="ml-0.5 text-[10px] font-bold text-blue-200">만</span></p>
          </div>
          <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center">
            <p className="text-[10px] font-bold text-blue-200">보수적 남는 돈</p>
            <p className={cx('num text-base font-black leading-5', calc.netProfitBuffered > 0 ? 'text-emerald-300' : 'text-rose-300')}>{calc.netProfitBuffered > 0 ? '+' : ''}{Math.round(calc.netProfitBuffered).toLocaleString('ko-KR')}<span className="ml-0.5 text-[10px] font-bold text-blue-200">만</span></p>
          </div>
          <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center">
            <p className="text-[10px] font-bold text-blue-200">남는 비율</p>
            <p className="num text-base font-black leading-5 text-white">{calc.marginBuffered}%</p>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] font-semibold leading-4 text-blue-200">
          기본 원가 {Math.round(calc.totalDirectCost).toLocaleString('ko-KR')}만 + 예비비 {Math.round(calc.costBuffer).toLocaleString('ko-KR')}만({calc.bufferRate}%)을 미리 넣었습니다
        </p>
      </Hero>

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

        <Details label="비슷한 실제 사례 보기 (60건 분석)" className="mt-2">
          <div className="space-y-2">
            {ref.verdict ? <Pill tone={ref.verdict.tone}>{ref.verdict.text}</Pill> : null}
            {ref.items.map((r) => (
              <div key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{r.title}</p>
                  <p className="num shrink-0 text-sm font-extrabold text-ink">
                    {r.low === r.high ? r.low : `${r.low}~${r.high}`}만
                  </p>
                </div>
                <p className="text-xs text-ink-3">{r.note}</p>
                <p className="text-2xs text-ink-4">
                  {r.source} · 신뢰도 {r.grade}
                </p>
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

      <VerifyCard verify={verify} calc={calc} />

      <ChangeQuick c={c} update={update} calc={calc} showToast={showToast} />

      {/* 1. 무엇을 하는지 */}
      <SectionCard
        num="1"
        title="무엇을 하는지 적어주세요"
        subtitle="숨고 요청서·카톡·메모를 그대로 붙여넣어도 됩니다."
        status={design.rate > 0 ? <Pill tone="warn">추가 비용 있음</Pill> : null}
      >
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-base font-bold text-slate-700">현장 이름</span>
            <TextInput
              value={c.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="예) 안동 풍산읍 15평 상가 철거"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-base font-bold text-slate-700">받은 내용</span>
            <TextArea
              rows={4}
              value={c.rawInput}
              onChange={(e) => update({ rawInput: e.target.value })}
              placeholder="예) 24평 빌라 도배·장판, 엘리베이터 없는 3층, 다음 주 착공 희망"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="chip flex-1 cursor-pointer gap-2 border-slate-200 bg-white text-slate-700">
              <Camera className="h-5 w-5" />
              사진 {c.photos?.length || 0}/6
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onPhotos(e.target.files)}
              />
            </label>
            <BigButton variant="amber" className="flex-1" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              {analyzing ? '읽는 중…' : '자동으로 분류'}
            </BigButton>
          </div>

          {c.photos?.length ? (
            <button
              type="button"
              onClick={readPhotos}
              disabled={analyzing}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50 disabled:opacity-50"
            >
              <ScanText className="h-4 w-4" /> 사진 속 글자만 다시 읽기
            </button>
          ) : null}
          {ocrHint ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ocrHint}
            </p>
          ) : null}

          {c.photos?.length ? (
            <div className="grid grid-cols-3 gap-2">
              {c.photos.map((p, i) => (
                <div key={`${p.name}-${i}`} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {p.dataUrl ? (
                    <img src={p.dataUrl} alt={p.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center text-2xl">🖼️</div>
                  )}
                  <button
                    type="button"
                    aria-label="사진 삭제"
                    onClick={() => update({ photos: c.photos.filter((_, idx) => idx !== i) })}
                    className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {c.parseHints?.length ? (
            <WarningBox tone="info" title="읽으면서 확인한 것">
              <ul className="list-disc pl-5">
                {c.parseHints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </WarningBox>
          ) : null}

          <div>
            <span className="mb-1.5 block text-base font-bold text-slate-700">공종</span>
            <Segmented
              options={TRADE_LIST.map((t) => ({ value: t.id, label: t.short }))}
              value={c.trade}
              onChange={(v) => {
                const t = TRADES[v];
                update({
                  trade: v,
                  sizeUnit: SIZE_UNITS.includes(c.sizeUnit) && c.sizeUnit !== '모름' ? c.sizeUnit : t.defaultUnit,
                  marginRate: c.marginRate || t.defaultMargin,
                });
              }}
            />
          </div>

          {c.trade === 'demolition' ? (
            <Field label="철거 범위" hint={DEMOLITION_SCOPES.find((x) => x.value === (c.demolition?.scope || 'restore'))?.hint}>
              <Segmented
                options={DEMOLITION_SCOPES.map((x) => ({ value: x.value, label: x.label }))}
                value={c.demolition?.scope || 'restore'}
                onChange={(v) => update({ demolition: { ...(c.demolition || {}), scope: v } })}
              />
            </Field>
          ) : null}

          {c.trade === 'bathroom' ? (
            <Field label="욕실 공법" hint={BATHROOM_METHODS.find((x) => x.value === (c.bathroom?.method || 'full'))?.hint}>
              <Segmented
                options={BATHROOM_METHODS.map((x) => ({ value: x.value, label: x.label }))}
                value={c.bathroom?.method || 'full'}
                onChange={(v) => update({ bathroom: { ...(c.bathroom || {}), method: v } })}
              />
            </Field>
          ) : null}

          {c.trade === 'tilewaterproof' ? (
            <Field label="공법" hint="방수만/타일만/둘 다 중에 고르세요. 누수면 방수부터.">
              <Segmented
                options={[
                  { value: 'both', label: '철거+방수+타일' },
                  { value: 'waterproof', label: '방수만' },
                  { value: 'tile', label: '타일만' },
                ]}
                value={c.tileWork?.mode || 'both'}
                onChange={(v) => update({ tileWork: { ...(c.tileWork || {}), mode: v } })}
              />
            </Field>
          ) : null}

          {c.trade === 'plaster' ? (
            <Field label="함께 하는 작업" hint="난방배관·타일이 같이 들어가면 원가에 바로 반영됩니다.">
              <div className="grid grid-cols-2 gap-2">
                <CheckRow
                  checked={!!c.plaster?.heating}
                  onChange={(v) => update({ plaster: { ...(c.plaster || {}), heating: v } })}
                  label="난방 보강"
                  hint="배관·단열 ㎡당 2.5만"
                />
                <CheckRow
                  checked={!!c.plaster?.tile}
                  onChange={(v) => update({ plaster: { ...(c.plaster || {}), tile: v } })}
                  label="타일 시공"
                  hint="㎡당 자재+시공"
                />
              </div>
            </Field>
          ) : null}

          {c.trade === 'labor' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="인원" hint="명">
                <TextInput inputMode="numeric" value={c.sizeValue} onChange={(e) => update({ sizeValue: e.target.value, sizeUnit: '명' })} placeholder="예) 3" />
              </Field>
              <Field label="일수" hint="하루면 1">
                <TextInput inputMode="numeric" value={c.laborDays || 1} onChange={(e) => update({ laborDays: e.target.value })} placeholder="1" />
              </Field>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="규모 (아는 만큼)" hint="모르면 비워두세요. 실측 때 재면 됩니다.">
              <TextInput
                inputMode="decimal"
                value={c.sizeValue}
                onChange={(e) => update({ sizeValue: e.target.value })}
                placeholder="예) 24"
              />
            </Field>
            <Field label="단위">
              <Select value={c.sizeUnit} onChange={(e) => update({ sizeUnit: e.target.value })}>
                {SIZE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="변동사항 메모" hint="실측하며 달라진 점을 적어두면 견적에 바로 반영됩니다.">
            <div className="flex gap-2">
              <TextInput
                value={supplement}
                onChange={(e) => setSupplement(e.target.value)}
                placeholder="예) 실측 3.2m 확인, 엘베 사용 가능"
              />
              <SmallButton
                variant="dark"
                onClick={() => {
                  update({ supplement, notes: `${c.notes || ''} ${supplement}`.trim() });
                  setSupplement('');
                  showToast('변동사항을 반영했습니다');
                }}
              >
                <Check className="h-5 w-5" />
              </SmallButton>
            </div>
          </Field>

          <Details label="고객 정보 · 연락처 · 지역">
            <div className="space-y-3">
              <Field label="고객 이름">
                <TextInput value={c.clientName} onChange={(e) => update({ clientName: e.target.value })} placeholder="예) 김 사장님" />
              </Field>
              <Field label="연락처">
                <TextInput
                  value={c.clientPhone}
                  onChange={(e) => update({ clientPhone: e.target.value })}
                  placeholder="010-0000-0000"
                  inputMode="tel"
                />
              </Field>
              <Field label="현장 주소">
                <TextInput value={c.location} onChange={(e) => update({ location: e.target.value })} placeholder="예) 안동시 풍산읍 상가 2층" />
              </Field>
            </div>
          </Details>
        </div>
      </SectionCard>



      <SubsidyCard c={c} showToast={showToast} />

      <MissingLines c={c} update={update} showToast={showToast} />

      {/* 현장 변동 — 실측·시공 중 수시 반영 */}

      {/* 2. 스타일·자재 */}
      <SectionCard
        num="2"
        title="스타일·자재 정하기"
        subtitle="고객이 “깔끔하게”라고만 해도 쓸 자재를 정해 드립니다. 지금 공종에 맞춰 자재가 바뀝니다."
        status={design.rate > 0 ? <Pill tone="warn">+{design.rate}%</Pill> : <Pill tone="ok">표준</Pill>}
      >
        <div className="space-y-3">
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

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-extrabold text-ink">
                {design.preset.label} · {info.short} 자재
              </p>
              {design.gradeRate > 0 ? (
                <Pill tone="warn">권장 +{design.gradeRate}%</Pill>
              ) : (
                <Pill tone="plain">추가 없음</Pill>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {design.combo.map((s, i) => (
                <li key={i} className="flex gap-1.5 text-sm leading-5 text-ink-2">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            {design.gradeRate > 0 ? <p className="mt-2 text-2xs leading-4 text-ink-3">{design.gradeNote}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <SmallButton
                onClick={() => copyText(`${design.preset.label} (${info.short})\n${design.combo.join('\n')}`, showToast)}
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
            <p className="text-sm font-bold text-ink-2">손이 많이 가는 마감을 넣을까요?</p>
            <p className="mb-1.5 mt-0.5 text-xs text-ink-3">넣으면 비용과 공사 기간이 늘어납니다.</p>
            <div className="space-y-1.5">
              {HARD_DETAILS.map((d) => {
                const on = (c.design?.details || []).includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      update({
                        design: {
                          ...c.design,
                          details: on
                            ? c.design.details.filter((x) => x !== d.id)
                            : [...(c.design?.details || []), d.id],
                        },
                      })
                    }
                    className={cx(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-bold transition',
                      on
                        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                        : 'bg-slate-50 text-ink-2 ring-1 ring-slate-200/60'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          on ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white'
                        )}
                      >
                        {on ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
                      </span>
                      {d.label}
                    </span>
                    <span className="shrink-0 text-2xs font-semibold text-ink-3">
                      견적 +{d.rate}% · {d.days}일
                    </span>
                  </button>
                );
              })}
            </div>
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
      </SectionCard>

      {/* 3. 현장 점검 */}
      <SectionCard
        num="3"
        title="현장 점검 (운반·실측·폐기물·석면)"
        subtitle="여기서 체크한 것이 견적과 순서에 바로 반영됩니다."
        status={<Pill tone={calc.lifting.warnings.length ? 'warn' : 'ok'}>{calc.lifting.warnings.length ? '확인 필요' : '기본'}</Pill>}
      >
        <div className="space-y-3">
          <p className="text-base font-extrabold text-slate-800">자재·폐기물 운반 4가지</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="몇 층인가요?">
              <TextInput
                inputMode="numeric"
                value={c.lifting?.floor ?? ''}
                onChange={(e) => setLift({ floor: e.target.value })}
                placeholder="예) 3"
              />
            </Field>
            <Field label="엘리베이터">
              <Select value={c.lifting?.elevator || 'unknown'} onChange={(e) => setLift({ elevator: e.target.value })}>
                <option value="unknown">모름</option>
                <option value="yes">있음</option>
                <option value="no">없음</option>
              </Select>
            </Field>
            <Field label="사다리차 세울 수 있나요?">
              <Select value={c.lifting?.ladderAllowed || 'unknown'} onChange={(e) => setLift({ ladderAllowed: e.target.value })}>
                <option value="unknown">모름</option>
                <option value="yes">가능</option>
                <option value="no">불가</option>
              </Select>
            </Field>
            <Field label="현관까지 거리(m)">
              <TextInput
                inputMode="numeric"
                value={c.lifting?.carryDistance ?? ''}
                onChange={(e) => setLift({ carryDistance: e.target.value })}
                placeholder="예) 20"
              />
            </Field>
          </div>

          {calc.lifting.options.length ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-base font-bold text-slate-700">운반 방법 고르기</p>
              <div className="space-y-2">
                {calc.lifting.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setLift({ mode: o.id })}
                    className={cx(
                      'flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base',
                      (c.lifting?.mode || calc.lifting.chosen?.id) === o.id
                        ? 'border-slate-900 bg-white font-extrabold text-slate-900'
                        : 'border-slate-200 bg-white font-semibold text-slate-600'
                    )}
                  >
                    <span>{o.label}</span>
                    <span className="tabular-nums">{o.cost}만원</span>
                  </button>
                ))}
              </div>
              {calc.lifting.warnings.map((w, i) => (
                <p key={i} className="mt-2 flex gap-1.5 text-sm font-bold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          ) : null}

          <Details label={`실측 체크리스트 (${Object.values(c.survey || {}).filter(Boolean).length}개 체크)`}>
            <div className="space-y-4">
              {SURVEY_GROUPS.map((g) => (
                <div key={g.id}>
                  <p className="mb-2 text-sm font-extrabold text-ink">
                    {g.title}
                  </p>
                  <div className="space-y-2">
                    {g.items.map((it) => (
                      <CheckRow
                        key={it.id}
                        checked={!!c.survey?.[it.id]}
                        onChange={(v) => setSurvey(it.id, v)}
                        label={it.label}
                        hint={it.hint}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-600">
                체크한 항목은 견적의 ‘추가 비용’으로 자동 반영됩니다. 체크를 풀면 다시 빠집니다.
              </p>
            </div>
          </Details>

          <WasteBlock c={c} update={update} waste={waste} showToast={showToast} />
          <AsbestosBlock c={c} update={update} asbestos={asbestos} showToast={showToast} />
          <EvidenceBlock c={c} update={update} showToast={showToast} />
        </div>
      </SectionCard>

      {/* 4. 추가금 */}
      <ChangeBlock c={c} update={update} showToast={showToast} />
    </div>
  );
}

function VerifyCard({ verify, calc }) {
  const tone = verify.verdict.tone === 'ok' ? 'good' : verify.verdict.tone === 'bad' ? 'bad' : verify.verdict.tone === 'info' ? 'info' : 'warn';
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
          <p className="mb-1.5 text-sm font-extrabold text-ink">빠진 비용 체크</p>
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
        </div>

        <p className="mt-2.5 text-xs leading-5 text-ink-2">{verify.advice}</p>
        <p className="mt-1 text-2xs text-ink-4">
          근거: 2026 하반기 대한건설협회 노임(철거공 261,108원·타일공 294,379원) · 2026.1.1 건설폐기물 중간처리단가(혼합 72,721원/톤) · 우리 실견적 60건
        </p>
      </div>
    </Card>
  );
}

function SubsidyCard({ c, showToast }) {
  const info = subsidyInfo(c);
  if (!info.applicable) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Landmark className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-6 text-ink">폐업 점포철거비 지원금</h3>
          <p className="mt-0.5 text-xs leading-4 text-ink-3">
            손님이 공단에서 돌려받는 돈입니다. 우리 견적에 더하는 금액이 아닙니다.
          </p>
        </div>
      </div>

      <div className="p-4 pt-3">
        <div className="rounded-xl bg-brand-soft px-3 py-3">
          <p className="text-2xs font-bold text-brand">이 현장 예상 한도</p>
          <p className="num mt-0.5 text-[26px] font-extrabold leading-8 tracking-tight text-brand-strong">
            {Math.round(info.limit).toLocaleString('ko-KR')}
            <span className="ml-0.5 text-sm font-bold">만원</span>
          </p>
          <p className="mt-0.5 text-2xs leading-4 text-brand">
            {info.pyung ? `전용면적 ${info.pyung}평 × 평당 20만원` : '평당 20만원'} · 최대 600만원 · 부가세 제외
          </p>
        </div>

        <ul className="mt-3 space-y-1.5">
          {SUBSIDY_CONDITIONS.map((row) => (
            <li key={row.id} className="flex items-start gap-2 text-sm leading-5 text-ink-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
              <span>
                <b className="font-bold text-ink">{row.label}</b>
                <span className="text-ink-3"> — {row.hint}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-extrabold text-ink-2">챙길 서류 4가지</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {SUBSIDY_DOCS.map((d, i) => (
              <div key={d.id} className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200/70">
                <p className="text-2xs font-bold leading-4 text-ink">
                  {i + 1}. {d.label}
                </p>
                <p className="mt-0.5 text-2xs leading-4 text-ink-3">{d.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-ink-3">
          <span>신청 {info.applyUrl}</span>
          <span className="num font-bold text-ink-2">{info.phone}</span>
        </div>

        <SmallButton
          variant="brand"
          className="mt-2 w-full"
          onClick={() => copyText(subsidyNotice(c), showToast, '지원금 안내 문자를 복사했습니다')}
        >
          <Copy className="h-4 w-4" /> 손님에게 보낼 지원금 안내 복사
        </SmallButton>

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

function MissingLines({ c, update, showToast }) {
  const rates = ratesOf(c);
  const amountOf = (id) => {
    if (id === 'protectLevel') return getRate(rates, ['site', 'protect'], 8);
    if (id === 'adminDeposit') return getRate(rates, ['site', 'adminReport'], 8);
    if (id === 'materialLift') return getRate(rates, ['site', 'materialLift'], 15);
    if (id === 'ladderSmall') return getRate(rates, ['ladder', 'small'], 12);
    if (id === 'afterCare') return getRate(rates, ['site', 'cleanup'], 45);
    return 0;
  };
  const checked = MISSING_LINES.filter((l) => c.survey?.[l.id]).length;
  const total = MISSING_LINES.reduce((sum, l) => sum + amountOf(l.id), 0);

  return (
    <Card className="p-4">
      <p className="text-base font-extrabold text-ink">빠뜨리기 쉬운 5줄</p>
      <div className="mt-2">
        <Pill tone={checked === 5 ? 'ok' : 'warn'}>
          {checked}/5 넣음 · 모두 {total}만원
        </Pill>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        보양·신고·자재 올리기·사다리차·준공청소는 실제 견적에서 가장 자주 빠지는 항목입니다.
      </p>
      <div className="mt-3 space-y-2">
        {MISSING_LINES.map((l) => (
          <CheckRow
            key={l.id}
            checked={!!c.survey?.[l.id]}
            onChange={(v) => update({ survey: { ...c.survey, [l.id]: v } })}
            label={`${l.label} +${amountOf(l.id)}만`}
            hint={l.hint}
          />
        ))}
      </div>
      {checked < 5 ? (
        <SmallButton
          variant="dark"
          className="mt-3 w-full"
          onClick={() => {
            const next = { ...c.survey };
            MISSING_LINES.forEach((l) => {
              next[l.id] = true;
            });
            update({ survey: next });
            showToast('5줄을 모두 넣었습니다');
          }}
        >
          5줄 모두 넣기
        </SmallButton>
      ) : null}
    </Card>
  );
}

function detectFindings(text = '') {
  const t = String(text || '');
  const out = [];
  if (/누수|물기|습기|곰팡이|방수\s*필요|물이\s*샘/.test(t)) out.push('leak');
  if (/타일.{0,8}(남김|유지|안\s*깼|안깼)|기존\s*타일|철거\s*안\s*함|덧방/.test(t)) out.push('tileRemain');
  return out;
}

function ChangeQuick({ c, update, calc, showToast }) {
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('increase');
  const [days, setDays] = useState('0');
  const [photo, setPhoto] = useState(false);
  const logs = Array.isArray(c.changeLogs) ? c.changeLogs : [];
  const stack = Array.isArray(c.undoStack) ? c.undoStack : [];
  const sign = type === 'decrease' ? -1 : 1;
  const amountNum = Number(amount) || 0;
  const before = Math.round(calc.clientPrice);
  const after = Math.max(0, before + sign * amountNum);
  const adj = parseAdjustment(memo);
  const ready = memo.trim() && amountNum > 0;
  const findings = detectFindings(memo);
  const canApply = ready || !!adj?.cancel || findings.length > 0;

  const snapshot = () => ({
    changeLogs: c.changeLogs || [],
    survey: c.survey || {},
    waste: c.waste || {},
    tileRemain: c.tileRemain || false,
  });

  const pushUndo = (patch) =>
    update({ ...patch, undoStack: [...stack.slice(-9), snapshot()] });

  const matchLog = (log) => {
    const text = `${log.item || ''} ${log.reason || ''}`;
    if (adj?.label && text.includes(adj.label)) return true;
    const proc = PROCESS_KEYWORDS.find((p) => p.id === adj?.processId);
    return !!proc && proc.words.some((w) => text.includes(w));
  };

  const cancelItem = () => {
    const target = [...logs].reverse().find(matchLog);
    if (target) {
      pushUndo({ changeLogs: logs.filter((l) => l.id !== target.id) });
      showToast(`‘${target.item}’ ${target.amount}만원을 뺐습니다`);
      setMemo('');
      return;
    }
    const surveyId = PROCESS_TO_SURVEY[adj?.processId];
    if (surveyId && c.survey?.[surveyId]) {
      pushUndo({ survey: { ...c.survey, [surveyId]: false } });
      showToast(`‘${adj.label}’ 비용을 견적에서 뺐습니다`);
      setMemo('');
      return;
    }
    if (adj?.processId === 'waste' && c.waste?.applyActual) {
      pushUndo({ waste: { ...c.waste, applyActual: false } });
      showToast('폐기물 실비 반영을 껐습니다');
      setMemo('');
      return;
    }
    showToast('뺄 항목을 찾지 못했습니다. 아래 목록에서 직접 빼주세요');
  };

  // 글·사진에서 읽은 현장 사실을 금액·일정까지 자동 산정한다.
  const autoDraft = () => {
    const out = [];
    if (findings.includes('leak')) {
      out.push({ item: '현장 답사: 누수 의심 → 방수 보수', reason: memo.trim(), amount: 30, type: 'increase', days: 1 });
    }
    if (findings.includes('tileRemain')) {
      const demo = (calc.items || []).find((i) => i.id === 'demolition')?.amount || 0;
      const waste = (calc.items || []).find((i) => i.id === 'waste')?.amount || 0;
      const saving = Math.max(10, Math.round(demo + Math.max(0, waste - 8)));
      out.push({ item: '현장 답사: 기존 타일 유지(철거·폐기물 제외)', reason: memo.trim(), amount: saving, type: 'decrease', days: 0 });
    }
    return out;
  };
  const autoPreview = autoDraft();

  const apply = () => {
    if (adj?.cancel) {
      cancelItem();
      return;
    }
    if (!ready && !autoPreview.length) return;

    if (!ready) {
      let running = before;
      const drafts = autoPreview.map((a, idx) => {
        const signed = a.type === 'decrease' ? -a.amount : a.amount;
        const log = {
          id: `auto-${Date.now()}-${idx}`,
          item: a.item,
          reason: a.reason || a.item,
          amount: a.amount,
          type: a.type,
          days: a.days,
          photo: !!c.photos?.length,
          agreed: false,
          at: new Date().toISOString().slice(0, 10),
          before: running,
          after: running + signed,
          source: 'survey-auto',
        };
        running += signed;
        return log;
      });
      pushUndo({ changeLogs: [...logs, ...drafts] });
      setMemo('');
      showToast(`현장 답사 ${drafts.length}건을 자동 반영했습니다 — 최종 ${running.toLocaleString('ko-KR')}만원`);
      return;
    }
    const log = {
      id: `chg-${Date.now()}`,
      item: memo.trim(),
      reason: memo.trim(),
      amount: amountNum,
      type,
      days: Number(days) || 0,
      photo,
      agreed: false,
      at: new Date().toISOString().slice(0, 10),
      before,
      after,
      source: 'quick',
    };
    pushUndo({ changeLogs: [...logs, log] });
    setMemo('');
    setAmount('');
    setDays('0');
    setPhoto(false);
    showToast(`견적을 ${after.toLocaleString('ko-KR')}만원으로 업데이트했습니다`);
  };

  const undo = () => {
    if (!stack.length) return;
    const last = stack[stack.length - 1];
    update({ changeLogs: last.changeLogs, survey: last.survey, waste: last.waste, tileRemain: last.tileRemain || false, undoStack: stack.slice(0, -1) });
    showToast('직전 상태로 되돌렸습니다');
  };

  const removeLog = (id) => {
    pushUndo({ changeLogs: logs.filter((l) => l.id !== id) });
    showToast('항목을 뺐습니다. 되돌리기로 복구할 수 있습니다');
  };

  return (
    <Card className="p-4">
      <p className="text-base font-extrabold text-ink">현장 답사(실측) · 최종 견적 맞추기</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Pill tone={calc.adjustmentTotal === 0 ? 'plain' : calc.adjustmentTotal > 0 ? 'warn' : 'ok'}>
          누적 {calc.adjustmentTotal > 0 ? '+' : ''}
          {calc.adjustmentTotal}만
        </Pill>
        {stack.length ? (
          <button
            type="button"
            onClick={undo}
            className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600"
          >
            ↩︎ 직전 상태로 되돌리기
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        현장에 가보니 <b className="text-ink-2">몰랐던 점</b>을 적으세요. 예) “벽에 물기 많아 방수 필요”, “기존 타일은 남김”, “사다리차 대신 양중”. 금액을 몰라도 아는 것만 적으면 항목이 먼저 잡힙니다.
      </p>

      <div className="mt-3 space-y-2">
        <TextArea
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예) 벽에 물기 많아 방수 필요 / 기존 타일은 남김 / 폐기물 1톤 추가"
          aria-label="현장 변동 내용"
        />

        {findings.length ? (
          <AlertCard tone="warn" title={`현장에서 본 것 ${autoPreview.length}건을 자동 계산했습니다`}>
            {autoPreview.map((a) => (
              <p key={a.item} className="font-bold">
                · {a.item} <span className={a.type === 'decrease' ? 'text-emerald-700' : 'text-rose-700'}>{a.type === 'decrease' ? '-' : '+'}{a.amount}만</span>
                {a.days ? ` · 일정 +${a.days}일` : ''}
              </p>
            ))}
            <p className="mt-1 text-2xs">금액을 몰라도 됩니다. [적용]을 누르면 최종 확정 견적과 손님 문서가 함께 바뀝니다.</p>
          </AlertCard>
        ) : null}

        {adj?.cancel ? (
          <WarningBox tone="info" title={`‘${adj.label || '해당 항목'}’ 빼기로 읽었습니다`}>
            금액을 넣지 않아도 됩니다. 아래 버튼을 누르면 견적에서 바로 빠집니다.
          </WarningBox>
        ) : (
          <>
            <Segmented
              options={[
                { value: 'increase', label: '+ 늘어남' },
                { value: 'decrease', label: '- 줄어듦' },
              ]}
              value={type}
              onChange={setType}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="금액 (만원)">
                <TextInput
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예) 25"
                  aria-label="변동 금액"
                />
              </Field>
              <Field label="일정 (일)">
                <TextInput inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="일정 영향" />
              </Field>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50">
              <Camera className="h-4 w-4" /> 현장 답사 사진 붙이기 ({c.photos?.length || 0})
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                aria-label="현장 답사 사진"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []).slice(0, 6 - (c.photos?.length || 0));
                  const thumbs = await Promise.all(files.map(fileToThumb));
                  update({ photos: [...(c.photos || []), ...thumbs].slice(0, 6) });
                  setPhoto(true);
                  showToast(`현장 사진 ${thumbs.length}장을 붙였습니다`);
                  e.target.value = '';
                }}
              />
            </label>

            {ready ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                {before.toLocaleString('ko-KR')}만 →{' '}
                <span className={sign > 0 ? 'text-rose-700' : 'text-emerald-700'}>{after.toLocaleString('ko-KR')}만</span> (
                {sign > 0 ? '+' : '-'}
                {amountNum}만)
              </p>
            ) : null}
          </>
        )}

        <BigButton className="w-full" disabled={!canApply} onClick={apply}>
          {adj?.cancel ? '빼기 적용' : '견적 즉시 업데이트'}
        </BigButton>
      </div>

      {logs.length ? (
        <Details label={`변동 내역 ${logs.length}건`} className="mt-3">
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-800">{l.item || l.reason || '현장 변동'}</p>
                  <p className="text-sm text-slate-500">
                    {l.at} · {l.days ? `일정 +${l.days}일 · ` : ''}
                    {l.before !== undefined ? `${l.before}만 → ${l.after}만` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={cx('text-base font-extrabold tabular-nums', l.type === 'decrease' ? 'text-emerald-700' : 'text-rose-700')}>
                    {l.type === 'decrease' ? '-' : '+'}
                    {l.amount}만
                  </span>
                  <button
                    type="button"
                    aria-label={`${l.item} 빼기`}
                    onClick={() => removeLog(l.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <p className="text-sm font-bold text-slate-600">
              누적 {calc.adjustmentTotal > 0 ? '+' : ''}
              {calc.adjustmentTotal}만원 · 처음 {Math.round(calc.baseClientPrice).toLocaleString('ko-KR')}만 → 지금{' '}
              {Math.round(calc.clientPrice).toLocaleString('ko-KR')}만
            </p>
          </div>
        </Details>
      ) : null}
    </Card>
  );
}

function WasteBlock({ c, update, waste, showToast }) {
  const rates = ratesOf(c);
  const real = vehicleRealCost(c.waste, waste, rates);
  const setScope = (id, patch) =>
    update({ waste: { ...c.waste, scopes: { ...c.waste.scopes, [id]: { ...c.waste.scopes?.[id], ...patch } } } });

  return (
    <Details label={`폐기물 분리 계산 (${waste.totalTons}톤)`}>
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-600">
          같은 무게라도 섞으면 처리비가 최대 6배가 됩니다. 철거 범위를 체크하면 얼마 차이나는지 계산합니다.
        </p>
        {WASTE_SCOPES.map((s) => {
          const row = c.waste?.scopes?.[s.id] || { on: false, area: s.defaultArea };
          return (
            <div key={s.id} className={cx('rounded-xl border p-2', row.on ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50')}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CheckRow checked={!!row.on} onChange={(v) => setScope(s.id, { on: v })} label={s.label} />
                </div>
                {row.on ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      className="field-input w-16 px-1 text-center"
                      inputMode="decimal"
                      value={row.area ?? ''}
                      onChange={(e) => setScope(s.id, { area: e.target.value })}
                      aria-label={`${s.label} 면적`}
                    />
                    <span className="text-sm text-slate-500">㎡</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="rounded-2xl bg-slate-100 p-3">
          <p className="text-base font-extrabold text-slate-800">예상 {waste.totalTons}톤</p>
          <div className="mt-2 space-y-1 text-base">
            <div className="flex justify-between">
              <span>나눠서 버리면</span>
              <span className="font-bold tabular-nums">{waste.separatedWon.toLocaleString('ko-KR')}원</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span>섞어서 버리면</span>
              <span className="font-bold tabular-nums">{waste.mixedWon.toLocaleString('ko-KR')}원</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-extrabold text-amber-800">
              <span>차액</span>
              <span className="tabular-nums">
                +{waste.diffWon.toLocaleString('ko-KR')}원 ({waste.multiplier}배)
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            차량 실비: 1톤차 {waste.vehicles[0].count}대 {real.oneTon}만원 · 2.5톤차 {waste.vehicles[1].count}대 {real.twoHalf}만원 (단가표 기준)
          </p>
          {waste.warnings.map((w, i) => (
            <p key={i} className="mt-2 flex gap-1.5 text-sm font-bold text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SmallButton
            variant={c.waste?.applyActual ? 'dark' : 'white'}
            onClick={() =>
              update({
                waste: {
                  ...c.waste,
                  applyActual: !c.waste?.applyActual,
                  actualCost: real.best,
                  assignMode: 'separated',
                },
              })
            }
          >
            실비 {real.best}만원 반영
          </SmallButton>
          <SmallButton
            onClick={() =>
              copyText(
                `폐기물 ${waste.totalTons}톤 / 나눠서 ${waste.separatedWon.toLocaleString('ko-KR')}원 / 섞어서 ${waste.mixedWon.toLocaleString('ko-KR')}원\n계량증명서·인계서는 사진으로 남겨두세요.`,
                showToast
              )
            }
          >
            <Copy className="h-4 w-4" /> 계산 복사
          </SmallButton>
        </div>
        <p className="text-sm text-slate-500">※ 마대는 콘크리트·목재·석고·금속·비닐 5종류로 나눠 두세요.</p>
      </div>
    </Details>
  );
}

function AsbestosBlock({ c, update, asbestos, showToast }) {
  const set = (patch) => update({ asbestos: { ...c.asbestos, ...patch } });
  return (
    <Details label={`석면(천장 텍스) 조기경보 ${asbestos.suspected ? '— 의심' : ''}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="건물 준공연도">
            <TextInput inputMode="numeric" value={c.asbestos?.builtYear ?? ''} onChange={(e) => set({ builtYear: e.target.value })} placeholder="예) 1996" />
          </Field>
          <Field label="면적(㎡)">
            <TextInput inputMode="decimal" value={c.asbestos?.areaSqm ?? ''} onChange={(e) => set({ areaSqm: e.target.value })} placeholder="예) 45" />
          </Field>
          <Field label="건물 용도">
            <Select value={c.asbestos?.usage || 'unknown'} onChange={(e) => set({ usage: e.target.value })}>
              <option value="unknown">모름</option>
              <option value="house">주택</option>
              <option value="nonhouse">상가·사무실 등</option>
              <option value="facility">설비(배관·보온재)</option>
            </Select>
          </Field>
          <Field label="천장재">
            <Select value={c.asbestos?.ceiling || 'unknown'} onChange={(e) => set({ ceiling: e.target.value })}>
              <option value="unknown">모름</option>
              <option value="tex">텍스</option>
              <option value="gypsum">석고보드</option>
              <option value="none">없음(노출)</option>
            </Select>
          </Field>
        </div>

        <WarningBox tone={asbestos.suspected ? 'bad' : 'info'} title={asbestos.suspected ? '석면 조사가 필요합니다' : '확인 결과'}>
          <p>{asbestos.summary}</p>
          {asbestos.reasons.length ? <p className="mt-1 text-sm">근거: {asbestos.reasons.join(' · ')}</p> : null}
          {asbestos.suspected ? (
            <p className="mt-2 text-sm font-bold">
              조사 없이 철거하면 작업중지 + 3년 이하 징역 또는 3천만원 이하 벌금 대상입니다. 일정은 최소 2주를 잡으세요.
            </p>
          ) : null}
        </WarningBox>

        {asbestos.suspected ? (
          <>
            <div className="rounded-2xl bg-slate-100 p-3 text-base">
              <p className="font-extrabold text-slate-800">예상 폐석면 처리비</p>
              <p className="mt-1">
                텍스 {asbestos.texArea}㎡ × 9.5kg = {asbestos.texTons}톤 → 약{' '}
                <span className="font-extrabold">{Math.round(asbestos.disposalWon / 10000).toLocaleString('ko-KR')}만원</span>
              </p>
              <p className="text-sm text-slate-600">조사·철거·운반은 별도 (사례 300만 ~ 550~750만원)</p>
            </div>

            <div>
              <p className="mb-2 text-base font-bold text-slate-700">남은 준비 순서</p>
              <ol className="space-y-1 text-sm leading-6 text-slate-700">
                {asbestos.timeline.map((t) => (
                  <li key={t.day}>
                    <span className="mr-2 inline-block w-12 font-extrabold text-slate-500">{t.day}</span>
                    <span className="font-bold">{t.title}</span> — {t.detail}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              <p className="font-extrabold">견적서에 자동으로 들어가는 특약</p>
              <p className="mt-1">“{ASBESTOS_CLAUSE}”</p>
              <SmallButton className="mt-2 w-full" onClick={() => copyText(ASBESTOS_CLAUSE, showToast)}>
                <Copy className="h-4 w-4" /> 특약 복사
              </SmallButton>
            </div>
          </>
        ) : null}
      </div>
    </Details>
  );
}

function EvidenceBlock({ c, update, showToast }) {
  const done = EVIDENCE_SPOTS.filter((s) => c.evidence?.[s.id]).length;
  return (
    <Details label={`철거 전 사진 6곳 (${done}/6)`}>
      <div className="space-y-2">
        <p className="text-sm leading-6 text-slate-600">
          착공 전에 찍어두지 않으면 “네 공사 때문에 긁혔다”를 반박할 방법이 없습니다. 전체샷 + 가까운 샷으로 남기세요.
        </p>
        {EVIDENCE_SPOTS.map((s) => (
          <CheckRow
            key={s.id}
            checked={!!c.evidence?.[s.id]}
            onChange={(v) => update({ evidence: { ...c.evidence, [s.id]: v } })}
            label={s.label}
            hint={s.hint}
          />
        ))}
        <SmallButton
          className="w-full"
          onClick={() => copyText('착공 전 촬영: 바닥·벽·천장·복도·승강기·아래집/옆집. 날짜가 보이게, 같은 자리에서 공사 후 다시 촬영.', showToast)}
        >
          <Copy className="h-4 w-4" /> 촬영 안내 복사
        </SmallButton>
      </div>
    </Details>
  );
}

function ChangeBlock({ c, update, showToast }) {
  const [draft, setDraft] = useState({ item: '', reason: '', amount: '', days: '', photo: false });
  const ready = draft.item && draft.reason && draft.amount && draft.days !== '' && draft.photo;
  // 서면(4종)으로 남긴 추가금만 여기서 관리한다. 현장 변동(빠른 기록)은 위 카드에서 한 번만 보인다.
  const logs = (Array.isArray(c.changeLogs) ? c.changeLogs : []).filter((l) => l.source !== 'quick');

  const add = () => {
    if (!ready) return;
    const log = {
      id: `cl-${Date.now()}`,
      ...draft,
      amount: Number(draft.amount) || 0,
      days: Number(draft.days) || 0,
      agreed: false,
      at: new Date().toISOString().slice(0, 10),
      source: 'formal',
    };
    update({ changeLogs: [...logs, log] });
    setDraft({ item: '', reason: '', amount: '', days: '', photo: false });
    showToast('추가금을 기록했습니다');
  };

  return (
    <SectionCard
      num="4"
      title="추가금 기록"
      subtitle="사진·사유·금액·일정 4가지를 다 채워야 저장됩니다."
      status={<Pill tone={logs.some((l) => !l.agreed) ? 'warn' : logs.length ? 'ok' : 'plain'}>{logs.length}건</Pill>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <Field label="① 무엇을 추가로 하나요?">
            <TextInput value={draft.item} onChange={(e) => setDraft({ ...draft, item: e.target.value })} placeholder="예) 화장실 문틀 교체" />
          </Field>
          <Field label="② 왜 필요한가요?">
            <TextInput value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="예) 철거 중 문틀 부식 확인" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="③ 금액(만원)">
              <TextInput inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="예) 35" />
            </Field>
            <Field label="④ 일정(일)">
              <TextInput inputMode="numeric" value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} placeholder="예) 1" />
            </Field>
          </div>
          <CheckRow checked={draft.photo} onChange={(v) => setDraft({ ...draft, photo: v })} label="현장 사진 있음" hint="사진 없으면 나중에 증명이 어렵습니다." />
        </div>

        <BigButton className="w-full" disabled={!ready} onClick={add}>
          추가금 기록 저장
        </BigButton>
        {!ready ? <p className="text-center text-sm text-slate-500">4가지를 모두 채우면 저장됩니다.</p> : null}

        {logs.length ? (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-extrabold text-slate-900">{l.item}</p>
                    <p className="text-sm text-slate-600">{l.reason}</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-slate-800">
                      {l.type === 'decrease' ? '-' : '+'}
                      {(Number(l.amount) || 0).toLocaleString('ko-KR')}만원 · {l.days}일
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Pill tone={l.agreed ? 'ok' : 'warn'}>{l.agreed ? '합의 완료' : '미합의'}</Pill>
                    <button
                      type="button"
                      aria-label={`${l.item || '추가금'} 빼기`}
                      onClick={() => {
                        update({ changeLogs: logs.filter((x) => x.id !== l.id) });
                        showToast('항목을 뺐습니다');
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SmallButton onClick={() => copyText(changeMessage(c, l), showToast, '고객에게 보낼 문자를 복사했습니다')}>
                    <Copy className="h-4 w-4" /> 고객 문자
                  </SmallButton>
                  <SmallButton
                    variant={l.agreed ? 'white' : 'dark'}
                    onClick={() => {
                      update({ changeLogs: logs.map((x) => (x.id === l.id ? { ...x, agreed: !x.agreed } : x)) });
                      showToast(l.agreed ? '미합의로 되돌렸습니다' : '고객 답장 캡처 확인 — 합의 완료');
                    }}
                  >
                    {l.agreed ? '합의 취소' : '답장 캡처 확인'}
                  </SmallButton>

                </div>
              </div>
            ))}
            {logs.some((l) => !l.agreed) ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                미합의 금액은 나중에 법원에서 인정되지 않을 수 있습니다. 금액이 적힌 고객 회신을 받아 캡처해 두세요.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
