// Nối các hoạt động với văn phòng: vật nào mở hoạt động nào, phát sự kiện qua bus.
// Mỗi hoạt động vẫn là một module riêng (logic thuần + giao diện) trong thư mục của nó.
import type { SoundName } from '../audio/audioEngine';
import type { KeyValueStore } from '../storage';
import { STRINGS } from '../strings';
import { openModal, type Modal } from '../ui/modal';
import type { Interactable } from '../world/office/layout';
import { checkIn, loadCheckIn, saveCheckIn } from './checkIn/checkIn';
import { mountCheckInPanel } from './checkIn/checkInPanel';
import {
  BREW_MS,
  handOver,
  IDLE_COFFEE,
  startBrew,
  tickBrew,
  type CoffeeState,
} from './coffee/coffee';
import { dayKey } from './dayKey';
import { makeEvent, type ActivityBus } from './events';
import {
  mountFocusChooser,
  mountFocusSummary,
  openFocusWindow,
} from './focusTyping/focusTypingPanel';
import { fortuneFor, lastFortuneDay, saveFortuneDay } from './fortune/fortune';
import { mountFortunePanel } from './fortune/fortunePanel';
import { mountTaskFlipPanel } from './taskFlip/taskFlipPanel';
import { addVent, loadVents, saveVents } from './ventWall/ventWall';
import { mountVentWallPanel } from './ventWall/ventWallPanel';

/** Những gì hoạt động cần từ cảnh 3D. */
export interface ActivityScene {
  setInputLocked(locked: boolean): void;
  setManualTyping(manual: boolean): void;
  npcSay(npcId: string, text: string, seconds?: number): void;
}

/** Những gì hoạt động cần từ HUD. */
export interface ActivityHud {
  showToast(text: string): void;
  setFocusAvailable(available: boolean): void;
  setCoffee(phase: CoffeeState['phase']): void;
}

export interface OfficeActivitiesOptions {
  root: HTMLElement;
  store: KeyValueStore | null;
  bus: ActivityBus;
  playerId: string;
  playerName: string;
  floorName: string;
  scene: ActivityScene;
  hud: ActivityHud;
  play(sound: SoundName): void;
}

export class OfficeActivities {
  private coffee: CoffeeState = IDLE_COFFEE;
  private coffeeTimer: number | undefined;
  private modal: Modal | null = null;
  private focus: { stop(): void } | null = null;
  private seatedAtDesk = false;

  constructor(private readonly o: OfficeActivitiesOptions) {}

  /** Có đang cầm ly cà phê (để cảnh hiện gợi ý tặng NPC). */
  canGiftCoffee(): boolean {
    return this.coffee.phase === 'holding';
  }

  /** Trả về true nếu vật này mở một hoạt động (khi đó không hiện lời nhắn mặc định). */
  handleInteract(item: Interactable): boolean {
    switch (item.kind) {
      case 'gate':
        this.openCheckIn();
        return true;
      case 'fortune':
        this.openFortune();
        return true;
      case 'taskboard':
        this.openTaskFlip();
        return true;
      case 'ventwall':
        this.openVentWall();
        return true;
      case 'coffee':
        this.brewCoffee();
        return true;
      default:
        return false;
    }
  }

  onSeatChange(item: Interactable | null): void {
    this.seatedAtDesk = item?.kind === 'desk';
    this.o.hud.setFocusAvailable(this.seatedAtDesk && !this.focus);
    if (!this.seatedAtDesk) this.focus?.stop();
  }

  giftCoffee(npcId: string, name: string): void {
    const result = handOver(this.coffee);
    if (!result.ok) return;
    this.coffee = result.state;
    this.o.hud.setCoffee(this.coffee.phase);
    this.o.scene.npcSay(npcId, STRINGS.coffee.thanks, 4);
    this.o.play('ting');
    this.o.hud.showToast(STRINGS.coffee.gifted(name));
    this.o.bus.emit(makeEvent('coffee-gift', Date.now(), 0, { npcId }));
  }

  drinkCoffee(): void {
    const result = handOver(this.coffee);
    if (!result.ok) return;
    this.coffee = result.state;
    this.o.hud.setCoffee(this.coffee.phase);
    this.o.hud.showToast(STRINGS.coffee.drank);
    this.o.bus.emit(makeEvent('coffee-drink', Date.now(), 0, {}));
  }

  /** Nút "Gõ phím tập trung" (chỉ khi đang ngồi ở bàn làm việc). */
  startFocus(): void {
    if (!this.seatedAtDesk) {
      this.o.hud.showToast(STRINGS.focus.needDesk);
      return;
    }
    if (this.focus) return;
    const modal = this.open(STRINGS.focus.chooseTitle);
    mountFocusChooser(modal.body, (minutes) => {
      modal.close();
      this.o.scene.setInputLocked(true);
      this.o.scene.setManualTyping(true);
      this.o.hud.setFocusAvailable(false);
      this.focus = openFocusWindow(this.o.root, {
        minutes,
        onPress: () => {
          this.o.play('keyboard');
        },
        onFinish: (summary, startedAt) => {
          this.focus = null;
          this.o.scene.setInputLocked(false);
          this.o.scene.setManualTyping(false);
          this.o.hud.setFocusAvailable(this.seatedAtDesk);
          this.o.bus.emit(
            makeEvent('focus-typing', startedAt, summary.actualMs, {
              plannedMs: summary.plannedMs,
              presses: summary.presses,
              scoredKeys: summary.scoredKeys,
              lines: summary.lines,
              completed: summary.completed,
            }),
          );
          this.o.play('ting');
          mountFocusSummary(this.open(STRINGS.focus.summaryTitle).body, summary);
        },
      });
    });
  }

  dispose(): void {
    window.clearTimeout(this.coffeeTimer);
    this.focus?.stop();
    this.modal?.close();
  }

  // ---------- Từng hoạt động ----------

  private open(title: string, onClose?: () => void): Modal {
    this.modal?.close();
    this.o.scene.setInputLocked(true);
    const modal = openModal(this.o.root, {
      title,
      onClose: () => {
        if (this.modal === modal) this.modal = null;
        if (!this.modal && !this.focus) this.o.scene.setInputLocked(false);
        onClose?.();
      },
    });
    this.modal = modal;
    return modal;
  }

  private openCheckIn(): void {
    const openedAt = Date.now();
    const modal = this.open(STRINGS.checkIn.title);
    mountCheckInPanel(modal.body, {
      name: this.o.playerName,
      playerId: this.o.playerId,
      floorName: this.o.floorName,
      state: loadCheckIn(this.o.store),
      now: () => new Date(),
      onSwipe: () => {
        const result = checkIn(loadCheckIn(this.o.store), new Date());
        if (result.status === 'checked') {
          saveCheckIn(this.o.store, result.state);
          this.o.play('ting');
          this.o.bus.emit(
            makeEvent('checkin', openedAt, Date.now() - openedAt, {
              day: result.day,
              streak: result.state.streak,
              total: result.state.total,
            }),
          );
        }
        return result;
      },
    });
  }

  private openFortune(): void {
    const openedAt = Date.now();
    const day = dayKey(new Date());
    const already = lastFortuneDay(this.o.store) === day;
    const { id, fortune } = fortuneFor(day, this.o.playerId);
    const modal = this.open(STRINGS.fortune.title);
    mountFortunePanel(modal.body, {
      fortune,
      alreadyDrawn: already,
      onDraw: () => {
        saveFortuneDay(this.o.store, day);
        if (!already) this.o.play('ting');
        this.o.bus.emit(
          makeEvent('kpi-fortune', openedAt, Date.now() - openedAt, {
            day,
            fortuneId: id,
            repeat: already,
          }),
        );
      },
    });
  }

  private openTaskFlip(): void {
    let panel: { dispose(): void } | null = null;
    const modal = this.open(STRINGS.taskFlip.title, () => panel?.dispose());
    panel = mountTaskFlipPanel(modal.body, {
      onResult: ({ taskId, completed, flippedAt, endedAt }) => {
        this.o.bus.emit(
          makeEvent('task-flip', flippedAt, endedAt - flippedAt, { taskId, completed }),
        );
      },
      onCompleted: () => {
        this.o.play('ting');
        this.o.hud.showToast(STRINGS.taskFlip.doneToast);
      },
    });
  }

  private openVentWall(): void {
    const modal = this.open(STRINGS.vent.title);
    mountVentWallPanel(modal.body, {
      entries: loadVents(this.o.store),
      onPost: (text, anonymous) => {
        const now = Date.now();
        const entries = addVent(loadVents(this.o.store), {
          id: `${String(now)}-${Math.random().toString(36).slice(2, 7)}`,
          text,
          author: anonymous ? null : this.o.playerName,
          at: now,
        });
        saveVents(this.o.store, entries);
        // Sự kiện không chứa nội dung than thở, chỉ độ dài và lựa chọn ẩn danh.
        this.o.bus.emit(makeEvent('vent', now, 0, { length: Array.from(text).length, anonymous }));
        return entries;
      },
    });
  }

  private brewCoffee(): void {
    if (this.coffee.phase === 'holding') {
      this.o.hud.showToast(STRINGS.coffee.busy);
      return;
    }
    if (this.coffee.phase === 'brewing') return;
    const now = Date.now();
    this.coffee = startBrew(this.coffee, now, BREW_MS);
    this.o.hud.setCoffee('brewing');
    this.o.hud.showToast(STRINGS.coffee.brewing);
    this.o.play('coffee');
    this.coffeeTimer = window.setTimeout(() => {
      const result = tickBrew(this.coffee, Date.now());
      this.coffee = result.state;
      if (!result.ready) return;
      this.o.hud.setCoffee('holding');
      this.o.hud.showToast(STRINGS.coffee.ready);
      this.o.bus.emit(makeEvent('coffee-brew', now, Date.now() - now, { brewMs: BREW_MS }));
    }, BREW_MS);
  }
}
