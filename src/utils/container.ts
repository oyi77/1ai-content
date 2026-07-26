/**
 * Simple Dependency Injection Container
 *
 * Replaces singleton pattern with injectable services for testability.
 * Services are lazily initialized on first access.
 */

import { AppError } from '@/utils/app-errors';
type ServiceFactory<T> = () => T;

class Container {
  private services = new Map<string, unknown>();
  private factories = new Map<string, ServiceFactory<unknown>>();
  private mocks = new Map<string, unknown>();

  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory);
  }

  get<T>(name: string): T {
    if (this.mocks.has(name)) {
      return this.mocks.get(name) as T;
    }
    if (!this.services.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new AppError("SERVICE_NOT_REGISTERED", `Service not registered: ${name}`);
      }
      this.services.set(name, factory());
    }
    return this.services.get(name) as T;
  }

  /**
   * Override a service with a mock for testing.
   * Resets the cached instance so the next get() returns the mock.
   */
  registerMock<T>(name: string, mock: T): void {
    this.mocks.set(name, mock);
    this.services.delete(name);
  }

  clearMock(name: string): void {
    this.mocks.delete(name);
    this.services.delete(name);
  }

  reset(): void {
    this.services.clear();
    this.mocks.clear();
  }

  has(name: string): boolean {
    return this.factories.has(name) || this.mocks.has(name);
  }
}

export const container = new Container();

// Register singleton services
import { VideoEditorService } from '@/services/video-editor.service';
import { ViralScannerService } from '@/services/viral-scanner.service';
import { ContentWebhookService } from '@/services/content-webhook.service';
import { VideoClipperService } from '@/services/video-clipper.service';
import { ContentReworkService } from '@/services/content-rework.service';
import { EbookService } from '@/services/ebook.service';

container.register('videoEditor', () => new VideoEditorService());
container.register('viralScanner', () => new ViralScannerService());
container.register('contentWebhook', () => new ContentWebhookService());
container.register('videoClipper', () => new VideoClipperService());
container.register('contentRework', () => new ContentReworkService());
container.register('ebook', () => new EbookService());
