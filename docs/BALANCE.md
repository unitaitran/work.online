# Cân bằng (Phase 3)

Mọi hằng số nằm trong `packages/shared/src/balance.ts`; đây là giá trị khởi điểm, cần chỉnh sau khi chơi thử.

## Nguồn XP

| Hoạt động                    | XP                                       | Giới hạn mỗi ngày  |
| ---------------------------- | ---------------------------------------- | ------------------ |
| Chấm công                    | 20 + 5 × min(chuỗi, 7)                   | 1 lần              |
| Gõ phím tập trung 1/3/5 phút | 10 / 35 / 70 (dừng sớm: 5 mỗi phút trọn) | không              |
| Thư công sở                  | 10 mỗi 50 dòng (cộng dồn)                | không              |
| Hoàn thành task              | 15                                       | 5 lần              |
| Tặng cà phê                  | 8                                        | 5 lần              |
| Công quả                     | 12                                       | 6 lần              |
| Xin quẻ                      | 10                                       | lần đầu trong ngày |
| Họp                          | 4 mỗi phút (tối đa 15 phút/lần)          | 30 phút            |
| Việc sếp giao                | 40                                       | 3 việc             |

Giới hạn mềm: 190 XP/ngày, phần vượt chỉ nhận 50%. Phòng ban nhân 1,3 cho đúng loại hoạt động (Kế toán: phần thưởng chuỗi chấm công).

## Mốc theo ngày (chơi đều đúng 190 XP/ngày)

| Cấp | XP tích luỹ |  Ngày |
| --: | ----------: | ----: |
|  35 |         150 |   0,8 |
|  70 |         363 |   1,9 |
| 150 |         950 |   5,0 |
| 200 |        2446 |  12,9 |
| 300 |        8522 |  44,9 |
| 400 |       17391 |  91,5 |
| 500 |       28500 | 150,0 |

Chức danh tự lên theo cấp (13 bậc, xem GAME_DESIGN). Với nhịp 190 XP/ngày: bậc 5 (Chuyên viên, cấp 35) sau khoảng 1 ngày, bậc 9 (cấp 95) khoảng 3 ngày, Senior (cấp 150) đúng 5 ngày.

Xu: 50% XP thực nhận + 20 xu mỗi việc sếp giao, tức khoảng 95–155 xu mỗi ngày chơi đủ.

## Công ty (Phase 6)

Mô phỏng `simulateCompany` (`packages/shared/src/companySim.ts`): người chơi làm việc trong phòng công ty mỗi ngày (điểm công việc = XP thực nhận), luôn nhận dự án khó nhất được phép, tuyển và thăng chức NPC khi dư quỹ, nâng cấp ngay khi đủ điều kiện.

|      Điểm công việc / ngày | Co-working | Công ty nhỏ | Công ty vừa | Tập đoàn |    IPO |
| -------------------------: | ---------: | ----------: | ----------: | -------: | -----: |
|             100 (chơi nhẹ) |    ngày 10 |          24 |          41 |       59 |     75 |
| **190 (đủ giới hạn ngày)** |      **7** |      **18** |      **31** |   **47** | **62** |
|     300 (cả nhóm cùng làm) |          5 |          12 |          24 |       39 |     52 |

Mục tiêu "khoảng 2 tháng từ lúc mở công ty đến IPO" đạt ở nhịp chơi đều (62 ngày). Test `company.test.ts` giữ IPO trong khoảng 45-75 ngày.

- Vốn mở công ty: max(800, 25% tổng xu đã kiếm từ hoạt động), chuyển thành quỹ ban đầu.
- NPC: thực tập sinh 1,2 điểm/giờ (lương 0,4 xu/giờ), nhân viên 2,2 (0,8), cao cấp 3,4 (1,3). Chỉ làm và nhận lương khi có dự án. Quỹ không đủ thì chỉ làm phần được trả.
- Dự án độ khó d: cần 160·d^1,35 điểm, thưởng 150·d^1,5 xu và 3d uy tín.
- IPO: thưởng cho chủ 5% quỹ, huy hiệu vĩnh viễn, công ty về Garage với quỹ 800 xu.

## Cân bằng lại (Hệ thống World 10x XP, Treo máy Chill, Item Buff & Thông báo Duyên dáng)

- **Thang điểm World 10x**:
  - Giới hạn mềm mỗi ngày (Daily Soft Cap): **2.500 XP/ngày** (phần vượt chỉ nhận 50% ở chế độ "Làm việc vì đam mê").
  - Chấm công: 200 + 50 × min(chuỗi, 7) XP (tối đa 550 XP).
  - Hoàn thành task: 150 XP (tối đa 5 task/ngày).
  - Tặng cà phê: 80 XP (tối đa 5 lần/ngày).
  - Công quả (tưới cây, lau bàn, tủ lạnh, máy in): 120 XP (tối đa 6 lần/ngày).
  - Xin quẻ KPI: 100 XP (lần đầu trong ngày).
  - Việc sếp giao: 250 XP + 20 xu thưởng (3 việc/ngày).
  - Phiên gõ phím tập trung (Focus 1/3/5 phút): thưởng kết thúc phiên 50 / 120 / 250 XP. Trong lúc focus nhận 10 XP/phút.
  - Thư công sở: 50 XP mỗi 50 dòng gõ được (tích lũy cộng dồn).
  - Họp phòng họp: 4 XP/phút (tối đa 60 phút/ngày).
- **Treo máy gõ phím chill (Idle Desk Typing)**:
  - Ngồi máy tính tăng thong thả: **2 XP/phút** (≈ 6 XP mỗi 3 phút, tương ứng 0.6 XP/3p ở thang cũ; khoảng 120 XP/giờ). Tối đa 240 phút (4 tiếng) ngồi máy được tính mỗi ngày.
- **Tiền tệ & Chống lạm phát**:
  - Tỉ lệ quy đổi Xu: **0.05 xu / XP thực nhận** (20 XP = 1 xu). Chơi đủ trần 2.500 XP/ngày kiếm được 125 xu + 60 xu nhiệm vụ sếp ≈ 185 xu/ngày. Cân bằng chặt chẽ với giá shop (80–3.200 xu) để món đồ Epic cần 2–3 tuần tích lũy.
- **Hệ thống Buff Vật phẩm**:
  - **41 món Shop Cá nhân**: Các món đồ đều có tính năng thực tế (Ví dụ: Vịt cao su +15% XP task, Cốc Sếp #1 +20% XP cà phê, Tai nghe chống ồn +15% XP focus, Bonsai +25% XP công quả, Ghế công thái học +20% XP khi ngồi máy, Cún giữ cửa +20% thưởng chuỗi chấm công...).
  - **Shop Công ty**:
    - Ghế massage: +15% XP khi ngồi máy trong văn phòng công ty.
    - Máy chơi game + TV: +15% xu thưởng khi xong dự án công ty.
    - Decor bàn làm việc: +10% điểm đóng góp dự án cho toàn thể nhân viên & NPC.
    - Đồng phục công ty: +10% XP mọi hoạt động khi mặc đồng phục làm việc cùng nhau.
- **UX Thông báo Giới hạn Duyên dáng (Workplace Flavor Messaging)**:
  - Loại bỏ hoàn toàn các thông báo trừ điểm/giảm điểm tiêu cực.
  - Tưới cây quá giới hạn: Thông báo tế nhị cây sợ úng rễ cần đón nắng.
  - Lau bàn quá giới hạn: Thông báo bàn đã quá bóng soi được mặt sếp.
  - Vượt trần ngày: Loa công đoàn thông báo tan ca và chuyển sang chế độ "Tăng ca vì đam mê".
