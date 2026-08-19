import { createFirestoreOperatorStore } from "@/store/firestore";
import type { OperatorStore } from "@/store/types";

let store: OperatorStore | undefined;

export function setOperatorStore(next: OperatorStore): void {
  store = next;
}

export function resetOperatorStore(): void {
  store = undefined;
}

export function getOperatorStore(): OperatorStore {
  if (!store) {
    store = createFirestoreOperatorStore();
  }
  return store;
}
