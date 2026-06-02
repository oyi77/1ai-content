import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { PaymentSettingsService } from './payment-settings.service';
import { ValidationError, NotFoundError, InsufficientCreditsError } from '@/utils/app-errors';

export class P2pService {
    /**
     * Calculate network fee based on dynamic percentage
     */
    static async calculateFee(amount: number): Promise<number> {
        const percent = await PaymentSettingsService.getTransferFeePercent();
        const fee = amount * (percent / 100);
        const rounded = Math.round(fee * 100) / 100;
        return rounded < 0.01 ? 0.01 : rounded;
    }

    /**
     * Validate a P2P transfer
     */
    static async validateTransfer(
        senderId: bigint,
        recipientId: bigint,
        amount: number
    ): Promise<{ valid: boolean; fee: number; totalDeduction: number; error?: string }> {
        if (senderId === recipientId) {
            throw new ValidationError('Cannot transfer credits to yourself', 'recipientId');
        }

        if (amount < 1) {
            throw new ValidationError('Minimum transfer amount is 1 credit', 'amount');
        }

        if (amount > 10000) {
            throw new ValidationError('Maximum transfer amount is 10000 credits', 'amount');
        }

        const fee = await this.calculateFee(amount);
        const totalDeduction = amount + fee;

        const sender = await prisma.user.findUnique({ where: { telegramId: senderId } });
        if (!sender) {
            throw new NotFoundError('Sender', String(senderId));
        }

        if (Number(sender.creditBalance) < totalDeduction) {
            throw new InsufficientCreditsError(
                `Insufficient balance. You need ${totalDeduction} credits (including ${fee} network fee)`
            );
        }

        const recipient = await prisma.user.findUnique({ where: { telegramId: recipientId } });
        if (!recipient) {
            throw new NotFoundError('Recipient', String(recipientId));
        }

        return { valid: true, fee, totalDeduction };
    }

    /**
     * Execute P2P transfer transaction safely
     */
    static async executeTransfer(
        senderId: bigint,
        recipientId: bigint,
        amount: number
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Validate first
            const { fee, totalDeduction } = await this.validateTransfer(senderId, recipientId, amount);

            // We must serialize the transaction logic
            await prisma.$transaction(async (tx) => {
                // Double check balance inside transaction
                const sender = await tx.user.findUnique({ where: { telegramId: senderId } });
                if (!sender || Number(sender.creditBalance) < totalDeduction) {
                    throw new InsufficientCreditsError('Insufficient balance during transaction');
                }

                // Deduct from sender
                await tx.user.update({
                    where: { telegramId: senderId },
                    data: { creditBalance: { decrement: totalDeduction } },
                });

                // Add to recipient
                await tx.user.update({
                    where: { telegramId: recipientId },
                    data: { creditBalance: { increment: amount } },
                });

                // Create transaction records
                await tx.transaction.create({
                    data: {
                        orderId: `P2P-S-${Date.now()}-${senderId}`,
                        userId: senderId,
                        type: 'p2p_send',
                        amountIdr: 0,
                        creditsAmount: -totalDeduction,
                        gateway: 'internal',
                        status: 'success',
                        metadata: {
                            recipientId: recipientId.toString(),
                            baseAmount: amount,
                            feeAmount: fee,
                        },
                    },
                });

                await tx.transaction.create({
                    data: {
                        orderId: `P2P-R-${Date.now()}-${recipientId}`,
                        userId: recipientId,
                        type: 'p2p_receive',
                        amountIdr: 0,
                        creditsAmount: amount,
                        gateway: 'internal',
                        status: 'success',
                        metadata: {
                            senderId: senderId.toString(),
                        },
                    },
                });
            });

            logger.info(`P2P Transfer: ${senderId} sent ${amount} credits to ${recipientId} (fee: ${fee})`);
            return { success: true };
        } catch (error: any) {
            logger.error(`P2P Transfer failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
