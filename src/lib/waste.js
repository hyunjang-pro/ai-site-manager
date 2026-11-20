// 폐기물 성상 분리 계산기 (P0-1)
// 2026.1.1 적용 한국건설자원협회 고시 성상별 중간처리단가 (원/톤, VAT·수집운반비 별도)
export const WASTE_UNIT_PRICE = {
  concrete: { label: '폐콘크리트', price: 31142, note: '이물질 없는 순수 콘크리트' },
  construction: { label: '건설폐재류', price: 49571, note: '폐콘크리트·폐벽돌·폐기와·폐토사' },
  mixed: { label: '혼합건설폐기물', price: 72721, note: '건설폐재류 + 가연성 5% 이하' },
  nonflammable: { label: '기타 혼합(불연성)', price: 188715, note: '폐유리·폐타일·폐자기' },
  boardMixed: { label: '폐보드·판넬 혼합', price: 192887, note: '폐보드류·폐판넬 + 가연성 5% 이하' },
  asbestos: { label: '폐석면', price: 645000, note: '지정폐기물 — 별도 등록업체' },
};

export const WASTE_SCOPES = [
  { id: 'floor', label: '바닥 마루·장판', material: 'mixed', kgPerSqm: 10, defaultArea: 60 },
  { id: 'tile', label: '욕실 타일', material: 'nonflammable', kgPerSqm: 22, defaultArea: 12 },
  { id: 'ceiling', label: '천장 텍스', material: 'boardMixed', kgPerSqm: 8, defaultArea: 55 },
  { id: 'wall', label: '경량벽체', material: 'boardMixed', kgPerSqm: 12, defaultArea: 20 },
  { id: 'masonry', label: '조적·콘크리트', material: 'concrete', kgPerSqm: 170, defaultArea: 4 },
  { id: 'kitchen', label: '주방 가구', material: 'mixed', kgPerSqm: 30, defaultArea: 4 },
  { id: 'fixture', label: '위생도기·수전', material: 'nonflammable', kgPerSqm: 0, defaultArea: 0, perSet: 50, sets: 2 },
];

export function emptyWasteScopes() {
  const out = {};
  WASTE_SCOPES.forEach((s) => {
    out[s.id] = { on: false, area: s.defaultArea };
  });
  return out;
}

export function computeWaste(waste = {}, c = null) {
  const scopes = { ...emptyWasteScopes(), ...(waste.scopes || {}) };
  const byMaterial = {};
  let totalKg = 0;

  WASTE_SCOPES.forEach((s) => {
    const row = scopes[s.id];
    if (!row || !row.on) return;
    const area = Math.max(0, parseFloat(row.area) || 0);
    let kg = area * s.kgPerSqm;
    if (s.perSet) kg = (Math.max(0, parseFloat(row.sets) || s.sets || 0) || 0) * s.perSet;
    if (kg <= 0) return;
    totalKg += kg;
    byMaterial[s.material] = (byMaterial[s.material] || 0) + kg;
  });

  // 폐기물 단독 현장(2.5톤 등)은 현장 톤수를 그대로 기본값으로 쓴다 — 0톤으로 보이지 않게.
  const directTons = c && c.sizeUnit === '톤' ? Math.max(0, parseFloat(c.sizeValue) || 0) : 0;
  if (directTons > 0 && totalKg <= 0) {
    totalKg = directTons * 1000;
    byMaterial.mixed = (byMaterial.mixed || 0) + totalKg;
  }

  const totalTons = +(totalKg / 1000).toFixed(2);
  let separatedWon = 0;
  Object.entries(byMaterial).forEach(([mat, kg]) => {
    separatedWon += (kg / 1000) * (WASTE_UNIT_PRICE[mat]?.price || 0);
  });

  // 섞으면: 석고보드·판넬이 포함된 순간 전체가 폐보드·판넬 혼합 단가
  const hasBoard = (byMaterial.boardMixed || 0) > 0;
  const mixedUnit = hasBoard ? WASTE_UNIT_PRICE.boardMixed.price : WASTE_UNIT_PRICE.mixed.price;
  const mixedWon = Math.round(totalTons * mixedUnit);
  separatedWon = Math.round(separatedWon);
  const diffWon = Math.max(0, mixedWon - separatedWon);
  const multiplier = separatedWon > 0 ? +(mixedWon / separatedWon).toFixed(1) : 1;

  const vehicleOneTon = Math.max(1, Math.ceil(totalTons / 1.2));
  const vehicleTwoHalf = Math.max(1, Math.ceil(totalTons / 3.2));

  const warnings = [];
  if (totalTons >= 5) warnings.push(`예상 ${totalTons}톤 — 5톤 이상이면 착공일까지 건설폐기물 처리계획서를 시·군·구에 신고해야 합니다.`);
  if (hasBoard && mixedWon > separatedWon) warnings.push('석고보드·판넬이 섞이면 그 마대 전체가 폐보드·판넬 혼합 단가로 청구됩니다.');

  return {
    byMaterial,
    totalTons,
    mixedUnit,
    hasBoard,
    separatedWon,
    mixedWon,
    diffWon,
    multiplier,
    separatedMan: Math.round(separatedWon / 10000),
    mixedMan: Math.round(mixedWon / 10000),
    vehicles: [
      { type: '1톤 카고', count: vehicleOneTon, min: 40, max: 45 },
      { type: '2.5톤 카고', count: vehicleTwoHalf, min: 70, max: 80 },
    ],
    warnings,
    separatedByScope: Object.entries(byMaterial).map(([mat, kg]) => ({
      material: mat,
      label: WASTE_UNIT_PRICE[mat]?.label || mat,
      price: WASTE_UNIT_PRICE[mat]?.price || 0,
      tons: +(kg / 1000).toFixed(2),
      cost: Math.round((kg / 1000) * (WASTE_UNIT_PRICE[mat]?.price || 0)),
    })),
  };
}

// 견적에 넣을 "차량 기준 현장 실비" (만원) — 1톤차 중간값과 2.5톤차 중간값 중 저렴한 쪽
export function vehicleRealCost(waste = {}, compute = null, rates = null) {
  const w = compute || computeWaste(waste);
  const oneTonUnit = Number(rates?.waste?.truck1) || 42.5;
  const twoHalfUnit = Number(rates?.waste?.truck25) || 75;
  const oneTon = w.vehicles[0].count * oneTonUnit;
  const twoHalf = w.vehicles[1].count * twoHalfUnit;
  const best = Math.min(oneTon, twoHalf);
  return {
    oneTon: Math.round(oneTon),
    twoHalf: Math.round(twoHalf),
    best: Math.round(best),
    mode: oneTon <= twoHalf ? 'oneTon' : 'twoHalf',
  };
}
