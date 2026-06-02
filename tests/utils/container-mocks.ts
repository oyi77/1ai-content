/**
 * Test utilities for container-based mocking.
 *
 * Demonstrates the pattern from REFACTORING_AUDIT.md Phase 2.3:
 *   - Use container.get() to access services
 *   - Use container.registerMock() to inject mocks in tests
 *   - Use resetContainerMocks() in afterEach to clean up
 */
import { container } from '@/utils/container';

export function resetContainerMocks(): void {
  // Clear all mocks but keep registrations
  const registeredNames: string[] = [];
  (container as any).factories.forEach((_: unknown, name: string) => {
    registeredNames.push(name);
  });
  registeredNames.forEach((name) => container.clearMock(name));
  container.reset();
}

export function mockService<T>(name: string, instance: T): void {
  container.registerMock(name, instance);
}

export function getService<T>(name: string): T {
  return container.get<T>(name);
}
