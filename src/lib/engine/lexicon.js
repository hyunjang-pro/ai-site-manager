// 공종·품목 낱말 사전 (SSOT)
// ─────────────────────────────────────────────────────────────
// 예전에는 classify.js·partial.js·pricing.js·site.js 가 각자 정규식을 들고 있어서
// 같은 낱말이 파일마다 다르게 읽혔다('선반'이 목공이었다가 부분 철거였다가).
// 이제 낱말은 **여기 한 곳**에만 있고, 분류·수량·단가가 모두 이 표를 참조한다.
//
// role
//   scope   — 그 자체로 공종을 정하는 품목 (타일·벽지·장판·창호·조명·배관·필름·도장·토목)
//   sub     — 공종 안의 구성 품목 (싱크대·상판·후드·도기·수전)
//   object  — 뜯고 옮기는 물건 (간판·붙박이장·문짝·선반·에어컨)
//   space   — 장소 이름 (주방·욕실·거실·상가) — 공종을 정하지 않고 문맥만 준다
//
// authority — 그 품목이 공종을 얼마나 강하게 지목하는가 (0~3)
//   '주방'이 나와도 뒤에 '타일'이 붙으면 타일 공사다. 공종은 authority가 가장 높은 품목이 정한다.
//
// unit — 수량을 읽는 기본 단위 · defaultQty — 수량이 없을 때 쓰는 규모

export const ITEMS = [
  // ── 냉난방·외부 설비 ─────────────────────────────
  { id: 'airconOutdoor', label: '에어컨 실외기', scope: 'demolition', role: 'object', authority: 0, unit: '대', defaultQty: 1, partialId: 'airconOutdoor', demo: true, exterior: true,
    terms: /실외기|옥외기|실외\s*기/ },
  { id: 'aircon', label: '에어컨', scope: 'demolition', role: 'object', authority: 0, unit: '대', defaultQty: 1, partialId: 'aircon', demo: true,
    terms: /에어컨|에어콘|냉난방기|벽걸이\s*(?:에어컨|에어콘)?/ },

  // ── 간판·사인 ────────────────────────────────────
  { id: 'sign', label: '간판', scope: 'demolition', role: 'object', authority: 1, unit: '개', defaultQty: 1, partialId: 'sign', demo: true, exterior: true,
    terms: /돌출간판|채널간판|입간판|사이니지|사인물|간판|현판|어닝/ },

  // ── 가구·수납 ────────────────────────────────────
  { id: 'builtin', label: '붙박이장', scope: 'carpentry', role: 'object', authority: 1, unit: '개', defaultQty: 1, partialId: 'builtin', demo: true, install: true,
    terms: /붙박이\s*장|붙박이장|드레스룸/ },
  { id: 'shelf', label: '선반', scope: 'carpentry', role: 'object', authority: 0, unit: '개', defaultQty: 1, partialId: 'shelf', demo: true,
    terms: /선반|진열대|진열장|액자장|코너장/ },
  { id: 'furniture', label: '가구', scope: 'waste', role: 'object', authority: 0, unit: '개', defaultQty: 1, partialId: 'furniture', demo: true,
    terms: /침대|소파|책상|식탁|장농|서랍장|가구|냉장고|세탁기/ },
  { id: 'showcase', label: '신발장', scope: 'carpentry', role: 'object', authority: 1, unit: '개', defaultQty: 1, demo: true, install: true,
    terms: /신발장/ },

  // ── 주방 ────────────────────────────────────────
  { id: 'sink', label: '싱크대', scope: 'kitchen', role: 'sub', authority: 3, unit: 'm', defaultQty: 3.2, partialId: 'sink', demo: true, install: true, replace: true,
    terms: /싱크대|씽크대|개수대|싱크볼|씽크볼/ },
  { id: 'counter', label: '상판', scope: 'kitchen', role: 'sub', authority: 2, unit: 'm', defaultQty: 3.2, demo: true, install: true, replace: true, onlyTerm: /상판\s*만|상판만/,
    terms: /상판|인조대리석|조리대/ },
  { id: 'hood', label: '후드·덕트', scope: 'kitchen', role: 'sub', authority: 1, unit: '개', defaultQty: 1, demo: true, install: true, replace: true,
    terms: /후드|덕트|레인지\s*후드/ },
  { id: 'cabinet', label: '상·하부장', scope: 'kitchen', role: 'sub', authority: 2, unit: 'm', defaultQty: 3.2, demo: true, install: true,
    terms: /상부장|하부장|수납장|아일랜드|식기세척기/ },

  // ── 욕실 ────────────────────────────────────────
  { id: 'bathroom', label: '욕실·화장실', scope: 'bathroom', role: 'space', authority: 2, unit: '칸', defaultQty: 1, partialId: 'bathroom', demo: true, install: true,
    terms: /욕실|화장실|욕조|샤워부스|샤워기|바가지/ },
  { id: 'toilet', label: '양변기', scope: 'bathroom', role: 'sub', authority: 2, unit: '개', defaultQty: 1, demo: true, install: true, replace: true,
    terms: /양변기|변기/ },
  { id: 'basin', label: '세면대', scope: 'bathroom', role: 'sub', authority: 2, unit: '개', defaultQty: 1, demo: true, install: true, replace: true,
    terms: /세면대|세면기/ },
  { id: 'faucet', label: '수전', scope: 'plumbing', role: 'sub', authority: 2, unit: '개', defaultQty: 1, demo: false, install: true, replace: true,
    terms: /수전|수도꼭지|샤워\s*수전/ },

  // ── 타일·방수 ────────────────────────────────────
  { id: 'tile', label: '타일', scope: 'tilewaterproof', role: 'scope', authority: 3, unit: '㎡', defaultQty: 12, demo: true, install: true, replace: true,
    terms: /타일|줄눈|포세린|600\s*각|300\s*각|폴리싱|벽돌\s*타일/ },
  { id: 'waterproof', label: '방수', scope: 'tilewaterproof', role: 'scope', authority: 3, unit: '㎡', defaultQty: 12, demo: true, install: true,
    terms: /방수|담수|우레탄|액체\s*방수|에폭시\s*방수/ },

  // ── 벽지·바닥 ────────────────────────────────────
  { id: 'wallpaper', label: '벽지·도배', scope: 'wallpaper', role: 'scope', authority: 3, unit: '평', defaultQty: 24, demo: true, install: true, replace: true, partialId: 'wallpaper',
    terms: /도배지|벽지|도배|합지|실크|초배/ },
  { id: 'floor', label: '장판', scope: 'wallpaper', role: 'scope', authority: 3, unit: '평', defaultQty: 24, demo: true, install: true, replace: true, partialId: 'floor', finish: 'floor',
    terms: /장판|바닥재|카페트/ },
  { id: 'woodFloor', label: '마루', scope: 'wallpaper', role: 'scope', authority: 3, unit: '평', defaultQty: 24, demo: true, install: true, replace: true, partialId: 'woodFloor', finish: 'wood',
    terms: /강마루|원목마루|마루/ },
  { id: 'decoTile', label: '데코타일', scope: 'wallpaper', role: 'scope', authority: 3, unit: '평', defaultQty: 24, demo: true, install: true, replace: true, partialId: 'decoTile', finish: 'deco',
    terms: /데코타일|데코\s*타일|카펫타일/ },
  { id: 'epoxy', label: '에폭시', scope: 'wallpaper', role: 'scope', authority: 3, unit: '평', defaultQty: 20, demo: true, install: true, finish: 'epoxy',
    terms: /에폭시/ },

  // ── 창호·문 ──────────────────────────────────────
  { id: 'window', label: '샷시·창호', scope: 'window', role: 'scope', authority: 3, unit: '㎡', defaultQty: 6, partialId: 'window', demo: true, install: true, replace: true,
    terms: /샷시|샤시|창호|창틀|유리창|미서기|폴딩도어|발코니\s*창|이중창|복층창/ },
  { id: 'mosquito', label: '방충망', scope: 'repair', role: 'sub', authority: 2, unit: '짝', defaultQty: 4, install: true, replace: true,
    terms: /방충망|방충\s*망/ },
  { id: 'door', label: '문짝·문틀', scope: 'carpentry', role: 'object', authority: 1, unit: '개', defaultQty: 1, partialId: 'door', demo: true, install: true,
    terms: /문짝|문틀|방화문|도어|문\s*\d+\s*(?:개|짝|틀)/ },
  { id: 'middoor', label: '중문', scope: 'repair', role: 'sub', authority: 2, unit: '짝', defaultQty: 1, demo: true, install: true, replace: true,
    terms: /중문|3\s*연동|삼연동/ },
  { id: 'glass', label: '유리', scope: 'window', role: 'sub', authority: 1, unit: '㎡', defaultQty: 4, demo: true, install: true, replace: true,
    terms: /유리|복층유리/ },
  { id: 'blind', label: '블라인드', scope: 'window', role: 'sub', authority: 1, unit: '개', defaultQty: 1, install: true,
    terms: /블라인드/ },

  // ── 전기·조명 ────────────────────────────────────
  { id: 'light', label: '조명·등기구', scope: 'electric', role: 'scope', authority: 3, unit: '개', defaultQty: 6, install: true, replace: true,
    terms: /조명|등기구|형광등|다운라이트|레일\s*조명|led|엘이디/ },
  { id: 'outlet', label: '콘센트·스위치', scope: 'electric', role: 'scope', authority: 3, unit: '개', defaultQty: 4, install: true, replace: true,
    terms: /콘센트|스위치|매입등/ },
  { id: 'panel', label: '분전반', scope: 'electric', role: 'scope', authority: 3, unit: '개', defaultQty: 1, install: true, replace: true,
    terms: /분전반|분전함|누전\s*차단기|차단기|배선|전기\s*(?:공사|증설|배선)/ },

  // ── 설비·배관 ────────────────────────────────────
  { id: 'pipe', label: '배관', scope: 'plumbing', role: 'scope', authority: 3, unit: '개소', defaultQty: 2, install: true, replace: true,
    terms: /배관|급수|배수|수도|보일러|하수구|막힘|누수\s*(?:배관|수리)/ },

  // ── 목공·단열 ────────────────────────────────────
  { id: 'partition', label: '가벽·칸막이', scope: 'carpentry', role: 'object', authority: 2, unit: 'm', defaultQty: 3, partialId: 'partition', demo: true, install: true,
    terms: /가벽|경량\s*벽체|경량벽체|칸막이|파티션|판넬\s*벽|판넬벽|합판\s*벽/ },
  { id: 'molding', label: '몰딩·걸레받이', scope: 'carpentry', role: 'sub', authority: 1, unit: 'm', defaultQty: 3, install: true, replace: true,
    terms: /몰딩|걸레받이|경첩|손잡이/ },
  { id: 'insulation', label: '단열·이보드', scope: 'carpentry', role: 'scope', authority: 2, unit: 'm', defaultQty: 9, install: true,
    terms: /이보드|단열\s*보드|결로|단열/ },
  { id: 'deck', label: '데크', scope: 'carpentry', role: 'object', authority: 2, unit: '식', defaultQty: 1, partialId: 'deck', demo: true, install: true,
    terms: /데크|(?<!상)가건물|비닐하우스|조립식\s*창고/ },
  { id: 'ceiling', label: '천장 텍스', scope: 'demolition', role: 'object', authority: 1, unit: '평', defaultQty: 5, partialId: 'ceiling', demo: true, install: true,
    terms: /텍스|천장\s*재|석고\s*천장|천장\s*철거|천장\s*텐트/ },

  // ── 필름·도장 ────────────────────────────────────
  { id: 'film', label: '필름·시트지', scope: 'film', role: 'scope', authority: 3, unit: '㎡', defaultQty: 9.9, install: true, replace: true, demo: true,
    terms: /필름|시트지|래핑/ },
  { id: 'paint', label: '도장·페인트', scope: 'repair', role: 'scope', authority: 3, unit: '평', defaultQty: 20, install: true, demo: true, paint: true,
    terms: /도장|도색|페인트|탄성\s*코트|탄성코트|코팅|퍼티/ },
  { id: 'caulk', label: '실리콘·코킹', scope: 'repair', role: 'sub', authority: 2, unit: '개소', defaultQty: 1, install: true,
    terms: /실리콘|코킹|틈\s*막이|틈막이/ },
  { id: 'repair', label: '수선·보수', scope: 'repair', role: 'scope', authority: 2, unit: '개소', defaultQty: 1, install: true,
    terms: /수선|보수|메꾸|때우/ },

  // ── 미장 ─────────────────────────────────────────
  { id: 'plaster', label: '바닥 미장', scope: 'plaster', role: 'scope', authority: 3, unit: '㎡', defaultQty: 33, install: true, demo: true,
    terms: /미장|몰탈|바닥\s*평탄|수평\s*작업|바닥\s*고르/ },

  // ── 토목·기초 ────────────────────────────────────
  { id: 'groundwork', label: '기초·정지', scope: 'groundwork', role: 'scope', authority: 3, unit: '㎡', defaultQty: 33, install: true,
    terms: /토목|터파기|기초\s*(?:공사|타설|콘크리트)|맨땅|콘크리트\s*타설|배수로|정원\s*공사|포장\s*공사|성토|절토|굴삭기|포크레인|포클레인|아스콘|옹벽|부지\s*정지|땅\s*고르|지반|노면\s*복구|부지\s*(?:정리|고르)/ },
  { id: 'excavator', label: '굴삭기', scope: 'groundwork', role: 'sub', authority: 3, unit: '일', defaultQty: 1, equip: true,
    terms: /포크레인|포클레인|굴삭기|미니\s*굴삭/ },

  // ── 폐기물·인력 ──────────────────────────────────
  { id: 'waste', label: '폐기물', scope: 'waste', role: 'scope', authority: 3, unit: '톤', defaultQty: 1, demo: true, defaultAction: 'collect',
    terms: /폐기물|쓰레기|수거|배출|반출|마대|처리장|집기|비품/ },
  { id: 'labor', label: '인력', scope: 'labor', role: 'scope', authority: 2, unit: '명', defaultQty: 2, demo: false,
    terms: /인부|일용|인력|잡부|기공|철거공|타일공|목수|미장공|용접공|설비공|전기공|도배공|사람\s*\d*\s*명|사람/ },
];

// 장소 — 공종을 정하지는 않지만, 품목의 뜻을 좁힌다.
// 예) '주방' + '타일' = 주방 벽타일(타일 공사) · '주방' + '상판만' = 상판 교체(주방 공사)
export const SPACES = [
  { id: 'kitchen', label: '주방', terms: /주방|부엌|조리실/ },
  { id: 'bathroom', label: '욕실', terms: /욕실|화장실|샤워실/ },
  { id: 'living', label: '거실', terms: /거실/ },
  { id: 'room', label: '방', terms: /안방|작은방|큰방|아이방|방\s*\d|방하나|방\s*하나/ },
  { id: 'balcony', label: '베란다', terms: /베란다|발코니/ },
  { id: 'entrance', label: '현관', terms: /현관/ },
  { id: 'roof', label: '옥상', terms: /옥상|지붕|루프/ },
  { id: 'outer', label: '외부', terms: /외벽|외부|옥외|야외|마당/ },
];

// 업종 — 상가/사무실/주택 구분 (평당 단가와 부대비용이 갈린다)
export const PLACES = {
  commercial: /상가|상점|매장|식당|음식점|카페|사무실|오피스|근린|상업|학원|병원|약국|공장|창고|숍|미용실|네일|편의점|호프|주점|베이커리|제과|마트|은행|노래방|가게|점포|피시방|PC방|당구장|세탁소|부동산|문구점|철물점/,
  residential: /아파트|주택|빌라|오피스텔|원룸|투룸|쓰리룸|단독|전원|농가|한옥|기숙사|주거|구옥/,
  building: /빌딩|건물|층|상가\s*건물/,
};

// 동작 낱말 — 품목 **뒤에** 오는 말로 그 품목이 뜯는 일인지 새로 하는 일인지 정한다.
export const ACTIONS = {
  remove: /철거|해체|제거|뜯|떼|까\s*내|깨|부수|부숴|분해|비우|치우|버리|빼\s*주|없애|반출|수거|걷어/,
  install: /설치|시공|교체|갈아|바꾸|새로|새\s|신규|깔아|깔기|붙이|붙여|바르|만들|세우|확장|증설|추가|보강|덧방|올리|내리|씌우|씌워/,
  repair: /수선|보수|보강|코킹|실리콘|메꾸|때우|막아|잡아|조정|조절/,
  plan: /견적|문의|상담|예정|하려|할\s*예정|생각|알아보/,
};

// '새로 만드는 말' — 철거만인지 시공까지인지 가르는 기준 (scope.js와 같은 목록을 쓴다)
export const NEW_BUILD =
  /올수리|올\s*수리|리모델링|인테리어|교체|설치|새로|신규|시공|깔아|깔기|깔아주|붙이|붙여|바르|도배|벽지\s*(교체|시공|새로)|장판\s*(깔|시공|교체)|타일\s*(시공|교체|붙|부착)|방수\s*(공사|시공)|도기\s*교체|철거\s*후|철거하고\s*(새|다시|타일|도기|마감|포세린|아메리칸)|포세린|600각|아메리칸스탠다드|후\s*(?:새\s*)?(?:페인트|도장|도색|도배|장판|마루|벽지|데코타일|타일|조명|바닥|시트)|(?:페인트|도장|조명|데코타일|장판|벽지|도배)\s*(?:까지|도|하고|랑)|마감까지/;

export const REMOVE_WORDS = /철거|해체|제거|부수|부숴|뜯|떼|까\s*내|깨|반출|폐기|비우|치우|버리|빼|없애/;

// 공종 이름 — 화면·문서·제목이 같은 말을 쓰게 한다
export const SCOPE_LABEL = {
  demolition: '철거',
  wallpaper: '도배·장판',
  floor: '바닥',
  bathroom: '욕실',
  kitchen: '주방',
  tilewaterproof: '타일·방수',
  plaster: '바닥 미장',
  carpentry: '목공·문·몰딩',
  electric: '전기·조명',
  plumbing: '설비·배관',
  film: '필름·시트지',
  paint: '도장',
  groundwork: '기초·토목',
  window: '창호',
  waste: '폐기물',
  labor: '인력',
  repair: '부분 수선',
};

export function itemById(id) {
  return ITEMS.find((it) => it.id === id) || null;
}
