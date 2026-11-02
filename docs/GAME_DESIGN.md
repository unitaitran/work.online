# Thiết kế game: Đi làm Online

Tài liệu gốc về luật chơi. Các prompt sau tham chiếu file này; số liệu cụ thể (công thức XP, giới hạn mỗi ngày) sẽ được bổ sung khi làm tới phase tương ứng và đặt trong `packages/shared`.

## Cấp độ (1–500) và chức danh (13 bậc)

Số liệu ở `packages/shared/src/balance.ts`, xem `docs/BALANCE.md`.

- **Cấp độ 1–500** tăng tự động theo tổng XP (bảng `XP_TABLE`).
- **Chức danh tự lên theo cấp**: cứ vài cấp lên một bậc, không cần kỳ đánh giá. Lên bậc thì có màn chúc mừng.

| Bậc | Chức danh (Quản lý / Chuyên môn)        | Từ cấp |
| --: | --------------------------------------- | -----: |
|   1 | Thực tập sinh                           |      1 |
|   2 | Thử việc                                |      5 |
|   3 | Nhân viên chính thức (chọn phòng ban)   |     12 |
|   4 | Nhân viên                               |     22 |
|   5 | Chuyên viên (chọn nhánh)                |     35 |
|   6 | Chuyên viên chính                       |     50 |
|   7 | Trưởng nhóm / Chuyên gia                |     65 |
|   8 | Phó phòng / Chuyên gia chính            |     80 |
|   9 | Trưởng phòng / Chuyên gia cao cấp       |     95 |
|  10 | Phó giám đốc / Chuyên gia trưởng        |    110 |
|  11 | Giám đốc bộ phận / Chuyên gia đầu ngành |    125 |
|  12 | Giám đốc điều hành / Cố vấn chuyên môn  |    138 |
|  13 | Giám đốc Senior / Chuyên gia Senior     |    150 |

- **Senior (cấp 150) = đủ sức mở công ty riêng**: cần rời công ty hiện tại và đủ vốn xu (Phase 6). Chơi đều 5 ngày, mỗi ngày đủ giới hạn 190 XP, là vừa tới cấp 150. Từ 150 lên 500 chậm dần (khoảng 150 ngày), là cấp danh dự để tiếp tục phát triển.
- Kiến trúc: **1 công ty = 1 tầng = 1 phòng server**, một toà nhà tối đa 30 công ty.

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

- Đủ cấp là lên chức danh ngay (không có kỳ đánh giá hay phỏng vấn). Không bao giờ mất cấp hay chức danh.

## Tiền tệ

- **XP** quyết định cấp.
- **Xu** là lương ảo: 50% XP thực nhận (làm tròn xuống) + 20 xu mỗi việc sếp giao. Dùng mua đồ và làm vốn mở công ty.
- **Uy tín** +1 mỗi lần giúp đồng nghiệp (tặng cà phê, công quả).

## Cửa hàng

41 món tự thiết kế trong `packages/shared/src/shop.ts`: áo (màu), nón, phụ kiện, đồ bàn, ghế, thú cưng (mèo, cún, xương rồng biết nhìn, bể cá, robot hút bụi). Mỗi món có giá, độ hiếm (phổ biến / ít gặp / hiếm / cực hiếm) và có thể khoá theo chức danh. Có khung xem thử 3D.

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

## Sự kiện và xã hội

- Sự kiện phòng mỗi 5-10 phút: sếp đi ngang, mất wifi, hết cà phê, họp đột xuất. Không phạt, chỉ thưởng nhỏ.
- Xếp hạng tuần/tháng theo XP, theo phòng ban hoặc tổng; có thể ẩn mình.
- Tường than thở chung: ẩn danh, mỗi ngày một dòng, có lọc và báo cáo.
- Bản đồ toà nhà: chuyển tầng một chạm.
- Thẻ khoe thành tích (ảnh 1080×1350) không kèm thông tin định danh.
- Lịch: thứ Hai uể oải, thứ Sáu hưng phấn, ngày lương (5 và 20), Tết.

## Phòng ban

Mỗi phòng ban có buff riêng: **Dev**, **Sales**, **Marketing**, **Kế toán**, **HR**.
