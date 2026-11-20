import React, { useState } from 'react';
import { ArrowUpFromLine, HardHat, MapPin, Truck } from 'lucide-react';
import { BUFFER_OPTIONS, REGIONS } from '../lib/constants.js';
import { DEFAULT_RATES, RATE_FIELDS, cloneRates, getRate, mergeRates, setRate } from '../lib/rates.js';
import { resetState } from '../lib/storage.js';
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
  const [apiKey, setApiKey] = useState(state.settings.apiKey || '');
  const [agencyFeeRate, setAgencyFeeRate] = useState(state.settings.agencyFeeRate ?? 10);
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
    showToast('설정을 저장했습니다');
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
      <Field label="기본 지역" hint="새 현장을 만들 때 이 지역으로 시작합니다.">
        <Select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>

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

      <Details label="AI 도움 받기 (선택)">
        <p className="text-sm leading-6 text-slate-600">
          구글 AI 키를 넣으면 문의 내용을 더 똑똑하게 읽습니다. 넣지 않아도 앱은 100% 동작합니다.
        </p>
        <div className="mt-2">
          <Field label="구글 AI 키">
            <TextInput
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="비워두면 내장 계산기만 사용"
              autoComplete="off"
            />
          </Field>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          키는 이 기기 브라우저에만 저장되고, 코드나 다른 곳으로 보내지 않습니다.
        </p>
      </Details>

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
