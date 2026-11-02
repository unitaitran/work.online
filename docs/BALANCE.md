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
