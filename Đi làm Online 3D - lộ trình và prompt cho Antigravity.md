# Đi làm Online 3D - lộ trình và prompt cho Antigravity

Nov 2, 2026 · @Trần Hữu Tài

## Tổng quan

Mục tiêu là một game "đi làm" 3D chạy trên trình duyệt, nhiều người chơi thật, có thăng tiến từ thực tập sinh đến mở công ty. Bộ khung kỹ thuật học theo niemphat.online (Three.js dựng bằng thủ tục, WebSocket, tài khoản bằng token), còn nội dung và hình ảnh hoàn toàn là của bạn.

**Nguyên tắc làm việc với agent**

- Mỗi phase kết thúc bằng một bản chạy được, không viết hết rồi mới chạy thử.
- Một prompt một việc, mỗi prompt có tiêu chí nghiệm thu đo được.
- Mọi thứ dựng bằng code: hình khối 3D, họa tiết vẽ canvas, âm thanh Web Audio. Không dùng file mô hình, ảnh hay mp3, nên trang nhẹ và không vướng bản quyền.
- Server là nguồn sự thật cho XP, xu và cấp bậc. Client chỉ gửi hành động, không tự cộng điểm.
- Xu chỉ là điểm trong game: không tiền thật, không mua bán, không cá cược.

**Điều không làm**

- Không sao chép code, văn bản, tên thiền phái hay thiết kế từ niemphat.online và nhanso.vn. Mình chỉ đọc phần code client công khai của hai trang để hiểu cách chúng chạy, chưa thấy code server của trang nào.
- Không dùng tên công ty hay thương hiệu thật cho công ty trong game.
- Tường than thở công khai phải có lọc nội dung trước khi bật.

**Giả định**: bạn làm một mình cùng agent, dùng TypeScript, có thể thuê một VPS nhỏ. Nếu khác, đổi phần Kiến trúc.

## Kiến trúc và stack

&#91;embedded content: kiến trúc · client, server, shared\]

Client vẽ cảnh và gửi hành động qua REST và WebSocket. Server kiểm tra, tính XP và xu bằng luật trong `packages/shared`, rồi lưu vào SQLite.

- **Three.js + Vite, không framework UI:** nhẹ, toàn bộ cảnh dựng bằng code, HUD bằng HTML/CSS thuần.
- **Fastify + ws:** REST cho tài khoản và dữ liệu, WebSocket cho đồng bộ thời gian thực.
- **SQLite trước, Postgres sau:** đủ cho vài trăm người chơi, tách lớp repository để đổi DB không phải viết lại logic.
- **TypeScript và zod ở mọi nơi:** kiểu dữ liệu gói tin nằm ở `shared`, mọi gói tin vào server đều được kiểm tra.
- **vitest:** kiểm tra luật chơi, giao dịch xu và giao thức, không kiểm tra WebGL.

## Cấu trúc thư mục

Một monorepo ba phần: `shared` giữ luật chơi dùng chung để client và server không lệch nhau, `client` là game 3D, `server` giữ trạng thái và lưu dữ liệu.

```text
dilam-online/
  AGENTS.md                 quy tắc nền cho agent (Prompt 0)
  package.json              npm workspaces
  docs/
    GAME_DESIGN.md          cấp bậc, XP, kinh tế, sự kiện
    PROTOCOL.md             các gói tin WebSocket
  packages/
    shared/src/
      levels.ts             10 cấp, mốc XP, mở khóa
      rules.ts              công thức XP, giới hạn mỗi ngày
      protocol.ts           kiểu dữ liệu gói tin client <-> server
  apps/
    client/src/             Vite + TypeScript + Three.js
      main.ts
      engine/               renderer, camera, vòng lặp, điều khiển
      avatar/               nhân vật chibi, tư thế, trang phục
      world/                văn phòng, đồ vật, NPC
      activities/           chấm công, gõ phím, xin quẻ, lật task...
      audio/                Web Audio: âm thanh và nhạc nền
      ui/                   HUD, cửa sổ, hướng dẫn
      net/                  WebSocket, đồng bộ
    server/src/             Node + Fastify + ws
      index.ts
      db/                   SQLite (bản đầu), schema, migration
      game/                 xử lý hành động, tính XP, kỳ đánh giá
      rooms/                phòng, giới hạn người, broadcast
```

## Lộ trình

Dự án chia thành 8 phase với bốn cổng nghiệm thu; qua mỗi cổng bạn có một bản chơi được và nên commit lại trước khi sang phase sau.

&#91;embedded content: lộ trình · 8 phase, 4 cổng nghiệm thu\]

Thời gian dưới đây là ước lượng thô cho một người làm cùng agent, phụ thuộc nhiều vào số giờ bạn dành mỗi tuần. Tổng khoảng 3 đến 4 tháng.

| Phase | Số prompt | Ước lượng | Rủi ro chính |
| --- | --- | --- | --- |
| 0 Khởi tạo | 1 | 1-2 ngày | Phiên bản công cụ lệch nhau |
| 1 Engine và nhân vật | 1 | 1 tuần | Hiệu năng trên điện thoại |
| 2 Văn phòng và hoạt động | 2 | 2 tuần | Số draw call phình lên |
| 3 Thăng tiến | 1 | 1 tuần | Cân bằng XP |
| 4 Server và nhiều người | 3 | 2-3 tuần | Đồng bộ và chống gian lận |
| 5 Kinh tế và sự kiện | 2 | 2 tuần | Giao dịch xu, kiểm duyệt tường chung |
| 6 Mở công ty | 2 | 2-3 tuần | Tài khoản phụ lạm dụng, cân bằng dài hạn |
| 7 Tối ưu và deploy | 1 | 1-2 tuần | Rò rỉ bộ nhớ, yêu cầu pháp lý khi mở công khai |

## Prompt 0: quy tắc nền (AGENTS.md)

Dán nội dung dưới đây vào file AGENTS.md ở gốc repo. Nếu Antigravity có mục quy tắc (rules) cho workspace, dán thêm vào đó để agent nào cũng đọc được. Làm bước này trước mọi prompt khác.

```text
# Dự án: Đi làm Online (game văn phòng 3D nhiều người chơi, chạy trên trình duyệt)

## Mô tả
Người chơi tạo nhân vật nhân viên, làm các hoạt động trong văn phòng 3D (chấm công, gõ phím tập trung, xin quẻ KPI, lật task...), thăng chức từ Thực tập sinh đến Tổng giám đốc, rồi mở công ty riêng. Phong cách: dễ thương, hài nhẹ về đời công sở, thân thiện, không bạo lực.

## Stack bắt buộc
- Ngôn ngữ: TypeScript strict ở mọi nơi.
- Monorepo npm workspaces: packages/shared, apps/client, apps/server.
- Client: Vite + Three.js (bản cố định trong package.json), không dùng framework UI nặng. UI HUD bằng HTML/CSS thuần hoặc lit nhỏ.
- Server: Node 20+, Fastify (REST) + thư viện ws (WebSocket). Lưu dữ liệu bằng SQLite (better-sqlite3), tách lớp truy cập DB để sau này đổi sang Postgres.
- Test: vitest cho shared và server. Với client, test logic thuần (không test WebGL).

## Nguyên tắc thiết kế
1. KHÔNG dùng file mô hình 3D (glb, fbx, obj), ảnh, hay file âm thanh. Hình khối dựng bằng code (hình học Three.js, LatheGeometry, ExtrudeGeometry, gộp mesh), họa tiết vẽ bằng canvas, âm thanh và nhạc nền sinh bằng Web Audio. Ngoại lệ duy nhất: font chữ.
2. Gộp hình học và dùng chung vật liệu để máy yếu vẫn chạy. Mục tiêu 30fps trên điện thoại tầm trung, giới hạn draw call (ghi số đo vào docs khi tối ưu).
3. Server là nguồn sự thật cho XP, xu, cấp bậc, chuỗi ngày. Client chỉ gửi hành động, server kiểm tra và tính điểm. Không bao giờ tin số liệu từ client.
4. Luật chơi (cấp bậc, công thức XP, giới hạn mỗi ngày) nằm trong packages/shared và dùng chung cho client và server.
5. Mọi chuỗi hiển thị cho người chơi bằng tiếng Việt, đặt trong một file chuỗi riêng, không viết cứng rải rác trong code.
6. Không có tiền thật, không mua bán, không cá cược. Xu chỉ là điểm trong game.
7. Không dùng tên công ty hay thương hiệu có thật. Tên công ty người chơi đặt phải qua bộ lọc từ cấm.
8. Không sao chép code, văn bản hay thiết kế từ các dự án khác. Viết lại từ đầu.

## Cách làm việc
- Làm đúng phạm vi của prompt hiện tại. Không làm trước tính năng của phase sau.
- Trước khi viết code, đọc docs/GAME_DESIGN.md và docs/PROTOCOL.md nếu có.
- Sau mỗi thay đổi lớn: chạy typecheck, lint, test và cho phép khởi động dự án được (npm run dev).
- Mỗi prompt kết thúc bằng: danh sách file đã tạo hoặc sửa, cách chạy thử, các tiêu chí nghiệm thu đã đạt hay chưa, và việc còn dở.
- Nếu thiếu thông tin, chọn mặc định hợp lý, ghi giả định vào docs/DECISIONS.md rồi làm tiếp, đừng dừng lại hỏi trừ khi thật sự bế tắc.
- Commit nhỏ, thông điệp rõ ràng.

## Chất lượng và bảo mật
- Kiểm tra mọi dữ liệu nhận từ WebSocket bằng schema (zod), giới hạn kích thước và tần suất gửi.
- Không ghi log dữ liệu cá nhân. Token chỉ lưu dạng băm ở server.
- Dọn dẹp tài nguyên Three.js (dispose) khi bỏ đối tượng.
```

## Phase 0: khởi tạo dự án

Kết quả: repo chạy được bằng một lệnh, client và server nói chuyện được với nhau, tài liệu thiết kế nằm trong repo để các prompt sau tham chiếu.

```text
Đọc AGENTS.md. Hãy dựng khung dự án "Đi làm Online" theo đúng cấu trúc monorepo trong AGENTS.md.

YÊU CẦU
1. npm workspaces với packages/shared, apps/client, apps/server. TypeScript strict, tsconfig gốc dùng chung, ESLint + Prettier, .gitignore, .env.example.
2. Script ở gốc: dev (chạy cả client và server), build, test, lint, typecheck.
3. packages/shared: xuất một hằng số GAME_NAME và một hàm có test vitest, để chứng minh client và server import được cùng một gói.
4. apps/client: trang Vite hiển thị canvas Three.js với một khối lập phương xoay và dòng chữ "Đi làm Online". Có nút "Thử kết nối".
5. apps/server: Fastify với GET /api/health trả {ok:true}, và WebSocket ở /ws: nhận một tin, trả lại tin đó kèm giờ server. Dùng zod kiểm tra tin nhận vào.
6. Nút "Thử kết nối" ở client mở WebSocket tới server, gửi một tin, hiện phản hồi trên màn hình.
7. Tạo docs/GAME_DESIGN.md với nội dung ở phần THIẾT KẾ bên dưới, và docs/PROTOCOL.md rỗng có tiêu đề.

THIẾT KẾ (chép vào docs/GAME_DESIGN.md)
Cấp bậc và XP cần: 1 Thực tập sinh 0; 2 Thử việc 300; 3 Nhân viên chính thức 900; 4 Chuyên viên 2000; 5 Chuyên viên cao cấp 3500; 6 Trưởng nhóm 5500; 7 Trưởng phòng 8000; 8 Giám đốc bộ phận 11500; 9 Giám đốc điều hành 16000; 10 Tổng giám đốc 22000.
Từ cấp 5 chọn nhánh Chuyên môn hoặc Quản lý. Từ cấp 8 được mở công ty riêng.
Nguồn XP: chấm công mỗi ngày (chuỗi ngày tăng thưởng), phiên gõ phím tập trung 1/3/5 phút, tick xong task, tụng kinh công sở, pha cà phê tặng đồng nghiệp, công quả (lau bàn, tưới cây), nhiệm vụ ngày, xử lý sự kiện. Mỗi ngày có giới hạn XP, vượt mức chỉ nhận một phần.
Thăng chức: đủ XP chưa lên ngay; mỗi "quý" (khoảng 1 tuần chơi) có kỳ đánh giá gồm điều kiện cứng và một mini-game tình huống. Chưa đạt thì không mất cấp.
Tiền tệ: XP quyết định cấp; xu là lương ảo mua đồ; uy tín tăng khi giúp đồng nghiệp, cần từ cấp 6.
Hoạt động: chấm công, gõ phím, kinh công sở (mỗi tiếng gõ ra một dòng mail mẫu), xin quẻ KPI mỗi ngày một lần, lật 1 trong 3 task, tường than thở ẩn danh, cà phê, công quả, thú cưng văn phòng, sự kiện sếp đi ngang.
Phòng ban có buff riêng: Dev, Sales, Marketing, Kế toán, HR.

NGHIỆM THU
- npm install rồi npm run dev chạy được cả hai phía.
- Mở trang thấy khối lập phương xoay; bấm "Thử kết nối" thấy phản hồi từ server.
- GET /api/health trả ok.
- npm run typecheck, lint, test đều qua.
- Báo cáo cuối: cây thư mục, lệnh chạy, giả định đã chọn (ghi vào docs/DECISIONS.md).
```

## Phase 1: engine 3D và nhân vật

Kết quả: tạo được nhân vật chibi, đi lại trong một căn phòng thử bằng chuột, bàn phím hoặc cảm ứng, camera theo sau mượt.

```text
Đọc AGENTS.md và docs/GAME_DESIGN.md. Làm Phase 1 trong apps/client. Chưa làm mạng, chưa làm hoạt động.

YÊU CẦU
1. engine/: renderer Three.js (giới hạn pixel ratio 2), xử lý resize, vòng lặp bước thời gian cố định, tự tạm dừng khi tab ẩn (visibilitychange). Có 3 mức chất lượng (thấp/vừa/cao: bóng, độ phân giải, số hiệu ứng) và tự hạ mức khi fps thấp kéo dài.
2. avatar/: nhân vật chibi dựng hoàn toàn bằng code (LatheGeometry, hình cầu, hình trụ, gộp mesh, dùng chung vật liệu). Tùy chỉnh: 4 màu da, 4 kiểu tóc (ngắn, búi, dài, đuôi ngựa) kèm màu tóc, 4 trang phục (sơ mi trắng, vest, hoodie, áo len). Tư thế: đứng, đi, ngồi, gõ phím, làm bằng cách xoay và dịch các bộ phận, không dùng xương.
3. Màn tạo nhân vật "Làm thẻ nhân viên": xem trước 3D xoay được, ô nhập tên, nút "Thỉnh tên" random (họ + tên Việt phổ biến), chọn da/tóc/áo, nút Vào văn phòng. Lưu lựa chọn trong localStorage, có xử lý khi bị chặn lưu.
4. world/: một phòng thử có sàn lát vẽ bằng canvas, tường, vài khối làm vật cản. Va chạm đơn giản bằng hộp (AABB).
5. Điều khiển: chạm hoặc bấm chuột lên sàn để đi tới điểm đó (raycast + tìm đường thẳng có né vật cản), WASD/phím mũi tên trên máy tính, joystick ảo trên cảm ứng. Camera góc nhìn thứ ba theo nhân vật, kéo để xoay, véo hoặc cuộn để zoom, giới hạn góc.
6. Phần logic thuần (tạo tên, tính chuyển động, va chạm) tách thành hàm có test vitest.

NGHIỆM THU
- Tạo nhân vật, bấm Vào văn phòng, đi lại được bằng cả ba kiểu điều khiển (kiểm tra bằng giả lập cảm ứng của trình duyệt).
- Tải lại trang vẫn giữ nhân vật.
- Không lỗi console. Đóng cảnh thì giải phóng geometry, material, texture.
- Ghi vào docs/PERF.md: số draw call, fps trên máy hiện tại ở từng mức chất lượng.
- Báo cáo cuối theo mẫu trong AGENTS.md.
```

## Phase 2: văn phòng 3D và hoạt động

Kết quả: một tầng văn phòng đầy đủ đồ vật, có âm thanh, và các hoạt động chơi được một mình. Chia hai prompt để agent không làm quá tay một lần. Ở phase này hoạt động chỉ phát ra sự kiện, chưa tính XP.

**Prompt 2A: văn phòng và âm thanh**

```text
Đọc AGENTS.md và docs/GAME_DESIGN.md. Làm Phase 2A trong apps/client.

YÊU CẦU
1. world/office: một tầng văn phòng dựng bằng thủ tục: khu bàn làm việc open-space (bàn, ghế, màn hình có texture canvas hiển thị mã hoặc bảng tính giả), cửa sổ lớn nhìn ra thành phố (shader hoặc texture canvas, đổi theo giờ thật: sáng, chiều, đêm), pantry có máy pha cà phê và tủ lạnh, máy in, cây cảnh, khu nghỉ trưa có sofa, phòng họp kính. Gộp hình học và dùng InstancedMesh cho đồ lặp lại.
2. Hệ thống vật thể tương tác: mỗi vật có vùng chạm, khi nhân vật lại gần hiện gợi ý "Chạm để dùng". Ngồi xuống ghế thì nhân vật chuyển sang tư thế ngồi và gõ phím, camera đổi góc nhìn gần.
3. 3 NPC đồng nghiệp đi lại, ngồi, pha cà phê theo lịch đơn giản (máy trạng thái), có bong bóng trạng thái như "đang họp", "đi pha cà phê".
4. audio/: âm thanh tự sinh bằng Web Audio, không file: tiếng điều hòa (nhiễu lọc), tiếng bàn phím, tiếng ting thông báo, tiếng máy in, tiếng ly cà phê. Có nhạc nền lofi nhẹ sinh theo thang ngũ cung, giai điệu sinh từ tên văn phòng. Âm thanh chỉ bật sau lần chạm đầu tiên của người dùng (chính sách autoplay), có nút bật/tắt và thanh âm lượng, nhớ cài đặt.
5. Hướng dẫn lần đầu bằng vài thẻ ngắn (coach marks), bỏ qua được.

NGHIỆM THU
- Đi quanh toàn tầng, ngồi vào bàn, chạm từng vật tương tác.
- fps ghi vào docs/PERF.md ở 3 mức chất lượng; draw call dưới 150 ở mức vừa.
- Không tải file âm thanh hay mô hình nào (kiểm tra tab Network).
- Âm thanh dừng khi tab ẩn, không tràn bộ nhớ khi để chạy 10 phút.
```

**Prompt 2B: các hoạt động**

```text
Làm Phase 2B trong apps/client/src/activities. Mỗi hoạt động là một module độc lập, phát ra sự kiện kiểu {type, startedAt, durationMs, detail} qua một bus sự kiện. CHƯA tính XP ở phase này.

YÊU CẦU
1. Chấm công: quẹt thẻ ở cổng vào, mỗi ngày một lần (theo giờ địa phương), có chuỗi ngày liên tiếp, hiển thị bằng thẻ nhân viên.
2. Gõ phím tập trung: ngồi vào bàn, chọn 1/3/5 phút. Mỗi lần bấm phím (hoặc chạm) có tiếng gõ, nhân vật gõ, và hiện thêm một dòng vào cửa sổ "kinh công sở". Tự viết ít nhất 40 dòng mẫu thư công sở hài, KHÔNG sao chép từ nguồn nào (ví dụ giọng "Dạ em chào anh chị... nhờ anh chị check giúp em..."). Lưu vào data/kinh-cong-so.ts. Hết giờ thì có màn tổng kết (số phím, số dòng). Chống gian lận cơ bản: giới hạn tốc độ gõ có thể tính điểm.
3. Xin quẻ KPI: mỗi ngày một quẻ, chọn theo ngày và mã người chơi nên cả ngày không đổi. 60 quẻ tự viết, mỗi quẻ có 4 khía cạnh (Công việc, Lương, Đồng nghiệp, Sức khỏe) và một lời khuyên hài nhẹ, không phán xét, không đưa lời khuyên y tế hay tài chính thật. Animation lắc ống quẻ.
4. Lật 1 trong 3 task: ba lá bài úp, lật ra một việc nhỏ có thể làm ngay (uống nước, dọn bàn, trả lời một email), có thể đánh dấu hoàn thành.
5. Tường than thở: viết một dòng, chọn ẩn danh, lưu trên máy (localStorage). Chặn nội dung quá dài. Chưa có tường chung.
6. Pha cà phê: chạm máy ở pantry, chờ vài giây, nhận ly cà phê có thể tặng NPC.

NGHIỆM THU
- Mỗi hoạt động chơi trọn vòng và phát đúng sự kiện (có test vitest cho phần logic thuần như chọn quẻ theo ngày, chuỗi ngày).
- Đổi múi giờ giả lập không làm hỏng chuỗi ngày (ghi quy tắc vào docs/DECISIONS.md).
- Có màn hình xem lại các sự kiện đã phát (trang debug) để phase sau dùng.
```

## Phase 3: thăng tiến và lưu tiến độ

Kết quả: chơi một mình mà đã có vòng lặp đầy đủ từ cấp 1 đến cấp 8: kiếm XP, vào kỳ đánh giá, lên chức. Luật nằm trong `packages/shared` để Phase 4 chuyển sang server mà không viết lại. Các con số dưới đây là giá trị khởi điểm, cần chỉnh sau khi chơi thử.

```text
Đọc AGENTS.md và docs/GAME_DESIGN.md. Làm Phase 3. Luật chơi viết trong packages/shared, giao diện trong apps/client.

YÊU CẦU
1. packages/shared/levels.ts: 10 cấp theo bảng trong GAME_DESIGN, mỗi cấp có chức danh, XP cần, mở khóa. Từ cấp 5 có hai nhánh (Chuyên môn, Quản lý) với chức danh khác nhau ở cấp 6-10.
2. packages/shared/rules.ts: hàm thuần tính XP từ một sự kiện hoạt động. Giá trị khởi điểm: chấm công 20 + 5 x min(chuỗi, 7); gõ phím tập trung 1 phút 10, 3 phút 35, 5 phút 70; tick xong task 15; mỗi 50 dòng kinh công sở 10; tặng cà phê 8; công quả 12; xin quẻ 10 (một lần mỗi ngày); nhiệm vụ ngày 40. Giới hạn mềm 190 XP mỗi ngày: vượt mức chỉ nhận 25%. Tất cả hằng số gom về một file cấu hình để chỉnh dễ.
3. Phòng ban chọn khi lên cấp 3, mỗi phòng buff x1.3 cho một loại hoạt động: Dev (gõ phím tập trung), Sales (tặng cà phê và lật task), Marketing (kinh công sở và xin quẻ), Kế toán (thưởng chuỗi chấm công), HR (công quả và giúp đồng nghiệp).
4. Kỳ đánh giá mỗi 7 ngày thật. Điều kiện cứng: đủ XP cho cấp tiếp theo, chấm công ít nhất 4 ngày trong kỳ, ít nhất 30 phút tập trung, ít nhất 3 lần giúp (tặng cà phê hoặc công quả). Đủ điều kiện thì mở mini-game "phỏng vấn thăng chức": 5 tình huống hài ở công sở, mỗi tình huống 3 lựa chọn, KHÔNG có câu sai hoàn toàn; mỗi lựa chọn chỉ cộng nhẹ vào các chỉ số tính cách (chăm chỉ, hòa đồng, sáng tạo). Qua phỏng vấn là lên chức, kèm màn chúc mừng. Chưa đạt thì KHÔNG mất cấp, chỉ hiện còn thiếu gì và chờ kỳ sau. Tự viết 20 tình huống, chọn ngẫu nhiên 5.
5. Giao diện: thẻ nhân viên (tên, chức danh, cấp, phòng ban), thanh XP, nhật ký hoạt động, màn tiến độ kỳ đánh giá, màn lên chức có hiệu ứng và âm thanh.
6. Lưu tiến độ qua interface ProgressStore. Bản bây giờ là LocalProgressStore dùng localStorage, có nút xuất và nhập mã lưu để chuyển thiết bị. Mã lưu có phiên bản và checksum. Phase 4 sẽ thay bằng bản dùng server.
7. Dữ liệu cũ phải đọc được khi đổi phiên bản (hàm migrate có test).

NGHIỆM THU
- Test vitest: levelFor(xp), xpFor(event), áp giới hạn mỗi ngày, điều kiện kỳ đánh giá, migrate dữ liệu. Phủ các trường hợp biên (đúng mốc XP, đổi ngày, đổi múi giờ).
- Chơi thử một vòng: dùng nút dev (chỉ bật khi chạy dev) để tua ngày, thấy chuỗi tăng, thấy kỳ đánh giá hiện đúng, lên được cấp 2 rồi 3.
- Tải lại trang không mất tiến độ; nhập mã lưu sai checksum thì báo lỗi, không làm hỏng dữ liệu hiện có.
- Báo cáo thêm bảng số liệu cân bằng: ngày cần chơi tối thiểu để tới từng cấp nếu chơi đều ở mức giới hạn.
```

## Phase 4: server và nhiều người chơi

Kết quả: nhiều người thấy nhau trong cùng một văn phòng, tiến độ nằm ở server, không sửa được từ phía người chơi. Đây là phase khó nhất và nên chia ba prompt. Ở bản đầu chat tự do bị loại bỏ: chỉ có biểu cảm và câu nhanh có sẵn, để tránh phải kiểm duyệt chat trực tiếp.

**Prompt 4A: server, tài khoản và lưu trữ**

```text
Đọc AGENTS.md, docs/GAME_DESIGN.md. Làm Phase 4A trong apps/server và packages/shared.

YÊU CẦU
1. Tài khoản ẩn danh: lần đầu vào, server cấp một token ngẫu nhiên đủ dài và một MÃ KHÔI PHỤC dễ đọc để người chơi tự giữ. Server chỉ lưu băm của token. Không thu email hay thông tin cá nhân. Có API đăng nhập lại bằng mã khôi phục.
2. SQLite (better-sqlite3) với migration có đánh số. Bảng: users, characters, progress (xp, cấp, nhánh, phòng ban, chuỗi chấm công, xu, uy tín), activity_log, wall_posts, reviews. Truy cập qua lớp repository để đổi DB sau này.
3. REST: tạo tài khoản, đăng nhập bằng mã khôi phục, lấy và lưu nhân vật, GET /api/capacity (số người online, giới hạn, trạng thái bận), GET /api/meta (cấu hình công khai: danh sách phòng ban, chức danh).
4. Nhập tiến độ từ mã lưu cục bộ của Phase 3 vào tài khoản một lần, server kiểm tra checksum và giới hạn hợp lý (không cho nhập cấp cao bất thường).
5. Giới hạn tần suất theo IP và theo tài khoản cho mọi endpoint ghi. Kiểm tra dữ liệu bằng zod.
6. Viết docs/PROTOCOL.md cho phần REST.

NGHIỆM THU
- Test tích hợp bằng vitest: tạo tài khoản, đăng nhập lại, lưu và đọc nhân vật, nhập tiến độ hợp lệ và không hợp lệ.
- Token sai hoặc hết hạn trả 401; vượt giới hạn tần suất trả 429.
- Khởi động lại server vẫn giữ dữ liệu.
```

**Prompt 4B: phòng và đồng bộ thời gian thực**

```text
Làm Phase 4B: WebSocket và phòng. Mô tả mọi gói tin trong docs/PROTOCOL.md và kiểu dữ liệu trong packages/shared/protocol.ts.

YÊU CẦU
1. Kết nối /ws?token=... Server xác thực token, đưa người chơi vào một phòng văn phòng còn chỗ. Mỗi phòng tối đa 40 người (chỉnh được bằng cấu hình); hết chỗ thì mở phòng mới cùng loại.
2. Giao thức: join, state (vị trí, hướng, tư thế, trang phục rút gọn), emote, quick_chat (chọn từ danh sách câu nhanh có sẵn, KHÔNG có chat tự do), leave. Client gửi vị trí khoảng 10 lần mỗi giây; server chỉ phát phần thay đổi, tối đa vài lần mỗi giây tới người ở gần (quản lý vùng quan tâm). Hồ sơ người chơi khác chỉ gửi khi vừa vào hoặc khi đổi.
3. Server kiểm tra vị trí: giới hạn tốc độ di chuyển, không xuyên tường (dùng cùng hàm va chạm với client, đặt ở shared). Vi phạm thì kéo người chơi về vị trí hợp lệ.
4. Heartbeat, tự ngắt người chơi không phản hồi, kết nối lại tự động ở client với chờ lùi dần, giữ chỗ ngắn trong vài chục giây. Người chơi đứng yên quá lâu (idle) thì hiện thông báo "Bạn còn ở đó không?" rồi giải phóng chỗ.
5. Client: hiển thị người chơi khác với nội suy vị trí cho mượt, nhãn tên và chức danh, biểu cảm và câu nhanh hiện bong bóng, giới hạn số nhân vật vẽ chi tiết xung quanh (xa thì vẽ đơn giản).
6. Có thể chặn hoặc ẩn một người chơi cho riêng mình.
7. Viết script tải thử tạo 100 bot kết nối vào cùng một phòng.

NGHIỆM THU
- Mở hai trình duyệt khác nhau thấy nhau di chuyển mượt, tắt một bên thì bên kia thấy biến mất.
- Test tích hợp với vài client giả: vào, di chuyển, rời, mất kết nối, kết nối lại.
- Chạy script 100 bot: ghi vào docs/PERF.md băng thông mỗi người, độ trễ, mức dùng CPU và bộ nhớ của server.
- Gói tin sai định dạng hoặc quá lớn bị bỏ và ghi log, không làm sập server.
```

**Prompt 4C: XP do server tính**

```text
Làm Phase 4C: chuyển quyền tính điểm sang server.

YÊU CẦU
1. Thay LocalProgressStore bằng ServerProgressStore. Client gửi hành động (bắt đầu và kết thúc một phiên gõ phím, chấm công, tick task, tặng cà phê...). Server kiểm tra rồi mới tính XP bằng đúng hàm trong packages/shared/rules.ts và trả kết quả về client.
2. Phiên tập trung do server đo giờ: client chỉ báo bắt đầu và kết thúc, server chỉ cộng nếu thời gian trôi qua đủ. Chấm công và xin quẻ tính theo ngày ở múi giờ đã lưu của người chơi.
3. Giới hạn XP mỗi ngày, chống gửi trùng (idempotency key cho mỗi hành động), chống gửi quá nhanh.
4. Kỳ đánh giá và mini-game phỏng vấn chạy ở server: server chọn câu hỏi, nhận lựa chọn, quyết định lên chức.
5. Ghi activity_log để kiểm tra khi cần.

NGHIỆM THU
- Sửa số liệu ở phía client (devtools) không làm thay đổi XP thật.
- Test: gửi trùng hành động, gửi sai thứ tự, gửi quá nhanh, đổi ngày.
- Chơi trọn một vòng từ cấp 1 lên cấp 2 qua server.
```

## Phase 5: kinh tế, cửa hàng, sự kiện

Kết quả: có lý do để quay lại mỗi ngày: xu để mua đồ, thú cưng, việc vặt chung, sự kiện bất ngờ, tường than thở chung có kiểm duyệt, thẻ khoe thành tích. Chia hai prompt.

**Prompt 5A: xu, cửa hàng, thú cưng, công quả**

```text
Đọc AGENTS.md và docs/GAME_DESIGN.md. Làm Phase 5A. Mọi giao dịch xu chạy ở server.

YÊU CẦU
1. Xu: nhận khi có XP (khởi điểm 50% XP, làm tròn xuống) cộng thưởng nhiệm vụ ngày. Ghi sổ mọi biến động xu vào bảng ledger (cộng, trừ, lý do). Không có đường quy đổi từ tiền thật.
2. Cửa hàng: danh mục ít nhất 40 món do bạn tự thiết kế: trang phục (áo, nón, phụ kiện), đồ bàn (cây mini, cốc, đèn, bảng tên), ghế, thú cưng. Mỗi món có giá, độ hiếm, điều kiện cấp bậc (nếu có). Đường cong giá: món đầu mua được trong 1-2 ngày chơi, món hiếm cần khoảng 3 tuần chơi đều. Màn xem thử 3D nhân vật mặc món đang xem, xoay được (dùng một renderer nhỏ riêng, xong thì giải phóng).
3. Túi đồ và trang bị: mặc, tháo, đặt đồ lên bàn của mình. Người khác trong phòng thấy trang phục và thú cưng của bạn.
4. Thú cưng văn phòng dựng bằng thủ tục: mèo, cún, xương rồng biết "nhìn", cá cảnh trong bể, robot hút bụi. Gộp hình học để tiết kiệm draw call, đi theo hoặc nằm cạnh bàn.
5. Công quả: lau bàn, tưới cây, dọn pantry, gỡ kẹt máy in. Mỗi việc là một mini-game 5-10 giây. Cây đã tưới ở lại trong phòng, mọi người thấy, tối đa 30 cây mỗi phòng, cây cũ nhất tự mất. Lưu trạng thái ở server.
6. Nhiệm vụ ngày: 3 nhiệm vụ ngẫu nhiên từ danh sách do bạn tự viết, làm mới lúc 4 giờ sáng theo giờ địa phương.

NGHIỆM THU
- Test: không mua được khi thiếu xu, không mua hai lần cùng món độc nhất, mua đồng thời hai yêu cầu không làm xu âm (kiểm tra giao dịch).
- Người chơi thứ hai thấy đồ và thú cưng người thứ nhất vừa trang bị.
- ledger khớp tổng xu của từng tài khoản.
- Ghi vào docs/PERF.md ảnh hưởng của 40 người cùng mặc đồ và dắt thú cưng.
```

**Prompt 5B: sự kiện, xếp hạng, tường chung, thẻ khoe**

```text
Làm Phase 5B.

YÊU CẦU
1. Sự kiện ngẫu nhiên theo phòng, mỗi 5-10 phút một lần, KHÔNG phạt người chơi: sếp đi ngang (cảnh báo hiện 3 giây, ai bấm "giả vờ bận" kịp thì nhận thưởng nhỏ), mất wifi (cả phòng cùng gõ vào router để khởi động lại, hoàn thành chung thì cả phòng nhận thưởng), hết cà phê, họp đột xuất. Tự viết thoại và âm thanh bằng Web Audio.
2. Xếp hạng theo tuần và theo tháng, chia theo phòng ban và tổng. Chỉ hiện tên, chức danh và số liệu; có tùy chọn ẩn mình khỏi bảng. Không dùng xếp hạng để khóa tính năng.
3. Tường than thở chung: người chơi đăng một dòng ẩn danh (tối đa 140 ký tự, một bài mỗi ngày). Server lọc từ cấm tiếng Việt và tiếng Anh, chặn số điện thoại, đường dẫn, địa chỉ email và tên công ty hay thương hiệu có trong danh sách chặn. Có nút báo cáo; bài đủ 3 báo cáo thì ẩn tự động. Trang quản trị đơn giản (bảo vệ bằng khóa trong biến môi trường) để xem báo cáo và xóa bài.
4. Bản đồ tòa nhà: xem các tầng, phòng, và số người đang ở mỗi phòng, chuyển phòng bằng một chạm.
5. Thẻ khoe thành tích: sinh ảnh 1080x1350 bằng canvas (nhân vật, chức danh, số liệu hôm nay như số phím gõ, số ly cà phê, số cuộc họp né được), nút chia sẻ bằng navigator.share và tải về. Không đính kèm thông tin định danh.
6. Lịch theo ngày: thứ Hai uể oải, thứ Sáu hưng phấn, ngày lương, Tết: đổi nhạc, ánh sáng, thoại. Tự viết nội dung.

NGHIỆM THU
- Test bộ lọc tường chung với danh sách mẫu (ca đúng và ca lọt), test ẩn tự động khi đủ báo cáo.
- Mô phỏng sự kiện với nhiều người chơi giả, không gây nghẽn server.
- Ảnh thẻ khoe xuất ra đúng kích thước và hiển thị đúng chữ tiếng Việt có dấu.
```

## Phase 6: mở công ty

Kết quả: từ cấp 8 người chơi mở công ty riêng, lớn dần qua 5 giai đoạn, và người chơi khác có thể xin vào làm. Đây là phần làm game tự tuần hoàn. Chia hai prompt: làm bản một người trước, rồi mới mở cho người khác vào.

**Prompt 6A: công ty và các giai đoạn**

```text
Đọc AGENTS.md và docs/GAME_DESIGN.md. Làm Phase 6A. Mọi tính toán ở server, hằng số cân bằng ở packages/shared/company.ts.

YÊU CẦU
1. Điều kiện mở công ty: đạt cấp 8 và đủ vốn bằng xu (khởi điểm khoảng một phần tư tổng xu đã kiếm được, chỉnh trong file cấu hình). Người chơi chọn ngành (công nghệ, quán cà phê, thương mại, sáng tạo), đặt tên công ty qua bộ lọc (chặn thương hiệu và tên công ty có thật theo danh sách, chặn từ cấm), chọn màu và biểu tượng từ bộ có sẵn. KHÔNG cho tải ảnh lên. Mỗi người sở hữu tối đa một công ty cùng lúc.
2. Công ty là một loại phòng riêng (private room) có bố cục theo giai đoạn: Garage, Co-working, Công ty nhỏ (một tầng), Công ty vừa (nhiều tầng), Tập đoàn (cả tòa nhà). Dựng bằng thủ tục, tái dùng bộ đồ vật của văn phòng chung, thêm biển hiệu có tên và màu công ty.
3. Vòng chơi: nhận "dự án" (mỗi dự án có độ khó, thời gian, phần thưởng xu), hoàn thành bằng cách chơi các hoạt động sẵn có (gõ phím tập trung, công quả, xử lý sự kiện) hoặc giao cho nhân viên NPC. Doanh thu, chi phí lương, uy tín công ty tính theo giờ thật nhưng tối đa gộp theo ngày (người chơi offline không bị phạt, chỉ không tăng).
4. Tuyển nhân viên NPC (thực tập sinh trước), chọn phòng ban, thăng chức NPC. Có sự kiện công ty: khách hủy hợp đồng, deadline gấp, nhân viên xin nghỉ. Mọi sự kiện đều có lựa chọn, không có kết cục thua cứng.
5. Điều kiện lên giai đoạn tiếp theo nằm trong cấu hình: số dự án hoàn thành, uy tín, số nhân viên, xu dự trữ.
6. IPO và tái sinh: đạt giai đoạn Tập đoàn và đủ điều kiện thì được "IPO": nhận huy hiệu vĩnh viễn, được chọn ngành mới, bắt đầu lại với thưởng nhỏ (không quá 5% xu), cấp bậc cá nhân giữ nguyên.

NGHIỆM THU
- Test cân bằng: mô phỏng người chơi chơi đều mỗi ngày, ghi vào docs/BALANCE.md số ngày cần để tới từng giai đoạn; mục tiêu tổng khoảng 2 tháng từ lúc mở công ty đến IPO.
- Test: không mở được khi thiếu cấp hoặc thiếu vốn, tên bị chặn bị từ chối, offline lâu không làm số liệu âm.
- Công ty mở xong, tải lại trang vẫn đúng giai đoạn và nhân viên.
```

**Prompt 6B: vào làm ở công ty người chơi khác**

```text
Làm Phase 6B.

YÊU CẦU
1. Danh bạ công ty: xem công ty đang tuyển (tên, ngành, giai đoạn, số người). Người chơi cấp 1-7 có thể nộp đơn xin vào làm thực tập sinh hoặc nhân viên; chủ công ty duyệt hoặc từ chối. Mỗi người chỉ thuộc một công ty cùng lúc và có thể rời bất kỳ lúc nào.
2. Chủ công ty có quyền: duyệt đơn, mời bằng mã mời, giao việc cho nhân viên thật, xét thăng chức cho họ (thay kỳ đánh giá hệ thống cho phần "quyết định cuối"), đuổi và chặn người. Chủ không được thao tác làm tăng XP cá nhân của nhân viên ngoài các luật trong shared.
3. Chống lạm dụng: giới hạn số đơn và số lời mời mỗi ngày, không ai nhận XP từ việc tự lập tài khoản phụ nộp đơn vào công ty mình (phát hiện cơ bản và giới hạn thưởng thăng chức cho người do chủ duyệt theo ngày).
4. "Offer từ công ty khác": người chơi đang ở công ty nhỏ có thể nhận offer, lên nhanh một cấp nhưng đổi môi trường và giảm nhẹ uy tín. Offer sinh từ NPC hoặc công ty thật của người chơi.
5. Bảng tin công ty chỉ gồm thông báo hệ thống tự sinh (chúc mừng thăng chức, hoàn thành dự án), không có chat tự do.

NGHIỆM THU
- Hai tài khoản test: A mở công ty, B nộp đơn, A duyệt, B vào được phòng công ty và thấy A.
- Test quyền: người ngoài không vào được phòng riêng, B không tự duyệt cho mình, chủ bị chặn không làm gì được sau khi bị đuổi.
- Test chạy lại luồng khi một bên mất kết nối giữa chừng.
```

## Phase 7: tối ưu, bảo mật, deploy

Kết quả: game chạy ổn trên điện thoại tầm trung, an toàn đủ để mở cho người lạ vào, có cách triển khai và sao lưu lặp lại được.

```text
Đọc AGENTS.md. Làm Phase 7. Không thêm tính năng mới.

A. HIỆU NĂNG
1. Đo trên thiết bị thật hoặc giả lập CPU chậm gấp 4 lần. Đặt ngân sách: thời gian tải ban đầu, kích thước JS (chia nhỏ theo route và tải lười các màn như cửa hàng, bản đồ, xem thử 3D), draw call, bộ nhớ sau 30 phút chơi. Ghi số đo trước và sau vào docs/PERF.md.
2. Chế độ máy yếu: tự phát hiện, giảm bóng, giảm số nhân vật vẽ chi tiết, giảm hiệu ứng, giảm tần suất cập nhật.
3. Sửa rò rỉ bộ nhớ (dispose geometry, material, texture, ngắt listener). Có test chạy dài bằng bot hoặc trình duyệt tự động.
4. PWA: manifest, service worker chỉ cache tài nguyên tĩnh, có cơ chế báo phiên bản mới (build id) và yêu cầu tải lại khi giao thức đổi.

B. BẢO MẬT VÀ AN TOÀN
1. Header an toàn (CSP chặt, X-Content-Type-Options, Referrer-Policy), CORS đúng nguồn, mọi đầu vào qua zod, giới hạn kích thước, giới hạn kết nối và tần suất theo IP, đóng WebSocket khi gửi sai nhiều lần.
2. Rà soát toàn bộ nơi hiển thị văn bản do người chơi nhập (tên, tên công ty, tường than thở) để chống XSS: luôn gán bằng textContent, không dùng innerHTML.
3. Kiểm tra token chỉ lưu băm, không lộ trong log, mã khôi phục không bị đoán được. Viết test tấn công cơ bản (token giả, gói tin lạ, gửi dồn).
4. Trang Điều khoản và Chính sách quyền riêng tư bằng tiếng Việt, mô tả đúng những gì hệ thống thật sự lưu (token băm, tên hiển thị, tiến độ, nhật ký hoạt động) và cách xóa tài khoản. Thêm chức năng xóa tài khoản và toàn bộ dữ liệu. Không đưa nội dung pháp lý lên khi chưa có người có chuyên môn rà soát.
5. Thiết lập nội dung an toàn: không có chat tự do, tường chung có kiểm duyệt, nút báo cáo, nút chặn.

C. TRIỂN KHAI
1. Dockerfile cho server (build nhiều tầng), docker-compose cho môi trường chạy thử, tệp mẫu cấu hình reverse proxy (Caddy hoặc Nginx) hỗ trợ WebSocket qua wss và nén tĩnh. Client build ra tệp tĩnh phục vụ qua CDN hoặc cùng proxy.
2. Biến môi trường rõ ràng trong .env.example, kiểm tra thiếu biến khi khởi động.
3. Sao lưu SQLite định kỳ ra nơi lưu ngoài máy chủ, kèm script khôi phục có test. Ghi docs/RUNBOOK.md: cách deploy, rollback, khôi phục, đổi phiên bản giao thức.
4. CI (GitHub Actions hoặc tương đương): typecheck, lint, test, build, chạy tải thử rút gọn.
5. Endpoint /api/health và /api/capacity cho giám sát, tắt máy chủ êm (graceful shutdown) đóng WebSocket đúng cách.
6. Phân tích số liệu ẩn danh, không cookie theo dõi, tùy chọn tắt.

NGHIỆM THU
- Bảng số đo hiệu năng trước/sau trong docs/PERF.md.
- Tất cả test qua trong CI, gồm test bảo mật cơ bản.
- Làm theo RUNBOOK từ máy sạch dựng được hệ thống và khôi phục được bản sao lưu.
- Danh sách rủi ro còn lại và việc nên làm trước khi mở công khai, ghi vào docs/LAUNCH_CHECKLIST.md.
```

## Mẹo dùng Antigravity

Tên các mục trong giao diện có thể khác tùy phiên bản bạn đang dùng, nên mẹo dưới đây nói theo việc cần làm chứ không theo tên nút.

- **Mỗi phase một phiên làm việc mới.** Dán Prompt 0 vào AGENTS.md một lần, rồi mỗi prompt dán vào một cuộc trò chuyện hoặc tác vụ mới để agent không mang theo ngữ cảnh cũ lẫn lộn.
- **Xem kế hoạch trước khi agent chạy.** Nếu có chế độ lập kế hoạch, bật nó cho Phase 1, 4 và 6, đọc kế hoạch, sửa lại phạm vi rồi mới cho chạy.
- **Bắt agent tự kiểm tra bằng trình duyệt.** Cuối mỗi prompt đã có phần nghiệm thu. Yêu cầu agent mở trang, thao tác thật và nộp ảnh chụp hoặc bản ghi, thay vì chỉ nói "đã xong".
- **Commit sau mỗi phase đạt nghiệm thu.** Nhánh riêng cho mỗi phase giúp quay lại được khi agent đi lệch.
- **Tự đọc kỹ phần nhạy cảm.** Xem diff tay ở xác thực, tính XP, giao dịch xu, quyền chủ công ty và bộ lọc nội dung. Lỗi ở đây ảnh hưởng người chơi thật.
- **Khi agent đi lệch:** hoàn tác, nêu lại phạm vi bằng một câu ("chỉ làm mục 3 và 4"), dán kèm thông báo lỗi nguyên văn. Đừng sửa bằng cách chồng thêm prompt lên một nhánh đã rối.
- **Giữ tài liệu sống.** Cuối mỗi phase yêu cầu agent cập nhật docs/GAME\_DESIGN.md, PROTOCOL.md và DECISIONS.md. Phase sau đọc lại các file này nên nhất quán hơn nhiều so với dựa vào trí nhớ của cuộc trò chuyện.
- **Chỉnh số liệu sau khi chơi thử.** Mọi con số cân bằng đều nằm trong file cấu hình. Chơi thật vài ngày rồi mới chỉnh, đừng chỉnh theo cảm giác khi mới viết xong.

Nếu một prompt quá lớn so với giới hạn của agent, chia theo các mục đánh số trong prompt đó và dán từng nhóm hai đến ba mục một.
