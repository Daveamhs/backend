import type { PrismaClient } from '@prisma/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { VerificationService } from './verification.service';
const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock('../webhooks/webhook.service', () => ({ WebhookService: vi.fn(() => ({ dispatchEvent: publish })) }));
beforeEach(() => { vi.clearAllMocks(); });
it('publishes creator.verified after verification is saved', async () => {
  const prisma = { creator: { findUnique: vi.fn().mockResolvedValue({ verified: false }), update: vi.fn().mockResolvedValue({}) } };
  publish.mockImplementation(async () => expect(prisma.creator.update).toHaveBeenCalled());
  await new VerificationService(prisma as unknown as PrismaClient).verifyCreator('creator');
  expect(publish).toHaveBeenCalledWith('creator', 'creator', 'creator.verified', { creatorId: 'creator' });
});
it('does not republish an already verified creator', async () => {
  const prisma = { creator: { findUnique: vi.fn().mockResolvedValue({ verified: true }), update: vi.fn() } };
  await new VerificationService(prisma as unknown as PrismaClient).verifyCreator('creator');
  expect(publish).not.toHaveBeenCalled();
});


