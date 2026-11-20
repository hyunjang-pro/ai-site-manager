import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bath,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  DoorOpen,
  Hammer,
  HelpCircle,
  Info,
  Layers,
  Lock,
  PaintBucket,
  Paintbrush,
  PenLine,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react';

export function cx(...args) {
  return args.filter(Boolean).join(' ');
}

/* ── 공종 아이콘 ─────────────────────────────────────────── */
const TRADE_STYLE = {
  demolition: { Icon: Hammer, wrap: 'bg-amber-50 text-amber-600' },
  wallpaper: { Icon: Paintbrush, wrap: 'bg-blue-50 text-blue-600' },
  bathroom: { Icon: Bath, wrap: 'bg-cyan-50 text-cyan-600' },
  kitchen: { Icon: ChefHat, wrap: 'bg-rose-50 text-rose-600' },
  tilewaterproof: { Icon: Layers, wrap: 'bg-teal-50 text-teal-600' },
  plaster: { Icon: PaintBucket, wrap: 'bg-orange-50 text-orange-600' },
  window: { Icon: DoorOpen, wrap: 'bg-sky-50 text-sky-600' },
  waste: { Icon: Truck, wrap: 'bg-amber-50 text-amber-700' },
  labor: { Icon: Users, wrap: 'bg-slate-100 text-slate-700' },
  repair: { Icon: Wrench, wrap: 'bg-rose-50 text-rose-600' },
  combined: { Icon: Layers, wrap: 'bg-indigo-50 text-indigo-600' },
  custom: { Icon: PenLine, wrap: 'bg-zinc-100 text-zinc-600' },
  unclassified: { Icon: HelpCircle, wrap: 'bg-slate-100 text-slate-500' },
};

export function TradeIcon({ trade = 'unclassified', size = 'md', className = '' }) {
  const s = TRADE_STYLE[trade] || TRADE_STYLE.unclassified;
  const box = size === 'lg' ? 'h-11 w-11 rounded-2xl' : size === 'sm' ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-2xl';
  const icon = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const { Icon } = s;
  return (
    <span className={cx('flex shrink-0 items-center justify-center', box, s.wrap, className)}>
      <Icon className={icon} strokeWidth={2.2} />
    </span>
  );
}

export function IconTile({ icon: Icon, tone = 'brand', className = '', size = 'md' }) {
  const tones = {
    brand: 'bg-brand-soft text-brand',
    good: 'bg-emerald-50 text-emerald-600',
    warn: 'bg-amber-50 text-amber-600',
    bad: 'bg-rose-50 text-rose-600',
    gray: 'bg-slate-100 text-slate-500',
  };
  const box = size === 'sm' ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-2xl';
  return (
    <span className={cx('flex shrink-0 items-center justify-center', box, tones[tone] || tones.brand, className)}>
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.2} />
    </span>
  );
}

/* ── 표면 ────────────────────────────────────────────────── */
export function Card({ children, className = '', ...rest }) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, right, className = '' }) {
  return (
    <div className={cx('mb-2 flex items-center justify-between px-1', className)}>
      <h2 className="text-sm font-bold text-ink-2">{children}</h2>
      {right}
    </div>
  );
}

/* ── 버튼 ────────────────────────────────────────────────── */
const BUTTON_STYLES = {
  primary: 'bg-brand text-white shadow-brand active:bg-brand-strong',
  dark: 'bg-ink text-white active:bg-slate-700',
  amber: 'bg-amber-400 text-ink active:bg-amber-300',
  ghost: 'bg-white text-ink border border-slate-200 active:bg-slate-50',
  soft: 'bg-slate-100 text-ink-2 active:bg-slate-200',
  danger: 'bg-rose-600 text-white active:bg-rose-500',
  green: 'bg-emerald-600 text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.55)] active:bg-emerald-700',
};

export function BigButton({ children, variant = 'primary', className = '', disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cx(
        'inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold tracking-tight transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        BUTTON_STYLES[variant] || BUTTON_STYLES.primary,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SmallButton({ children, variant = 'soft', className = '', ...rest }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition',
        variant === 'soft' ? 'bg-slate-100 text-ink-2 active:bg-slate-200' : '',
        variant === 'white' ? 'border border-slate-200 bg-white text-ink-2 active:bg-slate-50' : '',
        variant === 'dark' ? 'bg-ink text-white active:bg-slate-700' : '',
        variant === 'brand' ? 'bg-brand text-white shadow-brand active:bg-brand-strong' : '',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── 배지 ────────────────────────────────────────────────── */
const TONES = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-rose-50 text-rose-700',
  lock: 'bg-slate-100 text-slate-500',
  info: 'bg-brand-soft text-brand',
  plain: 'bg-slate-100 text-ink-2',
};

const TONE_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: AlertTriangle, lock: Lock, info: Info };

export function Pill({ tone = 'plain', children, className = '', icon = true, dot = false }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold leading-4',
        TONES[tone] || TONES.plain,
        className
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {!dot && icon && Icon ? <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
      {children}
    </span>
  );
}

export function Details({ label = '자세히 보기', children, className = '', defaultOpen = false, right }) {
  return (
    <details className={cx('group rounded-xl bg-slate-50/80', className)} open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-bold text-ink-2">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-3.5 pb-3.5 text-sm leading-6 text-ink-2">{children}</div>
    </details>
  );
}

/* ── 섹션 카드 ───────────────────────────────────────────── */
export function SectionCard({ num, title, subtitle, status, locked, lockHint, children, className = '', icon }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <div className="flex items-start gap-3 px-4 pt-4">
        {num ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-sm font-extrabold text-brand">
            {num}
          </span>
        ) : icon ? (
          <IconTile icon={icon} size="sm" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-bold leading-6 tracking-tight text-ink">{title}</h3>
            {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm leading-5 text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {locked ? (
        <div className="m-3.5 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-4 text-sm font-semibold text-slate-400">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{lockHint || '앞 단계를 마치면 열립니다'}</span>
        </div>
      ) : (
        <div className="p-4">{children}</div>
      )}
    </Card>
  );
}

/* ── 입력 ────────────────────────────────────────────────── */
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-bold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-4 text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className = '', ...rest }) {
  return <input className={cx('field-input', className)} {...rest} />;
}

export function TextArea({ className = '', rows = 4, ...rest }) {
  return <textarea rows={rows} className={cx('field-input leading-6', className)} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <span className="relative block">
      <select className={cx('field-input appearance-none bg-white pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </span>
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              'chip',
              active
                ? 'border-brand/30 bg-brand-soft text-brand'
                : 'border-slate-200 bg-white text-ink-2 active:bg-slate-50'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CheckRow({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition',
        checked ? 'bg-brand-soft' : 'bg-slate-50 active:bg-slate-100'
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
          checked ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : null}
      </span>
      <span className="min-w-0">
        <span className={cx('block text-sm font-bold leading-5', checked ? 'text-brand-strong' : 'text-ink-2')}>
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-xs leading-4 text-ink-3">{hint}</span> : null}
      </span>
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition',
        checked ? 'bg-brand-soft' : 'bg-slate-50 active:bg-slate-100',
        className
      )}
    >
      <span className="min-w-0">
        <span className={cx('block text-sm font-bold', checked ? 'text-brand-strong' : 'text-ink-2')}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-4 text-ink-3">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={cx(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-slate-300'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

export function Money({ value, className = '', suffix = '만원' }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className={cx('num', className)}>
      {n.toLocaleString('ko-KR')}
      {suffix}
    </span>
  );
}

/* ── 수치 ────────────────────────────────────────────────── */
export function Metric({ label, value, unit = '만', tone = 'plain', className = '' }) {
  const tones = {
    plain: 'bg-slate-50 text-ink',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-rose-50 text-rose-700',
    brand: 'bg-brand-soft text-brand-strong',
  };
  const labelTone = {
    plain: 'text-ink-3',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-rose-600',
    brand: 'text-brand',
  };
  return (
    <div className={cx('rounded-xl px-2 py-2.5 text-center', tones[tone] || tones.plain, className)}>
      <p className={cx('text-2xs font-bold', labelTone[tone] || labelTone.plain)}>{label}</p>
      <p className="num mt-1 text-base font-extrabold leading-5">
        {typeof value === 'number' ? Math.round(value).toLocaleString('ko-KR') : value}
        {unit ? <span className="ml-0.5 text-2xs font-bold opacity-60">{unit}</span> : null}
      </p>
    </div>
  );
}

export function RangeMeter({ min, base, max, unit = '만', className = '', showLabels = true }) {
  const lo = Math.min(min, base, max);
  const hi = Math.max(min, base, max);
  const span = hi - lo || 1;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  return (
    <div className={className}>
      {showLabels ? (
        <div className="mb-1.5 flex items-baseline justify-between text-2xs font-semibold text-ink-3">
          <span>
            최소 <b className="num text-xs text-ink-2">{Math.round(min).toLocaleString('ko-KR')}</b>
          </span>
          <span className="text-brand">
            기준 <b className="num text-xs">{Math.round(base).toLocaleString('ko-KR')}</b>
          </span>
          <span>
            최대 <b className="num text-xs text-ink-2">{Math.round(max).toLocaleString('ko-KR')}</b>
          </span>
        </div>
      ) : null}
      <div className="relative h-2 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-brand/20 via-brand/45 to-brand/20"
          style={{ left: `${pos(lo)}%`, right: `${100 - pos(hi)}%` }}
        />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-[0_1px_4px_rgba(49,130,246,0.6)]"
          style={{ left: `${pos(base)}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressTrack({ value, max = 4, tone = 'brand', className = '' }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / (Number(max) || 1)) * 100));
  const tones = { brand: 'bg-brand', good: 'bg-emerald-500', warn: 'bg-amber-500' };
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cx('h-full rounded-full transition-all', tones[tone] || tones.brand)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── 안내 박스 ──────────────────────────────────────────── */
export function WarningBox({ tone = 'warn', title, children }) {
  const styles =
    tone === 'bad'
      ? 'bg-rose-50 text-rose-800'
      : tone === 'info'
      ? 'bg-brand-soft text-brand-strong'
      : tone === 'good'
      ? 'bg-emerald-50 text-emerald-800'
      : 'bg-amber-50 text-amber-800';
  const Icon = tone === 'bad' || tone === 'warn' ? AlertTriangle : tone === 'good' ? CheckCircle2 : Info;
  return (
    <div className={cx('rounded-xl px-3.5 py-3 text-sm font-semibold leading-5', styles)}>
      {title ? (
        <div className="mb-1 flex items-center gap-1.5 text-sm font-extrabold">
          <Icon className="h-4 w-4 shrink-0" />
          {title}
        </div>
      ) : null}
      <div className="font-medium leading-6">{children}</div>
    </div>
  );
}

/* ── 토스트 · 모달 ──────────────────────────────────────── */
export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-[90] flex justify-center no-print" role="status" aria-live="polite">
      <div className="animate-rise flex max-w-md items-center gap-2.5 rounded-2xl bg-ink/95 px-4 py-3.5 text-sm font-bold text-white shadow-float backdrop-blur">
        <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={3} />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, subtitle, onBack, backLabel = '뒤로' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-6 no-print">
      <div role="dialog" aria-modal="true" aria-label={title} className="animate-rise modal-sheet flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:max-h-[88dvh] sm:rounded-3xl">
        {/* 상단 바 — 스크롤해도 절대 가려지지 않는다 */}
        <div className="modal-top flex shrink-0 items-center gap-2 border-b border-slate-200/70 bg-white/95 px-3 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={onBack || onClose}
            aria-label={backLabel}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-sm font-bold text-ink-2 active:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.6} />
            <span>{backLabel}</span>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-extrabold tracking-tight text-ink">{title}</h2>
            {subtitle ? <p className="truncate text-2xs font-medium text-ink-3">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:bg-slate-200"
          >
            <X className="h-5 w-5" strokeWidth={2.6} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">{children}</div>
        {footer ? (
          <div className="modal-bottom shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ── 히어로 카드 (진한 네이비 + 큰 숫자) ─────────────────── */
export function Hero({ eyebrow, value, unit, sub, badge, right, children, className = '' }) {
  return (
    <div className={cx('hero-card relative overflow-hidden rounded-3xl px-5 pb-5 pt-4 text-white', className)}>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-blue-500/25 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-blue-200">{eyebrow}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {badge}
          {right}
        </div>
      </div>
      {value !== undefined ? (
        <p className="relative mt-1 flex items-baseline gap-1">
          <span className="num text-[38px] font-black leading-[46px] tracking-tight">{value}</span>
          {unit ? <span className="text-base font-extrabold text-blue-200">{unit}</span> : null}
        </p>
      ) : null}
      {sub ? <p className="relative mt-0.5 text-sm font-semibold leading-5 text-blue-100/90">{sub}</p> : null}
      {children ? <div className="relative mt-3">{children}</div> : null}
    </div>
  );
}

/* ── 선명한 경고 카드 (얇은 회색 박스 대신 컬러 좌측 바 + 틴트) ── */
export function AlertCard({ tone = 'warn', title, children, icon: Icon = AlertTriangle, className = '' }) {
  const styles = {
    warn: 'bg-amber-50 text-amber-950 border-amber-400',
    bad: 'bg-rose-50 text-rose-950 border-rose-500',
    info: 'bg-blue-50 text-blue-950 border-blue-500',
    good: 'bg-emerald-50 text-emerald-950 border-emerald-500',
  };
  return (
    <div className={cx('rounded-r-2xl rounded-l-md border-l-[5px] px-3.5 py-3', styles[tone] || styles.warn, className)}>
      {title ? (
        <p className="flex items-center gap-1.5 text-sm font-extrabold leading-5">
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.6} />
          {title}
        </p>
      ) : null}
      <div className="mt-0.5 text-[13px] font-semibold leading-5 opacity-90">{children}</div>
    </div>
  );
}
