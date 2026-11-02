// Phỏng vấn thăng chức: 20 tình huống công sở hài, tự viết cho dự án.
// Không có câu sai: mỗi lựa chọn chỉ cộng nhẹ vào chỉ số tính cách.
import { BALANCE } from './balance';
import type { Personality } from './progress';
import { seededRng } from './rng';

export interface InterviewOption {
  text: string;
  effect: Partial<Personality>;
}

export interface InterviewQuestion {
  id: number;
  prompt: string;
  options: readonly [InterviewOption, InterviewOption, InterviewOption];
}

type Q = [
  string,
  [string, Partial<Personality>],
  [string, Partial<Personality>],
  [string, Partial<Personality>],
];

const D = { diligence: 2 };
const S = { sociability: 2 };
const C = { creativity: 2 };

const RAW: readonly Q[] = [
  [
    'Máy in kẹt giấy đúng lúc sếp cần bản hợp đồng gấp. Bạn sẽ…',
    ['Gỡ giấy cẩn thận rồi in lại ngay', D],
    ['Nhờ đồng nghiệp rành máy in giúp một tay', S],
    ['Gửi bản PDF đẹp lung linh cho sếp ký điện tử', C],
  ],
  [
    'Cuộc họp đã quá giờ 20 phút mà chưa ai chốt gì. Bạn…',
    ['Tóm tắt nhanh các ý và đề xuất việc tiếp theo', D],
    ['Mời mọi người nghỉ năm phút uống nước cho tỉnh', S],
    ['Vẽ sơ đồ lên bảng cho mọi người dễ hình dung', C],
  ],
  [
    'Đồng nghiệp mới hỏi bạn cách đặt phòng họp lần thứ ba. Bạn…',
    ['Viết hẳn một hướng dẫn ngắn gửi cả nhóm', D],
    ['Dắt bạn ấy đi đặt cùng và rủ đi ăn trưa', S],
    ['Làm một tấm "bản đồ phòng họp" dán ở pantry', C],
  ],
  [
    'Sếp nói "làm cái này cho đẹp vào". Bạn hiểu là…',
    ['Hỏi lại tiêu chí cụ thể rồi làm đúng', D],
    ['Hỏi ý vài đồng nghiệp xem "đẹp" là thế nào', S],
    ['Làm ba phiên bản để sếp chọn', C],
  ],
  [
    'Hộp thư có 87 email chưa đọc sau kỳ nghỉ. Bạn…',
    ['Lọc theo mức độ gấp rồi xử lý lần lượt', D],
    ['Hỏi team xem có việc gì quan trọng nhất', S],
    ['Tạo vài quy tắc lọc tự động cho lần sau', C],
  ],
  [
    'Khách hàng gọi điện lúc 5 giờ 58 phút chiều thứ Sáu. Bạn…',
    ['Nghe máy và ghi lại yêu cầu cẩn thận', D],
    ['Trò chuyện vui vẻ và hẹn sáng thứ Hai xử lý', S],
    ['Đề xuất một giải pháp tạm thời thật nhanh', C],
  ],
  [
    'Team cần đặt tên cho dự án mới. Bạn góp ý…',
    ['Một cái tên dễ nhớ, đúng nội dung dự án', D],
    ['Mở bình chọn cho cả nhóm cùng quyết', S],
    ['Một cái tên có chơi chữ khiến ai cũng cười', C],
  ],
  [
    'Pantry hết cà phê giữa buổi sáng. Bạn…',
    ['Ghi chú báo hành chính đặt thêm', D],
    ['Rủ cả nhóm xuống quán đầu ngõ', S],
    ['Pha trà gừng mời mọi người đổi vị', C],
  ],
  [
    'Bạn phát hiện một lỗi nhỏ trong báo cáo đã gửi đi. Bạn…',
    ['Sửa ngay và gửi bản đính chính rõ ràng', D],
    ['Nhắn riêng người nhận để giải thích nhẹ nhàng', S],
    ['Tranh thủ cải tiến luôn cách trình bày', C],
  ],
  [
    'Wifi văn phòng chập chờn trong lúc họp online. Bạn…',
    ['Chuyển sang mạng dự phòng và tiếp tục', D],
    ['Trấn an mọi người, kể một chuyện vui chờ mạng', S],
    ['Đề nghị chuyển sang họp đứng ngay tại chỗ', C],
  ],
  [
    'Sếp hỏi "em có ý tưởng gì không?" giữa cuộc họp. Bạn…',
    ['Trình bày ý đã chuẩn bị sẵn trong ghi chú', D],
    ['Mời đồng nghiệp bên cạnh góp ý cùng', S],
    ['Ứng biến một ý tưởng táo bạo', C],
  ],
  [
    'Bảng tính có một ô cứ đỏ mà không ai biết vì sao. Bạn…',
    ['Lần từng công thức cho tới khi tìm ra', D],
    ['Hỏi người tạo bảng tính đầu tiên', S],
    ['Làm lại bảng gọn hơn để khỏi lỗi', C],
  ],
  [
    'Bạn được giao hai việc gấp cùng lúc. Bạn…',
    ['Hỏi rõ thứ tự ưu tiên rồi làm lần lượt', D],
    ['Nhờ một đồng nghiệp rảnh hỗ trợ một việc', S],
    ['Tìm cách gộp hai việc thành một', C],
  ],
  [
    'Đồng nghiệp sinh nhật mà cả phòng quên. Bạn…',
    ['Đặt lời nhắc sinh nhật cho cả năm', D],
    ['Chạy đi mua bánh và gọi mọi người ra hát', S],
    ['Làm một tấm thiệp tự vẽ thật dễ thương', C],
  ],
  [
    'Bạn phải thuyết trình mà máy chiếu không lên hình. Bạn…',
    ['Kiểm tra dây cáp và cài đặt từng bước', D],
    ['Mời mọi người ngồi gần lại xem màn hình laptop', S],
    ['Thuyết trình bằng bảng trắng và bút màu', C],
  ],
  [
    'Chiếc ghế của bạn kêu cót két suốt buổi sáng. Bạn…',
    ['Báo hành chính sửa và tạm đổi ghế', D],
    ['Hỏi xem có ai biết chỉnh ghế không', S],
    ['Biến nó thành "nhạc nền" cho buổi làm việc', C],
  ],
  [
    'Có người để quên cốc trà sữa trong tủ lạnh từ tuần trước. Bạn…',
    ['Dán ghi chú nhắc nhở lịch sự', D],
    ['Hỏi nhóm xem ly của ai để nhắc khéo', S],
    ['Đề xuất "ngày dọn tủ lạnh" mỗi thứ Sáu', C],
  ],
  [
    'Sếp gửi tin nhắn lúc 11 giờ đêm. Bạn…',
    ['Ghi chú lại và trả lời đầu giờ sáng mai', D],
    ['Thả một biểu tượng "đã xem" thân thiện', S],
    ['Đề xuất cả team dùng lịch hẹn giờ gửi tin', C],
  ],
  [
    'Team bạn được giao một dự án chưa ai từng làm. Bạn…',
    ['Lập kế hoạch từng bước và mốc kiểm tra', D],
    ['Tổ chức một buổi cùng nhau tìm hiểu', S],
    ['Tìm cách làm khác hẳn mọi người', C],
  ],
  [
    'Cuối năm, công ty hỏi bạn muốn học thêm gì. Bạn chọn…',
    ['Một kỹ năng giúp làm việc nhanh và chính xác hơn', D],
    ['Một khoá giao tiếp và làm việc nhóm', S],
    ['Một môn nghệ thuật chẳng liên quan gì công việc', C],
  ],
];

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = RAW.map(
  ([prompt, a, b, c], id) => ({
    id,
    prompt,
    options: [
      { text: a[0], effect: a[1] },
      { text: b[0], effect: b[1] },
      { text: c[0], effect: c[1] },
    ],
  }),
);

/** Chọn ngẫu nhiên `count` câu khác nhau theo hạt giống. */
export function pickInterview(
  seed: number,
  count: number = BALANCE.review.interviewQuestions,
): InterviewQuestion[] {
  const rng = seededRng(seed);
  const pool = [...INTERVIEW_QUESTIONS];
  const picked: InterviewQuestion[] = [];
  while (picked.length < count && pool.length > 0) {
    const [question] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (question) picked.push(question);
  }
  return picked;
}

/** Cộng dồn ảnh hưởng của các lựa chọn (không có câu sai, nên luôn qua). */
export function scoreInterview(
  questions: readonly InterviewQuestion[],
  choices: readonly number[],
): Personality {
  const total: Personality = { diligence: 0, sociability: 0, creativity: 0 };
  questions.forEach((question, i) => {
    const option = question.options[choices[i] ?? -1];
    if (!option) return;
    total.diligence += option.effect.diligence ?? 0;
    total.sociability += option.effect.sociability ?? 0;
    total.creativity += option.effect.creativity ?? 0;
  });
  return total;
}
