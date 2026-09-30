import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

// Redis connection for BullMQ (using redis client package)
export const redis = createClient({
  url: config.REDIS_URL,
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

// Initialize Redis connection
redis.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
});

// Let BullMQ create its own compatible Redis connections.
const webhookRedisUrl = new URL(config.REDIS_URL);
export const webhookConnection = {
  host: webhookRedisUrl.hostname,
  port: Number(webhookRedisUrl.port || 6379),
  username: decodeURIComponent(webhookRedisUrl.username) || undefined,
  password: decodeURIComponent(webhookRedisUrl.password) || undefined,
  db: Number(webhookRedisUrl.pathname.slice(1) || 0),
  ...(webhookRedisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};
// Job queues
export const stellarConfirmationQueue = new Queue('stellar-confirmation', {
  connection: webhookConnection,
});
export const webhookDispatchQueue = new Queue('webhook-dispatch', {
  connection: webhookConnection,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
});
export const webhookDeadLetterQueue = new Queue('webhook-dead-letter', { connection: webhookConnection });

// Queue event handlers
export const stellarConfirmationEvents = new QueueEvents('stellar-confirmation', {
  connection: webhookConnection,
});

export const webhookDispatchEvents = new QueueEvents('webhook-dispatch', {
  connection: webhookConnection,
});

// Initialize queue event listeners
stellarConfirmationEvents.on('completed', ({ jobId }) => {
  logger.info(`Stellar confirmation job ${jobId} completed`);
});

stellarConfirmationEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Stellar confirmation job ${jobId} failed: ${failedReason}`);
});

webhookDispatchEvents.on('completed', ({ jobId }) => {
  logger.info(`Webhook dispatch job ${jobId} completed`);
});

webhookDispatchEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Webhook dispatch job ${jobId} failed: ${failedReason}`);
});

export async function closeQueues() {
  await stellarConfirmationQueue.close();
  await webhookDispatchQueue.close();
  await webhookDeadLetterQueue.close();
  await stellarConfirmationEvents.close();
  await webhookDispatchEvents.close();
  await redis.quit();
}
