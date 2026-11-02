# Chính sách quyền riêng tư (BẢN NHÁP)

> **BẢN NHÁP – CHƯA ĐƯỢC NGƯỜI CÓ CHUYÊN MÔN PHÁP LÝ RÀ SOÁT. KHÔNG ĐĂNG LÊN TRANG KHI CHƯA RÀ SOÁT.**

Mô tả đúng những gì hệ thống đang lưu (theo mã nguồn ở thời điểm Phase 7).

## Không thu

Email, số điện thoại, họ tên thật, ngày sinh, vị trí, danh bạ, cookie theo dõi.

## Lưu trên máy chủ

| Dữ liệu                                                                     | Mục đích                                    | Ghi chú                            |
| --------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| Mã băm SHA-256 của token đăng nhập và mã khôi phục                          | Đăng nhập                                   | Không lưu token/mã thật            |
| Tên hiển thị, ngoại hình nhân vật                                           | Hiển thị trong game                         | Tên qua bộ lọc nội dung            |
| Múi giờ                                                                     | Tính ngày chấm công                         |                                    |
| Tiến độ: XP, xu, uy tín, phòng ban, nhánh, chuỗi chấm công, việc trong ngày | Luật chơi                                   |                                    |
| Nhật ký hoạt động (loại hoạt động, XP, xu, thời điểm) và sổ cái xu          | Tính điểm, kiểm tra gian lận                |                                    |
| Đồ đã mua, đồ đang dùng                                                     | Cửa hàng                                    |                                    |
| Bài trên tường than thở, báo cáo bài                                        | Tường chung                                 | Người khác không thấy ai đăng      |
| Công ty, thành viên, đơn xin việc, bảng tin công ty                         | Tính năng công ty                           |                                    |
| Mã băm HMAC của địa chỉ IP gần nhất                                         | Phát hiện tài khoản phụ tự vào công ty mình | Không lưu IP thật                  |
| Thống kê ẩn danh: số lượt mở từng màn theo ngày                             | Cải thiện game                              | Không gắn với người chơi; tắt được |

Log máy chủ chỉ ghi phương thức và đường dẫn yêu cầu, không ghi IP, header hay query (token).

## Lưu trên máy của bạn (localStorage)

Token đăng nhập, cài đặt âm thanh/đồ hoạ, danh sách người bạn đã ẩn, lựa chọn thống kê.

## Xoá dữ liệu

Tab Tài khoản → Xoá tài khoản: xoá vĩnh viễn tài khoản và mọi dữ liệu liên quan trên máy chủ. Bản sao lưu cũ (giữ tối đa `BACKUP_KEEP` ngày) sẽ hết hạn theo vòng sao lưu.
