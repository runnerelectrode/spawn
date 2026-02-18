import { Queue } from "bullmq";
import type { DeployJobPayload } from "@spawn/shared";

const redisConnection = {
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: parseInt(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port || "6379"),
};

export const deployQueue = new Queue<DeployJobPayload>("deploy", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1, // we handle retries manually via the healer
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
