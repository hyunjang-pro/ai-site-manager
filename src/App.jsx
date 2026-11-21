import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, HardHat, Lock, Settings } from 'lucide-react';
import HomeScreen from './components/HomeScreen.jsx';
import Workspace from './components/Workspace.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import LockScreen from './components/LockScreen.jsx';
import NewCaseModal from './components/NewCaseModal.jsx';
import BidsScreen from './components/BidsScreen.jsx';
import { isUnlocked, setUnlocked } from './lib/auth.js';
import { Toast, cx } from './components/ui.jsx';
import { loadState, saveState, newCase, composeCase } from './lib/storage.js';
import { BIDS, bidStats, bidToCase } from './lib/bids.js';
import { setGeminiKey } from './lib/gemini.js';
import { DEFAULT_RATES, mergeRates } from './lib/rates.js';
import { saveSupplier } from './lib/supplier.js';
import { clearShareHash, decodeShare, readShareHash, readStashedShare, stashShare } from './lib/share.js';

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [unlocked, setUnlockedState] = useState(() => isUnlocked());
  const [screen, setScreen] = useState('home');
  const [activeId, setActiveId] = useState(() => state.cases[0]?.id || '');
  const [tab, setTab] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  // 부모님·가족 폰에 보낸 #share= 링크 — 잠금을 풀 때 자동 적용한다
  const [pendingShare, setPendingShare] = useState(() => readShareHash() || readStashedShare());
  const bidInfo = useMemo(() => bidStats(BIDS), []);

  // 주소창의 #share= 를 읽어 두고(아직 잠겨 있으면 풀릴 때까지 보관) 해시는 지운다
  useEffect(() => {
    const code = readShareHash();
    if (!code) return;
    stashShare(code);
    setPendingShare(code);
    clearShareHash();
  }, []);

  // 설정에 저장된 키를 이 기기의 AI 키 저장소로 한 번 옮긴다.
  useEffect(() => {
    if (state.settings?.apiKey) setGeminiKey(state.settings.apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const ok = saveState(state);
      if (ok) setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      // 저장이 막히면(iOS 사파리 사생활 보호·용량 초과) 조용히 넘기지 않고 알려 준다
      else showToast('저장 공간이 부족해 저장하지 못했습니다 — 사진을 줄이거나 설정에서 초기화해 주세요');
    }, 350);
    return () => clearTimeout(t);
  }, [state]);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToastMsg(''), 2600);
  }, []);

  const activeCase = useMemo(
    () => state.cases.find((c) => c.id === activeId) || state.cases[0],
    [state.cases, activeId]
  );

  // 잠금 해제 순간, 가족이 보낸 설정 링크(키·업체 정보·단가표)를 이 기기에 반영한다
  useEffect(() => {
    if (!unlocked || !pendingShare) return;
    const data = decodeShare(pendingShare);
    stashShare('');
    setPendingShare('');
    if (!data) {
      showToast('가족 설정 링크를 읽지 못했습니다 — 링크를 다시 받아 주세요');
      return;
    }
    const key = String(data.k || '').trim();
    if (key) setGeminiKey(key);
    const s = data.s || {};
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...(s.region ? { region: s.region } : {}),
        ...(s.businessName ? { businessName: s.businessName } : {}),
        ...(s.agencyFeeRate !== undefined ? { agencyFeeRate: s.agencyFeeRate } : {}),
        ...(s.rates ? { rates: mergeRates(DEFAULT_RATES, s.rates) } : {}),
        ...(key ? { apiKey: key, useAi: true } : {}),
      },
    }));
    if (s.supplier && s.supplier.name) saveSupplier(s.supplier);
    showToast('가족 설정(AI 키 포함)이 적용되었습니다');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, pendingShare]);

  const updateCase = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      cases: prev.cases.map((c) => {
        if (c.id !== id) return c;
        const next = typeof patch === 'function' ? patch(c) : { ...c, ...patch };
        return { ...next, updatedAt: new Date().toISOString().slice(0, 10) };
      }),
    }));
  }, []);

  const updateActive = useCallback((patch) => updateCase(activeId, patch), [activeId, updateCase]);

  const openNewCase = useCallback(() => setNewCaseOpen(true), []);

  const handleCreate = useCallback(
    (trade, patch = {}) => {
      // 카드 미리보기와 똑같은 함수로 만든다 (금액이 어긋나지 않게)
      const merged = composeCase({ trade, patch, settings: state.settings });
      setState((prev) => ({ ...prev, cases: [merged, ...prev.cases] }));
      setActiveId(merged.id);
      // 손님이 기다리는 건 견적 금액 — 만들자마자 2. 가견적으로 바로 넘어간다
      setTab(2);
      setScreen('case');
      showToast('현장을 만들었습니다 — 가견적부터 바로 보세요');
    },
    [state.settings, showToast]
  );

  const handleImportBid = useCallback(
    (bid) => {
      const patch = bidToCase(bid, state.settings.rates);
      const created = { ...newCase(patch.trade, state.settings.rates), ...patch, agencyFeeRate: state.settings.agencyFeeRate ?? 10 };
      setState((prev) => ({ ...prev, cases: [created, ...prev.cases] }));
      setActiveId(created.id);
      setTab(1);
      setScreen('case');
      showToast('공고를 장부로 가져왔습니다 — 신청 준비를 이어가세요');
    },
    [state.settings.rates, state.settings.agencyFeeRate, showToast]
  );

  const handleDelete = useCallback(
    (id) => {
      setState((prev) => ({ ...prev, cases: prev.cases.filter((c) => c.id !== id) }));
      if (id === activeId) {
        setScreen('home');
        setActiveId(state.cases.find((c) => c.id !== id)?.id || '');
      }
      showToast('현장을 삭제했습니다');
    },
    [activeId, state.cases, showToast]
  );

  const openCase = useCallback((id) => {
    setActiveId(id);
    setTab(1);
    setScreen('case');
    window.scrollTo({ top: 0 });
  }, []);

  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => {
          setUnlocked(true);
          setUnlockedState(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur no-print">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-2.5">
          {screen === 'case' || screen === 'bids' ? (
            <button
              type="button"
              onClick={() => setScreen('home')}
              aria-label="장부로 돌아가기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-2 active:bg-slate-200"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
            </button>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-brand">
              <HardHat className="h-5 w-5" strokeWidth={2.2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div
              className={
                screen === 'case'
                  ? 'line-clamp-2 text-[15px] font-bold leading-[19px] tracking-tight text-ink'
                  : 'text-[15px] font-extrabold tracking-tight text-ink'
              }
            >
              {screen === 'case' ? activeCase?.title || '현장' : screen === 'bids' ? '관공서 일감' : 'AI 현장 매니저'}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-2xs font-semibold text-ink-3">
              {screen === 'case' ? (
                <span className="truncate">
                  {activeCase?.region || '지역 미입력'} · {activeCase?.clientName || '고객 미입력'}
                </span>
              ) : screen === 'bids' ? (
                <span className="truncate">안동·경북 실제 공고 · 매일 갱신</span>
              ) : (
                <>
                  <span
                    aria-hidden
                    className={cx('h-1.5 w-1.5 shrink-0 rounded-full', savedAt ? 'bg-emerald-500' : 'bg-slate-300')}
                  />
                  <span className="truncate">{savedAt ? `저장됨 ${savedAt}` : '경북 철거·인테리어 장부'}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setUnlocked(false);
              setUnlockedState(false);
            }}
            aria-label="잠그기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-3 active:bg-slate-200"
          >
            <Lock className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="설정"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-2 active:bg-slate-200"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {screen === 'bids' ? (
        <BidsScreen onImport={handleImportBid} />
      ) : screen === 'home' || !activeCase ? (
        <HomeScreen
          cases={state.cases}
          onOpen={openCase}
          onUpdate={updateCase}
          onNew={openNewCase}
          onDelete={handleDelete}
          showToast={showToast}
          savedAt={savedAt}
          bids={{ open: bidInfo.open, soon: bidInfo.soon }}
          onOpenBids={() => setScreen('bids')}
        />
      ) : (
        <Workspace
          key={activeCase.id}
          activeCase={activeCase}
          updateCase={updateActive}
          tab={tab}
          setTab={setTab}
          showToast={showToast}
          apiKey={state.settings.apiKey}
          completedCases={state.cases.filter((x) => x.stage === 'closed')}
          onOpenSettings={() => setSettingsOpen(true)}
          goHome={() => setScreen('home')}
          onMoveToArchive={(id) => {
            updateCase(id, { stage: 'closed', collection: 'settled' });
            showToast('정산 완료 — 보관함으로 옮겼습니다');
          }}
        />
      )}

      <NewCaseModal open={newCaseOpen} onClose={() => setNewCaseOpen(false)} onCreate={handleCreate} settings={state.settings} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        setState={setState}
        showToast={showToast}
      />
      <Toast message={toastMsg} />
    </div>
  );
}
