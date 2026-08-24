# RBS Photobooth — Product Scope & Delivery Plan

## 1. Mục tiêu sản phẩm

Một photobooth tối giản cho sự kiện trực tiếp:

```text
Chọn 1 frame
  → Chụp ảnh / photostrip
  → Ghép ảnh
  → Hiển thị QR
  → Edit bằng điện thoại
  → Download miễn phí hoặc trả tiền để in
```

Ảnh và bản edit được lưu ẩn trên backend trong thời gian dài hơn thời gian diễn ra sự kiện để:

- Khách tải ảnh.
- Khách in ảnh.
- Đội vận hành truy xuất ảnh thủ công để dùng cho nội dung Facebook/post-event.

Không xây social network, public gallery hoặc hệ thống event management lớn.

---

## 2. Scope đã chốt

### Có

- Chụp ảnh bằng webcam.
- MediaPipe hand tracking.
- Ghim 4 góc bằng một ngón trỏ.
- Thư viện khoảng 10–15 frame.
- Chọn **một frame cho mỗi lượt chụp**.
- Single photo.
- Photostrip 6 ảnh.
- Retake shot cuối.
- Ghép ảnh vào frame.
- QR để mở ảnh bằng điện thoại.
- Mobile edit đơn giản.
- Download miễn phí.
- Print có thanh toán.
- Lưu ảnh gốc và bản edit ẩn trên backend.
- Print worker kết nối với máy in gần booth.

### Không có trong scope hiện tại

- User account cho khách.
- Social feed, like, comment, follow.
- Public gallery, search ảnh công khai.
- Facebook integration tự động.
- Event/workspace/team management phức tạp.
- Subscription billing.
- Marketplace frame/sticker.
- AI moderation hoặc AI photo editing.
- Video capture.
- Upload raw video/camera frames.
- Microservices hoặc multi-region infrastructure.

---

## 3. User flow

### 3.1 Tại booth

1. Mở photobooth.
2. Chọn một frame từ thư viện thumbnail 10–15 mẫu.
3. Cho phép truy cập webcam.
4. Giơ một ngón trỏ và ghim 4 góc.
5. Chờ countdown.
6. Chụp một ảnh hoặc 6 shot liên tiếp tùy frame mode.
7. Retake shot cuối nếu cần.
8. Ghép ảnh hoàn chỉnh.
9. Upload ảnh lên backend.
10. Hiển thị preview và QR.

Một lượt chụp chỉ có một frame. Muốn dùng frame khác thì quay lại bước chọn frame và bắt đầu lượt mới.

### 3.2 Trên điện thoại

1. Quét QR.
2. Xem ảnh.
3. Chọn `Edit`.
4. Kéo, phóng to, xoay hoặc xóa sticker.
5. Lưu bản edit.
6. Chọn:
   - `Download free`: tải JPEG miễn phí.
   - `Print`: chọn số lượng/kích thước, thanh toán và đưa vào hàng đợi in.

Nếu đã edit, download bản edit mới nhất. Nếu chưa edit, download composite gốc.

---

## 4. Roadmap theo phase

## Phase 0 — Baseline photobooth

**Mục tiêu:** làm core capture → upload → QR → download ổn định.

### Đã có

- Next.js 16 App Router + React + TypeScript frontend.
- Fastify 5 API trên Node.js 20.19+.
- Filesystem persistence cho photos, tokens, edits, print jobs và custom frames.
- Webcam capture.
- MediaPipe hand tracking.
- Ghim tứ giác bằng ngón trỏ.
- Perspective crop.
- Single photo và strip 6 shot.
- QR result page.
- Download JPEG.
- Photo API và compatibility routes cho link cũ.
- API health/readiness, validation, retention và consistency recovery foundation.
- Browser lifecycle cleanup và upload cancellation.
- Print worker poll queue, checksum backup và safe backup verification.

### Cần kiểm tra

- Desktop và mobile cùng Wi-Fi.
- Camera permission bị từ chối.
- Refresh/đóng tab khi camera chạy.
- Upload lỗi hoặc mạng chập chờn.
- QR trên iPhone/Android.
- Đủ 6 shot và retake đúng thứ tự.
- Hiệu năng trên mobile tầm trung.

### Kết quả

Core flow chạy ổn định trong một phiên sự kiện.

---

## Phase 1 — Frame library 10–15 mẫu

**Mục tiêu:** cho user chọn frame trước khi chụp; mỗi lượt chỉ dùng một frame.

### Công việc

- Tạo catalog 10–15 frame.
- Mỗi frame có thumbnail, full artwork, layout type, output dimensions.
- Explicit slot geometry cho strip/collage.
- Version hóa frame.
- Load thumbnail trước.
- Chỉ tải full artwork sau khi user chọn.
- Cache frame đã chọn.
- Lưu `frame_id` và `frame_version` cùng photo.
- Không đổi frame giữa lúc đang chụp.

### Kết quả

User thấy thư viện frame, chọn một frame rõ ràng, rồi booth chỉ tải/dùng đúng frame đó cho lượt chụp.

---

## Phase 2 — Backend lưu ảnh private

**Mục tiêu:** giữ ảnh gốc và bản edit để download, print hoặc dùng nội bộ post-event.

Runtime hiện tại dùng filesystem persistence, không dùng database hoặc object storage. Backup vận hành bằng `npm run backup:data`, tạo archive tar.gz kèm SHA-256, kiểm tra extract vào thư mục tạm và giữ số lượng backup theo `BACKUP_RETENTION_COUNT`. Production yêu cầu secret worker/internal an toàn, `PAYMENT_MODE=webhook` và `PAYMENT_WEBHOOK_KEY`; development có thể dùng mock payment với secret mặc định.

### Công việc

- Lưu composite gốc vào filesystem persistence hiện tại (`PHOTO_DATA_DIR`).
- Lưu metadata trong các JSON records filesystem hiện tại.
- Lưu bản edit và edit recipe.
- Giữ ảnh ở trạng thái private/hidden.
- Không tạo gallery/feed/search.
- Tách QR token khỏi internal record ID.
- Cấu hình retention dài hơn event, không xóa ngay.
- Cleanup sau khi hết retention.
- Lưu frame/version, thời gian tạo và trạng thái ảnh.

### Data model tối thiểu

```text
frames
photos
edits
print_jobs
payments
media_assets
```

### `frames`

```text
id
name
thumbnail_url
asset_url
layout_config
version
is_active
```

### `photos`

```text
id
token
frame_id
frame_version
original_image_url
current_image_url
created_at
stored_until
```

### `edits`

```text
id
photo_id
recipe_json
rendered_image_url
created_at
```

### Kết quả

Ảnh vẫn tồn tại ẩn trên backend sau sự kiện và có thể truy xuất nội bộ khi cần.

---

## Phase 3 — Mobile sticker editor

**Mục tiêu:** chỉnh ảnh nhẹ trên điện thoại sau khi quét QR.

### Route đề xuất

```text
/p/:token       Xem ảnh, download, print
/edit/:token    Chỉnh sticker và lưu bản edit
```

### V1 hỗ trợ

- Kéo sticker bằng touch/pointer.
- Scale bằng pinch hoặc control.
- Rotate.
- Delete.
- Undo.
- Reset.
- Save.
- Download bản edit.
- Print bản edit.

Text đơn giản có thể thêm sau nếu không làm chậm phase.

### Edit recipe

Không ghi đè ảnh gốc. Lưu recipe JSON:

```json
{
  "stickers": [
    {
      "id": "star-01",
      "x": 0.42,
      "y": 0.31,
      "scale": 0.8,
      "rotation": -12,
      "zIndex": 2
    }
  ]
}
```

Tọa độ normalized `0..1` để recipe hoạt động trên nhiều kích thước màn hình.

### Không làm trong V1

- Chỉnh raw shot.
- Đổi frame sau khi chụp.
- Mask/brush.
- Filter chuyên sâu.
- AI retouch.
- Background removal.
- Video editing.
- Layer editor phức tạp.

### Kết quả

User quét QR, thêm sticker, lưu bản edit và tải/in được bản edit.

---

## Phase 4 — Download miễn phí

**Mục tiêu:** khách luôn lấy được ảnh không cần thanh toán.

- Nút download JPEG trên mobile.
- Download edit mới nhất nếu có.
- Download composite gốc nếu chưa edit.
- Tên file ổn định.
- Native share nếu browser hỗ trợ.
- Không login.

Billing không ảnh hưởng download.

---

## Phase 5 — Print có thanh toán

**Mục tiêu:** chỉ thu tiền khi khách muốn in.

### Flow

```text
Mobile
  → Print
  → chọn số bản/kích thước
  → tạo print job
  → thanh toán
  → payment webhook xác nhận
  → queued
  → print worker lấy job
  → máy in
  → completed / failed
```

### Print job tối thiểu

```text
id
photo_id
edit_id
quantity
size
amount
payment_status
print_status
created_at
```

### Trạng thái

```text
pending_payment
paid
queued
printing
completed
failed
cancelled
```

### Billing rule

```text
Chụp ảnh       miễn phí
Quét QR        miễn phí
Edit ảnh       miễn phí
Download       miễn phí
In ảnh         trả phí
```

Không gọi payment provider trực tiếp trong capture request. Capture phải hoàn thành ngay cả khi payment provider lỗi.

### Print worker

```text
Backend
  ↓
Print worker trên máy booth
  ↓
Printer
```

Worker:

- Poll/nhận job.
- Download ảnh đã thanh toán.
- Gửi ảnh cho printer.
- Báo `completed`/`failed`.
- Retry job lỗi có giới hạn.
- Không in trùng job đã hoàn tất.

---

## Phase 6 — Reliability và vận hành tối thiểu

**Mục tiêu:** chạy event mà không cần sửa dữ liệu thủ công liên tục.

- Upload retry.
- Local retry queue.
- Trạng thái upload rõ ràng.
- Print retry và chống duplicate.
- API/print worker health check.
- Request ID và error logs.
- Storage monitoring.
- Retention config.
- Revoke token.
- Basic internal access để tải ảnh post-event.
- Backup metadata và media quan trọng.

Không làm dashboard event lớn, social analytics hoặc permission matrix phức tạp.

---

## 5. Kiến trúc tối giản mục tiêu

```text
                    ┌──────────────────┐
                    │  Booth Browser   │
                    │ frame + capture  │
                    └────────┬─────────┘
                             │ upload
                             ▼
                    ┌──────────────────┐
                    │      Backend     │
                    │ photos / edits   │
                    │ print / payment  │
                    └──────┬─────┬─────┘
                           │     │
                     QR/edit    │ print job
                           │     ▼
                    ┌──────▼─┐  ┌──────────────┐
                    │ Phone  │  │ Print worker │
                    │ edit   │  └──────┬───────┘
                    └────────┘         ▼
                                  ┌──────────┐
                                  │ Printer  │
                                  └──────────┘
```

### Nguyên tắc

- Browser xử lý camera và capture.
- Backend lưu ảnh, edit và print state.
- Phone chỉ edit/download/print.
- Payment chỉ bảo vệ print job.
- Ảnh private/hidden.
- Một frame được chọn trước mỗi lượt.
- Frame library có 10–15 mẫu; full asset chỉ tải khi cần.
- Không tách microservices khi chưa có tải thực tế.

---

## 6. Routes dự kiến

```text
/                         Chọn frame
/booth/:frameId            Capture với frame đã chọn
/result/:token             Preview + QR sau capture
/p/:token                  Xem ảnh, download, print
/edit/:token               Mobile sticker editor
```

Backend API tối thiểu:

```text
GET  /api/frames
POST /api/photos
GET  /api/photos/:token
GET  /api/photos/:token/image
POST /api/photos/:token/edits
GET  /api/photos/:token/edits/latest
POST /api/photos/:token/print-jobs
GET  /api/print-jobs/:id
POST /api/payments/webhook
```

---

## 7. Thứ tự triển khai chính thức

```text
Phase 0  Baseline capture + QR + download
Phase 1  Frame library 10–15 mẫu, chọn 1 frame/lượt
Phase 2  Backend lưu ảnh private và edit metadata
Phase 3  Mobile sticker editor
Phase 4  Download free hoàn chỉnh
Phase 5  Print job + payment + print worker
Phase 6  Reliability, retry và vận hành tối thiểu
```

Không triển khai phase sau khi phase trước chưa chạy end-to-end.

---

## 8. Local development hiện tại

### Yêu cầu

- Node.js `>=20.19`.
- Webcam.
- HTTPS hoặc `localhost` để browser cho phép camera.
- `tar` cho backup; `lp` và máy in nếu chạy print worker.

### Cài đặt

```bash
npm install
cd api && npm install
cd ../web && npm install
cd ..
```

### Chạy web + API

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787

### Biến môi trường API

```bash
PORT=8787
PUBLIC_WEB_BASE_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SESSION_TTL_HOURS=48
MAX_UPLOAD_BYTES=12582912
```

`SESSION_TTL_HOURS` hiện là thời hạn kỹ thuật của prototype. Khi chuyển sang flow lưu ảnh post-event, thời hạn này cần được cấu hình lại theo chính sách lưu trữ đã chọn, không xóa ảnh ngay khi event kết thúc.

### Runtime vận hành

- API: `npm run dev:api` hoặc `npm test --prefix api`.
- Web: `npm run dev:web`, `npm run build --prefix web`, `npm run lint --prefix web`.
- Print worker: `npm run worker:print`.
- Backup: `npm run backup:data`, với `BACKUP_DIR` và `BACKUP_RETENTION_COUNT` nếu cần.

Python/OpenCV desktop instructions are legacy and are not part of the current supported runtime.
