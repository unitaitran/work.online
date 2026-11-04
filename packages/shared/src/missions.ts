// Việc sếp giao: ngẫu nhiên (có hạt giống theo ngày + mã người chơi để server tái tạo được),
// tiến độ tính từ các sự kiện hoạt động. Lời thoại tự viết cho dự án.
import type { ActivityEvent } from './activityEvents';
import { hashString, seededRng } from './rng';

export type MissionGoal =
  | { kind: 'focusMinutes'; amount: number }
  | { kind: 'lines'; amount: number }
  | { kind: 'meetingMinutes'; amount: number }
  /** Ngồi họp ở sofa phòng sếp (phút). Có việc này mới được vào phòng sếp. */
  | { kind: 'ceoMeeting'; amount: number }
  | {
      kind: 'count';
      event: 'coffee-gift' | 'chore' | 'print' | 'task-flip' | 'kpi-fortune' | 'checkin';
      amount: number;
    };

export interface MissionTemplate {
  id: string;
  /** Lời sếp nhắn. */
  text: string;
  /** Mô tả ngắn mục tiêu (hiện ở thẻ nhiệm vụ). */
  goalText: string;
  goal: MissionGoal;
}

export interface Mission {
  templateId: string;
  text: string;
  goalText: string;
  goal: MissionGoal;
  progress: number;
  assignedAt: number;
  completedAt: number | null;
}

/** Việc "Họp với sếp": đang có việc này thì được quẹt thẻ vào phòng sếp. */
export const CEO_MEETING_MISSION = 'ceo-meeting';

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  {
    id: 'focus-1',
    text: 'Sếp nhắn: "Em gõ giúp anh một phiên tập trung nhé, khách đang chờ bản nháp!"',
    goalText: 'Tập trung gõ phím 1 phút',
    goal: { kind: 'focusMinutes', amount: 1 },
  },
  {
    id: 'focus-3',
    text: 'Sếp nhắn: "Báo cáo quý hơi gấp, em ngồi tập trung 3 phút giúp chị nha."',
    goalText: 'Tập trung gõ phím 3 phút',
    goal: { kind: 'focusMinutes', amount: 3 },
  },
  {
    id: 'focus-5',
    text: 'Sếp nhắn: "Hôm nay mình chạy nước rút, em cố một phiên 5 phút nhé!"',
    goalText: 'Tập trung gõ phím 5 phút',
    goal: { kind: 'focusMinutes', amount: 5 },
  },
  {
    id: 'lines-20',
    text: 'Sếp nhắn: "Viết giúp anh mấy cái mail chào hỏi đối tác, lễ phép vào nha."',
    goalText: 'Gõ 20 dòng thư công sở',
    goal: { kind: 'lines', amount: 20 },
  },
  {
    id: 'lines-40',
    text: 'Sếp nhắn: "Hộp thư khách đầy rồi, em trả lời giúp chị một loạt nhé."',
    goalText: 'Gõ 40 dòng thư công sở',
    goal: { kind: 'lines', amount: 40 },
  },
  {
    id: 'coffee-1',
    text: 'Sếp nhắn: "Bạn bên cạnh đang buồn ngủ kìa, em pha ly cà phê tặng bạn đi."',
    goalText: 'Tặng 1 ly cà phê cho đồng nghiệp',
    goal: { kind: 'count', event: 'coffee-gift', amount: 1 },
  },
  {
    id: 'coffee-2',
    text: 'Sếp nhắn: "Cả team chạy deadline, em làm ‘bartender’ hôm nay nha!"',
    goalText: 'Tặng 2 ly cà phê cho đồng nghiệp',
    goal: { kind: 'count', event: 'coffee-gift', amount: 2 },
  },
  {
    id: 'plant-2',
    text: 'Sếp nhắn: "Mấy chậu cây héo hết rồi, em tưới giúp anh vài chậu nhé."',
    goalText: 'Tưới 2 chậu cây',
    goal: { kind: 'count', event: 'chore', amount: 2 },
  },
  {
    id: 'plant-3',
    text: 'Sếp nhắn: "Văn phòng xanh thì ý tưởng mới xanh, em đi tưới cây một vòng nha."',
    goalText: 'Tưới 3 chậu cây',
    goal: { kind: 'count', event: 'chore', amount: 3 },
  },
  {
    id: 'print-1',
    text: 'Sếp nhắn: "Em in giúp chị bản hợp đồng ở máy in nhé, nhớ dỗ nó đừng kẹt giấy."',
    goalText: 'Dùng máy in 1 lần',
    goal: { kind: 'count', event: 'print', amount: 1 },
  },
  {
    id: 'meeting-2',
    text: 'Sếp nhắn: "Em ghé phòng họp ngồi nghĩ ý tưởng cho chiến dịch mới nhé."',
    goalText: 'Ngồi họp 2 phút ở phòng họp',
    goal: { kind: 'meetingMinutes', amount: 2 },
  },
  {
    id: 'meeting-3',
    text: 'Sếp nhắn: "Họp nhanh thôi mà, em vào phòng họp ngồi với anh vài phút."',
    goalText: 'Ngồi họp 3 phút ở phòng họp',
    goal: { kind: 'meetingMinutes', amount: 3 },
  },
  {
    id: CEO_MEETING_MISSION,
    text: 'Sếp nhắn: "Em qua phòng anh họp nhanh nhé, cứ ngồi sofa đợi anh."',
    goalText: 'Vào phòng sếp, ngồi sofa họp 1 phút',
    goal: { kind: 'ceoMeeting', amount: 1 },
  },
  {
    id: 'task-1',
    text: 'Sếp nhắn: "Ra bảng task nhận một việc nhỏ rồi làm cho xong nha em."',
    goalText: 'Hoàn thành 1 task',
    goal: { kind: 'count', event: 'task-flip', amount: 1 },
  },
  {
    id: 'task-2',
    text: 'Sếp nhắn: "Mấy việc lặt vặt trên bảng task, em xử lý giúp chị hai cái nhé."',
    goalText: 'Hoàn thành 2 task',
    goal: { kind: 'count', event: 'task-flip', amount: 2 },
  },
  {
    id: 'task-3',
    text: 'Sếp nhắn: "Hôm nay bảng task nhiều việc quá, em nhận làm giúp anh ba cái nhé."',
    goalText: 'Hoàn thành 3 task',
    goal: { kind: 'count', event: 'task-flip', amount: 3 },
  },
  {
    id: 'fortune',
    text: 'Sếp nhắn: "Xin giúp anh một quẻ KPI xem hôm nay chốt deal được không, đùa thôi!"',
    goalText: 'Xin quẻ KPI hôm nay',
    goal: { kind: 'count', event: 'kpi-fortune', amount: 1 },
  },
  {
    id: 'checkin',
    text: 'Sếp nhắn: "Nhớ quẹt thẻ chấm công nhé em, kế toán lại nhắc rồi đó."',
    goalText: 'Quẹt thẻ chấm công',
    goal: { kind: 'count', event: 'checkin', amount: 1 },
  },
];

/** Bao nhiêu đơn vị tiến độ mà sự kiện này đóng góp cho mục tiêu. */
export function missionContribution(goal: MissionGoal, event: ActivityEvent): number {
  switch (goal.kind) {
    // Việc tính theo phút: server đếm từng phút trọn đang làm (work-tick), đủ phút là xong ngay,
    // không phải đợi kết thúc phiên / đứng dậy.
    case 'focusMinutes':
      return event.type === 'work-tick' && event.detail.kind === 'focus' ? event.detail.minutes : 0;
    case 'lines':
      return event.type === 'focus-typing' ? event.detail.lines : 0;
    case 'meetingMinutes':
      return event.type === 'work-tick' && event.detail.kind === 'meeting'
        ? event.detail.minutes
        : 0;
    case 'ceoMeeting':
      return event.type === 'work-tick' && event.detail.kind === 'meeting' && event.detail.ceo
        ? event.detail.minutes
        : 0;
    case 'count':
      if (event.type !== goal.event) return 0;
      if (event.type === 'task-flip') return event.detail.completed ? 1 : 0;
      if (event.type === 'kpi-fortune') return event.detail.repeat ? 0 : 1;
      return 1;
  }
}

export function goalAmount(goal: MissionGoal): number {
  return goal.amount;
}

export function progressMission(mission: Mission, event: ActivityEvent, now: number): Mission {
  if (mission.completedAt !== null) return mission;
  const progress = Math.min(
    goalAmount(mission.goal),
    mission.progress + missionContribution(mission.goal, event),
  );
  return {
    ...mission,
    progress,
    completedAt: progress >= goalAmount(mission.goal) ? now : null,
  };
}

/**
 * Chọn việc tiếp theo: ngẫu nhiên theo (ngày, mã người chơi, thứ tự trong ngày),
 * bỏ qua việc đã giao hôm nay và việc không còn làm được (`excluded`).
 */
export function pickMission(
  day: string,
  playerId: string,
  index: number,
  excluded: ReadonlySet<string>,
): MissionTemplate | null {
  const pool = MISSION_TEMPLATES.filter((template) => !excluded.has(template.id));
  if (pool.length === 0) return null;
  const rng = seededRng(hashString(`mission|${day}|${playerId}|${String(index)}`));
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

export function startMission(template: MissionTemplate, now: number): Mission {
  return {
    templateId: template.id,
    text: template.text,
    goalText: template.goalText,
    goal: template.goal,
    progress: 0,
    assignedAt: now,
    completedAt: null,
  };
}
