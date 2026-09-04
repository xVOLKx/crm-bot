# <img src="images/bot.svg" width="32"> CRM-бот для бизнеса

Telegram-бот для управления клиентами, заказами, статусами, аналитикой, с ИИ-помощником и графиками.

[![Node.js](https://img.shields.io/badge/Node.js-18-green)](#)
[![Telegraf](https://img.shields.io/badge/Telegraf-4.x-blue)](#)
[![Yandex GPT](https://img.shields.io/badge/Yandex%20GPT-API-blueviolet)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)

## <img src="images/link.svg" width="24"> Живой пример

[Перейти к боту](https://t.me/XvolkX_crm_bot)

## <img src="images/features.svg" width="24"> Функции

- <img src="images/contacts.svg" width="18"> Управление клиентами — добавление, список, карточка клиента
- <img src="images/orders.svg" width="20"> Управление заказами — создание, статусы, пагинация, фильтрация
- <img src="images/analytics.svg" width="20"> Аналитика и отчёты — статистика, прогнозы, топ клиентов
- <img src="images/ai.svg" width="20"> ИИ-помощник — отвечает на вопросы, даёт рекомендации
- <img src="images/roles.svg" width="20"> Роли и права — админ, менеджер, клиент
- <img src="images/database.svg" width="20"> Авто-отчёты — ежедневные отчёты админу
- <img src="images/shield.svg" width="20"> Безопасность — только админы видят все заказы
- <img src="images/chat.svg" width="20"> Нижнее меню — удобное управление через кнопки

## <img src="images/install.svg" width="24"> Как запустить локально

1. Клонируй репозиторий:
   ```bash
   git clone https://github.com/xVOLKx/parser-analytics-bot.git
   cd crm-bot
   ```
2. Установи зависимости:
    ```bash
    npm install
    ```
3. Создай файл .env и добавь:
    ```bash
    DB_USER=postgres
    DB_PASSWORD=твой_пароль
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=crm_bot
    BOT_TOKEN=твой_токен
    YANDEX_API_KEY=твой_ключ
    YANDEX_FOLDER_ID=твой_folder_id

    ```
4. Запусти:
    ```bash
    node index.js
    ```
## <img src="images/tech.svg" width="24" align="vertical-align: middle"> Технологии 

- <img src="images/node.svg" width="24"> Node.js + Telegraf
- <img src="images/database.svg" width="24"> PostgreSQL + Sequelize
- <img src="images/ai.svg" width="24"> Yandex GPT
- <img src="images/chart.svg" width="24"> Chart.js (графики)
- <img src="images/parser.svg" width="24"> Axios (API-запросы)

## <img src="images/github.svg" width="24"> GitHub
[Перейти в репозиторий](https://github.com/xVOLKx/crm-bot)

## <img src="images/license.svg" width="28"> Лицензия

MIT © [xVOLKx](https://github.com/xVOLKx)
