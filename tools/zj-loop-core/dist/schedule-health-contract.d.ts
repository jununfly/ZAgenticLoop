export declare const SCHEDULE_HEALTH_SCHEMA = "zj-loop.schedule_health.v1";
export type ScheduleHealthStatus = 'healthy' | 'not_due' | 'configuration_missing' | 'execution_missing' | 'artifact_missing' | 'artifact_schema_invalid';
export declare function evaluateScheduleHealth(input: any): any;
export declare function inspectGitLabScheduleHealth(input: any): Promise<any>;
