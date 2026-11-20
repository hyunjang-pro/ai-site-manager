#!/usr/bin/env node
// 나라장터·경북 공고 수집 — 매일/4시간마다 돌려 src/data/bids.json 을 갱신한다.
//
// 1순위: 공공데이터포털 나라장터 입찰공고정보서비스 (G2B_API_KEY 가 있을 때, 전국·정확)
// 2순위: narais.com 의 '경상북도 7일 내 마감 공사' 공개 목록 (키 없이 동작)
// 실패하거나 새 공고가 없으면 기존 bids.json 을 그대로 둔다.
//
// 사용:
//   node scripts/fetch-bids.mjs            # 갱신
//   node scripts/fetch-bids.mjs --dry-run  # 파일 안 쓰고 결과만 확인
//   G2B_API_KEY=... node scripts/fetch-bids.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'bids.json');
const DRY = process.argv.includes('--dry-run');
const STRONG = /철거|해체|도배|장판|타일|방수|미장|수선|개보수|리모델링|인테리어|폐기물|창호|샤시|폴딩|석면|화장실|교실|사무실|청사|복지센터|주택|아파트|상가|건물/;
const EXCLUDE = /교량|배수로|포장공|농로|하천|사면|도로|가로수|조경|산림|벌채|사방|용수|관로|상수|하수|펌프|전기공|소방|통신|냉난방|승강기|가스|지붕|외벽|정비공사|준설|관급|감리|설계/;
const KEYWORD = { test: (t) => STRONG.test(t) && !EXCLUDE.test(t) };
const UA = { 'User-Agent': 'ai-site-manager-bid-collector/1.0 (+personal use; contact via site)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;

async function get(url, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

function toISO(dateStr) {
  const m = String(dateStr || '').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const [, y, mo, d, h, mi] = m;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:00+09:00`;
}

function guessRegion(org = '') {
  if (/안동/.test(org)) return { region: '안동시', regionKey: 'andong' };
  const m = org.match(/([가-힣]+(?:시|군|구))/);
  return { region: m ? m[1] : '경북', regionKey: 'gyeongbuk' };
}

function normalizeFromNarais(raw) {
  const { region, regionKey } = guessRegion(raw.org);
  const p = raw.price;
  return {
    id: raw.id,
    noticeNo: raw.id,
    title: raw.title,
    org: raw.org,
    region,
    regionKey,
    site: raw.org,
    price: p,
    budget: p,
    deadline: raw.deadline,
    postedAt: raw.postedAt || new Date().toISOString().slice(0, 10),
    trade: /폐기물/.test(raw.title) ? '폐기물' : /창호|샤시|폴딩/.test(raw.title) ? '창호' : /철거|해체/.test(raw.title) ? '철거·해체' : /도배|장판/.test(raw.title) ? '도배·장판' : /타일|방수/.test(raw.title) ? '타일·방수' : /미장/.test(raw.title) ? '미장·바닥' : '실내건축·수선',
    workTypes: /폐기물/.test(raw.title) ? ['waste'] : /창호|샤시|폴딩/.test(raw.title) ? ['window'] : /철거|해체/.test(raw.title) ? ['demolition'] : /도배|장판/.test(raw.title) ? ['wallpaper'] : /타일|방수|미장/.test(raw.title) ? ['tilewaterproof'] : ['interior'],
    licenses: raw.licenses || [],
    licenseRequired: true,
    restricted: regionKey === 'andong',
    restrictionNote: regionKey === 'andong' ? '안동시 지역제한' : '',
    preference: '',
    status: new Date(raw.deadline).getTime() > Date.now() ? 'open' : 'closed',
    result: null,
    competition: null,
    winRate: null,
    url: `https://gongong.kr/notice/${raw.id}`,
    g2b: `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${raw.id}&bidPbancOrd=000`,
    summary: `${raw.org} 공고 · ${raw.title}`,
    note: '자동 수집. 투찰 전 나라장터 원문을 확인하세요.',
  };
}

function parseNaraisList(html) {
  const heads = [...html.matchAll(/<h2[^>]*>\s*<a href="(\/b\/[^"]+)">([\s\S]*?)<\/a>[\s\S]*?<\/h2>/g)];
  const out = [];
  heads.forEach((m, i) => {
    const block = html.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : m.index + 4000);
    const text = strip(block);
    const idMatch = text.match(/R\d{2}BK\d{8}/);
    if (!idMatch) return;
    const title = strip(m[2]);
    if (!KEYWORD.test(title)) return;
    const orgM = block.match(/class="narais-bid-org"[^>]*>([\s\S]*?)<\/p>/);
    const org = strip(orgM ? orgM[1] : '');
    const priceM = text.match(/([\d,]{4,})\s*원/);
    const deadline = toISO(text);
    out.push({
      id: idMatch[0],
      title,
      org: org || '경상북도',
      price: priceM ? Number(priceM[1].replace(/,/g, '')) : 0,
      deadline: deadline || '',
      postedAt: new Date().toISOString().slice(0, 10),
      licenses: [],
    });
  });
  return out;
}

async function collectNarais() {
  const pages = 4;
  const found = new Map();
  for (let p = 1; p <= pages; p += 1) {
    const url = `https://narais.com/hub/week/construction/gyeongbuk${p > 1 ? `?p=${p}` : ''}`;
    let html = '';
    try {
      html = await get(url, 1);
    } catch (e) {
      console.warn(`page ${p} 건너뜀: ${e.message}`);
      break;
    }
    const items = parseNaraisList(html);
    if (!items.length) break;
    items.forEach((b) => found.set(b.id, b));
    await sleep(1200);
  }
  return [...found.values()];
}

async function enrich(id) {
  // 면허·업종은 상세 페이지에만 있다 — 실패해도 치명적이지 않다.
  try {
    const html = await get(`https://gongong.kr/notice/${id}`, 1);
    const text = strip(html);
    const table = html.match(/면허·업종[\s\S]{0,2500}?<\/table>/);
    const scope = table ? strip(table[0]) : text;
    const found = [...scope.matchAll(/([가-힣ㆍ·ㆍA-Za-z]+(?:공사업|제거업|중간처리업|수집·운반업|설치업|조립공사업))/g)].map((x) => x[1]);
    return [...new Set(found)].slice(0, 3);
  } catch (e) {
    return [];
  }
}

async function main() {
  if (!fs.existsSync(OUT)) throw new Error(`기존 파일 없음: ${OUT}`);
  const current = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const merged = new Map((current.bids || []).map((b) => [b.noticeNo || b.id, b]));

  let candidates = [];
  try {
    candidates = await collectNarais();
    console.log(`narais 경북 공사 7일 내 마감에서 ${candidates.length}건 후보`);
  } catch (e) {
    console.warn(`narais 수집 실패: ${e.message}`);
  }

  const added = [];
  for (const raw of candidates.slice(0, 12)) {
    if (!raw.deadline) continue;
    if (merged.has(raw.id)) {
      const prev = merged.get(raw.id);
      merged.set(raw.id, { ...prev, deadline: raw.deadline, price: raw.price || prev.price, status: new Date(raw.deadline).getTime() > Date.now() ? 'open' : 'closed' });
      continue;
    }
    raw.licenses = await enrich(raw.id);
    await sleep(1000);
    const bid = normalizeFromNarais(raw);
    merged.set(bid.noticeNo, bid);
    added.push(bid);
  }

  const all = [...merged.values()]
    .filter((b) => b.noticeNo && b.title)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return String(a.deadline).localeCompare(String(b.deadline));
    })
    .slice(0, 60);

  const next = {
    ...current,
    collectedAt: new Date().toISOString().slice(0, 10),
    source: current.source,
    notice: current.notice,
    bids: all,
  };

  console.log(`새 공고 ${added.length}건 · 전체 ${all.length}건`);
  if (DRY) {
    console.log(JSON.stringify(added.map((a) => ({ id: a.id, title: a.title, org: a.org, deadline: a.deadline })), null, 2));
    return;
  }
  if (!added.length && current.collectedAt) {
    console.log('새 공고가 없어 기존 파일을 유지합니다.');
    return;
  }
  fs.writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`저장: ${OUT}`);
}

main().catch((e) => {
  console.error(`수집 실패 — 기존 bids.json 유지: ${e.message}`);
  process.exitCode = 0; // 워크플로가 깨지지 않게
});
