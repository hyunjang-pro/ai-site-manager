import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { generateAfterPreview, hasGeminiKey } from '../lib/gemini.js';
import { materialSetFor } from '../lib/materials.js';
import { TRADES } from '../lib/constants.js';
import { Card, Pill, SmallButton, cx } from './ui.jsx';

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

export default function AfterPreview({ c, update, calc, design, showToast, title = 'AI 완공 예상 (Before → After)' }) {
  const [busy, setBusy] = useState(false);
  const keyOn = hasGeminiKey();
  const before = (c.photos || []).find((p) => p?.dataUrl)?.dataUrl || '';
  const after = c.preview?.after || '';
  const info = TRADES[calc.trade] || TRADES.unclassified;
  const mset = materialSetFor(c, calc.trade);

  const run = async () => {
    if (!keyOn) {
      showToast('설정에서 Gemini API 키를 연결하면 비포→애프터 예상 사진이 생성됩니다');
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
        showToast(
          res.reason === 'no_key'
            ? '설정에서 Gemini API 키를 연결해 주세요'
            : `이미지를 만들지 못했습니다 (${res.reason}) — 잠시 뒤 다시 시도해 주세요`
        );
        return;
      }
      update({
        preview: {
          before,
          after: res.dataUrl,
          model: res.model,
          at: new Date().toISOString().slice(0, 10),
        },
      });
      showToast('완공 예상 이미지를 만들었습니다');
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
            손님이 올린 비포 사진으로, 같은 자리에서 마감만 바뀐 모습을 보여줍니다. 구조·창문·배치는 그대로 둡니다.
          </p>
        </div>
        <Pill tone={after ? 'ok' : keyOn ? 'info' : 'plain'}>{after ? '생성됨' : keyOn ? 'AI 연결됨' : 'AI 미연결'}</Pill>
      </div>

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
          <div className={cx('overflow-hidden rounded-xl ring-1', after ? 'bg-white ring-brand/40' : 'bg-slate-50 ring-slate-200')}>
            {after ? (
              <img src={after} alt="공사 후 예상" className="h-32 w-full object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center px-2 text-center text-2xs font-semibold text-ink-3">
                {keyOn ? '아래 버튼으로 예상 이미지를 만드세요' : '설정에서 Gemini API 키를 연결하면 생성됩니다'}
              </div>
            )}
          </div>
        </div>
      </div>

      {!keyOn ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-2xs font-semibold leading-4 text-ink-3">
          설정 › 🤖 AI 정밀 분석에 무료 Gemini API 키를 넣으면 비포→애프터 예상 사진이 생성됩니다. (코드에는 키를 저장하지 않습니다)
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2 no-print">
        <SmallButton variant={after ? 'white' : 'brand'} className="w-full" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? '만드는 중…' : after ? '다시 만들기' : '예상 이미지 만들기'}
        </SmallButton>
        {after ? (
          <a
            href={after}
            download={`${(c.title || 'site').replace(/[^\w가-힣-]+/g, '-')}-after.png`}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-ink-2"
          >
            이미지 저장
          </a>
        ) : (
          <SmallButton className="w-full" onClick={run} disabled={busy}>
            손님 보여주기용
          </SmallButton>
        )}
      </div>
      {after ? <p className="mt-1 text-2xs font-semibold text-ink-3 no-print">※ 실제 시공 결과와 다를 수 있습니다. 손님께 “예상 이미지”라고 먼저 말하세요.</p> : null}
    </Card>
  );
}
