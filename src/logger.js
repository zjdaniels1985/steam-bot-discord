class Logger {
  constructor(level = 'info') {
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    this.level = this.levels[level] || this.levels.info;
  }

  formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    return `[${timestamp}] ${levelStr} ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ')}`;
  }

  debug(...args) {
    if (this.level <= this.levels.debug) {
      console.log(this.formatMessage('debug', ...args));
    }
  }

  info(...args) {
    if (this.level <= this.levels.info) {
      console.log(this.formatMessage('info', ...args));
    }
  }

  warn(...args) {
    if (this.level <= this.levels.warn) {
      console.warn(this.formatMessage('warn', ...args));
    }
  }

  error(...args) {
    if (this.level <= this.levels.error) {
      console.error(this.formatMessage('error', ...args));
    }
  }
}

export default Logger;
