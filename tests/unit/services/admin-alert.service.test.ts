/**
 * Tests for admin-alert.service.ts
 *
 * Verifies that:
 * - sendAdminAlert sends to telegram with correct format
 * - Skips silently when no chat ID or no telegram instance
 * - Filters out null/undefined details
 * - Truncates long values to 200 chars
 */
import { jest } from '@jest/globals';
import { sendAdminAlert, setAlertTelegram } from '@/services/admin-alert.service';

jest.mock('@/config/env', () => ({
  getConfig: jest.fn(() => ({ ADMIN_ALERT_CHAT_ID: '123' })),
}));

describe('admin-alert.service', () => {
  let mockTelegram: any;

  beforeEach(() => {
    mockTelegram = {
      sendMessage: jest.fn(async () => undefined),
    };
    setAlertTelegram(mockTelegram);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends critical alert with emoji', () => {
    sendAdminAlert('critical', 'Test Alert', { foo: 'bar' });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, message] = mockTelegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('123');
    expect(message).toContain('🚨');
    expect(message).toContain('CRITICAL');
    expect(message).toContain('Test Alert');
  });

  it('sends warning alert with correct emoji', () => {
    sendAdminAlert('warning', 'Warning!');
    const [, message] = mockTelegram.sendMessage.mock.calls[0];
    expect(message).toContain('⚠️');
    expect(message).toContain('WARNING');
  });

  it('sends info alert with correct emoji', () => {
    sendAdminAlert('info', 'FYI');
    const [, message] = mockTelegram.sendMessage.mock.calls[0];
    expect(message).toContain('ℹ️');
    expect(message).toContain('INFO');
  });

  it('filters out null and undefined details', () => {
    sendAdminAlert('critical', 'Mixed', {
      a: 'present',
      b: null,
      c: undefined,
      d: 0,
    });
    const [, message] = mockTelegram.sendMessage.mock.calls[0];
    expect(message).toContain('a');
    expect(message).not.toContain('• *b:*');
    expect(message).not.toContain('• *c:*');
    expect(message).toContain('d');
  });

  it('truncates long values to 200 chars', () => {
    const longValue = 'x'.repeat(500);
    sendAdminAlert('critical', 'Long', { payload: longValue });
    const [, message] = mockTelegram.sendMessage.mock.calls[0];
    const lines = message.split('\n');
    const payloadLine = lines.find((l: string) => l.includes('payload'));
    expect(payloadLine).toBeDefined();
    expect(payloadLine!.length).toBeLessThan(220);
  });

  it('skips silently when no chat ID', () => {
    const env = require('@/config/env');
    env.getConfig.mockReturnValueOnce({ ADMIN_ALERT_CHAT_ID: '' });
    sendAdminAlert('critical', 'Should not send');
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips silently when no telegram instance', () => {
    setAlertTelegram(null);
    sendAdminAlert('critical', 'Should not send');
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  });

  it('does not throw if telegram sendMessage fails', () => {
    mockTelegram.sendMessage = jest.fn(async () => {
      throw new Error('telegram down');
    });
    expect(() => sendAdminAlert('critical', 'Will fail')).not.toThrow();
  });
});
