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

### In anh (Canon SELPHY CP1000)

1. Cam may in USB vao may Windows dang chay API.
2. Cai Canon CP1000 driver, kiem tra may in xuat hien trong Windows Settings > Printers.
3. Lay ten may in chinh xac (vd `Canon SELPHY CP1000`):
   ```powershell
   Get-Printer | Select-Object Name
   ```
4. Dat bien moi truong truoc khi chay:
   ```powershell
   $env:CANON_PRINTER_NAME="Canon SELPHY CP1000"
   npm run dev
   ```
5. Thay file `web/public/payment-qr.png` bang anh QR chuyen khoan cua ban (PNG, khuyen nghi 400×400px).
6. Tren man hinh ket qua, bam **IN ANH** → khach nhap ten → nhan vien kiem tra thanh toan → bam **XAC NHAN DA THANH TOAN & IN**.
7. Anh duoc luu tai `api/data/print-queue/TenKhach-YYYYMMDD-HHMMSS.jpg` va gui lenh in toi may in.

Neu khong dat `CANON_PRINTER_NAME`, anh van duoc luu vao thu muc `print-queue` nhung khong gui lenh in (co the in thu cong).

Bien moi truong API: `PUBLIC_BASE_URL` (URL public de QR tro dung khi deploy), `PORT` (mac dinh 8787), `CANON_PRINTER_NAME` (ten may in Windows).

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
