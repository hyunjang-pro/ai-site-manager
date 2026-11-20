// 브라우저 무료 OCR — tesseract.js(kor+eng). 키·서버 없이 스크린샷 글자를 읽는다.
// 첫 실행 때 언어 데이터(수 MB)를 CDN에서 받으므로 인터넷이 필요합니다.
// 읽은 글자는 바로 cleanOcrText로 후처리해서 폰 상단바·앱 UI 잡글자를 걸러낸다.
let workerPromise = null;
let progressCb = null;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker('kor+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && progressCb) progressCb(Math.round((m.progress || 0) * 100));
      },
    });
  })();
  return workerPromise;
}

// 스크린샷에 같이 찍히는 폰 상단바·앱 버튼 문구. 이 줄은 현장 내용이 아니므로 버린다.
const UI_WORDS = [
  '삭제하기',
  '요청 상세',
  '요청상세',
  '상세보기',
  '공유하기',
  '더보기',
  '신고하기',
  '차단하기',
  '답장하기',
  '복사하기',
  '저장하기',
  '채팅하기',
  '견적 보내기',
  '견적 받기',
  '바로 견적',
  '고수 찾기',
  '알림',
  '설정',
  '메뉴',
  '닫기',
  '뒤로',
  '취소',
  '확인',
  '홈',
  '프로필',
  '리뷰',
  '찜',
];

const UI_LINE = new RegExp(`^[<«》\\[\\]()\\s]*(${UI_WORDS.join('|')})[\\s>»\\])]*$`);
const UI_META =
  /(견적\s*(보낸|받은)\s*고수|고수\s*\d+\s*명|\d+\s*(일|시간|분)\s*전\s*$|채팅\s*하기|평점|응답률|재로그인|앱에서\s*보기|전체\s*보기|더\s*보기|숨고|soomgo|SUMGGO|크몽|카카오톡|톡\s*서랍)/i;
const CLOCK = /^(\d{1,2}:\d{2}(:\d{2})?|(오전|오후)\s*\d{1,2}:\d{2})/;
const STATUS = /^(배터리|LTE|5G|Wi-?Fi|VPN|알림\s*끄기|무음|진동)\b/i;
const UNIT_OK = /\d+(\.\d+)?\s*(평|㎡|m2|m|칸|개|개소|층|명|일|톤|원|만원?|%)/i;

function hangulCount(s) {
  return (s.match(/[가-힣]/g) || []).length;
}

function symbolRatio(s) {
  const compact = s.replace(/\s/g, '');
  if (!compact) return 1;
  const symbols = (compact.match(/[^가-힣a-zA-Z0-9]/g) || []).length;
  return symbols / compact.length;
}

// 한 줄이 현장 내용인지 판단한다. (핵심 줄은 절대 지우지 않는다)
function isNoiseLine(line) {
  const s = line.replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (s.length <= 1) return true;
  if (CLOCK.test(s)) return true;
  if (STATUS.test(s)) return true;
  if (/^[\d%.,:\s]+$/.test(s)) return true;
  if (UI_LINE.test(s)) return true;
  if (s.length <= 40 && UI_META.test(s)) return true;
  // 꺾쇠·기호로 시작하는 아주 짧은 조각: "< 삭제", "> 요청", "~>d"
  if (/^[<«》>\](){}~^\\/|_-]+/.test(s) && s.replace(/^[^가-힣a-zA-Z0-9]+/, '').length <= 3) return true;

  const hangul = hangulCount(s);
  const hasUnit = UNIT_OK.test(s);

  // 한글이 1자 이하 + 짧은 줄 = 깨진 인식 조각 ("표 ~>d", "1개의 oi u")
  if (hangul <= 1 && s.length <= 12 && !hasUnit) return true;
  // 짧은 영문 조각이 섞인 잡음 줄 ("oi u", "d")
  if (/(\b[a-zA-Z]{1,2}\b[\s.,:]*){1,}/.test(s) && hangul <= 2) return true;
  // 한글이 아예 없는 짧은 줄 (기호·영문 잡글자)
  if (hangul === 0 && s.length <= 14 && !hasUnit) return true;
  // 기호 비율이 절반을 넘는 줄
  if (symbolRatio(s) > 0.5 && hangul <= 2) return true;
  return false;
}

export function cleanOcrText(raw) {
  const text = String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ');
  const out = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (isNoiseLine(line)) continue;
    if (out.length && out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

// 잡글자가 얼마나 걸러졌는지 화면에서 보여주기 위한 요약
export function ocrNoiseSummary(raw, cleaned) {
  const before = String(raw || '').split('\n').filter((l) => l.trim()).length;
  const after = String(cleaned || '').split('\n').filter((l) => l.trim()).length;
  return { before, after, removed: Math.max(0, before - after) };
}

export async function ocrFiles(files, onProgress, { clean = true } = {}) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return '';
  progressCb = onProgress || null;
  const worker = await getWorker();
  const texts = [];
  for (let i = 0; i < list.length; i += 1) {
    if (onProgress) onProgress(0, i + 1, list.length);
    // eslint-disable-next-line no-await-in-loop
    const { data } = await worker.recognize(list[i]);
    texts.push(String(data?.text || ''));
  }
  const joined = texts.join('\n').trim();
  return clean ? cleanOcrText(joined) : joined;
}

export async function ocrWithTimeout(files, onProgress, ms = 120000) {
  return Promise.race([
    ocrFiles(files, onProgress),
    new Promise((_, reject) => setTimeout(() => reject(new Error('사진 글자 읽기가 오래 걸립니다. 직접 입력해 주세요.')), ms)),
  ]);
}

export async function disposeOcr() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch (e) {
    // ignore
  }
  workerPromise = null;
}
