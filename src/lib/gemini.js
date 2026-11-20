// Gemini 2.5 Flash 멀티모달 — 사용자가 설정에 넣은 자기 키로만 호출한다.
// GitHub Pages 공개 저장소이므로 키는 절대 코드에 넣지 않고, 이 브라우저(localStorage)에만 둔다.
// 키가 없거나 호출이 실패하면 앱은 기존 로컬 규칙·만능 계산기로 그대로 동작한다.
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
export const GEMINI_KEY_STORAGE = 'aiSiteManager.geminiKey';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

export const GEMINI_TRADES = [
  'demolition',
  'wallpaper',
  'bathroom',
  'kitchen',
  'tilewaterproof',
  'plaster',
  'window',
  'carpentry',
  'electric',
  'plumbing',
  'film',
  'groundwork',
  'waste',
  'labor',
  'repair',
  'combined',
  'custom',
];

export function getGeminiKey() {
  try {
    return (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
  } catch (e) {
    return '';
  }
}

export function setGeminiKey(key) {
  try {
    const v = String(key || '').trim();
    if (v) localStorage.setItem(GEMINI_KEY_STORAGE, v);
    else localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch (e) {
    // ignore
  }
}

export function hasGeminiKey() {
  return !!getGeminiKey();
}

// ```json ... ``` 울타리·앞뒤 설명이 섞여도 JSON만 뽑아낸다.
export function parseGeminiJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('empty_response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no_json');
  return JSON.parse(body.slice(start, end + 1));
}

function photoParts(photos = []) {
  return (photos || [])
    .map((p) => String(p?.dataUrl || p || ''))
    .filter((d) => d.startsWith('data:image/'))
    .slice(0, 4)
    .map((dataUrl) => {
      const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
      if (!m) return null;
      return { inline_data: { mime_type: m[1], data: m[2] } };
    })
    .filter(Boolean);
}

export async function callGemini({ apiKey, parts, timeoutMs = 25000, temperature = 0.2 }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('no_key');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`gemini_http_${res.status}`);
    const data = await res.json();
    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p?.text || '')
      .filter(Boolean)
      .join('\n');
    return { raw, json: parseGeminiJson(raw) };
  } finally {
    clearTimeout(timer);
  }
}


// 조사한 2026 실견적 60건 · 현장 고충/노하우 84건 · 법령/판례에서 뽑은 기준 지식.
// AI가 인터넷 평균값 대신 이 기준으로 판단하게 한다.
export const GEMINI_KNOWLEDGE = `
[2026 경북·안동 실무 기준 — 이 값에서 크게 벗어나지 않게 판단]
· 인건비(일당, 만원): 철거 기공 27 / 보조·잡부 19 / 도배 30 / 타일·욕실 37 / 주방 32 / 미장 30
· 폐기물: 1톤차 1대 40~45만(1차 기본) · 2.5톤차 70~80만 · 반차 24~28만 · 중간처리 톤당 32만(혼합 72,721원/톤 기준)
· 폐기물 성상: 섞으면 처리비 3~6배(석고·판넬이 섞이면 그 마대 전체가 혼합 단가). 5톤 이상이면 착공 전 처리계획서 신고.
· 철거: 15평 원상복구 약 337만 / 순수 철거 약 222만. 33평 원상복구 2일(기공1+잡부2) 기준.
· 도배 24평(합지+1.8T) 원가 약 217만 — 벽지 로스 10~15%, 장판 로스 10% 반영.
· 욕실 1칸 올철거 원가 약 409만(철거 80 + 방수 20 + 타일 120 + 도기 50 + 타일공 105 + 폐기물 20).
· 주방 3.2m 원가 약 384만(싱크대 60만/m + 상판 16만/m + 철거·폐기 45 + 노무 3일).
· 목공·문·몰딩: m당 9만(자재+시공), 최소 25만. 전기: 출장 15만 + 개소당 8만. 설비: 출장 15만 + 개소당 12만.
· 필름: ㎡당 2.2만. 기초·토목: ㎡당 4.5만(장비 25% 포함), 최소 50만.
· 방수: 액체방수 2회 + 담수 48시간(사진 3컷: 수위선·24시간·배수 직전), 아래층 누수 확인 후 타일.
· 누수 배상 판례: 105만 ~ 6,076만원(서울동부지법 2022나33816, 책임 70% 제한). 방수 하자보수 3년.
· 추가 공사는 사진·사유·금액·일정 4가지를 문자로 합의해야 청구 가능(대법원 95다38066).
· 석면: 2000년 이전 건물 텍스·슬레이트는 조사 필요, 무단 철거 시 작업중지·3년 이하 징역 또는 3천만원 이하 벌금.
· 예비비: 보수적 원가에 6%(5~8%)를 얹는다. 최소 방어선 = 보수적 원가 + 5% 안전마진.
· 관공서 공고: 설계내역서 확인 전까지 실행원가를 수주금액의 80%로 보수적으로 잡는다.
· 견적 마진: 철거·도배 20%, 욕실 30%, 주방 25%, 인력 지원 18% 선.
[419건 실견적 DB(2026) 보정 — 이 값을 우선한다]
· 욕실 1칸: 타일 120만 · 도기·수전 50만 · 방수 20만 · 철거 80만(UBR +90만) · 폐기물 20만 · 타일공 3일.
· 주방 3.2m: 싱크대 60만/m · 상판 16만/m · 철거·폐기 45만 · 인건비 90만(3일).
· 도배: 실크 롤 4.5만 / 합지 4.2만, 로스 15% · 장판 1.8T 1.1만/㎡ · 2.2T 1.5만/㎡.
· 철거: 일수 = ceil(평 / 8)(원상복구는 / 6), 폐기물 1톤 40~45만 · 2.5톤 70~85만 · 집게차 30~35만.
· 사다리차: 2~5층 소형12/반나절35/하루55 · 10층 15/45/65 · 20층 25/55/80.
· 강마루: 3.5~5.5만/㎡(자재+시공) · 샷시(2중창) 28만/㎡ · 시스템창 40만/㎡.
· 올수리(집 전체) 15평: 1,600~2,200만(포함 범위에 따라) · 24평 2,400~3,200만.
· 안동·경북 시세는 수도권보다 인건비 5~10% 낮고 자재 운반비가 붙는다.
`;

const CASE_PROMPT = `너는 경북 안동의 철거·인테리어 현장 매니저를 돕는 분석가다.
고객 문의 글과 현장 사진을 보고, 아래 JSON만 답한다. 설명 문장은 넣지 않는다.

{"trade":"공종ID","tradeName":"공종이 목록에 없을 때만 한글 이름","title":"현장 제목(지역+규모+공종)","sizeValue":"숫자 문자열 또는 빈 문자열","sizeUnit":"평|㎡|m|칸|개|개소|톤|명|모름","floor":"숫자 문자열 또는 빈 문자열","elevator":"yes|no|unknown","siteCondition":"사진·글로 본 현장 상태(노후 싱크대, 누수 흔적 등)","materials":["필요 자재 3~6개, 규격 포함"],"crew":[{"role":"역할","count":숫자}],"priceRange":{"min":숫자,"max":숫자},"surveyChecks":[{"label":"답사에서 확인할 것","why":"놓치면 생기는 일","amount":예상 추가비 만원 숫자}],"wishText":"문의/희망사항 전문 그대로","missingCosts":[{"label":"빠뜨리기 쉬운 비용","range":"참고 5~12만","amount":8,"why":"왜 필요한지"}],"costBreakdown":[{"label":"인건비","detail":"기공 2명 × 27만 × 2일 + 보조 1명 × 19만 × 2일","amount":108}],"signal":{"level":"green|yellow|red","title":"판정 한 줄","reason":"근거 한 줄"},"buildPlan":{"phases":[{"label":"전날 · 준비","items":["할 일","할 일"]},{"label":"당일 · 시공","items":[]},{"label":"완료 · 정산","items":[]}],"checks":[{"label":"현장에서 확인할 것","why":"왜"}],"tell":"인부에게 이렇게 말하세요","notes":["이 현장 특이사항"]}},"includedScopes":["bathroom|kitchen|wallpaper|entrance|demolition|plaster|carpentry|electric|plumbing|film|window"],"excludedScopes":["window 등 고객이 빼라고 한 공종"],"summary":"한 문장 요약","warnings":["놓치면 손해 보는 점 0~3개"]}

공종ID 목록(반드시 이 중 하나): ${GEMINI_TRADES.join(', ')}
- 목공/문·몰딩·가구·데크=carpentry, 전기·조명·콘센트=electric, 배관·수도·보일러=plumbing, 필름·시트지=film, 맨땅·터파기·기초·토목=groundwork
- 주방(부엌·싱크대·상부장·하부장·후드)=kitchen, 욕실=bathroom, 도배·장판=wallpaper, 철거=demolition, 폐기물=waste, 인력=labor
- 두 공종 이상 섞인 전체 인테리어=combined, 정말 모르면 custom
priceRange는 부가세 별도, 만원 단위의 보수적 범위다.`;

export async function analyzeCaseWithGemini({ apiKey, text = '', photos = [], tradeHint = '' }) {
  const key = apiKey || getGeminiKey();
  if (!key) return { ok: false, reason: 'no_key' };
  const parts = [
    { text: `${CASE_PROMPT}\n${GEMINI_KNOWLEDGE}\n\n[공종 힌트] ${tradeHint || '없음'}\n\n[고객 문의·메모]\n${String(text || '').slice(0, 4000) || '(글 없음 — 사진만 있음)'}` },
    ...photoParts(photos),
  ];
  try {
    const { json, raw } = await callGemini({ apiKey: key, parts });
    return { ok: true, data: normalizeCaseAnalysis(json), raw };
  } catch (e) {
    return { ok: false, reason: e?.message || 'gemini_failed' };
  }
}

function numOrBlank(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
}

export function normalizeCaseAnalysis(data = {}) {
  const trade = GEMINI_TRADES.includes(String(data.trade)) ? data.trade : 'custom';
  return {
    trade,
    tradeName: String(data.tradeName || '').slice(0, 20),
    title: String(data.title || '').slice(0, 40),
    sizeValue: numOrBlank(data.sizeValue),
    sizeUnit: ['평', '㎡', 'm', '칸', '개', '개소', '톤', '명', '모름'].includes(data.sizeUnit) ? data.sizeUnit : '',
    floor: numOrBlank(data.floor),
    elevator: ['yes', 'no', 'unknown'].includes(data.elevator) ? data.elevator : 'unknown',
    siteCondition: String(data.siteCondition || '').slice(0, 200),
    materials: Array.isArray(data.materials) ? data.materials.map(String).slice(0, 6) : [],
    crew: Array.isArray(data.crew)
      ? data.crew
          .map((x) => ({ role: String(x?.role || '').slice(0, 20), count: Math.max(1, parseInt(x?.count, 10) || 1) }))
          .filter((x) => x.role)
      : [],
    priceRange: {
      min: Math.max(0, Math.round(parseFloat(data?.priceRange?.min) || 0)),
      max: Math.max(0, Math.round(parseFloat(data?.priceRange?.max) || 0)),
    },
    wishText: String(data.wishText || '').slice(0, 1200),
    missingCosts: Array.isArray(data.missingCosts)
      ? data.missingCosts
          .map((x) => ({ label: String(x?.label || '').slice(0, 40), range: String(x?.range || ''), amount: Math.max(0, Math.round(parseFloat(x?.amount) || 0)), why: String(x?.why || '') }))
          .filter((x) => x.label && x.amount >= 0)
          .slice(0, 8)
      : [],
    costBreakdown: Array.isArray(data.costBreakdown)
      ? data.costBreakdown
          .map((x) => ({ label: String(x?.label || '').slice(0, 30), detail: String(x?.detail || '').slice(0, 120), amount: Math.round(parseFloat(x?.amount) || 0) }))
          .filter((x) => x.label)
          .slice(0, 10)
      : [],
    buildPlan: data.buildPlan
      ? {
          phases: Array.isArray(data.buildPlan.phases)
            ? data.buildPlan.phases
                .map((x) => ({ label: String(x?.label || '').slice(0, 40), items: Array.isArray(x?.items) ? x.items.map(String).slice(0, 6) : [] }))
                .filter((x) => x.label)
                .slice(0, 4)
            : [],
          checks: Array.isArray(data.buildPlan.checks)
            ? data.buildPlan.checks.map((x) => ({ label: String(x?.label || '').slice(0, 60), why: String(x?.why || '').slice(0, 120) })).filter((x) => x.label).slice(0, 8)
            : [],
          tell: String(data.buildPlan.tell || '').slice(0, 200),
          notes: Array.isArray(data.buildPlan.notes) ? data.buildPlan.notes.map(String).slice(0, 5) : [],
        }
      : null,
    signal: data.signal && ['green', 'yellow', 'red'].includes(data.signal.level)
      ? { level: data.signal.level, title: String(data.signal.title || '').slice(0, 60), reason: String(data.signal.reason || '').slice(0, 160) }
      : null,
    surveyChecks: Array.isArray(data.surveyChecks)
      ? data.surveyChecks
          .map((x) =>
            typeof x === 'string'
              ? { label: x, why: '', amount: 0 }
              : { label: String(x?.label || ''), why: String(x?.why || ''), amount: Math.max(0, Math.round(parseFloat(x?.amount) || 0)) }
          )
          .filter((x) => x.label)
          .slice(0, 8)
      : [],
    includedScopes: Array.isArray(data.includedScopes) ? data.includedScopes.map(String).slice(0, 10) : [],
    excludedScopes: Array.isArray(data.excludedScopes) ? data.excludedScopes.map(String).slice(0, 6) : [],
    summary: String(data.summary || '').slice(0, 200),
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String).slice(0, 3) : [],
  };
}

const SURVEY_PROMPT = `너는 철거·인테리어 현장 답사 기록을 견적 변동으로 바꾸는 분석가다.
답사 메모와 현장 사진을 보고 아래 JSON만 답한다.

{"summary":"한 문장 요약","items":[{"item":"항목 이름","reason":"왜 추가/감액인지","amount":만원 단위 정수,"days":일수 정수,"type":"increase|decrease"}],"signal":{"level":"green|yellow|red","title":"답사 후 수주 판정","reason":"근거"}}

규칙:
- 실제로 견적이 바뀌는 것만 넣는다. 애매하면 넣지 않는다.
- 폐기물 차량은 1톤 1대 기준 43만원(반차 26만), 2.5톤 75만원.
- 누수·방수 보수 30만, 곰팡이 제거 15만, 기존 타일 유지(철거·폐기물 제외) 감액 10만 이상.
- 금액을 모르면 0으로 두지 말고 보수적 기본값을 쓴다.
- 최대 5개.`;

export async function analyzeSurveyWithGemini({ apiKey, memo = '', photos = [], context = '' }) {
  const key = apiKey || getGeminiKey();
  if (!key) return { ok: false, reason: 'no_key' };
  const parts = [
    { text: `${SURVEY_PROMPT}\n${GEMINI_KNOWLEDGE}\n\n[현장]\n${String(context || '').slice(0, 1200)}\n\n[답사 메모]\n${String(memo || '').slice(0, 2000)}` },
    ...photoParts(photos),
  ];
  try {
    const { json, raw } = await callGemini({ apiKey: key, parts });
    const items = Array.isArray(json?.items)
      ? json.items
          .map((x, i) => ({
            id: `gem-${Date.now()}-${i}`,
            item: String(x?.item || '').slice(0, 40),
            reason: String(x?.reason || '').slice(0, 120),
            amount: Math.max(0, Math.round(parseFloat(x?.amount) || 0)),
            days: Math.max(0, Math.round(parseFloat(x?.days) || 0)),
            type: x?.type === 'decrease' ? 'decrease' : 'increase',
          }))
          .filter((x) => x.item && x.amount >= 0)
          .slice(0, 5)
      : [];
    const sig = json?.signal;
    return {
      ok: true,
      data: {
        summary: String(json?.summary || ''),
        items,
        signal: sig && ['green', 'yellow', 'red'].includes(sig.level) ? { level: sig.level, title: String(sig.title || ''), reason: String(sig.reason || '') } : null,
      },
      raw,
    };
  } catch (e) {
    return { ok: false, reason: e?.message || 'gemini_failed' };
  }
}

export async function testGeminiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, reason: 'no_key' };
  try {
    const { json } = await callGemini({
      apiKey: key,
      parts: [{ text: 'JSON만 답해. {"ok":true,"model":"gemini-2.5-flash"}' }],
      timeoutMs: 15000,
    });
    return { ok: true, model: json?.model || MODEL };
  } catch (e) {
    return { ok: false, reason: e?.message || 'failed' };
  }
}

// ---- Before → After 완공 예상 이미지 ----
// 이미지 모델은 응답 형태가 달라서 모델을 바꿔가며 시도한다.
const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-exp-image-generation'];

function afterPrompt(caseInfo = {}, style = {}) {
  const trade = caseInfo.tradeLabel || caseInfo.trade || '인테리어';
  const material = style.material || '';
  const grade = style.grade || '';
  const price = style.price ? `${style.price}만원` : '';
  return [
    'Edit this photo of a real room into the same room AFTER renovation.',
    'Keep the exact same room structure, window positions, wall layout, camera angle and perspective.',
    'Do not add furniture that was not there, do not change the room shape.',
    'Only replace the finishes: flooring, wallpaper/paint, tiles, cabinets, lighting tone.',
    `Renovation type: ${trade}.`,
    material ? `Selected materials: ${material}.` : '',
    grade ? `Quality level: ${grade}.` : '',
    price ? `Budget level: ${price} total work.` : '',
    'Photorealistic interior photo, natural daylight, clean and buildable result (not a fantasy render).',
    'No text, no watermark, no people.',
  ]
    .filter(Boolean)
    .join(' ');
}

function extractInlineImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return '';
}

export async function generateAfterPreview({ apiKey, beforeImage, caseInfo = {}, style = {}, timeoutMs = 60000 }) {
  const key = String(apiKey || getGeminiKey()).trim();
  if (!key) return { ok: false, reason: 'no_key' };
  const before = String(beforeImage || '');
  const m = before.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) return { ok: false, reason: 'no_photo' };

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: afterPrompt(caseInfo, style) }, { inline_data: { mime_type: m[1], data: m[2] } }],
      },
    ],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 },
  };

  let lastReason = 'failed';
  for (const model of IMAGE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        lastReason = `http_${res.status}`;
        continue;
      }
      const data = await res.json();
      const dataUrl = extractInlineImage(data);
      if (!dataUrl) {
        lastReason = 'no_image_in_response';
        continue;
      }
      return { ok: true, dataUrl, model };
    } catch (e) {
      lastReason = e?.message || 'network';
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: lastReason };
}
