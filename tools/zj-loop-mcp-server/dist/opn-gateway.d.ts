export type GatewayResult = {
    status: 'ok';
    value: Record<string, unknown>;
} | {
    status: 'blocked';
    reason: string;
};
export declare function opnInboxRead(): Promise<GatewayResult>;
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
