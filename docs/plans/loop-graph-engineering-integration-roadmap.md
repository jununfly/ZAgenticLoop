<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `loop-graph-engineering-integration-roadmap.json` | 最后更新: 2026-07-30 01:02:14

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

### 当前施工：1-4-2-3. 静态 Web UI Human approval 入口

已实现本机Human Approval Adapter与无框架静态Web UI：单network、一次性bootstrap token、HttpOnly SameSite=Strict session、loopback-only、严格Origin校验、窄UI API、request digest/CAS前置校验、capability ceiling、signed HumanApprovalContext、结构化reject、Evidence摘要接口、严格HTTPS远端Pairing client，以及foreground CLI。自动fixture UI conformance 3/3通过；agent-local回归112 tests中111 passed、0 failed、1 skipped；npm test 380 tests中380 passed。真实macOS Keychain signer已接入UI路径，但Keychain UI smoke test在系统确认阶段等待Human桌面操作，尚未形成最终通过Evidence；需由Human执行一次真实批准后再将本节点标记completed。

**决策：**
- Q: 静态Web UI第一版是否只聚焦enrollment与approval？ → 只聚焦enrollment/approval主路径：Human Owner初始化与fingerprint、pending request列表、request详情、批准/拒绝、enrollment状态、Evidence摘要与Review Handoff入口，以及human-authority/state-store不可用和CAS冲突等阻断状态。暂不提供Graph拓扑编辑、任意capability拖拽授权、任务执行控制台、Artifact编辑、Relay管理或真实Agent进程控制。 (Human确认UI先降低身份与配对门槛，不超前伪装Graph能力。)
- Q: Human是否可以在UI中批量批准Codex与Workbuddy？ → MVP必须逐个request审批，不提供批量批准。每个Node Identity、capability ceiling、endpoint和有效期独立审查，每个approval独立绑定request_digest、签名上下文和CAS；未来批量操作也必须为每个request追加独立canonical approval，不能用aggregate approval替代节点级事实。 (Human确认同一network不等于同一权限。)
- Q: Human拒绝pairing request时是否必须填写结构化原因？ → 必须填写结构化原因，至少区分identity-untrusted、capability-too-broad、endpoint-unexpected、request-not-needed、duplicate-node、human-review-deferred和需补充文本的other。reject追加不可变pairing-rejected；过期由系统追加pairing-expired；未处理request保持pending直到过期。原因进入Evidence与Review Handoff，但不写入敏感业务payload。 (Human确认拒绝、忽略和过期是不同生命周期事实。)
- Q: UI页面过期后是否还能直接提交pairing操作？ → 不能直接提交。UI mutation携带request_id、页面所见request_digest和expected state，服务端以SQLite StateStore当前状态为准重新校验；digest或状态不匹配返回结构化409 pairing-state-conflict，UI刷新最新状态和原因。不能因页面仍显示pending覆盖新状态，只有内容完全一致的重复批准才幂等返回。 (Human确认UI只是操作入口，canonical状态由StateStore决定。)
- Q: 下一步是否实现静态Web UI Human approval入口，范围限定为enrollment/approval主路径？ → 确认：实现1-4-2-3，页面只包含Human身份/指纹、pending request列表、request详情、批准/拒绝、enrollment状态、Evidence摘要，以及状态冲突和依赖不可用等阻断反馈；暂不加入Graph编辑、任务控制台或Agent进程管理。 (Human确认先把已验证的配对能力做成可操作入口，不扩展到Graph控制台。)
- Q: Web UI验收是否要求真实完成一次Human approval，而不是只做UI fixture？ → 要求真实批准。MVP采用静态Web UI + 本机signer adapter：浏览器查看pending request、选择capability、批准/拒绝并显示结果；本机adapter读取Keychain signer、签名HumanApprovalContext并调用现有API；StateStore/CAS继续做最终校验；浏览器永远不接触私钥。 (Human确认UI必须证明真实责任链闭环，而不是演示页面。)
- Q: 本次UI是否采用provider-neutral signer adapter契约，先实现macOS Keychain adapter，Windows CNG与Linux PKCS#11/TPM2后续接入？ → 是。UI只依赖provider-neutral signer adapter；本次先接macOS Keychain，其他平台后续替换provider，不修改UI和协议。 (Human确认平台密钥实现与Web UI解耦。)
- Q: 部署拓扑是否采用本机Human Approval Adapter作为唯一签名边界？ → 是。本机adapter同时提供静态Web UI和受控approval API，通过provider-neutral HumanSigner调用macOS Keychain；浏览器只访问本机adapter，不直接访问Keychain或远端StateStore；adapter转发已签名approval context；网络级服务只验证签名、权限和CAS。 (Human确认签名边界留在本机，网络服务不拥有Human私钥。)
- Q: 本机Approval Adapter是否采用loopback-only、一次性bootstrap token、短时HttpOnly UI session和严格Origin/CSRF/request digest校验？ → 是。只监听127.0.0.1；启动时生成一次性bootstrap token；浏览器换取短时HttpOnly SameSite=Strict session；mutation校验Origin、session、request digest和当前状态；不暴露signer API、不允许跨站调用；批准仍可触发系统Keychain确认。 (Human确认本机UI也必须有明确的签名诱导防护边界。)
- Q: 本机adapter连接网络级Pairing/StateStore时是否强制HTTPS并采用配置的CA/证书指纹校验，禁止不安全TLS和明文远程连接？ → 是。adapter到网络服务必须走受信任TLS，使用配置的CA或证书指纹校验，禁止rejectUnauthorized=false和明文远程连接；保留mTLS/Node Identity能力。 (Human确认本机签名边界与网络传输边界都必须可验证。)
- Q: 批准操作是否必须在调用Keychain前进行二次确认，并展示将被签名的完整关键摘要？ → 是。确认内容包括Node Identity fingerprint、display name、agent kind、endpoint、请求与实际批准capabilities、request digest、有效期和network；批准后形成不可变审计事实。拒绝必须选择结构化原因并可补充文本；页面过期或digest/state变化时禁止直接提交，必须刷新。 (Human确认签名动作前必须能看懂且确认责任范围。)
- Q: UI是否作为tools/zj-loop-core内的新adapter/CLI实现，采用无框架静态HTML/CSS/JS并由Node本机服务托管？ → 是。复用现有TypeScript协议、测试和signer provider，不引入React/Vite等新运行时；UI资产与本机adapter同包，后续可替换为独立前端。 (Human确认降低MVP运行时与维护门槛。)
- Q: adapter是否只提供enrollment/approval专用窄API，不提供通用反向代理？ → 是。固定提供UI session、当前network pairing requests、approve、reject和受限Evidence摘要接口；浏览器不能指定任意远端URL、HTTP method或headers。 (Human确认本机adapter不是通用代理或隐形权限放大器。)
- Q: 测试验收是否采用自动fixture回归加一次真实macOS Keychain UI smoke test的双层方案？ → 是。自动测试使用内存fixture signer覆盖完整HTTP UI到approval API到CAS链路，以及过期、digest冲突、重复批准、拒绝、依赖不可用和CSRF/Origin拒绝；macOS smoke test使用真实Keychain signer由Human在UI点击一次批准，只记录不含私钥的Evidence。 (Human确认自动可回归、真实责任链可验收。)
- Q: 验收Evidence是否采用默认临时、显式保留策略，并且长期只保留不含敏感信息的结构化摘要？ → 是。自动测试的证书、session token、bootstrap token、签名payload写入临时目录并清理；UI smoke test只保留时间、network、节点fingerprint、结果、测试版本、代码commit和Evidence digest；长期文档不提交私钥、token、证书私密材料或完整业务payload。 (Human确认测试可审计但不泄露签名边界材料。)
- Q: MVP是否采用foreground CLI启动Human Approval Adapter，暂不做后台daemon或开机自启？ → 是。CLI绑定随机loopback端口，打印一次性bootstrap URL，可选自动打开浏览器；前台运行，Ctrl-C清理session和临时材料；不自动注册系统开机启动或后台常驻。 (Human确认先优化可理解、可停止、可审计的本机体验。)
<!-- ROADMAP_SECTION_END -->
