// 사진 → 썸네일(dataUrl). 저장 용량을 줄이면서 OCR에도 쓸 수 있게 한다.
//
// 2026-11-27 제보로 고친 것:
//  ① `files.map(fileToThumb)`처럼 넘기면 Array.map이 (파일, **인덱스**)를 넣어 두 번째 인자(max)가
//     0·1·2가 되고, 썸네일이 1px로 뭉개졌다. 이제 max가 이상하면 기본값으로 돌아간다.
//  ② 스샷 OCR은 글자가 작아서 900px로 줄이면 '상업공간 인테리어' 같은 줄이 통째로 사라지고
//     '8m'이 '800'으로 읽혔다. 스샷은 1600px로 남기고, 저장 용량이 크면 단계적으로 줄인다.
export const THUMB_SCREENSHOT = 2400;
export const THUMB_PHOTO = 1200;
export const THUMB_DEFAULT = 900;
const MAX_DATAURL = 300000; // 글자 수 기준(약 300KB) — 스샷 6장까지 localStorage에 들어가는 선

function draw(img, limit, quality) {
  const scale = Math.min(1, limit / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function fileToThumb(file, max = THUMB_DEFAULT, quality = 0.72) {
  const limit = Number.isFinite(max) && max >= 200 ? max : THUMB_DEFAULT;
  const q = Number.isFinite(quality) && quality > 0.3 && quality <= 1 ? quality : 0.72;
  return new Promise((resolve) => {
    if (!file || !String(file.type || '').startsWith('image/')) return resolve({ name: file?.name || 'file', dataUrl: '' });
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let dataUrl = draw(img, limit, q);
          // 너무 크면 저장 한도를 넘기 전에 한 단계 줄인다 (사진 6장이면 1.4MB까지 차던 것)
          // 해상도를 먼저 깎으면 OCR이 글자를 놓친다 — 화질을 낮춰 보고, 그래도 크면 그때 크기를 줄인다.
          if (dataUrl.length > MAX_DATAURL) dataUrl = draw(img, limit, 0.6);
          if (dataUrl.length > MAX_DATAURL) dataUrl = draw(img, Math.min(limit, 1600), 0.55);
          if (dataUrl.length > MAX_DATAURL) dataUrl = draw(img, 1200, 0.5);
          resolve({ name: file.name, dataUrl });
        } catch (e) {
          resolve({ name: file.name, dataUrl: '' });
        }
      };
      img.onerror = () => resolve({ name: file.name, dataUrl: '' });
      img.src = reader.result;
    };
    reader.onerror = () => resolve({ name: file.name, dataUrl: '' });
    reader.readAsDataURL(file);
  });
}
