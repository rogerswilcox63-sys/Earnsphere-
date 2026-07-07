require('dotenv').config();
const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/sphere-ai', async (req, res) => {
  try {
    const prompt = (req.body.prompt || '').trim();

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash'
    });

    const result = await model.generateContent(
      `You are SphereAI, a helpful assistant for EarnSphere. Reply clearly and briefly.

User: ${prompt}`
    );

    const response = await result.response;
    const reply = response.text().trim();

    res.json({ reply });
  } catch (error) {
    console.error('SphereAI error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});