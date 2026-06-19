const fs = require('fs');
const path = require('path');

async function testUpload(fileName, filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    // Create form-data payload manually
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    
    // Construct request body
    const header = `--${boundary}\r\n` +
                   `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                   `Content-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    
    const payload = Buffer.concat([
      Buffer.from(header, 'utf-8'),
      buffer,
      Buffer.from(footer, 'utf-8')
    ]);

    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: payload
    });

    console.log(`Status for ${fileName}:`, res.status);
    const text = await res.text();
    console.log(`Response for ${fileName}:`, text);
  } catch (err) {
    console.error(`Error uploading ${fileName}:`, err);
  }
}

async function run() {
  await testUpload('image_1.jpeg', '/Users/applem1pro/Downloads/anime/image_1.jpeg');
  await testUpload('images.jpeg', '/Users/applem1pro/Downloads/anime/images.jpeg');
}

run();
