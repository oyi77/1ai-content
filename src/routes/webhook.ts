import { FastifyInstance } from 'fastify';
import { Telegraf } from 'telegraf';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { getConfig } from '@/config/env';
import { prisma } from '@/config/database';
import { sendAdminAlert } from '@/services/admin-alert.service';
import { PaymentService } from '@/services/payment.service';
import { DuitkuService } from '@/services/duitku.service';
import { NowPaymentsService } from '@/services/nowpayments.service';
import { UserService } from '@/services/user.service';
import { t } from '@/i18n/translations';
import crypto from 'crypto';
import { timingSafeCompare } from '@/utils/crypto';

interface WebhookOptions {
  bot: Telegraf<BotContext>;
}

export async function webhookRoutes(server: FastifyInstance, options: WebhookOptions): Promise<void> {
  const { bot } = options;

  server.post('/webhook/telegram', async (request, reply) => {
    try {
      const config = getConfig();
      const webhookSecret = config.WEBHOOK_SECRET;
      if (!webhookSecret && config.NODE_ENV === 'production') {
        logger.error('WEBHOOK_SECRET is not set in production — rejecting Telegram webhook');
        return reply.status(503).send({ error: 'Webhook secret not configured' });
      }
      if (webhookSecret) {
        const secret = request.headers['x-telegram-bot-api-secret-token'];
        if (!secret || !timingSafeCompare(String(secret), webhookSecret)) {
          logger.warn('Invalid webhook secret');
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      }
      // Respond immediately so Telegram doesn't time out (prevents 502)
      reply.status(200).send({ ok: true });
      // Process update asynchronously
      bot.handleUpdate(request.body as unknown as Parameters<typeof bot.handleUpdate>[0]).catch((err: unknown) => {
        logger.error('Telegram webhook processing error:', err);
      });
      return;
    } catch (error) {
      logger.error('Telegram webhook error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/webhook/midtrans', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const rawBody = JSON.stringify(body);
      const signature = String(body.signature_key || '');
      
      // Convert Midtrans webhook to normalized format
      const normalizedEvent = {
        order_id: String(body.order_id || ''),
        status: body.transaction_status === 'settlement' ? 'success' : 
                body.transaction_status === 'pending' ? 'pending' :
                'failed',
        gateway: 'midtrans',
        payment_method: body.payment_type as string || null,
        paid_at: null,
        amount: Number(body.gross_amount || 0),
      };

      logger.info('Midtrans webhook received:', { order_id: body.order_id, status: body.transaction_status });

      // Midtrans signature: SHA512(order_id + status_code + gross_amount + ServerKey)
      const midtransKey = getConfig().MIDTRANS_SERVER_KEY;
      if (!midtransKey) return reply.status(503).send({ error: 'Midtrans server key not configured' });
      const expectedSig = crypto.createHash('sha512')
        .update(`${body.order_id}${body.status_code}${body.gross_amount}${midtransKey}`)
        .digest('hex');
      if (!signature || !timingSafeCompare(signature, expectedSig)) return reply.status(401).send({ error: 'Invalid signature' });

      const result = await PaymentService.handleNotification(normalizedEvent, signature, { skipSignature: true });

      // Notify user on payment failure/expiry
      const midtransFailStatuses = ['deny', 'cancel', 'expire'];
      if (midtransFailStatuses.includes(String(body.transaction_status)) && body.order_id && bot) {
        try {
          const tx = await prisma.transaction.findUnique({ where: { orderId: String(body.order_id) } });
          if (tx?.userId) {
            const dbUser = await UserService.findByTelegramId(BigInt(tx.userId));
            const lang = dbUser?.language || 'id';
            const tKey = body.transaction_status === 'expire' ? 'payment.expired' : 'payment.failed';
            await bot.telegram.sendMessage(tx.userId.toString(),
              t(tKey, lang, { orderId: String(body.order_id) }),
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]] } }
            ).catch(() => {});
          }
        } catch { /* best-effort notification */ }
      }

      return reply.send({ ok: result.success, message: result.message });
    } catch (error) {
      logger.error('Midtrans webhook error:', error);
      sendAdminAlert('critical', 'Midtrans Webhook Error', { error: String(error) });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/webhook/tripay', async (request, reply) => {
    try {
      const tripayPrivateKey = getConfig().TRIPAY_PRIVATE_KEY || '';
      if (!tripayPrivateKey) {
        logger.error('TRIPAY_PRIVATE_KEY is not set — rejecting Tripay webhook');
        return reply.status(500).send({ error: 'Tripay webhook not configured' });
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      // Tripay signs the raw JSON body with HMAC-SHA256 using the merchant
      // private key and sends it in the X-Callback-Signature header.
      // x-signature is kept as a fallback for legacy clients.
      const signature = (request.headers['x-callback-signature'] || request.headers['x-signature']) as string;
      const expectedSignature = crypto
        .createHmac('sha256', tripayPrivateKey)
        .update(JSON.stringify(body))
        .digest('hex');

      if (!signature || !timingSafeCompare(signature, expectedSignature)) {
        logger.warn('Invalid Tripay signature', { received: signature, expected: expectedSignature });
        return reply.status(401).send({ success: false, message: 'Invalid signature' });
      }

      logger.info('Tripay webhook received:', body);
      const statusMap: Record<string, string> = {
        'PAID': 'success', 'EXPIRED': 'failed', 'FAILED': 'failed',
        'CANCELLED': 'failed', 'REFUND': 'failed',
      };
      const result = await PaymentService.handleNotification({
        order_id: String(body.merchant_ref || ''),
        status: statusMap[String(body.status)] || 'pending',
        gateway: 'tripay',
        payment_method: String(body.payment_method || ''),
        paid_at: null,
        amount: Number(body.total_amount ?? body.amount ?? 0),
      }, signature, { skipSignature: true });

      // Notify user on payment failure/expiry
      if ((body.status === 'EXPIRED' || body.status === 'FAILED' || body.status === 'CANCELLED') && body.merchant_ref && bot) {
        try {
          const tx = await prisma.transaction.findUnique({ where: { orderId: String(body.merchant_ref) } });
          if (tx?.userId) {
            const dbUser = await UserService.findByTelegramId(BigInt(tx.userId));
            const lang = dbUser?.language || 'id';
            const tKey = body.status === 'EXPIRED' ? 'payment.expired' : 'payment.failed';
            await bot.telegram.sendMessage(tx.userId.toString(),
              t(tKey, lang, { orderId: String(body.merchant_ref) }),
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]] } }
            ).catch(() => {});
          }
        } catch { /* best-effort notification */ }
      }

      // Tripay requires {"success": true} to stop callback retries (3x).
      return reply.send({ ok: result.success, success: result.success, message: result.message });
    } catch (error) {
      logger.error('Tripay webhook error:', error);
      sendAdminAlert('critical', 'Tripay Webhook Error', { error: String(error) });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/webhook/nowpayments', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;

      // Verify IPN signature — mandatory when NOWPAYMENTS_IPN_SECRET is configured
      // Use process.env directly — tests mutate this at runtime to test the "no secret" path
      const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
      if (!ipnSecret && getConfig().NODE_ENV === 'production') {
        logger.error('NOWPAYMENTS_IPN_SECRET is not set in production — rejecting webhook');
        return reply.status(503).send({ error: 'IPN secret not configured' });
      }
      if (ipnSecret) {
        const signature = request.headers['x-nowpayments-sig'] as string;
        if (!signature) {
          logger.warn('NOWPayments: missing x-nowpayments-sig header');
          return reply.status(400).send({ error: 'Missing signature' });
        }
        const sortedBody = JSON.stringify(
          Object.keys(body).sort().reduce((acc: Record<string, unknown>, key) => { acc[key] = body[key]; return acc; }, {})
        );
        const expectedSig = crypto.createHmac('sha512', ipnSecret).update(sortedBody).digest('hex');
        if (!timingSafeCompare(signature, expectedSig)) {
          logger.warn('NOWPayments: invalid IPN signature');
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      logger.info('NOWPayments webhook received:', body);

      const result = await NowPaymentsService.handleWebhook(body as unknown as Parameters<typeof NowPaymentsService.handleWebhook>[0]);

      // Notify user on payment failure
      const nowFailStatuses = ['failed', 'expired'];
      if (nowFailStatuses.includes(String(body.payment_status)) && body.order_id && bot) {
        try {
          const tx = await prisma.transaction.findUnique({ where: { orderId: String(body.order_id) } });
          if (tx?.userId) {
            const dbUser = await UserService.findByTelegramId(BigInt(tx.userId));
            const lang = dbUser?.language || 'id';
            const tKey = body.payment_status === 'expired' ? 'payment.expired' : 'payment.failed';
            await bot.telegram.sendMessage(tx.userId.toString(),
              t(tKey, lang, { orderId: String(body.order_id) }),
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]] } }
            ).catch(() => {});
          }
        } catch { /* best-effort notification */ }
      }

      // Send Telegram notification if credits were added
      if (result.success && result.message === 'Credits added' && body.order_id) {
        try {
          // order_id format: CRYPTO-<timestamp>-<telegramId>
          const orderId = body.order_id as string;
          const lastDash = orderId.lastIndexOf('-');
          const telegramId = orderId.substring(lastDash + 1);
          if (telegramId && /^\d+$/.test(telegramId) && bot) {
            const coin = String(body.pay_currency || 'CRYPTO').toUpperCase();
            const amount = body.price_amount ? `$${body.price_amount}` : '';
            const dbUser = await UserService.findByTelegramId(BigInt(telegramId));
            const lang = dbUser?.language || 'id';
            await bot.telegram.sendMessage(
              telegramId,
              t('payment.crypto_success', lang, { amount, coin }),
              { parse_mode: 'Markdown' }
            );
          }
        } catch (notifyErr) {
          logger.warn('Failed to notify user about crypto payment:', notifyErr);
        }
      }

      return { ok: result.success, message: result.message };
    } catch (error) {
      logger.error('NOWPayments webhook error:', error);
      sendAdminAlert('critical', 'NOWPayments Webhook Error', { error: String(error) });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/webhook/duitku', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      logger.info('Duitku callback received:', body);
      
      const result = await DuitkuService.handleCallback({
        merchantCode: String(body.merchantCode),
        amount: String(body.amount),
        merchantOrderId: String(body.merchantOrderId),
        resultCode: String(body.resultCode),
        reference: String(body.reference),
        signature: String(body.signature),
      });

      // Notify user on payment failure
      if (body.resultCode !== '00' && body.resultCode !== '01' && body.merchantOrderId && bot) {
        try {
          const tx = await prisma.transaction.findUnique({ where: { orderId: String(body.merchantOrderId) } });
          if (tx?.userId) {
            const dbUser = await UserService.findByTelegramId(BigInt(tx.userId));
            const lang = dbUser?.language || 'id';
            await bot.telegram.sendMessage(tx.userId.toString(),
              t('payment.failed', lang, { orderId: String(body.merchantOrderId) }),
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]] } }
            ).catch(() => {});
          }
        } catch { /* best-effort notification */ }
      }

      return { ok: result.success, message: result.message };
    } catch (error) {
      logger.error('Duitku webhook error:', error);
      sendAdminAlert('critical', 'Duitku Webhook Error', { error: String(error) });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/webhook/1ai-payment', async (request, reply) => {
    try {
      const signature = String(request.headers['x-payment-signature'] || '');
      const body = request.body as unknown;
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

      logger.info('1ai-payment webhook received', { order_id: (body as Record<string, unknown>)?.order_id });

      const result = await PaymentService.handleNotification(body, signature);

      if (!result.success) {
        return reply.status(400).send(result);
      }

      // Notify user on payment failure
      const event = body as Record<string, unknown>;
      if (event.status === 'failed' && event.order_id && bot) {
        try {
          const tx = await prisma.transaction.findUnique({ where: { orderId: String(event.order_id) } });
          if (tx?.userId) {
            const dbUser = await UserService.findByTelegramId(BigInt(tx.userId));
            const lang = dbUser?.language || 'id';
            await bot.telegram
              .sendMessage(
                tx.userId.toString(),
                t('payment.failed', lang, { orderId: String(event.order_id) }),
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [[{ text: t('btn.topup', lang), callback_data: 'topup' }]],
                  },
                }
              )
              .catch(() => {
                /* best-effort */
              });
          }
        } catch {
          /* best-effort notification */
        }
      }

      return { ok: true };
    } catch (error) {
      logger.error('1ai-payment webhook error:', error);
      sendAdminAlert('critical', '1ai-payment Webhook Error', { error: String(error) });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
