const fs = require('fs-extra');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Extract audio segment and analyze it for frequency/waveform data
 */
class AudioAnalyzer {
  constructor(audioPath, startTime, endTime) {
    this.audioPath = audioPath;
    this.startTime = startTime;
    this.endTime = endTime;
    this.duration = endTime - startTime;
    this.sampleRate = 44100;
    this.fftSize = 256; // Must be power of 2
  }

  /**
   * Extract audio segment to WAV format for analysis
   */
  async extractSegment(outputPath) {
    const command = `ffmpeg -i "${this.audioPath}" -ss ${this.startTime} -t ${this.duration} -acodec pcm_s16le -ar ${this.sampleRate} -ac 2 "${outputPath}"`;
    
    console.log('Extracting audio segment:', command);
    
    try {
      await execPromise(command);
      return outputPath;
    } catch (error) {
      console.error('Audio extraction failed:', error);
      throw error;
    }
  }

  /**
   * Analyze audio file and generate frequency/waveform data for each frame
   */
  async analyzeAudio(fps) {
    const tempWavPath = path.join(__dirname, 'temp', `analysis-${Date.now()}.wav`);
    
    try {
      // Extract audio segment
      await this.extractSegment(tempWavPath);
      
      // Read WAV file
      const wavBuffer = await fs.readFile(tempWavPath);
      
      // Parse WAV data (simplified - assumes 16-bit PCM stereo)
      const dataOffset = 44; // Standard WAV header size
      const samples = [];
      
      for (let i = dataOffset; i < wavBuffer.length; i += 4) {
        if (i + 3 < wavBuffer.length) {
          // Read left and right channels (16-bit signed integers)
          const left = wavBuffer.readInt16LE(i);
          const right = wavBuffer.readInt16LE(i + 2);
          // Average the channels
          const avg = (left + right) / 2;
          samples.push(avg / 32768); // Normalize to -1 to 1
        }
      }
      
      console.log(`Analyzed ${samples.length} audio samples`);
      
      // Generate frame-by-frame audio data
      const frameInterval = 1 / fps;
      const totalFrames = Math.ceil(this.duration * fps);
      const frameData = [];
      
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const frameTime = frameIndex * frameInterval;
        const sampleIndex = Math.floor(frameTime * this.sampleRate);
        
        // Get samples for this frame
        const samplesPerFrame = Math.floor(this.sampleRate / fps);
        const frameSamples = samples.slice(sampleIndex, sampleIndex + samplesPerFrame);
        
        // Calculate frequency data (simplified FFT)
        const freq = this.calculateFrequency(frameSamples);
        
        // Calculate waveform data
        const wave = this.calculateWaveform(frameSamples);
        
        // Calculate RMS (loudness)
        const rms = this.calculateRMS(frameSamples);
        
        frameData.push({
          time: frameTime,
          freq: freq,
          wave: wave,
          rms: rms
        });
      }
      
      // Clean up temp file
      await fs.remove(tempWavPath);
      
      return frameData;
      
    } catch (error) {
      // Clean up on error
      await fs.remove(tempWavPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Calculate frequency data (simplified FFT)
   */
  calculateFrequency(samples) {
    const freq = new Array(this.fftSize).fill(0);
    
    if (samples.length === 0) return freq;
    
    // Simplified frequency analysis
    // In production, you'd use a proper FFT library
    const chunkSize = Math.floor(samples.length / this.fftSize);
    
    for (let i = 0; i < this.fftSize; i++) {
      let sum = 0;
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, samples.length);
      
      for (let j = start; j < end; j++) {
        sum += Math.abs(samples[j]);
      }
      
      // Normalize to 0-255 range
      freq[i] = Math.min(255, Math.floor((sum / chunkSize) * 255));
    }
    
    return freq;
  }

  /**
   * Calculate waveform data
   */
  calculateWaveform(samples) {
    const wave = new Array(this.fftSize).fill(0);
    
    if (samples.length === 0) return wave;
    
    const chunkSize = Math.floor(samples.length / this.fftSize);
    
    for (let i = 0; i < this.fftSize; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, samples.length);
      
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
      }
      
      // Normalize to 0-255 range (offset by 128 for midpoint)
      wave[i] = Math.floor(((sum / chunkSize) + 1) * 127.5);
    }
    
    return wave;
  }

  /**
   * Calculate RMS (root mean square) for loudness
   */
  calculateRMS(samples) {
    if (samples.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    
    return Math.sqrt(sum / samples.length);
  }
}

module.exports = AudioAnalyzer;

