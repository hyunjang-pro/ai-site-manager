import React, { useState } from 'react';
import { ArrowUpFromLine, ExternalLink, HardHat, Loader2, MapPin, Truck } from 'lucide-react';
import { BUFFER_OPTIONS, REGIONS } from '../lib/constants.js';
import { DEFAULT_RATES, RATE_FIELDS, cloneRates, getRate, mergeRates, setRate } from '../lib/rates.js';
import { resetState } from '../lib/storage.js';
import { GEMINI_KEY_URL, getGeminiKey, setGeminiKey, testGeminiKey } from '../lib/gemini.js';
import { getSupplier, saveSupplier } from '../lib/supplier.js';
import { BigButton, Details, Field, IconTile, Modal, Segmented, Select, SmallButton, TextInput, cx } from './ui.jsx';

const GROUP_ICON = {
  '인건비 (하루 일당)': HardHat,
  '폐기물 차량·장비': Truck,
  '사다리차·부대비용': ArrowUpFromLine,
  '최소 공사비': MapPin,
};

export default function SettingsModal({ open, onClose, state, setState, showToast }) {
  const [region, setRegion] = useState(state.settings.region || '안동');
  const [businessName, setBusinessName] = useState(state.settings.businessName || '');
  const [apiKey, setApiKey] = useState(state.settings.apiKey || getGeminiKey() || '');
  const [aiTest, setAiTest] = useState(null); // null | 'busy' | {ok, msg}
  const runAiTest = async () => {
    setAiTest('busy');
    const res = await testGeminiKey(apiKey);
    setAiTest(res.ok ? { ok: true, msg: `연결됨 · ${res.model}` } : { ok: false, msg: `실패 (${res.reason})` });
  };
  const [agencyFeeRate, setAgencyFeeRate] = useState(state.settings.agencyFeeRate ?? 10);
  const [supplier, setSupplier] = useState(() => getSupplier());
  const [rates, setRates] = useState(() => mergeRates(DEFAULT_RATES, state.settings.rates || {}));

  const save = () => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        region,
        businessName,
        apiKey: apiKey.trim(),
        useAi: !!apiKey.trim(),
        agencyFeeRate: Number(agencyFeeRate) || 10,
        rates,
      },
    }));
    setGeminiKey(apiKey.trim());
    saveSupplier(supplier);
    showToast(apiKey.trim() ? '설정을 저장했습니다 — AI 정밀 분석이 켜졌습니다' : '설정을 저장했습니다 (로컬 규칙 모드)');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설정"
      footer={
        <BigButton className="w-full" onClick={save}>
          저장하기
        </BigButton>
      }
    >
      {/* 🤖 AI 정밀 분석 (Gemini) */}
      <div className="rounded-2xl border-2 border-brand/30 bg-brand-soft/60 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-ink">🤖 AI 정밀 분석 (무료 Gemini API 키)</p>
            <p className="mt-0.5 text-xs font-semibold leading-4 text-ink-3">
              사진+글을 함께 읽어 공종·자재·인력·답사 체크를 뽑고, 비포→애프터 예상 사진도 만듭니다. 키가 없으면 내장 규칙으로 100% 동작합니다.
            </p>
          </div>
          <span className={cx('shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold', apiKey.trim() ? 'bg-brand text-white' : 'bg-white text-ink-3')}>
            {apiKey.trim() ? 'ON' : 'OFF'}
          </span>
        </div>
        <div className="mt-2">
          <Field label="Gemini API 키">
            <TextInput
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setAiTest(null);
              }}
              placeholder="AIza... (비워두면 로컬 규칙 모드)"
              autoComplete="off"
              aria-label="Gemini API 키"
            />
          </Field>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <SmallButton variant="white" onClick={runAiTest} disabled={!apiKey.trim() || aiTest === 'busy'} className="shrink-0">
            {aiTest === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {aiTest === 'busy' ? '확인 중…' : '연결 테스트'}
          </SmallButton>
          <a
            href={GEMINI_KEY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 text-xs font-bold text-brand ring-1 ring-brand/30"
          >
            키 발급 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {aiTest && aiTest !== 'busy' ? (
          <p className={cx('mt-1.5 text-2xs font-extrabold', aiTest.ok ? 'text-emerald-700' : 'text-rose-700')}>
            {aiTest.ok ? '✅ ' : '⚠ '}
            {aiTest.msg}
          </p>
        ) : null}
        <p className="mt-1.5 text-2xs font-semibold leading-4 text-ink-3">
          키는 이 기기 브라우저(localStorage)에만 저장됩니다. 코드·서버로 보내지 않습니다.
        </p>
      </div>

      <Field label="기본 지역" hint="새 현장을 만들 때 이 지역으로 시작합니다.">
        <Select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-2xl bg-slate-50 p-3.5">
        <p className="text-base font-extrabold text-ink">우리 업체 정보 (공급자)</p>
        <p className="mt-1 text-xs leading-5 text-ink-3">한 번 저장하면 모든 현장의 견적서·점포철거비 공사내역서·공사 안내문에 자동으로 들어갑니다.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="상호"><TextInput value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} aria-label="업체 상호" /></Field>
          <Field label="대표자"><TextInput value={supplier.owner} onChange={(e) => setSupplier({ ...supplier, owner: e.target.value })} aria-label="업체 대표자" /></Field>
          <Field label="사업자등록번호"><TextInput value={supplier.bizNo} onChange={(e) => setSupplier({ ...supplier, bizNo: e.target.value })} inputMode="numeric" aria-label="업체 사업자번호" /></Field>
          <Field label="연락처"><TextInput value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} inputMode="tel" aria-label="업체 연락처" /></Field>
          <Field label="주소" className="col-span-2"><TextInput value={supplier.address} onChange={(e) => setSupplier({ ...supplier, address: e.target.value })} aria-label="업체 주소" /></Field>
          <Field label="입금 계좌" className="col-span-2"><TextInput value={supplier.account || ''} onChange={(e) => setSupplier({ ...supplier, account: e.target.value })} placeholder="예) 농협 123-4567-8901 (예금주)" aria-label="업체 계좌" /></Field>
        </div>
      </div>

      <Field label="상호(사업장 이름)">
        <TextInput value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="예) ○○철거·인테리어" />
      </Field>

      <div className="rounded-2xl border-2 border-blue-900/10 bg-white p-3.5">
        <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">🛡️ 보수적 견적 보호</p>
        <p className="mt-1 text-xs leading-5 text-ink-3">
          원가에 예비비를 더해 <b className="text-ink-2">싸게 써서 손해 보는 일</b>을 막습니다. 6%면 300만원 현장에 18만원을 미리 얹는 셈입니다. 바꾸면 <b className="text-ink-2">앞으로 만드는 현장</b>부터 적용됩니다.
        </p>
        <div className="mt-2">
          <Segmented
            options={BUFFER_OPTIONS.map((v) => ({ value: v, label: v === 0 ? '끔 (0%)' : `${v}%` }))}
            value={getRate(rates, ['buffer'], 6)}
            onChange={(v) => setRates((prev) => setRate(prev, ['buffer'], v))}
          />
        </div>
      </div>

      {/* 우리 집 기본 단가표 */}
      <div className="rounded-2xl bg-slate-50 p-3.5">
        <p className="text-base font-extrabold text-ink">우리 집 기본 단가표</p>
        <p className="mt-1 text-xs leading-5 text-ink-3">
          여기 값을 바꾸면 <b className="text-ink-2">앞으로 새로 만드는 현장</b>부터 적용됩니다. 이미 만든 현장은 그때 단가 그대로 남습니다.
        </p>

        <div className="mt-3 space-y-3.5">
          {RATE_FIELDS.map((group) => {
            const Icon = GROUP_ICON[group.group] || HardHat;
            return (
              <div key={group.group}>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-2">
                  <Icon className="h-4 w-4 text-brand" strokeWidth={2.2} />
                  {group.group}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.fields.map((f) => (
                    <label key={f.path.join('.')} className="block rounded-xl bg-white px-2.5 py-2 ring-1 ring-slate-200/70">
                      <span className="mb-1 block text-2xs font-bold leading-4 text-ink-3">
                        {f.label}
                        <span className="ml-1 font-normal text-slate-400">{f.unit}</span>
                      </span>
                      <input
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        value={getRate(rates, f.path)}
                        onChange={(e) => setRates((prev) => setRate(prev, f.path, e.target.value))}
                        aria-label={f.label}
                        className="num w-full border-0 bg-transparent p-0 text-base font-extrabold text-ink outline-none focus:ring-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <SmallButton
          className="mt-3 w-full"
          onClick={() => {
            setRates(cloneRates(DEFAULT_RATES));
            showToast('단가표를 기본값으로 되돌렸습니다');
          }}
        >
          단가표 기본값으로
        </SmallButton>
      </div>

      <Field label="인력 소개비(알선료) %" hint="건설 일용은 구인자 부담 10%가 상한입니다. 새 현장에 적용됩니다.">
        <TextInput
          inputMode="decimal"
          value={agencyFeeRate}
          onChange={(e) => setAgencyFeeRate(e.target.value)}
          aria-label="인력 소개비"
        />
      </Field>
      {Number(agencyFeeRate) > 10 ? (
        <p className="text-xs font-bold text-rose-600">10%를 넘기면 직업안정법 위반 소지가 있습니다.</p>
      ) : null}

      <div className={cx('rounded-2xl border border-slate-200 p-4')}>
        <p className="text-base font-extrabold text-slate-800">예시 데이터로 되돌리기</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">지금 장부를 지우고 처음 예시 6건으로 돌아갑니다. 되돌릴 수 없습니다.</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('장부를 모두 지우고 예시 데이터로 되돌릴까요?')) {
              const fresh = resetState();
              setState(fresh);
              setRates(mergeRates(DEFAULT_RATES, fresh.settings.rates));
              showToast('예시 데이터로 되돌렸습니다');
              onClose();
            }
          }}
          className="mt-3 min-h-12 w-full rounded-xl border border-rose-200 bg-rose-50 text-base font-bold text-rose-700"
        >
          초기화하기
        </button>
      </div>

      <p className="text-center text-sm text-slate-400">AI 현장 매니저 · 경북 철거·인테리어 장부</p>
    </Modal>
  );
}
