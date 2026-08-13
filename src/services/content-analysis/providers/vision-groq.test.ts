import { extractViaGroq } from './vision-groq';
import { getConfig } from '@/config/env';
import { fetchMediaAsBase64 } from '../media-utils';
import axios from 'axios';

jest.mock('@/config/env');
jest.mock('../media-utils');
jest.mock('axios');

describe('Groq Vision provider fallback behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock config to have GROQ_API_KEY
    (getConfig as jest.Mock).mockReturnValue({
      GROQ_API_KEY: 'test-api-key',
    });
    // Mock media fetching to return valid base64
    (fetchMediaAsBase64 as jest.Mock).mockResolvedValue({
      data: 'dGVzdC1iYXNlNjQ=', // base64 of "test-base64"
      mimeType: 'image/jpeg',
    });
  });

  it('should trigger fallback error when API call fails for image', async () => {
    // Mock axios.post to reject
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(extractViaGroq('https://example.com/image.jpg', 'image'))
      .rejects
      .toMatchObject({
        name: 'ProviderError',
        message: 'Groq: Fallback error unexpectedly called',
      });
  });

  it('should throw ConfigError when GROQ_API_KEY is not set', async () => {
    (getConfig as jest.Mock).mockReturnValueOnce({});

    await expect(extractViaGroq('https://example.com/image.jpg', 'image'))
      .rejects
      .toMatchObject({
        name: 'ConfigError',
        message: expect.stringContaining('GROQ_API_KEY'),
      });
  });
});