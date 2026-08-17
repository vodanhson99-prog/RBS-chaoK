# Hand Frame Capture

Chụp ảnh bằng khung tay: dùng **hai đầu ngón cái** và **hai đầu ngón trỏ** tạo tứ giác trước camera (kiểu khung hình đạo diễn). Khi khung ổn định, app đếm ngược rồi lưu ảnh vùng bên trong khung.

## Yêu cầu

- Python 3.9+
- Webcam

## Cài đặt

```bash
pip install -r requirements.txt
```

Model MediaPipe đã nằm sẵn tại `models/hand_landmarker.task`. Nếu thiếu, tải lại:

https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

## Chạy

```bash
python app.py
```

Tuỳ chọn:

```bash
python app.py --corners thumb-pinky   # đổi sang ngón cái + ngón út
python app.py --debug                 # bật overlay 21 landmark kèm số thứ tự
```

## Cách dùng

1. Đứng trước webcam (cửa sổ hiển thị dạng gương).
2. Giơ **hai tay**, dùng đầu **ngón cái** + đầu **ngón trỏ** của mỗi tay tạo hình tứ giác (như khung máy ảnh).
3. Giữ yên đến khi thanh trạng thái đếm ổn định → đếm ngược 3–2–1 → chụp.
4. Ảnh lưu trong thư mục `captures/`:
   - ảnh crop theo tứ giác (perspective)
   - ảnh full frame có vẽ khung (lần chụp tự động)

### Phím tắt

| Phím | Chức năng |
|------|-----------|
| `Q` / `Esc` | Thoát |
| `Space` | Chụp ngay khi đã có khung hợp lệ |
| `M` | Đổi cặp ngón tạo góc (ngón trỏ ↔ ngón út) |
| `D` | Bật/tắt overlay landmark để kiểm tra nhận diện |

## Ghi chú

- Góc khung có nhãn `T` (thumb) và `I` (index) để kiểm chứng đúng ngón.
- Cần thấy **đủ 2 tay**.
- Khung quá nhỏ / quá lớn / bị dẹt sẽ không kích hoạt countdown.
- Sau mỗi lần chụp có cooldown ngắn để tránh chụp liên tục.
