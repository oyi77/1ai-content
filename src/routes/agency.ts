/**
 * Agency Routes
 *
 * API key management for agency-tier users.
 * POST /api/agency/keys  — create key (max 5 active)
 * GET  /api/agency/keys  — list keys (masked)
 * DELETE /api/agency/keys/:id — revoke key
 */

import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { UserService } from '@/services/user.service';
import { getConfig } from '@/config/env';
import { redis } from '@/config/redis';

const getJwtSecret = (): string => getConfig().JWT_SECRET!;

/** Resolve agency user from JWT Bearer token (same pattern as web.ts getUser) */
async function getAgencyUser(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as { userId: string };
    const user = await UserService.findByUuid(decoded.userId);
    if (!user) {
      reply.status(404).send({ error: 'User not found' });
      return null;
    }
    if (user.isBanned) {
      reply.status(403).send({ error: 'Account suspended' });
      return null;
    }
    if (user.tier !== 'agency') {
      reply.status(403).send({ error: 'Agency tier required' });
      return null;
    }
    return user;
  } catch {
    reply.status(401).send({ error: 'Invalid token' });
    return null;
  }
}

export async function agencyRoutes(server: FastifyInstance): Promise<void> {
  // POST /api/agency/keys — create a new API key (max 5 active)
  server.post('/agency/keys', async (request, reply) => {
    const user = await getAgencyUser(request, reply);
    if (!user) return;

    // Rate limit: max 10 key-creation requests per user per minute
    const rlKey = `ratelimit:agency:${user.telegramId}`;
    const rlCount = await redis.incr(rlKey);
    if (rlCount === 1) await redis.expire(rlKey, 60);
    if (rlCount > 10) {
      return reply.status(429).send({ error: 'Too many requests. Try again in a minute.' });
    }

    const body = request.body as { name?: string } | undefined;
    const name = body?.name;
    if (!name || typeof name !== 'string' || name.length > 64) {
      return reply.code(400).send({ error: 'name must be a string up to 64 characters' });
    }
    const keyName = name.replace(/<[^>]*>/g, '').trim();

    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keySuffix = rawKey.slice(-8);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const activeCount = await tx.apiKey.count({
          where: { userId: user.telegramId, revokedAt: null },
        });
        if (activeCount >= 5) {
          throw new Error('MAX_KEYS');
        }
        return tx.apiKey.create({
          data: { userId: user.telegramId, keyHash, keySuffix, name: keyName },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      return reply.status(201).send({ key: rawKey, id: result.id, name: result.name });
    } catch (err: any) {
      if (err?.message === 'MAX_KEYS') {
        return reply.status(400).send({ error: 'Maximum 5 active API keys allowed' });
      }
      server.log.error({ err }, 'Failed to create API key');
      return reply.status(500).send({ error: 'Failed to create API key' });
    }
  });

  // GET /api/agency/keys — list active keys (masked)
  server.get('/agency/keys', async (request, reply) => {
    const user = await getAgencyUser(request, reply);
    if (!user) return;

    try {
      const keys = await prisma.apiKey.findMany({
        where: { userId: user.telegramId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, keySuffix: true, lastUsedAt: true, createdAt: true },
      });

      const masked = keys.map((k) => ({
        id: k.id,
        name: k.name,
        key: `sk_***...${k.keySuffix}`,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }));

      return masked;
    } catch (err) {
      server.log.error({ err }, 'Failed to list API keys');
      return reply.status(500).send({ error: 'Failed to list API keys' });
    }
  });

  // DELETE /api/agency/keys/:id — revoke a key
  server.delete('/agency/keys/:id', async (request, reply) => {
    const user = await getAgencyUser(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    try {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id, userId: user.telegramId, revokedAt: null },
      });

      if (!apiKey) {
        return reply.status(404).send({ error: 'API key not found' });
      }

      await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      return { ok: true, message: 'API key revoked' };
    } catch (err) {
      server.log.error({ err }, 'Failed to revoke API key');
      return reply.status(500).send({ error: 'Failed to revoke API key' });
    }
  });
}
