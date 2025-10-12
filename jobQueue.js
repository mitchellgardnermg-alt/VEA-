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
    
    // Process next job in queue
    this.processQueue();
  }

  /**
   * Clean up old jobs (> 1 hour)
   */
  cleanupOldJobs() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt < oneHourAgo) {
        this.jobs.delete(jobId);
        console.log(`Cleaned up old job: ${jobId}`);
      }
    }
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
   * For Vixa Studios - no limits, always accepts jobs
   */
  canAcceptJob() {
    // No limits for Vixa Studios - always accept jobs
    // System will scale as needed
    return true;
  }
}

// Singleton instance
const jobQueue = new JobQueue(10); // Max 10 concurrent renders

// Clean up old jobs every 5 minutes (more aggressive)
setInterval(() => {
  jobQueue.cleanupOldJobs();
  console.log('Job cleanup complete. Memory:', jobQueue.getMemoryStats());
}, 5 * 60 * 1000);

// Manual garbage collection every 2 minutes if available
setInterval(() => {
  if (global.gc) {
    global.gc();
    console.log('Manual garbage collection triggered. Memory:', jobQueue.getMemoryStats());
  }
}, 2 * 60 * 1000);

module.exports = jobQueue;







