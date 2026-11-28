import {
  addTrigger,
  deleteTrigger,
  listTriggers,
  type AddTriggerInput,
  type FunctionRef,
  type TriggerServices,
} from "./operations/triggers.ts";
import type { TriggerRow } from "./triggerRows.ts";

// Tab Triggers của Lambda gom nhiều service. Tách khỏi LambdaService vì các service đó phụ thuộc Lambda
export function createLambdaTriggersService(services: TriggerServices) {
  return {
    listTriggers: (fn: FunctionRef) => listTriggers(services, fn),
    addTrigger: (fn: FunctionRef, values: AddTriggerInput) => addTrigger(services, fn, values),
    deleteTrigger: (row: TriggerRow) => deleteTrigger(services, row),
  };
}
