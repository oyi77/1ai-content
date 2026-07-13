import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
} from "@jest/globals";
import { PaymentSettingsService } from "@/services/payment-settings.service";
import { PaymentService } from "@/services/payment.service";
import { getPackagesAsync, getSubscriptionPlansAsync } from "@/config/pricing";
import { prisma } from "@/config/database";

// Mock Redis/Service dependencies if needed, but we focus on logic propagation
jest.mock("@/config/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

describe("System-Wide Synchronization Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should propagate pricing changes from Admin Settings to Payment Service", async () => {
    // 1. Simulate Admin updating a package price
    const customPackage = {
      name: "Flash Sale Pack",
      priceIdr: 1000,
      credits: 100,
      bonus: 50,
    };
    
    // Mock the DB response that PaymentSettingsService would return
    jest.spyOn(prisma.pricingConfig, "findMany").mockResolvedValue([
      {
        id: 1,
        category: "package",
        key: "flash_sale",
        value: customPackage,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any
    ]);

    // 2. Verify getPackagesAsync reflects the change
    const packages = await getPackagesAsync();
    const flashPkg = packages.find((p: any) => p.id === "flash_sale");
    
    expect(flashPkg).toBeDefined();
    expect(flashPkg?.priceIdr).toBe(1000);
    expect(flashPkg?.credits).toBe(100);

    // 3. Verify PaymentService creates transaction with the new price
    // Note: PaymentService.createTransaction calls getPackages internally
    const mockPaymentResponse = {
      data: {
        success: true,
        data: { id: "ord1", payment_url: "https://pay.example.com/ord1", gateway: "midtrans" },
      },
    };
    jest.spyOn(require("axios"), "post").mockResolvedValue(mockPaymentResponse);
    jest.spyOn(prisma.transaction, "create").mockResolvedValue({ orderId: "ord1" } as any);

    const tx = await PaymentService.createTransaction({
      userId: BigInt(123),
      packageId: "flash_sale",
      username: "test",
    });

    expect(tx.orderId).toBeDefined();
    // Verify Prisma create was called with the Correct (Dynamic) price
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packageName: "flash_sale",
          amountIdr: 1000,
          creditsAmount: 150, // 100 + 50 bonus
        })
      })
    );
  });

  it("should propagate subscription plan changes to the logic engine", async () => {
    // 1. Simulate Admin updating a subscription plan limit
    const customProPlan = {
      name: "Ultra Pro",
      monthlyCredits: 500,
      dailyGenerationLimit: 999,
      tier: "pro",
    };

    jest.spyOn(prisma.pricingConfig, "findMany").mockResolvedValue([
      {
        id: 2,
        category: "subscription",
        key: "pro",
        value: customProPlan,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any
    ]);

    // 2. Verify getSubscriptionPlansAsync reflects the change
    const plans = await getSubscriptionPlansAsync();
    expect(plans.pro.dailyGenerationLimit).toBe(999);
    expect(plans.pro.name).toBe("Ultra Pro");
  });
});
