const express = require('express');
const multer = require('multer');
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
let model;

(async () => {
  model = await nsfw.load(); // load default model
})();

app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const imageBuffer = fs.readFileSync(req.file.path);
  const image = tf.node.decodeImage(imageBuffer, 3);
  const predictions = await model.classify(image);
  image.dispose();
  fs.unlinkSync(req.file.path);

  res.json(predictions);
});

app.listen(port, () => {
  console.log(`NSFW Detector running at http://localhost:${port}`);
});
