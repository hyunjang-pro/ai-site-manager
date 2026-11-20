import React, { useRef, useState } from 'react';
import { Camera, Check, Copy, Loader2, ScanText, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { BATHROOM_METHODS, DEMOLITION_SCOPES, SIZE_UNITS, TRADES, TRADE_LIST } from '../../lib/constants.js';
import { classifyRequest, summarizeRequest } from '../../lib/classify.js';
import { ocrAnalyzeWithTimeout, scenePhotoNote } from '../../lib/ocr.js';
import { fileToThumb } from '../../lib/image.js';
import {
  BigButton,
  Card,
  CheckRow,
  Details,
  Field,
  Pill,
  SectionCard,
  Segmented,
  Select,
  SmallButton,
  TextArea,
  TextInput,
  WarningBox,
  cx,
} from '../ui.jsx';
import WasteVehicleSwitch from '../WasteVehicleSwitch.jsx';
import { analyzeCaseWithGemini, getGeminiKey } from '../../lib/gemini.js';
import { ratesOf } from '../../lib/rates.js';

// 1단계 — 정보: 현장 이름 · 받은 내용(정리본/원문) · 사진 OCR · 공종·규모 · 고객 정보만.
export default function InfoTab({ c, update, calc, showToast, onGoEstimate }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrHint, setOcrHint] = useState('');
  const fileRef = useRef(null);
  const info = TRADES[c.trade] || TRADES.unclassified;
  const isWaste = calc.trade === 'waste' || c.trade === 'waste';
  const customMode = calc.trade === 'custom' || calc.trade === 'unclassified' || c.trade === 'custom' || c.trade === 'unclassified';
  const aiOn = !!getGeminiKey();
  const plan = c.customPlan || {};
  const setPlan = (patch) => update({ customPlan: { ...(c.customPlan || {}), ...patch } });

  // 🤖 Gemini가 읽은 결과를 현장에 반영
  const applyAi = (a) => {
    const usingName = String(a.tradeName || '').trim();
    update({
      trade: usingName ? 'custom' : a.trade,
      tradeName: usingName,
      aiAnalysis: a,
      subScopes: a.includedScopes?.length ? a.includedScopes : c.subScopes || [],
      excludedScopes: a.excludedScopes || c.excludedScopes || [],
      ...(a.wishText && !String(c.rawInput || '').includes(a.wishText.slice(0, 12)) ? { rawInput: `${a.wishText}\n${c.rawInput || ''}`.trim() } : {}),
      ...(a.missingCosts?.length
        ? {
            customChecklist: [
              ...(c.customChecklist || []),
              ...a.missingCosts.map((m, i) => ({ id: `ai-${Date.now()}-${i}`, label: m.label, memo: m.why || m.range, amount: m.amount })),
            ],
          }
        : {}),
      ...(a.sizeValue ? { sizeValue: a.sizeValue, sizeUnit: a.sizeUnit || c.sizeUnit } : {}),
      ...(a.title ? { title: a.title } : {}),
      lifting: {
        ...(c.lifting || {}),
        ...(a.floor ? { floor: a.floor } : {}),
        ...(a.elevator && a.elevator !== 'unknown' ? { elevator: a.elevator } : {}),
      },
    });
    showToast('🤖 AI 정밀 분석으로 공종·규모·자재를 채웠습니다');
  };

  const applyClassified = (res, extra = {}) => {
    const patch = { ...res.patch, ...extra, notes: res.patch.notes || c.notes };
    if (res.trade && res.trade !== 'unclassified') patch.trade = res.trade;
    if (res.title) patch.title = res.title;
    update(patch);
    const t = TRADES[patch.trade || c.trade];
    showToast(`${t?.short || '공종'}으로 자동 선택했습니다 — 아래에서 고쳐도 됩니다`);
  };

  // 글자 없는 현장 사진(부엌·벽 등)은 외계어를 넣지 않고 한 줄 안내만 남긴다.
  const applyPhotoResult = (res) => {
    if (!res || !res.isScenePhoto) {
      update({ ocrSceneNote: '' });
      if (res && res.text) applyOcr(res.text);
      else showToast('사진에서 읽을 글자가 없습니다. 설명을 직접 적어주세요');
      return true;
    }
    const note = scenePhotoNote(c.photos?.length || 1);
    update({ ocrSceneNote: note, ...(String(c.rawInput || '').trim() ? {} : { rawInput: note }) });
    showToast('글자가 없는 현장 사진입니다 — 설명을 적으면 그 글로 분류합니다');
    return false;
  };

  const applyOcr = (raw) => {
    const res = classifyRequest(raw);
    applyClassified(res, {
      rawInput: summarizeRequest(raw, res),
      ocrRaw: raw,
      notes: raw,
    });
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      let text = `${c.rawInput || ''} ${c.notes || ''}`.trim();
      // 키가 있으면 tesseract(느리고 오타)를 건너뛰고 사진을 곧장 AI로 보낸다.
      if (!text && c.photos?.length && !getGeminiKey()) {
        setOcrHint('사진에서 글자 읽는 중…');
        const res = await ocrAnalyzeWithTimeout(
          c.photos.map((p) => p.dataUrl).filter(Boolean),
          (pct) => setOcrHint(`사진 글자 읽는 중… ${pct || 0}%`)
        );
        applyPhotoResult(res);
        text = res && !res.isScenePhoto ? res.text || '' : '';
      }
      if (!text && !c.photos?.length) {
        showToast('내용이 없습니다. 요청 글을 넣거나 사진을 올려주세요');
        return;
      }
      // 키가 있으면 멀티모달 AI가 사진까지 함께 본다. 실패하면 로컬 규칙으로 넘어간다.
      const key = getGeminiKey();
      if (key) {
        setOcrHint('🤖 AI가 사진·글을 함께 읽는 중…');
        const ai = await analyzeCaseWithGemini({ apiKey: key, text, photos: c.photos || [], tradeHint: c.trade });
        if (ai.ok) {
          applyAi(ai.data);
          if (!String(c.rawInput || '').trim() && text) update({ rawInput: text });
          return;
        }
        showToast('AI 연결 실패 — 로컬 규칙으로 분류했습니다');
      }
      if (!text) {
        showToast('글자 없는 현장 사진입니다 — 설명을 한 줄 적어주세요');
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
    if (getGeminiKey()) {
      await analyze();
      return;
    }
    setAnalyzing(true);
    setOcrHint('사진에서 글자 읽는 중…');
    try {
      const res = await ocrAnalyzeWithTimeout(
        c.photos.map((p) => p.dataUrl).filter(Boolean),
        (pct) => setOcrHint(`사진 글자 읽는 중… ${pct || 0}%`)
      );
      applyPhotoResult(res);
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
      {/* 1. 받은 내용 */}
      <SectionCard
        num="1"
        title="받은 내용"
        subtitle="숨고 요청서·카톡·메모를 그대로 붙여넣거나 사진으로 올리세요. 글자가 있으면 공종·규모를 알아서 잡습니다."
        status={
          <div className="flex flex-col items-end gap-1">
            <Pill tone={c.rawInput ? 'ok' : 'warn'}>{c.rawInput ? '입력됨' : '비어 있음'}</Pill>
            <span className={cx('rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold', aiOn ? 'bg-brand text-white' : 'bg-slate-100 text-ink-3')}>
              {aiOn ? '🤖 AI 정밀 분석 ON' : '로컬 규칙 모드'}
            </span>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="현장 이름">
            <TextInput
              value={c.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="예) 안동 풍산읍 15평 상가 철거"
              aria-label="현장 이름"
            />
          </Field>

          <div>
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink-2">받은 내용 (정리본)</span>
              {c.ocrRaw ? <Pill tone="info">사진에서 읽음</Pill> : null}
            </span>
            <TextArea
              rows={4}
              value={c.rawInput}
              onChange={(e) => update({ rawInput: e.target.value })}
              placeholder={'예) 24평 빌라 도배·장판, 엘리베이터 없는 3층, 다음 주 착공 희망\n또는 숨고 요청서 스크린샷을 올리세요'}
              aria-label="받은 내용"
            />
            <p className="mt-1 text-2xs font-semibold leading-4 text-ink-3">
              사진에서 읽은 내용은 시계·앱 버튼 같은 잡글자를 지우고 지역·면적·공종·요청만 남겨 넣습니다.
            </p>
            {c.ocrRaw ? (
              <Details label="사진에서 읽은 원문 보기 (정리 전)" className="mt-1.5">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-ink-3">{c.ocrRaw}</pre>
              </Details>
            ) : null}
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
                aria-label="현장 사진 선택"
                onChange={(e) => {
                  onPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <BigButton variant="amber" className="flex-1" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : aiOn ? <Sparkles className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
              {analyzing ? '읽는 중…' : aiOn ? 'AI 정밀 분석' : '자동으로 분류'}
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

          {c.ocrSceneNote ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[12.5px] font-semibold leading-5 text-ink-2">
              <Camera className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span>{c.ocrSceneNote}</span>
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
        </div>
      </SectionCard>

      {/* 2. 공종·규모 */}
      <SectionCard
        num="2"
        title="공종·규모"
        subtitle="자동으로 잡힌 값입니다. 다르면 눌러서 바꾸세요."
        status={<Pill tone="info">{info.short}</Pill>}
      >
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-sm font-bold text-ink-2">공종</span>
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
            <Field
              label="철거 범위"
              hint={DEMOLITION_SCOPES.find((x) => x.value === (c.demolition?.scope || 'restore'))?.hint}
            >
              <Segmented
                options={DEMOLITION_SCOPES.map((x) => ({ value: x.value, label: x.label }))}
                value={c.demolition?.scope || 'restore'}
                onChange={(v) => update({ demolition: { ...(c.demolition || {}), scope: v } })}
              />
            </Field>
          ) : null}

          {c.trade === 'bathroom' ? (
            <Field
              label="욕실 공법"
              hint={BATHROOM_METHODS.find((x) => x.value === (c.bathroom?.method || 'full'))?.hint}
            >
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
                <TextInput
                  inputMode="numeric"
                  value={c.sizeValue}
                  onChange={(e) => update({ sizeValue: e.target.value, sizeUnit: '명' })}
                  placeholder="예) 3"
                  aria-label="인원"
                />
              </Field>
              <Field label="일수" hint="하루면 1">
                <TextInput
                  inputMode="numeric"
                  value={c.laborDays || 1}
                  onChange={(e) => update({ laborDays: e.target.value })}
                  placeholder="1"
                  aria-label="일수"
                />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="규모 (아는 만큼)" hint="모르면 비워두세요. 실측 때 재면 됩니다.">
                <TextInput
                  inputMode="decimal"
                  value={c.sizeValue}
                  onChange={(e) => update({ sizeValue: e.target.value })}
                  placeholder="예) 24"
                  aria-label="규모"
                />
              </Field>
              <Field label="단위">
                <Select value={c.sizeUnit} onChange={(e) => update({ sizeUnit: e.target.value })} aria-label="단위">
                  {SIZE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {isWaste ? <WasteVehicleSwitch c={c} update={update} showToast={showToast} /> : null}

          {(c.subScopes?.length || c.excludedScopes?.length) ? (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-extrabold text-ink">이 현장에 들어가는 공종</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(c.subScopes || []).map((x) => {
                  const label = { bathroom: '욕실', kitchen: '주방', wallpaper: '도배·장판', entrance: '현관', demolition: '철거', plaster: '바닥 미장', window: '창호' }[x] || x;
                  return (
                    <button
                      key={x}
                      type="button"
                      onClick={() => update({ subScopes: (c.subScopes || []).filter((y) => y !== x) })}
                      className="rounded-lg bg-white px-2 py-1 text-2xs font-extrabold text-ink-2 ring-1 ring-slate-200"
                      aria-label={`${label} 빼기`}
                    >
                      포함 · {label} ✕
                    </button>
                  );
                })}
                {(c.excludedScopes || []).map((x) => {
                  const label = { window: '창호' }[x] || x;
                  return (
                    <button
                      key={`ex-${x}`}
                      type="button"
                      onClick={() => update({ excludedScopes: (c.excludedScopes || []).filter((y) => y !== x), subScopes: [...(c.subScopes || []), x] })}
                      className="rounded-lg bg-rose-50 px-2 py-1 text-2xs font-extrabold text-rose-700 ring-1 ring-rose-200"
                      aria-label={`${label} 다시 포함`}
                    >
                      제외 · {label} ↩
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-2xs font-semibold leading-4 text-ink-3">잘못 잡힌 항목은 눌러서 빼거나 다시 넣으세요. 견적·문서가 바로 바뀝니다.</p>
            </div>
          ) : null}

          {customMode ? (
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="text-sm font-extrabold text-amber-900">직접 공종 이름 (문서·문자에 그대로 들어갑니다)</p>
              <div className="mt-1.5">
                <TextInput
                  value={c.tradeName || ''}
                  onChange={(e) => update({ tradeName: e.target.value, trade: 'custom' })}
                  placeholder="예) 외벽 코킹, 맨땅 데크, 간판 철거"
                  aria-label="직접 공종 이름"
                />
              </div>
              <p className="mt-1 text-2xs font-semibold leading-4 text-amber-800">
                목록에 없는 현장은 이름만 적으면 제목·견적서·문자에 그 이름으로 나갑니다.
              </p>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* 만능 견적 모드 — 공종이 안 잡혀도 6단계가 그대로 돌아간다 */}
      {customMode ? (
        <SectionCard
          num="3"
          title="만능 견적 모드 (인력·자재 직접)"
          subtitle="공종이 안 잡히는 현장은 인부 수·일수·자재·장비·폐기물만 넣으면 견적·수익·문서가 그대로 나옵니다."
          status={<Pill tone="warn">직접 입력</Pill>}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="인부 수" hint="명">
                <TextInput inputMode="numeric" value={plan.people ?? ''} onChange={(e) => setPlan({ people: e.target.value })} placeholder="예) 2" aria-label="인부 수" />
              </Field>
              <Field label="일수" hint="일">
                <TextInput inputMode="numeric" value={plan.days ?? ''} onChange={(e) => setPlan({ days: e.target.value })} placeholder="예) 3" aria-label="일수" />
              </Field>
              <Field label="일당 (만원)" hint={`비우면 기본 ${ratesOf(c)?.labor?.helper || 19}만`}>
                <TextInput inputMode="decimal" value={plan.wage ?? ''} onChange={(e) => setPlan({ wage: e.target.value })} placeholder={`${ratesOf(c)?.labor?.helper || 19}`} aria-label="일당" />
              </Field>
              <Field label="자재비 (만원)">
                <TextInput inputMode="decimal" value={plan.material ?? ''} onChange={(e) => setPlan({ material: e.target.value })} placeholder="예) 40" aria-label="자재비" />
              </Field>
              <Field label="장비·운반 (만원)">
                <TextInput inputMode="decimal" value={plan.equip ?? ''} onChange={(e) => setPlan({ equip: e.target.value })} placeholder="예) 20" aria-label="장비비" />
              </Field>
              <Field label="폐기물 (만원)">
                <TextInput inputMode="decimal" value={plan.waste ?? ''} onChange={(e) => setPlan({ waste: e.target.value })} placeholder="예) 30" aria-label="폐기물비" />
              </Field>
            </div>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold leading-5 text-ink-2">
              원가 약 {Math.round(calc.totalDirectCost)}만 → 견적{' '}
              <b className="text-brand-strong">{Math.round(calc.finalPrice)}만원</b> (남는 돈 보수적 {Math.round(calc.netProfitBuffered)}만)
            </p>
            <p className="text-2xs font-semibold leading-4 text-ink-3">{calc.targetSummary}</p>
          </div>
        </SectionCard>
      ) : null}

      {/* 🤖 AI 정밀 분석 결과 */}
      {c.aiAnalysis ? (
        <SectionCard num="4" title="🤖 AI 정밀 분석" subtitle="사진·글에서 읽은 현장 상태와 준비물입니다." status={<Pill tone="info">{c.aiAnalysis.summary ? '분석 완료' : '참고'}</Pill>}>
          <div className="space-y-2">
            {c.aiAnalysis.wishText ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold leading-5 text-amber-900">희망사항: {c.aiAnalysis.wishText}</p>
            ) : null}
            {c.aiAnalysis.costBreakdown?.length ? (
              <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
                <p className="text-xs font-extrabold text-ink-3">AI 원가 산출 근거</p>
                {c.aiAnalysis.costBreakdown.map((b, i) => (
                  <div key={i} className="mt-1 flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[12px] leading-4 text-ink-2">
                      <b className="text-ink">{b.label}</b> {b.detail}
                    </span>
                    <span className="num shrink-0 text-[12px] font-extrabold text-ink">+{b.amount}만</span>
                  </div>
                ))}
              </div>
            ) : null}
            {c.aiAnalysis.siteCondition ? (
              <p className="rounded-xl bg-brand-soft px-3 py-2 text-[13px] font-bold leading-5 text-brand-strong">{c.aiAnalysis.siteCondition}</p>
            ) : null}
            {c.aiAnalysis.includedScopes?.length ? (
              <p className="text-[12.5px] font-bold leading-5 text-ink-2">
                포함 공종: {c.aiAnalysis.includedScopes.join(' · ')}
                {c.aiAnalysis.excludedScopes?.length ? ` / 제외: ${c.aiAnalysis.excludedScopes.join(' · ')}` : ''}
              </p>
            ) : null}
            {c.aiAnalysis.materials?.length ? (
              <div>
                <p className="text-xs font-extrabold text-ink-3">필요 자재</p>
                <p className="mt-0.5 text-[13px] font-semibold leading-6 text-ink-2">{c.aiAnalysis.materials.join(' · ')}</p>
              </div>
            ) : null}
            {c.aiAnalysis.crew?.length ? (
              <div>
                <p className="text-xs font-extrabold text-ink-3">예상 인력</p>
                <p className="mt-0.5 text-[13px] font-semibold leading-6 text-ink-2">
                  {c.aiAnalysis.crew.map((x) => `${x.role} ${x.count}명`).join(' · ')}
                </p>
              </div>
            ) : null}
            {c.aiAnalysis.priceRange?.max > 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold text-ink-2">
                AI 보수적 범위 {c.aiAnalysis.priceRange.min}~{c.aiAnalysis.priceRange.max}만원 (부가세 별도)
              </p>
            ) : null}
            {c.aiAnalysis.surveyChecks?.length ? (
              <div className="rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-xs font-extrabold text-amber-900">답사 때 확인</p>
                <ul className="mt-1 space-y-0.5">
                  {c.aiAnalysis.surveyChecks.map((t, i) => (
                    <li key={i} className="text-[12.5px] font-semibold leading-5 text-amber-900">
                      · {t.label || t}
                      {t.why ? <span className="text-amber-800"> — {t.why}</span> : null}
                      {t.amount ? <span className="font-extrabold"> (+{t.amount}만)</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {c.aiAnalysis.warnings?.length ? (
              <ul className="space-y-0.5">
                {c.aiAnalysis.warnings.map((t, i) => (
                  <li key={i} className="text-[12.5px] font-semibold leading-5 text-rose-700">⚠ {t}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* 3. 고객 정보 */}
      <SectionCard num={customMode ? "5" : "3"} title="고객 정보" subtitle="견적서·안내 문자에 들어갈 이름과 현장 주소입니다.">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="고객 이름">
              <TextInput
                value={c.clientName}
                onChange={(e) => update({ clientName: e.target.value })}
                placeholder="예) 김 사장님"
                aria-label="고객 이름"
              />
            </Field>
            <Field label="연락처">
              <TextInput
                value={c.clientPhone}
                onChange={(e) => update({ clientPhone: e.target.value })}
                placeholder="010-0000-0000"
                inputMode="tel"
                aria-label="고객 연락처"
              />
            </Field>
          </div>
          <Field label="현장 주소">
            <TextInput
              value={c.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="예) 안동시 풍산읍 상가 2층"
              aria-label="현장 주소"
            />
          </Field>
        </div>
      </SectionCard>

      <Card className="flex items-center gap-2 p-3.5">
        <Check className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={3} />
        <p className="text-[13px] font-semibold leading-5 text-ink-2">
          여기까지 넣으면 <b className="text-ink">2단계 가견적</b>에서 금액이 바로 나옵니다. 답사 뒤에 고칠 수 있으니 대충 넣어도 됩니다.
        </p>
      </Card>

      <SmallButton className="w-full" variant="white" onClick={() => onGoEstimate && onGoEstimate()}>
        <Copy className="h-4 w-4" /> 2단계 가견적 보기
      </SmallButton>
    </div>
  );
}
