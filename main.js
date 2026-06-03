const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

let mainWindow;

const dbDir = app.getPath('userData');
const dbPath = path.join(dbDir, 'restaurant.db');

let db;
try {
    db = new Database(dbPath);
    console.log('تم الاتصال بنجاح بقاعدة البيانات في المسار: ' + dbPath);
} catch (err) {
    console.error('خطأ أثناء فتح قاعدة البيانات:', err.message);
    app.quit();
}

// تفعيل وضع WAL لتحسين الأداء
db.pragma('journal_mode = WAL');

// إنشاء الجداول
db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
        material TEXT PRIMARY KEY,
        qty REAL,
        unit TEXT
    );

    CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        recipe TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        items TEXT,
        total REAL,
        date TEXT
    );
`);

// إدخال البيانات الافتراضية إذا كانت الجداول فارغة
const invCount = db.prepare('SELECT COUNT(*) as count FROM inventory').get().count;
if (invCount === 0) {
    db.prepare("INSERT INTO inventory VALUES ('chicken', 150, 'حبة')").run();
    db.prepare("INSERT INTO inventory VALUES ('rice', 100, 'كجم')").run();
    db.prepare("INSERT INTO inventory VALUES ('drinks', 200, 'علبة')").run();
}

const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get().count;
if (menuCount === 0) {
    db.prepare("INSERT INTO menu_items (name, price, recipe) VALUES ('شواية مع الرز', 35, 'chicken_rice')").run();
    db.prepare("INSERT INTO menu_items (name, price, recipe) VALUES ('نص شواية مع الرز', 18, 'half_chicken')").run();
    db.prepare("INSERT INTO menu_items (name, price, recipe) VALUES ('نفر رز سادة', 7, 'rice_only')").run();
    db.prepare("INSERT INTO menu_items (name, price, recipe) VALUES ('مشروب غازي', 3, 'drink')").run();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers ---
ipcMain.on('get-menu', (event) => {
    const rows = db.prepare("SELECT * FROM menu_items").all();
    event.reply('menu-data', rows);
});

ipcMain.on('get-inventory', (event) => {
    const rows = db.prepare("SELECT * FROM inventory").all();
    event.reply('inventory-data', rows);
});

ipcMain.on('save-sale', (event, saleData) => {
    const { items, total } = saleData;
    const date = new Date().toISOString();
    const stmt = db.prepare("INSERT INTO sales (items, total, date) VALUES (?, ?, ?)");
    const result = stmt.run(JSON.stringify(items), total, date);
    event.reply('sale-saved', result.lastInsertRowid);
});

ipcMain.on('update-inventory', (event, inventoryData) => {
    const { chicken, rice, drinks } = inventoryData;
    db.prepare("UPDATE inventory SET qty = ? WHERE material = 'chicken'").run(chicken);
    db.prepare("UPDATE inventory SET qty = ? WHERE material = 'rice'").run(rice);
    db.prepare("UPDATE inventory SET qty = ? WHERE material = 'drinks'").run(drinks);
    event.reply('inventory-updated');
});

ipcMain.on('add-menu-item', (event, item) => {
    db.prepare("INSERT INTO menu_items (name, price, recipe) VALUES (?, ?, ?)").run(item.name, item.price, item.recipe);
    event.reply('inventory-updated');
});

ipcMain.on('deduct-stock-on-sale', (event, cart) => {
    const updateChicken = db.prepare("UPDATE inventory SET qty = qty - ? WHERE material = 'chicken'");
    const updateRice = db.prepare("UPDATE inventory SET qty = qty - ? WHERE material = 'rice'");
    const updateDrinks = db.prepare("UPDATE inventory SET qty = qty - ? WHERE material = 'drinks'");

    cart.forEach(item => {
        const qty = item.qty;
        if (item.recipe === 'chicken_rice') {
            updateChicken.run(1 * qty);
            updateRice.run(0.5 * qty);
        } else if (item.recipe === 'half_chicken') {
            updateChicken.run(0.5 * qty);
            updateRice.run(0.25 * qty);
        } else if (item.recipe === 'rice_only') {
            updateRice.run(0.5 * qty);
        } else if (item.recipe === 'drink') {
            updateDrinks.run(1 * qty);
        }
    });
    event.reply('inventory-updated');
});

ipcMain.on('print-receipt', (event) => {
    if (mainWindow) {
        mainWindow.webContents.print({
            silent: true,
            printBackground: true
        });
    }
});
