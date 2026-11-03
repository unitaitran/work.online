// Tiến độ người chơi (Phase 4C): server là nguồn sự thật. Client chỉ gửi hành động và hiển thị
// trạng thái server trả về; sửa số liệu ở client (devtools) không đổi được XP thật.
import {
  levelFor,
  needsBranch,
  needsDepartment,
  titleFor,
  type Action,
  type ActionOutcome,
  type Branch,
  type CareerUnlock,
  type CheckInState,
  type Department,
  type Mission,
  type ProgressState,
  type ServerMessage,
} from '@dilam/shared';
import type { ActionReply } from '../net/roomClient';

export type ProgressChange =
  | { kind: 'outcome'; outcome: ActionOutcome }
  | { kind: 'missionAssigned'; mission: Mission }
  | { kind: 'sync' };

export type ProgressListener = (state: ProgressState, change: ProgressChange) => void;

export interface ActionSender {
  action(action: Action): Promise<ActionReply>;
}

export class ServerProgress {
  private current: ProgressState;
  private serverToday: string | null = null;
  private readonly listeners = new Set<ProgressListener>();
  private sender: ActionSender | null = null;

  constructor(initial: ProgressState) {
    this.current = initial;
  }

  setSender(sender: ActionSender | null): void {
    this.sender = sender;
  }

  get state(): ProgressState {
    return this.current;
  }

  get level(): number {
    return levelFor(this.current.xp);
  }

  get title(): number {
    return titleFor(this.current.xp);
  }

  /** Ngày trong game theo server (đổi lúc 4 giờ sáng). */
  get today(): string | null {
    return this.serverToday;
  }

  checkIn(): CheckInState {
    return this.current.checkIn;
  }

  todayEarned(): number {
    return this.current.daily.day === this.serverToday ? this.current.daily.earned : 0;
  }

  /** Mốc chọn phòng ban / nhánh theo lộ trình công ty đang làm (không có: mức chung). */
  private careerUnlock: CareerUnlock | undefined;

  setCareerUnlock(unlock: CareerUnlock | undefined): void {
    this.careerUnlock = unlock;
  }

  needsDepartment(): boolean {
    return needsDepartment(this.current, this.careerUnlock);
  }

  needsBranch(): boolean {
    return needsBranch(this.current, this.careerUnlock);
  }

  chooseDepartment(department: Department): void {
    void this.act({ kind: 'choose_department', department });
  }

  chooseBranch(branch: Branch): void {
    void this.act({ kind: 'choose_branch', branch });
  }

  onChange(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Gửi hành động lên server. Trạng thái chỉ đổi khi server trả lời. */
  async act(action: Action): Promise<ActionReply> {
    if (!this.sender) return { ok: false, reason: 'offline' };
    return this.sender.action(action);
  }

  /** Tin từ server (gọi từ RoomClient). */
  receive(message: ServerMessage): void {
    if (message.type === 'progress') {
      this.current = message.state;
      this.serverToday = message.today;
      this.notify(
        message.outcome ? { kind: 'outcome', outcome: message.outcome } : { kind: 'sync' },
      );
    } else if (message.type === 'mission_assigned') {
      this.notify({ kind: 'missionAssigned', mission: message.mission });
    }
  }

  /** Trạng thái mới từ REST (vd. sau khi nhập mã lưu). */
  replace(state: ProgressState): void {
    this.current = state;
    this.notify({ kind: 'sync' });
  }

  private notify(change: ProgressChange): void {
    for (const listener of this.listeners) listener(this.current, change);
  }
}
