/**
 * Simple Dependency Injection Container
 *
 * Replaces singleton pattern with injectable services for testability.
 * Services are lazily initialized on first access.
 */

type ServiceFactory<T> = () => T;

class Container {
  private services = new Map<string, unknown>();
  private factories = new Map<string, ServiceFactory<unknown>>();

  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.factories.set(name, factory);
  }

  get<T>(name: string): T {
    if (!this.services.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`Service not registered: ${name}`);
      }
      this.services.set(name, factory());
    }
    return this.services.get(name) as T;
  }

  reset(): void {
    this.services.clear();
  }

  has(name: string): boolean {
    return this.factories.has(name);
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
