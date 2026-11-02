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

## Phase 5A: 40 người cùng mặc đồ và dắt thú cưng

Chạy: `GEAR=1 PORT=3000 npm run loadtest -w @dilam/server -- 39 60` (39 bot mặc áo, nón, phụ kiện, dắt thú cưng) rồi mở trình duyệt vào `?debug` làm người thứ 40 và đọc `__dilam.stats()`.

Máy đo: container không có GPU, Chromium vẽ bằng SwiftShader (phần mềm), nên **fps và thời gian khung ở đây không đại diện cho máy thật**; chỉ số đáng tin là số draw call, tam giác và hình học.

| Chất lượng                      | Vẽ chi tiết      | Draw call | Tam giác | Hình học trong bộ nhớ |
| ------------------------------- | ---------------- | --------: | -------: | --------------------: |
| Không ai khác (đối chứng, thấp) |                  |        27 |   18 094 |                    29 |
| Thấp                            | 6 người gần nhất |        71 |   51 878 |                    71 |
| Vừa (có bóng)                   | 12               |       196 |  155 606 |                   111 |
| Cao (có bóng)                   | 20               |       242 |  186 296 |                   163 |

- Mỗi nhân vật chi tiết là 6 mesh gộp (nón, phụ kiện, màu áo gộp vào mesh đầu/thân có sẵn nên **không thêm draw call**); thú cưng thêm 1 mesh. Người ở xa: 1 InstancedMesh chung.
- Có bóng thì mỗi mesh vẽ thêm một lượt vào shadow map, nên mức vừa/cao tăng gấp đôi số draw call.
- Đã sửa trong đợt đo: đọc khung canvas một lần mỗi khung hình (trước đó mỗi bong bóng gọi `getBoundingClientRect`), và chỉ hiện nhãn tên cho người gần (vẽ chi tiết) hoặc đang nói.
- Mục tiêu điện thoại tầm trung (≤ 100 draw call): chế độ tự động bắt đầu ở mức thấp trên màn cảm ứng, đúng ngân sách.

## Phase 7: trước/sau tối ưu

Đo bằng `node scripts/perf-client.cjs <url> 3`: Chromium giả lập CPU chậm 4 lần khi tải, rồi chơi 3 phút lặp các thao tác hay gây rò rỉ (đi lại, mở/đóng cửa hàng, giao lưu, menu, hồ sơ; cứ 3 vòng thì "Sửa thẻ" và vào lại văn phòng để dựng lại toàn cảnh). Máy đo không có GPU (SwiftShader), mạng nội bộ.

**Ngân sách** (mục tiêu điện thoại tầm trung, 30 fps):

| Chỉ số                                         | Ngân sách                                            |
| ---------------------------------------------- | ---------------------------------------------------- |
| Tải tới màn tạo nhân vật (CPU ×4, mạng nội bộ) | ≤ 3 giây                                             |
| JS tải ban đầu                                 | ≤ 900 KB thô / ≤ 260 KB gzip                         |
| Draw call ở chất lượng thấp, phòng đông        | ≤ 100                                                |
| Bộ nhớ sau 30 phút                             | heap tăng ≤ 5 MB, số hình học/texture không tăng dần |

| Chỉ số                                |            Trước |                                                                                                                                  Sau |
| ------------------------------------- | ---------------: | -----------------------------------------------------------------------------------------------------------------------------------: |
| Tải tới màn tạo nhân vật (CPU ×4)     |         1 648 ms |                                                                                                                             1 615 ms |
| JS tải ban đầu                        | 862 KB (2 chunk) |                                                                   847 KB (11 chunk; three 550 KB và zod 92 KB tách riêng, cache lâu) |
| JS màn ít dùng (tải lười)             |          gộp sẵn | cửa hàng 5 KB, công ty 11 KB, xếp hạng 1,6 KB, tường 1,8 KB, bản đồ 0,9 KB, thẻ khoe 3 KB, công cụ dev 0,8 KB (không có ở bản build) |
| Draw call (một mình, chất lượng thấp) |               27 |                                                                                                                                   27 |
| Sau 3 phút / 20 vòng: hình học        |          29 → 31 |                                                                                                                              29 → 31 |
| Sau 3 phút / 20 vòng: texture         |            6 → 6 |                                                                                                                                6 → 6 |
| Sau 3 phút / 20 vòng: heap JS         |   14,9 → 13,7 MB |                                                                                                                       13,0 → 13,6 MB |
| Nút DOM                               |          83 → 83 |                                                                                                                              93 → 94 |

Kết luận: không thấy rò rỉ (hình học dao động 29-36 theo NPC và nhân vật dựng lại, trở về 29-31). Phần lớn JS là three.js, cần ngay từ màn tạo nhân vật nên không tải lười được; lợi ích chính của việc tách chunk là cache: bản cập nhật chỉ đổi `main`/`strings`, three và zod giữ nguyên trong cache. Gzip ở reverse proxy giảm JS ban đầu còn khoảng 240 KB.

**Chế độ máy yếu** (tự phát hiện khi ≤ 4 nhân CPU, ≤ 4 GB RAM hoặc bật tiết kiệm dữ liệu): bắt đầu ở mức thấp (không bóng, không bụi, pixel ratio 1, chỉ 5 người vẽ chi tiết), bộ điều tiết vẫn tự hạ thêm nếu fps < 30 kéo dài.

**Sửa trong Phase 7**: thẻ khoe trả context WebGL ngay sau khi chụp (trước đây chờ trình duyệt thu hồi), tránh chạm giới hạn số context khi mở thẻ khoe nhiều lần.
