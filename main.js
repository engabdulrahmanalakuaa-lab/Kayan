const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('@vscode/sqlite3').verbose();
const fs = require('fs');

let mainWindow;

const dbDir = app.getPath('userData');
const dbPath = path.join(dbDir, 'restaurant.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('خطأ أثناء فتح قاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بنجاح بقاعدة البيانات في المسار: ' + dbPath);
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS inventory (\
        material TEXT PRIMARY KEY,\
        qty REAL,\
        unit TEXT\
    )`);

    db.get(\"SELECT COUNT(*) as count FROM inventory\", [], (err, row) => {
        if (!err && row && row.count === 0) {
            db.run(\"INSERT INTO inventory VALUES ('chicken', 150, 'حبة')\");
            db.run(\"INSERT INTO inventory VALUES ('rice', 100, 'كجم')\");
            db.run(\"INSERT INTO inventory VALUES ('drinks', 200, 'علبة')\");
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS menu_items (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        name TEXT,\
        price REAL,\
        recipe TEXT\
    )`);

    db.get(\"SELECT COUNT(*) as count FROM menu_items\", [], (err, row) => {
        if (!err && row && row.count === 0) {
            db.run(\"INSERT INTO menu_items (name, price, recipe) VALUES ('شواية مع الرز', 35, 'chicken_rice')\");
            db.run(\"INSERT INTO menu_items (name, price, recipe) VALUES ('نص شواية مع الرز', 18, 'half_chicken')\");
            db.run(\"INSERT INTO menu_items (name, price, recipe) VALUES ('نفر رز سادة', 7, 'rice_only')\");
            db.run(\"INSERT INTO menu_items (name, price, recipe) VALUES ('مشروب غازي', 3, 'drink')\");
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS sales (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        items TEXT,\
        total REAL,\
        date TEXT\
    )`);
});

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

ipcMain.on('get-menu', (event) => {
    db.all(\"SELECT * FROM menu_items\", [], (err, rows) => {
        if (!err) event.reply('menu-data', rows);
    });
});

ipcMain.on('get-inventory', (event) => {
    db.all(\"SELECT * FROM inventory\", [], (err, rows) => {
        if (!err) event.reply('inventory-data', rows);
    });
});

ipcMain.on('save-sale', (event, saleData) => {
    const { items, total } = saleData;
    const date = new Date().toISOString();
    db.run(\"INSERT INTO sales (items, total, date) VALUES (?, ?, ?)\", [JSON.stringify(items), total, date], function(err) {
        if (!err) event.reply('sale-saved', this.lastID);
    });
});

ipcMain.on('update-inventory', (event, inventoryData) => {
    const { chicken, rice, drinks } = inventoryData;
    db.serialize(() => {
        db.run(\"UPDATE inventory SET qty = ? WHERE material = 'chicken'\", [chicken]);
        db.run(\"UPDATE inventory SET qty = ? WHERE material = 'rice'\", [rice]);
        db.run(\"UPDATE inventory SET qty = ? WHERE material = 'drinks'\", [drinks]);
    });
    event.reply('inventory-updated');
});

ipcMain.on('add-menu-item', (event, item) => {
    db.run(\"INSERT INTO menu_items (name, price, recipe) VALUES (?, ?, ?)\", [item.name, item.price, item.recipe], function(err) {
        if (!err) event.reply('inventory-updated');
    });
});

ipcMain.on('deduct-stock-on-sale', (event, cart) => {
    db.serialize(() => {
        cart.forEach(item => {
            const qty = item.qty;
            if (item.recipe === 'chicken_rice') {
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'chicken'\", [1 * qty]);
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'rice'\", [0.5 * qty]);
            } else if (item.recipe === 'half_chicken') {
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'chicken'\", [0.5 * qty]);
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'rice'\", [0.25 * qty]);
            } else if (item.recipe === 'rice_only') {
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'rice'\", [0.5 * qty]);
            } else if (item.recipe === 'drink') {
                db.run(\"UPDATE inventory SET qty = qty - ? WHERE material = 'drinks'\", [1 * qty]);
            }
        });
        event.reply('inventory-updated');
    });
});

ipcMain.on('print-receipt', (event) => {
    if (mainWindow) {
        mainWindow.webContents.print({
            silent: true,
            printBackground: true
        });
    }
});
