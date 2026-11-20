// 한국 시간(Asia/Seoul) 기준 날짜 계산 — 기기의 시간대가 UTC여도 '오늘'이 하루 밀리지 않게 한다.
// YYYY-MM-DD는 '달력 위의 날짜'로 다룬다. Date 객체로 바꿀 때 UTC 자정 기준으로 고정해서
// UTC/KST 차이 때문에 요일·날짜가 하루씩 어긋나는 일(예: 11/21 → 11/20(금))을 막는다.
export const KST_TZ = 'Asia/Seoul';

const ISO_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// YYYY-MM-DD (한국 시간 오늘)
export function kstToday() {
  return ISO_FMT.format(new Date());
}

// 'YYYY-MM-DD' → UTC 자정 타임스탬프. 형식이 틀리거나 없는 날짜(2월 30일 등)면 null.
function parseISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return t;
}

function isoFromUTC(t) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

// YYYY-MM-DD 문자열에 일수를 더한다 (달력 기준)
export function addDaysISO(iso, days = 0) {
  const t = parseISO(iso);
  if (t === null) return iso;
  return isoFromUTC(t + Number(days || 0) * 86400000);
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 11/22(토) 형태 — 문자·안내문에 쓰는 짧은 날짜
export function korDateLabel(iso) {
  const t = parseISO(iso);
  if (t === null) return iso || '';
  const d = new Date(t);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
}

// 11/22 형태 — 요일 없이
export function korMonthDay(iso) {
  const t = parseISO(iso);
  if (t === null) return iso || '';
  const d = new Date(t);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// 1~12 (계절 판단용)
export function korMonth(iso) {
  const t = parseISO(iso);
  if (t === null) return 0;
  return new Date(t).getUTCMonth() + 1;
}

// 0=일 ~ 6=토
export function korWeekday(iso) {
  const t = parseISO(iso);
  if (t === null) return -1;
  return new Date(t).getUTCDay();
}

export function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}
