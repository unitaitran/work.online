// Tiến độ người chơi ở client (Phase 3): nghe bus sự kiện, tính XP bằng luật trong @dilam/shared,
// lưu qua ProgressStore. Phase 4 server sẽ chạy đúng các hàm thuần này thay cho client.
import {
  applyEvent,
  chooseBranch,
  chooseDepartment,
  createProgress,
  decodeSaveCode,
  encodeSaveCode,
  levelFor,
  titleFor,
  migrateProgress,
  needsBranch,
  needsDepartment,
  tickBossMissions,
  type ActivityEvent,
  type ApplyResult,
  type Branch,
  type Department,
  type Mission,
  type ProgressState,
  type SaveCodeError,
} from '@dilam/shared';
import type { clock as Clock } from '../clock';
import type { ProgressStore } from './progressStore';

export type ProgressChange =
  | { kind: 'event'; event: ActivityEvent; result: ApplyResult }
  | { kind: 'missionAssigned'; mission: Mission }
  | { kind: 'choice' }
  | { kind: 'import' };

export type ProgressListener = (state: ProgressState, change: ProgressChange) => void;

export class ProgressService {
  private current: ProgressState;
  private readonly listeners = new Set<ProgressListener>();
  /** Kết quả áp sự kiện gần nhất (hoạt động đọc ngay sau khi phát sự kiện). */
  lastResult: ApplyResult | null = null;

  private constructor(
    initial: ProgressState,
    private readonly store: ProgressStore,
    private readonly playerId: string,
    private readonly time: typeof Clock,
  ) {
    this.current = initial;
  }

  static async create(
    store: ProgressStore,
    playerId: string,
    time: typeof Clock,
  ): Promise<ProgressService> {
    const raw = await store.load();
    const migrated = raw === null ? null : migrateProgress(raw, time.now());
    const state = migrated?.ok ? migrated.state : createProgress(time.now());
    const service = new ProgressService(state, store, playerId, time);
    // Ghi lại ngay nếu vừa migrate hoặc vừa tạo mới.
    if (!migrated?.ok || migrated.migratedFrom !== null) service.persist();
    return service;
  }

  get state(): ProgressState {
    return this.current;
  }

  /** XP đã nhận hôm nay (rổ ngày cũ chưa được mở lại thì là 0). */
  todayEarned(): number {
    return this.current.daily.day === this.time.today() ? this.current.daily.earned : 0;
  }

  /** Chức danh hiện tại (tự lên theo cấp). */
  get title(): number {
    return titleFor(this.current.xp);
  }

  get level(): number {
    return levelFor(this.current.xp);
  }

  onChange(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Áp một sự kiện hoạt động (gắn vào bus). */
  handle(event: ActivityEvent): ApplyResult {
    const result = applyEvent(this.current, event, {
      today: this.time.today(),
      now: this.time.now(),
    });
    this.lastResult = result;
    this.commit(result.state, { kind: 'event', event, result });
    return result;
  }

  /** Gọi định kỳ khi đang ở văn phòng: sếp giao việc mới khi tới lúc. */
  tickMissions(): Mission | null {
    const { state, assigned } = tickBossMissions(this.current, {
      today: this.time.today(),
      now: this.time.now(),
      playerId: this.playerId,
    });
    if (state === this.current) return null;
    this.current = state;
    this.persist();
    if (assigned) this.notify({ kind: 'missionAssigned', mission: assigned });
    return assigned;
  }

  needsDepartment(): boolean {
    return needsDepartment(this.current);
  }

  needsBranch(): boolean {
    return needsBranch(this.current);
  }

  /** Chỉ dùng ở công cụ dev: sếp giao việc ngay (bỏ qua thời gian chờ). */
  forceMissionNow(): Mission | null {
    if (this.current.daily.day !== this.time.today()) this.tickMissions();
    this.current = {
      ...this.current,
      daily: { ...this.current.daily, nextMissionAt: this.time.now() },
    };
    return this.tickMissions();
  }

  chooseDepartment(department: Department): void {
    this.commit(chooseDepartment(this.current, department), { kind: 'choice' });
  }

  chooseBranch(branch: Branch): void {
    this.commit(chooseBranch(this.current, branch), { kind: 'choice' });
  }

  exportCode(): string {
    return encodeSaveCode(this.current);
  }

  /** Nhập mã lưu. Mã sai thì báo lỗi và KHÔNG đụng tới tiến độ hiện có. */
  importCode(code: string): { ok: true } | { ok: false; error: SaveCodeError } {
    const decoded = decodeSaveCode(code, this.time.now());
    if (!decoded.ok) return decoded;
    this.commit(decoded.state, { kind: 'import' });
    return { ok: true };
  }

  private commit(state: ProgressState, change: ProgressChange): void {
    this.current = state;
    this.persist();
    this.notify(change);
  }

  private persist(): void {
    void this.store.save(this.current);
  }

  private notify(change: ProgressChange): void {
    for (const listener of this.listeners) listener(this.current, change);
  }
}
