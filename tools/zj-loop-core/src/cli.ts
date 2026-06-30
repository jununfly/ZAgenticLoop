export type CliIo = {
  stdout(message: string): void;
  stderr(message: string): void;
};

export const defaultCliIo: CliIo = {
  stdout(message: string) {
    console.log(message);
  },
  stderr(message: string) {
    console.error(message);
  },
};

export type CliOptionSpec =
  | {
      name: string;
      flag?: string;
      alias?: string;
      type: 'boolean';
      description: string;
      default?: boolean;
    }
  | {
      name: string;
      flag?: string;
      alias?: string;
      type: 'string';
      description: string;
      valueName?: string;
      default?: string;
    }
  | {
      name: string;
      flag?: string;
      alias?: string;
      type: 'enum';
      description: string;
      valueName?: string;
      values: readonly string[];
      default?: string;
    }
  | {
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

export type CliHandlerResult = void | number | { exitCode?: number };

export type CliSpec = {
  name: string;
  description?: string;
  usage?: string;
  options: readonly CliOptionSpec[];
  helpText?: string | (() => string);
  handler(context: CliHandlerContext): CliHandlerResult | Promise<CliHandlerResult>;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export async function runCli(
  spec: CliSpec,
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = defaultCliIo,
): Promise<number> {
  try {
    const options = parseCliOptions(spec, argv);
    if (options.help === true) {
      io.stdout(formatCliHelp(spec));
      return 0;
    }

    const result = await spec.handler({ argv, io, options });
    if (typeof result === 'number') return result;
    return result?.exitCode ?? 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CliUsageError) {
      io.stderr(message);
      return 1;
    }

    io.stderr(`${spec.name} failed: ${message}`);
    return 1;
  }
}

export function parseCliOptions(spec: CliSpec, argv: readonly string[]): CliOptions {
  const byFlag = new Map<string, CliOptionSpec | { name: 'help'; type: 'boolean' }>();
  const positionals = spec.options.filter((option) => option.type === 'positional');
  for (const option of spec.options) {
    if (option.type === 'positional') continue;
    byFlag.set(`--${option.flag ?? option.name}`, option);
    if (option.alias) byFlag.set(option.alias, option);
  }
  byFlag.set('--help', { name: 'help', type: 'boolean' });
  byFlag.set('-h', { name: 'help', type: 'boolean' });

  const values: CliOptions = {};
  for (const option of spec.options) {
    if ('default' in option) values[option.name] = option.default;
  }
  let positionalIndex = 0;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const option = byFlag.get(arg);
    if (!option) {
      if (arg.startsWith('-')) throw new CliUsageError(`Unknown option: ${arg}`);
      const positional = positionals[positionalIndex];
      if (!positional) throw new CliUsageError(`Unexpected argument: ${arg}`);
      values[positional.name] = arg;
      positionalIndex++;
      continue;
    }

    if (option.type === 'boolean') {
      values[option.name] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('-')) {
      throw new CliUsageError(`Missing value for option: ${arg}`);
    }

    if (option.type === 'enum' && !option.values.includes(value)) {
      throw new CliUsageError(`Invalid value for option ${arg}: ${value}. Expected one of: ${option.values.join(', ')}`);
    }

    values[option.name] = value;
    index++;
  }

  return values;
}

export function formatCliHelp(spec: CliSpec): string {
  if (typeof spec.helpText === 'function') return spec.helpText();
  if (typeof spec.helpText === 'string') return spec.helpText;

  const lines = [];
  if (spec.description) {
    lines.push(`${spec.name} - ${spec.description}`, '');
  } else {
    lines.push(spec.name, '');
  }

  lines.push('Usage:', `  ${spec.usage ?? spec.name}`, '', 'Options:');
  for (const option of spec.options) {
    if (option.type === 'positional') continue;
    const alias = option.alias ? `${option.alias}, ` : '';
    const value = option.type === 'boolean' ? '' : ` <${option.valueName ?? 'value'}>`;
    lines.push(`  ${alias}--${option.flag ?? option.name}${value}  ${option.description}`);
  }
  lines.push('  -h, --help  This help');

  return lines.join('\n');
}
