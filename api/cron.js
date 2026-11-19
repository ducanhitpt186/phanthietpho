/* Vercel Cron gọi tệp này mỗi ngày lúc 0:00 UTC (= khoảng 7:00–8:00 sáng giờ Việt Nam)
   để gửi thông báo lịch hẹn trong ngày và đặt số trên icon app. Xem phần "crons" trong vercel.json. */
const admin = require('./admin.js');

module.exports = (req, res) => admin.daily(req, res);
