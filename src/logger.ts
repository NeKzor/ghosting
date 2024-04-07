import * as _log from '@std/log';
import { blue, bold, red, yellow } from '@std/fmt/colors';
import { dirname } from '@std/path';

export const log = _log;

const formatLevel = (level: number, levelName: string): string => {
  switch (level) {
    case _log.LogLevels.INFO:
      return blue(levelName);
    case _log.LogLevels.WARN:
      return yellow(levelName);
    case _log.LogLevels.ERROR:
      return red(levelName);
    case _log.LogLevels.CRITICAL:
      return bold(red(levelName));
    default:
      return levelName;
  }
};

class FileLogger extends _log.RotatingFileHandler {
  override handle(logRecord: _log.LogRecord) {
    super.handle(logRecord);
    this.flush(); // Always flush
  }
}

const formatDatetime = (datetime: Date) => {
  const year = datetime.getFullYear();
  const month = (datetime.getMonth() + 1).toString().padStart(2, '0');
  const day = datetime.getDate().toString().padStart(2, '0');
  const hours = datetime.getHours().toString().padStart(2, '0');
  const minutes = datetime.getMinutes().toString().padStart(2, '0');
  const seconds = datetime.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// deno-lint-ignore no-explicit-any
const formatArgs = (args: string | any | any[]): string => {
  if (typeof args === 'string') {
    return args;
  }
  // deno-lint-ignore no-explicit-any
  return args.map((arg: any) => {
    if (typeof arg === 'string') {
      return arg;
    }
    return JSON.stringify(arg);
  }).join(' ');
};

export const installLogger = (options: {
  level: string;
  console: boolean;
  file: boolean;
  filename: string;
}) => {
  try {
    Deno.mkdirSync(dirname(options.filename), { recursive: true });
  } catch (err) {
    console.log(err);
    Deno.exit(1);
  }

  const handlers: string[] = [];
  options.console && handlers.push('console');
  options.file && handlers.push('file');

  const level = options.level.toUpperCase();
  const levelName = _log.LogLevelNames.find((levelName) => levelName === level);
  if (!levelName) {
    console.error(
      `${red('ERROR')}: Invalid log level "${options.level}". Must be one of the following: ${
        _log.LogLevelNames.map((levelName) => levelName.toLowerCase()).join(', ')
      }`,
    );
    return false;
  }

  _log.setup({
    handlers: {
      console: new _log.ConsoleHandler(levelName, {
        useColors: false,
        formatter: ({ datetime, level, levelName, msg, args }) => {
          return `${formatDatetime(datetime)} ${formatLevel(level, levelName)} ${msg}${
            args.length ? ' ' + formatArgs(args) : ''
          }`;
        },
      }),
      file: new FileLogger(levelName, {
        maxBytes: 100 * 1024 * 1024,
        maxBackupCount: 7,
        filename: options.filename,
        formatter: ({ datetime, levelName, msg, args }) => {
          return `${formatDatetime(datetime)} ${levelName} ${msg}${args.length ? ' ' + formatArgs(args) : ''}`;
        },
      }),
    },
    loggers: {
      default: {
        level: levelName,
        handlers,
      },
    },
  });

  return true;
};
