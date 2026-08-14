# OPN Human-Audited Task Routing Topology

This topology shows the intended OPN collaboration model:

- The StartEnd Endpoint contains the Human who initiates and reviews work, the planning/orchestration Agent, the local OPN WebUI gateway, and other local Agents.
- Each Worker device has its own OPN WebUI gateway. The gateway is the local audit boundary for messages entering and leaving that device.
- A Human approval at the relevant gateway is the distribution gate. An Agent may only execute a task after the gateway has admitted it.
- A Worker Agent returns its result through OPN to the originating endpoint, where the result remains available for audit and follow-up.

```mermaid
flowchart TB
  subgraph OPN Device1[StartEnd Endpoint]
    Human1[Human “发起和审校任务”]
    Agent1-1[Agent “理解Human意图、计划并编排”]
    WebUI1[OPN WebUI网关 ”Human可以在这审计所有的message“]
    Agent1-2[Device1内的其他Agent “可以承接任务”]
  end
  subgraph OPN Device2[Worker]
    WebUI2[OPN WebUI网关 ”Human可以在这审计所有的message“]
    Agent2-1[Agent “可以承接任务”]
    Agent2-2[Device2内的其他Agent “可以承接任务”]
  end
  subgraph OPN Device3[Worker]
    WebUI3[OPN WebUI网关 ”Human可以在这审计所有的message“]
    Agent3-1[Agent “可以承接任务”]
    Agent3-2[Device3内的其他Agent “可以承接任务”]
  end

  Human1 --> Agent1-1
  Agent1-1 --> WebUI1
  WebUI1-->|Human批准后分发|Agent1-1
  WebUI1-->|Human批准后分发|Agent1-2
  WebUI1 --> WebUI2
  WebUI1 --> WebUI3
  WebUI2-->|Human批准后分发|Agent2-1
  WebUI2-->|Human批准后分发|Agent2-2
  WebUI3-->|Human批准后分发|Agent3-1
  WebUI3-->|Human批准后分发|Agent3-2
```
