import React, { useMemo, useState } from 'react';
import { Copy, Landmark, Printer, Send } from 'lucide-react';
import { TRADES } from '../../lib/constants.js';
import { buildQuote, contentCertDraft, dispatchMessage, estimateSms, neighborMessage, orderMessage, quoteText, subsidyNotice, tileWalkNotice, waterproofNotice } from '../../lib/docs.js';
import { subsidyInfo, SUBSIDY_DOCS } from '../../lib/subsidy.js';
import { BigButton, Card, Details, Pill, SectionCard, SmallButton, Toggle, cx } from '../ui.jsx';
import { copyText } from './EstimateTab.jsx';

const LETTERS = [
  { id: 'estimate', label: '견적 안내 문자', build: (c, calc, design, completedCases, useStrength) => estimateSms(c, calc, completedCases, useStrength) },
  { id: 'neighbor', label: '이웃 인사 문자', build: (c) => neighborMessage(c) },
  { id: 'dispatch', label: '기공 배차 문자', build: (c, calc) => dispatchMessage(c, calc) },
  { id: 'order', label: '자재 발주 문자', build: (c, calc, design) => orderMessage(c, calc, design) },
  { id: 'water', label: '방수 물 채움 안내', build: (c) => waterproofNotice(c) },
  { id: 'walk', label: '타일·줄눈 보행 금지', build: () => tileWalkNotice() },
  { id: 'cert', label: '미수금 내용증명 초안', build: (c, calc) => contentCertDraft(c, calc) },
  { id: 'subsidy', label: '점포철거비 지원금 안내', build: (c) => subsidyNotice(c) },
];

export default function DocTab({ c, calc, design, waste, showToast, update, completedCases = [] }) {
  const doc = useMemo(() => buildQuote(c, calc, design, waste), [c, calc, design, waste]);
  const text = useMemo(() => quoteText(doc, calc), [doc, calc]);
  const [letter, setLetter] = useState(null);

  const info = TRADES[calc.trade] || TRADES.unclassified;
  const activeLetter = LETTERS.find((l) => l.id === letter);
  const useStrength = c.smsStrength !== false;
  const letterText = activeLetter
    ? activeLetter.build(c, calc, design, completedCases, useStrength)
    : '';

  return (
    <div className="space-y-4">
      <Card className="p-4 no-print">
        <p className="text-base font-bold text-slate-600">손님에게 보낼 견적서</p>
        <div className="mt-2">
          <Pill tone="ok">{info.short} 자재만 표시</Pill>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {info.short} 공사에 맞는 자재·제외사항·특약만 들어갑니다. 다른 공사 자재는 나오지 않습니다.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BigButton variant="primary" className="whitespace-nowrap text-base" onClick={() => copyText(text, showToast, '견적서를 복사했습니다')}>
            <Copy className="h-5 w-5" /> 복사
          </BigButton>
          <BigButton variant="ghost" className="whitespace-nowrap text-base" onClick={() => window.print()}>
            <Printer className="h-5 w-5" /> 인쇄·PDF
          </BigButton>
        </div>
      </Card>

      {/* 견적서 미리보기 */}
      <Card className="print-area p-5">
        <div className="border-b-2 border-slate-900 pb-3">
          <h2 className="text-2xl font-extrabold text-slate-900">{doc.title}</h2>
          <p className="mt-1 text-base text-slate-600">
            {doc.client} · {doc.site}
          </p>
          <p className="text-sm text-slate-500">
            {doc.size} · 작성일 {doc.date}
          </p>
        </div>

        <p className="mt-3 text-base leading-7 text-slate-800">{calc.targetSummary}</p>

        {doc.materialLines.length ? (
          <div className="mt-4">
            <p className="text-base font-extrabold text-ink">자재</p>
            <ul className="mt-1 space-y-1">
              {doc.materialLines.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 text-base">
                  <span className="text-ink-2">
                    {m.name}
                    <span className="block text-sm text-ink-3">{m.detail}</span>
                  </span>
                  <span className="num shrink-0 font-bold text-ink">{Math.round(m.amount).toLocaleString('ko-KR')}만</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="text-base font-extrabold text-ink">공정·비용</p>
          <ul className="mt-1 space-y-1">
            {doc.otherLines.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 text-base">
                <span className="text-slate-700">
                  {m.name}
                  {m.detail ? <span className="block text-sm text-slate-500">{m.detail}</span> : null}
                </span>
                <span className={cx('shrink-0 font-bold tabular-nums', m.amount < 0 ? 'text-emerald-700' : 'text-slate-800')}>
                  {Math.round(m.amount).toLocaleString('ko-KR')}만
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-100 p-4">
          <div className="flex justify-between text-base">
            <span>공급가</span>
            <span className="font-bold tabular-nums">{Math.round(doc.subtotal).toLocaleString('ko-KR')}만원</span>
          </div>
          {doc.vat ? (
            <div className="mt-1 flex justify-between text-base">
              <span>부가세(10%)</span>
              <span className="font-bold tabular-nums">{Math.round(doc.vat).toLocaleString('ko-KR')}만원</span>
            </div>
          ) : null}
          <div className="mt-2 flex items-end justify-between border-t border-slate-200 pt-2">
            <span className="text-base font-extrabold">합계</span>
            <span className="text-3xl font-extrabold tabular-nums text-slate-900">
              {Math.round(doc.total).toLocaleString('ko-KR')}
              <span className="ml-1 text-lg">만원</span>
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{doc.paymentText}</p>
          <p className="text-sm text-slate-600">{c.includeVat ? '부가세 포함' : '부가세 별도'}</p>
        </div>

        {doc.changeLines.length ? (
          <div className="mt-4">
            <p className="text-base font-extrabold text-slate-900">현장 변동 내역</p>
            <ul className="mt-1 space-y-1">
              {doc.changeLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2 text-base">
                  <span className="text-slate-700">
                    {l.at ? `${l.at} · ` : ''}
                    {l.item}
                  </span>
                  <span className={cx('shrink-0 font-bold tabular-nums', l.amount > 0 ? 'text-rose-700' : 'text-emerald-700')}>
                    {l.amount > 0 ? '+' : ''}
                    {l.amount}만
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-slate-600">
              최초 견적 {Math.round(doc.basePrice).toLocaleString('ko-KR')}만원 → 현재 {Math.round(doc.subtotal).toLocaleString('ko-KR')}만원
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="text-base font-extrabold text-slate-900">제외 사항</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-slate-700">
            {doc.excluded.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-base font-extrabold text-slate-900">특약</p>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-slate-700">
            {doc.clauses.map((cl, i) => (
              <li key={i}>{cl}</li>
            ))}
          </ol>
        </div>

        {doc.notes.length ? (
          <div className="mt-4">
            <p className="text-base font-extrabold text-slate-900">현장 안내</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              {doc.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {doc.asbestos.suspected ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            <p className="font-extrabold">석면 안내</p>
            <p>{doc.asbestos.summary}</p>
          </div>
        ) : null}
      </Card>

      {/* 상황별 문자 */}
      <SectionCard num="2" title="상황별 문자" subtitle="필요한 것만 골라 복사하세요." className="no-print">
        <Toggle
          checked={useStrength}
          onChange={(v) => update && update({ smsStrength: v })}
          label="인력사무소 직영 강점 + 완료 사례 1줄"
          hint="견적 안내 문자에만 들어갑니다 (손님 문서·견적서는 그대로)"
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-2">
          {LETTERS.map((l, idx) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLetter(letter === l.id ? null : l.id)}
              className={cx(
                'min-h-14 rounded-xl border px-2 text-sm font-bold',
                LETTERS.length % 2 === 1 && idx === LETTERS.length - 1 ? 'col-span-2' : '',
                letter === l.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        {activeLetter ? (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">{letterText}</pre>
            <BigButton
              variant="amber"
              className="mt-3 w-full"
              onClick={() => copyText(letterText, showToast, `${activeLetter.label}를 복사했습니다`)}
            >
              <Copy className="h-5 w-5" /> 복사하기
            </BigButton>
            {activeLetter.id === 'estimate' ? (
              <p className="mt-1.5 text-2xs font-semibold text-ink-3">
                {useStrength ? '강점·완료 사례 1줄 포함' : '강점 줄 없이 기본 견적 안내만'}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">문자를 고르면 내용이 나옵니다.</p>
        )}

        <Details label="이 견적서를 보낼 때 확인할 것" className="mt-3">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>금액이 맞는지, 부가세 포함/별도를 확인했나요?</li>
            <li>제외 사항(폐기물·자재 운반·석면)을 고객이 읽었는지 확인하세요.</li>
            <li>추가금은 사진·사유·금액·일정 4가지를 문자로 남기세요.</li>
            <li>잔금은 20% 이상, 준공 검수 후 받는 조건으로 두세요.</li>
          </ul>
        </Details>
      </SectionCard>

      <div className="no-print">
        <p className="text-center text-sm text-slate-500">
          인쇄·PDF로 저장하면 그대로 계약서 첨부 자료로 쓸 수 있습니다.
        </p>
      </div>

      {info.id === 'demolition' ? <SubsidyBlock c={c} showToast={showToast} /> : null}
    </div>
  );
}

function SubsidyBlock({ c, showToast }) {
  const info = subsidyInfo(c);
  return (
    <SectionCard
      num="3"
      title="손님이 받을 수 있는 지원금"
      subtitle="폐업 점포철거비 — 우리 견적과 별개로 손님이 공단에서 돌려받는 돈입니다."
      className="no-print"
      status={<Pill tone="info">최대 600만</Pill>}
    >
      <div className="rounded-xl bg-brand-soft px-3 py-3">
        <p className="text-2xs font-bold text-brand">이 현장 예상 한도</p>
        <p className="num mt-0.5 text-[24px] font-extrabold leading-7 text-brand-strong">
          {Math.round(info.limit).toLocaleString('ko-KR')}
          <span className="ml-0.5 text-sm font-bold">만원</span>
        </p>
        <p className="mt-0.5 text-2xs text-brand">
          전용면적 {info.pyung ? `${info.pyung}평 × ` : ''}평당 20만원 · 부가세 제외
        </p>
      </div>

      <p className="mt-2.5 text-xs leading-5 text-ink-2">
        조건: 사업 60일 이상 · 유상 임차 상가 · 사업자등록 업체 철거. 서류는{' '}
        {SUBSIDY_DOCS.map((d) => d.label).join(', ')}입니다.
      </p>

      <button
        type="button"
        onClick={() => copyText(subsidyNotice(c), showToast, '지원금 안내 문자를 복사했습니다')}
        className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-bold text-white shadow-brand active:bg-brand-strong"
      >
        <Copy className="h-4 w-4" /> 지원금 안내 문자 복사
      </button>
    </SectionCard>
  );
}
