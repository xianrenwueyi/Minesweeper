# 任务拆解与执行计划（Tasks）

- 文档版本：v1.2.0
- 上游依据：`20-technical-plan.md`
- 下游文档：`40-acceptance.md`
- 状态：v1.2 全部完成并验收（见 §0 交接快照与 §3 执行记录）

---

## 0. 交接快照（Handoff，供接替模型阅读）

> 本小节是**接替模型的第一入口**。读完即可无缝接手，无需重读历史对话。

### 0.1 一句话现状

v1.2 的四项新功能（和弦 / 持久化 / 自定义难度 / 移动端手势）**已全部完成并通过验收**：

- 规范 5 份已升到 v1.2；
- 领域层 + 表现层实现完毕；`tsc --noEmit` 零错误；`vitest run` **149 用例全绿**（覆盖率 97.69% / 94.2%）；
- `npm run build` 成功；`npm run test:browser` **31/31 通过**（含和弦、持久化重载、自定义难度、触屏长按）。

> 本节原为「交给接替模型」的交接快照，已由接替模型在同一轮内全部执行完毕；
> 下方各小节保留原始指引并标注实际执行结果，便于回溯「交接是否被忠实执行」。

### 0.2 已完成（verified，勿重复做）

| 项 | 内容 | 验证证据 |
| --- | --- | --- |
| 规范 | 章程/需求/方案/任务/验收 5 份均已升到 v1.2，新增 FR-19~22、NFR-13/14、EC-16~23、ADR-17~21、AC-A44~51、AC-M31~37 | — |
| 领域层 T-20/21/22 | 见下方「核心改动」 | `npx tsc --noEmit` 0 错误；`npx vitest run` **149 用例全绿**（10 个测试文件） |

**领域层核心改动（全部已测）：**

- `src/core/types.ts`：`DifficultyId` 增加 `'custom'`。
- `src/core/config.ts`：新增 `CUSTOM_BOUNDS`（宽9–30/高9–24/雷10–668）、`validateCustom()`、`makeCustomDifficulty()`；`findDifficulty('custom')` 返回 undefined（custom 不走内置表）。
- `src/core/game.ts`：新增 `chordReveal(state, r, c, now)`。语义：仅 `playing` + 目标为「已翻开、非雷、adjacent>0」；邻域旗数 ≠ 数字 → 返回原引用；旗数匹配 → 翻开所有「未翻开且非旗」邻格（0 格经 floodFill 展开）；若邻格含未标旗真雷 → `lose`（explodedAt 指向首个真雷）；翻开后 `isWon` 判定 + 自动补旗。已 import `forEachNeighbor`。
- `src/core/persist.ts`（新文件，纯函数）：`SAVE_VERSION=1`、`serializeGame(state)`、`parseGame(json)`。`parseGame` 对任意输入做 schema 校验，非法/版本不符/终态/尺寸不符一律返回 `null` 且**绝不抛异常**（NFR-13）。存档键名 `SAVE_KEY` 位于 `src/ui/storage.ts`（存储层细节，ADR-21）。
- 测试：`tests/chord.test.ts`、`tests/persist.test.ts` 新建；`tests/config.test.ts` 扩展了自定义校验用例。

### 0.3 ✅ 已完成：表现层 T-23（原为「已写完待验证」）

这些文件已改好且 `tsc --noEmit` 通过，但还没跑 build / 浏览器验收，也**缺 2 处 CSS**：

- `src/ui/dom.ts`：`HudElements` 增加自定义面板元素（`customPanel/customCols/customRows/customMines/customError/customStart`）；`parseCoord()` 移到此文件导出。
- `src/ui/gesture.ts`（新文件）：`attachTouchGestures(board, onLongPress, opts)`，用 Pointer Events（`pointerType==='touch'`），长按 500ms / 位移阈值 10px；返回 `{ lastLongPressAt(), lastTouchEndAt() }`。
- `src/ui/storage.ts`（新文件）：`saveGame/loadGame/clearGame`，终态自动 clear，localStorage 异常静默。
- `src/ui/controller.ts`：**重写**。`createController(elements, initialConfig, initialSeed, opts)` 其中 `opts: { initialState?, onStateChange? }`；`startNewGame(config)` 改为**接收 DifficultyConfig 对象**（不再收 id 字符串）；新增 `chord()`/`restore()`；接线 `dblclick`+`auxclick(button=1)` 和弦、`mousedown(button=1)` preventDefault 防中键滚动、`click`/`contextmenu` 用 `gesture.lastLongPressAt()` 抑制触屏长按后的合成 click 与重复标记；自定义面板 `toggleCustomPanel/hideCustomPanel/prefillCustomPanel/submitCustom`；`lastCustom` 预填默认 16/16/40。
- `src/debug/hooks.ts`：新增 `chord(r,c)`、`newCustomGame(rows,cols,mines,seed?)`、`restore(json)`；`version` 升 `'1.1.0'`。
- `src/main.ts`：启动时 `loadGame()`，`createController(..., { initialState: saved, onStateChange: saveGame })`；注意 `exactOptionalPropertyTypes` 下要**条件构造** options（不能显式传 `undefined`）。
- `index.html`：难度条加「自定义」按钮（`data-difficulty="custom"`）+ `#custom-panel` 表单（三个 number 输入 + `#custom-error` + `#custom-start`）。

**⚠️ 缺的 CSS（下一步必须补）：**
1. `src/ui/grid.css`：给 `.cell` 加 `touch-action: manipulation;`（FR-22 必需，否则长按会触发双击缩放/系统菜单）。
2. `src/style.css`（或 grid.css）：补自定义面板样式 `.custom-panel / .custom-panel__field / .custom-panel__start / .custom-panel__error`（`#custom-panel` 用 `hidden` 属性控制显隐，样式需让面板在难度条下方正常布局）。

### 0.4 ✅ 已完成：T-24 / T-25（原为「未开始」）

- T-24 浏览器验收扩展（见 §0.6 具体步骤）。
- T-25 收尾（README 更新、勾选 30-tasks/40-acceptance 状态、跑全门禁）。

### 0.5 核心架构速览（不必重读 spec 也能上手）

- **分层**：`src/core/**` 纯领域（禁止 DOM/Math.random，NFR-03/04）；`src/ui/**` 表现；`src/debug/hooks.ts` 暴露 `window.__minesweeper`。
- **不可变状态**：所有领域命令返回新 `GameState`；`GameState` 全字段 readonly。类型见 `src/core/types.ts`。
- **关键类型**：`Cell { isMine, isRevealed, mark('none'|'flag'|'question'), adjacent }`；`GameState { config, board, status('ready'|'playing'|'won'|'lost'), seed, firstReveal, explodedAt, startedAt, endedAt }`；`DifficultyConfig { id, name, rows, cols, mineCount }`。
- **命令函数**（`src/core/game.ts`）：`createGame/newGame/revealCell/cycleMark/chordReveal/isTerminal/getFlagCount/getRemainingMines/getRevealedCount/getElapsedSeconds`。
- **布雷**（`src/core/board.ts`）：`layMines` 首击安全区；**展开**（`src/core/flood.ts`）：`floodFill` 迭代显式栈。
- **计时**：真源是时间戳（`getElapsedSeconds = floor((endedAt ?? now) - startedAt)/1000`），250ms 心跳只驱动重绘。
- **渲染**：`src/ui/renderer.ts` 每次状态变化**全量重建**棋盘 DOM（`renderBoard` 里 `replaceChildren`）。
- **持久化链路**：领域 `persist.ts`（纯）→ 表现 `storage.ts`（localStorage）→ `controller.onStateChange` → `main.ts` 装配。

### 0.6 ✅ 已执行完毕：原「下一步任务清单」

**A. 补 CSS（T-23 收尾）**
1. `src/ui/grid.css`：`.cell { touch-action: manipulation; }`（可加在 `.cell` 规则块内）。
2. `src/style.css`：新增 `.custom-panel`（隐藏时的 `[hidden]{display:none}`、显示时 flex 布局）、`.custom-panel__field`（label+input 排版）、`.custom-panel__start`、`.custom-panel__error`（红色小字）。
3. `npx tsc --noEmit` + `npx vitest run` + `npm run build` 三项确认。

**B. 浏览器验收扩展（T-24）**
4. `scripts/lib/cdp.mjs`：给 `launchBrowser` 返回值加 `reload()`（内部 `send('Page.reload')` + `await sleep(300)`）。持久化测试需要它。
5. `scripts/lib/browser-acceptance.mjs`：新增用例（复用现有 `test()`/`assert*` 工具）：
   - **AC-M31 双击和弦**：`newGame('beginner', seed)` → `reveal` 出数字格 → 用 `cycleMark` 给其雷邻居标旗 → 对数字格 `dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))` → 断言邻居被翻开。
   - **AC-M32 中键和弦**：同上但 `dispatchEvent(new MouseEvent('auxclick',{bubbles:true,button:1}))`。
   - **AC-M33 持久化恢复**：`newGame('beginner',42)` + `reveal` → 读 `localStorage.getItem('minesweeper.save.v1')` 非空 → `reload()` → 轮询等 `__minesweeper` → `getSeed()===42` 且 `revealedCount` 与刷新前一致。
   - **AC-M34 终局不保存**：`newGame` + `reveal` 踩雷到 `lost` → 断言 `localStorage` 无该 key → `reload()` → 快照为 `ready` 的初级新局。
   - **AC-M35 自定义难度**：点「自定义」按钮 → 设 `#custom-cols/rows/mines` 的 value → 点 `#custom-start` → 断言棋盘尺寸/雷数/剩余雷数正确；再设非法值（如雷 999）→ 断言 `#custom-error` 有文案且未开局。
   - **AC-M36 长按标旗**：对某未翻开格 `dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:1,bubbles:true,clientX:0,clientY:0}))` → `await sleep(600)` → `dispatchEvent(pointerup)` → 断言 `getCell().mark==='flag'` 且 `isRevealed===false`；再补 EC-23：长按后对同格 `dispatchEvent(new MouseEvent('click',{bubbles:true}))`，断言仍未被翻开。
   - **AC-M37 触屏单击翻开**：短促 pointerdown/up 后 dispatch `click`，断言翻开且未标旗。
6. `npm run test:browser` 全绿。

**C. 收尾（T-25）**
7. 更新 `README.md`：新增「双击/中键和弦」「长按标旗」「自定义难度」「刷新续玩」说明，更新验收钩子用法（`chord/newCustomGame/restore`）。
8. 把 `30-tasks.md` 的 T-23/24/25 与 `40-acceptance.md` 的 AC-M31~37、矩阵 FR-19~22/NFR-13/14/EC-16~23 状态勾选 `[x]`，并在 §3 执行记录补 2~3 行。
9. 全门禁最终确认：`tsc --noEmit`、`vitest run --coverage`（语句≥90/分支≥85）、`npm run build`、`npm run test:browser`。

### 0.7 环境与陷阱（务必照做，避免踩坑）

- **构建工具需要派生子进程**：`npm run build`、`npx vitest run`、`node scripts/run-browser-acceptance.mjs`、`npm run preview` 都会通过 esbuild 派生带管道 stdio 的子进程；若运行环境禁止该行为，构建与测试会失败，需为这些命令提供相应权限。改成 `.mjs` 配置也存在同样的步骤，不必重复尝试。
- **渲染器全量重建 DOM**：任何浏览器断言都必须**操作后重新 `querySelector`**，不能持有旧元素引用（否则读到已脱离文档的节点）——这是上一轮踩过、已写进 plan §8 的教训。
- **`Math.random` 检索误报**：`src/core` 里注释含「Math.random」字样；判定「无真实调用」要用 `Math.random(` 紧跟左括号的模式，或直接确认随机来自 `createRng`。
- **`exactOptionalPropertyTypes`**：可选属性不能显式赋 `undefined`；构造 options 用条件分支（`main.ts` 已这样写，照抄即可）。
- **CDP 驱动**：Node 24 内置 `WebSocket`/`fetch`，`cdp.mjs` 零依赖；`reload()` 后 `window.__minesweeper` 需重新轮询等待，且启动时安装的 error 监听器会被清掉（持久化测试里可不强依赖它，或 reload 后重装）。
- **和弦测试夹具**：直接用 `layMines`/字符串图构造确定性棋盘（见 `tests/chord.test.ts` 的 `parseGrid`/`playingState` 助手），不要用随机种子硬凑。

---

## 1. 使用说明

- 任务按**依赖拓扑序**编号。理论上可按 ID 顺序执行；实际执行时以每项的「依赖」字段为准。
- 状态标记：`[x]` 未开始 / `[x]` 进行中 / `[x]` 已完成 / `[!]` 阻塞。
- 每个任务完成前必须满足章程 §5 的质量门禁（G1 类型 / G2 测试 / G3 构建 / G4 追溯 / G5 规范同步）。
- **规范优先**：执行中发现规范有误，先改对应规范文档，再改代码，并在下表「规范变更」列记录。

### 任务总览

| ID | 任务 | 阶段 | 依赖 | 覆盖需求 | 状态 |
| --- | --- | --- | --- | --- | --- |
| T-01 | 项目脚手架与工具链 | P0 地基 | — | NFR-11, NFR-12 | [x] |
| T-02 | 验证工具链门禁（冒烟） | P0 地基 | T-01 | NFR-06 | [x] |
| T-03 | 领域类型与难度常量 | P0 地基 | T-01 | FR-01, FR-02 | [x] |
| T-04 | 种子随机发生器 | P1 领域 | T-03 | NFR-04, C3 | [x] |
| T-05 | 棋盘构造与工具访问器 | P1 领域 | T-03 | FR-06 | [x] |
| T-06 | 布雷（含首击安全区） | P1 领域 | T-04, T-05 | FR-07 | [x] |
| T-07 | 迭代式空白区展开 | P1 领域 | T-05, T-06 | FR-05, NFR-02 | [x] |
| T-08 | 状态机与命令式核心 API | P1 领域 | T-06, T-07 | FR-04, FR-12, FR-13 | [x] |
| T-09 | 标记循环与派生量 | P1 领域 | T-08 | FR-08, FR-09, FR-10 | [x] |
| T-10 | 计时逻辑 | P1 领域 | T-08 | FR-11 | [x] |
| T-11 | 领域层测试套件与覆盖率门禁 | P1 领域 | T-04..T-10 | NFR-05, 全部 FR | [x] |
| T-12 | HTML 外壳与静态样式 | P2 表现 | T-01 | FR-01, FR-03 | [x] |
| T-13 | 渲染器（状态 → 视图） | P2 表现 | T-03, T-12 | FR-03, FR-10, FR-12, FR-13 | [x] |
| T-14 | 事件控制器与右键抑制 | P2 表现 | T-08, T-13 | FR-04, FR-08, FR-17, FR-16 | [x] |
| T-15 | 计时器驱动与 HUD 装配 | P2 表现 | T-10, T-13, T-14 | FR-10, FR-11 | [x] |
| T-16 | 应用入口装配与验收钩子 | P3 集成 | T-14, T-15 | FR-18, C7 | [x] |
| T-17 | 难度切换与重新开始 | P3 集成 | T-16 | FR-14, FR-15 | [x] |
| T-18 | 自动验收脚本与性能基准 | P4 验收 | T-16, T-17 | NFR-01, FR-18 | [x] |
| T-19 | 终局收尾与文档同步 | P4 验收 | T-18 | 全部 | [x] |
| T-20 | 和弦领域逻辑（chordReveal） | P1 领域 | T-08 | FR-19 | [x] |
| T-21 | 自定义难度与持久化领域逻辑 | P1 领域 | T-03, T-08 | FR-20, FR-21 | [x] |
| T-22 | 领域层测试（chord / persist / custom） | P1 领域 | T-20, T-21 | FR-19, FR-20, FR-21 | [x] |
| T-23 | 表现层：和弦接线 + 存储 + 自定义 UI + 移动端手势 | P2 表现 | T-14, T-15, T-20, T-21 | FR-19, FR-20, FR-21, FR-22, NFR-13, NFR-14 | [x] |
| T-24 | 浏览器验收扩展（chord / 持久化重载 / 自定义 / 长按） | P4 验收 | T-23 | FR-19 ~ FR-22, NFR-13 | [x] |
| T-25 | 收尾：全门禁验证与文档同步 | P4 验收 | T-24 | 全部 | [x] |

### 依赖拓扑图

```
T-01 ──┬── T-02
       ├── T-03 ──┬── T-04 ──┐
       │          └── T-05 ──┴── T-06 ── T-07 ──┐
       │                                        ├── T-08 ──┬── T-09 ──┐
       │                                        │          └── T-10 ──┼── T-11
       └── T-12 ──────────────┐                                       │
                              ├── T-13 ── T-14 ── T-15 ── T-16 ── T-17 ── T-18 ── T-19
                              │             ▲            ▲
                              └─────────────┴────────────┘
                                    (T-14/T-15 依赖 T-08/T-10)

关键路径: T-01 → T-03 → T-05 → T-06 → T-07 → T-08 → T-10 → T-15 → T-16 → T-17 → T-18 → T-19
可并行分支示例: T-04 与 T-05 并行；T-12（HTML/CSS 骨架）可与整个 P1 领域层并行

v1.2 新增路径:
T-08 ──> T-20 ──> T-22 ─┐
T-03 ──> T-21 ──────────┴──> T-23 ──> T-24 ──> T-25
```

---

## 2. 任务详情

### T-01 项目脚手架与工具链

- **阶段**：P0 地基
- **依赖**：无
- **覆盖需求**：NFR-11、NFR-12
- **目标**：建立一个能 `npm install` / `npm run build` / `npx vitest run` 的最小可运行工程。
- **交付物**：
  - `package.json`（`dependencies` 为空；scripts：`dev` / `build` / `preview` / `test` / `typecheck`）
  - `tsconfig.json`（按 plan §7.2 的严格选项）
  - `vite.config.ts`（`base: './'`，含 `test` 配置）
  - `index.html`（最小骨架，按 plan §5.1）
  - `.gitignore`（`node_modules/`、`dist/`）
- **验收**：`npm install` 成功；`npx tsc --noEmit` 通过；`npm run build` 产出 `dist/index.html`。
- **风险**：R-03（版本兼容）、R-04（网络不可用）。若 `npm install` 失败，立即上报并按 R-04 的退化方案处理，不要静默绕过。
- **规范变更**：—

### T-02 验证工具链门禁（冒烟）

- **阶段**：P0 地基
- **依赖**：T-01
- **覆盖需求**：NFR-06
- **目标**：用一个「必然失败一次」的探针确认类型检查与测试门禁**真的在生效**（避免写出永远绿的假门禁）。
- **交付物**：
  - `tests/smoke.test.ts`：断言 1 + 1 === 2
  - 一次性验证：故意引入一个类型错误 → 确认 `tsc` 报错 → 撤销
- **验收**：`npx vitest run` 通过；确认类型错误被捕获后已还原，工作区无残留错误。
- **规范变更**：—

### T-03 领域类型与难度常量

- **阶段**：P0 地基
- **依赖**：T-01
- **覆盖需求**：FR-01、FR-02（数据部分）
- **目标**：落地 plan §3 的类型契约与 requirements §1.4 的难度常量。
- **交付物**：
  - `src/core/types.ts`
  - `src/core/config.ts`：`DIFFICULTIES: readonly DifficultyConfig[]`、`getDifficulty(id)`、`DEFAULT_DIFFICULTY_ID = 'beginner'`
  - `src/core/board.ts`（仅含 `inBounds`、`getCell`、`neighbors` 三个访问器，实现 T-05 的前置部分）
- **验收**：常量值与 requirements §1.4 表格逐项一致；访问器对越界输入有确定行为（返回 `undefined` 或过滤掉，二者选一并写进注释）。
- **规范变更**：—

### T-04 种子随机发生器

- **阶段**：P1 领域
- **依赖**：T-03
- **覆盖需求**：NFR-04、章程 C3
- **目标**：实现可重现的随机源。
- **交付物**：`src/core/rng.ts`（`createRng`、`shuffle`）
- **验收**：
  - 相同种子 → 相同序列（同进程内两次 `createRng(42)` 结果一致）。
  - 全部输出 ∈ `[0, 1)`。
  - `shuffle` 输出是同元素排列且长度不变。
  - `src/core/rng.ts` 中无 `Math.random`。
- **规范变更**：—

### T-05 棋盘构造与工具访问器

- **阶段**：P1 领域
- **依赖**：T-03
- **覆盖需求**：FR-06（邻雷计数）
- **目标**：提供空棋盘构造与邻域遍历原语，作为布雷与展开的共同基础。
- **交付物**：`src/core/board.ts` 扩展：`createEmptyGrid(rows, cols)`、`forEachNeighbor(board, r, c, fn)`、`countAdjacentMines(grid, r, c)`
- **验收**：
  - 空棋盘所有 `isMine=false`、`isRevealed=false`、`mark='none'`、`adjacent=0`。
  - 角落格的邻域数为 3，边格（非角）为 5，内部格为 8。
- **规范变更**：—

### T-06 布雷（含首击安全区）

- **阶段**：P1 领域
- **依赖**：T-04、T-05
- **覆盖需求**：FR-07
- **目标**：实现 plan §4.2 的 `layMines`，包含退化策略。
- **交付物**：`src/core/board.ts` 中的 `layMines(rows, cols, mineCount, first, seed)`
- **验收**：不变量 I1–I5 全部成立（见 plan §4.2）；三难度 × 多种子 × 四角+中心 的首击位置组合下，首击格永远非雷且雷数精确。
- **规范变更**：—

### T-07 迭代式空白区展开

- **阶段**：P1 领域
- **依赖**：T-05、T-06
- **覆盖需求**：FR-05、NFR-02
- **目标**：实现 plan §4.3 的 `floodFill`。
- **交付物**：`src/core/board.ts` 中的 `floodFill(board, start)`
- **验收**：
  - 展开后所有连通 0 格及其边界层均已翻开。
  - 展开不会翻开任何地雷。
  - 展开途中遇 `flag` / `question` 会被清除。
  - 实现为迭代式（显式栈）；用一个大面积展开用例确认无栈溢出。
  - 不修改传入的 `board`（返回新棋盘）。
- **规范变更**：—

### T-08 状态机与命令式核心 API

- **阶段**：P1 领域
- **依赖**：T-06、T-07
- **覆盖需求**：FR-04、FR-12、FR-13
- **目标**：实现 `src/core/game.ts` 的 `createGame` / `revealCell`，严格按 plan §4.4 的 7 步决策顺序。
- **交付物**：`src/core/game.ts`
- **验收**：
  - `ready → playing` 由首次翻开触发，`startedAt` 被正确设置。
  - 翻开地雷 → `lost`，`explodedAt` 记录坐标，全部地雷 `isRevealed=true`。
  - 翻开全部非雷格 → `won`，`endedAt` 被设置。
  - 终态下 `revealCell` 为空操作（返回同一状态语义，不改变内容）。
  - 已翻开格再次 `revealCell` 为空操作（EC-01）。
  - EC-10：翻开最后一格时先结算翻开+展开，再判胜利。
- **规范变更**：—

### T-09 标记循环与派生量

- **阶段**：P1 领域
- **依赖**：T-08
- **覆盖需求**：FR-08、FR-09、FR-10
- **目标**：实现 `cycleMark` 与 `getFlagCount` / `getRemainingMines` / `getRevealedCount`。
- **交付物**：`src/core/game.ts` 扩展
- **验收**：
  - `none → flag → question → none` 循环正确。
  - `flag` 计入旗帜数，`question` 不计入。
  - 剩余雷数可为负（EC-07）。
  - 已翻开格与终态下 `cycleMark` 为空操作（EC-02、EC-03）。
  - 标记不改变 `status`、不设置 `startedAt`（EC-13）。
- **规范变更**：—

### T-10 计时逻辑

- **阶段**：P1 领域
- **依赖**：T-08
- **覆盖需求**：FR-11
- **目标**：实现 `getElapsedSeconds(state, now)` 的时间戳推导与钳制。
- **交付物**：`src/core/game.ts` 扩展
- **验收**：
  - `ready` 态返回 0。
  - `playing` 态由 `now - startedAt` 推导，单位为整秒（向下取整）。
  - 终态返回 `endedAt - startedAt`，且后续传入更大的 `now` 不改变结果（冻结）。
  - 超过 999 秒钳制为 999（EC-11）。
  - 全程使用注入的 `now`，不调用 `Date.now()`。
- **规范变更**：—

### T-11 领域层测试套件与覆盖率门禁

- **阶段**：P1 领域
- **依赖**：T-04 ~ T-10
- **覆盖需求**：NFR-05、全部领域 FR
- **目标**：把 plan §8 的测试策略落成完整用例集，并跑出覆盖率。
- **交付物**：`tests/config.test.ts`、`tests/rng.test.ts`、`tests/board.test.ts`、`tests/game.test.ts`、`tests/flood.test.ts`、`tests/clock.test.ts`
- **验收**：
  - `npx vitest run` 全绿。
  - 语句覆盖 ≥ 90%，分支覆盖 ≥ 85%（NFR-05）。
  - 所有用例使用固定 `seed` 与固定 `now`，无真实时间依赖。
  - EC-01 ~ EC-15 中可在领域层验证的项均有对应用例。
- **规范变更**：—

### T-12 HTML 外壳与静态样式

- **阶段**：P2 表现
- **依赖**：T-01
- **覆盖需求**：FR-01、FR-03（视觉编码）
- **目标**：落地 plan §5.1 的 DOM 结构与全部视觉样式。
- **交付物**：
  - `index.html`（完整 HUD + 难度条 + 状态栏 + 棋盘容器）
  - `src/style.css`（外壳：变量、HUD、难度条、状态栏、说明文字）
  - `src/ui/grid.css`（棋盘与格子：凸起/凹陷格、8 种数字颜色、旗帜/问号/地雷、踩雷红底、错误旗帜叠加）
- **验收**：静态打开时布局完整、无溢出；高级难度 30 列可横向滚动且不撑破页面（实测棋盘 694px，页面无横溢）。
- **规范变更**：—

### T-13 渲染器（状态 → 视图）

- **阶段**：P2 表现
- **依赖**：T-03、T-12
- **覆盖需求**：FR-03、FR-10、FR-12、FR-13
- **目标**：实现 `src/ui/renderer.ts`：把 `GameState` 纯映射为 DOM。
- **交付物**：
  - `src/ui/dom.ts`（元素查询，缺失元素时快速失败）
  - `src/ui/renderer.ts`（`render(state, now)`、`formatCount(n)`）
  - `src/ui/format.ts` 或并入 renderer
- **验收**：
  - 渲染函数不修改 `state`（传入 `Object.freeze` 的状态不报错）。
  - 数字颜色按 FR-03 表格正确；`formatCount` 的补零/负数/钳制行为符合 FR-10。
  - 失败时所有地雷可见且踩中格唯一高亮；错误旗帜显示 🚩+×（ADR-11）。
  - 胜利时自动补旗（ADR-12）。
- **规范变更**：—

### T-14 事件控制器与右键抑制

- **阶段**：P2 表现
- **依赖**：T-08、T-13
- **覆盖需求**：FR-04、FR-08、FR-16、FR-17
- **目标**：实现 `src/ui/controller.ts`：单一委托监听器把 DOM 事件翻译成 core 命令。
- **交付物**：`src/ui/controller.ts`
- **验收**：
  - 左键 → `revealCell`；右键 → `preventDefault()` 后 `cycleMark`（FR-17）。
  - 棋盘容器上只有 1 个 `click` 与 1 个 `contextmenu` 监听器（按委托实现，非逐格绑定）。
  - 终态下点击不改变状态（FR-16）。
  - 点击非格子区域（如棋盘 padding）不抛异常。
- **规范变更**：—

### T-15 计时器驱动与 HUD 装配

- **阶段**：P2 表现
- **依赖**：T-10、T-13、T-14
- **覆盖需求**：FR-10、FR-11
- **目标**：实现 `src/ui/timer.ts` 与 HUD 更新管线。
- **交付物**：`src/ui/timer.ts`（`start(render)` / `stop()`，250ms 心跳）
- **验收**：
  - 首击后计时开始跳动；终态后停止且冻结。
  - 重新开始后归零，且不存在泄漏的 `setInterval`（重启前必须 `clearInterval`）。
  - 剩余雷数在每次标旗/取消标旗后立即更新。
  - 页面切走再切回（标签页挂起）后时间仍正确（因为按时间戳推导）。
- **规范变更**：—

### T-16 应用入口装配与验收钩子

- **阶段**：P3 集成
- **依赖**：T-14、T-15
- **覆盖需求**：FR-18、章程 C7
- **目标**：实现 `src/main.ts` 与 `src/debug/hooks.ts`，完成装配。
- **交付物**：`src/main.ts`、`src/debug/hooks.ts`
- **验收**：
  - `window.__minesweeper` 提供 plan §6 的全部方法，返回值为副本。
  - 通过钩子 `newGame('beginner', 42)` 后 `getSeed() === 42`；同种子两次开局的 `getSnapshot()` 一致（确定性，章程 C3）。
  - 通过钩子 `reveal(r, c)` 与鼠标点击走同一条 core 路径（无重复实现规则）。
- **规范变更**：—

### T-17 难度切换与重新开始

- **阶段**：P3 集成
- **依赖**：T-16
- **覆盖需求**：FR-02、FR-14、FR-15
- **目标**：接通难度按钮、重新开始按钮与键盘 `R`。
- **交付物**：`src/main.ts` 扩展（或 `src/ui/controller.ts` 扩展）
- **验收**：
  - 切换难度立即开新局，且恰好一个按钮为选中态。
  - 重新开始保持当前难度，时钟归零。
  - 切换到相同难度等价于重新开始（EC-15）。
  - 键盘 `R` 触发重新开始，且不干扰右键标记。
- **规范变更**：—

### T-18 自动验收脚本与性能基准

- **阶段**：P4 验收
- **依赖**：T-16、T-17
- **覆盖需求**：NFR-01、FR-18
- **目标**：把 `40-acceptance.md` 中可自动化的验收项写成脚本。
- **交付物**：`tests/acceptance.test.ts`（领域+钩子层）、`scripts/bench.mjs`（或等价基准）、以及手工验收指引
- **验收**：
  - 高级难度下 50 次翻开操作的 P95 < 16ms（NFR-01），若超标按 R-02 的退路优化并更新 ADR。
  - `40-acceptance.md` 中标注「自动」的 AC 项全部被脚本覆盖并通过。
- **规范变更**：—

### T-19 终局收尾与文档同步

- **阶段**：P4 验收
- **依赖**：T-18
- **覆盖需求**：全部
- **目标**：跑完所有质量门禁，同步文档，交付可运行产物。
- **交付物**：
  - `README.md`（玩法说明、开发命令、验收钩子用法）
  - `40-acceptance.md` 追溯矩阵**全部勾选**
  - 本文件状态列全部为 `[x]`
- **验收**：G1/G2/G3/G4/G5 五条门禁全绿；`npm run build` 后 `dist/` 可直接由静态服务器托管并完整游玩一局。
- **规范变更**：—

### T-20 和弦领域逻辑（chordReveal）

- **阶段**：P1 领域
- **依赖**：T-08
- **覆盖需求**：FR-19
- **目标**：在 `src/core/game.ts` 实现 `chordReveal(state, r, c, now)`，复用 `lose` / `floodFill` / `isWon`。
- **交付物**：`src/core/game.ts` 新增 `chordReveal`。
- **验收**：
  - 旗数 ≠ 相邻雷数 → 空操作（返回原 state 引用）。
  - 旗数 = 相邻雷数 → 翻开所有未翻开、非旗邻格（0 格触发展开）。
  - 邻格含未标旗的真雷 → `lost`，`explodedAt` 为该雷，揭示全部地雷。
  - 和弦翻开最后一格 → `won`，自动补旗。
  - 对未翻开 / 空白格 / 终局 → 空操作。
- **规范变更**：—

### T-21 自定义难度与持久化领域逻辑

- **阶段**：P1 领域
- **依赖**：T-03、T-08
- **覆盖需求**：FR-20、FR-21
- **目标**：
  - `src/core/config.ts` 新增 `CUSTOM_BOUNDS`、`validateCustom(rows, cols, mineCount)`、`makeCustomDifficulty(...)`，并把 `'custom'` 加入 `DifficultyId`。
  - `src/core/persist.ts` 新增 `serializeGame(state)` / `parseGame(json)`（纯函数 + schema 校验）。
- **交付物**：`src/core/config.ts` 扩展、`src/core/persist.ts`。
- **验收**：
  - 自定义校验覆盖 EC-21/EC-22：越界、非整数、雷数超 `(cols-1)×(rows-1)` 均被拒；边界值 9×9×10、30×24×667 合法。
  - `serializeGame` ↔ `parseGame` 往返无损（含 `custom` 配置与 `startedAt` 绝对时间戳）。
  - `parseGame` 对损坏 JSON、未知版本、非法字段返回 `null`（不抛异常）。
- **规范变更**：—

### T-22 领域层测试（chord / persist / custom）

- **阶段**：P1 领域
- **依赖**：T-20、T-21
- **覆盖需求**：FR-19、FR-20、FR-21
- **目标**：新增 `tests/chord.test.ts`、`tests/persist.test.ts`，扩展 `tests/config.test.ts`。
- **交付物**：三个测试文件。
- **验收**：覆盖 EC-16 ~ EC-22；`npx vitest run` 全绿；覆盖率维持 ≥90/85。
- **规范变更**：—

### T-23 表现层：和弦接线 + 存储 + 自定义 UI + 移动端手势

- **阶段**：P2 表现
- **依赖**：T-14、T-15、T-20、T-21
- **覆盖需求**：FR-19 ~ FR-22、NFR-13、NFR-14
- **目标**：
  - `controller.ts`：`chord()` 命令；`dblclick` + `auxclick`(button 1) 触发；触屏守卫（`lastTouchEndAt` 抑制 dblclick 和弦）；持久化回调 `onStateChange`。
  - `ui/storage.ts`：`loadGame` / `saveGame` / `clearGame`（含 schema 校验兜底）。
  - `ui/gesture.ts`：Pointer Events 长按检测（500ms、10px 阈值、抑制合成 click）。
  - `index.html` + `grid.css`：新增「自定义」按钮与参数面板；`.cell { touch-action: manipulation }`。
  - `main.ts`：启动时 `loadGame()` 恢复；装配 `onStateChange` → `saveGame`；终态 `clearGame`。
- **交付物**：上述文件。
- **验收**：双击/中键和弦；刷新恢复进行中对局；终局刷新回新局；自定义参数校验与开局；触屏长按标旗不翻开、不弹菜单。
- **规范变更**：—

### T-24 浏览器验收扩展

- **阶段**：P4 验收
- **依赖**：T-23
- **覆盖需求**：FR-19 ~ FR-22、NFR-13
- **目标**：扩展 `scripts/lib/browser-acceptance.mjs`：和弦（双击 + 中键）、持久化重载（`Page.reload`）、自定义难度 UI、长按（合成 PointerEvent）。
- **交付物**：新增验收用例 + CDP `reload()` 能力。
- **验收**：全部用例通过；`npm run test:browser` 退出码 0。
- **规范变更**：—

### T-25 收尾：全门禁验证与文档同步

- **阶段**：P4 验收
- **依赖**：T-24
- **覆盖需求**：全部
- **目标**：G1~G5 门禁全绿；同步 `40-acceptance.md` 矩阵与本文件状态。
- **交付物**：`40-acceptance.md` 勾选、本文件执行记录、`README.md` 玩法更新。
- **验收**：`tsc --noEmit`、`vitest run --coverage`、`npm run build`、`npm run test:browser` 全部通过。
- **规范变更**：—

---

## 3. 执行记录

| 日期 | 任务 | 结果 | 备注 |
| --- | --- | --- | --- |
| 2026-09-27 | T-01 | `[x]` | 脚手架完成。**环境限制**：运行环境禁止带管道的子进程，npm postinstall 与 esbuild 配置打包均受影响。处理：① npm 缓存定向到工作区内 `.npm-cache`；② `npm install --ignore-scripts`；③ 构建/测试在具备相应权限的环境下执行。已记入 plan §7.3 |
| 2026-09-27 | T-02 | `[x]` | 门禁冒烟通过。配置文件名由 `.ts` 改为 `.mjs`（`vite.config.mjs` / `vitest.config.mjs`），但 Vite 7 仍会打包配置文件，故该步骤无法回避 —— 这一点已如实记录，未谎称为通用解 |
| 2026-09-27 | T-03 ~ T-10 | `[x]` | 领域层实现完成。**规范违规 D-04**：`board.ts` 一度达 255 行，超过 NFR-07；后拆出 `src/core/flood.ts`（85 行），最大文件降至 199 行 |
| 2026-09-27 | T-11 | `[x]` | 领域测试套件完成。**规范缺陷 D-03**：覆盖率因 `types.ts`（纯类型、无运行时代码）计入分母而虚低至 83.33%；新增 ADR-13 明确统计口径后为 97.9%/94.07%。**规范缺陷 D-05**：NFR-04 判定条件未排除注释而误报；已重写判定条件。**契约缺陷 D-09/D-10**：`shuffle` 对含 `undefined` 的入参由「静默跳过」改为「显式拒绝」，并把该约束写入 JSDoc |
| 2026-09-27 | T-12 ~ T-17 | `[x]` | 表现层与集成完成。**实现缺陷 D-01**：渲染层用 `status === 'lost'` 判定踩中格，导致失败时全部地雷都打上红色高亮，违反 FR-12 的「唯一高亮」；改为比较 `explodedAt` 坐标（ADR-16） |
| 2026-09-27 | T-18 | `[x]` | 浏览器验收完成。T-18 原计划交付 `scripts/bench.mjs`，实际由 `scripts/lib/browser-acceptance.mjs` 在真实 Chromium 中直接测量 P95（无需独立基准脚本）；新增 ADR-14/ADR-15 记录「零依赖 CDP 驱动 + 内建静态服务器」的决策。首轮 19/24 → 修 D-01/D-02/D-06 后 **24/24 通过**，P95 5.60ms |
| 2026-09-27 | T-19 | `[x]` | 文档同步完成。5 份规范文档 + README 全部更新；追溯矩阵与任务状态全部勾选 |
| 2026-09-27 | T-20 ~ T-22 | `[x]` | v1.2 领域层：`chordReveal`（和弦）、`validateCustom`/`makeCustomDifficulty`（自定义难度）、`persist.ts`（序列化 + schema 校验）。新增 `tests/chord.test.ts`、`tests/persist.test.ts`，扩展 `tests/config.test.ts`。`tsc` 零错误；用例数 121 → **149 全绿** |
| 2026-09-27 | T-23 | `[x]` | v1.2 表现层：`gesture.ts`（Pointer Events 长按）、`storage.ts`（localStorage 封装）、`custom-panel.ts`（自定义难度面板）、`controller.ts` 重构为 config 驱动并接线和弦/持久化/手势、`hooks.ts` 补 `chord`/`newCustomGame`/`restore`、`main.ts` 接入 `loadGame`/`saveGame`、`index.html` 加自定义按钮与面板、补 CSS（`touch-action` + 面板样式）。**规范违规 D-13**：`controller.ts` 一度 259 行超 NFR-07，拆出 `custom-panel.ts` 后最大文件 234 行 |
| 2026-09-27 | T-24 | `[x]` | 浏览器验收扩展：`cdp.mjs` 增加 `reload()`；新增 AC-M31~M37（双击/中键和弦、刷新恢复、终局不落盘、自定义难度、触屏长按与单击）。首轮 29/31 → 修 D-11（AC-M08 断言过时）与 D-12（长按抑制窗口误吞后续点击）后 **31/31 通过** |
| 2026-09-27 | T-25 | `[x]` | 收尾完成：README 更新（玩法/命令/钩子/设计要点/非目标）；`40-acceptance.md` 与本文档状态全部勾选；五条门禁全绿 |
| 2026-09-27 | 验收后修复 | `[x]` | 用户实测：直开 `index.html` 得到空白棋盘（`file://` 下 CORS 阻止 ES 模块与 TS 源码）。记为 **D-15**（可用性缺陷）。修法：`index.html` 加内联经典脚本兜底面板（2s 未挂载即显示原因与替代路径）+ README 警告 + AC-M01 回归断言（正常启动时面板必须隐藏）。已在 `file://` 下对源码与 `dist/` 两种产物实测生效；复跑门禁：tsc 0 错误、149 用例全绿、浏览器验收 **31/31** |

### 3.1 过程反思

1. **测试失败 ≠ 实现有错。** 第一轮 10 项问题中，6 项的源头是测试或规范有误，而实现是对的（D-02/D-06/D-07/D-08 等）。
   若默认「改实现去迁就断言」，会把正确的实现改坏。**流程要求：断言失败先归因，再决定改哪一侧。**
2. **判定条件必须可执行。** NFR-04 的原始判定条件「grep `Math.random` 为空」会被注释文本触发误报，
   也会漏掉「随机性是否真的来自种子」这一实质。规范里的判定条件必须写成**能一次跑出确定结论**的形式。
3. **度量口径本身要经得起审视。** 覆盖率不达标时，第一反应不应是「补测试凑数字」——
   D-03 的真因是分母包含了无运行时代码的类型文件。
4. **验收脚本也要防自身缺陷。** 渲染器整体替换节点属于实现细节，却让「持有旧元素引用」的断言集体失败（D-02）。
   已把「操作后重新查询 DOM」写入 plan §8 作为验收脚本的编写约束。
5. **验收断言会随实现演进而过时。** AC-M08 原本硬编码「棋盘容器恰好 2 个监听器」；
   v1.2 为触屏长按与和弦新增了 7 个容器级监听器，断言随即失效（D-11）。
   **教训：断言应表达「意图」（监听器 O(1) 而非 O(cells)、格子上 0 个），而不是钉死具体数字。**
   已同步改写规范中的判定条件。
6. **时序抑制窗口要能被新交互重置。** 长按后用 500ms 时间窗抑制合成 click，会误吞「长按标旗后立刻点击另一格」。
   修法不是调小窗口，而是**在新手势开始（touch pointerdown）时清除窗口**（D-12）——
   这既修掉了测试，也修掉了一个真实的交互缺陷。

## 4. 修订历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0.0 | 2026-09-27 | 初版：19 个任务，含依赖拓扑图 |
| v1.1.0 | 2026-09-27 | 全部任务完成；补入执行记录（含环境阻塞处理）与过程反思 |
| v1.2.0 | 2026-09-27 | v1.2 四项功能：新增 T-20~T-25 与 §0 交接快照；T-20~T-25 全部完成；补 D-11~D-13 与过程反思 5、6 |
