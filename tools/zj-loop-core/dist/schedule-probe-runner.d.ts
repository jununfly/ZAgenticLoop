export declare const SCHEDULE_PROBE_CONFIRMATION = "RUN_TEMPORARY_GITLAB_SCHEDULE_PROBE";
export declare function planGitLabScheduleProbe(input: any): {
    schema: string;
    status: string;
    reason: string;
    operations: never[];
    probe_id?: undefined;
    project?: undefined;
    state_path?: undefined;
    deadline_at?: undefined;
    temporary_schedule?: undefined;
} | {
    schema: string;
    status: string;
    probe_id: string;
    project: string;
    state_path: string;
    deadline_at: string;
    temporary_schedule: {
        description: string;
        ref: string;
        cron: string;
        cron_timezone: string;
        variables: {
            key: string;
            value: string;
            variable_type: string;
        }[];
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
export declare function readGitLabOwnedSchedulePipeline(input: any): Promise<{
    status: string;
    reason?: undefined;
    pipeline?: undefined;
} | {
    status: string;
    reason: string;
    pipeline?: undefined;
} | {
    status: string;
    pipeline: any;
    reason?: undefined;
}>;
export declare function readGitLabScheduleProbeReceipt(input: any): Promise<{
    status: string;
    reason?: undefined;
    receipt?: undefined;
    job_id?: undefined;
} | {
    status: string;
    reason: string;
    receipt?: undefined;
    job_id?: undefined;
} | {
    status: string;
    receipt: any;
    job_id: any;
    reason?: undefined;
}>;
export declare function runGitLabScheduleProbe(input: any): Promise<any>;
export declare function resumeGitLabScheduleProbe(input: any): Promise<any>;
export declare function restoreGitLabScheduleProbe(input: any): Promise<any>;
