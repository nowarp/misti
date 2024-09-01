export class SouffleError {
  constructor() {}
  static make(type: string, error: unknown): Error {
    if (!(error instanceof Error)) {
      throw error;
    }
    return new Error(`${type}: ${error}`);
  }
}

export class SouffleInternalError extends SouffleError {
  static make(error: unknown): Error {
    return super.make("Internal error", error);
  }
}

export class SouffleExecutionError extends SouffleError {
  static make(error: unknown): Error {
    return super.make("Execution error", error);
  }
}

export class SouffleUsageError extends SouffleError {
  static make(error: unknown): Error {
    return super.make("Library is used incorrectly", error);
  }
}
