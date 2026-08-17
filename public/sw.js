if (!self.define) {
  let e,
    s = {};
  const i = (i, c) => (
    (i = new URL(i + '.js', c).href),
    s[i] ||
      new Promise((s) => {
        if ('document' in self) {
          const e = document.createElement('script');
          (e.src = i), (e.onload = s), document.head.appendChild(e);
        } else (e = i), importScripts(i), s();
      }).then(() => {
        let e = s[i];
        if (!e) throw new Error(`Module ${i} didn’t register its module`);
        return e;
      })
  );
  self.define = (c, n) => {
    const a =
      e ||
      ('document' in self ? document.currentScript.src : '') ||
      location.href;
    if (s[a]) return;
    let t = {};
    const o = (e) => i(e, a),
      r = { module: { uri: a }, exports: t, require: o };
    s[a] = Promise.all(c.map((e) => r[e] || o(e))).then((e) => (n(...e), t));
  };
}
define(['./workbox-e9849328'], function (e) {
  'use strict';
  importScripts(),
    self.skipWaiting(),
    e.clientsClaim(),
    e.precacheAndRoute(
      [
        {
          url: '/_next/app-build-manifest.json',
          revision: '05f2a12274707b45661a2cbf10b5ceb6',
        },
        {
          url: '/_next/static/LIqoX9w0qED5byHipY1Tc/_buildManifest.js',
          revision: '046380ae5bc74b46b6d5eac3eed65355',
        },
        {
          url: '/_next/static/LIqoX9w0qED5byHipY1Tc/_ssgManifest.js',
          revision: 'b6652df95db52feb4daf4eca35380933',
        },
        {
          url: '/_next/static/chunks/139-ddea06d5e2ef58b6.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/29-0844689411ca7d55.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/326-1b9102db7280dc5c.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/459-f2690417cb401ca9.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/477-c764d15b9f9df172.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/51b697cb-f464f3017ac1ea30.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/558-5de99058748f4450.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/682-30cecb523b66cd6a.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/967-7920f1c32a89564f.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/_not-found/page-ac328df06cf68f14.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/admin/page-36377b15dee312f8.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/douban/page-481108ed2cb3617f.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/layout-1a227adba67fdac0.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/login/page-8491439cc84a3bf9.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/page-c2f712b0489ce63d.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/play/page-05b30970ea5e1c1c.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/search/page-e56cd740c6f2993f.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/app/warning/page-11cba4cf9332a238.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/c72274ce-06682d6fc8197e6d.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/da9543df-bf6da1a431d8604f.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/framework-6e06c675866dc992.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/main-93ba1d5b38393766.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/main-app-d0e4bd2762bd94f7.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/pages/_app-792b631a362c29e1.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/pages/_error-9fde6601392a2a99.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/chunks/polyfills-42372ed130431b0a.js',
          revision: '846118c33b2c0e922d7b3a7676f81f6f',
        },
        {
          url: '/_next/static/chunks/webpack-9795e03582d6fbb7.js',
          revision: 'LIqoX9w0qED5byHipY1Tc',
        },
        {
          url: '/_next/static/css/23100062f5d4aac0.css',
          revision: '23100062f5d4aac0',
        },
        {
          url: '/_next/static/css/56cc39df38d07476.css',
          revision: '56cc39df38d07476',
        },
        {
          url: '/_next/static/media/19cfc7226ec3afaa-s.woff2',
          revision: '9dda5cfc9a46f256d0e131bb535e46f8',
        },
        {
          url: '/_next/static/media/21350d82a1f187e9-s.woff2',
          revision: '4e2553027f1d60eff32898367dd4d541',
        },
        {
          url: '/_next/static/media/8e9860b6e62d6359-s.woff2',
          revision: '01ba6c2a184b8cba08b0d57167664d75',
        },
        {
          url: '/_next/static/media/ba9851c3c22cd980-s.woff2',
          revision: '9e494903d6b0ffec1a1e14d34427d44d',
        },
        {
          url: '/_next/static/media/c5fe6dc8356a8c31-s.woff2',
          revision: '027a89e9ab733a145db70f09b8a18b42',
        },
        {
          url: '/_next/static/media/df0a9ae256c0569c-s.woff2',
          revision: 'd54db44de5ccb18886ece2fda72bdfe0',
        },
        {
          url: '/_next/static/media/e4af272ccee01ff0-s.p.woff2',
          revision: '65850a373e258f1c897a2b3d75eb74de',
        },
        { url: '/favicon.ico', revision: '2a440afb7f13a0c990049fc7c383bdd4' },
        {
          url: '/icons/icon-192x192.png',
          revision: 'e214d3db80d2eb6ef7a911b3f9433b81',
        },
        {
          url: '/icons/icon-256x256.png',
          revision: 'a5cd7490191373b684033f1b33c9d9da',
        },
        {
          url: '/icons/icon-384x384.png',
          revision: '8540e29a41812989d2d5bf8f61e1e755',
        },
        {
          url: '/icons/icon-512x512.png',
          revision: '3e5597604f2c5d99d7ab62b02f6863d3',
        },
        { url: '/logo.png', revision: '5c1047adbe59b9a91cc7f8d3d2f95ef4' },
        { url: '/manifest.json', revision: 'f8a4f2b082d6396d3b1a84ce0e267dfe' },
        { url: '/robots.txt', revision: 'e2b2cd8514443456bc6fb9d77b3b1f3e' },
        {
          url: '/screenshot1.png',
          revision: 'd7de3a25686c5b9c9d8c8675bc6109fc',
        },
        {
          url: '/screenshot2.png',
          revision: 'b0b715a3018d2f02aba5d94762473bb6',
        },
        {
          url: '/screenshot3.png',
          revision: '7e454c28e110e291ee12f494fb3cf40c',
        },
      ],
      { ignoreURLParametersMatching: [] }
    ),
    e.cleanupOutdatedCaches(),
    e.registerRoute(
      '/',
      new e.NetworkFirst({
        cacheName: 'start-url',
        plugins: [
          {
            cacheWillUpdate: async ({
              request: e,
              response: s,
              event: i,
              state: c,
            }) =>
              s && 'opaqueredirect' === s.type
                ? new Response(s.body, {
                    status: 200,
                    statusText: 'OK',
                    headers: s.headers,
                  })
                : s,
          },
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      new e.CacheFirst({
        cacheName: 'google-fonts-webfonts',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 31536e3 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      new e.StaleWhileRevalidate({
        cacheName: 'google-fonts-stylesheets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'static-font-assets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'static-image-assets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\/_next\/image\?url=.+$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'next-image',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:mp3|wav|ogg)$/i,
      new e.CacheFirst({
        cacheName: 'static-audio-assets',
        plugins: [
          new e.RangeRequestsPlugin(),
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:mp4)$/i,
      new e.CacheFirst({
        cacheName: 'static-video-assets',
        plugins: [
          new e.RangeRequestsPlugin(),
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:js)$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'static-js-assets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:css|less)$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'static-style-assets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\/_next\/data\/.+\/.+\.json$/i,
      new e.StaleWhileRevalidate({
        cacheName: 'next-data',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      /\.(?:json|xml|csv)$/i,
      new e.NetworkFirst({
        cacheName: 'static-data-assets',
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      ({ url: e }) => {
        if (!(self.origin === e.origin)) return !1;
        const s = e.pathname;
        return !s.startsWith('/api/auth/') && !!s.startsWith('/api/');
      },
      new e.NetworkFirst({
        cacheName: 'apis',
        networkTimeoutSeconds: 10,
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      ({ url: e }) => {
        if (!(self.origin === e.origin)) return !1;
        return !e.pathname.startsWith('/api/');
      },
      new e.NetworkFirst({
        cacheName: 'others',
        networkTimeoutSeconds: 10,
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
        ],
      }),
      'GET'
    ),
    e.registerRoute(
      ({ url: e }) => !(self.origin === e.origin),
      new e.NetworkFirst({
        cacheName: 'cross-origin',
        networkTimeoutSeconds: 10,
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 }),
        ],
      }),
      'GET'
    );
});
