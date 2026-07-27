const { Telegraf, Markup, session } = require('telegraf');
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
    // update username in case it changed
    db.users[id].username = ctx.from.username || db.users[id].username;
    db.users[id].firstName = ctx.from.first_name || db.users[id].firstName;
  }
  return db.users[id];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isAdmin(ctx) {
  const db = loadDB();
  const uid = String(ctx.from.id);
  return uid === String(db.adminChatId) || ctx.from.username === ADMIN_USERNAME;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TG';
  for (let i = 0; i < 18; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fmtMoney(n) { return '$' + Number(n).toFixed(2); }

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

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  // Register admin
  if (ctx.from.username === ADMIN_USERNAME) db.adminChatId = String(ctx.from.id);

  // Handle referral payload
  const payload = ctx.startPayload;
  if (payload && payload !== String(ctx.from.id) && !user.referredBy && db.users[payload]) {
    user.referredBy = payload;
  }

  user.state = null;
  user.stateData = {};
  saveDB(db);

  const name = ctx.from.first_name || 'បង';
  await ctx.reply(
    `🤖 *សូមស្វាគមន៍មកកាន់ Telegram Premium Service*\n\n` +
    `❤️ សួស្តី *${name}*!\n\n` +
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    { parse_mode: 'Markdown', ...MAIN_MENU }
  );
});

// ─── Back to main ─────────────────────────────────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = null;
  user.stateData = {};
  saveDB(db);
  await ctx.editMessageText(
    `🎉 សូមជ្រើសរើសសេវាកម្មខាងក្រោម 👇`,
    { parse_mode: 'Markdown', ...MAIN_MENU }
  );
});

// ─── 💎 Buy Premium ───────────────────────────────────────────────────────────
bot.action('buy_premium', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `💎 *Telegram Premium*\n\n❤️ សួស្តីបង!\n\nសូមជ្រើសរើស Package ដែលអ្នកចង់ទិញ 👇`,
    { parse_mode: 'Markdown', ...premiumKeyboard() }
  );
});

PACKAGES.forEach(pkg => {
  bot.action('pkg_' + pkg.id, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✅ *Telegram Premium ${pkg.duration}*\n\n` +
      `💵 តម្លៃ *${fmtMoney(pkg.price)}*\n\n` +
      `📷 សូម Scan QR Code ខាងក្រោម រួចបង់ប្រាក់\n\n` +
      `✅ បន្ទាប់ពីបង់ប្រាក់ សូមផ្ញើ Screenshot មក Admin\n👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'Markdown', ...BACK_BTN }
    );
    // Send QR image separately
    await ctx.replyWithPhoto(
      { source: QR_IMAGE_PATH },
      {
        caption: `💳 *ABA QR* — Telegram Premium ${pkg.duration} (${fmtMoney(pkg.price)})\n\nបង់រួចផ្ញើ Screenshot ទៅ 👤 @${ADMIN_USERNAME}`,
        parse_mode: 'Markdown',
      }
    );
  });
});

// ─── 🤖 AI Assistant ──────────────────────────────────────────────────────────
bot.action('ask_ai', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_ai';
  user.stateData = {};
  saveDB(db);
  await ctx.editMessageText(
    `🤖 *AI Assistant*\n\nសូមវាយសំណួររបស់អ្នក!\n\n` +
    `_ខ្ញុំអាចឆ្លើយអំពីៈ Telegram Premium, តម្លៃ, អត្ថប្រយោជន៍, របៀបទិញ, រយៈពេលរង់ចាំ, សុវត្ថិភាព_`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 🎮 Game Account ──────────────────────────────────────────────────────────
bot.action('buy_game', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🎮 *Game Account*\n\n` +
    `🎮 *MLBB* (Mobile Legends Bang Bang)\n` +
    `🎮 *Free Fire*\n\n` +
    `💵 តម្លៃចាប់ពី *4$* ឡើង\n\n` +
    `📩 សូមទាក់ទង Admin ដើម្បីទិញ\n👤 @${ADMIN_USERNAME}`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 👥 Referral ──────────────────────────────────────────────────────────────
bot.action('referral', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  // Get bot username
  let botUsername = '';
  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
  } catch {}

  const link = botUsername ? `https://t.me/${botUsername}?start=${user.id}` : `ចូល Bot ហើយ /start`;

  saveDB(db);
  await ctx.editMessageText(
    `👥 *Referral Program*\n\n` +
    `💰 *Reward:* 0.20$ / Premium Code ដែលបានប្រើ\n\n` +
    `🔗 *Referral Link របស់អ្នក:*\n\`${link}\`\n\n` +
    `📊 *Stats:*\n` +
    `👥 អ្នកណែនាំ: *${user.referralCount}* នាក់\n` +
    `💰 Earned: *${fmtMoney(user.wallet)}*\n\n` +
    `*របៀបទទួល 0.20$:*\n` +
    `1️⃣ ផ្ញើ Referral Link ទៅមិត្ត\n` +
    `2️⃣ មិត្តចូល Bot\n` +
    `3️⃣ មិត្តទិញ Telegram Premium\n` +
    `4️⃣ Admin អនុម័ត\n` +
    `5️⃣ Bot ផ្ញើ Premium Code ទៅមិត្ត\n` +
    `6️⃣ មិត្តបញ្ចូល Premium Code\n` +
    `7️⃣ Wallet របស់អ្នក ✅ *+0.20$*`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 🎁 Enter Premium Code ────────────────────────────────────────────────────
bot.action('enter_code', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  user.state = 'waiting_code';
  user.stateData = {};
  saveDB(db);
  await ctx.editMessageText(
    `🎁 *Premium Code*\n\nសូមវាយ Premium Code 20 តួ\n\n_ឧទាហរណ៍: TG8A9K4M2P1X7Q5R6N3Z_`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 💰 Wallet ────────────────────────────────────────────────────────────────
bot.action('wallet', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  saveDB(db);
  await ctx.editMessageText(
    `💰 *Wallet*\n\n` +
    `💵 Balance: *${fmtMoney(user.wallet)}*\n` +
    `👥 Referral Earned: *${user.referralCount}*\n` +
    `💎 Premium Purchased: *${user.premiumPurchased}*`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 💸 Withdraw ──────────────────────────────────────────────────────────────
bot.action('withdraw', async (ctx) => {
  await ctx.answerCbQuery();
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);

  if (user.wallet < 2.00) {
    saveDB(db);
    return ctx.editMessageText(
      `❌ *ដកប្រាក់មិនបាន*\n\nអ្នកត្រូវមាន *យ៉ាងតិច 2.00$* ដើម្បីដកប្រាក់។\n\n💰 Balance បច្ចុប្បន្ន: *${fmtMoney(user.wallet)}*`,
      { parse_mode: 'Markdown', ...BACK_BTN }
    );
  }

  user.state = 'waiting_withdraw_qr';
  user.stateData = {};
  saveDB(db);
  await ctx.editMessageText(
    `💸 *Withdraw*\n\n` +
    `💵 Balance: *${fmtMoney(user.wallet)}*\n\n` +
    `📷 សូមផ្ញើ *ABA QR* របស់អ្នក\n\nBot នឹងផ្ញើសំណើទៅ Admin ដើម្បីអនុម័ត។`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── 👨‍💻 Contact Admin ─────────────────────────────────────────────────────────
bot.action('contact_admin', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `👨‍💻 *Contact Admin*\n\n👉 @${ADMIN_USERNAME}\n\n_Admin ជួយ 24/7_`,
    { parse_mode: 'Markdown', ...BACK_BTN }
  );
});

// ─── Admin Panel ──────────────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('❌ អ្នកមិនមានសិទ្ធិ Admin');
  }
  const db = loadDB();
  const userCount = Object.keys(db.users).length;
  const codeCount = Object.keys(db.premiumCodes).length;
  const usedCodes = Object.values(db.premiumCodes).filter(c => c.used).length;
  const pendingPay = db.pendingPayments.length;
  const pendingWith = db.pendingWithdrawals.length;

  await ctx.reply(
    `👨‍💻 *Admin Panel*\n\n` +
    `👥 Users: *${userCount}*\n` +
    `🔐 Premium Codes: *${codeCount}* (ប្រើហើយ: ${usedCodes})\n` +
    `⏳ Pending Payments: *${pendingPay}*\n` +
    `⏳ Pending Withdrawals: *${pendingWith}*`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 មើល Users', 'adm_users')],
        [Markup.button.callback('🔐 Generate Premium Code', 'adm_gen_code')],
        [Markup.button.callback('✅ Approve Payments', 'adm_payments')],
        [Markup.button.callback('💸 Approve Withdrawals', 'adm_withdrawals')],
      ])
    }
  );
});

bot.action('adm_users', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const db = loadDB();
  const users = Object.values(db.users).slice(0, 20);
  let text = `👥 *Users (${Object.keys(db.users).length} total)*\n\n`;
  users.forEach(u => {
    text += `• ${u.firstName || 'N/A'}${u.username ? ' (@' + u.username + ')' : ''} — 💰${fmtMoney(u.wallet)} | 👥${u.referralCount}\n`;
  });
  if (Object.keys(db.users).length > 20) text += `\n_...and more_`;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
});

bot.action('adm_gen_code', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const db = loadDB();
  const code = generateCode();
  db.premiumCodes[code] = { code, used: false, usedBy: null, generatedAt: Date.now(), generatedBy: 'admin' };
  saveDB(db);
  await ctx.editMessageText(
    `🔐 *Premium Code បានបង្កើត!*\n\n\`${code}\`\n\n_ផ្ញើ Code នេះទៅ User បន្ទាប់ពី Approve Payment_`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }
  );
});

bot.action('adm_payments', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const db = loadDB();
  if (db.pendingPayments.length === 0) {
    return ctx.editMessageText('✅ គ្មាន Pending Payments', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  }
  const pay = db.pendingPayments[0];
  const user = db.users[pay.userId];
  await ctx.editMessageText(
    `💳 *Pending Payment*\n\n` +
    `👤 User: ${user?.firstName || 'N/A'}${user?.username ? ' (@' + user.username + ')' : ''}\n` +
    `💎 Package: ${pay.duration} (${fmtMoney(pay.price)})\n` +
    `📅 Date: ${new Date(pay.createdAt).toLocaleString()}\n\n` +
    `${db.pendingPayments.length} Pending total`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `adm_pay_ok_${pay.id}`),
          Markup.button.callback('❌ Reject', `adm_pay_no_${pay.id}`),
        ],
        [Markup.button.callback('🔙 Admin', 'adm_back')],
      ])
    }
  );
});

bot.action(/^adm_pay_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx === -1) return ctx.editMessageText('❌ Payment not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });

  const pay = db.pendingPayments.splice(idx, 1)[0];
  const user = db.users[pay.userId];
  if (user) {
    user.premiumPurchased = (user.premiumPurchased || 0) + 1;
    // If user was referred, save referrer info for when code is redeemed
    pay.referredBy = user.referredBy;
  }

  // Generate premium code
  const code = generateCode();
  db.premiumCodes[code] = {
    code, used: false, usedBy: null,
    generatedFor: pay.userId, referredBy: pay.referredBy,
    generatedAt: Date.now(), payId
  };
  saveDB(db);

  // Notify user
  try {
    await bot.telegram.sendMessage(
      pay.userId,
      `✅ *Payment Approved!*\n\n🎉 អរគុណសម្រាប់ការទិញ!\n\n🔐 *Premium Code របស់អ្នក:*\n\`${code}\`\n\nសូមចុច 🎁 បញ្ចូល Premium Code ដើម្បីបញ្ចូល Code!`,
      { parse_mode: 'Markdown', ...MAIN_MENU }
    );
  } catch (e) { console.error('Cannot notify user:', e.message); }

  await ctx.editMessageText(`✅ Approved! Code: \`${code}\` sent to user.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
});

bot.action(/^adm_pay_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const payId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingPayments.findIndex(p => p.id === payId);
  if (idx === -1) return ctx.editMessageText('❌ Payment not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  const pay = db.pendingPayments.splice(idx, 1)[0];
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      pay.userId,
      `❌ *Payment Rejected*\n\nការបង់ប្រាក់របស់អ្នកត្រូវបានបដិសេធ។\nសូមទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText('❌ Payment rejected.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
});

bot.action('adm_withdrawals', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  if (db.pendingWithdrawals.length === 0) {
    return ctx.editMessageText('✅ គ្មាន Pending Withdrawals', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  }
  const w = db.pendingWithdrawals[0];
  const user = db.users[w.userId];
  await ctx.editMessageText(
    `💸 *Pending Withdrawal*\n\n` +
    `👤 User: ${user?.firstName || 'N/A'}${user?.username ? ' (@' + user.username + ')' : ''}\n` +
    `💵 Amount: *${fmtMoney(w.amount)}*\n` +
    `📅 Date: ${new Date(w.createdAt).toLocaleString()}\n\n` +
    `${db.pendingWithdrawals.length} Pending total\n\n` +
    `_QR image sent separately_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `adm_with_ok_${w.id}`),
          Markup.button.callback('❌ Reject', `adm_with_no_${w.id}`),
        ],
        [Markup.button.callback('🔙 Admin', 'adm_back')],
      ])
    }
  );
});

bot.action(/^adm_with_ok_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx === -1) return ctx.editMessageText('❌ Not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  const prevBalance = user ? user.wallet : 0;
  if (user) {
    user.wallet = Math.max(0, user.wallet - w.amount);
    user.wallet = Math.round(user.wallet * 100) / 100;
  }
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      w.userId,
      `✅ *Withdraw Success!*\n\n` +
      `💸 ដក: *-${fmtMoney(w.amount)}*\n` +
      `💰 Balance: *${fmtMoney(user?.wallet || 0)}*\n\n` +
      `Admin បាញ់ប្រាក់ *${fmtMoney(w.amount)}* ទៅ ABA QR របស់អ្នករួចហើយ! 🎉`,
      { parse_mode: 'Markdown', ...MAIN_MENU }
    );
  } catch (e) {}

  await ctx.editMessageText(
    `✅ Withdraw approved!\nUser: ${user?.firstName} | ${fmtMoney(w.amount)} deducted.\nNew balance: ${fmtMoney(user?.wallet || 0)}`,
    { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) }
  );
});

bot.action(/^adm_with_no_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const wId = ctx.match[1];
  const db = loadDB();
  const idx = db.pendingWithdrawals.findIndex(w => w.id === wId);
  if (idx === -1) return ctx.editMessageText('❌ Not found', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  // Refund the locked amount
  if (user) {
    user.wallet = Math.round((user.wallet + w.amount) * 100) / 100;
  }
  saveDB(db);

  try {
    await bot.telegram.sendMessage(
      w.userId,
      `❌ *Withdraw Rejected*\n\nសំណើដកប្រាក់ត្រូវបានបដិសេធ។\n💰 Balance returned: *${fmtMoney(user?.wallet || 0)}*\n\nទាក់ទង Admin: 👤 @${ADMIN_USERNAME}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText('❌ Withdrawal rejected. Balance refunded.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Admin', 'adm_back')]]) });
});

bot.action('adm_back', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  const db = loadDB();
  const userCount = Object.keys(db.users).length;
  const codeCount = Object.keys(db.premiumCodes).length;
  const usedCodes = Object.values(db.premiumCodes).filter(c => c.used).length;
  await ctx.editMessageText(
    `👨‍💻 *Admin Panel*\n\n` +
    `👥 Users: *${userCount}*\n` +
    `🔐 Codes: *${codeCount}* (ប្រើហើយ: ${usedCodes})\n` +
    `⏳ Payments: *${db.pendingPayments.length}*\n` +
    `⏳ Withdrawals: *${db.pendingWithdrawals.length}*`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 មើល Users', 'adm_users')],
        [Markup.button.callback('🔐 Generate Premium Code', 'adm_gen_code')],
        [Markup.button.callback('✅ Approve Payments', 'adm_payments')],
        [Markup.button.callback('💸 Approve Withdrawals', 'adm_withdrawals')],
      ])
    }
  );
});

// ─── /notify command (Admin broadcast) ───────────────────────────────────────
bot.command('notify', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Admin Only');
  const text = ctx.message.text.replace('/notify', '').trim();
  if (!text) return ctx.reply('Usage: /notify <message>');
  const db = loadDB();
  const users = Object.values(db.users);
  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.id, `📢 *Announcement*\n\n${text}`, { parse_mode: 'Markdown' });
      sent++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 50)); // rate limit
  }
  ctx.reply(`📢 Sent: ${sent} | Failed: ${failed}`);
});

// ─── Message handler (state machine) ─────────────────────────────────────────
bot.on('message', async (ctx) => {
  const db = loadDB();
  const user = getOrCreateUser(db, ctx);
  const state = user.state;

  // ── AI mode ──
  if (state === 'waiting_ai') {
    const question = ctx.message.text;
    if (!question) return;
    const typingMsg = await ctx.reply('🤖 _កំពុងគិត..._', { parse_mode: 'Markdown' });

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a Telegram Premium Sales Bot. 
Answer questions about: Telegram Premium features, pricing (1 month $4.99, 3 months $12.99, 6 months $17.49, 1 year $31.99), benefits, how to buy, delivery time, and safety/security.
Respond in Khmer (Cambodian) language when the user writes in Khmer. Be friendly, concise, and helpful.
The admin is @CryptoSinnals_99K. Payment is via ABA QR code.`
          },
          { role: 'user', content: question }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const answer = completion.choices[0]?.message?.content || 'សូមអភ័យទោស, មានបញ្ហាក្នុងការឆ្លើយ';
      await bot.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, null, `🤖 *AI Assistant*\n\n${answer}\n\n_សួរទៀតបាន ឬចុច 🔙 ដើម្បីត្រឡប់_`, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Groq error:', e.message);
      await bot.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, null, '❌ AI Error. សូមព្យាយាមម្ដងទៀត', {});
    }

    // Keep in AI mode; show back button
    await ctx.reply('💬 _វាយសំណួរថ្មីទៀត ឬ_', { parse_mode: 'Markdown', ...BACK_BTN });
    return;
  }

  // ── Premium Code mode ──
  if (state === 'waiting_code') {
    const code = (ctx.message.text || '').trim().toUpperCase();
    if (code.length !== 20) {
      return ctx.reply('❌ Code ត្រូវតែ 20 តួ! សូមព្យាយាមម្ដងទៀត');
    }

    const codeEntry = db.premiumCodes[code];
    if (!codeEntry) {
      user.state = null;
      saveDB(db);
      return ctx.reply('❌ Code មិនត្រឹមត្រូវ ឬមិនមាននៅក្នុងប្រព័ន្ធ!', BACK_BTN);
    }
    if (codeEntry.used) {
      user.state = null;
      saveDB(db);
      return ctx.reply('❌ Code នេះត្រូវបានប្រើរួចហើយ!', BACK_BTN);
    }
    if (codeEntry.usedBy === user.id) {
      user.state = null;
      saveDB(db);
      return ctx.reply('❌ អ្នកបានប្រើ Code នេះរួចហើយ!', BACK_BTN);
    }

    // Mark code as used
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
      // Notify referrer
      try {
        await bot.telegram.sendMessage(
          referrerId,
          `🎉 *Referral Bonus!*\n\n👥 មិត្តរបស់អ្នកទើបតែប្រើ Premium Code!\n💰 Wallet +*0.20$*\n\n💵 Balance: *${fmtMoney(db.users[referrerId].wallet)}*`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    user.state = null;
    saveDB(db);

    await ctx.reply(
      `✅ *Code Accepted!*\n\n\`${code}\`\n\n` +
      (referrerRewarded ? `👥 Referral Bonus sent to your referrer: *+0.20$*\n\n` : '') +
      `🎉 Telegram Premium activated!\nច្រើនអរគុណ! 💎`,
      { parse_mode: 'Markdown', ...MAIN_MENU }
    );
    return;
  }

  // ── Withdraw QR mode ──
  if (state === 'waiting_withdraw_qr') {
    const hasPhoto = ctx.message.photo;
    const hasDoc = ctx.message.document;

    if (!hasPhoto && !hasDoc) {
      return ctx.reply('📷 សូមផ្ញើ *ABA QR* ជា រូបភាព', { parse_mode: 'Markdown' });
    }

    const amount = 2.00; // Fixed withdrawal amount
    if (user.wallet < amount) {
      user.state = null;
      saveDB(db);
      return ctx.reply(`❌ Balance មិនគ្រប់! Balance: *${fmtMoney(user.wallet)}*`, { parse_mode: 'Markdown', ...BACK_BTN });
    }

    // Lock the amount
    user.wallet = Math.round((user.wallet - amount) * 100) / 100;
    user.state = null;

    const withdrawId = 'W' + Date.now();
    const fileId = hasPhoto ? hasPhoto[hasPhoto.length - 1].file_id : hasDoc.file_id;

    db.pendingWithdrawals.push({
      id: withdrawId,
      userId: user.id,
      amount,
      qrFileId: fileId,
      createdAt: Date.now(),
    });
    saveDB(db);

    // Notify admin
    const db2 = loadDB();
    if (db2.adminChatId) {
      try {
        await bot.telegram.sendPhoto(
          db2.adminChatId,
          fileId,
          {
            caption: `💸 *Withdraw Request*\n\n👤 ${user.firstName}${user.username ? ' (@' + user.username + ')' : ''}\n💵 Amount: *${fmtMoney(amount)}*\n🆔 ID: ${withdrawId}`,
            parse_mode: 'Markdown',
          }
        );
        await bot.telegram.sendMessage(
          db2.adminChatId,
          `Approve or reject? Use /admin → Approve Withdrawals`,
          {}
        );
      } catch (e) { console.error('Admin notify error:', e.message); }
    }

    await ctx.reply(
      `✅ *Withdraw Request Submitted!*\n\n💸 Amount: *${fmtMoney(amount)}*\nAAdmin នឹងផ្ទៀងផ្ទាត់ក្នុងពេលឆាប់ៗ! ⏳`,
      { parse_mode: 'Markdown', ...MAIN_MENU }
    );
    return;
  }

  // ── Default: Payment screenshot ──
  // If user sends a photo in normal state, treat as payment screenshot
  if (ctx.message.photo) {
    await ctx.reply(
      `📷 បានទទួល Screenshot!\n\nAdmin នឹង Review ហើយ Approve ក្នុងពេលឆាប់ៗ.\n\nប្រសិនបើអ្នកមិនទាន់បង់ប្រាក់ ចូរ ►ទិញ Premium◄ ជាមុន!`,
      BACK_BTN
    );
    return;
  }

  // Default fallback
  if (ctx.message.text && !ctx.message.text.startsWith('/')) {
    await ctx.reply(
      `🤖 ចុច /start ដើម្បីចាប់ផ្ដើមម្ដងទៀត ឬជ្រើសរើស Menu 👇`,
      MAIN_MENU
    );
  }
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📢 *Help*\n\nបើរក Menu មិនឃើញ:\nចុច *Menu* រួច */start*\n\n` +
    `👨‍💻 Contact: @${ADMIN_USERNAME}`,
    { parse_mode: 'Markdown', ...MAIN_MENU }
  );
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

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
