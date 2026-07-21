// ============================================================
// EARNSPHERE AI BACKEND – Secure Grok API Proxy
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS configuration ----
const allowedOrigins = (process.env.FRONTEND_URLS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
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
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_API_KEY = process.env.GROK_API_KEY;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15000;

if (!GROK_API_KEY) {
  console.error('❌ GROK_API_KEY is missing in .env file!');
  process.exit(1);
}

console.log('✅ API key loaded successfully.');

// ---- Health check ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Main Grok proxy endpoint ----
app.post('/api/grok', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required and must be non‑empty.' });
  }

  const sanitisedMessage = message.trim().slice(0, 2000);

  const payload = {
    model: 'grok-4.5',
    messages: [
      {
        role: 'system',
        content: `You are SphereAI, a friendly, motivational Nigerian assistant for EarnSphere Hub. 
You speak in a mix of English and Nigerian Pidgin English. You are encouraging, helpful, and slightly playful. 
You help users with questions about earning money online, tasks, surveys, withdrawals, and daily motivation. 
Keep responses concise (max 2-3 short paragraphs). Always end with an uplifting note.`
      },
      { role: 'user', content: sanitisedMessage }
    ],
    temperature: 0.8,
    max_tokens: 300,
    top_p: 0.9
  };

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { /* ignore */ }

        console.error(`Grok API error (${response.status}):`, errorJson || errorText);

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        return res.status(response.status).json({
          error: errorJson?.error?.message || `API error ${response.status}`
        });
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content ||
                    data.reply ||
                    data.response ||
                    "I no understand o, but I dey try!";

      return res.json({ reply });

    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        console.error('Request timed out.');
        return res.status(504).json({ error: 'AI service took too long. Please try again.' });
      }

      if (attempt === MAX_RETRIES) {
        console.error('All retry attempts failed:', error.message);
        return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again later.' });
      }

      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Retry ${attempt + 1}/${MAX_RETRIES} after ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
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

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`🚀 EarnSphere AI backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Grok proxy: http://localhost:${PORT}/api/grok`);
});