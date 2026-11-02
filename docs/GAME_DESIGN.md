# Thiết kế game: Đi làm Online

Tài liệu gốc về luật chơi. Các prompt sau tham chiếu file này; số liệu cụ thể (công thức XP, giới hạn mỗi ngày) sẽ được bổ sung khi làm tới phase tương ứng và đặt trong `packages/shared`.

## Cấp độ (1–500) và chức danh (10 bậc)

Hai hệ thống tách nhau (số liệu ở `packages/shared/src/balance.ts`, xem `docs/BALANCE.md`):

- **Cấp độ 1–500** tăng _tự động_ theo tổng XP (bảng `XP_TABLE`).
- **Chức danh** có 10 bậc, mỗi bậc cần đạt cấp tối thiểu _và_ qua kỳ đánh giá 7 ngày kèm phỏng vấn.

| Bậc | Chức danh (nhánh Quản lý / Chuyên môn)   | Cấp tối thiểu |
| --: | ---------------------------------------- | ------------: |
|   1 | Thực tập sinh                            |             1 |
|   2 | Thử việc                                 |             5 |
|   3 | Nhân viên chính thức                     |            15 |
|   4 | Chuyên viên                              |            35 |
|   5 | Chuyên viên cao cấp                      |            70 |
|   6 | Trưởng nhóm / Chuyên gia                 |           120 |
|   7 | Trưởng phòng / Chuyên gia cao cấp        |           200 |
|   8 | Giám đốc bộ phận / Chuyên gia trưởng     |           290 |
|   9 | Giám đốc điều hành / Giám đốc chuyên môn |           390 |
|  10 | Tổng giám đốc / Chuyên gia đầu ngành     |           500 |

- Chức danh 3: chọn **phòng ban**. Chức danh 5: chọn nhánh **Chuyên môn** hoặc **Quản lý**.
- **Mở công ty riêng**: cần **cấp 150** và đã **rời công ty hiện tại**. Chơi đều 5 ngày, mỗi ngày đủ giới hạn 190 XP, là vừa tới cấp 150 (950 XP). Từ 150 lên 500 chậm dần, khoảng 150 ngày.
- Kiến trúc: **1 công ty = 1 tầng = 1 server**, một toà nhà tối đa 30 công ty (Phase 4 và 6). Phase 3 mới có hằng số và hàm kiểm tra điều kiện (`company.ts`); thao tác rời/mở công ty làm ở Phase 6.

## Nguồn XP

- Chấm công mỗi ngày (chuỗi ngày tăng thưởng).
- Phiên gõ phím tập trung 1/3/5 phút.
- Tick xong task.
- Tụng kinh công sở.
- Pha cà phê tặng đồng nghiệp.
- Công quả (lau bàn, tưới cây).
- Việc sếp giao: ngẫu nhiên, tối đa 3 mỗi ngày, xong mỗi việc +40 XP.
- Ngồi họp ở phòng họp (4 XP mỗi phút trọn, tối đa 15 phút mỗi lần).
- Xử lý sự kiện (để phase sau).

Mỗi ngày có giới hạn XP, vượt mức chỉ nhận một phần.

## Thăng chức

- Đủ XP chưa lên ngay.
- Mỗi kỳ đánh giá 7 ngày lịch gồm điều kiện cứng (cấp, số ngày chấm công, phút tập trung, lần giúp đồng nghiệp, đã chọn nhánh) và phỏng vấn 5 tình huống (không có câu sai, chỉ cộng nhẹ tính cách).
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
