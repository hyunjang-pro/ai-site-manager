import React, { useEffect, useState } from 'react';
import { CalendarDays, CloudSun } from 'lucide-react';
import { fetchWeather, seasonalNote } from '../lib/weather.js';
import { Card, Pill } from './ui.jsx';

const fmt = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function WeatherStrip({ region, startDate, days = 3 }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!region) return () => {};
    fetchWeather(region, { days: 16 }).then((res) => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [region]);

  // 시공일을 아직 안 정했으면 오늘 날씨를 보여주지 않고, 날짜를 정하라고 안내한다.
  if (!startDate) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
            <CloudSun className="h-4 w-4 text-brand" /> 시공일 날씨
          </p>
          <Pill tone="warn">날짜 미정</Pill>
        </div>
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold leading-5 text-ink-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          시공 시작일을 정하면 그날부터 공사기간 날씨를 맞춰 보여드립니다.
        </p>
      </Card>
    );
  }

  const span = Math.max(1, parseInt(days, 10) || 1);
  const endDate = (() => {
    const d = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return startDate;
    d.setDate(d.getDate() + span - 1);
    return d.toISOString().slice(0, 10);
  })();

  if (!data) {
    return (
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
          <CloudSun className="h-4 w-4 text-brand" /> 시공일 날씨
        </p>
        <p className="mt-2 text-[13px] font-semibold text-ink-3">예보를 불러오는 중…</p>
      </Card>
    );
  }

  if (!data.ok) {
    return (
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
          <CloudSun className="h-4 w-4 text-brand" /> 시공일 날씨
        </p>
        <p className="mt-2 text-[13px] font-semibold text-ink-3">
          {fmt(startDate)}~{fmt(endDate)} · 예보를 불러오지 못했습니다. 현장 기온을 직접 확인하세요.
        </p>
      </Card>
    );
  }

  const inRange = data.list.filter((d) => d.date >= startDate && d.date <= endDate);
  const season = seasonalNote(new Date(`${startDate}T00:00:00`).getMonth() + 1);

  // 예보 범위 밖(16일 이후)이면 계절 기준 안내
  if (!inRange.length) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-base font-extrabold text-ink">
            <CloudSun className="h-4 w-4 text-brand" /> 시공일 날씨 · {fmt(startDate)}~
          </p>
          <Pill tone="info">{season.label}</Pill>
        </div>
        <p className="mt-1 text-xs font-semibold text-ink-3">
          예보는 16일 앞까지만 나옵니다. 그 이후 일정이라 계절·기온 기준으로 안내합니다.
        </p>
        <ul className="mt-2 space-y-1">
          {season.lines.map((t, i) => (
            <li key={i} className="flex gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] font-semibold leading-5 text-ink-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  const rainy = inRange.filter((d) => d.pop >= 50);
  const cold = inRange.filter((d) => d.tMin <= 0);
  const alert = rainy.length
    ? { tone: 'warn', text: `비 올 확률 ${Math.max(...rainy.map((d) => d.pop))}% — 사다리차·폐기물 상차·방수/타일 양생 일정을 조정하세요.` }
    : cold.length
    ? { tone: 'bad', text: `최저 ${Math.min(...cold.map((d) => d.tMin))}℃ — 방수·미장 양생에 난방이 필요합니다.` }
    : null;

  const shown = inRange.slice(0, 5);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-base font-extrabold text-ink">
          {data.region} 시공일 날씨 · {fmt(startDate)}~{fmt(endDate)}
        </p>
        <Pill tone={alert ? 'warn' : 'ok'}>{alert ? '일정 주의' : '작업 무난'}</Pill>
      </div>

      <div className={`mt-3 grid gap-1.5 ${shown.length >= 4 ? 'grid-cols-4' : shown.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {shown.map((d) => (
          <div key={d.date} className="rounded-xl bg-slate-50 px-1 py-2 text-center">
            <p className="text-sm font-bold text-slate-500">{d.label}</p>
            <p className="text-2xl leading-8" aria-hidden>
              {d.emoji}
            </p>
            <p className="text-sm font-extrabold tabular-nums text-slate-800">
              {d.tMax}°<span className="text-slate-400">/{d.tMin}°</span>
            </p>
            <p className={`text-xs font-bold ${d.pop >= 50 ? 'text-sky-700' : 'text-slate-400'}`}>비 {d.pop}%</p>
          </div>
        ))}
      </div>

      {alert ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">{alert.text}</p>
      ) : (
        <p className="mt-2 text-xs font-semibold leading-5 text-ink-3">
          비·한파 특이사항이 없습니다. 그래도 방수·타일 양생은 기온을 한 번 더 확인하세요.
        </p>
      )}
      {inRange.length < span ? (
        <p className="mt-1.5 text-2xs font-semibold text-ink-3">
          공사기간 중 {span - inRange.length}일은 예보 범위(16일) 밖이라 표시되지 않습니다.
        </p>
      ) : null}
    </Card>
  );
}
