/**
 * Test fixture demonstrating the container mock pattern from
 * REFACTORING_AUDIT.md Phase 2.3.
 *
 * Run with: rtk npm test -- tests/utils/container-mocks.test.ts
 */
import { container } from '@/utils/container';
import { resetContainerMocks, mockService, getService } from './container-mocks';

interface FakeService {
  hello(): string;
}

describe('Container mock pattern', () => {
  afterEach(() => {
    resetContainerMocks();
  });

  it('registers a real service', () => {
    const fake: FakeService = { hello: () => 'real' };
    container.register('testService', () => fake);
    expect(getService<FakeService>('testService').hello()).toBe('real');
  });

  it('overrides a service with a mock', () => {
    const real: FakeService = { hello: () => 'real' };
    const mock: FakeService = { hello: () => 'mock' };
    container.register('testService', () => real);
    mockService<FakeService>('testService', mock);
    expect(getService<FakeService>('testService').hello()).toBe('mock');
  });

  it('clears mock to restore real service', () => {
    const real: FakeService = { hello: () => 'real' };
    const mock: FakeService = { hello: () => 'mock' };
    container.register('testService', () => real);
    mockService<FakeService>('testService', mock);
    expect(getService<FakeService>('testService').hello()).toBe('mock');
    container.clearMock('testService');
    expect(getService<FakeService>('testService').hello()).toBe('real');
  });

  it('throws when accessing unregistered service', () => {
    expect(() => container.get('nonexistent')).toThrow(/not registered/);
  });
});
