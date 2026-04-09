# s22 — 工具并行执行：安全工具并行，危险工具串行

> **Read in parallel, write in series**

`[ Phase 5: 流式与性能 ]` · 工具数: 9 · 代码量: ~400 行

---

## 前置知识

- 需要完成: s21 [Streaming 进阶]

## 你将学到

- `isConcurrencySafe` 标记的设计
- 安全工具 Promise.all 并行 + 危险工具串行执行
- 工具执行结果按 tool_use_id 关联回原顺序
- Claude Code 的 StreamingToolExecutor 架构

Claude 经常在一次回复中调用多个工具：

```
Claude: "我来帮你检查项目结构"
         │
         ├──→ 🔍 glob("src/**/*.ts")
         ├──→ 📄 file_read("package.json")
         └──→ 📄 file_read("tsconfig.json")

         ⚡ 3 个纯读工具 → 并行执行（总耗时 ≈ 最慢那个）
```

在 s21 中，这 3 个工具调用是**串行执行**的：glob 完成 → 读 package.json → 读 tsconfig.json。但它们都是纯读操作，完全可以并行！

然而不是所有工具都能安全并行。考虑这个场景：

```
Claude: "写入配置并验证"
         │
         ├──→ ✏️ file_write("config.json", newContent)
         │         ↓ 必须等待写入完成
         └──→ ⚡ bash("node validate.js")  // 依赖 config.json

         ⛓️ 写后读依赖 → 串行执行（保证时序）
```

如果 `file_write` 和 `bash` 并行执行，validate.js 可能读到旧文件。**读操作可以并行，写操作必须串行——用标记而不是猜测**。

## 设计决策

### isConcurrencySafe 标记

每个工具在注册时声明自己是否可以安全并行执行：

```typescript
interface Tool {
  // ...
  isConcurrencySafe?: boolean;  // 是否可以与其他安全工具并行
}
```

| 工具 | isConcurrencySafe | 原因 |
|------|:-:|------|
| glob | ✅ | 纯读，无副作用 |
| grep | ✅ | 纯读 |
| file_read | ✅ | 纯读 |
| ls | ✅ | 纯读 |
| file_write | ❌ | 写文件，有副作用 |
| file_edit | ❌ | 修改文件 |
| bash | ❌ | 可能有任何副作用 |

### 批次执行策略

```
工具队列:  [🔍glob] [📄read] [📄read] [✏️write] [🔍grep] [📁ls]
           ✅安全   ✅安全   ✅安全   ❌危险    ✅安全  ✅安全
            └────────┬────────┘      │       └───┬───┘
                 第1批并行          独占执行    第2批并行

执行时间线:
  0ms    100ms    200ms   300ms    400ms   500ms
   ├──────┴──────┤       ├────────┤        ├─────┴─────┤
   │  Batch 1    │       │ Batch2 │        │  Batch 3  │
   │ Promise.all │       │  await │        │Promise.all│
   ▼             ▼       ▼        ▼        ▼           ▼
  glob          done   write    done     grep         done
  read1         done    started         ls           done
  read2         done
```

规则：
1. 从队头开始扫描
2. 如果是安全工具，继续扫描直到遇到不安全工具
3. 一批安全工具一起执行（Promise.all）
4. 不安全工具单独执行
5. 结果按原始顺序返回

### StreamingToolExecutor 类

```typescript
class StreamingToolExecutor {
  addTool(call, tool)      // 入队
  executeAll()             // 分批并行执行，返回有序结果
  collectBatch(startIdx)   // 收集一批可并行的工具
}
```

## 实现

### Tool 接口扩展

```typescript
export function buildTool(c: {
  // ...
  isConcurrencySafe?: boolean;
}): Tool {
  return {
    ...c,
    // 默认跟随 isReadOnly
    isConcurrencySafe: c.isConcurrencySafe ?? c.isReadOnly ?? false,
  };
}
```

### collectBatch — 分批逻辑

```typescript
private collectBatch(startIdx: number): TrackedTool[] {
  const first = this.queue[startIdx];
  if (!first.isSafe) return [first]; // 不安全 → 独占

  const batch: TrackedTool[] = [first];
  for (let j = startIdx + 1; j < this.queue.length; j++) {
    if (!this.queue[j].isSafe) break; // 遇到不安全就停
    batch.push(this.queue[j]);
  }
  return batch;
}
```

### executeAll — 分批执行

```typescript
async executeAll(): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  let i = 0;

  while (i < this.queue.length) {
    const batch = this.collectBatch(i);

    if (batch.length === 1) {
      // 单个执行
      tracked.result = await this.executeSingle(tracked);
      results.push({ id, name, result });
      i++;
    } else {
      // 并行执行
      await Promise.all(batch.map(t => this.executeSingle(t)));
      for (const tracked of batch) {
        results.push({ id, name, result }); // 保持原始顺序
      }
      i += batch.length;
    }
  }
  return results;
}
```

### Agent 集成

```typescript
// 收集所有 tool_use blocks
const toolCalls = response.content
  .filter(b => b.type === "tool_use")
  .map(b => ({ id: b.id, name: b.name, input: b.input }));

// 创建执行器
const executor = new StreamingToolExecutor(context, onProgress);
for (const tc of toolCalls) {
  executor.addTool(tc, registry.get(tc.name));
}

// 并行信息提示
const safeCount = toolCalls.filter(tc => registry.get(tc.name)?.isConcurrencySafe).length;
if (safeCount > 1) {
  onOutput({ type: "parallel_info", content: `并行执行 ${safeCount} 个安全工具` });
}

// 分批执行
const toolResults = await executor.executeAll();
```

## 运行验证

```bash
cd agents/s22-parallel-tools && npm run dev
```

1. 发送 "read package.json and tsconfig.json at the same time" → 观察两个 file_read 并行执行
2. 发送 "create a file test.txt then read it" → 观察 file_write 单独执行后再 file_read
3. 观察 "并行执行 N 个安全工具" 的提示信息

## 对照 Claude Code

| 维度 | 教学版 (s22) | Claude Code |
|------|-------------|-------------|
| 并发判断 | 静态 `isConcurrencySafe` flag | `isConcurrencySafe(input)` 方法（根据参数动态判断） |
| 执行时机 | stream 完成后收集再执行 | 边 stream 边执行（block_stop 即开始） |
| 取消机制 | 无 | sibling abort — bash 失败时取消同级工具 |
| 进度反馈 | onProgress 回调 | streaming progress + pendingProgress 队列 |
| 结果排序 | 简单的有序数组 | 有序 drain: getCompletedResults + getRemainingResults |
| 状态跟踪 | queued/executing/completed | 加上 yielded 状态，支持流式 drain |

**Claude Code 的边收边执行模式**：在 `content_block_stop` 时立即开始执行该工具，而不是等所有 block 到齐。这样第一个工具在第二个工具的 JSON 还在流式到达时就已经在执行了，进一步减少了总等待时间。

**sibling abort**：如果一个 bash 命令执行失败（比如编译错误），同时还在运行的其他工具可能已经没有意义了。Claude Code 用 AbortController 让一个工具的失败可以取消"兄弟"工具。

## 深入思考

1. **动态并发判断的价值**：bash 命令其实分两种——`ls`、`cat` 是安全的，`rm`、`npm install` 是危险的。Claude Code 根据命令内容判断，比静态 flag 更精确。
2. **有序 vs 无序返回**：为什么要保持原始顺序？因为 Claude 可能根据前面工具的结果来理解后面工具的结果。打乱顺序可能导致上下文混乱。
3. **并行度的上限**：如果 Claude 一次发了 20 个 glob，全部并行可能打爆文件系统。生产环境需要考虑并发上限。

## 练习

1. 给 bash 工具实现动态的 `isConcurrencySafe`：如果命令以 `cat`、`ls`、`echo` 开头则安全
2. 实现 sibling abort：如果一个工具执行报错，取消其他正在执行的工具
3. 添加并发上限（如最多 5 个工具并行），超出的排队等待

<details><summary>练习 1 参考实现</summary>

```typescript
/** 根据工具名与输入判断是否可与其它「安全」工具并行（bash 按命令前缀动态判断） */
function isConcurrencySafeForCall(
  tool: Tool | undefined,
  input: Record<string, unknown>,
): boolean {
  if (!tool) return false;
  if (tool.name === "bash") {
    const cmd = String((input as { command?: string }).command ?? "").trim();
    const first = cmd.split(/\s+/)[0] ?? "";
    return ["cat", "ls", "echo"].includes(first);
  }
  return tool.isConcurrencySafe ?? false;
}

// addTool 内：isSafe = isConcurrencySafeForCall(tool, call.input)
```

要点：把「是否安全」从静态 flag 换成「工具名 + 本次 input」的函数；bash 只认第一个 token，避免把 `echo rm` 之类误判为安全（若需更严可解析 shell 或维护白名单）。

</details>

<details><summary>练习 2 参考实现</summary>

```typescript
// 并行批内共用一个 AbortController；任一工具返回 isError 或抛错则 abort，其它进行中的调用应尊重 signal
private async executeBatchWithSiblingAbort(batch: TrackedTool[]): Promise<void> {
  const controller = new AbortController();
  const { signal } = controller;

  const runOne = async (tracked: TrackedTool) => {
    if (signal.aborted) {
      tracked.result = { output: "Aborted (sibling failed)", isError: true };
      return;
    }
    tracked.result = await this.executeSingle(tracked, signal);
    if (tracked.result.isError) controller.abort();
  };

  await Promise.all(batch.map((t) => runOne(t)));
}

// executeSingle 内：若 signal.aborted 则不再启动子进程；已启动的需在 spawn 上保存 ChildProcess，abort 时 kill
```

要点：失败「取消兄弟」= 共享 AbortController + 在 execute 路径上检查 `signal`；与子进程集成时要在 abort 时 `kill` 子进程，避免僵尸或继续占用资源。

</details>

<details><summary>练习 3 参考实现</summary>

```typescript
const MAX_PARALLEL = 5;

/** 将 batch 按槽位分批：每批最多 MAX_PARALLEL 个，批内 Promise.all，批间顺序执行 → 全局最多同时 MAX_PARALLEL 个 */
private async runLimitedParallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += MAX_PARALLEL) {
    const chunk = items.slice(i, i + MAX_PARALLEL);
    await Promise.all(chunk.map((item) => fn(item)));
  }
}

// 原: await Promise.all(batch.map((t) => runOne(t)));
// 改: await this.runLimitedParallel(batch, (t) => runOne(t));
```

要点：在「同一批安全工具」内部加窗口上限，避免 20 个 glob 同时打盘；批间仍保持文档中的顺序语义，只是同一批内最多 N 个并发、其余排队到下一窗口。

</details>

## 下一课预告

Agent 的功能越来越完善，但启动时间也在变慢——`mycli --version` 要等 3 秒。下一课 **s23 启动性能优化** 将通过懒加载、并行预加载和快速路径把启动时间降到 300ms。
