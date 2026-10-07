/**
 * 最小 CDP 驱动（零依赖）
 *
 * 用途：在真实 Chromium 内核中执行验收脚本，把「只能手工点」的验收项变成可重跑的自动项。
 * 依赖：Node 内置 fetch，以及全局 WebSocket（Node 22+ 已具备；本项目要求 Node 22+）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function resolveBrowserPath(candidates = DEFAULT_CANDIDATES) {
  const fromEnv = process.env['MINESWEEPER_BROWSER'];
  if (fromEnv !== undefined && fromEnv !== '' && existsSync(fromEnv)) {
    return fromEnv;
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('未找到 Chrome / Edge。请用 MINESWEEPER_BROWSER 环境变量指定浏览器可执行文件。');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // 浏览器尚未就绪，继续轮询
    }
    await sleep(150);
  }
  throw new Error(`无法连接调试端口：${url}`);
}

/** 启动无头浏览器并连接 CDP */
export async function launchBrowser({ browserPath, url, port = 9333 } = {}) {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('当前 Node 不提供全局 WebSocket，请使用 Node 22 或更高版本');
  }

  const executable = browserPath ?? resolveBrowserPath();
  const userDataDir = mkdtempSync(join(tmpdir(), 'minesweeper-cdp-'));

  const child = spawn(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      url,
    ],
    { stdio: 'ignore' },
  );

  let socket;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((t) => t.type === 'page');
    if (page === undefined) {
      throw new Error('未找到可用的浏览器页面目标');
    }
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
    });
  } catch (error) {
    child.kill();
    throw error;
  }

  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const resolver = pending.get(message.id);
    if (resolver !== undefined) {
      pending.delete(message.id);
      resolver(message);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP 调用超时：${method}`));
      }, 20000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(`CDP ${method} 失败：${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result);
        }
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /** 在页面中求值（自动 await Promise）并返回按值序列化的结果 */
  const evaluate = async (body, { withCommandLineApi = false } = {}) => {
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
      // 开启后页面脚本可使用 getEventListeners()，用于验证事件委托确实只挂了少量监听器
      includeCommandLineAPI: withCommandLineApi,
    });
    if (result.exceptionDetails !== undefined) {
      const description = result.exceptionDetails.exception?.description ?? '未知异常';
      throw new Error(`页面内异常：${description}`);
    }
    return result.result.value;
  };

  const close = async () => {
    try {
      socket.close();
    } catch {
      // 忽略关闭期错误
    }
    child.kill();
    await sleep(250);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // 临时目录清理失败不影响验收结论
    }
  };

  /**
   * 重新加载当前页面（持久化验收 FR-20 需要）。
   * 注意：reload 会清空此前通过 evaluate 注入的监听器与全局变量，
   * 调用方需重新轮询等待 `window.__minesweeper` 就绪。
   */
  const reload = async () => {
    await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });
    await sleep(400);
  };

  return { send, evaluate, close, reload, sleep };
}

/** 在页面中轮询等待某个条件成立 */
export async function waitFor(browser, expression, { timeoutMs = 8000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await browser.evaluate(`return (${expression});`);
    if (value === true) {
      return true;
    }
    await browser.sleep(intervalMs);
  }
  throw new Error(`等待条件超时：${expression}`);
}
