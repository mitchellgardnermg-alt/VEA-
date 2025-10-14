const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const AudioAnalyzer = require('./audioAnalyzer');
const VisualRenderer = require('./visualRenderer');
const palettes = require('./palettes');

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
    
    // Create job directory
    this.jobDir = path.join(__dirname, 'temp', 'renders', jobId);
    this.framesDir = path.join(this.jobDir, 'frames');
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
      // Create directories
      await fs.ensureDir(this.framesDir);
      
      this.updateStatus('rendering', 0, 'analyzing_audio', 'Analyzing audio...');
      
      // Extract and analyze audio
      const { startTime, endTime, fps, width, height, layers } = this.config;
      const duration = endTime - startTime;
      
      const audioAnalyzer = new AudioAnalyzer(this.audioPath, startTime, endTime);
      const audioFrames = await audioAnalyzer.analyzeAudio(fps);
      
      this.updateStatus('rendering', 10, 'audio_analyzed', `Analyzed ${audioFrames.length} frames`);
      
      // Initialize visual renderer
      const renderer = new VisualRenderer(width, height);
      
      this.updateStatus('rendering', 15, 'rendering_frames', 'Starting frame rendering...');
      
      // Render each frame
      const totalFrames = audioFrames.length;
      for (let i = 0; i < totalFrames; i++) {
        const frameData = audioFrames[i];
        
        // Render frame
        await renderer.renderFrame(
          frameData,
          layers,
          this.config.background,
          this.config.logo,
          palettes,
          frameData.time // Pass current time for animations
        );
        
        // Save frame
        const framePath = path.join(this.framesDir, `frame-${String(i).padStart(6, '0')}.png`);
        await renderer.saveFrame(framePath);
        
        // Update progress (15-75% for frame rendering)
        const frameProgress = 15 + Math.floor((i / totalFrames) * 60);
        if (i % Math.ceil(totalFrames / 20) === 0) {
          this.updateStatus('rendering', frameProgress, 'rendering_frames', `Frame ${i}/${totalFrames}`);
        }
      }
      
      this.updateStatus('rendering', 75, 'frames_complete', 'All frames rendered');
      
      // Extract audio segment
      await audioAnalyzer.extractSegment(this.audioSegmentPath);
      
      this.updateStatus('rendering', 80, 'encoding_video', 'Combining frames with audio...');
      
      // Combine frames + audio into video
      const outputFileName = `${this.jobId}.mp4`;
      this.outputPath = path.join(__dirname, 'output', outputFileName);
      
      await this.muxVideo(fps, this.audioSegmentPath, this.outputPath);
      
      this.updateStatus('completed', 100, 'completed', 'Render complete');
      
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
        fileSize: (await fs.stat(this.outputPath)).size
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
   * Combine frames and audio using FFmpeg
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
   * Clean up temporary files
   */
  async cleanup(cleanOutput = false) {
    try {
      // Always clean up job directory
      await fs.remove(this.jobDir);
      
      // Optionally clean up output file
      if (cleanOutput && this.outputPath) {
        await fs.remove(this.outputPath);
      }
      
      // Clear any references to free memory immediately
      this.jobDir = null;
      this.framesDir = null;
      this.audioSegmentPath = null;
      this.outputPath = null;
      
      console.log(`[${this.jobId}] Cleanup complete - memory references cleared`);
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

module.exports = RenderEngine;

