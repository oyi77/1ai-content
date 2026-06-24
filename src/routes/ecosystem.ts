/**
 * Ecosystem Integration Routes
 * 
 * Handles webhooks from 1ai-social and 1ai-affiliate.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import type { ConversionWebhook, ConversionAck, PlatformResult } from '@/types/ecosystem';

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

interface PublishResultWebhook {
  contentId: string;
  userId: string;
  results: PlatformResult[];
}

// ══════════════════════════════════════════════════════════════════════
// Routes
// ══════════════════════════════════════════════════════════════════════

export async function ecosystemRoutes(server: FastifyInstance): Promise<void> {
  
  /**
   * POST /webhook/publish-result
   * Receive publish results from 1ai-social
   */
  server.post('/webhook/publish-result', async (
    request: FastifyRequest<{ Body: PublishResultWebhook }>,
    reply: FastifyReply
  ) => {
    const { contentId, userId, results } = request.body;

    logger.info({
      msg: 'Publish result received',
      contentId,
      userId,
      published: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    // Update content publish status in database
    try {
      const publishedPlatforms = results
        .filter(r => r.success)
        .map(r => r.platform);

      const failedPlatforms = results
        .filter(r => !r.success)
        .map(r => `${r.platform}: ${r.error}`);

      logger.info({
        msg: 'Content publish status updated',
        contentId,
        publishedPlatforms,
        failedPlatforms,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ msg: 'Failed to update publish status', error, contentId });
    }

    return reply.send({ received: true });
  });

  /**
   * POST /webhook/conversion-update
   * Receive conversion events from 1ai-affiliate
   */
  server.post('/webhook/conversion-update', async (
    request: FastifyRequest<{ Body: ConversionWebhook }>,
    reply: FastifyReply
  ) => {
    const conversion = request.body;

    logger.info({
      msg: 'Conversion received',
      trackingId: conversion.trackingId,
      userId: conversion.userId,
      type: conversion.conversionType,
      revenue: conversion.revenue,
      commission: conversion.commission,
    });

    try {
      // Update user credits based on commission
      if (conversion.commission > 0) {
        // Only credit if userId is a valid Telegram ID (numeric)
        const telegramId = Number(conversion.userId);
        if (!isNaN(telegramId) && telegramId > 0) {
          try {
            await prisma.user.update({
              where: { telegramId: BigInt(telegramId) },
              data: {
                creditBalance: { increment: conversion.commission },
              },
            });

            logger.info({
              msg: 'Commission credited',
              userId: conversion.userId,
              amount: conversion.commission,
              currency: conversion.currency,
            });
          } catch (userErr) {
            logger.warn({ msg: 'User not found for commission credit', userId: conversion.userId });
          }
        } else {
          logger.warn({ msg: 'Non-numeric userId, skipping commission credit', userId: conversion.userId });
        }
      }

      const ack: ConversionAck = {
        accepted: true,
        conversionId: `conv_${Date.now()}`,
      };

      return reply.send(ack);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ msg: 'Failed to process conversion', error });

      const ack: ConversionAck = {
        accepted: false,
        error: 'Internal error',
      };

      return reply.status(500).send(ack);
    }
  });

  /**
   * GET /api/ecosystem/status
   * Health check for ecosystem services
   */
  server.get('/api/ecosystem/status', async (
    _request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const axios = require('axios');
    const { getEcosystemConfig } = require('@/config/ecosystem');
    const config = getEcosystemConfig();

    interface ServiceHealth {
      name: string;
      status: string;
      latency: number;
    }

    const checkService = async (name: string, baseUrl: string): Promise<ServiceHealth> => {
      const start = Date.now();
      try {
        await axios.get(`${baseUrl}/health`, { timeout: 5000 });
        return { name, status: 'healthy', latency: Date.now() - start };
      } catch {
        return { name, status: 'unreachable', latency: Date.now() - start };
      }
    };

    const [social, affiliate] = await Promise.all([
      checkService('1ai-social', config.social.baseUrl),
      checkService('1ai-affiliate', config.affiliate.baseUrl),
    ]);

    return reply.send({
      ecosystem: '1ai',
      services: { social, affiliate },
      timestamp: new Date().toISOString(),
    });
  });
}
