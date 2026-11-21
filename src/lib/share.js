// 가족 폰에 세팅 보내기 — Gemini 키·업체 정보·단가표를 PIN(3855) 기반으로 가역 인코딩해 URL 해시(#share=)에 담는다.
// · 공개 GitHub 저장소이므로 코드에 키를 넣지 않는다. 키는 '이 링크'에만 실려 가족 폰으로 간다.
// · URL 해시(# 뒤)는 서버로 전송되지 않는다.
// · 이 인코딩은 암호가 아니라 눈속임 수준(코드를 보면 풀 수 있음)이다 — 링크는 가족에게만 보낸다.
import { FAMILY_PIN } from './auth.js';
import { GEMINI_KEY_STORAGE } from './gemini.js';

export const SHARE_HASH_PREFIX = '#share=';
export const SHARE_PIN = FAMILY_PIN;

const KEY = `hyunjang-site-manager:${SHARE_PIN}`;

const toBytes = (str) => unescape(encodeURIComponent(str)); // UTF-8 바이트를 1글자=1바이트 문자열로
const fromBytes = (bytes) => decodeURIComponent(escape(bytes));

function xorBytes(bytes, key) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

function toBase64Url(binary) {
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  return atob(padded + pad);
}

// 설정 상태 → 링크에 담을 최소 묶음
export function buildSharePayload(settings = {}, supplier = {}, apiKey = '') {
  const niceRates = settings?.rates && typeof settings.rates === 'object' ? settings.rates : undefined;
  return {
    v: 1,
    k: String(apiKey || settings?.apiKey || '').trim(),
    s: {
      region: settings?.region || '',
      businessName: settings?.businessName || supplier?.name || '',
      agencyFeeRate: settings?.agencyFeeRate ?? 10,
      ...(niceRates ? { rates: niceRates } : {}),
      supplier: {
        name: supplier?.name || '',
        owner: supplier?.owner || '',
        phone: supplier?.phone || '',
        address: supplier?.address || '',
        bizNo: supplier?.bizNo || '',
        account: supplier?.account || '',
      },
    },
    t: Date.now(),
  };
}

export function encodeShare(payload) {
  const json = JSON.stringify(payload || {});
  return toBase64Url(xorBytes(toBytes(json), KEY));
}

export function decodeShare(code) {
  const raw = String(code || '').trim();
  if (!raw) return null;
  try {
    const bytes = xorBytes(fromBase64Url(raw), KEY);
    const obj = JSON.parse(fromBytes(bytes));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

// 이 기기 주소 기준의 공유 링크 (라이브·미리보기 어디서 만들어도 그 주소로 열린다)
export function buildShareUrl(code) {
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://hyunjang-pro.github.io/ai-site-manager/';
  return `${base}${SHARE_HASH_PREFIX}${code}`;
}

// 주소창에 실린 #share= 코드 읽기
export function readShareHash(hash) {
  const h = String(hash ?? (typeof window !== 'undefined' ? window.location.hash : '') ?? '');
  if (!h.startsWith(SHARE_HASH_PREFIX)) return '';
  return decodeURIComponent(h.slice(SHARE_HASH_PREFIX.length));
}

// 주소창 해시를 지운다 (적용 뒤 링크가 기록에 남지 않게)
export function clearShareHash() {
  try {
    const { origin, pathname, search } = window.location;
    window.history.replaceState(null, '', `${origin}${pathname}${search}`);
  } catch (e) {
    // ignore
  }
}

export function shareStorageKey() {
  return 'aiSiteManager.pendingShare.v1';
}

export function stashShare(code) {
  try {
    if (code) sessionStorage.setItem(shareStorageKey(), code);
    else sessionStorage.removeItem(shareStorageKey());
  } catch (e) {
    // ignore
  }
}

export function readStashedShare() {
  try {
    return sessionStorage.getItem(shareStorageKey()) || '';
  } catch (e) {
    return '';
  }
}

export { GEMINI_KEY_STORAGE };
