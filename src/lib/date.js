// 한국 시간(Asia/Seoul) 기준 날짜 계산 — 기기의 시간대가 UTC여도 '오늘'이 하루 밀리지 않게 한다.
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

// YYYY-MM-DD 문자열에 일수를 더한다 (한국 시간 자정 기준)
export function addDaysISO(iso, days = 0) {
  const base = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return ISO_FMT.format(base);
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 11/22(토) 형태 — 문자·안내문에 쓰는 짧은 날짜
export function korDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return iso || '';
  const mm = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  return `${mm}/${dd}(${WEEK[d.getUTCDay()]})`;
}

export function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}
