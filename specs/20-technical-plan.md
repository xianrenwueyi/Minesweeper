# 技术方案与架构设计（Technical Plan）

- 文档版本：v1.2.0
- 上游依据：`00-constitution.md`、`10-requirements.md`
- 下游文档：`30-tasks.md`、`40-acceptance.md`
- 状态：v1.1 已实现；v1.2 新增和弦/持久化/自定义难度/移动端手势，待实现

---

## 1. 架构总览

### 1.1 分层

```
┌──────────────────────────────────────────────────────────┐
│  表现层 (src/ui/**)                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ renderer.ts  │  │ controller.ts│  │ timer.ts       │  │
│  │ 状态 → DOM    │  │ DOM 事件 → 动作│  │ 1Hz 驱动重绘   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
└─────────┼─────────────────┼──────────────────┼───────────┘
          │ 只读读取          │ 调用命令          │ 触发重绘
          v                 v                  v
┌──────────────────────────────────────────────────────────┐
│  领域层 (src/core/**)  —— 纯函数、不可变、无 DOM             │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ │
│  │  board.ts  │ │  game.ts   │ │  rng.ts  │ │ types.ts │ │
│  │ 布雷/展开/  │ │ 状态机/胜负 │ │ 种子随机 │ │ 类型契约  │ │
│  │ 邻雷计数    │ │ 标记/计时   │ │          │ │          │ │
│  └────────────┘ └────────────┘ └──────────┘ └──────────┘ │
│  ┌────────────┐                                          │
│  │config.ts   │ 难度常量（唯一真源，对应 requirements §1.4）│
│  └────────────┘                                          │
└──────────────────────────────────────────────────────────┘
```

### 1.2 单向数据流

```
用户点击 ──> controller 解析出 (r, c, button)
              │
              ├─> 调用 core 的纯函数 (revealCell / cycleMark)
              │        │
              │        └─> 返回【新的】GameState（不修改旧的）
              │
              ├─> 把新 state 存为 current
              ├─> renderer.render(newState)   // 全量重绘
              └─> 若 state.status 从 playing 变为终态，清除 timer
```

**关键约束**：`renderer` 只读 `GameState`，永远不写；`core` 永远不碰 DOM。

---

## 2. 目录结构

```
Minesweeper/
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
├─ README.md
├─ specs/
│  ├─ 00-constitution.md
│  ├─ 10-requirements.md
│  ├─ 20-technical-plan.md
│  ├─ 30-tasks.md
│  └─ 40-acceptance.md
├─ src/
│  ├─ main.ts               # 入口：装配 core + ui，注册 __minesweeper，接入持久化
│  ├─ style.css
│  ├─ core/                 # 纯领域层（禁止 DOM / Math.random）
│  │  ├─ types.ts
│  │  ├─ config.ts          # 难度常量 + 自定义难度校验（FR-21）
│  │  ├─ rng.ts
│  │  ├─ board.ts           # 访问器 + 布雷
│  │  ├─ flood.ts           # 迭代式展开（自 board.ts 拆出以满足 NFR-07）
│  │  ├─ game.ts            # 状态机 + 翻开/标旗/和弦（FR-19）
│  │  └─ persist.ts         # 存档序列化/反序列化（纯函数，FR-20）
│  ├─ debug/
│  │  └─ hooks.ts           # window.__minesweeper 契约实现（FR-18）
│  └─ ui/
│     ├─ dom.ts             # 元素查询与 HUD 元素契约
│     ├─ renderer.ts
│     ├─ controller.ts      # 事件委托 + 和弦/长按手势（FR-19 / FR-22）
│     ├─ storage.ts         # localStorage 读写封装（FR-20）
│     ├─ gesture.ts         # 触屏长按检测（纯事件层，FR-22）
│     ├─ format.ts
│     ├─ grid.css
│     └─ timer.ts
├─ scripts/
│  ├─ run-browser-acceptance.mjs      # 浏览器验收入口（建构 + 静态服务 + CDP 驱动）
│  └─ lib/
│     ├─ cdp.mjs                      # 最小 CDP 驱动（零依赖）
│     └─ browser-acceptance.mjs       # 验收用例集（AC-M 系列）
└─ tests/
   ├─ config.test.ts
   ├─ rng.test.ts
   ├─ board.test.ts
   ├─ game.test.ts
   ├─ chord.test.ts
   ├─ persist.test.ts
   ├─ mark.test.ts
   ├─ flood.test.ts
   ├─ clock.test.ts
   └─ acceptance.test.ts
```

**模块依赖方向（必须单向，禁止反向 import）**

```
main ──> ui/controller ──> core/game ──> core/board ──> core/types
  │            │                │            │
  │            └──> ui/renderer │            └──> core/rng
  │            └──> ui/timer    ├──> core/persist
  │            └──> ui/storage  └──> core/config
  │            └──> ui/gesture
  └──> debug/hooks ──> core/game
```

`core/**` 不得 import `ui/**` 或 `debug/**`。由 NFR-03 的 grep 门禁保证。
`core/persist.ts` 只做纯序列化/反序列化；`ui/storage.ts` 负责 `localStorage` 读写与健壮性兜底。

---

## 3. 类型契约（`src/core/types.ts`）

```ts
export type Mark = 'none' | 'flag' | 'question';
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';
export type DifficultyId = 'beginner' | 'intermediate' | 'expert' | 'custom';

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly name: string;      // 显示名：初级 / 中级 / 高级 / 自定义
  readonly rows: number;
  readonly cols: number;
  readonly mineCount: number;
}

export interface Coord { readonly r: number; readonly c: number; }

export interface Cell {
  readonly isMine: boolean;
  readonly isRevealed: boolean;
  readonly mark: Mark;
  readonly adjacent: number;   // 0..8，ready 阶段恒为 0
}

export interface GameState {
  readonly config: DifficultyConfig;
  readonly board: readonly (readonly Cell[])[];
  readonly status: GameStatus;
  readonly seed: number;
  readonly firstReveal: Coord | null;
  readonly explodedAt: Coord | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}
```

**设计要点**

- 全部字段 `readonly`，从类型层面强制不可变（章程 C2）。
- `mark` 用字符串联合而非 enum：可序列化、便于快照比对。
- `Cell.adjacent` 在 `ready` 阶段为 0（未计算），不引入 `null`，避免 UI 分支复杂化。

---

## 4. 核心算法设计

### 4.1 种子随机（`rng.ts`）

- 算法：`mulberry32`（32 位，单状态，确定性，分布足够好）。
- API：
  ```ts
  export function createRng(seed: number): () => number;         // 返回 [0,1) 的下一随机数
  export function shuffle<T>(items: readonly T[], rand: () => number): T[];
  ```
- `shuffle` 使用 Fisher–Yates。
- 种子来源：`newGame()` 未指定时由表现层传入 `Date.now() >>> 0`（**不在 core 内取时间**，保持 core 纯净）。

### 4.2 布雷（`board.ts#layMines`）

```
输入: rows, cols, mineCount, first: Coord, seed
输出: readonly Cell[][]

1. 计算安全区：first 及其 8 邻域 ∩ 棋盘内  → Set<index>
2. candidates = 所有棋盘格索引 \ 安全区
3. 若 candidates.length < mineCount:
       candidates = 所有棋盘格索引 \ { first }      // 退化：唯一豁免格（FR-07 步骤 5）
4. 若仍 candidates.length < mineCount:
       取 candidates 全部 + 从安全区（不含 first）按序补足，保证总数精确
5. mined = shuffle(candidates, rng).slice(0, mineCount)
6. 构造 Cell 网格，mined 位置 isMine = true
7. 计算每个非雷格的 adjacent（8 邻域计数）
```

**不变量（测试断言）**

- `I1`：`count(isMine) === mineCount`
- `I2`：`board[first.r][first.c].isMine === false`
- `I3`：`¬∃ (r,c) ∈ 安全区 : board[r][c].isMine`（当步骤 3 未触发时）
- `I4`：`∀ 非雷格 : 0 ≤ adjacent[node] ≤ 8`
- `I5`：`∀ 非雷格 : adjacent[node] === count(8邻域中的 isMine)`

### 4.3 展开（`board.ts#floodFill`）

**必须为迭代实现**（NFR-02），使用显式栈：

```
输入: board, start: Coord
输出: { board: 新棋盘, revealed: number }

stack = [start]
visited = Set()
while stack 非空:
    cur = stack.pop()
    if visited.has(cur) continue
    visited.add(cur)
    cell = board[cur]
    if cell.isRevealed 且 cell.mark === 'none'  → 仍然记录 visible，但不重复入栈
    置 cell.isRevealed = true, cell.mark = 'none'
    if cell.adjacent === 0 且 !cell.isMine:
        for each n in 8邻域(cur) ∩ 棋盘内:
            if !board[n].isRevealed 且 !board[n].isMine:
                stack.push(n)
```

**关键点**

- 遇到地雷**不入栈**（FR-05 约束）。
- 展开时清除标记（FR-05、EC-06）。
- 边界格邻域自动收敛（EC-04）。
- 复杂度 `O(rows × cols)`，`visited` 保证每格最多入栈一次。

### 4.4 状态机（`game.ts`）

```ts
// 纯函数命令，全部返回新 GameState
createGame(config, seed): GameState                                  // status='ready'
revealCell(state, r, c, now): GameState                              // FR-04/05/07/12/13
cycleMark(state, r, c): GameState                                    // FR-08/09
tick(state, now): GameState                                          // FR-11（仅更新结束时刻的显示值）
getElapsedSeconds(state, now): number                                // 派生量
getFlagCount(state): number
getRemainingMines(state): number
getRevealedCount(state): number
isTerminal(state): boolean
```

`revealCell` 的决策顺序（严格按此顺序，满足 EC-10）：

```
1. 若 isTerminal(state)            → 原样返回（空操作）
2. 若 board[r][c].isRevealed       → 原样返回（空操作，EC-01）
3. 若 isMine 且 status !== 'ready' → 触发失败（FR-12）
      注：'ready' 阶段不可能有雷，故此判断实际只在 'playing' 命中
4. 若 status === 'ready'           → layMines(state.config, {r,c}, state.seed)
                                     status = 'playing', startedAt = now
5. 执行 floodFill（步骤 4 已保证起点非雷）
6. 判定胜利：revealedCount === rows*cols - mineCount → status='won', endedAt=now
7. 否则保持 'playing'
```

> **注意顺序陷阱**：步骤 3 判断必须在步骤 4 之前对「非 ready」生效；而 `ready` 状态因初始无雷，绝不会在步骤 3 走失败分支。这保证「不存在 ready → lost 转移」。

### 4.5 计时（`ui/timer.ts` + `game.ts#getElapsedSeconds`）

- **真源是时间戳，不是计数器**（FR-11 最后一条）：`elapsed = floor((endedAt ?? now) - startedAt) / 1000`。
- `setInterval(…, 250)` 仅用于**驱动重绘**，不参与计算，因此不会累计误差。选择 250ms 而非 1000ms 是为了让秒数跳变最多延迟 250ms，视觉上不「卡秒」。
- 钳制：`Math.min(999, Math.max(0, elapsed))`。
- 终态时清除定时器，并把 `endedAt` 冻结值用于显示。

---

## 5. DOM 契约

### 5.1 `index.html` 结构（固定 ID，渲染层依赖）

```
<div class="app">
  <header class="hud">
    <div class="hud__mines"  id="mine-counter">010</div>
    <button class="hud__face" id="restart-btn" aria-label="重新开始">🙂</button>
    <div class="hud__time"   id="timer">000</div>
  </header>

  <nav class="difficulty" id="difficulty-bar">
    <button data-difficulty="beginner"     class="is-active">初级</button>
    <button data-difficulty="intermediate">中级</button>
    <button data-difficulty="expert">高级</button>
  </nav>

  <div class="status-bar" id="status-bar" role="status" aria-live="polite"></div>

  <div class="board" id="board" role="grid"></div>
</div>
```

### 5.2 更新策略

| 元素 | 更新时机 | 方式 |
| --- | --- | --- |
| `#mine-counter` | 每次状态变化 | `textContent` 设为格式化后的剩余雷数 |
| `#timer` | 每次状态变化 + 计时器 tick | `textContent` |
| `#status-bar` | 每次状态变化 | 终态显示结果文案，非终态清空 |
| `#restart-btn` | 每次状态变化 | 表情随状态切换：`ready` 🙂 / `playing` 🙂 / `won` 😎 / `lost` 😵 |
| `#board` | 每次状态变化 | **全量重建**子节点（见下） |
| 难度按钮 `is-active` | 新局时 | 切换 class |

### 5.3 数字格式化

```ts
formatCount(n: number): string   // 0..999 → 补零 3 位；-1..-99 → '-' + 补零 2 位；下限 -99，上限 999
```

### 5.4 棋盘渲染与事件委托

- 渲染：一次性构造 DocumentFragment（`rows × cols` 个 `button.cell`），设置 `data-r` / `data-c`，然后替换 `#board` 的 children。
  - 使用 `<button>` 而非 `<div>` 以获得原生可聚焦能力；不需要额外的键盘处理逻辑。
  - 每个 cell 的 `classList` 由状态映射决定；数字格把数字写入 `textContent` 并加 `data-num="1..8"` 供 CSS 着色。
- 事件：**委托到 `#board` 一个监听器**，通过 `event.target.closest('.cell')` 取 `data-r/data-c`。避免 480 个监听器。
  - `click` → 若 `button === 0` → `revealCell`
  - `contextmenu` → `preventDefault()` + `cycleMark`（FR-17）
- **全量重建的取舍**：480 个节点重建远低于 16ms 预算（NFR-01），换来「渲染即状态的纯映射」（章程 C8）与零 diff 复杂度。若基准超标，退路是「只更新变化的格」，但当前不需要。

### 5.5 无障碍/语义（尽力而为，非承诺）

- `#board` 加 `role="grid"`；格子为可聚焦 `button`，`aria-label` 描述状态（如「第 3 行第 4 列，已翻开，2」）。
- 不做方向键导航（章程 §2 非目标）。

---

## 6. 验收钩子（`src/debug/hooks.ts`）

在 `window` 上挂载 `__minesweeper`，实现 FR-18：

```ts
interface MinesweeperHooks {
  getSnapshot(): Snapshot;                       // 深拷贝，含 board 二维数字/布尔
  getCell(r: number, c: number): CellSnapshot;
  getSeed(): number;
  newGame(difficultyId: DifficultyId, seed?: number): void;
  reveal(r: number, c: number): void;            // 受控动作，与 UI 走同一条 core 路径
  cycleMark(r: number, c: number): void;
  listDifficulties(): readonly DifficultyConfig[];
}
```

- 所有返回值为副本；外部改不动内部状态（FR-18 约束）。
- 该接口用于手工/自动化验收：可在控制台执行固定种子的对局，比对 `getSnapshot()`。

---

## 7. 构建与工具链

### 7.1 `package.json`（关键内容）

```json
{
  "name": "minesweeper",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^7.x",
    "vitest": "^3.x"
  }
}
```

- `dependencies` **不出现**（NFR-11）。
- `@types/node` 不引入：`vite.config.ts` 与测试不使用 node API。

### 7.2 `tsconfig.json` 要点

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

> `noUncheckedIndexedAccess: true` 会让 `board[r][c]` 的类型带上 `undefined`。这是**有意为之**：强制为每个索引访问写边界守卫，避免越界静默失败。代价是访问器代码略啰嗦，收益是边界安全（对应 EC-04 一类场景）。

### 7.3 `vite.config.ts` 要点

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                        // NFR-12：相对路径，dist 可任意托管
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    environment: 'node',             // 领域层测试无需 DOM
    coverage: {
      provider: 'v8',
      // ADR-13：覆盖率只统计含运行时代码的文件
      exclude: ['src/core/types.ts'],
    },
  },
});
```

> 领域层测试全部跑在 `node` 环境，因为 `core/**` 无 DOM 依赖。这是分层带来的直接收益。

**ADR-13（覆盖率口径）**：覆盖率分母只包含**经 `tsc` 编译后产出可执行语句**的文件。
`src/core/types.ts` 全部为 `interface` / `type` 声明，编译后不产生任何 JS，若计入分母会以 0% 拉低整体覆盖率 —— 这是度量口径错误，而非真实缺陷，因此显式排除。

> 实现补充（发现于 T-11）：`vite.config.ts` / `vitest.config.ts` 改为 **`.mjs`**。
> 原因：Vite 7 会无条件通过 esbuild 打包配置文件；`.mjs` 可被 Node 原生导入，少一层转译。
> 注意 Vite 仍会打包该文件，因此这一步只是简化，并不改变构建流程本身。

---

## 8. 测试策略

| 层 | 测试方式 | 覆盖目标 |
| --- | --- | --- |
| `core/rng` | 固定种子 → 断言序列可重现、范围在 [0,1)、shuffle 是排列 | NFR-04 |
| `core/board` | 固定种子 + 固定首击 → 断言 I1–I5 不变量；展开的边界/连通性 | FR-05/06/07, EC-04/05/06/14 |
| `core/game` | 命令序列驱动状态机 → 断言状态转移 | FR-04/08/09/12/13/14/15, EC-01/02/03/08/09/10/12/13/15 |
| `core/game` 计时 | 注入伪造 `now` → 断言秒数推导与钳制 | FR-11, EC-11 |
| `ui/**` | 不做 jsdom 单测；改由**真实 Chromium（CDP 驱动）**在构建产物上验收 | FR-01/02/03/10/16/17/18, NFR-01/08/09/12 |

**浏览器验收（T-18）**

- 入口：`npm run test:browser`（= `vite build` + `node scripts/run-browser-acceptance.mjs`）。
- 机制：脚本内建 `node:http` 静态服务器托管 `dist/`，再以无头 Chromium 打开，
  通过 CDP `Runtime.evaluate` 驱动真实 DOM 与事件（ADR-14 / ADR-15）。
- 关键设计约束：**渲染器每次渲染都会整体替换棋盘节点**，因此验收断言必须在操作后
  *重新查询* DOM，不能持有渲染前的元素引用（否则读到的是已脱离文档的陈旧节点）。
  这一约束已在实践中导致过一次误判，故显式记录。
- 覆盖内容：尺寸与 DOM 节点数、数字配色计算值、`contextmenu` 抑制与事件委托监听器计数、
  标记循环、负数剩余雷数、真实计时器走动与冻结、失败揭示与唯一高亮、终局冻结、
  难度切换、键盘 R、胜利结算与自动补旗、钩子契约与副本隔离、P95 性能基准、零控制台错误。

**测试确定性原则**：所有领域测试必须传入固定 `seed` 与固定 `now`，禁止使用真实时间。这样测试永不 flaky。
浏览器验收中依赖真实时间的两项（计时器走动与冻结）通过「等待 + 比较冻结值」而非精确断言秒数，避免时序脆弱。

**关键测试用例（示例：验证首击安全）**

```ts
for (const config of DIFFICULTIES) {
  for (const seed of [1, 2, 3, 42, 12345]) {
    for (const first of cornersAndCenter(config)) {
      const s = createGame(config, seed);
      const after = revealCell(s, first.r, first.c, 0);
      expect(after.status).not.toBe('lost');
      expect(after.board[first.r][first.c].isMine).toBe(false);
      expect(countMines(after.board)).toBe(config.mineCount);
    }
  }
}
```

---

## 9. 决策记录（ADR）

| ID | 决策 | 备选 | 理由 |
| --- | --- | --- | --- |
| ADR-01 | 延后布雷（首击时才生成雷区） | 开局即布雷 + 首击命中则重排 | 延后布雷是**结构性保证**首击安全；重排方案存在「重排后仍不安全」的实现陷阱与额外随机调用 |
| ADR-02 | 状态全量不可变，命令返回新状态 | 就地可变 + 观察者 | 测试可断言旧状态未被污染；配合「渲染纯映射」，避免隐式状态同步 bug |
| ADR-03 | 每次渲染全量重建棋盘 DOM | 增量 diff | 480 节点重建远低于 16ms 预算；换来零 diff 复杂度与 C8 纯映射保证 |
| ADR-04 | 展开使用显式栈的迭代实现 | 递归 `floodFill` | NFR-02：避免深展开栈溢出，且便于加 `visited` 剪枝 |
| ADR-05 | 种子随机注入 core，`Date.now()` 只在表现层产生种子 | core 内直接 `Math.random()` | NFR-04 + 章程 C3，使雷区可重现 |
| ADR-06 | 通过 `window.__minesweeper` 暴露契约 | 只在 DOM 上做黑盒断言 | 黑盒断言无法区分「规则错误」与「渲染错误」；钩子让二者可分离归因（章程 C7） |
| ADR-07 | 开启 `noUncheckedIndexedAccess` | 关闭以提高编码流畅度 | 强制边界守卫，换来索引安全；本项目索引访问集中在少数访问器函数中，成本可控 |
| ADR-08 | 计时用时间戳推导 + 250ms 重绘心跳 | 1s 递增计数器 | 计数器会因 setInterval 漂移累计误差；时间戳推导天然精确 |
| ADR-09 | 采用 npm 而非 pnpm / yarn | pnpm | 环境中未安装 pnpm/git，npm 随 Node 提供，减少前置依赖 |
| ADR-10 | 格子用 `<button>` | `<div>` + tabindex | 天然可聚焦，零额外代码获得基础键盘可达性 |
| ADR-11 | 失败时错误旗帜显示为 🚩 + × 叠加（OQ-01） | 仅显示 × / 仅显示 🚩 | 保留玩家意图可见性的同时指出错误，信息量最大 |
| ADR-12 | 胜利时自动为所有地雷补旗（OQ-02） | 保持原样 | 胜利后剩余雷数归零，视觉自洽 |
| ADR-13 | 覆盖率只统计含运行时代码的文件，排除 `types.ts` | 全部计入 | `types.ts` 编译后不产生 JS，计入分母会以 0% 拉低整体覆盖率，属度量口径错误 |
| ADR-14 | 无头浏览器验收通过 CDP 自行驱动，不引入 Playwright / Puppeteer | 引入 Playwright | 保持零运行时依赖与极简 devDependencies；Node 22+ 内置 `WebSocket` 与 `fetch`，约 150 行即可满足需求（NFR-11） |
| ADR-15 | `dist/` 产物由脚本内建的 node:http 静态服务器提供 | 启动 `vite preview` | 一次运行同时验证 NFR-12（纯静态可托管）与表现层行为；避免额外常驻进程 |
| ADR-16 | 「踩中的地雷」在渲染层单独判定（比较 `explodedAt` 坐标） | 用 `status === 'lost'` 判定 | FR-12 要求**唯一**红色高亮；用状态判定会把所有被揭示的地雷都标成踩中格（实现期发现的缺陷，见 `30-tasks.md` 执行记录） |
| ADR-17 | 和弦只在旗数等于数字时生效；翻到未标旗的真雷即失败 | 无差别翻开周边 | 与经典扫雷语义一致：和弦是「信任玩家的标旗」的快捷操作，标错旗的代价就是踩雷 |
| ADR-18 | `startedAt` 以绝对时间戳（epoch ms）持久化 | 持久化「已用秒数」 | 绝对时间戳让「离开页面的时间计入用时」自然成立，且恢复后计时器无需额外累加逻辑 |
| ADR-19 | 自定义难度 `config.id = 'custom'`，`rows/cols/mineCount` 存于 config | 引入独立的 `CustomConfig` 类型 | 复用 `DifficultyConfig`，序列化/渲染/校验全链路无需分支，唯一新增点是 id 的取值 |
| ADR-20 | 触屏长按用 Pointer Events（`pointerType === 'touch'`）实现 | Touch Events（`touches` 数组） | PointerEvent 可构造、有 `clientX/Y`，既便于真机使用也便于 CDP 验收注入；且天然不干扰鼠标路径 |
| ADR-21 | 存档序列化/反序列化放 `core/persist.ts`（纯函数），`localStorage` 读写与**键名**放 `ui/storage.ts` | 序列化也放表现层；键名放 core | 遵守章程 C1（core 无 DOM）。键名是存储层细节，放 core 会模糊分层（实现期按此归位，见 D-14） |

---

## 10. 风险与缓解

| ID | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R-01 | `noUncheckedIndexedAccess` 导致大量样板守卫，拖慢实现 | 进度 | 把索引访问收敛到 `getCell(board, r, c)` / `inBounds(config, r, c)` 两个工具函数中，其余代码不直接索引 |
| R-02 | 全量重建 DOM 在低端机上抖动 | NFR-01 | 已留退路：改为按状态差异更新；并有性能基准脚本可度量 |
| R-03 | Vite / Vitest 版本与 Node 24 的兼容问题 | 阻塞构建 | 安装后立即跑 G1/G2/G3 三条门禁；若失败，回退到已发布的稳定大版本 |
| R-04 | 网络不可用导致无法安装依赖 | 阻塞全部实现 | 先验证 `npm install` 成功再进入 T-02；若失败，启用「无构建」退化方案（`index.html` + 原生 ESM + 手写 `.d.ts` 校验），并在 plan 中登记 ADR |
| R-05 | 规范与实现漂移 | 可追溯性失效 | 章程 G5：规范优先，任何偏离先改文档；每个任务完成时更新 `40-acceptance.md` 矩阵 |
| R-06 | 手工验收依赖人工点击，易漏项 | 质量 | 用 `__minesweeper` 钩子写「验收脚本」，把可自动化的部分从手工清单中剥离 |
| R-04 | 运行环境限制构建工具派生子进程 | 阻塞构建与测试 | **已实际发生**。缓解结果：npm 缓存定向到工作区内 + `--ignore-scripts` 安装；构建/测试在具备相应权限的环境下执行。配置文件名改为 `.mjs` 但**未能**绕开 esbuild 打包，已如实记录在 §7.3，未按「已解决」处理 |
| R-07 | 长按手势与「单击翻开」「棋盘滚动」冲突 | 触屏误触 / 无法滚动 | 用位移阈值（10px）区分长按与滚动；`touch-action: manipulation` 抑制双击缩放与长按菜单；长按后用时间戳守卫抑制合成 click |
| R-08 | 存档损坏导致白屏 | 可靠性 | `ui/storage.ts` 对解析结果做 schema 校验 + try/catch，失败静默回退新局（NFR-13） |
| R-09 | 和弦误触导致「标错旗即踩雷」 | 用户体验 | 和弦仅在旗数严格等于数字时生效；对未翻开/空白/终局格一律空操作，降低误触面 |

---

## 11. 修订历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0.0 | 2026-09-27 | 初版：架构、类型契约、算法、DOM 契约、测试策略、ADR |
| v1.1.0 | 2026-09-27 | 实现后同步：新增 ADR-13（覆盖率口径）/ADR-14（零依赖 CDP 驱动）/ADR-15（内建静态服务器）/ADR-16（踩中格单独判定）；目录结构补 `flood.ts`、`grid.css`、`scripts/**`；§7.3 记录运行环境约束；§8 补浏览器验收策略与「操作后重新查询 DOM」约束；§10 更新 R-04 实况 |
| v1.2.0 | 2026-09-27 | 新增 ADR-17（和弦语义）/ADR-18（绝对时间戳持久化）/ADR-19（custom 复用 DifficultyConfig）/ADR-20（Pointer Events 触屏）/ADR-21（序列化放 core）；目录结构补 `persist.ts`、`storage.ts`、`gesture.ts`、`chord.test.ts`、`persist.test.ts`；风险表补 R-07/R-08/R-09 |
