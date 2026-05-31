import { getConfig } from '@/config/env';
import { logger } from '@/utils/logger';

let adapterInstance: any = null;

async function getAdapter() {
  if (adapterInstance) return adapterInstance;

  try {
    const { PostBridgePlatformAdapter } = await import('@1ai/platform-adapters');
    const config = getConfig();
    adapterInstance = new PostBridgePlatformAdapter({
      apiKey: config.POSTBRIDGE_API_KEY || '',
      mode: 'direct',
      hubUrl: config.OMNIROUTE_URL,
      hubApiKey: config.OMNIROUTE_API_KEY,
    });
    return adapterInstance;
  } catch (err: any) {
    logger.warn('Shared platform-adapters not available, using fallback:', err.message);
    return null;
  }
}

export async function getPostBridgeAccountsViaAdapter() {
  const adapter = await getAdapter();
  if (!adapter) return null;
  try {
    return await adapter.getAccounts();
  } catch (err: any) {
    logger.warn('Adapter getAccounts failed:', err.message);
    return null;
  }
}

export async function publishViaAdapter(params: {
  caption: string;
  mediaUrl?: string;
  socialAccountIds: number[];
  scheduledAt?: Date;
}) {
  const adapter = await getAdapter();
  if (!adapter) return null;
  try {
    return await adapter.publishToMultiple(params);
  } catch (err: any) {
    logger.warn('Adapter publishToMultiple failed:', err.message);
    return null;
  }
}

export async function healthCheckViaAdapter() {
  const adapter = await getAdapter();
  if (!adapter) return null;
  try {
    return await adapter.healthCheck();
  } catch {
    return null;
  }
}