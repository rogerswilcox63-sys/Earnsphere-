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
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing!');
  process.exit(1);
}
if (!PAYSTACK_SECRET) {
  console.warn('⚠️ PAYSTACK_SECRET is missing. Paystack endpoints will not work.');
}
if (!RUNWAY_API_KEY) {
  console.warn('⚠️ RUNWAY_API_KEY is missing. Video generation will not work.');
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

**SPECIAL FEATURE – IMAGE & VIDEO GENERATION:**
- If a user asks you to generate an image, respond with exactly this format: [IMAGE: the user's prompt]
- If a user asks you to generate a video, respond with exactly this format: [VIDEO: the user's prompt]
- Do not add any extra text before or after the tag.
- The prompt should be a concise description (max 100 characters).
- Example: User says "Generate an image of a dog" → you reply with "[IMAGE: a dog]"
- Example: User says "Make a video of a car driving" → you reply with "[VIDEO: a car driving]"
- If the user asks for something vague, ask them for a clearer description.

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
// VIDEO GENERATION (RunwayML API – corrected endpoints)
// ============================================================
app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  if (!RUNWAY_API_KEY) {
    return res.status(503).json({ error: 'Runway API key not configured. Please set RUNWAY_API_KEY.' });
  }

  const sanitisedPrompt = prompt.trim().slice(0, 500);

  try {
    // 1. Submit the video generation job (correct endpoint)
    const submitRes = await fetch('https://api.runwayml.com/v1/generate/text_to_video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: sanitisedPrompt,
        duration: 5, // seconds (minimum)
        aspect_ratio: '16:9'
      })
    });

    const job = await submitRes.json();
    if (!submitRes.ok) {
      console.error('Runway submit error:', job);
      return res.status(submitRes.status).json({
        error: job.error || 'Failed to start video generation.'
      });
    }

    const jobId = job.id; // or job.task_id? The API returns an id.

    // 2. Poll for completion (correct status endpoint)
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 60; // 3 minutes max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds

      const statusRes = await fetch(`https://api.runwayml.com/v1/generations/${jobId}`, {
        headers: { 'Authorization': `Bearer ${RUNWAY_API_KEY}` }
      });

      const status = await statusRes.json();

      if (status.status === 'completed') {
        videoUrl = status.output;
        break;
      } else if (status.status === 'failed') {
        throw new Error(status.error || 'Video generation failed');
      }

      attempts++;
    }

    if (!videoUrl) {
      throw new Error('Timeout waiting for video generation. Please try again.');
    }

    // 3. Fetch the video and convert to base64
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) throw new Error('Failed to download generated video');

    const buffer = await videoResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataURL = `data:video/mp4;base64,${base64}`;

    res.json({
      status: true,
      url: dataURL,
      prompt: sanitisedPrompt
    });

  } catch (error) {
    console.error('Runway video error:', error);
    res.status(500).json({
      error: error.message || 'Video generation failed. Please try again.'
    });
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
  console.log(`🏦 Banks: http://localhost:${PORT}/api/banks`);
  console.log(`🏦 Resolve: http://localhost:${PORT}/api/resolve-account`);
  console.log(`🖼️ Image gen: http://localhost:${PORT}/api/generate-image`);
  console.log(`🎬 Video gen: http://localhost:${PORT}/api/generate-video`);
  console.log(`🌐 Fetch: http://localhost:${PORT}/api/fetch`);
});