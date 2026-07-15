import { type CliIo } from './cli.js';
type ScheduleProbeRunner = {
    runGitLabScheduleProbe(input: any): Promise<any>;
    resumeGitLabScheduleProbe(input: any): Promise<any>;
    restoreGitLabScheduleProbe(input: any): Promise<any>;
};
type SignalTarget = {
    on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
    off?(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};
export type ScheduleProbeCliInput = {
    argv?: readonly string[];
    io?: CliIo;
    env?: NodeJS.ProcessEnv;
    signalTarget?: SignalTarget;
    runner?: ScheduleProbeRunner;
};
export declare function runScheduleProbeCli(input?: ScheduleProbeCliInput): Promise<number>;
export {};
