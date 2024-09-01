export interface ILogger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export class DefaultLogger implements ILogger {
  constructor() {}
  debug(_: string): void {}
  info(_: string): void {}
  warn(_: string): void {}
  error(message: string): void {
    console.error(message);
  }
}
