# s44 — 递进式错误恢复

> **Motto:** Ship fast, fail gracefully, recover automatically

`[ Phase 4: 生产级韧性 ]` · 主题：API 失败时的分类、重试、递进恢复与熔断

---

## 问题场景

CLI Agent 长时间连着上游 LLM：限流、过载、上下文溢出、鉴权失败、连接重置、超时混在一起。若一律 `throw` 退出，用户会频繁看到「整段对话白跑」。你需要：

- **可观测**：把错误归到有限几种类型，便于日志与告警。
- **可恢复**：短暂故障应自动重试；持久故障应降级而不是静默失败。
- **可止损**：连续失败时停止打爆上游（熔断），并给用户清晰说明。

## 设计决策

| 决策 | 理由 |
|------|------|
| **统一分类** `classifyAPIError` | 同一套标签打通日志、Statsig、重试策略分支，避免字符串散落 |
| **指数退避 + jitter + Retry-After** | 退避减轻雷群效应；`Retry-After` 优先于本地计算，尊重服务端意图 |
| **递进恢复链** | `prompt_too_long` 等「内容问题」重试同一请求往往无效，应先 compact、再换模型、再提示用户 |
| **熔断器** | 连续失败超过阈值后短路，避免拖垮客户端与放大上游故障 |
| **按调用场景区分重试** | 用户阻塞的前台请求与后台摘要/标题失败代价不同，529 等是否重试应分源 |

### 错误类型（教学映射）

与实现中常见分支对应（名称以你的 `classifyAPIError` 为准）：

| 类型 | 典型触发 |
|------|----------|
| `rate_limit` | HTTP 429 |
| `server_overload` | HTTP 529 / overloaded_error |
| `prompt_too_long` | 消息体或上下文超过限制 |
| `auth` | 401 / 鉴权、OAuth 刷新失败 |
| `server_error` | 5xx 且非上述过载语义 |
| `connection` | `ECONNRESET`、`EPIPE` 等连接类 |
| `timeout` | 连接超时、请求超时 |

## 实现要点

### 1. `classifyAPIError(error)`

- 先处理**可明确识别**的：`abort`、`APIConnectionTimeoutError`、429、529、prompt 过长文案等。
- 再落到 `unknown` 或通用 bucket，保证**总有返回值**便于埋点。

### 2. `withRetry`：退避公式

与常见实现一致的一种形式：

- 基础：`BASE_DELAY_MS * 2^(attempt - 1)`，封顶例如 **32s**（`maxDelayMs = 32000`）。
- **Jitter**：在 base 上增加约 **25%** 随机量，避免同步重试。
- **Retry-After**：若响应头存在且可解析为秒数，**优先**使用该等待时间（毫秒）。

伪代码：

```typescript
function getRetryDelay(attempt: number, retryAfterHeader?: string | null, maxDelayMs = 32000) {
  if (retryAfterHeader) {
    const sec = parseInt(retryAfterHeader, 10)
    if (!Number.isNaN(sec)) return sec * 1000
  }
  const baseDelay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), maxDelayMs)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}
```

### 3. 递进恢复策略（`prompt_too_long` 示例）

1. **Compact**：压缩历史，减小 token。
2. **Fallback model**：换更小上下文或更便宜模型重试（需产品允许）。
3. **Recovery message**：向用户展示可操作建议（删附件、缩短输入）。
4. **Abort**：仍失败则终止本轮并保留会话状态。

### 4. 熔断器（CircuitBreaker）

- 维护**连续失败计数**或滑动窗口失败率。
- 打开（OPEN）后：**快速失败**，可选「半开」试探一次。
- 与重试结合：熔断打开时**不再**调用 `withRetry` 内部循环，直接走降级路径。

## 运行验证

```bash
cd agents/s44-error-recovery
npm run dev

# 1. 观察正常请求流程
#    > 你好
#    → 正常响应，无重试

# 2. 模拟限流（设置无效 key 或触发 429）
ANTHROPIC_API_KEY=sk-ant-invalid npm run dev
# → [error] classifyAPIError → auth
# → [retry] 不重试 auth 类错误，直接提示用户

# 3. 观察退避日志（如遇到限流）
#    → [retry] Attempt 1 failed: rate_limit
#    → [retry] Waiting 500ms (base) + 125ms (jitter)...
#    → [retry] Attempt 2...

# 4. 验证熔断器
#    → 连续 5 次失败后：[circuit] OPEN — 快速拒绝 30s
#    → 30s 后：[circuit] HALF-OPEN — 允许一次探测
```

## 对照 Claude Code 表格

| 概念 | Claude Code 中的位置 | 说明 |
|------|----------------------|------|
| 错误分类 | `src/services/api/errors.ts` — `classifyAPIError` | 返回 `rate_limit`、`server_overload`、`prompt_too_long`、`api_timeout` 等，供 analytics |
| 重试与退避 | `src/services/api/withRetry.ts` — `withRetry`、`getRetryDelay` | `BASE_DELAY_MS = 500`，指数退避封顶 32s，25% jitter，支持 Retry-After |
| 前台/后台 529 策略 | `withRetry.ts` — `FOREGROUND_529_RETRY_SOURCES` | 仅部分 `QuerySource` 在 529 时继续重试，避免后台任务放大流量 |
| 主查询管线 | `src/query.ts`（约 **1700+** 行量级） | 流式失败、fallback、与 retry 交互的主逻辑 |
| 递进恢复 | `withRetry` + compact / model 路径 + `FallbackTriggeredError` | 模型回退与错误类型联动 |
| 熔断（语义相近） | `src/utils/permissions/permissionSetup.ts` 等 | Auto mode 等场景用「circuit breaker」缓存读避免持续失败路径 |

> 行数会随版本变动，以仓库为准；上表侧重**文件职责**而非精确行号。

## 深入思考

1. **为何 Retry-After 要优先于本地指数曲线？** 网关已根据容量算好等待时间，忽视它会加重抖动或过早重试。
2. **529 为何要按 `querySource` 区分？** 容量雪崩时，每个后台任务都重试会成倍放大请求量；用户正在等的对话才值得承担重试成本。
3. **熔断与重试的边界**：重试解决「偶发」；熔断解决「持续坏」——二者顺序应是**先熔断判断，再决定是否进入重试循环**（或在内层计数触发熔断）。
4. **分类与产品文案**：`classifyAPIError` 的标签应稳定，否则历史报表与告警规则会断裂；新增类型要版本化或兼容旧标签。

## 练习

1. 实现 `classifyAPIError`，覆盖用户列出的 7 类，并写单元测试：构造 `APIError`（429/529/401）、`APIConnectionTimeoutError`、带 `retry-after` 的 429。
2. 实现 `getRetryDelay`，验证：无 header 时单调递增且不超过 32s；有 `Retry-After: 120` 时返回 120000ms。
3. 为 `prompt_too_long` 写伪代码状态机：compact → fallback model → user message → abort，每步记录埋点事件名。
4. 实现一个内存熔断器：连续 5 次失败后 30s 内直接拒绝调用，之后允许一次半开探测。
5. 阅读 Claude Code 的 `FOREGROUND_529_RETRY_SOURCES`，列举两个**不应**加入该集合的 `QuerySource` 并说明原因。
