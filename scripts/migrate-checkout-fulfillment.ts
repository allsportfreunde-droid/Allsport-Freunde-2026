import "dotenv/config";
import { getSQL } from "../lib/db/utils";
import { migrateCheckoutFulfillment } from "../lib/db/checkout-schema";

migrateCheckoutFulfillment(getSQL()).then(() => {
  console.log("Checkout-Zustand und Versandnachweise vorbereitet.");
}).catch(() => {
  console.error("Checkout-Migration fehlgeschlagen. Datenbank und vorherige Preisaufteilungs-Migration prüfen.");
  process.exitCode = 1;
});
