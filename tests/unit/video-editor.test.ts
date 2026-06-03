import { VideoEditorService } from '../../src/services/video-editor.service';

describe('VideoEditorService', () => {
  let service: VideoEditorService;

  beforeEach(() => {
    service = new VideoEditorService();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service.getWorkDir()).toBeDefined();
    });
  });

  describe('getOutputPath', () => {
    it('should generate unique output paths', () => {
      const path1 = (service as any).getOutputPath('test');
      const path2 = (service as any).getOutputPath('test');
      expect(path1).not.toBe(path2);
      expect(path1).toContain('.mp4');
      expect(path1).toContain('test');
    });
  });
});
