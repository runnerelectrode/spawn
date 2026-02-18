// Entry point for the background worker process
// Run: bun run src/workers/index.ts

import { deployWorker } from "./deploy";
import { startHealthChecker } from "./healer";

console.log("Spawn workers starting...");

deployWorker.on("completed", (job) => {
  console.log(`[deploy] Job ${job.id} completed`);
});

deployWorker.on("failed", (job, err) => {
  console.error(`[deploy] Job ${job?.id} failed:`, err.message);
});

startHealthChecker();

console.log("All workers running.");
