<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `loop-graph-engineering-integration-roadmap.json` | 最后更新: 2026-07-29 16:40:30

[~][X+] 1. Loop Engineering与Graph Engineering产品融合
├── [~][X+] 1-1. Loop Engineering与Graph Engineering统一心智模型
├── [ ][X+] 1-2. Loop与Graph协同的端到端用户体验路径
├── [ ][X+] 1-3. OPN产品能力与技术架构融合边界
└── [ ][X+] 1-4. 下一实现里程碑与行为验收边界
    ├── [x][X+] 1-4-1. single-agent-opn-atom.v1 baseline fixture
    ├── [~][X+] 1-4-2. 本机双Agent Human-controlled enrollment与Node Identity
    ├── [ ][X+] 1-4-3. SQLite StateStore、ArtifactStore与loopback Relay
    ├── [ ][X+] 1-4-4. Directed Task Graph与OrchestrationPlan
    ├── [ ][X+] 1-4-5. orchestration-and-isolation preflight
    ├── [ ][X+] 1-4-6. Human Grill、blocked/recovery与重新preflight
    ├── [ ][X+] 1-4-7. Codex与Workbuddy两阶段Native OPN Tracer
    ├── [ ][X+] 1-4-8. deterministic gate、独立语义审查与Review Handoff
    └── [ ][X+] 1-4-9. Graph Engineering Evidence Set与最终conformance验收

### 当前施工：1-4-2. 本机双Agent Human-controlled enrollment与Node Identity

TDD首个纵切已完成：新增node-enrollment.v1 Node Identity（X.509 certificate raw SHA-256 fingerprint）、append-only enrollment projection、revoke状态与capability ceiling/grant交集；新增loopback mutual TLS server/client options和真实双节点握手测试。LibreSSL测试环境使用RSA证书验证跨平台X.509契约，生产Ed25519发行器仍是后续边界。npm run test:agent-local 40/40通过。下一步集成Human pairing、StateStore enrollment records与短期credential。

**决策：**
- Q: 本机Codex与Workbuddy是否应始终拥有独立的Node Identity，即使运行在同一台设备上？ → 是。同机不等于同一节点；Codex与Workbuddy分别enrollment、分别授权、分别审计、分别撤销，不能共享隐含身份或权限。 (Human confirmed independent node identity on the same device.)
- Q: 本机enrollment的信任根是什么？ → 采用Human-controlled local pairing：Codex与Workbuddy分别生成Node Identity，Human分别确认节点名称、能力和授权范围，StateStore保存enrollment record，运行时使用短期scoped credential；未经Human批准不能领取事件或读取Artifact，撤销按Node Identity单独生效。 (Human confirmed explicit local pairing as the trust root.)
- Q: enrollment record是否采用append-only生命周期？ → 采用。identity-generated、pairing-requested、human-approved、capability-granted、credential-issued、revoked、re-enrolled均作为不可变事件记录；当前节点状态由事件投影得到，撤销不删除历史或覆盖旧record。 (Human confirmed append-only enrollment lifecycle.)
- Q: 撤销Node Identity后正在执行的任务如何处理？ → 立即禁止节点领取新事件、读取新Artifact和写入新StateStore记录；已开始执行允许运行到安全检查点，任何新副作用前重新检查credential与revoke状态；无法安全暂停或验证则blocked返回Human；不默认强杀进程。 (Human confirmed checkpoint-based revocation semantics.)
- Q: CapabilityGrant如何设计？ → 采用两层授权：enrollment capability ceiling规定Human授予的能力上限；每个MessageEvent再通过event-scoped CapabilityGrant授予更窄的能力、资源范围、有效期和预算；实际权限取两者交集。Agent不能扩大ceiling或grant，grant绑定node_identity、event_id和task_id并留下审计记录。 (Human confirmed intersected enrollment and event-scoped grants.)
- Q: Node Identity与配对协议采用什么方案？ → 采用Syncthing-like pairing UX + 自签名Ed25519 X.509 certificate + SHA-256 fingerprint作为Node ID + mTLS双向认证；StateStore保存证书和enrollment生命周期，Relay只转发连接，CapabilityGrant由ZAgenticLoop应用层独立控制。Noise、libp2p和Tailscale作为未来扩展。 (Human accepted the Syncthing-inspired UX and certificate identity split.)
- Q: MVP的pairing入口采用什么方式？ → 采用loopback-first、跨设备可扩展：Codex与Workbuddy先通过本机loopback pairing endpoint完成mTLS enrollment，后续可增加QR、局域网发现或Relay，不改变Node Identity与CapabilityGrant协议。 (Human accepted loopback-first pairing.)
- Q: Human在pairing时至少确认哪些信息？ → 至少展示并确认节点显示名、Node ID/certificate fingerprint、Agent类型与版本、目标network、enrollment capability ceiling、设备或loopback endpoint、credential有效期以及Artifact读写和事件领取权限；短码只降低输入成本，不能替代fingerprint与能力审查。 (Human accepted explicit identity, capability, endpoint, and expiry confirmation.)
- Q: Node Identity证书轮换与运行时credential续期如何区分？ → 区分处理：短期credential续期不改变Node ID；证书或key轮换视为高风险身份变更，有旧私钥时由旧identity签名确认continuity，无旧私钥时重新Human pairing；旧identity先撤销再启用新identity，历史Evidence绑定旧Node ID不迁移覆盖。 (Human accepted separate credential renewal and identity rotation semantics.)
- Q: 短期credential由谁签发？ → 由StateStore或Network Authority签发；Human批准enrollment后，中心节点只能提交具体事件的窄化CapabilityGrant请求，StateStore校验节点状态、事件范围和预算后签发短期credential。中心节点不因拥有事件协调权而自动拥有credential签发权。 (Human confirmed StateStore-issued scoped credentials.)
- Q: StateStore暂时不可用时已签发credential如何处理？ → 禁止签发新credential和新CapabilityGrant，禁止领取新事件；已签发credential在有效期内可完成当前安全步骤，但每次新外部副作用前必须检查credential有效期和revoke notice；无法确认安全状态则blocked，不允许无限期离线运行或自动延长权限。 (Human accepted bounded degraded mode for StateStore outage.)
- Q: 节点被revoke后是否允许自动恢复enrollment？ → 不允许。临时StateStore或Relay故障允许有限次数、带退避的幂等重试；明确revoked后停止领取事件和读取新Artifact，不能通过credential renewal、重连或重试自动恢复；恢复必须由Human发起新的pairing或明确批准re-enrollment，并留下新的append-only事件。 (Human accepted no automatic recovery after revocation.)
- Q: 已enrollment节点的capability ceiling需要扩大时谁能批准？ → 只能由Human批准并采用追加式变更：中心节点只能提出capability change request，Human审查新增能力、资源范围、风险和有效期，StateStore写入新的capability-ceiling-granted事件；旧ceiling保留历史，新ceiling只影响后续credential和grant；缩权可立即生效，扩权需显式Human approval。 (Human confirmed append-only Human-approved capability ceiling changes.)
- Q: Node Identity与中心角色是否应分离？ → 必须分离。Node Identity只表示节点身份；Center Role是Network或Event scope内由Human授权的临时角色，enrollment不自动授予中心权力。Human或Human+Agent才是中心责任单元，Codex的event_center协作角色需显式授权，执行节点不能自行升级为中心。 (Human confirmed identity-role separation.)
- Q: Codex同时承担中心协作与执行任务时是否拆成两个逻辑节点？ → 需要拆分逻辑节点但不生成两个物理Node Identity：同一Codex identity分别承担Center Coordination与Codex Execution，使用独立CapabilityGrant、task scope和Evidence；Execution不能修改OrchestrationPlan或自我验收，后继Verification节点或Human独立验收。 (Human confirmed explicit dual logical roles for Codex.)
- Q: Codex与Workbuddy的默认capability profile是否相同？ → 协议相同但默认权限不同且都从最小权限开始：Codex默认只读网络协调、计划分析和Evidence汇总；Workbuddy默认只读事件消费、任务执行和Evidence返回；代码写入、外部API和Artifact读取等高风险能力默认关闭，新增能力需Human-approved enrollment ceiling与event-scoped grant共同开启。 (Human confirmed differentiated least-privilege defaults.)
- Q: 一个OPN network是否只允许一个Human owner？ → MVP只允许一个Human owner：Human是Network Owner与最终责任中心，Agent可多节点但不能成为owner，其他Human不加入同一network的责任决策链；未来多人协作再引入co-owner、reviewer或delegated-human角色。 (Human confirmed single-owner MVP boundary.)
- Q: Human owner丢失设备或迁移到新设备时是否允许直接转移owner？ → MVP不允许静默转移：owner identity与network root key绑定，新设备迁移需旧设备Human明确批准；旧设备不可用则进入network-recovery-blocked，通过预先保存的recovery material或重新建立新network恢复；Agent、StateStore和Relay不能自行替换owner，迁移留下append-only审计记录。 (Human confirmed explicit owner migration and recovery boundary.)
- Q: recovery material应由谁持有？ → 只由Human持有，StateStore不保存可直接恢复owner的完整秘密：Human离线保存recovery key或phrase，StateStore只保存public identifier或hash，使用一次后立即轮换；Agent、Relay和普通credential不能充当recovery material，丢失时只能新建network。 (Human confirmed Human-held offline recovery material.)
- Q: MVP是否需要threshold recovery（如2-of-3 recovery keys）？ → 不需要。MVP采用单一Human owner与一份离线recovery material，使用后立即轮换；多份或门限恢复作为未来多人owner或高价值network扩展，当前先验证单人OPN的身份、撤销和恢复边界。 (Human confirmed single-material recovery for MVP.)
- Q: 1-4-2的最小enrollment conformance fixture包含哪些行为？ → 固定为单机双独立节点、无真实业务副作用：Human创建Network Owner；Codex与Workbuddy分别生成X.509/Node Identity；通过loopback pairing；Human确认fingerprint、capability ceiling和endpoint；StateStore写append-only enrollment records；分别签发短期credential；验证mTLS与event-scoped CapabilityGrant；revoke Workbuddy并验证其不能领取新事件或读取新Artifact；验证Codex仍可独立工作；re-enrollment生成新审计链；不连接真实GitLab、不修改目标代码库、不引入跨设备发现。 (Human accepted the bounded local dual-node enrollment fixture.)
- Q: Human pairing request与approval contract的最小边界是什么？ → 先实现纯协议契约：PairingRequest绑定network、Node Identity、endpoint、requested capability ceiling和过期时间；HumanApproval绑定request、Human owner、approved capabilities与批准时间，并强制网络/节点一致、批准能力不得超出请求、过期请求不能批准。该契约不直接持久化、不签发运行时credential，后续由StateStore adapter消费并追加记录。 (Human accepted the pairing contract as the next bounded TDD slice.)
<!-- ROADMAP_SECTION_END -->
