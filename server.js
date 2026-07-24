require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS ----
const allowedOrigins = [
  'https://earnspherehub.name.ng',
  'http://localhost:3000'   // remove for production
];

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
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing!');
  process.exit(1);
}
if (!PAYSTACK_SECRET) {
  console.warn('⚠️ PAYSTACK_SECRET is missing. Paystack endpoints will not work.');
}
if (!HUGGINGFACE_API_KEY) {
  console.warn('⚠️ HUGGINGFACE_API_KEY is missing. Video generation will not work.');
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PAYSTACK_URL = 'https://api.paystack.co';

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// AI CHAT ENDPOINT (Groq)
// ============================================================
app.post('/api/grok', async (req, res) => {
  const { message, history, image } = req.body;

  if (!message && !image) {
    return res.status(400).json({ error: 'Message or image is required.' });
  }

  const sanitisedMessage = (message || '').trim().slice(0, 2000);

  const historyMessages = (history || [])
    .slice(-10)
    .map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text || ''
    }));

  const systemMessage = `You are SphereAI, a friendly, motivational Nigerian assistant for EarnSphere Hub.
You are fluent in multiple languages: English, Nigerian Pidgin, Yoruba, Igbo, Hausa, and others.
Detect the user's language and reply in that same language.
Always be encouraging, helpful, and slightly playful. Keep responses concise (2-3 paragraphs). End with an uplifting note.`;

  const hasImage = image && image.startsWith('data:image');
  let payload;

  if (hasImage) {
    const visionModel = 'llama-3.2-90b-vision-preview';
    payload = {
      model: visionModel,
      messages: [
        ...historyMessages,
        { role: 'user', content: [
          { type: 'text', text: systemMessage + '\n\nUser: ' + sanitisedMessage },
          { type: 'image_url', image_url: { url: image } }
        ]}
      ],
      temperature: 0.8,
      max_tokens: 500,
      top_p: 0.9
    };
  } else {
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
      return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
    }

    const reply = data.choices?.[0]?.message?.content || 'I no get response o, but I dey try!';
    res.json({ reply });
  } catch (error) {
    console.error('Internal error:', error);
    res.status(500).json({ error: 'AI service temporarily unavailable.' });
  }
});

// ============================================================
// PAYSTACK: GET NIGERIAN BANKS
// ============================================================
app.get('/api/banks', async (req, res) => {
  if (!PAYSTACK_SECRET) {
    return res.status(503).json({ status: false, message: 'Paystack not configured.' });
  }
  try {
    const response = await fetch(`${PAYSTACK_URL}/bank`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ status: false, message: data.message });
    }
    data.data.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ status: true, data: data.data });
  } catch (error) {
    console.error('Paystack Banks Error:', error);
    res.status(500).json({ status: false, message: 'Failed to fetch banks' });
  }
});

// ============================================================
// PAYSTACK: RESOLVE ACCOUNT
// ============================================================
app.get('/api/resolve-account', async (req, res) => {
  const { account_number, bank_code } = req.query;
  if (!account_number || !bank_code) {
    return res.status(400).json({ status: false, message: 'Account number and bank code are required' });
  }
  if (account_number.length !== 10) {
    return res.status(400).json({ status: false, message: 'Account number must be 10 digits' });
  }
  if (!PAYSTACK_SECRET) {
    return res.status(503).json({ status: false, message: 'Paystack not configured.' });
  }

  try {
    const response = await fetch(
      `${PAYSTACK_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Paystack Resolve Error:', error);
    res.status(500).json({ status: false, message: 'Could not verify account' });
  }
});

// ============================================================
// IMAGE GENERATION (Pollinations.ai – free, no key)
// ============================================================
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const sanitisedPrompt = prompt.trim().slice(0, 500);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(sanitisedPrompt)}?width=512&height=512`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image generation failed');
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataURL = `data:image/png;base64,${base64}`;
    res.json({ status: true, url: dataURL, prompt: sanitisedPrompt });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Image generation failed.' });
  }
});

// ============================================================
// VIDEO GENERATION (Hugging Face – needs API key)
// ============================================================
app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  if (!HUGGINGFACE_API_KEY) {
    return res.status(503).json({ error: 'Video generation is not configured. Please set HUGGINGFACE_API_KEY.' });
  }

  const sanitisedPrompt = prompt.trim().slice(0, 500);

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: sanitisedPrompt })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Hugging Face API error:', error);
      return res.status(response.status).json({
        error: error.error || 'Video generation failed'
      });
    }

    // Convert video to base64
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataURL = `data:video/mp4;base64,${base64}`;

    res.json({
      status: true,
      url: dataURL,
      prompt: sanitisedPrompt
    });

  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: 'Video generation service unavailable.' });
  }
});

// ============================================================
// 404 & ERROR HANDLERS
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 EarnSphere backend running on port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log(`🤖 AI: http://localhost:${PORT}/api/grok`);
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
  console.log(`🖼️ Image gen: http://localhost:${PORT}/api/generate-image`);
  console.log(`🎬 Video gen: http://localhost:${PORT}/api/generate-video`);
});