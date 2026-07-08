// =============================================
// config-template.js - SAFE TO COMMIT
// =============================================
// 
// Instructions:
// 1. Copy this file and rename it to config.js
// 2. Replace the placeholder with your real DeepSeek API key
// 3. Never commit the real config.js file
//
// This template is safe to upload to GitHub

const CONFIG = {
  // Only DeepSeek API key for AI chat feature
  DEEPSEEK_API_KEY: "your_deepseek_api_key_here"
};

// Make it available globally for dashboard.html
window.CONFIG = CONFIG;

Object.freeze(CONFIG);

console.log('%c[Config] Template loaded. Please create config.js with your real key.', 'color:#f59e0b');
