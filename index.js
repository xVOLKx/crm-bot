// ============================================================
// 1. ПОДКЛЮЧЕНИЕ БИБЛИОТЕК И НАСТРОЙКА
// ============================================================
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Sequelize, DataTypes, Op } = require('sequelize');
const axios = require('axios');
const cron = require('node-cron');
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

// ============================================================
// 2. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
// ============================================================
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

// ============================================================
// 3. МОДЕЛИ (ТАБЛИЦЫ)
// ============================================================
const User = sequelize.define('User', {
  telegram_id: { type: DataTypes.BIGINT, unique: true, allowNull: false },
  full_name: { type: DataTypes.STRING },
  username: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'client' },
}, { tableName: 'users', timestamps: true });

const Client = sequelize.define('Client', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
}, { tableName: 'clients', timestamps: true });

const Order = sequelize.define('Order', {
  client_id: { type: DataTypes.INTEGER },
  manager_id: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'new' },
  description: { type: DataTypes.TEXT },
}, { tableName: 'orders', timestamps: true });

const OrderHistory = sequelize.define('OrderHistory', {
  order_id: { type: DataTypes.INTEGER },
  status_from: { type: DataTypes.STRING },
  status_to: { type: DataTypes.STRING },
  changed_by: { type: DataTypes.INTEGER },
}, { tableName: 'order_history', timestamps: true });

// ============================================================
// 3.5. СВЯЗИ МЕЖДУ МОДЕЛЯМИ
// ============================================================
Order.belongsTo(Client, { foreignKey: 'client_id' });
Client.hasMany(Order, { foreignKey: 'client_id' });

// ============================================================
// 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
async function isAdmin(ctx) {
  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  return user && user.role === 'admin';
}

// ============================================================
// УМНЫЙ ИИ С РАСШИРЕННЫМИ ФИЧАМИ
// ============================================================
async function smartAskYandexGPT(prompt, userId, ctx) {
  const text = prompt.toLowerCase();

  // --- 1. ОТЧЁТ ПО ДАТАМ ---
  if (text.includes('отчёт') || text.includes('отчет')) {
    let limit = 5;
    let days = null;

    if (text.includes('за 3 дня') || text.includes('за три дня')) days = 3;
    else if (text.includes('за неделю')) days = 7;
    else if (text.includes('за месяц')) days = 30;

    let whereClause = {};
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      whereClause.createdAt = { [Op.gte]: date };
    }

    const match = text.match(/\d+/);
    if (match) {
      const num = parseInt(match[0]);
      if (num >= 1 && num <= 20) limit = num;
    }

    const orders = await Order.findAll({
      include: [{ model: Client, attributes: ['name'] }],
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: limit,
    });

    if (orders.length === 0) {
      return days ? `📭 Заказов за последние ${days} дней нет.` : '📭 Заказов пока нет.';
    }

    const periodText = days ? `за последние ${days} дней` : '';
    let report = `📋 *Последние ${limit} заказов ${periodText}*:\n\n`;
    report += `┌─────────────────────────────────────────────┐\n`;
    orders.forEach((o) => {
      const clientName = o.Client ? o.Client.name : '❌ Клиент удалён';
      const statusEmoji = o.status === 'new' ? '🆕' :
                          o.status === 'in_progress' ? '⏳' :
                          o.status === 'completed' ? '✅' : '❓';
      const date = new Date(o.createdAt);
      const formattedDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      report += `│ #${o.id} | ${clientName.padEnd(20).slice(0, 20)} | ${statusEmoji} ${o.status.padEnd(10)} | ${formattedDate}\n`;
    });
    report += `└─────────────────────────────────────────────┘`;
    return report;
  }

  // --- 2. ТОП КЛИЕНТОВ ---
  if (text.includes('топ клиент') || text.includes('топ клиентов')) {
    const orders = await Order.findAll({
      include: [{ model: Client, attributes: ['name'] }],
      attributes: ['client_id'],
    });

    const clientCount = {};
    orders.forEach(o => {
      if (o.client_id) {
        clientCount[o.client_id] = (clientCount[o.client_id] || 0) + 1;
      }
    });

    const sorted = Object.entries(clientCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sorted.length === 0) {
      return '📭 Нет данных по клиентам.';
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    let report = '🏆 *Топ-5 клиентов по заказам:*\n\n';
    report += `┌──────────────────────────────────────┐\n`;
    for (let i = 0; i < sorted.length; i++) {
      const [clientId, count] = sorted[i];
      const client = await Client.findByPk(clientId);
      if (client) {
        report += `│ ${medals[i] || '•'} ${client.name.padEnd(20).slice(0, 20)} — ${count} заказов\n`;
      }
    }
    report += `└──────────────────────────────────────┘`;
    return report;
  }

  // --- 3. ПРОГНОЗ ---
  if (text.includes('прогноз')) {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekOrders = await Order.count({ where: { createdAt: { [Op.gte]: lastWeek } } });

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const prevWeekOrders = await Order.count({
      where: {
        createdAt: {
          [Op.gte]: twoWeeksAgo,
          [Op.lt]: lastWeek,
        },
      },
    });

    const trend = lastWeekOrders - prevWeekOrders;
    const emoji = trend > 0 ? '📈' : trend < 0 ? '📉' : '➖';
    const forecast = Math.round(lastWeekOrders * 1.1);

    return `🔮 *Прогноз заказов на следующую неделю:*\n\n` +
           `┌──────────────────────────────────────┐\n` +
           `│ 📅 Прошлая неделя: ${prevWeekOrders} заказов\n` +
           `│ 📅 Текущая неделя: ${lastWeekOrders} заказов\n` +
           `│ ${emoji} Тренд: ${trend > 0 ? '+' : ''}${trend}\n` +
           `│ 🎯 Ожидаем: ~${forecast} заказов\n` +
           `└──────────────────────────────────────┘`;
  }

  // --- 4. РЕКОМЕНДАЦИИ ПО КЛИЕНТАМ ---
  if (text.includes('рекомендац')) {
    const clients = await Client.findAll();
    let recommendations = '💡 *Рекомендации по клиентам:*\n\n';
    recommendations += `┌──────────────────────────────────────┐\n`;
    let hasRecommendations = false;

    for (const client of clients) {
      const orderCount = await Order.count({ where: { client_id: client.id } });
      if (orderCount >= 5) {
        recommendations += `│ • ${client.name.padEnd(20).slice(0, 20)}: ${orderCount} заказов. Скидка 5-10%\n`;
        hasRecommendations = true;
      } else if (orderCount >= 3) {
        recommendations += `│ • ${client.name.padEnd(20).slice(0, 20)}: ${orderCount} заказа. Доп. услуга\n`;
        hasRecommendations = true;
      }
    }

    recommendations += `└──────────────────────────────────────┘`;
    
    if (!hasRecommendations) {
      return '📭 Нет рекомендаций.';
    }
    return recommendations;
  }

  // --- 5. СТАТИСТИКА ---
  if (text.includes('статистик') || text.includes('сколько') || text.includes('цифр')) {
    const totalOrders = await Order.count();
    const newOrders = await Order.count({ where: { status: 'new' } });
    const inProgressOrders = await Order.count({ where: { status: 'in_progress' } });
    const completedOrders = await Order.count({ where: { status: 'completed' } });

    return `📊 *Статистика:*\n\n` +
           `┌──────────────────────────────────────┐\n` +
           `│ 📦 Всего заказов: ${totalOrders}\n` +
           `│ 🆕 Новых: ${newOrders}\n` +
           `│ ⏳ В работе: ${inProgressOrders}\n` +
           `│ ✅ Выполнено: ${completedOrders}\n` +
           `└──────────────────────────────────────┘`;
  }

  // --- 6. СРАВНЕНИЕ ПЕРИОДОВ С ГРАФИКОМ ---
if (text.includes('сравни неделю') || text.includes('сравни месяц')) {
  const days = text.includes('месяц') ? 30 : 7;
  
  const currentPeriodStart = new Date();
  currentPeriodStart.setDate(currentPeriodStart.getDate() - days);
  
  const prevPeriodStart = new Date();
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2);
  const prevPeriodEnd = new Date();
  prevPeriodEnd.setDate(prevPeriodEnd.getDate() - days);

  const currentOrders = await Order.findAll({
    where: { createdAt: { [Op.gte]: currentPeriodStart } },
    order: [['createdAt', 'ASC']],
  });

  const prevOrders = await Order.findAll({
    where: {
      createdAt: {
        [Op.gte]: prevPeriodStart,
        [Op.lt]: prevPeriodEnd,
      },
    },
    order: [['createdAt', 'ASC']],
  });

  const currentCount = currentOrders.length;
  const prevCount = prevOrders.length;

  // Если нет данных за оба периода
  if (currentCount === 0 && prevCount === 0) {
    return `📭 Недостаточно данных для сравнения ${days === 7 ? 'недель' : 'месяцев'}. Попробуйте позже.`;
  }

  // Группируем по дням
  const currentByDay = {};
  const prevByDay = {};

  currentOrders.forEach(o => {
    const day = new Date(o.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    currentByDay[day] = (currentByDay[day] || 0) + 1;
  });

  prevOrders.forEach(o => {
    const day = new Date(o.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    prevByDay[day] = (prevByDay[day] || 0) + 1;
  });

  // Собираем дни текущего периода
  const allDays = [];
  const startDate = new Date(currentPeriodStart);
  const endDate = new Date();
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    allDays.push(new Date(d));
  }

  const labels = allDays.slice(0, 7).map(d => 
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
  );
  
  const currentData = labels.map(day => currentByDay[day] || 0);
  const prevData = labels.map(day => prevByDay[day] || 0);

  // Создаём график
  const canvas = createCanvas(900, 500);
  const ctx2 = canvas.getContext('2d');

  ctx2.fillStyle = '#1a1a2e';
  ctx2.fillRect(0, 0, 900, 500);

  new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '📅 Текущий период',
          data: currentData,
          backgroundColor: 'rgba(79, 140, 247, 0.8)',
          borderColor: '#4F8CF7',
          borderWidth: 2,
          borderRadius: 4,
        },
        {
          label: '📅 Предыдущий период',
          data: prevData,
          backgroundColor: 'rgba(168, 85, 247, 0.6)',
          borderColor: '#A855F7',
          borderWidth: 2,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: { size: 14, weight: 'bold' },
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw} заказов`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: { size: 12 },
          },
          grid: {
            color: 'rgba(255,255,255,0.1)',
          },
        },
        y: {
          ticks: {
            color: '#ffffff',
            font: { size: 12 },
            stepSize: 1,
          },
          grid: {
            color: 'rgba(255,255,255,0.1)',
          },
        },
      },
    },
  });

  const chartBuffer = canvas.toBuffer('image/png');

  const diff = currentCount - prevCount;
  const percent = prevCount > 0 ? Math.round((diff / prevCount) * 100) : (currentCount > 0 ? 100 : 0);
  const emoji = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';

  // --- Анализ ---
  let analysisText = '';
  if (currentCount > 0 && prevCount === 0) {
    analysisText = `📈 *Первые заказы!* Отличный старт. Продолжайте привлекать клиентов.`;
  } else if (diff > 0) {
    analysisText = `📈 *Рост на ${percent}%* — заказов стало больше на ${diff} шт. Отличный результат!`;
  } else if (diff < 0) {
    analysisText = `📉 *Снижение на ${Math.abs(percent)}%* — заказов стало меньше на ${Math.abs(diff)} шт. Стоит обратить внимание.`;
  } else {
    analysisText = `➖ *Без изменений* — количество заказов на том же уровне.`;
  }

  const periodText = days === 7 ? 'недель' : 'месяцев';
  const caption = `📊 *Сравнение ${periodText}*\n\n` +
                  `┌─────────────────────────────────────────────┐\n` +
                  `│ 📅 Предыдущий период: ${prevCount} заказов\n` +
                  `│ 📅 Текущий период: ${currentCount} заказов\n` +
                  `│ ${emoji} Изменение: ${diff > 0 ? '+' : ''}${diff} (${percent}%)\n` +
                  `└─────────────────────────────────────────────┘\n\n` +
                  `🤖 *Анализ:*\n${analysisText}`;

  await ctx.telegram.sendPhoto(
    ctx.chat.id,
    { source: chartBuffer },
    { caption: caption, parse_mode: 'Markdown' }
  );
  return null;
}

  // --- 7. ВСЕ ОСТАЛЬНЫЕ ВОПРОСЫ (с ценами) ---
  const priceList = `
Примерные цены на услуги:
- Telegram-бот (базовый): от 2 500 ₽
- Telegram-бот с админ-панелью: от 3 500 ₽
- Бот-парсер (сбор данных с сайтов): от 3 000 ₽
- Бот-парсер с графиками и ИИ: от 4 000 ₽
- CRM-бот для бизнеса: от 5 000 ₽
- Интеграция с Google Sheets / API: от 2 000 ₽
`;

  const contextPrompt = `
Ты — помощник в CRM-системе.

Вот примерные цены на услуги (используй их, если спрашивают про цены):
${priceList}

Если спрашивают про разработку — скажи, что мы разрабатываем ботов, парсеры и CRM на Node.js.
Если вопрос не по теме — вежливо направь к деловым вопросам.
Отвечай кратко, по делу, дружелюбно.

Вопрос пользователя: "${prompt}"`;

  try {
    const response = await axios.post(
      'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        modelUri: `gpt://${process.env.YANDEX_FOLDER_ID}/yandexgpt-lite`,
        completionOptions: { temperature: 0.6, maxTokens: 250 },
        messages: [{ role: 'user', text: contextPrompt }],
      },
      {
        headers: {
          'Authorization': `Api-Key ${process.env.YANDEX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.result.alternatives[0].message.text;
  } catch (err) {
    console.error('❌ Ошибка ИИ:', err.message);
    return '⚠️ ИИ временно недоступен. Попробуйте позже.';
  }
}

// Комментарии при смене статуса
const statusComments = {
  'in_progress': '🤖 Заказ взят в работу. Средний срок выполнения — 2 дня.',
  'completed': '✅ Заказ выполнен! Если понадобится помощь — обращайтесь.',
  'new': '📥 Заказ принят. Ожидайте назначения менеджера.'
};

// Пагинация
const userPages = {};

async function sendOrdersPage(ctx, orders, page, totalPages) {
  const start = page * 5;
  const end = start + 5;
  const pageOrders = orders.slice(start, end);

  let text = `📋 *Список заказов (страница ${page + 1} из ${totalPages})*\n\n`;
  
  pageOrders.forEach((o) => {
    const clientName = o.Client ? o.Client.name : '❌ Клиент удалён';
    const statusEmoji = o.status === 'new' ? '🆕' :
                        o.status === 'in_progress' ? '⏳' :
                        o.status === 'completed' ? '✅' : '❓';
    const statusColor = o.status === 'new' ? '🟢' :
                        o.status === 'in_progress' ? '🟡' :
                        o.status === 'completed' ? '🔵' : '⚪️';

    const date = new Date(o.createdAt);
    const formattedDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    text += `┌──────────────────────────────────────┐\n`;
    text += `│ 🆔 *Заказ #${o.id}*\n`;
    text += `│ ─────────────────────────────────────\n`;
    text += `│ 👤 ${clientName}\n`;
    text += `│ 📝 ${o.description}\n`;
    text += `│ ${statusColor} Статус: ${statusEmoji} ${o.status}\n`;
    text += `│ 📅 ${formattedDate}\n`;
    text += `└──────────────────────────────────────┘\n\n`;
  });

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('◀️ Назад', `orders_page_${page - 1}`),
    Markup.button.callback('Вперед ▶️', `orders_page_${page + 1}`),
  ]);

  await ctx.reply(text, { ...keyboard });
}

// ============================================================
// 5. БОТ И ЕГО КОМАНДЫ
// ============================================================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- /start ----------
bot.start(async (ctx) => {
  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  if (!user) {
    await User.create({
      telegram_id: ctx.from.id,
      full_name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
      username: ctx.from.username,
    });
  }

  const keyboard = Markup.keyboard([
    ['📋 Клиенты', '➕ Добавить клиента'],
    ['📦 Заказы', '🔄 Статус заказа'],
    ['❓ Помощь']
  ]).resize();

  await ctx.reply(
    `👋 Добро пожаловать, ${ctx.from.first_name}!\n\n` +
    `📊 Это CRM-бот для управления клиентами и заказами.\n` +
    `Используйте кнопки внизу или вводите команды вручную.`,
    keyboard
  );
});

// ---------- /help ----------
bot.command('help', async (ctx) => {
  ctx.reply(
    '📌 Доступные команды:\n\n' +
    '/start — главное меню\n' +
    '/help — помощь\n' +
    '/add_client — добавить клиента\n' +
    '/clients — список клиентов\n' +
    '/add_order — добавить заказ\n' +
    '/orders — список заказов (админ)\n' +
    '/order_status — сменить статус заказа\n' +
    '/delete_order — удалить заказ (админ)\n' +
    '/set_role — назначить роль (админ)\n\n' +
    '📝 Примеры:\n' +
    '/add_client Алексей Иванов | +79123456789 | alex@mail.ru\n' +
    '/add_order 1 Разработка CRM-бота\n' +
    '/order_status 1\n' +
    '/delete_order 1\n' +
    '/set_role 123456789 admin'
  );
});

// ---------- /add_client ----------
bot.command('add_client', async (ctx) => {
  const args = ctx.message.text.split('|').map(s => s.trim());
  if (args.length < 2) return ctx.reply('❌ Формат: /add_client Имя | Телефон | Email');

  const name = args[0];
  const phone = args[1] || '';
  const email = args[2] || '';

  try {
    const newClient = await Client.create({ name, phone, email });
    ctx.reply(`✅ Клиент добавлен:\nИмя: ${newClient.name}\nТелефон: ${newClient.phone}\nEmail: ${newClient.email}`);
  } catch (err) {
    ctx.reply('❌ Ошибка при добавлении клиента.');
    console.error(err);
  }
});

// ---------- /clients ----------
bot.command('clients', async (ctx) => {
  try {
    const clients = await Client.findAll();
    if (clients.length === 0) return ctx.reply('📭 Список клиентов пуст.');

    let text = '📇 *Список клиентов:*\n\n';
    clients.forEach((c) => {
      text += `┌──────────────────────────────────────┐\n`;
      text += `│ 👤 *${c.name}*\n`;
      if (c.phone) text += `│ 📞 ${c.phone}\n`;
      if (c.email) text += `│ ✉️ ${c.email}\n`;
      text += `│ 🆔 ID: ${c.id}\n`;
      text += `└──────────────────────────────────────┘\n\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ Ошибка при получении списка клиентов.');
    console.error(err);
  }
});

// ---------- /add_order ----------
bot.command('add_order', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  if (parts.length < 3) {
    return ctx.reply('❌ Формат: /add_order client_id описание');
  }

  const clientId = parseInt(parts[1]);
  const description = parts.slice(2).join(' ');

  if (isNaN(clientId)) {
    return ctx.reply('❌ client_id должен быть числом. Используйте /clients, чтобы посмотреть ID.');
  }

  try {
    const client = await Client.findByPk(clientId);
    if (!client) {
      return ctx.reply(`❌ Клиент с ID ${clientId} не найден.`);
    }

    const newOrder = await Order.create({
      client_id: clientId,
      description: description,
      status: 'new',
    });

    ctx.reply(
      `✅ Заказ добавлен:\n` +
      `Клиент: ${client.name}\n` +
      `Описание: ${newOrder.description}\n` +
      `Статус: ${newOrder.status}`
    );
  } catch (err) {
    ctx.reply('❌ Ошибка при добавлении заказа.');
    console.error(err);
  }
});

// ---------- /orders ----------
bot.command('orders', async (ctx) => {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('⛔️ У вас нет прав для выполнения этой команды.');
  }

  try {
    const orders = await Order.findAll({
      include: [{ model: Client, attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });

    if (orders.length === 0) {
      return ctx.reply('📭 Заказов пока нет.');
    }

    const userId = ctx.from.id;
    userPages[userId] = 0;
    const totalPages = Math.ceil(orders.length / 5);

    await sendOrdersPage(ctx, orders, 0, totalPages);
  } catch (err) {
    ctx.reply('❌ Ошибка при получении списка заказов.');
    console.error(err);
  }
});

// ---------- /order_status ----------
bot.command('order_status', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('❌ Формат: /order_status order_id');
  }

  const orderId = parseInt(args[1]);
  if (isNaN(orderId)) {
    return ctx.reply('❌ order_id должен быть числом.');
  }

  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: Client, attributes: ['name'] }]
    });

    if (!order) {
      return ctx.reply(`❌ Заказ #${orderId} не найден.`);
    }

    const clientName = order.Client ? order.Client.name : '❌ Клиент удалён';
    const statusEmoji = order.status === 'new' ? '🆕' :
                        order.status === 'in_progress' ? '⏳' :
                        order.status === 'completed' ? '✅' : '❓';

    const date = new Date(order.createdAt);
    const formattedDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const text = `┌──────────────────────────────────────┐\n` +
                 `│ 🆔 *Заказ #${order.id}*\n` +
                 `│ ──────────────────────────────────────\n` +
                 `│ 👤 ${clientName}\n` +
                 `│ 📝 ${order.description}\n` +
                 `│ ${statusEmoji} Статус: ${order.status}\n` +
                 `│ 📅 ${formattedDate}\n` +
                 `└──────────────────────────────────────┘`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('🆕 Новый', `status_${order.id}_new`),
      Markup.button.callback('⏳ В работе', `status_${order.id}_in_progress`),
      Markup.button.callback('✅ Выполнен', `status_${order.id}_completed`),
    ]);

    await ctx.reply(text, { ...keyboard });
  } catch (err) {
    ctx.reply('❌ Ошибка при получении заказа.');
    console.error(err);
  }
});

// ---------- /delete_order ----------
bot.command('delete_order', async (ctx) => {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('⛔️ У вас нет прав для выполнения этой команды.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('❌ Формат: /delete_order order_id');
  }

  const orderId = parseInt(args[1]);
  if (isNaN(orderId)) {
    return ctx.reply('❌ order_id должен быть числом.');
  }

  try {
    const order = await Order.findByPk(orderId);
    if (!order) {
      return ctx.reply(`❌ Заказ #${orderId} не найден.`);
    }

    await order.destroy();
    ctx.reply(`✅ Заказ #${orderId} удалён.`);
  } catch (err) {
    ctx.reply('❌ Ошибка при удалении заказа.');
    console.error(err);
  }
});

// ---------- /set_role ----------
bot.command('set_role', async (ctx) => {
  if (!(await isAdmin(ctx))) {
    return ctx.reply('⛔️ У вас нет прав для выполнения этой команды.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('❌ Формат: /set_role telegram_id role\n\nДоступные роли: admin, manager, client');
  }

  const telegramId = parseInt(args[1]);
  const role = args[2].toLowerCase();

  if (isNaN(telegramId)) {
    return ctx.reply('❌ telegram_id должен быть числом.');
  }

  if (!['admin', 'manager', 'client'].includes(role)) {
    return ctx.reply('❌ Доступные роли: admin, manager, client');
  }

  try {
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    if (!user) {
      return ctx.reply(`❌ Пользователь с ID ${telegramId} не найден.`);
    }

    user.role = role;
    await user.save();
    ctx.reply(`✅ Роль пользователя ${user.full_name} изменена на ${role}`);
  } catch (err) {
    ctx.reply('❌ Ошибка при изменении роли.');
    console.error(err);
  }
});

// ---------- Пагинация ----------
bot.action(/orders_page_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const newPage = parseInt(ctx.match[1]);

  try {
    const orders = await Order.findAll({
      include: [{ model: Client, attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });

    const totalPages = Math.ceil(orders.length / 5);

    if (newPage < 0 || newPage >= totalPages) {
      return ctx.answerCbQuery('⛔️ Нет больше заказов');
    }

    await ctx.deleteMessage();
    await sendOrdersPage(ctx, orders, newPage, totalPages);
    await ctx.answerCbQuery();
  } catch (err) {
    console.error(err);
    await ctx.answerCbQuery('Ошибка').catch(() => {});
  }
});

// ---------- Кнопки статуса ----------
bot.action(/status_(\d+)_(.+)/, async (ctx) => {
  const orderId = parseInt(ctx.match[1]);
  const newStatus = ctx.match[2];

  try {
    const order = await Order.findByPk(orderId);
    if (!order) {
      return ctx.reply(`❌ Заказ #${orderId} не найден.`);
    }

    const oldStatus = order.status;
    order.status = newStatus;
    await order.save();

    await ctx.editMessageText(
      `✅ Статус заказа #${orderId} изменён:\n${oldStatus} → ${newStatus}`
    );
    await ctx.answerCbQuery(`Статус изменён на ${newStatus}`);

    const comment = statusComments[newStatus] || '🤖 Статус обновлён.';
    await ctx.reply(comment);
  } catch (err) {
    ctx.reply('❌ Ошибка при изменении статуса.');
    console.error(err);
  }
});

// ---------- Кнопки нижнего меню ----------
bot.hears('📋 Клиенты', async (ctx) => {
  await ctx.reply('📋 Введи команду: /clients');
});

bot.hears('➕ Добавить клиента', async (ctx) => {
  await ctx.reply('📝 Формат: /add_client Имя | Телефон | Email\n\nПример:\n/add_client Алексей Иванов | +79123456789 | alex@mail.ru');
});

bot.hears('📦 Заказы', async (ctx) => {
  await ctx.reply('📦 Введи команду: /orders');
});

bot.hears('🔄 Статус заказа', async (ctx) => {
  await ctx.reply('🔄 Формат: /order_status ID_заказа\n\nПример:\n/order_status 1');
});

bot.hears('❓ Помощь', async (ctx) => {
  await ctx.reply(
    '📌 Доступные команды:\n\n' +
    '/start — главное меню\n' +
    '/help — помощь\n' +
    '/add_client — добавить клиента\n' +
    '/clients — список клиентов\n' +
    '/add_order — добавить заказ\n' +
    '/orders — список заказов (админ)\n' +
    '/order_status — сменить статус заказа\n' +
    '/delete_order — удалить заказ (админ)\n' +
    '/set_role — назначить роль (админ)'
  );
});

// ---------- Умный ИИ ----------
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  if (!user) {
    return ctx.reply('❌ Вы не зарегистрированы. Используйте /start');
  }

  const reply = await smartAskYandexGPT(text, ctx.from.id, ctx);
  if (reply) {
    ctx.reply(`🤖 ${reply}`);
  }
});

// ============================================================
// 6. АВТО-ОТЧЁТ С ГРАФИКОМ (КАЖДЫЙ ДЕНЬ В 9:00)
// ============================================================
cron.schedule('0 9 * * *', async () => {
  try {
    // Собираем данные за последние 7 дней
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const orders = await Order.findAll({
      where: { createdAt: { [Op.gte]: weekAgo } },
      order: [['createdAt', 'ASC']],
    });

    // Группируем по дням
    const byDay = {};
    orders.forEach(o => {
      const day = new Date(o.createdAt).toLocaleDateString('ru-RU');
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Создаём график
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    const labels = Object.keys(byDay);
    const data = Object.values(byDay);

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Заказы по дням',
          data: data,
          backgroundColor: 'rgba(79, 140, 247, 0.7)',
          borderColor: '#4F8CF7',
          borderWidth: 2,
        }],
      },
      options: {
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#ffffff',
            },
          },
          y: {
            ticks: {
              color: '#ffffff',
            },
          },
        },
      },
    });

    const chartBuffer = canvas.toBuffer('image/png');

    // Статистика с красивой рамкой
    const totalOrders = await Order.count();
    const newOrders = await Order.count({ where: { status: 'new' } });
    const inProgressOrders = await Order.count({ where: { status: 'in_progress' } });
    const completedOrders = await Order.count({ where: { status: 'completed' } });

    const text = `📊 *Ежедневный отчёт*\n\n` +
                 `┌──────────────────────────────────────┐\n` +
                 `│ 📦 Всего заказов: ${totalOrders}\n` +
                 `│ 🆕 Новых: ${newOrders}\n` +
                 `│ ⏳ В работе: ${inProgressOrders}\n` +
                 `│ ✅ Выполнено: ${completedOrders}\n` +
                 `└──────────────────────────────────────┘`;

    await bot.telegram.sendPhoto(
      ADMIN_CHAT_ID,
      { source: chartBuffer },
      { caption: text, parse_mode: 'Markdown' }
    );
    console.log('✅ Ежедневный отчёт с графиком отправлен');
  } catch (err) {
    console.error('❌ Ошибка при отправке ежедневного отчёта:', err.message);
  }
});

// ============================================================
// 7. ЗАПУСК БОТА
// ============================================================
async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к базе данных успешно');

    await sequelize.sync({ alter: true });
    console.log('✅ Модели синхронизированы');

    bot.launch();
    console.log('✅ Бот запущен');
  } catch (err) {
    console.error('❌ Ошибка запуска:', err);
  }
}

start();