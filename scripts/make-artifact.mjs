// 把 vite 打包結果合成「單一 HTML 片段」(title + style + 容器 + 行內 script),
// 給 Artifact 發布用;發布時平台會自己補上 doctype/head/body。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets';
const files = readdirSync(dist);
const css = readFileSync(join(dist, files.find((f) => f.endsWith('.css'))), 'utf8');
const js = readFileSync(join(dist, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = `<title>營運日常</title>
<style>${css}</style>
<div id="app"></div>
<script type="module">${js}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', html);
// 本機測試用:補上 doctype 與 viewport,模擬平台的外殼
writeFileSync('artifact/test.html', `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`);
console.log('artifact/index.html', (html.length / 1024).toFixed(1) + ' KB');
