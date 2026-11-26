// 요청서(숨고·카톡·문자·메모) 라벨 파서 + 보존 게이트.
//
// 왜 이 파일이 필요한가 (2026-11-27 제보):
//   숨고 상업공간 인테리어 요청서(외식 / 부분 인테리어 / 공급면적 8m가벽 룸3개 만들기 /
//   공실 상태 짐 있음 / 계약 상태 현재 입주 중 / 예산 1,000만원 이하)를 스샷으로 넣었더니
//   앱 정리본에는 '지역·공종·예산' 세 줄만 남고 **공사 내용이 통째로 사라졌다.**
//   원인은 두 가지였다.
//     ① OCR이 작은 글씨(900px 썸네일)를 읽다가 '상업공간 인테리어' 줄을 아예 못 읽고,
//        '8m'을 '800'으로, '짐 있음'을 'Hg'로 읽었다.
//     ② 정리본(summarizeRequest)이 **정해진 항목만 골라 다시 쓰는 방식**이라
//        목록에 없는 항목(공간 유형·서비스 분야·공급면적·공실/계약 상태·문의사항)은
//        원문에 있어도 조용히 버려졌다. 그리고 버려진 글에서 '가벽'만 남아 철거로 분류됐다.
//
// 그래서 정리본은 이제 '골라 쓰기'가 아니라 **원문 순서 그대로, 라벨만 정규화해서 남기는** 방식이다.
//   - 아는 라벨(서비스 분야·공급면적…)은 '라벨: 값' 한 줄로 정리한다.
//   - 모르는 줄(요청 제목 '상업공간 인테리어', '협의 가능해요' 등)은 지우지 않고 그대로 둔다.
//   - 앱 UI 잡글자(삭제하기·신고하기·견적 보낸 고수 N명·견적을 작성해 주세요·시계/배터리)만 지운다.
//   - 사진에서 못 읽은 값('Hg')은 버리지 않고 '(사진에서 못 읽음 — 확인 필요)'로 표시한다.
//   - 보존 게이트(preservationGate)가 "원문에 있던 핵심 줄이 정리본에서 사라졌는지"를 검사한다.

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 요청서에 자주 나오는 라벨. aliases는 띄어쓰기·조사 차이를 흡수한다.
export const FIELD_DEFS = [
  { key: 'service', label: '서비스 분야', aliases: ['서비스 분야', '서비스분야', '서비스 종류', '서비스종류', '공사 종류', '공사종류', '시공 분야', '시공분야'] },
  { key: 'space', label: '공간 유형', aliases: ['공간 유형', '공간유형', '시설 유형', '시설유형', '업종'] },
  { key: 'area', label: '공급면적', aliases: ['공급 면적', '공급면적', '시공 면적', '시공면적', '공사 면적', '공사면적', '면적', '규격', '시공 규격', '평수', '규모'] },
  { key: 'vacancy', label: '공실 상태', aliases: ['공실 상태', '공실상태', '현장 상태', '현장상태'] },
  { key: 'contract', label: '계약 상태', aliases: ['계약 상태', '계약상태', '입주 상태', '입주상태', '영업 상태', '영업상태'] },
  { key: 'region', label: '지역', aliases: ['현장 위치', '현장위치', '지역', '위치', '주소'] },
  { key: 'budget', label: '예산', aliases: ['희망 예산', '예산 범위', '예산', '예상 비용', '예상비용'] },
  { key: 'visit', label: '방문 희망일', aliases: ['방문 희망일', '방문희망일', '희망 방문일', '방문일', '방문 희망', '착공 희망일'] },
  { key: 'wish', label: '문의/희망사항', aliases: ['문의/희망사항', '문의/ 희망사항', '문의·희망사항', '문의 희망사항', '희망사항', '요청사항', '추가 요청사항', '기타 요청'] },
  { key: 'extra', label: '추가 서비스', aliases: ['추가 서비스', '추가서비스', '추가 공사', '추가공사'] },
  { key: 'floor', label: '층', aliases: ['층수', '몇 층', '층'] },
  { key: 'elevator', label: '엘리베이터', aliases: ['엘리베이터', '엘베', '승강기'] },
];

// 라벨 매칭표 (긴 이름부터 — '면적'이 '공급면적'을 가로채지 않게)
const MATCHERS = [];
FIELD_DEFS.forEach((def) => {
  def.aliases.forEach((alias) => {
    const chars = alias.replace(/\s+/g, '').split('');
    const body = chars.map(escapeRe).join('\\s*');
    MATCHERS.push({ def, alias, re: new RegExp(`^\\s*${body}\\s*(?:[:：|]|\\s{2,})?\\s*([\\s\\S]*)$`) });
  });
});
MATCHERS.sort((a, b) => b.alias.length - a.alias.length);

// 사진 글자는 라벨 한 글자를 바꿔 읽기도 한다 — '공실상태'→'공실상지', '서비스분야'→'서비스분이'.
// 4자 이상 라벨은 한 글자만 달라도 같은 라벨로 본다 (짧은 라벨은 오인 위험성이 커서 제외).
const FUZZY = [];
FIELD_DEFS.forEach((def) => {
  def.aliases.forEach((alias) => {
    const chars = alias.replace(/\s+/g, '').split('');
    if (chars.length < 4) return;
    chars.forEach((ch, i) => {
      const body = chars.map((c, j) => (j === i ? '.' : escapeRe(c))).join('\\s*');
      FUZZY.push({ def, alias, re: new RegExp(`^\\s*${body}\\s*(?:[:：|]|\\s{2,})\\s*([\\s\\S]+)$`) });
    });
  });
});
FUZZY.sort((a, b) => b.alias.length - a.alias.length);

// 라벨이 통째로 깨져도 값으로 알아보는 경우 — 'MHA HOF 부분 인테리어' → 서비스 분야
const VALUE_FIRST = [
  { key: 'service', re: /인테리어|리모델링|올\s*수리|도배|장판|타일|철거|해체|폐기물|인력|목공|필름|방수|샷시|창호/ },
  { key: 'contract', re: /입주\s*중|영업\s*중|거주\s*중|입주\s*예정/ },
  { key: 'vacancy', re: /짐\s*있|공실|비어\s*있|빈집/ },
  { key: 'space', re: /^(?:외식|카페|음식점|식당|주점|호프|베이커리|사무실|상가|매장|숙박|미용실|네일|학원|병원|약국|공장|창고|아파트|빌라|주택|오피스텔|원룸)(?:\s|$)/ },
];

const byKey = Object.fromEntries(FIELD_DEFS.map((d) => [d.key, d]));
export const FIELD_ORDER = ['service', 'space', 'area', 'vacancy', 'contract', 'region', 'budget', 'visit', 'wish', 'extra', 'floor', 'elevator'];

// ── 앱 UI 잡글자 ────────────────────────────────────────────────
// 숨고·당근·카톡 화면에 같이 찍히는 버튼·머리글. 이 줄만 지운다.
const UI_EXACT = [
  '삭제하기', '신고하기', '차단하기', '공유하기', '더보기', '저장하기', '복사하기', '답장하기',
  '요청 상세', '요청상세', '견적 작성', '견적 보내기', '견적 받기', '고수 찾기', '채팅하기', '채팅 하기',
  '바로 견적', '알림', '설정', '메뉴', '닫기', '뒤로', '취소', '확인', '홈', '프로필', '리뷰', '찜',
  '요청 내용', '요청내용', '상세보기',
];
const UI_PATTERNS = [
  /견적\s*보낸\s*고수\s*\d+\s*명/i,
  /견적을?\s*작성해\s*주세요/,
  /견적서?\s*작성하기/,
  /^\d{1,2}:\d{2}(:\d{2})?$/, // 시계
  /^(배터리|LTE|5G|Wi-?Fi|VPN)\b/i,
  /^\d+\s*(분|시간|일)\s*전$/,
  /^[<«》>\](){}~^\\/|_\-\s]+$/, // 기호만
  /가입\s*[ㆍ·,.]?\s*숨고\s*\d+\s*회\s*이용/,
  /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*가입/,
];

export function isUiNoise(line) {
  const s = String(line || '').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (UI_EXACT.some((w) => s === w || s === `${w} >` || s === `< ${w}`)) return true;
  // '고객 정보          신고하기'처럼 UI 글자만 두 칸으로 나뉜 줄
  const chunks = s.split(/\s{1,}/).map((x) => x.replace(/[<>«》\]\[()]/g, '').trim()).filter(Boolean);
  if (chunks.length && chunks.every((c) => UI_EXACT.includes(c))) return true;
  if (s.length <= 40 && UI_PATTERNS.some((re) => re.test(s))) return true;
  // '요청상세 _고객정보 _ 견적'처럼 머리글 글자가 뭉개진 줄
  if (s.length <= 30 && /요청\s*상세/.test(s) && !/[0-9]/.test(s)) return true;
  return false;
}

const hangul = (s) => (String(s).match(/[가-힣]/g) || []).length;
const digits = (s) => (String(s).match(/\d/g) || []).length;

// 사진에서 못 읽은 값인지 (외계어 'Hg', 기호만, 한 글자)
export function isUnreadableValue(v) {
  const s = String(v || '').replace(/[\s:：|·、.,]/g, '');
  if (!s) return true;
  if (s.length <= 1) return true;
  if (hangul(s) === 0 && digits(s) === 0) return true;
  // 한글 1자 이하 + 숫자 없음 + 짧음 = 깨진 인식 ('Hg', 'AX 작4'의 조각)
  if (hangul(s) <= 1 && digits(s) === 0 && s.length <= 3) return true;
  return false;
}

// ── OCR이 흘린 길이 단위 복원 ─────────────────────────────────
// 413px로 줄인 스샷에서 '8m가벽'이 '800가벽'으로, 또는 '8rn'으로 읽힌다(실측).
// 길이 작업 낱말(가벽·칸막이·문·창…) 바로 앞 숫자에서만 되돌린다 — '1000만원' 같은 금액은 건드리지 않는다.
const LENGTH_NOUN = '가벽|칸막이|벽체|파티션|판넬|룸|방|실|문|도어|창|샷시|난간';
export function repairMeasureText(value) {
  let out = String(value || '');
  const notes = [];
  const zeroZero = out.match(new RegExp(`(\\d+)(?:00|OO|oo|ＯＯ)\\s*(?=(?:${LENGTH_NOUN}))`));
  if (zeroZero) {
    const n = zeroZero[1];
    out = out.replace(zeroZero[0], `${n}m `);
    notes.push(`'${zeroZero[0].trim()}' → '${n}m'`);
  }
  const rn = out.match(new RegExp(`(\\d+)\\s*(?:rn|R N|ΓΠ)\\s*(?=\\s|${LENGTH_NOUN})`));
  if (rn && !/(\d+)\s*m/.test(out)) {
    out = out.replace(rn[0], `${rn[1]}m `);
    notes.push(`'${rn[0].trim()}' → '${rn[1]}m'`);
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), notes };
}

// ── 치수 읽기 (가벽 8m · 룸 3개 · 문 3개) ─────────────────────
export function parseDimensions(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const meter = t.match(/(\d+(?:\.\d+)?)\s*(?:m|M|미터|메타)(?!\s*2)/);
  const room = t.match(/(?:룸|방|실)\s*(\d+)\s*(?:개|칸|실)?/) || t.match(/(\d+)\s*(?:룸|개\s*룸)/);
  const door = t.match(/(?:문|도어|출입문)\s*(\d+)\s*(?:개|짝)?/) || t.match(/(\d+)\s*(?:개의?\s*)?(?:문|도어)/);
  const sqm = t.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|제곱미터)/);
  const pyung = t.match(/(\d+(?:\.\d+)?)\s*평/);
  return {
    meters: meter ? parseFloat(meter[1]) : 0,
    rooms: room ? parseInt(room[1], 10) : 0,
    doors: door ? parseInt(door[1], 10) : 0,
    sqm: sqm ? parseFloat(sqm[1]) : 0,
    pyung: pyung ? parseFloat(pyung[1]) : 0,
    raw: t,
  };
}

// 줄 앞에 붙은 OCR 부스러기('0 경북 안동시', '66 | 조대현', '? 경북 안동시') 제거
function stripLineJunk(line) {
  return String(line || '')
    .replace(/^[0-9?@•·*|~\-._:/\\]{1,3}\s+(?=[가-힣])/, '')
    .replace(/^[?@•·*|~_:>\\]{1,3}\s*(?=[가-힣])/, '')
    .trim();
}

const REGION_LINE = /^(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|경상북도|경상남도|전라북도|전라남도|충청북도|충청남도|강원도)?\s*[가-힣]{1,5}(?:시|군|구)\s*.{0,12}$/;

function cleanValue(v) {
  return String(v || '')
    .replace(/^[\s、,:：|·ㆍ_\-–—>»]+/, '')
    .replace(/\s*(신고하기|삭제하기|더보기)\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 사진에서 읽은 한 덩어리 글자 → 요청서 구조
export function parseRequestSheet(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  const lines = text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const fields = [];
  const others = [];
  const noise = [];
  const repairs = [];
  const seq = []; // 원문 등장 순서 — 정리본이 순서를 바꾸지 않게
  let client = '';
  let clientBlock = false;

  const usedNext = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripLineJunk(lines[i]);
    if (!line) continue;
    if (usedNext.has(i)) continue;

    // '고객 정보' 머리글 뒤에 오는 이름 한 줄을 고객으로 잡는다 (본문에 섞이지 않게)
    if (/고객\s*정보/.test(line) && line.length <= 30) {
      noise.push(line);
      clientBlock = true;
      continue;
    }

    if (isUiNoise(line)) {
      noise.push(line);
      continue;
    }

    let matched = null;
    for (const m of MATCHERS) {
      const hit = line.match(m.re);
      if (!hit) continue;
      const rest = cleanValue(hit[1]);
      // '공실'처럼 라벨 이름만 있는 줄을 값으로 오인하지 않는다
      if (rest && rest.length < 2 && hangul(rest) < 1) continue;
      matched = { def: m.def, value: rest };
      break;
    }
    // 라벨 한 글자가 깨진 경우('공실상지 짐있음') — 같은 라벨로 보고 값을 살린다
    if (!matched) {
      for (const m of FUZZY) {
        const hit = line.match(m.re);
        if (!hit) continue;
        const rest = cleanValue(hit[1]);
        if (!rest || isUnreadableValue(rest)) continue;
        matched = { def: m.def, value: rest };
        break;
      }
    }
    // 라벨이 통째로 깨졌지만 값으로 알아보는 경우('MHA HOF 부분 인테리어') —
    // 앞쪽 잡글자에 한글이 없고 짧을 때만. (문장 중간에 '인테리어'가 있어도 여기 걸리지 않게)
    if (!matched) {
      const head = line.match(/^([^가-힣]{2,10})\s*(.+)$/);
      if (head && !/^\d+\s*만/.test(head[2])) {
        const body = head[2].trim();
        const hit = VALUE_FIRST.find((v) => v.re.test(body));
        if (hit && body.length <= 30) matched = { def: byKey[hit.key], value: body, guessed: true };
      }
    }

    if (matched) {
      let value = matched.value;
      let joined = false;
      if (!value) {
        // 두 칸 레이아웃에서 라벨과 값이 다른 줄로 갈라져 읽힌 경우 — 다음 줄을 값으로 붙인다
        for (let j = i + 1; j < lines.length; j += 1) {
          const nxt = lines[j];
          if (!nxt) continue;
          if (isUiNoise(nxt)) {
            usedNext.add(j);
            continue;
          }
          if (MATCHERS.some((m) => m.re.test(nxt))) break; // 다음 라벨이 먼저 오면 값 없음
          value = cleanValue(nxt);
          usedNext.add(j);
          joined = true;
          break;
        }
      }
      // 글자로만 채워야 하는 칸(공간 유형·서비스 분야·공실/계약 상태)에 숫자만 남았으면 못 읽은 것으로 본다
      const TEXT_ONLY = ['space', 'service', 'vacancy', 'contract', 'region'];
      const repaired = repairMeasureText(value);
      const textOnlyBroken = TEXT_ONLY.includes(matched.def.key) && !!repaired.text && !/[가-힣A-Za-z]/.test(repaired.text);
      if (repaired.notes.length) repairs.push({ label: matched.def.label, notes: repaired.notes });
      const field = {
        key: matched.def.key,
        label: matched.def.label,
        value: repaired.text || value,
        raw: line,
        joined,
        guessed: !!matched.guessed,
        unreadable: isUnreadableValue(repaired.text || value) || textOnlyBroken,
      };
      fields.push(field);
      seq.push({ type: 'field', field });
      continue;
    }

    // 지역만 적힌 줄('경북 안동시')은 지역 항목으로 올린다
    if (REGION_LINE.test(line) && line.length <= 20) {
      const field = { key: 'region', label: '지역', value: line, raw: line, joined: false, unreadable: false };
      fields.push(field);
      seq.push({ type: 'field', field });
      continue;
    }

    // 고객 정보 블록의 첫 짧은 한글 줄 = 고객 이름
    if (clientBlock && !client) {
      const name = line.replace(/^[^\uAC00-\uD7A3]+/, '').replace(/[^\uAC00-\uD7A3]/g, '');
      if (name.length >= 2 && name.length <= 5) {
        client = name;
        clientBlock = false;
        continue;
      }
    }
    others.push(line);
    seq.push({ type: 'other', text: line });
  }

  // 같은 라벨이 두 번 나오면 첫 값을 살리고 나머지는 기타로 남긴다
  const seen = new Set();
  const unique = [];
  const seenFields = new Set();
  const seqOut = [];
  for (const item of seq) {
    if (item.type === 'other') {
      seqOut.push(item);
      continue;
    }
    const f = item.field;
    if (seen.has(f.key)) {
      const text = `${f.label}: ${f.value}`;
      others.push(text);
      seqOut.push({ type: 'other', text });
      continue;
    }
    seen.add(f.key);
    unique.push(f);
    seenFields.add(f);
    seqOut.push(item);
  }

  const hasForm = unique.length >= 2;
  return { fields: unique, others, noise, repairs, client, seq: seqOut, hasForm, raw: text };
}

export function sheetValue(sheet, key) {
  const f = (sheet?.fields || []).find((x) => x.key === key);
  return f && !f.unreadable ? f.value : '';
}

export function sheetField(sheet, key) {
  return (sheet?.fields || []).find((x) => x.key === key) || null;
}

// 정리본 — 원문 순서를 지키고, 아는 라벨만 '라벨: 값'으로 정리한다.
export function sheetToText(sheet, { autoLine = '' } = {}) {
  if (!sheet || (!sheet.fields.length && !sheet.others.length)) return '';
  const out = [];
  const seen = new Set();
  (sheet.seq || []).forEach((item) => {
    if (item.type === 'field') {
      const f = item.field;
      if (seen.has(f.key)) return;
      seen.add(f.key);
      const value = f.unreadable ? '(사진에서 못 읽음 — 확인 필요)' : f.value;
      out.push(`${f.label}: ${value}`);
      return;
    }
    const text = String(item.text || '').trim();
    if (text) out.push(text);
  });
  // 순서 정보가 없는(직접 만든) 요청서 대비
  FIELD_ORDER.forEach((key) => {
    if (seen.has(key)) return;
    const f = (sheet.fields || []).find((x) => x.key === key);
    if (!f) return;
    seen.add(key);
    const value = f.unreadable ? '(사진에서 못 읽음 — 확인 필요)' : f.value;
    out.push(`${f.label}: ${value}`);
  });
  if (sheet.client) out.push(`고객: ${sheet.client}`);
  if (autoLine) out.push(autoLine);
  return out.join('\n').trim();
}

// ── 요청서 → 판단 신호 ────────────────────────────────────────
const INTERIOR_WORD = /인테리어|리모델링|올\s*수리|올수리/;
const REMOVAL_WORD = /철거|해체|제거|뜯|부수|부숴|원상복구|비우|반출|빼\s*주|치우|버려|없애|떼어|까\s*내/;
const PARTITION_WORD = /가벽|칸막이|경량\s*벽체|경량벽체|파티션|판넬\s*벽|룸\s*(?:만들|나누|구획)|방\s*(?:만들|나누)/;

export function requestSignals(sheet, fullText = '') {
  const service = sheetValue(sheet, 'service');
  const space = sheetValue(sheet, 'space');
  const area = sheetValue(sheet, 'area');
  const vacancy = sheetValue(sheet, 'vacancy');
  const contract = sheetValue(sheet, 'contract');
  const wish = sheetValue(sheet, 'wish');
  const headline = (sheet?.others || []).find((o) => INTERIOR_WORD.test(o) || REMOVAL_WORD.test(o)) || '';
  const contentText = [service, space, area, wish, vacancy, contract, ...(sheet?.others || [])].join(' ');
  const all = `${fullText || ''} ${contentText}`.trim();
  const t = all.toLowerCase().replace(/\s+/g, ' ');

  const interiorDeclared = INTERIOR_WORD.test(`${service} ${headline}`) || INTERIOR_WORD.test(t);
  const partialDeclared = /부분\s*인테리어|부분인테리어|부분\s*시공/.test(t);
  const fullDeclared = /전체\s*인테리어|전체인테리어|올\s*수리|올수리|리모델링|집\s*전체/.test(t);
  const removal = REMOVAL_WORD.test(t);
  const partition = PARTITION_WORD.test(t);
  const dims = parseDimensions(`${area} ${service} ${wish} ${(sheet?.others || []).join(' ')}`);
  const commercial = /상업공간|상가|상점|매장|식당|음식점|외식|카페|사무실|학원|병원|약국|공장|창고|숍|미용실|네일|편의점|호프|주점|베이커리|제과/.test(
    `${service} ${space} ${headline} ${t}`
  );
  const residential = /아파트|주택|빌라|오피스텔|원룸|투룸|단독|전원|농가|한옥|기숙사|주거/.test(`${space} ${t}`);
  const occupied = /입주\s*중|영업\s*중|거주\s*중|살고\s*있|사람이\s*살/.test(`${contract} ${vacancy} ${t}`);
  // '공실 상태: 짐 있음 / 계약 상태: 현재 입주 중'처럼 둘 다 적힌 요청이 있다 — 계약 상태가 이긴다
  const vacant = !occupied && /공실|빈집|비어\s*있|비어있/.test(`${vacancy} ${t}`);
  const stuff = /짐\s*있|짐이\s*있|집기\s*있|가구\s*있|살림/.test(`${vacancy} ${t}`);

  return {
    service,
    space,
    area,
    vacancy,
    contract,
    wish,
    headline,
    contentText,
    interiorDeclared,
    partialDeclared,
    fullDeclared,
    removal,
    partition,
    dims,
    commercial,
    residential,
    occupied,
    vacant,
    stuff,
    hasForm: !!sheet?.hasForm,
  };
}

// ── 보존 게이트 ──────────────────────────────────────────────
// "원문에 있던 핵심 정보가 정리본/분류에서 사라졌는가"를 기계적으로 검사한다.
// 테스트(test/request-sheet-v316.mjs)와 런타임(res.guard)에서 같이 쓴다.
const loose = (s) => String(s || '').replace(/[\s:：|·、,.\-]/g, '');
const KEY_LINE = /철거|해체|제거|인테리어|도배|장판|타일|방수|욕실|화장실|주방|싱크|가벽|칸막이|목공|문|창|샷시|전기|조명|배관|설비|폐기물|미장|필름|데크|간판|데코타일|마루|확장|원상복구|보수|수선|교체|설치|시공|만들/;

const SERVICE_TRADE_OK = [
  { re: /인테리어|리모델링|올\s*수리/, ok: ['combined', 'wallpaper', 'bathroom', 'kitchen', 'carpentry', 'tilewaterproof', 'window', 'plaster', 'film', 'repair', 'custom', 'electric', 'plumbing'] },
  { re: /철거|해체|원상복구/, ok: ['demolition', 'waste', 'combined', 'custom', 'bathroom', 'kitchen', 'repair'] },
  { re: /도배|장판|벽지/, ok: ['wallpaper', 'combined', 'repair', 'custom'] },
  { re: /타일|방수/, ok: ['tilewaterproof', 'bathroom', 'combined', 'repair', 'custom'] },
  { re: /목공|가벽|칸막이|문|몰딩/, ok: ['carpentry', 'repair', 'combined', 'custom'] },
  { re: /전기|조명/, ok: ['electric', 'combined', 'custom'] },
  { re: /설비|배관|수도/, ok: ['plumbing', 'combined', 'custom'] },
  { re: /폐기물|수거|정리/, ok: ['waste', 'demolition', 'custom'] },
  { re: /욕실|화장실/, ok: ['bathroom', 'combined', 'custom', 'repair', 'tilewaterproof'] },
  { re: /주방|싱크/, ok: ['kitchen', 'combined', 'custom', 'repair'] },
];

export function preservationGate({ sheet, summary = '', trade = '', tradeName = '' }) {
  const issues = [];
  if (!sheet) return issues;
  const sum = loose(summary);
  // 1) 라벨 값이 정리본에 남았는가
  (sheet.fields || []).forEach((f) => {
    if (f.unreadable) return; // 못 읽은 값은 '(사진에서 못 읽음)'으로 자리만 지킨다
    if (!f.value) return;
    if (!sum.includes(loose(f.value))) {
      issues.push({ type: 'dropped_field', key: f.key, label: f.label, value: f.value });
    }
  });
  // 2) 라벨 없는 핵심 줄(요청 제목·본문)이 정리본에 남았는가
  (sheet.others || []).forEach((line) => {
    if (!KEY_LINE.test(line)) return;
    if (!sum.includes(loose(line))) issues.push({ type: 'dropped_line', value: line });
  });
  // 3) 명시된 서비스 분야와 분류 공종이 어긋나지 않는가
  const declared = `${sheetValue(sheet, 'service')} ${sheetValue(sheet, 'space')} ${(sheet.others || []).find((o) => INTERIOR_WORD.test(o)) || ''}`;
  const rule = SERVICE_TRADE_OK.find((r) => r.re.test(declared));
  if (rule && trade && !rule.ok.includes(trade)) {
    issues.push({ type: 'trade_conflict', declared: declared.trim(), trade, tradeName });
  }
  return issues;
}
