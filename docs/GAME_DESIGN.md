# Thiết kế game: Đi làm Online

Tài liệu gốc về luật chơi. Các prompt sau tham chiếu file này; số liệu cụ thể (công thức XP, giới hạn mỗi ngày) sẽ được bổ sung khi làm tới phase tương ứng và đặt trong `packages/shared`.

## Cấp bậc và XP cần

| Cấp | Chức danh            | XP cần |
| --: | -------------------- | -----: |
|   1 | Thực tập sinh        |      0 |
|   2 | Thử việc             |    300 |
|   3 | Nhân viên chính thức |    900 |
|   4 | Chuyên viên          |   2000 |
|   5 | Chuyên viên cao cấp  |   3500 |
|   6 | Trưởng nhóm          |   5500 |
|   7 | Trưởng phòng         |   8000 |
|   8 | Giám đốc bộ phận     |  11500 |
|   9 | Giám đốc điều hành   |  16000 |
|  10 | Tổng giám đốc        |  22000 |

- Từ cấp 5 chọn nhánh **Chuyên môn** hoặc **Quản lý**.
- Từ cấp 8 được **mở công ty riêng**.

## Nguồn XP

- Chấm công mỗi ngày (chuỗi ngày tăng thưởng).
- Phiên gõ phím tập trung 1/3/5 phút.
- Tick xong task.
- Tụng kinh công sở.
- Pha cà phê tặng đồng nghiệp.
- Công quả (lau bàn, tưới cây).
- Nhiệm vụ ngày.
- Xử lý sự kiện.

Mỗi ngày có giới hạn XP, vượt mức chỉ nhận một phần.

## Thăng chức

- Đủ XP chưa lên ngay.
- Mỗi "quý" (khoảng 1 tuần chơi) có kỳ đánh giá gồm điều kiện cứng và một mini-game tình huống.
- Chưa đạt thì không mất cấp.

## Tiền tệ

- **XP** quyết định cấp.
- **Xu** là lương ảo, dùng để mua đồ.
- **Uy tín** tăng khi giúp đồng nghiệp, cần từ cấp 6.

## Hoạt động

- Chấm công.
- Gõ phím.
- Kinh công sở (mỗi tiếng gõ ra một dòng mail mẫu).
- Xin quẻ KPI mỗi ngày một lần.
- Lật 1 trong 3 task.
- Tường than thở ẩn danh.
- Cà phê.
- Công quả.
- Thú cưng văn phòng.
- Sự kiện sếp đi ngang.

## Phòng ban

Mỗi phòng ban có buff riêng: **Dev**, **Sales**, **Marketing**, **Kế toán**, **HR**.
