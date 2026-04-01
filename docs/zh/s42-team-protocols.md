# s42 — Team Protocols：协商协议

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
2. 添加协议超时机制：Leader 没响应时 Worker 自动降级
3. 实现 FSM 状态机追踪协议状态
