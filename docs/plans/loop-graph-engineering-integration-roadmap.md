<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `loop-graph-engineering-integration-roadmap.json` | 最后更新: 2026-07-30 00:02:22

[~][X+] 1. Loop Engineering与Graph Engineering产品融合
├── [~][X+] 1-1. Loop Engineering与Graph Engineering统一心智模型
├── [ ][X+] 1-2. Loop与Graph协同的端到端用户体验路径
├── [ ][X+] 1-3. OPN产品能力与技术架构融合边界
└── [ ][X+] 1-4. 下一实现里程碑与行为验收边界
    ├── [x][X+] 1-4-1. single-agent-opn-atom.v1 baseline fixture
    ├── [~][X+] 1-4-2. 本机双Agent Human-controlled enrollment与Node Identity
    ├── [~][X+] 1-4-3. SQLite StateStore、ArtifactStore与loopback Relay
    ├── [ ][X+] 1-4-4. Directed Task Graph与OrchestrationPlan
    ├── [ ][X+] 1-4-5. orchestration-and-isolation preflight
    ├── [ ][X+] 1-4-6. Human Grill、blocked/recovery与重新preflight
    ├── [ ][X+] 1-4-7. Codex与Workbuddy两阶段Native OPN Tracer
    ├── [ ][X+] 1-4-8. deterministic gate、独立语义审查与Review Handoff
    └── [ ][X+] 1-4-9. Graph Engineering Evidence Set与最终conformance验收

### 当前施工：1-4-2-1. SQLite与loopback HTTPS双Agent enrollment conformance

已实现SQLite PairingRecordStore：Pairing lifecycle records映射到同一个StateStore canonical event log，普通append在revision竞争时重试，条件approval使用StateStore CAS并对状态冲突fail-closed。已加入双Codex/Workbuddy loopback HTTPS conformance测试：独立pairing request、同一request并发approval、双节点分别approval和服务重启恢复。当前macOS LibreSSL无法生成Ed25519 X.509测试证书，真实HTTPS双节点场景按环境能力跳过；协议测试已保留并应在支持Ed25519 X.509的环境执行。

**决策：**
- Q: Workbuddy被撤销后conformance是否必须验证重新enrollment？ → 必须验证，但重新enrollment必须是显式新流程：旧request不能再次批准，旧credential不能续期或复活，revoked Node Identity不能通过重连自动恢复；Workbuddy创建新的pairing request，Human重新确认身份、能力和有效期，推荐生成新的Node Identity key并形成新的append-only审计链，旧生命周期和Evidence不迁移覆盖。 (Human确认撤销是终态，恢复必须重新建立信任。)
- Q: conformance是否必须真实并发执行同一pairing request的两次approval？ → 必须真实并发执行。两个approval使用同一request_id、request_digest和expected lifecycle state；结果必须恰好一个canonical approval，另一个返回同一幂等结果或明确CAS conflict，不产生两个有效credential或两个enrolled-active生命周期，SQLite revision只按实际canonical append递增一次。 (Human确认CAS需要真实竞态验证而非只做静态单测。)
- Q: Pairing lifecycle records应存入独立SQLite还是复用同一个StateStore canonical event log？ → 复用同一个SQLite StateStore canonical event log，不建立第二个持久化真相。network、revision、CAS、pairing-requested/approved/rejected/expired、enrollment、credential-issued、revoked和Evidence metadata references共享同一StateStore；PairingRecordStore只做provider-neutral映射，内存实现继续用于纯协议测试。 (Human确认所有权限生命周期共享一个canonical revision与CAS边界。)
<!-- ROADMAP_SECTION_END -->
