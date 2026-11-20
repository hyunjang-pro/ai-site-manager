// 사진 → 썸네일(dataUrl). 저장 용량을 줄이면서 OCR에도 쓸 수 있게 한다.
export function fileToThumb(file, max = 900) {
  return new Promise((resolve) => {
    if (!file || !String(file.type || '').startsWith('image/')) return resolve({ name: file?.name || 'file', dataUrl: '' });
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.72) });
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
