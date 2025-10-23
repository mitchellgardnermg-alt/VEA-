const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const RenderEngine = require('./renderEngine');
const jobQueue = require('./jobQueue');

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
    fileSize: Infinity // No file size limit for Vixa Studios
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

// Separate upload config for audio files
const audioUpload = multer({
  storage: storage,
  limits: {
    fileSize: Infinity // No file size limit for Vixa Studios
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.fieldname === 'audio') {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
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
    message: 'Video Encoding API - Vixa Studios Exclusive',
    version: '2.0.0',
    phase: 'Phase 1 - Unlimited',
    maxConcurrent: 10,
    limits: {
      fileSize: 'Unlimited',
      queueLength: 'Unlimited',
      requests: 'Unlimited'
    },
    endpoints: {
      'POST /convert': 'Upload and convert video files',
      'POST /render/start': 'Start video rendering job',
      'GET /render/status/:jobId': 'Get render job status',
      'GET /render/position/:jobId': 'Get job queue position',
      'GET /render/download/:jobId': 'Download rendered video',
      'GET /render/stats': 'Get queue statistics',
      'GET /render/queue': 'Get detailed queue status with server health',
      'GET /memory': 'Memory monitoring and recommendations',
      'POST /memory/cleanup': 'Manual aggressive memory cleanup',
      'POST /memory/clear': 'Clear unused memory immediately',
      'GET /render/isolation/:jobId': 'VIXA: Check render session isolation status',
      'POST /render/isolation/:jobId/complete': 'VIXA: Force complete render isolation',
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

// Configure multer to handle multiple files (audio, backgroundImage, logoImage)
const renderUpload = multer({
  storage: storage,
  limits: {
    fileSize: Infinity // No file size limit for Vixa Studios
  }
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'backgroundImage', maxCount: 1 },
  { name: 'logoImage', maxCount: 1 }
]);

// Start render job endpoint
app.post('/render/start', renderUpload, async (req, res) => {
  try {
    if (!req.files || !req.files.audio || !req.files.audio[0]) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = req.files.audio[0];
    const backgroundImageFile = req.files.backgroundImage ? req.files.backgroundImage[0] : null;
    const logoImageFile = req.files.logoImage ? req.files.logoImage[0] : null;

    // Parse project configuration
    const config = JSON.parse(req.body.config || '{}');
    
    // Validate configuration
    if (!config.startTime && config.startTime !== 0) {
      return res.status(400).json({ error: 'Missing startTime in config' });
    }
    if (!config.endTime) {
      return res.status(400).json({ error: 'Missing endTime in config' });
    }
    if (!config.layers || !Array.isArray(config.layers)) {
      return res.status(400).json({ error: 'Missing or invalid layers in config' });
    }

    // Generate job ID
    const jobId = uuidv4();
    
    // 🎬 VIXA STUDIOS: Pre-render isolation - prepare clean environment
    jobQueue.preRenderIsolation(jobId);
    
    // Set defaults and add image paths
    const renderConfig = {
      startTime: config.startTime,
      endTime: config.endTime,
      fps: config.fps || 60,
      width: config.width || 854,
      height: config.height || 480,
      layers: config.layers,
      background: {
        ...config.background,
        src: backgroundImageFile ? backgroundImageFile.path : null
      },
      logo: config.logo ? {
        ...config.logo,
        src: logoImageFile ? logoImageFile.path : null
      } : null
    };

    const duration = renderConfig.endTime - renderConfig.startTime;
    const estimatedTime = Math.ceil(duration * 1.5); // Rough estimate: 1.5x duration
    
    console.log(`New render job ${jobId}: ${duration}s at ${renderConfig.fps}fps`);
    console.log('Images:', {
      background: !!backgroundImageFile,
      logo: !!logoImageFile
    });
    
    // Add job to queue
    jobQueue.addJob(jobId, {
      config: renderConfig,
      audioPath: audioFile.path,
      audioFilename: audioFile.originalname,
      backgroundImagePath: backgroundImageFile?.path,
      logoImagePath: logoImageFile?.path
    });

    // Start rendering asynchronously
    const renderEngine = new RenderEngine(jobId, renderConfig, audioFile.path);
    
    // Process render in background
    (async () => {
      let updateInterval = null;
      try {
        // Update job status from render engine
        updateInterval = setInterval(() => {
          jobQueue.updateJob(jobId, {
            status: renderEngine.status,
            progress: renderEngine.progress,
            stage: renderEngine.stage
          });
        }, 500);

        const result = await renderEngine.render();
        
        clearInterval(updateInterval);
        jobQueue.completeJob(jobId, result);
        
        // 🎬 VIXA STUDIOS: Pre-download isolation - clean up render data
        console.log(`🎬 VIXA STUDIOS: Render ${jobId} completed, preparing for download...`);
        jobQueue.clearUnusedMemory();
        
        // Clean up uploaded files
        await fs.remove(audioFile.path).catch(() => {});
        if (backgroundImageFile) await fs.remove(backgroundImageFile.path).catch(() => {});
        if (logoImageFile) await fs.remove(logoImageFile.path).catch(() => {});
        
      } catch (error) {
        if (updateInterval) clearInterval(updateInterval);
        jobQueue.failJob(jobId, error.message);
        
        // 🎬 VIXA STUDIOS: Complete isolation even on failure
        console.log(`🎬 VIXA STUDIOS: Render ${jobId} failed, performing complete isolation...`);
        jobQueue.completeRenderIsolation(jobId);
        
        // Clean up uploaded files
        await fs.remove(audioFile.path).catch(() => {});
        if (backgroundImageFile) await fs.remove(backgroundImageFile.path).catch(() => {});
        if (logoImageFile) await fs.remove(logoImageFile.path).catch(() => {});
      }
    })();

    res.json({
      success: true,
      jobId: jobId,
      estimatedTime: estimatedTime,
      message: 'Render job started'
    });

  } catch (error) {
    console.error('Render start error:', error);
    
    // Clean up any uploaded files on error
    if (req.files) {
      if (req.files.audio) await fs.remove(req.files.audio[0].path).catch(() => {});
      if (req.files.backgroundImage) await fs.remove(req.files.backgroundImage[0].path).catch(() => {});
      if (req.files.logoImage) await fs.remove(req.files.logoImage[0].path).catch(() => {});
    }
    
    res.status(500).json({
      error: 'Failed to start render',
      message: error.message
    });
  }
});

// Get render status endpoint
app.get('/render/status/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  
  // Check completed jobs first (RenderEngine persistence)
  const completedJobStatus = await RenderEngine.getJobStatus(jobId);
  if (completedJobStatus.status !== 'not_found') {
    return res.json({
      jobId: jobId,
      status: completedJobStatus.status,
      progress: completedJobStatus.progress || 100,
      stage: 'completed',
      outputPath: completedJobStatus.outputPath,
      completedAt: completedJobStatus.completedAt
    });
  }
  
  // Check active jobs in queue
  const job = jobQueue.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  });
});

// Download rendered video endpoint
app.get('/render/download/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const job = jobQueue.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({ 
      error: 'Job not completed',
      status: job.status,
      progress: job.progress
    });
  }
  
  const filePath = job.result.outputPath;
  
  if (!await fs.pathExists(filePath)) {
    return res.status(404).json({ error: 'Rendered file not found or expired' });
  }
  
  const stats = await fs.stat(filePath);
  console.log(`Serving rendered video: ${jobId}, size: ${stats.size} bytes`);
  
  res.setHeader('Content-Disposition', `attachment; filename="vixa-render-${jobId}.mp4"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stats.size);
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  
  // Clean up file after download
  fileStream.on('end', () => {
    console.log(`Rendered video ${jobId} downloaded, cleaning up...`);
    
    
    // 🎬 VIXA STUDIOS: Complete render isolation after download
    const isolationResult = jobQueue.completeRenderIsolation(jobId);
    console.log(`🎬 VIXA STUDIOS: Render ${jobId} completely isolated and cleaned up`);
    
    // Remove the file
    fs.remove(filePath).catch(console.error);
  });
  
  fileStream.on('error', (err) => {
    console.error(`Error streaming rendered video ${jobId}:`, err);
    res.status(500).json({ error: 'Error streaming file' });
  });
});

// Get queue stats endpoint
app.get('/render/stats', (req, res) => {
  res.json(jobQueue.getStats());
});

// Get detailed queue status with server health
app.get('/render/queue', (req, res) => {
  const stats = jobQueue.getStats();
  const memStats = jobQueue.getMemoryStatsWithWarnings();
  const queueStatus = {
    ...stats,
    serverHealth: {
      uptime: process.uptime(),
      memory: memStats,
      cpu: process.cpuUsage()
    }
  };
  res.json(queueStatus);
});

// Memory monitoring endpoint
app.get('/memory', (req, res) => {
  const memStats = jobQueue.getMemoryStatsWithWarnings();
  const uptime = process.uptime();
  
  res.json({
    memory: memStats,
    uptime: Math.round(uptime),
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    gcAvailable: !!global.gc,
    recommendations: memStats.warning ? [
      'Memory usage is high',
      'Consider reducing concurrent jobs',
      'Check for memory leaks',
      'Try /memory/cleanup endpoint'
    ] : [
      'Memory usage is normal',
      'System is healthy'
    ]
  });
});

// Manual memory cleanup endpoint
app.post('/memory/cleanup', (req, res) => {
  try {
    console.log('🧹 Manual memory cleanup triggered via API');
    
    // Get memory before cleanup
    const beforeMem = jobQueue.getMemoryStatsWithWarnings();
    
    // Perform cleanup (failed jobs only, completed jobs handled by RenderEngine)
    const cleanupResult = jobQueue.cleanupFailedJobs();
    
    // Get memory after cleanup
    const afterMem = jobQueue.getMemoryStatsWithWarnings();
    
    res.json({
      success: true,
      message: 'Memory cleanup completed',
      before: beforeMem,
      after: afterMem,
      cleanupResult: cleanupResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Memory cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Memory cleanup failed',
      message: error.message
    });
  }
});

// Clear unused memory endpoint
app.post('/memory/clear', (req, res) => {
  try {
    console.log('🧹 Clear unused memory triggered via API');
    
    const beforeMem = jobQueue.getMemoryStatsWithWarnings();
    
    // Clear unused memory
    jobQueue.clearUnusedMemory();
    
    const afterMem = jobQueue.getMemoryStatsWithWarnings();
    
    res.json({
      success: true,
      message: 'Unused memory cleared',
      before: beforeMem,
      after: afterMem,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Clear memory error:', error);
    res.status(500).json({
      success: false,
      error: 'Clear memory failed',
      message: error.message
    });
  }
});

// VIXA STUDIOS: Render isolation status endpoint
app.get('/render/isolation/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const sessionKey = `render_session_${jobId}`;
  const session = global[sessionKey];
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Render session not found',
      jobId: jobId
    });
  }
  
  res.json({
    success: true,
    jobId: jobId,
    session: session,
    isolated: true,
    status: 'Active render session',
    uptime: Date.now() - session.startTime,
    memory: jobQueue.getMemoryStatsWithWarnings()
  });
});

// VIXA STUDIOS: Force complete isolation endpoint
app.post('/render/isolation/:jobId/complete', (req, res) => {
  try {
    const jobId = req.params.jobId;
    console.log(`🎬 VIXA STUDIOS: Force complete isolation for job ${jobId}`);
    
    const result = jobQueue.completeRenderIsolation(jobId);
    
    res.json({
      success: true,
      message: 'Complete render isolation performed',
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Force isolation error:', error);
    res.status(500).json({
      success: false,
      error: 'Force isolation failed',
      message: error.message
    });
  }
});

// Get queue position for a specific job
app.get('/render/position/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobQueue.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const stats = jobQueue.getStats();
  const position = jobQueue.queue.indexOf(jobId) + 1;
  
  res.json({
    jobId: job.id,
    status: job.status,
    queuePosition: position > 0 ? position : null,
    estimatedWaitTime: position > 0 ? position * 30 : 0, // 30s avg per job
    stats: stats
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
      return res.status(400).json({ error: 'File too large.' });
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