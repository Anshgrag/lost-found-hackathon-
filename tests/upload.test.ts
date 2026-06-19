import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../app/api/upload/route';
import fs from 'fs';
import path from 'path';

describe('Upload API Route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully processes uploaded file and returns path', async () => {
    const fileContent = 'test file content';
    const mockFile = new File([fileContent], 'test_image.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', mockFile);

    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });

    const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const response = await POST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.imageUrl).toContain('/uploads/');
    expect(resData.imageUrl).toContain('.png');

    expect(mockWriteFileSync).toHaveBeenCalled();
    const [calledPath, calledBuffer] = mockWriteFileSync.mock.calls[0];
    expect(calledPath).toContain('public/uploads');
    expect(Buffer.isBuffer(calledBuffer)).toBe(true);
    expect(calledBuffer.toString()).toBe(fileContent);
  });

  it('returns 400 if no file is uploaded', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const resData = await response.json();
    expect(resData.error).toBe('No file uploaded');
  });
});
