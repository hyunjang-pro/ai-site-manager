// 무료·무인증 날씨 (Open-Meteo). 실패하면 조용히 넘어가고 앱은 계속 동작한다.
import { REGIONS } from './constants.js';

const COORDS = {
  안동: { lat: 36.5684, lon: 128.7294 },
  포항: { lat: 36.019, lon: 129.3435 },
  구미: { lat: 36.1195, lon: 128.3446 },
  대구: { lat: 35.8714, lon: 128.6014 },
  경주: { lat: 35.8562, lon: 129.2247 },
  김천: { lat: 36.1398, lon: 128.1136 },
  영주: { lat: 36.8055, lon: 128.6239 },
  영천: { lat: 35.9733, lon: 128.9386 },
  상주: { lat: 36.4109, lon: 128.1591 },
  문경: { lat: 36.5866, lon: 128.1866 },
  경산: { lat: 35.8251, lon: 128.7414 },
  칠곡: { lat: 35.9955, lon: 128.4016 },
  성주: { lat: 35.9192, lon: 128.2831 },
  예천: { lat: 36.6576, lon: 128.4534 },
  봉화: { lat: 36.8931, lon: 128.7324 },
  울진: { lat: 36.9931, lon: 129.4004 },
  의성: { lat: 36.3526, lon: 128.6971 },
  청송: { lat: 36.4362, lon: 129.0571 },
  영덕: { lat: 36.4151, lon: 129.3654 },
  청도: { lat: 35.6473, lon: 128.7341 },
  고령: { lat: 35.7262, lon: 128.2628 },
  기타: { lat: 36.5684, lon: 128.7294 },
};

// 경북 기본값은 안동
export function coordsFor(region) {
  return COORDS[region] || COORDS.안동;
}

const cache = new Map();

function emojiFor(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌦️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

const dayLabel = (iso, idx) => {
  if (idx === 0) return '오늘';
  if (idx === 1) return '내일';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso.slice(5) : `${d.getMonth() + 1}/${d.getDate()}`;
};

export async function fetchWeather(region, { days = 4 } = {}) {
  const regionKey = REGIONS.includes(region) ? region : '경북';
  if (cache.has(regionKey)) return cache.get(regionKey);

  const { lat, lon } = coordsFor(region);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FSeoul&forecast_days=${days}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const json = await res.json();
    const daily = json?.daily;
    if (!daily?.time?.length) throw new Error('no_data');

    const list = daily.time.map((date, i) => ({
      date,
      label: dayLabel(date, i),
      code: daily.weather_code?.[i],
      emoji: emojiFor(daily.weather_code?.[i]),
      tMax: Math.round(daily.temperature_2m_max?.[i]),
      tMin: Math.round(daily.temperature_2m_min?.[i]),
      pop: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
    }));

    const rainy = list.filter((d) => d.pop >= 50);
    const cold = list.filter((d) => d.tMin <= 0);
    let alert = null;
    if (rainy.length || cold.length) {
      const parts = [];
      if (rainy.length) parts.push(`비 올 확률 ${Math.max(...rainy.map((d) => d.pop))}%`);
      if (cold.length) parts.push(`최저 ${Math.min(...cold.map((d) => d.tMin))}℃`);
      alert = {
        tone: rainy.length ? 'warn' : 'bad',
        text: `🌧️ 비/한파 예보(${parts.join(' · ')}): 사다리차 작업·폐기물 상차·방수/타일 양생 일정 주의`,
      };
    }

    const result = { ok: true, region: regionKey, list, alert, fetchedAt: new Date().toISOString() };
    cache.set(regionKey, result);
    return result;
  } catch (e) {
    const fallback = { ok: false, region: regionKey, list: [], alert: null };
    // 실패는 조용히 넘긴다 (앱 동작에 영향 없음)
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
