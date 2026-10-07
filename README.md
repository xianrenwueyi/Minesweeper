# 扫雷 Minesweeper（网页版）

一个零运行时依赖、零后端的网页版扫雷。用原生 TypeScript + Vite 实现，按 **SDD（规范驱动开发）** 流程开发：
先写规范，再按依赖顺序拆解任务，逐项实现并验收。

```
src/core/**   纯领域层（无 DOM、无 Math.random，可确定性测试）
src/ui/**     表现层（状态 → DOM 的纯映射 + 事件委托）
src/debug/**  验收钩子 window.__minesweeper
specs/**      SDD 规范文档（章程 / 需求 / 方案 / 任务 / 验收）
tests/**      领域层测试（Vitest，node 环境）
scripts/**    真实浏览器验收（零依赖 CDP 驱动）
```

## 快速开始

```bash
npm install          # 零运行时依赖，只装 4 个构建/测试工具
npm run dev          # 开发服务器 → http://127.0.0.1:5173
```

> ⚠️ **必须通过本地服务器访问，不要直接双击打开 `index.html`。**
> 本项目用 Vite + TypeScript，`index.html` 引用的是 `/src/main.ts`（TS 源码）。
> 若用 `file://` 直开，浏览器会以 origin `null` 加载，CORS 会阻止 ES 模块与 TS 源码，
> 结果是棋盘空白（控制台报 `blocked by CORS policy` / `net::ERR_FAILED`）。
> 这种情况页面会显示一个黄色提示面板说明原因与替代做法。
>
> 只想看构建产物的话：`npm run build` 然后 `npm run preview` → `http://127.0.0.1:4173/`
> （`dist/index.html` 同样**不能**双击打开，原因相同。）

玩：
- **左键**翻开格子
- **右键**循环标记：🚩 旗帜 → `?` 问号 → 取消
- **双击 / 中键**对已翻开的数字格触发**和弦**：邻域旗数等于该数字时，一键翻开周边
- **触屏**：单击翻开，**长按**（约 0.5s）标旗（触屏不支持和弦）
- **首次点击必定安全**（雷区在首击时才生成，并排除首击格及其 8 邻域）
- **刷新续玩**：进行中的对局会自动保存，刷新/重开浏览器后接着下（终局不保存）
- 点击 🙂 或按 **R** 重新开始；难度条切换初/中/高级，或点**自定义**输入宽/高/雷数

## 可用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR） |
| `npm run typecheck` | `tsc --noEmit`，零错误门禁 |
| `npm test` | 领域层测试（149 个用例） |
| `npm run test:coverage` | 覆盖率门禁（语句 ≥ 90% / 分支 ≥ 85%） |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run test:browser` | **构建 + 在真实 Chromium 中跑 31 项浏览器验收** |

## 规范文档（SDD）

按顺序阅读：

| 文档 | 内容 |
| --- | --- |
| [`specs/00-constitution.md`](specs/00-constitution.md) | 项目章程：8 条核心原则 + 5 条质量门禁。**冲突时以本文件为准** |
| [`specs/10-requirements.md`](specs/10-requirements.md) | 14 个用户故事、22 条 FR、14 条 NFR、23 条边界情况、状态机 |
| [`specs/20-technical-plan.md`](specs/20-technical-plan.md) | 分层架构、类型契约、核心算法、DOM 契约、21 条 ADR |
| [`specs/30-tasks.md`](specs/30-tasks.md) | 25 个任务、依赖拓扑图、关键路径、**交接快照**、执行记录 |
| [`specs/40-acceptance.md`](specs/40-acceptance.md) | 51 条自动验收 + 37 条浏览器验收 + 双向追溯矩阵 + 缺陷记录 |

## 设计要点

- **延后布雷**（ADR-01）：`ready` 阶段棋盘不含任何地雷，首击时才生成雷区。
  「首击必安全」因此是**结构性保证**，而不是事后补丁 —— 状态机里根本不存在 `ready → lost` 的转移。
- **状态全不可变**（ADR-02）：每个命令返回新的 `GameState`，测试可同时断言「新状态正确」与「旧状态未被污染」。
- **种子随机**（ADR-05）：随机性由注入的种子驱动，同种子完全可重现，让「雷区是否合法」这类性质可做回归测试。
- **迭代式展开**（ADR-04）：用显式栈而非递归，避免深展开栈溢出。
- **时间戳计时**（ADR-08）：已用时间由 `now - startedAt` 推导，250ms 心跳只驱动重绘；
  因此计时不累计误差，标签页挂起后回到前台时间依然正确。
- **和弦是「信任标旗」的快捷操作**（ADR-17）：仅在邻域旗数严格等于数字时生效；标错旗的代价就是踩雷。
- **绝对时间戳持久化**（ADR-18）：`startedAt` 直接存 epoch 毫秒，因此「离开页面的时间计入用时」自然成立。
- **存档容错**（NFR-13）：存档损坏 / 版本不符 / 字段非法一律静默回退到新局，不白屏、不抛异常。
- **触屏用 Pointer Events**（ADR-20）：长按 500ms / 位移阈值 10px 区分「标旗」与「滚动」，
  且不干扰鼠标路径；新手势开始即清除抑制窗口，避免误吞紧随其后的点击。
- **渲染是纯映射**（C8）：每次状态变化全量重建棋盘 DOM。480 个节点重建的 P95 实测约 6.8ms，
  换来零 diff 复杂度与「视图完全由状态决定」的可预测性。
- **验收钩子**（FR-18）：`window.__minesweeper` 是正式契约而非调试残留，
  让验收测试能区分「规则错误」与「渲染错误」。

## 验收钩子用法

```js
__minesweeper.newGame('expert', 42)         // 指定难度与种子开局
__minesweeper.newCustomGame(20, 20, 60)     // 自定义难度（行/列/雷数）
__minesweeper.getSnapshot()                 // 只读快照（副本，改不动内部状态）
__minesweeper.getCell(3, 4)                 // 单格 { isMine, isRevealed, mark, adjacent }
__minesweeper.getSeed()                     // 当前种子
__minesweeper.listDifficulties()            // 难度列表
__minesweeper.reveal(3, 4)                  // 受控动作，与鼠标/触屏走同一条规则路径
__minesweeper.cycleMark(3, 4)
__minesweeper.chord(3, 4)                   // 对已翻开数字格执行和弦
__minesweeper.restore(json)                 // 以存档字符串恢复对局（非法存档会抛错）
```

## 环境要求

- **Node 22+**（`npm run test:browser` 依赖全局 `WebSocket`；开发环境实测 v24.21.0）
- 若自动探测不到浏览器，可用环境变量指定：
  `$env:MINESWEEPER_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'`

## 本版本不包含

后端、账号、排行榜、问号以外的标记、键盘方向键导航与读屏支持、响应式深度适配、
音效动画、主题换肤。详见章程 §2「非目标」。

## 许可证

[MIT](LICENSE) © 2026 Minesweeper contributors

可自由使用、修改、分发与商用，需保留版权声明与许可声明。
