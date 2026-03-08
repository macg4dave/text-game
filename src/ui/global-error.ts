export interface FatalUiErrorState {
  title: string;
  summary: string;
  detail: string;
  recovery: string;
}

export interface GlobalErrorEventMap {
  error: {
    error?: unknown;
    message?: string;
  };
  unhandledrejection: {
    reason?: unknown;
  };
}

export interface GlobalErrorEventTarget {
  addEventListener<TKey extends keyof GlobalErrorEventMap>(
    type: TKey,
    listener: (event: GlobalErrorEventMap[TKey]) => void
  ): void;
}

export function createFatalUiErrorState(reason: unknown): FatalUiErrorState {
  return {
    title: "Unexpected app error",
    summary: "The page hit an unexpected problem and stopped responding safely.",
    detail: getFatalUiErrorDetail(reason),
    recovery: "Refresh the page. If it happens again, restart the launcher or server and try again."
  };
}

export function registerGlobalErrorHandlers(
  target: GlobalErrorEventTarget,
  onFatalError: (state: FatalUiErrorState) => void
): void {
  target.addEventListener("error", (event) => {
    onFatalError(createFatalUiErrorState(event.error ?? event.message));
  });

  target.addEventListener("unhandledrejection", (event) => {
    onFatalError(createFatalUiErrorState(event.reason));
  });
}

function getFatalUiErrorDetail(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message;
  }

  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }

  if (reason && typeof reason === "object" && "message" in reason) {
    const message = reason.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "No additional error detail was available.";
}
