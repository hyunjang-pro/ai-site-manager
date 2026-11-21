import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Loader2, ScanText, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { SIZE_UNITS, TRADES, TRADE_LIST } from '../lib/constants.js';
import { classifyRequest, summarizeRequest } from '../lib/classify.js';
import { computeEstimate } from '../lib/pricing.js';
import { composeCase } from '../lib/storage.js';
import { analyzeCaseWithGemini, getGeminiKey } from '../lib/gemini.js';
import { ocrAnalyzeWithTimeout } from '../lib/ocr.js';
import { fileToThumb } from '../lib/image.js';
import { AlertCard, BigButton, Details, Modal, Pill, Select, TextArea, TradeIcon, cx } from './ui.jsx';

export default function NewCaseModal({ open, onClose, onCreate, settings }) {
  const [step, setStep] = useState('input'); // input | result
  const [text, setText] = useState('');
  // kind: 'screenshot'(숨고·카톡 스샷 — 올리면 글자를 읽는다) | 'site'(현장 사진 — 글자를 읽지 않고 바로 붙는다)
  const [photos, setPhotos] = useState([]); // {id, file, url, thumb, kind}
  const [ocrText, setOcrText] = useState('');
  const [sceneNote, setSceneNote] = useState('');
  const [attachNote, setAttachNote] = useState('');
  const [progress, setProgress] = useState(null); // null | 문자열
  const [result, setResult] = useState(null);
  const [trade, setTrade] = useState('demolition');
  const [sizeValue, setSizeValue] = useState('');
  const [sizeUnit, setSizeUnit] = useState('평');
  const [floor, setFloor] = useState('');
  const [elevator, setElevator] = useState('unknown');
  const [error, setError] = useState('');
  const shotRef = useRef(null);
  const siteRef = useRef(null);
  const shotCount = photos.filter((p) => p.kind === 'screenshot').length;
  const siteCount = photos.filter((p) => p.kind === 'site').length;
  const aiOn = !!getGeminiKey();
  const info = TRADES[trade] || TRADES.unclassified;

  useEffect(() => {
    if (!open) {
      // 닫히면 정리
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setStep('input');
      setText('');
      setPhotos([]);
      setOcrText('');
      setSceneNote('');
      setAttachNote('');
      setResult(null);
      setProgress(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = progress !== null;

  // 스샷·현장 사진을 나눠 붙인다.
  //  · 스샷(screenshot) → 바로 글자를 읽어 요청 글·지역·평수·공종을 채운다.
  //  · 현장 사진(site)   → 글자를 읽지 않고 0초 만에 그대로 붙인다(AI 정밀 분석 때 사진으로 함께 본다).
  const addPhotos = async (fileList, kind) => {
    const room = 6 - photos.length;
    if (room <= 0) {
      setError('사진은 6장까지 올릴 수 있습니다. 한 장 지우고 다시 올려주세요.');
      return;
    }
    const files = Array.from(fileList || [])
      .filter((f) => String(f.type || '').startsWith('image/'))
      .slice(0, room);
    if (!files.length) return;
    setError('');
    const items = files.map((f) => ({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      url: URL.createObjectURL(f),
      thumb: null,
      kind,
    }));
    // 화면에는 바로(0초) 붙이고, 썸네일(dataUrl)은 뒤에서 채운다.
    setPhotos((prev) => [...prev, ...items]);
    if (kind === 'site') {
      setAttachNote(
        aiOn
          ? `현장 사진 ${files.length}장 붙였습니다 — 글자를 읽지 않고 그대로 저장했어요. 아래 🤖 AI 정밀 분석을 누르면 사진으로 함께 봅니다.`
          : `현장 사진 ${files.length}장 붙였습니다 — 글자를 읽지 않고 그대로 저장했어요. 무엇을 하는지 한 줄 적고 아래 버튼을 누르면 분류합니다.`
      );
    } else {
      setAttachNote('');
    }
    const thumbs = await Promise.all(items.map((it) => fileToThumb(it.file)));
    setPhotos((prev) => prev.map((p) => {
      const i = items.findIndex((it) => it.id === p.id);
      return i >= 0 ? { ...p, thumb: thumbs[i] } : p;
    }));
    if (kind === 'screenshot') await readScreenshots(items);
  };

  // 스샷에서만 글자를 읽는다. 읽은 글자는 입력칸에 넣고 공종·규모·지역을 바로 채운다.
  const readScreenshots = async (items) => {
    setSceneNote('');
    setError('');
    setProgress(`💬 스샷 ${items.length}장에서 글자 읽는 중…`);
    try {
      const res = await ocrAnalyzeWithTimeout(items.map((it) => it.file), (pct, idx, total) =>
        setProgress(`💬 스샷 ${idx || 1}/${total || items.length} 글자 읽는 중… ${pct ? `${pct}%` : ''}`)
      );
      if (res.isScenePhoto || !String(res.text || '').trim()) {
        // 사물·그림자를 글자로 오인한 경우 — 외계어를 넣지 않고 안내만 남긴다.
        setSceneNote('이 스샷에서는 글자를 찾지 못했습니다. 현장 사진이면 📷 현장 사진으로 올려 주세요.');
        return;
      }
      const cleaned = String(res.text || '').trim();
      setOcrText(cleaned);
      const merged = [text.trim(), cleaned].filter(Boolean).join('\n');
      setText(merged);
      const r = classifyRequest(merged);
      r.patch.rawInput = summarizeRequest(merged, r);
      r.patch.notes = merged;
      r.patch.ocrRaw = cleaned;
      setResult(r);
      setTrade(r.trade === 'unclassified' ? 'custom' : r.trade);
      setSizeValue(r.patch.sizeValue || '');
      setSizeUnit(r.patch.sizeUnit || '평');
      setFloor(r.patch.lifting?.floor ? String(r.patch.lifting.floor) : '');
      setElevator(r.patch.lifting?.elevator || 'unknown');
    } catch (e) {
      const msg = String(e?.message || '');
      setSceneNote(/[가-힣]/.test(msg) ? msg : '스샷 글자를 읽지 못했습니다. 요청 내용을 한 줄만 적어주시면 공종·규모를 잡아 드립니다.');
    } finally {
      setProgress(null);
    }
  };

  const applyAi = (a, baseText) => {
    const rows = [
      { label: '공종', value: TRADES[a.trade]?.label || '직접 입력' },
      a.sizeValue ? { label: '규모', value: `${a.sizeValue}${a.sizeUnit || ''}` } : null,
      a.priceRange?.max > 0 ? { label: 'AI 참고 시세', value: `${a.priceRange.min}~${a.priceRange.max}만` } : null,
    ].filter(Boolean);
    setSceneNote('');
    setResult({
      trade: a.trade,
      title: a.title,
      rows,
      hints: [...(a.surveyChecks || []).map((x) => (typeof x === 'string' ? x : x.label)), ...(a.warnings || [])].slice(0, 6),
      patch: {
        trade: a.trade,
        tradeName: a.tradeName,
        rawInput: baseText || a.summary,
        notes: baseText || a.summary,
        ...(a.sizeValue ? { sizeValue: a.sizeValue, sizeUnit: a.sizeUnit } : {}),
        lifting: { floor: a.floor || '', elevator: a.elevator || 'unknown' },
        aiAnalysis: a,
        subScopes: a.includedScopes || [],
        excludedScopes: a.excludedScopes || [],
        parseHints: a.warnings || [],
      },
    });
    setTrade(a.trade || 'custom');
    setSizeValue(a.sizeValue || '');
    setSizeUnit(a.sizeUnit || '평');
    setFloor(a.floor || '');
    setElevator(a.elevator || 'unknown');
    setStep('result');
  };

  // 🤖 AI 정밀 분석 — 글 + 현장 사진(시각 정보)을 함께 본다. 키가 없으면 로컬 규칙.
  const analyze = async () => {
    const typed = String(text || '').trim();
    const sites = photos.filter((p) => p.kind === 'site');
    setError('');
    if (!typed && !photos.length) {
      setError('붙여넣은 내용이 없습니다. 요청 글을 넣거나 스샷·현장 사진을 올려주세요.');
      return;
    }
    setProgress(getGeminiKey() ? '🤖 AI가 글·현장 사진을 함께 보는 중…' : '분류 중…');
    try {
      const key = getGeminiKey();
      if (key) {
        // 현장 사진은 시각 정보로 그대로 넘긴다. 스샷은 이미 글자로 읽어 두었다.
        const ai = await analyzeCaseWithGemini({
          apiKey: key,
          text: typed || (sites.length ? '(현장 사진만 있음 — 사진을 보고 판단)' : ''),
          photos: sites.map((p) => p.thumb).filter(Boolean),
        });
        if (ai.ok) {
          applyAi(ai.data, typed);
          return;
        }
        setError('AI 연결에 실패해 로컬 규칙으로 분류했습니다.');
      }

      if (!typed) {
        // 글이 없고 사진만 있는 경우 — '사진이 없다'고 하면 안 된다. 사진은 이미 붙어 있으니 저장은 되게 한다.
        setResult({
          trade: 'custom',
          rows: [],
          hints: [
            sites.length
              ? `현장 사진 ${sites.length}장이 함께 저장됩니다. 공종을 고르면 그 기준으로 견적을 잡습니다.`
              : '공종을 직접 골라주세요.',
          ],
          patch: { rawInput: '', notes: '', parseHints: [] },
        });
        setTrade('custom');
        setStep('result');
        return;
      }

      const r = classifyRequest(typed);
      const summary = summarizeRequest(typed, r);
      r.patch.rawInput = summary;
      r.patch.notes = typed;
      if (ocrText) r.patch.ocrRaw = ocrText;
      setResult(r);
      setTrade(r.trade === 'unclassified' ? 'custom' : r.trade);
      setSizeValue(r.patch.sizeValue || '');
      setSizeUnit(r.patch.sizeUnit || '평');
      setFloor(r.patch.lifting?.floor ? String(r.patch.lifting.floor) : '');
      setElevator(r.patch.lifting?.elevator || 'unknown');
      setStep('result');
    } catch (e) {
      // 영어 라이브러리 오류문을 부모님께 그대로 보여주지 않는다
      const msg = String(e?.message || '');
      setError(
        /[가-힣]/.test(msg) ? msg : '분류하지 못했습니다. 요청 내용을 한 줄만 적어주시면 공종·규모를 잡아 드립니다.'
      );
    } finally {
      setProgress(null);
    }
  };

  // 만들 때 넘길 값을 한 곳에서 만든다 — 미리보기 금액과 실제 등록 금액이 같은 값을 쓴다.
  const draftPatch = () => {
    const base = result?.patch || { rawInput: text, notes: text, parseHints: [] };
    return {
      ...base,
      trade,
      sizeValue,
      sizeUnit: sizeUnit || info.defaultUnit,
      lifting: { ...(base.lifting || {}), floor: floor || '', elevator },
      title: result?.title && trade === result.trade ? result.title : undefined,
      // 사진은 스샷/현장 구분(kind)까지 함께 저장한다.
      photos: photos
        .map((p) => ({ name: p.thumb?.name || p.file?.name || '사진', dataUrl: p.thumb?.dataUrl || '', kind: p.kind }))
        .filter((p) => p.dataUrl),
    };
  };

  // 이 내용으로 만들면 2. 가견적에 뜨는 금액 — 같은 함수(composeCase + computeEstimate)로 미리 계산한다.
  const draftCalc = useMemo(() => {
    if (step !== 'result') return null;
    try {
      return computeEstimate(composeCase({ trade, patch: draftPatch(), settings: settings || {} }));
    } catch (e) {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result, trade, sizeValue, sizeUnit, floor, elevator, photos, text, settings]);

  const create = () => {
    onCreate(trade, draftPatch());
    onClose();
  };

  const rows = useMemo(() => {
    if (!result) return [];
    return result.rows.filter((r) => r.label !== '공종');
  }, [result]);

  const headerBack = step === 'result' ? () => setStep('input') : onClose;

  return (
    <Modal
      open={open}
      onClose={onClose}
      onBack={headerBack}
      backLabel={step === 'result' ? '다시 입력' : '닫기'}
      title={step === 'input' ? '새 현장 만들기' : '자동으로 잡았습니다'}
      subtitle={step === 'input' ? '숨고·카톡·스샷으로 자동 분류' : '공종·규모는 아래에서 고쳐도 됩니다'}
      footer={
        step === 'result' ? (
          <>
            <BigButton className="w-full" onClick={create}>
              <Wand2 className="h-5 w-5" /> 이 내용으로 현장 만들기
            </BigButton>
            <p className="mt-1 text-center text-2xs text-ink-3">만든 뒤 1단계에서 언제든 다시 분류·수정할 수 있습니다</p>
          </>
        ) : null
      }
    >
      {step === 'input' ? (
        <div className="space-y-3.5">
          {/* 1) 붙여넣기 · 사진 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">
                <span className="mr-1 rounded-md bg-ink px-1.5 py-0.5 text-2xs font-black text-white">1</span>
                숨고·카톡·메모를 그대로 넣으세요
              </span>
              {/* 상태 배지 하나만 — '자동 분류' 배지를 겹쳐 두면 두 줄로 꺾이고 뜻이 겹친다 */}
              <span
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold',
                  aiOn ? 'bg-brand text-white' : 'bg-slate-100 text-ink-3'
                )}
              >
                {aiOn ? '🤖 AI 정밀 분석 ON' : 'AI 없이 자동 분류'}
              </span>
            </div>
            <TextArea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'예) 아파트 인테리어, 경북 안동시, 15평, 공실, 창호 제외, 바닥 미장 필요\n또는 숨고 요청서 스크린샷을 올리세요'}
              aria-label="현장 요청 내용"
            />
          </div>

          {/* 2) 사진 — 두 버튼: 스샷은 글자를 읽고, 현장 사진은 바로 붙는다 */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => shotRef.current?.click()}
                aria-label="숨고·카톡 스샷 올리기"
                className="flex min-h-[66px] flex-col items-center justify-center gap-0.5 rounded-2xl border border-brand/30 bg-brand-soft px-2 text-brand-strong active:bg-brand/10"
              >
                <span className="flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold leading-5">
                  <span aria-hidden className="text-base leading-none">💬</span> 숨고·카톡 스샷
                </span>
                <span className="text-[11.5px] font-bold leading-4 text-brand/80">글자 읽기 · {shotCount}/6</span>
              </button>
              <button
                type="button"
                onClick={() => siteRef.current?.click()}
                aria-label="현장 사진 올리기"
                className="flex min-h-[66px] flex-col items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white px-2 text-ink active:bg-slate-50"
              >
                <span className="flex items-center gap-1 whitespace-nowrap text-[13px] font-extrabold leading-5">
                  <span aria-hidden className="text-base leading-none">📷</span> 현장 사진
                </span>
                <span className="text-[11.5px] font-bold leading-4 text-ink-3">바로 첨부 · {siteCount}/6</span>
              </button>
            </div>
            <input
              ref={shotRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="숨고·카톡 스샷 선택"
              onChange={(e) => {
                addPhotos(e.target.files, 'screenshot');
                e.target.value = '';
              }}
            />
            <input
              ref={siteRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="현장 사진 선택"
              onChange={(e) => {
                addPhotos(e.target.files, 'site');
                e.target.value = '';
              }}
            />
            <p className="mt-1.5 text-2xs font-semibold leading-4 text-ink-3">
              <b className="text-brand-strong">스샷은 글자를 읽어</b> 내용을 채우고, <b className="text-ink-2">현장 사진은 글자를 읽지 않고</b> 바로
              붙어요. 현장 사진은 AI 정밀 분석 때 사진으로 함께 봅니다.
            </p>
            <p className="mt-1 text-[11.5px] font-semibold leading-4 text-ink-4">
              갤럭시에서 ‘갤러리’가 안 보이면 같은 화면의 <b>내 파일 &gt; 이미지</b>에서 골라도 똑같이 붙습니다.
            </p>
          </div>

          {/* 3) 자동 분류 — 전체 너비 주 버튼 */}
          <BigButton
            variant="amber"
            className="w-full whitespace-nowrap text-sm"
            onClick={() => analyze()}
            disabled={busy}
            aria-label={aiOn ? 'AI 정밀 분석' : '자동으로 분류하기'}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {busy ? '읽는 중…' : aiOn ? '🤖 AI 정밀 분석' : '자동으로 분류하기'}
          </BigButton>

          {photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <div key={p.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img
                    src={p.thumb?.dataUrl || p.url}
                    alt={p.file?.name || p.thumb?.name || '사진'}
                    className="h-24 w-full object-cover"
                  />
                  <span
                    className={cx(
                      'absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[11px] font-black leading-4',
                      p.kind === 'screenshot' ? 'bg-brand text-white' : 'bg-ink/80 text-white'
                    )}
                  >
                    {p.kind === 'screenshot' ? '스샷' : '현장'}
                  </span>
                  <button
                    type="button"
                    aria-label={p.kind === 'screenshot' ? '스샷 삭제' : '현장 사진 삭제'}
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((list) => list.filter((x) => x.id !== p.id));
                    }}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {attachNote ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold leading-5 text-emerald-900">
              <span aria-hidden className="mt-0.5">📷</span>
              <span>{attachNote}</span>
            </p>
          ) : null}

          {sceneNote ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] font-semibold leading-5 text-ink-2">
              <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span>{sceneNote}</span>
            </p>
          ) : null}

          {ocrText ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800">
                <ScanText className="h-3.5 w-3.5" /> 스샷에서 읽은 글자 (잡글자 제거)
              </p>
              <p className="mt-1 max-h-32 overflow-auto whitespace-pre-line text-[13px] font-semibold leading-5 text-emerald-900">{ocrText}</p>
            </div>
          ) : null}

          {result?.rows?.length && step === 'input' ? (
            <p data-testid="shot-summary" className="rounded-xl bg-white px-3 py-2 text-[13px] font-bold leading-5 text-ink ring-1 ring-slate-200">
              스샷에서 잡았어요 — {result.rows.map((r) => `${r.label} ${r.value}`).join(' · ')}
            </p>
          ) : null}

          {progress ? (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {progress}
            </div>
          ) : null}
          {error ? <AlertCard tone="warn" title="확인이 필요합니다">{error}</AlertCard> : null}

          {/* 4) 직접 고르기 */}
          <Details label="자동 분류 없이 공종만 직접 고르기">
            <div className="grid grid-cols-2 gap-2">
              {TRADE_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onCreate(t.id, {
                      trade: t.id,
                      sizeUnit: t.defaultUnit,
                      rawInput: text,
                      notes: text,
                      photos: photos
                        .map((p) => ({ name: p.thumb?.name || p.file?.name || '사진', dataUrl: p.thumb?.dataUrl || '', kind: p.kind }))
                        .filter((p) => p.dataUrl),
                    });
                    onClose();
                  }}
                  className="flex min-h-[58px] items-center gap-2.5 rounded-2xl bg-white px-3 text-left ring-1 ring-slate-200 active:bg-slate-50"
                >
                  <TradeIcon trade={t.id} size="sm" />
                  <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-4 text-ink">{t.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </Details>

          <p className="text-2xs font-semibold leading-4 text-ink-3">
            스샷 글자는 기기 안에서만 읽습니다(무료 OCR · 첫 1회 20~40초). 현장 사진은 글자를 읽지 않아 바로 붙습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {photos.length ? (
            <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold text-ink-2">
              <span aria-hidden>📎</span>
              <span>
                {[shotCount ? `스샷 ${shotCount}장` : '', siteCount ? `현장 사진 ${siteCount}장` : ''].filter(Boolean).join(' · ')}이 함께 저장됩니다
              </span>
            </p>
          ) : null}
          {draftCalc ? (
            <div data-testid="draft-quote" data-amount={Math.round(draftCalc.finalPrice)} className="rounded-2xl bg-ink px-4 py-3 text-white shadow-float">
              <p className="text-2xs font-bold text-blue-200">이 내용으로 만들면 · 2. 가견적과 같은 금액</p>
              <p className="num mt-0.5 text-[26px] font-black leading-8">
                {Math.round(draftCalc.finalPrice).toLocaleString('ko-KR')}
                <span className="ml-1 text-sm font-bold text-blue-200">만원</span>
              </p>
              <p className="mt-0.5 text-2xs font-semibold leading-4 text-blue-200/90">
                부가세 별도 · 예비비 {draftCalc.bufferRate}% 포함 · {draftCalc.targetSummary}
              </p>
            </div>
          ) : null}
          {sceneNote ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] font-semibold leading-5 text-ink-2">
              <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span>{sceneNote}</span>
            </p>
          ) : null}
          {ocrText ? (
            <AlertCard tone="good" title="사진에서 읽은 글자 (정리 후)">
              <p className="line-clamp-4 whitespace-pre-line">{ocrText}</p>
            </AlertCard>
          ) : null}

          {result?.patch?.aiAnalysis ? (
            <AlertCard tone="info" title="🤖 AI 정밀 분석">
              {result.patch.aiAnalysis.wishText ? <p className="font-bold">희망사항: {result.patch.aiAnalysis.wishText}</p> : null}
              {result.patch.aiAnalysis.siteCondition ? <p className="font-bold">{result.patch.aiAnalysis.siteCondition}</p> : null}
              {result.patch.aiAnalysis.materials?.length ? (
                <p className="mt-1">자재: {result.patch.aiAnalysis.materials.slice(0, 4).join(' · ')}</p>
              ) : null}
              {result.patch.aiAnalysis.crew?.length ? (
                <p className="mt-0.5">인력: {result.patch.aiAnalysis.crew.map((x) => `${x.role} ${x.count}명`).join(' · ')}</p>
              ) : null}
              {result.patch.aiAnalysis.priceRange?.max > 0 ? (
                <p className="mt-0.5">
                  AI가 본 시세(참고): {result.patch.aiAnalysis.priceRange.min}~{result.patch.aiAnalysis.priceRange.max}만 (부가세 별도)
                </p>
              ) : null}
            </AlertCard>
          ) : null}

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-2xs font-bold text-ink-3">자동으로 잡은 내용</p>
            <div className="mt-2 space-y-1.5">
              {result?.rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-ink-3">{r.label}</span>
                  <span className="text-right text-sm font-extrabold text-ink">{r.value}</span>
                </div>
              ))}
            </div>
            {rows.length ? null : <p className="text-xs text-ink-3">공종을 직접 골라주세요.</p>}
            {result?.hints?.length ? (
              <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                {result.hints.slice(0, 4).map((h, i) => (
                  <li key={i} className="flex gap-1.5 text-2xs font-semibold leading-4 text-amber-700">
                    <span aria-hidden>•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {result?.patch?.rawInput ? (
            <div>
              <p className="mb-1 text-xs font-extrabold text-ink-2">받은 내용으로 정리한 글</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-xs leading-5 text-ink-2 ring-1 ring-slate-200">
                {result.patch.rawInput}
              </pre>
            </div>
          ) : null}

          {/* 수정 */}
          <div>
            <p className="mb-1.5 text-sm font-extrabold text-ink">공종 (다르면 눌러서 바꾸세요)</p>
            <div className="flex flex-wrap gap-1.5">
              {TRADE_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTrade(t.id);
                    setSizeUnit(t.defaultUnit);
                  }}
                  className={cx(
                    'rounded-xl border px-2.5 py-2 text-xs font-extrabold',
                    trade === t.id ? 'border-brand bg-brand-soft text-brand-strong' : 'border-slate-200 bg-white text-ink-2'
                  )}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">규모</span>
              <input
                inputMode="decimal"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
                placeholder="예) 15"
                className="field-input min-h-12 text-sm"
                aria-label="규모"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">단위</span>
              <Select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} className="min-h-12 text-sm" aria-label="단위">
                {SIZE_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">층수</span>
              <input
                inputMode="numeric"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="예) 3"
                className="field-input min-h-12 text-sm"
                aria-label="층수"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-2">엘리베이터</span>
              <Select value={elevator} onChange={(e) => setElevator(e.target.value)} className="min-h-12 text-sm" aria-label="엘리베이터">
                <option value="unknown">확인 필요</option>
                <option value="yes">있음</option>
                <option value="no">없음</option>
              </Select>
            </label>
          </div>

          <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-2xs font-semibold text-ink-3">
            아래 버튼을 누르면 이 내용 그대로 현장이 만들어집니다
          </p>
        </div>
      )}
    </Modal>
  );
}
