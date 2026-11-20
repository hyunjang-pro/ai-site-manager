// 공사순서·선행조건 잠금 게이트
export const LEAK_PRECEDENT_WARNING =
  '아래층 누수 배상 판례: 1,050,000원 ~ 60,760,533원(서울동부지법 2022나33816, 책임 70% 제한). 방수 하자보수 책임은 3년입니다.';

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

  const mgmtItems = [
    { id: 'notice', label: '관리실 공사 신고' },
    { id: 'protect', label: '엘베·복도 보양' },
    { id: 'neighbor', label: '이웃 인사·안내문' },
    { id: 'ladder', label: '사다리차 설치 승인' },
  ];
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
  if (trade === 'bathroom' || trade === 'combined') {
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
  } else {
    gate3 = {
      id: 'g3',
      step: '3단계',
      title: '폐기물 성상 분리·반출 계획 → 집게차·덤프 배차',
      prereqs: [
        { id: 'separate', label: '마대 성상 분리(5종)', done: !!g.separate },
        { id: 'plan', label: '5톤 이상 처리계획서 신고', done: !!g.plan },
        { id: 'evidence', label: '철거 전 6부위 촬영', done: !!g.evidence },
      ],
      locks: ['집게차·덤프 배차', '폐기물 반출'],
      unlocks: '집게차·덤프 배차 · 폐기물 반출 가능',
      warning: '섞인 마대 하나가 단가를 3~6배로 만듭니다. 성상별로 나눠 두세요.',
      done: !!(g.separate && g.plan && g.evidence),
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
