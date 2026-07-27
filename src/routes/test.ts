import { FastifyInstance } from 'fastify';
import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { InterceptService } from '@/services/intercept.service';

const MOCK_USER_ID = '999999999';
const MOCK_USER_NAME = 'testuser';

export default async function testRoutes(fastify: FastifyInstance) {
  if (process.env.NODE_ENV !== 'test') {
    fastify.log.warn('Test routes are not available in non-test environments.');
    return;
  }

  fastify.post('/api/test/setup-user', async (request, reply) => {
    try {
      await prisma.user.upsert({
        where: { telegramId: BigInt(MOCK_USER_ID) },
        update: { isIntercepted: false, creditBalance: 10 },
        create: {
          telegramId: BigInt(MOCK_USER_ID),
          username: MOCK_USER_NAME,
          firstName: 'Intercept',
          lastName: 'Test',
          language: 'en',
          creditBalance: 10,
          tier: 'free',
        },
      });
      return reply.send({ success: true, message: 'Test user created/reset.' });
    } catch (error) {
      const err = error as Error;
      return reply.status(500).send({ success: false, message: err.message });
    }
  });

  fastify.post('/api/test/teardown-user', async (request, reply) => {
    try {
        await prisma.user.update({
            where: { telegramId: BigInt(MOCK_USER_ID) },
            data: { isIntercepted: false }
        });
        await prisma.chatEvent.deleteMany({ where: { userId: BigInt(MOCK_USER_ID) } });
        await redis.del(`intercept-flag:${MOCK_USER_ID}`);
      return reply.send({ success: true, message: 'Test user cleaned up.' });
    } catch (error) {
      const err = error as Error;
      return reply.status(500).send({ success: false, message: err.message });
    }
  });

  fastify.post('/api/test/simulate-event', async (request, reply) => {
    try {
      const { event, message, data } = request.body as { event: string; message: string; data: Record<string, unknown> };
      await InterceptService.logEvent(BigInt(MOCK_USER_ID), event, message, data);
      return reply.send({ success: true, message: 'Event simulated.' });
    } catch (error) {
        const err = error as Error;
        return reply.status(500).send({ success: false, message: err.message });
    }
  });
  
  fastify.get('/api/test/check-delivery-status/:jobId', async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const deliveredMedia = await InterceptService.waitForMedia(jobId, 15);
      if (deliveredMedia) {
        return reply.send({ success: true, delivered: true, deliveredMedia });
      } else {
        return reply.status(404).send({ success: false, delivered: false, message: 'Media not delivered in time.' });
      }
    } catch (error) {
      const err = error as Error;
      return reply.status(500).send({ success: false, message: err.message });
    }
  });
}
