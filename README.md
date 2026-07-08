# EarnSphere Hub

A modern web application for earning and productivity tools.

## 🚀 Features

- Firebase Authentication & Database
- Email notifications via EmailJS
- Telegram bot integration
- AI-powered features using DeepSeek API

## 🛠️ Tech Stack

- Frontend: JavaScript / Vite (or React)
- Backend Services: Firebase
- AI: DeepSeek API
- Notifications: EmailJS + Telegram

## 📦 Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd earnspherehub
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configuration Setup (Important!)

This project uses a config system to keep sensitive keys safe.

#### Step A: Create your local config file

```bash
# Copy the safe template
cp config-template.js config.js
```

#### Step B: Add your real DeepSeek API key

Open the new `config.js` file and replace:

```js
DEEPSEEK_API_KEY: "your_deepseek_api_key_here"
```

with your actual key:

```js
DEEPSEEK_API_KEY: "sk-your-real-deepseek-key-here"
```

> **Important:** Never commit `config.js` — it is protected by `.gitignore`.

#### Step C: (Optional) Environment file

If you're using a build tool like Vite later, you can also copy:

```bash
cp .env.example .env
```

### 4. Run the development server

```bash
npm run dev
```

## 🔒 Security Notes

- `config.js` contains your real DeepSeek API key and is **never committed** to Git.
- Always start from `config-template.js` when setting up locally.
- Only `config-template.js`, `.env.example`, `.gitignore`, and `README.md` are safe to commit.
- For production, consider moving the DeepSeek AI calls to a backend server.

## 📁 Project Structure

```
├── config-template.js        # ✅ Safe to commit (template)
├── config.js                 # ❌ Gitignored (your real keys)
├── .env.example              # ✅ Safe to commit
├── .gitignore                # ✅ Protects secrets
├── README.md                 # ✅ Documentation
└── dashboard.html            # Main app file
```

## 📝 License

This project is private.

---

**Made with ❤️ for productivity & earning tools**
