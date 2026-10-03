// Same read-only catalog used by checkout: no duplicated prices or billing rules.
export {
  FIO_PLAN_CATALOG as plans,
  SALE_BILLING_CYCLES as cycles,
} from "../../../shared/fio-plans";
export type Cycle =
  (typeof import("../../../shared/fio-plans").SALE_BILLING_CYCLES)[number];
