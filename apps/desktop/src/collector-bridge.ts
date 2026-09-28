import { spawn } from "node:child_process";

const DEFAULT_MAX_LINE_BYTES = 2 * 1024 * 1024;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAXIMUM_RETRY_DELAY_MS = 30_000;

export interface LineDecoder {
  push(chunk: string): void;
}

export function createLineDecoder(
  onLine: (line: string) => void,
  maximumLineBytes = DEFAULT_MAX_LINE_BYTES
): LineDecoder {
  let buffered = "";
  let discarding = false;
  return {
    push(chunk) {
      let remaining = chunk;
      if (discarding) {
        const newline = remaining.indexOf("\n");
        if (newline === -1) return;
        remaining = remaining.slice(newline + 1);
        discarding = false;
      }
      buffered += remaining;
      if (Buffer.byteLength(buffered, "utf8") > maximumLineBytes && !buffered.includes("\n")) {
        buffered = "";
        discarding = true;
        return;
      }
      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line.length > 0 && Buffer.byteLength(line, "utf8") <= maximumLineBytes) onLine(line);
        newline = buffered.indexOf("\n");
      }
      if (Buffer.byteLength(buffered, "utf8") > maximumLineBytes) {
        buffered = "";
        discarding = true;
      }
    }
  };
}

export interface CollectorBridgeOptions {
  platform: NodeJS.Platform;
  collectorPath: string;
  wslDistro?: string;
  onLine(line: string): boolean;
  onDisconnect(reason: string, retryDelayMs: number): void;
}

export interface CollectorBridge {
  stop(): void;
}

export interface CollectorConnectionCallbacks {
  onLine(line: string): void;
  onDisconnect(reason: string): void;
}

export interface CollectorConnection {
  stop(): void;
}

export interface CollectorSupervisorOptions {
  connect(callbacks: CollectorConnectionCallbacks): CollectorConnection;
  onLine(line: string): boolean;
  onDisconnect(reason: string, retryDelayMs: number): void;
  initialRetryDelayMs?: number;
  maximumRetryDelayMs?: number;
}

export function startCollectorSupervisor(options: CollectorSupervisorOptions): CollectorBridge {
  const initialRetryDelayMs = options.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS;
  const maximumRetryDelayMs = options.maximumRetryDelayMs ?? DEFAULT_MAXIMUM_RETRY_DELAY_MS;
  let nextRetryDelayMs = initialRetryDelayMs;
  let currentConnection: CollectorConnection | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = (): void => {
    if (stopped) return;
    let attemptEnded = false;
    const disconnect = (reason: string): void => {
      if (stopped || attemptEnded) return;
      attemptEnded = true;
      currentConnection?.stop();
      currentConnection = null;
      const retryDelayMs = nextRetryDelayMs;
      nextRetryDelayMs = Math.min(maximumRetryDelayMs, nextRetryDelayMs * 2);
      options.onDisconnect(reason, retryDelayMs);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, retryDelayMs);
    };
    let connection: CollectorConnection;
    try {
      connection = options.connect({
        onLine(line) {
          if (stopped || attemptEnded) return;
          if (options.onLine(line)) nextRetryDelayMs = initialRetryDelayMs;
        },
        onDisconnect: disconnect
      });
    } catch (error) {
      disconnect(error instanceof Error ? error.message : "Collector could not start");
      return;
    }
    if (attemptEnded || stopped) connection.stop();
    else currentConnection = connection;
  };

  connect();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      currentConnection?.stop();
      currentConnection = null;
    }
  };
}

export function startCollectorBridge(options: CollectorBridgeOptions): CollectorBridge {
  const executable = options.platform === "win32" ? "wsl.exe" : "node";
  const arguments_ =
    options.platform === "win32"
      ? [
          ...(options.wslDistro === undefined
            ? []
            : ["--distribution", options.wslDistro]),
          "--exec",
          "node",
          options.collectorPath
        ]
      : [options.collectorPath];
  return startCollectorSupervisor({
    connect(callbacks) {
      return startCollectorConnection(executable, arguments_, callbacks);
    },
    onLine: options.onLine,
    onDisconnect: options.onDisconnect
  });
}

function startCollectorConnection(
  executable: string,
  arguments_: string[],
  callbacks: CollectorConnectionCallbacks
): CollectorConnection {
  const child = spawn(executable, arguments_, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let ended = false;
  const finish = (reason: string): void => {
    if (ended) return;
    ended = true;
    callbacks.onDisconnect(reason);
  };
  const decoder = createLineDecoder(callbacks.onLine);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => decoder.push(chunk));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    console.error(chunk.trimEnd());
  });
  child.once("error", (error) => finish(error.message));
  child.once("close", (code, signal) => {
    finish(
      signal === null ? `Collector exited with code ${code ?? "unknown"}` : `Collector received ${signal}`
    );
  });
  return {
    stop() {
      ended = true;
      if (!child.killed) child.kill();
    }
  };
}
