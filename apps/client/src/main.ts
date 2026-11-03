import './style.css';
import { GAME_NAME } from '@dilam/shared';
import {
  activeMission,
  BALANCE,
  goalAmount,
  levelProgress,
  QUICK_CHATS,
  jobName,
  jobTagFor,
  ladderUnlockLevels,
  levelFor,
  titleForLevel,
  dayMood,
  PROTOCOL_VERSION,
  COMPANY_COLORS,
  hasCeoMeeting,
  CEO_MEETING_SEAT_PREFIX,
  type CompanyPublic,
  type MyCompanyResponse,
  type InventoryResponse,
  type LeaderboardResponse,
  type WallPost,
  type Branch,
  type ProgressState,
  type RoomEventView,
  type Workplace,
  type ServerMessage,
  type UsernameCheckResponse,
} from '@dilam/shared';
import { ActivityBus } from './activities/events';
import { OfficeActivities } from './activities/officeActivities';
import { AudioEngine, type SoundName } from './audio/audioEngine';
import { DEFAULT_APPEARANCE, NAME_MAX_LENGTH, type Profile } from './avatar/appearance';
import { randomVietnameseName } from './avatar/names';
import { Engine } from './engine/engine';
import { detectLowPower, initialAutoLevel } from './engine/quality';
import { analyticsEnabled, setAnalyticsEnabled, track } from './net/analytics';
import { ApiClient } from './net/api';
import { RoomClient, type ActionReply } from './net/roomClient';
import {
  login,
  logout,
  recoverAccount,
  register,
  resumeSession,
  startGuest,
  type SessionStores,
  type SignInResult,
} from './net/session';
import { actionForEvent } from './progress/eventActions';
import { markLocalSaveImported, pendingLocalSave } from './progress/localSave';
import { ServerProgress } from './progress/serverProgress';
import { compareVersion, registerServiceWorker } from './version';
import { CreatorScene } from './scenes/creatorScene';
import { createNpcRoster, createStaffRoster } from './npc/roster';
import { OfficeScene, type OfficeEvent } from './scenes/officeScene';
import {
  loadAudioSettings,
  loadCoachDone,
  loadProfile,
  loadQualityMode,
  openLocalStorage,
  openSessionStorage,
  saveAudioSettings,
  saveCoachDone,
  saveProfile,
  saveQualityMode,
} from './storage';
import { STRINGS } from './strings';
import { mountCreatorPanel } from './ui/creatorPanel';
import { mountLobbyPanel } from './ui/lobbyPanel';
import { mountViewPanel } from './ui/viewPanel';
import { el } from './ui/dom';
import { showCoachMarks, type CoachCard } from './ui/coachMarks';
import { openModal, type Modal } from './ui/modal';
import type { CallResult, CompanyApi } from './ui/companyPanel';
import { projectNameOf } from './ui/projectName';

// Các màn ít dùng được tải lười (chia nhỏ JS, tải ban đầu nhẹ hơn).
const lazy = {
  shop: () => import('./ui/shopPanel'),
  company: () => import('./ui/companyPanel'),
  wall: () => import('./ui/wallPanel'),
  leaderboard: () => import('./ui/leaderboardPanel'),
  brag: () => import('./ui/bragCard'),
  dev: () => import('./ui/devPanel'),
  companyMap: () => import('./ui/companyMapPanel'),
};
import { mountOfficeHud, type OfficeHud } from './ui/officeHud';
import { mountProfilePanel, type ProfileTab } from './ui/profilePanel';
import { askChoices, celebratePromotion, type PromotionDeps } from './ui/promotion';
import { mountRoomEventBanner } from './ui/roomEventBanner';
import { mountTeaInvite } from './ui/teaInvite';
import { enhanceSelects } from './ui/prettySelect';
import { loadHidden, mountSocialPanel, saveHidden } from './ui/socialPanel';
import { OFFICE_FLOOR, type Interactable, type InteractableKind } from './world/office/layout';
import { isDayPeriod, periodOfDay, type DayPeriod } from './world/office/period';

function requireElement<T extends Element>(selector: string, type: abstract new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing ${selector} in index.html`);
  return element;
}

document.title = GAME_NAME;
const canvas = requireElement('#scene', HTMLCanvasElement);
const hudRoot = requireElement('#hud', HTMLElement);
// Mọi ô chọn (<select>) trong game dùng dropdown tự vẽ cho đẹp, mở/đóng mượt.
enhanceSelects(hudRoot);
const debug = new URLSearchParams(window.location.search).has('debug');
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
/** Chế độ máy yếu tự phát hiện: bắt đầu ở chất lượng thấp (ít bóng, ít nhân vật chi tiết, ít hiệu ứng). */
const lowPower = detectLowPower({
  hardwareConcurrency: navigator.hardwareConcurrency,
  ...('deviceMemory' in navigator ? { deviceMemory: Number(navigator.deviceMemory) } : {}),
  ...('connection' in navigator
    ? { saveData: Boolean((navigator.connection as { saveData?: boolean } | undefined)?.saveData) }
    : {}),
});

const params = new URLSearchParams(window.location.search);
/** ?time=morning|afternoon|night: ép buổi trong ngày (để thử, chụp ảnh). */
const forcedPeriod = params.get('time');
const currentPeriod = (): DayPeriod =>
  isDayPeriod(forcedPeriod) ? forcedPeriod : periodOfDay(new Date());

const store = openLocalStorage();
const storageNotice = store ? null : STRINGS.storage.blocked;
/** Bus sự kiện hoạt động: ghi lại để trang events.html xem, và đổi thành hành động gửi server. */
const bus = new ActivityBus(store);
const api = new ApiClient();
/** Tài khoản đăng ký: localStorage. Khách: sessionStorage (đóng tab là mất). */
const stores: SessionStores = { local: store, tab: openSessionStorage() };

type Session = Extract<SignInResult, { ok: true }>;

/**
 * Vào lại phiên đã lưu; chưa có thì vào thẳng bằng tài khoản chơi thử (đăng ký / đăng nhập nằm ở
 * màn "Ở nhà"). Mất mạng thì hiện nút thử lại.
 */
async function bootSession(): Promise<Session> {
  const status = el('p', { className: 'notice notice-center', text: STRINGS.net.bootTitle });
  hudRoot.append(status);
  for (;;) {
    const result = (await resumeSession(api, stores)) ?? (await startGuest(api, stores));
    if (result.ok) {
      status.remove();
      return result;
    }
    status.textContent =
      result.error === 'rate_limited' ? STRINGS.net.bootRateLimited : STRINGS.net.bootFailed;
    const retry = el('button', {
      className: 'button button-primary',
      text: STRINGS.net.retry,
      attrs: { type: 'button' },
    });
    status.append(el('br'), retry);
    await new Promise<void>((resolve) => {
      retry.addEventListener('click', () => {
        resolve();
      });
    });
    status.textContent = STRINGS.net.bootTitle;
  }
}

registerServiceWorker();

/** Báo có bản mới (bắt buộc tải lại nếu giao thức đã đổi). */
let updateShown = false;
function showUpdate(required: boolean): void {
  if (updateShown) return;
  updateShown = true;
  const reload = el('button', {
    className: 'button button-primary',
    text: STRINGS.update.reload,
    attrs: { type: 'button' },
  });
  reload.addEventListener('click', () => {
    window.location.reload();
  });
  hudRoot.append(
    el('div', {
      className: required ? 'update-banner is-required' : 'update-banner',
      attrs: { role: 'alert' },
      children: [
        el('span', { text: required ? STRINGS.update.required : STRINGS.update.available }),
        reload,
      ],
    }),
  );
}
async function checkVersion(): Promise<void> {
  const meta = await api.request<{ protocolVersion: number; buildId?: string | null }>(
    'GET',
    '/api/meta',
  );
  if (!meta.ok) return;
  const status = compareVersion(meta.value);
  if (status !== 'ok') showUpdate(status === 'required');
}
void checkVersion();
window.setInterval(() => void checkVersion(), 10 * 60_000);

const session = await bootSession();
track(store, 'session_start');
const playerId = session.me.playerCode;
// Tiến độ do server tính (Phase 4C); client chỉ hiển thị.
const progress = new ServerProgress(session.me.progress);
let startNotice: string | null = null;

// Tiến độ cũ chơi trên máy này (Phase 3): nhập một lần vào tài khoản.
// Khách không nhận: rời đi là mất, giữ lại mã lưu cho tài khoản thật.
const localSave =
  session.me.imported || session.me.guest ? null : pendingLocalSave(store, Date.now());
if (localSave) {
  const imported = await api.importSave(localSave);
  if (imported.ok) {
    progress.replace(imported.value.progress);
    startNotice = STRINGS.net.imported;
  }
  // Đã nhập hoặc bị từ chối hẳn (đã có tiến độ, quá cao...): không gửi lại nữa.
  if (imported.ok || imported.status === 409 || imported.status === 422) {
    markLocalSaveImported(store);
  }
}

/** Báo lý do server từ chối một hành động (bỏ qua các lý do không cần người chơi biết). */
let toastReject: (text: string) => void = () => undefined;
const reportReply = (reply: ActionReply): void => {
  if (reply.ok) return;
  if (reply.reason === 'too_far' || reply.reason === 'too_fast') {
    toastReject(STRINGS.net.rejected[reply.reason] ?? '');
  } else if (reply.reason === 'offline' || reply.reason === 'timeout') {
    toastReject(STRINGS.net.actionFailed);
  }
};
bus.on((event) => {
  const action = actionForEvent(event);
  if (action) void progress.act(action).then(reportReply);
});

// Âm thanh dùng chung cho cả trang; chỉ bật sau lần chạm/bấm phím đầu tiên (chính sách autoplay).
const audio = new AudioEngine(loadAudioSettings(store), STRINGS.office.floorName);
const unlockAudio = (): void => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
};
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

/** Tiếng động khi dùng từng loại vật. */
const INTERACT_SOUNDS: Partial<Record<InteractableKind, SoundName>> = {
  printer: 'printer',
  fridge: 'ting',
  plant: 'ting',
  window: 'ting',
};

/** Đánh dấu "vừa đăng nhập" qua lần tải lại trang (để vào thẳng nơi làm của tài khoản mới). */
const AFTER_LOGIN_KEY = 'dilam.afterLogin';
function markAfterLogin(): void {
  try {
    window.sessionStorage.setItem(AFTER_LOGIN_KEY, '1');
  } catch {
    // bị chặn lưu: vẫn tải lại, chỉ là dừng ở màn Ở nhà
  }
}
function takeAfterLogin(): boolean {
  try {
    const marked = window.sessionStorage.getItem(AFTER_LOGIN_KEY) === '1';
    window.sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return marked;
  } catch {
    return false;
  }
}

/** Hộp thoại mã khôi phục (chỉ hiện một lần khi vừa tạo tài khoản). */
function showRecoveryCode(code: string): void {
  const a = STRINGS.account;
  const modal = openModal(hudRoot, { title: a.recoveryTitle });
  const codeEl = el('code', { className: 'recovery-code', text: code });
  const copy = el('button', {
    className: 'button button-soft',
    text: a.copy,
    attrs: { type: 'button' },
  });
  copy.addEventListener('click', () => {
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(() => {
        copy.textContent = a.copied;
      })
      .catch(() => undefined);
  });
  const done = el('button', {
    className: 'button button-primary',
    text: a.saved,
    attrs: { type: 'button' },
  });
  done.addEventListener('click', () => {
    modal.close();
  });
  modal.body.append(
    el('p', { className: 'activity-intro', text: a.recoveryIntro }),
    codeEl,
    el('div', { className: 'activity-actions', children: [copy, done] }),
  );
}

function start(): void {
  let officeHud: OfficeHud | null = null;
  let engine: Engine;
  try {
    engine = new Engine(canvas, {
      mode: loadQualityMode(store),
      autoStartLevel: initialAutoLevel(coarsePointer, lowPower),
      onAutoDowngrade: (level) => {
        officeHud?.showToast(STRINGS.office.qualityLowered(STRINGS.office.qualityModes[level]));
      },
      onStats: (stats) => {
        officeHud?.setStats(stats);
      },
    });
  } catch (error) {
    console.error(error);
    hudRoot.append(
      el('p', { className: 'notice notice-center', text: STRINGS.errors.webglUnavailable }),
    );
    return;
  }

  let teardown: (() => void) | null = null;
  let office: OfficeScene | null = null;
  let lastInteraction: string | null = null;

  /** Lưu nhân vật lên server (tên qua bộ lọc); bản trên máy chỉ để mở nhanh lần sau. */
  const saveCharacter = async (
    finished: Profile,
  ): Promise<{ ok: true; profile: Profile } | { ok: false; notice: string }> => {
    const saved = await api.saveCharacter(finished);
    if (!saved.ok) {
      return {
        ok: false,
        notice: saved.error === 'rejected' ? STRINGS.net.nameRejected : STRINGS.net.saveFailed,
      };
    }
    const profile = saved.value.character ?? finished;
    saveProfile(store, profile);
    return { ok: true, profile };
  };

  /** Màn "Sửa nhân vật" (từ Ở nhà): Lưu hoặc X đều quay về `back`. */
  const showCreator = (
    profile: Profile,
    notice: string | null,
    back: (profile: Profile) => void,
  ): void => {
    teardown?.();
    const scene = new CreatorScene(canvas, profile.appearance);
    engine.setController(scene);
    const panel = mountCreatorPanel(hudRoot, {
      profile,
      notice,
      onAppearanceChange: (appearance) => {
        scene.setAppearance(appearance);
      },
      onPoseChange: (pose) => {
        scene.setPose(pose);
      },
      onSave: (finished) => {
        void saveCharacter(finished).then((result) => {
          if (result.ok) back(result.profile);
          else showCreator(finished, result.notice, back);
        });
      },
      onClose: () => {
        back(profile);
      },
    });
    const updateInset = (): void => {
      scene.setViewInset(panel.getInset());
    };
    const observer = new ResizeObserver(updateInset);
    observer.observe(panel.element);
    window.addEventListener('resize', updateInset);
    updateInset();
    teardown = () => {
      observer.disconnect();
      window.removeEventListener('resize', updateInset);
      panel.dispose();
      engine.setController(null);
    };
  };

  /** Mở bảng công ty trong một hộp thoại (dùng ở văn phòng và ở màn "Ở nhà"). */
  const mountCompany = (
    modal: Modal,
    ctl: Pick<CompanyApi, 'enterRoom' | 'currentCompanyRoom' | 'onLeft' | 'onChanged'>,
  ): void => {
    track(store, 'company_open');
    modal.body.closest('.modal')?.classList.add('modal-wide');
    void lazy.company().then(({ mountCompanyPanel }) => {
      mountCompanyPanel(modal.body, {
        get: async <T>(path: string) => {
          const r = await api.request<T>('GET', path);
          return r.ok ? r.value : null;
        },
        post: async <T>(path: string, body?: unknown): Promise<CallResult<T>> => {
          const r = await api.request<T>('POST', path, body ?? {});
          return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason ?? r.error };
        },
        ...ctl,
      });
    });
  };

  /** Bản đồ công ty: danh sách công ty theo vùng, tỉnh/thành; xin vào làm. */
  const mountCompanyMap = (modal: Modal, onJoined?: () => void): void => {
    modal.body.closest('.modal')?.classList.add('modal-wide');
    void lazy.companyMap().then(({ mountCompanyMapPanel }) => {
      mountCompanyMapPanel(modal.body, {
        load: async () => {
          const r = await api.request<{ companies: CompanyPublic[] }>(
            'GET',
            '/api/company/directory',
          );
          return r.ok ? r.value.companies : null;
        },
        apply: async (companyId) => {
          const r = await api.request('POST', '/api/company/apply', { companyId });
          return r.ok ? null : (r.reason ?? r.error);
        },
        level: () => levelFor(progress.state.xp),
        join: async (code) => {
          const r = await api.request('POST', '/api/company/join', { code });
          return r.ok ? null : (r.reason ?? r.error);
        },
        ...(onJoined ? { onJoined } : {}),
      });
    });
  };

  /** Nơi đang làm, để hiện trên nút "Đi làm" (null: đang nghỉ việc). */
  const workplaceName = async (): Promise<string | null> => {
    const employer = progress.state.employer;
    if (employer === null) return null;
    if (employer.startsWith('npc:')) return STRINGS.company.npcEmployer(employer.slice(4));
    if (employer.startsWith('company:')) {
      const r = await api.request<CompanyPublic>(
        'GET',
        `/api/company/info/${encodeURIComponent(employer.slice('company:'.length))}`,
      );
      return r.ok ? r.value.name : (STRINGS.company.employer['may-hong'] ?? '');
    }
    return STRINGS.company.employer[employer] ?? employer;
  };

  // Công ty người chơi đang làm, để tính chức danh: tự mở là CEO, làm cho người khác thì
  // theo khung cấp từng vị trí; ở văn phòng chung thì theo thang chức danh chung.
  let workplace: Workplace | null = null;
  /** Tên công ty người chơi đang làm / làm chủ (để hiện trên thẻ nhân viên). */
  let myCompanyName: string | null = null;
  const loadWorkplace = async (): Promise<void> => {
    if (!progress.state.employer?.startsWith('company:')) {
      workplace = null;
      myCompanyName = null;
      progress.setCareerUnlock(undefined);
      return;
    }
    const r = await api.request<MyCompanyResponse>('GET', '/api/company/me');
    const detail = r.ok ? r.value.detail : null;
    workplace = detail ? { owner: detail.isOwner, ladder: detail.company.hiringBands } : null;
    myCompanyName = detail?.company.name ?? null;
    // Nhân viên: mốc chọn phòng ban / nhánh theo lộ trình CEO đặt (server cũng kiểm tra y vậy).
    progress.setCareerUnlock(
      workplace && !workplace.owner ? ladderUnlockLevels(workplace.ladder) : undefined,
    );
  };
  const jobAtLevel = (level: number, branch: Branch | null): string =>
    jobName(jobTagFor(workplace, level), titleForLevel(level), branch);
  const myJob = (state: ProgressState = progress.state): string =>
    jobAtLevel(levelFor(state.xp), state.branch);

  /** Vào văn phòng nơi đang làm (công ty của mình / công ty đang làm / văn phòng chung). */
  const goToWork = (profile: Profile): void => {
    const employer = progress.state.employer;
    if (employer === null) {
      // Nghỉ việc rồi: quay lại Công Sở trước khi vào văn phòng chung.
      void api.request('POST', '/api/company/rejoin-default', {}).then(() => {
        showOffice(profile, null);
      });
      return;
    }
    showOffice(profile, null, employer.startsWith('company:') ? employer : 'office');
  };

  // ---------- Màn "Ở nhà": ngoài văn phòng ----------
  const account = { guest: session.me.guest, username: session.me.username };
  const showLobby = (profile: Profile, notice: string | null): void => {
    teardown?.();
    const scene = new CreatorScene(canvas, profile.appearance);
    scene.setAutoRotate(true);
    engine.setController(scene);
    let disposed = false;
    let panel: ReturnType<typeof mountLobbyPanel> | null = null;
    let observer: ResizeObserver | null = null;
    let modal: Modal | null = null;
    let coach: { dispose(): void } | null = null;
    // Lần đầu vào: hỏi tên (điền sẵn tên ngẫu nhiên), lưu xong mới tới hướng dẫn.
    const askName = (): void => {
      const n = STRINGS.lobby.welcomeName;
      const nameModal = openModal(hudRoot, {
        title: n.title,
        onClose: () => {
          saveCoachDone(store, 'name');
          if (!disposed && !loadCoachDone(store, 'lobby')) startCoach();
        },
      });
      const input = el('input', {
        className: 'creator-input',
        attrs: { type: 'text', maxlength: String(NAME_MAX_LENGTH), 'aria-label': n.title },
      });
      input.value = profile.name;
      const random = el('button', {
        className: 'button button-soft',
        text: STRINGS.creator.randomName,
        attrs: { type: 'button' },
      });
      random.addEventListener('click', () => {
        input.value = randomVietnameseName(Math.random, input.value);
      });
      const next = el('button', {
        className: 'button button-primary',
        text: n.next,
        attrs: { type: 'submit' },
      });
      const error = el('p', { className: 'activity-message', attrs: { role: 'status' } });
      const form = el('form', {
        className: 'auth-form',
        children: [
          el('p', { className: 'activity-intro', text: n.body }),
          el('div', { className: 'creator-name-row', children: [input, random] }),
          error,
          next,
        ],
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name || name === profile.name) {
          nameModal.close();
          return;
        }
        next.disabled = true;
        void saveCharacter({ ...profile, name }).then((result) => {
          next.disabled = false;
          if (!result.ok) {
            error.textContent = result.notice;
            error.dataset.tone = 'error';
            return;
          }
          nameModal.close();
          // Dựng lại màn Ở nhà với tên mới (hướng dẫn chạy tiếp ở đó).
          showLobby(result.profile, null);
        });
      });
      nameModal.body.append(form);
      input.focus();
      input.select();
    };
    const startCoach = (): void => {
      coach?.dispose();
      coach = showCoachMarks(hudRoot, {
        cards: STRINGS.coach.lobby,
        onDone: () => {
          coach = null;
          saveCoachDone(store, 'lobby');
        },
      });
    };
    const updateInset = (): void => {
      if (panel) scene.setViewInset(panel.getInset());
    };
    const p = levelProgress(progress.state.xp);
    void Promise.all([workplaceName(), loadWorkplace()]).then(([workplace]) => {
      if (disposed) return;
      panel = mountLobbyPanel(hudRoot, {
        name: profile.name,
        stats: STRINGS.lobby.stats(p.level, myJob(), progress.state.coins),
        workplace,
        notice,
        account: { ...account },
        onWork: () => {
          goToWork(profile);
        },
        onCompany: () => {
          modal?.close();
          modal = openModal(hudRoot, { title: STRINGS.company.title });
          const current = modal;
          mountCompany(current, {
            enterRoom: (companyId) => {
              current.close();
              showOffice(profile, null, `company:${companyId}`);
            },
            currentCompanyRoom: () => null,
            onLeft: () => {
              current.close();
              showLobby(profile, STRINGS.lobby.leftCompany);
            },
          });
        },
        onCompanyMap: () => {
          modal?.close();
          modal = openModal(hudRoot, { title: STRINGS.companyMap.title });
          // Vào công ty bằng mã mời: dựng lại màn Ở nhà để nút Đi làm trỏ tới công ty mới.
          mountCompanyMap(modal, () => {
            window.setTimeout(() => {
              showLobby(profile, STRINGS.companyMap.joined);
            }, 900);
          });
        },
        onEdit: () => {
          showCreator(profile, storageNotice, (saved) => {
            showLobby(saved, null);
          });
        },
        onRename: async (name) => {
          const result = await saveCharacter({ ...profile, name });
          if (!result.ok) return result.notice;
          profile = result.profile;
          return null;
        },
        onRegister: async (username, password) => {
          const result = await register(api, stores, username, password);
          if (!result.ok) return result.error;
          account.guest = false;
          account.username = result.me.username;
          return null;
        },
        // Đăng nhập / khôi phục tài khoản khác: tải lại trang để vào bằng phiên mới.
        onLogin: async (username, password) => {
          const result = await login(api, stores, username, password);
          if (!result.ok) return result.error;
          markAfterLogin();
          window.location.reload();
          return null;
        },
        onRecover: async (code) => {
          const result = await recoverAccount(api, stores, code);
          if (!result.ok) return result.error;
          markAfterLogin();
          window.location.reload();
          return null;
        },
        checkUsername: async (username) => {
          const r = await api.request<UsernameCheckResponse>(
            'GET',
            `/api/accounts/available?username=${encodeURIComponent(username)}`,
          );
          return r.ok ? r.value : null;
        },
        onLogout: () => {
          void logout(api, stores).then(() => {
            window.location.reload();
          });
        },
      });
      observer = new ResizeObserver(updateInset);
      observer.observe(panel.element);
      updateInset();
      if (!loadCoachDone(store, 'name')) askName();
      else if (!loadCoachDone(store, 'lobby')) startCoach();
    });
    window.addEventListener('resize', updateInset);
    teardown = () => {
      disposed = true;
      coach?.dispose();
      modal?.close();
      observer?.disconnect();
      window.removeEventListener('resize', updateInset);
      panel?.dispose();
      engine.setController(null);
    };
  };

  const showOffice = (profile: Profile, notice: string | null, startRoom?: string): void => {
    teardown?.();
    /** Phòng muốn vào (công ty...): chuyển sang sau khi server chào ở văn phòng chung. */
    let pendingRoom = startRoom && startRoom !== 'office' ? startRoom : null;
    let hud: OfficeHud | null = null;
    let activities: OfficeActivities | null = null;
    const results: Partial<Record<InteractableKind, string>> = STRINGS.interact.results;
    // Gán sau khi dựng xong phòng và bảng công ty (bên dưới).
    let roomKindNow = (): string => 'office';
    let openCompanyNow = (): void => undefined;
    let openHubNow = (): void => undefined;
    const onEvent = (event: OfficeEvent): void => {
      if (event.type === 'screen') {
        if (event.item.kind === 'ceodesk') openCompanyNow();
        else if (event.item.kind === 'desk') openHubNow();
        return;
      }
      if (event.type === 'ceoSeatDenied') {
        hud?.showToast(STRINGS.ceo.seatDenied);
        return;
      }
      if (event.type === 'seatTaken') {
        hud?.showToast(STRINGS.interact.seatTaken(event.name));
        return;
      }
      if (event.type === 'gift') {
        activities?.giftCoffee(event.npcId, event.name);
        return;
      }
      lastInteraction = event.item.id;
      if (activities?.handleInteract(event.item)) return;
      const { kind } = event.item;
      if (kind === 'ceodoor') {
        // Máy quẹt thẻ phòng CEO: chỉ chủ công ty (trong phòng công ty của mình) có thẻ.
        const ok = office?.hasCeoAccess() ?? false;
        audio.play(ok ? 'ting' : 'printer');
        hud?.showToast(
          ok
            ? hasCeoMeeting(progress.state)
              ? STRINGS.ceo.swipeMeeting
              : STRINGS.ceo.swipeOk
            : roomKindNow().startsWith('company:')
              ? STRINGS.ceo.swipeDenied
              : STRINGS.ceo.sharedOffice,
        );
        return;
      }
      if (kind === 'ceodesk') {
        openCompanyNow();
        return;
      }
      const sound = INTERACT_SOUNDS[kind];
      if (sound) audio.play(sound);
      const text = kind === 'window' ? STRINGS.interact.window[currentPeriod()] : results[kind];
      if (text) hud?.showToast(text);
    };
    // Việc sếp giao kiểu ngồi họp (phòng họp / sofa phòng sếp): ngồi đủ giờ thì báo và tự đứng dậy.
    let meetingTimer: number | undefined;
    const scheduleMeetingEnd = (item: Interactable | null): void => {
      window.clearTimeout(meetingTimer);
      meetingTimer = undefined;
      if (item?.kind !== 'meeting') return;
      const mission = activeMission(progress.state);
      if (!mission) return;
      const goal = mission.goal;
      const fits =
        goal.kind === 'meetingMinutes' ||
        (goal.kind === 'ceoMeeting' && item.id.startsWith(CEO_MEETING_SEAT_PREFIX));
      if (!fits) return;
      const left = Math.max(1, goal.amount - mission.progress);
      // Dư 1,5 giây cho chắc server đếm đủ phút.
      meetingTimer = window.setTimeout(
        () => {
          meetingTimer = undefined;
          audio.play('ting');
          hud?.showToast(STRINGS.events.meetingDone);
          office?.leaveSeat();
        },
        left * 60_000 + 1500,
      );
    };
    const scene = new OfficeScene({
      canvas,
      hudLayer: hudRoot,
      appearance: profile.appearance,
      layout: OFFICE_FLOOR,
      period: currentPeriod(),
      npcs: createNpcRoster(),
      playerName: profile.name,
      onHint: (hint) => {
        hud?.setHint(hint);
      },
      onEvent,
      onSound: (name) => {
        audio.play(name);
      },
      canGiftCoffee: () => activities?.canGiftCoffee() ?? false,
      onSeatChange: (item) => {
        activities?.onSeatChange(item);
        scheduleMeetingEnd(item);
        // Họp đột xuất: ngồi vào ghế phòng họp là xong phần mình, tắt banner.
        if (item?.kind === 'meeting' && eventState?.kind === 'surprise_meeting') {
          banner.dismiss(eventState.id, STRINGS.events.joinedMeeting);
        }
        // Ngồi máy hoặc ghế họp: XP nhỏ giọt mỗi phút (server tính), hiện mũi tên ▲.
        hud?.setXpRising(
          item?.kind === 'desk' || item?.kind === 'meeting' || item?.kind === 'ceodesk',
        );
      },
    });
    office = scene;
    engine.setController(scene);
    hud = mountOfficeHud(hudRoot, {
      name: profile.name,
      floorName: STRINGS.office.floorName,
      mode: engine.qualityMode,
      audio: audio.getSettings(),
      touch: coarsePointer,
      notice,
      showStats: debug,
      onEdit: () => {
        editCard();
      },
      onGoHome: () => {
        showLobby(profile, null);
      },
      onQualityChange: (mode) => {
        engine.setQualityMode(mode);
        saveQualityMode(store, mode);
      },
      onAudioChange: (settings) => {
        audio.unlock();
        audio.setEnabled(settings.enabled);
        audio.setVolume(settings.volume);
        saveAudioSettings(store, settings);
      },
      onInteract: () => {
        scene.triggerHint();
      },
      onFocusStart: () => {
        activities?.startFocus();
      },
      onDrinkCoffee: () => {
        activities?.drinkCoffee();
      },
      onOpenProfile: () => {
        openProfile();
      },
      onOpenSocial: () => {
        openSocial();
      },
      onOpenShop: () => {
        openShop();
      },
      onOpenMore: () => {
        openHub();
      },
      onWipe: () => {
        activities?.wipeDesk();
      },
    });
    officeHud = hud;
    const viewPanel = mountViewPanel(hudRoot, scene, hud.menu);
    const officeActivities = new OfficeActivities({
      root: hudRoot,
      store,
      bus,
      playerId,
      playerName: profile.name,
      floorName: STRINGS.office.floorName,
      openWall: () => {
        openWall();
      },
      coffeeOut: () => {
        if (eventState?.kind !== 'coffee_out') return false;
        respondEvent();
        return true;
      },
      progress: {
        checkIn: () => progress.state.checkIn,
        act: async (action) => {
          const reply = await progress.act(action);
          reportReply(reply);
          return reply;
        },
      },
      scene,
      hud,
      play: (sound) => {
        audio.play(sound);
      },
    });
    activities = officeActivities;
    const officeHudView = hud;

    // ---------- Tiến độ: thanh XP, lên cấp, lên chức danh, việc sếp giao ----------
    const refreshProgress = (state: ProgressState = progress.state): void => {
      const p = levelProgress(state.xp);
      officeHudView.setProgress({
        level: p.level,
        title: myJob(state),
        ratio: p.ratio,
        into: p.into,
        needed: p.needed,
        isMax: p.isMax,
        coins: state.coins,
      });
      const mission = activeMission(state);
      officeHudView.setMission(
        mission
          ? {
              goalText: mission.goalText,
              progress: mission.progress,
              total: goalAmount(mission.goal),
            }
          : null,
      );
    };
    const promotionDeps: PromotionDeps = {
      root: hudRoot,
      openPanel: (title, onClose) => officeActivities.openPanel(title, onClose),
      lockInput: (locked) => {
        scene.setInputLocked(locked);
      },
      play: (sound) => {
        audio.play(sound);
      },
      progress,
    };
    const offProgress = progress.onChange((state, change) => {
      refreshProgress(state);
      // Nhận / xong việc "Họp với sếp" thì mở / đóng thẻ vào phòng sếp.
      updateCeoAccess();
      if (change.kind === 'outcome') {
        const result = change.outcome;
        if (result.granted > 0)
          officeHudView.showXpGain(result.granted, result.granted < result.base);
        if (result.completedMission) {
          audio.play('ting');
          officeHudView.showToast(STRINGS.progress.mission.done(BALANCE.mission));
        }
        const jobBefore = jobAtLevel(result.levelBefore, state.branch);
        const jobAfter = jobAtLevel(result.levelAfter, state.branch);
        if (jobAfter !== jobBefore) {
          // Lên chức danh ở nơi đang làm: màn chúc mừng rồi hỏi phòng ban / nhánh nếu vừa mở khoá.
          celebratePromotion(promotionDeps, jobAfter);
        } else {
          if (result.levelAfter > result.levelBefore) {
            audio.play('levelup');
            officeHudView.showToast(STRINGS.progress.levelUp(result.levelAfter));
          }
          // Ở công ty người chơi, thang chức danh chung vẫn mở khoá phòng ban / nhánh.
          if (result.titleAfter > result.titleBefore) askChoices(promotionDeps);
        }
      } else if (change.kind === 'missionAssigned') {
        audio.play('ting');
        officeHudView.showToast(change.mission.text);
      }
    });
    refreshProgress();
    track(store, 'office_enter');
    toastReject = (text) => {
      if (text) officeHudView.showToast(text);
    };

    // ---------- Phòng (Phase 4B): người chơi khác, biểu cảm, câu nhanh ----------
    const hidden = loadHidden(store);
    scene.remotes.setHidden(hidden);
    const updateOnline = (): void => {
      officeHudView.setNetStatus(STRINGS.net.online(scene.remotes.count), 'ok');
    };
    let idleModal: { close(): void } | null = null;
    const onRoomMessage = (message: ServerMessage): void => {
      switch (message.type) {
        case 'welcome':
          if (message.protocol !== PROTOCOL_VERSION) showUpdate(true);
          serverOffset = message.serverTime - Date.now();
          roomKind = message.room.replace(/-\d+$/, '');
          // Vào (lại) phòng: hỏi lại server quyền chủ (có thể vừa mở / bán công ty).
          ownerCache = null;
          updateCeoAccess();
          // Nơi làm có thể vừa đổi (mở công ty, được nhận, nghỉ việc): tính lại chức danh.
          void loadWorkplace().then(() => {
            refreshProgress();
          });
          if (pendingRoom && roomKind !== pendingRoom) {
            room.send({ type: 'switch_room', roomId: pendingRoom });
          }
          pendingRoom = null;
          updateSign();
          scene.remotes.clear();
          for (const player of message.players) scene.remotes.add(player);
          updateOnline();
          break;
        case 'player_join':
          scene.remotes.add(message.player);
          updateOnline();
          break;
        case 'player_update':
          scene.remotes.updateProfile(message.player);
          break;
        case 'player_leave':
          scene.remotes.remove(message.sid);
          updateOnline();
          break;
        case 'states':
          scene.remotes.applyStates(message.s);
          break;
        case 'emote':
          scene.remotes.say(
            message.sid,
            STRINGS.social.emoteNames[message.emote] ?? '',
            message.emote,
          );
          break;
        case 'quick_chat':
          scene.remotes.say(message.sid, QUICK_CHATS[message.index] ?? '');
          break;
        case 'company_refresh':
          // Công ty đổi tên / mua đồ / đổi màu đồng phục.
          updateSign();
          break;
        case 'project_done':
          // CEO: công ty vừa xong một dự án.
          audio.play('ting');
          // Nhân viên: báo phần thưởng mình nhận; CEO: báo dự án xong.
          if (message.bonus) {
            officeHudView.showToast(
              STRINGS.company.projectBonusToast(
                projectNameOf(message.industry, message.nameIndex),
                message.bonus.coins,
                message.bonus.xp,
              ),
            );
            break;
          }
          officeHudView.showToast(
            STRINGS.company.projectDoneToast(
              projectNameOf(message.industry, message.nameIndex),
              message.reward,
              message.reputation,
            ),
          );
          break;
        case 'coffee_received':
          // Được người chơi khác tặng cà phê: cảm ơn (bong bóng) và báo.
          audio.play('ting');
          officeHudView.showToast(STRINGS.coffee.received(message.fromName));
          scene.playerSay(STRINGS.coffee.thanks, 'coffee');
          scene.remotes.say(message.fromSid, '☕');
          break;
        // ---------- Rủ uống trà sữa ----------
        case 'tea_round':
          teaCard.show(message.round, serverOffset);
          audio.play('ting');
          break;
        case 'tea_started':
          myTeaRound = message.round.id;
          officeHudView.showToast(STRINGS.tea.started(message.round.price));
          if (message.xp > 0) officeHudView.showXpGain(message.xp, false);
          scene.playerSay(STRINGS.tea.sip, 'coffee');
          break;
        case 'tea_failed':
          officeHudView.showToast(STRINGS.tea.failed[message.reason] ?? '');
          break;
        case 'tea_replied':
          teaCard.replied(message.id, message.accept, message.ok, message.reason);
          if (message.ok && message.accept) {
            scene.playerSay(STRINGS.tea.sip, 'coffee');
            if (message.xp) officeHudView.showXpGain(message.xp, false);
          }
          break;
        case 'tea_served': {
          scene.remotes.say(message.sid, STRINGS.tea.sip, 'coffee');
          if (message.id === myTeaRound) {
            const guest = scene.remotes.list().find((p) => p.sid === message.sid);
            officeHudView.showToast(STRINGS.tea.served(guest?.name ?? ''));
          }
          break;
        }
        case 'tea_end':
          teaCard.end(message.id);
          if (message.id === myTeaRound) {
            myTeaRound = null;
            officeHudView.showToast(STRINGS.tea.ended(message.cups));
          }
          break;
        case 'correct':
          scene.correctPosition(message.x, message.z);
          break;
        case 'idle_check': {
          idleModal?.close();
          const modal = officeActivities.openPanel(STRINGS.net.idleTitle);
          const stay = el('button', {
            className: 'button button-primary',
            text: STRINGS.net.idleStay,
            attrs: { type: 'button' },
          });
          stay.addEventListener('click', () => {
            room.send({ type: 'active' });
            modal.close();
          });
          modal.body.append(
            el('p', { className: 'activity-intro', text: STRINGS.net.idleBody }),
            el('div', { className: 'activity-actions', children: [stay] }),
          );
          idleModal = modal;
          break;
        }
        case 'progress':
        case 'mission_assigned':
          progress.receive(message);
          break;
        case 'room_event':
          eventState = message.event;
          banner.show(message.event, serverOffset);
          if (message.event.kind === 'surprise_meeting' && seatedKind() === 'meeting') {
            banner.dismiss(message.event.id, STRINGS.events.joinedMeeting);
          }
          audio.play('alert');
          break;
        case 'room_event_progress':
          banner.progress(message.id, message.progress);
          break;
        case 'room_event_end': {
          const texts = STRINGS.events[message.kind];
          if (eventState?.id === message.id) eventState = null;
          const result = message.success ? texts.win : texts.lose;
          // Banner đã tắt (ví dụ đã ngồi họp): báo kết quả bằng một thông báo nhỏ.
          const shown = banner.end(message.id, result);
          if (message.rewarded) {
            audio.play('ting');
            officeHudView.showToast(STRINGS.events.rewarded(shown ? '' : result));
          } else if (!shown) {
            officeHudView.showToast(result);
          }
          break;
        }
        case 'switch_failed':
          officeHudView.showToast(
            message.reason === 'full' ? STRINGS.building.full : STRINGS.building.failed,
          );
          break;
        case 'room_plants':
          scene.plants.set(message.plants);
          break;
        case 'plant_added':
          scene.plants.add(message.plant);
          break;
        case 'plant_removed':
          scene.plants.remove(message.ids);
          break;
        default:
          break;
      }
    };
    const room = new RoomClient({
      token: api.getToken() ?? '',
      onMessage: onRoomMessage,
      onStatus: (status, info) => {
        if (status === 'online') updateOnline();
        else if (status === 'connecting')
          officeHudView.setNetStatus(STRINGS.net.connecting, 'warn');
        else if (status === 'offline') {
          scene.remotes.clear();
          officeHudView.setNetStatus(
            STRINGS.net.offline(Math.ceil((info?.retryInMs ?? 0) / 1000)),
            'warn',
          );
        } else {
          scene.remotes.clear();
          idleModal?.close();
          const modal = officeActivities.openPanel(STRINGS.net.rejoin);
          const again = el('button', {
            className: 'button button-primary',
            text: STRINGS.net.rejoin,
            attrs: { type: 'button' },
          });
          again.addEventListener('click', () => {
            modal.close();
            room.reconnect();
          });
          modal.body.append(
            el('p', {
              className: 'activity-intro',
              text: STRINGS.net.kicked[info?.kick ?? 'idle'] ?? '',
            }),
            el('div', { className: 'activity-actions', children: [again] }),
          );
          officeHudView.setNetStatus(STRINGS.net.kicked[info?.kick ?? 'idle'] ?? '', 'warn');
        }
      },
    });
    progress.setSender(room);
    room.start();
    // Gửi vị trí ~10 lần/giây (RoomClient tự bỏ khi không đổi).
    const stateTimer = window.setInterval(() => {
      const st = scene.getPlayerState();
      room.sendState(st.x, st.z, st.facing, st.pose);
    }, 100);

    // Trang bị (cửa hàng): đọc lúc vào văn phòng, đổi thì dựng lại nhân vật và báo cả phòng.
    let equipped: string[] = [];
    const applyInventory = (inventory: InventoryResponse): void => {
      if (JSON.stringify(inventory.equipped) !== JSON.stringify(equipped)) {
        equipped = inventory.equipped;
        scene.setGear(profile.appearance, equipped);
        room.send({ type: 'profile_changed' });
      }
    };
    void api.request<InventoryResponse>('GET', '/api/shop/inventory').then((result) => {
      if (result.ok) applyInventory(result.value);
    });
    const shopCall = async (
      path: string,
      body: unknown,
    ): Promise<{ ok: true; inventory: InventoryResponse } | { ok: false; error: string }> => {
      const result = await api.request<InventoryResponse>('POST', path, body);
      return result.ok
        ? { ok: true, inventory: result.value }
        : { ok: false, error: result.reason ?? result.error };
    };
    const openShop = (): void => {
      track(store, 'shop_open');
      let panel: { dispose(): void } | null = null;
      const modal = officeActivities.openPanel(STRINGS.shop.title, () => panel?.dispose());
      modal.body.closest('.modal')?.classList.add('modal-wide');
      void lazy.shop().then(({ mountShopPanel }) => {
        panel = mountShopPanel(modal.body, {
          appearance: profile.appearance,
          xp: progress.state.xp,
          load: async () => {
            const result = await api.request<InventoryResponse>('GET', '/api/shop/inventory');
            return result.ok ? result.value : null;
          },
          buy: (itemId) => shopCall('/api/shop/buy', { itemId }),
          equip: (itemId, equip) => shopCall('/api/shop/equip', { itemId, equip }),
          onInventory: applyInventory,
        });
      });
    };

    // ---------- Công ty (Phase 6): phòng riêng có biển hiệu ----------
    let roomKind = 'office';
    // Áo đồng phục của mình (mặc ở mọi phòng nếu công ty đã mua và mình chọn mặc).
    const refreshUniform = (): void => {
      void api.request<MyCompanyResponse>('GET', '/api/company/me').then((r) => {
        if (!r.ok) return;
        const d = r.value.detail;
        scene.setUniform(d?.wearingUniform ? d.company.uniform : null);
      });
    };
    const updateSign = (): void => {
      refreshUniform();
      if (!roomKind.startsWith('company:')) {
        scene.setCompanySign(null);
        scene.setCompanyPerks([]);
        // Văn phòng Công Sở: 3 đồng nghiệp mặc định.
        scene.setNpcs(createNpcRoster());
        return;
      }
      const id = roomKind.slice('company:'.length);
      void api
        .request<CompanyPublic>('GET', `/api/company/info/${encodeURIComponent(id)}`)
        .then((r) => {
          if (!r.ok || roomKind !== `company:${id}`) return;
          const c = r.value;
          scene.setCompanyPerks(c.perks);
          // Phòng công ty: đúng số nhân viên NPC đang đi làm (chưa thuê ai thì không có NPC).
          scene.setNpcs(createStaffRoster(c.staff));
          scene.setCompanySign({
            name: c.name,
            color: COMPANY_COLORS[c.color] ?? 0xff8a65,
            glyph: STRINGS.company.iconGlyph[c.icon] ?? '★',
            subtitle: `${STRINGS.company.industries[c.industry] ?? ''} · ${STRINGS.company.stages[c.stage] ?? ''}`,
          });
        });
    };
    const openCompany = (): void => {
      const modal = officeActivities.openPanel(STRINGS.company.title);
      mountCompany(modal, {
        enterRoom: (companyId) => {
          room.send({ type: 'switch_room', roomId: `company:${companyId}` });
          modal.close();
        },
        currentCompanyRoom: () => (roomKind.startsWith('company:') ? roomKind : null),
        onChanged: () => {
          updateSign();
        },
        onLeft: () => {
          // Nghỉ việc: ra hẳn khỏi văn phòng về màn "Ở nhà".
          modal.close();
          showLobby(profile, STRINGS.lobby.leftCompany);
        },
      });
    };
    openCompanyNow = openCompany;
    openHubNow = () => {
      openHub();
    };
    roomKindNow = () => roomKind;
    /** Thẻ CEO: chỉ trong phòng công ty mình làm chủ. */
    // Thẻ vào phòng sếp: chủ công ty (trong phòng công ty của mình) hoặc đang có việc
    // "Họp với sếp" (server cũng kiểm tra như vậy).
    // Nhớ kết quả "có phải chủ phòng này" theo phòng: gọi lại mỗi lần tiến độ đổi (mỗi phút
    // ngồi máy) mà tắt thẻ rồi chờ API bật lại thì chủ đang ngồi ghế CEO bị đẩy ra cửa.
    let ownerCache: { kind: string; owner: boolean } | null = null;
    const updateCeoAccess = (): void => {
      const kind = roomKind;
      const cachedOwner = ownerCache?.kind === kind && ownerCache.owner;
      const meeting = hasCeoMeeting(progress.state);
      scene.setCeoOwner(cachedOwner);
      scene.setCeoAccess(meeting || cachedOwner);
      if (meeting || ownerCache?.kind === kind || !kind.startsWith('company:')) return;
      void api.request<MyCompanyResponse>('GET', '/api/company/me').then((r) => {
        if (!r.ok || roomKind !== kind) return;
        const detail = r.value.detail;
        const owner = detail !== null && detail.isOwner && `company:${detail.company.id}` === kind;
        ownerCache = { kind, owner };
        scene.setCeoOwner(owner);
        scene.setCeoAccess(owner || hasCeoMeeting(progress.state));
      });
    };
    const openCompanyMap = (): void => {
      const modal = officeActivities.openPanel(STRINGS.companyMap.title);
      mountCompanyMap(modal);
    };

    // ---------- Sự kiện phòng (Phase 5B) ----------
    let serverOffset = 0;
    let eventState: RoomEventView | null = null;
    const coffeeSpot = scene.getInteractables().find((item) => item.kind === 'coffee');
    const respondEvent = (): void => {
      const ev = eventState;
      if (!ev) return;
      // Bấm nút trên banner là tự chạy tới chỗ làm nhiệm vụ rồi làm luôn.
      if (ev.kind === 'coffee_out' && coffeeSpot) {
        const p = scene.getPlayerPosition();
        if (Math.hypot(p.x - coffeeSpot.approach.x, p.z - coffeeSpot.approach.z) > 2.4) {
          const started = scene.goToItem(coffeeSpot.id, () => {
            if (eventState?.id === ev.id) room.send({ type: 'event_respond', id: ev.id });
          });
          if (!started) officeHudView.showToast(STRINGS.events.needCoffee);
          return;
        }
      }
      if (ev.kind === 'surprise_meeting') {
        // Ngồi vào ghế họp trống gần nhất (ngồi xuống là banner tự tắt).
        const seat = scene.nearestFreeSeat('meeting');
        if (seat) scene.requestInteractionById(seat);
        else officeHudView.showToast(STRINGS.events.noMeetingSeat);
        return;
      }
      room.send({ type: 'event_respond', id: ev.id });
      if (ev.kind === 'wifi_down') audio.play('keyboard');
    };
    const banner = mountRoomEventBanner(hudRoot, () => {
      respondEvent();
    });
    // Rủ uống trà sữa: thẻ lời mời và lượt mình đang rủ (để báo tổng số cốc đã khao).
    let myTeaRound: number | null = null;
    const teaCard = mountTeaInvite(hudRoot, (id, accept) => {
      room.send({ type: 'tea_reply', id, accept });
    });
    /** Loại chỗ đang ngồi (bàn, ghế họp...) hoặc null nếu đang đứng. */
    const seatedKind = (): string | null => {
      const id = scene.getSeatedId();
      return id === null ? null : (scene.getInteractables().find((i) => i.id === id)?.kind ?? null);
    };

    // ---------- Xếp hạng, tường chung, bản đồ toà nhà, thẻ khoe (Phase 5B) ----------
    const openWall = (): void => {
      track(store, 'wall_open');
      const modal = officeActivities.openPanel(STRINGS.wall.title);
      void lazy.wall().then(({ mountWallPanel }) => {
        mountWallPanel(modal.body, {
          list: async () => {
            const r = await api.request<{ posts: WallPost[] }>('GET', '/api/wall');
            return r.ok ? r.value.posts : null;
          },
          post: async (text) => {
            const r = await api.request<{ posts: WallPost[] }>('POST', '/api/wall', { text });
            return r.ok
              ? { ok: true, posts: r.value.posts }
              : { ok: false, reason: r.reason ?? r.error };
          },
          report: async (id) => {
            const r = await api.request<{ posts: WallPost[] }>(
              'POST',
              `/api/wall/${String(id)}/report`,
            );
            return r.ok ? r.value.posts : null;
          },
        });
      });
    };
    const openLeaderboard = (): void => {
      track(store, 'leaderboard_open');
      const modal = officeActivities.openPanel(STRINGS.board.title);
      void lazy.leaderboard().then(({ mountLeaderboardPanel }) => {
        mountLeaderboardPanel(modal.body, {
          load: async (period, department) => {
            const r = await api.request<LeaderboardResponse>(
              'GET',
              `/api/leaderboard?period=${period}&department=${department}`,
            );
            return r.ok ? r.value : null;
          },
          setHidden: async (hidden) =>
            (await api.request('PUT', '/api/me/privacy', { hideFromLeaderboard: hidden })).ok,
        });
      });
    };
    const openBrag = (): void => {
      track(store, 'brag_open');
      const modal = officeActivities.openPanel(STRINGS.brag.title);
      const img = el('img', { className: 'brag-preview', attrs: { alt: STRINGS.brag.title } });
      const share = el('button', {
        className: 'button button-primary',
        text: STRINGS.brag.share,
        attrs: { type: 'button' },
      });
      const download = el('button', {
        className: 'button button-soft',
        text: STRINGS.brag.download,
        attrs: { type: 'button' },
      });
      modal.body.append(
        img,
        el('div', { className: 'activity-actions', children: [download, share] }),
      );
      const state = progress.state;
      void lazy.brag().then(({ drawBragCard, shareOrDownload }) =>
        drawBragCard({
          appearance: profile.appearance,
          equipped,
          level: progress.level,
          title: myJob(state),
          streak: state.checkIn.streak,
          stats: state.daily.day === progress.today ? state.daily.stats : undefined,
          day: progress.today ?? '',
        }).then((canvas) => {
          img.src = canvas.toDataURL('image/png');
          const name = `di-lam-online-${progress.today ?? 'hom-nay'}.png`;
          share.addEventListener('click', () => {
            void shareOrDownload(canvas, name);
          });
          download.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = img.src;
            a.download = name;
            a.click();
          });
          Object.assign(window, { __lastBrag: canvas });
        }),
      );
    };
    const openHub = (): void => {
      const modal = officeActivities.openPanel(STRINGS.hub.title);
      const h = STRINGS.hub;
      const entries: [string, () => void][] = [
        [h.leaderboard, openLeaderboard],
        [h.wall, openWall],
        [h.brag, openBrag],
        [h.company, openCompany],
        [h.companyMap, openCompanyMap],
      ];
      modal.body.append(
        el('div', {
          className: 'choice-cards',
          children: entries.map(([label, open]) => {
            const b = el('button', {
              className: 'choice-card',
              attrs: { type: 'button' },
              children: [el('strong', { text: label })],
            });
            b.addEventListener('click', () => {
              modal.close();
              // Đóng mục con (×, bấm ra ngoài, Esc) thì quay về bảng Văn phòng.
              officeActivities.openFrom(openHub);
              open();
            });
            return b;
          }),
        }),
      );
    };

    // ---------- Lịch theo ngày: nhạc, ánh sáng, lời thoại ----------
    let moodDay: string | null = null;
    let moodTimer: number | undefined;
    const applyMood = (): void => {
      const today = progress.today;
      if (!today || today === moodDay) return;
      moodDay = today;
      const mood = dayMood(today);
      scene.setMood(mood);
      audio.setMood(mood);
      const greeting = STRINGS.moods.greeting[mood];
      if (greeting) officeHudView.showToast(greeting);
      const lines = STRINGS.moods.npcLines[mood] ?? [];
      window.clearInterval(moodTimer);
      if (lines.length > 0) {
        moodTimer = window.setInterval(() => {
          const npcs = scene.getNpcStatuses();
          const npc = npcs[Math.floor(Math.random() * npcs.length)];
          const line = lines[Math.floor(Math.random() * lines.length)];
          if (npc && line) scene.npcSay(npc.id, line, 5);
        }, 75_000);
      }
    };
    const offMood = progress.onChange(() => {
      applyMood();
    });

    const openSocial = (): void => {
      const modal = officeActivities.openPanel(STRINGS.social.open);
      mountSocialPanel(modal.body, {
        players: () => scene.remotes.list(),
        onTeaInvite: () => {
          room.send({ type: 'tea_invite' });
          modal.close();
        },
        onEmote: (emote) => {
          room.send({ type: 'emote', emote });
          scene.playerSay(STRINGS.social.emoteNames[emote] ?? '', emote);
          modal.close();
        },
        onQuickChat: (index) => {
          room.send({ type: 'quick_chat', index });
          scene.playerSay(QUICK_CHATS[index] ?? '');
          modal.close();
        },
        onToggleHidden: (code, hide) => {
          if (hide) hidden.add(code);
          else hidden.delete(code);
          saveHidden(store, hidden);
          scene.remotes.setHidden(hidden);
        },
      });
    };

    const openProfile = (tab: ProfileTab = 'card'): void => {
      let panel: { dispose(): void } | null = null;
      const modal = officeActivities.openPanel(STRINGS.progress.profileTitle, () =>
        panel?.dispose(),
      );
      panel = mountProfilePanel(modal.body, {
        name: profile.name,
        playerId,
        progress,
        workplace: () => workplace,
        companyName: () => myCompanyName,
        initialTab: tab,
        account: {
          recover: async (code) => {
            const result = await recoverAccount(api, stores, code);
            if (result.ok) window.location.reload();
            return result.ok;
          },
          newRecoveryCode: async () => {
            const result = await api.request<{ recoveryCode: string }>('POST', '/api/me/recovery');
            return result.ok ? result.value.recoveryCode : null;
          },
          analyticsEnabled: () => analyticsEnabled(store, navigator.doNotTrack),
          setAnalytics: (enabled) => {
            setAnalyticsEnabled(store, enabled);
          },
          deleteAccount: async () => {
            const result = await api.deleteAccount();
            if (!result.ok) return false;
            await logout(api, stores).catch(() => undefined);
            room.stop();
            return true;
          },
        },
      });
    };
    // Lỡ đóng màn chọn phòng ban / nhánh: lần vào văn phòng sau hỏi lại.
    if (progress.needsDepartment() || progress.needsBranch()) askChoices(promotionDeps);

    // Công cụ dev: khi chạy dev, hoặc tài khoản được server cho phép (DEV_USERS).
    // Người khác không tải module này; server cũng chặn API dev với họ.
    let devPanel: { dispose(): void } | null = null;
    if (import.meta.env.DEV || session.me.devTools) {
      void lazy.dev().then(({ mountDevPanel }) => {
        devPanel = mountDevPanel(hudRoot, {
          call: async (path, body) => (await api.request('POST', path, body)).ok,
          today: () => progress.today,
          remove: async (kind, name) => {
            const r = await api.request(
              'POST',
              kind === 'company' ? '/api/dev/delete-company' : '/api/dev/delete-user',
              { name },
            );
            if (r.ok) return null;
            const d = STRINGS.progress.dev;
            return r.status === 404 ? d.removeNotFound : r.status === 400 ? d.removeSelf : d.failed;
          },
          grantUsers: async (usernames, grant) => {
            const r = await api.request<{ granted: string[]; missing: string[] }>(
              'POST',
              '/api/dev/grant-users',
              { usernames, ...grant },
            );
            return r.ok ? r.value : null;
          },
          toast: (text) => {
            officeHudView.showToast(text);
          },
        });
      });
    }

    // Tài khoản mới: hiện mã khôi phục MỘT lần.
    if (session.recoveryCode) {
      const code = session.recoveryCode;
      session.recoveryCode = null;
      showRecoveryCode(code);
    }

    // Cảnh ngoài cửa kính đổi theo giờ thật: kiểm tra mỗi phút.
    const periodTimer = window.setInterval(() => {
      scene.setPeriod(currentPeriod());
    }, 60_000);

    const officeCards: CoachCard[] = STRINGS.coach.office.map((card) => ({
      icon: card.icon,
      title: card.title,
      body: coarsePointer ? card.touch : card.body,
      target: coarsePointer ? card.touchTarget : card.target,
    }));
    const coach = loadCoachDone(store, 'office')
      ? null
      : showCoachMarks(hudRoot, {
          cards: officeCards,
          onDone: () => {
            saveCoachDone(store, 'office');
          },
        });

    // "Sửa thẻ" ngay trong văn phòng: tạm đổi sang cảnh xem nhân vật (văn phòng vẫn chạy ngầm,
    // giữ kết nối và vị trí). X hoặc Lưu đều quay lại đúng chỗ đang đứng.
    let editor: { close(): void } | null = null;
    const editCard = (): void => {
      if (editor) return;
      const preview = new CreatorScene(canvas, profile.appearance);
      engine.swapController(preview);
      scene.setInputLocked(true);
      hudRoot.classList.add('is-editing');
      const panel = mountCreatorPanel(hudRoot, {
        profile,
        notice: null,
        onAppearanceChange: (appearance) => {
          preview.setAppearance(appearance);
        },
        onPoseChange: (pose) => {
          preview.setPose(pose);
        },
        onSave: (finished) => {
          void saveCharacter(finished).then((result) => {
            if (!result.ok) {
              officeHudView.showToast(result.notice);
              return;
            }
            profile = result.profile;
            scene.setGear(profile.appearance, equipped);
            officeHudView.setName(profile.name);
            room.send({ type: 'profile_changed' });
            close();
          });
        },
        onClose: () => {
          close();
        },
      });
      const updateInset = (): void => {
        preview.setViewInset(panel.getInset());
      };
      const observer = new ResizeObserver(updateInset);
      observer.observe(panel.element);
      updateInset();
      function close(): void {
        if (editor === null) return;
        editor = null;
        observer.disconnect();
        panel.dispose();
        hudRoot.classList.remove('is-editing');
        engine.swapController(scene);
        preview.dispose();
        scene.setInputLocked(false);
      }
      editor = { close };
    };

    const officeHudRef = hud;
    teardown = () => {
      window.clearInterval(periodTimer);
      window.clearInterval(stateTimer);
      window.clearInterval(moodTimer);
      offMood();
      banner.dispose();
      teaCard.dispose();
      room.stop();
      progress.setSender(null);
      scene.remotes.clear();
      toastReject = () => undefined;
      offProgress();
      devPanel?.dispose();
      editor?.close();
      officeActivities.dispose();
      activities = null;
      coach?.dispose();
      officeHud = null;
      office = null;
      officeHudRef.dispose();
      viewPanel.dispose();
      engine.setController(null);
    };
  };

  // Mở game là vào màn "Ở nhà". Người mới được tạo sẵn nhân vật ngẫu nhiên (sửa ngay ở Ở nhà);
  // máy có nhân vật cũ (Phase 1-3) thì đưa lên server.
  if (session.me.character) {
    saveProfile(store, session.me.character);
    // Vừa đăng nhập tài khoản khác: vào thẳng văn phòng nơi tài khoản đó đang làm.
    if (takeAfterLogin()) goToWork(session.me.character);
    else showLobby(session.me.character, startNotice);
  } else {
    const local = loadProfile(store);
    const fresh: Profile = local ?? {
      name: randomVietnameseName(),
      appearance: { ...DEFAULT_APPEARANCE },
    };
    void saveCharacter(fresh).then(async (first) => {
      if (first.ok) {
        showLobby(first.profile, startNotice);
        return;
      }
      // Tên cũ không qua bộ lọc: thử tên ngẫu nhiên.
      const retry = await saveCharacter({ ...fresh, name: randomVietnameseName() });
      showLobby(retry.ok ? retry.profile : fresh, retry.ok ? startNotice : retry.notice);
    });
  }

  // ?debug: hiện fps/draw call và mở cổng cho kịch bản kiểm thử tự động (đo PERF.md).
  if (debug) {
    Object.assign(window, {
      __dilam: {
        stats: () => engine.getStats(),
        setQuality: (mode: Parameters<Engine['setQualityMode']>[0]) => {
          engine.setQualityMode(mode);
        },
        playerPosition: () => office?.getPlayerPosition() ?? null,
        orbit: () => office?.getOrbit() ?? null,
        cameraPosition: () => (office ? office.camera.position.toArray() : null),
        roomBox: () =>
          office ? { ...OFFICE_FLOOR.bounds, ceiling: OFFICE_FLOOR.wallHeight } : null,
        project: (x: number, z: number) => office?.projectFloorPoint(x, z) ?? null,
        projectPoint: (x: number, y: number, z: number) => office?.projectPoint(x, y, z) ?? null,
        memory: () => ({ ...engine.renderer.info.memory }),
        interactables: () =>
          office?.getInteractables().map((item) => ({
            id: item.id,
            kind: item.kind,
            approach: item.approach,
            pick: item.pick,
          })) ?? [],
        interact: (id: string) => office?.requestInteractionById(id) ?? false,
        lastInteraction: () => lastInteraction,
        seated: () => office?.getSeatedId() ?? null,
        npcs: () => office?.getNpcStatuses() ?? [],
        audio: () => audio.stats(),
        events: () => bus.history(),
        progress: () => progress.state,
        today: () => progress.today,
        remotes: () => office?.remotes.list() ?? [],
        playerId: () => playerId,
        setPeriod: (period: DayPeriod) => {
          office?.setPeriod(period);
        },
      },
    });
  }

  import.meta.hot?.dispose(() => {
    teardown?.();
    engine.dispose();
    audio.dispose();
  });
}

start();
