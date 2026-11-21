// Gemini 멀티모달 — 사용자가 설정에 넣은 자기 키로만 호출한다.
// GitHub Pages 공개 저장소이므로 키는 절대 코드에 넣지 않고, 이 브라우저(localStorage)에만 둔다.
// 키가 없거나 호출이 실패하면 앱은 기존 로컬 규칙·만능 계산기로 그대로 동작한다.
//
// 모델 이름은 구글이 자주 바꾼다. 이름 하나만 치면 gemini_http_404가 나므로
//  1) 알려진 이름을 앞에서부터 시도하고
//  2) 404가 나면 GET /v1beta/models 로 '지금 이 키로 실제 쓸 수 있는 모델'을 찾아 자동 전환한다.
//  3) 503(모델 과부하)·502·429(무료 한도)가 나도 그 모델만 잠깐 막힌 것이라, 포기하지 않고
//     후보 목록의 다음 모델로 넘어가 재시도한다(IMG_1548).
// 성공한 모델 이름은 이 탭(sessionStorage)과 메모리에 기억해 다음부터 바로 쓴다.
// 잠깐 막힌 모델은 10분 동안 후보 뒤로 미뤄, 다시 눌렀을 때 같은 503 모델에서 또 멈추지 않게 한다.
const API_ROOT = 'https://generativelanguage.googleapis.com';
const API_VERSION = 'v1beta';
const API_VERSIONS = ['v1beta', 'v1'];

export const TEXT_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
];

export const IMAGE_MODEL_CANDIDATES = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-exp-image-generation',
  'gemini-2.0-flash-preview-image-generation',
];

export const GEMINI_MODEL_STORAGE = 'aiSiteManager.geminiModel.v1';
export const GEMINI_COOLDOWN_STORAGE = 'aiSiteManager.geminiCooldown.v1';
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

// ---- 모델 자동 탐색·기억 ----
// 키 자체는 저장하지 않고, 키 지문(해시)·길이만 모델 이름과 함께 기억한다.
let modelMemo = { fp: '', text: '', image: '', version: '' };

function keyFingerprint(key) {
  const s = String(key || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length}`;
}

function readModelCache(key) {
  const fp = keyFingerprint(key);
  if (modelMemo.fp === fp) return modelMemo;
  let found = { fp, text: '', image: '', version: '' };
  try {
    const raw = sessionStorage.getItem(GEMINI_MODEL_STORAGE);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.fp === fp) {
      found = { fp, text: String(parsed.text || ''), image: String(parsed.image || ''), version: String(parsed.version || '') };
    }
  } catch (e) {
    // sessionStorage를 못 쓰면 메모리 캐시만 쓴다.
  }
  modelMemo = found;
  return found;
}

export function rememberModel(apiKey, kind, model, version = API_VERSION) {
  const key = String(apiKey || '').trim();
  const name = String(model || '').trim();
  if (!key || !name) return;
  const cur = readModelCache(key);
  const next = { fp: cur.fp, text: cur.text, image: cur.image, version: version || cur.version || API_VERSION };
  if (kind === 'image') next.image = name;
  else next.text = name;
  modelMemo = next;
  try {
    sessionStorage.setItem(GEMINI_MODEL_STORAGE, JSON.stringify(next));
  } catch (e) {
    // ignore
  }
}

export function clearModelCache(apiKey) {
  const key = String(apiKey || '').trim();
  modelMemo = { fp: key ? keyFingerprint(key) : '', text: '', image: '', version: '' };
  try {
    sessionStorage.removeItem(GEMINI_MODEL_STORAGE);
    sessionStorage.removeItem(GEMINI_COOLDOWN_STORAGE);
  } catch (e) {
    // ignore
  }
  cooldownMemo = { fp: key ? keyFingerprint(key) : '', until: {} };
}

// ---- 잠깐 막힌 모델(쿨다운) ----
// 503·502·429는 키가 아니라 '그 모델'이 잠깐 막힌 것이라 다음 모델로 바꾸면 대개 바로 된다.
// 막힌 모델은 10분 동안 후보 뒤로 미룬다(빼지는 않는다 — 전부 막히면 결국 다시 시도한다).
const TRANSIENT_COOLDOWN_MS = 10 * 60 * 1000;
const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
let cooldownMemo = { fp: '', until: {} };

export function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.includes(Number(status) || 0);
}

function readCooldowns(key) {
  const fp = keyFingerprint(key);
  if (cooldownMemo.fp === fp) return cooldownMemo;
  let found = { fp, until: {} };
  try {
    const raw = sessionStorage.getItem(GEMINI_COOLDOWN_STORAGE);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.fp === fp && parsed.until && typeof parsed.until === 'object') {
      const now = Date.now();
      const until = {};
      for (const [name, t] of Object.entries(parsed.until)) {
        if (Number(t) > now) until[name] = Number(t);
      }
      found = { fp, until };
    }
  } catch (e) {
    // sessionStorage를 못 쓰면 메모리만 쓴다.
  }
  cooldownMemo = found;
  return found;
}

// 남은 쿨다운(ms). 0이면 지금 바로 써도 된다.
function coolingLeft(key, model) {
  const until = Number(readCooldowns(key).until[String(model || '')] || 0);
  const left = until - Date.now();
  return left > 0 ? left : 0;
}

function markCooling(apiKey, model) {
  const key = String(apiKey || '').trim();
  const name = String(model || '').trim();
  if (!key || !name) return;
  const cur = readCooldowns(key);
  const next = { fp: cur.fp, until: { ...cur.until, [name]: Date.now() + TRANSIENT_COOLDOWN_MS } };
  cooldownMemo = next;
  try {
    sessionStorage.setItem(GEMINI_COOLDOWN_STORAGE, JSON.stringify(next));
  } catch (e) {
    // ignore
  }
}

function clearCooling(apiKey, model) {
  const key = String(apiKey || '').trim();
  const name = String(model || '').trim();
  if (!key || !name) return;
  const cur = readCooldowns(key);
  if (!cur.until[name]) return;
  const until = { ...cur.until };
  delete until[name];
  const next = { fp: cur.fp, until };
  cooldownMemo = next;
  try {
    sessionStorage.setItem(GEMINI_COOLDOWN_STORAGE, JSON.stringify(next));
  } catch (e) {
    // ignore
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 구글 응답·오류 문장에 키가 섞여 돌아오는 경우가 있어, 화면·로그로 나가기 전에 지운다.
export function scrubSecret(text, apiKey = '') {
  let out = String(text || '');
  const key = String(apiKey || '').trim();
  if (key) out = out.split(key).join('[키 숨김]');
  return out
    .replace(/key=[^&\s"']+/gi, 'key=[키 숨김]')
    .replace(/AIza[0-9A-Za-z_\-]{10,}/g, '[키 숨김]')
    .slice(0, 200);
}

async function readApiError(res, apiKey = '') {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return scrubSecret(json?.error?.message || '', apiKey);
    } catch (e) {
      return scrubSecret(text, apiKey);
    }
  } catch (e) {
    return '';
  }
}

// 모델 하나에 generateContent를 한 번 보낸다. 네트워크·HTTP 오류는 던지지 않고 결과로 돌려준다.
async function postGenerate(apiKey, model, body, timeoutMs = 25000, version = '') {
  const url = `${API_ROOT}/${version || API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetchWithTimeout(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      timeoutMs
    );
  } catch (e) {
    return { ok: false, model, reason: e?.name === 'AbortError' ? 'timeout' : scrubSecret(e?.message || 'network', apiKey), status: 0, notFound: false };
  }
  if (!res.ok) {
    const detail = await readApiError(res, apiKey);
    return { ok: false, model, reason: `gemini_http_${res.status}`, status: res.status, detail, notFound: res.status === 404 };
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { ok: false, model, reason: 'bad_json', status: 0, notFound: false };
  }
  return { ok: true, model, data };
}

async function listModelsAt(version, apiKey, timeoutMs) {
  const models = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const q = new URLSearchParams({ pageSize: '100', key: apiKey });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await fetchWithTimeout(`${API_ROOT}/${version}/models?${q.toString()}`, { method: 'GET' }, timeoutMs);
    if (!res.ok) throw new Error(`models_http_${res.status}`);
    const data = await res.json();
    const batch = Array.isArray(data?.models) ? data.models : [];
    for (const m of batch) {
      models.push({
        id: String(m?.name || '').replace(/^models\//, ''),
        methods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods.map(String) : [],
      });
    }
    pageToken = String(data?.nextPageToken || '');
    if (!pageToken || !batch.length) break;
  }
  return models;
}

// GET /v1beta/models — 이 키로 실제 쓸 수 있는 모델 목록. v1beta가 막히면 v1도 시도한다.
export async function listGeminiModels(apiKey, { timeoutMs = 12000 } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('no_key');
  const cachedVersion = readModelCache(key).version;
  const versions = [...new Set([cachedVersion, ...API_VERSIONS].filter(Boolean))];
  let lastError = null;
  for (const version of versions) {
    try {
      const models = await listModelsAt(version, key, timeoutMs);
      if (models.length) return { version, models };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('models_empty');
}

function modelVersion(id) {
  const m = String(id).match(/^gemini-(\d+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1]) || 0;
  return /^gemini-flash/.test(String(id)) ? 1.5 : 0;
}

// 404면 이 목록에서 'flash' 계열 텍스트 모델 중 최신을 고른다. (image·embedding·tts 제외)
function textModelScore(id) {
  const s = String(id || '');
  if (!/^gemini/i.test(s)) return -1;
  if (/image|embedding|embed|aqa|tts|audio|live|imagen|veo|robotics|computer-use/i.test(s)) return -1;
  if (!/flash/i.test(s)) return -1;
  let score = modelVersion(s) * 100;
  if (/-lite/i.test(s)) score -= 60; // lite는 한 세대 아래 full flash보다도 뒤로
  if (/preview|exp/i.test(s)) score -= 12;
  if (/-thinking/i.test(s)) score -= 8;
  if (/-8b/i.test(s)) score -= 5;
  if (/-latest$/.test(s)) score += 6;
  if (/[-_]\d{3}$/.test(s)) score -= 4;
  return score;
}

export function pickTextModel(ids = []) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  const scored = list.map((id) => ({ id, score: textModelScore(id) })).filter((x) => x.score > 0);
  if (!scored.length) return '';
  // 가장 높은 점수(최신 flash) 안에서만 알려진 이름 순서를 따른다.
  const best = Math.max(...scored.map((x) => x.score));
  const tied = scored.filter((x) => x.score === best).map((x) => x.id);
  for (const name of TEXT_MODEL_CANDIDATES) if (tied.includes(name)) return name;
  return tied.sort((a, b) => a.localeCompare(b))[0];
}

// 404면 'image'가 들어간 gemini 이미지 모델 중 최신을 고른다. (imagen은 :predict라 제외)
function imageModelScore(id) {
  const s = String(id || '');
  if (!/^gemini/i.test(s) || !/image/i.test(s)) return -1;
  let score = modelVersion(s) * 100;
  if (/-image$/.test(s)) score += 20;
  if (/preview|exp/i.test(s)) score -= 10;
  return score;
}

export function pickImageModel(ids = []) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  const scored = list.map((id) => ({ id, score: imageModelScore(id) })).filter((x) => x.score > 0);
  if (!scored.length) return '';
  const best = Math.max(...scored.map((x) => x.score));
  const tied = scored.filter((x) => x.score === best).map((x) => x.id);
  for (const name of IMAGE_MODEL_CANDIDATES) if (tied.includes(name)) return name;
  return tied.sort((a, b) => a.localeCompare(b))[0];
}

// 404 뒤에 부를 목록 조회. 실패해도 예외를 던지지 않는다(정적 후보로 계속 시도).
async function discoverModels(apiKey, kind, timeoutMs) {
  try {
    const { version, models } = await listGeminiModels(apiKey, { timeoutMs: Math.min(timeoutMs || 12000, 12000) });
    const usable = models.filter((m) => m.methods.includes('generateContent')).map((m) => m.id);
    const preferred = kind === 'image' ? pickImageModel(usable) : pickTextModel(usable);
    return { ok: true, version, ids: usable, preferred };
  } catch (e) {
    return { ok: false, reason: e?.message || 'models_failed', ids: [], preferred: '' };
  }
}

function geminiError(attempt) {
  const err = new Error(attempt?.reason || 'gemini_failed');
  err.status = attempt?.status || 0;
  err.detail = attempt?.detail || '';
  return err;
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

// 텍스트 호출 — 기억한 모델 → 알려진 이름 → (404면) 실제 모델 목록 순서.
// 404(이름 바뀜)·503·502·429(잠깐 막힘)면 다음 모델로 자동 재시도하고,
// 400·403·시간초과처럼 모델을 바꿔도 같은 오류만 바로 알린다.
const MAX_TEXT_ATTEMPTS = 5;

export async function callGemini({ apiKey, parts, timeoutMs = 25000, temperature = 0.2 }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('no_key');
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  };

  const cache = readModelCache(key);
  let usedVersion = cache.version;
  const pending = [];
  for (const m of [cache.text, ...TEXT_MODEL_CANDIDATES]) {
    const name = String(m || '').trim();
    if (name && !pending.includes(name)) pending.push(name);
  }
  const tried = [];
  let discovered = false;
  let attempt = null;

  // 후보 중 '지금 쿨다운이 풀린' 모델을 먼저 고른다(같으면 원래 순서).
  const takeNext = () => {
    let bestIdx = -1;
    let bestLeft = Infinity;
    pending.forEach((m, i) => {
      if (tried.includes(m)) return;
      const left = coolingLeft(key, m);
      if (left < bestLeft) {
        bestLeft = left;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return '';
    return pending.splice(bestIdx, 1)[0];
  };

  while (tried.length < MAX_TEXT_ATTEMPTS) {
    const model = takeNext();
    if (!model) break;
    tried.push(model);
    attempt = await postGenerate(key, model, body, timeoutMs, usedVersion);
    if (attempt.ok) {
      clearCooling(key, model);
      break;
    }

    if (attempt.notFound) {
      // 이름이 바뀐 경우 — 이 키로 실제 쓸 수 있는 모델을 찾아 후보 맨 앞에 넣는다.
      if (!discovered) {
        discovered = true;
        const found = await discoverModels(key, 'text', timeoutMs);
        if (found.ok) {
          usedVersion = found.version;
          const ranked = found.ids
            .map((id) => ({ id, score: textModelScore(id) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.id);
          const fresh = [...new Set([found.preferred, ...ranked].filter(Boolean))].filter(
            (id) => !tried.includes(id) && !pending.includes(id)
          );
          pending.unshift(...fresh);
        }
      }
      continue;
    }

    if (isRetryableStatus(attempt.status)) {
      // 503·502·429 — 그 모델만 잠깐 막힌 것. 다음 모델로 넘어가고, 이 모델은 잠시 뒤로 미룬다.
      markCooling(key, model);
      continue;
    }

    break; // 400·403·키 오류·시간초과는 모델을 바꿔도 같다
  }

  if (!attempt || !attempt.ok) throw geminiError(attempt || { reason: 'failed' });
  rememberModel(key, 'text', attempt.model, usedVersion);
  const raw = (attempt.data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || '')
    .filter(Boolean)
    .join('\n');
  return { raw, json: parseGeminiJson(raw), model: attempt.model };
}


// 조사한 2026 실견적 419건 DB · 현장 고충/노하우 84건 · 법령/판례에서 뽑은 기준 지식.
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

{"trade":"공종ID","tradeName":"공종이 목록에 없을 때만 한글 이름","title":"현장 제목(지역+규모+공종)","sizeValue":"숫자 문자열 또는 빈 문자열","sizeUnit":"평|㎡|m|칸|개|개소|톤|명|모름","floor":"숫자 문자열 또는 빈 문자열","elevator":"yes|no|unknown","siteCondition":"사진·글로 본 현장 상태(노후 싱크대, 누수 흔적 등)","materials":["필요 자재 3~6개, 규격 포함"],"crew":[{"role":"역할","count":숫자}],"priceRange":{"min":숫자,"max":숫자},"surveyChecks":[{"label":"답사에서 확인할 것","why":"놓치면 생기는 일","how":"어떻게 확인하는지","amount":예상 추가비 만원 숫자}],"wishText":"문의/희망사항 전문 그대로","firstCallQuestions":["이 현장을 위해 첫 통화에 고객에게 물어볼 것 3개 — 사장님이 그대로 읽을 수 있는 말투, 현장·공종에 맞춤"],"missingCosts":[{"label":"빠뜨리기 쉬운 비용","range":"참고 5~12만","amount":8,"why":"왜 필요한지"}],"materialOrders":[{"vendor":"발주처(예: 벽지 도매상·골재상·철물점)","items":[{"name":"품명","spec":"규격","qty":"수량"}],"tip":"이 업체에서 사는 요령 한 줄","footer":"납기·받는 곳"}],"costBreakdown":[{"label":"인건비","detail":"기공 2명 × 27만 × 2일 + 보조 1명 × 19만 × 2일","amount":108}],"signal":{"level":"green|yellow|red","title":"판정 한 줄","reason":"근거 한 줄"},"buildPlan":{"phases":[{"label":"전날 · 준비","items":["할 일","할 일"]},{"label":"당일 · 시공","items":[]},{"label":"완료 · 정산","items":[]}],"checks":[{"label":"현장에서 확인할 것","why":"왜"}],"tell":"인부에게 이렇게 말하세요","notes":["이 현장 특이사항"]}},"includedScopes":["bathroom|kitchen|wallpaper|entrance|demolition|plaster|carpentry|electric|plumbing|film|window"],"excludedScopes":["window 등 고객이 빼라고 한 공종"],"summary":"한 문장 요약","warnings":["놓치면 손해 보는 점 0~3개"]}

공종ID 목록(반드시 이 중 하나): ${GEMINI_TRADES.join(', ')}
- 목공/문·몰딩·가구·데크=carpentry, 전기·조명·콘센트=electric, 배관·수도·보일러=plumbing, 필름·시트지=film, 맨땅·터파기·기초·토목=groundwork
- 주방(부엌·싱크대·상부장·하부장·후드)=kitchen, 욕실=bathroom, 도배·장판=wallpaper, 철거=demolition, 폐기물=waste, 인력=labor
- 두 공종 이상 섞인 전체 인테리어=combined, 정말 모르면 custom
priceRange는 부가세 별도, 만원 단위의 보수적 범위다.
materialOrders는 이 현장 공종에 실제로 필요한 자재만 2~5개 업체로 나눈다. 예) 철거=마대·보양재·집게차/덤프, 기초·정지=쇄석·시멘트·메쉬·굴삭기·다짐기·잔토 반출, 도배=벽지·풀·초배지·장판, 욕실=타일·도기·방수재, 주방=싱크대·상판·수전.
- 현장에 없는 공종 자재(예: 철거+정지 현장의 합지·포세린·도기)는 절대 넣지 않는다.
- 수량은 규모(평·㎡·칸·m)로 계산해 '12롤', '3포(40kg)', '1대 2일'처럼 실제 발주 단위로 쓴다.`;

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
    firstCallQuestions: Array.isArray(data.firstCallQuestions)
      ? data.firstCallQuestions.map((q) => String(q || '').slice(0, 90)).filter(Boolean).slice(0, 3)
      : [],
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
              ? { label: x, why: '', how: '', amount: 0 }
              : {
                  label: String(x?.label || ''),
                  why: String(x?.why || ''),
                  how: String(x?.how || ''),
                  amount: Math.max(0, Math.round(parseFloat(x?.amount) || 0)),
                }
          )
          .filter((x) => x.label)
          .slice(0, 8)
      : [],
    materialOrders: Array.isArray(data.materialOrders)
      ? data.materialOrders
          .map((g, i) => {
            const items = (Array.isArray(g?.items) ? g.items : [])
              .map((it) => ({ name: String(it?.name || '').slice(0, 40), spec: String(it?.spec || '').slice(0, 40), qty: String(it?.qty || '').slice(0, 30) }))
              .filter((it) => it.name)
              .slice(0, 8);
            if (!items.length) return null;
            const vendor = String(g?.vendor || '자재상').slice(0, 30);
            const tips = [String(g?.tip || '').slice(0, 140)].filter(Boolean);
            const footer = String(g?.footer || '').slice(0, 60);
            return {
              id: `ai-order-${i}`,
              vendor,
              tone: ['amber', 'cyan', 'slate', 'orange', 'indigo', 'rose'][i % 6],
              items,
              tips,
              footer,
              ai: true,
              message: [`[자재 발주] ${vendor}`, ...items.map((it) => `· ${it.name}${it.spec ? ` / ${it.spec}` : ''} — ${it.qty}`), ...(footer ? ['', footer] : [])].join('\n'),
            };
          })
          .filter(Boolean)
          .slice(0, 6)
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

// 답사 가이드(AI) — 3자 검증의 '꼭 확인할 것'과 3단계 답사의 '왜·뭘 확인' 카드를 이 현장에 맞춰 만든다.
const SURVEY_GUIDE_PROMPT = `너는 경북 안동의 철거·인테리어 현장 매니저를 돕는 '답사 코치'다.
이 현장(공종·규모·건물 종류·관공서 공고 여부·층수/엘베)에 맞춰, 답사에서 무엇을 왜 어떻게 확인해야 하는지 아래 JSON만 답한다. 설명 문장은 넣지 않는다.

{"rows":[{"check":"현장에서 확인할 것(짧은 명사형)","why":"놓치면 생기는 일과 돈 새는 금액(만원)","how":"어떻게 확인하는지(현장에서 할 행동)"}],"tips":["답사 때 꼭 볼 것 4개 — 20자 이내"],"comment":"이 현장에서 돈이 새는 곳을 짚는 한두 문장"}

규칙:
- rows는 정확히 4개. 이 공종·규모에서 실제로 갈리는 것만. '현장을 꼼꼼히 본다' 같은 일반론 금지.
- why에는 가능한 한 금액(만원)을 넣는다. 아래 2026 기준 단가를 따른다.
- 관공서 공고 현장이면 설계내역서·물량 산출·현장설명회를 먼저 본다.
- how는 사장님이 현장에서 바로 할 수 있는 행동 한 줄.
- tips는 4개, 각 20자 이내. rows와 같은 말을 반복하지 않는다.
- 공종이 철거·폐기물·인력·토목이면 인테리어 마감 얘기를 넣지 않는다.`;

export async function analyzeSurveyGuideWithGemini({ apiKey, context = '' }) {
  const key = apiKey || getGeminiKey();
  if (!key) return { ok: false, reason: 'no_key' };
  const parts = [
    { text: `${SURVEY_GUIDE_PROMPT}\n${GEMINI_KNOWLEDGE}\n\n[현장]\n${String(context || '').slice(0, 2000)}` },
  ];
  try {
    const { json, model } = await callGemini({ apiKey: key, parts });
    const rows = (Array.isArray(json?.rows) ? json.rows : [])
      .map((x) =>
        typeof x === 'string'
          ? { check: x, why: '', how: '' }
          : { check: String(x?.check || x?.label || '').slice(0, 60), why: String(x?.why || '').slice(0, 160), how: String(x?.how || '').slice(0, 160) }
      )
      .filter((x) => x.check)
      .slice(0, 4);
    if (!rows.length) return { ok: false, reason: 'empty' };
    const tips = (Array.isArray(json?.tips) ? json.tips : [])
      .map((t) => String(t || '').slice(0, 40))
      .filter(Boolean)
      .slice(0, 4);
    return {
      ok: true,
      data: {
        rows,
        tips,
        comment: String(json?.comment || '').slice(0, 300),
        model: model || '',
        at: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, reason: e?.message || 'gemini_failed' };
  }
}

// ---- 전문가 감리 검증 — 가견적을 그대로 반복하지 않는 독립 리포트 ----
const EXPERT_AUDIT_PROMPT = `너는 한국에서 20년 넘게 철거·인테리어 현장을 지켜본 현장 감리이자 제3자 견적 검증 전문가다.
아래 현장의 '가견적'을 손님이 아니라 우리(시공자) 편에서 독립 검증한다. 절대 견적 계산을 그대로 옮겨 적지 마라.
1) market: 이 현장 조건에서 시장 호가 대비 우리 견적이 어떤 위치인지 감리 의견 한 줄(예: "같은 조건 실견적 대비 중상단, 자재 등급 근거를 문서로 보여줘야 수주된다").
2) risks: 이 현장 조건(건물 연식·층수·엘베·공종·거주 여부)에서 가견적에 안 잡혔을 확률이 높은 추가 비용 2~3개.
   각 항목은 {"title":"짧은 제목(20자)","why":"왜 이 현장에서 터지는지 구체적으로(80자)","cost":"예상 추가 비용 범위(만원)","action":"지금 할 행동 한 줄","severity":"high|mid|low"}.
3) contract: 손해 안 보고 수주하기 위해 첫 통화·계약서에 반드시 넣어야 할 방어 조항 1~2줄(각 80자 이내).
4) headline: 30자 이내 결론 한 줄. summary: 2문장 이내.
금액은 만원 단위. 실제 2026 단가·판례 기준을 따르고, 없는 숫자를 지어내지 마라.
JSON만 답해: {"headline":"","summary":"","market":"","risks":[{"title":"","why":"","cost":"","action":"","severity":"high"}],"contract":[""]}`;

export async function analyzeExpertAuditWithGemini({ apiKey, context = '' }) {
  const key = apiKey || getGeminiKey();
  if (!key) return { ok: false, reason: 'no_key' };
  const parts = [{ text: `${EXPERT_AUDIT_PROMPT}\n${GEMINI_KNOWLEDGE}\n\n[현장]\n${String(context || '').slice(0, 2000)}` }];
  try {
    const { json, model } = await callGemini({ apiKey: key, parts });
    if (!json || typeof json !== 'object') return { ok: false, reason: 'empty' };
    const risks = (Array.isArray(json.risks) ? json.risks : [])
      .map((r) => ({
        title: String(r?.title || r?.name || '').slice(0, 40),
        why: String(r?.why || r?.detail || '').slice(0, 200),
        cost: String(r?.cost || '').slice(0, 60),
        action: String(r?.action || r?.fix || '').slice(0, 160),
        severity: ['high', 'mid', 'low'].includes(r?.severity) ? r.severity : 'mid',
      }))
      .filter((r) => r.title)
      .slice(0, 3);
    const contract = (Array.isArray(json.contract) ? json.contract : [json.contract])
      .map((t) => String(t || '').slice(0, 160))
      .filter(Boolean)
      .slice(0, 2);
    if (!risks.length) return { ok: false, reason: 'empty' };
    return {
      ok: true,
      data: {
        headline: String(json.headline || '').slice(0, 120),
        summary: String(json.summary || '').slice(0, 300),
        market: String(json.market || json.marketComment || '').slice(0, 300),
        risks,
        contract,
        model: model || '',
        at: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, reason: e?.message || 'gemini_failed' };
  }
}

// 실패 이유를 사장님이 읽을 수 있는 한 줄로 바꾼다.
function geminiHint(e) {
  const status = Number(e?.status) || 0;
  const reason = String(e?.message || '');
  if (reason === 'no_key') return '';
  if (status === 404) return '이 키로 쓸 수 있는 모델을 찾지 못했습니다. 잠시 뒤 다시 누르거나 키 발급 페이지에서 새 키를 만들어 보세요.';
  if (status === 400) return '키가 올바르지 않거나 Gemini API에서 쓸 수 없는 키입니다. 키를 다시 확인하세요.';
  if (status === 403) return '이 키에 Gemini API 사용 권한이 없습니다. Google AI Studio에서 API 사용 설정을 확인하세요.';
  if (status === 429) return '무료 사용량 한도를 넘었습니다. 다른 모델로 자동 전환해 봤지만 모두 한도였습니다. 잠시 후 다시 시도하세요.';
  if (status === 503 || status === 502 || status === 504) return '구글이 잠깐 과부하 상태입니다. 다른 모델로 자동 전환해 봤지만 모두 막혔습니다. 1~2분 뒤 다시 눌러 주세요.';
  if (reason === 'timeout') return '응답이 없습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.';
  return '';
}

// 연결 테스트 — 실제로 어떤 모델에 붙었는지(model)까지 돌려준다.
export async function testGeminiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, reason: 'no_key' };
  try {
    const { model } = await callGemini({
      apiKey: key,
      parts: [{ text: 'JSON만 답해. {"ok":true}' }],
      timeoutMs: 15000,
    });
    return { ok: true, model: model || 'gemini' };
  } catch (e) {
    return { ok: false, reason: e?.message || 'failed', status: e?.status || 0, detail: e?.detail || '', hint: geminiHint(e) };
  }
}

// ---- Before → After 완공 예상 이미지 ----
// 이미지 모델은 응답 형태가 달라서 모델을 바꿔가며 시도한다(404면 목록에서 자동 탐색).

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

  const cache = readModelCache(key);
  const tried = [];
  let lastReason = 'failed';
  let version = cache.version;
  let worthDiscovering = false;

  const tryModel = async (model) => {
    if (!model || tried.includes(model)) return null;
    tried.push(model);
    const r = await postGenerate(key, model, body, timeoutMs, version);
    lastReason = r.ok ? 'no_image_in_response' : r.reason;
    return r;
  };

  const accept = (r) => {
    if (!r || !r.ok) return null;
    const dataUrl = extractInlineImage(r.data);
    if (!dataUrl) return null;
    clearCooling(key, r.model);
    rememberModel(key, 'image', r.model, version);
    return { ok: true, dataUrl, model: r.model };
  };

  // 이미지 모델도 텍스트와 같다 — 503·502·429면 다음 이미지 모델로 넘어간다.
  const handleFailure = (r, model) => {
    if (!r) return 'next';
    if (r.ok) return 'stop'; // 응답은 왔는데 이미지가 없다 → 모델을 바꿔도 같다
    if (isRetryableStatus(r.status)) {
      markCooling(key, model);
      return 'next';
    }
    if (r.notFound || r.status === 400) {
      worthDiscovering = true;
      return 'next';
    }
    return 'stop'; // 403·시간초과 등
  };

  // 1) 기억한 이미지 모델 → 알려진 이미지 모델 (쿨다운 중인 모델은 뒤로)
  const firstModels = [...new Set([cache.image, ...IMAGE_MODEL_CANDIDATES].filter(Boolean))].sort(
    (a, b) => coolingLeft(key, a) - coolingLeft(key, b)
  );
  for (const model of firstModels) {
    const r = await tryModel(model);
    const good = accept(r);
    if (good) return good;
    if (handleFailure(r, model) === 'stop') break;
  }

  // 2) 404·400이면 실제 목록에서 이미지 모델 자동 탐색
  if (worthDiscovering) {
    const found = await discoverModels(key, 'image', timeoutMs);
    if (found.ok) {
      version = found.version;
      const queue = [found.preferred, ...found.ids.filter((id) => imageModelScore(id) > 0)].filter(Boolean);
      for (const model of queue) {
        const r = await tryModel(model);
        const good = accept(r);
        if (good) return good;
        if (handleFailure(r, model) === 'stop') break;
      }
    }
  }

  return { ok: false, reason: lastReason };
}
