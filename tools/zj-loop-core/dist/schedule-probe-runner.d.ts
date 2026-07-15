export declare const SCHEDULE_PROBE_CONFIRMATION = "RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE";
export declare function planGitLabScheduleProbe(input: any): {
    schema: string;
    status: string;
    reason: string;
    operations: never[];
    probe_id?: undefined;
    project?: undefined;
    state_path?: undefined;
    temporary_schedule?: undefined;
} | {
    schema: string;
    status: string;
    probe_id: string;
    project: string;
    state_path: string;
    temporary_schedule: {
        description: string;
        ref: string;
        cron: string;
        cron_timezone: string;
    };
    operations: string[];
    reason?: undefined;
};
export declare function writeGitLabScheduleProbeState(input: {
    root?: string;
    plan: any;
}): Promise<{
    path: any;
    record: any;
}>;
export declare function readGitLabScheduleProbeState(input: {
    root?: string;
    probeId: string;
}): Promise<any>;
export declare function createGitLabOwnedSchedule(input: any): Promise<any>;
export declare function cleanupGitLabOwnedSchedule(input: any): Promise<any>;
