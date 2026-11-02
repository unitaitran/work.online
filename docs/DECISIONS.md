# Quyết định và giả định

Ghi lại các lựa chọn mặc định khi prompt không nói rõ. Mỗi mục ghi phase, quyết định và lý do. Muốn đổi thì sửa ở đây trước rồi mới sửa code.

## Phase 0: khởi tạo dự án (2026-11-02)

### Công cụ và phiên bản

- **Node ≥ 22.12** (ghi trong `engines` và `.nvmrc`). AGENTS.md ghi "Node 20+", nhưng Node 20 đã hết hỗ trợ (EOL 30/04/2026) và Vitest 5 cần Node ≥ 22.12. Máy dev hiện dùng Node 22.18.
- **TypeScript 6.0.3, chưa lên TypeScript 7.** typescript-eslint 8.72 (bản mới nhất) chỉ hỗ trợ TypeScript < 6.1. Lên TS 7 khi typescript-eslint hỗ trợ.
- **Ghim chính xác mọi phiên bản** (`.npmrc`: `save-exact=true`), không chỉ Three.js (`three@0.187.0`, `@types/three@0.187.0`). Lý do: rủi ro chính của Phase 0 là phiên bản công cụ lệch nhau.
- Các bản chính: Vite 8.3.5, Vitest 5.0.5, Fastify 5.12.7, ws 8.22.1, zod 4.6.7, ESLint 10.14.0 + typescript-eslint 8.72.1, Prettier 3.9.10.

### Cấu trúc monorepo

- Tên gói: `@dilam/shared`, `@dilam/server`, `@dilam/client`; gốc là `dilam-online`.
- **`@dilam/shared` là gói chỉ có mã nguồn**: `exports` trỏ thẳng vào `src/index.ts`, không có bước build riêng. Vite (client), tsx (server dev), Vitest và esbuild (server build) đều tự biên dịch TypeScript. Nhờ vậy sửa luật chơi trong shared là client và server thấy ngay, không phải chạy watch riêng.
- **Server build bằng esbuild** (`apps/server/scripts/build.ts`): gộp `@dilam/*` vào một file `dist/index.js`, các gói npm khác (fastify, ws, zod) để ngoài và lấy từ `node_modules` lúc chạy. Không dùng tsup/tsdown vì hai công cụ này yêu cầu Node ≥ 22.18; esbuild đã có sẵn qua tsx.
- `moduleResolution: "Bundler"` cho cả ba gói (mọi đường chạy đều qua bundler hoặc tsx), nên import tương đối không cần đuôi `.js`.
- `typecheck` chạy `tsc --noEmit` trong từng workspace; `test` chạy `vitest run` trong từng workspace.
- Client có test cho logic thuần (`buildWsUrl`, `describeConnectionResult`), không test WebGL.

### Lint và định dạng

- `npm run lint` = ESLint (`strictTypeChecked` + `stylisticTypeChecked` của typescript-eslint, có thông tin kiểu) **và** `prettier --check`. `npm run format` để tự sửa định dạng.
- `AGENTS.md` và file lộ trình ở gốc repo không qua Prettier để giữ nguyên định dạng người viết.
- `.gitattributes` ép xuống dòng LF để Prettier không báo lỗi trên Windows.

### Chạy dev và mạng

- `npm run dev` chạy song song server (`tsx watch`) và client (Vite) bằng `concurrently`.
- Server mặc định nghe `127.0.0.1:3000`, Vite ở `5173` (`strictPort`). Vite chuyển tiếp `/api` và `/ws` sang server, nên client luôn gọi **cùng origin**: không cần CORS ở dev, và khi deploy sau một reverse proxy cũng không phải đổi code client.
- Muốn thử trên điện thoại cùng mạng LAN: chạy `npm run dev:client -- --host` (Vite mở ra mạng LAN, server vẫn chỉ nghe localhost vì đi qua proxy).
- **Một file `.env` ở gốc repo** dùng chung: server nạp bằng `process.loadEnvFile`, Vite đọc qua `envDir`. Chỉ biến có tiền tố `VITE_` mới lộ ra code client. Không có `.env` thì dùng mặc định trong `.env.example`.

### WebSocket

- Dùng thư viện **`ws` trực tiếp** ở chế độ `noServer`, gắn vào sự kiện `upgrade` của HTTP server Fastify (không dùng `@fastify/websocket`), đúng stack trong AGENTS.md. Đường dẫn khác `/ws` bị từ chối nâng cấp.
- Giới hạn kích thước: `maxPayload = 2048` byte (`MAX_CLIENT_MESSAGE_BYTES` trong shared). Vượt thì ws đóng kết nối với mã 1009.
- Giới hạn tần suất: xô token mỗi kết nối, gửi dồn tối đa 10 tin, hồi 5 tin/giây. Vượt thì server báo `rate_limited` một lần cho mỗi đợt và bỏ qua các tin thừa.
- Tin nhị phân bị từ chối (`bad_message`). Tắt `perMessageDeflate`.
- Chưa có kiểm tra `Origin`, heartbeat ping/pong và xác thực: để tới phase server nhiều người chơi (Phase 4).

### Tin thử kết nối (tạm thời, chỉ cho Phase 0)

`docs/PROTOCOL.md` để trống theo yêu cầu prompt; định dạng tin echo ghi tạm ở đây, schema zod nằm ở `packages/shared/src/protocol.ts`.

- Client → server: `{ "type": "echo", "text": string }`, `text` sau khi cắt khoảng trắng dài 1–200 ký tự, không được có trường thừa.
- Server → client: `{ "type": "echo", "text": string, "serverTime": number }`, `serverTime` là mili giây từ epoch (UTC); client tự đổi ra giờ địa phương.
- Lỗi: `{ "type": "error", "code": "bad_message" | "rate_limited" }`. Server chỉ gửi **mã lỗi**, câu tiếng Việt do client tra trong file chuỗi.

### Chuỗi hiển thị, log và ngôn ngữ

- Chuỗi hiển thị cho người chơi ở `apps/client/src/strings.ts`. `GAME_NAME` ở `packages/shared` vì server cũng dùng.
- Log server và thông báo lỗi nội bộ (không hiện cho người chơi) viết bằng tiếng Anh; comment trong code viết tiếng Việt.
- Log Fastify chỉ ghi method và đường dẫn (bỏ query string), không ghi IP, hostname, header hay nội dung tin WebSocket.

### Chưa làm trong Phase 0 (cố ý)

- **Chưa cài `better-sqlite3`**: Phase 0 chưa lưu dữ liệu. Sẽ thêm cùng lớp repository khi tới phần tài khoản và lưu trữ.
- **Chưa dùng font riêng**: dùng font hệ thống (`system-ui`…), hiển thị tốt tiếng Việt.
- Chưa có Origin check, heartbeat, xác thực WebSocket (xem trên).
- Server chưa phục vụ file tĩnh của client khi chạy bản build; sẽ làm ở phase deploy (Phase 7).

## Phase 1: engine 3D và nhân vật (2026-11-02)

### Engine

- **Vòng lặp bước cố định 60 Hz** (`engine/loop.ts`): logic chạy 1/60 s mỗi bước, tối đa 5 bước mỗi khung hình (máy quá chậm thì bỏ phần nợ thay vì dồn sang khung sau). Vị trí nhân vật được nội suy giữa hai bước nên vẫn mượt trên màn 120/144 Hz.
- **Tab bị ẩn** (`visibilitychange`): hủy `requestAnimationFrame`; khi hiện lại thì đặt lại đồng hồ để không có "bước nhảy" dài.
- **Mức chất lượng** thay đổi pixel ratio, bóng và số hạt bụi. Không đổi khử răng cưa (antialias), vì muốn đổi phải tạo lại WebGL context. Số liệu chi tiết ở `docs/PERF.md`.
- **Chế độ "Tự động"** chỉ tự _hạ_ mức, không tự nâng lại, để tránh nhảy qua lại liên tục. Người chơi chọn tay trong menu "Đồ họa"; lựa chọn này được lưu lại.
- **Dùng `PCFShadowMap`**: `PCFSoftShadowMap` đã bị bỏ ở three r187 (dùng sẽ ra cảnh báo console).
- **Một vật liệu dùng chung cho mỗi màn**: `MeshLambertMaterial` có màu đỉnh. Các khối nhỏ được gộp thành một geometry, màu ghi vào thuộc tính `color` của đỉnh, nên mỗi bộ phận chỉ tốn 1 draw call. Lambert rẻ hơn Standard và hợp phong cách dễ thương.
- **Giải phóng tài nguyên**: mỗi màn (`SceneController`) tự `dispose()`. Hàm `disposeObject3D` duyệt cả cảnh và giải phóng geometry, material, texture và shadow map của đèn. Đã kiểm tra bằng `renderer.info.memory`: đổi màn qua lại nhiều lần thì số geometry và texture không tăng.

### Nhân vật

- **Cao khoảng 1,2 m**, gồm 6 bộ phận chuyển động (đầu, thân, 2 tay, 2 chân). Mỗi bộ phận là một Group làm khớp xoay (cổ, vai, hông); tư thế được tính bằng hàm thuần `computePose`, không dùng xương.
- **Đổi tư thế mượt** bằng cách trộn dần (`blendPose`) về tư thế đích.
- **Chuyển tư thế trong văn phòng**: chỉ tự đổi giữa đứng và đi. Ngồi và gõ phím có thể thử ở màn tạo nhân vật; trong văn phòng sẽ gắn với hoạt động ở Phase 2.
- **4 màu da, 5 màu tóc, 4 kiểu tóc, 4 trang phục.** Prompt không nói số màu tóc nên chọn 5 (có một màu vui là tím khoai môn). Màu lưu theo _chỉ số_ trong danh sách, không lưu mã màu, để sau này chỉnh màu không làm hỏng dữ liệu cũ.
- **Danh sách họ và tên cho nút "Thỉnh tên"** nằm trong `strings.ts`, vì đây là chuỗi người chơi nhìn thấy. Tên có dạng "Họ + Tên"; phần tên có thể gồm tên đệm (ví dụ "Minh Anh").
- **Tên trên thẻ**: tối đa 24 ký tự, chuẩn hóa NFC, bỏ ký tự điều khiển, gộp khoảng trắng. Để trống thì tự thỉnh một tên. Chưa lọc từ cấm: AGENTS.md chỉ yêu cầu lọc _tên công ty_, phần đó làm ở Phase 6.

### Lưu trữ

- **Hồ sơ nhân vật** lưu trong localStorage, khóa `dilam.profile.v1` (có trường `version`); mức đồ họa lưu ở `dilam.quality.v1`. Khi đọc, dữ liệu được kiểm tra bằng zod; dữ liệu hỏng thì coi như chưa có.
- **Bị chặn lưu** (chế độ riêng tư, chặn cookie, hết dung lượng): game vẫn chơi được với dữ liệu trong bộ nhớ và báo cho người chơi biết nhân vật sẽ mất khi tải lại trang.
- **Đã có hồ sơ thì tải trang vào thẳng văn phòng.** Nút "Sửa thẻ" mở lại màn tạo nhân vật với lựa chọn cũ.
- Đây chỉ là lưu cục bộ. Từ Phase 4, server mới là nơi giữ dữ liệu chính.

### Thế giới và điều khiển

- **Phòng thử 14 × 10 m** (`world/roomLayout.ts`). Tường là mặt phẳng một phía quay vào trong, nên camera vòng ra ngoài thì nhìn xuyên được tường. Nhờ vậy không cần xử lý camera va chạm tường.
- **Va chạm**: hộp chữ nhật thẳng trục (AABB) trên mặt sàn, coi nhân vật như hình vuông có bán kính 0,28 m. Xét từng trục riêng để nhân vật trượt dọc theo mép vật cản.
- **Bấm hoặc chạm lên sàn**: tia chiếu được cắt với mặt phẳng sàn y = 0 (rẻ hơn raycast vào mesh). Đi thẳng nếu không vướng gì; vướng thì đi vòng qua các góc vật cản (đồ thị tầm nhìn + Dijkstra). Đích nằm trong vật cản thì dời ra mép gần nhất; bấm ra ngoài phòng thì bỏ qua.
- **Chạm, kéo và zoom**: nhấc tay trong vòng 8 px và 450 ms thì tính là chạm, ngoài ra là kéo. Kéo một ngón hoặc chuột (trái hoặc phải) để xoay camera; chụm hai ngón hoặc cuộn chuột để zoom.
- **Joystick ảo** hiện khi trình duyệt báo `(pointer: coarse)`, hoặc ngay lần chạm đầu tiên.
- **Giới hạn camera**: góc ngẩng 0,3–1,25 rad (khoảng 17°–72°), khoảng cách 3,5–11 m.
- **Phím di chuyển** không được nhận khi đang gõ vào ô nhập liệu, và được xóa hết khi cửa sổ mất focus.

### Khác

- **Bỏ nút "Thử kết nối" khỏi giao diện** vì Phase 1 không làm mạng. Mã kết nối (`net/`) và các chuỗi liên quan vẫn giữ lại để dùng ở Phase 4.
- **`?debug`** hiện số đo hiệu năng và mở `window.__dilam` cho kiểm thử tự động. Không có `?debug` thì không lộ gì ra `window`.
- **Kiểm thử E2E** chạy bằng Chrome headless qua DevTools Protocol, có giả lập cảm ứng. Kịch bản chưa được đưa vào repo (xem "Việc còn dở" trong báo cáo Phase 1).

## Phase 2A: văn phòng và âm thanh (2026-11-02)

### Tầng văn phòng

- **Bố cục là dữ liệu thuần** (`world/office/layout.ts`); vật cản và vật tương tác được _suy ra_ từ đó. Có test kiểm tra mọi chỗ đứng dùng vật đều đi tới được từ chỗ xuất hiện.
- **Kích thước tầng 26 × 18 m**, đồ đạc theo tỉ lệ nhân vật chibi cao ~1,2 m: bàn cao 0,43 m, ghế 0,27 m. Tường kính nhìn ra thành phố ở phía -Z.
- **Phân khu**:
  - 8 bàn open-space chia 2 dãy; mỗi bàn một màn hình hiện mã nguồn, bảng tính hoặc biểu đồ (họa tiết canvas; màn hình mã nguồn cuộn chậm).
  - Phòng họp kính có 6 ghế.
  - Pantry có máy pha cà phê, tủ lạnh và bàn tròn.
  - Khu nghỉ trưa có sofa 2 chỗ, bàn trà và thảm.
  - Máy in, tủ hồ sơ, 6 chậu cây, 3 bức tranh vẽ bằng khối màu.
- **InstancedMesh** cho đồ lặp lại (bàn, ghế, chậu cây, mặt màn hình theo từng loại); đồ chỉ có một cái gộp chung vào một mesh màu đỉnh.
- **Ghế không chặn đường** để dễ đi ngang và ngồi vào. Đổi lại, nhân vật có thể đi xuyên qua ghế.
- **Cảnh ngoài cửa kính đổi theo giờ thật** của máy người chơi: sáng 5:00–11:59, chiều 12:00–17:59, đêm 18:00–4:59. Kiểm tra lại mỗi phút. Ánh sáng trong phòng cũng đổi theo buổi.
- **`?time=morning|afternoon|night`** để ép buổi khi thử hoặc chụp ảnh.
- **Tranh treo tường** là mặt phẳng một phía (giống tường), để camera vòng ra sau tường không thấy tranh lơ lửng.

### Vật tương tác

- **Mỗi vật có**:
  - chỗ đứng dùng vật (luôn nằm ngoài vật cản);
  - hướng quay mặt khi dùng;
  - chỗ ngồi, nếu là ghế;
  - hộp 3D để bấm hoặc chạm thẳng vào đồ vật.
- **Hai cách dùng vật**:
  - lại gần (trong 1,4 m) thì hiện nút "Chạm để dùng · tên vật"; bấm nút hoặc nhấn phím E;
  - bấm hoặc chạm thẳng vào đồ vật: nhân vật tự đi tới (vòng tránh vật cản như khi bấm lên sàn) rồi dùng.
- **Ngồi**: ở bàn làm việc thì tư thế gõ phím, kèm tiếng bàn phím ngẫu nhiên; ở ghế họp và sofa thì tư thế ngồi. Camera chuyển sang góc gần qua vai. Khi đang ngồi vẫn kéo để xoay và cuộn hoặc chụm hai ngón để zoom được, theo giới hạn riêng (`SEATED_CAMERA_LIMITS`): lại gần tới 1,6 m, lùi xa tới 14 m để ngắm toàn tầng. Đứng dậy thì camera về khoảng cách lúc đi lại. Đứng dậy bằng nút "Đứng dậy", phím E, bất kỳ phím di chuyển nào, hoặc bấm chỗ khác.
- **Một ghế một người** (`SeatRegistry`, dùng chung với NPC). Chỗ có người ngồi thì báo "<tên> đang ngồi chỗ này rồi".
- **Dùng vật chỉ có phản hồi tại chỗ** (lời nhắn và âm thanh), **chưa cộng XP hay xu**. Điểm do server tính, làm ở các phase sau.

### NPC

- **3 đồng nghiệp cố định**, tên và diện mạo sinh từ hạt giống nên tải lại trang vẫn là những người đó. Mỗi người có bàn riêng (`desk-1`, `desk-4`, `desk-6`); 5 bàn còn lại để người chơi ngồi.
- **Máy trạng thái**: làm việc 25–45 giây, rồi chọn đi pha cà phê (40%), đi họp (30%) hoặc đi dạo (30%), xong lại về làm việc. Mỗi trạng thái có hai pha "đang đi tới" và "đang làm", tương ứng với câu trong bong bóng.
- **NPC không va chạm với người chơi** và đi theo đường tìm sẵn. Nếu chỗ ngồi họ định tới đã có người thì chuyển sang đi dạo.
- **Bong bóng là phần tử DOM** (chữ tiếng Việt sắc nét, không tốn draw call). Bong bóng bị ẩn khi ở sau camera, xa quá 16 m, hoặc lọt vào vùng thanh trên cùng của HUD.

### Âm thanh (`audio/`)

- **Mọi âm thanh sinh bằng Web Audio**, không dùng file:
  - điều hòa: nhiễu trắng qua hai tầng lọc thấp, có dao động rất chậm;
  - bàn phím: nhiễu ngắn qua bộ lọc dải;
  - "ting": hai sóng sin tắt dần;
  - máy in: sóng răng cưa trầm theo nhịp in, rồi tiếng giấy trượt ra;
  - cà phê: máy xay, nước chảy, rồi tiếng ly chạm.
- **Nhạc lofi**:
  - sinh từ tên văn phòng (băm FNV-1a rồi làm hạt giống cho mulberry32): cùng tên thì cùng bài;
  - giai điệu thuộc thang ngũ cung trưởng, 70–81 BPM, vòng 8 ô nhịp; 4 ô sau lặp lại 4 ô đầu và kết về nốt gốc;
  - có hợp âm nền, kick, hi-hat, swing nhẹ, và bộ lọc thấp cho tiếng mềm.
- **AudioContext chỉ được tạo trong lần chạm hoặc bấm phím đầu tiên** (chính sách autoplay), nên không có cảnh báo console.
- **Tắt âm thanh, hoặc tab bị ẩn**: gọi `AudioContext.suspend()` và dừng bộ lên lịch nhạc. Bật lại hoặc hiện tab lại thì `resume()`.
- **Không rò bộ nhớ**: mỗi nốt hoặc tiếng động tự ngắt kết nối khi kết thúc (`onended`); số giọng đang phát xem được qua `?debug`.
- **Lưu cài đặt** bật/tắt và âm lượng trong `dilam.audio.v1`. Âm lượng theo thang bình phương cho dễ chỉnh.

### Hướng dẫn lần đầu

- **4 thẻ**: chào mừng; đi lại (máy tính và cảm ứng có nội dung khác nhau); chạm để dùng; đồng nghiệp và âm thanh.
- Xem hết hoặc bấm "Bỏ qua" thì lưu `dilam.coach.v1` và không hiện lại.

### Khác

- Phòng thử Phase 1 (`world/roomLayout.ts`, `world/room.ts`) vẫn giữ vì test tìm đường đang dùng, nhưng game không còn dùng phòng này.
- Màn cảm ứng: nút "Chạm để dùng" đặt bên phải để không đè lên cần gạt; thanh trên cùng được thu gọn ở màn hẹp.

## Phase 2B: các hoạt động (2026-11-02)

### Cấu trúc

- **Mỗi hoạt động là một thư mục riêng** trong `apps/client/src/activities/` (`checkIn`, `focusTyping`, `fortune`, `taskFlip`, `ventWall`, `coffee`). Thư mục gồm logic thuần có test và giao diện riêng. `officeActivities.ts` chỉ nối vật trong văn phòng với hoạt động tương ứng.
- **Bus sự kiện** (`activities/events.ts`): mọi hoạt động phát `{type, startedAt, durationMs, detail}`. `startedAt` là mili giây từ epoch (UTC); `durationMs` là số nguyên không âm. Kiểu `detail` được khai báo chặt theo từng loại.
- **8 loại sự kiện**: `checkin`, `focus-typing`, `kpi-fortune`, `task-flip`, `vent`, `coffee-brew`, `coffee-gift`, `coffee-drink`.
- **Chưa tính XP.** Sự kiện chỉ được ghi lại: trong bộ nhớ, và trong localStorage `dilam.events.v1` (tối đa 300 sự kiện gần nhất). Khi đọc lại, dữ liệu được kiểm tra bằng zod.
- **Trang debug `events.html`** (trang thứ hai của Vite): bảng sự kiện, lọc theo loại, xoá nhật ký. Trang tự cập nhật khi tab văn phòng phát thêm sự kiện (qua sự kiện `storage`). Ở `?debug` có link "Nhật ký sự kiện".
- **Nội dung tự viết** nằm trong `apps/client/src/data/`: `kinh-cong-so.ts` (45 dòng), `kpi-fortunes.ts` (60 quẻ), `micro-tasks.ts` (30 việc nhỏ). Đây là _nội dung trò chơi_, nên được tách khỏi `strings.ts` (chỉ chứa nhãn giao diện), theo đúng yêu cầu của prompt 2B.
- **Mã nhân viên** `NV-XXXXXX` sinh ngẫu nhiên (crypto) và lưu trong `dilam.player.v1`. Mã dùng để chọn quẻ theo người và in trên thẻ. Phase 4 sẽ thay bằng mã do server cấp.

### Vật mới trong văn phòng

- **Cổng vào có máy quẹt thẻ** cạnh cửa trên tường trước. Chỗ xuất hiện chuyển ra ngay trong cửa (-2.5, 7.3).
- **Kệ ống quẻ KPI** sát tường trái.
- **Bảng việc** (lật task) trên tường phải.
- **Tường than thở** (bảng ghim) trên tường trước.
- Tất cả là mặt phẳng một phía (giống tường) hoặc khối gộp trong mesh tĩnh, nên không tăng draw call.

### Quy tắc ngày và chuỗi chấm công (đổi múi giờ)

- **"Một ngày" là ngày lịch ở múi giờ hiện tại của máy, tại lúc quẹt thẻ.** Ngày được lưu dạng khoá `YYYY-MM-DD` (`dayKey`), không lưu mili giây. Khoảng cách giữa hai ngày tính bằng UTC từ các thành phần năm-tháng-ngày (`daysBetween`), nên không bị ảnh hưởng bởi giờ mùa hè.
- **Cách lần chấm trước đúng 1 ngày lịch**: chuỗi +1. **Cách từ 2 ngày trở lên**: chuỗi về 1. Tổng số ngày luôn +1 mỗi lần chấm thành công.
- **Cùng ngày, hoặc ngày lịch hiện tại đứng trước lần chấm trước** (vừa đổi sang múi giờ chậm hơn, ví dụ bay từ Việt Nam sang Mỹ): coi như _đã chấm_, không đổi gì. Vì vậy đổi múi giờ không thể làm mất chuỗi hay chấm hai lần trong cùng một ngày lịch.
- **Đổi sang múi giờ nhanh hơn có thể sang ngày mới sớm hơn vài giờ.** Đây là chấp nhận được với chấm công chỉ lưu trên máy. Ở Phase 4, server sẽ là nguồn sự thật cho chuỗi ngày (AGENTS.md) và có thể dùng múi giờ cố định của tài khoản.
- **Kiểm tra**: test vitest (VN, LA, Tokyo, nửa đêm địa phương, ngày đổi giờ mùa hè) và E2E đổi múi giờ thật trong Chrome (LA, Tokyo, Pago Pago UTC−11, Kiritimati UTC+14).
- **Quẻ KPI dùng cùng khoá ngày**: `hash("kpi|ngày|mã NV") % 60`, nên cả ngày không đổi. Xin lại trong ngày thì hiện lại quẻ cũ và phát sự kiện với `repeat: true`.

### Gõ phím tập trung

- **Chỉ mở được khi đang ngồi ở bàn làm việc** (nút "Gõ phím tập trung"). Chọn 1, 3 hoặc 5 phút.
- **Trong lúc gõ, mọi phím bị cửa sổ "Kinh công sở" bắt lại** (pha capture), nên WASD hay E không làm nhân vật đứng dậy. Esc hoặc nút "Dừng" để kết thúc sớm. Trên màn cảm ứng thì chạm vào ô gõ.
- **Chống gian lận cơ bản**: hai lần gõ được tính phải cách nhau ít nhất 120 ms (khoảng 8 phím/giây). Gõ nhanh hơn vẫn có tiếng nhưng không được tính, kèm lời nhắc. Phím giữ lặp (`repeat`) không tính.
- **Mỗi lần gõ được tính = một dòng kinh công sở mới**; thứ tự các dòng xáo theo hạt giống của phiên.
- **Hết giờ hoặc dừng thì có màn tổng kết** (thời gian, số lần gõ, số phím được tính, số dòng) và sự kiện `focus-typing`.

### Tường than thở

- **Một dòng, tối đa 120 ký tự.** Dài hơn thì _chặn_ kèm thông báo, không cắt ngầm. Xuống dòng và khoảng trắng thừa được gộp.
- **Mặc định ẩn danh.** Nếu bỏ chọn thì ghi tên trên thẻ.
- **Chỉ lưu trên máy** (`dilam.vent.v1`, 50 dòng gần nhất).
- **Sự kiện `vent` chỉ chứa độ dài và lựa chọn ẩn danh, không chứa nội dung.**
- Chưa có tường chung và chưa lọc nội dung; lộ trình yêu cầu có bộ lọc trước khi mở tường chung.

### Pha cà phê

- **Chạm máy pha** → chờ 3,5 giây (có âm thanh) → cầm 1 ly (ô trạng thái góc phải, có nút "Uống luôn"). Đang pha hoặc đang cầm ly thì không pha thêm.
- **Đứng cách NPC dưới 1,6 m** thì nút gợi ý đổi thành "Tặng cà phê cho <tên>". NPC đáp "Cảm ơn nha!" trong bong bóng 4 giây.

### Khác

- **Khi đang mở hộp thoại hoạt động**, cảnh 3D bị khoá điều khiển (không đi, không chạm vật, không nhận phím E). Esc, nút ×, hoặc bấm ra nền mờ để đóng.
- **Lật task**: mỗi lượt chia 3 lá (việc nhỏ khác nhau), chỉ lật được 1 lá. Đánh dấu "Đã xong!" thì phát `task-flip` với `completed: true`. Đóng khi đã lật mà chưa xong thì phát `completed: false`.

## Phase 3: cấp độ, chức danh, nhiệm vụ

- **Cấp 1–500 tự tăng theo XP; 10 chức danh qua kỳ đánh giá 7 ngày + phỏng vấn.** Hai hệ thống tách nhau. Bảng cấp cũ (10 cấp) trong GAME_DESIGN được thay.
- **Mở công ty cần cấp 150 và không còn thuộc công ty nào.** Đường cong tính để chơi đều 190 XP/ngày trong 5 ngày thì vừa 950 XP (cấp 150); tới cấp 500 mất khoảng 150 ngày.
- **Việc sếp giao**: ngẫu nhiên theo hạt giống (ngày, mã người chơi, thứ tự) để server tái tạo được; tối đa 3 mỗi ngày; không giao việc đã không làm được trong ngày (quẻ đã xin, đã chấm công).
- **Ngày lịch lùi lại (đổi múi giờ)** không mở "rổ" XP ngày mới, tránh nhận giới hạn hai lần.
- **Phase 3 tính XP ở client** (`ProgressService`, lưu localStorage, mã lưu `DLO.<v>.<base64url>.<crc32>` để chuyển máy). Checksum chỉ chống chép sai, không phải bảo mật; Phase 4 chuyển cùng các hàm thuần lên server và không tin client.
- **Công ty**: 1 công ty = 1 tầng = 1 server, tối đa 30 mỗi toà (Phase 4/6). Phase này chỉ có hằng số và `canOpenCompany`/`buildingHasRoom`; rời và mở công ty làm ở Phase 6.
- **Tua ngày chỉ có ở `npm run dev`** (`clock.ts`, bảng dev); bản build không có.

### Đổi hệ chức danh (sau Phase 3)

- **Chức danh tự lên theo cấp** theo yêu cầu người chơi thử: 13 bậc, vài cấp một bậc, bậc cuối "Senior" ở cấp 150 = điều kiện cấp để mở công ty. Bỏ kỳ đánh giá 7 ngày và phỏng vấn (trước đây chức danh tụt xa sau cấp).
- **Tiến độ phiên bản 3**: bỏ `title`, `review`, `personality`; thêm `coins`, `reputation`. Migrate v2 → v3 chuyển số lần giúp trong kỳ thành uy tín.
- **Xu tính cùng XP** trong `applyEvent` (đưa sớm phần xu của Phase 5A để không phải đổi phiên bản dữ liệu lần nữa).
