export type GatewayResult = {
    status: 'ok';
    value: Record<string, unknown>;
} | {
    status: 'blocked';
    reason: string;
};
export declare function opnInboxRead(): Promise<GatewayResult>;
export declare function opnMessageSend(input: {
    target_node_id: string;
    message: string;
    message_id?: string;
    notification_kind?: string;
}): Promise<GatewayResult>;
