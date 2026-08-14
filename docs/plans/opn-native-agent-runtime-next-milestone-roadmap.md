<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-runtime-next-milestone-roadmap.json` | 最后更新: 2026-08-14 20:40:58

[~][Y+] 1. OPN Native Agent Runtime 下一里程碑
├── [x][Y+] 1-1. Agent 节点注册与 capability contract
├── [x][Y+] 1-2. TransportEnvelope 到有界 Loop task 的执行适配
│   ├── [x][Y+] 1-2-1. 有界 Loop task contract
│   ├── [x][Y+] 1-2-2. Execution lifecycle state machine
│   └── [x][Y+] 1-2-3. Provider-neutral fixture execution adapter
├── [x][Y+] 1-3. Evidence 与 Review Handoff 返回协议
│   ├── [x][Y+] 1-3-1. Structured Agent Evidence ref
│   └── [x][X+] 1-3-2. Agent Review Handoff proposal
├── [x][Y+] 1-4. Human 中心责任单元的验收闭环
│   ├── [x][Y+] 1-4-1. Native Agent execution to Graph execution bridge
│   └── [x][Y+] 1-4-2. Existing HumanSigner final acceptance conformance
├── [x][Y+] 1-5. 双节点 fixture 与端到端 conformance
│   └── [x][Y+] 1-5-1. Agent1 to Agent2 end-to-end conformance
└── [~][Y+] 1-6. OPN Agent 运行时可靠性加固
    ├── [x][Y+] 1-6-1. Session expiry-aware worker 验收与续连保障
    ├── [x][Y+] 1-6-2. OPN task cancel API 与 append-only cancellation projection
    ├── [x][Y+] 1-6-3. Enrollment-backed transport target validation
    ├── [x][Y+] 1-6-4. opn-agent-adapter.processNext 未知消息队头阻塞修复
    └── [~][Y+] 1-6-5. 真实 Windows worker 队头阻塞回归验收

### 当前施工：1-6-5-2-2-6-4. OPN WebUI 跨平台自动化与真实 dogfood 证据归档

补齐无人值守 Worker 节点的 opn-node-ui service-managed 生命周期：稳定 network + node 前缀 label、macOS launchd/Windows Task Scheduler 共用包装脚本、固定 loopback port 要求；Human Approval UI 与 Worker Node UI 均可脱离交互 shell 常驻。新增确定性 `opn-node-ui-service-dogfood` executor：按固定 service label 查询服务、执行 stop/start、检查 `healthz` 与 `ui/connection`，并把 `service_status`、`service_command`、`healthz`、`connection`、`restart_persistence` 与 digest 写入 `agent.result` artifact；该 task_kind 不调用 Provider。build 与 focused diagnostic/provider/runtime tests 通过。下一步为重新投递真实 OPN task，确认 Windows 端回传包含结构化 diagnostic evidence 后再关闭本节点。
<!-- ROADMAP_SECTION_END -->
