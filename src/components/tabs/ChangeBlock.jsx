import React, { useState } from 'react';
import { Camera, Copy, Loader2, Trash2, Wand2 } from 'lucide-react';
import { classifyChange } from '../../lib/parse.js';
import { ocrAnalyzeWithTimeout } from '../../lib/ocr.js';
import { fileToThumb, THUMB_PHOTO } from '../../lib/image.js';
import { copyText } from '../../lib/clipboard.js';
import { changeMessage } from '../../lib/docs.js';
import { BigButton, Details, Field, Pill, SectionCard, SmallButton, TextArea, TextInput } from '../ui.jsx';

// 시공 중 추가 공사 — 사진·사유·금액·일정 4가지를 남긴다.
export function ChangeBlock({ c, update, showToast, num = '4' }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null);
  const [reading, setReading] = useState(false);
  const logs = (Array.isArray(c.changeLogs) ? c.changeLogs : []).filter((l) => l.source !== 'quick' && l.source !== 'survey-auto');
  const parsed = draft || classifyChange(text);
  const ready = !!parsed && !!text.trim();

  const add = async (useDraft = false) => {
    let body = text.trim();
    if (!body && c.photos?.length) {
      setReading(true);
      try {
        const res = await ocrAnalyzeWithTimeout(c.photos.map((p) => p.dataUrl).filter(Boolean), () => setReading(true));
        if (res.isScenePhoto) {
          showToast('글자 없는 현장 사진입니다 — 추가 공사 내용을 한 줄 적어주세요');
          setReading(false);
          return;
        }
        body = res.text || '';
        setText(body);
      } catch (e) {
        showToast(e.message || '사진 글자를 읽지 못했습니다');
        setReading(false);
        return;
      } finally {
        setReading(false);
      }
    }
    const picked = useDraft && draft ? draft : classifyChange(body);
    if (!picked) return;
    const log = {
      id: `cl-${Date.now()}`,
      item: picked.item,
      reason: picked.reason || body,
      amount: Number(picked.amount) || 0,
      days: Number(picked.days) || 0,
      photo: !!c.photos?.length,
      agreed: false,
      at: new Date().toISOString().slice(0, 10),
      source: 'formal',
      type: picked.type || 'increase',
    };
    update({ changeLogs: [...(Array.isArray(c.changeLogs) ? c.changeLogs : []), log] });
    setText('');
    setDraft(null);
    showToast(`추가금 ${log.amount}만원을 기록했습니다 — 최종 견적에 더해집니다`);
  };

  return (
    <SectionCard
      num={num}
      title="추가금 기록 (시공 중)"
      subtitle="시공 중 생긴 추가 공사는 글 한 줄 + 사진만 넣으면 항목·사유·금액·일정을 앱이 잡습니다."
      status={<Pill tone={logs.some((l) => !l.agreed) ? 'warn' : logs.length ? 'ok' : 'plain'}>{logs.length}건</Pill>}
    >
      <div className="space-y-3">
        <TextArea
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDraft(null);
          }}
          placeholder="예) 철거 중 문틀 부식 확인해서 화장실 문틀 교체"
          aria-label="추가 공사 내용"
        />
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-ink-2 active:bg-slate-50">
          <Camera className="h-4 w-4" /> 현장 사진 붙이기 ({c.photos?.length || 0})
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="추가 공사 사진"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []).slice(0, 6 - (c.photos?.length || 0));
              const thumbs = await Promise.all(files.map((f) => fileToThumb(f, THUMB_PHOTO)));
              update({ photos: [...(c.photos || []), ...thumbs].slice(0, 6) });
              showToast(`사진 ${thumbs.length}장을 붙였습니다`);
              e.target.value = '';
            }}
          />
        </label>

        {ready ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-extrabold text-ink">{parsed.item}</p>
            <p className="mt-0.5 text-2xs font-semibold leading-4 text-ink-3">사유: {parsed.reason}</p>
            <p className="mt-1 text-sm font-extrabold text-rose-700">
              +{parsed.amount}만원{parsed.days ? ` · 일정 +${parsed.days}일` : ''}
            </p>
          </div>
        ) : null}

        <Details label="금액·일정 직접 고치기 (틀렸을 때만)">
          <div className="grid grid-cols-2 gap-2">
            <Field label="항목">
              <TextInput
                value={parsed?.item || ''}
                onChange={(e) => setDraft({ ...(parsed || {}), item: e.target.value })}
                placeholder="예) 문틀 교체"
              />
            </Field>
            <Field label="사유">
              <TextInput
                value={parsed?.reason || ''}
                onChange={(e) => setDraft({ ...(parsed || {}), reason: e.target.value })}
                placeholder="예) 부식 확인"
              />
            </Field>
            <Field label="금액 (만원)">
              <TextInput
                inputMode="numeric"
                value={parsed?.amount ?? ''}
                onChange={(e) => setDraft({ ...(parsed || {}), amount: e.target.value.replace(/[^\d.]/g, '') })}
                aria-label="추가금 금액"
              />
            </Field>
            <Field label="일정 (일)">
              <TextInput
                inputMode="numeric"
                value={parsed?.days ?? ''}
                onChange={(e) => setDraft({ ...(parsed || {}), days: e.target.value.replace(/[^\d.]/g, '') })}
                aria-label="추가금 일정"
              />
            </Field>
          </div>
        </Details>

        <BigButton className="w-full" disabled={(!text.trim() && !c.photos?.length) || reading} onClick={() => add(!!draft)}>
          {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          {reading ? '사진 읽는 중…' : '추가금 자동 계산해서 기록'}
        </BigButton>

        {logs.length ? (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
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
                        update({ changeLogs: (Array.isArray(c.changeLogs) ? c.changeLogs : []).filter((x) => x.id !== l.id) });
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
                      update({ changeLogs: (Array.isArray(c.changeLogs) ? c.changeLogs : []).map((x) => (x.id === l.id ? { ...x, agreed: !x.agreed } : x)) });
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
