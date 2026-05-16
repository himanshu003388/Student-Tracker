/**
 * CS Student Productivity Dashboard - script.js
 */

// --- STATE MANAGEMENT ---
const DEFAULT_STATE = {
    theme: 'light',
    links: [],
    tasks: [],
    codingLogs: [],
    habits: [],
    habitStreak: 0,
    lastHabitUpdate: null,
    notes: [],
    projects: [],
    placements: [],
    pomodoroSettings: { work: 25, shortBreak: 5, longBreak: 15 },
    stats: { focusTimeMinutes: 0 },
    weeklyTargets: [],
    monthlyTargets: [],
    dashboardNote: '',
    moneyTracker: {
        transactions: [],
        filters: { month: 'all', category: 'all', type: 'all', search: '', sortOrder: 'desc' }
    }
};

let appState = JSON.parse(localStorage.getItem('cs_dashboard_data')) || DEFAULT_STATE;

// Migration: Ensure new properties exist
if (!appState.weeklyTargets) appState.weeklyTargets = DEFAULT_STATE.weeklyTargets;
if (!appState.monthlyTargets) appState.monthlyTargets = DEFAULT_STATE.monthlyTargets;
if (typeof appState.dashboardNote === 'undefined') appState.dashboardNote = DEFAULT_STATE.dashboardNote;
if (!appState.moneyTracker) appState.moneyTracker = DEFAULT_STATE.moneyTracker;
if (!appState.moneyTracker.transactions) appState.moneyTracker.transactions = [];
if (!appState.moneyTracker.filters) appState.moneyTracker.filters = DEFAULT_STATE.moneyTracker.filters;

// Migration check for old habit structure
if (appState.habits && appState.habits.length > 0 && typeof appState.habits[0].completed !== 'undefined') {
    appState.habits = appState.habits.map(h => ({
        id: h.id,
        name: h.name,
        history: h.completed ? { [new Date().toLocaleDateString()]: true } : {}
    }));
}

function saveState() {
    localStorage.setItem('cs_dashboard_data', JSON.stringify(appState));
    updateStats();
    if (typeof updateHabitProgressChart === 'function') updateHabitProgressChart();
}

// --- DOM ELEMENTS ---
const elements = {
    sections: document.querySelectorAll('main > section'),
    navLinks: document.querySelectorAll('.nav-links a'),
    themeToggle: document.getElementById('theme-toggle'),
    currentTime: document.getElementById('current-time'),
    currentDate: document.getElementById('current-date'),
    quoteText: document.getElementById('quote-text'),
    quoteAuthor: document.getElementById('quote-author'),
    linksGrid: document.getElementById('links-grid'),
    taskList: document.getElementById('task-list'),
    taskInput: document.getElementById('task-input'),
    addTaskBtn: document.getElementById('add-task-btn'),
    codingLogForm: document.getElementById('coding-log-form'),
    codingLogBody: document.getElementById('coding-log-body'),
    habitsTableHead: document.getElementById('habits-table-head'),
    habitsTableBody: document.getElementById('habits-table-body'),
    habitMonthName: document.getElementById('habit-month-name'),
    addHabitBtn: document.getElementById('add-habit-btn'),
    resetHabitsBtn: document.getElementById('reset-habits-btn'),
    habitStreakDisplay: document.getElementById('habit-streak-display'),
    timerDisplay: document.getElementById('timer-display'),
    pomoStartBtn: document.getElementById('pomo-start-btn'),
    pomoResetBtn: document.getElementById('pomo-reset-btn'),
    pomoModeBtns: document.querySelectorAll('.pomo-mode-btn'),
    notesGrid: document.getElementById('notes-grid'),
    projectsGrid: document.getElementById('projects-grid'),
    placementBody: document.getElementById('placement-body'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalBody: document.getElementById('modal-body'),
    modalTitle: document.getElementById('modal-title'),
    closeModal: document.querySelector('.close-modal'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    statTasksDone: document.getElementById('stat-tasks-done'),
    statCodingToday: document.getElementById('stat-coding-today'),
    statStreak: document.getElementById('stat-streak'),
    statFocusTime: document.getElementById('stat-focus-time'),
    weeklyTargetsList: document.getElementById('weekly-targets-list'),
    monthlyTargetsList: document.getElementById('monthly-targets-list'),
    addWeeklyTargetBtn: document.getElementById('add-weekly-target-btn'),
    addMonthlyTargetBtn: document.getElementById('add-monthly-target-btn'),
    dashboardNote: document.getElementById('dashboard-note'),
    
    // Money Tracker Elements
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
    moneyImportBtn: document.getElementById('money-import-btn')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initClock();
    initQuotes();
    initNavigation();
    renderAll();
    initCharts();
    initEventListeners();
    initDashboardNote();
});

function renderAll() {
    updateHabitStreak();
    renderLinks();
    renderTasks();
    renderCodingLogs();
    renderHabits();
    renderTargets();
    renderNotes();
    renderProjects();
    renderPlacements();
    renderMoneyTracker();
    renderDashboardNote();
    updateStats();
}

function renderDashboardNote() {
    if (elements.dashboardNote) {
        elements.dashboardNote.value = appState.dashboardNote || '';
    }
}

function initDashboardNote() {
    if (elements.dashboardNote) {
        elements.dashboardNote.addEventListener('input', (e) => {
            appState.dashboardNote = e.target.value;
            saveState();
        });
    }
}

// --- THEME ---
function initTheme() {
    document.body.className = appState.theme === 'dark' ? 'dark-mode' : 'light-mode';
    if(elements.themeToggle) {
        elements.themeToggle.innerHTML = appState.theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

if(elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        initTheme();
        saveState();
    });
}

// --- NAVIGATION ---
function initNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-section');
            
            // Update Active Link
            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show Section
            elements.sections.forEach(section => {
                if (section.id === target) {
                    section.classList.remove('hidden');
                    section.classList.add('active-section');
                } else {
                    section.classList.add('hidden');
                    section.classList.remove('active-section');
                }
            });

            // Fix Chart.js sizing issues when a container goes from display:none to visible
            setTimeout(() => {
                if (target === 'dashboard' && typeof dashboardChart !== 'undefined' && dashboardChart) dashboardChart.resize();
                if (target === 'coding' && typeof codingChart !== 'undefined' && codingChart) codingChart.resize();
                if (target === 'habits' && typeof habitProgressChart !== 'undefined' && habitProgressChart) habitProgressChart.resize();
                if (target === 'money') {
                    if (typeof expensePieChart !== 'undefined' && expensePieChart) expensePieChart.resize();
                    if (typeof spendingBarChart !== 'undefined' && spendingBarChart) spendingBarChart.resize();
                }
            }, 10);

            // Close mobile menu if open
            const navLinksContainer = document.querySelector('.nav-links');
            if (window.innerWidth <= 768 && navLinksContainer.style.display === 'flex') {
                navLinksContainer.style.display = 'none';
            }
        });
    });
}

// --- CLOCK & QUOTES ---
function initClock() {
    const update = () => {
        const now = new Date();
        if(elements.currentTime) elements.currentTime.textContent = now.toLocaleTimeString();
        if(elements.currentDate) elements.currentDate.textContent = now.toLocaleDateString(undefined, { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    };
    setInterval(update, 1000);
    update();
}

const QUOTES = [
    { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
    { text: "Code is like humor. When you have to explain it, it’s bad.", author: "Cory House" },
    { text: "Optimism is a happiness magnet. If you stay positive, good things will happen.", author: "Mary Lou Retton" },
    { text: "Consistency is more important than perfection.", author: "Unknown" },
    { text: "The path to success is to take massive, determined actions.", author: "Tony Robbins" }
];

function initQuotes() {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    if(elements.quoteText) elements.quoteText.textContent = `"${quote.text}"`;
    if(elements.quoteAuthor) elements.quoteAuthor.textContent = `- ${quote.author}`;
}

// --- LINKS ---
function renderLinks() {
    if(!elements.linksGrid) return;
    elements.linksGrid.innerHTML = appState.links.map(link => `
        <a href="${link.url}" target="_blank" class="link-card">
            <button class="delete-link" onclick="deleteLink(${link.id}, event)"><i class="fas fa-times"></i></button>
            <i class="fab ${link.icon.startsWith('fa-') ? link.icon : 'fa-external-link-alt'}"></i>
            <span>${link.name}</span>
        </a>
    `).join('');
}

window.deleteLink = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    appState.links = appState.links.filter(l => l.id !== id);
    saveState();
    renderLinks();
};

const addLinkBtn = document.getElementById('add-link-btn');
if(addLinkBtn) {
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
                    <label>Icon Class (FontAwesome)</label>
                    <input type="text" id="link-icon" placeholder="fa-link">
                </div>
                <button type="submit" class="btn-primary block">Add Link</button>
            </form>
        `);
        
        document.getElementById('add-link-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newLink = {
                id: Date.now(),
                name: document.getElementById('link-name').value,
                url: document.getElementById('link-url').value,
                icon: document.getElementById('link-icon').value || 'fa-link'
            };
            appState.links.push(newLink);
            saveState();
            renderLinks();
            closeModal();
        });
    });
}

// --- TASKS ---
function renderTasks() {
    if(!elements.taskList) return;
    const filterBtn = document.querySelector('.filter-btn.active');
    const filter = filterBtn ? filterBtn.dataset.filter : 'all';
    const taskSearch = document.getElementById('task-search');
    const searchQuery = taskSearch ? taskSearch.value.toLowerCase() : '';
    
    let filteredTasks = appState.tasks;
    if (filter === 'pending') filteredTasks = appState.tasks.filter(t => !t.completed);
    if (filter === 'completed') filteredTasks = appState.tasks.filter(t => t.completed);

    if (searchQuery) {
        filteredTasks = filteredTasks.filter(t => t.text.toLowerCase().includes(searchQuery));
    }

    elements.taskList.innerHTML = filteredTasks.map(task => `
        <li class="task-item ${task.completed ? 'completed' : ''}">
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
            <span>${task.text}</span>
            <button class="delete-task" onclick="deleteTask(${task.id})"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');
}

const taskSearch = document.getElementById('task-search');
if(taskSearch) {
    taskSearch.addEventListener('input', renderTasks);
}

if(elements.addTaskBtn) {
    elements.addTaskBtn.addEventListener('click', () => {
        const text = elements.taskInput.value.trim();
        if (text) {
            appState.tasks.push({ id: Date.now(), text, completed: false, date: new Date().toLocaleDateString() });
            elements.taskInput.value = '';
            saveState();
            renderTasks();
        }
    });
}

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

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTasks();
    });
});

// --- CHARTS ---
let codingChart, dashboardChart, habitProgressChart;
function initCharts() {
    const codingCtxEl = document.getElementById('coding-chart');
    const dctxEl = document.getElementById('coding-chart-dashboard');
    
    if(codingCtxEl && dctxEl) {
        const ctx = codingCtxEl.getContext('2d');
        const dctx = dctxEl.getContext('2d');
        
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Days.push(d.toLocaleDateString());
        }

        const dailyCounts = last7Days.map(date => {
            return appState.codingLogs
                .filter(log => log.date === date)
                .reduce((sum, log) => sum + (Number(log.count) || 0), 0);
        });

        const chartConfig = {
            type: 'bar',
            data: {
                labels: last7Days.map(d => d.split('/')[0] + '/' + d.split('/')[1]),
                datasets: [{
                    label: 'Problems Solved',
                    data: dailyCounts,
                    backgroundColor: '#6366f1',
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
            }
        };

        codingChart = new Chart(ctx, JSON.parse(JSON.stringify(chartConfig)));
        
        chartConfig.options.plugins = { legend: { display: false } };
        dashboardChart = new Chart(dctx, chartConfig);
    }

    initHabitProgressChart();
}

function initHabitProgressChart() {
    const chartEl = document.getElementById('habit-progress-chart');
    if(!chartEl) return;
    const ctx = chartEl.getContext('2d');
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const completionData = labels.map(day => {
        const dateStr = new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString();
        const totalHabits = appState.habits.length;
        if (totalHabits === 0) return 0;
        const completedCount = appState.habits.filter(h => h.history && h.history[dateStr]).length;
        return (completedCount / totalHabits) * 100;
    });

    habitProgressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Habit Completion %',
                data: completionData,
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateChart() {
    if (!codingChart && !dashboardChart) return;
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toLocaleDateString());
    }
    const dailyCounts = last7Days.map(date => {
        return appState.codingLogs
            .filter(log => log.date === date)
            .reduce((sum, log) => sum + parseInt(log.count), 0);
    });

    if (codingChart) {
        codingChart.data.datasets[0].data = dailyCounts;
        codingChart.update();
    }
    if (dashboardChart) {
        dashboardChart.data.datasets[0].data = dailyCounts;
        dashboardChart.update();
    }
}

function updateHabitProgressChart() {
    if (!habitProgressChart) return;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const completionData = Array.from({ length: daysInMonth }, (_, i) => {
        const dateStr = new Date(now.getFullYear(), now.getMonth(), i + 1).toLocaleDateString();
        const totalHabits = appState.habits.length;
        if (totalHabits === 0) return 0;
        const completedCount = appState.habits.filter(h => h.history && h.history[dateStr]).length;
        return (completedCount / totalHabits) * 100;
    });
    habitProgressChart.data.datasets[0].data = completionData;
    habitProgressChart.update();
}

if(elements.codingLogForm) {
    elements.codingLogForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const log = {
            id: Date.now(),
            date: new Date().toLocaleDateString(),
            platform: document.getElementById('platform').value,
            count: document.getElementById('problems-count').value,
            difficulty: document.getElementById('difficulty').value,
            notes: document.getElementById('coding-notes').value
        };
        appState.codingLogs.push(log);
        saveState();
        renderCodingLogs();
        updateChart();
        elements.codingLogForm.reset();
    });
}

function renderCodingLogs() {
    if(!elements.codingLogBody) return;
    elements.codingLogBody.innerHTML = appState.codingLogs.slice().reverse().slice(0, 10).map(log => `
        <tr>
            <td>${log.date}</td>
            <td>${log.platform}</td>
            <td>${log.count}</td>
            <td><span class="status-badge status-ongoing">${log.difficulty}</span></td>
            <td><button class="btn-text" onclick="deleteCodingLog(${log.id})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');
}

window.deleteCodingLog = (id) => {
    appState.codingLogs = appState.codingLogs.filter(l => l.id !== id);
    saveState();
    renderCodingLogs();
    updateChart();
};

// --- HABITS & STREAK ---
function renderHabits() {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const today = now.getDate();
    
    if(elements.habitMonthName) {
        elements.habitMonthName.textContent = currentMonth;
    }
    
    // Render Header
    let headHtml = '<th>Habit</th>';
    for (let i = 1; i <= daysInMonth; i++) {
        headHtml += `<th class="${i === today ? 'today' : ''}">${i}</th>`;
    }
    if(elements.habitsTableHead) {
        elements.habitsTableHead.innerHTML = headHtml;
    }
    
    // Render Body
    if(elements.habitsTableBody) {
        elements.habitsTableBody.innerHTML = appState.habits.map(habit => {
            let cellsHtml = `
                <td class="habit-name-cell">
                    <span>${habit.name}</span>
                    <div class="habit-actions">
                        <button class="btn-text" onclick="editHabit(${habit.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-text" onclick="deleteHabit(${habit.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = new Date(now.getFullYear(), now.getMonth(), i).toLocaleDateString();
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
    
    if(elements.habitStreakDisplay) {
        elements.habitStreakDisplay.textContent = appState.habitStreak;
    }
}

window.toggleHabitDay = (habitId, dateStr) => {
    const habit = appState.habits.find(h => h.id === habitId);
    if (habit) {
        if (!habit.history) habit.history = {};
        habit.history[dateStr] = !habit.history[dateStr];
        
        // Update streak logic
        updateHabitStreak();
        
        saveState();
        renderHabits();
    }
};

window.resetHabits = () => {
    if (confirm('Are you sure you want to reset all habit progress for the new month?')) {
        appState.habits.forEach(h => h.history = {});
        appState.habitStreak = 0;
        saveState();
        renderHabits();
        updateHabitProgressChart();
    }
};

function updateHabitStreak() {
    let streak = 0;
    const now = new Date();
    
    for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dStr = d.toLocaleDateString();
        
        const allDone = appState.habits.length > 0 && appState.habits.every(h => h.history && h.history[dStr]);
        
        if (allDone) {
            streak++;
        } else if (i === 0) {
            // If today isn't done yet, don't break streak, just check yesterday
            continue;
        } else {
            break;
        }
    }
    appState.habitStreak = streak;
}

if(elements.addHabitBtn) {
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
            const name = document.getElementById('habit-name-input').value;
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
    showModal('Edit Habit', `
        <form id="edit-habit-form">
            <div class="form-group">
                <label>Habit Name</label>
                <input type="text" id="edit-habit-name-input" value="${habit.name}" required>
            </div>
            <button type="submit" class="btn-primary block">Save Changes</button>
        </form>
    `);
    
    document.getElementById('edit-habit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        habit.name = document.getElementById('edit-habit-name-input').value;
        saveState();
        renderHabits();
        closeModal();
    });
};

window.deleteHabit = (id) => {
    if (confirm('Are you sure you want to delete this habit?')) {
        appState.habits = appState.habits.filter(h => h.id !== id);
        saveState();
        renderHabits();
    }
};

// --- TARGETS ---
function renderTargets() {
    if (!elements.weeklyTargetsList || !elements.monthlyTargetsList) return;

    elements.weeklyTargetsList.innerHTML = appState.weeklyTargets.map((target, index) => `
        <li class="target-item-simple">
            <input type="checkbox" ${target.completed ? 'checked' : ''} onchange="toggleTarget('weekly', ${index})">
            <input type="text" value="${escapeHtml(target.text)}" onchange="updateTargetText('weekly', ${index}, this.value)" placeholder="New Weekly Target...">
            <button class="delete-target" onclick="deleteTarget('weekly', ${index})"><i class="fas fa-times"></i></button>
        </li>
    `).join('');

    elements.monthlyTargetsList.innerHTML = appState.monthlyTargets.map((target, index) => `
        <li class="target-item-simple">
            <input type="checkbox" ${target.completed ? 'checked' : ''} onchange="toggleTarget('monthly', ${index})">
            <input type="text" value="${escapeHtml(target.text)}" onchange="updateTargetText('monthly', ${index}, this.value)" placeholder="New Monthly Target...">
            <button class="delete-target" onclick="deleteTarget('monthly', ${index})"><i class="fas fa-times"></i></button>
        </li>
    `).join('');
}

window.toggleTarget = (type, index) => {
    const list = type === 'weekly' ? appState.weeklyTargets : appState.monthlyTargets;
    list[index].completed = !list[index].completed;
    saveState();
};

window.updateTargetText = (type, index, text) => {
    const list = type === 'weekly' ? appState.weeklyTargets : appState.monthlyTargets;
    list[index].text = text;
    saveState();
};

window.deleteTarget = (type, index) => {
    const list = type === 'weekly' ? appState.weeklyTargets : appState.monthlyTargets;
    list.splice(index, 1);
    saveState();
    renderTargets();
};

if (elements.addWeeklyTargetBtn) {
    elements.addWeeklyTargetBtn.addEventListener('click', () => {
        appState.weeklyTargets.push({ text: '', completed: false });
        saveState();
        renderTargets();
    });
}

if (elements.addMonthlyTargetBtn) {
    elements.addMonthlyTargetBtn.addEventListener('click', () => {
        appState.monthlyTargets.push({ text: '', completed: false });
        saveState();
        renderTargets();
    });
}

// --- POMODORO ---
let timerInterval;
let timeLeft = appState.pomodoroSettings.work * 60;
let currentMode = 'work';
let isRunning = false;

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    if(elements.timerDisplay) {
        elements.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

if(elements.pomoStartBtn) {
    elements.pomoStartBtn.addEventListener('click', () => {
        if (isRunning) {
            clearInterval(timerInterval);
            elements.pomoStartBtn.textContent = 'Start';
            isRunning = false;
        } else {
            isRunning = true;
            elements.pomoStartBtn.textContent = 'Pause';
            timerInterval = setInterval(() => {
                timeLeft--;
                updateTimerDisplay();
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    const notifSound = document.getElementById('notification-sound');
                    if(notifSound) notifSound.play();
                    alert('Time is up!');
                    if (currentMode === 'work') {
                        appState.stats.focusTimeMinutes += appState.pomodoroSettings.work;
                        saveState();
                    }
                    resetTimer();
                }
            }, 1000);
        }
    });
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    if(elements.pomoStartBtn) {
        elements.pomoStartBtn.textContent = 'Start';
    }
    timeLeft = appState.pomodoroSettings[currentMode] * 60;
    updateTimerDisplay();
}

if(elements.pomoResetBtn) {
    elements.pomoResetBtn.addEventListener('click', resetTimer);
}

if(elements.pomoModeBtns) {
    elements.pomoModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.pomoModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            resetTimer();
        });
    });
}

// --- NOTES ---
function renderNotes() {
    const searchQuery = document.getElementById('note-search')?.value.toLowerCase() || '';
    let filteredNotes = appState.notes;
    
    if (searchQuery) {
        filteredNotes = filteredNotes.filter(n => 
            n.title.toLowerCase().includes(searchQuery) || 
            n.content.toLowerCase().includes(searchQuery)
        );
    }

    if(elements.notesGrid) {
        elements.notesGrid.innerHTML = filteredNotes.map(note => `
            <div class="note-card">
                <h4>${note.title}</h4>
                <p>${note.content}</p>
                <div class="note-footer">
                    <span>${note.date}</span>
                    <button class="btn-text" onclick="deleteNote(${note.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }
}

if(document.getElementById('note-search')) {
    document.getElementById('note-search').addEventListener('input', renderNotes);
}

window.deleteNote = (id) => {
    appState.notes = appState.notes.filter(n => n.id !== id);
    saveState();
    renderNotes();
};

const addNoteBtn = document.getElementById('add-note-btn');
if(addNoteBtn) {
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
                <button type="submit" class="btn-primary block">Save Note</button>
            </form>
        `);
        
        document.getElementById('add-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.notes.push({
                id: Date.now(),
                title: document.getElementById('note-title').value,
                content: document.getElementById('note-content').value,
                date: new Date().toLocaleDateString()
            });
            saveState();
            renderNotes();
            closeModal();
        });
    });
}

// --- PROJECTS ---
function renderProjects() {
    if(!elements.projectsGrid) return;
    elements.projectsGrid.innerHTML = appState.projects.map(p => `
        <div class="project-card card">
            <h4>${p.name} <span class="status-badge ${p.status === 'Completed' ? 'status-completed' : 'status-ongoing'}">${p.status}</span></h4>
            <p>${p.description}</p>
            <div class="form-group mt-20">
                <strong>Stack:</strong> ${p.stack}
            </div>
            <div class="note-footer">
                <a href="${p.link}" target="_blank" class="btn-text"><i class="fab fa-github"></i> View</a>
                <button class="btn-text" onclick="deleteProject(${p.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

window.deleteProject = (id) => {
    appState.projects = appState.projects.filter(p => p.id !== id);
    saveState();
    renderProjects();
};

const addProjectBtn = document.getElementById('add-project-btn');
if(addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
        showModal('Add Project', `
            <form id="add-project-form">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" id="proj-name" required>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="proj-status">
                        <option value="Ongoing">Ongoing</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tech Stack</label>
                    <input type="text" id="proj-stack" placeholder="e.g. React, Node.js">
                </div>
                <div class="form-group">
                    <label>GitHub Link</label>
                    <input type="url" id="proj-link">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="proj-desc" rows="3"></textarea>
                </div>
                <button type="submit" class="btn-primary block">Add Project</button>
            </form>
        `);
        
        document.getElementById('add-project-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.projects.push({
                id: Date.now(),
                name: document.getElementById('proj-name').value,
                status: document.getElementById('proj-status').value,
                stack: document.getElementById('proj-stack').value,
                link: document.getElementById('proj-link').value,
                description: document.getElementById('proj-desc').value
            });
            saveState();
            renderProjects();
            closeModal();
        });
    });
}

// --- PLACEMENTS ---
function renderPlacements() {
    if(!elements.placementBody) return;
    elements.placementBody.innerHTML = appState.placements.map(p => `
        <tr>
            <td>${p.company}</td>
            <td>${p.role}</td>
            <td><span class="status-badge status-ongoing">${p.status}</span></td>
            <td>${p.date}</td>
            <td>
                <a href="${p.link}" target="_blank" class="btn-text"><i class="fas fa-external-link-alt"></i></a>
                <button class="btn-text" onclick="deletePlacement(${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.deletePlacement = (id) => {
    appState.placements = appState.placements.filter(p => p.id !== id);
    saveState();
    renderPlacements();
};

const addPlacementBtn = document.getElementById('add-placement-btn');
if(addPlacementBtn) {
    addPlacementBtn.addEventListener('click', () => {
        showModal('Add Application', `
            <form id="add-placement-form">
                <div class="form-group">
                    <label>Company</label>
                    <input type="text" id="place-company" required>
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" id="place-role" required>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="place-status">
                        <option value="Applied">Applied</option>
                        <option value="OA">OA</option>
                        <option value="Interview">Interview</option>
                        <option value="Selected">Selected</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Link</label>
                    <input type="url" id="place-link">
                </div>
                <button type="submit" class="btn-primary block">Add Application</button>
            </form>
        `);
        
        document.getElementById('add-placement-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.placements.push({
                id: Date.now(),
                company: document.getElementById('place-company').value,
                role: document.getElementById('place-role').value,
                status: document.getElementById('place-status').value,
                link: document.getElementById('place-link').value,
                date: new Date().toLocaleDateString()
            });
            saveState();
            renderPlacements();
            closeModal();
        });
    });
}

// --- STATS ---
function updateStats() {
    const today = new Date().toLocaleDateString();
    
    const todaysTasks = appState.tasks.filter(t => t.date === today);
    const tasksDoneToday = todaysTasks.filter(t => t.completed).length;
    
    const problemsToday = appState.codingLogs
        .filter(log => log.date === today)
        .reduce((sum, log) => sum + (Number(log.count) || 0), 0);
    
    if(elements.statTasksDone) elements.statTasksDone.textContent = tasksDoneToday;
    if(elements.statCodingToday) elements.statCodingToday.textContent = problemsToday;
    if(elements.statStreak) elements.statStreak.textContent = appState.habitStreak;
    if(elements.statFocusTime) elements.statFocusTime.textContent = (appState.stats.focusTimeMinutes / 60).toFixed(1) + 'h';

    // Update Progress Bar
    const progressPercent = todaysTasks.length > 0 ? (tasksDoneToday / todaysTasks.length) * 100 : 0;
    const progressBar = document.getElementById('task-progress-bar');
    const progressText = document.getElementById('task-progress-text');
    
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressText) progressText.textContent = `${tasksDoneToday}/${todaysTasks.length}`;
}

// --- UTILS & MODAL ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showModal(title, bodyHtml) {
    if(!elements.modalTitle) return;
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = bodyHtml;
    elements.modalOverlay.classList.remove('hidden');
}

function closeModal() {
    if(elements.modalOverlay) elements.modalOverlay.classList.add('hidden');
}

if(elements.closeModal) {
    elements.closeModal.addEventListener('click', closeModal);
}
if(elements.modalOverlay) {
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) closeModal();
    });
}

// --- EXPORT / IMPORT ---
if(elements.exportBtn) {
    elements.exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "productivity_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });
}

if(elements.importBtn) {
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
}

if(elements.importFile) {
    elements.importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                appState = { ...DEFAULT_STATE, ...importedData };
                saveState();
                location.reload();
            } catch (err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    });
}

function initEventListeners() {
    // Mobile menu toggle (simple)
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    if(mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const navLinks = document.querySelector('.nav-links');
            if(!navLinks) return;
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.backgroundColor = 'var(--card-bg)';
            navLinks.style.padding = '1rem';
            navLinks.style.borderBottom = '1px solid var(--border-color)';
        });
    }
    initMoneyTracker();
}

// --- MONEY TRACKER LOGIC ---
let expensePieChart, spendingBarChart;

function initMoneyTracker() {
    if (!elements.transactionForm) return;

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const transDateEl = document.getElementById('trans-date');
    if (transDateEl) transDateEl.value = today;

    // Event Listeners
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
                            appState.moneyTracker.transactions = importedTransactions;
                            saveState();
                            renderMoneyTracker();
                            alert('Transactions imported successfully!');
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

    // Initialize UI
    updateFilterOptions();
    renderMoneyTracker();
    initMoneyCharts();
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

    // Sort
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return filters.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    elements.transactionBody.innerHTML = filtered.map(t => `
        <tr>
            <td>${t.date}</td>
            <td><span class="status-badge ${t.type === 'Income' ? 'status-completed' : 'status-ongoing'}">${t.type}</span></td>
            <td class="${t.type === 'Income' ? 'text-success' : 'text-danger'}">₹${parseFloat(t.amount).toLocaleString()}</td>
            <td>${t.category}</td>
            <td>${t.mode}</td>
            <td title="${t.notes}">${t.notes.substring(0, 15)}${t.notes.length > 15 ? '...' : ''}</td>
            <td>
                <button class="btn-text" onclick="editTransaction(${t.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-text text-danger" onclick="deleteTransaction(${t.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
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
                <input type="date" id="edit-trans-date" value="${t.date}" required>
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
                <input type="number" id="edit-trans-amount" value="${t.amount}" min="1" required>
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
                <textarea id="edit-trans-notes" rows="2">${t.notes}</textarea>
            </div>
            <button type="submit" class="btn-primary block">Save Changes</button>
        </form>
    `);

    document.getElementById('edit-transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        t.date = document.getElementById('edit-trans-date').value;
        t.type = document.getElementById('edit-trans-type').value;
        t.amount = parseFloat(document.getElementById('edit-trans-amount').value);
        t.category = document.getElementById('edit-trans-category').value;
        t.mode = document.getElementById('edit-trans-mode').value;
        t.notes = document.getElementById('edit-trans-notes').value;
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

function initMoneyCharts() {
    const pieEl = document.getElementById('expense-pie-chart');
    const barEl = document.getElementById('spending-bar-chart');
    if (!pieEl || !barEl) return;

    const pieCtx = pieEl.getContext('2d');
    const barCtx = barEl.getContext('2d');

    expensePieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: appState.theme === 'dark' ? '#f1f5f9' : '#1e293b' } } } }
    });

    spendingBarChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Expense', data: [], backgroundColor: '#ef4444' }, { label: 'Income', data: [], backgroundColor: '#10b981' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: appState.theme === 'dark' ? '#334155' : '#e2e8f0' } }, x: { grid: { display: false } } } }
    });
}

function updateMoneyCharts() {
    if (!expensePieChart || !spendingBarChart) return;

    // Pie Chart
    const catMap = {};
    appState.moneyTracker.transactions.filter(t => t.type === 'Expense').forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
    });

    expensePieChart.data.labels = Object.keys(catMap);
    expensePieChart.data.datasets[0].data = Object.values(catMap);
    expensePieChart.options.plugins.legend.labels.color = appState.theme === 'dark' ? '#f1f5f9' : '#1e293b';
    expensePieChart.update();

    // Bar Chart (Last 6 Months)
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

    spendingBarChart.data.labels = months.map(m => new Date(m + '-01').toLocaleString('default', { month: 'short' }));
    spendingBarChart.data.datasets[0].data = expData;
    spendingBarChart.data.datasets[1].data = incData;
    spendingBarChart.update();
}
