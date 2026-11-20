import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ImagePlus, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { SIZE_UNITS, TRADES, TRADE_LIST } from '../lib/constants.js';
import { classifyRequest } from '../lib/classify.js';
import { ocrWithTimeout } from '../lib/ocr.js';
import { fileToThumb } from '../lib/image.js';
import { AlertCard, BigButton, Modal, Pill, Select, TextArea, TradeIcon, cx } from './ui.jsx';

const EXAMPLES = [
  '폐기물 2톤만 치워주세요',
  '발코니 누수 방수',
  '일용직 인부 3명',
  '욕실+도배 15평',
  '24평 아파트 도배·장판, 엘베 없는 3층',
];

export default function NewCaseModal({ open, onClose, onCreate }) {
  const [step, setStep] = useState('input'); // input | result
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]); // {file, url, thumb}
  const [ocrText, setOcrText] = useState('');
  const [progress, setProgress] = useState(null); // null | 문자열
  const [result, setResult] = useState(null);
  const [trade, setTrade] = useState('demolition');
  const [sizeValue, setSizeValue] = useState('');
  const [sizeUnit, setSizeUnit] = useState('평');
  const [floor, setFloor] = useState('');
  const [elevator, setElevator] = useState('unknown');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) {
      // 닫히면 정리
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setStep('input');
      setText('');
      setPhotos([]);
      setOcrText('');
      setResult(null);
      setProgress(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = progress !== null;

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, 6 - photos.length);
    const next = [];
    for (const f of files) {
      if (!String(f.type || '').startsWith('image/')) continue;
      const thumb = await fileToThumb(f);
      next.push({ file: f, url: URL.createObjectURL(f), thumb });
    }
    setPhotos((p) => [...p, ...next]);
  };

  const analyze = async () => {
    setError('');
    setProgress('사진에서 글자 읽는 중…');
    let combined = text;
    try {
      if (photos.length) {
        const read = await ocrWithTimeout(
          photos.map((p) => p.file),
          (pct, idx, total) => setProgress(`사진 ${idx || 1}/${total || photos.length} 글자 읽는 중… ${pct ? `${pct}%` : ''}`)
        );
        setOcrText(read);
        combined = `${text}\n${read}`.trim();
      }
      if (!combined.trim()) {
        setError('붙여넣은 내용이나 사진이 없습니다. 요청 글을 넣거나 공종을 직접 골라주세요.');
        setProgress(null);
        return;
      }
      const r = classifyRequest(combined);
      setResult(r);
      setTrade(r.trade === 'unclassified' ? 'custom' : r.trade);
      setSizeValue(r.patch.sizeValue || '');
      setSizeUnit(r.patch.sizeUnit || '평');
      setFloor(r.patch.lifting?.floor ? String(r.patch.lifting.floor) : '');
      setElevator(r.patch.lifting?.elevator || 'unknown');
      setStep('result');
    } catch (e) {
      setError(e.message || '사진 글자를 읽지 못했습니다. 직접 입력해 주세요.');
    } finally {
      setProgress(null);
    }
  };

  const create = () => {
    const base = result?.patch || { rawInput: text, notes: text, parseHints: [] };
    const info = TRADES[trade] || TRADES.unclassified;
    onCreate(trade, {
      ...base,
      trade,
      sizeValue,
      sizeUnit: sizeUnit || info.defaultUnit,
      lifting: { ...(base.lifting || {}), floor: floor || '', elevator },
      title: result?.title && trade === result.trade ? result.title : undefined,
      photos: photos.map((p) => p.thumb),
    });
    onClose();
  };

  const rows = useMemo(() => {
    if (!result) return [];
    const out = result.rows.filter((r) => r.label !== '공종');
    return out;
  }, [result]);

  const headerBack = step === 'result' ? () => setStep('input') : onClose;

  return (
    <Modal
      open={open}
      onClose={onClose}
      onBack={headerBack}
      backLabel={step === 'result' ? '다시 입력' : '닫기'}
      title={step === 'input' ? '새 현장 만들기' : '자동으로 잡았습니다'}
      subtitle={step === 'input' ? '숨고·카톡·스샷을 그대로 넣으면 알아서 분류합니다' : '공종·규모는 아래에서 고쳐도 됩니다'}
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
        <div className="space-y-4">
          {/* 1) 붙여넣기 · 사진 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">
                <span className="mr-1 rounded-md bg-ink px-1.5 py-0.5 text-2xs font-black text-white">1</span>
                숨고·카톡·메모를 그대로 넣으세요
              </span>
              <Pill tone="info" icon={false}>자동 분류</Pill>
            </div>
            <TextArea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'예) 아파트 인테리어, 경북 안동시, 15평, 공실, 창호 제외, 바닥 미장 필요\n또는 숨고 요청서 스크린샷을 올리세요'}
              aria-label="현장 요청 내용"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText((v) => (v ? `${v}\n${ex}` : ex))}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-2xs font-bold text-ink-2 active:bg-slate-200"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50"
            >
              <ImagePlus className="h-5 w-5" /> 사진·스샷 {photos.length ? `${photos.length}/6` : '올리기'}
            </button>
            <BigButton variant="amber" className="min-h-14 whitespace-nowrap text-sm" onClick={analyze} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {busy ? '읽는 중…' : '자동으로 분류'}
            </BigButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="사진 선택"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={`${p.file.name}-${i}`} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img src={p.url} alt={p.file.name} className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    aria-label="사진 삭제"
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((list) => list.filter((_, idx) => idx !== i));
                    }}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {progress ? (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {progress}
            </div>
          ) : null}
          {error ? <AlertCard tone="warn" title="확인이 필요합니다">{error}</AlertCard> : null}

          {/* 2) 직접 고르기 */}
          <div>
            <p className="mb-2 text-sm font-extrabold text-ink">
              <span className="mr-1 rounded-md bg-slate-200 px-1.5 py-0.5 text-2xs font-black text-ink-2">2</span>
              아니면 공종만 직접 고르기
            </p>
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
                      photos: photos.map((p) => p.thumb),
                    });
                    onClose();
                  }}
                  className="flex min-h-[62px] items-center gap-2.5 rounded-2xl bg-slate-50 px-3 text-left active:bg-slate-100"
                >
                  <TradeIcon trade={t.id} size="sm" />
                  <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-4 text-ink">{t.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </div>

          <AlertCard tone="info" title="사진은 이렇게 읽습니다">
            숨고 요청서·카톡 캡처의 글자를 기기 안에서 읽습니다(무료 OCR). 첫 1회는 인식 데이터를 받느라 20~40초 걸릴 수 있습니다. 사진은 외부로 저장되지 않고 현장 사진첩에만 남습니다.
          </AlertCard>
        </div>
      ) : (
        <div className="space-y-4">
          {ocrText ? (
            <AlertCard tone="good" title="사진에서 읽은 글자">
              <p className="line-clamp-4 whitespace-pre-line">{ocrText}</p>
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
