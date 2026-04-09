# s42 — Team Protocols：协商协议

> **Multi-agent stability depends on protocol design, not agent intelligence.**

`[ Phase 10: 多 Agent ]` · 工具数: 5 · 代码量: ~110 行

---

## 前置知识

- 需要完成: s41 Team + Mailbox：文件邮箱通信

## 你将学到

- 四种核心协议：权限同步、计划审批、关闭、任务分配
- 协议消息格式：结构化 JSON 嵌入邮箱的 ProtocolMessage 设计
- isProtocolMessage 过滤：协议消息与普通对话的精确分离
- 权限同步流程：sendPermissionRequest / pollForPermissionResponse <abbr data-tip="分布式系统中最基础的通信模式——发送方发起请求并等待，接收方处理后将响应精确匹配回对应请求">请求-响应模式</abbr>
- requestId 匹配：响应精确关联到对应请求

## 问题场景

Worker Agent 需要执行 `rm -rf`，但没有权限。谁来审批？怎么审批？

```
没有协议的混乱：

  Worker-1: "我要执行危险命令"
  Worker-2: "我也要！"
  Leader:   （不知道谁在问什么）

  有协议的秩序：

  Worker-1 → Leader 邮箱: PermissionRequest { toolName: "bash", ... }
  Leader   → Worker-1 邮箱: PermissionResponse { approved: true }
  Worker-1: （继续执行）
```

**多 Agent 系统的稳定性取决于协议设计，不是 Agent 智能。**

## 设计决策

### 协议类型

```
四个核心协议：

  1. 权限同步协议
     Worker → Leader: "我需要执行 bash rm -rf"
     Leader → Worker: "批准" / "拒绝"

  2. 计划审批协议
     Worker → Leader: "我的执行计划是..."
     Leader → Worker: "修改步骤 3 后执行"

  3. 关闭协议
     Worker → Leader: "我完成了，摘要如下..."
     Leader → Worker: "确认关闭" / "继续做 X"

  4. 任务分配
     Leader → Worker: "你的任务是..."
```

### 协议消息格式

```
结构化 JSON 嵌入邮箱消息：

  {
    "protocol": "permission_request",
    "requestId": "req-1711234567-1",
    "payload": {
      "toolName": "bash",
      "toolInput": "rm -rf node_modules",
      "reason": "清理构建产物"
    }
  }

  isProtocolMessage() 判断是否为协议消息
  → 协议消息不应作为普通对话喂给模型
```

### 权限同步流程

```
权限同步时序：

  Worker                        Leader
    │                              │
    │ sendPermissionRequest() ──→  │
    │  → 写入 Leader 邮箱           │
    │                              │
    │ pollForPermissionResponse()  │
    │  → 轮询自己邮箱               │ 读取邮箱
    │                              │ 审批决策
    │                              │
    │  ←── sendPermissionResponse() │
    │       写入 Worker 邮箱        │
    │                              │
    │ 收到批准 → 继续执行           │
```

## 实现

### 协议消息类型

```typescript
export interface ProtocolMessage {
  protocol: ProtocolType;
  requestId: string;
  payload: Record<string, unknown>;
}

export function isProtocolMessage(text: string): boolean {
  const parsed = JSON.parse(text);
  return typeof parsed.protocol === "string";
}
```

### 权限同步

```typescript
export function sendPermissionRequest(teamName, workerName, leaderName, ...): string {
  const request: PermissionRequest = {
    protocol: "permission_request",
    requestId: generateRequestId(),
    payload: { toolName, toolInput, reason },
  };
  writeToMailbox(teamName, leaderName, workerName, JSON.stringify(request));
  return requestId;
}

export function pollForPermissionResponse(teamName, workerName, requestId) {
  const messages = readUnreadMessages(teamName, workerName);
  return messages.find(m => m.protocol === "permission_response" && m.requestId === requestId);
}
```

## 运行验证

```bash
cd agents/s42-team-protocols
npm run dev

# 1. 让 Worker 执行需要权限的操作
#    > 帮我删除所有临时文件

# 2. 观察协议消息流
#    → Worker → Leader: PermissionRequest { toolName: "bash", command: "rm ..." }
#    → Leader 审批: PermissionResponse { approved: true, requestId: "xxx" }
#    → Worker 收到响应后继续执行

# 3. 验证协议消息与普通消息分离
#    → isProtocolMessage() 正确识别结构化协议 JSON
#    → requestId 匹配：响应精确关联到对应请求
```

## 对照 Claude Code

| 维度 | 教学版 (s42) | Claude Code |
|------|-------------|-------------|
| 协议类型 | 4 种 | 8+ 种 (含 sandbox、mode_set、idle) |
| 存储 | 邮箱 JSON | 邮箱 + 独立 permissions/pending 文件 |
| 角色判断 | isTeamLeader/isSwarmWorker | 同 + agentId 检测 |
| 进程内桥 | 无 | leaderPermissionBridge (leader UI 队列) |
| 状态机 | 简单请求-响应 | FSM + 重试 + 超时 |

## 深入思考

1. **协议是 Agent 间的"契约"**：没有协议，Agent 之间只能靠自然语言沟通——不可靠。结构化协议让通信精确、可解析、可审计。
2. **isProtocolMessage 是关键过滤**：协议消息不应该作为普通对话内容喂给模型。这个过滤确保模型只看到它该看到的。
3. **权限同步是安全基石**：Worker 不能自行决定执行危险操作。必须经过 Leader 审批。这是 s34（子 Agent 权限）的团队级扩展。

## 练习

1. 实现计划审批的完整流程（请求 → 审批/拒绝 → 执行）

<details>
<summary>练习 1 参考实现</summary>

计划审批协议的完整实现：

```typescript
// Worker 端：发送计划请求
function submitPlan(teamName, workerName, leaderName, plan: string) {
  const request: ProtocolMessage = {
    protocol: "plan_request",
    requestId: generateRequestId(),
    payload: { plan, steps: plan.split("\n").length },
  };
  writeToMailbox(teamName, leaderName, workerName, JSON.stringify(request));
  return request.requestId;
}

// Leader 端：审批计划
function reviewPlan(teamName, leaderName, workerName, requestId, decision) {
  const response: ProtocolMessage = {
    protocol: "plan_response",
    requestId,
    payload: {
      approved: decision.approved,
      feedback: decision.feedback, // "修改步骤 3 后执行"
    },
  };
  writeToMailbox(teamName, workerName, leaderName, JSON.stringify(response));
}

// Worker 端：等待审批结果
async function waitForPlanApproval(teamName, workerName, requestId) {
  // 轮询邮箱，匹配 requestId
  for (let i = 0; i < 30; i++) { // 最多等 30 秒
    const msgs = readUnreadMessages(teamName, workerName);
    const response = msgs.find(m => {
      const parsed = JSON.parse(m.text);
      return parsed.protocol === "plan_response" && parsed.requestId === requestId;
    });
    if (response) return JSON.parse(response.text).payload;
    await sleep(1000);
  }
  return { approved: false, feedback: "审批超时" };
}
```

**关键**：requestId 将请求和响应对应起来，确保多个并发请求不会错配。

</details>

2. 添加协议超时机制：Leader 没响应时 Worker 自动降级
3. 实现 FSM 状态机追踪协议状态

## 下一课预告

**s43 — Worktree 隔离**：每个 Agent 独立工作目录——Git Worktree 天然隔离，零冲突并行。
