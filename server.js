require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS ----
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

// ---- Configuration ----
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

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
if (!REPLICATE_API_TOKEN) {
  console.warn('⚠️ REPLICATE_API_TOKEN is missing – no fallback for video.');
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

  const sanitisedMessage = (message || '').trim().slice(0, 4000);

  const historyMessages = (history || [])
    .slice(-15)
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

**INSTRUCTIONS FOR YOU:**
- Detect the user's language and reply in that same language (English, Pidgin, Yoruba, Igbo, Hausa, etc.).
- Always be encouraging, helpful, and slightly playful.
- Keep responses concise but informative (2-4 short paragraphs). You can provide longer explanations for complex topics.
- Always end with an uplifting note.
- If a user asks about a specific task, give clear, accurate details (rewards, limits, how to complete).
- If the user shares their balance or task count, use that to give personalized advice.
- When generating code, use clear formatting and explain it step by step.

Now, assist the user with their questions about EarnSphere!`;

  const hasImage = image && image.startsWith('data:image');
  let payload;

  if (hasImage) {
    const visionModel = 'llama-3.2-11b-vision-preview';
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
      max_tokens: 800,
      top_p: 0.9,
      tool_choice: 'none'
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
      max_tokens: 800,
      top_p: 0.9,
      tool_choice: 'none'
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
// PAYSTACK ENDPOINTS
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
// IMAGE GENERATION (Pollinations.ai)
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
// VIDEO GENERATION (Hugging Face + Replicate fallback)
// ============================================================
const VIDEO_MODELS = [
  'damo-vilab/text-to-video-ms-1.7b',
  'ali-vilab/text-to-video-ms-1.7b',
  'ModelScope/text-to-video-synthesis'
];

async function generateVideoHuggingFace(prompt) {
  for (const model of VIDEO_MODELS) {
    const url = `https://api-inference.huggingface.co/models/${model}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          console.error(`Hugging Face API error (${model}):`, error);
          if (response.status === 503 && attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          if (response.status === 404) break;
          throw new Error(error.error || 'Video generation failed');
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:video/mp4;base64,${base64}`;
      } catch (e) {
        if (e.name === 'AbortError') continue;
        console.error(`Error with model ${model}:`, e);
        break;
      }
    }
  }
  return null;
}

async function generateVideoReplicate(prompt) {
  if (!REPLICATE_API_TOKEN) return null;
  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'stability-ai/stable-video-diffusion',
        input: { prompt, frames: 14 }
      })
    });
    const prediction = await response.json();
    if (!response.ok) throw new Error(prediction.error || 'Replicate failed');

    // Poll for completion
    let url = prediction.urls.get;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const poll = await fetch(url);
      const status = await poll.json();
      if (status.status === 'succeeded') {
        const videoUrl = status.output;
        const videoResp = await fetch(videoUrl);
        const buffer = await videoResp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:video/mp4;base64,${base64}`;
      } else if (status.status === 'failed') {
        throw new Error('Replicate generation failed');
      }
    }
    throw new Error('Timeout waiting for Replicate');
  } catch (e) {
    console.error('Replicate error:', e);
    return null;
  }
}

app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const sanitisedPrompt = prompt.trim().slice(0, 500);

  // 1. Try Hugging Face
  if (HUGGINGFACE_API_KEY) {
    try {
      const result = await generateVideoHuggingFace(sanitisedPrompt);
      if (result) {
        return res.json({ status: true, url: result, prompt: sanitisedPrompt });
      }
    } catch (e) {
      console.error('Hugging Face video error:', e);
    }
  }

  // 2. Fallback to Replicate
  if (REPLICATE_API_TOKEN) {
    try {
      const result = await generateVideoReplicate(sanitisedPrompt);
      if (result) {
        return res.json({ status: true, url: result, prompt: sanitisedPrompt });
      }
    } catch (e) {
      console.error('Replicate video error:', e);
    }
  }

  // 3. All failed
  res.status(503).json({ 
    error: 'Video generation service unavailable. Please try again later or check your API keys.'
  });
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
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
  console.log(`🖼️ Image gen: http://localhost:${PORT}/api/generate-image`);
  console.log(`🎬 Video gen: http://localhost:${PORT}/api/generate-video`);
  console.log(`🌐 Fetch: http://localhost:${PORT}/api/fetch`);
});