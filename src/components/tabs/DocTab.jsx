import React, { useMemo, useState } from 'react';
import { Copy, Landmark, Printer, Send } from 'lucide-react';
import { TRADES, hasScope, workTypeLabel } from '../../lib/constants.js';
import { tradeShortOf } from '../../lib/docs.js';
import { buildQuote, buildSubsidySheet, contentCertDraft, constructionNotice, constructionNoticeText, dispatchMessage, estimateSms, neighborMessage, quoteText, subsidyNotice, subsidySheetText, tileWalkNotice, waterproofNotice } from '../../lib/docs.js';
import { subsidyInfo, SUBSIDY_DOCS } from '../../lib/subsidy.js';
import { BigButton, Card, Details, Field, Pill, SectionCard, SmallButton, TextInput, Toggle, cx } from '../ui.jsx';
import { copyText } from '../../lib/clipboard.js';
import AfterPreview, { PREVIEW_TRADES } from '../AfterPreview.jsx';
import { getSupplier, saveSupplier } from '../../lib/supplier.js';

const LETTERS = [
  { id: 'estimate', label: '견적 안내 문자', build: (c, calc, design, completedCases, useStrength) => estimateSms(c, calc, completedCases, useStrength) },
  { id: 'neighbor', label: '이웃 인사 문자', build: (c) => neighborMessage(c) },
  { id: 'dispatch', label: '출근·현장 안내 문자', build: (c, calc) => dispatchMessage(c, calc) },
  { id: 'water', label: '방수 물 채움 안내', build: (c) => waterproofNotice(c) },
  { id: 'walk', label: '타일·줄눈 보행 금지', build: () => tileWalkNotice() },
  { id: 'cert', label: '미수금 내용증명 초안', build: (c, calc) => contentCertDraft(c, calc) },
  { id: 'subsidy', label: '점포철거비 지원금 안내', build: (c) => subsidyNotice(c) },
  { id: 'notice', label: '공사 안내문 (엘베·현관 부착)', build: (c, calc) => constructionNoticeText(c, calc) },
];

export default function DocTab({ c, calc, design, waste, showToast, update, completedCases = [], docView, setDocView }) {
  const [supplierTick, setSupplierTick] = useState(0);
  const doc = useMemo(() => buildQuote(c, calc, design, waste), [c, calc, design, waste, supplierTick]);
  const text = useMemo(() => quoteText(doc, calc), [doc, calc]);
  const [letter, setLetter] = useState(null);
  const [localView, setLocalView] = useState('quote');
  const view = docView || localView;
  const changeView = (v) => (setDocView ? setDocView(v) : setLocalView(v));
  const sheet = useMemo(() => buildSubsidySheet(c, calc), [c, calc, supplierTick]);
  const notice = useMemo(() => constructionNotice(c, calc), [c, calc]);
  const noticeTextOut = useMemo(() => constructionNoticeText(c, calc), [c, calc]);
  // 이 현장에 실제로 있는 공정의 문서만 보여준다 (철거·정지에 방수·타일 안내가 붙으면 안 된다)
  const bathJob = hasScope(c, 'bathroom');
  const storeJob = subsidyInfo(c).storeish;
  const letters = LETTERS.filter((l) => (l.id === 'water' || l.id === 'walk' ? bathJob : l.id === 'subsidy' ? storeJob : true));
  const views = [
    { id: 'quote', label: '견적서' },
    ...(storeJob ? [{ id: 'subsidy', label: '지원금 내역서' }] : []),
    { id: 'notice', label: '공사 안내문' },
  ];
  const activeView = view === 'subsidy' && !storeJob ? 'quote' : view;
  const bodyText = activeView === 'quote' ? text : activeView === 'subsidy' ? subsidySheetText(sheet) : noticeTextOut;

  const info = TRADES[calc.trade] || TRADES.unclassified;
  const activeLetter = LETTERS.find((l) => l.id === letter);
  const useStrength = c.smsStrength !== false;
  const letterText = activeLetter
    ? activeLetter.build(c, calc, design, completedCases, useStrength)
    : '';

  return (
    <div className="space-y-4">
      <Card className="p-4 no-print">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => changeView(v.id)}
              className={cx('min-h-10 rounded-lg px-1 text-[12.5px] font-extrabold', activeView === v.id ? 'bg-white text-ink shadow-card' : 'text-ink-3')}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-base font-bold text-slate-600">
          {activeView === 'quote' ? '손님에게 보낼 견적서' : activeView === 'subsidy' ? '점포철거비 지원금 제출용 공사내역서' : '엘리베이터·현관에 붙이는 공사 안내문'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone="ok">{(c.bid && workTypeLabel(c.bid.workTypes)) || tradeShortOf(c, calc)} 자재만 표시</Pill>
          <Pill tone="info">원가·마진 숨김</Pill>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          각 공정 금액은 고객 청구 단가로만 나뉘어 있고 합계는 최종 견적가와 같습니다. 원가·남는 돈·일당은 문서에 나오지 않습니다.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BigButton variant="primary" className="whitespace-nowrap text-base" onClick={() => copyText(bodyText, showToast, activeView === 'notice' ? '공사 안내문을 복사했습니다' : '문서를 복사했습니다')}>
            <Copy className="h-5 w-5" /> 복사
          </BigButton>
          <BigButton variant="ghost" className="whitespace-nowrap text-base" onClick={() => window.print()}>
            <Printer className="h-5 w-5" /> 인쇄·PDF
          </BigButton>
        </div>
      </Card>

      {/* 견적서 미리보기 */}
      {activeView === 'notice' ? (
        <NoticeSheet notice={notice} showToast={showToast} text={noticeTextOut} />
      ) : activeView === 'quote' ? (
      <Card className="print-area p-5">
        <div className="border-b-2 border-slate-900 pb-3">
          <h2 className="text-2xl font-extrabold text-slate-900">{doc.title}</h2>
          <p className="mt-1 text-base text-slate-600">
            {doc.client} · {doc.site}
          </p>
          <p className="text-sm text-slate-500">
            {doc.size} · 작성일 {doc.date}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] leading-5 text-slate-600">
            <p>견적번호 <b className="font-bold text-slate-800">{doc.quoteNo}</b></p>
            <p>유효기간 {doc.validUntil}까지</p>
            <p className="col-span-2">공사기간 {doc.periodText}</p>
          </div>
        </div>

        <p className="mt-3 text-base leading-7 text-slate-800">{doc.summary}</p>

        {doc.scopeLines?.length ? (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-sm font-extrabold text-ink">포함 공정</p>
            <ul className="mt-1 space-y-0.5">
              {doc.scopeLines.map((s) => (
                <li key={s.key} className="text-sm leading-6 text-slate-700">
                  · <b className="font-bold text-slate-800">{s.name}</b> — {s.desc}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="text-base font-extrabold text-ink">공사 내역 (재료비 · 노무비 · 경비)</p>
          <ul className="mt-1 space-y-1.5" data-testid="quote-lines">
            {doc.lines.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 text-base" data-quote-line data-amount={m.amount}>
                <span className="min-w-0 text-slate-700">
                  {m.name}
                  {m.desc ? <span className="block text-sm text-slate-500">{m.desc}</span> : null}
                  {m.qty && (m.qty > 1 || m.unit === '대') ? (
                    <span className="mt-0.5 block text-2xs text-slate-500">
                      수량 {m.qty}
                      {m.unit || ''} · 단가 {Number(m.unitPrice).toLocaleString('ko-KR')}만원
                    </span>
                  ) : null}
                </span>
                <span className="num shrink-0 font-bold tabular-nums text-slate-800">
                  {Math.round(m.amount).toLocaleString('ko-KR')}만
                </span>
              </li>
            ))}
          </ul>
        </div>

        {doc.materialSpecs.length ? (
          <div className="mt-4">
            <p className="text-base font-extrabold text-ink">사용 자재</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-6 text-slate-700">
              {doc.materialSpecs.map((sp, i) => (
                <li key={i}>{sp}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl bg-slate-100 p-4">
          <div className="flex justify-between text-base">
            <span>공급가</span>
            <span className="font-bold tabular-nums" data-testid="quote-subtotal" data-amount={Math.round(doc.subtotal)}>
              {Math.round(doc.subtotal).toLocaleString('ko-KR')}만원
            </span>
          </div>
          {doc.vat ? (
            <div className="mt-1 flex justify-between text-base">
              <span>부가세(10%)</span>
              <span className="font-bold tabular-nums">{Math.round(doc.vat).toLocaleString('ko-KR')}만원</span>
            </div>
          ) : null}
          <div className="mt-2 flex items-end justify-between border-t border-slate-200 pt-2">
            <span className="text-base font-extrabold">
              합계
              <span className="ml-1.5 align-middle text-[11px] font-bold text-slate-500">{c.includeVat ? '부가세 포함' : '부가세 별도'}</span>
            </span>
            <span className="text-3xl font-extrabold tabular-nums text-slate-900" data-testid="quote-total" data-amount={Math.round(doc.total)}>
              {Math.round(doc.total).toLocaleString('ko-KR')}
              <span className="ml-1 text-lg">만원</span>
            </span>
          </div>
          <div className="mt-2 space-y-1 rounded-xl bg-white px-3 py-2">
            {doc.paymentPlan.deposit > 0 ? (
              <div className="flex justify-between text-sm font-bold text-slate-700">
                <span>계약금 {doc.paymentPlan.deposit}%</span>
                <span className="num">{Math.round(doc.payments.deposit.amount).toLocaleString('ko-KR')}만원</span>
              </div>
            ) : (
              <p className="text-sm font-bold text-slate-700">선금 없음 — 완료 후 전액 {Math.round(doc.payments.balance.amount).toLocaleString('ko-KR')}만원 수금</p>
            )}
            {doc.paymentPlan.mid > 0 ? (
              <div className="flex justify-between text-sm font-bold text-slate-700">
                <span>중도금 {doc.paymentPlan.mid}%</span>
                <span className="num">{Math.round(doc.payments.mid.amount).toLocaleString('ko-KR')}만원</span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm font-bold text-slate-700">
              <span>잔금 {doc.paymentPlan.balance}% (준공 검수 후)</span>
              <span className="num">{Math.round(doc.payments.balance.amount).toLocaleString('ko-KR')}만원</span>
            </div>
          </div>
        </div>

        {doc.changeLines.length ? (
          <div className="mt-4">
            <p className="text-base font-extrabold text-slate-900">현장 변동 반영 내역</p>
            <ul className="mt-1 space-y-1">
              {doc.changeLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2 text-base">
                  <span className="text-slate-700">
                    {l.at ? `${l.at} · ` : ''}
                    {l.item}
                  </span>
                  {doc.calledPrice === null || doc.calledPrice === undefined ? (
                    <span className={cx('shrink-0 font-bold tabular-nums', l.amount > 0 ? 'text-rose-700' : 'text-emerald-700')}>
                      {l.amount > 0 ? '+' : ''}
                      {l.amount}만
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-slate-600">
              {doc.calledPrice === null || doc.calledPrice === undefined
                ? `최초 견적 ${Math.round(doc.basePrice).toLocaleString('ko-KR')}만원 → 현재 ${Math.round(doc.subtotal).toLocaleString('ko-KR')}만원`
                : '답사 후 현장 변동(추가·감소)은 위 공사 내역 금액에 반영되어 있습니다.'}
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

        {doc.supplier?.name ? (
          <div className="mt-5 border-t border-slate-300 pt-3 text-[12px] leading-5 text-slate-700">
            <p className="font-extrabold text-slate-900">{doc.supplier.name}{doc.supplier.owner ? ` · 대표 ${doc.supplier.owner}` : ''}</p>
            {doc.supplier.bizNo ? <p>사업자등록번호 {doc.supplier.bizNo}</p> : null}
            {doc.supplier.phone ? <p>연락처 {doc.supplier.phone}</p> : null}
            {doc.supplier.address ? <p>{doc.supplier.address}</p> : null}
            {doc.supplier.account ? <p>입금 계좌 {doc.supplier.account}</p> : null}
          </div>
        ) : null}

        {doc.asbestos.suspected ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            <p className="font-extrabold">석면 안내</p>
            <p>{doc.asbestos.summary}</p>
          </div>
        ) : null}
      </Card>
      ) : (
        <div className="space-y-3">
          <SubsidyInfoForm c={c} update={update} showToast={showToast} onSaved={() => setSupplierTick((t) => t + 1)} />
          <SubsidySheet sheet={sheet} showToast={showToast} />
        </div>
      )}

      {activeView === 'quote' && PREVIEW_TRADES.includes(calc.trade) ? (
        <AfterPreview c={c} update={update} calc={calc} design={design} showToast={showToast} title="AI 완공 예상 (손님께 함께 보여주기)" />
      ) : null}

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
          {letters.map((l, idx) => (
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

function NoticeSheet({ notice, showToast, text }) {
  return (
    <div className="space-y-2">
      <Card className="print-area p-6">
        <div className="border-b-2 border-slate-900 pb-4 text-center">
          <h2 className="text-[26px] font-black tracking-[0.3em] text-slate-900">{notice.title}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">공사 기간 동안 이웃 여러분의 양해를 구합니다</p>
        </div>

        <table className="mt-4 w-full border-collapse text-[13px]">
          <tbody>
            {[
              ['공사 장소', notice.site],
              ['공사 기간', notice.period],
              ['공사 시간', notice.hours],
              ['공사 내용', notice.scope],
              ['시공', notice.company],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-slate-200">
                <th className="w-24 bg-slate-50 px-2 py-2 text-left font-extrabold text-slate-700">{k}</th>
                <td className="px-2 py-2 leading-5 text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5">
          <p className="text-sm font-extrabold text-slate-900">이웃 여러분께</p>
          <ul className="mt-1.5 space-y-2 text-[13px] leading-6 text-slate-700">
            {notice.lines.map((l, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-xl border border-slate-300 px-4 py-3 text-center">
          <p className="text-xs font-bold text-slate-500">불편 사항·문의</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">{notice.contact}</p>
        </div>
        <p className="mt-4 text-center text-2xs font-semibold text-slate-500">
          A4 한 장으로 인쇄해 엘리베이터 안쪽·현관에 붙여 주세요.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2 no-print">
        <SmallButton onClick={() => copyText(text, showToast, '공사 안내문을 복사했습니다')}>
          <Copy className="h-4 w-4" /> 안내문 글 복사
        </SmallButton>
        <SmallButton variant="dark" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> 인쇄·PDF
        </SmallButton>
      </div>
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


function SubsidySheet({ sheet, showToast }) {
  return (
    <div className="space-y-2">
      <Card className="print-area p-5">
        <div className="border-b-2 border-slate-900 pb-3">
          <h2 className="text-xl font-extrabold text-slate-900">{sheet.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{sheet.workName}</p>
          <p className="text-sm text-slate-500">
            {sheet.site} · 공사기간 {sheet.period}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-extrabold text-ink">신청인 (공급받는 자)</p>
            <p className="mt-1 leading-5 text-ink-2">상호(점포명): {sheet.applicant.shopName}</p>
            <p className="leading-5 text-ink-2">대표자: {sheet.applicant.owner || '(서명)'}</p>
            <p className="leading-5 text-ink-2">사업자등록번호: {sheet.applicant.bizNo || '(기재)'}</p>
            <p className="leading-5 text-ink-2">폐업일: {sheet.applicant.closeDate || '(기재)'}</p>
            <p className="leading-5 text-ink-2">소재지: {sheet.applicant.address || '(기재)'}</p>
            <p className="leading-5 text-ink-2">전용면적: {sheet.applicant.areaSqm}㎡</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-extrabold text-ink">공급자 (시공업체)</p>
            <p className="mt-1 leading-5 text-ink-2">상호: {sheet.supplier.name}</p>
            <p className="leading-5 text-ink-2">대표자: {sheet.supplier.owner || '(서명·직인)'}</p>
            <p className="leading-5 text-ink-2">사업자등록번호: {sheet.supplier.bizNo || '(기재)'}</p>
            <p className="leading-5 text-ink-2">연락처: {sheet.supplier.phone || '(기재)'}</p>
            <p className="leading-5 text-ink-2">주소: {sheet.supplier.address || '(기재)'}</p>
          </div>
        </div>

        <div className="mt-3">
          <table className="w-full table-fixed border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-ink-2">
                <th className="w-7 border border-slate-200 px-1 py-1">No</th>
                <th className="border border-slate-200 px-1 py-1 text-left">품명 / 규격</th>
                <th className="w-12 border border-slate-200 px-1 py-1">수량</th>
                <th className="w-16 border border-slate-200 px-1 py-1 text-right">단가</th>
                <th className="w-20 border border-slate-200 px-1 py-1 text-right">공급가액</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.no}>
                  <td className="border border-slate-200 px-1 py-1 text-center">{r.no}</td>
                  <td className="border border-slate-200 px-1 py-1">
                    <span className="block font-bold text-ink">{r.name}</span>
                    <span className="block text-[9px] leading-3 text-ink-3">규격: {r.spec || '-'}</span>
                  </td>
                  <td className="whitespace-nowrap border border-slate-200 px-1 py-1 text-center tabular-nums">
                    {r.qty}
                    {r.unit}
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-right tabular-nums">{r.unitPrice.toLocaleString('ko-KR')}</td>
                  <td className="border border-slate-200 px-1 py-1 text-right font-bold tabular-nums">{r.supply.toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1 rounded-xl bg-slate-100 p-3 text-sm">
          <div className="flex justify-between">
            <span>공급가액</span>
            <span className="num font-bold">{sheet.totals.supply.toLocaleString('ko-KR')}원</span>
          </div>
          <div className="flex justify-between">
            <span>부가세(10%)</span>
            <span className="num font-bold">{sheet.totals.vat.toLocaleString('ko-KR')}원</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1 text-base font-extrabold">
            <span>총합계</span>
            <span className="num">{sheet.totals.total.toLocaleString('ko-KR')}원</span>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-5 text-slate-600">{sheet.note}</p>

        <div className="mt-3 rounded-xl border border-dashed border-slate-400 p-3">
          <p className="text-xs font-extrabold text-ink">첨부 사진</p>
          {sheet.photos.map((p, i) => (
            <p key={i} className="mt-0.5 text-[11px] leading-5 text-ink-2">□ {p}</p>
          ))}
        </div>

        <p className="mt-4 border-t border-slate-300 pt-2 text-center text-[11px] font-bold text-slate-700">{sheet.signNote}</p>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>작성일 {c0(new Date())}</span>
          <span>{sheet.supplier.name} (인)</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 no-print">
        <SmallButton onClick={() => copyText(subsidySheetText(sheet), showToast, '공사내역서를 복사했습니다')}>
          <Copy className="h-4 w-4" /> 공사내역서 복사
        </SmallButton>
        <SmallButton variant="dark" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> 인쇄·PDF
        </SmallButton>
      </div>
      <p className="text-2xs font-semibold leading-4 text-ink-3 no-print">
        공단은 지정 서식을 두지 않습니다. 위 항목(신청인·시공업체 정보, 품명·수량·단가·공급가액, 전후 사진, 직인)이 확인되면 됩니다. 제출 전 실제 사업자번호·폐업일을 채우고 업체 직인을 찍으세요.
      </p>
    </div>
  );
}

function c0(d) {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}


// 지원금 서류 — 신청인/공급자 정보를 인쇄 전에 채운다
function SubsidyInfoForm({ c, update, showToast, onSaved }) {
  const [sup, setSup] = useState(() => getSupplier());
  const ap = c.subsidyApplicant || {};
  const setAp = (k, v) => update({ subsidyApplicant: { ...(c.subsidyApplicant || {}), [k]: v } });
  return (
    <div className="space-y-3 no-print">
      <Card className="p-4">
        <p className="text-base font-extrabold text-ink">신청인 (공급받는 자) 정보</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-3">여기에 넣으면 아래 공사내역서와 인쇄·PDF에 그대로 찍힙니다.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="상호(점포명)"><TextInput value={ap.shopName || ''} onChange={(e) => setAp('shopName', e.target.value)} aria-label="점포명" /></Field>
          <Field label="대표자"><TextInput value={ap.owner || ''} onChange={(e) => setAp('owner', e.target.value)} aria-label="신청인 대표자" /></Field>
          <Field label="사업자등록번호"><TextInput value={ap.bizNo || ''} onChange={(e) => setAp('bizNo', e.target.value)} inputMode="numeric" aria-label="신청인 사업자번호" /></Field>
          <Field label="폐업일"><TextInput type="date" value={ap.closeDate || ''} onChange={(e) => setAp('closeDate', e.target.value)} aria-label="폐업일" /></Field>
          <Field label="소재지"><TextInput value={ap.address || ''} onChange={(e) => setAp('address', e.target.value)} aria-label="신청인 소재지" /></Field>
          <Field label="전용면적 (㎡)"><TextInput value={ap.areaSqm || ''} onChange={(e) => setAp('areaSqm', e.target.value)} inputMode="decimal" aria-label="전용면적" /></Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-base font-extrabold text-ink">공급자 (우리 시공업체) 정보</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-3">한 번 저장하면 다음 현장 서류에 자동으로 채워집니다.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="상호"><TextInput value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value })} aria-label="공급자 상호" /></Field>
          <Field label="대표자"><TextInput value={sup.owner} onChange={(e) => setSup({ ...sup, owner: e.target.value })} aria-label="공급자 대표자" /></Field>
          <Field label="사업자등록번호"><TextInput value={sup.bizNo} onChange={(e) => setSup({ ...sup, bizNo: e.target.value })} aria-label="공급자 사업자번호" /></Field>
          <Field label="연락처"><TextInput value={sup.phone} onChange={(e) => setSup({ ...sup, phone: e.target.value })} inputMode="tel" aria-label="공급자 연락처" /></Field>
          <Field label="주소" className="col-span-2"><TextInput value={sup.address} onChange={(e) => setSup({ ...sup, address: e.target.value })} aria-label="공급자 주소" /></Field>
          <Field label="입금 계좌" className="col-span-2"><TextInput value={sup.account || ''} onChange={(e) => setSup({ ...sup, account: e.target.value })} placeholder="예) 농협 123-4567-8901 (예금주)" aria-label="공급자 계좌" /></Field>
        </div>
        <SmallButton
          variant="brand"
          className="mt-2 w-full"
          onClick={() => {
            saveSupplier(sup);
            if (onSaved) onSaved();
            showToast('우리 업체 정보로 저장했습니다 — 다음 현장부터 자동으로 채워집니다');
          }}
        >
          우리 업체 정보로 저장
        </SmallButton>
      </Card>
    </div>
  );
}
