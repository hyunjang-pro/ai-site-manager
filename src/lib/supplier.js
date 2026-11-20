// 우리 시공업체 정보 — 한 번 저장하면 다음 현장 서류에 자동으로 채운다 (이 브라우저에만 저장)
const KEY = 'aiSiteManager.supplier';
export const EMPTY_SUPPLIER = { name: '', owner: '', bizNo: '', phone: '', address: '', account: '' };

export function getSupplier() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_SUPPLIER };
    return { ...EMPTY_SUPPLIER, ...JSON.parse(raw) };
  } catch (e) {
    return { ...EMPTY_SUPPLIER };
  }
}

export function saveSupplier(info) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...EMPTY_SUPPLIER, ...info }));
    return true;
  } catch (e) {
    return false;
  }
}
