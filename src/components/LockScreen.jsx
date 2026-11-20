import React, { useEffect, useState } from 'react';
import { Delete, HardHat, Lock } from 'lucide-react';
import { FAMILY_PIN } from '../lib/auth.js';
import { cx } from './ui.jsx';

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    setTrying(true);
    const t = setTimeout(() => {
      if (pin === FAMILY_PIN) {
        onUnlock();
      } else {
        setError(true);
        setPin('');
        setTrying(false);
        setTimeout(() => setError(false), 900);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [pin, onUnlock]);

  const press = (d) => {
    if (trying) return;
    setPin((p) => (p.length >= 4 ? p : p + d));
  };

  // 4자리를 누르면 자동으로 열린다 — 별도 '들어가기' 버튼은 두지 않는다.
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'blank'];

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto bg-canvas px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[19px] bg-brand text-white shadow-brand">
            <HardHat className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">AI 현장 매니저</h1>
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-2xs font-bold text-ink-3 shadow-card">
            <Lock className="h-3 w-3" strokeWidth={2.6} /> 가족 전용
          </p>
          <p className="mt-5 text-sm font-semibold text-ink-2">비밀번호 4자리를 눌러 주세요</p>
        </div>

        <div className={cx('mt-5 flex justify-center gap-3.5', error ? 'animate-shake' : '')}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cx(
                'h-3.5 w-3.5 rounded-full transition-all duration-150',
                error
                  ? 'bg-rose-500'
                  : pin.length > i
                  ? 'scale-110 bg-brand'
                  : 'bg-slate-300'
              )}
            />
          ))}
        </div>

        <p className={cx('mt-3 h-5 text-center text-xs font-bold', error ? 'text-rose-600' : 'text-transparent')}>
          비밀번호가 맞지 않습니다
        </p>

        <div className="mx-auto mt-1 grid w-[264px] grid-cols-3 gap-x-6 gap-y-4">
          {keys.map((k) => {
            if (k === 'back') {
              return (
                <button
                  key={k}
                  type="button"
                  aria-label="지우기"
                  onClick={() => setPin((p) => p.slice(0, -1))}
                  className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full text-ink-3 transition active:bg-white"
                >
                  <Delete className="h-5 w-5" strokeWidth={2.2} />
                </button>
              );
            }
            if (k === 'blank') {
              return <span key={k} aria-hidden className="mx-auto h-[72px] w-[72px]" />;
            }
            return (
              <button
                key={k}
                type="button"
                aria-label={`${k} 번`}
                onClick={() => press(k)}
                className="num mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white text-[23px] font-bold text-ink shadow-card transition active:scale-[0.96] active:bg-slate-50"
              >
                {k}
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-center text-2xs leading-5 text-ink-3">
          네 자리를 누르면 바로 열립니다.
          <br />
          공용 기기에서는 쓰고 나서 오른쪽 위 자물쇠로 잠가 주세요.
        </p>
      </div>
    </div>
  );
}
