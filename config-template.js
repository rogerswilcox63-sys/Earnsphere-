// config-template.js - ✅ SAFE TO UPLOAD TO GITHUB!
// Copy this file to config.js and add your REAL API keys
// config.js is ignored by .gitignore, so your keys stay safe!

const CONFIG = {
    // ============================================
    // FIREBASE CONFIG (Get from Firebase Console)
    // ============================================
    FIREBASE_API_KEY: 'YOUR_FIREBASE_API_KEY_HERE',
    FIREBASE_AUTH_DOMAIN: 'YOUR_FIREBASE_AUTH_DOMAIN_HERE',
    FIREBASE_PROJECT_ID: 'YOUR_FIREBASE_PROJECT_ID_HERE',
    FIREBASE_STORAGE_BUCKET: 'YOUR_FIREBASE_STORAGE_BUCKET_HERE',
    FIREBASE_MESSAGING_SENDER_ID: 'YOUR_FIREBASE_MESSAGING_SENDER_ID_HERE',
    FIREBASE_APP_ID: 'YOUR_FIREBASE_APP_ID_HERE',
    FIREBASE_MEASUREMENT_ID: 'YOUR_FIREBASE_MEASUREMENT_ID_HERE',

    // ============================================
    // EMAILJS CONFIG (Get from EmailJS Dashboard)
    // ============================================
    EMAILJS_USER_ID: 'YOUR_EMAILJS_USER_ID_HERE',
    EMAILJS_SERVICE_ID: 'YOUR_EMAILJS_SERVICE_ID_HERE',
    EMAILJS_TEMPLATE_ID: 'YOUR_EMAILJS_TEMPLATE_ID_HERE',

    // ============================================
    // TELEGRAM CONFIG (Get from @BotFather)
    // ============================================
    TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',
    TELEGRAM_CHAT_ID: 'YOUR_TELEGRAM_CHAT_ID_HERE'
};

// ============================================
// DON'T CHANGE ANYTHING BELOW THIS LINE
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}