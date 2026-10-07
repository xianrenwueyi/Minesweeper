/**
 * 浏览器验收入口：在真实 Chromium 中驱动构建产物并执行验收脚本。
 *
 * 用法：node scripts/run-browser-acceptance.mjs
 * 前置：已执行 npm run build（本脚本服务于 dist/ 产物，同时验证 NFR-12 静态可托管）
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from './lib/cdp.mjs';
import { runAcceptance } from './lib/browser-acceptance.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const rawPath = (request.url ?? '/').split('?')[0];
      const relative = decodeURIComponent(rawPath === '/' ? '/index.html' : rawPath);
      const filePath = join(distDir, normalize(relative).replace(/^([/\\])+/, ''));

      if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('404');
        return;
      }

      response.writeHead(200, {
        'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(filePath).pipe(response);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function printReport(result) {
  const total = result.passed.length + result.failed.length;
  console.log(`\n浏览器验收：${result.passed.length}/${total} 通过，${result.failed.length} 失败\n`);

  for (const item of result.passed) {
    console.log(`  ✅ ${item.id.padEnd(12)} ${item.description}`);
    if (item.detail !== '') {
      console.log(`     ${item.detail}`);
    }
  }
  for (const item of result.failed) {
    console.log(`  ❌ ${item.id.padEnd(12)} ${item.description}`);
    console.log(`     ${item.error}`);
  }
  if (result.findings.performance !== undefined) {
    const p = result.findings.performance;
    console.log(
      `\n  性能基准（NFR-01）：样本 ${p.count}，中位 ${p.median.toFixed(2)}ms，P95 ${p.p95.toFixed(2)}ms，最大 ${p.max.toFixed(2)}ms`,
    );
  }
  console.log('');
}

let server;
let browser;

try {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('未找到 dist/index.html，请先运行 npm run build');
  }

  const started = await startStaticServer();
  server = started.server;
  const url = `http://127.0.0.1:${started.port}/`;
  console.log(`静态服务器就绪：${url}`);

  browser = await launchBrowser({ url });

  // 在页面内收集错误，作为 AC-M23 的证据
  await browser.evaluate(`
    window.__errors = [];
    window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandledrejection: ' + String(e.reason)));
    return true;
  `);

  // 轮询等待应用装配完成（CDP 可能在模块脚本执行前就已完成连接）
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    ready = await browser.evaluate(
      `return typeof window.__minesweeper === 'object' && window.__minesweeper !== null;`,
    );
    if (ready === true) break;
    await browser.sleep(100);
  }
  if (ready !== true) {
    throw new Error('页面未暴露 window.__minesweeper，应用可能未能启动');
  }

  const result = await runAcceptance(browser);
  printReport(result);

  browser.close();
  server.close();
  process.exit(result.failed.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`\n浏览器验收无法完成：${error instanceof Error ? error.message : String(error)}\n`);
  if (browser !== undefined) {
    await browser.close();
  }
  if (server !== undefined) {
    server.close();
  }
  process.exit(1);
}
