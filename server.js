require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS ----
const allowedOrigins = (process.env.FRONTEND_URLS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

// ---- Configuration ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is missing in .env file!');
  process.exit(1);
}

// Use gemini-1.0-pro (more widely available)
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent';

// ---- Health check ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Main AI endpoint ----
app.post('/api/grok', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required and must be non‑empty.' });
  }

  const sanitisedMessage = message.trim().slice(0, 2000);

  // System instruction (personality)
  const systemInstruction = `
You are SphereAI, a friendly, motivational Nigerian assistant for EarnSphere Hub. 
You speak in a mix of English and Nigerian Pidgin English. You are encouraging, helpful, and slightly playful. 
You help users with questions about earning money online, tasks, surveys, withdrawals, and daily motivation. 
Keep responses concise (max 2-3 short paragraphs). Always end with an uplifting note.
`;

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        parts: [{ text: sanitisedMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 300,
      topP: 0.9,
    }
  };

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY   // new key format
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini API error'
      });
    }

    // Extract the reply
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ||
                  'I no get response o, but I dey try!';

    res.json({ reply });

  } catch (error) {
    console.error('Internal error:', error);
    res.status(500).json({ error: 'AI service temporarily unavailable.' });
  }
});

// ---- 404 & error handlers ----
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 EarnSphere AI backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Gemini proxy: http://localhost:${PORT}/api/grok`);
});