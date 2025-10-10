const express = require("express");
const multer = require("multer");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs-extra");
const path = require("path");

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Check if FFmpeg is available
const isFFmpegAvailable = () => {
  try {
    const { execSync } = require("child_process");
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};

// Configure multer for file uploads
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is a video
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed!"), false);
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ffmpegAvailable: isFFmpegAvailable(),
    environment: process.env.NODE_ENV || "development"
  });
});

// Convert WebM to MP4 endpoint
app.post("/convert", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file provided" });
    }

    // Check if FFmpeg is available
    if (!isFFmpegAvailable()) {
      return res.status(503).json({
        error: "Video processing temporarily unavailable",
        message: "FFmpeg is not available in this environment. Please use a different hosting solution or contact support.",
        suggestion: "Try deploying to Railway, DigitalOcean, or AWS EC2 for full FFmpeg support."
      });
    }

    const ffmpeg = require("fluent-ffmpeg");
    const outputFileName = `${uuidv4()}.mp4`;
    
    console.log(`Converting ${req.file.originalname} to MP4...`);

    // Convert video using FFmpeg with memory streams
    const convertedBuffer = await new Promise((resolve, reject) => {
      const buffers = [];
      
      ffmpeg()
        .input(req.file.buffer)
        .inputFormat(req.file.mimetype.split("/")[1])
        .outputOptions([
          "-c:v libx264",        // Use H.264 codec for video
          "-c:a aac",           // Use AAC codec for audio
          "-preset fast",       // Encoding speed vs compression tradeoff
          "-crf 23",           // Constant rate factor (quality)
          "-movflags +faststart" // Optimize for web streaming
        ])
        .format("mp4")
        .on("start", (commandLine) => {
          console.log("FFmpeg process started:", commandLine);
        })
        .on("progress", (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on("end", () => {
          console.log("Conversion completed");
          resolve(Buffer.concat(buffers));
        })
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          reject(err);
        })
        .pipe()
        .on("data", (chunk) => {
          buffers.push(chunk);
        });
    });

    // Return the converted file directly
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${outputFileName}"`);
    res.setHeader("Content-Length", convertedBuffer.length);
    
    res.json({
      success: true,
      message: "Video converted successfully",
      downloadUrl: `/download/${outputFileName}`,
      originalName: req.file.originalname,
      convertedName: outputFileName,
      fileSize: convertedBuffer.length,
      note: "File returned directly in response"
    });

  } catch (error) {
    console.error("Conversion error:", error);
    
    res.status(500).json({
      error: "Conversion failed",
      message: error.message,
      suggestion: "Try using a different hosting platform that supports FFmpeg, such as Railway or DigitalOcean."
    });
  }
});

// Download endpoint (placeholder since we return files directly)
app.get("/download/:filename", (req, res) => {
  res.status(404).json({
    error: "File not found",
    message: "Files are returned directly in the conversion response"
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 500MB." });
    }
  }
  
  res.status(500).json({ 
    error: "Internal server error",
    message: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Video Encoding API running on port ${PORT}`);
    console.log(`🔧 FFmpeg available: ${isFFmpegAvailable()}`);
    console.log(`
📋 Available endpoints:`);
    console.log(`   POST /convert - Upload and convert video`);
    console.log(`   GET /download/:filename - Download converted file`);
    console.log(`   GET /health - Health check`);
    console.log(`
⚠️  Note: FFmpeg must be installed on the system!`);
  });
}
