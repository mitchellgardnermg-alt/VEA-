const { createCanvas, loadImage } = require('canvas');

/**
 * Complete visual mode renderer with all VIXA modes
 * This is a large file but includes all 22+ visual modes for CapCut-level features
 */
class VisualRenderer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.frameTime = 0; // Track time for animations
    this.layerCache = new Map(); // Cache for stateful modes (rain, snow, etc.)
  }

  pick(arr, i) {
    return arr[i % arr.length];
  }

  async renderFrame(audioData, layers, background, logo, palettes, currentTime) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const { freq, wave, rms } = audioData;
    
    this.frameTime = currentTime * 1000; // Store for animations

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // 1. Render background
    ctx.fillStyle = background.color || '#000000';
    ctx.fillRect(0, 0, w, h);

    if (background.src) {
      try {
        const img = await loadImage(background.src);
        let dw = w, dh = h;
        if (background.fit === 'contain') {
          const scale = Math.min(w / img.width, h / img.height);
          dw = img.width * scale; dh = img.height * scale;
        } else if (background.fit === 'cover') {
          const scale = Math.max(w / img.width, h / img.height);
          dw = img.width * scale; dh = img.height * scale;
        }
        const dx = (w - dw) / 2, dy = (h - dh) / 2;
        ctx.globalAlpha = background.opacity || 1;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      } catch (err) {
        console.error('Background image error:', err.message);
      }
    }

    // 2. Render layers
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      
      const colors = palettes[layer.paletteId] || ['#10B981', '#22D3EE', '#60A5FA'];
      ctx.globalAlpha = layer.opacity;

      switch (layer.blend) {
        case 'screen': ctx.globalCompositeOperation = 'screen'; break;
        case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
        case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
        case 'add': ctx.globalCompositeOperation = 'lighter'; break;
        default: ctx.globalCompositeOperation = 'source-over'; break;
      }

      this.renderVisualMode(layer, freq, wave, rms, colors);
      
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // 3. Logo overlay
    if (logo && logo.src) {
      try {
        const img = await loadImage(logo.src);
        const scale = Math.max(0.1, Math.min(2, logo.scale || 1));
        const iw = Math.min(w, h) * 0.25 * scale;
        const x = (logo.x || 0.5) * (w - iw);
        const y = (logo.y || 0.5) * (h - iw);
        ctx.globalAlpha = logo.opacity || 1;
        ctx.drawImage(img, x, y, iw, iw);
        ctx.globalAlpha = 1;
      } catch (err) {
        console.error('Logo error:', err.message);
      }
    }

    return this.canvas;
  }

  renderVisualMode(layer, freq, wave, rms, colors) {
    const mode = layer.mode;
    
    // Route to specific render function
    const renderMap = {
      'bars': () => this.renderBars(freq, colors),
      'waveform': () => this.renderWaveform(wave, colors),
      'radial': () => this.renderRadial(freq, colors),
      'mirror-eq': () => this.renderMirrorEq(freq, colors),
      'peak-bars': () => this.renderPeakBars(freq, colors),
      'sparkline': () => this.renderSparkline(wave, colors, layer.opacity),
      'rings': () => this.renderRings(freq, colors),
      'lissajous': () => this.renderLissajous(wave, colors, layer.opacity),
      'snake': () => this.renderSnake(freq, wave, rms, colors, layer),
      'grid': () => this.renderGrid(freq, rms, colors, layer),
      'radar': () => this.renderRadar(wave, colors),
      'city-eq': () => this.renderCityEq(freq, colors),
      'led-matrix': () => this.renderLedMatrix(freq, colors),
      'blob': () => this.renderBlob(freq, colors, layer.opacity),
      'smoke': () => this.renderSmokeAdvanced(freq, colors),
      'spiral': () => this.renderSpiral(freq, colors),
      'geometric': () => this.renderGeometricShapes(freq, colors, rms),
      'collage': () => this.renderSpinningCubes(colors),
      'mandala': () => this.renderMandala(colors),
      'kaleidoscope': () => this.renderKaleidoscope(colors),
      'space-tunnel': () => this.renderSpaceTunnel(colors, layer),
      'warp-speed': () => this.renderWarpSpeed(colors, layer),
      'rain': () => this.renderRain(colors, layer),
      'snowfall': () => this.renderSnowfall(colors, layer)
    };

    const renderFn = renderMap[mode] || renderMap['bars'];
    renderFn();
  }

  // All 22+ visual modes below...
  
  renderBars(freq, colors) {
    const w = this.width, h = this.height;
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
    const w = this.width, h = this.height;
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

  renderRadial(freq, colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const radius = Math.min(w, h) * 0.35;
    const N = 120, step = Math.max(1, Math.floor(freq.length / N));
    
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

  renderMirrorEq(freq, colors) {
    const w = this.width, h = this.height;
    const barCount = 64, binSize = Math.floor(freq.length / barCount) || 1;
    const barWidth = (w / 2) / barCount;
    
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) sum += freq[i * binSize + j] || 0;
      const v = sum / (binSize * 255);
      const barH = v * (h * 0.45);
      this.ctx.fillStyle = this.pick(colors, 1 + (i % (colors.length - 1)));
      this.ctx.fillRect((w * 0.5) - (i + 1) * barWidth, (h * 0.5) - barH, barWidth - 1, barH * 2);
      this.ctx.fillRect((w * 0.5) + i * barWidth, (h * 0.5) - barH, barWidth - 1, barH * 2);
    }
  }

  renderPeakBars(freq, colors) {
    const w = this.width, h = this.height;
    const barCount = 96, binSize = Math.floor(freq.length / barCount) || 1;
    const barWidth = w / barCount;
    
    for (let i = 0; i < barCount; i++) {
      let peak = 0;
      for (let j = 0; j < binSize; j++) peak = Math.max(peak, freq[i * binSize + j] || 0);
      const v = peak / 255;
      const barH = v * (h * 0.6);
      this.ctx.fillStyle = this.pick(colors, 1 + (i % (colors.length - 1)));
      this.ctx.fillRect(i * barWidth, h - barH, barWidth - 1, barH);
    }
  }

  renderSparkline(wave, colors, opacity) {
    const w = this.width, h = this.height;
    this.ctx.strokeStyle = this.pick(colors, 2);
    this.ctx.lineWidth = 1.5;
    const ww = Math.min(240, w * 0.3), hh = Math.min(80, h * 0.2);
    this.ctx.strokeRect(12, 12, ww, hh);
    this.ctx.beginPath();
    for (let x = 0; x < ww; x++) {
      const idx = Math.floor((x / ww) * wave.length);
      const y = 12 + (hh / 2) + ((wave[idx] - 128) / 128) * (hh * 0.45);
      if (x === 0) this.ctx.moveTo(12, y); else this.ctx.lineTo(12 + x, y);
    }
    this.ctx.stroke();
  }

  renderRings(freq, colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    this.ctx.lineWidth = 2;
    const ringCount = 6;
    
    for (let i = 0; i < ringCount; i++) {
      const idx = Math.floor((i / ringCount) * freq.length);
      const v = (freq[idx] ?? 0) / 255;
      this.ctx.strokeStyle = this.pick(colors, 1 + i);
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (Math.min(w, h) * 0.12) * (i + 1) * (0.8 + v * 0.6), 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  renderLissajous(wave, colors, opacity) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const scale = Math.min(w, h) * 0.35;
    this.ctx.strokeStyle = this.pick(colors, 2);
    this.ctx.globalAlpha = opacity * 0.85;
    this.ctx.beginPath();
    
    const len = wave.length;
    for (let i = 0; i < len; i++) {
      const a = wave[i] - 128;
      const b = wave[(i + (len >> 2)) % len] - 128;
      const x = cx + (a / 128) * scale * 0.8;
      const y = cy + (b / 128) * scale * 0.8;
      if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  renderSnake(freq, wave, rms, colors, layer) {
    const w = this.width, h = this.height;
    const gridSize = 32;
    const cols = Math.floor(w / gridSize), rows = Math.floor(h / gridSize);
    const time = this.frameTime * 0.001;
    
    // Grid lines
    this.ctx.strokeStyle = this.pick(colors, 0);
    this.ctx.globalAlpha = 0.15;
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * gridSize, 0);
      this.ctx.lineTo(x * gridSize, h);
      this.ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * gridSize);
      this.ctx.lineTo(w, y * gridSize);
      this.ctx.stroke();
    }
    
    // Light up squares
    const maxActive = Math.min(50, Math.floor(rms * cols * rows * 0.4));
    for (let i = 0; i < maxActive; i++) {
      const col = Math.floor(Math.random() * cols);
      const row = Math.floor(Math.random() * rows);
      const freqIndex = Math.floor(((row * cols + col) / (cols * rows)) * freq.length);
      const intensity = (freq[freqIndex] ?? 0) / 255;
      
      if (intensity > 0.05 || (rms > 0.1 && Math.random() < 0.3)) {
        const x = col * gridSize, y = row * gridSize;
        const size = gridSize * (0.7 + intensity * 0.3);
        const offset = (gridSize - size) / 2;
        const colorIndex = 1 + ((col + row + Math.floor(intensity * 10)) % (colors.length - 1));
        this.ctx.fillStyle = this.pick(colors, colorIndex);
        this.ctx.globalAlpha = layer.opacity * (0.6 + intensity * 0.4);
        this.ctx.fillRect(x + offset, y + offset, size, size);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  renderGrid(freq, rms, colors, layer) {
    const w = this.width, h = this.height;
    const gridSize = 24;
    const cols = Math.floor(w / gridSize), rows = Math.floor(h / gridSize);
    const time = this.frameTime * 0.001;
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const freqIndex = Math.floor(((row * cols + col) / (cols * rows)) * freq.length);
        const intensity = (freq[freqIndex] ?? 0) / 255;
        
        const shouldFlash = rms > 0.15 && (
          intensity > 0.2 || (rms > 0.3 && Math.random() < 0.4) || (time * 4 + row + col) % 1 < 0.1
        );
        
        if (shouldFlash) {
          const x = col * gridSize, y = row * gridSize;
          const colorIndex = 1 + ((col + row + Math.floor(intensity * 5)) % (colors.length - 1));
          this.ctx.fillStyle = this.pick(colors, colorIndex);
          this.ctx.globalAlpha = layer.opacity * (0.8 + intensity * 0.2);
          this.ctx.fillRect(x, y, gridSize, gridSize);
        }
      }
    }
    this.ctx.globalAlpha = 1;
  }

  renderRadar(wave, colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5, radius = Math.min(w, h) * 0.45;
    this.ctx.strokeStyle = this.pick(colors, 3);
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    
    const time = this.frameTime * 0.001;
    const angle = (time % (Math.PI * 2));
    const sweep = Math.PI / 12;
    
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.arc(cx, cy, radius, angle - sweep, angle + sweep);
    this.ctx.closePath();
    this.ctx.fillStyle = this.pick(colors, 3);
    this.ctx.globalAlpha = 0.3;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  renderCityEq(freq, colors) {
    const w = this.width, h = this.height;
    const N = 72, step = Math.floor(freq.length / N) || 1, colW = w / N;
    
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freq[i * step + j] || 0;
      const v = sum / (step * 255);
      const hgt = v * (h * 0.8);
      const bw = Math.max(2, colW * 0.6);
      const x = i * colW + (colW - bw) / 2;
      this.ctx.fillStyle = this.pick(colors, 1 + (i % (colors.length - 1)));
      this.ctx.fillRect(x, h - hgt, bw, hgt);
    }
  }

  renderLedMatrix(freq, colors) {
    const w = this.width, h = this.height;
    const cols = 64, rows = 36;
    const cw = w / cols, rh = h / rows;
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = Math.floor(((y * cols + x) / (cols * rows)) * freq.length);
        const v = (freq[idx] ?? 0) / 255;
        if (v < 0.1) continue;
        this.ctx.fillStyle = this.pick(colors, 1 + ((x + y) % (colors.length - 1)));
        const s = Math.min(cw, rh) * v * 0.9;
        this.ctx.beginPath();
        this.ctx.arc(x * cw + cw / 2, y * rh + rh / 2, s / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  renderBlob(freq, colors, opacity) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const base = Math.min(w, h) * 0.28;
    this.ctx.fillStyle = this.pick(colors, 2);
    this.ctx.globalAlpha = opacity * 0.75;
    this.ctx.beginPath();
    const N = 180, step = Math.floor(freq.length / N) || 1;
    
    for (let i = 0; i <= N; i++) {
      const v = (freq[i * step] ?? 0) / 255;
      const r = base * (1 + v * 0.6);
      const a = (i / N) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  renderSmokeAdvanced(freq, colors) {
    const w = this.width, h = this.height;
    const ctx = this.ctx;
    const time = this.frameTime * 0.001;
    const cacheKey = 'smoke_offscreen';

    // Audio reactivity
    const bass = (freq[2] || 0) / 255;
    const mids = (freq[32] || 0) / 255;
    const highs = (freq[96] || 0) / 255;

    // Two palette colors to blend smoke between
    const c1Hex = this.pick(colors, 1);
    const c2Hex = this.pick(colors, 3);
    const c1r = parseInt(c1Hex.slice(1, 3), 16), c1g = parseInt(c1Hex.slice(3, 5), 16), c1b = parseInt(c1Hex.slice(5, 7), 16);
    const c2r = parseInt(c2Hex.slice(1, 3), 16), c2g = parseInt(c2Hex.slice(3, 5), 16), c2b = parseInt(c2Hex.slice(5, 7), 16);

    // Maintain offscreen cache
    if (!this.layerCache.has(cacheKey)) {
      const scaleDown = 4; // render at quarter res for performance
      const ow = Math.max(160, Math.floor(w / scaleDown));
      const oh = Math.max(90, Math.floor(h / scaleDown));
      const off = createCanvas(ow, oh);
      const octx = off.getContext('2d');
      this.layerCache.set(cacheKey, { off, octx, frame: 0, ow, oh });
    }

    const cache = this.layerCache.get(cacheKey);
    cache.frame++;

    // Compute parameters
    const density = 0.55 + bass * 0.45;
    const baseScale = 0.008 + mids * 0.004;
    const flow = time * (0.5 + bass * 1.2);
    const swirlX = 0.8 + highs * 1.2;
    const swirlY = 0.6 + highs * 1.0;

    const octx = cache.octx;
    const ow = cache.ow;
    const oh = cache.oh;

    // Update offscreen pixels every 2 frames for performance
    if ((cache.frame % 2) === 0) {
      const imgData = octx.createImageData(ow, oh);
      const data = imgData.data;

      // Noise functions
      const seed = Math.sin(time * 0.15) * 10000;
      const hash = (x, y) => {
        const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
        return s - Math.floor(s);
      };
      const noise = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const n00 = hash(xi, yi), n10 = hash(xi + 1, yi), n01 = hash(xi, yi + 1), n11 = hash(xi + 1, yi + 1);
        const nx0 = n00 * (1 - u) + n10 * u;
        const nx1 = n01 * (1 - u) + n11 * u;
        return nx0 * (1 - v) + nx1 * v;
      };
      const fbm = (x, y) => {
        let value = 0, amp = 0.5, f = 1.0;
        for (let i = 0; i < 3; i++) {
          value += amp * noise(x * f, y * f);
          f *= 2.0;
          amp *= 0.5;
        }
        return value;
      };

      let idx = 0;
      for (let y = 0; y < oh; y++) {
        const yy = (y + Math.cos((y + flow * 60) * 0.01) * (8 * swirlY));
        for (let x = 0; x < ow; x++) {
          const xx = (x + Math.sin((x - flow * 50) * 0.01) * (10 * swirlX));
          const n = fbm(xx * baseScale, yy * baseScale);
          const v = Math.pow(n, 1.35) * (0.7 + mids * 0.5);
          const t = Math.min(1, Math.max(0, v));
          const r = Math.floor(c1r * (1 - t) + c2r * t);
          const g = Math.floor(c1g * (1 - t) + c2g * t);
          const b = Math.floor(c1b * (1 - t) + c2b * t);
          const a = Math.floor(255 * density);
          data[idx++] = r; data[idx++] = g; data[idx++] = b; data[idx++] = a;
        }
      }
      octx.putImageData(imgData, 0, 0);
    }

    // Draw scaled with high quality smoothing and blur
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Note: Canvas in Node.js doesn't support filter property, so we skip the blur
    // The noise algorithm itself provides smooth edges
    ctx.drawImage(cache.off, 0, 0, w, h);
    
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  renderSpiral(freq, colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const maxRadius = Math.max(w, h) * 0.6;
    const time = this.frameTime * 0.001;

    this.ctx.lineWidth = 4;
    for (let spiral = 0; spiral < 3; spiral++) {
      this.ctx.strokeStyle = this.pick(colors, spiral % colors.length);
      this.ctx.beginPath();
      for (let t = 0; t < Math.PI * 12; t += 0.08) {
        const radius = (t / (Math.PI * 12)) * maxRadius;
        const angle = t + time * 2 + (spiral * Math.PI * 2) / 3;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (t === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }
  }

  renderGeometricShapes(freq, colors, rms) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const time = this.frameTime * 0.001;
    
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(time * 0.5);
    
    const shapes = ['triangle', 'square', 'pentagon', 'hexagon', 'triangle', 'square'];
    const maxRadius = Math.max(w, h) * 0.4;
    
    for (let layerNum = 0; layerNum < 3; layerNum++) {
      for (let i = 0; i < 6; i++) {
        const radius = (maxRadius / 3) * (layerNum + 1) + Math.sin(time * 2 + i + layerNum) * 30;
        const angle = (i / 6) * Math.PI * 2 + time + layerNum * Math.PI / 3;
        const x = Math.cos(angle) * (maxRadius * 0.7);
        const y = Math.sin(angle) * (maxRadius * 0.7);
        
        this.ctx.fillStyle = this.pick(colors, (i + layerNum) % colors.length);
        this.ctx.globalAlpha = 0.9 - layerNum * 0.2;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(time * (1 + i * 0.5 + layerNum * 0.3));
        this.ctx.beginPath();
        
        if (shapes[i] === 'triangle') {
          this.ctx.moveTo(0, -radius);
          this.ctx.lineTo(-radius * 0.866, radius * 0.5);
          this.ctx.lineTo(radius * 0.866, radius * 0.5);
        } else if (shapes[i] === 'square') {
          this.ctx.rect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
        } else if (shapes[i] === 'pentagon') {
          for (let j = 0; j < 5; j++) {
            const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
            if (j === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
          }
        } else {
          for (let j = 0; j < 6; j++) {
            const a = (j / 6) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
            if (j === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
          }
        }
        
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
      }
    }
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  renderSpinningCubes(colors) {
    const w = this.width, h = this.height;
    const time = this.frameTime * 0.001;
    
    const positions = [
      { x: w * 0.3, y: h * 0.3 },
      { x: w * 0.7, y: h * 0.3 },
      { x: w * 0.3, y: h * 0.7 },
      { x: w * 0.7, y: h * 0.7 }
    ];
    
    const cubeSize = Math.min(w, h) * 0.3;
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    const faces = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,3,7,4],[1,2,6,5]];
    
    positions.forEach((pos, cubeIndex) => {
      const cx = pos.x, cy = pos.y;
      const rotX = time * 0.3 + cubeIndex * Math.PI * 0.5;
      const rotY = time * 0.5 + cubeIndex * Math.PI * 0.25;
      
      const rotateY = (p, angle) => {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return [p[0] * cos + p[2] * sin, p[1], -p[0] * sin + p[2] * cos];
      };
      const rotateX = (p, angle) => {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return [p[0], p[1] * cos - p[2] * sin, p[1] * sin + p[2] * cos];
      };
      const project = (p) => {
        const perspective = 500 / (500 + p[2] * cubeSize);
        return [cx + p[0] * cubeSize * perspective, cy + p[1] * cubeSize * perspective, p[2]];
      };
      
      const transformed = vertices.map(v => project(rotateX(rotateY(v, rotY), rotX)));
      const facesWithDepth = faces.map((face, i) => ({
        face, i, depth: face.reduce((sum, vi) => sum + transformed[vi][2], 0) / face.length
      }));
      facesWithDepth.sort((a, b) => a.depth - b.depth);
      
      facesWithDepth.forEach(({ face, i }) => {
        const fv = face.map(vi => transformed[vi]);
        const v1 = [fv[1][0] - fv[0][0], fv[1][1] - fv[0][1]];
        const v2 = [fv[2][0] - fv[0][0], fv[2][1] - fv[0][1]];
        if (v1[0] * v2[1] - v1[1] * v2[0] > 0) {
          this.ctx.fillStyle = this.pick(colors, (i + cubeIndex) % colors.length);
          this.ctx.beginPath();
          this.ctx.moveTo(fv[0][0], fv[0][1]);
          fv.forEach(v => this.ctx.lineTo(v[0], v[1]));
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.strokeStyle = "#000";
          this.ctx.lineWidth = 2;
          this.ctx.globalAlpha = 0.8;
          this.ctx.stroke();
          this.ctx.globalAlpha = 1;
        }
      });
    });
  }

  renderMandala(colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const maxRadius = Math.max(w, h) * 0.7;
    const time = this.frameTime * 0.001;
    
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(time * 0.3);
    
    for (let ring = 0; ring < 12; ring++) {
      const radius = (ring + 1) * (maxRadius / 12);
      const petals = 6 + ring * 3;
      const angleStep = (Math.PI * 2) / petals;
      
      for (let i = 0; i < petals; i++) {
        const angle = i * angleStep + time * 0.5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        this.ctx.fillStyle = this.pick(colors, (ring + i) % colors.length);
        this.ctx.globalAlpha = 0.9 - ring * 0.05;
        this.ctx.beginPath();
        this.ctx.arc(x, y, maxRadius * 0.08 * (1 - ring * 0.05), 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  renderKaleidoscope(colors) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const maxRadius = Math.max(w, h) * 0.8;
    const time = this.frameTime * 0.001;
    
    this.ctx.save();
    this.ctx.translate(cx, cy);
    
    const segments = 12;
    for (let seg = 0; seg < segments; seg++) {
      this.ctx.save();
      this.ctx.rotate((seg / segments) * Math.PI * 2);
      
      for (let i = 0; i < 30; i++) {
        const radius = (i / 30) * maxRadius;
        const angle = time * 2 + i * 0.3;
        const x = Math.cos(angle) * radius * 0.9;
        const y = Math.sin(angle) * radius * 0.9;
        this.ctx.fillStyle = this.pick(colors, i % colors.length);
        this.ctx.globalAlpha = 1 - radius / maxRadius * 0.5;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 12 + Math.sin(time * 3 + i) * 6, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  renderSpaceTunnel(colors, layer) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const cacheKey = `stars_${layer.id || 'default'}`;
    
    if (!this.layerCache.has(cacheKey)) {
      const stars = [];
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
          z: Math.random() * 2 + 0.1,
          size: Math.random() * 3 + 1,
          speed: Math.random() * 2 + 1,
          color: this.pick(colors, Math.floor(Math.random() * colors.length))
        });
      }
      this.layerCache.set(cacheKey, stars);
    }
    
    const stars = this.layerCache.get(cacheKey);
    stars.forEach(star => {
      star.z -= star.speed * 0.016;
      if (star.z <= 0.1) {
        star.x = (Math.random() - 0.5) * 2;
        star.y = (Math.random() - 0.5) * 2;
        star.z = 2.1;
        star.color = this.pick(colors, Math.floor(Math.random() * colors.length));
      }
      
      const perspective = 1 / star.z;
      const sx = cx + (star.x * perspective) * (w * 0.8);
      const sy = cy + (star.y * perspective) * (h * 0.8);
      const size = star.size * perspective;
      
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h && size > 0.5) {
        this.ctx.fillStyle = star.color;
        this.ctx.globalAlpha = perspective;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, size, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });
    this.ctx.globalAlpha = 1;
  }

  renderWarpSpeed(colors, layer) {
    const w = this.width, h = this.height;
    const cx = w * 0.5, cy = h * 0.5;
    const cacheKey = `warp_${layer.id || 'default'}`;
    
    if (!this.layerCache.has(cacheKey)) {
      const lines = [];
      for (let i = 0; i < 80; i++) {
        lines.push({
          angle: (i / 80) * Math.PI * 2,
          radius: Math.random() * 0.8 + 0.1,
          z: Math.random() * 3 + 0.1,
          speed: Math.random() * 8 + 4,
          width: Math.random() * 2 + 1,
          color: this.pick(colors, Math.floor(Math.random() * colors.length))
        });
      }
      this.layerCache.set(cacheKey, lines);
    }
    
    const lines = this.layerCache.get(cacheKey);
    lines.forEach(line => {
      line.z -= line.speed * 0.016;
      if (line.z <= 0.1) {
        line.angle = Math.random() * Math.PI * 2;
        line.radius = Math.random() * 0.8 + 0.1;
        line.z = 3.1;
        line.color = this.pick(colors, Math.floor(Math.random() * colors.length));
      }
      
      const perspective = 1 / line.z;
      const cr = line.radius * perspective;
      const sx = cx + Math.cos(line.angle) * cr * (w * 0.4);
      const sy = cy + Math.sin(line.angle) * cr * (h * 0.4);
      
      if (perspective * line.width > 0.5) {
        this.ctx.strokeStyle = line.color;
        this.ctx.lineWidth = line.width * perspective;
        this.ctx.globalAlpha = perspective * 2;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(sx, sy);
        this.ctx.stroke();
      }
    });
    this.ctx.globalAlpha = 1;
  }

  renderRain(colors, layer) {
    const w = this.width, h = this.height;
    const cacheKey = `rain_${layer.id || 'default'}`;
    
    if (!this.layerCache.has(cacheKey)) {
      const drops = [];
      for (let i = 0; i < 300; i++) {
        drops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          speed: Math.random() * 200 + 100,
          length: Math.random() * 20 + 10,
          thickness: Math.random() * 2 + 0.5,
          color: this.pick(colors, Math.floor(Math.random() * colors.length))
        });
      }
      this.layerCache.set(cacheKey, drops);
    }
    
    const drops = this.layerCache.get(cacheKey);
    drops.forEach(drop => {
      drop.y += drop.speed * 0.016;
      if (drop.y > h) {
        drop.x = Math.random() * w;
        drop.y = -drop.length;
        drop.color = this.pick(colors, Math.floor(Math.random() * colors.length));
      }
      
      this.ctx.strokeStyle = drop.color;
      this.ctx.lineWidth = drop.thickness;
      this.ctx.globalAlpha = 0.9;
      this.ctx.beginPath();
      this.ctx.moveTo(drop.x, drop.y);
      this.ctx.lineTo(drop.x, drop.y + drop.length);
      this.ctx.stroke();
    });
    this.ctx.globalAlpha = 1;
  }

  renderSnowfall(colors, layer) {
    const w = this.width, h = this.height;
    const time = this.frameTime * 0.001;
    const cacheKey = `snow_${layer.id || 'default'}`;
    
    if (!this.layerCache.has(cacheKey)) {
      const flakes = [];
      for (let i = 0; i < 150; i++) {
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          speed: Math.random() * 50 + 20,
          size: Math.random() * 4 + 2,
          drift: Math.random() * 20 - 10,
          color: this.pick(colors, Math.floor(Math.random() * colors.length))
        });
      }
      this.layerCache.set(cacheKey, flakes);
    }
    
    const flakes = this.layerCache.get(cacheKey);
    flakes.forEach(flake => {
      flake.y += flake.speed * 0.016;
      flake.x += Math.sin(time + flake.y * 0.01) * flake.drift * 0.016;
      
      if (flake.y > h) {
        flake.x = Math.random() * w;
        flake.y = -flake.size;
        flake.color = this.pick(colors, Math.floor(Math.random() * colors.length));
      }
      
      this.ctx.fillStyle = flake.color;
      this.ctx.globalAlpha = 0.6;
      this.ctx.beginPath();
      this.ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }

  async saveFrame(framePath) {
    const buffer = this.canvas.toBuffer('image/png');
    await require('fs-extra').writeFile(framePath, buffer);
  }

  getBuffer() {
    return this.canvas.toBuffer('image/png');
  }
}

module.exports = VisualRenderer;

