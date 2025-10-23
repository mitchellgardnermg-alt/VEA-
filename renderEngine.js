const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');
const AudioAnalyzer = require('./audioAnalyzer');
const VisualRenderer = require('./visualRenderer');
const palettes = require('./palettes');

/**
 * Job persistence manager for completed renders (VIXA Studios)
 */
class JobPersistence {
  constructor() {
    this.completedJobs = new Map();
    this.fileRetentionTime = 300000; // 5 minutes retention
  }

  /**
   * Mark job as completed with file retention (VIXA Studios)
   */
  async markJobCompleted(jobId, outputPath) {
    const completedAt = Date.now();
    const expiryTime = completedAt + this.fileRetentionTime;
    
    this.completedJobs.set(jobId, {
      outputPath,
      completedAt,
      expiryTime,
      status: 'completed'
    });
    
    console.log(`✅ Job ${jobId} completed, file: ${outputPath}`);
    console.log(`📁 File will expire at: ${new Date(expiryTime).toISOString()}`);
    
    // Schedule cleanup
    setTimeout(() => {
      this.cleanupExpiredFile(jobId);
    }, this.fileRetentionTime);
  }

  /**
   * Clean up expired file (VIXA Studios)
   */
  async cleanupExpiredFile(jobId) {
    const job = this.completedJobs.get(jobId);
    if (job && Date.now() > job.expiryTime) {
      try {
        await fs.remove(job.outputPath);
        this.completedJobs.delete(jobId);
        console.log(`🗑️ Cleaned up expired file for job ${jobId}`);
      } catch (error) {
        console.error(`Failed to cleanup job ${jobId}:`, error);
      }
    }
  }

  /**
   * Get job status from completed jobs (VIXA Studios)
   */
  async getJobStatus(jobId) {
    const job = this.completedJobs.get(jobId);
    if (!job) {
      return { status: 'not_found', error: 'Job not found or expired' };
    }
    
    // Check if file still exists
    try {
      const exists = await fs.pathExists(job.outputPath);
      if (!exists) {
        this.completedJobs.delete(jobId);
        return { status: 'file_missing', error: 'Rendered file not found' };
      }
      
      return {
        status: job.status,
        progress: 100,
        outputPath: job.outputPath,
        completedAt: job.completedAt
      };
    } catch (error) {
      console.error(`Error checking job ${jobId}:`, error);
      return { status: 'error', error: error.message };
    }
  }
}

/**
 * Main render engine for creating videos from VIXA projects
 */
class RenderEngine {
  constructor(jobId, config, audioPath) {
    this.jobId = jobId;
    this.config = config;
    this.audioPath = audioPath;
    this.status = 'queued';
    this.progress = 0;
    this.stage = 'initializing';
    this.error = null;
    this.outputPath = null;
    
    // Create job directory (OPTIMIZED FOR STREAMING)
    this.jobDir = path.join(__dirname, 'temp', 'renders', jobId);
    this.framesDir = null; // No longer needed with streaming!
    this.audioSegmentPath = path.join(this.jobDir, 'audio.wav');
  }

  /**
   * Update job status
   */
  updateStatus(status, progress, stage, message) {
    this.status = status;
    this.progress = progress;
    this.stage = stage;
    console.log(`[${this.jobId}] ${stage}: ${progress}% - ${message || ''}`);
  }

  /**
   * Main render function
   */
  async render() {
    try {
      // Create directories (OPTIMIZED FOR STREAMING)
      await fs.ensureDir(this.jobDir);
      
      this.updateStatus('rendering', 0, 'analyzing_audio', 'Analyzing audio...');
      
      // Extract and analyze audio
      const { startTime, endTime, fps, width, height, layers } = this.config;
      const duration = endTime - startTime;
      
      const audioAnalyzer = new AudioAnalyzer(this.audioPath, startTime, endTime);
      const audioFrames = await audioAnalyzer.analyzeAudio(fps);
      const totalFrames = audioFrames.length; // Define totalFrames for streaming
      
      this.updateStatus('rendering', 10, 'audio_analyzed', `Analyzed ${totalFrames} frames`);
      
      // Initialize visual renderer
      const renderer = new VisualRenderer(width, height);
      
      this.updateStatus('rendering', 15, 'rendering_frames', 'Starting streaming frame rendering...');
      
      // Extract audio segment first
      await audioAnalyzer.extractSegment(this.audioSegmentPath);

      // Validate audio segment exists and is non-empty
      const audioExists = await fs.pathExists(this.audioSegmentPath);
      if (!audioExists) {
        throw new Error('Audio segment missing after extraction');
      }
      const audioStats = await fs.stat(this.audioSegmentPath);
      if (!audioStats.size) {
        throw new Error('Audio segment is empty');
      }
      
      // Set up output path
      const outputFileName = `${this.jobId}.mp4`;
      this.outputPath = path.join(__dirname, 'output', outputFileName);
      
      this.updateStatus('rendering', 20, 'encoding_video', 'Starting FFmpeg streaming process...');
      
      // Render frames with streaming to FFmpeg
      await this.renderFramesStreaming(audioFrames, layers, fps, this.audioSegmentPath, this.outputPath);
      
      this.updateStatus('completed', 100, 'completed', 'Render complete');
      
      // 🎬 VIXA STUDIOS: Mark job as completed with file retention (BEFORE cleanup)
      await jobPersistence.markJobCompleted(this.jobId, this.outputPath);
      
      // Clear memory references immediately
      this.clearMemoryReferences();
      
      // Clean up temp files (keep output)
      await this.cleanup(false);
      
      return {
        success: true,
        outputPath: this.outputPath,
        filename: outputFileName,
        duration: duration,
        frames: totalFrames,
        fileSize: this.outputPath ? (await fs.stat(this.outputPath)).size : 0
      };
      
    } catch (error) {
      console.error(`[${this.jobId}] Render failed:`, error);
      this.error = error.message;
      this.updateStatus('failed', this.progress, 'failed', error.message);
      
      // Clear memory references even on failure
      this.clearMemoryReferences();
      
      await this.cleanup(true);
      throw error;
    }
  }

  /**
   * Render frames with streaming to FFmpeg (NEW HIGH-PERFORMANCE METHOD)
   */
  async renderFramesStreaming(audioFrames, layers, fps, audioPath, outputPath) {
    const renderer = new VisualRenderer(this.config.width, this.config.height);
    const totalFrames = audioFrames.length;
    
    return new Promise((resolve, reject) => {
      // Start FFmpeg process with stdin pipe for streaming
      const ffmpegArgs = [
        '-loglevel', 'error',         // Lower noise; use 'info' for debugging
        '-f', 'rawvideo',             // Read raw frames from stdin
        '-pix_fmt', 'rgb24',          // Pixel format (canvas ImageData)
        '-s', `${this.config.width}x${this.config.height}`, // Frame size
        '-framerate', fps.toString(), // Input framerate
        '-i', '-',                    // Raw frames from stdin
        '-thread_queue_size', '1024', // Increase input queue sizes
        '-i', audioPath,              // Audio input
        '-c:v', 'libx264',            // Video codec
        '-preset', 'fast',            // Faster encoding
        '-crf', '23',                 // Quality setting
        '-pix_fmt', 'yuv420p',        // Output pixel format
        '-c:a', 'aac',                // Audio codec
        '-b:a', '192k',               // Audio bitrate
        '-movflags', '+faststart',    // Web optimization
        '-r', fps.toString(),         // Output fps
        '-y',                         // Overwrite output file
        outputPath
      ];
      
      console.log(`🎬 VIXA STUDIOS: Starting streaming FFmpeg with args: ${ffmpegArgs.join(' ')}`);
      
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      // Handle FFmpeg process events
      ffmpegProcess.on('error', (err) => {
        console.error(`[${this.jobId}] FFmpeg process error:`, err);
        reject(new Error(`FFmpeg process failed: ${err.message}`));
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[${this.jobId}] Streaming render completed successfully`);
          resolve();
        } else {
          console.error(`[${this.jobId}] FFmpeg exited with code ${code}`);
          if (ffmpegOutput) {
            console.error(`[${this.jobId}] FFmpeg stderr:\n${ffmpegOutput}`);
          }
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      // Handle stdin errors (EPIPE, etc.)
      ffmpegProcess.stdin.on('error', (err) => {
        console.error(`[${this.jobId}] FFmpeg stdin error:`, err);
        if (err.code === 'EPIPE') {
          reject(new Error('FFmpeg process closed unexpectedly (broken pipe)'));
        } else {
          reject(new Error(`FFmpeg stdin error: ${err.message}`));
        }
      });
      
      // Monitor process health
      let processAlive = true;
      ffmpegProcess.on('exit', () => {
        processAlive = false;
      });
      
      // Handle FFmpeg stderr for progress tracking
      let ffmpegOutput = '';
      ffmpegProcess.stderr.on('data', (data) => {
        ffmpegOutput += data.toString();
        
        // Extract progress from FFmpeg output
        const progressMatch = ffmpegOutput.match(/frame=\s*(\d+)/);
        if (progressMatch) {
          const framesProcessed = parseInt(progressMatch[1]);
          const encodingProgress = Math.min(95, 20 + Math.floor((framesProcessed / totalFrames) * 75));
          this.updateStatus('rendering', encodingProgress, 'encoding_video', 
            `Streaming: ${framesProcessed}/${totalFrames} frames (${Math.round((framesProcessed/totalFrames)*100)}%)`);
        }
      });
      
      // Process frames and stream to FFmpeg
      this.processFramesStreaming(renderer, audioFrames, layers, ffmpegProcess, totalFrames, () => processAlive)
        .then(() => {
          // Close stdin to signal end of frames
          if (!ffmpegProcess.stdin.destroyed) {
            ffmpegProcess.stdin.end();
            console.log(`[${this.jobId}] All frames streamed, closing FFmpeg stdin`);
          }
        })
        .catch(err => {
          if (!ffmpegProcess.killed) {
            ffmpegProcess.kill();
          }
          reject(err);
        });
    });
  }
  
  /**
   * Process frames and stream them to FFmpeg stdin
   */
  async processFramesStreaming(renderer, audioFrames, layers, ffmpegProcess, totalFrames, isProcessAlive) {
    for (let i = 0; i < totalFrames; i++) {
      const frameData = audioFrames[i];
      
      try {
        // Render frame to canvas
        await renderer.renderFrame(
          frameData,
          layers,
          this.config.background,
          this.config.logo,
          palettes,
          frameData.time
        );
        
        // Get raw RGB frame buffer from canvas for rawvideo piping
        const imageData = renderer.ctx.getImageData(0, 0, this.config.width, this.config.height);
        const frameBuffer = Buffer.from(imageData.data);
        
        // Check if FFmpeg process is still alive before writing
        if (!isProcessAlive() || ffmpegProcess.stdin.destroyed || ffmpegProcess.killed) {
          throw new Error('FFmpeg process terminated unexpectedly');
        }
        
        // Write with error handling and backpressure
        try {
          const ok = ffmpegProcess.stdin.write(frameBuffer);
          if (!ok) {
            await new Promise((resolve, reject) => {
              const onDrain = () => {
                ffmpegProcess.stdin.off('error', onError);
                resolve();
              };
              const onError = (err) => {
                ffmpegProcess.stdin.off('drain', onDrain);
                reject(err);
              };
              ffmpegProcess.stdin.once('drain', onDrain);
              ffmpegProcess.stdin.once('error', onError);
            });
          }
        } catch (writeError) {
          if (writeError.code === 'EPIPE') {
            throw new Error('FFmpeg process closed unexpectedly (EPIPE)');
          }
          throw writeError;
        }
        
        // Update progress (20-95% for streaming)
        const frameProgress = 20 + Math.floor((i / totalFrames) * 75);
        if (i % Math.ceil(totalFrames / 20) === 0) {
          this.updateStatus('rendering', frameProgress, 'rendering_frames', 
            `Streaming frame ${i}/${totalFrames} (${Math.round((i/totalFrames)*100)}%)`);
        }
        
        // Small delay to prevent overwhelming FFmpeg
        if (i % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
        
      } catch (error) {
        console.error(`[${this.jobId}] Error processing frame ${i}:`, error);
        throw error;
      }
    }
  }

  /**
   * Combine frames and audio using FFmpeg (LEGACY METHOD - kept for fallback)
   */
  async muxVideo(fps, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
      const framePattern = path.join(this.framesDir, 'frame-%06d.png');
      
      ffmpeg()
        .input(framePattern)
        .inputFPS(fps)
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 192k',
          '-movflags +faststart',
          '-shortest' // Stop when shortest input ends
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg muxing started:', cmd);
        })
        .on('progress', (progress) => {
          const percent = 80 + Math.floor((progress.percent || 0) / 5);
          this.updateStatus('rendering', Math.min(95, percent), 'encoding_video', `Encoding: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('Video muxing completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg muxing error:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Clean up temporary files (OPTIMIZED FOR STREAMING)
   */
  async cleanup(cleanOutput = false) {
    try {
      // Clean up job directory (no more frames directory needed!)
      if (this.jobDir) {
      await fs.remove(this.jobDir);
      }
      
      // Optionally clean up output file
      if (cleanOutput && this.outputPath) {
        await fs.remove(this.outputPath);
      }
      
      // Clear any references to free memory immediately
      this.jobDir = null;
      this.framesDir = null; // No longer used with streaming
      this.audioSegmentPath = null;
      this.outputPath = null;
      
      console.log(`[${this.jobId}] 🎬 VIXA STUDIOS: Streaming cleanup complete - no PNG files to clean!`);
    } catch (error) {
      console.error(`[${this.jobId}] Cleanup error:`, error);
    }
  }

  /**
   * Immediate memory cleanup during rendering
   */
  clearMemoryReferences() {
    // Clear any large objects that might be holding memory
    if (this.audioFrames) {
      this.audioFrames = null;
    }
    if (this.renderer) {
      this.renderer = null;
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}

// Create global JobPersistence instance
const jobPersistence = new JobPersistence();

module.exports = { RenderEngine, jobPersistence };

