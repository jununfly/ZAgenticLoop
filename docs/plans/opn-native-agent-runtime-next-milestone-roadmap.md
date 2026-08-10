<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-native-agent-runtime-next-milestone-roadmap.json` | 最后更新: 2026-08-10 14:00:52

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

### 当前施工：1-6-5-2. Mac launchd 常驻 endpoint 真实安装与重启可达性验收

**决策：**
- Q: 服务安装权限 → macOS 使用当前用户级 LaunchAgent，不使用 system-wide LaunchDaemon 或 sudo。 (开发者单用户场景下配置、证书和运行日志保持在用户身份目录与 runtime 目录。)

**当前子树：**
├── [x][Y+] 1-6-5-2-1. Mac endpoint launchd 安装后重启与 healthz 验收
└── [ ][Y+] 1-6-5-2-2. 通过 OPN 完成 Windows 双向 message 与 Web UI 审计验收
<!-- ROADMAP_SECTION_END -->
