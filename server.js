require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // npm i node-fetch@2

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS ----
const allowedOrigins = ['https://earnspherehub.name.ng', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// ---- Configuration ----
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET; // ADD THIS TO RENDER ENV
const PAYSTACK_URL = 'https://api.paystack.co';

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing in environment!');
  process.exit(1);
}

if (!PAYSTACK_SECRET) {
  console.warn('⚠️ PAYSTACK_SECRET is missing. Paystack endpoints will not work!');
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---- Health check ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Main AI endpoint ----
app.post('/api/grok', async (req, res) => {
  const { message, history, image } = req.body;

  if (!message && !image) {
    return res.status(400).json({ error: 'Message or image is required.' });
  }

  const sanitisedMessage = (message || '').trim().slice(0, 2000);

  // Build conversation history (last 10 messages)
  const historyMessages = (history || [])
    .slice(-10)
    .map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text || ''
    }));

  // ---- Multilingual system prompt ----
  const systemMessage = `You are SphereAI, a friendly, motivational Nigerian assistant for EarnSphere Hub.

You are fluent in multiple languages:
- English
- Nigerian Pidgin
- Yoruba
- Igbo
- Hausa
- and other Nigerian languages.

**Important instructions:**
1. Detect the language the user wrote in and reply in that same language.
2. If the user writes in English, you can mix in a bit of Pidgin for friendliness, but keep it mostly English.
3. If the user writes in Pidgin, reply in Pidgin.
4. If the user writes in Yoruba, Igbo, or Hausa, reply in that language.
5. Always be encouraging, helpful, and slightly playful.
6. Keep responses concise (2-3 short paragraphs).
7. Always end with an uplifting note.

You help users with:
- Earning money online
- Completing tasks and surveys
- Withdrawals
- Daily motivation
- General questions about EarnSphere`;

  // ---- Determine if we have an image (vision) ----
  const hasImage = image && image.startsWith('data:image');

  let payload;

  if (hasImage) {
    // Use vision model
    const visionModel = 'llama-3.2-90b-vision-preview';
    const content = [
      { type: 'text', text: systemMessage + '\n\nUser: ' + sanitisedMessage },
      { type: 'image_url', image_url: { url: image } }
    ];

    payload = {
      model: visionModel,
      messages: [
        ...historyMessages,
        { role: 'user', content: content }
      ],
      temperature: 0.8,
      max_tokens: 500,
      top_p: 0.9
    };
  } else {
    // ---- Use the NEW recommended text model ----
    const textModel = 'openai/gpt-oss-120b';
    payload = {
      model: textModel,
      messages: [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: sanitisedMessage || 'Hello!' }
      ],
      temperature: 0.8,
      max_tokens: 300,
      top_p: 0.9
    };
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq API error:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Groq API error'
      });
    }

    const reply = data.choices?.[0]?.message?.content || 'I no get response o, but I dey try!';
    res.json({ reply });

  } catch (error) {
    console.error('Internal error:', error);
    res.status(500).json({ error: 'AI service temporarily unavailable.' });
  }
});

// ==================================================
// =============== PAYSTACK ENDPOINTS ===============
// ==================================================

// 1. GET ALL NIGERIAN BANKS
app.get('/api/banks', async (req, res) => {
  try {
    const response = await fetch(`${PAYSTACK_URL}/bank`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
    });
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ status: false, message: data.message });
    }
    
    // Sort A-Z
    data.data.sort((a,b) => a.name.localeCompare(b.name));
    res.json({ status: true, data: data.data });
    
  } catch (error) {
    console.error('Paystack Banks Error:', error);
    res.status(500).json({ status: false, message: 'Failed to fetch banks' });
  }
});

// 2. RESOLVE ACCOUNT NAME
app.get('/api/resolve-account', async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({ status: false, message: 'Account number and bank code are required' });
  }
  if (account_number.length !== 10) {
    return res.status(400).json({ status: false, message: 'Account number must be 10 digits' });
  }

  try {
    const response = await fetch(`${PAYSTACK_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
    });
    const data = await response.json();
    
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Paystack Resolve Error:', error);
    res.status(500).json({ status: false, message: 'Could not verify account' });
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
  console.log(`🚀 EarnSphere backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Groq proxy: http://localhost:${PORT}/api/grok`);
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
});