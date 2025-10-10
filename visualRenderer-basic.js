const { createCanvas, loadImage } = require('canvas');

/**
 * Visual mode renderer for server-side frame generation
 */
class VisualRenderer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Helper function to pick from array by index
   */
  pick(arr, i) {
    return arr[i % arr.length];
  }

  /**
   * Render a single frame with all layers
   */
  async renderFrame(audioData, layers, background, logo, palettes) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const { freq, wave, rms } = audioData;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // 1. Render background
    ctx.fillStyle = background.color || '#000000';
    ctx.fillRect(0, 0, w, h);

    // Background image if provided
    if (background.src) {
      try {
        const img = await loadImage(background.src);
        let dw = w, dh = h;
        
        if (background.fit === 'contain') {
          const scale = Math.min(w / img.width, h / img.height);
          dw = img.width * scale;
          dh = img.height * scale;
        } else if (background.fit === 'cover') {
          const scale = Math.max(w / img.width, h / img.height);
          dw = img.width * scale;
          dh = img.height * scale;
        }
        
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        ctx.globalAlpha = background.opacity || 1;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      } catch (err) {
        console.error('Failed to load background image:', err);
      }
    }

    // 2. Render each layer
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;

      const colors = palettes[layer.paletteId] || ['#10B981', '#22D3EE', '#60A5FA'];
      ctx.globalAlpha = layer.opacity;

      // Set blend mode
      switch (layer.blend) {
        case 'screen': ctx.globalCompositeOperation = 'screen'; break;
        case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
        case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
        case 'add': ctx.globalCompositeOperation = 'lighter'; break;
        default: ctx.globalCompositeOperation = 'source-over'; break;
      }

      // Render visual mode
      this.renderVisualMode(layer.mode, freq, wave, rms, colors);

      // Reset composite operation
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // 3. Render logo overlay
    if (logo && logo.src) {
      try {
        const img = await loadImage(logo.src);
        const scale = Math.max(0.1, Math.min(2, logo.scale || 1));
        const iw = Math.min(w, h) * 0.25 * scale;
        const ih = iw;
        const x = (logo.x || 0.5) * (w - iw);
        const y = (logo.y || 0.5) * (h - ih);
        ctx.globalAlpha = logo.opacity || 1;
        ctx.drawImage(img, x, y, iw, ih);
        ctx.globalAlpha = 1;
      } catch (err) {
        console.error('Failed to load logo:', err);
      }
    }

    return this.canvas;
  }

  /**
   * Render different visual modes
   */
  renderVisualMode(mode, freq, wave, rms, colors) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    switch (mode) {
      case 'bars':
        this.renderBars(freq, colors);
        break;
      case 'waveform':
        this.renderWaveform(wave, colors);
        break;
      case 'smoke':
        this.renderSmoke(freq, colors);
        break;
      case 'particles':
        this.renderParticles(freq, colors, rms);
        break;
      case 'radial':
        this.renderRadial(freq, colors);
        break;
      case 'spiral':
        this.renderSpiral(freq, colors);
        break;
      case 'geometric':
        this.renderGeometric(freq, colors, rms);
        break;
      default:
        this.renderBars(freq, colors);
    }
  }

  renderBars(freq, colors) {
    const w = this.width;
    const h = this.height;
    const barCount = 96;
    const binSize = Math.floor(freq.length / barCount) || 1;
    const barWidth = w / barCount;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) sum += freq[i * binSize + j] || 0;
      const v = sum / (binSize * 255);
      const barH = v * (h * 0.6);
      this.ctx.fillStyle = this.pick(colors, 1 + (i % (colors.length - 1)));
      this.ctx.fillRect(i * barWidth, h - barH, barWidth - 1, barH);
    }
  }

  renderWaveform(wave, colors) {
    const w = this.width;
    const h = this.height;
    
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = this.pick(colors, 2);
    this.ctx.beginPath();
    
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * wave.length);
      const y = ((wave[idx] - 128) / 128) * 0.4 * h + h * 0.5;
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  renderSmoke(freq, colors) {
    const w = this.width;
    const h = this.height;
    
    for (let i = 0; i < freq.length; i += 2) {
      const x = (i / freq.length) * w;
      const v = freq[i] / 255;
      const y = h - v * h * 0.8;
      const size = 2 + v * 4;
      
      this.ctx.fillStyle = this.pick(colors, Math.floor(i / 10) % colors.length);
      this.ctx.globalAlpha = 0.3 + v * 0.4;
      this.ctx.fillRect(x - size / 2, y, size, h - y);
    }
    this.ctx.globalAlpha = 1;
  }

  renderParticles(freq, colors, rms) {
    const w = this.width;
    const h = this.height;
    const count = 50;
    
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const freqVal = freq[Math.floor((i / count) * freq.length)] || 0;
      const radius = (freqVal / 255) * Math.min(w, h) * 0.4;
      const x = w * 0.5 + Math.cos(angle) * radius;
      const y = h * 0.5 + Math.sin(angle) * radius;
      const size = 3 + (freqVal / 255) * 5;
      
      this.ctx.fillStyle = this.pick(colors, i % colors.length);
      this.ctx.globalAlpha = 0.6 + (freqVal / 255) * 0.4;
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  renderRadial(freq, colors) {
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = Math.min(w, h) * 0.35;
    const N = 120;
    const step = Math.max(1, Math.floor(freq.length / N));
    
    for (let i = 0; i < N; i++) {
      const v = (freq[i * step] ?? 0) / 255;
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.fillStyle = this.pick(colors, 1 + (i % (colors.length - 1)));
      this.ctx.arc(cx, cy, radius * (0.4 + v * 0.9), a0, a1);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  renderSpiral(freq, colors) {
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const turns = 5;
    const points = 200;
    
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.pick(colors, 1);
    this.ctx.lineWidth = 2;
    
    for (let i = 0; i < points; i++) {
      const t = i / points;
      const angle = t * turns * Math.PI * 2;
      const freqVal = freq[Math.floor(t * freq.length)] || 0;
      const radius = (t * Math.min(w, h) * 0.4) * (1 + (freqVal / 255) * 0.5);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  renderGeometric(freq, colors, rms) {
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const size = Math.min(w, h) * 0.3 * (1 + rms * 0.5);
    const sides = 6;
    
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(Date.now() * 0.001);
    
    this.ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * size;
      const y = Math.sin(angle) * size;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    
    this.ctx.strokeStyle = this.pick(colors, 1);
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Save canvas to PNG file
   */
  async saveFrame(framePath) {
    const buffer = this.canvas.toBuffer('image/png');
    await require('fs-extra').writeFile(framePath, buffer);
  }

  /**
   * Get canvas buffer
   */
  getBuffer() {
    return this.canvas.toBuffer('image/png');
  }
}

module.exports = VisualRenderer;

