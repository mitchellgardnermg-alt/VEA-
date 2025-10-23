const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple job tracking
const jobs = new Map();

// Configure multer for video files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: Infinity // No file size limit for VIXA Studios
  }
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'VIXA Studios Video Converter API',
    timestamp: new Date().toISOString()
  });
});

// Simple video conversion endpoint
app.post('/convert/start', upload, async (req, res) => {
  try {
    if (!req.files || !req.files.video || !req.files.video[0]) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoFile = req.files.video[0];
    const audioFile = req.files.audio ? req.files.audio[0] : null;
    const jobId = uuidv4();

    console.log(`🎬 VIXA STUDIOS: Converting video ${videoFile.filename} to MP4`);

    // Create job
    jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      stage: 'converting',
      createdAt: Date.now(),
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      result: null
    });

    // Start conversion in background
    convertVideo(jobId, videoFile, audioFile);

    res.json({
      success: true,
      jobId: jobId,
      message: 'Video conversion started'
    });

  } catch (error) {
    console.error('Conversion start error:', error);
    res.status(500).json({
      error: 'Failed to start conversion',
      message: error.message
    });
  }
});

// Get conversion status
app.get('/convert/status/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  
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

// Download converted video
app.get('/convert/download/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  
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
    return res.status(404).json({ error: 'Converted file not found' });
  }
  
  const stats = await fs.stat(filePath);
  console.log(`Serving converted video: ${jobId}, size: ${stats.size} bytes`);
  
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${job.result.filename}"`);
  res.setHeader('Content-Length', stats.size);
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  
  // Clean up after download
  fileStream.on('end', () => {
    console.log(`Converted video ${jobId} downloaded, cleaning up...`);
    fs.remove(filePath).catch(console.error);
    jobs.delete(jobId);
  });
  
  fileStream.on('error', (err) => {
    console.error(`Error streaming converted video ${jobId}:`, err);
    res.status(500).json({ error: 'Error streaming file' });
  });
});

// Simple video conversion function
async function convertVideo(jobId, videoFile, audioFile) {
  try {
    const job = jobs.get(jobId);
    job.status = 'processing';
    job.progress = 10;
    job.stage = 'analyzing';
    
    // Create output directory
    const outputDir = path.join(__dirname, 'output');
    await fs.ensureDir(outputDir);
    
    const outputFileName = `${jobId}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);
    
    job.progress = 20;
    job.stage = 'converting';
    
    // Simple FFmpeg conversion
    const ffmpegCommand = ffmpeg(videoFile.path);
    
    if (audioFile) {
      ffmpegCommand.input(audioFile.path);
    }
    
    ffmpegCommand
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log(`🎬 VIXA STUDIOS: FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        const percent = Math.min(95, Math.floor(progress.percent || 0));
        job.progress = 20 + percent;
        job.stage = 'converting';
        console.log(`[${jobId}] Conversion: ${percent}%`);
      })
      .on('end', async () => {
        console.log(`[${jobId}] Conversion completed`);
        
        job.status = 'completed';
        job.progress = 100;
        job.stage = 'completed';
        job.completedAt = Date.now();
        job.result = {
          outputPath: outputPath,
          filename: outputFileName,
          fileSize: (await fs.stat(outputPath)).size
        };
        
        // Clean up input files
        await fs.remove(videoFile.path);
        if (audioFile) {
          await fs.remove(audioFile.path);
        }
        
        console.log(`🎬 VIXA STUDIOS: Video ${jobId} converted successfully`);
      })
      .on('error', async (err) => {
        console.error(`[${jobId}] Conversion failed:`, err);
        
        job.status = 'failed';
        job.error = err.message;
        
        // Clean up input files
        await fs.remove(videoFile.path);
        if (audioFile) {
          await fs.remove(audioFile.path);
        }
      })
      .run();
      
  } catch (error) {
    console.error(`[${jobId}] Conversion error:`, error);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message;
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 VIXA STUDIOS Video Converter API running on port ${PORT}`);
  console.log(`📁 Upload directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`📁 Output directory: ${path.join(__dirname, 'output')}`);
});
