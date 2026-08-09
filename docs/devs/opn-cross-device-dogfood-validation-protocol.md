# OPN Cross-Device Dogfood Validation Protocol

本协议是 ZAgenticLoop 开发测试阶段的跨设备 Agent 协作约定。目标不是证明正式发布安全性，而是让 Mac Agent、Windows Agent、同机第二 Agent 和 Human 能通过产品自己的 OPN 通路共同完成一次可观察、可重放的工作。

## 目标闭环

一次 dogfood 必须证明以下链路：

1. OPN 节点已经通过 Tailscale 或其他网络建立连接。
2. 发送方通过本地 Web gateway 发布结构化 `TransportEnvelope`。
3. 发送方 Web UI 的 Outbox 和接收方 Web UI 的 Inbox 都显示同一条消息。
4. 目标节点内的 Agent worker 消费 `agent.task`，而不是由 Human 手工转述任务。
5. Agent 通过同一 OPN gateway 返回 `agent.result`。
6. Coordinator 在 Inbox 看到结果，并根据 evidence/artifact 继续 Graph phase。
7. 需要 Human 的动作通过 `human.action.request` 到达 UI；decision 作为签名 artifact 经 OPN 返回。

主验收路径不得依赖复制粘贴命令、人工转发消息或聊天中转述命令输出。命令行只负责启动服务、诊断连接和触发 gateway API。

## 角色与边界

| 角色 | 责任 | 不应做的事 |
| --- | --- | --- |
| Coordinator/Mac Agent | 创建 task artifact、通过 gateway 发 `agent.task`、消费 `agent.result`、推进 Graph | 不直连 Windows Provider，不绕过 OPN 读取远端文件 |
| Windows Agent | 运行持续 worker，消费绑定且授权的 task，发布 result artifact | 不自行扩大 capability，不把 Provider stdout 当作唯一证据 |
| 同机 Agent2 | 与 Windows Agent 使用同一 OPN gateway 和消息契约 | 不使用 Coordinator 的特权 StateStore 直写路径 |
| OPN endpoint/Web gateway | mTLS/owner 授权、Envelope 校验、StateStore offered fact、Inbox/Outbox 投影、审计 | 不替 Agent 做业务决策 |
| Human | 通过本机 Web UI 查看 pending action、批准/拒绝并形成签名 decision | 不替代 Agent 手工搬运 task/result |

## 消息契约

- 任务：`notification_kind=agent.task`。
- 结果：`notification_kind=agent.result`。
- Human 请求：`notification_kind=human.action.request`。
- Human 决策：`notification_kind=human.action.decision`。
- 消息详情和证据只通过 `artifact_refs` 指向 content-addressed artifact。
- `message_id` 和 `envelope_digest` 是幂等键；重复发送必须返回 duplicate 或等价的已存在结果。
- 交付语义是 at-least-once：先持久化 Inbox，再 ack；不得宣称 exactly-once。
- 任何 Envelope 必须通过 digest 校验；不得在 Envelope 中塞入未定义的 `payload` 字段或秘密。

## 本地 gateway 入口

自动化发送优先使用统一 CLI，不要手写临时 HTTP 请求：

```bash
node tools/zj-loop-core/dist/opn-transport-cli.js gateway-send \
  --endpoint https://<opn-endpoint>:43123 \
  --network-id <network-id> \
  --node-id <local-endpoint-node-id> \
  --target-node-id <target-node-id> \
  --message-id <unique-message-id> \
  --task-id <task-id> \
  --notification-kind agent.task \
  --ca <ca.cert.pem> \
  --cert <human-or-agent-client.cert.pem> \
  --key <human-or-agent-client.key.pem> \
  --owner-token-file <owner-token-file>
```

该命令调用 `/v1/owner/messages`，由 endpoint 的本地 TransportAdapter 写入 StateStore。不要把 `local-send` 当作跨设备主验收路径；它只适合中心节点本地诊断。

## 双机验收顺序

### 1. 连接与身份

- 两台机器确认 Tailscale 状态和 OPN TCP 端口可达。
- endpoint 使用带 SAN 的开发证书；客户端固定使用 CA、client cert、client key。
- Agent 节点确认当前 certificate fingerprint 与 `node_id` 一致。
- credential/session 由 CLI 创建或续期；不要复用已过期 session 文件。

### 2. 服务启动

- Mac：启动 endpoint，再启动 Human Approval UI；记录两个 JSON 输出中的 endpoint 地址和 UI URL。
- Windows：拉取同一 commit，构建 `tools/zj-loop-core`，启动持续 `opn-agent-runner worker`。
- 同机 Agent2：也必须注册为独立 node，并通过本机 Web gateway 接收任务。

### 3. 消息发送与观察

- Coordinator 用 `gateway-send` 发送唯一 `message_id` 的 `agent.task`。
- 发送方 UI 查看 `/ui/opn` 的“消息发件箱”。
- 接收方 UI 查看 `/ui/opn` 的“消息收件箱”。
- 两边核对 `message_id`、`envelope_digest`、发送/目标 node、task id 和 artifact refs。

### 4. 执行与返回

- worker 自动 receive、校验、下载 artifact、执行 bounded Provider、发布 `agent.result`、最后 ack。
- Provider 失败必须形成 `blocked` result 或结构化失败 artifact，不能只打印异常后退出。
- worker 断线后自动重连；结果重发不得产生第二次业务执行。
- Coordinator UI 看到 `agent.result` 后才推进 verification 或 Human action。

### 5. Human 边界

- 未授权 task、超 capability、写入范围不明确或需要最终确认时，Agent 只发布 `human.action.request` 并停在 pending。
- Human 在 Web UI 批准/拒绝。
- UI 生成签名 `human.action.decision`，gateway 转发到请求方；双方 UI 均保留 request 和 decision 记录。

## Web UI 观察清单

每次验收至少保存以下信息，供其他 Agent 继续工作：

- endpoint 和 UI URL、network id、两端 node id。
- task message id、task envelope digest、result message id、result envelope digest。
- 发送方 Outbox 记录和接收方 Inbox 记录。
- Provider execution id、attempt、最终状态和 artifact ids。
- 如有 Human action：request digest、decision digest、human id、decision 时间。
- 失败时保存结构化 JSON 原文和下一步 action，不只描述“命令失败”。

## 失败处理规则

- `empty`：没有待处理消息，继续 worker poll，不算失败。
- `duplicate`：消息或结果已存在，检查 digest 和 execution id；一致则继续，不重复执行。
- `ack-pending`：Inbox 已持久化但 ack 未完成，优先重连/重试 ack。
- `outcome-uncertain`：不得盲目重跑；先查 StateStore、message id、digest 和 Provider execution。
- `credential-invalid` 或 session expired：重新 claim/创建 session，不修改业务消息内容。
- Provider executable 不可发现：记录 discovery candidates 和安装位置，修复 provider wiring 后用新的 execution attempt。

## 给 Agent 的协作格式

Agent 在接手 dogfood 时，先读取本协议和当前 roadmap，再用以下格式报告：

```text
Role: Coordinator | OPN endpoint | Windows worker | Agent2 | Human UI
Network: <network id>
Node: <node id>
Current message: <message id or none>
Envelope digest: <digest or none>
UI evidence: <outbox/inbox URL and observed state>
Execution: <execution id / attempt / status>
Blocked by: <structured reason or none>
Next action: <one concrete action>
```

这样后续 Agent 可以基于事实继续 co-design/co-work，而不需要依赖当前聊天上下文或 Human 转述。
