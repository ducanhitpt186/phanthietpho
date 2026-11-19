# Hướng dẫn trang Phan Thiết Phố – GitHub + Vercel + trang admin

(Cập nhật cho bản 11 – gói `phanthietpho-v11-full.zip`. Kho code: https://github.com/ducanhitpt186/phanthietpho – đang để Public)

## Bản 11 có gì mới
- **Phiên làm việc 20 phút**: để yên 20 phút không bấm gì thì tự đăng xuất. Góc trên có đồng hồ ⏱ đếm ngược (chuyển màu đỏ khi còn dưới 2 phút). Có nút **Đăng nhập** và **Đăng xuất**. Trang không còn lưu mật khẩu trên máy.
- **📅 Lịch hẹn**: chọn **Vào ngày** (1 ngày) hoặc **Từ ngày đến ngày** (chọn được sang tháng sau hoặc xa hơn), giờ và ghi chú không bắt buộc. Nút **✓ Xong**, **Sửa**, **Xóa**. Hai tab: **Hôm nay & sắp tới** / **Đã qua / xong**.
- **🔔 Chuông** ở góc trên: số đỏ = số lịch hẹn cần xử lý hôm nay (lịch 1 ngày rơi vào hôm nay, hoặc lịch khoảng ngày đang diễn ra, chưa bấm Xong).
- **Thông báo đẩy + số trên icon app**: mỗi sáng khoảng 7:00 – 8:00 gửi 1 thông báo (hiện cả màn hình khóa) và đặt số trên icon app bằng đúng số ở chuông. Thêm lịch hẹn mới cho hôm nay thì báo ngay.
- **Giao diện phẳng kiểu iOS** (nền xám nhạt, thẻ trắng, tự đổi giao diện tối theo máy).
- Đổi mật khẩu phải nhập **mật khẩu hiện tại**; đổi xong các máy khác tự bị đăng xuất.
- Lịch hẹn và danh sách thiết bị được **mã hóa** trước khi lưu vào thư mục `private` (kho đang Public nên người ngoài không đọc được).

## A. Cập nhật code bản 11 lên GitHub (gói full)
Gói `phanthietpho-v11-full.zip` có **toàn bộ code**: `index.html`, `style.css`, `script.js`, `sw.js`, `manifest.webmanifest`, `vercel.json`, `.vercelignore`, thư mục `admin`, thư mục `api` và tệp hướng dẫn này.
Gói **không có ảnh** (thư mục `assets`, `icons`) và **không có dữ liệu** (`data`, `uploads`, `private`). Những thứ đó đã nằm sẵn trên GitHub nên được giữ nguyên.

1. Giải nén `phanthietpho-v11-full.zip` → được thư mục `phanthietpho-v11-full`.
2. Vào https://github.com/ducanhitpt186/phanthietpho → bấm nút **Add file** (phía trên danh sách tệp) → **Upload files**.
3. Mở thư mục `phanthietpho-v11-full`, bấm **Ctrl + A** (máy Mac: **Command + A**) để chọn tất cả, rồi **kéo thả** vào khung giữa trang GitHub (dùng Chrome hoặc Edge trên máy tính để kéo được cả thư mục).
   - Tệp `.vercelignore` là tệp ẩn. Trên Windows: trong thư mục bấm **Xem** (View) → tích **Mục ẩn** (Hidden items). Trên Mac: bấm **Command + Shift + .** để hiện. Nếu GitHub đã có sẵn tệp này thì bỏ qua cũng được.
4. Kéo xuống dưới → bấm nút xanh **Commit changes**. Tệp cũ cùng tên được thay; ảnh và dữ liệu giữ nguyên.
5. **Làm phần C trước khi chờ Vercel đăng** (cần khóa mới thì thông báo mới chạy). Nếu Vercel đã đăng trước khi có khóa, làm xong phần C thì **Redeploy** như hướng dẫn ở cuối phần C.

## B. Token GitHub (biến `GITHUB_TOKEN`)
1. GitHub → ảnh đại diện → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name** `phanthietpho-admin`, **Expiration** `No expiration`.
3. **Repository access** → **Only select repositories** → chọn `phanthietpho`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write** (quyền này đủ cho cả GitHub Releases).
5. **Generate token** → sao chép `github_pat_...`.

## C. Biến môi trường trên Vercel
Vercel → bấm vào dự án `phanthietpho` → tab **Settings** (thanh trên cùng) → mục **Environment Variables** (cột trái).

Biến đã có từ trước (giữ nguyên):
- `GITHUB_TOKEN` = token ở phần B
- `GITHUB_REPO` = `ducanhitpt186/phanthietpho`
- `GITHUB_BRANCH` = `main`
- (không bắt buộc) `ADMIN_SECRET`. Nếu trước giờ chưa đặt thì **đừng thêm bây giờ**, vì thêm vào sẽ làm mật khẩu đã đổi không dùng được nữa.

**Thêm 3 biến mới của bản 11** (giá trị nằm trong tệp `KHOA-BI-MAT-VERCEL.txt` Claude gửi riêng, không có trong kho):
1. Ô **Key** gõ `VAPID_PUBLIC_KEY`, ô **Value** dán giá trị tương ứng → bấm **Save**.
2. Làm tương tự với `VAPID_PRIVATE_KEY`.
3. Làm tương tự với `CRON_SECRET`.
4. Để mặc định cả 3 môi trường (Production, Preview, Development) đều được chọn.

Sau khi thêm/sửa biến: tab **Deployments** → bấm **⋯** ở dòng trên cùng (bản mới nhất) → **Redeploy** → **Redeploy**.

⚠️ Đặt 1 lần rồi **ĐỪNG ĐỔI** `VAPID_PRIVATE_KEY`: lịch hẹn được mã hóa bằng khóa này, đổi khóa sẽ mất lịch hẹn và mọi máy phải bật thông báo lại.

Kiểm tra: trang admin → cuối trang bấm **Kiểm tra kết nối** → các dòng **Khóa thông báo (VAPID)**, **Nhắc lịch mỗi sáng (Cron 7:00–8:00)**, **Lịch hẹn (mã hóa)** phải có dấu ✓ xanh.

Xem lịch chạy nhắc buổi sáng: Vercel → dự án → **Settings** → **Cron Jobs** → thấy dòng `/api/cron` lịch `0 0 * * *` (0 giờ UTC = 7 giờ sáng Việt Nam; gói miễn phí chạy vào một lúc bất kỳ trong khoảng 7:00 – 7:59). Bấm **Run** ở dòng đó để chạy thử ngay.

## D. Dùng trang admin
1. Trang chính → icon hình người góc trên phải (hoặc `/admin/`) → nhập mật khẩu (mặc định `29081989@`) → **Đăng nhập**.
2. Thanh trên cùng: đồng hồ **⏱** (thời gian còn lại của phiên), **🔔 chuông**, **KHO ↗**, **Xem trang ↗**, **Đăng xuất**.
3. **📅 Lịch hẹn** → **+ Thêm lịch hẹn**:
   - **Tên lịch hẹn** (bắt buộc – chữ này hiện trong thông báo trên điện thoại).
   - **Ngày lên lịch**: bấm **Vào ngày** rồi chọn 1 ngày, hoặc bấm **Từ ngày đến ngày** rồi chọn **Từ ngày** và **Đến ngày** (chọn được ngày của tháng sau). Khung xanh bên dưới hiện lại ngày đã chọn và tổng số ngày để kiểm tra.
   - **Giờ**, **Ghi chú**: không bắt buộc → bấm **Lưu**.
   - Trong danh sách: **✓ Xong** (làm xong thì bấm, số ở chuông giảm), **Sửa**, **Xóa**. Bấm **Đã qua / xong** để xem lịch cũ, **Hoàn tác** để đưa lịch về chưa xong.
4. **🔔 Chuông**: bấm vào xem việc cần xử lý hôm nay và lịch ngày mai; bấm **✓ Xong** ngay trong bảng; **Xem tất cả lịch hẹn** để về danh sách.
5. **Tiện ích hay dùng**: **+ Thêm tiện ích** → Tên, icon, Liên kết (hoặc chọn từ ô **📦 Hoặc chọn tệp từ Kho tệp tải về…**), Ghi chú/Hướng dẫn → **Lưu**. Trang chính cập nhật sau ~1 phút.
6. **🏦 Số tài khoản ngân hàng** (nút **Số TK** dưới nút Facebook trên trang chính): **+ Thêm Ngân Hàng** → Tên ngân hàng, Chủ tài khoản, Số tài khoản, (tùy chọn) **Chọn ảnh mã QR** → **Lưu**. Tối đa 10 ngân hàng. Link riêng: `địa-chỉ-trang/#so-tk`.
7. **📦 Kho tệp tải về** (GitHub Releases, tối đa 50 MB/tệp): **⬆ Chọn tệp để tải lên** (hoặc kéo thả) → **Sao chép link**. Tải lại tệp trùng tên: **OK** để thay thế (link giữ nguyên) hoặc **Hủy** để lưu tên khác.
8. **Quản lý dữ liệu**, **🔒 Đổi mật khẩu** (nhập mật khẩu hiện tại + mật khẩu mới 2 lần), **Dung lượng**, **Kiểm tra kết nối**, **Dọn lịch sử**.

## E. Cài app Quản trị lên iPhone và bật thông báo (làm trên từng máy)
iPhone chỉ nhận thông báo đẩy và hiện số trên icon khi trang admin được **thêm vào màn hình chính** (iOS 16.4 trở lên).
1. Mở **Safari** trên iPhone → vào `địa-chỉ-trang/admin/`.
2. Bấm nút **Chia sẻ** (ô vuông có mũi tên chỉ lên, ở thanh dưới cùng; nếu không thấy, bấm **⋯** rồi **Chia sẻ**).
3. Kéo xuống → **Thêm vào MH chính** → tên để là **Quản trị PTP** → bấm **Thêm** (góc phải trên).
4. Ra màn hình chính → mở app **Quản trị PTP** (icon Phan Thiết Phố) → đăng nhập.
5. Kéo xuống thẻ **🔔 Thông báo trên điện thoại** → bấm **🔔 Bật thông báo trên máy này** → iPhone hỏi → bấm **Cho phép**.
6. Thấy dòng xanh **✓ Máy này ĐANG BẬT thông báo** và dòng **Thiết bị đang nhận thông báo (1): iPhone (app màn hình chính)** là xong.
7. Bấm **Gửi thử thông báo** → khóa màn hình iPhone → sẽ thấy thông báo, và icon app hiện số bằng số ở chuông.

Trên máy tính/Android (Chrome, Edge): mở `/admin/`, đăng nhập, bấm **Bật thông báo trên máy này** → **Cho phép** (không cần cài app; số trên icon chỉ có khi cài app).

Nếu không thấy số trên icon iPhone: **Cài đặt** → **Thông báo** → **Quản trị PTP** → bật **Cho phép thông báo** và **Kiểu tượng** (Badges).
Tắt trên 1 máy: bấm **Tắt trên máy này**. Gỡ máy cũ không dùng nữa: bấm **Gỡ** ở dòng thiết bị đó.

Thông báo hoạt động thế nào:
- Mỗi sáng 7:00 – 8:00: có lịch cần xử lý → 1 thông báo “📅 Hôm nay có N lịch hẹn” kèm tên lịch + số N trên icon. Hôm qua icon còn số mà hôm nay không có việc → 1 thông báo “✅ Hôm nay không có lịch hẹn” để xóa số.
- Thêm (hoặc sửa) lịch hẹn mà lịch đó cần xử lý **hôm nay** → báo ngay lên các máy đã bật.
- Bấm **✓ Xong** thì số trong app cập nhật ngay; số trên icon iPhone cập nhật khi mở app (iPhone không cho đổi số mà không hiện thông báo).

## Quên mật khẩu admin
GitHub → kho `phanthietpho` → thư mục `private` → tệp `admin.json` → **⋯** → **Delete file** → **Commit changes**. Mật khẩu về mặc định `29081989@`.
Lưu ý: nếu đổi `GITHUB_TOKEN` (mà không đặt `ADMIN_SECRET`), mật khẩu đã đổi sẽ không dùng được nữa – xóa `private/admin.json` như trên rồi đặt lại. **Đừng xóa** `private/lichhen.json` (lịch hẹn) và `private/thongbao.json` (thiết bị nhận thông báo).

## Lưu ý
- Kho đang Public: mật khẩu được mã hóa scrypt + khóa bí mật; lịch hẹn và thiết bị được mã hóa AES bằng khóa chỉ nằm trên Vercel – người xem kho không đọc được.
- Lưu lịch hẹn, bật/tắt thông báo không làm Vercel đăng lại trang (commit có `[skip deploy]`).
- Tệp `.exe` để ở thư mục gốc kho sẽ làm kho và trang nặng hơn – nên tải lên **Kho tệp tải về** rồi xóa bản ở thư mục gốc.
- Gói zip không chứa `data`, `uploads`, `private` nên cập nhật code không ghi đè dữ liệu (tiện ích, số tài khoản, mật khẩu, lịch hẹn).
- Xem thử hiệu ứng từng buổi trên trang chính: thêm `?time=sang|trua|chieu|toi` vào cuối địa chỉ trang.
