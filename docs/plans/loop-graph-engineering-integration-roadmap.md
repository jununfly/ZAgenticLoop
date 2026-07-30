<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `loop-graph-engineering-integration-roadmap.json` | 最后更新: 2026-07-31 00:57:39

[~][X+] 1. Loop Engineering与Graph Engineering产品融合
├── [x][X+] 1-1. Loop Engineering与Graph Engineering统一心智模型
├── [x][X+] 1-2. Loop与Graph协同的端到端用户体验路径
├── [x][X+] 1-3. OPN产品能力与技术架构融合边界
└── [ ][X+] 1-4. 下一实现里程碑与行为验收边界
    ├── [x][X+] 1-4-1. single-agent-opn-atom.v1 baseline fixture
    ├── [x][X+] 1-4-2. 本机双Agent Human-controlled enrollment与Node Identity
    ├── [x][X+] 1-4-3. SQLite StateStore、ArtifactStore与loopback Relay
    ├── [x][X+] 1-4-4. Directed Task Graph与OrchestrationPlan
    ├── [x][X+] 1-4-5. orchestration-and-isolation preflight
    ├── [~][Y+] 1-4-6. Human Grill、blocked/recovery与重新preflight
    ├── [ ][X+] 1-4-7. Codex与Workbuddy两阶段Native OPN Tracer
    ├── [ ][X+] 1-4-8. deterministic gate、独立语义审查与Review Handoff
    └── [ ][X+] 1-4-9. Graph Engineering Evidence Set与最终conformance验收

### 当前施工：1-4-6. Human Grill、blocked/recovery与重新preflight

协议设计已冻结，进入TDD实现。已完成第一条纵切：HumanGrill结构化对象、HumanGrillDecision、内存CAS coordinator、SQLite append-only StateStore CAS持久化；覆盖accepted/duplicate/conflict/stale-decision、跨连接并发winner收敛和side_effects_executed=false。MVP范围：Human Grill、Human Decision、Plan revision、CAS幂等/冲突/stale、blocked/recovery、Provider outcome uncertainty、re-preflight唯一放行、HumanSigner验证与Key撤销检查、内存/SQLite StateStore与ArtifactStore、模拟Provider、并发/离线stale/跨设备通知协议测试。暂不实现完整Web UI、真实多平台签名provider全适配、生产Provider副作用、P2P传输和复杂同步冲突自动合并。

**决策：**
- Q: Human Grill的最小结构化协议是什么？ → 采用：Human Grill包含grill_id、event_id/plan_id/plan_revision、reason_code、known_facts、unknowns_or_conflicts、affected_tasks、affected_resources、candidate_strategies、recommended_strategy、risks_and_tradeoffs、requested_human_decision、decision_options、side_effects_executed=false和resume_requires_repreflight=true。 (Human必须同时看到事实、未知、候选隔离方案、推荐方案、权衡和决策后果；自然语言请确认不构成协议决策。)
- Q: Human的Grill选择如何影响任务执行？ → 采用：Human选择生成不可变Human Grill Decision，绑定原始grill_id、event_id、plan_revision和策略摘要；不能直接放行原始任务。任何任务、资源、隔离策略或权限变化都必须生成新OrchestrationPlan revision、重新计算grant_digest并重新执行resource-isolation preflight；原始blocked事实保留，只有execution-ready才能claim/dispatch，Human override也必须记录原因和责任主体。 (Human决策是授权输入，不是绕过协议的开关；重新preflight是所有恢复路径的强制边界。)
- Q: Human Grill前是否必须先生成候选隔离策略？ → 采用：中心责任单元必须基于已知事实生成候选策略、推荐方案、风险权衡和验证计划后再发起Human Grill，不能只输出空泛的不知道。策略至少绑定strategy_id、resource_scope、affected_tasks、required_capabilities、并行/串行、merge/aggregation、rollback/recovery、风险、验证和预期副作用。Human可接受、改选、修改约束、要求补充事实或拒绝继续。 (Human负责选择与最终责任，中心Agent负责准备可比较的决策材料；不把编排未知简单转嫁给Human。)
- Q: 资源隔离策略的验证责任如何分层？ → 采用分层验证：ZAgenticLoop确定性验证策略覆盖冲突资源、任务读写集、并行/串行关系、merge/aggregation/rollback责任、Capability范围、Plan revision和副作用门槛；资源系统或Human负责证明外部真实语义，如branch/worktree隔离、Provider幂等/事务、数据库/文件系统并发、业务合规和现实权限。ZAgenticLoop只证明策略声明完整且协议可执行，不伪造外部资源必然按策略运行的证明。 (未知外部语义继续blocked或回Human，不能用协议校验结果冒充资源系统验证结果。)
- Q: Human Grill、blocked、recovery和re-preflight如何组成状态机？ → 采用：preflight -> needs-human-grill -> human-decision-recorded -> plan-revision-created -> re-preflight -> execution-ready/blocked/needs-human-grill；执行中异常走executing -> recovery-required -> recovery-decision-recorded -> plan-revision-created -> re-preflight。blocked不能直接claim/dispatch，重复原请求不能隐式恢复；每次恢复必须有新决策、Plan revision和验证证据，re-preflight是唯一重新放行入口。 (将Human选择、系统重新验证和执行资格分开，防止隐式重试、旧计划复活或恢复路径绕过门禁。)
- Q: Human Grill的幂等与并发决策如何处理？ → 采用：一个grill_id只能产生一个有效决策赢家；相同决策digest重复提交返回duplicate，不同决策返回conflict，旧plan_revision返回stale-decision。Human Decision绑定grill_id/event_id/plan_revision并通过StateStore CAS写入；成功后只能由该决策创建唯一新Plan revision，未重新preflight不得claim/dispatch；旧Grill、旧决策和旧Plan只可审计，不能重新激活。 (将Human Grill本身作为并发资源处理，避免最后一次点击覆盖责任决策或旧计划复活。)
- Q: 恢复何时复用原Execution，何时创建新Execution？ → 采用：同一Plan revision、CapabilityGrant、身份、资源隔离和有效执行上下文未变化，且失败发生在可安全幂等重试阶段时可复用原Execution；目标/任务/资源/隔离/权限/身份/Provider/框架或事实变化、Provider outcome uncertainty、外部副作用不确定、Execution过期或Evidence不足时必须创建新Execution。新Execution绑定parent_execution_id、recovery_decision_id、plan_revision、grant_digest、resource_isolation_profile和resume/retry reason。 (区分执行层retry与责任/计划层recovery，避免把权限、资源或外部事实变化伪装成普通重试。)
- Q: Provider outcome uncertainty如何进入恢复？ → 采用：Provider outcome uncertainty先冻结相关Task与Resource Scope，禁止盲目retry和推进后续依赖；通过有边界的Provider状态查询收敛事实。明确成功则补录receipt/evidence，明确失败且证明无副作用才可recovery，部分成功/重复风险/资源归属不明必须Human Grill，仍不确定则保持blocked。所有恢复绑定新决策、新Execution和re-preflight。 (不确定不是失败也不是成功，而是独立的事实收敛状态；原始request、dispatch、response和时间线必须保留。)
- Q: Provider部分成功或资源归属不明时，Human有哪些固定决策选项？ → 采用四类固定决策：adopt（接受已确认结果并补录receipt）、reconcile（只读或明确授权地收敛事实）、compensate（明确补偿/回滚方案并创建新Execution/re-preflight）、abandon（冻结资源和证据并结束或转人工）。Human不能直接选择继续重试；所有选项绑定原始uncertainty、Human Decision、Plan revision和新Execution（如有）。 (将部分成功处理为外部事实与责任决策，不把资源归属不明伪装成普通失败。)
- Q: 1-4-6 Human Grill/recovery/re-preflight何时算完成？ → 采用conformance完成标准：资源隔离未知可生成结构化Human Grill；事实/未知/候选/推荐/后果完整；Human Decision CAS幂等，重复duplicate、冲突conflict、旧revision stale-decision；Human选择不能直接放行；生成新Plan revision和grant_digest；re-preflight是唯一放行入口；blocked/recovery/uncertainty不能绕过claim/dispatch；Provider部分成功覆盖adopt/reconcile/compensate/abandon；side_effects_executed准确；原始Grill/Decision/Plan/Execution/Evidence可重放；覆盖成功恢复、失败恢复、冲突决策和Provider uncertainty测试。 (完成标准覆盖协议、责任、幂等、恢复、证据和测试，不以出现一个Human Grill UI作为完成。)
- Q: 第一阶段Human Grill/recovery测试与真实Provider dogfood如何分层？ → 采用两阶段：第一阶段使用内存/SQLite fixture和模拟Provider，确定性证明Grill状态机、CAS决策幂等/冲突、Plan revision/grant_digest绑定、re-preflight唯一放行、blocked/recovery/uncertainty、adopt/reconcile/compensate/abandon、claim/dispatch阻断和Evidence/Review Handoff重放，side_effects_executed=false；第二阶段独立做真实Provider dogfood，证明查询、资源归属、幂等、恢复/补偿、脱敏receipt和真实副作用审计。 (协议契约测试不依赖外部网络；真实Provider证据单独归类，禁止用模拟结果冒充真实能力。)
- Q: 模拟Provider必须覆盖哪些结果类型？ → 采用固定四类结果矩阵：confirmed-success（明确成功并生成receipt）、confirmed-failure-no-side-effect（明确失败且证明无副作用，可recovery）、partial-success（部分资源/步骤成功，必须Human Grill）、outcome-uncertain（无法确认，冻结资源并禁止盲目retry）。每类验证分类、StateStore、receipt、依赖推进、Grill/recovery分支、side_effects_executed和重放一致性，并覆盖duplicate/conflict/stale。 (成功和普通失败不足以证明责任、恢复和竞态；部分成功与不确定必须成为一等测试分支。)
- Q: Human Grill协议fixture是否允许模拟副作用？ → 采用：允许完全隔离、可重置的fixture-only虚拟Provider状态，用于验证已创建资源、部分成功、补偿、重复请求和资源归属不明；所有虚拟副作用显式标记provider_kind=simulated、fixture_state_digest、virtual_side_effects、side_effects_executed和real_provider_calls=0，不能进入真实Provider completion evidence；真实dogfood使用独立evidence kind。 (测试恢复和补偿但不伪造生产能力，确保模拟结果与真实Provider证据在协议和存储上可区分。)
- Q: Human Grill fixture中的Provider State、StateStore和ArtifactStore如何隔离？ → 采用三层隔离：Fixture Provider State模拟外部资源/副作用；StateStore保存ZAgenticLoop canonical lifecycle facts/CAS projection；ArtifactStore保存Grill、Decision、Plan、Execution、Evidence和Receipt。Provider State不能充当StateStore，StateStore不能推断Provider资源存在，ArtifactStore不替代Provider查询；模拟结果经过与真实Provider相同的adapter边界；每次fixture使用独立namespace、可重置，测试结束无真实资源/文件/凭据残留。 (让测试真实覆盖外部事实不一致和reconcile，而不是通过共享内存绕过协议边界。)
- Q: Human Grill/recovery并发测试必须覆盖哪些竞态？ → 采用覆盖三类竞态：同一事件同一Grill的并发决策（CAS唯一winner，另一方conflict）；同一事件同一恢复digest的重复恢复（duplicate，不创建第二Execution）；不同事件的资源namespace隔离（相同逻辑资源名也必须按scope/事件绑定/Human决策证明是否冲突）。另测CAS revision、stale Plan/Decision/Execution、晚到决策、独立事件互不影响、共享StateStore/ArtifactStore授权隔离和零未授权副作用。 (多设备OPN必须证明跨设备并发与跨事件资源边界，不能只用单线程状态机测试。)
- Q: Human Grill的协议与CLI/Web UI/通知界面如何分层？ → 采用协议优先、界面适配：Human Grill的唯一规范对象由核心协议定义；CLI、Web UI、桌面通知及其他界面只展示同一份事实、候选策略、风险和选项，并提交绑定grill_id、plan_revision和decision_digest的Human Grill Decision。任何界面都不能自行定义恢复语义、绕过re-preflight或直接将任务置为execution-ready。 (协议层保证跨设备、跨界面的一致责任、幂等、审计和重放；界面层是projection/submission adapter，不拥有独立业务语义。)
- Q: Human提交决策后，界面是否必须展示decision-recorded中间状态？ → 采用：提交成功后先显示decision-recorded，展示绑定的grill_id、原plan_revision、新Plan revision生成状态、grant_digest变化、re-preflight状态及最终结果。只有协议返回execution-ready后才显示可执行；若re-preflight失败，必须显示新的blocked或needs-human-grill，不能用模糊处理中替代协议状态或让Human误以为任务已恢复。 (决策记录、计划修订和执行放行是不同事实；跨设备界面必须能看到同一状态投影，避免责任和用户预期错位。)
- Q: 跨设备Human Grill通知采用什么投递语义？ → 采用至少一次投递、协议层幂等去重和StateStore可拉取事实。通知只提醒待处理Grill或状态变化，不承载唯一事实；重复、乱序或丢失通知不改变协议状态，Human可从StateStore读取当前版本。决策提交绑定grill_id、plan_revision和decision_digest并通过CAS校验，避免多设备重复操作造成二次放行。 (通知是唤醒机制，不是事实存储或授权通道；跨设备可靠性由可拉取状态、版本校验和幂等协议共同保证。)
- Q: 多设备同时提交不同Human Grill决策时如何收敛？ → 采用CAS唯一winner：第一个有效决策成为winner；后续不同decision_digest明确返回conflict，界面展示当前winner、提交设备/身份、决策摘要和plan_revision，不能直接覆盖。若事实发生变化，中心责任单元必须创建新的Grill或Plan revision，重新确认并re-preflight；后续提交不能绕过责任链直接放行。 (同一Grill只承载一个责任决策，避免最后一次点击覆盖已生效决策；新事实通过新版本表达，而不是修改历史记录。)
- Q: 离线设备重连后发现本地Human Grill或Plan过期时如何处理？ → 采用：离线设备只能读取并标记本地快照为stale，不能提交旧revision的决策或执行请求。重连后先同步StateStore；若Grill仍开放则基于当前revision重新展示；若已有winner、已完成或已进入新Plan，则返回stale-decision或stale-plan，保留本地操作记录但不产生副作用。只有获取最新事实并提交匹配revision的决策，才能进入CAS流程。 (离线缓存是只读工作副本，不是可独立授权的状态源；过期操作必须可解释、可审计、无副作用。)
- Q: 跨设备身份与Human责任如何绑定？ → 采用：设备或Agent是执行身份，Human是责任主体。每次Human Grill Decision必须绑定human_id、device_id、session_id、认证方式和时间；设备密钥只能证明哪个设备提交，不能单独证明Human授权。HumanSigner或等价Human approval provider产生不可伪造的批准证据；Agent不能替代Human生成Human Decision。 (保持节点协议对称、责任权限和最终决策不对称；批准证据必须可审计、可验证且不能由执行Agent自签。)
- Q: HumanSigner批准证据如何在多设备间验证？ → 采用：签名覆盖规范化的decision_digest、grill_id、plan_revision、human_id和批准时间窗；StateStore保存公钥或Key ID、算法、签名及撤销状态，设备间同步可验证证据而不是私钥。验证失败、签名过期、Key ID被撤销或绑定内容不一致时必须blocked，不能降级为已登录Human或由Agent自行批准。macOS Keychain、Windows CNG、Linux PKCS#11/TPM2只是不同签名provider，不改变协议语义。 (批准证据是跨设备可验证的协议事实；私钥永不离开provider，provider差异由HumanSigner适配器封装。)
- Q: 密钥轮换或撤销后，历史Human Decision如何处理？ → 采用：撤销或轮换默认只阻止该Key产生新的批准，不回溯否定在有效时间窗内已验证并进入不可变记录的历史决策；尚未完成re-preflight的待执行Plan必须重新检查Key状态，必要时重新Human Grill。若撤销原因是密钥泄露或批准证据被判定无效，则作为安全事件冻结相关Plan和Execution，要求新的HumanSigner重新批准。 (区分凭证生命周期与历史责任证据；安全事件可以触发更严格的冻结和重新授权，不能静默继续执行。)
<!-- ROADMAP_SECTION_END -->
