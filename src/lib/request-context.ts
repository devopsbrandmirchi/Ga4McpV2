import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";

export interface OperatorContext {
  requestId: string;
  operatorId: string;
  googleSub: string;
}

const storage = new AsyncLocalStorage<OperatorContext>();

export function createRequestId(req?: Request): string {
  const incoming = req?.headers.get("x-cloud-trace-context")?.split("/")[0]?.trim();
  if (incoming) {
    return incoming;
  }
  const requestId = req?.headers.get("x-request-id")?.trim();
  if (requestId) {
    return requestId;
  }
  return randomUUID();
}

export function runWithOperator<T>(context: OperatorContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getOperatorContext(): OperatorContext {
  const context = storage.getStore();
  if (!context) {
    throw new AppError(
      "No authenticated operator is bound to this request.",
      "unauthorized",
      401,
    );
  }
  return context;
}

export function peekOperatorContext(): OperatorContext | undefined {
  return storage.getStore();
}
