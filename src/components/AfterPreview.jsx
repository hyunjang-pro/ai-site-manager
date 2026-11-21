import React, { useMemo, useState } from 'react';
import { Camera, Copy, ExternalLink, Loader2, Maximize2, Sparkles } from 'lucide-react';
import { Card, Modal, Pill, SmallButton, cx } from './ui.jsx';
import { generateAfterPreview, hasGeminiKey } from '../lib/gemini.js';
import { materialSetFor } from '../lib/materials.js';
import { TRADES } from '../lib/constants.js';
import { buildFreePrompt } from '../lib/freePrompt.js';
import { copyText } from '../lib/clipboard.js';
import { fileToThumb } from '../lib/image.js';
import { kstToday } from '../lib/date.js';

// 인테리어 공종만 — 구조·창문·배치는 그대로 두고 마감만 바꾼 애프터 예상 이미지
export const PREVIEW_TRADES = [
  'kitchen',
  'bathroom',
  'wallpaper',
  'tilewaterproof',
  'window',
  'film',
  'carpentry',
  'combined',
  'custom',
];

const GEMINI_URL = 'https://gemini.google.com';
const CHATGPT_URL = 'https://chatgpt.com';

// ①·②·③ 동그라미 — 어머님·아버지가 순서를 한눈에 따라가게
function StepNo({ n }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-white">
      {n}
    </span>
  );
}

export default function AfterPreview({
  c,
  update,
  calc,
  design,
  showToast,
  title = '공사 전 · 공사 후 (손님께 보여주기)',
  mode = 'edit', // 'edit' = 4단계(올리기·복사까지) · 'doc' = 6단계 문서(사진만)
}) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [nudge, setNudge] = useState(false); // 유료 실패 → 무료 방법으로 안내
  const keyOn = hasGeminiKey();
  const before = (c.photos || []).find((p) => p?.dataUrl)?.dataUrl || c.preview?.before || '';
  const after = c.preview?.after || '';
  const info = TRADES[calc.trade] || TRADES.unclassified;
  const mset = materialSetFor(c, calc.trade);
  const manual = c.preview?.source === 'manual';
  const prompt = useMemo(
    () => buildFreePrompt({ c, calc, design, materialSet: mset }),
    [c, calc, design, mset]
  );

  const copyPrompt = () => copyText(prompt, showToast, '설명을 복사했습니다 — Gemini·ChatGPT에 사진과 함께 붙여넣으세요');

  const onUpload = async (files) => {
    const file = (files || [])[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      showToast('사진 파일만 올릴 수 있습니다');
      return;
    }
    setUploading(true);
    try {
      const thumb = await fileToThumb(file, 1400);
      if (!thumb?.dataUrl) {
        showToast('사진을 읽지 못했습니다 — 다른 사진으로 해보세요');
        return;
      }
      update({
        preview: {
          ...(c.preview || {}),
          before: c.preview?.before || before || '',
          after: thumb.dataUrl,
          source: 'manual',
          name: file.name || '',
          at: kstToday(),
        },
      });
      showToast('만든 사진을 AFTER에 올렸습니다 — 손님께 보여주세요');
    } finally {
      setUploading(false);
    }
  };

  const run = async () => {
    if (!keyOn) {
      showToast('유료 Gemini 키가 없어도 무료로 만들 수 있습니다 — 위 ① 설명을 복사하세요');
      return;
    }
    if (!before) {
      showToast('먼저 1단계 정보에서 현장 사진(비포)을 올려주세요');
      return;
    }
    setBusy(true);
    try {
      const res = await generateAfterPreview({
        beforeImage: before,
        caseInfo: { tradeLabel: c.tradeName || info.label, trade: calc.trade, size: `${c.sizeValue || ''}${c.sizeUnit || ''}` },
        style: {
          material: (mset?.spec || design?.combo || []).slice(0, 3).join(', '),
          grade: mset?.label || design?.preset?.label || '',
          price: Math.round(calc.finalPrice),
        },
      });
      if (!res.ok) {
        setNudge(true);
        showToast(
          res.reason === 'no_key'
            ? '유료 키가 없습니다 — 무료 방법(① 설명 복사)으로 만드세요'
            : '이미지를 만들지 못했습니다. 무료 방법(① 설명 복사)으로 만드세요'
        );
        return;
      }
      update({
        preview: {
          before,
          after: res.dataUrl,
          model: res.model,
          source: 'api',
          at: new Date().toISOString().slice(0, 10),
        },
      });
      showToast('완공 예상 사진을 만들었습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
            <Sparkles className="h-4 w-4 text-brand" /> {title}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">
            {mode === 'doc'
              ? '손님께 그대로 보여줄 수 있습니다. 사진을 누르면 크게 보입니다.'
              : '공사 전 사진과 공사 후 사진을 나란히 보여줍니다. 아래 1·2·3 순서로 돈 안 들이고 만들 수 있습니다.'}
          </p>
        </div>
        <Pill tone={after ? 'ok' : 'plain'}>{after ? '사진 있음' : '사진 없음'}</Pill>
      </div>

      {/* BEFORE / AFTER */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-2xs font-extrabold text-ink-3">BEFORE</p>
          <div className="overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
            {before ? (
              <img src={before} alt="공사 전" className="h-32 w-full object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center px-2 text-center text-2xs font-semibold text-ink-3">
                1단계 정보에서 현장 사진을 올려주세요
              </div>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-2xs font-extrabold text-brand">AFTER (예상)</p>
          {after ? (
            <button
              type="button"
              onClick={() => setCompare(true)}
              className="relative block w-full overflow-hidden rounded-xl bg-white ring-1 ring-brand/40"
              aria-label="공사 후 사진 크게 보기"
            >
              <img src={after} alt="공사 후 예상" className="h-32 w-full object-cover" />
              <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-lg bg-ink/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                <Maximize2 className="h-3 w-3" /> 크게
              </span>
            </button>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 px-2 text-center text-2xs font-semibold text-ink-3 ring-1 ring-slate-200">
              아래 ③번으로 만든 사진을 올리면 여기에 보입니다
            </div>
          )}
        </div>
      </div>

      {after ? (
        <div className="mt-2 grid grid-cols-2 gap-2 no-print">
          <button
            type="button"
            onClick={() => setCompare(true)}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white shadow-brand active:bg-brand-strong"
          >
            <Maximize2 className="h-4 w-4" /> 손님께 크게 보여주기
          </button>
          <a
            href={after}
            download={`${(c.title || 'site').replace(/[^\w가-힣-]+/g, '-')}-after.png`}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-ink-2"
          >
            사진 저장
          </a>
        </div>
      ) : null}

      {mode === 'edit' ? (
        <>
          {/* 무료 방법 — ① 복사 ② 무료 앱에 넣기 ③ 만든 사진 올리기 */}
          <div
            className={cx(
              'mt-3 rounded-2xl p-3 ring-1 transition',
              nudge ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-brand-soft/50 ring-brand/20'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-brand-strong">돈 안 드는 방법</p>
              <Pill tone="ok">무료</Pill>
            </div>
            <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-2">
              {nudge ? '무료 한도를 다 썼습니다. 아래 ①~③ 순서로 하면 됩니다.' : 'Gemini·ChatGPT로 3단계면 됩니다.'}
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <StepNo n="1" />
              <p className="text-[13px] font-extrabold text-ink">설명 복사하기</p>
            </div>
            <SmallButton variant="brand" className="mt-1.5 w-full" onClick={copyPrompt}>
              <Copy className="h-4 w-4" /> 설명 복사하기
            </SmallButton>
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="mt-1 w-full text-left text-2xs font-bold text-brand underline decoration-dotted underline-offset-2"
              aria-expanded={showFull}
            >
              복사될 설명 {showFull ? '접기' : '미리 보기'}
            </button>
            <div
              className={cx(
                'mt-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-2.5 text-[11px] leading-[17px] text-ink-2 ring-1 ring-slate-200',
                showFull ? 'max-h-64' : 'max-h-[3.6rem]'
              )}
            >
              {prompt}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <StepNo n="2" />
              <p className="text-[13px] font-extrabold text-ink">Gemini·ChatGPT에 사진과 함께 넣기</p>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <a
                href={GEMINI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-sm font-bold text-ink-2 ring-1 ring-slate-200"
              >
                <ExternalLink className="h-4 w-4" /> Gemini 열기
              </a>
              <a
                href={CHATGPT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-sm font-bold text-ink-2 ring-1 ring-slate-200"
              >
                <ExternalLink className="h-4 w-4" /> ChatGPT 열기
              </a>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <StepNo n="3" />
              <p className="text-[13px] font-extrabold text-ink">만든 사진 여기에 올리기</p>
            </div>
            <label className="mt-1.5 flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand/40 bg-white px-3 text-sm font-bold text-brand active:bg-brand-soft">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploading ? '올리는 중…' : after ? '다른 사진으로 바꾸기' : '만든 사진 올리기'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="만든 사진 올리기"
                onChange={(e) => {
                  onUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-ink-3">
              휴대폰 사진첩에서 고르면 됩니다. 올린 사진은 6단계 견적서에도 함께 나옵니다.
            </p>
          </div>

          {/* 유료 키가 있는 사람만 — 기본은 접어 둔다 */}
          <details className="group mt-2 rounded-xl bg-slate-50/80 no-print">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-xs font-bold text-ink-3">
              <span>유료 키가 있으면 앱에서 바로 만들기</span>
              <span className="text-2xs text-slate-400 group-open:hidden">열기</span>
            </summary>
            <div className="px-3 pb-3">
              <p className="text-2xs font-semibold leading-4 text-ink-3">
                {keyOn
                  ? '설정에 넣은 Gemini 키로 바로 만듭니다. 무료 키는 그림 한도가 0이라 실패할 수 있습니다.'
                  : '설정 › Gemini에 유료 키를 넣으면 ①~③ 없이 앱에서 바로 만듭니다.'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SmallButton variant={after ? 'white' : 'brand'} className="w-full" onClick={run} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {busy ? '만드는 중…' : after ? '다시 만들기' : '예상 이미지 만들기'}
                </SmallButton>
                <SmallButton variant="white" className="w-full" onClick={run} disabled={busy}>
                  손님 보여주기용
                </SmallButton>
              </div>
            </div>
          </details>

          {manual ? (
            <p className="mt-1.5 text-2xs font-semibold text-ink-3 no-print">
              ※ 직접 올린 사진입니다. 실제 시공 결과와 다를 수 있으니 손님께 “예상 사진”이라고 먼저 말하세요.
            </p>
          ) : after ? (
            <p className="mt-1.5 text-2xs font-semibold text-ink-3 no-print">
              ※ 실제 시공 결과와 다를 수 있습니다. 손님께 “예상 사진”이라고 먼저 말하세요.
            </p>
          ) : null}
        </>
      ) : !after ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3 no-print">
          4단계 최종·수익에서 무료로 만든 사진을 올리면 여기에 나옵니다.
        </p>
      ) : null}

      <Modal open={compare} onClose={() => setCompare(false)} title="공사 전 → 공사 후" subtitle={c.title || ''}>
        <div className="space-y-3">
          <figure>
            <figcaption className="mb-1 text-2xs font-extrabold text-ink-3">BEFORE · 공사 전</figcaption>
            <div className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              {before ? (
                <img src={before} alt="공사 전" className="max-h-[38vh] w-full object-contain" />
              ) : (
                <div className="flex h-32 items-center justify-center text-2xs font-semibold text-ink-3">사진 없음</div>
              )}
            </div>
          </figure>
          <figure>
            <figcaption className="mb-1 text-2xs font-extrabold text-brand">AFTER · 공사 후 (예상)</figcaption>
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-brand/40">
              <img src={after} alt="공사 후 예상" className="max-h-[38vh] w-full object-contain" />
            </div>
          </figure>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
            ※ 실제 시공 결과와 다를 수 있습니다. 손님께는 “예상 사진”이라고 먼저 말하세요.
          </p>
        </div>
      </Modal>
    </Card>
  );
}
