# FastExam AI v2.0

Web mobile-first hỗ trợ phân tích & giải đề thi trắc nghiệm từ ảnh bằng Google Gemini API theo mô hình BYOK (Bring Your Own Key: người dùng tự cấu hình API Profile & Model trong trình duyệt).

## Tính năng chính
- **Quản lý đa API Profile**: Thêm nhiều API Key từ các project / tài khoản Google khác nhau.
- **2 Chế độ linh hoạt**:
  - **CHỈ TRA**: Gọi 1 model/profile nhanh gọn.
  - **KIỂM TRA CHÉO**: Gọi song song 2 profile/model khác nhau, đối soát độc lập và tự động phân xử nếu lệch kết quả.
- **Tối đa 15 ảnh/lần**: Tự động ước lượng payload và chia batch thông minh nếu vượt ngưỡng an toàn.
- **Định dạng chuẩn SEB**: Hiển thị rõ ràng số câu, nội dung câu hỏi và chữ cái đáp án đúng.
- **Tương thích Vercel & Static Hosting**: Triển khai trực tiếp không cần server backend.

## Chạy Local (tùy chọn)
```bash
npm run dev
# hoặc: node dev-server.js
```
Mở trình duyệt: `http://localhost:3000`

