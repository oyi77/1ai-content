/**
 * Web Routes — Telegram Authentication
 *
 * POST /auth/telegram — verifies Telegram login widget / Mini App hash
 * and returns a JWT for API access.
 */

import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { UserService } from "@/services/user.service";
import { checkTelegramHash, checkTWAHash } from "@/utils/telegram";
import { getConfig } from "@/config/env";

function getJwtSecret(): string {
  return getConfig().JWT_SECRET!;
}
function getBotToken(): string {
  return getConfig().BOT_TOKEN;
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  server.post("/auth/telegram", async (request, reply) => {
    try {
      let userData = request.body as Record<string, unknown>;

      // Support Telegram Web App (Mini App) initData format
      if (userData?.initData) {
        const isValidTWA = checkTWAHash(
          userData.initData as string,
          getBotToken(),
        );
        if (!isValidTWA) {
          return reply.status(401).send({ error: "Invalid TWA initData" });
        }
        const params = new URLSearchParams(userData.initData as string);
        const userJson = params.get("user");
        if (!userJson)
          return reply.status(400).send({ error: "No user in initData" });
        const twaUser = JSON.parse(userJson);
        userData = {
          id: twaUser.id,
          username: twaUser.username,
          first_name: twaUser.first_name,
          last_name: twaUser.last_name,
        };
      } else {
        if (!userData || !userData.id) {
          return reply.status(400).send({ error: "Invalid user data" });
        }
        const isValid = checkTelegramHash(userData, getBotToken());
        if (!isValid) {
          return reply.status(401).send({ error: "Auth hash verification failed" });
        }
      }

      let user = await UserService.findByTelegramId(BigInt(String(userData.id)));
      if (!user) {
        try {
          user = await UserService.create({
            telegramId: BigInt(String(userData.id)),
            username: userData.username as string | undefined,
            firstName: userData.first_name as string,
            lastName: userData.last_name as string | undefined,
          });
        } catch (err: unknown) {
          const error = err as { code?: string };
          if ((error as {code: string})?.code === "P2002") {
            user = await UserService.findByTelegramId(BigInt(String(userData.id)));
          } else {
            throw err;
          }
        }
      }

      if (!user) {
        return reply.status(500).send({ error: "User creation failed" });
      }

      if (user.isBanned) {
        return reply.status(403).send({ error: "Account suspended" });
      }

      const token = jwt.sign(
        {
          userId: user.uuid,
          telegramId: user.telegramId.toString(),
          tier: user.tier,
        },
        getJwtSecret(),
        { expiresIn: "7d" },
      );
      return {
        token,
        user: { id: user.uuid, credits: user.creditBalance, tier: user.tier },
      };
    } catch (error: unknown) {
      server.log.error({ error }, "Telegram auth error");
      return reply.status(500).send({ error: "Authentication failed" });
    }
  });
}
