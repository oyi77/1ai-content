/**
 * Repository Pattern Tests
 *
 * Tests for UserRepository and VideoRepository — the new
 * thin wrappers around Prisma operations.
 */

import { UserRepository } from "@/repositories/user.repository";
import { VideoRepository } from "@/repositories/video.repository";

// ── UserRepository ──
describe("UserRepository", () => {
  it("should be defined", () => {
    expect(UserRepository).toBeDefined();
    expect(typeof UserRepository.findByTelegramId).toBe("function");
    expect(typeof UserRepository.findByUuid).toBe("function");
    expect(typeof UserRepository.findByReferralCode).toBe("function");
    expect(typeof UserRepository.create).toBe("function");
    expect(typeof UserRepository.update).toBe("function");
    expect(typeof UserRepository.updateActivity).toBe("function");
    expect(typeof UserRepository.addCredits).toBe("function");
    expect(typeof UserRepository.deductCredits).toBe("function");
    expect(typeof UserRepository.ban).toBe("function");
    expect(typeof UserRepository.unban).toBe("function");
    expect(typeof UserRepository.findWithExpiringCredits).toBe("function");
    expect(typeof UserRepository.countReferrals).toBe("function");
  });

  it("should return null for non-existent user", async () => {
    const { prisma } = await import("@/config/database");
    (prisma.user.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const user = await UserRepository.findByTelegramId(BigInt(999999));
    expect(user).toBeNull();
  });
});

// ── VideoRepository ──
describe("VideoRepository", () => {
  it("should be defined", () => {
    expect(VideoRepository).toBeDefined();
    expect(typeof VideoRepository.create).toBe("function");
    expect(typeof VideoRepository.findByJobId).toBe("function");
    expect(typeof VideoRepository.updateProgress).toBe("function");
    expect(typeof VideoRepository.setOutput).toBe("function");
    expect(typeof VideoRepository.updateStatus).toBe("function");
    expect(typeof VideoRepository.softDelete).toBe("function");
    expect(typeof VideoRepository.restore).toBe("function");
    expect(typeof VideoRepository.permanentlyDelete).toBe("function");
    expect(typeof VideoRepository.toggleFavorite).toBe("function");
    expect(typeof VideoRepository.findUserFavorites).toBe("function");
    expect(typeof VideoRepository.findUserTrash).toBe("function");
    expect(typeof VideoRepository.findUserVideos).toBe("function");
    expect(typeof VideoRepository.countDailyGenerations).toBe("function");
    expect(typeof VideoRepository.upsertForInterception).toBe("function");
  });

  it("should return null for non-existent video", async () => {
    const { prisma } = await import("@/config/database");
    (prisma.video.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const video = await VideoRepository.findByJobId("non-existent-job");
    expect(video).toBeNull();
  });

  it("should return false when toggling favorite on non-existent video", async () => {
    const { prisma } = await import("@/config/database");
    (prisma.video.findUnique as jest.Mock) = jest.fn().mockResolvedValue(null);

    const result = await VideoRepository.toggleFavorite("non-existent-job");
    expect(result).toBe(false);
  });
});
