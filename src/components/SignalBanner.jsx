import React from 'react';
import { cx } from './ui.jsx';

const STYLE = {
  green: { box: 'bg-emerald-50 ring-emerald-300', title: 'text-emerald-900', sub: 'text-emerald-800' },
  yellow: { box: 'bg-amber-50 ring-amber-300', title: 'text-amber-900', sub: 'text-amber-800' },
  red: { box: 'bg-rose-50 ring-rose-300', title: 'text-rose-900', sub: 'text-rose-800' },
};

// 빨·노·초 신호등 — 한눈에 '이 일을 잡을지' 보이게
export default function SignalBanner({ signal, caption }) {
  const s = STYLE[signal.level] || STYLE.yellow;
  return (
    <div className={cx('rounded-2xl px-4 py-3 ring-1', s.box)} role="status" aria-label={`판정: ${signal.title}`}>
      <p className={cx('flex items-start gap-2 text-[15px] font-black leading-6', s.title)}>
        <span aria-hidden className="text-lg leading-6">{signal.emoji}</span>
        <span>{signal.title}</span>
      </p>
      {signal.reasons?.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {signal.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className={cx('text-[12.5px] font-bold leading-5', s.sub)}>
              · {r}
            </li>
          ))}
        </ul>
      ) : null}
      {caption ? <p className={cx('mt-1 text-2xs font-semibold leading-4 opacity-80', s.sub)}>{caption}</p> : null}
    </div>
  );
}
