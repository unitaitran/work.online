# Thiết kế game: Đi làm Online

Tài liệu gốc về luật chơi. Các prompt sau tham chiếu file này; số liệu cụ thể (công thức XP, giới hạn mỗi ngày) sẽ được bổ sung khi làm tới phase tương ứng và đặt trong `packages/shared`.

## Cấp độ (1–500) và chức danh (13 bậc)

Số liệu ở `packages/shared/src/balance.ts`, xem `docs/BALANCE.md`.

- **Cấp độ 1–500** tăng tự động theo tổng XP (bảng `XP_TABLE`).
- **Chức danh tự lên theo cấp**: cứ vài cấp lên một bậc, không cần kỳ đánh giá. Lên bậc thì có màn chúc mừng.
- **Chức danh hiển thị theo nơi làm** (`packages/shared/src/job.ts`):
  - Văn phòng chung (Công Sở / công ty NPC): thang 13 chức danh bên dưới.
  - Tự mở công ty: **CEO**.
  - Làm ở công ty người chơi khác: vị trí Intern / Fresher / Junior / Middle / Senior theo cấp hiện tại và khung cấp CEO đặt cho từng vị trí. Lên cấp chạm khung mới thì lên vị trí (có màn chúc mừng).
  - Đổi chỗ làm thì chức danh đổi theo; cấp (XP) giữ nguyên. Thang chức danh chung vẫn dùng để mở khoá phòng ban, nhánh và đồ trong cửa hàng.

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
- Soạn thư công sở.
- Pha cà phê tặng đồng nghiệp.
- Công quả (lau bàn, tưới cây).
- Việc sếp giao: ngẫu nhiên, tối đa 3 mỗi ngày, xong mỗi việc +40 XP.
- Ngồi họp ở phòng họp (4 XP mỗi phút trọn, tối đa 15 phút mỗi lần).
- Xử lý sự kiện (để phase sau).

Mỗi ngày có giới hạn XP, vượt mức chỉ nhận một phần.

## Thăng chức

- Đủ cấp là lên chức danh ngay (không có kỳ đánh giá hay phỏng vấn). Không bao giờ mất cấp; chức danh hiển thị đổi theo nơi làm (xem trên).

## Tiền tệ

- **XP** quyết định cấp.
- **Xu** là lương ảo: 50% XP thực nhận (làm tròn xuống) + 20 xu mỗi việc sếp giao. Dùng mua đồ và làm vốn mở công ty.
- **Uy tín** +1 mỗi lần giúp đồng nghiệp (tặng cà phê, công quả).

## Cửa hàng

41 món tự thiết kế trong `packages/shared/src/shop.ts`: áo (màu), nón, phụ kiện, đồ bàn, ghế, thú cưng (mèo, cún, xương rồng biết nhìn, bể cá, robot hút bụi). Mỗi món có giá, độ hiếm (phổ biến / ít gặp / hiếm / cực hiếm) và có thể khoá theo chức danh. Có khung xem thử 3D.

## Hoạt động

- Chấm công.
- Gõ phím.
- Thư công sở (mỗi tiếng gõ ra một dòng mail mẫu).
- Xin quẻ KPI mỗi ngày một lần.
- Lật 1 trong 3 task.
- Tường than thở ẩn danh.
- Cà phê.
- Công quả.
- Thú cưng văn phòng.
- Sự kiện sếp đi ngang.

## Công ty

- Senior (cấp 150), đã rời công ty, đủ vốn thì mở công ty: chọn ngành (công nghệ, quán cà phê, thương mại, sáng tạo), tên, màu, biểu tượng.
- 5 giai đoạn: Garage, Co-working, Công ty nhỏ, Công ty vừa, Tập đoàn. Lên giai đoạn cần đủ số dự án, uy tín, nhân viên NPC và quỹ dự trữ.
- Nhận dự án, làm bằng các hoạt động sẵn có trong văn phòng công ty, hoặc để nhân viên NPC làm theo giờ thật.
- Sự kiện công ty có lựa chọn: khách huỷ hợp đồng, deadline gấp, nhân viên xin nghỉ.
- IPO ở giai đoạn Tập đoàn: huy hiệu vĩnh viễn, chọn ngành mới, bắt đầu lại với thưởng nhỏ.
- Người chưa lên Senior có thể nộp đơn hoặc dùng mã mời vào làm ở công ty người chơi khác; chủ duyệt, giao việc, thăng chức, cho nghỉ, chặn.
- Thỉnh thoảng có lời mời từ công ty khác: lên ngay một cấp nhưng đổi môi trường và giảm nhẹ uy tín.
- Khi mở công ty chọn nơi đặt trụ sở trong 34 tỉnh, thành. **Bản đồ công ty** (sơ đồ Việt Nam) cho xem công ty theo miền, tỉnh và nộp đơn; **bản đồ toà nhà** liệt kê các công ty trong toà theo tầng.
- CEO đặt **khung cấp tuyển dụng**: cấp bao nhiêu đến bao nhiêu thì vào Intern, Fresher, Junior, Middle, Senior (tắt được từng vị trí). Người xin việc ngoài mọi khung không nộp đơn được; nhân viên lên cấp là tự lên vị trí.
- **Phòng kính CEO** cạnh cửa kính, chung vách với phòng họp. CEO đi lại như mọi người, chỉ khác là có thẻ quẹt mở cửa phòng này (chỉ trong văn phòng công ty của mình); ngồi bàn CEO tính như ngồi máy và mở bảng quản lý công ty. Ở văn phòng chung phòng này luôn khoá.

## Văn phòng (mặt bằng v2, 20 × 13 m)

- Tông đen xám: tường vữa xám, sàn đá xám đậm hơi bóng, đồ nội thất đen; màu đỏ chỉ ở vài món decor (tượng gấu, hộp quà, gối, tranh, ống quẻ, một đôi giày, một chiếc áo).
- Phía nam (từ tây sang đông): phòng sếp (vách kính bắc và tây, cửa quẹt thẻ), phòng họp 1 (bàn 3 × 1,8 m, 6 ghế, TV), phòng nghỉ (vách kính, sofa ba chỗ, ghế dài nằm nghỉ, đèn cây).
- Giữa: 4 dãy bàn dài liền khối chạy dọc theo hướng sếp nhìn ra từ phòng kính, mỗi dãy người ngồi hai bên (24 chỗ), mỗi cặp chỗ một đèn thả.
- Tường bắc: 3 ô cửa sổ, giá sách đen đặt giữa các ô (không che kính), trên giá có sách và hộp quà; đồng hồ giờ Việt Nam bên phải dãy cửa sổ.
- Tường tây, từ cổng vào sâu trong: kệ giày sneaker, tượng gấu đỏ (logo công ty chữ neon phía trên), kệ treo một dãy áo, rồi 2 bảng dán note cạnh dãy ngồi (lật task, tường than thở).
- Khu dịch vụ gọn sát tường đông: quầy có máy pha cà phê, lò vi sóng, cây nước (có nhãn), tủ lạnh, một bàn đứng.
- Nút "Góc nhìn": Xuyên thấu, Tự động xoay, Nhìn từ trên, Đặt lại góc nhìn, bật/tắt tên khu (PHÒNG SẾP, PHÒNG HỌP 1, PHÒNG NGHỈ, KHU DỊCH VỤ, LỐI VÀO; chỉ hiện khi nhìn xa).

## Tài khoản và ra vào

- Chơi ngay không cần tài khoản (khách): đóng tab hoặc đăng xuất là mất. Đăng ký (tên đăng nhập + mật khẩu, không cần email) bất cứ lúc nào để giữ tiến độ; đăng nhập ở máy khác được.
- Nút **Đi về** đưa ra màn "Ở nhà" (ngoài văn phòng): đi làm lại, công ty, bản đồ công ty, đổi nhân vật, lưu tài khoản, đăng xuất. Nghỉ việc cũng ra màn này.
- Đồng hồ treo tường trong văn phòng chạy theo giờ Việt Nam thật.

## Sự kiện và xã hội

- Sự kiện phòng mỗi 5-10 phút: sếp đi ngang, mất wifi, hết cà phê, họp đột xuất. Không phạt, chỉ thưởng nhỏ.
- Xếp hạng tuần/tháng theo XP, theo phòng ban hoặc tổng; có thể ẩn mình.
- Tường than thở chung: ẩn danh, mỗi ngày một dòng, có lọc và báo cáo.
- Bản đồ toà nhà: chuyển tầng một chạm.
- Thẻ khoe thành tích (ảnh 1080×1350) không kèm thông tin định danh.
- Lịch: thứ Hai uể oải, thứ Sáu hưng phấn, ngày lương (5 và 20), Tết.

## Phòng ban

Mỗi phòng ban có buff riêng: **Dev**, **Sales**, **Marketing**, **Kế toán**, **HR**.
