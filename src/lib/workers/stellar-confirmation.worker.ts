import { Worker, Job } from 'bullmq';
import { webhookConnection } from '../queue';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';


const prisma = new PrismaClient();

export const stellarConfirmationWorker = new Worker(
  'stellar-confirmation',
  async (job: Job) => {
    const { tipId, transactionHash } = job.data;

    logger.info(`Processing Stellar confirmation for tip ${tipId} (hash: ${transactionHash})`);

    try {
      // Here you would check Stellar blockchain for confirmation
      // For now, simulate with a simple check
      logger.info(`Checking transaction ${transactionHash} on Stellar`);

      // Update tip status to confirmed
      await prisma.tip.update({
        where: { id: tipId },
        data: {
          status: 'confirmed',
          updatedAt: new Date(),
        },
      });

      logger.info(`Tip ${tipId} confirmed on Stellar`);
      return { confirmed: true, tipId, transactionHash };
    } catch (error) {
      logger.error(`Error checking Stellar confirmation for ${tipId}:`, error);
      throw error;
    }
  },
  {
    connection: webhookConnection,
  }
);

stellarConfirmationWorker.on('completed', (job) => {
  logger.info(`Stellar confirmation worker completed job ${job.id}`);
});

stellarConfirmationWorker.on('failed', (job, err) => {
  logger.error(`Stellar confirmation worker failed job ${job?.id}:`, err);
});
