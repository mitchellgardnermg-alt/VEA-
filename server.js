const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const app = express();

// Add this line right after creating the app
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Check FFmpeg availability
function checkFFmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg not found:', error.message);
        resolve(false);
      } else {
        console.log('FFmpeg found:', stdout.split('\n')[0]);
        resolve(true);
      }
    });
  });
}

// Initialize FFmpeg check
checkFFmpeg();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
}));
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create necessary directories
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
const tempDir = path.join(__dirname, 'temp');

[uploadsDir, outputDir, tempDir].forEach(dir => {
  fs.ensureDirSync(dir);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is a video
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Video Encoding API',
    version: '1.0.0',
    endpoints: {
      'POST /convert': 'Upload and convert video files',
      'GET /download/:filename': 'Download converted files',
      'GET /health': 'Health check',
      'GET /test-ffmpeg': 'Test FFmpeg installation'
    },
    status: 'running'
  });
});

// Test FFmpeg endpoint
app.get('/test-ffmpeg', (req, res) => {
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      res.json({
        ffmpeg: 'NOT FOUND',
        error: error.message,
        stderr: stderr
      });
    } else {
      res.json({
        ffmpeg: 'FOUND',
        version: stdout.split('\n')[0],
        fullOutput: stdout
      });
    }
  });
});

// Convert WebM to MP4 endpoint
app.post('/convert', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const inputPath = req.file.path;
    const outputFileName = `${uuidv4()}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);
    const tempPath = path.join(tempDir, `${uuidv4()}.mp4`);

    console.log(`Converting ${req.file.originalname} to MP4 with HIGH QUALITY settings...`);

    // Convert video using FFmpeg with HIGH QUALITY settings
    let conversionSuccess = false;
    
    try {
      console.log('Starting HIGH QUALITY conversion with fluent-ffmpeg...');
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',           // Use H.264 codec for video
            '-c:a aac',              // Use AAC codec for audio
            '-preset slow',          // HIGH QUALITY encoding (slower but much better)
            '-crf 18',              // HIGH QUALITY (18 is visually lossless, 23 was medium)
            '-movflags +faststart',  // Optimize for web streaming
            '-pix_fmt yuv420p',     // Ensure compatibility
            '-profile:v high',       // High profile for better quality
            '-level 4.1',           // Higher level for better quality
            '-bf 2',                // B-frames for better compression
            '-refs 4',              // Reference frames for better quality
            '-me_method umh',       // Better motion estimation
            '-subq 7',              // Subpixel motion estimation quality
            '-trellis 1',           // Trellis quantization
            '-aq-mode 2',           // Adaptive quantization
            '-f mp4'                // Force MP4 format
          ])
          .output(tempPath)
          .on('start', (commandLine) => {
            console.log('HIGH QUALITY FFmpeg process started:', commandLine);
            console.log(`Input file: ${inputPath}`);
            console.log(`Output file: ${tempPath}`);
          })
          .on('progress', (progress) => {
            console.log(`HIGH QUALITY Processing: ${Math.round(progress.percent || 0)}% done`);
            if (progress.timemark) {
              console.log(`Time: ${progress.timemark}`);
            }
          })
          .on('end', () => {
            console.log('HIGH QUALITY conversion completed successfully');
            conversionSuccess = true;
            resolve();
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            console.error('Error message:', err.message);
            reject(err);
          })
          .run();
      });
    } catch (ffmpegError) {
      console.log('Fluent-FFmpeg failed, trying direct FFmpeg command with HIGH QUALITY...');
      console.error('Fluent-FFmpeg error:', ffmpegError);
      
      // Fallback to direct FFmpeg command with HIGH QUALITY settings
      try {
        await new Promise((resolve, reject) => {
          const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -preset slow -crf 18 -movflags +faststart -pix_fmt yuv420p -profile:v high -level 4.1 -bf 2 -refs 4 -me_method umh -subq 7 -trellis 1 -aq-mode 2 -f mp4 "${tempPath}"`;
          
          console.log('Running HIGH QUALITY direct FFmpeg command:', ffmpegCommand);
          
          exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
              console.error('Direct FFmpeg command failed:', error);
              console.error('Stderr:', stderr);
              reject(error);
            } else {
              console.log('HIGH QUALITY direct FFmpeg command succeeded');
              console.log('Stdout:', stdout);
              conversionSuccess = true;
              resolve();
            }
          });
        });
      } catch (directError) {
        console.error('Both conversion methods failed:', directError);
        throw new Error(`Conversion failed: ${directError.message}`);
      }
    }
    
    if (!conversionSuccess) {
      throw new Error('Conversion failed - no successful conversion method');
    }

    // Check if temp file exists before moving
    if (await fs.pathExists(tempPath)) {
      const tempStats = await fs.stat(tempPath);
      console.log(`HIGH QUALITY temp file size: ${tempStats.size} bytes`);
      
      // Verify the file is actually MP4 by checking file header
      const fileBuffer = await fs.readFile(tempPath, { start: 0, end: 8 });
      const fileHeader = fileBuffer.toString('hex');
      console.log(`HIGH QUALITY file header: ${fileHeader}`);
      
      // Check for MP4 signature (ftyp box)
      if (fileHeader.includes('66747970') || fileHeader.includes('6d6f6f76')) {
        console.log('✅ HIGH QUALITY file appears to be MP4 format');
      } else {
        console.log('⚠️ HIGH QUALITY file may not be MP4 format, header:', fileHeader);
      }
      
      console.log(`Moving HIGH QUALITY file from ${tempPath} to ${outputPath}`);
      await fs.move(tempPath, outputPath);
      console.log('HIGH QUALITY file moved successfully');
      
      // Verify the final file
      const finalStats = await fs.stat(outputPath);
      console.log(`HIGH QUALITY final file size: ${finalStats.size} bytes`);
      console.log(`HIGH QUALITY final file path: ${outputPath}`);
    } else {
      throw new Error('Converted file not found in temp directory');
    }

    // Clean up input file
    await fs.remove(inputPath);

    // Return download URL
    const downloadUrl = `/download/${outputFileName}`;
    
    res.json({
      success: true,
      message: 'HIGH QUALITY video converted successfully',
      downloadUrl: downloadUrl,
      originalName: req.file.originalname,
      convertedName: outputFileName,
      fileSize: (await fs.stat(outputPath)).size,
      quality: 'HIGH QUALITY (CRF 18, Slow Preset)'
    });

  } catch (error) {
    console.error('HIGH QUALITY conversion error:', error);
    
    // Clean up files on error
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    
    res.status(500).json({
      error: 'HIGH QUALITY conversion failed',
      message: error.message
    });
  }
});

// Download converted file endpoint
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(outputDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Get file stats for logging
  const stats = fs.statSync(filePath);
  console.log(`Serving HIGH QUALITY file: ${filename}`);
  console.log(`HIGH QUALITY file size: ${stats.size} bytes`);
  console.log(`HIGH QUALITY file path: ${filePath}`);

  // Set appropriate headers
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stats.size);

  // Stream the file
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  // Clean up file after download
  fileStream.on('end', () => {
    console.log(`HIGH QUALITY file ${filename} served successfully, cleaning up...`);
    fs.remove(filePath).catch(console.error);
  });

  fileStream.on('error', (err) => {
    console.error(`Error streaming HIGH QUALITY file ${filename}:`, err);
    res.status(500).json({ error: 'Error streaming file' });
  });
});

// Get conversion status (for future async processing)
app.get('/status/:jobId', (req, res) => {
  // This could be expanded for async processing
  res.json({ status: 'completed' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
    }
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HIGH QUALITY Video Encoding API running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log(`📁 Temp directory: ${tempDir}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   POST /convert - Upload and convert video with HIGH QUALITY`);
  console.log(`   GET /download/:filename - Download converted file`);
  console.log(`   GET /health - Health check`);
  console.log(`\n🌐 Network Access:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Network: http://[YOUR_IP]:${PORT}`);
  console.log(`\n🔧 HIGH QUALITY Settings: CRF 18, Slow Preset, High Profile`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});