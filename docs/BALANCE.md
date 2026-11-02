# Cân bằng (Phase 3)

Mọi hằng số nằm trong `packages/shared/src/balance.ts`; đây là giá trị khởi điểm, cần chỉnh sau khi chơi thử.

## Nguồn XP

| Hoạt động                    | XP                                       | Giới hạn mỗi ngày  |
| ---------------------------- | ---------------------------------------- | ------------------ |
| Chấm công                    | 20 + 5 × min(chuỗi, 7)                   | 1 lần              |
| Gõ phím tập trung 1/3/5 phút | 10 / 35 / 70 (dừng sớm: 5 mỗi phút trọn) | không              |
| Kinh công sở                 | 10 mỗi 50 dòng (cộng dồn)                | không              |
| Hoàn thành task              | 15                                       | 5 lần              |
| Tặng cà phê                  | 8                                        | 5 lần              |
| Công quả                     | 12                                       | 6 lần              |
| Xin quẻ                      | 10                                       | lần đầu trong ngày |
| Họp                          | 4 mỗi phút (tối đa 15 phút/lần)          | 30 phút            |
| Việc sếp giao                | 40                                       | 3 việc             |

Giới hạn mềm: 190 XP/ngày, phần vượt chỉ nhận 25%. Phòng ban nhân 1,3 cho đúng loại hoạt động (Kế toán: phần thưởng chuỗi chấm công).

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

## Cân bằng lại (sau Phase 7, theo yêu cầu chơi thử)

- **Level cần nhiều XP hơn**: chơi đều đủ 190 XP/ngày thì cấp 150 (Senior, mở công ty) sau **40 ngày** (trước là 5), cấp 500 sau khoảng 400 ngày. Ví dụ: cấp 5 cần 69 XP, cấp 12 cần ~257, cấp 35 ~1 110, cấp 70 ~2 800, cấp 150 = 7 600.
- **XP nhỏ giọt khi ngồi** (server đo mỗi 15 giây, tính theo phút trọn): ngồi máy 2 XP/phút, đang phiên gõ phím tập trung 4 XP/phút, ngồi họp 2 XP/phút. Tối đa 180 phút ngồi máy và 60 phút họp được tính mỗi ngày. Treo máy vẫn tăng từ từ, nhưng giới hạn mềm 190 XP/ngày vẫn áp dụng.
- **Thưởng hết phiên tập trung** trọn vẹn: 1/3/5 phút = 3/10/20 XP (thêm vào phần đã nhỏ giọt). Dừng sớm thì không có thưởng hết phiên.
- **Việc sếp giao** 25 XP (trước 40), **kinh công sở** 5 XP mỗi 50 dòng (trước 10).
- Người đang ngồi (máy, ghế họp) không bị hỏi "Bạn còn ở đó không?" nên treo máy được.
