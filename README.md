# RBS Photobooth

Web photobooth cho sự kiện: webcam, MediaPipe gesture capture, frame library, QR download, mobile sticker edit và print queue.

## Kiến trúc hiện tại

- `web/`: Next.js 16 App Router + React + TypeScript frontend.
- `api/`: Fastify 5 API chạy trên Node.js 20.19+.
- `api/src/data/`: filesystem persistence cho photos, tokens, edits, print jobs và custom frames. Không có database hoặc object-storage service trong runtime hiện tại.
- `worker/`: print worker riêng, poll job đã thanh toán và gửi file tới máy in qua `lp`.
- `packages/contracts/`: các payload TypeScript dùng chung giữa frontend và backend.

Ảnh và metadata là private theo token; public QR links dùng thời hạn truy cập QR, còn retention lưu asset lâu hơn để phục vụ download/print và vận hành.

## Yêu cầu

- Node.js 20.19+
- Webcam và HTTPS hoặc `localhost` cho browser camera permission
- `tar` cho backup
- `lp` và máy in cấu hình sẵn nếu chạy print worker

## Cài đặt và chạy development

```bash
npm install
npm install --prefix api
npm install --prefix web
npm run dev
```

Lệnh này chạy API tại `http://localhost:8787` và Next.js tại `http://localhost:5173`.

Các lệnh riêng:

```bash
npm run dev:api
npm run dev:web
npm test --prefix api
npm run build --prefix web
npm run lint --prefix web
npm run worker:print
```

Mở `http://localhost:5173`, chọn frame, cho phép webcam, hoàn thành gesture capture và quét QR trên trang kết quả.

## Cấu hình API

Copy `api/.env.example` thành file môi trường local nếu cần. Các nhóm cấu hình chính:

- `PHOTO_DATA_DIR`: thư mục persistence; mặc định `api/src/data`.
- `PORT`: API port, mặc định `8787`.
- `PUBLIC_WEB_BASE_URL` hoặc `PUBLIC_BASE_URL`: origin dùng trong QR/public links.
- `CORS_ORIGINS`: danh sách origin được phép.
- `PRINT_WORKER_SECRET`: secret cho print worker.
- `INTERNAL_API_KEY`: secret cho routes vận hành nội bộ.
- `PAYMENT_MODE=mock` chỉ dành cho development/test. Production phải dùng `PAYMENT_MODE=webhook`.
- `PAYMENT_WEBHOOK_KEY`: bắt buộc khi `NODE_ENV=production`; provider-specific signature verification vẫn là boundary cần cấu hình theo provider thật.

Production fail-closed: không được dùng `dev-print-worker`, `dev-internal-key`, mock payment, hoặc bỏ trống `PAYMENT_WEBHOOK_KEY`. Ứng dụng không tự sinh secret.

## Backup và kiểm tra restore

Backup chỉ đóng gói `PHOTO_DATA_DIR`, không bao gồm `.env` files. Archive và checksum được ghi với tên dự đoán được:

```text
backup-YYYYMMDDTHHMMSSZ-xxxxxxxx.tar.gz
backup-YYYYMMDDTHHMMSSZ-xxxxxxxx.tar.gz.sha256
```

Chạy backup:

```bash
npm run backup:data
```

Biến môi trường vận hành:

```text
BACKUP_DIR=./backups
BACKUP_RETENTION_COUNT=7
```

Mỗi backup được checksum, extract vào thư mục tạm để kiểm tra các thư mục persistence (`photos`, `tokens`, `edits`, `idempotency`) rồi mới được xem là thành công. Quy trình này không restore đè lên data live. Backup cũ chỉ bị xóa khi khớp chính xác naming pattern và nằm trong `BACKUP_DIR`.

## Storage consistency và retention

Consistency scan là operational/manual path, không chạy lại toàn bộ storage trên mỗi request. Các quan hệ được kiểm tra gồm token index → photo, photo metadata → original/current asset, edit → photo/asset, idempotency → photo và malformed JSON. Chỉ repair được reservation idempotency stale khi kết quả xác định; corruption mơ hồ được báo cáo/quarantine, không tự động xóa.

Retention bỏ qua record malformed, báo anomaly và tiếp tục xử lý các photo khác. Photo chỉ bị xóa khi `storedUntil` hợp lệ và đã hết hạn.

## Không còn là runtime hiện tại

Hướng dẫn Python/Vite cũ không còn mô tả ứng dụng đang chạy. Runtime hiện tại là Next.js 16 + Fastify 5 + filesystem persistence như phần kiến trúc ở trên.
