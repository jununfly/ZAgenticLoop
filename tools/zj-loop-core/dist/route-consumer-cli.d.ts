export type RouteConsumerCliConfig = {
    name: string;
    routeId: string;
    description: string;
};
export declare function runRouteConsumerCli(config: RouteConsumerCliConfig, argv?: readonly string[]): Promise<number>;
