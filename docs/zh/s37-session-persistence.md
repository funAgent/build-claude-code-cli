# s37 — 会话持久化：断点续做

## 问题场景

你正在用 Agent 进行一个大型重构任务。做到一半需要离开——明天回来时，对话没了。

```
会话丢失的痛点：

  Day 1:
  你: 帮我重构认证模块          ← 上下文建立
  Agent: 好的，我先分析...       ← 分析结果
  Agent: 已修改 auth.ts         ← 进展
  你: Ctrl+C（要去开会了）

  Day 2:
  你: 帮我继续...                ← Agent 完全不知道昨天做了什么
  Agent: 什么任务？
```

**A professional tool never loses your work.**

## 设计决策

### JSONL 格式

```
为什么用 JSONL 而不是 JSON？

  JSON:  需要读取整个文件 → 修改 → 写回
         进程崩溃可能导致文件损坏

  JSONL: 每条消息独立一行，追加写入
         进程崩溃只影响最后一行
         支持流式读取，不需要加载全部内容

  格式:
  {"type":"message","role":"user","content":"帮我重构","sessionId":"abc-123",...}
  {"type":"message","role":"assistant","content":"好的...","sessionId":"abc-123",...}
  {"type":"metadata","key":"title","value":"重构认证模块","sessionId":"abc-123",...}
```

### 存储路径

```
会话文件路径:

  ~/.agent-cli/
  └── projects/
      └── <project-hash>/           ← SHA256(项目绝对路径)[:16]
          ├── abc-123-456.jsonl      ← session 1
          ├── def-789-012.jsonl      ← session 2
          └── ...

  按项目隔离 → 相同项目的会话放在一起
  hash 避免路径中的特殊字符问题
```

### Resume 流程

```
--resume 恢复流程:

  $ my-cli --resume
           ↓
  ┌─ listSessions ──────────────────┐
  │                                  │
  │  1. 帮我重构认证模块 (3h ago)    │ ← 扫描 JSONL 文件
  │  2. 修复 CI 问题 (1d ago)       │    提取首条用户消息
  │  3. 添加测试用例 (3d ago)       │    按时间倒序
  │                                  │
  └──────────────┬───────────────────┘
                 ↓ 用户选择
  ┌─ resumeSession ─────────────────┐
  │                                  │
  │  1. loadTranscript → 恢复消息    │
  │  2. 恢复元数据                   │
  │  3. 切换 sessionId              │
  │  4. 继续对话循环                 │
  │                                  │
  └──────────────────────────────────┘
```

## 实现

### 消息记录

```typescript
export function recordTranscript(
  sessionId: SessionId,
  message: MessageParam,
  cwd: string,
  parentUuid?: string,
): string {
  const uuid = randomUUID();
  const entry: TranscriptEntry = {
    type: "message",
    role: message.role,
    content: message.content,
    sessionId,
    timestamp: new Date().toISOString(),
    cwd,
    uuid,
    parentUuid,  // 消息链：可追溯上下文
  };
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return uuid;
}
```

### 会话恢复

```typescript
export function resumeSession(sessionId, cwd) {
  const messages = loadTranscript(sessionId, cwd);
  const metadata = {};
  // 分别恢复消息和元数据
  return { messages, metadata };
}
```

## 运行验证

```bash
cd agents/s37-session-persistence
npm run dev

# 1. 进行几轮对话，建立上下文
#    > 帮我分析 src/agent.ts 的结构
#    > 继续优化错误处理部分

# 2. Ctrl+C 退出，检查持久化文件
ls ~/.agent-cli/projects/*/sessions/
# → 看到 <sessionId>.jsonl 文件

# 3. 用 --resume 恢复会话
npm run dev -- --resume
# → 列出可恢复的会话（时间、消息数、最后发言）
# → 选择后 Agent 恢复上下文，继续之前的任务
```

## 对照 Claude Code

| 维度 | 教学版 (s37) | Claude Code |
|------|-------------|-------------|
| 存储格式 | JSONL | 同 |
| 条目类型 | message + metadata | 同 + summary + tag + contextCollapse + ... |
| 消息链 | uuid + parentUuid | 同 + 孤儿消息过滤 |
| resume UI | 无（仅 API） | ResumeConversation.tsx（Ink 交互组件） |
| 渐进加载 | 全量读取 | loadSameRepoMessageLogsProgressive |
| 跨项目恢复 | 不支持 | loadAllProjectsMessageLogsProgressive |
| session 切换 | 简单 ID 替换 | switchSession 原子更新 ID + projectDir |

## 深入思考

1. **JSONL 是日志的天然格式**：追加写入、行级容错、流式读取——这些特性完美匹配会话记录的需求。
2. **UUID 消息链**：每条消息有 uuid 和 parentUuid，形成链表结构。这让 compaction（s24-s25）产生的摘要消息能正确链接到原始上下文。
3. **项目哈希隔离**：用路径的 SHA256 作为目录名，避免文件系统路径限制，同时让同一项目的会话自然聚合。

## 练习

1. 实现 `--resume <session-id>` 直接恢复指定会话
2. 添加 Ink 交互界面：方向键选择历史会话
3. 实现渐进加载：大文件只读取前几行提取标题，选中后再加载全部
