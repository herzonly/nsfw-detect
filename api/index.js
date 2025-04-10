const nsfwjs = require('nsfwjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const octokit = new Octokit({
  auth: "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"
});

let model = null;
let isModelLoaded = false;

async function loadModel() {
  try {
    require('@tensorflow/tfjs-node');

    model = await nsfwjs.load();
    
    isModelLoaded = true;
    console.log("NSFW detection model loaded successfully");
    return true;
  } catch (error) {
    console.error("Failed to load NSFW detection model:", error);
    return false;
  }
}

function isNSFW(predictions) {
  const nsfwThreshold = 0.7;
  const nsfwCategories = ['Porn', 'Sexy', 'Hentai'];
  
  for (const prediction of predictions) {
    if (nsfwCategories.includes(prediction.className) && prediction.probability > nsfwThreshold) {
      return true;
    }
  }
  
  return false;
}

async function uploadResultToGitHub(result) {
  try {
    const content = Buffer.from(JSON.stringify(result, null, 2)).toString('base64');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tmp/result-${timestamp}.json`;

    await octokit.repos.createOrUpdateFileContents({
      owner: 'herzonly',
      repo: 'dbcds',
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

async function checkBuffer(buffer, filename) {
  if (!isModelLoaded) {
    throw new Error("Model not loaded yet");
  }

  try {
    const image = await loadImage(buffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const predictions = await model.classify(canvas);
    
    const result = {
      fileName: filename,
      predictions: predictions,
      nsfw: isNSFW(predictions)
    };
    
    if (result.nsfw) {
      await uploadResultToGitHub(result);
    }
    
    return result;
  } catch (error) {
    console.error(`Error analyzing image ${filename}:`, error);
    throw error;
  }
}

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html" ))
});

app.post('/api/check-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    await loadModel();
    const result = await checkBuffer(req.file.buffer, req.file.originalname);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api', (req, res) => {
  res.json({ message: "NSFW Detector API is running" });
});

module.exports = app;
