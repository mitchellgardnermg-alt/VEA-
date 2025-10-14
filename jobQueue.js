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

module.exports = jobQueue;








