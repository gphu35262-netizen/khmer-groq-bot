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

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtMoney(n) { return '$' + Number(n).toFixed(2); }
function userLabel(u) {
  if (!u) return 'N/A';
  return (u.firstName || 'N/A') + (u.username ? ` (@${u.username})` : '');
}

// ─── Database ─────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = { users: {}, premiumCodes: {}, pendingPayments: [], pendingWithdrawals: [], adminChatId: null };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: {}, premiumCodes: {}, pendingPayments: [], pendingWithdrawals: [], adminChatId: null }; }
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getOrCreateUser(db, ctx) {
  const id = String(ctx.from.id);
  if (!db.users[id]) {
    db.users[id] = { id, username: ctx.from.username || null, firstName: ctx.from.first_name || '',
      wallet: 0, referralCount: 0, premiumPurchased: 0, referredBy: null,
      state: null, stateData: {}, createdAt: Date.now() };
  } else {
    db.users[id].username = ctx.from.username || db.users[id].username;
    db.users[id].firstName = ctx.from.first_name || db.users[id].firstName;
  }
  return db.users[id];
}

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

// ─── Keyboards ────────────────────────────────────────────────────────────────
// Persistent reply keyboard — always expanded, cannot be minimised
const REPLY_KB = Markup.keyboard([
  ['💎 ទិញ Telegram Premium', '🤖 សួរ AI'],
  ['🎮 ទិញ Account MLBB / FF', '👥 Referral'],
  ['🎁 បញ្ចូល Premium Code',   '💰 Wallet'],
  ['💸 ដកប្រាក់',              '👨‍💻 ទាក់ទង Admin'],
]).resize().persistent();

const BACK_INLINE = Markup.inlineKeyboard([[Markup.button.callback('🔙 ត្រឡប់ Menu', 'back_main')]]);

// Compact inline menu — shown right next to photos for quick access
const PHOTO_MENU_INLINE = Markup.inlineKeyboard([
  [Markup.button.callback('💎 ទិញ Premium',   'buy_premium'),  Markup.button.callback('🤖 AI',      'ask_ai')],
  [Markup.button.callback('🎮 Game Account',  'buy_game'),     Markup.button.callback('👥 Referral', 'referral')],
  [Markup.button.callback('🎁 Premium Code',  'enter_code'),   Markup.button.callback('💰 Wallet',  'wallet')],
  [Markup.button.callback('💸 ដកប្រាក់',      'withdraw'),     Markup.button.callback('👨‍💻 Admin',  'contact_admin')],
]);

const PACKAGES = [
  { id: 'pkg_1m',  label: '💎 1 ខែ — 4.99$',    price: 4.99,  duration: '1 ខែ' },
  { id: 'pkg_3m',  label: '💎 3 ខែ — 12.99$',   price: 12.99, duration: '3 ខែ' },
  { id: 'pkg_6m',  label: '💎 6 ខែ — 17.49$',   price: 17.49, duration: '6 ខែ' },
  { id: 'pkg_12m', label: '💎 1 ឆ្នាំ — 31.99$', price: 31.99, duration: '1 ឆ្នាំ' },
];

function premiumInlineKeyboard() {
  return Markup.inlineKeyboard([
    ...PACKAGES.map(p => [Markup.button.callback(p.label, 'pkg_' + p.id)]),
    [Markup.button.callback('🔙 ត្រឡប់ Menu', 'back_main')],
  ]);
}

// ─── Shared handler functions ─────────────────────────────────────────────────

async function showWelcome(ctx) {
  const name = esc(ctx.from?.first_name || 'បង');
  await ctx.reply(
    `🤖 <b>សូមស្វាគមន៍មកកាន់ Telegram Premium Service</b>\n\n` +
    `❤️ សួស្តី <b>${name}</b>!\n\n` +
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    { parse_mode: 'HTML', ...REPLY_KB }
  );
}

async function showPremium(ctx) {
  await ctx.reply(
    `💎 <b>Telegram Premium</b>\n\n❤️ សួស្តីបង!\n\nសូមជ្រើសរើស Package ដែលអ្នកចង់ទិញ 👇`,
    { parse_mode: 'HTML', ...premiumInlineKeyboard() }
  );
}

async function showAI(ctx) {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_ai';
  user.stateData = {};
  saveDB(db);
  await ctx.reply(
    `🤖 <b>AI Assistant</b>\n\nសូមវាយសំណួររបស់អ្នក!\n\n` +
    `<i>ខ្ញុំអាចឆ្លើយអំពីៈ Telegram Premium, តម្លៃ, អត្ថប្រយោជន៍, របៀបទិញ, រយៈពេលរង់ចាំ, សុវត្ថិភាព</i>`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showGame(ctx) {
  await ctx.reply(
    `🎮 <b>Game Account</b>\n\n` +
    `🎮 <b>MLBB</b> (Mobile Legends Bang Bang)\n` +
    `🎮 <b>Free Fire</b>\n\n` +
    `💵 តម្លៃចាប់ពី <b>4$</b> ឡើង\n\n` +
    `📩 សូមទាក់ទង Admin ដើម្បីទិញ\n👤 @${ADMIN_USERNAME}`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showReferral(ctx) {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  let botUsername = '';
  try { const me = await bot.telegram.getMe(); botUsername = me.username; } catch {}
  const link = botUsername ? `https://t.me/${botUsername}?start=${user.id}` : '/start';
  saveDB(db);
  await ctx.reply(
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
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showEnterCode(ctx) {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_code';
  user.stateData = {};
  saveDB(db);
  await ctx.reply(
    `🎁 <b>Premium Code</b>\n\nសូមវាយ Premium Code 20 តួ\n\n<i>ឧទាហរណ៍: TG8A9K4M2P1X7Q5R6N3Z</i>`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showWallet(ctx) {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  saveDB(db);
  await ctx.reply(
    `💰 <b>Wallet</b>\n\n` +
    `💵 Balance: <b>${fmtMoney(user.wallet)}</b>\n` +
    `👥 Referral Earned: <b>${user.referralCount}</b>\n` +
    `💎 Premium Purchased: <b>${user.premiumPurchased}</b>`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showWithdraw(ctx) {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  if (user.wallet < 2.00) {
    saveDB(db);
    return ctx.reply(
      `❌ <b>ដកប្រាក់មិនបាន</b>\n\nអ្នកត្រូវមាន <b>យ៉ាងតិច 2.00$</b> ដើម្បីដកប្រាក់។\n\n💰 Balance: <b>${fmtMoney(user.wallet)}</b>`,
      { parse_mode: 'HTML', ...BACK_INLINE }
    );
  }
  user.state = 'waiting_withdraw_qr';
  user.stateData = {};
  saveDB(db);
  await ctx.reply(
    `💸 <b>Withdraw</b>\n\n` +
    `💵 Balance: <b>${fmtMoney(user.wallet)}</b>\n\n` +
    `📷 សូមផ្ញើ <b>ABA QR</b> របស់អ្នក\n\nBot នឹងផ្ញើសំណើទៅ Admin ដើម្បីអនុម័ត។`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
}

async function showContactAdmin(ctx) {
  await ctx.reply(
    `👨‍💻 <b>Contact Admin</b>\n\n👉 @${ADMIN_USERNAME}\n\n<i>Admin ជួយ 24/7</i>`,
    { parse_mode: 'HTML', ...BACK_INLINE }
  );
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
  await showWelcome(ctx);
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📢 <b>Help</b>\n\nចុច /start ដើម្បីចាប់ផ្ដើម\n👨‍💻 Contact: @${ADMIN_USERNAME}`,
    { parse_mode: 'HTML', ...REPLY_KB }
  );
});

// ─── Reply Keyboard button handlers (bot.hears) ───────────────────────────────
bot.hears('💎 ទិញ Telegram Premium', showPremium);
bot.hears('🤖 សួរ AI',               showAI);
bot.hears('🎮 ទិញ Account MLBB / FF', showGame);
bot.hears('👥 Referral',             showReferral);
bot.hears('🎁 បញ្ចូល Premium Code',  showEnterCode);
bot.hears('💰 Wallet',               showWallet);
bot.hears('💸 ដកប្រាក់',             showWithdraw);
bot.hears('👨‍💻 ទាក់ទង Admin',        showContactAdmin);

// ─── back_main inline action ──────────────────────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = null;
  user.stateData = {};
  saveDB(db);
  // Delete the inline sub-menu message, then show reply keyboard
  try { await ctx.deleteMessage(); } catch {}
  await ctx.reply(
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    { parse_mode: 'HTML', ...REPLY_KB }
  );
});

// ─── Package inline buttons ───────────────────────────────────────────────────
PACKAGES.forEach(pkg => {
  bot.action('pkg_' + pkg.id, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(
      `✅ <b>Telegram Premium ${esc(pkg.duration)}</b>\n\n` +
      `💵 តម្លៃ <b>${esc(fmtMoney(pkg.price))}</b>\n\n` +
      `📷 សូម Scan QR Code ខាងក្រោម រួចបង់ប្រាក់\n\n` +
      `✅ បន្ទាប់ពីបង់ប្រាក់ ផ្ញើ <b>Screenshot</b> មកក្នុង Bot នេះ\n👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'HTML' }
    );
    try {
      await ctx.replyWithPhoto(
        { source: QR_IMAGE_PATH },
        {
          caption:
            `💳 <b>ABA QR</b> — Telegram Premium ${esc(pkg.duration)} (${esc(fmtMoney(pkg.price))})\n\n` +
            `📌 Scan រួចបង់ប្រាក់ ហើយ <b>ផ្ញើ Screenshot ក្នុង Bot នេះ</b>\n\n` +
            `ចូលមើល Menu បន្ថែម 👇`,
          parse_mode: 'HTML',
          ...PHOTO_MENU_INLINE,
        }
      );
    } catch (e) { console.error('QR send error:', e.message); }
  });
});

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function adminPanelText(db) {
  const total = Object.keys(db.users).length;
  const codes = Object.keys(db.premiumCodes).length;
  const used  = Object.values(db.premiumCodes).filter(c => c.used).length;
  return (
    `👨‍💻 <b>Admin Panel</b>\n\n` +
    `👥 Users: <b>${total}</b>\n` +
    `🔐 Codes: <b>${codes}</b> (ប្រើហើយ: ${used})\n` +
    `⏳ Pending Payments: <b>${db.pendingPayments.length}</b>\n` +
    `⏳ Pending Withdrawals: <b>${db.pendingWithdrawals.length}</b>`
  );
}
function adminMainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👥 មើល Users',          'adm_users')],
    [Markup.button.callback('🔐 Generate Premium Code', 'adm_gen_code')],
    [Markup.button.callback('✅ Approve Payments',    'adm_payments')],
    [Markup.button.callback('💸 Approve Withdrawals', 'adm_withdrawals')],
  ]);
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const db = loadDB();
  db.adminChatId = String(ctx.from.id);
  saveDB(db);
  await ctx.reply(adminPanelText(db), { parse_mode: 'HTML', ...adminMainKeyboard() });
});

bot.action('adm_back', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  try {
    await ctx.editMessageText(adminPanelText(db), { parse_mode: 'HTML', ...adminMainKeyboard() });
  } catch {}
});

bot.action('adm_users', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  const list = Object.values(db.users).slice(0, 20);
  let text = `👥 <b>Users (${Object.keys(db.users).length} total)</b>\n\n`;
  list.forEach(u => {
    text += `• ${esc(u.firstName || 'N/A')}${u.username ? ' (@' + esc(u.username) + ')' : ''} — 💰${fmtMoney(u.wallet)} | 👥${u.referralCount}\n`;
  });
  if (Object.keys(db.users).length > 20) text += `\n<i>...and more</i>`;
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  } catch {}
});

bot.action('adm_gen_code', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  const code = generateCode();
  db.premiumCodes[code] = { code, used: false, usedBy: null, generatedAt: Date.now(), generatedBy: 'admin' };
  saveDB(db);
  try {
    await ctx.editMessageText(
      `🔐 <b>Premium Code បានបង្កើត!</b>\n\n<code>${code}</code>\n\n<i>ផ្ញើ Code នេះទៅ User បន្ទាប់ពី Approve Payment</i>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }
    );
  } catch {}
});

bot.action('adm_payments', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  if (db.pendingPayments.length === 0) {
    try { await ctx.editMessageText('✅ គ្មាន Pending Payments', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {}
    return;
  }
  const pay = db.pendingPayments[0];
  const user = db.users[pay.userId];
  try {
    await ctx.editMessageText(
      `💳 <b>Pending Payment</b>\n\n` +
      `👤 User: ${esc(userLabel(user))}\n` +
      `💎 Package: ${esc(pay.duration || 'N/A')} (${esc(fmtMoney(pay.price || 0))})\n` +
      `📅 Date: ${new Date(pay.createdAt).toLocaleString()}\n\n` +
      `${db.pendingPayments.length} Pending total`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Approve', `adm_pay_ok_${pay.id}`), Markup.button.callback('❌ Reject', `adm_pay_no_${pay.id}`)],
          [Markup.button.callback('🔙 Admin', 'adm_back')],
        ])
      }
    );
  } catch {}
});

bot.action(/^adm_pay_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx === -1) { try { await ctx.editMessageText('❌ Payment not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {} return; }
  const pay = db.pendingPayments.splice(idx, 1)[0];
  const user = db.users[pay.userId];
  if (user) { user.premiumPurchased = (user.premiumPurchased || 0) + 1; pay.referredBy = user.referredBy; }
  const code = generateCode();
  db.premiumCodes[code] = { code, used: false, usedBy: null, generatedFor: pay.userId, referredBy: pay.referredBy, generatedAt: Date.now(), payId };
  saveDB(db);
  try {
    await bot.telegram.sendMessage(pay.userId,
      `✅ <b>Payment Approved!</b>\n\n🎉 អរគុណសម្រាប់ការទិញ!\n\n🔐 <b>Premium Code របស់អ្នក:</b>\n<code>${code}</code>\n\nចុចប៊ូតុង 🎁 <b>បញ្ចូល Premium Code</b> ដើម្បីបញ្ចូល!`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { console.error('Notify error:', e.message); }
  try {
    await ctx.editMessageText(`✅ Approved! Code: <code>${code}</code> sent.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  } catch {}
});

bot.action(/^adm_pay_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx !== -1) {
    const pay = db.pendingPayments.splice(idx, 1)[0];
    saveDB(db);
    try { await bot.telegram.sendMessage(pay.userId, `❌ <b>Payment Rejected</b>\n\nទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`, { parse_mode: 'HTML' }); } catch {}
  }
  try { await ctx.editMessageText('❌ Payment rejected.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {}
});

bot.action('adm_withdrawals', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  if (db.pendingWithdrawals.length === 0) {
    try { await ctx.editMessageText('✅ គ្មាន Pending Withdrawals', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {}
    return;
  }
  const w = db.pendingWithdrawals[0];
  const user = db.users[w.userId];
  try {
    await ctx.editMessageText(
      `💸 <b>Pending Withdrawal</b>\n\n` +
      `👤 User: ${esc(userLabel(user))}\n` +
      `💵 Amount: <b>${fmtMoney(w.amount)}</b>\n` +
      `📅 Date: ${new Date(w.createdAt).toLocaleString()}\n\n` +
      `${db.pendingWithdrawals.length} Pending total`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Approve', `adm_with_ok_${w.id}`), Markup.button.callback('❌ Reject', `adm_with_no_${w.id}`)],
          [Markup.button.callback('🔙 Admin', 'adm_back')],
        ])
      }
    );
  } catch {}
});

bot.action(/^adm_with_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx === -1) { try { await ctx.editMessageText('❌ Not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {} return; }
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  if (user) user.wallet = Math.round(Math.max(0, user.wallet - w.amount) * 100) / 100;
  saveDB(db);
  try {
    await bot.telegram.sendMessage(w.userId,
      `✅ <b>Withdraw Success!</b>\n\n💸 ដក: <b>-${fmtMoney(w.amount)}</b>\n💰 Balance: <b>${fmtMoney(user?.wallet || 0)}</b>\n\nAdmin បាញ់ប្រាក់ ${fmtMoney(w.amount)} ទៅ ABA QR របស់អ្នករួចហើយ! 🎉`,
      { parse_mode: 'HTML' }
    );
  } catch {}
  try { await ctx.editMessageText(`✅ Withdraw approved! New balance: ${fmtMoney(user?.wallet || 0)}`, { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {}
});

bot.action(/^adm_with_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx !== -1) {
    const w = db.pendingWithdrawals.splice(idx, 1)[0];
    const user = db.users[w.userId];
    if (user) user.wallet = Math.round((user.wallet + w.amount) * 100) / 100;
    saveDB(db);
    try { await bot.telegram.sendMessage(w.userId, `❌ <b>Withdraw Rejected</b>\n\n💰 Balance returned: <b>${fmtMoney(user?.wallet || 0)}</b>\n\nទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`, { parse_mode: 'HTML' }); } catch {}
  }
  try { await ctx.editMessageText('❌ Withdrawal rejected. Balance refunded.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }); } catch {}
});

// ─── /notify broadcast ────────────────────────────────────────────────────────
bot.command('notify', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const text = ctx.message.text.replace('/notify', '').trim();
  if (!text) return ctx.reply('Usage: /notify <message>');
  const db = loadDB();
  let sent = 0, failed = 0;
  for (const u of Object.values(db.users)) {
    try { await bot.telegram.sendMessage(u.id, `📢 <b>Announcement</b>\n\n${esc(text)}`, { parse_mode: 'HTML' }); sent++; }
    catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  ctx.reply(`📢 Sent: ${sent} | Failed: ${failed}`);
});

// ─── Message handler (state machine for text input) ───────────────────────────
bot.on('message', async (ctx) => {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  const state = user.state;

  // ── AI mode ──────────────────────────────────────────────────────────────
  if (state === 'waiting_ai') {
    const question = ctx.message.text;
    if (!question) return;
    const typing = await ctx.reply('🤖 <i>កំពុងគិត...</i>', { parse_mode: 'HTML' });
    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content:
            `You are a helpful assistant for a Telegram Premium Sales Bot.
Answer questions about: Telegram Premium features, pricing (1 month $4.99, 3 months $12.99, 6 months $17.49, 1 year $31.99), benefits, how to buy, delivery time, safety/security.
Always respond in Khmer (Cambodian) language. Be friendly and concise.
Admin: @CryptoSinnals_99K. Payment via ABA QR code. After payment, user sends screenshot, admin approves and issues a Premium Code.` },
          { role: 'user', content: question }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      const answer = res.choices[0]?.message?.content || 'សូមអភ័យទោស មានបញ្ហា';
      await bot.telegram.editMessageText(ctx.chat.id, typing.message_id, null,
        `🤖 <b>AI</b>\n\n${esc(answer)}\n\n<i>វាយសំណួរថ្មីទៀត ឬចុចប៊ូតុងខាងក្រោម</i>`,
        { parse_mode: 'HTML', ...BACK_INLINE }
      );
    } catch (e) {
      console.error('Groq error:', e.message);
      await bot.telegram.editMessageText(ctx.chat.id, typing.message_id, null,
        '❌ AI Error. សូមព្យាយាមម្ដងទៀត'
      ).catch(() => {});
    }
    return;
  }

  // ── Premium Code mode ─────────────────────────────────────────────────────
  if (state === 'waiting_code') {
    const code = (ctx.message.text || '').trim().toUpperCase();
    if (code.length !== 20) {
      return ctx.reply('❌ Code ត្រូវតែ <b>20 តួ</b>! សូមព្យាយាមម្ដងទៀត', { parse_mode: 'HTML' });
    }
    const entry = db.premiumCodes[code];
    if (!entry) {
      user.state = null; saveDB(db);
      return ctx.reply('❌ Code <b>មិនត្រឹមត្រូវ</b> ឬមិនមាន!', { parse_mode: 'HTML', ...BACK_INLINE });
    }
    if (entry.used) {
      user.state = null; saveDB(db);
      return ctx.reply('❌ Code នេះ <b>ត្រូវបានប្រើរួចហើយ</b>!', { parse_mode: 'HTML', ...BACK_INLINE });
    }
    entry.used = true;
    entry.usedBy = user.id;
    entry.usedAt = Date.now();
    // Reward referrer
    let rewarded = false;
    const refId = entry.referredBy || user.referredBy;
    if (refId && db.users[refId] && refId !== user.id) {
      db.users[refId].wallet = Math.round((db.users[refId].wallet + 0.20) * 100) / 100;
      db.users[refId].referralCount = (db.users[refId].referralCount || 0) + 1;
      rewarded = true;
      try {
        await bot.telegram.sendMessage(refId,
          `🎉 <b>Referral Bonus!</b>\n\n👥 មិត្តរបស់អ្នកទើបប្រើ Premium Code!\n💰 Wallet <b>+0.20$</b>\n\n💵 Balance: <b>${fmtMoney(db.users[refId].wallet)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
    user.state = null;
    saveDB(db);
    await ctx.reply(
      `✅ <b>Code Accepted!</b>\n\n<code>${code}</code>\n\n` +
      (rewarded ? `👥 Referral Bonus sent to your referrer: <b>+0.20$</b>\n\n` : '') +
      `🎉 Telegram Premium activated! ច្រើនអរគុណ 💎`,
      { parse_mode: 'HTML', ...REPLY_KB }
    );
    return;
  }

  // ── Withdraw QR mode ──────────────────────────────────────────────────────
  if (state === 'waiting_withdraw_qr') {
    const hasPhoto = ctx.message.photo;
    const hasDoc   = ctx.message.document;
    if (!hasPhoto && !hasDoc) {
      return ctx.reply('📷 សូមផ្ញើ <b>ABA QR</b> ជា រូបភាព', { parse_mode: 'HTML' });
    }
    const amount = 2.00;
    if (user.wallet < amount) {
      user.state = null; saveDB(db);
      return ctx.reply(`❌ Balance មិនគ្រប់! Balance: <b>${fmtMoney(user.wallet)}</b>`, { parse_mode: 'HTML', ...BACK_INLINE });
    }
    user.wallet = Math.round((user.wallet - amount) * 100) / 100;
    user.state = null;
    const wId = 'W' + Date.now();
    const fileId = hasPhoto ? hasPhoto[hasPhoto.length - 1].file_id : hasDoc.file_id;
    db.pendingWithdrawals.push({ id: wId, userId: user.id, amount, qrFileId: fileId, createdAt: Date.now() });
    saveDB(db);
    const db2 = loadDB();
    if (db2.adminChatId) {
      try {
        await bot.telegram.sendPhoto(db2.adminChatId, fileId, {
          caption: `💸 <b>Withdraw Request</b>\n\n👤 ${esc(userLabel(user))}\n💵 Amount: <b>${fmtMoney(amount)}</b>\n🆔 ID: ${wId}\n\nប្រើ /admin → Approve Withdrawals`,
          parse_mode: 'HTML',
        });
      } catch (e) { console.error('Admin notify error:', e.message); }
    }
    await ctx.reply(
      `✅ <b>Withdraw Request Submitted!</b>\n\n💸 Amount: <b>${fmtMoney(amount)}</b>\nAdmin នឹងផ្ទៀងផ្ទាត់ក្នុងពេលឆាប់ៗ! ⏳`,
      { parse_mode: 'HTML', ...REPLY_KB }
    );
    return;
  }

  // ── User sends a photo (payment screenshot or random photo) ─────────────
  if (ctx.message.photo) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const pId = 'P' + Date.now();
    const db2 = loadDB();
    db2.pendingPayments.push({ id: pId, userId: user.id, duration: 'unknown', price: 0, screenshotFileId: fileId, createdAt: Date.now() });
    saveDB(db2);
    if (db2.adminChatId) {
      try {
        await bot.telegram.sendPhoto(db2.adminChatId, fileId, {
          caption: `💳 <b>Payment Screenshot</b>\n\n👤 ${esc(userLabel(user))}\n🆔 ID: ${pId}\n\nប្រើ /admin → Approve Payments`,
          parse_mode: 'HTML',
        });
      } catch {}
    }
    // Reply with confirmation + full inline menu buttons right next to the photo
    await ctx.reply(
      `📷 <b>Screenshot បានទទួល!</b>\n\n` +
      `⏳ Admin នឹង Review ហើយ Approve ក្នុងពេលឆាប់ៗ\n` +
      `✅ អ្នកនឹងទទួល Premium Code ពេល Approve!\n\n` +
      `ចូលប្រើ Menu ខាងក្រោម 👇`,
      { parse_mode: 'HTML', ...PHOTO_MENU_INLINE }
    );
    return;
  }

  // ── User sends any other file/sticker/etc. ────────────────────────────────
  if (ctx.message.sticker || ctx.message.document || ctx.message.animation || ctx.message.video) {
    await ctx.reply(
      `😊 អរគុណ!\n\nសូមជ្រើសសេវាកម្ម ឬចុច /start 👇`,
      { parse_mode: 'HTML', ...PHOTO_MENU_INLINE }
    );
    return;
  }

  // ── Default ───────────────────────────────────────────────────────────────
  if (ctx.message.text && !ctx.message.text.startsWith('/')) {
    await ctx.reply(
      `🤖 ជ្រើសសេវាកម្ម ឬចុច /start 👇`,
      { parse_mode: 'HTML', ...PHOTO_MENU_INLINE }
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
  if (msg.includes('user is deactivated')) return;
  console.error('Bot error:', msg);
  try { ctx.reply('❌ មានបញ្ហា។ សូម /start ម្ដងទៀត').catch(() => {}); } catch {}
});

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch().then(async () => {
  console.log('🤖 Telegram Premium Bot is running...');
  console.log(`👨‍💻 Admin: @${ADMIN_USERNAME}`);
  // Register bot commands (shows "Menu" button in Telegram)
  await bot.telegram.setMyCommands([
    { command: 'start',  description: '🚀 ចាប់ផ្ដើម / Show Menu' },
    { command: 'help',   description: '📢 Help' },
    { command: 'admin',  description: '👨‍💻 Admin Panel (Admin only)' },
    { command: 'notify', description: '📢 Broadcast message (Admin only)' },
  ]).catch(e => console.error('setMyCommands error:', e.message));
}).catch(err => {
  console.error('❌ Failed to start bot:', err.message);
  process.exit(1);
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
