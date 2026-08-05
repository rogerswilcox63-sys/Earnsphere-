require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// SECURITY & MIDDLEWARE
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://image.pollinations.ai"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.paystack.co"]
    }
  }
}));

// CORS Configuration
const allowedOrigins = [
  'https://earnspherehub.name.ng',
  'https://earnspherehub.name.ng/',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://earnsphere-ai.onrender.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// SERVE STATIC FILES (if you want to serve HTML from same server)
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// RATE LIMITING
// ============================================================
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute (Groq free tier limit)
  message: {
    error: 'Too many requests, please try again in a moment.',
    retry_after: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to AI endpoints
app.use('/api/grok', limiter);
app.use('/api/generate-image', limiter);

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing!');
  console.error('Please add GROQ_API_KEY to your .env file');
  process.exit(1);
}

if (!PAYSTACK_SECRET) {
  console.warn('⚠️ PAYSTACK_SECRET is missing. Paystack endpoints will not work.');
}

// ============================================================
// MODEL CONFIGURATION
// ============================================================
// ✅ Vision-capable models
const VISION_MODELS = [
  'llama-3.2-11b-vision-preview',      // Llama 3.2 11B Vision
  'llama-3.2-90b-vision-preview',      // Llama 3.2 90B Vision
  'llama-4-scout-17b-16e',             // Llama 4 Scout (Vision + 1M context)
  'llama-4-maverick-17b-128e'          // Llama 4 Maverick (Vision + 128K context)
];

// Text-only models
const TEXT_MODELS = [
  'llama-3.3-70b-versatile',           // Llama 3.3 70B (Text only)
  'mixtral-8x7b-32768',                // Mixtral 8x7B (Text only)
  'gemma2-9b-it',                      // Gemma 2 9B (Text only)
  'llama-3.1-8b-instant'               // Llama 3.1 8B (Text only)
];

// User-friendly model names mapping
const MODEL_NAMES = {
  'llama-3.2-11b': 'llama-3.2-11b-vision-preview',
  'llama-3.2-90b': 'llama-3.2-90b-vision-preview',
  'llama-4-scout': 'llama-4-scout-17b-16e',
  'llama-4-maverick': 'llama-4-maverick-17b-128e',
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  'mixtral-8x7b': 'mixtral-8x7b-32768',
  'gemma-2-9b': 'gemma2-9b-it',
  'llama-3.1-8b': 'llama-3.1-8b-instant'
};

// Reverse mapping for display
const MODEL_DISPLAY_NAMES = {
  'llama-3.2-11b-vision-preview': 'llama-3.2-11b',
  'llama-3.2-90b-vision-preview': 'llama-3.2-90b',
  'llama-4-scout-17b-16e': 'llama-4-scout',
  'llama-4-maverick-17b-128e': 'llama-4-maverick',
  'llama-3.3-70b-versatile': 'llama-3.3-70b',
  'mixtral-8x7b-32768': 'mixtral-8x7b',
  'gemma2-9b-it': 'gemma-2-9b',
  'llama-3.1-8b-instant': 'llama-3.1-8b'
};

const DEFAULT_VISION_MODEL = 'llama-4-maverick-17b-128e';
const DEFAULT_TEXT_MODEL = 'llama-3.3-70b-versatile';

function getModelKey(modelName) {
  // If user passes a short name, map to full model ID
  if (modelName && MODEL_NAMES[modelName]) {
    return MODEL_NAMES[modelName];
  }
  // If user passes full model ID directly
  if (VISION_MODELS.includes(modelName) || TEXT_MODELS.includes(modelName)) {
    return modelName;
  }
  return null;
}

function isVisionModel(modelId) {
  return VISION_MODELS.includes(modelId);
}

function getModelDisplayName(modelId) {
  return MODEL_DISPLAY_NAMES[modelId] || modelId;
}

// ============================================================
// GROQ CLIENT
// ============================================================
const groq = new Groq({ apiKey: GROQ_API_KEY });
const PAYSTACK_URL = 'https://api.paystack.co';

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    provider: 'Groq',
    models: {
      vision: VISION_MODELS.map(id => ({
        id: id,
        displayName: getModelDisplayName(id)
      })),
      text: TEXT_MODELS.map(id => ({
        id: id,
        displayName: getModelDisplayName(id)
      }))
    },
    default_vision: DEFAULT_VISION_MODEL,
    default_text: DEFAULT_TEXT_MODEL,
    environment: process.env.NODE_ENV || 'development',
    rate_limits: {
      requests_per_minute: 30,
      requests_per_day: 1000,
      tokens_per_minute: 6000
    }
  });
});

// ============================================================
// LIST AVAILABLE MODELS
// ============================================================
app.get('/api/models', (req, res) => {
  res.json({
    provider: 'Groq',
    models: {
      vision: VISION_MODELS.map(id => ({
        id: id,
        displayName: getModelDisplayName(id),
        capabilities: ['text', 'vision'],
        context_length: id.includes('scout') ? '1M' : '128K'
      })),
      text: TEXT_MODELS.map(id => ({
        id: id,
        displayName: getModelDisplayName(id),
        capabilities: ['text'],
        context_length: '32K'
      }))
    },
    default_vision: DEFAULT_VISION_MODEL,
    default_text: DEFAULT_TEXT_MODEL,
    free_tier: {
      requests_per_minute: 30,
      requests_per_day: 1000,
      tokens_per_minute: 6000
    },
    usage_tips: {
      vision: 'Use vision models for image analysis and generation',
      text: 'Use text models for pure text conversations (faster, cheaper)',
      switching: 'Auto-switch to vision when images are attached'
    }
  });
});

// ============================================================
// AI CHAT ENDPOINT (FIXED)
// ============================================================
app.post('/api/grok', async (req, res) => {
  try {
    const { message, history, image, model } = req.body;

    if (!message && !image) {
      return res.status(400).json({ 
        error: 'Message or image is required.',
        help: 'Please provide either a message or an image to analyze.'
      });
    }

    const sanitisedMessage = (message || '').trim().slice(0, 4000);
    const hasImage = image && image.startsWith('data:image');
    
    // Determine which model to use
    let modelId = null;
    
    if (model) {
      const mappedModel = getModelKey(model);
      if (mappedModel) {
        if (hasImage && !isVisionModel(mappedModel)) {
          console.warn(`⚠️ ${model} doesn't support vision. Switching to ${DEFAULT_VISION_MODEL}`);
          modelId = DEFAULT_VISION_MODEL;
        } else if (!hasImage && isVisionModel(mappedModel)) {
          // Allow vision models for text-only queries too (they work fine)
          modelId = mappedModel;
        } else {
          modelId = mappedModel;
        }
      }
    }
    
    // If no model selected or invalid, use default
    if (!modelId) {
      modelId = hasImage ? DEFAULT_VISION_MODEL : DEFAULT_TEXT_MODEL;
    }

    // Build conversation history
    const historyMessages = (history || [])
      .slice(-10)
      .map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.text || ''
      }))
      .filter(h => h.content.trim());

    // System message
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

**IMPORTANT:**
- Users earn by completing tasks; tasks reset daily or hourly.
- The platform is secure; user data is stored in Firebase.
- You can help users with questions about earning, tasks, withdrawals, and motivation.

**IMAGE GENERATION:**
- If a user asks you to generate an image, respond with exactly: [IMAGE: the user's prompt]
- The prompt should be concise (max 100 characters).
- Do not add any extra text before or after the tag.

**THINKING PROCESS:**
- When reasoning about a problem, show your thinking inside [THINK:...] tags.
- After thinking, give your final answer as a separate paragraph.

**INSTRUCTIONS:**
- Detect the user's language and reply in that same language (English, Pidgin, Yoruba, Igbo, Hausa, etc.).
- Always be encouraging, helpful, and slightly playful.
- Always end with an uplifting note.

**CURRENT MODEL:** ${getModelDisplayName(modelId)}`;

    // Build messages array
    let payloadMessages = [
      { role: 'system', content: systemMessage },
      ...historyMessages
    ];

    // Add user message with proper vision format if needed
    if (hasImage) {
      if (!isVisionModel(modelId)) {
        return res.status(400).json({
          error: `${getModelDisplayName(modelId)} doesn't support images.`,
          suggested_models: VISION_MODELS.map(id => getModelDisplayName(id)),
          help: 'Please select a vision-capable model for image analysis.'
        });
      }

      payloadMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: sanitisedMessage || 'Analyze this image.' },
          { 
            type: 'image_url', 
            image_url: { 
              url: image,
              detail: 'auto'
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

    // Call Groq API
    const isVision = isVisionModel(modelId);
    const response = await groq.chat.completions.create({
      model: modelId,
      messages: payloadMessages,
      temperature: isVision ? 0.8 : 0.7,
      max_tokens: isVision ? 2048 : 1024,
      top_p: isVision ? 0.9 : 0.95,
    });

    const reply = response.choices?.[0]?.message?.content || 'I no get response o, but I dey try!';
    
    res.json({ 
      reply,
      model: getModelDisplayName(modelId),
      model_id: modelId,
      vision_capable: isVision,
      usage: response.usage || null
    });
    
  } catch (error) {
    console.error('Groq API Error:', error);
    
    // Handle specific error cases
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a moment.',
        retry_after: 60,
        free_tier: {
          requests_per_minute: 30,
          requests_per_day: 1000
        }
      });
    }
    
    if (error.status === 401) {
      return res.status(401).json({
        error: 'Invalid API key. Please check your GROQ_API_KEY.',
        help: 'Make sure your GROQ_API_KEY is set correctly in the .env file.'
      });
    }
    
    // If it's a vision error, suggest using a vision model
    if (error.message && error.message.toLowerCase().includes('vision')) {
      return res.status(400).json({
        error: 'This model does not support images.',
        suggested_models: VISION_MODELS.map(id => getModelDisplayName(id)),
        help: 'Please use a vision-capable model for image analysis.'
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'AI service temporarily unavailable.',
      code: error.code || 'unknown',
      help: 'Please try again later or contact support if the issue persists.'
    });
  }
});

// ============================================================
// IMAGE GENERATION (FREE - Pollinations.ai)
// ============================================================
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Prompt is required.',
      help: 'Please provide a description of the image you want to generate.'
    });
  }
  
  const sanitisedPrompt = prompt.trim().slice(0, 500);
  
  // Pollinations.ai - completely free, no API key needed
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(sanitisedPrompt)}?width=512&height=512&nologo=true`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EarnSphere AI Assistant'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`Image generation failed with status ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataURL = `data:image/png;base64,${base64}`;
    
    res.json({ 
      status: true, 
      url: dataURL, 
      prompt: sanitisedPrompt,
      provider: 'Pollinations.ai'
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ 
      error: 'Image generation failed.',
      details: error.message,
      help: 'Please try again with a different prompt.'
    });
  }
});

// ============================================================
// PAYSTACK ENDPOINTS
// ============================================================
app.get('/api/banks', async (req, res) => {
  if (!PAYSTACK_SECRET) {
    return res.status(503).json({ 
      status: false, 
      message: 'Paystack not configured.',
      help: 'Please set PAYSTACK_SECRET in your environment variables.'
    });
  }
  
  try {
    const response = await fetch(`${PAYSTACK_URL}/bank`, {
      headers: { 
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        status: false, 
        message: data.message || 'Failed to fetch banks'
      });
    }
    
    // Sort banks alphabetically
    data.data.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({ 
      status: true, 
      data: data.data,
      count: data.data.length
    });
  } catch (error) {
    console.error('Paystack Banks Error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Failed to fetch banks',
      details: error.message
    });
  }
});

app.get('/api/resolve-account', async (req, res) => {
  const { account_number, bank_code } = req.query;
  
  if (!account_number || !bank_code) {
    return res.status(400).json({ 
      status: false, 
      message: 'Account number and bank code are required' 
    });
  }
  
  if (account_number.length !== 10) {
    return res.status(400).json({ 
      status: false, 
      message: 'Account number must be 10 digits' 
    });
  }
  
  if (!PAYSTACK_SECRET) {
    return res.status(503).json({ 
      status: false, 
      message: 'Paystack not configured.' 
    });
  }

  try {
    const response = await fetch(
      `${PAYSTACK_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: { 
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Paystack Resolve Error:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Could not verify account',
      details: error.message
    });
  }
});

// ============================================================
// FETCH EXTERNAL SITE
// ============================================================
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ 
      error: 'URL is required.' 
    });
  }

  // Validate and sanitize URL
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ 
        error: 'Only HTTP/HTTPS URLs are allowed.' 
      });
    }
    
    // Block internal/private IPs for security
    const hostname = parsedUrl.hostname;
    const blockedHosts = [
      'localhost', '127.0.0.1', '::1',
      '192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
      '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '169.254.0.0', '0.0.0.0'
    ];
    
    if (blockedHosts.some(blocked => hostname.startsWith(blocked) || hostname === blocked)) {
      return res.status(403).json({ 
        error: 'Access to internal addresses is not allowed.' 
      });
    }
    
  } catch (e) {
    return res.status(400).json({ 
      error: 'Invalid URL format.',
      details: e.message
    });
  }

  try {
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'EarnSphere AI Assistant',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `HTTP ${response.status}: ${response.statusText}` 
      });
    }
    
    const text = await response.text();
    const truncated = text.slice(0, 50000);
    
    res.json({ 
      content: truncated,
      size: text.length,
      truncated: text.length > 50000,
      url: url,
      status: response.status
    });
    
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch the URL.',
      details: error.message
    });
  }
});

// ============================================================
// SERVE FRONTEND (if you want to serve HTML from same server)
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai-assistant.html'));
});

// ============================================================
// 404 & ERROR HANDLERS
// ============================================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available_endpoints: [
      '/health',
      '/api/models',
      '/api/grok',
      '/api/generate-image',
      '/api/banks',
      '/api/resolve-account',
      '/api/fetch'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    code: err.code || 'unknown'
  });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log('🚀 EarnSphere backend running successfully!');
  console.log('='.repeat(50));
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🔍 Health: http://localhost:${PORT}/health`);
  console.log(`🤖 AI Chat: http://localhost:${PORT}/api/grok`);
  console.log(`📋 Models: http://localhost:${PORT}/api/models`);
  console.log(`🖼️ Image Gen: http://localhost:${PORT}/api/generate-image`);
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
  console.log(`🌐 Fetch: http://localhost:${PORT}/api/fetch`);
  console.log('='.repeat(50));
  console.log('📊 Model Information:');
  console.log(`   Vision Models (${VISION_MODELS.length}):`);
  VISION_MODELS.forEach(id => {
    console.log(`     - ${getModelDisplayName(id)} (${id})`);
  });
  console.log(`   Text Models (${TEXT_MODELS.length}):`);
  TEXT_MODELS.forEach(id => {
    console.log(`     - ${getModelDisplayName(id)} (${id})`);
  });
  console.log('='.repeat(50));
  console.log(`🎯 Default Vision: ${getModelDisplayName(DEFAULT_VISION_MODEL)}`);
  console.log(`🎯 Default Text: ${getModelDisplayName(DEFAULT_TEXT_MODEL)}`);
  console.log('='.repeat(50));
  console.log('📊 Groq Free Tier Limits:');
  console.log('   - 30 requests per minute');
  console.log('   - 1000 requests per day');
  console.log('   - 6000 tokens per minute');
  console.log('='.repeat(50));
  console.log('✅ Server ready for connections!');
});