require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'https://earnspherehub.name.ng',
  'http://localhost:3000'
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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing!');
  process.exit(1);
}
if (!PAYSTACK_SECRET) {
  console.warn('⚠️ PAYSTACK_SECRET is missing. Paystack endpoints will not work.');
}

const groq = new Groq({ apiKey: GROQ_API_KEY });
const PAYSTACK_URL = 'https://api.paystack.co';

// ✅ CORRECT: Only vision-capable models
const MODELS = {
  'llama-4-scout': 'llama-4-scout-17b-16e',        // Vision + 1M context
  'llama-4-maverick': 'llama-4-maverick-17b-128e', // Vision + 128K context
  'llama-3.2-11b': 'llama-3.2-11b-vision-preview', // Vision
  'llama-3.2-90b': 'llama-3.2-90b-vision-preview', // Vision
  'llama-3.3-70b': 'llama-3.3-70b-versatile',      // TEXT ONLY!
  'mixtral-8x7b': 'mixtral-8x7b-32768'             // TEXT ONLY!
};

const VISION_MODELS = ['llama-4-scout', 'llama-4-maverick', 'llama-3.2-11b', 'llama-3.2-90b'];
const DEFAULT_MODEL = 'llama-4-maverick';

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    provider: 'Groq',
    available_models: Object.keys(MODELS),
    vision_models: VISION_MODELS
  });
});

// ============================================================
// AI CHAT ENDPOINT (Groq with Vision)
// ============================================================
app.post('/api/grok', async (req, res) => {
  const { message, history, image, model } = req.body;

  if (!message && !image) {
    return res.status(400).json({ error: 'Message or image is required.' });
  }

  const sanitisedMessage = (message || '').trim().slice(0, 4000);
  
  // Select model - MUST be vision-capable if image is provided
  let selectedModel = DEFAULT_MODEL;
  
  // If image is provided, force a vision model
  const hasImage = image && image.startsWith('data:image');
  
  if (hasImage) {
    // Automatically switch to vision model if user selected text-only
    if (model && !VISION_MODELS.includes(model)) {
      console.warn(`⚠️ ${model} doesn't support vision. Switching to ${DEFAULT_MODEL}`);
      selectedModel = DEFAULT_MODEL;
    } else if (model && VISION_MODELS.includes(model)) {
      selectedModel = model;
    } else {
      selectedModel = DEFAULT_MODEL;
    }
  } else {
    // No image - use whatever model user selected
    if (model && MODELS[model]) {
      selectedModel = model;
    } else if (model) {
      console.warn(`⚠️ Model ${model} not found, using ${DEFAULT_MODEL}`);
    }
  }

  const historyMessages = (history || [])
    .slice(-10)
    .map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text || ''
    }));

  const systemMessage = `You are SphereAI, a friendly, motivational Nigerian assistant for EarnSphere Hub.

**ABOUT EARNSPHERE:**
EarnSphere is a Nigerian rewards platform where users earn real money (₦) by completing tasks:
- Surveys: 2 per day, rewards ₦150–₦300 each.
- App Downloads: 1 per hour, rewards ₦350–₦400 each.
- Social Tasks (YouTube, TikTok, Instagram, Telegram, Twitter, Share): 1 per hour, rewards ₦150–₦300 each.
- Extra Tasks (Upload Picture, Daily Poll, Quick Quiz, Watch Ad): 1 per hour (combined), rewards ₦50–₦200 each.
- Daily Check-in Bonus: ₦100 per day.
- Coupons: ₦500–₦5,000 (single-use, first-come-first-served).
- Minimum Withdrawal: ₦20,000 via bank transfer (users must verify their bank account).

**KEY FACTS:**
- Users earn by completing tasks; tasks reset daily or hourly.
- The platform is secure; user data is stored in Firebase.
- The AI Assistant (you) can help users with any question about earning, tasks, withdrawals, and motivation.
- You can access external websites via the /api/fetch endpoint.

**SPECIAL FEATURE – IMAGE GENERATION:**
- If a user asks you to generate an image, respond with exactly this format: [IMAGE: the user's prompt]
- The prompt should be a concise description (max 100 characters).
- Do not add any extra text before or after the tag.

**THINKING PROCESS:**
- When you need to reason about a problem, show your thinking process inside [THINK:...] tags BEFORE giving your final answer.
- After the thinking, give your final answer as a separate paragraph.

**INSTRUCTIONS FOR YOU:**
- Detect the user's language and reply in that same language (English, Pidgin, Yoruba, Igbo, Hausa, etc.).
- Always be encouraging, helpful, and slightly playful.
- Always end with an uplifting note.

**CURRENT MODEL:** ${selectedModel}`;

  let payloadMessages = [
    { role: 'system', content: systemMessage },
    ...historyMessages
  ];

  // ✅ CORRECT: Proper Groq vision format
  if (hasImage) {
    // Vision models use a specific format
    const isVisionModel = VISION_MODELS.includes(selectedModel);
    
    if (!isVisionModel) {
      // Fallback - shouldn't happen since we force vision models above
      return res.status(400).json({ 
        error: `${selectedModel} doesn't support images. Please use a vision model.`,
        suggested_models: VISION_MODELS
      });
    }

    // For vision models, use the image_url format
    payloadMessages.push({
      role: 'user',
      content: [
        { type: 'text', text: sanitisedMessage || 'Analyze this image.' },
        { 
          type: 'image_url', 
          image_url: { 
            url: image,
            detail: 'auto' // Groq uses 'auto', 'low', or 'high'
          } 
        }
      ]
    });
  } else {
    payloadMessages.push({
      role: 'user',
      content: sanitisedMessage || 'Hello!'
    });
  }

  try {
    const isVisionModel = VISION_MODELS.includes(selectedModel);
    
    // Vision models can handle more tokens
    let maxTokens = isVisionModel ? 2048 : 1024;
    let temperature = 0.8;
    let topP = 0.9;

    const response = await groq.chat.completions.create({
      model: MODELS[selectedModel] || MODELS[DEFAULT_MODEL],
      messages: payloadMessages,
      temperature: temperature,
      max_tokens: maxTokens,
      top_p: topP,
    });

    const reply = response.choices?.[0]?.message?.content || 'I no get response o, but I dey try!';
    
    res.json({ 
      reply,
      model: selectedModel,
      model_version: response.model || MODELS[selectedModel],
      vision_capable: isVisionModel
    });
  } catch (error) {
    console.error('Groq Error:', error);
    
    // Handle specific error cases
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a moment.',
        retry_after: 60
      });
    }
    
    // If it's a vision error, suggest using a vision model
    if (error.message && error.message.includes('vision')) {
      return res.status(400).json({
        error: 'This model does not support images. Please use a vision-capable model.',
        suggested_models: VISION_MODELS
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'AI service temporarily unavailable.',
      code: error.code || 'unknown'
    });
  }
});

// ============================================================
// LIST AVAILABLE MODELS
// ============================================================
app.get('/api/models', (req, res) => {
  res.json({
    provider: 'Groq',
    models: Object.keys(MODELS),
    default: DEFAULT_MODEL,
    vision_models: VISION_MODELS,
    descriptions: {
      'llama-4-scout': 'Llama 4 Scout - ✅ Vision, 1M context, best for long documents + images',
      'llama-4-maverick': 'Llama 4 Maverick - ✅ Vision, 128K context, best overall',
      'llama-3.2-11b': 'Llama 3.2 11B - ✅ Vision, lightweight',
      'llama-3.2-90b': 'Llama 3.2 90B - ✅ Vision, most powerful',
      'llama-3.3-70b': 'Llama 3.3 70B - ❌ Text only',
      'mixtral-8x7b': 'Mixtral 8x7B - ❌ Text only'
    },
    free_tier: {
      requests_per_minute: 30,
      requests_per_day: 1000,
      tokens_per_minute: 6000
    }
  });
});

// ============================================================
// IMAGE GENERATION (FREE - Pollinations.ai)
// ============================================================
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }
  const sanitisedPrompt = prompt.trim().slice(0, 500);
  
  // Pollinations.ai - completely free, no API key needed
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
// PAYSTACK ENDPOINTS (unchanged)
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
// FETCH EXTERNAL SITE
// ============================================================
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are allowed.' });
    }
    const hostname = parsedUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
        hostname === '169.254.0.0' || hostname.endsWith('.local')) {
      return res.status(403).json({ error: 'Access to internal addresses is not allowed.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EarnSphere AI Assistant' },
      timeout: 10000
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `HTTP ${response.status}` });
    }
    const text = await response.text();
    const truncated = text.slice(0, 50000);
    res.json({ content: truncated });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch the URL.' });
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
  console.log(`📋 Models: http://localhost:${PORT}/api/models`);
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
  console.log(`🖼️ Image gen: http://localhost:${PORT}/api/generate-image`);
  console.log(`🌐 Fetch: http://localhost:${PORT}/api/fetch`);
  console.log(`📊 Available models: ${Object.keys(MODELS).join(', ')}`);
  console.log(`👁️ Vision models: ${VISION_MODELS.join(', ')}`);
  console.log(`📊 Groq free tier: 30 req/min, 1000 req/day`);
});