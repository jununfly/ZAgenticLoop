<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-runtime-next-milestone-roadmap.json` | 最后更新: 2026-08-14 18:52:40

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

### 当前施工：1-6-5-2-2-5. Worker 重启、断网重连与 session expiry refresh 验收

Endpoint reconnect验收已通过：Mac launchd endpoint kickstart restart 后 healthz=ok；task windows-endpoint-reconnect-e2e-20260811-001 被 Windows agent_id=0dc9a2cc7c783edda6149dea892df3411dfa9ab56f4d902c3f20c08e61d6650e 消费并返回 evidence-recorded；execution_id=windows-endpoint-reconnect-execution-20260811-001；result_artifact_id=sha256:7da8707370b31b27c2f234c0fb5171443738dbe1b57472a8b54346c460717a62。剩余 session expiry refresh。

**决策：**
- Q: Session refresh 验收标准 → 必须观察到 refreshed=true 且 refresh_count>=1 后才能完成该验收节点 (当前结果只证明 worker 正常执行，尚未证明主动续期。)
<!-- ROADMAP_SECTION_END -->
