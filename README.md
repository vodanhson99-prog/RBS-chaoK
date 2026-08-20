# Hand Frame Capture

Desktop Python booth **và** web photobooth (MediaPipe trên trình duyệt, 6-shot strip, QR download).

## Web photobooth

Cần Node 18+, webcam, **HTTPS hoặc localhost** (camera).

```bash
npm install
cd api && npm install && cd ../web && npm install
cd ..
npm run dev
```

Mở http://localhost:5173

- Chọn template: Navy/Maroon 16:9 hoặc RBS strip ×6
- Giơ **hai tay**, tạo **chữ S lật ngược** (tay trên cong trái, tay dưới cong phải) → khóa pose → countdown 7s → chụp
- Strip: 6 shot liên tiếp, ghép vào khung, Retake last
- `M` đổi khung, `R` hủy pose / countdown
- Upload API (`:8787`) lưu JPEG 48 giờ → trang kết quả có QR `/p/:token`

### Cấu hình in ảnh trên Windows (Canon SELPHY CP1000)

API gửi lệnh in qua Windows Print Spooler và PowerShell. Máy in phải được cài driver và kết nối với **chính máy Windows đang chạy API**.

#### 1. Cài và kiểm tra máy in

1. Kết nối Canon SELPHY CP1000 bằng USB và bật máy in.
2. Cài driver Canon CP1000 nếu Windows chưa tự nhận.
3. Mở **Settings → Bluetooth & devices → Printers & scanners**.
4. Kiểm tra máy in xuất hiện và in thử một trang từ Windows trước khi chạy photobooth.

Lấy tên máy in chính xác bằng PowerShell:

```powershell
Get-Printer | Select-Object Name
```

Ví dụ:

```text
Name
----
Canon SELPHY CP1000
Microsoft Print to PDF
```

Dùng đúng giá trị trong cột `Name`, bao gồm cả khoảng trắng.

#### 2. Chạy API với tên máy in

Mở PowerShell tại thư mục project và đặt biến môi trường trước khi chạy:

```powershell
$env:CANON_PRINTER_NAME="Canon SELPHY CP1000"
npm run dev
```

Nếu chỉ chạy riêng API:

```powershell
$env:CANON_PRINTER_NAME="Canon SELPHY CP1000"
cd api
npm run dev
```

Biến `$env:CANON_PRINTER_NAME` chỉ tồn tại trong cửa sổ PowerShell hiện tại. Nếu đóng cửa sổ, cần đặt lại biến trước lần chạy tiếp theo.

Muốn lưu cấu hình lâu dài cho các cửa sổ PowerShell mới, dùng `setx` một lần:

```powershell
setx CANON_PRINTER_NAME "Canon SELPHY CP1000"
```

Sau khi chạy `setx`, hãy mở PowerShell mới rồi chạy `npm run dev`. Không cần dùng đồng thời `setx` và `$env:CANON_PRINTER_NAME`.

#### 3. Thực hiện lệnh in

1. Chụp ảnh trên photobooth.
2. Ở trang kết quả, nhấn **IN ẢNH**.
3. Nhập tên khách.
4. Nhân viên kiểm tra thanh toán.
5. Nhấn **XÁC NHẬN ĐÃ THANH TOÁN & IN**.

Ảnh được copy vào hàng đợi tại:

```text
api/data/print-queue/TenKhach-YYYYMMDD-HHMMSS.jpg
```

Nếu `CANON_PRINTER_NAME` được cấu hình, API sẽ gửi file này tới máy in. Nếu chưa cấu hình hoặc máy in chưa kết nối, ảnh vẫn được lưu trong `print-queue` để in thủ công.

#### 4. Xử lý lỗi thường gặp

- **Không thấy máy in trong `Get-Printer`**: cài lại driver, kiểm tra USB và thử in từ Windows.
- **Tên máy in không khớp**: copy lại chính xác tên từ cột `Name`, sau đó khởi động lại API.
- **Ảnh được lưu nhưng không tự in**: kiểm tra `CANON_PRINTER_NAME` trong đúng cửa sổ PowerShell đang chạy API.
- **In sai khổ hoặc có lề**: kiểm tra paper size và borderless setting trong driver Canon/Windows Printer Preferences.
- **API báo `Print failed`**: kiểm tra hàng đợi in của Windows, trạng thái máy in và xem máy in có đang bị Offline/Paused không.

QR thanh toán dùng file `web/public/payment-qr.png` (PNG, khuyến nghị 400×400px).

Các biến môi trường API:

- `PUBLIC_BASE_URL`: URL public để QR trỏ đúng khi deploy.
- `PORT`: cổng API, mặc định `8787`.
- `CANON_PRINTER_NAME`: tên máy in Windows lấy từ `Get-Printer`.

Khung web nằm ở `web/public/frames/` (`blueframe.png`, `redframe.png`, `rbs-strip.png`).

Khung web nằm ở `web/public/frames/` (`blueframe.png`, `redframe.png`, `rbs-strip.png`).

## Desktop Python


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
python app.py --debug                     # bật overlay 21 landmark kèm số thứ tự
python app.py --frame frames/frame_01.png # chọn khung trang trí cụ thể
python app.py --frame none                # chụp không ghép khung
python app.py --keep-bottom 0.15          # giữ opaque 15% dưới đáy (khung nền đen full)
```

## Cách dùng

1. Đứng trước webcam (cửa sổ dạng gương).
2. Giơ **một đầu ngón trỏ** (trái hoặc phải).
3. Di chuyển tới mỗi góc khung hình, **giữ yên ~0.5s** để ghim góc (1 → 2 → 3 → 4).
4. Khi đủ 4 góc hợp lệ → đếm ngược **7 giây** rồi chụp tự động.
5. Ảnh lưu tại `captures/capture_YYYYMMDD_HHMMSS.jpg` (**1920×1080**, đã ghép khung trang trí, không có overlay MediaPipe).

## Khung trang trí

Đặt file PNG vào thư mục `frames/`; app tự dùng file đầu tiên theo thứ tự tên.
Trong lúc chạy, nhấn `M` để chuyển tuần tự qua tất cả file `.png` trong thư mục.
Tên khung đang chọn hiển thị ở góc trên bên phải của cửa sổ camera.

| File | Mô tả |
|------|-------|
| `frame_01.png` | Mặc định — viền tím than `#1E2347`, ô ảnh ở giữa |
| `frame_maroon.png` | Bản nâu đỏ `#540606` |
| `frame_old_black.png` | Bản nền đen full-bleed (cần `--keep-bottom 0.15`) |

- PNG **có alpha**: dùng trực tiếp kênh alpha.
- PNG **không alpha**: **vùng đen liền lớn nhất** được coi là cửa sổ ảnh — dùng được cả khi nền đen phủ toàn bộ lẫn khi ô đen nằm giữa viền màu. Các mảng đen nhỏ hơn (ruột logo) vẫn giữ nguyên.
- Khung được resize về đúng 1920×1080 trước khi ghép.

Nếu artwork có **dải đen thiết kế sẵn dính liền với nền đen**, dùng `--keep-bottom 0.15` để giữ opaque 15% dưới đáy. Mặc định tắt (`0`).

### Phím tắt

| Phím | Chức năng |
|------|-----------|
| `Q` / `Esc` | Thoát |
| `R` | Xóa góc đã ghim, vẽ lại |
| `M` | Chuyển sang khung PNG tiếp theo trong `frames/` |
| `D` | Bật/tắt overlay landmark |

## Ghi chú

- Chỉ cần **1 tay / 1 ngón trỏ**.
- Khung quá nhỏ / quá lớn / bị dẹt sẽ bị từ chối — nhấn `R` và vẽ lại.
- Sau mỗi lần chụp có cooldown ngắn.
