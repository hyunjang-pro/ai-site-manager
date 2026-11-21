import { hasScope } from './constants.js';
import { needsLadder } from './pricing.js';
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
  groundwork: {
    what: '땅을 파고 고르고 다지는 단계입니다. 파기 전에 배관·전선 위치를 확인하지 않으면 복구비를 우리가 냅니다.',
    checks: [
      '터파기 전 지반과 매설 배관·전선 위치를 사진으로 남깁니다(도면·탐지기 확인).',
      '굴삭기 진입로 폭과 상부 전선 높이를 확인합니다.',
      '잔토(남는 흙) 반출업체와 계량증명서를 미리 정합니다.',
      '되메우기는 30cm씩 나눠 다집니다(한 번에 넣으면 나중에 꺼집니다).',
    ],
    tell: '장비 기사에게 “매설 배관 위치 표시했으니 그 선은 건드리지 마시고, 잔토는 따로 모아 주세요. 되메우기는 30cm씩 다져주세요.”',
  },
  waste: {
    what: '폐기물을 성상별로 나눠 상차하고 처리장으로 보내는 단계입니다. 계량증명서·처리확인서가 남아야 나중에 “어디에 버렸냐”는 말을 막을 수 있습니다.',
    checks: [
      '수거 전 전체 사진을 남깁니다(짐이 있던 상태).',
      '마대를 성상별(콘크리트·목재·석고·금속·비닐)로 나눠 상차합니다.',
      '상차 적재량과 계근 결과를 사진으로 남깁니다.',
      '복도·엘리베이터에 파손·오염이 없는지 확인합니다.',
    ],
    tell: '인부에게 “성상별로 나눠 싣고, 계량증명서 받아 사진 찍어 보내주세요. 끝나면 빈 공간도 같은 자리에서 찍어주세요.”',
  },
  labor: {
    what: '필요 인원과 숙련도를 정해 현장에 보내고, 작업 범위를 서면으로 남기는 단계입니다.',
    checks: [
      '인원·일수·집결 시간을 전날 확정합니다.',
      '기초안전보건교육 이수증을 확인합니다.',
      '작업 범위(무엇까지 하는지)를 문자로 남깁니다.',
    ],
    tell: '인부에게 “○일 ○시 현장 집결, 작업 범위는 ○○까지입니다. 진행 사진 보내주세요.”',
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
      skipWhy: wasteOnly ? '폐기물·인력 단독 현장' : '엘리베이터 없음',
    },
    { id: 'neighbor', label: '이웃 인사·안내문', hint: '소음·분진이 나는 공사', applicable: true, skipWhy: '' },
    {
      id: 'ladder',
      label: '사다리차 설치 승인',
      hint: '자재·폐기물을 창밖으로 내릴 때',
      applicable: ladderPossible && lift.elevator !== 'yes' && !wasteOnly && needsLadder(c),
      skipWhy: wasteOnly
        ? '폐기물·인력 단독 현장'
        : lift.elevator === 'yes'
        ? '엘리베이터 사용'
        : lift.ladderAllowed === 'no'
        ? '사다리차 설치 불가'
        : '',
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

  const hasBathScope = Array.isArray(c?.subScopes) && c.subScopes.length ? c.subScopes.includes('bathroom') : true;
  if (trade === 'bathroom' || (trade === 'combined' && hasBathScope) || (trade === 'tilewaterproof' && tileMode !== 'tile')) {
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
  } else if (trade === 'demolition' || (trade === 'combined' && hasScope(c, 'demolition'))) {
    const prereqs = [{ id: 'separate', label: '마대 성상 분리(5종)', done: !!g.separate }];
    if (estTons >= 5) prereqs.push({ id: 'plan', label: `5톤 이상 처리계획서 신고 (${estTons}톤)`, done: !!g.plan });
    if (hasScope(c, 'groundwork')) prereqs.push({ id: 'buried', label: '지하 매설물·굴삭기 진입 확인', done: !!g.buried });
    prereqs.push({ id: 'evidence', label: '철거 전 6부위 촬영', done: !!g.evidence });
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
  } else {
    // 목공·전기·설비·필름·토목·수선 등 — 폐기물 절차를 붙이지 않고 범위·준비만 확인한다.
    const prereqs = [
      { id: 'separate', label: '작업 범위 확정(문자로 남기기)', done: !!g.separate },
      { id: 'evidence', label: '작업 전 현장 사진', done: !!g.evidence },
    ];
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '범위·자재 확정 → 작업 투입',
      prereqs,
      locks: ['자재 발주', '인력 투입'],
      unlocks: '자재 발주 · 인력 투입 가능',
      warning: '범위를 말로만 정하면 “그건 안 했다” 분쟁이 됩니다. 문자·사진으로 남기세요.',
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


// 공종별 시공 타임라인 — 자기 공종에 맞는 순서만 보여준다.
// (폐기물에 '자재 발주·주공정 시공·하자 정리'를 붙이지 않는다)
export function buildTimeline(c, calc, gates = []) {
  const trade = calc?.trade || c?.trade || 'custom';
  const g = c?.gates || {};
  const gate3Done = !!gates[2]?.done;
  const gate4Done = !!gates[3]?.done;
  const depositDone = !!g?.deposit;
  const planDone = !!(g?.separate && (c?.startDate || c?.dispatch?.date));

  if (trade === 'waste') {
    return [
      {
        label: '전날 · 배차·인력 확정',
        done: depositDone && planDone,
        items: ['차량(반차·1톤·2.5톤) 확정', '상차 인부 확정', '반입 시간·처리장 확인', '현장 출입·주차'],
      },
      { label: '당일 · 수거·상차·계근', done: gate3Done, items: ['성상별 수거', '상차·적재량 사진', '계량증명서 받기'] },
      { label: '완료 · 사진·정산', done: gate4Done, items: ['수거 후 빈 공간 사진', '처리확인서 보관', '잔금 정산'] },
    ];
  }
  if (trade === 'labor') {
    return [
      {
        label: '전날 · 인원·숙련 확정',
        done: depositDone && planDone,
        items: ['인원·일수 확정', '숙련도·작업 범위 문자', '집결 장소·주차'],
      },
      { label: '당일 · 집결·작업', done: gate3Done, items: ['집결 확인', '작업 범위 지시', '진행 사진'] },
      { label: '완료 · 작업 확인·정산', done: gate4Done, items: ['작업 완료 확인', '추가 요구 정리', '잔금 정산'] },
    ];
  }
  // 공종/세부 공종에 실제로 있는 공정만 보여준다 — 철거+정지에 '담수·타일'이 나오면 안 된다.
  const demo = hasScope(c, 'demolition');
  const ground = hasScope(c, 'groundwork');
  const bath = hasScope(c, 'bathroom');
  const finish = hasScope(c, 'wallpaper') || hasScope(c, 'kitchen') || bath || hasScope(c, 'plaster');

  if (trade === 'combined' && !finish) {
    // 철거·정지·부지 정리처럼 마감이 없는 복합
    return [
      {
        label: 'D-2 · D-1 사전 준비',
        done: depositDone,
        items: ['반출 차량·장비 배차', '관리실 신고·보양', '성상 분리 마대 준비'],
      },
      {
        label: '당일 · 반출·터파기',
        done: gate3Done,
        items: [
          ...(demo ? ['철거·해체', '성상 분리 반출'] : []),
          ...(ground ? ['터파기·정지', '다짐·되메우기'] : []),
          ...(!demo && !ground ? ['현장 작업', '반출·정리'] : []),
        ],
      },
      {
        label: '완료 · 확인·잔금',
        done: gate4Done,
        items: ['계량증명서·처리확인서', '철거 후 사진', '잔금 입금'],
      },
    ];
  }

  return [
    {
      label: 'D-2 · D-1 사전 준비',
      done: depositDone,
      items: ['자재 발주', '관리실 신고·보양', ...(hasScope(c, 'window') || !finish ? ['사다리차 승인'] : ['양중·반입 확인'])],
    },
    {
      label: '시공 당일',
      done: gate3Done,
      items: bath
        ? ['철거·양중', '방수 2회', '담수 48시간', '타일·마감']
        : demo
        ? ['철거·반출', '주공정 시공', '마감 정리']
        : ['바탕 정리', '주공정 시공', '마감 정리'],
    },
    { label: '완료 · 잔금', done: gate4Done, items: ['준공 사진', '하자 정리', '잔금 입금'] },
  ];
}

// 작업 전·후 사진 기록 — 공종에 맞는 칸만 남긴다.
export const EVIDENCE_BY_TRADE = {
  waste: {
    title: '수거 전·후 기록',
    hint: '수거 전·후를 같은 자리에서 남겨두면 “네가 버린 게 아니다”는 말을 막을 수 있습니다.',
    spots: [
      { id: 'before', label: '수거 전 전체', hint: '짐이 있던 상태 그대로' },
      { id: 'load', label: '상차 적재량', hint: '차량 적재 상태·계근 전' },
      { id: 'after', label: '수거 후 빈 공간', hint: '수거 전과 같은 각도' },
      { id: 'hallway', label: '복도·엘베 이상 없음', hint: '공용부 파손·오염 확인' },
    ],
  },
  labor: {
    title: '작업 전·후 기록',
    hint: '일용 인력 현장은 작업 범위와 결과를 사진으로 남겨야 추가 요구를 막을 수 있습니다.',
    spots: [
      { id: 'before', label: '작업 전 현장', hint: '작업 범위가 보이게' },
      { id: 'during', label: '작업 중 진행', hint: '지시한 범위대로 하는지' },
      { id: 'after', label: '작업 후 현장', hint: '작업 전과 같은 각도' },
      { id: 'material', label: '자재·공구 정리', hint: '남긴 것·가져간 것' },
    ],
  },
  demolition: {
    title: '철거 전 사진 6곳',
    hint: '착공 전에 찍어두지 않으면 “네 공사 때문에 긁혔다”를 반박할 방법이 없습니다.',
    spots: [
      { id: 'floor', label: '바닥', hint: '전체샷 + 근접샷' },
      { id: 'wall', label: '벽', hint: '긁힘·곰팡이 위치' },
      { id: 'ceiling', label: '천장', hint: '누수·얼룩' },
      { id: 'hallway', label: '복도', hint: '공용부 파손' },
      { id: 'elevator', label: '승강기 내부', hint: '문·패널' },
      { id: 'neighbor', label: '아래집·옆집', hint: '기존 균열·누수 흔적' },
    ],
  },
  groundwork: {
    title: '터파기 전·후 기록',
    hint: '땅을 파기 전 지반·매설물 사진이 없으면 배관 파손·잔토 분쟁에서 우리가 집니다.',
    spots: [
      { id: 'before', label: '터파기 전 지반', hint: '전체샷 + 기준점' },
      { id: 'buried', label: '매설 배관·전선 위치', hint: '탐지·도면 확인 후' },
      { id: 'access', label: '장비 진입로', hint: '굴삭기 폭·전선 높이' },
      { id: 'after', label: '되메우기·다짐 후', hint: '터파기 전과 같은 각도' },
    ],
  },
  finish: {
    title: '작업 전·후 기록',
    hint: '작업 전·후를 같은 각도로 남겨두면 “네 공사 때문에 생긴 것”이라는 말을 막을 수 있습니다.',
    spots: [
      { id: 'before', label: '작업 전 전체 사진', hint: '같은 자리에서 찍기' },
      { id: 'material', label: '자재 입고 사진', hint: '품명·수량 확인용' },
      { id: 'defect', label: '하자 의심 부위', hint: '발견 즉시 촬영' },
      { id: 'after', label: '작업 후 전체 사진', hint: '작업 전과 같은 각도' },
    ],
  },
};

export function evidenceFor(trade, c = null) {
  if (trade === 'waste') return EVIDENCE_BY_TRADE.waste;
  if (trade === 'labor') return EVIDENCE_BY_TRADE.labor;
  if (trade === 'demolition') return EVIDENCE_BY_TRADE.demolition;
  if (trade === 'groundwork') return EVIDENCE_BY_TRADE.groundwork;
  if (trade === 'combined') {
    const demo = c ? hasScope(c, 'demolition') : true;
    if (demo) return EVIDENCE_BY_TRADE.demolition;
    if (c && hasScope(c, 'groundwork')) return EVIDENCE_BY_TRADE.groundwork;
  }
  return EVIDENCE_BY_TRADE.finish;
}
