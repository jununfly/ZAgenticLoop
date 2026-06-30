export type CliIo = {
    stdout(message: string): void;
    stderr(message: string): void;
};
export declare const defaultCliIo: CliIo;
export type CliOptionSpec = {
    name: string;
    flag?: string;
    alias?: string;
    type: 'boolean';
    description: string;
    default?: boolean;
} | {
    name: string;
    flag?: string;
    alias?: string;
    type: 'string';
    description: string;
    valueName?: string;
    default?: string;
} | {
    name: string;
    flag?: string;
    alias?: string;
    type: 'enum';
    description: string;
    valueName?: string;
    values: readonly string[];
    default?: string;
} | {
    name: string;
    type: 'positional';
    description: string;
    valueName?: string;
    default?: string;
};
export type CliOptions = Record<string, string | boolean | undefined>;
export type CliHandlerContext = {
    argv: readonly string[];
    io: CliIo;
    options: CliOptions;
};
export type CliHandlerResult = void | number | {
    exitCode?: number;
};
export type CliSpec = {
    name: string;
    description?: string;
    usage?: string;
    options: readonly CliOptionSpec[];
    helpText?: string | (() => string);
    handler(context: CliHandlerContext): CliHandlerResult | Promise<CliHandlerResult>;
};
export declare function runCli(spec: CliSpec, argv?: readonly string[], io?: CliIo): Promise<number>;
export declare function parseCliOptions(spec: CliSpec, argv: readonly string[]): CliOptions;
export declare function formatCliHelp(spec: CliSpec): string;
