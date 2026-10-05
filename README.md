# FastExam AI v1.4

Web mobile-first cho việc phân tích câu hỏi trắc nghiệm từ ảnh bằng Gemini API theo mô hình BYOK: mỗi người tự nhập API key và tự chọn model.

## Luồng xử lý
- Tối đa 15 ảnh/request.
- Tự ước lượng payload và adaptive compression; nếu 15 ảnh quá lớn sẽ tự tách batch thay vì bắt người dùng chia thủ công.
- Lượt 1: giải bằng model đã chọn + structured JSON.
- Lượt 2: giải độc lập từ ảnh, không xem đáp án lượt 1.
- Nếu hai lượt khác đáp án: chỉ các câu lệch mới gọi lượt 3 để phân xử.
- Nếu phân xử thất bại, hệ thống không tự đoán mà đánh dấu cần xem lại.
- Với Gemini 3.8 Flash, hỗ trợ thinking level Low/Medium/High và mặc định High.
- Không tự retry 429; chỉ retry giới hạn cho lỗi mạng/5xx.

## Chạy
```bash
npm start
```
Mở `http://localhost:3000`.

> API key được nhập và lưu trong trình duyệt theo thiết kế BYOK của ứng dụng.
