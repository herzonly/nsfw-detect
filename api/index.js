const nsfwjs = require('nsfwjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const app = express();
const port = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

class NSFWDetector {
  constructor() {
    this.model = null;
    this.isLoaded = false;
  }

  async load() {
    try {
      this.model = await nsfwjs.load();
      this.isLoaded = true;
      console.log("NSFW detection model loaded successfully");
      return true;
    } catch (error) {
      console.error("Failed to load NSFW detection model:", error);
      return false;
    }
  }

  async checkBuffer(buffer, filename) {
    if (!this.isLoaded) {
      throw new Error("Model not loaded yet");
    }

    try {
      const image = await loadImage(buffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      
      const predictions = await this.model.classify(canvas);
      
      const result = {
        fileName: filename,
        predictions: predictions,
        nsfw: this.isNSFW(predictions)
      };
      
      await this.uploadResultToGitHub(result);
      
      return result;
    } catch (error) {
      console.error(`Error analyzing image ${filename}:`, error);
      throw error;
    }
  }

  async uploadResultToGitHub(result) {
    try {
      const content = Buffer.from(JSON.stringify(result, null, 2)).toString('base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `result-${timestamp}.json`;

      await octokit.repos.createOrUpdateFileContents({
        owner: 'dbcds',
        repo: 'tmp',
        path: filename,
        message: `NSFW detection result for ${result.fileName}`,
        content: content,
        committer: {
          name: 'NSFW Detector',
          email: 'noreply@example.com'
        }
      });

      console.log(`Result uploaded to GitHub: ${filename}`);
    } catch (error) {
      console.error('Error uploading to GitHub:', error);
    }
  }

  isNSFW(predictions) {
    const nsfwThreshold = 0.7;
    const nsfwCategories = ['Porn', 'Sexy', 'Hentai'];
    
    for (const prediction of predictions) {
      if (nsfwCategories.includes(prediction.className) && prediction.probability > nsfwThreshold) {
        return true;
      }
    }
    
    return false;
  }
}

const detector = new NSFWDetector();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '/public/index.html'));
});

app.post('/api/check-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    const result = await detector.checkBuffer(req.file.buffer, req.file.originalname);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-folder', async (req, res) => {
  return res.status(400).json({ error: 'Folder checking not supported in read-only environment' });
});

async function startServer() {
  const modelLoaded = await detector.load();
  
  if (modelLoaded) {
    app.listen(port, () => {
      console.log(`NSFW Detector server running at http://localhost:${port}`);
    });
  } else {
    console.error("Failed to load NSFW model. Server not started.");
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = NSFWDetector;
