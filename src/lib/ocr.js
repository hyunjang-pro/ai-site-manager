// 브라우저 무료 OCR — tesseract.js(kor+eng). 키·서버 없이 스크린샷 글자를 읽는다.
// 첫 실행 때 언어 데이터(수 MB)를 CDN에서 받으므로 인터넷이 필요합니다.
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

export async function ocrFiles(files, onProgress) {
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
  return texts.join('\n').trim();
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
