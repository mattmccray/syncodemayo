export const LOG_LEVEL_ENV = 'SYNCODEMAYO_LOG_LEVEL'

export enum LogLevel {
  Debug,
  Default,
  Info,
  Urgent,
}

const getLogLevel = (level: LogLevel | string) => {
  if (typeof level == 'string') {
    switch (level.toLowerCase()) {
      case 'info': return LogLevel.Info
      case 'debug': return LogLevel.Debug
      case 'error':
      case 'none':
      case 'urgent': return LogLevel.Urgent
      default: return LogLevel.Default
    }
  }
  else {
    return level
  }
}

let logger = defaultLogger
let logLevel: LogLevel = getLogLevel(process.env[LOG_LEVEL_ENV] || 'Default')

export function log(...args: any[]): void {
  logger(LogLevel.Default, args)
}

export function debug(...args: any[]): void {
  logger(LogLevel.Debug, args)
}

export function info(...args: any[]): void {
  logger(LogLevel.Info, args)
}

export function urgent(...args: any[]): void {
  logger(LogLevel.Urgent, args)
}

export function setLogLevel(level: LogLevel) {
  logLevel = level
}


function defaultLogger(level: LogLevel, args: any[]) {
  if (level >= logLevel) {
    console.log(...args)
  }
}