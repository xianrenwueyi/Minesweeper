/**
 * 浏览器内验收脚本（把 AC-M 中可自动化的部分真正跑一遍）
 *
 * 与 tests/*.test.ts 的分工：
 *   - tests/**：领域层规则，跑在 node 环境，不需要浏览器
 *   - 本文件：DOM 表现层、事件、真实计时器、构建产物可托管性 —— 必须真实浏览器
 *
 * 返回结构 { passed, failed, skipped, findings } 由调用方负责打印。
 */

const EXPECTED_NUMBER_COLORS = {
  1: 'rgb(25, 118, 210)',
  2: 'rgb(46, 125, 50)',
  3: 'rgb(198, 40, 40)',
  4: 'rgb(81, 45, 168)',
  5: 'rgb(141, 75, 0)',
  6: 'rgb(0, 121, 107)',
  7: 'rgb(33, 33, 33)',
  8: 'rgb(97, 97, 97)',
};

/** 首击即胜利的种子（由 scripts/find-seed.mjs 在真实构建产物中搜索确认） */
const FIRST_CLICK_WIN_SEED = 411;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAcceptance(browser) {
  const passed = [];
  const failed = [];
  const skipped = [];
  const findings = {};

  let step = 0;
  async function test(id, description, body) {
    step += 1;
    try {
      const detail = await body();
      passed.push({ id, description, detail: detail ?? '' });
    } catch (error) {
      failed.push({ id, description, error: error instanceof Error ? error.message : String(error) });
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function assertEqual(actual, expected, label) {
    if (actual !== expected) {
      throw new Error(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
  }

  const evaluate = (body) => browser.evaluate(body);
  /** 需要 getEventListeners() 的求值（CDP 命令行 API） */
  const evaluateWithDevTools = (body) => browser.evaluate(body, { withCommandLineApi: true });

  /** 重新安装页面错误收集器（reload 会清空此前的注入） */
  async function installErrorCollector() {
    await evaluate(`
      window.__errors = [];
      window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
      window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandledrejection: ' + String(e.reason)));
      return true;
    `);
  }

  /** 等待 `window.__minesweeper` 就绪（初始或 reload 后） */
  async function waitForApp() {
    for (let i = 0; i < 100; i += 1) {
      const ready = await evaluate(
        `return typeof window.__minesweeper === 'object' && window.__minesweeper !== null;`,
      );
      if (ready === true) {
        return;
      }
      await browser.sleep(100);
    }
    throw new Error('window.__minesweeper 未就绪（应用可能未能启动）');
  }

  /** 重新加载页面并把此前的错误日志并入累计（FR-20 的 reload 类验收用） */
  async function reloadAndReattach() {
    const before = await evaluate(`return window.__errors ?? [];`);
    findings.preReloadErrors = [...(findings.preReloadErrors ?? []), ...before];
    await browser.reload();
    await waitForApp();
    await installErrorCollector();
  }

  /**
   * 准备一个「可和弦」的局面：翻开首击区 → 找一个已翻开的数字格 → 给它的雷邻居全部标旗。
   * 返回目标坐标与和弦前的已翻开数；找不到则 found=false。
   */
  async function prepareChordTarget() {
    return evaluate(`
      const api = window.__minesweeper;
      api.newGame('beginner', 42);
      api.reveal(4, 4);
      const snap = api.getSnapshot();
      let target = null;
      for (let r = 0; r < snap.rows && target === null; r += 1) {
        for (let c = 0; c < snap.cols; c += 1) {
          const cell = snap.board[r][c];
          if (!cell.isRevealed || cell.isMine || cell.adjacent === 0) continue;
          const mineNbrs = [];
          let hiddenSafe = 0;
          for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= snap.rows || nc < 0 || nc >= snap.cols) continue;
              const n = snap.board[nr][nc];
              if (n.isMine) mineNbrs.push([nr, nc]);
              else if (!n.isRevealed) hiddenSafe += 1;
            }
          }
          if (mineNbrs.length > 0 && mineNbrs.length === cell.adjacent && hiddenSafe > 0) {
            target = { r, c, mineNbrs };
            break;
          }
        }
      }
      if (target === null) return { found: false };
      for (const [r, c] of target.mineNbrs) api.cycleMark(r, c);
      return {
        found: true,
        r: target.r,
        c: target.c,
        flags: target.mineNbrs.length,
        revealedBefore: api.getSnapshot().revealedCount,
      };
    `);
  }


  // ---------------------------------------------------------------- AC-M01/02
  await test('AC-M01/M02', '不同种子产生不同雷区布局', async () => {
    const result = await evaluate(`
      const a = window.__minesweeper;
      a.newGame('intermediate', 1);
      a.reveal(5, 5);
      const first = JSON.stringify(a.getSnapshot().board);
      a.newGame('intermediate', 2);
      a.reveal(5, 5);
      const second = JSON.stringify(a.getSnapshot().board);
      return { same: first === second };
    `);
    assert(result.same === false, '不同种子产生了相同的雷区布局（随机性失效）');
  });

  await test('AC-M01 初始状态', '加载后即为初级 9x9 棋盘，HUD 初值为 010 / 000', async () => {
    // 注意：renderer 每次渲染都会整体替换棋盘节点，因此断言必须【重新查询 DOM】，
    // 不能持有渲染前的元素引用 —— 否则读到的是已脱离文档的陈旧节点。
    const info = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const snapshot = window.__minesweeper.getSnapshot();
      return {
        status: snapshot.status,
        rows: snapshot.rows,
        cols: snapshot.cols,
        mineCount: snapshot.mineCount,
        cells: document.querySelectorAll('#board .cell').length,
        minesText: document.getElementById('mine-counter').textContent,
        timerText: document.getElementById('timer').textContent,
        face: document.getElementById('face-icon').textContent,
        bootErrorHidden: document.getElementById('boot-error').hidden,
      };
    `);
    assertEqual(info.status, 'ready', '初始状态');
    assertEqual(info.rows, 9, '行数');
    assertEqual(info.cols, 9, '列数');
    assertEqual(info.mineCount, 10, '雷数');
    assertEqual(info.cells, 81, '棋盘格子数');
    assertEqual(info.minesText, '010', '剩余雷数显示');
    assertEqual(info.timerText, '000', '计时器显示');
    assertEqual(info.face, '🙂', '初始表情');
    // 回归保护：应用正常启动时，「启动失败」兜底面板必须保持隐藏
    assertEqual(info.bootErrorHidden, true, '#boot-error 兜底面板不应在正常启动时出现');
    return `状态=${info.status} ${info.rows}x${info.cols} 雷=${info.mineCount} 计数=${info.minesText} 计时=${info.timerText}`;
  });

  await test('AC-M02 初始棋盘无雷可窥', 'ready 阶段棋盘不含任何地雷（延后布雷）', async () => {
    const mines = await evaluate(`
      window.__minesweeper.newGame('beginner', 7);
      return window.__minesweeper.getSnapshot().board.flat().filter(c => c.isMine).length;
    `);
    assertEqual(mines, 0, 'ready 阶段地雷数');
  });

  // ------------------------------------------------------------------- AC-M03
  await test('AC-M03 难度切换', '切换难度后棋盘尺寸与 HUD 同步，当前难度按钮唯一高亮', async () => {
    const result = await evaluate(`
      const out = {};
      for (const id of ['beginner', 'intermediate', 'expert']) {
        window.__minesweeper.newGame(id, 5);
        const snap = window.__minesweeper.getSnapshot();
        const active = [...document.querySelectorAll('.difficulty__btn.is-active')].map(b => b.dataset.difficulty);
        out[id] = {
          rows: snap.rows, cols: snap.cols, mines: snap.mineCount,
          active,
          cells: document.querySelectorAll('#board .cell').length,
          counter: document.getElementById('mine-counter').textContent,
        };
      }
      return out;
    `);
    assertEqual(result.beginner.cells, 81, '初级格子数');
    assertEqual(result.intermediate.cells, 256, '中级格子数');
    assertEqual(result.expert.cells, 480, '高级格子数');
    assertEqual(result.expert.rows, 16, '高级行数');
    assertEqual(result.expert.cols, 30, '高级列数');
    assertEqual(result.expert.mines, 99, '高级雷数');
    assertEqual(result.expert.counter, '099', '高级剩余雷数显示');
    for (const id of ['beginner', 'intermediate', 'expert']) {
      assertEqual(result[id].active.length, 1, `${id} 高亮按钮数量`);
      assertEqual(result[id].active[0], id, `${id} 高亮按钮指向`);
    }
    return '9x9/81、16x16/256、16x30/480 全部一致';
  });

  // ------------------------------------------------------------------- AC-M04
  await test('AC-M04 高级难度布局', '30 列不会撑破页面，棋盘可滚动且格子无缝隙', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('expert', 5);
      const board = document.getElementById('board');
      const scroll = board.parentElement;
      const first = board.querySelector('.cell[data-r="0"][data-c="0"]');
      const second = board.querySelector('.cell[data-r="0"][data-c="1"]');
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const cs = getComputedStyle(board);
      return {
        gap: cs.gap || cs.rowGap,
        pitch: Math.round(b.left - a.left),
        cellWidth: Math.round(a.width),
        boardWidth: Math.round(board.getBoundingClientRect().width),
        scrollWidth: scroll.scrollWidth,
        scrollClientWidth: scroll.clientWidth,
        bodyOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    `);
    assertEqual(result.gap, '0px', '格子间距');
    assertEqual(result.pitch, result.cellWidth, '横向步进应等于格子宽度（说明无额外间隙）');
    assert(result.documentScrollWidth <= result.innerWidth + 1, `页面出现横向溢出：${result.documentScrollWidth} > ${result.innerWidth}`);
    return `格子 ${result.cellWidth}px，棋盘宽 ${result.boardWidth}px，滚动区 ${result.scrollClientWidth}/${result.scrollWidth}，页面无横溢`;
  });

  // ------------------------------------------------------------------- AC-M05
  await test('AC-M05 左键翻开与自动展开', '左键点击后棋盘更新，空白区被自动展开', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const before = window.__minesweeper.getSnapshot().revealedCount;
      const cell = document.querySelector('#board .cell[data-r="4"][data-c="4"]');
      cell.click();
      const after = window.__minesweeper.getSnapshot();
      const revealedInDom = document.querySelectorAll('#board .cell.is-revealed').length;
      return { before, after: after.revealedCount, status: after.status, revealedInDom };
    `);
    assertEqual(result.before, 0, '点击前已翻开数');
    assert(result.after > 1, `展开未生效，仅翻开 ${result.after} 格`);
    assertEqual(result.status, 'playing', '点击后状态');
    assertEqual(result.revealedInDom, result.after, 'DOM 中已翻开格数应与规则一致');
    return `一次点击展开 ${result.after} 格，DOM 与规则一致`;
  });

  // ------------------------------------------------------------------- AC-M06
  await test('AC-M06 数字颜色', '1–8 的数字颜色与规范表格一致', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      window.__minesweeper.reveal(4, 4);
      const seen = {};
      for (const cell of document.querySelectorAll('#board .cell.is-number')) {
        const n = Number(cell.textContent);
        if (!(n in seen)) seen[n] = getComputedStyle(cell).color;
      }
      return seen;
    `);
    const numbers = Object.keys(result).map(Number);
    assert(numbers.length >= 2, `只观察到 ${numbers.length} 种数字，无法验证配色`);
    for (const n of numbers) {
      assertEqual(result[n], EXPECTED_NUMBER_COLORS[n], `数字 ${n} 的颜色`);
    }
    return `验证了 ${numbers.join(', ')} 共 ${numbers.length} 种数字配色`;
  });

  // ------------------------------------------------------------------- AC-M07
  await test('AC-M07 标记循环', '右键依次显示 🚩 → ? → 空白', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      // 每次渲染都会替换节点，因此每次都重新查询
      const at = () => document.querySelector('#board .cell[data-r="0"][data-c="0"]');
      const read = () => at().textContent;
      const seq = [read()];
      for (let i = 0; i < 3; i += 1) {
        at().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
        seq.push(read());
      }
      return { seq, marks: [window.__minesweeper.getCell(0, 0).mark] };
    `);
    assertEqual(result.seq[0], '', '初始内容');
    assertEqual(result.seq[1], '🚩', '第一次右键');
    assertEqual(result.seq[2], '?', '第二次右键');
    assertEqual(result.seq[3], '', '第三次右键');
    assertEqual(result.marks[0], 'none', '循环三次后规则层的标记态');
    return result.seq.map((s) => (s === '' ? '(空)' : s)).join(' → ');
  });

  // ------------------------------------------------------------------- AC-M08
  await test('AC-M08 右键抑制与事件委托', '右键不弹菜单；监听器挂在容器上、数量不随格子数增长', async () => {
    const result = await evaluateWithDevTools(`
      const api = window.__minesweeper;
      const board = document.getElementById('board');
      const countListeners = (el) => Object.values(getEventListeners(el)).reduce((sum, list) => sum + list.length, 0);

      api.newGame('beginner', 2026);
      const beginnerCells = document.querySelectorAll('#board .cell').length;
      const beginnerBoard = countListeners(board);
      const beginnerCell = countListeners(document.querySelector('#board .cell[data-r="1"][data-c="1"]'));

      api.newGame('expert', 2026);
      const expertCells = document.querySelectorAll('#board .cell').length;
      const expertBoard = countListeners(board);

      // 右键抑制验证
      api.newGame('beginner', 2026);
      const cell = document.querySelector('#board .cell[data-r="1"][data-c="1"]');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      cell.dispatchEvent(event);

      return {
        prevented: event.defaultPrevented,
        beginnerCells, beginnerBoard, beginnerCell, expertCells, expertBoard,
        types: Object.keys(getEventListeners(board)).sort(),
      };
    `);
    assertEqual(result.prevented, true, 'contextmenu 是否被 preventDefault');
    // 事件委托的判据：格子上 0 个监听器，且容器监听器数不随格子数增长（O(1) 而非 O(cells)）
    assertEqual(result.beginnerCell, 0, '单个格子上不应有监听器（证明使用了委托）');
    assertEqual(result.expertCells > result.beginnerCells, true, '高级难度格子数应更多');
    assertEqual(
      result.beginnerBoard,
      result.expertBoard,
      `容器监听器数不应随格子数变化（初级 ${result.beginnerCells} 格 vs 高级 ${result.expertCells} 格）`,
    );
    assert(
      result.beginnerBoard >= 2 && result.beginnerBoard <= 16,
      `容器监听器数量应在合理常量范围，实际 ${result.beginnerBoard}`,
    );
    return `右键已抑制；容器 ${result.beginnerBoard} 个监听器（${result.types.join('+')}）覆盖 ${result.beginnerCells}/${result.expertCells} 格，格子上 0 个`;
  });

  await test('AC-M08 补充', '连续右键不影响游戏状态，也不启动时钟', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const at = () => document.querySelector('#board .cell[data-r="1"][data-c="1"]');
      for (let i = 0; i < 3; i += 1) {
        at().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      }
      const snap = window.__minesweeper.getSnapshot();
      return {
        status: snap.status,
        elapsed: snap.elapsedSeconds,
        flags: snap.flagCount,
        spent: window.__minesweeper.getCell(1, 1).mark,
        text: at().textContent,
      };
    `);
    assertEqual(result.status, 'ready', '标旗后的状态');
    assertEqual(result.elapsed, 0, '标旗后的已用时间');
    assertEqual(result.flags, 0, '循环三次后旗帜数应回到 0');
    assertEqual(result.spent, 'none', '循环三次后的标记态');
    assertEqual(result.text, '', '循环三次后的格子内容');
    return `状态=${result.status} 计时=${result.elapsed} 旗=${result.flags} 内容=${JSON.stringify(result.text)}`;
  });

  // ------------------------------------------------------------- AC-M09/M10
  await test('AC-M09/M10 剩余雷数', '标旗递减、旗转问号回增', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const right = (r, c) => document.querySelector(\`#board .cell[data-r="\${r}"][data-c="\${c}"]\`)
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      const read = () => document.getElementById('mine-counter').textContent;
      const seq = [read()];
      right(0, 0); right(0, 1); right(0, 2);
      seq.push(read());
      right(0, 0); // 旗 → 问号
      seq.push(read());
      return seq;
    `);
    assertEqual(result[0], '010', '初始剩余雷数');
    assertEqual(result[1], '007', '标 3 面旗后');
    assertEqual(result[2], '008', '其中一面转为问号后');
    return `${result[0]} → ${result[1]} → ${result[2]}`;
  });

  await test('AC-A30/FR-10 负数显示', '旗帜数超过总雷数时显示 -NN', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const right = (r, c) => document.querySelector(\`#board .cell[data-r="\${r}"][data-c="\${c}"]\`)
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      for (let c = 0; c < 9; c += 1) right(0, c);
      for (let c = 0; c < 9; c += 1) right(1, c);
      return { text: document.getElementById('mine-counter').textContent, remaining: window.__minesweeper.getSnapshot().remainingMines };
    `);
    assertEqual(result.text, '-08', '剩余雷数文案');
    assertEqual(result.remaining, -8, '剩余雷数数值');
    return `18 面旗 / 10 雷 → ${result.text}`;
  });

  // ------------------------------------------------------------- AC-M11/M12
  await test('AC-M11/M12 计时器', '首击后开始走动，终局后冻结', async () => {
    await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      document.querySelector('#board .cell[data-r="4"][data-c="4"]').click();
    `);
    const before = await evaluate(`return Number(document.getElementById('timer').textContent);`);
    await sleep(1300);
    const during = await evaluate(`
      return {
        text: document.getElementById('timer').textContent,
        elapsed: window.__minesweeper.getSnapshot().elapsedSeconds,
      };
    `);
    assert(during.elapsed >= 1, `等待 1.3s 后已用时间仍为 ${during.elapsed}s`);
    assertEqual(during.text, String(during.elapsed).padStart(3, '0'), '计时器文案应为 3 位补零');

    const frozen = await evaluate(`
      const mines = [];
      const snap = window.__minesweeper.getSnapshot();
      for (let r = 0; r < snap.rows; r += 1) for (let c = 0; c < snap.cols; c += 1) {
        if (snap.board[r][c].isMine) mines.push([r, c]);
      }
      // 只揭开一个地雷就会进入终态
      window.__minesweeper.reveal(mines[0][0], mines[0][1]);
      return { status: window.__minesweeper.getSnapshot().status, elapsed: window.__minesweeper.getSnapshot().elapsedSeconds };
    `);
    assertEqual(frozen.status, 'lost', '踩雷后状态');
    await sleep(1400);
    const after = await evaluate(`
      return {
        text: document.getElementById('timer').textContent,
        elapsed: window.__minesweeper.getSnapshot().elapsedSeconds,
        statusBar: document.getElementById('status-bar').textContent,
        face: document.getElementById('face-icon').textContent,
      };
    `);
    assertEqual(after.elapsed, frozen.elapsed, '终局后已用时间应冻结');
    assert(after.statusBar.includes('踩雷'), `状态栏未显示失败文案：${after.statusBar}`);
    assertEqual(after.face, '😵', '失败表情');
    assert(after.text.length === 3, `计时器文案长度异常：${after.text}`);
    return `${before}s → ${during.elapsed}s → 冻结 ${after.elapsed}s，状态栏「${after.statusBar}」`;
  });

  // ------------------------------------------------------------ AC-M14/M15
  await test('AC-M14/M15 失败结算', '揭示全部地雷、踩中格唯一高亮、错误旗帜标记', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      window.__minesweeper.reveal(4, 4);
      const snap = window.__minesweeper.getSnapshot();
      const mine = [];
      const hiddenSafe = [];
      for (let r = 0; r < snap.rows; r += 1) for (let c = 0; c < snap.cols; c += 1) {
        if (snap.board[r][c].isMine) mine.push([r, c]);
        // 只有「未翻开的安全格」才能被标旗（已翻开格不可标记，FR-08）
        else if (!snap.board[r][c].isRevealed) hiddenSafe.push([r, c]);
      }
      // 找一个尚未翻开的非雷格标旗，制造「错误旗帜」（已翻开的格子无法被标记）
      if (hiddenSafe.length === 0) throw new Error('该种子下没有可标旗的隐藏安全格，夹具失效');
      const flagged = hiddenSafe[0];
      window.__minesweeper.cycleMark(flagged[0], flagged[1]);
      const flagPlaced = window.__minesweeper.getCell(flagged[0], flagged[1]).mark;
      window.__minesweeper.reveal(mine[0][0], mine[0][1]);

      const after = window.__minesweeper.getSnapshot();
      return {
        status: after.status,
        mineCount: after.mineCount,
        flagPlaced,
        minesVisible: document.querySelectorAll('#board .cell.is-mine').length,
        exploded: document.querySelectorAll('#board .cell.is-exploded').length,
        wrong: document.querySelectorAll('#board .cell.is-wrong').length,
        explodedIsTarget: (() => {
          const el = document.querySelector('#board .cell.is-exploded');
          return el !== null && Number(el.dataset.r) === mine[0][0] && Number(el.dataset.c) === mine[0][1];
        })(),
        allMinesRevealed: after.board.flat().filter(c => c.isMine && c.isRevealed).length,
      };
    `);
    assertEqual(result.status, 'lost', '状态');
    assertEqual(result.flagPlaced, 'flag', '前置条件：错误旗帜已放上');
    assertEqual(result.allMinesRevealed, result.mineCount, '被揭示的地雷数');
    assertEqual(result.minesVisible, result.mineCount, 'DOM 中地雷格数（含踩中格）');
    assertEqual(result.exploded, 1, '踩中格高亮数量必须唯一（FR-12）');
    assertEqual(result.explodedIsTarget, true, '高亮的应是踩中的那一格');
    assertEqual(result.wrong, 1, '错误旗帜标记数量');
    return `揭示 ${result.minesVisible} 颗雷，踩中格唯一高亮，错误旗帜 ×${result.wrong}`;
  });

  // ------------------------------------------------------------------ AC-M18
  await test('AC-M18 终局冻结', '终局后点击棋盘不再产生任何变化', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      window.__minesweeper.reveal(4, 4);
      const snap0 = window.__minesweeper.getSnapshot();
      const mine = [];
      for (let r = 0; r < snap0.rows; r += 1) for (let c = 0; c < snap0.cols; c += 1) {
        if (snap0.board[r][c].isMine) mine.push([r, c]);
      }
      window.__minesweeper.reveal(mine[0][0], mine[0][1]);
      const before = { html: document.getElementById('board').innerHTML, snap: JSON.stringify(window.__minesweeper.getSnapshot()) };

      // 终局后狂点：左键 + 右键混打
      for (let i = 0; i < 12; i += 1) {
        const el = document.querySelector(\`#board .cell[data-r="\${i % 9}"][data-c="\${(i * 3) % 9}"]\`);
        el.click();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      }
      const after = { html: document.getElementById('board').innerHTML, snap: JSON.stringify(window.__minesweeper.getSnapshot()) };
      return { sameHtml: before.html === after.html, sameSnap: before.snap === after.snap };
    `);
    assertEqual(result.sameSnap, true, '终局后状态应完全不变');
    assertEqual(result.sameHtml, true, '终局后 DOM 应完全不变');
  });

  // ------------------------------------------------------------------ AC-M21
  await test('AC-M21 进行中切换难度', '对局中切换难度立即开新局，且不弹确认框', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      window.__minesweeper.reveal(4, 4);
      const during = window.__minesweeper.getSnapshot().status;
      document.querySelector('.difficulty__btn[data-difficulty="intermediate"]').click();
      const after = window.__minesweeper.getSnapshot();
      return {
        during,
        status: after.status,
        rows: after.rows,
        cols: after.cols,
        revealed: after.revealedCount,
        timer: document.getElementById('timer').textContent,
      };
    `);
    assertEqual(result.during, 'playing', '切换前状态');
    assertEqual(result.status, 'ready', '切换后状态');
    assertEqual(result.rows, 16, '切换后行数');
    assertEqual(result.cols, 16, '切换后列数');
    assertEqual(result.revealed, 0, '切换后已翻开数');
    assertEqual(result.timer, '000', '切换后计时器');
  });

  await test('AC-M20 键盘 R', '按 R 重新开始当前难度', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('expert', 2026);
      window.__minesweeper.reveal(8, 15);
      const during = window.__minesweeper.getSnapshot();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      const after = window.__minesweeper.getSnapshot();
      return {
        duringStatus: during.status,
        status: after.status,
        rows: after.rows,
        cols: after.cols,
        revealed: after.revealedCount,
      };
    `);
    assertEqual(result.duringStatus, 'playing', '按 R 前状态');
    assertEqual(result.status, 'ready', '按 R 后状态');
    assertEqual(result.rows, 16, '应保持高级难度行数');
    assertEqual(result.cols, 30, '应保持高级难度列数');
    assertEqual(result.revealed, 0, '重开后已翻开数');
  });

  // ------------------------------------------------------------------ AC-M19
  await test('AC-M19 重新开始按钮', '点击笑脸以当前难度重开，HUD 归零', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('intermediate', 2026);
      window.__minesweeper.reveal(8, 8);
      window.__minesweeper.cycleMark(0, 0);
      document.getElementById('restart-btn').click();
      const snap = window.__minesweeper.getSnapshot();
      return {
        status: snap.status, rows: snap.rows, cols: snap.cols, revealed: snap.revealedCount,
        flags: snap.flagCount, counter: document.getElementById('mine-counter').textContent,
        timer: document.getElementById('timer').textContent, face: document.getElementById('face-icon').textContent,
      };
    `);
    assertEqual(result.status, 'ready', '重开后状态');
    assertEqual(result.rows, 16, '难度应保持中级');
    assertEqual(result.revealed, 0, '重开后已翻开数');
    assertEqual(result.flags, 0, '重开后旗帜数');
    assertEqual(result.counter, '040', '重开后剩余雷数');
    assertEqual(result.timer, '000', '重开后计时器');
    assertEqual(result.face, '🙂', '重开后表情');
  });

  // ---------------------------------------------------------------- AC-M16/17
  await test('AC-M16/M17 胜利结算', '完整赢一局：状态栏、表情、剩余雷数归零、自动补旗', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const first = window.__minesweeper.getSnapshot();
      window.__minesweeper.reveal(4, 4);
      let snap = window.__minesweeper.getSnapshot();
      for (let r = 0; r < snap.rows; r += 1) {
        for (let c = 0; c < snap.cols; c += 1) {
          const cell = snap.board[r][c];
          if (!cell.isMine && !cell.isRevealed) {
            window.__minesweeper.reveal(r, c);
            snap = window.__minesweeper.getSnapshot();
          }
        }
      }
      const cells = [...document.querySelectorAll('#board .cell')];
      return {
        status: snap.status,
        remaining: snap.remainingMines,
        counter: document.getElementById('mine-counter').textContent,
        statusBar: document.getElementById('status-bar').textContent,
        face: document.getElementById('face-icon').textContent,
        flaggedCells: cells.filter(c => c.textContent === '🚩').length,
        mineCount: first.mineCount,
      };
    `);
    assertEqual(result.status, 'won', '终局状态');
    assertEqual(result.remaining, 0, '胜利后剩余雷数');
    assertEqual(result.counter, '000', '胜利后剩余雷数显示');
    assertEqual(result.face, '😎', '胜利表情');
    assert(result.statusBar.includes('胜利'), `状态栏未显示胜利文案：${result.statusBar}`);
    assertEqual(result.flaggedCells, result.mineCount, '胜利时自动补旗数量');
    return `状态栏「${result.statusBar}」，自动补旗 ${result.flaggedCells}/${result.mineCount}`;
  });

  await test('AC-A24 首击即胜', '一次点击完成最后一格时判胜而非判负', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', ${FIRST_CLICK_WIN_SEED});
      window.__minesweeper.reveal(4, 4);
      const snap = window.__minesweeper.getSnapshot();
      return {
        status: snap.status,
        explodedAt: snap.explodedAt,
        revealed: snap.revealedCount,
        expected: snap.rows * snap.cols - snap.mineCount,
      };
    `);
    assertEqual(result.status, 'won', `首击即胜的种子 ${FIRST_CLICK_WIN_SEED} 应判胜`);
    assertEqual(result.explodedAt, null, '不应有踩雷坐标');
    assertEqual(result.revealed, result.expected, '已翻开数应等于非雷格总数');
    return `种子 ${FIRST_CLICK_WIN_SEED}：一次点击翻开 ${result.revealed} 格并直接判胜`;
  });

  // ------------------------------------------------------------------ AC-M26
  await test('AC-M26 验收钩子', '钩子提供完整快照且返回值是副本', async () => {
    const result = await evaluate(`
      const api = window.__minesweeper;
      api.newGame('beginner', 12345);
      const seed = api.getSeed();
      api.newGame('beginner', 12345);
      const snapA = JSON.stringify(api.getSnapshot());
      const first = api.getSnapshot();
      first.status = 'TAMPERED';
      first.remainingMines = 999;
      first.board[0][0].isMine = true;
      api.newGame('beginner', 12345);
      const snapB = JSON.stringify(api.getSnapshot());
      return {
        seed,
        deterministic: snapA === snapB,
        difficulties: api.listDifficulties().map(d => d.id),
        status: api.getSnapshot().status,
        cell: api.getCell(0, 0),
        keys: Object.keys(api.getSnapshot()).sort(),
      };
    `);
    assertEqual(result.seed, 12345, 'getSeed');
    assertEqual(result.deterministic, true, '同种子两次开局快照应完全一致');
    assertEqual(result.difficulties.join(','), 'beginner,intermediate,expert', 'listDifficulties');
    assert(result.cell !== undefined && typeof result.cell.isMine === 'boolean', 'getCell 返回值结构');
    assertEqual(
      result.keys.join(','),
      'board,cols,difficultyId,elapsedSeconds,explodedAt,firstReveal,flagCount,mineCount,remainingMines,revealedCount,rows,seed,status',
      'getSnapshot 字段集',
    );
    return 'getSnapshot/getCell/getSeed/listDifficulties 全部符合契约，副本隔离生效';
  });

  await test('AC-M27 受控动作', '通过钩子操作与鼠标点击走同一条规则路径', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('beginner', 777);
      window.__minesweeper.reveal(4, 4);
      const byHook = window.__minesweeper.getSnapshot();
      const el = document.querySelector('#board .cell[data-r="4"][data-c="4"]');
      const hookRevealed = byHook.board[4][4].isRevealed;
      const domRevealed = el.classList.contains('is-revealed');
      return { hookRevealed, domRevealed, sameText: el.textContent === String(byHook.board[4][4].adjacent) || byHook.board[4][4].adjacent === 0 };
    `);
    assertEqual(result.hookRevealed, true, '钩子操作的规则结果');
    assertEqual(result.domRevealed, true, '鼠标路径的 DOM 结果');
    assertEqual(result.sameText, true, 'DOM 文本应与规则数据一致');
  });

  // ------------------------------------------------------------- AC-M24/M25
  await test('AC-M24/M25 性能', '高级难度连续翻开 50 次的 P95 耗时 < 16ms', async () => {
    const result = await evaluate(`
      window.__minesweeper.newGame('expert', 424242);
      window.__minesweeper.reveal(8, 15);
      let snap = window.__minesweeper.getSnapshot();
      const targets = [];
      for (let r = 0; r < snap.rows && targets.length < 50; r += 1) {
        for (let c = 0; c < snap.cols && targets.length < 50; c += 1) {
          if (!snap.board[r][c].isMine && !snap.board[r][c].isRevealed) targets.push([r, c]);
        }
      }
      const durations = [];
      for (const [r, c] of targets) {
        const t0 = performance.now();
        window.__minesweeper.reveal(r, c);
        durations.push(performance.now() - t0);
      }
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
      return { count: durations.length, p95, max: durations[durations.length - 1], median: durations[Math.floor(durations.length / 2)] };
    `);
    assert(result.count >= 50, `样本量不足：${result.count}`);
    assert(result.p95 < 16, `P95 耗时 ${result.p95.toFixed(2)}ms 超过 16ms 预算（NFR-01）`);
    findings.performance = result;
    return `样本 ${result.count} 次：中位 ${result.median.toFixed(2)}ms，P95 ${result.p95.toFixed(2)}ms，最大 ${result.max.toFixed(2)}ms`;
  });

  // ---------------------------------------------------------------- AC-M31
  await test('AC-M31 双击和弦', '双击已翻开数字格（旗数匹配）翻开周边', async () => {
    const target = await prepareChordTarget();
    assert(target.found === true, '未能构造出可和弦的局面（夹具失效）');
    const result = await evaluate(`
      const cell = document.querySelector('#board .cell[data-r="${target.r}"][data-c="${target.c}"]');
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const snap = window.__minesweeper.getSnapshot();
      return { revealed: snap.revealedCount, status: snap.status, explodedAt: snap.explodedAt };
    `);
    assert(
      result.revealed > target.revealedBefore,
      `双击和弦未翻开任何格子（前 ${target.revealedBefore} → 后 ${result.revealed}）`,
    );
    assert(
      result.status === 'playing' || result.status === 'won',
      `旗数匹配时和弦不应判负，实际 status=${result.status}`,
    );
    assertEqual(result.explodedAt, null, '不应有踩雷坐标');
    return `${target.flags} 面旗；已翻开 ${target.revealedBefore} → ${result.revealed}`;
  });

  // ---------------------------------------------------------------- AC-M32
  await test('AC-M32 中键和弦', '中键（auxclick button=1）与双击等价', async () => {
    const target = await prepareChordTarget();
    assert(target.found === true, '未能构造出可和弦的局面（夹具失效）');
    const result = await evaluate(`
      const cell = document.querySelector('#board .cell[data-r="${target.r}"][data-c="${target.c}"]');
      cell.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      const snap = window.__minesweeper.getSnapshot();
      return { revealed: snap.revealedCount, status: snap.status };
    `);
    assert(result.revealed > target.revealedBefore, '中键和弦未翻开任何格子');
    assert(
      result.status === 'playing' || result.status === 'won',
      `中键和弦不应判负，实际 status=${result.status}`,
    );
    return `已翻开 ${target.revealedBefore} → ${result.revealed}`;
  });

  // ---------------------------------------------------------------- AC-M33
  await test('AC-M33 持久化恢复', '进行中对局刷新后精确恢复（FR-20 / EC-19）', async () => {
    const before = await evaluate(`
      const api = window.__minesweeper;
      api.newGame('beginner', 42);
      api.reveal(4, 4);
      const snap = api.getSnapshot();
      return {
        seed: snap.seed,
        revealed: snap.revealedCount,
        status: snap.status,
        hasSave: window.localStorage.getItem('minesweeper.save.v1') !== null,
      };
    `);
    assertEqual(before.status, 'playing', '刷新前状态');
    assertEqual(before.hasSave, true, '进行中的对局应已写入 localStorage');

    await reloadAndReattach();

    const after = await evaluate(`
      const snap = window.__minesweeper.getSnapshot();
      return { seed: snap.seed, revealed: snap.revealedCount, status: snap.status, rows: snap.rows, cols: snap.cols };
    `);
    assertEqual(after.seed, 42, '刷新后应恢复同一局（种子一致）');
    assertEqual(after.revealed, before.revealed, '刷新后已翻开数应一致');
    assertEqual(after.status, 'playing', '刷新后仍应处于进行中');
    assertEqual(after.rows, 9, '刷新后行数');
    assertEqual(after.cols, 9, '刷新后列数');
    return `种子 42，已翻开 ${after.revealed} 格，刷新后完整恢复`;
  });

  // ---------------------------------------------------------------- AC-M34
  await test('AC-M34 终局不保存', '终局后刷新回到默认新局（FR-20 / EC-20）', async () => {
    const end = await evaluate(`
      const api = window.__minesweeper;
      api.newGame('beginner', 42);
      api.reveal(4, 4);
      const snap = api.getSnapshot();
      let done = false;
      for (let r = 0; r < snap.rows && !done; r += 1) {
        for (let c = 0; c < snap.cols; c += 1) {
          if (snap.board[r][c].isMine) { api.reveal(r, c); done = true; break; }
        }
      }
      return {
        status: api.getSnapshot().status,
        hasSave: window.localStorage.getItem('minesweeper.save.v1') !== null,
      };
    `);
    assertEqual(end.status, 'lost', '踩雷后状态');
    assertEqual(end.hasSave, false, '终局后应清除存档');

    await reloadAndReattach();

    const fresh = await evaluate(`
      const snap = window.__minesweeper.getSnapshot();
      return { status: snap.status, difficultyId: snap.difficultyId, revealed: snap.revealedCount };
    `);
    assertEqual(fresh.status, 'ready', '刷新后应是未开始的新局');
    assertEqual(fresh.difficultyId, 'beginner', '刷新后应是默认难度');
    assertEqual(fresh.revealed, 0, '刷新后不应有已翻开的格子');
    return '终局未落盘，刷新后为初级新局';
  });

  // ---------------------------------------------------------------- AC-M35
  await test('AC-M35 自定义难度', '合法参数开局、非法参数报错不开局（FR-21 / EC-21 / EC-22）', async () => {
    const valid = await evaluate(`
      const api = window.__minesweeper;
      document.querySelector('.difficulty__btn[data-difficulty="custom"]').click();
      const panelShown = !document.getElementById('custom-panel').hidden;
      document.getElementById('custom-cols').value = '12';
      document.getElementById('custom-rows').value = '14';
      document.getElementById('custom-mines').value = '30';
      document.getElementById('custom-start').click();
      const snap = api.getSnapshot();
      return {
        panelShown,
        rows: snap.rows, cols: snap.cols, mineCount: snap.mineCount,
        difficultyId: snap.difficultyId,
        counter: document.getElementById('mine-counter').textContent,
        cells: document.querySelectorAll('#board .cell').length,
        active: [...document.querySelectorAll('.difficulty__btn.is-active')].map((b) => b.dataset.difficulty),
        panelHidden: document.getElementById('custom-panel').hidden,
      };
    `);
    assertEqual(valid.panelShown, true, '点击「自定义」应展开面板');
    assertEqual(valid.cols, 12, '自定义列数');
    assertEqual(valid.rows, 14, '自定义行数');
    assertEqual(valid.mineCount, 30, '自定义雷数');
    assertEqual(valid.difficultyId, 'custom', '难度 id');
    assertEqual(valid.cells, 168, '格子数应为 12×14');
    assertEqual(valid.counter, '030', '剩余雷数显示');
    assertEqual(valid.active.length, 1, '恰好一个难度按钮高亮');
    assertEqual(valid.active[0], 'custom', '高亮的应是「自定义」');
    assertEqual(valid.panelHidden, true, '开局后应收起面板');

    const invalid = await evaluate(`
      const api = window.__minesweeper;
      document.querySelector('.difficulty__btn[data-difficulty="custom"]').click();
      document.getElementById('custom-cols').value = '12';
      document.getElementById('custom-rows').value = '14';
      document.getElementById('custom-mines').value = '999';
      document.getElementById('custom-start').click();
      const snap = api.getSnapshot();
      return {
        error: document.getElementById('custom-error').textContent,
        rows: snap.rows, cols: snap.cols,
        panelHidden: document.getElementById('custom-panel').hidden,
      };
    `);
    assert(invalid.error.length > 0, '非法参数应显示错误信息');
    assertEqual(invalid.cols, 12, '非法参数不应开局（应保持上一局列数）');
    assertEqual(invalid.rows, 14, '非法参数不应开局（应保持上一局行数）');
    assertEqual(invalid.panelHidden, false, '出错时面板应保持展开以便修正');
    return `12×14/30 合法开局；雷数 999 被拒（「${invalid.error}」）`;
  });

  // ---------------------------------------------------------------- AC-M36
  await test('AC-M36 触屏长按标旗', '长按 ≥500ms 标旗、不翻开，且抑制随后的合成 click（FR-22 / EC-23）', async () => {
    await evaluate(`
      window.__minesweeper.newGame('beginner', 2026);
      const cell = document.querySelector('#board .cell[data-r="0"][data-c="0"]');
      cell.dispatchEvent(new PointerEvent('pointerdown', {
        pointerType: 'touch', pointerId: 1, bubbles: true, cancelable: true, clientX: 10, clientY: 10,
      }));
      return true;
    `);
    // 长按阈值 500ms；多等 60ms 确保计时器已触发
    await browser.sleep(560);
    const afterPress = await evaluate(`
      const api = window.__minesweeper;
      const cell = document.querySelector('#board .cell[data-r="0"][data-c="0"]');
      cell.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 1, bubbles: true }));
      const marked = api.getCell(0, 0);
      // 真实触屏上浏览器会在 touchend 后合成 click，这里显式模拟以验证抑制逻辑（EC-23）
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const afterClick = api.getCell(0, 0);
      return {
        mark: marked.mark,
        revealed: marked.isRevealed,
        revealedAfterClick: afterClick.isRevealed,
        text: cell.textContent,
      };
    `);
    assertEqual(afterPress.mark, 'flag', '长按应把标记推进到 flag');
    assertEqual(afterPress.revealed, false, '长按不应翻开格子');
    assertEqual(afterPress.revealedAfterClick, false, '长按后的合成 click 应被抑制，不得翻开（EC-23）');
    return `长按 → 标记 ${afterPress.mark}、未翻开；随后的 click 被抑制`;
  });

  // ---------------------------------------------------------------- AC-M37
  await test('AC-M37 触屏单击翻开', '短促触屏点击等同左键翻开（FR-22）', async () => {
    const result = await evaluate(`
      const api = window.__minesweeper;
      api.newGame('beginner', 2026);
      const at = () => document.querySelector('#board .cell[data-r="3"][data-c="3"]');
      at().dispatchEvent(new PointerEvent('pointerdown', {
        pointerType: 'touch', pointerId: 2, bubbles: true, cancelable: true, clientX: 20, clientY: 20,
      }));
      at().dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 2, bubbles: true }));
      // 模拟浏览器在 tap 后合成的 click
      at().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const cell = api.getCell(3, 3);
      return { revealed: cell.isRevealed, mark: cell.mark, status: api.getSnapshot().status };
    `);
    assertEqual(result.revealed, true, '触屏单击应翻开格子');
    assertEqual(result.mark, 'none', '触屏单击不应标旗');
    assertEqual(result.status, 'playing', '触屏单击后应进入 playing');
    return '短促点击 → 翻开且未标旗';
  });

  // ------------------------------------------------------------------ AC-M23
  await test('AC-M23 无控制台报错', '整轮验收期间页面未产生任何错误（含 reload 前后）', async () => {
    const errors = await evaluate(`return window.__errors ?? [];`);
    const all = [...(findings.preReloadErrors ?? []), ...errors];
    assert(all.length === 0, `捕获到 ${all.length} 条页面错误：${JSON.stringify(all.slice(0, 3))}`);
    const alive = await evaluate(`return document.querySelectorAll('#board .cell').length > 0;`);
    assertEqual(alive, true, '棋盘仍然存在（页面未崩溃）');
    return `累计检查 ${all.length} 条错误（reload 前 ${(findings.preReloadErrors ?? []).length} 条）`;
  });

  return { passed, failed, skipped, findings, steps: step };
}
