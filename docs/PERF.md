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
