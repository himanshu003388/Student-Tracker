const DEFAULT_STATE = {
    theme: 'light',
    links: [
        { id: 1, name: 'LinkedIn', url: 'https://linkedin.com', icon: 'fab fa-linkedin' },
        { id: 2, name: 'GitHub', url: 'https://github.com', icon: 'fab fa-github' },
        { id: 3, name: 'YouTube', url: 'https://youtube.com', icon: 'fab fa-youtube' },
        { id: 4, name: 'LeetCode', url: 'https://leetcode.com', icon: 'fas fa-code' }
    ],
    tasks: [],
    exams: [],
    habits: [],
    weeklyTargets: [],
    monthlyTargets: [],
    habitStreak: 0,
    lastHabitUpdate: null,
    notes: [
        {
            id: 1,
            title: 'Welcome to Student Tracker! 🚀',
            content: 'Use this workspace to organize your tasks, track habits, keep study notes, and manage your budget.\n\nClick the "+" button in the top right of this section to add your own notes.',
            date: new Date().toLocaleDateString()
        },
        {
            id: 2,
            title: 'Quick Study Tips 💡',
            content: '1. Use the Pomodoro technique to stay focused.\n2. Break big projects into daily tasks.\n3. Log your habits daily to keep your day streak alive!',
            date: new Date().toLocaleDateString()
        }
    ],
    stats: { focusTimeMinutes: 0 },
    pomodoro: {
        workDuration: 25,
        shortDuration: 5,
        longDuration: 15,
        completedSessions: 0,
        isMuted: false
    },
    moneyTracker: {
        transactions: [],
        filters: { month: 'all', category: 'all', type: 'all', search: '', sortOrder: 'desc' }
    },
    _notesSeeded: 'v1'
};

let appState = DEFAULT_STATE;
try {
    const rawState = localStorage.getItem('cs_dashboard_data');
    if (rawState) {
        appState = sanitizeAppState(JSON.parse(rawState));
    }
} catch (e) {
    console.error("Failed to load state from localStorage", e);
}

// --- Google Drive Sync Logic ---
const CLIENT_ID = '761589741235-437vr573qdoh8h8q0e497g74a8d6rao2.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
let isSyncing = false;
let driveFileIdCache = null;
let syncTimeout = null;

function initGoogleAuth() {
    if (typeof google === 'undefined') {
        setTimeout(initGoogleAuth, 100);
        return;
    }

    // Check for cached token to maintain session
    try {
        const cached = JSON.parse(localStorage.getItem('cs_google_token'));
        if (cached && cached.expiresAt > Date.now()) {
            accessToken = cached.token;
            updateAuthUI(true);
            syncFromDrive();
        }
    } catch (e) { }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                // Cache token with 1 min buffer
                const expiresAt = Date.now() + (tokenResponse.expires_in * 1000) - 60000;
                localStorage.setItem('cs_google_token', JSON.stringify({ token: accessToken, expiresAt }));
                updateAuthUI(true);
                syncFromDrive();
            }
        },
    });

    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
        authBtn.addEventListener('click', handleAuthClick);
    }
}

function handleAuthClick() {
    if (accessToken) {
        if (confirm('Are you sure you want to sign out of your Google account?')) {
            // Sign out
            google.accounts.oauth2.revoke(accessToken, () => {
                accessToken = null;
                localStorage.removeItem('cs_google_token');
                updateAuthUI(false);
            });
        }
    } else {
        // Sign in
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

function updateAuthUI(isLoggedIn) {
    const authText = document.getElementById('auth-btn-text');
    const authBtn = document.getElementById('auth-btn');
    if (isLoggedIn) {
        authText.textContent = 'Sign Out';
        authBtn.innerHTML = '<i class="fab fa-google"></i> <span id="auth-btn-text">Sign Out</span>';
    } else {
        authText.textContent = 'Sign In';
        authBtn.innerHTML = '<i class="fab fa-google"></i> <span id="auth-btn-text">Sign In</span>';
    }
}

async function syncFromDrive() {
    if (!accessToken) return;
    try {
        let fileId = await getDriveFileId();
        if (fileId) {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&t=${Date.now()}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Cache-Control': 'no-cache'
                }
            });
            const data = await res.json();
            if (data && data.theme) { // Simple check for valid state
                isSyncing = true;
                const newStateStr = JSON.stringify(sanitizeAppState(data));
                const oldStateStr = localStorage.getItem('cs_dashboard_data');

                // Only reload if the cloud data is actually different from local data
                if (newStateStr !== oldStateStr) {
                    appState = sanitizeAppState(data);
                    localStorage.setItem('cs_dashboard_data', newStateStr);
                    location.reload(); // Reload to reflect changes globally
                } else {
                    isSyncing = false;
                }
            }
        }
    } catch (e) {
        console.error('Error syncing from drive:', e);
    }
}

async function syncToDrive(stateToSync) {
    if (!accessToken || isSyncing) return;
    try {
        let fileId = await getDriveFileId();
        const fileContent = JSON.stringify(stateToSync);

        if (fileId) {
            // If file exists, just update the content using uploadType=media (simplest and most reliable)
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: fileContent
            });
        } else {
            // If file doesn't exist, create it in appDataFolder using multipart/related
            const metadata = {
                name: 'cs_dashboard_data.json',
                parents: ['appDataFolder']
            };
            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            const multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                fileContent +
                close_delim;

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartRequestBody
            });
        }
        console.log("Successfully synced to Google Drive!");
    } catch (e) {
        console.error('Error syncing to drive:', e);
    }
}

async function getDriveFileId() {
    if (driveFileIdCache) return driveFileIdCache;
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='cs_dashboard_data.json'`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            driveFileIdCache = data.files[0].id;
            return driveFileIdCache;
        }
    } catch (e) {
        console.error('Error getting drive file id:', e);
    }
    return null;
}

let uploadFolderIdCache = null;

async function getOrCreateUploadFolder() {
    if (uploadFolderIdCache) return uploadFolderIdCache;
    try {
        const q = encodeURIComponent("name='Student Tracker Uploads' and mimeType='application/vnd.google-apps.folder' and trashed=false");
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error('Failed to search folder: ' + err);
        }
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            uploadFolderIdCache = data.files[0].id;
            return uploadFolderIdCache;
        }
        
        // Create folder
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Student Tracker Uploads',
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error('Failed to create folder: ' + err);
        }
        const createData = await createRes.json();
        if (createData.id) {
            uploadFolderIdCache = createData.id;
            return uploadFolderIdCache;
        }
    } catch (e) {
        console.error('Error creating upload folder:', e);
        throw e;
    }
    return null;
}

async function uploadFileToDrive(file) {
    if (!accessToken) throw new Error('Not authenticated');
    
    const folderId = await getOrCreateUploadFolder();
    if (!folderId) throw new Error('Could not get upload folder');

    const metadata = {
        name: file.name,
        parents: [folderId]
    };

    const boundary = '-------314159265358979323846';
    const first_delimiter = "--" + boundary + "\r\n";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async () => {
            try {
                const metadataBlob = new Blob([
                    first_delimiter,
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
                    JSON.stringify(metadata),
                    delimiter,
                    `Content-Type: ${file.type}\r\n\r\n`
                ], { type: 'text/plain' });
                
                const fileBlob = new Blob([reader.result]);
                const closeBlob = new Blob([close_delim], { type: 'text/plain' });

                const body = new Blob([metadataBlob, fileBlob, closeBlob]);

                const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,iconLink', {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`
                    },
                    body: body
                });
                
                if (!res.ok) {
                    const err = await res.text();
                    reject(new Error(`Upload failed HTTP ${res.status}: ${err}`));
                    return;
                }
                
                const data = await res.json();
                if (data.id) {
                    resolve(data);
                } else {
                    reject(new Error("No ID in response"));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
    });
}

// Auto-sync when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && accessToken && !isSyncing) {
        syncFromDrive();
    }
});

window.addEventListener('load', initGoogleAuth);
// -------------------------------

function scheduleSyncToDrive(state) {
    if (!accessToken || isSyncing) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    // Debounce the upload to avoid rapid overlapping API calls
    syncTimeout = setTimeout(() => {
        syncToDrive(state);
    }, 500);
}

function saveState() {
    localStorage.setItem('cs_dashboard_data', JSON.stringify(appState));
    updateStats();
    if (!isSyncing) {
        scheduleSyncToDrive(appState);
    }
}

const elements = {
    sections: document.querySelectorAll('main > section'),
    navLinks: document.querySelectorAll('.nav-links a'),
    themeToggle: document.getElementById('theme-toggle'),
    currentTime: document.getElementById('current-time'),
    currentDate: document.getElementById('current-date'),
    linksGrid: document.getElementById('links-grid'),
    taskList: document.getElementById('task-list'),
    taskInput: document.getElementById('task-input'),
    taskDueDate: document.getElementById('task-due-date'),
    addTaskBtn: document.getElementById('add-task-btn'),
    examList: document.getElementById('exam-list'),
    addExamBtn: document.getElementById('add-exam-btn'),
    examCountdownContainer: document.getElementById('exam-countdown-container'),
    habitsTableHead: document.getElementById('habits-table-head'),
    habitsTableBody: document.getElementById('habits-table-body'),
    habitMonthName: document.getElementById('habit-month-name'),
    addHabitBtn: document.getElementById('add-habit-btn'),
    resetHabitsBtn: document.getElementById('reset-habits-btn'),
    habitStreakDisplay: document.getElementById('habit-streak-display'),
    notesGrid: document.getElementById('notes-grid'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalBody: document.getElementById('modal-body'),
    modalTitle: document.getElementById('modal-title'),
    closeModal: document.querySelector('.close-modal'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    statTasksDone: document.getElementById('stat-tasks-done'),
    statStreak: document.getElementById('stat-streak'),
    statFocusTime: document.getElementById('stat-focus-time'),
    moneyTotalIncome: document.getElementById('money-total-income'),
    moneyTotalExpense: document.getElementById('money-total-expense'),
    moneyCurrentBalance: document.getElementById('money-current-balance'),
    moneyMonthExpense: document.getElementById('money-month-expense'),
    moneyMonthIncome: document.getElementById('money-month-income'),
    moneyMonthBalance: document.getElementById('money-month-balance'),
    transactionForm: document.getElementById('transaction-form'),
    transactionBody: document.getElementById('transaction-body'),
    moneySearch: document.getElementById('money-search'),
    filterMonth: document.getElementById('filter-month'),
    filterCategory: document.getElementById('filter-category'),
    filterType: document.getElementById('filter-type'),
    sortDateBtn: document.getElementById('sort-date-btn'),
    reportMonthSelector: document.getElementById('report-month-selector'),
    reportIncome: document.getElementById('report-income'),
    reportExpense: document.getElementById('report-expense'),
    reportSavings: document.getElementById('report-savings'),
    reportTopCategory: document.getElementById('report-top-category'),
    moneyExportBtn: document.getElementById('money-export-btn'),
    moneyImportBtn: document.getElementById('money-import-btn'),

    // Pomodoro Elements
    pomodoroTime: document.getElementById('pomodoro-time'),
    pomodoroLabel: document.getElementById('pomodoro-label'),
    pomodoroPlayBtn: document.getElementById('pomodoro-play-btn'),
    pomodoroResetBtn: document.getElementById('pomodoro-reset-btn'),
    pomodoroMuteBtn: document.getElementById('pomodoro-mute-btn'),
    pomodoroSettingsBtn: document.getElementById('pomodoro-settings-btn'),
    pomodoroSaveSettings: document.getElementById('pomodoro-save-settings'),
    pomodoroCloseSettings: document.getElementById('pomodoro-close-settings'),
    pomodoroCompletedSessions: document.getElementById('pomodoro-completed-sessions'),
    pomodoroTotalFocusTime: document.getElementById('pomodoro-total-focus-time'),
    pomodoroCardTime: document.getElementById('pomodoro-card-time'),
    pomodoroCardDate: document.getElementById('pomodoro-card-date')
};

document.addEventListener('DOMContentLoaded', () => {
    // Seed / reset default links to the current default set (version-gated)
    if (appState._linksSeeded !== 'v2') {
        // Keep any user-added links (those not in old defaults by name), then prepend new defaults
        const defaultNames = new Set(DEFAULT_STATE.links.map(l => l.name));
        const oldDefaultNames = new Set([
            'GitHub', 'LeetCode', 'GeeksforGeeks', 'LinkedIn', 'Stack Overflow',
            'Codeforces', 'HackerRank', 'CodeChef', 'YouTube', 'Dev.to'
        ]);
        // Preserve only custom (non-default) links the user may have added
        const customLinks = appState.links.filter(l => !oldDefaultNames.has(l.name));
        let maxId = DEFAULT_STATE.links.reduce((max, l) => Math.max(max, l.id), 0);
        customLinks.forEach(l => { l.id = ++maxId; });
        appState.links = [...DEFAULT_STATE.links, ...customLinks];
        appState._linksSeeded = 'v2';
        saveState();
    }

    if (appState._notesSeeded !== 'v1') {
        if (!appState.notes || appState.notes.length === 0) {
            appState.notes = [
                {
                    id: 1,
                    title: 'Welcome to Student Tracker! 🚀',
                    content: 'Use this workspace to organize your tasks, track habits, keep study notes, and manage your budget.\n\nClick the "+" button in the top right of this section to add your own notes.',
                    date: getLocalDateKey()
                },
                {
                    id: 2,
                    title: 'Quick Study Tips 💡',
                    content: '1. Use the Pomodoro technique to stay focused.\n2. Break big projects into daily tasks.\n3. Log your habits daily to keep your day streak alive!',
                    date: getLocalDateKey()
                }
            ];
        }
        appState._notesSeeded = 'v1';
        saveState();
    }

    // Migrate old locale date strings to YYYY-MM-DD
    migrateLocaleDates();

    initTheme();
    initClock();
    initQuotes();
    initNavigation();
    renderAll();
    initEventListeners();
});

function renderAll() {
    updateHabitStreak();
    renderLinks();
    renderTasks();
    renderExams();
    renderHabits();
    renderNotes();
    updateStats();

    initHabitsChart();
    updateHabitGraph();

    renderWeeklyTargets();
    renderMonthlyTargets();
    updateTargetCircularProgress();
}

function initTheme() {
    document.body.className = appState.theme === 'dark' ? 'dark-mode' : 'light-mode';
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.content = appState.theme === 'dark' ? '#050505' : '#f5f5f5';
    if (elements.themeToggle) {
        elements.themeToggle.classList.toggle('dark', appState.theme === 'dark');
    }
}

function updateChartTheme() {
    const textColor = appState.theme === 'dark' ? '#f5f5f5' : '#171717';
    const gridColor = appState.theme === 'dark' ? '#262626' : '#e5e5e5';
    const tickColor = appState.theme === 'dark' ? '#525252' : '#737373';

    if (expensePieChart) {
        expensePieChart.options.plugins.legend.labels.color = textColor;
        expensePieChart.update();
    }
    if (spendingBarChart) {
        spendingBarChart.options.plugins.legend.labels.color = textColor;
        spendingBarChart.options.scales.y.grid.color = gridColor;
        spendingBarChart.options.scales.y.ticks.color = tickColor;
        spendingBarChart.options.scales.x.ticks.color = tickColor;
        spendingBarChart.update();
    }
}

if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        initTheme();
        saveState();
        updateChartTheme();

        // Keep habits checklist + chart in sync with theme
        updateHabitGraph();
    });
    elements.themeToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            elements.themeToggle.click();
        }
    });
}

function initNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-section');
            localStorage.setItem('cs_active_section', target);

            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            elements.sections.forEach(section => {
                if (section.id === target) {
                    section.classList.remove('hidden');
                    section.classList.add('active-section');
                } else {
                    section.classList.add('hidden');
                    section.classList.remove('active-section');
                }
            });

            setTimeout(() => {
                if (target === 'money') {
                    if (typeof expensePieChart !== 'undefined' && expensePieChart) expensePieChart.resize();
                    if (typeof spendingBarChart !== 'undefined' && spendingBarChart) spendingBarChart.resize();
                }
            }, 10);

            const navLinksContainer = document.querySelector('.nav-links');
            const mobileBtn = document.querySelector('.mobile-menu-btn');
            if (window.innerWidth <= 768 && navLinksContainer.classList.contains('mobile-open')) {
                navLinksContainer.classList.remove('mobile-open');
                if (mobileBtn) {
                    mobileBtn.innerHTML = '<i class="fas fa-bars"></i>';
                    mobileBtn.classList.remove('open');
                }
            }
        });
    });

    const logoLink = document.querySelector('.logo');
    if (logoLink) {
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            const dashboardLink = document.querySelector('.nav-links a[data-section="dashboard"]');
            if (dashboardLink) {
                dashboardLink.click();
            }
        });
    }

    // Restore active tab
    const activeSection = localStorage.getItem('cs_active_section') || 'dashboard';
    const activeLink = document.querySelector(`.nav-links a[data-section="${activeSection}"]`);
    if (activeLink) {
        activeLink.click();
    }
}
const MOTIVATIONAL_QUOTES = [
    "Believe you can and you're halfway there.",
    "Act as if what you do makes a difference. It does.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "Never bend your head. Always hold it high. Look the world straight in the eye.",
    "What you get by achieving your goals is not as important as what you become by achieving your goals.",
    "It always seems impossible until it's done.",
    "Your talent determines what you can do. Your motivation determines how much you are willing to do.",
    "Start where you are. Use what you have. Do what you can.",
    "Don't watch the clock; do what it does. Keep going.",
    "The secret of getting ahead is getting started."
];

function initQuotes() {
    const quoteEl = document.getElementById('motivational-quote');
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
        quoteEl.textContent = `"${MOTIVATIONAL_QUOTES[randomIndex]}"`;
    }
}

function initClock() {
    const update = () => {
        const now = new Date();
        if (elements.currentTime) elements.currentTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        if (elements.currentDate) elements.currentDate.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // Update Pomodoro Card Clock
        if (elements.pomodoroCardTime) {
            elements.pomodoroCardTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }
        if (elements.pomodoroCardDate) {
            elements.pomodoroCardDate.textContent = now.toLocaleDateString(undefined, {
                weekday: 'short', day: 'numeric', month: 'short'
            });
        }
    };
    setInterval(update, 1000);
    update();
}
function extractDomain(url) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        return new URL(url).hostname;
    } catch { return ''; }
}

function renderLinks() {
    if (!elements.linksGrid) return;
    elements.linksGrid.innerHTML = appState.links.map(link => {
        const hasCustomIcon = link.icon && link.icon.includes('fa-');
        const domain = extractDomain(link.url);
        const sanitizedUrl = sanitizeUrl(link.url);
        const logoHtml = hasCustomIcon
            ? `<i class="${escapeHtml(link.icon)}"></i>`
            : `<img class="link-logo" src="https://www.google.com/s2/favicons?domain=${escapeHtml(domain)}&sz=64"
                   onerror="this.style.display='none';this.parentElement.querySelector('.link-logo-fallback').style.display='block'" alt="">
               <i class="fas fa-globe link-logo-fallback" style="display:none"></i>`;
        return `
            <div class="link-card" data-id="${link.id}" draggable="true">
                <div class="link-drag-handle" title="Hold to rearrange"><i class="fas fa-grip-dots-vertical"></i></div>
                <button class="link-menu-btn" onclick="toggleLinkMenu(this, event)" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                <div class="link-menu-dropdown">
                    <button onclick="editLink(${link.id}, event)"><i class="fas fa-pen"></i> Edit</button>
                    <button onclick="deleteLink(${link.id}, event)" class="danger"><i class="fas fa-trash"></i> Delete</button>
                </div>
                <a href="${sanitizedUrl}" target="_blank" class="link-card-main">
                    ${logoHtml}
                    <span>${escapeHtml(link.name)}</span>
                </a>
                <div class="link-card-actions">
                    <button class="link-action-btn" onclick="editLink(${link.id}, event)" title="Edit"><i class="fas fa-pen"></i> Edit</button>
                    <button class="link-action-btn danger" onclick="deleteLink(${link.id}, event)" title="Delete"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `;
    }).join('');
    initLinksDragAndDrop();
}

function initLinksDragAndDrop() {
    const grid = elements.linksGrid;
    if (!grid) return;

    let dragSrc = null;
    let touchDragSrc = null;
    let touchClone = null;
    let touchStartX = 0, touchStartY = 0;
    let longPressTimer = null;
    let touchDragActive = false;

    // --- Mouse / Desktop Drag & Drop ---
    grid.querySelectorAll('.link-card').forEach(card => {
        card.addEventListener('dragstart', e => {
            dragSrc = card;
            card.classList.add('link-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.id);
        });

        card.addEventListener('dragend', () => {
            dragSrc = null;
            card.classList.remove('link-dragging');
            grid.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));
        });

        card.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (card !== dragSrc) {
                grid.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));
                card.classList.add('link-drag-over');
            }
        });

        card.addEventListener('dragleave', () => {
            card.classList.remove('link-drag-over');
        });

        card.addEventListener('drop', e => {
            e.preventDefault();
            card.classList.remove('link-drag-over');
            if (!dragSrc || dragSrc === card) return;
            reorderLinks(dragSrc.dataset.id, card.dataset.id);
        });

        // --- Touch / Mobile Long-press Drag ---
        card.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;

            longPressTimer = setTimeout(() => {
                touchDragActive = true;
                touchDragSrc = card;
                card.classList.add('link-dragging');

                // Create a visual clone that follows the finger
                touchClone = card.cloneNode(true);
                const rect = card.getBoundingClientRect();
                touchClone.style.cssText = `
                    position: fixed;
                    left: ${rect.left}px;
                    top: ${rect.top}px;
                    width: ${rect.width}px;
                    opacity: 0.85;
                    pointer-events: none;
                    z-index: 9999;
                    transform: scale(1.05) rotate(2deg);
                    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
                    transition: transform 0.1s ease;
                `;
                document.body.appendChild(touchClone);

                // Haptic feedback if available
                if (navigator.vibrate) navigator.vibrate(50);
            }, 400);
        }, { passive: true });

        card.addEventListener('touchmove', e => {
            if (!touchDragActive) {
                // Cancel long press if moved too much before threshold
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - touchStartX);
                const dy = Math.abs(touch.clientY - touchStartY);
                if (dx > 8 || dy > 8) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                return;
            }
            e.preventDefault();
            const touch = e.touches[0];

            // Move clone
            if (touchClone) {
                const rect = touchDragSrc.getBoundingClientRect();
                touchClone.style.left = `${touch.clientX - rect.width / 2}px`;
                touchClone.style.top = `${touch.clientY - rect.height / 2}px`;
            }

            // Find card under finger
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCard = el ? el.closest('.link-card') : null;
            grid.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));
            if (targetCard && targetCard !== touchDragSrc) {
                targetCard.classList.add('link-drag-over');
            }
        }, { passive: false });

        card.addEventListener('touchend', e => {
            clearTimeout(longPressTimer);
            longPressTimer = null;

            if (!touchDragActive) return;
            touchDragActive = false;

            if (touchClone) {
                touchClone.remove();
                touchClone = null;
            }

            if (touchDragSrc) touchDragSrc.classList.remove('link-dragging');

            const touch = e.changedTouches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCard = el ? el.closest('.link-card') : null;

            grid.querySelectorAll('.link-card').forEach(c => c.classList.remove('link-drag-over'));

            if (targetCard && targetCard !== touchDragSrc) {
                reorderLinks(touchDragSrc.dataset.id, targetCard.dataset.id);
            }

            touchDragSrc = null;
        }, { passive: true });
    });
}

function reorderLinks(srcId, targetId) {
    const links = appState.links;
    const srcIndex = links.findIndex(l => String(l.id) === String(srcId));
    const targetIndex = links.findIndex(l => String(l.id) === String(targetId));
    if (srcIndex === -1 || targetIndex === -1) return;

    // Remove src and insert before/after target
    const [moved] = links.splice(srcIndex, 1);
    links.splice(targetIndex, 0, moved);

    saveState();
    renderLinks();
}

window.toggleLinkMenu = (btn, e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const dropdown = btn.nextElementSibling;
    document.querySelectorAll('.link-menu-dropdown.show').forEach(m => {
        if (m !== dropdown) {
            m.classList.remove('show');
        }
    });
    dropdown.classList.toggle('show');
};

window.toggleHabitMenu = (btn, e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const dropdown = btn.nextElementSibling;
    const container = btn.parentElement;
    const cell = btn.closest('.habit-name-cell');

    // Close other habit menus
    document.querySelectorAll('.habit-menu-dropdown.show').forEach(m => {
        if (m !== dropdown) {
            m.classList.remove('show');
            m.style.position = '';
            m.style.top = '';
            m.style.left = '';
            m.style.zIndex = '';
            m.style.display = '';
        }
    });
    document.querySelectorAll('.habit-menu-container.menu-open').forEach(c => {
        if (c !== container) {
            c.classList.remove('menu-open');
        }
    });
    document.querySelectorAll('.habit-name-cell.menu-open').forEach(c => {
        if (c !== cell) {
            c.classList.remove('menu-open');
        }
    });

    const isShowing = dropdown.classList.toggle('show');
    if (isShowing) {
        container.classList.add('menu-open');
        if (cell) cell.classList.add('menu-open');
        const rect = btn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.display = 'flex';
        const width = dropdown.offsetWidth || 55;
        dropdown.style.left = `${rect.right - width}px`;
        dropdown.style.zIndex = '99999';
    } else {
        container.classList.remove('menu-open');
        if (cell) cell.classList.remove('menu-open');
        dropdown.style.position = '';
        dropdown.style.top = '';
        dropdown.style.left = '';
        dropdown.style.zIndex = '';
        dropdown.style.display = '';
    }
};

const closeAllDropdowns = () => {
    document.querySelectorAll('.link-menu-dropdown.show').forEach(m => {
        m.classList.remove('show');
        m.style.position = '';
        m.style.top = '';
        m.style.left = '';
        m.style.zIndex = '';
        m.style.display = '';
    });
    document.querySelectorAll('.habit-menu-dropdown.show').forEach(m => {
        m.classList.remove('show');
        m.style.position = '';
        m.style.top = '';
        m.style.left = '';
        m.style.zIndex = '';
        m.style.display = '';
    });
    document.querySelectorAll('.habit-menu-container.menu-open').forEach(c => {
        c.classList.remove('menu-open');
    });
    document.querySelectorAll('.habit-name-cell.menu-open').forEach(c => {
        c.classList.remove('menu-open');
    });
};

document.addEventListener('click', closeAllDropdowns);
document.addEventListener('scroll', closeAllDropdowns, { capture: true, passive: true });

window.deleteLink = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    appState.links = appState.links.filter(l => l.id !== id);
    saveState();
    renderLinks();
};

window.editLink = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    const link = appState.links.find(l => l.id === id);
    if (!link) return;

    showModal('Edit Quick Link', `
        <form id="edit-link-form">
            <div class="form-group">
                <label>Link Name</label>
                <input type="text" id="edit-link-name" required value="${escapeHtml(link.name)}">
            </div>
            <div class="form-group">
                <label>URL</label>
                <input type="url" id="edit-link-url" required value="${escapeHtml(link.url)}">
            </div>
            <div class="form-group">
                <label>Icon (FontAwesome class, optional)</label>
                <input type="text" id="edit-link-icon" placeholder="e.g. fab fa-github" value="${escapeHtml(link.icon)}">
            </div>
            <button type="submit" class="btn-primary block">Save Changes</button>
        </form>
    `);

    document.getElementById('edit-link-form').addEventListener('submit', (e) => {
        e.preventDefault();
        link.name = document.getElementById('edit-link-name').value.trim();
        link.url = sanitizeUrl(document.getElementById('edit-link-url').value.trim());
        link.icon = document.getElementById('edit-link-icon').value.trim();
        saveState();
        renderLinks();
        closeModal();
    });
};

const addLinkBtn = document.getElementById('add-link-btn');
if (addLinkBtn) {
    addLinkBtn.addEventListener('click', () => {
        showModal('Add Quick Link', `
            <form id="add-link-form">
                <div class="form-group">
                    <label>Link Name</label>
                    <input type="text" id="link-name" required placeholder="e.g. LeetCode">
                </div>
                <div class="form-group">
                    <label>URL</label>
                    <input type="url" id="link-url" required placeholder="https://...">
                </div>
                <div class="form-group">
                    <label>Icon (FontAwesome class, optional)</label>
                    <input type="text" id="link-icon" placeholder="e.g. fab fa-github">
                </div>
                <button type="submit" class="btn-primary block">Add Link</button>
            </form>
        `);

        document.getElementById('add-link-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newLink = {
                id: Date.now(),
                name: document.getElementById('link-name').value.trim(),
                url: sanitizeUrl(document.getElementById('link-url').value.trim()),
                icon: document.getElementById('link-icon').value.trim()
            };
            appState.links.push(newLink);
            saveState();
            renderLinks();
            closeModal();
        });
    });
}

function renderTasks() {
    if (!elements.taskList) return;
    const filterBtn = document.querySelector('.filter-btn.active');
    const filter = filterBtn ? filterBtn.dataset.filter : 'all';

    let filteredTasks = appState.tasks;
    if (filter === 'pending') filteredTasks = appState.tasks.filter(t => !t.completed);
    if (filter === 'completed') filteredTasks = appState.tasks.filter(t => t.completed);

    // Only allow drag reorder when showing the full unfiltered list
    const isFiltered = filter !== 'all';

    elements.taskList.innerHTML = filteredTasks.map(task => `
        <li class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}" ${!isFiltered ? 'draggable="true"' : ''}>
            ${!isFiltered ? `<div class="task-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></div>` : ''}
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
            <span>${escapeHtml(task.text)}</span>
            <button class="delete-task" onclick="deleteTask(${task.id})"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');

    if (!isFiltered) initTasksDragAndDrop();
}

if (elements.addTaskBtn) {
    elements.addTaskBtn.addEventListener('click', () => {
        const text = elements.taskInput.value.trim();
        if (text) {
            appState.tasks.push({ id: Date.now(), text, completed: false, date: getLocalDateKey() });
            elements.taskInput.value = '';
            saveState();
            renderTasks();
        }
    });
}

// --- EXAM COUNTDOWNS ---
function renderExams() {
    if (!elements.examList || !elements.examCountdownContainer) return;

    // Sort exams by date
    const sortedExams = [...(appState.exams || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

    elements.examCountdownContainer.style.display = 'block';

    if (sortedExams.length === 0) {
        elements.examList.innerHTML = `<p style="text-align: center; color: var(--mute); font-size: 0.9rem; padding: 1rem 0;">No upcoming exams or deadlines.</p>`;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    elements.examList.innerHTML = sortedExams.map(exam => {
        const examDate = new Date(exam.date);
        examDate.setMinutes(examDate.getMinutes() + examDate.getTimezoneOffset());
        examDate.setHours(0, 0, 0, 0);

        const diffTime = examDate - today;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        const creationDate = new Date(exam.id);
        creationDate.setHours(0, 0, 0, 0);

        const totalDurationDays = Math.round((examDate - creationDate) / (1000 * 60 * 60 * 24));

        let progress = 100;
        if (diffDays <= 0) {
            progress = 0;
        } else if (totalDurationDays > 0) {
            progress = Math.max(0, Math.min(100, (diffDays / totalDurationDays) * 100));
        }

        let barColor = 'var(--link)'; // Blue
        let daysText = `${diffDays} Days Left`;

        if (diffDays < 0) {
            barColor = 'var(--error)';
            daysText = 'Passed';
        } else if (diffDays === 0) {
            barColor = 'var(--error)'; // Red
            daysText = 'Today!';
        } else if (diffDays <= 3) {
            barColor = 'var(--error)'; // Red
        } else if (diffDays <= 7) {
            barColor = 'var(--warning)'; // Yellow
        }

        return `
            <div class="exam-item" style="flex-direction: column; align-items: stretch; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="exam-info">
                        <h4>${escapeHtml(exam.name)}</h4>
                        <p>${examDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; color: ${barColor};">${daysText}</span>
                        <button class="exam-delete-btn" onclick="deleteExam(${exam.id})" title="Remove Exam" style="margin-left: 0; padding: 0.2rem;"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="progress-container" style="height: 6px; margin-top: 0; background: var(--canvas-soft-2);">
                    <div class="progress-bar" style="width: ${progress}%; background: ${barColor};"></div>
                </div>
            </div>
        `;
    }).join('');
}

if (elements.addExamBtn) {
    elements.addExamBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('exam-name-input');
        const dateInput = document.getElementById('exam-date-input');
        
        if (!nameInput || !dateInput) return;
        
        const name = nameInput.value.trim();
        const dateStr = dateInput.value;

        if (!name || !dateStr) {
            alert('Please provide both a name and a date.');
            return;
        }

        if (!appState.exams) appState.exams = [];
        appState.exams.push({
            id: Date.now(),
            name: name,
            date: dateStr
        });

        nameInput.value = '';
        dateInput.value = '';
        saveState();
        renderExams();
    });
}

window.deleteExam = (id) => {
    if (confirm('Remove this exam countdown?')) {
        appState.exams = appState.exams.filter(e => e.id !== id);
        saveState();
        renderExams();
    }
};
// -----------------------

window.toggleTask = (id) => {
    const task = appState.tasks.find(t => t.id === id);
    if (task) task.completed = !task.completed;
    saveState();
    renderTasks();
};

window.deleteTask = (id) => {
    appState.tasks = appState.tasks.filter(t => t.id !== id);
    saveState();
    renderTasks();
};



function reorderTask(srcId, targetId) {
    const tasks = appState.tasks;
    const srcIndex = tasks.findIndex(t => String(t.id) === String(srcId));
    const targetIndex = tasks.findIndex(t => String(t.id) === String(targetId));
    if (srcIndex === -1 || targetIndex === -1) return;
    const [moved] = tasks.splice(srcIndex, 1);
    tasks.splice(targetIndex, 0, moved);
    saveState();
    renderTasks();
}

function initTasksDragAndDrop() {
    const list = elements.taskList;
    if (!list) return;
    let dragSrc = null;

    list.querySelectorAll('.task-item[draggable]').forEach(item => {
        item.addEventListener('dragstart', e => {
            dragSrc = item;
            item.classList.add('task-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
        });
        item.addEventListener('dragend', () => {
            dragSrc = null;
            item.classList.remove('task-dragging');
            list.querySelectorAll('.task-item').forEach(i => i.classList.remove('task-drag-over'));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (item !== dragSrc) {
                list.querySelectorAll('.task-item').forEach(i => i.classList.remove('task-drag-over'));
                item.classList.add('task-drag-over');
            }
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('task-drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('task-drag-over');
            if (!dragSrc || dragSrc === item) return;
            reorderTask(dragSrc.dataset.id, item.dataset.id);
        });
    });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTasks();
    });
});

let habitsChart;

function renderHabits() {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const today = now.getDate();

    if (elements.habitMonthName) {
        elements.habitMonthName.textContent = currentMonth;
    }

    let headHtml = '<th>Habit</th>';
    for (let i = 1; i <= daysInMonth; i++) {
        headHtml += `<th class="${i === today ? 'today' : ''}">${i}</th>`;
    }
    if (elements.habitsTableHead) {
        elements.habitsTableHead.innerHTML = headHtml;
    }

    if (elements.habitsTableBody) {
        elements.habitsTableBody.innerHTML = appState.habits.map(habit => {
            const escapedName = escapeHtml(habit.name);
            let cellsHtml = `
                <td class="habit-name-cell">
                    <div class="habit-name-container">
                        <span class="habit-name-text" title="${escapedName}">${escapedName}</span>
                        <div class="habit-menu-container">
                            <button class="habit-menu-btn" onclick="toggleHabitMenu(this, event)" title="More options">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="habit-menu-dropdown">
                                <button onclick="editHabit(${habit.id}); event.stopPropagation();" title="Edit Habit"><i class="fas fa-edit"></i> Edit</button>
                                <button onclick="deleteHabit(${habit.id}); event.stopPropagation();" class="danger" title="Delete Habit"><i class="fas fa-trash"></i> Delete</button>
                            </div>
                        </div>
                    </div>
                </td>
            `;

            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = getLocalDateKey(new Date(now.getFullYear(), now.getMonth(), i));
                const isCompleted = habit.history && habit.history[dateStr];
                cellsHtml += `
                    <td>
                        <div class="habit-cell ${isCompleted ? 'completed' : ''} ${i === today ? 'today' : ''}"
                             onclick="toggleHabitDay(${habit.id}, '${dateStr}')">
                        </div>
                    </td>
                `;
            }
            return `<tr>${cellsHtml}</tr>`;
        }).join('');
    }

    if (elements.habitStreakDisplay) {
        elements.habitStreakDisplay.textContent = appState.habitStreak;
    }

    // Keep chart in sync with current checklist state
    updateHabitGraph();
}

window.toggleHabitDay = (habitId, dateStr) => {
    const habit = appState.habits.find(h => h.id === habitId);
    if (habit) {
        if (!habit.history) habit.history = {};
        habit.history[dateStr] = !habit.history[dateStr];
        updateHabitStreak();
        saveState();
        renderHabits(); // will call updateHabitGraph()
    }
};

window.resetHabits = () => {
    if (confirm('Are you sure you want to reset all habit progress for the new month?')) {
        appState.habits.forEach(h => h.history = {});
        appState.habitStreak = 0;
        saveState();
        renderHabits();
    }
};

function updateHabitStreak() {
    let streak = 0;
    const now = new Date();

    for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dStr = getLocalDateKey(d);

        const allDone = appState.habits.length > 0 && appState.habits.every(h => h.history && h.history[dStr]);

        if (allDone) {
            streak++;
        } else if (i === 0) {
            continue;
        } else {
            break;
        }
    }
    appState.habitStreak = streak;
}

/* Weekly & Monthly Targets and Concentric Progress Rings Logic */

function renderWeeklyTargets() {
    const list = document.getElementById('weekly-targets-list');
    if (!list) return;

    if (!appState.weeklyTargets || appState.weeklyTargets.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-week" style="color: var(--weekly-color);"></i>
                <p>No weekly targets set.<br>Click the "+" button to add one!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = appState.weeklyTargets.map(target => `
        <li class="task-item ${target.completed ? 'completed' : ''}">
            <input type="checkbox" ${target.completed ? 'checked' : ''} onchange="toggleWeeklyTarget(${target.id})">
            <span>${escapeHtml(target.text)}</span>
            <button class="delete-task" onclick="deleteWeeklyTarget(${target.id})" title="Delete Target"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');
}

function renderMonthlyTargets() {
    const list = document.getElementById('monthly-targets-list');
    if (!list) return;

    if (!appState.monthlyTargets || appState.monthlyTargets.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-alt" style="color: var(--monthly-color);"></i>
                <p>No monthly targets set.<br>Click the "+" button to add one!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = appState.monthlyTargets.map(target => `
        <li class="task-item ${target.completed ? 'completed' : ''}">
            <input type="checkbox" ${target.completed ? 'checked' : ''} onchange="toggleMonthlyTarget(${target.id})">
            <span>${escapeHtml(target.text)}</span>
            <button class="delete-task" onclick="deleteMonthlyTarget(${target.id})" title="Delete Target"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');
}

window.toggleWeeklyTarget = (id) => {
    const target = appState.weeklyTargets.find(t => t.id === id);
    if (target) {
        target.completed = !target.completed;
        saveState();
        renderWeeklyTargets();
        updateTargetCircularProgress();
    }
};

window.deleteWeeklyTarget = (id) => {
    appState.weeklyTargets = appState.weeklyTargets.filter(t => t.id !== id);
    saveState();
    renderWeeklyTargets();
    updateTargetCircularProgress();
};

window.toggleMonthlyTarget = (id) => {
    const target = appState.monthlyTargets.find(t => t.id === id);
    if (target) {
        target.completed = !target.completed;
        saveState();
        renderMonthlyTargets();
        updateTargetCircularProgress();
    }
};

window.deleteMonthlyTarget = (id) => {
    appState.monthlyTargets = appState.monthlyTargets.filter(t => t.id !== id);
    saveState();
    renderMonthlyTargets();
    updateTargetCircularProgress();
};

function updateTargetCircularProgress() {
    const weeklyRing = document.getElementById('weekly-progress-ring');
    const monthlyRing = document.getElementById('monthly-progress-ring');
    const weeklyPercentText = document.getElementById('weekly-ring-percent');
    const monthlyPercentText = document.getElementById('monthly-ring-percent');

    // Circumferences
    const weeklyCircumference = 439.82; // 2 * pi * 70
    const monthlyCircumference = 301.59; // 2 * pi * 48

    // Weekly progress calculation
    const weeklyTotal = appState.weeklyTargets ? appState.weeklyTargets.length : 0;
    const weeklyCompleted = appState.weeklyTargets ? appState.weeklyTargets.filter(t => t.completed).length : 0;
    const weeklyPercent = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

    // Monthly progress calculation
    const monthlyTotal = appState.monthlyTargets ? appState.monthlyTargets.length : 0;
    const monthlyCompleted = appState.monthlyTargets ? appState.monthlyTargets.filter(t => t.completed).length : 0;
    const monthlyPercent = monthlyTotal > 0 ? Math.round((monthlyCompleted / monthlyTotal) * 100) : 0;

    // Update Text labels
    if (weeklyPercentText) weeklyPercentText.textContent = `${weeklyPercent}%`;
    if (monthlyPercentText) monthlyPercentText.textContent = `${monthlyPercent}%`;

    // Update SVG offsets
    if (weeklyRing) {
        const weeklyOffset = weeklyCircumference - (weeklyPercent / 100) * weeklyCircumference;
        weeklyRing.style.strokeDashoffset = weeklyOffset;
    }
    if (monthlyRing) {
        const monthlyOffset = monthlyCircumference - (monthlyPercent / 100) * monthlyCircumference;
        monthlyRing.style.strokeDashoffset = monthlyOffset;
    }
}

// Target creation listeners
function initTargetsListeners() {
    const addWeeklyBtn = document.getElementById('add-weekly-target-btn');
    const addMonthlyBtn = document.getElementById('add-monthly-target-btn');

    if (addWeeklyBtn) {
        addWeeklyBtn.addEventListener('click', () => {
            showModal('Add Weekly Target', `
                <form id="add-weekly-target-form">
                    <div class="form-group">
                        <label>Weekly Target Description</label>
                        <input type="text" id="weekly-target-input" required placeholder="e.g. Complete math module 3">
                    </div>
                    <button type="submit" class="btn-primary block">Add Target</button>
                </form>
            `);

            document.getElementById('add-weekly-target-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const text = document.getElementById('weekly-target-input').value.trim();
                if (text) {
                    if (!appState.weeklyTargets) appState.weeklyTargets = [];
                    appState.weeklyTargets.push({ id: Date.now(), text, completed: false });
                    saveState();
                    renderWeeklyTargets();
                    updateTargetCircularProgress();
                    closeModal();
                }
            });
        });
    }

    if (addMonthlyBtn) {
        addMonthlyBtn.addEventListener('click', () => {
            showModal('Add Monthly Target', `
                <form id="add-monthly-target-form">
                    <div class="form-group">
                        <label>Monthly Target Description</label>
                        <input type="text" id="monthly-target-input" required placeholder="e.g. Code 20 projects or read 2 books">
                    </div>
                    <button type="submit" class="btn-primary block">Add Target</button>
                </form>
            `);

            document.getElementById('add-monthly-target-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const text = document.getElementById('monthly-target-input').value.trim();
                if (text) {
                    if (!appState.monthlyTargets) appState.monthlyTargets = [];
                    appState.monthlyTargets.push({ id: Date.now(), text, completed: false });
                    saveState();
                    renderMonthlyTargets();
                    updateTargetCircularProgress();
                    closeModal();
                }
            });
        });
    }
}

if (elements.addHabitBtn) {
    elements.addHabitBtn.addEventListener('click', () => {
        showModal('Add Habit', `
            <form id="add-habit-form">
                <div class="form-group">
                    <label>Habit Name</label>
                    <input type="text" id="habit-name-input" required placeholder="e.g. Read for 30 mins">
                </div>
                <button type="submit" class="btn-primary block">Add Habit</button>
            </form>
        `);

        document.getElementById('add-habit-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('habit-name-input').value.trim();
            appState.habits.push({ id: Date.now(), name, history: {} });
            saveState();
            renderHabits();
            closeModal();
        });
    });
}

window.editHabit = (id) => {
    const habit = appState.habits.find(h => h.id === id);
    if (!habit) return;
    closeAllDropdowns();
    showModal('Edit Habit', `
        <form id="edit-habit-form">
            <div class="form-group">
                <label>Habit Name</label>
                <input type="text" id="edit-habit-name-input" value="${escapeHtml(habit.name)}" required>
            </div>
            <button type="submit" class="btn-primary block">Save Changes</button>
        </form>
    `);

    document.getElementById('edit-habit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        habit.name = document.getElementById('edit-habit-name-input').value.trim();
        saveState();
        renderHabits();
        closeModal();
    });
};

window.deleteHabit = (id) => {
    closeAllDropdowns();
    if (confirm('Are you sure you want to delete this habit?')) {
        appState.habits = appState.habits.filter(h => h.id !== id);
        saveState();
        renderHabits();
    }
};

function renderNotes() {
    const searchQuery = document.getElementById('note-search')?.value.toLowerCase() || '';
    let filteredNotes = appState.notes || [];

    if (searchQuery) {
        filteredNotes = filteredNotes.filter(n =>
            n.title.toLowerCase().includes(searchQuery) ||
            n.content.toLowerCase().includes(searchQuery)
        );
    }

    if (elements.notesGrid) {
        if (filteredNotes.length === 0) {
            elements.notesGrid.innerHTML = `
                <div class="notes-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--mute); font-style: italic;">
                    <i class="fas fa-sticky-note" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--mute); display: block; opacity: 0.5;"></i>
                    No notes found. Click "+ New Note" to add one!
                </div>
            `;
        } else {
            elements.notesGrid.innerHTML = filteredNotes.map(note => {
                let attachmentsHtml = '';
                if (note.attachments && note.attachments.length > 0) {
                    attachmentsHtml = '<div class="note-attachments" style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">';
                    note.attachments.forEach(att => {
                        const icon = att.mimeType && att.mimeType.includes('pdf') ? 'fa-file-pdf' : 'fa-image';
                        attachmentsHtml += `<a href="${att.url}" target="_blank" class="attachment-badge" style="background: var(--canvas-soft); padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--link); text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid var(--border-color);"><i class="fas ${icon}"></i> ${escapeHtml(att.name)}</a>`;
                    });
                    attachmentsHtml += '</div>';
                }
                return `
                <div class="note-card">
                    <h4>${escapeHtml(note.title)}</h4>
                    <p>${escapeHtml(note.content).replace(/\n/g, '<br>')}</p>
                    ${attachmentsHtml}
                    <div class="note-footer" style="margin-top: 1rem;">
                        <span>${escapeHtml(note.date)}</span>
                        <div>
                            <button class="btn-text" onclick="editNote(${note.id})"><i class="fas fa-edit"></i></button>
                            <button class="btn-text" onclick="deleteNote(${note.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `}).join('');
        }
    }
}

if (document.getElementById('note-search')) {
    document.getElementById('note-search').addEventListener('input', renderNotes);
}

window.deleteNote = (id) => {
    appState.notes = appState.notes.filter(n => n.id !== id);
    saveState();
    renderNotes();
};

window.editNote = (id) => {
    const note = appState.notes.find(n => n.id === id);
    if (!note) return;
    showModal('Edit Note', `
        <form id="edit-note-form">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="edit-note-title" value="${escapeHtml(note.title)}" required>
            </div>
            <div class="form-group">
                <label>Content</label>
                <textarea id="edit-note-content" rows="5" required>${escapeHtml(note.content)}</textarea>
            </div>
            <button type="submit" id="edit-save-btn" class="btn-primary block" style="margin-top: 1rem;">Save Changes</button>
        </form>
    `);

    document.getElementById('edit-note-form').addEventListener('submit', (e) => {
        e.preventDefault();
        note.title = document.getElementById('edit-note-title').value.trim();
        note.content = document.getElementById('edit-note-content').value.trim();
        saveState();
        renderNotes();
        closeModal();
    });
};

const addNoteBtn = document.getElementById('add-note-btn');
if (addNoteBtn) {
    addNoteBtn.addEventListener('click', () => {
        showModal('Add Note', `
            <form id="add-note-form">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="note-title" required>
                </div>
                <div class="form-group">
                    <label>Content</label>
                    <textarea id="note-content" rows="5" required></textarea>
                </div>
                <button type="submit" id="save-note-btn" class="btn-primary block" style="margin-top: 1rem;">Save Note</button>
            </form>
        `);

        document.getElementById('add-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.notes.push({
                id: Date.now(),
                title: document.getElementById('note-title').value.trim(),
                content: document.getElementById('note-content').value.trim(),
                date: getLocalDateKey(),
                attachments: []
            });
            saveState();
            renderNotes();
            closeModal();
        });
    });
}

const globalAddFiles = document.getElementById('global-add-files');
if (globalAddFiles) {
    globalAddFiles.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        if (!accessToken) {
            alert("Please wait for Google Drive to connect, or sign in to upload files.");
            e.target.value = '';
            return;
        }

        const labelBtn = document.querySelector('label[for="global-add-files"]');
        const originalText = labelBtn.innerHTML;
        labelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        labelBtn.style.pointerEvents = 'none';
        
        let attachments = [];
        
        for (let i = 0; i < files.length; i++) {
            try {
                const fileData = await uploadFileToDrive(files[i]);
                attachments.push({
                    id: fileData.id,
                    name: fileData.name,
                    url: fileData.webViewLink,
                    mimeType: files[i].type
                });
            } catch (err) {
                console.error("Upload error", err);
                alert("Failed to upload " + files[i].name + "\nError: " + (err.message || JSON.stringify(err)));
            }
        }
        
        if (attachments.length > 0) {
            const noteTitle = attachments.length === 1 ? attachments[0].name.replace(/\.[^/.]+$/, "") : `${attachments.length} Uploaded Files`;
            appState.notes.push({
                id: Date.now(),
                title: noteTitle,
                content: 'Uploaded via quick add.',
                date: getLocalDateKey(),
                attachments: attachments
            });
            saveState();
            renderNotes();
        }
        
        labelBtn.innerHTML = originalText;
        labelBtn.style.pointerEvents = 'auto';
        e.target.value = '';
    });
}

function updateStats() {
    const today = getLocalDateKey();

    const todaysTasks = appState.tasks.filter(t => t.date === today);
    const tasksDoneToday = todaysTasks.filter(t => t.completed).length;

    if (elements.statTasksDone) elements.statTasksDone.textContent = tasksDoneToday;
    if (elements.statStreak) elements.statStreak.textContent = appState.habitStreak;
    if (elements.statFocusTime) elements.statFocusTime.textContent = (appState.stats.focusTimeMinutes / 60).toFixed(1) + 'h';

    const progressPercent = todaysTasks.length > 0 ? (tasksDoneToday / todaysTasks.length) * 100 : 0;
    const progressBar = document.getElementById('task-progress-bar');
    const progressText = document.getElementById('task-progress-text');

    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressText) progressText.textContent = `${tasksDoneToday}/${todaysTasks.length}`;
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return 'about:blank';
    }
    return trimmed;
}

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateString(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return new Date(str);
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    const parts = str.split(/[./-]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            return new Date(y, m, day);
        }
        if (parts[2].length === 4) {
            const y = parseInt(parts[2], 10);
            const p0 = parseInt(parts[0], 10);
            const p1 = parseInt(parts[1], 10);
            const d1 = new Date(y, p0 - 1, p1);
            if (!isNaN(d1.getTime())) return d1;
        }
    }
    return null;
}

function migrateLocaleDates() {
    let modified = false;

    if (appState.tasks && Array.isArray(appState.tasks)) {
        appState.tasks.forEach(t => {
            if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
                const parsed = parseLocalDateString(t.date);
                if (parsed) {
                    t.date = getLocalDateKey(parsed);
                    modified = true;
                }
            }
        });
    }

    if (appState.habits && Array.isArray(appState.habits)) {
        appState.habits.forEach(h => {
            if (h.history && typeof h.history === 'object') {
                const newHistory = {};
                let habitModified = false;
                for (const oldKey in h.history) {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(oldKey)) {
                        const parsed = parseLocalDateString(oldKey);
                        if (parsed) {
                            const newKey = getLocalDateKey(parsed);
                            newHistory[newKey] = h.history[oldKey];
                            habitModified = true;
                        } else {
                            newHistory[oldKey] = h.history[oldKey];
                        }
                    } else {
                        newHistory[oldKey] = h.history[oldKey];
                    }
                }
                if (habitModified) {
                    h.history = newHistory;
                    modified = true;
                }
            }
        });
    }

    if (appState.notes && Array.isArray(appState.notes)) {
        appState.notes.forEach(n => {
            if (n.date && !/^\d{4}-\d{2}-\d{2}$/.test(n.date)) {
                const parsed = parseLocalDateString(n.date);
                if (parsed) {
                    n.date = getLocalDateKey(parsed);
                    modified = true;
                }
            }
        });
    }

    if (modified) {
        saveState();
    }
}

function sanitizeAppState(data) {
    if (!data || typeof data !== 'object') return { ...DEFAULT_STATE };

    const cleanState = { ...DEFAULT_STATE };

    if (data.theme === 'light' || data.theme === 'dark') {
        cleanState.theme = data.theme;
    }

    if (Array.isArray(data.links)) {
        cleanState.links = data.links
            .filter(link => link && typeof link === 'object' && link.name && link.url)
            .map(link => ({
                id: Number(link.id) || Date.now(),
                name: String(link.name).trim(),
                url: sanitizeUrl(String(link.url).trim()),
                icon: String(link.icon || '').trim()
            }));
    }

    if (Array.isArray(data.tasks)) {
        cleanState.tasks = data.tasks
            .filter(task => task && typeof task === 'object' && task.text)
            .map(task => ({
                id: Number(task.id) || Date.now(),
                text: String(task.text).trim(),
                completed: Boolean(task.completed),
                date: String(task.date || getLocalDateKey()).trim()
            }));
    }

    if (Array.isArray(data.exams)) {
        cleanState.exams = data.exams
            .filter(exam => exam && typeof exam === 'object' && exam.name && exam.date)
            .map(exam => ({
                id: Number(exam.id) || Date.now(),
                name: String(exam.name).trim(),
                date: String(exam.date).trim()
            }));
    }

    if (Array.isArray(data.habits)) {
        cleanState.habits = data.habits
            .filter(habit => habit && typeof habit === 'object' && habit.name)
            .map(habit => {
                const cleanHistory = {};
                if (habit.history && typeof habit.history === 'object') {
                    for (const k in habit.history) {
                        cleanHistory[String(k)] = Boolean(habit.history[k]);
                    }
                }
                return {
                    id: Number(habit.id) || Date.now(),
                    name: String(habit.name).trim(),
                    history: cleanHistory
                };
            });
    }

    if (Array.isArray(data.weeklyTargets)) {
        cleanState.weeklyTargets = data.weeklyTargets
            .filter(t => t && typeof t === 'object' && t.text)
            .map(t => ({
                id: Number(t.id) || Date.now(),
                text: String(t.text).trim(),
                completed: Boolean(t.completed)
            }));
    } else {
        cleanState.weeklyTargets = [];
    }

    if (Array.isArray(data.monthlyTargets)) {
        cleanState.monthlyTargets = data.monthlyTargets
            .filter(t => t && typeof t === 'object' && t.text)
            .map(t => ({
                id: Number(t.id) || Date.now(),
                text: String(t.text).trim(),
                completed: Boolean(t.completed)
            }));
    } else {
        cleanState.monthlyTargets = [];
    }

    cleanState.habitStreak = Math.max(0, Number(data.habitStreak) || 0);
    cleanState.lastHabitUpdate = data.lastHabitUpdate ? String(data.lastHabitUpdate) : null;

    if (Array.isArray(data.notes)) {
        cleanState.notes = data.notes
            .filter(note => note && typeof note === 'object' && note.title && note.content)
            .map(note => ({
                id: Number(note.id) || Date.now(),
                title: String(note.title).trim(),
                content: String(note.content).trim(),
                date: String(note.date || getLocalDateKey()).trim(),
                attachments: Array.isArray(note.attachments) ? note.attachments.map(att => ({
                    id: String(att.id || ''),
                    name: String(att.name || ''),
                    url: String(att.url || ''),
                    mimeType: String(att.mimeType || '')
                })) : []
            }));
    }

    if (data.stats && typeof data.stats === 'object') {
        cleanState.stats = {
            focusTimeMinutes: Math.max(0, Number(data.stats.focusTimeMinutes) || 0)
        };
    }

    if (data.pomodoro && typeof data.pomodoro === 'object') {
        cleanState.pomodoro = {
            workDuration: Math.max(1, Number(data.pomodoro.workDuration) || 25),
            shortDuration: Math.max(1, Number(data.pomodoro.shortDuration) || 5),
            longDuration: Math.max(1, Number(data.pomodoro.longDuration) || 15),
            completedSessions: Math.max(0, Number(data.pomodoro.completedSessions) || 0),
            isMuted: Boolean(data.pomodoro.isMuted)
        };
    }

    if (data.moneyTracker && typeof data.moneyTracker === 'object') {
        cleanState.moneyTracker = {
            transactions: [],
            filters: { ...DEFAULT_STATE.moneyTracker.filters }
        };

        if (Array.isArray(data.moneyTracker.transactions)) {
            cleanState.moneyTracker.transactions = data.moneyTracker.transactions
                .filter(t => t && typeof t === 'object' && t.type && t.amount)
                .map(t => ({
                    id: Number(t.id) || Date.now(),
                    date: String(t.date || getLocalDateKey()).trim(),
                    type: (t.type === 'Income' || t.type === 'Expense') ? t.type : 'Expense',
                    amount: Math.max(0, parseFloat(t.amount) || 0),
                    category: String(t.category || 'Other').trim(),
                    mode: String(t.mode || 'UPI').trim(),
                    notes: String(t.notes || '').trim()
                }));
        }

        if (data.moneyTracker.filters && typeof data.moneyTracker.filters === 'object') {
            const f = data.moneyTracker.filters;
            cleanState.moneyTracker.filters = {
                month: String(f.month || 'all').trim(),
                category: String(f.category || 'all').trim(),
                type: String(f.type || 'all').trim(),
                search: String(f.search || '').trim(),
                sortOrder: (f.sortOrder === 'asc' || f.sortOrder === 'desc') ? f.sortOrder : 'desc'
            };
        }
    }

    // Preserve the seeding flag so deleted default links don't reappear on refresh
    cleanState._linksSeeded = data._linksSeeded;
    cleanState._notesSeeded = data._notesSeeded;

    return cleanState;
}

function showModal(title, bodyHtml) {
    if (!elements.modalTitle) return;
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = bodyHtml;
    elements.modalOverlay.classList.remove('hidden');
}

function closeModal() {
    if (elements.modalOverlay) elements.modalOverlay.classList.add('hidden');
}

if (elements.closeModal) {
    elements.closeModal.addEventListener('click', closeModal);
}
if (elements.modalOverlay) {
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) closeModal();
    });
}

if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "productivity_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });
}

if (elements.importBtn) {
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
}

if (elements.importFile) {
    elements.importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                appState = sanitizeAppState(importedData);
                saveState();
                location.reload();
            } catch (err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    });
}

let expensePieChart, spendingBarChart;

function initMoneyTracker() {
    if (!elements.transactionForm) return;

    const today = getLocalDateKey();
    const transDateEl = document.getElementById('trans-date');
    if (transDateEl) transDateEl.value = today;

    elements.transactionForm.addEventListener('submit', handleTransactionSubmit);

    if (elements.moneySearch) {
        elements.moneySearch.addEventListener('input', () => {
            appState.moneyTracker.filters.search = elements.moneySearch.value;
            renderMoneyTracker();
        });
    }

    if (elements.filterMonth) {
        elements.filterMonth.addEventListener('change', () => {
            appState.moneyTracker.filters.month = elements.filterMonth.value;
            renderMoneyTracker();
        });
    }

    if (elements.filterCategory) {
        elements.filterCategory.addEventListener('change', () => {
            appState.moneyTracker.filters.category = elements.filterCategory.value;
            renderMoneyTracker();
        });
    }

    if (elements.filterType) {
        elements.filterType.addEventListener('change', () => {
            appState.moneyTracker.filters.type = elements.filterType.value;
            renderMoneyTracker();
        });
    }

    if (elements.sortDateBtn) {
        elements.sortDateBtn.addEventListener('click', () => {
            appState.moneyTracker.filters.sortOrder = appState.moneyTracker.filters.sortOrder === 'desc' ? 'asc' : 'desc';
            elements.sortDateBtn.innerHTML = `<i class="fas fa-sort-amount-${appState.moneyTracker.filters.sortOrder === 'desc' ? 'down' : 'up'}"></i>`;
            renderMoneyTracker();
        });
    }

    if (elements.reportMonthSelector) {
        elements.reportMonthSelector.addEventListener('change', updateMonthlyReport);
    }

    if (elements.moneyExportBtn) {
        elements.moneyExportBtn.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.moneyTracker.transactions));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "money_tracker_data.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }

    if (elements.moneyImportBtn) {
        elements.moneyImportBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedTransactions = JSON.parse(event.target.result);
                        if (Array.isArray(importedTransactions)) {
                            const cleanTransactions = importedTransactions
                                .filter(t => t && typeof t === 'object' && t.type && t.amount)
                                .map(t => ({
                                    id: Number(t.id) || Date.now(),
                                    date: String(t.date || getLocalDateKey()).trim(),
                                    type: (t.type === 'Income' || t.type === 'Expense') ? t.type : 'Expense',
                                    amount: Math.max(0, parseFloat(t.amount) || 0),
                                    category: String(t.category || 'Other').trim(),
                                    mode: String(t.mode || 'UPI').trim(),
                                    notes: String(t.notes || '').trim()
                                }));
                            appState.moneyTracker.transactions = cleanTransactions;
                            saveState();
                            renderMoneyTracker();
                            alert('Transactions imported successfully!');
                        } else {
                            alert('Invalid transaction list format.');
                        }
                    } catch (err) {
                        alert('Invalid JSON file.');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    updateFilterOptions();
    initMoneyCharts();
    renderMoneyTracker();
}

function handleTransactionSubmit(e) {
    e.preventDefault();
    const transaction = {
        id: Date.now(),
        date: document.getElementById('trans-date').value,
        type: document.getElementById('trans-type').value,
        amount: parseFloat(document.getElementById('trans-amount').value),
        category: document.getElementById('trans-category').value,
        mode: document.getElementById('trans-mode').value,
        notes: document.getElementById('trans-notes').value
    };

    appState.moneyTracker.transactions.push(transaction);
    saveState();
    renderMoneyTracker();
    e.target.reset();
    const transDateEl = document.getElementById('trans-date');
    if (transDateEl) transDateEl.value = new Date().toISOString().split('T')[0];
}

window.quickAddExpense = (category, amount) => {
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        type: 'Expense',
        amount: amount,
        category: category,
        mode: 'UPI',
        notes: 'Quick Add'
    };
    appState.moneyTracker.transactions.push(transaction);
    saveState();
    renderMoneyTracker();
};

function renderMoneyTracker() {
    updateMoneySummary();
    renderTransactionTable();
    updateMonthlyReport();
    updateMoneyCharts();
    updateFilterOptions();
}

function updateMoneySummary() {
    if (!elements.moneyTotalIncome) return;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalInc = 0;
    let totalExp = 0;
    let monthInc = 0;
    let monthExp = 0;

    appState.moneyTracker.transactions.forEach(t => {
        const tDate = new Date(t.date);
        const amount = parseFloat(t.amount);

        if (t.type === 'Income') {
            totalInc += amount;
            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                monthInc += amount;
            }
        } else {
            totalExp += amount;
            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                monthExp += amount;
            }
        }
    });

    elements.moneyTotalIncome.textContent = `₹${totalInc.toLocaleString()}`;
    elements.moneyTotalExpense.textContent = `₹${totalExp.toLocaleString()}`;
    elements.moneyCurrentBalance.textContent = `₹${(totalInc - totalExp).toLocaleString()}`;
    elements.moneyMonthIncome.textContent = `₹${monthInc.toLocaleString()}`;
    elements.moneyMonthExpense.textContent = `₹${monthExp.toLocaleString()}`;
    elements.moneyMonthBalance.textContent = `₹${(monthInc - monthExp).toLocaleString()}`;
}

function renderTransactionTable() {
    if (!elements.transactionBody) return;
    const filters = appState.moneyTracker.filters;
    let filtered = appState.moneyTracker.transactions.filter(t => {
        const matchesSearch = t.notes.toLowerCase().includes(filters.search.toLowerCase()) ||
            t.category.toLowerCase().includes(filters.search.toLowerCase());
        const matchesType = filters.type === 'all' || t.type === filters.type;
        const matchesCategory = filters.category === 'all' || t.category === filters.category;

        let matchesMonth = true;
        if (filters.month !== 'all') {
            const tDate = new Date(t.date);
            const monthYear = `${tDate.getFullYear()}-${(tDate.getMonth() + 1).toString().padStart(2, '0')}`;
            matchesMonth = monthYear === filters.month;
        }

        return matchesSearch && matchesType && matchesCategory && matchesMonth;
    });

    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return filters.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    elements.transactionBody.innerHTML = filtered.map(t => {
        const typeEscaped = escapeHtml(t.type);
        const notesEscaped = escapeHtml(t.notes);
        const notesSubstring = escapeHtml(t.notes.substring(0, 15));
        return `
            <tr>
                <td>${escapeHtml(t.date)}</td>
                <td><span class="status-badge ${t.type === 'Income' ? 'status-completed' : 'status-ongoing'}">${typeEscaped}</span></td>
                <td class="${t.type === 'Income' ? 'text-success' : 'text-danger'}">₹${parseFloat(t.amount).toLocaleString()}</td>
                <td>${escapeHtml(t.category)}</td>
                <td>${escapeHtml(t.mode)}</td>
                <td title="${notesEscaped}">${notesSubstring}${t.notes.length > 15 ? '...' : ''}</td>
                <td>
                    <button class="btn-text" onclick="editTransaction(${t.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn-text text-danger" onclick="deleteTransaction(${t.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.deleteTransaction = (id) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
        appState.moneyTracker.transactions = appState.moneyTracker.transactions.filter(t => t.id !== id);
        saveState();
        renderMoneyTracker();
    }
};

window.editTransaction = (id) => {
    const t = appState.moneyTracker.transactions.find(t => t.id === id);
    if (!t) return;
    showModal('Edit Transaction', `
        <form id="edit-transaction-form">
            <div class="form-group">
                <label>Date</label>
                <input type="date" id="edit-trans-date" value="${escapeHtml(t.date)}" required>
            </div>
            <div class="form-group">
                <label>Type</label>
                <select id="edit-trans-type" required>
                    <option value="Expense" ${t.type === 'Expense' ? 'selected' : ''}>Expense</option>
                    <option value="Income" ${t.type === 'Income' ? 'selected' : ''}>Income</option>
                </select>
            </div>
            <div class="form-group">
                <label>Amount (₹)</label>
                <input type="number" id="edit-trans-amount" value="${escapeHtml(t.amount)}" min="1" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="edit-trans-category" required>
                    <option value="Mess" ${t.category === 'Mess' ? 'selected' : ''}>Mess</option>
                    <option value="Diet" ${t.category === 'Diet' ? 'selected' : ''}>Diet</option>
                    <option value="Protein supplements" ${t.category === 'Protein supplements' ? 'selected' : ''}>Protein supplements</option>
                    <option value="Gym" ${t.category === 'Gym' ? 'selected' : ''}>Gym</option>
                    <option value="Snacks" ${t.category === 'Snacks' ? 'selected' : ''}>Snacks</option>
                    <option value="Travel" ${t.category === 'Travel' ? 'selected' : ''}>Travel</option>
                    <option value="Hostel Fees" ${t.category === 'Hostel Fees' ? 'selected' : ''}>Hostel Fees</option>
                    <option value="Medical" ${t.category === 'Medical' ? 'selected' : ''}>Medical</option>
                    <option value="Stationery" ${t.category === 'Stationery' ? 'selected' : ''}>Stationery</option>
                    <option value="Other" ${t.category === 'Other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Payment Mode</label>
                <select id="edit-trans-mode" required>
                    <option value="UPI" ${t.mode === 'UPI' ? 'selected' : ''}>UPI</option>
                    <option value="Cash" ${t.mode === 'Cash' ? 'selected' : ''}>Cash</option>
                    <option value="Bank" ${t.mode === 'Bank' ? 'selected' : ''}>Bank</option>
                </select>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="edit-trans-notes" rows="2">${escapeHtml(t.notes)}</textarea>
            </div>
            <button type="submit" class="btn-primary block">Save Changes</button>
        </form>
    `);

    document.getElementById('edit-transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        t.date = document.getElementById('edit-trans-date').value.trim();
        t.type = document.getElementById('edit-trans-type').value.trim();
        t.amount = parseFloat(document.getElementById('edit-trans-amount').value) || 0;
        t.category = document.getElementById('edit-trans-category').value.trim();
        t.mode = document.getElementById('edit-trans-mode').value.trim();
        t.notes = document.getElementById('edit-trans-notes').value.trim();
        saveState();
        renderMoneyTracker();
        closeModal();
    });
};

function updateFilterOptions() {
    if (!elements.filterMonth || !elements.reportMonthSelector) return;

    let months = [];
    if (appState.moneyTracker.transactions && appState.moneyTracker.transactions.length > 0) {
        months = [...new Set(appState.moneyTracker.transactions.map(t => {
            const d = new Date(t.date);
            return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        }))].sort().reverse();
    }

    const currentFilterMonth = elements.filterMonth.value;
    elements.filterMonth.innerHTML = '<option value="all">All Months</option>' +
        months.map(m => `<option value="${m}">${new Date(m + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</option>`).join('');
    elements.filterMonth.value = currentFilterMonth || 'all';

    const currentReportMonth = elements.reportMonthSelector.value;
    elements.reportMonthSelector.innerHTML = months.length > 0
        ? months.map(m => `<option value="${m}">${new Date(m + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</option>`).join('')
        : '<option value="">No Data</option>';
    if (!currentReportMonth && months.length > 0) {
        elements.reportMonthSelector.value = months[0];
    } else if (months.length === 0) {
        elements.reportMonthSelector.value = '';
    } else {
        elements.reportMonthSelector.value = currentReportMonth;
    }
}

function updateMonthlyReport() {
    if (!elements.reportMonthSelector) return;
    const selectedMonth = elements.reportMonthSelector.value;
    if (!selectedMonth) return;

    const filtered = appState.moneyTracker.transactions.filter(t => {
        const d = new Date(t.date);
        const m = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        return m === selectedMonth;
    });

    let inc = 0, exp = 0;
    const catMap = {};

    filtered.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'Income') inc += amt;
        else {
            exp += amt;
            catMap[t.category] = (catMap[t.category] || 0) + amt;
        }
    });

    let topCat = '-';
    let maxExp = 0;
    for (const cat in catMap) {
        if (catMap[cat] > maxExp) {
            maxExp = catMap[cat];
            topCat = cat;
        }
    }

    if (elements.reportIncome) elements.reportIncome.textContent = `₹${inc.toLocaleString()}`;
    if (elements.reportExpense) elements.reportExpense.textContent = `₹${exp.toLocaleString()}`;
    if (elements.reportSavings) elements.reportSavings.textContent = `₹${(inc - exp).toLocaleString()}`;
    if (elements.reportTopCategory) elements.reportTopCategory.textContent = topCat;
}

const categoryColors = {
    'Mess': '#0088CC', // Jarvis Blue
    'Diet': '#33a3ff', // Sky Blue
    'Protein supplements': '#006699', // Deep Blue
    'Gym': '#004466', // Midnight Blue
    'Snacks': '#525252', // Charcoal
    'Travel': '#737373', // Medium grey
    'Hostel Fees': '#a3a3a3', // Light grey
    'Medical': '#d4d4d4', // Soft grey
    'Stationery': '#e5e5e5', // Off-white/light-grey
    'Other': '#1c1c1c' // Deep charcoal
};

function initMoneyCharts() {
    const pieEl = document.getElementById('expense-pie-chart');
    const barEl = document.getElementById('spending-bar-chart');
    if (!pieEl || !barEl) return;

    const pieCtx = pieEl.getContext('2d');
    const barCtx = barEl.getContext('2d');

    const textColor = appState.theme === 'dark' ? '#f5f5f5' : '#171717';
    const gridColor = appState.theme === 'dark' ? '#262626' : '#e5e5e5';
    const tickColor = appState.theme === 'dark' ? '#525252' : '#737373';

    expensePieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: textColor } } } }
    });

    spendingBarChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Expense', data: [], backgroundColor: '#525252' }, { label: 'Income', data: [], backgroundColor: '#0088CC' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor, boxWidth: 12 } } }, scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }, x: { grid: { display: false }, ticks: { color: tickColor } } } }
    });
}

function updateMoneyCharts() {
    if (!expensePieChart || !spendingBarChart) return;

    const catMap = {};
    appState.moneyTracker.transactions.filter(t => t.type === 'Expense').forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
    });

    expensePieChart.data.labels = Object.keys(catMap);
    expensePieChart.data.datasets[0].data = Object.values(catMap);
    expensePieChart.data.datasets[0].backgroundColor = Object.keys(catMap).map(cat => categoryColors[cat] || '#737373');
    expensePieChart.options.plugins.legend.labels.color = appState.theme === 'dark' ? '#f5f5f5' : '#171717';
    expensePieChart.update();

    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
    }

    const incData = months.map(m => {
        return appState.moneyTracker.transactions
            .filter(t => t.type === 'Income' && t.date.startsWith(m))
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    });

    const expData = months.map(m => {
        return appState.moneyTracker.transactions
            .filter(t => t.type === 'Expense' && t.date.startsWith(m))
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    });

    spendingBarChart.data.labels = months.map(m => {
        const parts = m.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        return new Date(year, month, 1).toLocaleString('default', { month: 'short' });
    });
    spendingBarChart.data.datasets[0].data = expData;
    spendingBarChart.data.datasets[1].data = incData;
    spendingBarChart.update();
}

function initHabitChartTheme() {
    return {
        textColor: appState.theme === 'dark' ? '#f5f5f5' : '#171717',
        gridColor: appState.theme === 'dark' ? '#262626' : '#e5e5e5',
        tickColor: appState.theme === 'dark' ? '#525252' : '#737373',
        lineColor: appState.theme === 'dark' ? '#0088CC' : '#0088CC'
    };
}

function getHabitCompletionForMonth() {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const totalHabits = appState.habits.length || 0;
    const completion = [];

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = getLocalDateKey(new Date(now.getFullYear(), now.getMonth(), i));
        let doneCount = 0;

        if (totalHabits > 0) {
            doneCount = appState.habits.reduce((sum, habit) => {
                if (habit.history && habit.history[dateStr]) return sum + 1;
                return sum;
            }, 0);
        }

        const percent = totalHabits > 0 ? (doneCount / totalHabits) * 100 : 0;
        completion.push(Number(percent.toFixed(1)));
    }

    const labels = Array.from({ length: daysInMonth }, (_, idx) => idx + 1);
    return { labels, values: completion };
}

function initHabitsChart() {
    const canvas = document.getElementById('habits-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const theme = initHabitChartTheme();

    if (habitsChart) return;

    const { labels, values } = getHabitCompletionForMonth();

    habitsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Daily completion %',
                    data: values,
                    borderColor: theme.lineColor,
                    backgroundColor: appState.theme === 'dark' ? 'rgba(0, 136, 204, 0.04)' : 'rgba(0, 136, 204, 0.04)',
                    borderWidth: 2,
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: theme.tickColor,
                        boxWidth: 12,
                        font: { family: "'Inter', system-ui, sans-serif" }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y}%`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: theme.gridColor },
                    ticks: {
                        color: theme.tickColor,
                        callback: (v) => `${v}%`,
                        font: { family: "'Inter', system-ui, sans-serif" }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: theme.tickColor,
                        maxTicksLimit: 10,
                        font: { family: "'Inter', system-ui, sans-serif" }
                    }
                }
            }
        }
    });
}

function updateHabitGraph() {
    if (!habitsChart) return;

    const theme = initHabitChartTheme();
    const { labels, values } = getHabitCompletionForMonth();

    habitsChart.data.labels = labels;
    habitsChart.data.datasets[0].data = values;

    habitsChart.options.plugins.legend.labels.color = theme.tickColor;
    habitsChart.data.datasets[0].borderColor = theme.lineColor;
    habitsChart.data.datasets[0].backgroundColor =
        appState.theme === 'dark' ? 'rgba(0, 136, 204, 0.04)' : 'rgba(0, 136, 204, 0.04)';

    habitsChart.options.scales.y.grid.color = theme.gridColor;
    habitsChart.options.scales.y.ticks.color = theme.tickColor;
    habitsChart.options.scales.x.ticks.color = theme.tickColor;

    habitsChart.update();
}

function initEventListeners() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navLinks.classList.contains('mobile-open');
            if (isOpen) {
                navLinks.classList.remove('mobile-open');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                mobileMenuBtn.classList.remove('open');
            } else {
                navLinks.classList.add('mobile-open');
                mobileMenuBtn.innerHTML = '<i class="fas fa-times"></i>';
                mobileMenuBtn.classList.add('open');
            }
        });

        // Close nav when clicking outside
        document.addEventListener('click', (e) => {
            if (
                navLinks.classList.contains('mobile-open') &&
                !navLinks.contains(e.target) &&
                !mobileMenuBtn.contains(e.target)
            ) {
                navLinks.classList.remove('mobile-open');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                mobileMenuBtn.classList.remove('open');
            }
        });

        // Close nav on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && navLinks.classList.contains('mobile-open')) {
                navLinks.classList.remove('mobile-open');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
                mobileMenuBtn.classList.remove('open');
            }
        });
    }

    initMoneyTracker();
    initPomodoro();
    initTargetsListeners();
}


let pomodoroTimer = null;
let pomodoroTimeRemaining = 0;
let pomodoroCurrentMode = 'work';
let pomodoroIsRunning = false;

function initPomodoro() {
    const container = document.querySelector('.pomodoro-container');
    if (container) {
        container.classList.remove('mode-work', 'mode-short', 'mode-long');
        container.classList.add('mode-work');
    }
    // Mode duration helper
    const getModeDuration = (mode) => {
        if (mode === 'work') return appState.pomodoro.workDuration * 60;
        if (mode === 'short') return appState.pomodoro.shortDuration * 60;
        if (mode === 'long') return appState.pomodoro.longDuration * 60;
        return 25 * 60;
    };

    // Reset countdown display
    const resetTimerDisplay = () => {
        const total = getModeDuration(pomodoroCurrentMode);
        pomodoroTimeRemaining = total;
        updateTimerDisplay();
    };

    const updateTimerDisplay = () => {
        const minutes = Math.floor(pomodoroTimeRemaining / 60);
        const seconds = pomodoroTimeRemaining % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (elements.pomodoroTime) elements.pomodoroTime.textContent = timeStr;

        // Update SVG Progress
        const progressCircle = document.querySelector('.pomodoro-circle-progress');
        if (progressCircle) {
            const total = getModeDuration(pomodoroCurrentMode);
            const ratio = total > 0 ? pomodoroTimeRemaining / total : 0;
            const strokeDashOffset = 565.48 * (1 - ratio);
            progressCircle.style.strokeDashoffset = strokeDashOffset;
        }
    };

    const updateStatsDisplay = () => {
        if (elements.pomodoroCompletedSessions) {
            elements.pomodoroCompletedSessions.textContent = appState.pomodoro.completedSessions;
        }
        if (elements.pomodoroTotalFocusTime) {
            elements.pomodoroTotalFocusTime.textContent = `${(appState.stats.focusTimeMinutes / 60).toFixed(1)}h`;
        }
    };

    const playChime = () => {
        if (appState.pomodoro.isMuted) return;
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            const playBeep = (startTime) => {
                const playTone = (freq, vol) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, startTime);

                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

                    osc.start(startTime);
                    osc.stop(startTime + 0.25);
                };

                // Play louder dual-tone harmony
                playTone(880.00, 0.3); // A5
                playTone(1046.50, 0.3); // C6
            };

            const now = audioCtx.currentTime;
            // Schedule 10 groups of 3 rapid beeps (like a digital alarm clock)
            for (let i = 0; i < 10; i++) {
                const groupStart = now + i * 1.2;
                playBeep(groupStart);
                playBeep(groupStart + 0.25);
                playBeep(groupStart + 0.50);
            }

            // Close the AudioContext after the chime completes to prevent resource leaks
            setTimeout(() => {
                audioCtx.close().catch(err => console.error("Error closing AudioContext", err));
            }, 13000);
        } catch (e) {
            console.error("Audio error", e);
        }
    };

    const handleTimerEnd = () => {
        clearInterval(pomodoroTimer);
        pomodoroTimer = null;
        pomodoroIsRunning = false;

        if (elements.pomodoroPlayBtn) {
            elements.pomodoroPlayBtn.innerHTML = '<i class="fas fa-play"></i> Start';
        }

        playChime();

        if (pomodoroCurrentMode === 'work') {
            appState.pomodoro.completedSessions++;
            appState.stats.focusTimeMinutes += appState.pomodoro.workDuration;
            saveState();
            updateStatsDisplay();
            alert("Great job! Work session completed. Time for a break!");
        } else {
            alert("Break ended! Ready to focus?");
        }

        // Switch modes automatically
        if (pomodoroCurrentMode === 'work') {
            if (appState.pomodoro.completedSessions % 4 === 0) {
                switchMode('long');
            } else {
                switchMode('short');
            }
        } else {
            switchMode('work');
        }
    };

    const tick = () => {
        if (pomodoroTimeRemaining > 0) {
            pomodoroTimeRemaining--;
            updateTimerDisplay();
        } else {
            handleTimerEnd();
        }
    };

    const togglePlay = () => {
        if (pomodoroIsRunning) {
            // Pause
            clearInterval(pomodoroTimer);
            pomodoroTimer = null;
            pomodoroIsRunning = false;
            if (elements.pomodoroPlayBtn) {
                elements.pomodoroPlayBtn.innerHTML = '<i class="fas fa-play"></i> Start';
            }
        } else {
            // Start
            pomodoroIsRunning = true;
            if (elements.pomodoroPlayBtn) {
                elements.pomodoroPlayBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            }
            pomodoroTimer = setInterval(tick, 1000);
        }
    };

    const switchMode = (mode) => {
        // Pause current timer
        if (pomodoroIsRunning) {
            togglePlay();
        }

        pomodoroCurrentMode = mode;

        // Update tabs active state
        document.querySelectorAll('.pomodoro-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update container mode class
        const container = document.querySelector('.pomodoro-container');
        if (container) {
            container.classList.remove('mode-work', 'mode-short', 'mode-long');
            container.classList.add(`mode-${mode}`);
        }

        // Update label
        if (elements.pomodoroLabel) {
            if (mode === 'work') elements.pomodoroLabel.textContent = 'WORK TIME';
            if (mode === 'short') elements.pomodoroLabel.textContent = 'SHORT BREAK';
            if (mode === 'long') elements.pomodoroLabel.textContent = 'LONG BREAK';
        }

        resetTimerDisplay();
    };

    // Mode Buttons Listeners
    document.querySelectorAll('.pomodoro-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchMode(btn.dataset.mode);
        });
    });

    // Control buttons listeners
    if (elements.pomodoroPlayBtn) {
        elements.pomodoroPlayBtn.addEventListener('click', togglePlay);
    }

    if (elements.pomodoroResetBtn) {
        elements.pomodoroResetBtn.addEventListener('click', () => {
            if (pomodoroIsRunning) {
                togglePlay();
            }
            resetTimerDisplay();
        });
    }

    // Settings Toggle Listeners
    const settingsPanel = document.querySelector('.pomodoro-settings-panel');
    const mainWrapper = document.querySelector('.pomodoro-wrapper');

    if (elements.pomodoroSettingsBtn && settingsPanel && mainWrapper) {
        elements.pomodoroSettingsBtn.addEventListener('click', () => {
            settingsPanel.classList.toggle('hidden');
            mainWrapper.classList.toggle('hidden');

            // Populate inputs
            document.getElementById('pomo-work-duration').value = appState.pomodoro.workDuration;
            document.getElementById('pomo-short-duration').value = appState.pomodoro.shortDuration;
            document.getElementById('pomo-long-duration').value = appState.pomodoro.longDuration;
        });
    }

    if (elements.pomodoroCloseSettings && settingsPanel && mainWrapper) {
        elements.pomodoroCloseSettings.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
            mainWrapper.classList.remove('hidden');
        });
    }

    if (elements.pomodoroSaveSettings && settingsPanel && mainWrapper) {
        elements.pomodoroSaveSettings.addEventListener('click', () => {
            const work = parseInt(document.getElementById('pomo-work-duration').value, 10);
            const short = parseInt(document.getElementById('pomo-short-duration').value, 10);
            const long = parseInt(document.getElementById('pomo-long-duration').value, 10);

            if (work > 0 && short > 0 && long > 0) {
                appState.pomodoro.workDuration = work;
                appState.pomodoro.shortDuration = short;
                appState.pomodoro.longDuration = long;
                saveState();

                settingsPanel.classList.add('hidden');
                mainWrapper.classList.remove('hidden');

                // Refresh timer display with new setting
                resetTimerDisplay();
            } else {
                alert('Please enter valid positive durations.');
            }
        });
    }

    const updateMuteButtonDisplay = () => {
        if (elements.pomodoroMuteBtn) {
            const isMuted = appState.pomodoro.isMuted;
            elements.pomodoroMuteBtn.innerHTML = isMuted
                ? '<i class="fas fa-volume-mute"></i>'
                : '<i class="fas fa-volume-up"></i>';
            elements.pomodoroMuteBtn.title = isMuted ? 'Unmute Timer Sound' : 'Mute Timer Sound';
        }
    };

    if (elements.pomodoroMuteBtn) {
        elements.pomodoroMuteBtn.addEventListener('click', () => {
            appState.pomodoro.isMuted = !appState.pomodoro.isMuted;
            saveState();
            updateMuteButtonDisplay();
        });
    }

    // Initial setup
    resetTimerDisplay();
    updateStatsDisplay();
    updateMuteButtonDisplay();
}
