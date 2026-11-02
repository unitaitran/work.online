# Hiệu năng

Mục tiêu (AGENTS.md): 30 fps trên điện thoại tầm trung, giới hạn draw call. Ghi lại số đo mỗi lần tối ưu.

## Cách đo

- Mở `http://localhost:5173/?debug`: góc dưới bên phải hiện fps, thời gian CPU mỗi khung hình, số draw call và mức đồ họa.
- `?debug` cũng mở `window.__dilam` (`stats()`, `setQuality(mode)`, `memory()`...) cho kịch bản đo tự động qua Chrome DevTools Protocol.
- **Draw call** là tổng số lệnh vẽ trong một khung hình, tính cả lượt vẽ shadow map (`renderer.info.render.calls`).
- **CPU ms** là trung bình thời gian chạy logic bước cố định, cập nhật khung hình và gửi lệnh vẽ (không tính thời gian GPU).

## Phase 1: văn phòng thử, 1 nhân vật (2026-11-02)

Máy đo: laptop có GPU NVIDIA GeForce RTX 5060 Laptop (ANGLE / Direct3D 11), Chrome headless có GPU, bật vsync. Cảnh: phòng thử 14 × 10 m, 7 món đồ, 1 nhân vật, camera mặc định.

| Kịch bản                                       | Mức  | fps | CPU ms/khung | Draw call | Tam giác |
| ---------------------------------------------- | ---- | --: | -----------: | --------: | -------: |
| Máy tính 1264×705, DPR 1                       | Cao  |  60 |         0,23 |        17 |   11 382 |
|                                                | Vừa  |  60 |         0,23 |        17 |   11 382 |
|                                                | Thấp |  60 |         0,16 |        10 |    5 720 |
| Máy tính 1280×720, DPR 2                       | Cao  |  60 |         0,20 |        17 |   11 382 |
|                                                | Vừa  |  60 |         0,23 |        17 |   11 382 |
|                                                | Thấp |  60 |         0,18 |        10 |    5 720 |
| Giả lập điện thoại 390×844, DPR 3, CPU chậm 4× | Cao  |  60 |         1,02 |        17 |   11 382 |
|                                                | Vừa  |  60 |         0,95 |        17 |   11 382 |
|                                                | Thấp |  60 |         1,32 |        10 |    5 720 |
| Giả lập điện thoại 390×844, DPR 3, CPU chậm 6× | Cao  |  60 |         1,82 |        17 |   11 382 |
|                                                | Vừa  |  60 |         1,51 |        17 |   11 382 |
|                                                | Thấp |  60 |         1,31 |        10 |    5 720 |

fps chạm trần vsync (60) ở mọi kịch bản, nên bảng này chưa cho thấy chênh lệch GPU giữa các mức. Giả lập chỉ làm chậm CPU, **không** làm chậm GPU, nên chưa thay được việc đo trên điện thoại thật (xem "Việc cần đo thêm").

### Draw call theo thành phần

| Thành phần                         | Lượt vẽ chính | Lượt shadow map |
| ---------------------------------- | ------------: | --------------: |
| Sàn (họa tiết canvas)              |             1 |               – |
| Tường + len chân tường (gộp)       |             1 |               – |
| Toàn bộ đồ đạc (gộp, màu đỉnh)     |             1 |               1 |
| Nhân vật: đầu, thân, 2 tay, 2 chân |             6 |               6 |
| Bụi lơ lửng (mức Vừa/Cao)          |             1 |               – |
| Bóng giả dưới chân (mức Thấp)      |             1 |               – |
| **Tổng**                           |        **10** | **7** (Vừa/Cao) |

Mỗi nhân vật tốn 6 draw call (12 nếu bật bóng). Khi có nhiều người chơi (Phase 4), đây là chỗ cần tối ưu đầu tiên: gộp cả nhân vật ở xa thành 1 mesh, hoặc dùng InstancedMesh cho các bộ phận giống nhau.

### Ba mức chất lượng

| Mức  | Pixel ratio tối đa | Bóng                 | Hạt bụi |
| ---- | -----------------: | -------------------- | ------: |
| Thấp |                  1 | tắt (bóng giả)       |       0 |
| Vừa  |                1,5 | bật, shadow map 1024 |      40 |
| Cao  |                  2 | bật, shadow map 2048 |     120 |

Chế độ "Tự động" khởi đầu ở mức Cao (máy có chuột) hoặc Vừa (màn cảm ứng). Nếu fps trung bình dưới 30 liên tục 4 giây thì tự hạ một mức, sau đó chờ 3 giây cho ổn định rồi mới đo tiếp.

### Việc cần đo thêm

- Đo trên điện thoại tầm trung thật (Android, Chrome) bằng `?debug`, cho cả ba mức.
- Đo thời gian GPU (`EXT_disjoint_timer_query_webgl2`) để thấy khác biệt giữa các mức khi fps không chạm vsync.

## Phase 2A: tầng văn phòng đầy đủ, 1 người chơi + 3 NPC (2026-11-02)

Máy đo, cách đo và trình duyệt giống Phase 1. Cảnh: tầng 26 × 18 m gồm 8 bàn làm việc, phòng họp kính, pantry, khu nghỉ trưa, 6 chậu cây và 3 NPC đi lại; camera mặc định ở chỗ xuất hiện. Số draw call dao động theo vị trí NPC và vật trong khung hình (Three.js bỏ qua những gì nằm ngoài camera).

| Kịch bản                                       | Mức  | fps | CPU ms/khung | Draw call | Tam giác |
| ---------------------------------------------- | ---- | --: | -----------: | --------: | -------: |
| Máy tính 1264×705, DPR 1                       | Cao  |  60 |         0,67 |        46 |   33 458 |
|                                                | Vừa  |  60 |         0,62 |        46 |   33 458 |
|                                                | Thấp |  60 |         0,48 |        31 |   20 536 |
| Máy tính 1280×720, DPR 2                       | Cao  |  60 |         0,61 |        53 |   40 978 |
|                                                | Vừa  |  60 |         0,59 |        47 |   36 372 |
|                                                | Thấp |  60 |         0,52 |        25 |   15 930 |
| Giả lập điện thoại 390×844, DPR 3, CPU chậm 4× | Cao  |  60 |         2,56 |        45 |   36 080 |
|                                                | Vừa  |  60 |         2,65 |        45 |   36 080 |
|                                                | Thấp |  60 |         2,15 |        35 |   24 850 |
| Giả lập điện thoại 390×844, DPR 3, CPU chậm 6× | Cao  |  60 |         4,17 |        51 |   40 686 |
|                                                | Vừa  |  60 |         3,64 |        45 |   36 200 |
|                                                | Thấp |  60 |         2,88 |        23 |   15 758 |

**Mục tiêu "dưới 150 draw call ở mức Vừa": đạt, tối đa đo được 47.** Một lần đo khác, ở góc nhìn ra cửa kính, được 41 (Cao/Vừa) và 19 (Thấp).

### Draw call theo thành phần (lượt vẽ chính, khi mọi thứ nằm trong khung hình)

| Thành phần                                           | Draw call | Ghi chú                |
| ---------------------------------------------------- | --------: | ---------------------- |
| Sàn, tường, cửa kính thành phố                       |         3 |                        |
| Đồ chỉ có một cái (pantry, sofa, phòng họp, máy in…) |         1 | gộp, màu đỉnh          |
| Bàn làm việc ×8                                      |         1 | InstancedMesh          |
| Ghế ×14 (8 bàn + 6 phòng họp)                        |         1 | InstancedMesh          |
| Màn hình (3 loại họa tiết)                           |         3 | InstancedMesh mỗi loại |
| Chậu cây ×6                                          |         1 | InstancedMesh          |
| Kính phòng họp                                       |         1 | trong suốt             |
| Người chơi + 3 NPC                                   |        24 | 6 mỗi nhân vật         |
| Bụi lơ lửng, vòng đánh dấu, bóng giả                 |       0–2 | tuỳ mức                |
| **Tổng lượt chính**                                  |   **~35** | shadow map thêm 10–30  |

Nhân vật chiếm phần lớn số draw call (6 mỗi người). Đây vẫn là chỗ đầu tiên cần gộp khi có nhiều người chơi (Phase 4).

### Âm thanh chạy 10 phút

Ngồi ở bàn làm việc trong 10 phút với nhạc nền, tiếng điều hòa và tiếng gõ phím liên tục (tạo và hủy hàng nghìn nút âm thanh), mức Vừa. Trước mỗi lần đo ép dọn rác (`HeapProfiler.collectGarbage`).

| Phút | JS heap (MB) | Nút DOM | Giọng âm thanh đang phát | AudioContext | fps |
| ---: | -----------: | ------: | -----------------------: | ------------ | --: |
|    1 |        12,12 |     130 |                        9 | running      |  60 |
|    3 |        12,22 |     130 |                        8 | running      |  60 |
|    5 |        12,18 |     130 |                        9 | running      |  60 |
|    7 |        12,18 |     130 |                        9 | running      |  60 |
|   10 |        12,07 |     130 |                        7 | running      |  60 |

**Không rò bộ nhớ**: heap không tăng (12,12 → 12,07 MB), số nút DOM đứng yên, số giọng đang phát cao nhất là 16 rồi tự giải phóng. Số geometry và texture trên GPU giữ nguyên (37/8).

Khi tab bị ẩn hoặc tắt âm thanh, `AudioContext` chuyển sang `suspended` và bộ lên lịch nhạc dừng. Kịch bản kiểm thử phải giả lập sự kiện `visibilitychange`, vì Chrome headless không đổi `document.hidden` khi chuyển tab.

## Phase 4B: tải thử 100 bot trong một phòng

Chạy: `npm run loadtest -w @dilam/server -- 100 20` (tạo 100 tài khoản vào SQLite tạm, chạy server thật ở tiến trình con, 100 bot WebSocket đi lại 10 lần/giây, mỗi giây ping một lần, 20% cơ hội vẫy tay).

Máy đo: container Linux dùng chung (Node 22), server và bot chạy cùng máy.

| Chỉ số                     | Kết quả                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| Số bot / phòng             | 100 / 1 phòng (`ROOM_CAPACITY=100`)                                             |
| Băng thông xuống mỗi người | 11,6 KB/s (27,6 tin/giây, gồm 5 lần `states`/giây và vẫy tay của 99 người khác) |
| Băng thông lên mỗi người   | 1,0 KB/s                                                                        |
| Độ trễ ping/pong           | p50 1 ms, p95 10 ms, tối đa 24 ms                                               |
| CPU server                 | 23,7% một nhân                                                                  |
| Bộ nhớ server (RSS)        | 115 MB lúc rảnh → 155 MB khi có 100 người                                       |

Ghi chú: phòng chung mặc định 40 người nên tải thật mỗi phòng nhẹ hơn khoảng 6 lần (số cặp người giảm theo bình phương). Phần `states` chỉ gửi người trong 14 m và chỉ khi đổi, nên người đứng yên không tốn băng thông.

**Client**: người chơi khác vẽ chi tiết tối đa 6/12/20 người gần nhất (chất lượng thấp/vừa/cao); xa hơn vẽ khối trụ cùng màu áo bằng **một InstancedMesh** (1 draw call cho mọi người ở xa).
