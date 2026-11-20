// 관공서 일감 — 실제 나라장터 공고를 필터링하고, 투찰가·원가·남는 돈을 미리 계산한다.
import data from '../data/bids.json';
import { TRADES } from './constants.js';
import { cloneRates, DEFAULT_RATES } from './rates.js';

export const BIDS = data.bids || [];
export const BIDS_META = { collectedAt: data.collectedAt, source: data.source, notice: data.notice };

export const BID_TRADE_TO_WORK = {
  demolition: 'demolition',
  window: 'window',
  waste: 'waste',
  interior: 'repair',
};

export function daysLeft(deadline, now = new Date()) {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  return Math.ceil(ms / 864e5);
}

export function dLabel(deadline, now = new Date()) {
  const d = daysLeft(deadline, now);
  if (d === null) return '마감일 미정';
  if (d < 0) return '마감';
  if (d === 0) return '오늘 마감';
  return `D-${d}`;
}

export function wonText(n) {
  const v = Number(n) || 0;
  if (v >= 100000000) return `${(v / 100000000).toFixed(2)}억`;
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString('ko-KR')}만`;
  return `${v.toLocaleString('ko-KR')}`;
}

// 투찰가 미리보기 — 사용자가 정한 기준: 추정가격 × 88%, 낙찰하한 87.745%
export function bidPreview(bid) {
  const est = Number(bid?.price) || 0;
  // 공공공사는 낙찰가의 88~93%가 실제 원가로 나가는 경우가 많다 — 보수적으로 잡는다.
  const ratio = Number(bid?.costRatio) || (bid?.trade === '폐기물' ? 0.93 : 0.88);
  const bidPrice = Math.round(est * 0.88);
  const floor = Math.round(est * 0.87745);
  const cost = Math.round(bidPrice * ratio);
  const profit = bidPrice - cost;
  const margin = bidPrice > 0 ? Math.round((profit / bidPrice) * 100) : 0;
  const vat = Math.round(est * 0.1);
  return {
    est,
    bidPrice,
    floor,
    cost,
    profit,
    margin,
    costRatio: ratio,
    vat,
    overFloor: bidPrice - floor,
  };
}

export function filterBids(list, f = {}) {
  const region = f.region || 'all';
  const work = f.work || 'all';
  const max = Number(f.maxPrice) || 0;
  const noLicenseOnly = !!f.noLicenseOnly;
  const hideRestricted = !!f.hideRestricted;
  const openOnly = f.openOnly !== false;

  return list
    .filter((b) => (openOnly ? b.status === 'open' : true))
    .filter((b) => (region === 'all' ? true : region === 'andong' ? b.regionKey === 'andong' : b.regionKey === 'gyeongbuk'))
    .filter((b) => (work === 'all' ? true : (b.workTypes || []).includes(work)))
    .filter((b) => (max ? Number(b.price) <= max : true))
    .filter((b) => (noLicenseOnly ? !b.licenseRequired || Number(b.price) < 15000000 : true))
    .filter((b) => (hideRestricted ? !b.preference : true))
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
}

export function bidStats(list, now = new Date()) {
  const open = list.filter((b) => b.status === 'open');
  const soon = open.filter((b) => {
    const d = daysLeft(b.deadline, now);
    return d !== null && d >= 0 && d <= 5;
  });
  const andong = open.filter((b) => b.regionKey === 'andong');
  return { total: list.length, open: open.length, soon: soon.length, andong: andong.length };
}

// 공고 → 새 현장 patch (내 장부로 가져오기)
export function bidToCase(bid, rates = DEFAULT_RATES) {
  const workType = (bid.workTypes || [])[0];
  const trade = BID_TRADE_TO_WORK[workType] || 'custom';
  const info = TRADES[trade];
  const p = bidPreview(bid);
  const siteParts = String(bid.site || '').split(' 일원')[0];
  const manwon = (n) => `${Math.round(Number(n) / 10000).toLocaleString('ko-KR')}만원`;
  const deadline = String(bid.deadline || '').slice(0, 16).replace('T', ' ');
  // 공고 내용을 그대로 '받은 내용'에 넣는다 — 1.정보 화면에 보이고, AI도 예산·조건을 이걸로 읽는다.
  const rawInput = [
    `[나라장터 공고] ${bid.title}`,
    `발주처: ${bid.org || '-'}`,
    `공고번호: ${bid.noticeNo || '-'}`,
    `추정가격: ${manwon(p.est)} (부가세 포함 ${manwon(p.est + p.vat)})`,
    `추천 투찰가: ${manwon(p.bidPrice)} (추정가의 88%) · 낙찰하한 ${manwon(p.floor)}`,
    `마감일: ${deadline || '-'}${bid.status === 'closed' ? ' (이미 마감)' : ''}`,
    `지역: ${bid.region || '-'}${bid.site ? ` · 현장: ${bid.site}` : ''}`,
    `공사 종류: ${(bid.workTypes || []).join(', ') || '-'}`,
    `면허: ${(bid.licenses || []).join(', ') || '제한 없음'}`,
    bid.restrictionNote ? `투찰 제한: ${bid.restrictionNote}` : '',
    bid.summary ? `공고 요약: ${bid.summary}` : '',
    `공고 링크: ${bid.url || bid.g2b || '-'}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    title: bid.title,
    clientName: bid.org,
    location: bid.site || '',
    region: bid.regionKey === 'andong' ? '안동' : (bid.region || '').replace(/시$|군$/, ''),
    trade,
    sizeValue: '',
    sizeUnit: info.defaultUnit,
    notes: `${bid.summary}\n[공고 ${bid.noticeNo}] ${bid.restrictionNote || ''}\n면허: ${(bid.licenses || []).join(', ') || '제한 없음'}`,
    rawInput,
    customClientPrice: Math.round(p.bidPrice / 10000), // 만원 단위
    stage: 'prelim',
    collection: 'deposit_wait',
    marginRate: info.defaultMargin,
    bufferRate: rates?.buffer ?? 6,
    bid: {
      noticeNo: bid.noticeNo,
      title: bid.title,
      org: bid.org,
      url: bid.url,
      g2b: bid.g2b,
      site: bid.site || '',
      region: bid.region || '',
      workTypes: bid.workTypes || [],
      status: bid.status || '',
      estPrice: p.est,
      bidPrice: p.bidPrice,
      floor: p.floor,
      deadline: bid.deadline,
      licenses: bid.licenses || [],
      restrictionNote: bid.restrictionNote || '',
    },
  };
}

export function ratesForImport() {
  return cloneRates(DEFAULT_RATES);
}
