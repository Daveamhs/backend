import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { webhookDeadLetterQueue, webhookConnection } from '../queue';
import { createWebhookSignature } from '../../domains/webhooks/webhook.events';

const prisma = new PrismaClient();

export const webhookDispatchWorker = new Worker(
  'webhook-dispatch',
  async (job: Job) => {
    const { webhookId, eventType, payload, eventId, deliveryId } = job.data;

    logger.info(`Dispatching webhook ${webhookId} for ${eventType} event`);

    try {
      const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });

      if (!webhook) {
        throw new Error(`Webhook ${webhookId} not found`);
      }

      if (!webhook.active || !webhook.events.includes(eventType)) {
        throw new Error('Webhook is inactive or no longer subscribed');
      }

      // Create signature for webhook verification
      const signature = createWebhookSignature(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        webhook.secret
      );

      const response = await axios.post(webhook.url, typeof payload === 'string' ? payload : JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'X-Dorisio-Signature': signature,
          'X-Dorisio-Event': eventType,
          'X-Dorisio-Delivery-Id': deliveryId ?? eventId,
          'X-Dorisio-Event-Version': '1',
        },
        timeout: 30000,
        maxRedirects: 0,
      });

      // Track successful dispatch
      await prisma.webhookEvent.update({
        where: { id: deliveryId ?? eventId },
        data: {
          status: 'delivered',
          attempts: job.attemptsMade + 1,
          updatedAt: new Date(),
        },
      });

      logger.info(`Webhook ${webhookId} dispatched successfully (status ${response.status})`);
      return { success: true, webhookId, statusCode: response.status };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`Webhook dispatch failed for ${webhookId}:`, error);

      // Track failed dispatch attempt
      await prisma.webhookEvent.update({
        where: { id: deliveryId ?? eventId },
        data: {
          status: job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1) ? 'failed' : 'pending',
          attempts: job.attemptsMade + 1,
          lastError: errorMsg,
          updatedAt: new Date(),
        },
      });

      if (job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1)) {
        await webhookDeadLetterQueue.add('failed-delivery', {
          ...job.data,
          failedAt: new Date().toISOString(),
          error: errorMsg,
          attempts: job.attemptsMade + 1,
        }, { jobId: deliveryId ?? eventId });
      }

      throw error;
    }
  },
  {
    connection: webhookConnection,
    concurrency: 1,
  }
);

webhookDispatchWorker.on('completed', (job) => {
  logger.info(`Webhook dispatch worker completed job ${job.id}`);
});

webhookDispatchWorker.on('failed', (job, err) => {
  logger.error(`Webhook dispatch worker failed job ${job?.id}:`, err);
});

webhookDispatchWorker.on('error', (error) => {
  logger.error('Webhook worker error:', error);
});

export async function closeWebhookWorker(): Promise<void> {
  await webhookDispatchWorker.close();
  await prisma.$disconnect();
}
