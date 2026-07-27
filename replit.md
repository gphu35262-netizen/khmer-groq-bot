# Telegram Premium Sales Bot

A full-featured Telegram bot for selling Telegram Premium subscriptions, game accounts, and managing a referral/wallet system.

## Stack
- **Runtime:** Node.js
- **Bot framework:** Telegraf v4
- **AI:** Groq SDK (llama3-8b-8192)
- **Storage:** JSON file (`data.json`)

## How to run
```
npm start
```
The bot runs as a long-polling Telegram bot (no web server needed).

## Environment Secrets Required
| Secret | Description |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `GROQ_API_KEY` | Groq API key for AI assistant |

## Features
- 💎 **Telegram Premium sales** — 4 packages (1m/3m/6m/1yr), ABA QR payment
- 🤖 **AI Assistant** — Groq-powered, answers Premium questions in Khmer
- 🎮 **Game Accounts** — MLBB / Free Fire, directs to admin
- 👥 **Referral system** — $0.20 per Premium Code redeemed by referred user
- 🎁 **Premium Code** — 20-char one-time codes generated/distributed by admin
- 💰 **Wallet** — tracks referral earnings
- 💸 **Withdraw** — ABA QR-based withdrawal (min $2.00), admin approval flow
- 👨‍💻 **Admin Panel** — `/admin` command (admin only): view users, generate codes, approve payments/withdrawals, broadcast notifications

## Admin
Username: `@CryptoSinnals_99K`  
Commands: `/admin`, `/notify <message>`

## Data
All data stored in `data.json` (auto-created on first run).

## User preferences
- Khmer (Cambodian) language for bot messages
- Admin: @CryptoSinnals_99K
- Payment via ABA QR
