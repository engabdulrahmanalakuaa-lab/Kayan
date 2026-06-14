// ==========================================
// renderer.js - تقنيات سوفت (نسخة آمنة ومُحكمة)
// تصميم م/ عبدالرحمن الاكوع 773579486 967+
// ==========================================

const api = window.api;

let currentUser = null;
let currentCompany = null;
let currentShift = null;
let cart = [];
let totalSalesCash = 0;
let currentCategory = 'all';

// ============ بدء التشغيل ============
window.addEventListener('DOMContentLoaded', async () => {
    const activatedResult = await api.checkActivation();
    const activated = activatedResult.success ? activatedResult.activated : false;
    if (!activated) {
        document.getElementById('activation-screen').style.display = 'flex';
        document.getElementById('app-main').style.display = 'none';
    } else {
        document.getElementById('activation-screen').style.display = 'none';
        document.getElementById('app-main').style.display = 'flex';
        await showLoginScreen();
    }
});

// ============ التفعيل ============
async function activateApp() {
    const code = document.getElementById('activation-code').value.trim();
    if (!code) return alert('الرجاء إدخال كود التفعيل');
    const res = await api.activate(code);
    if (res.success) {
        document.getElementById('activation-screen').style.display = 'none';
        document.getElementById('app-main').style.display = 'flex';
        await showLoginScreen();
    } else {
        alert(res.error || 'كود التفعيل غير صحيح');
    }
}

// ============ شاشة الدخول وإنشاء الشركة ============
async function showLoginScreen() {
    const companiesResult = await api.dbQuery('SELECT * FROM companies');
    if (!companiesResult.success) {
        alert('خطأ في الاتصال بقاعدة البيانات');
        return;
    }
    const companies = companiesResult.data;
    let company = null;

    if (companies.length === 0) {
        const name = prompt('أدخل اسم المطعم (سيظهر في الفواتير):');
        if (!name) return;
        const result = await api.createCompany(name);
        if (!result.success) {
            alert('خطأ في إنشاء المطعم: ' + result.error);
            return;
        }
        company = { id: result.id, name: result.name };
        await seedDefaultData(company.id);
        showLoginForm(company);
        return;
    } else if (companies.length === 1) {
        company = companies[0];
        showLoginForm(company);
    } else {
        const list = companies.map(c => `${c.id}: ${c.name}`).join('\n');
        const chosen = prompt(`اختر الشركة (أدخل الرقم):\n${list}`);
        company = companies.find(c => c.id == chosen);
        if (!company) return alert('اختيار خاطئ');
        showLoginForm(company);
    }
}

function showLoginForm(company) {
    currentCompany = company;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-username').focus();
}

async function submitLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) return alert('أدخل اسم المستخدم وكلمة المرور');

    // استخدام قناة api.login الآمنة بدلاً من استعلام SQL مباشر
    const result = await api.login(username, password, currentCompany.id);
    if (!result.success) {
        alert(result.error || 'بيانات الدخول خاطئة');
        return;
    }
    currentUser = result.user;
    document.getElementById('current-user-display').innerText = currentUser.full_name;

    const settingsResult = await api.getSettings(currentCompany.id);
    window.appSettings = (settingsResult.success && settingsResult.settings) ? settingsResult.settings : {};

    await openShiftIfNeeded();

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('login-screen').style.display = 'none';
    await switchTab('dashboard');
}

// ============ بذرة البيانات الافتراضية ============
async function seedDefaultData(companyId) {
    const existingResult = await api.dbQuery("SELECT COUNT(*) as cnt FROM categories WHERE company_id=?", [companyId]);
    if (!existingResult.success || existingResult.data[0].cnt > 0) return;

    const accounts = [
        { code: '1', name: 'الأصول' },
        { code: '11', name: 'الأصول المتداولة' },
        { code: '111', name: 'الصندوق' },
        { code: '112', name: 'البنك' },
        { code: '2', name: 'الخصوم' },
        { code: '3', name: 'حقوق الملكية' },
        { code: '4', name: 'الإيرادات' },
        { code: '41', name: 'مبيعات المطعم' },
        { code: '5', name: 'المصروفات' },
        { code: '51', name: 'تكلفة المبيعات' }
    ];
    for (let acc of accounts) {
        await api.dbRun('INSERT INTO chart_of_accounts (company_id, code, name) VALUES (?,?,?)', [companyId, acc.code, acc.name]);
    }

    const categoryNames = [
        { name: 'غداء' },
        { name: 'أكلات شعبية' },
        { name: 'المعصوب' },
        { name: 'مشروبات' },
        { name: 'طبخ الذبائح' }
    ];
    const catIds = {};
    for (let c of categoryNames) {
        const insertResult = await api.dbRun('INSERT INTO categories (company_id, name) VALUES (?,?)', [companyId, c.name]);
        if (insertResult.success) {
            const newCat = await api.dbGet('SELECT * FROM categories WHERE id = ?', [insertResult.lastInsertRowid]);
            if (newCat.success) catIds[c.name] = newCat.data.id;
        }
    }

    const products = [
        { name: 'حبة دجاج مظبي', price: 40, category: 'غداء' },
        { name: 'حبة دجاج مضغوط', price: 40, category: 'غداء' },
        { name: 'حبة دجاج مندي', price: 40, category: 'غداء' },
        { name: 'حبة دجاج شواية', price: 40, category: 'غداء' },
        { name: 'نص دجاج مظبي', price: 20, category: 'غداء' },
        { name: 'نص دجاج مضغوط', price: 20, category: 'غداء' },
        { name: 'نص دجاج مندي', price: 20, category: 'غداء' },
        { name: 'نص دجاج شواية', price: 20, category: 'غداء' },
        { name: 'نفر رز سادة', price: 6, category: 'غداء' },
        { name: 'مشكل خضار', price: 5, category: 'غداء' },
        { name: 'إيدام مصقع', price: 5, category: 'غداء' },
        { name: 'ملوخية', price: 5, category: 'غداء' },
        { name: 'سلطة لبن خيار', price: 3, category: 'غداء' },
        { name: 'سلطة حار', price: 3, category: 'غداء' },
        { name: 'سلطة خضار', price: 3, category: 'غداء' },
        { name: 'سلطة حمراء', price: 3, category: 'غداء' },
        { name: 'مقلقل بلدي', price: 15, category: 'أكلات شعبية' },
        { name: 'لحم صغار', price: 15, category: 'أكلات شعبية' },
        { name: 'عقدة دجاج', price: 15, category: 'أكلات شعبية' },
        { name: 'شكشوكة', price: 7, category: 'أكلات شعبية' },
        { name: 'كبسة', price: 10, category: 'أكلات شعبية' },
        { name: 'بازيلاء سادة', price: 9, category: 'أكلات شعبية' },
        { name: 'بازيلاء تونة', price: 12, category: 'أكلات شعبية' },
        { name: 'تونة سادة', price: 9, category: 'أكلات شعبية' },
        { name: 'تونة وجبن', price: 10, category: 'أكلات شعبية' },
        { name: 'فاصولياء سادة', price: 9, category: 'أكلات شعبية' },
        { name: 'فاصولياء بيض', price: 12, category: 'أكلات شعبية' },
        { name: 'عدس سادة', price: 6, category: 'أكلات شعبية' },
        { name: 'عدس بيض', price: 7, category: 'أكلات شعبية' },
        { name: 'فول سادة', price: 8, category: 'أكلات شعبية' },
        { name: 'فول قلاية', price: 10, category: 'أكلات شعبية' },
        { name: 'عريكة ملكي', price: 18, category: 'المعصوب' },
        { name: 'عريكة حجر', price: 20, category: 'المعصوب' },
        { name: 'عريكة قشطة عسل', price: 12, category: 'المعصوب' },
        { name: 'عريكة قشطة', price: 15, category: 'المعصوب' },
        { name: 'معصوب ملكي', price: 10, category: 'المعصوب' },
        { name: 'معصوب ملكي كبير', price: 18, category: 'المعصوب' },
        { name: 'معصوب عادي', price: 10, category: 'المعصوب' },
        { name: 'معصوب قشطة عسل سمن', price: 12, category: 'المعصوب' },
        { name: 'مرسة قشطة عسل', price: 12, category: 'المعصوب' },
        { name: 'مرسة سادة', price: 7, category: 'المعصوب' },
        { name: 'مرسة سمن وعسل', price: 9, category: 'المعصوب' },
        { name: 'فتة زبيب دي', price: 10, category: 'المعصوب' },
        { name: 'فتة تمر', price: 8, category: 'المعصوب' },
        { name: 'طبخ مندي', price: 180, category: 'طبخ الذبائح' },
        { name: 'طبخ حنيذ', price: 180, category: 'طبخ الذبائح' },
        { name: 'طبخ كابلي', price: 180, category: 'طبخ الذبائح' },
        { name: 'طبخ كوزي', price: 180, category: 'طبخ الذبائح' }
    ];

    for (let p of products) {
        const catId = catIds[p.category];
        if (catId) {
            await api.dbRun('INSERT INTO products (company_id, name, category_id, price) VALUES (?,?,?,?)', [companyId, p.name, catId, p.price]);
        }
    }
}

// ============ فتح الوردية ============
async function openShiftIfNeeded() {
    const today = new Date().toISOString().slice(0,10);
    const openShift = await api.dbGet(
        "SELECT * FROM shifts WHERE company_id=? AND date=? AND status='open' AND user_id=?",
        [currentCompany.id, today, currentUser.id]
    );
    const shiftData = (openShift.success && openShift.data) ? openShift.data : null;

    if (!shiftData) {
        const openingCash = parseFloat(prompt('أدخل رصيد افتتاح الصندوق (ر.س):') || '0');
        const insertResult = await api.dbRun('INSERT INTO shifts (company_id, user_id, opening_cash, date, status) VALUES (?,?,?,?,?)',
            [currentCompany.id, currentUser.id, openingCash, today, 'open']);
        if (insertResult.success) {
            const newShift = await api.dbGet('SELECT * FROM shifts WHERE id = ?', [insertResult.lastInsertRowid]);
            if (newShift.success) currentShift = newShift.data;
        }
        totalSalesCash = 0;
    } else {
        currentShift = shiftData;
        const ordersTotal = await api.dbGet("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE company_id=? AND date=? AND shift_id=?",
            [currentCompany.id, today, currentShift.id]);
        totalSalesCash = (ordersTotal.success && ordersTotal.data) ? ordersTotal.data.total : 0;
    }
}

// ============ التبويبات ============
async function switchTab(tab) {
    const main = document.getElementById('main-content');
    main.innerHTML = '';
    switch (tab) {
        case 'dashboard': await renderDashboard(); break;
        case 'pos': await renderPOS(); break;
        case 'products': await renderProducts(); break;
        case 'categories': await renderCategories(); break;
        case 'materials': await renderMaterials(); break;
        case 'tables': await renderTables(); break;
        case 'waiters': await renderWaiters(); break;
        case 'reports': await renderReports(); break;
        case 'accounting': await renderAccounting(); break;
        case 'users': await renderUsers(); break;
        case 'settings': await renderSettings(); break;
        case 'financial': await renderFinancial(); break;
    }
}

// ============ لوحة التحكم ============
async function renderDashboard() {
    const today = new Date().toISOString().slice(0,10);
    const todayOrdersResult = await api.dbQuery("SELECT * FROM orders WHERE company_id=? AND date=?", [currentCompany.id, today]);
    const todayOrders = todayOrdersResult.success ? todayOrdersResult.data : [];
    const totalSales = todayOrders.reduce((s,o) => s + o.total, 0);

    const lowStockResult = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=? AND current_stock <= min_stock", [currentCompany.id]);
    const lowStock = lowStockResult.success ? lowStockResult.data : [];

    const tablesResult = await api.dbQuery("SELECT COUNT(*) as cnt FROM tables WHERE company_id=? AND status='occupied'", [currentCompany.id]);
    const occupiedTables = (tablesResult.success && tablesResult.data[0]) ? tablesResult.data[0].cnt : 0;

    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>لوحة التحكم - ${currentCompany.name}</h1></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-money-bill"></i></div><div class="stat-info"><h3>مبيعات اليوم</h3><p>${totalSales.toFixed(2)} ر.س</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-shopping-cart"></i></div><div class="stat-info"><h3>عدد الطلبات</h3><p>${todayOrders.length}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-chair"></i></div><div class="stat-info"><h3>طاولات مشغولة</h3><p>${occupiedTables}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-info"><h3>مواد حرجة</h3><p>${lowStock.length}</p></div></div>
        </div>
        <canvas id="salesChart" style="max-height:300px; margin-bottom:20px;"></canvas>
        <div>
            <h3>آخر الطلبات</h3>
            <table><thead><tr><th>رقم</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>
                ${todayOrders.slice(-5).map(o => `<tr><td>${o.id}</td><td>${o.total.toFixed(2)}</td><td>${o.time}</td></tr>`).join('')}
            </tbody></table>
        </div>
    `;

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let ds = d.toISOString().slice(0,10);
        let sumResult = await api.dbGet("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE company_id=? AND date=?", [currentCompany.id, ds]);
        let sum = (sumResult.success && sumResult.data) ? sumResult.data.total : 0;
        last7.push(sum);
    }
    if (document.getElementById('salesChart')) {
        const ctx = document.getElementById('salesChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['قبل 6', 'قبل 5', 'قبل 4', 'قبل 3', 'قبل 2', 'أمس', 'اليوم'],
                datasets: [{ label: 'المبيعات (ر.س)', data: last7, borderColor: '#e67e22' }]
            }
        });
    }
}

// ============ نقطة البيع (POS) ============
async function renderPOS() {
    const categoriesResult = await api.dbQuery("SELECT * FROM categories WHERE company_id=?", [currentCompany.id]);
    const categories = categoriesResult.success ? categoriesResult.data : [];
    const tablesResult = await api.dbQuery("SELECT * FROM tables WHERE company_id=? AND status='free'", [currentCompany.id]);
    const tables = tablesResult.success ? tablesResult.data : [];
    const waitersResult = await api.dbQuery("SELECT * FROM waiters WHERE company_id=?", [currentCompany.id]);
    const waiters = waitersResult.success ? waitersResult.data : [];

    const iconMap = {
        'غداء': '🍚🍗',
        'أكلات شعبية': '🍗',
        'المعصوب': '🍰',
        'مشروبات': '🥤',
        'طبخ الذبائح': '🐑'
    };

    let catBtns = categories.map(c => {
        const icon = iconMap[c.name] || '📦';
        return `<button class="cat-btn" onclick="filterPOS('${c.id}')">${icon} ${c.name}</button>`;
    }).join('');
    let tableOpts = tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    let waiterOpts = waiters.map(w => `<option value="${w.id}">${w.name}</option>`).join('');

    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>نقطة البيع</h1></div>
        <div class="pos-container">
            <div class="menu-section">
                <div class="category-grid">
                    <button class="cat-btn active" onclick="filterPOS('all')">📋 الكل</button>
                    ${catBtns}
                </div>
                <input type="text" id="pos-search" placeholder="بحث عن منتج..." oninput="searchPOS()" style="margin-bottom:10px; padding:8px; width:100%;">
                <div class="items-grid" id="pos-items-grid"></div>
            </div>
            <div class="invoice-section">
                <div class="shift-info-box" style="background:#ebf5fb; padding:10px; border-radius:4px; margin-bottom:10px;">
                    <span>الوردية: <span id="shift-total">${totalSalesCash.toFixed(2)}</span> ر.س</span>
                </div>
                <div>
                    <select id="pos-table" style="width:100%; padding:8px; margin-bottom:5px;"><option value="">بدون طاولة</option>${tableOpts}</select>
                    <select id="pos-waiter" style="width:100%; padding:8px; margin-bottom:5px;"><option value="">بدون كابتن</option>${waiterOpts}</select>
                </div>
                <div class="cart-items" id="cart-items"></div>
                <div class="cart-total">الإجمالي: <span id="cart-total">0.00</span> ر.س</div>
                <button class="btn btn-success" style="width:100%; margin-bottom:5px;" onclick="checkoutPOS()">إنهاء الطلب</button>
                <button class="btn btn-danger" style="width:100%;" onclick="clearCart()">مسح السلة</button>
                <button class="btn btn-secondary" style="width:100%; margin-top:5px;" onclick="closeShift()">إغلاق الوردية</button>
            </div>
        </div>
    `;

    await filterPOS('all');
}

async function filterPOS(catId) {
    currentCategory = catId;
    let productsResult;
    if (catId === 'all') {
        productsResult = await api.dbQuery("SELECT * FROM products WHERE company_id=?", [currentCompany.id]);
    } else {
        productsResult = await api.dbQuery("SELECT * FROM products WHERE company_id=? AND category_id=?", [currentCompany.id, catId]);
    }
    const products = productsResult.success ? productsResult.data : [];
    await renderPOSItems(products);
}

async function searchPOS() {
    const q = document.getElementById('pos-search').value;
    const productsResult = await api.dbQuery("SELECT * FROM products WHERE company_id=? AND name LIKE ?", [currentCompany.id, `%${q}%`]);
    const products = productsResult.success ? productsResult.data : [];
    await renderPOSItems(products);
}

async function renderPOSItems(products) {
    const grid = document.getElementById('pos-items-grid');
    if (!grid) return;
    const items = await Promise.all(products.map(async p => {
        let imgHtml = '';
        if (p.image) {
            const imgPathResult = await api.getImagePath(p.image);
            const imgPath = imgPathResult.success ? imgPathResult.path : '';
            imgHtml = imgPath ? `<img src="file://${imgPath}" style="width:100%; height:80px; object-fit:cover; border-radius:4px;" onerror="this.style.display='none'">` : `<div style="width:100%; height:80px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:4px; font-size:24px;">🍽️</div>`;
        } else {
            imgHtml = `<div style="width:100%; height:80px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:4px; font-size:24px;">🍽️</div>`;
        }
        return `<div class="item-card" onclick="addToCartPOS(${p.id})">
            ${imgHtml}
            <div class="item-name">${p.name}</div>
            <div class="item-price">${p.price.toFixed(2)} ر.س</div>
        </div>`;
    }));
    grid.innerHTML = items.join('');
}

async function addToCartPOS(productId) {
    const productResult = await api.dbGet("SELECT * FROM products WHERE id=?", [productId]);
    if (!productResult.success || !productResult.data) return;
    const product = productResult.data;
    const existing = cart.find(i => i.id === productId);
    if (existing) existing.qty += 1;
    else cart.push({ ...product, qty: 1 });
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (!container) return;
    let total = 0;
    container.innerHTML = cart.map((item, idx) => {
        total += item.price * item.qty;
        return `<div class="cart-item">
            <span>${item.name} x${item.qty}</span>
            <span>${(item.price * item.qty).toFixed(2)}</span>
            <button class="btn btn-danger btn-sm" onclick="removeFromCartPOS(${idx})">×</button>
        </div>`;
    }).join('');
    totalEl.innerText = total.toFixed(2);
}

function removeFromCartPOS(index) { cart.splice(index, 1); renderCart(); }
function clearCart() { cart = []; renderCart(); }

async function checkoutPOS() {
    if (cart.length === 0) return alert('السلة فارغة');
    const tableId = document.getElementById('pos-table').value || null;
    const waiterId = document.getElementById('pos-waiter').value || null;
    const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const today = new Date().toISOString().slice(0,10);
    const time = new Date().toLocaleTimeString('ar-SA');

    // حفظ الطلب
    const result = await api.dbRun(
        'INSERT INTO orders (company_id, table_id, waiter_id, user_id, total, date, time, shift_id) VALUES (?,?,?,?,?,?,?,?)',
        [currentCompany.id, tableId, waiterId, currentUser.id, total, today, time, currentShift.id]
    );
    if (!result.success) {
        alert('فشل حفظ الطلب. تأكد من البيانات وحاول مجدداً.');
        return;
    }
    const orderId = result.lastInsertRowid;

    // حفظ الأصناف وخصم المخزون
    for (let item of cart) {
        const itemResult = await api.dbRun('INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?,?,?,?)',
            [orderId, item.id, item.qty, item.price]);
        if (!itemResult.success) {
            alert('حدث خطأ أثناء حفظ تفاصيل الطلب. يرجى مراجعة السلة.');
            return;
        }

        const productResult = await api.dbGet('SELECT * FROM products WHERE id=?', [item.id]);
        if (productResult.success && productResult.data && productResult.data.recipe) {
            const recipe = JSON.parse(productResult.data.recipe);
            for (let comp of recipe) {
                await api.dbRun('UPDATE raw_materials SET current_stock = current_stock - ? WHERE id=? AND company_id=?',
                    [comp.qty * item.qty, comp.material_id, currentCompany.id]);
                await api.dbRun('INSERT INTO inventory_transactions (company_id, material_id, qty_change, type, reference, date) VALUES (?,?,?,?,?,?)',
                    [currentCompany.id, comp.material_id, -comp.qty * item.qty, 'consumption', `طلب #${orderId}`, today]);
            }
        }
    }

    // تحديث الطاولة
    if (tableId) {
        await api.dbRun("UPDATE tables SET status='occupied' WHERE id=?", [tableId]);
    }

    totalSalesCash += total;
    document.getElementById('shift-total').innerText = totalSalesCash.toFixed(2);
    await printInvoice(orderId, cart, total);
    cart = [];
    renderCart();
    await filterPOS(currentCategory);
}

async function printInvoice(orderId, items, total) {
    const dateStr = new Date().toLocaleString('ar-SA');
    let rows = items.map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${(i.price * i.qty).toFixed(2)}</td></tr>`).join('');
    const html = `
    <html><body style="font-family: Tajawal; direction: rtl; width: 74mm; margin: 0; padding: 5mm;">
        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:4px;">
            <h3 style="margin:0;">${currentCompany.name}</h3>
            <p style="margin:0;">رقم الفاتورة: #${orderId}</p>
            <p style="margin:0;">${dateStr}</p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:5px;">
            <tr><th>الصنف</th><th>كم</th><th>السعر</th></tr>
            ${rows}
        </table>
        <div style="border-top:1px dashed #000; margin:6px 0; text-align:right; font-weight:bold;">الإجمالي: ${total.toFixed(2)} ر.س</div>
        <div style="text-align:center; font-size:10px; border-top:1px dashed #000; padding-top:4px;">
            تصميم م/ عبدالرحمن الاكوع 773579486 967+
        </div>
    </body></html>`;
    await api.printThermal(html);
}

async function closeShift() {
    const actual = parseFloat(prompt('أدخل النقد الفعلي بالدرج:'));
    if (isNaN(actual)) return;
    const diff = actual - totalSalesCash;
    const updateResult = await api.dbRun("UPDATE shifts SET closing_cash=?, status='closed' WHERE id=?", [actual, currentShift.id]);
    if (!updateResult.success) {
        alert('فشل إغلاق الوردية. حاول مجدداً.');
        return;
    }
    const html = `
    <html><body style="font-family: Tajawal; direction: rtl; width: 74mm; padding: 5mm;">
        <div style="text-align:center;"><h3>تقرير إغلاق وردية</h3><p>${new Date().toLocaleString('ar-SA')}</p></div>
        <p>مبيعات مسجلة: ${totalSalesCash.toFixed(2)}</p>
        <p>نقد فعلي: ${actual.toFixed(2)}</p>
        <p>الفارق: ${diff.toFixed(2)} (${diff >= 0 ? 'فائض' : 'عجز'})</p>
        <div style="text-align:center; margin-top:10px; border-top:1px dashed #000;">تصميم م/ عبدالرحمن الاكوع 773579486 967+</div>
    </body></html>`;
    await api.printThermal(html);
    alert('تم إغلاق الوردية');
    location.reload();
}

// ============ المنتجات ============
async function renderProducts() {
    const result = await api.dbQuery("SELECT p.*, c.name as cat FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.company_id=?", [currentCompany.id]);
    const products = result.success ? result.data : [];
    const rows = await Promise.all(products.map(async p => {
        let imgHtml = '';
        if (p.image) {
            const imgPathResult = await api.getImagePath(p.image);
            if (imgPathResult.success && imgPathResult.path) {
                imgHtml = `<img src="file://${imgPathResult.path}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;" onerror="this.style.display='none'">`;
            }
        }
        return `<tr>
            <td>${imgHtml} ${p.name}</td>
            <td>${p.cat||''}</td>
            <td>${p.price.toFixed(2)}</td>
            <td>${p.recipe?'نعم':'لا'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editProduct(${p.id})">تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">حذف</button>
            </td>
        </tr>`;
    }));
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>المنتجات</h1><button class="btn btn-primary" onclick="openProductModal()">إضافة منتج</button></div>
        <table><tr><th>صورة</th><th>الاسم</th><th>الفئة</th><th>السعر</th><th>الوصفة</th><th></th></tr>${rows.join('')}</table>
    `;
}

async function openProductModal(id = null) {
    const categoriesResult = await api.dbQuery("SELECT * FROM categories WHERE company_id=?", [currentCompany.id]);
    const categories = categoriesResult.success ? categoriesResult.data : [];
    const materialsResult = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=?", [currentCompany.id]);
    const materials = materialsResult.success ? materialsResult.data : [];
    let prod = { name: '', price: '', category_id: '', recipe: '[]', barcode: '', image: '' };
    if (id) {
        const prodResult = await api.dbGet("SELECT * FROM products WHERE id=?", [id]);
        if (prodResult.success) prod = { ...prod, ...prodResult.data };
    }

    let catOpts = categories.map(c => `<option value="${c.id}" ${c.id==prod.category_id?'selected':''}>${c.name}</option>`).join('');
    let matOpts = materials.map(m => `<option value="${m.id}">${m.name} (${m.unit})</option>`).join('');
    let recipeRows = JSON.parse(prod.recipe || '[]').map(r => `
        <div style="display:flex; gap:5px; margin-bottom:4px;">
            <select class="mat-select">${matOpts.replace(`value="${r.material_id}"`,`value="${r.material_id}" selected`)}</select>
            <input class="mat-qty" value="${r.qty}" step="0.01" placeholder="كمية" style="width:80px;">
            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>
        </div>`).join('');

    let imagePreviewHtml = '';
    if (prod.image) {
        const imgPathResult = await api.getImagePath(prod.image);
        if (imgPathResult.success && imgPathResult.path) {
            imagePreviewHtml = `<img id="prod-img-preview" src="file://${imgPathResult.path}" style="width:100px; height:100px; object-fit:cover; border:1px solid #ddd; display:block; margin-bottom:5px;">`;
        } else {
            imagePreviewHtml = `<img id="prod-img-preview" src="" style="width:100px; height:100px; object-fit:cover; border:1px solid #ddd; display:none; margin-bottom:5px;">`;
        }
    } else {
        imagePreviewHtml = `<img id="prod-img-preview" src="" style="width:100px; height:100px; object-fit:cover; border:1px solid #ddd; display:none; margin-bottom:5px;">`;
    }

    document.getElementById('modal-content').innerHTML = `
        <h3>${id?'تعديل':'إضافة'} منتج</h3>
        <div class="form-group"><input id="prod-name" value="${prod.name}" placeholder="الاسم"></div>
        <div class="form-group"><input type="number" id="prod-price" value="${prod.price}" placeholder="السعر" step="0.01"></div>
        <div class="form-group"><select id="prod-cat">${catOpts}</select></div>
        <div class="form-group"><input id="prod-barcode" value="${prod.barcode||''}" placeholder="باركود"></div>
        <div class="form-group">
            <label>صورة المنتج</label>
            ${imagePreviewHtml}
            <input type="file" id="prod-image" accept="image/*" onchange="previewImage(this)">
        </div>
        <div class="form-group"><label>المكونات</label><div id="recipe-builder">${recipeRows}</div>
            <button class="btn btn-sm btn-secondary" onclick="addRecipeRow()">+ مكون</button></div>
        <button class="btn btn-primary" onclick="saveProduct(${id})">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

function previewImage(input) {
    const preview = document.getElementById('prod-img-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => { preview.src = e.target.result; preview.style.display = 'block'; };
        reader.readAsDataURL(input.files[0]);
    }
}

function addRecipeRow() {
    const container = document.getElementById('recipe-builder');
    const selectHtml = document.querySelector('.mat-select')?.outerHTML || '<select class="mat-select"></select>';
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:5px; margin-bottom:4px;';
    div.innerHTML = `${selectHtml} <input class="mat-qty" step="0.01" placeholder="كمية" style="width:80px;"> <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(div);
}

async function saveProduct(id) {
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const category_id = document.getElementById('prod-cat').value || null;
    const barcode = document.getElementById('prod-barcode').value;
    const recipeRows = document.querySelectorAll('#recipe-builder > div');
    let recipe = [];
    recipeRows.forEach(row => {
        const mat = row.querySelector('.mat-select')?.value;
        const qty = parseFloat(row.querySelector('.mat-qty')?.value);
        if (mat && !isNaN(qty)) recipe.push({ material_id: parseInt(mat), qty });
    });
    if (!name || isNaN(price)) return alert('أكمل الحقول المطلوبة');

    let imagePath = '';
    const imageInput = document.getElementById('prod-image');
    if (imageInput && imageInput.files && imageInput.files[0]) {
        const file = imageInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Array.from(new Uint8Array(arrayBuffer));
        const fileName = `product_${Date.now()}_${file.name}`;
        const imgResult = await api.saveImage(fileName, buffer);
        imagePath = imgResult.success ? imgResult.imagePath : '';
    } else if (id) {
        const oldResult = await api.dbGet("SELECT image FROM products WHERE id=?", [id]);
        imagePath = (oldResult.success && oldResult.data) ? oldResult.data.image || '' : '';
    }

    const result = await api.saveProduct({
        id: id || null,
        company_id: currentCompany.id,
        name, price, category_id, barcode,
        recipe: JSON.stringify(recipe),
        image: imagePath
    });

    if (!result.success) {
        alert('خطأ في حفظ المنتج: ' + (result.error || ''));
        return;
    }
    closeModal();
    await switchTab('products');
}

async function editProduct(id) { await openProductModal(id); }

async function deleteProduct(id) {
    if (confirm('حذف المنتج؟')) {
        const result = await api.deleteProduct(id, currentCompany.id);
        if (!result.success) {
            alert('خطأ في حذف المنتج: ' + (result.error || ''));
            return;
        }
        await switchTab('products');
    }
}

function closeModal() { document.getElementById('modal').classList.remove('active'); }

// ============ الأقسام ============
async function renderCategories() {
    const result = await api.dbQuery("SELECT * FROM categories WHERE company_id=?", [currentCompany.id]);
    const categories = result.success ? result.data : [];
    const rows = await Promise.all(categories.map(async c => {
        const countResult = await api.dbGet("SELECT COUNT(*) as cnt FROM products WHERE category_id=?", [c.id]);
        const count = (countResult.success && countResult.data) ? countResult.data.cnt : 0;
        return `<tr>
            <td>${c.name}</td>
            <td>${count}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editCategory(${c.id}, '${c.name}')">تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCategory(${c.id})">حذف</button>
            </td>
        </tr>`;
    }));
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>الأقسام</h1><button class="btn btn-primary" onclick="openCategoryModal()">إضافة قسم</button></div>
        <table><thead><tr><th>الاسم</th><th>عدد المنتجات</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>
    `;
}

function openCategoryModal(id = null, currentName = '') {
    document.getElementById('modal-content').innerHTML = `
        <h3>${id ? 'تعديل' : 'إضافة'} قسم</h3>
        <div class="form-group"><input id="cat-name" value="${currentName}" placeholder="اسم القسم"></div>
        <button class="btn btn-primary" onclick="saveCategory(${id})">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveCategory(id) {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) return alert('الرجاء إدخال اسم القسم');
    if (id) {
        await api.dbRun('UPDATE categories SET name=? WHERE id=?', [name, id]);
    } else {
        await api.dbRun('INSERT INTO categories (company_id, name) VALUES (?,?)', [currentCompany.id, name]);
    }
    closeModal();
    await switchTab('categories');
}

async function editCategory(id, currentName) { openCategoryModal(id, currentName); }

async function deleteCategory(id) {
    const productsCountResult = await api.dbGet("SELECT COUNT(*) as cnt FROM products WHERE category_id=?", [id]);
    const productsCount = (productsCountResult.success && productsCountResult.data) ? productsCountResult.data.cnt : 0;
    if (productsCount > 0) {
        if (!confirm(`هذا القسم يحتوي على ${productsCount} منتج. حذفه سينقل المنتجات إلى "بدون قسم". متابعة؟`)) return;
        await api.dbRun('UPDATE products SET category_id = NULL WHERE category_id = ?', [id]);
    }
    if (confirm('هل أنت متأكد من حذف القسم؟')) {
        await api.dbRun('DELETE FROM categories WHERE id=?', [id]);
        await switchTab('categories');
    }
}

// ============ المواد الخام ============
async function renderMaterials() {
    const result = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=?", [currentCompany.id]);
    const mats = result.success ? result.data : [];
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>المواد الخام</h1><button class="btn btn-primary" onclick="openMaterialModal()">إضافة مادة</button></div>
        <table><tr><th>الاسم</th><th>الوحدة</th><th>المخزون</th><th>الحد الأدنى</th><th>سعر الشراء</th><th></th></tr>
        ${mats.map(m => `<tr class="${m.current_stock<=m.min_stock?'stock-danger':''}">
            <td>${m.name}</td><td>${m.unit}</td><td>${m.current_stock}</td><td>${m.min_stock}</td><td>${(m.purchase_price||0).toFixed(2)}</td>
            <td><button class="btn btn-sm btn-primary" onclick="editMaterial(${m.id})">تعديل</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMaterial(${m.id})">حذف</button>
            <button class="btn btn-sm btn-success" onclick="supplyMaterial(${m.id})">توريد</button></td></tr>`).join('')}
        </table>
    `;
}

async function openMaterialModal(id = null) {
    let mat = { name: '', unit: 'كجم', min_stock: 0, purchase_price: 0 };
    if (id) {
        const result = await api.dbGet("SELECT * FROM raw_materials WHERE id=?", [id]);
        if (result.success && result.data) mat = result.data;
    }
    document.getElementById('modal-content').innerHTML = `
        <h3>${id?'تعديل':'إضافة'} مادة</h3>
        <div class="form-group"><input id="mat-name" value="${mat.name}" placeholder="الاسم"></div>
        <div class="form-group"><input id="mat-unit" value="${mat.unit}" placeholder="الوحدة"></div>
        <div class="form-group"><input type="number" id="mat-min" value="${mat.min_stock}" placeholder="الحد الأدنى"></div>
        <div class="form-group"><input type="number" id="mat-price" value="${mat.purchase_price||0}" placeholder="سعر الشراء" step="0.01"></div>
        <button class="btn btn-primary" onclick="saveMaterial(${id})">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveMaterial(id) {
    const name = document.getElementById('mat-name').value;
    const unit = document.getElementById('mat-unit').value;
    const min = parseFloat(document.getElementById('mat-min').value) || 0;
    const price = parseFloat(document.getElementById('mat-price').value) || 0;
    if (!name) return alert('الرجاء إدخال اسم المادة');

    const result = await api.saveMaterial({
        id: id || null,
        company_id: currentCompany.id,
        name, unit, min_stock: min, purchase_price: price
    });

    if (!result.success) {
        alert('خطأ في حفظ المادة: ' + (result.error || ''));
        return;
    }
    closeModal();
    await switchTab('materials');
}

async function editMaterial(id) { await openMaterialModal(id); }

async function deleteMaterial(id) {
    if (!confirm('حذف المادة؟')) return;
    const result = await api.deleteMaterial(id, currentCompany.id);
    if (!result.success) {
        alert('خطأ في حذف المادة: ' + (result.error || ''));
        return;
    }
    await switchTab('materials');
}

async function supplyMaterial(id) {
    const qty = parseFloat(prompt('كمية التوريد:'));
    if (isNaN(qty) || qty <= 0) return;
    await api.dbRun('UPDATE raw_materials SET current_stock = current_stock + ? WHERE id=?', [qty, id]);
    await api.dbRun('INSERT INTO inventory_transactions (company_id, material_id, qty_change, type, reference, date) VALUES (?,?,?,?,?,?)',
        [currentCompany.id, id, qty, 'supply', 'توريد يدوي', new Date().toISOString().slice(0,10)]);
    await switchTab('materials');
}

// ============ الطاولات ============
async function renderTables() {
    const result = await api.dbQuery("SELECT * FROM tables WHERE company_id=?", [currentCompany.id]);
    const tables = result.success ? result.data : [];
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>الطاولات</h1><button class="btn btn-primary" onclick="openTableModal()">إضافة طاولة</button></div>
        <div class="stats-grid">
            ${tables.map(t => `<div class="stat-card"><div><h3>${t.name}</h3><p>${t.status==='free'?'متاحة':'مشغولة'}</p></div>
                <button class="btn btn-sm btn-danger" onclick="deleteTable(${t.id})">حذف</button></div>`).join('')}
        </div>
    `;
}

async function openTableModal() {
    document.getElementById('modal-content').innerHTML = `
        <h3>إضافة طاولة</h3>
        <div class="form-group"><input id="table-name" placeholder="اسم الطاولة"></div>
        <div class="form-group"><input type="number" id="table-seats" value="4" placeholder="عدد الكراسي"></div>
        <button class="btn btn-primary" onclick="saveTable()">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveTable() {
    const name = document.getElementById('table-name').value;
    const seats = parseInt(document.getElementById('table-seats').value) || 4;
    if (!name) return;
    await api.dbRun('INSERT INTO tables (company_id, name, seats) VALUES (?,?,?)', [currentCompany.id, name, seats]);
    closeModal();
    await switchTab('tables');
}

async function deleteTable(id) {
    if (confirm('حذف الطاولة؟')) { await api.dbRun('DELETE FROM tables WHERE id=?', [id]); await switchTab('tables'); }
}

// ============ الكباتن ============
async function renderWaiters() {
    const result = await api.dbQuery("SELECT w.*, u.full_name as uname FROM waiters w LEFT JOIN users u ON w.user_id=u.id WHERE w.company_id=?", [currentCompany.id]);
    const waiters = result.success ? result.data : [];
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>الكباتن</h1><button class="btn btn-primary" onclick="openWaiterModal()">إضافة كابتن</button></div>
        <table><tr><th>الاسم</th><th>المستخدم</th><th></th></tr>
        ${waiters.map(w => `<tr><td>${w.name}</td><td>${w.uname||''}</td><td><button class="btn btn-sm btn-danger" onclick="deleteWaiter(${w.id})">حذف</button></td></tr>`).join('')}
        </table>
    `;
}

async function openWaiterModal() {
    const usersResult = await api.dbQuery("SELECT * FROM users WHERE company_id=? AND role='captain'", [currentCompany.id]);
    const users = usersResult.success ? usersResult.data : [];
    let opts = users.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('');
    document.getElementById('modal-content').innerHTML = `
        <h3>إضافة كابتن</h3>
        <div class="form-group"><input id="waiter-name" placeholder="اسم الكابتن"></div>
        <div class="form-group"><select id="waiter-user"><option value="">بدون حساب</option>${opts}</select></div>
        <button class="btn btn-primary" onclick="saveWaiter()">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveWaiter() {
    const name = document.getElementById('waiter-name').value;
    const user_id = document.getElementById('waiter-user').value || null;
    if (!name) return;
    await api.dbRun('INSERT INTO waiters (company_id, name, user_id) VALUES (?,?,?)', [currentCompany.id, name, user_id]);
    closeModal();
    await switchTab('waiters');
}

async function deleteWaiter(id) {
    if (confirm('حذف الكابتن؟')) { await api.dbRun('DELETE FROM waiters WHERE id=?', [id]); await switchTab('waiters'); }
}

// ============ التقارير (مع تحديد LIMIT لتحسين الأداء) ============
async function renderReports() {
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>التقارير</h1></div>
        <div class="form-group">
            <label>من تاريخ:</label><input type="date" id="rep-start">
            <label>إلى تاريخ:</label><input type="date" id="rep-end">
            <button class="btn btn-primary" onclick="generateReport()">عرض</button>
        </div>
        <div id="report-result"></div>
    `;
}

async function generateReport() {
    const start = document.getElementById('rep-start').value;
    const end = document.getElementById('rep-end').value;
    if (!start || !end) return;

    // جلب الطلبات مع تحديد عدد أقصى (1000 سجل) وعرض الأحدث أولاً
    const result = await api.dbQuery(
        "SELECT * FROM orders WHERE company_id=? AND date BETWEEN ? AND ? ORDER BY id DESC LIMIT 1000",
        [currentCompany.id, start, end]
    );
    const orders = result.success ? result.data : [];
    const total = orders.reduce((s,o) => s + o.total, 0);

    document.getElementById('report-result').innerHTML = `
        <h3>إجمالي المبيعات: ${total.toFixed(2)} ر.س (آخر 1000 طلب)</h3>
        <table><tr><th>رقم</th><th>المبلغ</th><th>التاريخ</th></tr>
        ${orders.map(o => `<tr><td>${o.id}</td><td>${o.total.toFixed(2)}</td><td>${o.date}</td></tr>`).join('')}
        </table>
    `;
}

// ============ التحليل المالي والتسعير ============
async function renderFinancial() {
    const month = new Date().toISOString().slice(0,7);
    const expensesResult = await api.dbQuery("SELECT * FROM expenses WHERE company_id=? AND month=?", [currentCompany.id, month]);
    const expenses = expensesResult.success ? expensesResult.data : [];
    const totalExpenses = expenses.reduce((s,e)=> s + e.amount, 0);
    const productsResult = await api.dbQuery("SELECT * FROM products WHERE company_id=?", [currentCompany.id]);
    const products = productsResult.success ? productsResult.data : [];
    const materialsResult = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=?", [currentCompany.id]);
    const materials = materialsResult.success ? materialsResult.data : [];

    const productCosts = {};
    for (let p of products) {
        let cost = 0;
        if (p.recipe) {
            const recipe = JSON.parse(p.recipe);
            for (let comp of recipe) {
                const mat = materials.find(m => m.id === comp.material_id);
                if (mat) cost += (mat.purchase_price || 0) * comp.qty;
            }
        }
        productCosts[p.id] = cost;
    }

    let totalMonthlyForecast = 0;
    let totalForecastCost = 0;
    products.forEach(p => {
        const forecast = p.monthly_forecast || 0;
        totalMonthlyForecast += forecast;
        totalForecastCost += forecast * (productCosts[p.id] || 0);
    });

    const settings = window.appSettings || {};
    const marginPercent = settings.profit_margin_percent || 30;
    const breakEvenPricePerUnit = totalMonthlyForecast > 0 ? (totalForecastCost + totalExpenses) / totalMonthlyForecast : 0;
    const suggestedPrice = breakEvenPricePerUnit * (1 + marginPercent / 100);

    let alerts = [];
    products.forEach(p => {
        const cost = productCosts[p.id] || 0;
        if (p.price < cost + (totalExpenses / (totalMonthlyForecast || 1))) {
            alerts.push(`<p>⚠️ ${p.name} سعره الحالي (${p.price.toFixed(2)}) قد لا يغطي التكاليف!</p>`);
        }
    });

    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>التحليل المالي والتسعير</h1></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-info"><h3>إجمالي المصاريف الشهرية</h3><p>${totalExpenses.toFixed(2)} ر.س</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-utensils"></i></div><div class="stat-info"><h3>التكلفة المباشرة المتوقعة</h3><p>${totalForecastCost.toFixed(2)} ر.س</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-pie"></i></div><div class="stat-info"><h3>نقطة التعادل للوحدة</h3><p>${breakEvenPricePerUnit.toFixed(2)} ر.س</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-star"></i></div><div class="stat-info"><h3>السعر المقترح (ربح ${marginPercent}%)</h3><p>${suggestedPrice.toFixed(2)} ر.س</p></div></div>
        </div>
        ${alerts.length > 0 ? `<div class="alert-warning"><strong>تنبيهات:</strong><br>${alerts.join('')}</div>` : ''}
        <hr>
        <button class="btn btn-primary" onclick="openExpensesModal()">إدارة المصاريف الشهرية</button>
        <button class="btn btn-primary" onclick="openForecastModal()">تحديث توقعات المبيعات</button>
        <button class="btn btn-primary" onclick="updateMaterialPrices()">تحديث أسعار الشراء للمواد</button>
        <h3 style="margin-top:20px;">تفاصيل المنتجات</h3>
        <table>
            <tr><th>المنتج</th><th>التكلفة</th><th>السعر الحالي</th><th>التوقعات الشهرية</th><th>التعادل</th><th>مقترح</th></tr>
            ${products.map(p => {
                const cost = productCosts[p.id] || 0;
                const sug = (cost + totalExpenses / (totalMonthlyForecast || 1)) * (1 + marginPercent/100);
                return `<tr>
                    <td>${p.name}</td>
                    <td>${cost.toFixed(2)}</td>
                    <td>${p.price.toFixed(2)}</td>
                    <td>${p.monthly_forecast || 0}</td>
                    <td>${breakEvenPricePerUnit.toFixed(2)}</td>
                    <td>${sug.toFixed(2)}</td>
                </tr>`;
            }).join('')}
        </table>
    `;
}

async function openExpensesModal() {
    const month = new Date().toISOString().slice(0,7);
    const result = await api.dbQuery("SELECT * FROM expenses WHERE company_id=? AND month=?", [currentCompany.id, month]);
    const expenses = result.success ? result.data : [];
    let rows = expenses.map(e => `<tr><td>${e.category}</td><td>${e.description}</td><td>${e.amount}</td><td>${e.type}</td><td><button class="btn btn-sm btn-danger" onclick="deleteExpense(${e.id})">حذف</button></td></tr>`).join('');
    document.getElementById('modal-content').innerHTML = `
        <h3>المصاريف الشهرية (${month})</h3>
        <table>${rows}</table>
        <hr>
        <div class="form-group"><input id="exp-cat" placeholder="الفئة (مثل: رواتب)"></div>
        <div class="form-group"><input id="exp-desc" placeholder="الوصف"></div>
        <div class="form-group"><input type="number" id="exp-amount" placeholder="المبلغ" step="0.01"></div>
        <div class="form-group"><select id="exp-type"><option value="fixed">ثابتة</option><option value="variable">متغيرة</option></select></div>
        <button class="btn btn-primary" onclick="saveExpense()">إضافة</button>
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveExpense() {
    const month = new Date().toISOString().slice(0,7);
    const cat = document.getElementById('exp-cat').value;
    const desc = document.getElementById('exp-desc').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const type = document.getElementById('exp-type').value;
    if (!cat || isNaN(amount)) return;
    await api.dbRun('INSERT INTO expenses (company_id, month, category, description, amount, type) VALUES (?,?,?,?,?,?)',
        [currentCompany.id, month, cat, desc, amount, type]);
    closeModal();
    await switchTab('financial');
}

async function deleteExpense(id) {
    await api.dbRun('DELETE FROM expenses WHERE id=?', [id]);
    await switchTab('financial');
}

async function openForecastModal() {
    const result = await api.dbQuery("SELECT * FROM products WHERE company_id=?", [currentCompany.id]);
    const products = result.success ? result.data : [];
    let rows = products.map(p => `
        <tr>
            <td>${p.name}</td>
            <td><input type="number" id="fc_daily_${p.id}" value="${p.daily_forecast||0}" style="width:80px;"></td>
            <td><input type="number" id="fc_monthly_${p.id}" value="${p.monthly_forecast||0}" style="width:80px;"></td>
        </tr>
    `).join('');
    document.getElementById('modal-content').innerHTML = `
        <h3>توقعات المبيعات (يومي/شهري)</h3>
        <table>${rows}</table>
        <button class="btn btn-primary" onclick="saveForecasts()">حفظ التوقعات</button>
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveForecasts() {
    const result = await api.dbQuery("SELECT * FROM products WHERE company_id=?", [currentCompany.id]);
    const products = result.success ? result.data : [];
    for (let p of products) {
        const daily = parseInt(document.getElementById(`fc_daily_${p.id}`).value) || 0;
        const monthly = parseInt(document.getElementById(`fc_monthly_${p.id}`).value) || 0;
        await api.dbRun('UPDATE products SET daily_forecast=?, monthly_forecast=? WHERE id=?', [daily, monthly, p.id]);
    }
    closeModal();
    await switchTab('financial');
}

async function updateMaterialPrices() {
    const result = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=?", [currentCompany.id]);
    const materials = result.success ? result.data : [];
    let rows = materials.map(m => `
        <tr>
            <td>${m.name} (${m.unit})</td>
            <td><input type="number" id="mat_price_${m.id}" value="${m.purchase_price||0}" step="0.01" style="width:100px;"></td>
        </tr>
    `).join('');
    document.getElementById('modal-content').innerHTML = `
        <h3>أسعار شراء المواد الخام</h3>
        <table>${rows}</table>
        <button class="btn btn-primary" onclick="saveMaterialPrices()">حفظ الأسعار</button>
        <button class="btn btn-secondary" onclick="closeModal()">إغلاق</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveMaterialPrices() {
    const result = await api.dbQuery("SELECT * FROM raw_materials WHERE company_id=?", [currentCompany.id]);
    const materials = result.success ? result.data : [];
    for (let m of materials) {
        const price = parseFloat(document.getElementById(`mat_price_${m.id}`).value) || 0;
        await api.dbRun('UPDATE raw_materials SET purchase_price=? WHERE id=?', [price, m.id]);
    }
    closeModal();
    await switchTab('financial');
}

// ============ المحاسبة ============
async function renderAccounting() {
    const accountsResult = await api.dbQuery("SELECT * FROM chart_of_accounts WHERE company_id=?", [currentCompany.id]);
    const accounts = accountsResult.success ? accountsResult.data : [];
    const entriesResult = await api.dbQuery("SELECT * FROM journal_entries WHERE company_id=? ORDER BY date DESC LIMIT 20", [currentCompany.id]);
    const entries = entriesResult.success ? entriesResult.data : [];
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>المحاسبة</h1></div>
        <h3>دليل الحسابات</h3>
        <table><tr><th>الكود</th><th>الاسم</th></tr>
        ${accounts.map(a => `<tr><td>${a.code}</td><td>${a.name}</td></tr>`).join('')}
        </table>
        <h3 style="margin-top:20px;">آخر القيود</h3>
        <table><tr><th>تاريخ</th><th>بيان</th></tr>
        ${entries.map(e => `<tr><td>${e.date}</td><td>${e.description}</td></tr>`).join('')}
        </table>
    `;
}

// ============ المستخدمين ============
async function renderUsers() {
    const result = await api.dbQuery("SELECT * FROM users WHERE company_id=?", [currentCompany.id]);
    const users = result.success ? result.data : [];
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>المستخدمين</h1><button class="btn btn-primary" onclick="openUserModal()">إضافة مستخدم</button></div>
        <table><tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>محظور</th><th></th></tr>
        ${users.map(u => `<tr><td>${u.full_name}</td><td>${u.username}</td><td>${u.role}</td><td>${u.is_blocked?'نعم':'لا'}</td>
            <td><button class="btn btn-sm btn-primary" onclick="editUser(${u.id})">تعديل</button>
            <button class="btn btn-sm btn-warning" onclick="toggleBlockUser(${u.id})">${u.is_blocked?'فك الحظر':'حظر'}</button></td></tr>`).join('')}
        </table>
    `;
}

async function openUserModal(id = null) {
    let user = { full_name: '', username: '', password_hash: '', role: 'admin' };
    if (id) {
        const result = await api.dbGet("SELECT * FROM users WHERE id=?", [id]);
        if (result.success && result.data) user = result.data;
    }
    document.getElementById('modal-content').innerHTML = `
        <h3>${id?'تعديل':'إضافة'} مستخدم</h3>
        <div class="form-group"><input id="u-fullname" value="${user.full_name}" placeholder="الاسم الكامل"></div>
        <div class="form-group"><input id="u-username" value="${user.username}" placeholder="اسم الدخول"></div>
        <div class="form-group"><input type="password" id="u-password" placeholder="كلمة المرور (اترك فارغاً إن لم تتغير)"></div>
        <div class="form-group"><select id="u-role">
            <option value="admin" ${user.role=='admin'?'selected':''}>مدير عام</option>
            <option value="accountant" ${user.role=='accountant'?'selected':''}>محاسب</option>
            <option value="captain" ${user.role=='captain'?'selected':''}>كابتن</option>
        </select></div>
        <button class="btn btn-primary" onclick="saveUser(${id})">حفظ</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    document.getElementById('modal').classList.add('active');
}

async function saveUser(id) {
    const full = document.getElementById('u-fullname').value;
    const username = document.getElementById('u-username').value;
    const password = document.getElementById('u-password').value;
    const role = document.getElementById('u-role').value;
    if (!full || !username) return alert('الاسم واسم المستخدم مطلوبان');

    let result;
    if (id) {
        result = await api.updateUser({ id, company_id: currentCompany.id, full_name: full, username, password, role });
    } else {
        if (!password) return alert('كلمة المرور مطلوبة');
        result = await api.createUser({ company_id: currentCompany.id, full_name: full, username, password, role });
    }

    if (!result.success) {
        alert('خطأ في حفظ المستخدم: ' + (result.error || ''));
        return;
    }
    closeModal();
    await switchTab('users');
}

async function toggleBlockUser(id) {
    const userResult = await api.dbGet("SELECT * FROM users WHERE id=?", [id]);
    if (!userResult.success || !userResult.data) return;
    const user = userResult.data;
    await api.dbRun("UPDATE users SET is_blocked=? WHERE id=?", [user.is_blocked ? 0 : 1, id]);
    await switchTab('users');
}

// ============ الإعدادات ============
async function renderSettings() {
    const settings = window.appSettings || {};
    document.getElementById('main-content').innerHTML = `
        <div class="page-header"><h1>الإعدادات</h1></div>
        <div class="form-group"><label>الوضع الآمن</label><input type="checkbox" id="set-safe" ${settings.safe_mode?'checked':''}></div>
        <div class="form-group"><label>عدد الأسطر بالصفحة</label><input type="number" id="set-page" value="${settings.pagination||20}"></div>
        <div class="form-group"><label>هامش الربح المستهدف (%)</label><input type="number" id="set-margin" value="${settings.profit_margin_percent||30}" step="0.1"></div>
        <button class="btn btn-primary" onclick="saveSettings()">حفظ</button>
        <hr>
        <button class="btn btn-secondary" onclick="backupDB()">تصدير نسخة احتياطية</button>
        <button class="btn btn-secondary" onclick="restoreDB()">استيراد نسخة احتياطية</button>
    `;
}

async function saveSettings() {
    const safe = document.getElementById('set-safe').checked ? 1 : 0;
    const page = parseInt(document.getElementById('set-page').value) || 20;
    const margin = parseFloat(document.getElementById('set-margin').value) || 30;
    await api.dbRun('UPDATE settings SET safe_mode=?, pagination=?, profit_margin_percent=? WHERE company_id=?', [safe, page, margin, currentCompany.id]);
    window.appSettings.safe_mode = safe;
    window.appSettings.pagination = page;
    window.appSettings.profit_margin_percent = margin;
    alert('تم الحفظ');
}

async function backupDB() {
    const result = await api.backupDatabase();
    if (result.success && !result.cancelled) alert('تم التصدير');
}
async function restoreDB() {
    const result = await api.restoreDatabase();
    if (result.success && !result.cancelled) {
        alert('تم الاستيراد وسيتم إعادة التشغيل');
        location.reload();
    }
}

// ============ لوحة المفاتيح الافتراضية ============
let kbActiveInput = null;
let kbMode = 'arabic';

const arabicKeys = [
    ['ض','ص','ث','ق','ف','غ','ع','ه','خ','ح'],
    ['ش','س','ي','ب','ل','ا','ت','ن','م','ك'],
    ['ئ','ء','ؤ','ر','لا','ى','ة','و','ز','ظ']
];

const englishKeys = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m']
];

const numberKeys = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['.','0','00']
];

function showKeyboard(inputElement) {
    kbActiveInput = inputElement;
    document.getElementById('virtual-keyboard').style.display = 'block';
    renderKeys();
}

function hideKeyboard() {
    document.getElementById('virtual-keyboard').style.display = 'none';
    kbActiveInput = null;
}

function switchKBMode(mode) {
    kbMode = mode;
    renderKeys();
}

function renderKeys() {
    const container = document.getElementById('kb-keys-container');
    let keys = [];
    if (kbMode === 'arabic') keys = arabicKeys;
    else if (kbMode === 'english') keys = englishKeys;
    else keys = numberKeys;

    let html = '';
    for (let row of keys) {
        for (let key of row) {
            html += `<button class="kb-btn" onclick="kbInsert('${key}')" style="background:white; border:1px solid #ccc; border-radius:6px; padding:10px;">${key}</button>`;
        }
    }
    container.innerHTML = html;
}

function kbInsert(char) {
    if (!kbActiveInput) return;
    kbActiveInput.value = (kbActiveInput.value || '') + char;
    kbActiveInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function kbBackspace() {
    if (!kbActiveInput) return;
    kbActiveInput.value = kbActiveInput.value.slice(0, -1);
    kbActiveInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function kbEnter() {
    hideKeyboard();
    if (kbActiveInput) {
        kbActiveInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
        kbActiveInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13 }));
        kbActiveInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13 }));
    }
}

document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        showKeyboard(e.target);
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#virtual-keyboard') && !e.target.closest('input') && !e.target.closest('textarea')) {
        hideKeyboard();
    }
});

// ============ الختام ============
console.log('🚀 نظام تقنيات سوفت المحاسبي المتكامل جاهز - تصميم م/ عبدالرحمن الاكوع 773579486 967+');