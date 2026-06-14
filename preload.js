const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // قاعدة البيانات
    dbQuery: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
    dbRun: (sql, params) => ipcRenderer.invoke('db-run', sql, params),
    dbGet: (sql, params) => ipcRenderer.invoke('db-get', sql, params),
    
    // التفعيل
    checkActivation: () => ipcRenderer.invoke('check-activation'),
    activate: (code) => ipcRenderer.invoke('activate', code),
    
    // المنتجات
    saveProduct: (data) => ipcRenderer.invoke('save-product', data),
    deleteProduct: (id, company_id) => ipcRenderer.invoke('delete-product', { id, company_id }),
    
    // المواد
    saveMaterial: (data) => ipcRenderer.invoke('save-material', data),
    deleteMaterial: (id, company_id) => ipcRenderer.invoke('delete-material', { id, company_id }),
    
    // المستخدمين
    login: (username, password, company_id) => ipcRenderer.invoke('login', { username, password, company_id }),
    createUser: (data) => ipcRenderer.invoke('create-user', data),
    updateUser: (data) => ipcRenderer.invoke('update-user', data),
    
    // الشركات
    createCompany: (name) => ipcRenderer.invoke('create-company', { name }),
    
    // الإعدادات
    getSettings: (company_id) => ipcRenderer.invoke('get-settings', company_id),
    
    // الطباعة
    printThermal: (html) => ipcRenderer.send('print-thermal', html),
    
    // النسخ الاحتياطي
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    restoreDatabase: () => ipcRenderer.invoke('restore-database'),
    
    // الصور
    saveImage: (fileName, buffer) => ipcRenderer.invoke('save-image', { fileName, buffer }),
    getImagePath: (imagePath) => ipcRenderer.invoke('get-image-path', imagePath),
});