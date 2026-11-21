import React, { useRef, useState } from 'react';
import { Camera, Check, Copy, Loader2, ScanText, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { BATHROOM_METHODS, DEMOLITION_SCOPES, SIZE_UNITS, TRADES, TRADE_LIST } from '../../lib/constants.js';
import { classifyRequest, summarizeRequest, autoCaseTitle } from '../../lib/classify.js';
import { ocrAnalyzeWithTimeout } from '../../lib/ocr.js';
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
import { ratesOf, LABOR_ROLES } from '../../lib/rates.js';

// 여러 공종을 함께 켰을 때 복합으로 계산해 주는 공종 (pricing.js combined 와 같은 목록)
const MULTI_SCOPES = [
  { id: 'demolition', label: '철거' },
  { id: 'groundwork', label: '기초·정지' },
  { id: 'wallpaper', label: '도배·장판' },
  { id: 'bathroom', label: '욕실' },
  { id: 'kitchen', label: '주방' },
  { id: 'entrance', label: '현관' },
  { id: 'plaster', label: '바닥 미장' },
];

// 1단계 — 정보: 현장 이름 · 받은 내용(정리본/원문) · 사진 OCR · 공종·규모 · 고객 정보만.
export default function InfoTab({ c, update, calc, showToast, onGoEstimate }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrHint, setOcrHint] = useState('');
  const [newScope, setNewScope] = useState('');
  const shotRef = useRef(null);
  const siteRef = useRef(null);
  // 스샷(kind: 'screenshot')만 글자를 읽는다. 현장 사진(kind: 'site', 예전에 올린 사진 포함)은 글자를 읽지 않는다.
  const shots = (c.photos || []).filter((p) => p && p.kind === 'screenshot');
  const sites = (c.photos || []).filter((p) => p && p.kind !== 'screenshot');
  const info = TRADES[c.trade] || TRADES.unclassified;
  const isWaste = calc.trade === 'waste' || c.trade === 'waste';
  const customMode = calc.trade === 'custom' || calc.trade === 'unclassified' || c.trade === 'custom' || c.trade === 'unclassified';
  const aiOn = !!getGeminiKey();
  const plan = c.customPlan || {};
  const setPlan = (patch) => update({ customPlan: { ...(c.customPlan || {}), ...patch } });
  const customScopes = (c.subScopes || []).filter((x) => typeof x === 'string' && x.startsWith('x:'));
  // 칩을 켜고 끌 때 공종을 다시 잡는다 — 2개 이상이면 복합(combined)으로 계산
  const toggleScope = (id) => {
    const cur = c.subScopes || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    const priced = next.filter((x) => !String(x).startsWith('x:'));
    const nextTrade = priced.length >= 2 ? 'combined' : priced.length === 1 ? priced[0] : c.trade;
    update({
      subScopes: next,
      ...(priced.length >= 2 || priced.length === 1 ? { trade: nextTrade } : {}),
      // 제목을 직접 고치지 않았으면 공종에 맞춰 제목도 바꿔준다 (철거+정지 → '전체 인테리어'로 남지 않게)
      ...(c.titleAuto ? { title: autoCaseTitle(c, nextTrade, next) } : {}),
    });
  };

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
      else showToast('스샷에서 읽을 글자가 없습니다. 설명을 직접 적어주세요');
      return true;
    }
    // 스샷에서 글자를 못 찾은 경우 — 외계어를 넣지 않고 이 한 줄만 보여준다.
    const note = `💬 스샷 ${shots.length || 1}장에서 읽을 글자를 찾지 못했습니다 — 현장 사진이면 설명을 한 줄 적어 주세요.`;
    update({ ocrSceneNote: note });
    showToast('스샷에서 글자를 찾지 못했습니다 — 현장 사진이면 설명을 한 줄 적어주세요');
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
      // 키가 없을 때만, 그것도 스샷에서만 느린 OCR을 돌린다(현장 사진은 글자를 읽지 않는다).
      if (!text && shots.length && !getGeminiKey()) {
        setOcrHint('스샷에서 글자 읽는 중…');
        const res = await ocrAnalyzeWithTimeout(
          shots.map((p) => p.dataUrl).filter(Boolean),
          (pct) => setOcrHint(`스샷 글자 읽는 중… ${pct || 0}%`)
        );
        applyPhotoResult(res);
        text = res && !res.isScenePhoto ? res.text || '' : '';
      }
      if (!text && !sites.length) {
        showToast(
          c.photos?.length
            ? '현장 사진은 글자를 읽지 않습니다 — 설명을 한 줄 적으면 그 글로 분류합니다'
            : '내용이 없습니다. 요청 글을 넣거나 스샷·현장 사진을 올려주세요'
        );
        return;
      }
      // 키가 있으면 멀티모달 AI가 현장 사진(시각 정보)까지 함께 본다. 실패하면 로컬 규칙으로 넘어간다.
      const key = getGeminiKey();
      if (key) {
        setOcrHint(sites.length ? '🤖 AI가 현장 사진·글을 함께 읽는 중…' : '🤖 AI가 글을 읽는 중…');
        const ai = await analyzeCaseWithGemini({ apiKey: key, text, photos: sites, tradeHint: c.trade });
        if (ai.ok) {
          applyAi(ai.data);
          if (!String(c.rawInput || '').trim() && text) update({ rawInput: text });
          return;
        }
        showToast('AI 연결 실패 — 로컬 규칙으로 분류했습니다');
      }
      if (!text) {
        showToast('현장 사진은 글자를 읽지 않습니다 — 설명을 한 줄 적어주세요');
        return;
      }
      const res = classifyRequest(text);
      applyClassified(res, { rawInput: text });
    } catch (e) {
      showToast(e.message || '분류하지 못했습니다');
    } finally {
      setAnalyzing(false);
      setOcrHint('');
    }
  };

  const readPhotos = async () => {
    if (!shots.length) {
      showToast('글자를 읽을 스샷이 없습니다 — 현장 사진은 글자를 읽지 않습니다');
      return;
    }
    if (getGeminiKey()) {
      await analyze();
      return;
    }
    setAnalyzing(true);
    setOcrHint('스샷에서 글자 읽는 중…');
    try {
      const res = await ocrAnalyzeWithTimeout(
        shots.map((p) => p.dataUrl).filter(Boolean),
        (pct) => setOcrHint(`스샷 글자 읽는 중… ${pct || 0}%`)
      );
      applyPhotoResult(res);
    } catch (e) {
      showToast(e.message || '스샷 글자를 읽지 못했습니다');
    } finally {
      setAnalyzing(false);
      setOcrHint('');
    }
  };

  const onPhotos = async (files, kind) => {
    const room = 6 - (c.photos?.length || 0);
    const list = Array.from(files || []).slice(0, Math.max(0, room));
    if (!list.length) {
      showToast('사진은 6장까지 올릴 수 있습니다 — 한 장 지우고 올려주세요');
      return;
    }
    const thumbs = await Promise.all(list.map(fileToThumb));
    const tagged = thumbs.map((t) => ({ ...t, kind }));
    update({ photos: [...(c.photos || []), ...tagged].slice(0, 6) });
    showToast(
      kind === 'screenshot'
        ? `스샷 ${thumbs.length}장을 붙였습니다 — ‘AI 정밀 분석’을 누르면 글자를 읽어 채웁니다`
        : `현장 사진 ${thumbs.length}장을 붙였습니다 — 글자를 읽지 않고 그대로 저장합니다`
    );
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
              onChange={(e) => update({ title: e.target.value, titleAuto: false })}
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

          <div>
            <div className="grid grid-cols-2 gap-2">
              <label className="chip cursor-pointer gap-1.5 border-brand/30 bg-brand-soft px-2 text-brand-strong">
                <span aria-hidden className="text-base leading-none">💬</span>
                <span className="flex flex-col items-start leading-4">
                  <span className="whitespace-nowrap text-[13px] font-extrabold">숨고·카톡 스샷</span>
                  <span className="text-[10px] font-bold text-brand/80">글자 읽기 · {shots.length}/6</span>
                </span>
                <input
                  ref={shotRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-label="숨고·카톡 스샷 선택"
                  onChange={(e) => {
                    onPhotos(e.target.files, 'screenshot');
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="chip cursor-pointer gap-1.5 border-slate-200 bg-white px-2 text-slate-700">
                <span aria-hidden className="text-base leading-none">📷</span>
                <span className="flex flex-col items-start leading-4">
                  <span className="whitespace-nowrap text-[13px] font-extrabold">현장 사진</span>
                  <span className="text-[10px] font-bold text-ink-3">바로 붙이기 · {sites.length}/6</span>
                </span>
                <input
                  ref={siteRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-label="현장 사진 선택"
                  onChange={(e) => {
                    onPhotos(e.target.files, 'site');
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="mt-1 text-2xs font-semibold leading-4 text-ink-3">
              스샷은 글자를 읽어 내용을 채우고, 현장 사진은 글자를 읽지 않고 바로 저장합니다(AI 정밀 분석 때 사진으로 함께 봅니다).
            </p>
            <p className="mt-1 text-[10.5px] font-semibold leading-4 text-ink-4">
              갤럭시에서 ‘갤러리’가 안 보이면 <b>내 파일 &gt; 이미지</b>에서 골라도 똑같이 붙습니다.
            </p>
          </div>

          <BigButton variant="amber" className="w-full" onClick={analyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : aiOn ? <Sparkles className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
            {analyzing ? '읽는 중…' : aiOn ? 'AI 정밀 분석' : '자동으로 분류'}
          </BigButton>

          {shots.length ? (
            <button
              type="button"
              onClick={readPhotos}
              disabled={analyzing}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50 disabled:opacity-50"
            >
              <ScanText className="h-4 w-4" /> 스샷 속 글자만 다시 읽기
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
                  <span
                    className={cx(
                      'absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-black leading-4 text-white',
                      p.kind === 'screenshot' ? 'bg-brand' : 'bg-ink/80'
                    )}
                  >
                    {p.kind === 'screenshot' ? '스샷' : p.kind === 'site' ? '현장' : '사진'}
                  </span>
                  <button
                    type="button"
                    aria-label={p.kind === 'screenshot' ? '스샷 삭제' : '현장 사진 삭제'}
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
                  ...(c.titleAuto ? { title: autoCaseTitle(c, v, c.subScopes) } : {}),
                });
              }}
            />
          </div>

          {/* 여러 공종 동시에 — 철거 + 정지처럼 한 현장에 일이 둘이면 둘 다 켠다 */}
          <Field
            label="함께 하는 공종 (여러 개 켜기)"
            hint="철거+정지처럼 같이 하는 일은 둘 다 켜세요. 2개 이상이면 복합 현장으로 계산합니다."
          >
            <div className="flex flex-wrap gap-1.5">
              {MULTI_SCOPES.map((s) => {
                const on = (c.subScopes || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`${s.label} ${on ? '빼기' : '넣기'}`}
                    onClick={() => toggleScope(s.id)}
                    className={cx(
                      'min-h-9 rounded-full border px-3 text-xs font-extrabold',
                      on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    {on ? '✓ ' : '+ '}
                    {s.label}
                  </button>
                );
              })}
              {customScopes.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-label={`${tag.slice(2)} 빼기`}
                  onClick={() => update({ subScopes: (c.subScopes || []).filter((x) => x !== tag) })}
                  className="min-h-9 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-extrabold text-amber-900"
                >
                  ✓ {tag.slice(2)} ✕
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <TextInput
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                placeholder="목록에 없는 공종 (예) 부지 정지, 배수로 정비"
                aria-label="직접 공종 추가"
              />
              <SmallButton
                className="shrink-0"
                onClick={() => {
                  const name = newScope.trim().slice(0, 20);
                  if (!name) return;
                  const tag = `x:${name}`;
                  if ((c.subScopes || []).includes(tag)) {
                    setNewScope('');
                    return;
                  }
                  update({
                    subScopes: [...(c.subScopes || []), tag],
                    customChecklist: [
                      ...(c.customChecklist || []),
                      { id: `x-${Date.now()}`, label: name, memo: '직접 추가한 공종 — 답사에서 금액을 넣고 체크하세요', amount: 0 },
                    ],
                  });
                  setNewScope('');
                  showToast(`'${name}' 공종을 넣었습니다 — 금액은 답사에서 직접 추가하세요`);
                }}
              >
                + 추가
              </SmallButton>
            </div>
            {customScopes.length ? (
              <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-2xs font-bold leading-4 text-amber-900">
                직접 적은 공종은 단가표에 없습니다. 견적에 넣으려면 <b>3. 답사 → 직접 추가 항목</b>에 금액을 적고 체크하세요.
              </p>
            ) : null}
          </Field>

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
                  value={c.laborDays ?? ''}
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
                  const label = { bathroom: '욕실', kitchen: '주방', wallpaper: '도배·장판', entrance: '현관', demolition: '철거', plaster: '바닥 미장', groundwork: '기초·정지', window: '창호' }[x] || String(x).replace(/^x:/, '');
                  return (
                    <span key={x} className="rounded-lg bg-white px-2 py-1 text-2xs font-extrabold text-ink-2 ring-1 ring-slate-200">
                      포함 · {label}
                    </span>
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
              <p className="mt-1 text-2xs font-semibold leading-4 text-ink-3">위 칩을 눌러 넣거나 빼면 견적·문서가 바로 바뀝니다.</p>
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

      {/* 🏛️ 관공서 공고에서 가져온 현장 */}
      {c.bid ? (
        <Card className="p-3.5">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">🏛️ 관공서 공고</p>
          <div className="mt-1.5 space-y-1 text-[13px] font-semibold text-ink-2">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">발주처</span>
              <b className="text-right text-ink">{c.bid.org || '-'}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">공고번호</span>
              <b className="text-right text-ink">{c.bid.noticeNo || '-'}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">추정가격</span>
              <b className="text-right text-ink">{Math.round((Number(c.bid.estPrice) || 0) / 10000).toLocaleString('ko-KR')}만원</b>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">추천 투찰가 (88%)</span>
              <b className="text-right text-brand-strong">{Math.round((Number(c.bid.bidPrice) || 0) / 10000).toLocaleString('ko-KR')}만원</b>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">마감일</span>
              <b className="text-right text-ink">{String(c.bid.deadline || '').slice(0, 10) || '-'}</b>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">지역</span>
              <b className="text-right text-ink">{c.bid.region || '-'}</b>
            </div>
          </div>
          {c.bid.url ? (
            <a
              href={c.bid.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex min-h-10 items-center justify-center rounded-xl bg-blue-50 text-[13px] font-extrabold text-blue-900"
            >
              나라장터 공고 열기
            </a>
          ) : null}
        </Card>
      ) : null}

      {/* 만능 견적 모드 — 공종이 안 잡혀도 6단계가 그대로 돌아간다 */}
      {customMode ? (
        <SectionCard
          num="3"
          title="만능 견적 모드 (인력·자재 직접)"
          subtitle="공종이 안 잡히는 현장은 인부 수·일수·자재·장비·폐기물만 넣으면 견적·수익·문서가 그대로 나옵니다."
          status={<Pill tone="warn">직접 입력</Pill>}
        >
          <div className="space-y-2">
            <Field label="인부 종류" hint="고르면 그 직종 일당을 아래 일당 칸에 넣습니다. 설정의 일당이 그대로 쓰입니다.">
              <Select
                value={plan.worker || ''}
                onChange={(e) => {
                  const key = e.target.value;
                  const rate = key ? ratesOf(c)?.labor?.[key] : '';
                  setPlan({ worker: key, ...(rate !== '' && rate !== undefined ? { wage: String(rate) } : {}) });
                }}
                aria-label="인부 종류"
              >
                <option value="">직접 입력</option>
                {LABOR_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label} · {ratesOf(c)?.labor?.[r.key]}만
                  </option>
                ))}
              </Select>
            </Field>
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
        <SectionCard fold num="4" title="🤖 AI 정밀 분석" subtitle="사진·글에서 읽은 현장 상태와 준비물입니다." status={<Pill tone="info">{c.aiAnalysis.summary ? '분석 완료' : '참고'}</Pill>}>
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
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold text-ink-2">
                <p>
                  AI가 본 시세 {c.aiAnalysis.priceRange.min}~{c.aiAnalysis.priceRange.max}만원 <span className="font-semibold text-ink-3">(참고)</span>
                </p>
                <p className="mt-0.5 text-brand-strong">
                  우리 단가표 견적 {Math.round(calc.finalPrice).toLocaleString('ko-KR')}만원 — 2단계 가견적과 같은 금액입니다
                </p>
              </div>
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
          <Field
            label="현장까지 거리 (km)"
            hint={`사무실에서 현장까지 편도. 기준 ${ratesOf(c)?.travel?.baseKm ?? 15}km를 넘으면 교통비가 연인원만큼 자동으로 붙습니다.`}
          >
            <TextInput
              inputMode="decimal"
              value={c.distanceKm ?? ''}
              onChange={(e) => update({ distanceKm: e.target.value })}
              placeholder="예) 40 (모르면 비워두세요 = 0km)"
              aria-label="현장까지 거리"
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
    </div>
  );
}
