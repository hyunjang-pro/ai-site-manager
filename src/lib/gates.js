// 공사순서·선행조건 잠금 게이트
export const LEAK_PRECEDENT_WARNING =
  '아래층 누수 배상 판례: 1,050,000원 ~ 60,760,533원(서울동부지법 2022나33816, 책임 70% 제한). 방수 하자보수 책임은 3년입니다.';

// 초보 사장님도 바로 이해하는 단계별 설명 — '뭘 확인하고 누구에게 뭐라고 지시하는지'
export const STEP_GUIDES = {
  gate1: {
    what: '손님 돈이 들어온 것을 확인하고, 그 돈으로 자재를 주문하는 단계입니다. 계약금 없이 주문하면 공사가 취소될 때 자재값을 우리가 떠안습니다.',
    checks: [
      '통장 입금 내역을 확인하고 캡처해 둡니다(현금·수표는 확인서).',
      '계약금·중도금·잔금 금액과 날짜를 문자로 남깁니다.',
      '입금 확인 전에는 어떤 자재도 발주하지 않습니다.',
    ],
    tell: '자재상에게 “○○현장 ○○자재, 착공 3일 전 납기로 발주합니다. 세금계산서는 사업자로 발행해 주세요.”',
  },
  gate2: {
    what: '관리사무소에 공사 신고를 하고, 엘리베이터·복도를 보호하고, 사다리차 자리를 확보하는 단계입니다. 이 4개가 끝나야 철거 인부가 헛걸음하지 않습니다.',
    checks: [
      '관리사무소에 공사 기간·시간·층수를 알리고 동의서를 받습니다.',
      '엘베 내부와 복도에 보양재를 붙이고 사진을 남깁니다.',
      '이웃집에 인사 문자를 돌립니다(아래 문자 복사).',
      '사다리차 자리(주차·전선·소방통로)를 눈으로 확인합니다.',
    ],
    tell: '기공에게 “○일 ○시 현장 집결, 철거 범위는 천장·벽체·바닥, 폐기물은 성상 분리해 마대에 담아 주세요.”',
  },
  waterproof: {
    what: '방수 위에 물을 채워 48시간 두고 아래층 누수를 확인하는 단계입니다. 이걸 건너뛰고 타일을 깔면 누수 배상은 전부 우리 몫입니다.',
    checks: [
      '방수 2회 도포 후 완전 건조(4시간 이상)를 기다립니다.',
      '물 높이를 표시하고 사진을 남깁니다.',
      '24시간 경과·배수 직전 사진까지 3컷을 남깁니다.',
      '아래층에 미리 알리고 천장 누수를 확인합니다.',
    ],
    tell: '타일공에게 “담수 48시간 통과했습니다. 내일 오전 타일 시공 들어가 주세요. 줄눈은 3일 뒤입니다.”',
  },
  wallpaper: {
    what: '기존 벽지를 걷어내고 초배·퍼티로 벽을 고른 뒤 도배하는 단계입니다. 벽이 마르지 않으면 들뜸·곰팡이로 재시공입니다.',
    checks: [
      '기존 벽지·곰팡이·누수 흔적을 사진으로 남깁니다.',
      '초배 후 24시간 건조를 지킵니다(급하면 들뜸).',
      '벽지 개봉 전 같은 로트(제조번호)인지 확인합니다.',
    ],
    tell: '도배 기공에게 “초배·퍼티 끝났고 24시간 건조했습니다. 오늘 정배 들어가 주세요.”',
  },
  kitchen: {
    what: '기존 싱크대를 철거하고 물·가스를 잠근 뒤, 상판을 실측해 설치하는 단계입니다. 상판은 가공 후 변경이 안 됩니다.',
    checks: [
      '급수·배수·가스 밸브를 잠그고 확인합니다.',
      '상판 실측(수전 홀 위치, 싱크볼 좌우)을 확정합니다.',
      '철거 후 바닥·벽 상태(누수·곰팡이)를 확인합니다.',
    ],
    tell: '설치 기공에게 “상판 실측 확정됐습니다. 수전 홀은 왼쪽, 싱크볼은 오른쪽입니다.”',
  },
  demolition: {
    what: '마감재를 걷어내고 폐기물을 성상별로 분리해 반출하는 단계입니다. 섞으면 처리비가 최대 6배가 됩니다.',
    checks: [
      '철거 전 6부위(바닥·벽·천장·복도·승강기·인접세대)를 촬영합니다.',
      '마대를 5종(콘크리트·목재·석고·금속·비닐)으로 나눕니다.',
      '숨은 물량(천장 위·벽 속)이 나오면 사진부터 찍습니다.',
    ],
    tell: '철거 기공에게 “성상별로 마대 분리해서 담고, 천장 위 숨은 물량 나오면 바로 사진 찍어 주세요.”',
  },
  generic: {
    what: '이 공정이 끝나야 다음 공정이 안전합니다. 체크 항목을 하나씩 확인하며 진행하세요.',
    checks: ['사진으로 남겨 두면 나중에 분쟁 때 근거가 됩니다.', '자재·인력 준비 상태를 전날 확인합니다.'],
    tell: '기공에게 “오늘 공정 범위와 다음 공정 일정을 문자로 확인해 주세요.”',
  },
  gate4: {
    what: '완성된 현장을 손님과 함께 확인하고, 하자 목록을 정리하고, 잔금을 받아 끝내는 단계입니다.',
    checks: [
      '준공 사진을 같은 자리·같은 각도로 찍어 손님에게 보냅니다.',
      '하자 목록을 글로 남기고 처리 완료를 표시합니다.',
      '잔금 입금을 확인한 뒤 정산 완료 처리합니다.',
    ],
    tell: '손님에게 “준공 사진 보내드립니다. 하자 ○건은 ○일까지 처리하겠습니다. 잔금 확인되면 정산 마무리하겠습니다.”',
  },
};

export function waterproofStatus(gates = {}) {
  const wp = gates.waterproof || {};
  const startedAt = wp.startedAt ? new Date(wp.startedAt).getTime() : null;
  const elapsedH = startedAt ? (Date.now() - startedAt) / 36e5 : 0;
  const remainingH = startedAt ? Math.max(0, 48 - elapsedH) : 48;
  const checks = wp.checks || {};
  const photos = !!(checks.level && checks.h24 && checks.beforeDrain);
  const belowOk = !!wp.belowOk;
  const timeDone = !!startedAt && remainingH <= 0;
  return {
    startedAt: wp.startedAt || '',
    elapsedH: Math.max(0, elapsedH),
    remainingH,
    remainingText:
      !startedAt
        ? '담수 시작 전 — 48시간 카운트다운이 시작되지 않았습니다'
        : timeDone
        ? '담수 48시간 경과'
        : `담수 ${Math.floor(remainingH)}시간 ${Math.round((remainingH % 1) * 60)}분 남음`,
    checks,
    photos,
    belowOk,
    timeDone,
    ready: photos && belowOk && timeDone,
  };
}

// 현장에 실제로 해당하는 관리 항목만 남긴다 (엘베 없음·사다리차 미사용·1층 단독 등)
export function managementChecklist(c, trade) {
  const lift = c?.lifting || {};
  const text = `${c?.title || ''} ${c?.notes || ''} ${c?.location || ''}`;
  const floor = parseInt(lift.floor, 10) || 0;
  const multiUnit = /아파트|오피스텔|상가|빌딩|근린|사무실/.test(text);
  const standalone = /단독|주택|전원|창고/.test(text) && !multiUnit;
  const wasteOnly = trade === 'waste' || trade === 'labor';
  const hasElevator = lift.elevator !== 'no';
  const ladderPossible = lift.ladderAllowed !== 'no';

  return [
    {
      id: 'notice',
      label: '관리실 공사 신고',
      hint: '관리사무소가 있는 건물만',
      applicable: !wasteOnly && (multiUnit || (!standalone && floor > 1)),
      skipWhy: wasteOnly ? '폐기물·인력 단독 현장' : '1층 단독 건물',
    },
    {
      id: 'protect',
      label: '엘리베이터·복도 보양',
      hint: '엘베·공용부가 있을 때',
      applicable: hasElevator && !wasteOnly,
      skipWhy: '엘리베이터 없음',
    },
    { id: 'neighbor', label: '이웃 인사·안내문', hint: '소음·분진이 나는 공사', applicable: true, skipWhy: '' },
    {
      id: 'ladder',
      label: '사다리차 설치 승인',
      hint: '자재·폐기물을 창밖으로 내릴 때',
      applicable: ladderPossible && lift.elevator !== 'yes' && !wasteOnly,
      skipWhy: lift.elevator === 'yes' ? '엘리베이터 사용' : lift.ladderAllowed === 'no' ? '사다리차 설치 불가' : '폐기물·인력 단독 현장',
    },
  ];
}

export function buildGates(c, trade) {
  const g = c?.gates || {};
  const lift = g.lift || {};
  const wp = waterproofStatus(g);

  const gate1 = {
    id: 'g1',
    step: '1단계',
    title: '계약금 확인 → 발주·신고 해제',
    prereqs: [{ id: 'deposit', label: '계약금 입금 확인', done: !!g.deposit }],
    locks: ['자재 발주', '관리실 공사신고', '장비 배차'],
    unlocks: '자재 발주 · 관리실 공사신고 · 장비 배차 가능',
    warning: '계약금 없이 자재를 주문하면 취소 시 자재값이 고스란히 손실입니다.',
    done: !!g.deposit,
  };

  const checklist = managementChecklist(c, trade);
  const mgmtItems = checklist.filter((m) => m.applicable).map((m) => ({ id: m.id, label: m.label }));
  const mgmtDone = mgmtItems.every((m) => !!lift[m.id]);

  const gate2 = {
    id: 'g2',
    step: '2단계',
    title: '관리실 신고·보양·사다리차 승인 → 철거 인부 투입',
    prereqs: mgmtItems.map((m) => ({ ...m, done: !!lift[m.id] })),
    locks: ['철거 인부 투입', '집게차·덤프 진입'],
    unlocks: '철거 기공·잡부 투입 가능',
    warning: '사다리차 승인 전 철거 착수는 지연 1순위 원인입니다. 승인 없이는 인부를 부르지 마세요.',
    done: mgmtDone,
    gate1Done: !!g.deposit,
  };

  let gate3;
  const sizeVal = parseFloat(c?.sizeValue) || 0;
  const unit = c?.sizeUnit || '평';
  const pyung = unit === '평' ? sizeVal : unit === '㎡' ? sizeVal / 3.3 : unit === '칸' ? sizeVal * 1.8 : sizeVal || 15;
  const estTons = unit === '톤' ? sizeVal : +(pyung * 0.09).toFixed(1);
  const tileMode = c?.tileWork?.mode || 'both';

  if (trade === 'bathroom' || trade === 'combined' || (trade === 'tilewaterproof' && tileMode !== 'tile')) {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '방수 담수 48시간 → 타일 기공 배차',
      prereqs: [
        { id: 'level', label: '담수 사진 ① 수위선 표시', done: !!wp.checks.level },
        { id: 'h24', label: '담수 사진 ② 24시간 경과', done: !!wp.checks.h24 },
        { id: 'beforeDrain', label: '담수 사진 ③ 배수 직전', done: !!wp.checks.beforeDrain },
        { id: 'belowOk', label: '아래층 누수 없음 확인', done: wp.belowOk },
        { id: 'hours', label: '담수 48시간 경과 (KCS 41 40 01)', done: wp.timeDone },
      ],
      locks: ['타일 기공 배차', '타일 자재 발주', '다음 공정 진행'],
      unlocks: '타일 기공 배차 · 타일 자재 발주 가능',
      warning: LEAK_PRECEDENT_WARNING,
      done: wp.ready,
      waterproof: wp,
      timer: true,
    };
  } else if (trade === 'wallpaper') {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '초배·밑작업 완료 → 정배(도배) 기공 투입',
      prereqs: [
        { id: 'strip', label: '기존 벽지 제거 완료', done: !!g.strip },
        { id: 'primer', label: '초배·퍼티 밑작업 완료', done: !!g.primer },
        { id: 'dry', label: '건조 확인(24시간)', done: !!g.dry },
      ],
      locks: ['정배(도배) 기공 투입', '벽지 개봉'],
      unlocks: '정배 기공 투입 · 벽지 시공 가능',
      warning: '초배가 마르지 않으면 들뜸·곰팡이로 재시공입니다. 건조 24시간을 지키세요.',
      done: !!(g.strip && g.primer && g.dry),
    };
  } else if (trade === 'kitchen') {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '철거·단수·가스 차단 → 상판 실측·설치',
      prereqs: [
        { id: 'demo', label: '기존 싱크대 철거', done: !!g.demo },
        { id: 'water', label: '급수·배수 차단 및 마감', done: !!g.water },
        { id: 'gas', label: '가스레인지 분리·차단', done: !!g.gas },
        { id: 'measure', label: '상판 실측(수전 홀 위치 확정)', done: !!g.measure },
      ],
      locks: ['상판 가공 발주', '설치 기공 배차'],
      unlocks: '상판 가공 발주 · 설치 기공 배차 가능',
      warning: '상판 가공 후 수전 홀 위치 변경은 불가합니다. 실측·확정 후 발주하세요.',
      done: !!(g.demo && g.water && g.gas && g.measure),
    };
  } else if (trade === 'waste') {
    const prereqs = [{ id: 'separate', label: '마대 성상 분리(5종)', done: !!g.separate }];
    if (estTons >= 5) prereqs.push({ id: 'plan', label: `5톤 이상 처리계획서 신고 (${estTons}톤)`, done: !!g.plan });
    prereqs.push({ id: 'ticket', label: '처리확인서·계량증명서 준비', done: !!g.ticket });
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '성상 분리·반출 → 차량 배차·처리',
      prereqs,
      locks: ['차량 배차', '폐기물 반출'],
      unlocks: '차량 배차 · 폐기물 반출 가능',
      warning: '섞인 마대 하나가 처리비를 3~6배로 만듭니다. 성상별로 나눠 두세요.',
      done: prereqs.every((p) => p.done),
    };
  } else if (trade === 'labor') {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '인원·숙련도 확정 → 집결',
      prereqs: [
        { id: 'separate', label: '인원·일수 확정(전날 18시)', done: !!g.separate },
        { id: 'evidence', label: '기초안전보건교육 이수증 확인', done: !!g.evidence },
      ],
      locks: ['인력 파견'],
      unlocks: '인력 파견 가능',
      warning: '결원 1명 = 일당 18만원 + 공정 1일 지연입니다.',
      done: !!(g.separate && g.evidence),
    };
  } else if (trade === 'repair') {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '보수 부위 확인 → 자재 준비',
      prereqs: [
        { id: 'demo', label: '보수 부위 규격·단종 확인', done: !!g.demo },
        { id: 'evidence', label: '보수 전 사진 촬영', done: !!g.evidence },
      ],
      locks: ['자재 발주', '수선 작업'],
      unlocks: '자재 발주 · 수선 작업 가능',
      warning: '단종 자재는 같은 규격으로 대체됩니다. 손님 승인을 먼저 받으세요.',
      done: !!(g.demo && g.evidence),
    };
  } else {
    const prereqs = [{ id: 'separate', label: '마대 성상 분리(5종)', done: !!g.separate }];
    if (estTons >= 5) prereqs.push({ id: 'plan', label: `5톤 이상 처리계획서 신고 (${estTons}톤)`, done: !!g.plan });
    // 철거 전 6부위 촬영은 철거·복합 현장에서만
    if (trade === 'demolition' || trade === 'combined') prereqs.push({ id: 'evidence', label: '철거 전 6부위 촬영', done: !!g.evidence });
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '폐기물 성상 분리·반출 계획 → 집게차·덤프 배차',
      prereqs,
      locks: ['집게차·덤프 배차', '폐기물 반출'],
      unlocks: '집게차·덤프 배차 · 폐기물 반출 가능',
      warning: '섞인 마대 하나가 단가를 3~6배로 만듭니다. 성상별로 나눠 두세요.',
      done: prereqs.every((p) => p.done),
    };
  }

  const gate4 = {
    id: 'g4',
    step: '4단계',
    title: '준공 검수·잔금 → 정산 완료',
    prereqs: [
      { id: 'donePhoto', label: '준공 사진', done: !!g.donePhoto },
      { id: 'defect', label: '하자 리스트 종결', done: !!g.defect },
      { id: 'balancePaid', label: '잔금 입금 확인', done: !!g.balancePaid },
    ],
    locks: ['정산 완료 처리'],
    unlocks: '정산 완료 처리 가능 (보관함으로 이동)',
    warning: '준공 사진·하자 종결·잔금 입금 3개가 모두 있어야 정산 완료입니다.',
    done: !!(g.donePhoto && g.defect && g.balancePaid),
  };

  return [gate1, gate2, gate3, gate4];
}

// 특정 게이트가 열렸는지 (이전 게이트까지 모두 완료)
export function gateOpen(gates, id) {
  const idx = gates.findIndex((g) => g.id === id);
  if (idx < 0) return false;
  return gates.slice(0, idx).every((g) => g.done);
}
