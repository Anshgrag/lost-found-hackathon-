import { describe, it, expect } from 'vitest';
import { POST } from '../app/api/upload/route';
import fs from 'fs';
import path from 'path';

describe('Real Image Upload Test', () => {
  it('successfully uploads real image_1.jpeg', async () => {
    const filePath = '/Users/applem1pro/Downloads/anime/image_1.jpeg';
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist: ', filePath);
      return;
    }
    const buffer = fs.readFileSync(filePath);
    const mockFile = new File([buffer], 'image_1.jpeg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', mockFile);

    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.imageUrl).toContain('/uploads/');
    expect(resData.imageUrl).toContain('.jpeg');

    const createdFilePath = path.join(process.cwd(), 'public', resData.imageUrl);
    expect(fs.existsSync(createdFilePath)).toBe(true);

    // Clean up created file
    fs.unlinkSync(createdFilePath);
  });

  it('successfully uploads real images.jpeg', async () => {
    const filePath = '/Users/applem1pro/Downloads/anime/images.jpeg';
    if (!fs.existsSync(filePath)) {
      console.log('File does not exist: ', filePath);
      return;
    }
    const buffer = fs.readFileSync(filePath);
    const mockFile = new File([buffer], 'images.jpeg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', mockFile);

    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const resData = await response.json();
    expect(resData.imageUrl).toContain('/uploads/');
    expect(resData.imageUrl).toContain('.jpeg');

    const createdFilePath = path.join(process.cwd(), 'public', resData.imageUrl);
    expect(fs.existsSync(createdFilePath)).toBe(true);

    // Clean up created file
    fs.unlinkSync(createdFilePath);
  });
});
