import { Decimal } from "@prisma/client/runtime/library.js";
import {
  User,
  Video,
  Transaction,
  Subscription,
  Commission,
  SocialAccount,
  UserAvatar,
  SavedPrompt,
  ProviderHealth,
  PromptCache,
  PricingConfig,
  GenerationAnalytics,
} from "@prisma/client";

export const mockUser: Partial<User> = {
  id: BigInt(1).toString(),
  telegramId: BigInt(123456789),
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  username: "testuser",
  firstName: "Test",
  lastName: "User",
  tier: "free",
  creditBalance: new Decimal(10),
  referralCode: "TEST123",
  language: "id",
  isBanned: false,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const mockPremiumUser: Partial<User> = {
  ...mockUser,
  id: BigInt(2).toString(),
  telegramId: BigInt(987654321),
  uuid: "550e8400-e29b-41d4-a716-446655440001",
  username: "premium_user",
  tier: "pro",
  creditBalance: new Decimal(100),
  referralCode: "PREMIUM",
};

export const mockVideo: Partial<Video> = {
  id: BigInt(1),
  userId: BigInt(123456789),
  jobId: "job_test_123",
  niche: "fnb",
  platform: "tiktok",
  duration: 30,
  scenes: 5,
  status: "completed",
  progress: 100,
  creditsUsed: new Decimal(1),
  videoUrl: "https://example.com/video.mp4",
  thumbnailUrl: "https://example.com/thumb.jpg",
  createdAt: new Date(),
};

export const mockProcessingVideo: Partial<Video> = {
  ...mockVideo,
  id: BigInt(2),
  jobId: "job_processing_456",
  status: "processing",
  progress: 50,
  videoUrl: null,
};

export const mockFailedVideo: Partial<Video> = {
  ...mockVideo,
  id: BigInt(3),
  jobId: "job_failed_789",
  status: "failed",
  progress: 0,
  errorMessage: "Provider timeout",
  videoUrl: null,
};

export const mockTransaction: Partial<Transaction> = {
  id: BigInt(1),
  orderId: "ORDER-TEST-001",
  userId: BigInt(123456789),
  type: "topup",
  packageName: "starter",
  amountIdr: new Decimal(50000),
  creditsAmount: new Decimal(6),
  gateway: "midtrans",
  status: "success",
  createdAt: new Date(),
  paidAt: new Date(),
};

export const mockPendingTransaction: Partial<Transaction> = {
  ...mockTransaction,
  id: BigInt(2),
  orderId: "ORDER-PENDING-002",
  status: "pending",
  paidAt: null,
};

export const mockSubscription: Partial<Subscription> = {
  id: BigInt(1),
  userId: BigInt(123456789),
  plan: "pro",
  billingCycle: "monthly",
  status: "active",
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  cancelAtPeriodEnd: false,
};

export const mockCommission: Partial<Commission> = {
  id: BigInt(1),
  referrerId: BigInt(123456789),
  referredId: BigInt(987654321),
  amount: new Decimal(5000),
  tier: 1,
  status: "available",
  availableAt: new Date(),
  createdAt: new Date(),
};

export const mockSocialAccount: Partial<SocialAccount> = {
  id: 1,
  userId: BigInt(123456789),
  platform: "tiktok",
  pbAccountId: "pb_tiktok_123",
  accountName: "@testuser",
  status: "active",
};

export const mockAvatar: Partial<UserAvatar> = {
  id: 1,
  userId: BigInt(123456789),
  name: "Test Avatar",
  imageUrl: "https://example.com/avatar.jpg",
  isDefault: true,
  createdAt: new Date(),
};

export const mockSavedPrompt: Partial<SavedPrompt> = {
  id: 1,
  userId: BigInt(123456789),
  title: "Test Prompt",
  prompt: "Cinematic food shot with steam",
  niche: "fnb",
  source: "custom",
  usageCount: 5,
  createdAt: new Date(),
};

export const mockProviderHealth: Partial<ProviderHealth> = {
  provider: "geminigen",
  status: "healthy",
  failureCount: 0,
  circuitBreakerState: "closed",
  lastSuccess: new Date(),
  updatedAt: new Date(),
};

export const mockUnhealthyProvider: Partial<ProviderHealth> = {
  provider: "byteplus",
  status: "unhealthy",
  failureCount: 5,
  circuitBreakerState: "open",
  lastFailure: new Date(),
  updatedAt: new Date(),
};

export const mockPromptCache: Partial<PromptCache> = {
  id: 1,
  promptHash: "abc123",
  rawPrompt: "Original prompt text",
  provider: "geminigen",
  optimizedPrompt: "Optimized prompt text",
  hitCount: 10,
  createdAt: new Date(),
};

export const mockPricingConfig: Partial<PricingConfig> = {
  id: 1,
  category: "credits",
  key: "per_video_cost",
  value: { baseCost: 0.5, premiumCost: 0.25 },
  updatedAt: new Date(),
};

export const mockAnalytics: Partial<GenerationAnalytics> = {
  id: 1,
  userId: BigInt(123456789),
  jobId: "job_test_123",
  niche: "fnb",
  styles: ["editorial", "viral"],
  providerUsed: "geminigen",
  fallbackCount: 0,
  optimizationUsed: true,
  generationTimeMs: 45000,
  sceneCount: 5,
  duration: 30,
  creditsUsed: new Decimal(1),
  createdAt: new Date(),
};

export interface MockBotContext {
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
  };
  message?: {
    message_id: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size: number;
      width: number;
      height: number;
    }>;
    video?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size: number;
      width: number;
      height: number;
      duration: number;
    }>;
  };
  callbackQuery?: {
    id: string;
    data: string;
    message?: {
      message_id: number;
      text?: string;
    };
  };
  session: {
    state?: string;
    lastActivity?: Date;
    stateData?: Record<string, any>;
    creditBalance?: number;
    tier?: string;
    userLang?: string;
    videoCreation?: any;
    videoCreationNew?: any;
    selectedNiche?: string;
    selectedStyles?: string[];
  };
  reply: jest.Mock;
  editMessageText: jest.Mock;
  editMessageMedia: jest.Mock;
  answerCbQuery: jest.Mock;
  replyWithPhoto: jest.Mock;
  replyWithVideo: jest.Mock;
  replyWithAnimation: jest.Mock;
  replyWithInvoice: jest.Mock;
  deleteMessage: jest.Mock;
  telegram: {
    sendMessage: jest.Mock;
    sendPhoto: jest.Mock;
    sendVideo: jest.Mock;
    sendAnimation: jest.Mock;
    sendInvoice: jest.Mock;
    getFileLink: jest.Mock;
    setWebhook: jest.Mock;
    deleteWebhook: jest.Mock;
    setMyCommands: jest.Mock;
    deleteMessage: jest.Mock;
  };
}

export function createMockContext(
  overrides: Partial<MockBotContext> = {},
): MockBotContext {
  const defaultContext: MockBotContext = {
    from: {
      id: 123456789,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
      language_code: "en",
    },
    chat: {
      id: 123456789,
      type: "private",
    },
    session: {
      state: "DASHBOARD",
      lastActivity: new Date(),
      creditBalance: 10,
      tier: "free",
    },
    reply: jest.fn(),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageMedia: jest.fn(),
    answerCbQuery: jest.fn().mockResolvedValue(true),
    replyWithPhoto: jest.fn(),
    replyWithVideo: jest.fn(),
    replyWithAnimation: jest.fn(),
    replyWithInvoice: jest.fn(),
    deleteMessage: jest.fn(),
    telegram: {
      sendMessage: jest.fn(),
      sendPhoto: jest.fn(),
      sendVideo: jest.fn(),
      sendAnimation: jest.fn(),
      sendInvoice: jest.fn().mockResolvedValue({}),
      getFileLink: jest.fn(),
      setWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      setMyCommands: jest.fn(),
      deleteMessage: jest.fn(() => Promise.resolve()),
    },
  };

  return { ...defaultContext, ...overrides };
}

export function createMockCallbackContext(
  data: string,
  overrides: Partial<MockBotContext> = {},
): MockBotContext & {
  callbackQuery: { id: "test_callback"; data: string; message: { message_id: 1 } };
} {
  const ctx = createMockContext(overrides);
  return ctx as MockBotContext & {
    callbackQuery: { id: "test_callback"; data: string; message: { message_id: 1 } };
  };
}
