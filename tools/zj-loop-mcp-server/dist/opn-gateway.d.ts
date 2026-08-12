export type GatewayResult = {
    status: 'ok';
    value: Record<string, unknown>;
} | {
    status: 'blocked';
    reason: string;
};
export declare function opnInboxRead(): Promise<GatewayResult>;
export declare function opnGatewayStatus(): Promise<GatewayResult>;
export declare function opnInboxAck(input: {
    message_id: string;
    envelope_digest: string;
}): Promise<GatewayResult>;
export declare function opnMessageSend(input: {
    target_node_id: string;
    message: string;
    message_id?: string;
    notification_kind?: string;
}): Promise<GatewayResult>;
export declare function opnAgentTaskSend(input: {
    target_node_id: string;
    task_json: string;
    message_id?: string;
    event_id?: string;
    plan_id?: string;
    plan_revision?: number;
}): Promise<GatewayResult>;
export declare function opnTaskDraftList(): Promise<GatewayResult>;
