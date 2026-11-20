import React from 'react';
import { WASTE_VEHICLES, wasteVehicle } from '../lib/waste.js';
import { cx } from './ui.jsx';

// 폐기물 차량 1탭 전환 — 숨고 '생활폐기물 한차'는 1톤 1차가 기본(2.5톤 아님).
export default function WasteVehicleSwitch({ c, update, showToast, className = '' }) {
  const current = wasteVehicle(c);
  return (
    <div className={cx('rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-extrabold text-amber-900">폐기물 차량 (1탭으로 바꾸기)</p>
        <span className="rounded-lg bg-white px-2 py-0.5 text-2xs font-extrabold text-amber-800">
          {current.tons}톤
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="폐기물 차량 선택">
        {WASTE_VEHICLES.map((v) => {
          const on = current.id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                update({ wasteVehicle: v.id, sizeValue: String(v.tons), sizeUnit: '톤' });
                if (showToast) showToast(`${v.label} 기준으로 다시 계산했습니다`);
              }}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center rounded-xl px-1 text-[12.5px] font-extrabold leading-4 transition',
                on ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-amber-900 ring-1 ring-amber-200'
              )}
            >
              <span>{v.label}</span>
              <span className={cx('num text-[10.5px] font-bold', on ? 'text-amber-50' : 'text-amber-700')}>
                약 {Math.round(Number(v.rate) || 0)}만
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-2xs font-semibold leading-4 text-amber-800">{current.note}</p>
    </div>
  );
}
