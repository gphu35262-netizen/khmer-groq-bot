const { Telegraf, Markup } = require('telegraf');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ADMIN_USERNAME = 'CryptoSinnals_99K';
const QR_IMAGE_PATH = path.join(__dirname, 'attached_assets', 'IMG_20260727_134737_241_1785146026775.jpg');
const DB_PATH = path.join(__dirname, 'data.json');

if (!BOT_TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN not set'); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });

// ─── HTML helper ──────────────────────────────────────────────────────────────
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
const b  = t => `<b>${esc(t)}</b>`;
const i  = t => `<i>${esc(t)}</i>`;
const c  = t => `<code>${esc(t)}</code>`;
const HTML = { parse_mode: 'HTML' };

// ─── Simple JSON Database ─────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = { users: {}, premiumCodes: {}, pendingPayments: [], pendingWithdrawals: [], adminChatId: null };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: {}, premiumCodes: {}, pendingPayments: [], pendingWithdrawals: [], adminChatId: null }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getOrCreateUser(db, ctx) {
  const id = String(ctx.from.id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || '',
      wallet: 0,
      referralCount: 0,
      premiumPurchased: 0,
      referredBy: null,
      state: null,
      stateData: {},
      createdAt: Date.now(),
    };
  } else {
    db.users[id].username = ctx.from.username || db.users[id].username;
    db.users[id].firstName = ctx.from.first_name || db.users[id].firstName;
  }
  return db.users[id];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isAdmin(ctx) {
  const db = loadDB();
  return String(ctx.from.id) === String(db.adminChatId) || ctx.from.username === ADMIN_USERNAME;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TG';
  for (let i = 0; i < 18; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fmtMoney(n) { return '$' + Number(n).toFixed(2); }

function userLabel(u) {
  if (!u) return 'N/A';
  let s = u.firstName || 'N/A';
  if (u.username) s += ` (@${u.username})`;
  return s;
}

// ─── Keyboards ────────────────────────────────────────────────────────────────
const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('💎 ទិញ Telegram Premium', 'buy_premium')],
  [Markup.button.callback('🤖 សួរ AI', 'ask_ai')],
  [Markup.button.callback('🎮 ទិញ Account MLBB / FF', 'buy_game')],
  [Markup.button.callback('👥 Referral', 'referral')],
  [Markup.button.callback('🎁 បញ្ចូល Premium Code', 'enter_code')],
  [Markup.button.callback('💰 Wallet', 'wallet')],
  [Markup.button.callback('💸 ដកប្រាក់', 'withdraw')],
  [Markup.button.callback('👨‍💻 ទាក់ទង Admin', 'contact_admin')],
]);

const BACK_BTN = Markup.inlineKeyboard([[Markup.button.callback('🔙 ត្រឡប់ Menu', 'back_main')]]);

const PACKAGES = [
  { id: 'pkg_1m',  label: '💎 1 ខែ — 4.99$',    price: 4.99,  duration: '1 ខែ' },
  { id: 'pkg_3m',  label: '💎 3 ខែ — 12.99$',   price: 12.99, duration: '3 ខែ' },
  { id: 'pkg_6m',  label: '💎 6 ខែ — 17.49$',   price: 17.49, duration: '6 ខែ' },
  { id: 'pkg_12m', label: '💎 1 ឆ្នាំ — 31.99$', price: 31.99, duration: '1 ឆ្នាំ' },
];

function premiumKeyboard() {
  return Markup.inlineKeyboard([
    ...PACKAGES.map(p => [Markup.button.callback(p.label, 'pkg_' + p.id)]),
    [Markup.button.callback('🔙 ត្រឡប់ Menu', 'back_main')],
  ]);
}

// ─── Safe edit helper ─────────────────────────────────────────────────────────
async function safeEdit(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
  } catch (e) {
    if (e.message?.includes('message is not modified')) return;
    // Fallback: send new message
    await ctx.reply(text, { parse_mode: 'HTML', ...extra });
  }
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  if (ctx.from.username === ADMIN_USERNAME) db.adminChatId = String(ctx.from.id);

  const payload = ctx.startPayload;
  if (payload && payload !== String(ctx.from.id) && !user.referredBy && db.users[payload]) {
    user.referredBy = payload;
  }

  user.state = null;
  user.stateData = {};
  saveDB(db);

  const name = esc(ctx.from.first_name || 'បង');
  await ctx.reply(
    `🤖 <b>សូមស្វាគមន៍មកកាន់ Telegram Premium Service</b>\n\n` +
    `❤️ សួស្តី <b>${name}</b>!\n\n` +
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    { parse_mode: 'HTML', ...MAIN_MENU }
  );
});

// ─── Back to main ─────────────────────────────────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = null;
  user.stateData = {};
  saveDB(db);
  await safeEdit(ctx,
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    MAIN_MENU
  );
});

// ─── 💎 Buy Premium ───────────────────────────────────────────────────────────
bot.action('buy_premium', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx,
    `💎 <b>Telegram Premium</b>\n\n❤️ សួស្តីបង!\n\nសូមជ្រើសរើស Package ដែលអ្នកចង់ទិញ 👇`,
    premiumKeyboard()
  );
});

PACKAGES.forEach(pkg => {
  bot.action('pkg_' + pkg.id, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx,
      `✅ <b>Telegram Premium ${esc(pkg.duration)}</b>\n\n` +
      `💵 តម្លៃ <b>${esc(fmtMoney(pkg.price))}</b>\n\n` +
      `📷 សូម Scan QR Code ខាងក្រោម រួចបង់ប្រាក់\n\n` +
      `✅ បន្ទាប់ពីបង់ប្រាក់ សូមផ្ញើ Screenshot មក Admin\n` +
      `👤 @${ADMIN_USERNAME}`,
      BACK_BTN
    );
    try {
      await ctx.replyWithPhoto(
        { source: QR_IMAGE_PATH },
        {
          caption: `💳 <b>ABA QR</b> — Telegram Premium ${esc(pkg.duration)} (${esc(fmtMoney(pkg.price))})\n\nបង់រួចផ្ញើ Screenshot ទៅ 👤 @${ADMIN_USERNAME}`,
          parse_mode: 'HTML',
        }
      );
    } catch (e) {
      console.error('QR send error:', e.message);
    }
  });
});

// ─── 🤖 AI Assistant ──────────────────────────────────────────────────────────
bot.action('ask_ai', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_ai';
  user.stateData = {};
  saveDB(db);
  await safeEdit(ctx,
    `🤖 <b>AI Assistant</b>\n\nសូមវាយសំណួររបស់អ្នក!\n\n` +
    `<i>ខ្ញុំអាចឆ្លើយអំពីៈ Telegram Premium, តម្លៃ, អត្ថប្រយោជន៍, របៀបទិញ, រយៈពេលរង់ចាំ, សុវត្ថិភាព</i>`,
    BACK_BTN
  );
});

// ─── 🎮 Game Account ──────────────────────────────────────────────────────────
bot.action('buy_game', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx,
    `🎮 <b>Game Account</b>\n\n` +
    `🎮 <b>MLBB</b> (Mobile Legends Bang Bang)\n` +
    `🎮 <b>Free Fire</b>\n\n` +
    `💵 តម្លៃចាប់ពី <b>4$</b> ឡើង\n\n` +
    `📩 សូមទាក់ទង Admin ដើម្បីទិញ\n👤 @${ADMIN_USERNAME}`,
    BACK_BTN
  );
});

// ─── 👥 Referral ──────────────────────────────────────────────────────────────
bot.action('referral', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  let botUsername = '';
  try { const me = await bot.telegram.getMe(); botUsername = me.username; } catch {}

  const link = botUsername
    ? `https://t.me/${botUsername}?start=${user.id}`
    : 'ចូល Bot ហើយ /start';

  saveDB(db);
  await safeEdit(ctx,
    `👥 <b>Referral Program</b>\n\n` +
    `💰 <b>Reward:</b> 0.20$ / Premium Code ដែលបានប្រើ\n\n` +
    `🔗 <b>Referral Link របស់អ្នក:</b>\n<code>${esc(link)}</code>\n\n` +
    `📊 <b>Stats:</b>\n` +
    `👥 អ្នកណែនាំ: <b>${user.referralCount}</b> នាក់\n` +
    `💰 Earned: <b>${fmtMoney(user.wallet)}</b>\n\n` +
    `<b>របៀបទទួល 0.20$:</b>\n` +
    `1️⃣ ផ្ញើ Referral Link ទៅមិត្ត\n` +
    `2️⃣ មិត្តចូល Bot\n` +
    `3️⃣ មិត្តទិញ Telegram Premium\n` +
    `4️⃣ Admin អនុម័ត\n` +
    `5️⃣ Bot ផ្ញើ Premium Code ទៅមិត្ត\n` +
    `6️⃣ មិត្តបញ្ចូល Premium Code\n` +
    `7️⃣ Wallet របស់អ្នក ✅ <b>+0.20$</b>`,
    BACK_BTN
  );
});

// ─── 🎁 Enter Premium Code ────────────────────────────────────────────────────
bot.action('enter_code', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_code';
  user.stateData = {};
  saveDB(db);
  await safeEdit(ctx,
    `🎁 <b>Premium Code</b>\n\nសូមវាយ Premium Code 20 តួ\n\n<i>ឧទាហរណ៍: TG8A9K4M2P1X7Q5R6N3Z</i>`,
    BACK_BTN
  );
});

// ─── 💰 Wallet ────────────────────────────────────────────────────────────────
bot.action('wallet', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  saveDB(db);
  await safeEdit(ctx,
    `💰 <b>Wallet</b>\n\n` +
    `💵 Balance: <b>${fmtMoney(user.wallet)}</b>\n` +
    `👥 Referral Earned: <b>${user.referralCount}</b>\n` +
    `💎 Premium Purchased: <b>${user.premiumPurchased}</b>`,
    BACK_BTN
  );
});

// ─── 💸 Withdraw ──────────────────────────────────────────────────────────────
bot.action('withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  if (user.wallet < 2.00) {
    saveDB(db);
    return safeEdit(ctx,
      `❌ <b>ដកប្រាក់មិនបាន</b>\n\nអ្នកត្រូវមាន <b>យ៉ាងតិច 2.00$</b> ដើម្បីដកប្រាក់។\n\n💰 Balance បច្ចុប្បន្ន: <b>${fmtMoney(user.wallet)}</b>`,
      BACK_BTN
    );
  }

  user.state = 'waiting_withdraw_qr';
  user.stateData = {};
  saveDB(db);
  await safeEdit(ctx,
    `💸 <b>Withdraw</b>\n\n` +
    `💵 Balance: <b>${fmtMoney(user.wallet)}</b>\n\n` +
    `📷 សូមផ្ញើ <b>ABA QR</b> របស់អ្នក\n\nBot នឹងផ្ញើសំណើទៅ Admin ដើម្បីអនុម័ត។`,
    BACK_BTN
  );
});

// ─── 👨‍💻 Contact Admin ─────────────────────────────────────────────────────────
bot.action('contact_admin', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx,
    `👨‍💻 <b>Contact Admin</b>\n\n👉 @${ADMIN_USERNAME}\n\n<i>Admin ជួយ 24/7</i>`,
    BACK_BTN
  );
});

// ─── Admin keyboard helper ────────────────────────────────────────────────────
function adminMainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👥 មើល Users', 'adm_users')],
    [Markup.button.callback('🔐 Generate Premium Code', 'adm_gen_code')],
    [Markup.button.callback('✅ Approve Payments', 'adm_payments')],
    [Markup.button.callback('💸 Approve Withdrawals', 'adm_withdrawals')],
  ]);
}

function adminPanelText(db) {
  const userCount = Object.keys(db.users).length;
  const codeCount = Object.keys(db.premiumCodes).length;
  const usedCodes = Object.values(db.premiumCodes).filter(c => c.used).length;
  return (
    `👨‍💻 <b>Admin Panel</b>\n\n` +
    `👥 Users: <b>${userCount}</b>\n` +
    `🔐 Codes: <b>${codeCount}</b> (ប្រើហើយ: ${usedCodes})\n` +
    `⏳ Payments: <b>${db.pendingPayments.length}</b>\n` +
    `⏳ Withdrawals: <b>${db.pendingWithdrawals.length}</b>`
  );
}

// ─── /admin command ───────────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ អ្នកមិនមានសិទ្ធិ Admin');
  const db = loadDB();
  // Register admin chat ID automatically
  db.adminChatId = String(ctx.from.id);
  saveDB(db);
  await ctx.reply(adminPanelText(db), { parse_mode: 'HTML', ...adminMainKeyboard() });
});

bot.action('adm_back', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  await safeEdit(ctx, adminPanelText(db), adminMainKeyboard());
});

bot.action('adm_users', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  const users = Object.values(db.users).slice(0, 20);
  let text = `👥 <b>Users (${Object.keys(db.users).length} total)</b>\n\n`;
  users.forEach(u => {
    text += `• ${esc(u.firstName || 'N/A')}${u.username ? ' (@' + esc(u.username) + ')' : ''} — 💰${fmtMoney(u.wallet)} | 👥${u.referralCount}\n`;
  });
  if (Object.keys(db.users).length > 20) text += `\n<i>...and more</i>`;
  await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));
});

bot.action('adm_gen_code', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  const code = generateCode();
  db.premiumCodes[code] = { code, used: false, usedBy: null, generatedAt: Date.now(), generatedBy: 'admin' };
  saveDB(db);
  await safeEdit(ctx,
    `🔐 <b>Premium Code បានបង្កើត!</b>\n\n<code>${code}</code>\n\n<i>ផ្ញើ Code នេះទៅ User បន្ទាប់ពី Approve Payment</i>`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
  );
});

bot.action('adm_payments', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  if (db.pendingPayments.length === 0) {
    return safeEdit(ctx, '✅ គ្មាន Pending Payments',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
    );
  }
  const pay = db.pendingPayments[0];
  const user = db.users[pay.userId];
  await safeEdit(ctx,
    `💳 <b>Pending Payment</b>\n\n` +
    `👤 User: ${esc(userLabel(user))}\n` +
    `💎 Package: ${esc(pay.duration)} (${esc(fmtMoney(pay.price))})\n` +
    `📅 Date: ${new Date(pay.createdAt).toLocaleString()}\n\n` +
    `${db.pendingPayments.length} Pending total`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `adm_pay_ok_${pay.id}`),
        Markup.button.callback('❌ Reject', `adm_pay_no_${pay.id}`),
      ],
      [Markup.button.callback('🔙 Admin', 'adm_back')],
    ])
  );
});

bot.action(/^adm_pay_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx === -1) return safeEdit(ctx, '❌ Payment not found', Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));

  const pay = db.pendingPayments.splice(idx, 1)[0];
  const user = db.users[pay.userId];
  if (user) {
    user.premiumPurchased = (user.premiumPurchased || 0) + 1;
    pay.referredBy = user.referredBy;
  }

  const code = generateCode();
  db.premiumCodes[code] = {
    code, used: false, usedBy: null,
    generatedFor: pay.userId, referredBy: pay.referredBy,
    generatedAt: Date.now(), payId
  };
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      pay.userId,
      `✅ <b>Payment Approved!</b>\n\n🎉 អរគុណសម្រាប់ការទិញ!\n\n🔐 <b>Premium Code របស់អ្នក:</b>\n<code>${code}</code>\n\nចុច 🎁 <b>បញ្ចូល Premium Code</b> ដើម្បីបញ្ចូល Code!`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
  } catch (e) { console.error('Cannot notify user:', e.message); }

  await safeEdit(ctx,
    `✅ Approved! Code: <code>${code}</code> sent to user.`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
  );
});

bot.action(/^adm_pay_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx === -1) return safeEdit(ctx, '❌ Payment not found', Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));
  const pay = db.pendingPayments.splice(idx, 1)[0];
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      pay.userId,
      `❌ <b>Payment Rejected</b>\n\nការបង់ប្រាក់របស់អ្នកត្រូវបានបដិសេធ។\nសូមទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}

  await safeEdit(ctx, '❌ Payment rejected.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));
});

bot.action('adm_withdrawals', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  if (db.pendingWithdrawals.length === 0) {
    return safeEdit(ctx, '✅ គ្មាន Pending Withdrawals',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
    );
  }
  const w = db.pendingWithdrawals[0];
  const user = db.users[w.userId];
  await safeEdit(ctx,
    `💸 <b>Pending Withdrawal</b>\n\n` +
    `👤 User: ${esc(userLabel(user))}\n` +
    `💵 Amount: <b>${fmtMoney(w.amount)}</b>\n` +
    `📅 Date: ${new Date(w.createdAt).toLocaleString()}\n\n` +
    `${db.pendingWithdrawals.length} Pending total\n\n` +
    `<i>QR image was forwarded separately</i>`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `adm_with_ok_${w.id}`),
        Markup.button.callback('❌ Reject', `adm_with_no_${w.id}`),
      ],
      [Markup.button.callback('🔙 Admin', 'adm_back')],
    ])
  );
});

bot.action(/^adm_with_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx === -1) return safeEdit(ctx, '❌ Not found', Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  if (user) user.wallet = Math.round(Math.max(0, user.wallet - w.amount) * 100) / 100;
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      w.userId,
      `✅ <b>Withdraw Success!</b>\n\n` +
      `💸 ដក: <b>-${fmtMoney(w.amount)}</b>\n` +
      `💰 Balance: <b>${fmtMoney(user?.wallet || 0)}</b>\n\n` +
      `Admin បាញ់ប្រាក់ <b>${fmtMoney(w.amount)}</b> ទៅ ABA QR របស់អ្នករួចហើយ! 🎉`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
  } catch (e) {}

  await safeEdit(ctx,
    `✅ Withdraw approved! ${esc(fmtMoney(w.amount))} deducted. New balance: ${esc(fmtMoney(user?.wallet || 0))}`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
  );
});

bot.action(/^adm_with_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx === -1) return safeEdit(ctx, '❌ Not found', Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]));
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  // Refund the locked amount
  if (user) user.wallet = Math.round((user.wallet + w.amount) * 100) / 100;
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      w.userId,
      `❌ <b>Withdraw Rejected</b>\n\nសំណើដកប្រាក់ត្រូវបានបដិសេធ។\n💰 Balance returned: <b>${fmtMoney(user?.wallet || 0)}</b>\n\nទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}

  await safeEdit(ctx, '❌ Withdrawal rejected. Balance refunded.',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]])
  );
});

// ─── /notify broadcast ────────────────────────────────────────────────────────
bot.command('notify', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const text = ctx.message.text.replace('/notify', '').trim();
  if (!text) return ctx.reply('Usage: /notify <message>');
  const db = loadDB();
  const users = Object.values(db.users);
  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.id, `📢 <b>Announcement</b>\n\n${esc(text)}`, { parse_mode: 'HTML' });
      sent++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  ctx.reply(`📢 Sent: ${sent} | Failed: ${failed}`);
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📢 <b>Help</b>\n\nបើរក Menu មិនឃើញ:\nចុច <b>Menu</b> រួច /start\n\n👨‍💻 Contact: @${ADMIN_USERNAME}`,
    { parse_mode: 'HTML', ...MAIN_MENU }
  );
});

// ─── Message handler (state machine) ─────────────────────────────────────────
bot.on('message', async (ctx) => {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  const state = user.state;

  // ── AI mode ──────────────────────────────────────────────────────────────
  if (state === 'waiting_ai') {
    const question = ctx.message.text;
    if (!question) return;

    const typingMsg = await ctx.reply('🤖 <i>កំពុងគិត...</i>', { parse_mode: 'HTML' });

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a Telegram Premium Sales Bot.
Answer questions about: Telegram Premium features, pricing (1 month $4.99, 3 months $12.99, 6 months $17.49, 1 year $31.99), benefits, how to buy, delivery time, and safety/security.
Always respond in Khmer (Cambodian) language. Be friendly, concise, and helpful.
The admin is @CryptoSinnals_99K. Payment is via ABA QR code (scan and pay with ABA Bank app).
After payment, users must send a screenshot to the admin who then approves and issues a Premium Code.`
          },
          { role: 'user', content: question }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const answer = completion.choices[0]?.message?.content || 'សូមអភ័យទោស, មានបញ្ហាក្នុងការឆ្លើយ';
      await bot.telegram.editMessageText(
        ctx.chat.id, typingMsg.message_id, null,
        `🤖 <b>AI Assistant</b>\n\n${esc(answer)}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('Groq error:', e.message);
      await bot.telegram.editMessageText(
        ctx.chat.id, typingMsg.message_id, null,
        '❌ AI Error. សូមព្យាយាមម្ដងទៀត'
      ).catch(() => {});
    }

    await ctx.reply('💬 <i>វាយសំណួរថ្មីទៀត ឬ</i>', { parse_mode: 'HTML', ...BACK_BTN });
    return;
  }

  // ── Premium Code mode ─────────────────────────────────────────────────────
  if (state === 'waiting_code') {
    const code = (ctx.message.text || '').trim().toUpperCase();
    if (code.length !== 20) {
      return ctx.reply('❌ Code ត្រូវតែ <b>20 តួ</b>! សូមព្យាយាមម្ដងទៀត', { parse_mode: 'HTML' });
    }

    const codeEntry = db.premiumCodes[code];
    if (!codeEntry) {
      user.state = null; saveDB(db);
      return ctx.reply('❌ Code <b>មិនត្រឹមត្រូវ</b> ឬមិនមាននៅក្នុងប្រព័ន្ធ!', { parse_mode: 'HTML', ...BACK_BTN });
    }
    if (codeEntry.used) {
      user.state = null; saveDB(db);
      return ctx.reply('❌ Code នេះ <b>ត្រូវបានប្រើរួចហើយ</b>!', { parse_mode: 'HTML', ...BACK_BTN });
    }

    codeEntry.used = true;
    codeEntry.usedBy = user.id;
    codeEntry.usedAt = Date.now();

    // Reward referrer
    let referrerRewarded = false;
    const referrerId = codeEntry.referredBy || user.referredBy;
    if (referrerId && db.users[referrerId] && referrerId !== user.id) {
      db.users[referrerId].wallet = Math.round((db.users[referrerId].wallet + 0.20) * 100) / 100;
      db.users[referrerId].referralCount = (db.users[referrerId].referralCount || 0) + 1;
      referrerRewarded = true;
      try {
        await bot.telegram.sendMessage(
          referrerId,
          `🎉 <b>Referral Bonus!</b>\n\n👥 មិត្តរបស់អ្នកទើបតែប្រើ Premium Code!\n💰 Wallet <b>+0.20$</b>\n\n💵 Balance: <b>${fmtMoney(db.users[referrerId].wallet)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    }

    user.state = null;
    saveDB(db);

    await ctx.reply(
      `✅ <b>Code Accepted!</b>\n\n<code>${code}</code>\n\n` +
      (referrerRewarded ? `👥 Referral Bonus sent to your referrer: <b>+0.20$</b>\n\n` : '') +
      `🎉 Telegram Premium activated!\nច្រើនអរគុណ! 💎`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
    return;
  }

  // ── Withdraw QR mode ──────────────────────────────────────────────────────
  if (state === 'waiting_withdraw_qr') {
    const hasPhoto = ctx.message.photo;
    const hasDoc = ctx.message.document;

    if (!hasPhoto && !hasDoc) {
      return ctx.reply('📷 សូមផ្ញើ <b>ABA QR</b> ជា រូបភាព', { parse_mode: 'HTML' });
    }

    const amount = 2.00;
    if (user.wallet < amount) {
      user.state = null; saveDB(db);
      return ctx.reply(`❌ Balance មិនគ្រប់! Balance: <b>${fmtMoney(user.wallet)}</b>`, { parse_mode: 'HTML', ...BACK_BTN });
    }

    user.wallet = Math.round((user.wallet - amount) * 100) / 100;
    user.state = null;

    const withdrawId = 'W' + Date.now();
    const fileId = hasPhoto ? hasPhoto[hasPhoto.length - 1].file_id : hasDoc.file_id;

    db.pendingWithdrawals.push({ id: withdrawId, userId: user.id, amount, qrFileId: fileId, createdAt: Date.now() });
    saveDB(db);

    const db2 = loadDB();
    if (db2.adminChatId) {
      try {
        await bot.telegram.sendPhoto(
          db2.adminChatId, fileId,
          {
            caption: `💸 <b>Withdraw Request</b>\n\n👤 ${esc(userLabel(user))}\n💵 Amount: <b>${fmtMoney(amount)}</b>\n🆔 ID: ${withdrawId}`,
            parse_mode: 'HTML',
          }
        );
      } catch (e) { console.error('Admin notify error:', e.message); }
    }

    await ctx.reply(
      `✅ <b>Withdraw Request Submitted!</b>\n\n💸 Amount: <b>${fmtMoney(amount)}</b>\nAdmin នឹងផ្ទៀងផ្ទាត់ក្នុងពេលឆាប់ៗ! ⏳`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
    return;
  }

  // ── User sends a photo with no state (payment screenshot) ─────────────────
  if (ctx.message.photo) {
    const db2 = loadDB();
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Try to match to a recent pending package (last interacted)
    const pendingPay = {
      id: 'P' + Date.now(),
      userId: user.id,
      duration: 'unknown',
      price: 0,
      screenshotFileId: fileId,
      createdAt: Date.now(),
    };
    db2.pendingPayments.push(pendingPay);
    saveDB(db2);

    // Forward to admin
    if (db2.adminChatId) {
      try {
        await bot.telegram.sendPhoto(
          db2.adminChatId, fileId,
          {
            caption: `💳 <b>Payment Screenshot</b>\n\n👤 ${esc(userLabel(user))}\n🆔 ID: ${pendingPay.id}\n\nប្រើ /admin → Approve Payments`,
            parse_mode: 'HTML',
          }
        );
      } catch (e) {}
    }

    await ctx.reply(
      `📷 <b>Screenshot បានទទួល!</b>\n\nAdmin នឹង Review ហើយ Approve ក្នុងពេលឆាប់ៗ ⏳\n\nអ្នកនឹងទទួល Premium Code ពេល Admin Approve!`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
    return;
  }

  // ── Default fallback ──────────────────────────────────────────────────────
  if (ctx.message.text && !ctx.message.text.startsWith('/')) {
    await ctx.reply(
      `🤖 ចុច /start ដើម្បីចាប់ផ្ដើម ឬជ្រើសសេវាខាងក្រោម 👇`,
      { parse_mode: 'HTML', ...MAIN_MENU }
    );
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  const msg = err?.message || '';
  if (msg.includes('message is not modified')) return;
  if (msg.includes('message to edit not found')) return;
  if (msg.includes('query is too old')) return;
  if (msg.includes('bot was blocked')) return;
  console.error('Bot error:', msg);
  try { ctx.reply('❌ មានបញ្ហា។ សូម /start ម្ដងទៀត').catch(() => {}); } catch {}
});

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch()
  .then(() => {
    console.log('🤖 Telegram Premium Bot is running...');
    console.log(`👨‍💻 Admin: @${ADMIN_USERNAME}`);
  })
  .catch(err => {
    console.error('❌ Failed to start bot:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
