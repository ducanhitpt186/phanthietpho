/* Service worker riêng cho app Quản trị (phạm vi /admin/):
   nhận thông báo đẩy, hiện trên màn hình khóa và đặt số trên icon app. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function safe(p) { return Promise.resolve(p).catch(function () {}); }

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  var n = typeof d.badge === 'number' ? d.badge : null;
  var jobs = [
    self.registration.showNotification(d.title || 'Phan Thiết Phố', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag || 'ptp',
      renotify: true,
      data: { url: d.url || '/admin/' }
    })
  ];
  // Số trên icon app = đúng số ở chuông
  if (n !== null && self.navigator && 'setAppBadge' in self.navigator) {
    jobs.push(n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge());
  }
  // App đang mở thì báo cho trang tải lại lịch hẹn
  jobs.push(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    list.forEach(function (c) { c.postMessage({ type: 'ptp-push', badge: n }); });
  }));
  e.waitUntil(Promise.all(jobs.map(safe)));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('/admin') !== -1 && 'focus' in list[i]) {
        list[i].postMessage({ type: 'ptp-open', url: url });
        return list[i].focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
