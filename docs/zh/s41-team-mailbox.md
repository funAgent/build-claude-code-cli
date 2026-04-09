# s41 — Team + Mailbox：文件邮箱通信

## 问题场景

多个 Agent 需要互相通信——交换结果、请求协助、报告进度。用什么机制？

```
通信方式选择：

  消息队列 (Redis/RabbitMQ)   文件邮箱
  ├── 额外依赖               ├── 零依赖
  ├── 网络故障风险             ├── 文件系统天然可靠
  ├── 配置复杂               ├── JSON 文件即队列
  └── 对 CLI 工具过重          └── 完美匹配 CLI 场景
```

**文件系统是最可靠的进程间通信——不需要消息队列。**

## 设计决策

### 文件邮箱架构

```
邮箱目录结构：

  ~/.agent-cli/teams/
  └── my-team/
      ├── team.json              ← 团队信息
      └── inboxes/
          ├── leader.json        ← Leader 的收件箱
          ├── worker-1.json      ← Worker 1 的收件箱
          └── worker-2.json      ← Worker 2 的收件箱

  每个成员一个 JSON 文件 = 一个邮箱
  写入 = 追加消息到对方邮箱
  读取 = 读自己的邮箱
```

### 消息流

```
通信流程：

  Leader                    Worker-1                Worker-2
    │                          │                       │
    │ ─── writeToMailbox ───→  │                       │
    │     "请修改 auth.ts"      │                       │
    │                          │                       │
    │                          │ ─── writeToMailbox ──→ │
    │                          │     "我需要 schema"    │
    │                          │                       │
    │  ←── writeToMailbox ───  │                       │
    │      "auth.ts 已修改"     │                       │
    │                          │                       │
    │  readUnreadMessages      │                       │
    │  → 1 条未读              │                       │
```

## 实现

### TeammateMessage

```typescript
export interface TeammateMessage {
  from: string;
  text: string;
  timestamp: string;
  read: boolean;
}
```

### 团队创建

```typescript
export function createTeam(teamName, leader, members): Team {
  mkdirSync(inboxDir, { recursive: true });
  // 为每个成员创建空邮箱
  for (const member of team.members) {
    writeFileSync(getInboxPath(teamName, member), "[]");
  }
  return team;
}
```

### 邮箱读写

```typescript
export function writeToMailbox(teamName, to, from, text): void {
  const messages = JSON.parse(readFileSync(inboxPath));
  messages.push({ from, text, timestamp: now, read: false });
  writeFileSync(inboxPath, JSON.stringify(messages));
}

export function readUnreadMessages(teamName, memberName): TeammateMessage[] {
  return readMailbox(teamName, memberName).filter(m => !m.read);
}
```

## 运行验证

```bash
cd agents/s41-team-mailbox
npm run dev

# 1. 创建 Team 并观察邮箱初始化
#    → [team] Created team: my-team
#    → [mailbox] Initialized inbox for leader, worker-1, worker-2

# 2. 触发跨成员通信
#    > 让 worker-1 分析代码，结果发给 worker-2
#    → worker-1 → writeToMailbox("worker-2", result)
#    → worker-2 → readUnreadMessages() 获取结果

# 3. 检查邮箱文件
ls ~/.agent-cli/teams/my-team/inboxes/
# → leader.json  worker-1.json  worker-2.json
```

## 对照 Claude Code

| 维度 | 教学版 (s41) | Claude Code |
|------|-------------|-------------|
| 存储 | JSON 文件 | 同 + proper-lockfile 文件锁 |
| 消息格式 | 纯文本 | 纯文本 + 结构化协议 JSON |
| 团队管理 | create/delete | 同 + TeamCreate/DeleteTool |
| XML 格式化 | formatMessages | formatTeammateMessages → `<teammate_message>` |
| 并发安全 | 无 | proper-lockfile 重试锁 |

## 深入思考

1. **文件即队列**：JSON 文件作为消息队列，零配置、零依赖。对于 CLI 工具这种单机场景，文件系统比网络消息队列更可靠。
2. **每人一个邮箱**：避免了多 Agent 读取同一个文件的竞争。写操作只追加到对方文件。
3. **结构化协议消息**：邮箱里不只有对话——还有权限请求、计划审批、关闭通知等结构化协议消息（见 s42）。

## 练习

1. 添加 proper-lockfile 确保并发写入安全
2. 实现邮箱轮询（useInboxPoller）：定时检查新消息
3. 添加消息类型过滤：区分普通消息和协议消息
