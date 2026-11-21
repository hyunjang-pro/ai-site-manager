// 무료 AI 앱(Gemini·ChatGPT)에 그대로 붙여넣을 '공사 후 사진' 설명문.
// 돈 드는 이미지 생성 API 대신, 이 설명을 복사해서 사진과 함께 무료 앱에 넣는다.
//
// 원칙
//  - 구조·창문·배치는 그대로 두고 '마감재만' 바꾸게 한다 (실제로 시공한 것처럼)
//  - 철거·폐기물처럼 마감이 없는 현장은 억지 인테리어 대신 '깨끗하게 정리된 빈 공간'
//  - 견적가·원가·남는 돈·알선료 같은 영업비밀 숫자는 절대 넣지 않는다
//  - 손님 이름·전화번호 같은 개인정보도 넣지 않는다 (붙여넣은 글에서 걸러 낸다)
import { TRADES, hasInteriorStyle } from './constants.js';

// 등급별 영어 키워드 — 무료 AI가 분위기를 더 정확히 잡도록
const STYLE_EN = {
  value: 'budget-friendly simple finish, plain white, clean and practical',
  clean: 'clean neutral standard finish, white and ivory, tidy',
  modern: 'modern minimal, matte gray, black fixtures, 4000K neutral light',
  wood: 'warm wood tone, light oak, natural beige, 3000K warm light',
  premium: 'premium hotel-like, large-format porcelain, champagne silk wallpaper, indirect lighting',
};

const GOAL = {
  demolition: '철거와 정리가 끝난 빈 공간(원상복구 전)',
  waste: '폐기물이 모두 수거되어 깨끗해진 현장',
  groundwork: '기초·정지 공사가 끝나고 정리된 현장',
  labor: '작업이 끝나고 정리된 현장',
};

const PHONE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RRN = /\d{6}\s?-\s?\d{7}/g;
const ACCOUNT = /(계좌|입금)[^\n]{0,40}/g;

// 붙여넣은 글에서 개인정보·계좌를 걸러 내고 한 줄로 줄인다.
export function scrubPromptText(text, max = 90) {
  let s = String(text || '')
    .replace(RRN, ' ')
    .replace(PHONE, ' ')
    .replace(EMAIL, ' ')
    .replace(ACCOUNT, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (s.length > max) s = `${s.slice(0, max).trim()}…`;
  return s;
}

function sizeText(c) {
  const v = c?.sizeValue;
  const u = c?.sizeUnit || '';
  if (v === '' || v === null || v === undefined) return '';
  return `${v}${u}`;
}

function scopeText(c) {
  const list = (Array.isArray(c?.subScopes) ? c.subScopes : [])
    .map((s) => (String(s).startsWith('x:') ? String(s).slice(2) : TRADES[s]?.short || ''))
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 4).join('·');
}

function materialLines(materialSet, design) {
  const spec = (materialSet?.spec || design?.combo || []).filter(Boolean);
  return spec.slice(0, 4).map((s) => `- ${s}`);
}

/**
 * 공사 후 사진을 만들기 위한 설명문을 만든다.
 * @returns {string} 그대로 복사해 무료 AI 앱에 붙여넣는 글
 */
export function buildFreePrompt({ c = {}, calc = {}, design = {}, materialSet = null } = {}) {
  const trade = TRADES[calc?.trade] ? calc.trade : TRADES[c?.trade] ? c.trade : 'unclassified';
  const infoLabel = String(c?.tradeName || '').trim() || TRADES[trade]?.label || '현장 공사';
  const size = sizeText(c);
  const scopes = scopeText(c);
  const interior = hasInteriorStyle({ ...c, trade });
  const keywords = scrubPromptText(c?.design?.keywords || c?.design?.wish || '', 60);
  const extra = scrubPromptText(c?.design?.customDetails || '', 90);

  const head = [
    '첨부한 사진은 공사 전 현장 사진입니다.',
    interior
      ? "같은 자리에서 '공사가 끝난 모습'으로 사진을 고쳐 주세요."
      : "같은 자리에서 '공사가 끝나고 정리된 모습'으로 사진을 고쳐 주세요.",
    '',
    '[꼭 지킬 것]',
    '- 건물 구조와 벽·기둥·문·창문의 위치와 크기는 그대로',
    '- 사진을 찍은 각도, 원근, 밝기는 그대로',
  ];

  if (interior) {
    head.push('- 싱크대·변기·욕조 같은 설비의 자리도 그대로');
    head.push('');
    head.push('[바꿀 것 — 마감재만]');
    head.push('- 벽지·도장, 바닥, 타일, 수납장, 조명 색만 바꿉니다');
    head.push('- 없던 가구나 물건은 넣지 마세요');
  } else {
    head.push('');
    head.push('[바꿀 것]');
    head.push(`- 남은 자재·가구·잔재물을 모두 치우고, ${GOAL[trade] || '정리된 현장'}으로`);
    head.push('- 새 벽지·타일·가구 같은 마감재는 넣지 마세요 (아직 공사를 안 했습니다)');
    head.push('- 먼지 없이 청소된 상태');
  }

  const body = ['', `[현장] ${infoLabel}${size ? ` · ${size}` : ''}${scopes ? ` (${scopes})` : ''}`];

  if (interior) {
    const preset = design?.preset || null;
    const styleLabel = preset?.label || '';
    const styleEn = STYLE_EN[design?.presetId] || '';
    if (styleLabel) body.push(`[분위기] ${styleLabel}${preset?.desc ? ` — ${preset.desc}` : ''}${styleEn ? ` (${styleEn})` : ''}`);
    const mats = materialLines(materialSet, design);
    if (mats.length) {
      body.push('[자재]');
      body.push(...mats);
    }
    if (materialSet?.tier) body.push(`[자재 등급] ${materialSet.tier}${materialSet.brand ? ` · ${materialSet.brand}` : ''}`);
  }

  if (keywords) body.push('', `[고객이 원한 말] "${keywords}"`);
  if (interior && extra) body.push(`[그 밖의 요청] ${extra}`);

  const tail = [
    '',
    '[결과물]',
    '- 실제로 시공한 것처럼 자연스러운 사진 1장',
    '- 과장된 3D 그림 금지 · 사람·글자·워터마크 금지',
    '- 원본 사진과 같은 구도와 비율',
    '',
    interior
      ? '(English) Same room, same layout, same windows and camera angle. Change only the finishes: flooring, wallpaper/paint, tiles, cabinets, lighting color. Photorealistic interior photo, natural daylight, no people, no text, no watermark.'
      : '(English) Same building, same windows and camera angle, after demolition and cleanup. Remove all debris, furniture and leftover materials. Do not add new finishes or furniture. Photorealistic photo, natural daylight, no people, no text, no watermark.',
  ];

  return [...head, ...body, ...tail].join('\n');
}
