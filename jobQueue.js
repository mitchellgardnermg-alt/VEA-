/**
 * Simple in-memory job queue for render jobs
 */
class JobQueue {
  constructor(maxConcurrent = 2) {
    this.jobs = new Map(); // jobId -> job data
    this.queue = []; // Array of jobIds waiting to process
    this.processing = new Set(); // Set of jobIds currently processing
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a new job to the queue
   */
  addJob(jobId, jobData) {
    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      ...jobData
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    
    console.log(`Job ${jobId} added to queue. Queue length: ${this.queue.length}`);
    
    // Try to process queue
    this.processQueue();
    
    return job;
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Update job status
   */
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(jobId, job);
    }
  }

  /**
   * Process the queue
   */
  async processQueue() {
    // Check if we can process more jobs
    if (this.processing.size >= this.maxConcurrent) {
      console.log(`Max concurrent jobs (${this.maxConcurrent}) reached. Waiting...`);
      return;
    }

    // Get next job from queue
    if (this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);
    
    if (!job) {
      console.error(`Job ${jobId} not found in jobs map`);
      return;
    }

    // Mark as processing
    this.processing.add(jobId);
    job.status = 'processing';
    job.startedAt = Date.now();
    
    console.log(`Starting job ${jobId}. Processing: ${this.processing.size}/${this.maxConcurrent}`);
    
    // The actual rendering will be done by the caller
    // This just manages the queue state
  }

  /**
   * Mark job as complete
   */
  completeJob(jobId, result) {
    this.processing.delete(jobId);
    
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
      job.result = result;
    }
    
    console.log(`Job ${jobId} completed. Processing: ${this.processing.size}/${this.maxConcurrent}`);
    
    // Aggressive memory cleanup after each job
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 3000) { // 3GB threshold
      console.log(`Memory cleanup after job completion: ${Math.round(heapUsedMB)}MB`);
      this.aggressiveCleanup();
      
      // Force GC after cleanup
      if (global.gc) {
        global.gc();
        console.log('Post-job GC triggered');
      }
    }
    
    // Process next job in queue
    this.processQueue();
  }

  /**
   * Mark job as failed
   */
  failJob(jobId, error) {
    this.processing.delete(jobId);
    
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = Date.now();
    }
    
    console.log(`Job ${jobId} failed: ${error}`);
    
    // Memory cleanup after failed job too
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 3000) { // 3GB threshold
      console.log(`Memory cleanup after job failure: ${Math.round(heapUsedMB)}MB`);
      this.aggressiveCleanup();
      
      // Force GC after cleanup
      if (global.gc) {
        global.gc();
        console.log('Post-failure GC triggered');
      }
    }
    
    // Process next job in queue
    this.processQueue();
  }

  /**
   * Clean up old jobs (> 1 hour)
   */
  cleanupOldJobs() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt < oneHourAgo) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old jobs`);
    }
  }

  /**
   * Aggressive cleanup - remove all completed/failed jobs
   */
  aggressiveCleanup() {
    let cleaned = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }
    
    console.log(`Aggressive cleanup: removed ${cleaned} completed/failed jobs`);
    return cleaned;
  }

  /**
   * Get memory usage with warnings
   */
  getMemoryStatsWithWarnings() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    
    const stats = {
      heapUsed: Math.round(heapUsedMB) + 'MB',
      heapTotal: Math.round(heapTotalMB) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
      usagePercent: Math.round((heapUsedMB / heapTotalMB) * 100) + '%'
    };
    
    // Add warnings
    if (heapUsedMB > 4000) {
      stats.warning = `HIGH MEMORY: ${stats.heapUsed}`;
    }
    if (heapUsedMB > 5120) {
      stats.critical = `CRITICAL MEMORY: ${stats.heapUsed}`;
    }
    
    return stats;
  }

  /**
   * Aggressive memory cleanup - clear everything possible
   */
  aggressiveMemoryCleanup() {
    const beforeMem = process.memoryUsage();
    const beforeMB = Math.round(beforeMem.heapUsed / 1024 / 1024);
    
    console.log(`🧹 Starting aggressive memory cleanup - Before: ${beforeMB}MB`);
    
    // 1. Clear all completed/failed jobs
    this.aggressiveCleanup();
    
    // 2. Clear module cache (but keep essential modules)
    const essentialModules = ['fs', 'path', 'crypto', 'util', 'events', 'stream'];
    for (const moduleId in require.cache) {
      if (!essentialModules.some(essential => moduleId.includes(essential))) {
        delete require.cache[moduleId];
      }
    }
    
    // 3. Clear any global variables that might be holding references
    if (global.gc) {
      // Force multiple GC cycles
      for (let i = 0; i < 5; i++) {
        global.gc();
      }
    }
    
    // 4. Clear process.nextTick queue (if possible)
    if (process._getActiveHandles) {
      const handles = process._getActiveHandles();
      console.log(`Active handles: ${handles.length}`);
    }
    
    // 5. Clear any timers that might be holding references
    // (We can't clear our own timers, but we can clear others)
    
    const afterMem = process.memoryUsage();
    const afterMB = Math.round(afterMem.heapUsed / 1024 / 1024);
    const savedMB = beforeMB - afterMB;
    
    console.log(`🧹 Aggressive cleanup complete - After: ${afterMB}MB (Saved: ${savedMB}MB)`);
    
    return {
      before: beforeMB + 'MB',
      after: afterMB + 'MB',
      saved: savedMB + 'MB'
    };
  }

  /**
   * Clear all unused memory immediately
   */
  clearUnusedMemory() {
    console.log('🧹 Clearing unused memory...');
    
    // Clear completed jobs
    this.aggressiveCleanup();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
      console.log('✅ Garbage collection triggered');
    }
    
    // Clear any temporary variables
    if (typeof global !== 'undefined') {
      // Clear any global temp variables
      Object.keys(global).forEach(key => {
        if (key.startsWith('temp_') || key.startsWith('cache_')) {
          delete global[key];
        }
      });
    }
    
    console.log('✅ Unused memory cleared');
  }

  /**
   * Complete render isolation for Vixa Studios
   * Ensures each render is completely isolated and cleaned up
   */
  completeRenderIsolation(jobId) {
    console.log(`🎬 VIXA STUDIOS: Complete render isolation for job ${jobId}`);
    
    const beforeMem = process.memoryUsage();
    const beforeMB = Math.round(beforeMem.heapUsed / 1024 / 1024);
    
    // 1. Remove job completely from queue
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.delete(jobId);
      this.processing.delete(jobId);
      
      // Remove from queue if still there
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex !== -1) {
        this.queue.splice(queueIndex, 1);
      }
    }
    
    // 2. Clear any job-related global variables
    if (typeof global !== 'undefined') {
      Object.keys(global).forEach(key => {
        if (key.includes(jobId) || key.startsWith('render_')) {
          delete global[key];
        }
      });
    }
    
    // 3. Force multiple garbage collection cycles
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
    
    // 4. Clear any temporary render data
    if (global.renderCache) {
      global.renderCache.clear();
    }
    
    const afterMem = process.memoryUsage();
    const afterMB = Math.round(afterMem.heapUsed / 1024 / 1024);
    const savedMB = beforeMB - afterMB;
    
    console.log(`🎬 VIXA STUDIOS: Render isolation complete - Saved ${savedMB}MB (${beforeMB}MB → ${afterMB}MB)`);
    
    return {
      jobId: jobId,
      before: beforeMB + 'MB',
      after: afterMB + 'MB',
      saved: savedMB + 'MB',
      isolated: true
    };
  }

  /**
   * Pre-render isolation - prepare clean environment
   */
  preRenderIsolation(jobId) {
    console.log(`🎬 VIXA STUDIOS: Pre-render isolation for job ${jobId}`);
    
    // Clear any previous render data
    this.clearUnusedMemory();
    
    // Create isolated render session
    global[`render_session_${jobId}`] = {
      startTime: Date.now(),
      jobId: jobId,
      isolated: true
    };
    
    console.log(`🎬 VIXA STUDIOS: Render session ${jobId} isolated and ready`);
  }

  /**
   * Get queue stats
   */
  getStats() {
    return {
      total: this.jobs.size,
      queued: this.queue.length,
      processing: this.processing.size,
      completed: Array.from(this.jobs.values()).filter(j => j.status === 'completed').length,
      failed: Array.from(this.jobs.values()).filter(j => j.status === 'failed').length,
      maxConcurrent: this.maxConcurrent,
      availableSlots: Math.max(0, this.maxConcurrent - this.processing.size)
    };
  }

  /**
   * Get memory usage stats
   */
  getMemoryStats() {
    const used = process.memoryUsage();
    return {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(used.rss / 1024 / 1024) + 'MB',
      external: Math.round(used.external / 1024 / 1024) + 'MB'
    };
  }

  /**
   * Check if system can handle more jobs
   * For Vixa Studios - mostly unlimited, but with memory safety net
   */
  canAcceptJob() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    // Emergency brake: reject if memory > 6GB (80% of 8GB limit)
    if (heapUsedMB > 6144) {
      console.warn(`🚨 EMERGENCY: Rejecting job - memory at ${Math.round(heapUsedMB)}MB`);
      return false;
    }
    
    // Warning threshold: accept but warn if > 4GB
    if (heapUsedMB > 4096) {
      console.warn(`⚠️ HIGH MEMORY: Accepting job but memory at ${Math.round(heapUsedMB)}MB`);
    }
    
    // For Vixa Studios - accept jobs but with memory monitoring
    return true;
  }
}

// Singleton instance
const jobQueue = new JobQueue(10); // Max 10 concurrent renders

// Aggressive memory management intervals
setInterval(() => {
  jobQueue.cleanupOldJobs();
  console.log('Job cleanup complete. Memory:', jobQueue.getMemoryStats());
}, 3 * 60 * 1000); // Every 3 minutes

// Deep memory cleanup every 2 minutes
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  
  if (heapUsedMB > 2000) { // 2GB threshold
    console.log('🧹 Triggering deep memory cleanup...');
    jobQueue.clearUnusedMemory();
  }
}, 2 * 60 * 1000); // Every 2 minutes

// Force garbage collection every 30 seconds
setInterval(() => {
  if (global.gc) {
    global.gc();
    const memStats = jobQueue.getMemoryStats();
    console.log('GC triggered. Memory:', memStats);
    
    // Warn if memory is still high after GC
    const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
    if (heapUsedMB > 4000) { // 4GB threshold
      console.warn(`⚠️ HIGH MEMORY USAGE: ${Math.round(heapUsedMB)}MB after GC`);
    }
  }
}, 30 * 1000); // Every 30 seconds

// Emergency memory cleanup every 10 seconds
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  
  // Emergency cleanup if memory > 5GB
  if (heapUsedMB > 5120) {
    console.warn(`🚨 EMERGENCY: Memory at ${Math.round(heapUsedMB)}MB - forcing aggressive cleanup`);
    
    // Clear all completed jobs immediately
    for (const [jobId, job] of jobQueue.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        jobQueue.jobs.delete(jobId);
      }
    }
    
    // Force multiple GC cycles
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
    
    console.log('Emergency cleanup complete. Memory:', jobQueue.getMemoryStats());
  }
}, 10 * 1000); // Every 10 seconds

// Memory leak detection - track memory growth over time
let memoryHistory = [];
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  
  // Keep last 20 readings (2 minutes)
  memoryHistory.push({
    timestamp: Date.now(),
    heapUsedMB: heapUsedMB
  });
  
  if (memoryHistory.length > 20) {
    memoryHistory.shift();
  }
  
  // Detect memory leak if memory keeps growing
  if (memoryHistory.length >= 10) {
    const first = memoryHistory[0].heapUsedMB;
    const last = memoryHistory[memoryHistory.length - 1].heapUsedMB;
    const growth = last - first;
    
    // If memory grew by more than 500MB in 1 minute, potential leak
    if (growth > 500) {
      console.warn(`🚨 POTENTIAL MEMORY LEAK: Memory grew by ${Math.round(growth)}MB in 1 minute`);
      console.warn(`Memory history: ${memoryHistory.map(m => Math.round(m.heapUsedMB)).join(', ')}MB`);
      
      // Trigger aggressive cleanup
      jobQueue.aggressiveMemoryCleanup();
      
      // Clear history after cleanup
      memoryHistory = [];
    }
  }
}, 6 * 1000); // Every 6 seconds

module.exports = jobQueue;










