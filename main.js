const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

let mainWindow;
let db;
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database.db');
const imagesDir = path.join(userDataPath, 'product-images');

// ============ دالة تجزئة كود التفعيل ============
function hashActivationCode(code) {
    // استخدام SHA-256 مع salt ثابت (خاص بالنظام)
    const salt = 'TechSoft-Restaurant-2024-Salt-Key';
    return crypto.createHash('sha256').update(salt + code).digest('hex');
}

// كود التفعيل الصحيح (مخزن بشكل مجزأ)
const VALID_ACTIVATION_HASH = hashActivationCode('773579486967015');

function initializeDatabase() {
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON'); // تفعيل قيود المفاتيح الأجنبية
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS activation (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            code_hash TEXT,
            activated INTEGER DEFAULT 0
        );
        INSERT OR IGNORE INTO activation (id, activated) VALUES (1, 0);

        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            full_name TEXT,
            username TEXT,
            password_hash TEXT,
            role TEXT DEFAULT 'admin',
            is_blocked INTEGER DEFAULT 0,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            company_id INTEGER PRIMARY KEY,
            safe_mode INTEGER DEFAULT 0,
            currency TEXT DEFAULT 'SAR',
            pagination INTEGER DEFAULT 20,
            show_company_screen INTEGER DEFAULT 1,
            profit_margin_percent REAL DEFAULT 30,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            name TEXT,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            name TEXT,
            category_id INTEGER,
            price REAL CHECK(price >= 0),
            barcode TEXT,
            recipe TEXT,
            image TEXT DEFAULT '',
            unit TEXT DEFAULT 'قطعة',
            daily_forecast INTEGER DEFAULT 0,
            monthly_forecast INTEGER DEFAULT 0,
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS raw_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            name TEXT,
            unit TEXT,
            current_stock REAL DEFAULT 0,
            min_stock REAL DEFAULT 0,
            purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            name TEXT,
            hall TEXT,
            seats INTEGER,
            status TEXT DEFAULT 'free',
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS waiters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            name TEXT,
            user_id INTEGER,
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            user_id INTEGER,
            opening_cash REAL,
            closing_cash REAL,
            date TEXT,
            status TEXT DEFAULT 'open',
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            table_id INTEGER,
            waiter_id INTEGER,
            user_id INTEGER,
            total REAL,
            date TEXT,
            time TEXT,
            shift_id INTEGER,
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (table_id) REFERENCES tables(id),
            FOREIGN KEY (waiter_id) REFERENCES waiters(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id INTEGER,
            qty INTEGER,
            price REAL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            material_id INTEGER,
            qty_change REAL,
            type TEXT,
            reference TEXT,
            date TEXT,
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (material_id) REFERENCES raw_materials(id)
        );

        CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            code TEXT,
            name TEXT,
            parent_id INTEGER,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            date TEXT,
            description TEXT,
            ref_type TEXT,
            ref_id INTEGER,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS journal_entry_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER,
            account_id INTEGER,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            FOREIGN KEY (entry_id) REFERENCES journal_entries(id),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            month TEXT NOT NULL,
            category TEXT,
            description TEXT,
            amount REAL DEFAULT 0 CHECK(amount >= 0),
            type TEXT DEFAULT 'fixed',
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );
    `);

    // إنشاء فهارس لتحسين الأداء
    try {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
            CREATE INDEX IF NOT EXISTS idx_orders_company_date ON orders(company_id, date);
            CREATE INDEX IF NOT EXISTS idx_raw_materials_company ON raw_materials(company_id);
        `);
    } catch(e) {}
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'icon.ico')
    });
    mainWindow.loadFile('index.html');
    mainWindow.setMenu(null);
}

app.whenReady().then(() => {
    initializeDatabase();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ========== دوال مساعدة ==========
function sendError(event, message) {
    return { success: false, error: message };
}

function sendSuccess(data = {}) {
    return { success: true, ...data };
}

// ========== قنوات IPC ==========
ipcMain.handle('db-query', (event, sql, params) => {
    try {
        const stmt = db.prepare(sql);
        const rows = params ? stmt.all(params) : stmt.all();
        return { success: true, data: rows };
    } catch (e) {
        console.error('db-query error:', e.message);
        return sendError(event, 'خطأ في استعلام قاعدة البيانات: ' + e.message);
    }
});

ipcMain.handle('db-run', (event, sql, params) => {
    try {
        const stmt = db.prepare(sql);
        const info = params ? stmt.run(params) : stmt.run();
        return { success: true, changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    } catch (e) {
        console.error('db-run error:', e.message);
        return sendError(event, 'خطأ في تنفيذ العملية: ' + e.message);
    }
});

ipcMain.handle('db-get', (event, sql, params) => {
    try {
        const stmt = db.prepare(sql);
        const row = params ? stmt.get(params) : stmt.get();
        return { success: true, data: row };
    } catch (e) {
        console.error('db-get error:', e.message);
        return sendError(event, 'خطأ في استعلام قاعدة البيانات: ' + e.message);
    }
});

ipcMain.handle('check-activation', () => {
    try {
        const row = db.prepare('SELECT activated FROM activation WHERE id = 1').get();
        return { success: true, activated: row ? row.activated === 1 : false };
    } catch (e) {
        return { success: true, activated: false };
    }
});

ipcMain.handle('activate', (event, code) => {
    try {
        if (!code || code.length === 0) {
            return sendError(event, 'كود التفعيل غير صالح');
        }
        const inputHash = hashActivationCode(code);
        if (inputHash === VALID_ACTIVATION_HASH) {
            db.prepare('UPDATE activation SET code_hash = ?, activated = 1 WHERE id = 1').run(inputHash);
            return sendSuccess({ message: 'تم التفعيل بنجاح' });
        }
        return sendError(event, 'كود التفعيل غير صحيح');
    } catch (e) {
        return sendError(event, 'خطأ في عملية التفعيل');
    }
});

// التحقق من صحة المنتج قبل الحفظ
function validateProduct(data) {
    if (!data.name || data.name.trim().length === 0) return 'اسم المنتج مطلوب';
    if (isNaN(data.price) || data.price < 0) return 'السعر يجب أن يكون رقماً موجباً';
    if (data.price > 999999.99) return 'السعر كبير جداً';
    if (data.name.length > 100) return 'اسم المنتج طويل جداً';
    return null;
}

// التحقق من صحة المادة الخام
function validateMaterial(data) {
    if (!data.name || data.name.trim().length === 0) return 'اسم المادة مطلوب';
    if (data.name.length > 100) return 'اسم المادة طويل جداً';
    if (isNaN(data.purchase_price) || data.purchase_price < 0) return 'سعر الشراء يجب أن يكون رقماً موجباً';
    if (isNaN(data.min_stock) || data.min_stock < 0) return 'الحد الأدنى يجب أن يكون رقماً موجباً';
    return null;
}

// حذف ملف الصورة
function deleteImageFile(relativePath) {
    if (!relativePath) return;
    try {
        const fullPath = path.join(userDataPath, relativePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    } catch (e) {
        console.error('Error deleting image:', e.message);
    }
}

// قناة محسنة لحفظ المنتج
ipcMain.handle('save-product', (event, data) => {
    try {
        const validationError = validateProduct(data);
        if (validationError) return sendError(event, validationError);

        if (data.id) {
            db.prepare(`UPDATE products SET name=?, price=?, category_id=?, barcode=?, recipe=?, image=? WHERE id=? AND company_id=?`)
                .run(data.name.trim(), data.price, data.category_id, data.barcode, data.recipe, data.image || '', data.id, data.company_id);
            return sendSuccess({ id: data.id });
        } else {
            const info = db.prepare(`INSERT INTO products (company_id, name, price, category_id, barcode, recipe, image) VALUES (?,?,?,?,?,?,?)`)
                .run(data.company_id, data.name.trim(), data.price, data.category_id, data.barcode, data.recipe, data.image || '');
            return sendSuccess({ id: info.lastInsertRowid });
        }
    } catch (e) {
        console.error('save-product error:', e.message);
        return sendError(event, 'خطأ في حفظ المنتج: ' + e.message);
    }
});

// قناة محسنة لحذف المنتج مع حذف الصورة
ipcMain.handle('delete-product', (event, { id, company_id }) => {
    try {
        // جلب مسار الصورة قبل الحذف
        const product = db.prepare('SELECT image FROM products WHERE id=? AND company_id=?').get(id, company_id);
        if (product && product.image) {
            deleteImageFile(product.image);
        }
        db.prepare('DELETE FROM products WHERE id=? AND company_id=?').run(id, company_id);
        return sendSuccess();
    } catch (e) {
        console.error('delete-product error:', e.message);
        return sendError(event, 'خطأ في حذف المنتج: ' + e.message);
    }
});

// حفظ المادة الخام مع تحقق
ipcMain.handle('save-material', (event, data) => {
    try {
        const validationError = validateMaterial(data);
        if (validationError) return sendError(event, validationError);

        if (data.id) {
            db.prepare('UPDATE raw_materials SET name=?, unit=?, min_stock=?, purchase_price=? WHERE id=? AND company_id=?')
                .run(data.name.trim(), data.unit, data.min_stock, data.purchase_price, data.id, data.company_id);
            return sendSuccess({ id: data.id });
        } else {
            const info = db.prepare('INSERT INTO raw_materials (company_id, name, unit, min_stock, purchase_price) VALUES (?,?,?,?,?)')
                .run(data.company_id, data.name.trim(), data.unit, data.min_stock, data.purchase_price);
            return sendSuccess({ id: info.lastInsertRowid });
        }
    } catch (e) {
        console.error('save-material error:', e.message);
        return sendError(event, 'خطأ في حفظ المادة: ' + e.message);
    }
});

// حذف مادة خام مع التحقق من عدم استخدامها في وصفات
ipcMain.handle('delete-material', (event, { id, company_id }) => {
    try {
        // التحقق من استخدام المادة في وصفات
        const products = db.prepare('SELECT id, name, recipe FROM products WHERE company_id=? AND recipe IS NOT NULL AND recipe != ?').all(company_id, '[]');
        let usedInProducts = [];
        
        for (let p of products) {
            try {
                const recipe = JSON.parse(p.recipe);
                if (recipe.some(r => r.material_id === id)) {
                    usedInProducts.push(p.name);
                }
            } catch(e) {}
        }
        
        if (usedInProducts.length > 0) {
            return sendError(event, `لا يمكن حذف هذه المادة لأنها مستخدمة في المنتجات: ${usedInProducts.join('، ')}`);
        }
        
        db.prepare('DELETE FROM raw_materials WHERE id=? AND company_id=?').run(id, company_id);
        return sendSuccess();
    } catch (e) {
        console.error('delete-material error:', e.message);
        return sendError(event, 'خطأ في حذف المادة: ' + e.message);
    }
});

// تسجيل الدخول مع تشفير كلمة المرور
ipcMain.handle('login', (event, { username, password, company_id }) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE username=? AND company_id=? AND is_blocked=0')
            .get(username, company_id);
        
        if (!user) return sendError(event, 'بيانات الدخول خاطئة');
        
        // التحقق من كلمة المرور
        const isValid = bcrypt.compareSync(password, user.password_hash);
        if (!isValid) return sendError(event, 'بيانات الدخول خاطئة');
        
        // لا نعيد كلمة المرور في الاستجابة
        const { password_hash, ...safeUser } = user;
        return sendSuccess({ user: safeUser });
    } catch (e) {
        console.error('login error:', e.message);
        return sendError(event, 'خطأ في تسجيل الدخول');
    }
});

// إنشاء مستخدم مع تشفير كلمة المرور
ipcMain.handle('create-user', (event, data) => {
    try {
        if (!data.full_name || !data.username || !data.password) {
            return sendError(event, 'جميع الحقول مطلوبة');
        }
        
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(data.password, salt);
        
        const info = db.prepare('INSERT INTO users (company_id, full_name, username, password_hash, role) VALUES (?,?,?,?,?)')
            .run(data.company_id, data.full_name.trim(), data.username.trim(), hashedPassword, data.role || 'admin');
        return sendSuccess({ id: info.lastInsertRowid });
    } catch (e) {
        console.error('create-user error:', e.message);
        return sendError(event, 'خطأ في إنشاء المستخدم: ' + e.message);
    }
});

// تحديث مستخدم
ipcMain.handle('update-user', (event, data) => {
    try {
        if (!data.full_name || !data.username) {
            return sendError(event, 'الاسم واسم المستخدم مطلوبان');
        }
        
        if (data.password) {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(data.password, salt);
            db.prepare('UPDATE users SET full_name=?, username=?, password_hash=?, role=? WHERE id=? AND company_id=?')
                .run(data.full_name.trim(), data.username.trim(), hashedPassword, data.role, data.id, data.company_id);
        } else {
            db.prepare('UPDATE users SET full_name=?, username=?, role=? WHERE id=? AND company_id=?')
                .run(data.full_name.trim(), data.username.trim(), data.role, data.id, data.company_id);
        }
        return sendSuccess();
    } catch (e) {
        console.error('update-user error:', e.message);
        return sendError(event, 'خطأ في تحديث المستخدم');
    }
});

// إنشاء شركة مع مستخدم افتراضي (كلمة مرور مشفرة)
ipcMain.handle('create-company', (event, { name }) => {
    try {
        if (!name || name.trim().length === 0) return sendError(event, 'اسم المطعم مطلوب');
        
        const info = db.prepare('INSERT INTO companies (name) VALUES (?)').run(name.trim());
        const companyId = info.lastInsertRowid;
        
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('0000', salt);
        
        db.prepare('INSERT INTO users (company_id, full_name, username, password_hash, role) VALUES (?,?,?,?,?)')
            .run(companyId, 'المدير العام', 'admin', hashedPassword, 'admin');
        db.prepare('INSERT INTO settings (company_id) VALUES (?)').run(companyId);
        
        return sendSuccess({ id: companyId, name: name.trim() });
    } catch (e) {
        console.error('create-company error:', e.message);
        return sendError(event, 'خطأ في إنشاء المطعم');
    }
});

// الحصول على الإعدادات
ipcMain.handle('get-settings', (event, company_id) => {
    try {
        const settings = db.prepare('SELECT * FROM settings WHERE company_id=?').get(company_id);
        return sendSuccess({ settings: settings || {} });
    } catch (e) {
        return sendSuccess({ settings: {} });
    }
});

// طباعة حرارية
ipcMain.on('print-thermal', (event, htmlContent) => {
    try {
        let printWindow = new BrowserWindow({ show: false });
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: true, printBackground: false });
            printWindow.close();
        });
    } catch (e) {
        console.error('print-thermal error:', e.message);
    }
});

// نسخ احتياطي
ipcMain.handle('backup-database', async () => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'حفظ نسخة احتياطية',
            defaultPath: `backup_${new Date().toISOString().slice(0,10)}.db`,
            filters: [{ name: 'Database', extensions: ['db'] }]
        });
        if (filePath) {
            fs.copyFileSync(dbPath, filePath);
            return sendSuccess();
        }
        return sendSuccess({ cancelled: true });
    } catch (e) {
        return sendError(null, 'خطأ في النسخ الاحتياطي');
    }
});

// استيراد نسخة احتياطية
ipcMain.handle('restore-database', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'استيراد نسخة احتياطية',
            filters: [{ name: 'Database', extensions: ['db'] }],
            properties: ['openFile']
        });
        if (filePaths && filePaths[0]) {
            db.close();
            fs.copyFileSync(filePaths[0], dbPath);
            db = new Database(dbPath);
            return sendSuccess();
        }
        return sendSuccess({ cancelled: true });
    } catch (e) {
        return sendError(null, 'خطأ في استيراد النسخة الاحتياطية');
    }
});

// حفظ الصورة
ipcMain.handle('save-image', async (event, { fileName, buffer }) => {
    try {
        const filePath = path.join(imagesDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        return sendSuccess({ imagePath: path.join('product-images', fileName) });
    } catch (e) {
        console.error('save-image error:', e.message);
        return sendError(event, 'خطأ في حفظ الصورة');
    }
});

// الحصول على مسار الصورة
ipcMain.handle('get-image-path', (event, relativePath) => {
    try {
        if (!relativePath) return sendSuccess({ path: '' });
        if (path.isAbsolute(relativePath)) return sendSuccess({ path: relativePath });
        const fullPath = path.join(userDataPath, relativePath);
        return sendSuccess({ path: fs.existsSync(fullPath) ? fullPath : '' });
    } catch (e) {
        return sendSuccess({ path: '' });
    }
});
