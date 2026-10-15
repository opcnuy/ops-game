import { defineConfig, type Plugin } from 'vite';

/** 正式版加上內容安全政策:只允許自己的程式與樣式,不連外、不被嵌入其他網站 */
const csp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
      },
      injectTo: 'head-prepend',
    },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
};

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [csp],
});
