# Video Encoding API

A self-hosted video encoding API that converts WebM files to MP4 format using FFmpeg. Perfect for websites that need video conversion without paying for external API services.

## Features

- 🎥 Convert WebM videos to MP4 format
- 🚀 Fast conversion using FFmpeg
- 🔒 Built-in security with rate limiting and file validation
- 📁 Automatic file cleanup
- 🌐 RESTful API endpoints
- 📊 Health monitoring
- 🛡️ CORS and security headers

## Prerequisites

Before running this API, you need to install FFmpeg on your system:

### macOS (using Homebrew)
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

### Windows
1. Download FFmpeg from https://ffmpeg.org/download.html
2. Add FFmpeg to your system PATH

### Verify Installation
```bash
ffmpeg -version
```

## Installation

1. **Clone or download this project**
2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## API Endpoints

### POST /convert
Upload and convert a video file from WebM to MP4.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with `video` field containing the file

**Response:**
```json
{
  "success": true,
  "message": "Video converted successfully",
  "downloadUrl": "/download/converted-file.mp4",
  "originalName": "input.webm",
  "convertedName": "converted-file.mp4",
  "fileSize": 1234567
}
```

### GET /download/:filename
Download a converted video file.

**Request:**
- Method: GET
- URL: `/download/{filename}`

**Response:**
- File download (MP4 video)

### GET /health
Check API health status.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

## Usage Examples

### Using curl
```bash
# Convert a video
curl -X POST -F "video=@input.webm" http://localhost:3000/convert

# Download converted file
curl -O http://localhost:3000/download/converted-file.mp4
```

### Using JavaScript (fetch)
```javascript
// Convert video
const formData = new FormData();
formData.append('video', fileInput.files[0]);

const response = await fetch('http://localhost:3000/convert', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Download URL:', result.downloadUrl);

// Download converted file
window.open(result.downloadUrl);
```

### Using HTML form
```html
<form action="http://localhost:3000/convert" method="post" enctype="multipart/form-data">
  <input type="file" name="video" accept="video/*" required>
  <button type="submit">Convert Video</button>
</form>
```

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### File Limits
- Maximum file size: 500MB
- Supported formats: Any video format that FFmpeg can read
- Output format: MP4 (H.264 video, AAC audio)

### Rate Limiting
- 100 requests per 15 minutes per IP address

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Prevents abuse
- **File Validation**: Only video files allowed
- **Automatic Cleanup**: Temporary files are removed

## File Structure

```
video-encoding-api/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── README.md         # This file
├── uploads/          # Temporary upload directory
├── output/           # Converted files directory
└── temp/            # Temporary processing directory
```

## Troubleshooting

### FFmpeg not found
```
Error: Cannot find FFmpeg
```
**Solution:** Install FFmpeg and ensure it's in your system PATH.

### File too large
```
Error: File too large. Maximum size is 500MB.
```
**Solution:** Reduce file size or increase the limit in server.js.

### Conversion fails
```
Error: Conversion failed
```
**Solution:** Check that the input file is a valid video format that FFmpeg can process.

## Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start server.js --name "video-api"
pm2 save
pm2 startup
```

### Using Docker
Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t video-encoding-api .
docker run -p 3000:3000 video-encoding-api
```

## Performance Tips

1. **Server Resources**: Video conversion is CPU-intensive. Use a server with good CPU performance.
2. **Storage**: Ensure sufficient disk space for temporary files.
3. **Memory**: Large video files may require more RAM.
4. **Network**: Consider bandwidth for file uploads/downloads.

## License

MIT License - Feel free to use this for personal or commercial projects.

## Support

If you encounter issues:
1. Check that FFmpeg is properly installed
2. Verify file permissions on upload/output directories
3. Check server logs for detailed error messages
4. Ensure sufficient disk space and memory
