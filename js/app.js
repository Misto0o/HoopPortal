// ============================================
// SUPABASE CONFIGURATION
// ============================================
// Replace with your actual Supabase credentials
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// Initialize Supabase client (use CDN version)
let supabaseClient = null;

async function initializeSupabase() {
    // Load Supabase via CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
        const { createClient } = window.supabase;
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    };
    document.head.appendChild(script);
}

// ============================================
// MAIN APP CLASS
// ============================================
class HoopPortalApp {
    constructor() {
        this.currentUser = null;
        this.mockPlayers = this.generateMockPlayers();
        this.init();
    }

    async init() {
        await initializeSupabase();
        this.setupEventListeners();
        this.checkAuthStatus();
        this.loadPageContent();
    }

    setupEventListeners() {
        // Auth buttons
        document.getElementById('loginBtn')?.addEventListener('click', () => this.showLoginModal());
        document.getElementById('signupBtn')?.addEventListener('click', () => this.showSignupModal());

        // Modal close
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) this.closeModal(modal);
            });
        });

        // Modal outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal);
            });
        });

        // Home page filters
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => this.filterProspectsHome(tab.dataset.filter));
        });

        // Search page
        document.getElementById('searchBtn')?.addEventListener('click', () => this.performSearch());
        document.getElementById('resetBtn')?.addEventListener('click', () => this.resetFilters());

        // Profile forms
        document.getElementById('basicInfoForm')?.addEventListener('submit', (e) => this.handleBasicInfo(e));
        document.getElementById('gameDescriptionForm')?.addEventListener('submit', (e) => this.handleGameDescription(e));
        document.getElementById('contactForm')?.addEventListener('submit', (e) => this.handleContactInfo(e));
        document.getElementById('addHighlightBtn')?.addEventListener('click', () => this.addHighlightField());

        // Plan selection
        document.querySelectorAll('.select-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectPlan(btn.dataset.plan));
        });
    }

    // ============================================
    // AUTHENTICATION
    // ============================================
    checkAuthStatus() {
        const user = localStorage.getItem('hoopportal_user');
        if (user) {
            this.currentUser = JSON.parse(user);
            this.updateNavigation();
        }
    }

    showSignupModal() {
        const modal = document.getElementById('authModal');
        const modalBody = document.getElementById('modalBody');

        modalBody.innerHTML = `
            <h2 class="auth-title">Create Account</h2>
            <p class="auth-subtitle">Join HoopPortal and get discovered</p>
            
            <form id="signupFormModal" class="auth-form">
                <div class="form-group">
                    <label for="signupEmail">Email</label>
                    <input type="email" id="signupEmail" required placeholder="your@email.com">
                </div>
                
                <div class="form-group">
                    <label for="signupPassword">Password</label>
                    <input type="password" id="signupPassword" required placeholder="Create a password">
                </div>
                
                <div class="form-group">
                    <label for="signupConfirm">Confirm Password</label>
                    <input type="password" id="signupConfirm" required placeholder="Confirm password">
                </div>

                <div class="form-group">
                    <label for="userType">I am a:</label>
                    <select id="userType" required>
                        <option value="">Select...</option>
                        <option value="player">Player</option>
                        <option value="coach">Coach</option>
                    </select>
                </div>
                
                <button type="submit" class="btn btn-primary btn-block">Sign Up</button>
            </form>

            <div class="auth-divider">or</div>

            <button class="btn btn-social">
                <span>Continue with Google</span>
            </button>

            <p class="auth-footer">
                Already have an account? 
                <button type="button" class="auth-link" id="switchToLogin">Log In</button>
            </p>
        `;

        modal.classList.add('show');

        document.getElementById('signupFormModal').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('switchToLogin').addEventListener('click', () => this.showLoginModal());
    }

    showLoginModal() {
        const modal = document.getElementById('authModal');
        const modalBody = document.getElementById('modalBody');

        modalBody.innerHTML = `
            <h2 class="auth-title">Welcome Back</h2>
            <p class="auth-subtitle">Sign in to your HoopPortal account</p>
            
            <form id="signinFormModal" class="auth-form">
                <div class="form-group">
                    <label for="signinEmail">Email</label>
                    <input type="email" id="signinEmail" required placeholder="your@email.com">
                </div>
                
                <div class="form-group">
                    <label for="signinPassword">Password</label>
                    <input type="password" id="signinPassword" required placeholder="Enter password">
                </div>

                <div class="form-checkbox">
                    <input type="checkbox" id="rememberMe" name="remember">
                    <label for="rememberMe">Remember me</label>
                </div>
                
                <button type="submit" class="btn btn-primary btn-block">Sign In</button>
            </form>

            <div class="auth-divider">or</div>

            <button class="btn btn-social">
                <span>Continue with Google</span>
            </button>

            <p class="auth-footer">
                Don't have an account? 
                <button type="button" class="auth-link" id="switchToSignup">Sign Up</button>
            </p>
        `;

        modal.classList.add('show');

        document.getElementById('signinFormModal').addEventListener('submit', (e) => this.handleSignin(e));
        document.getElementById('switchToSignup').addEventListener('click', () => this.showSignupModal());
    }

    async handleSignup(e) {
        e.preventDefault();

        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('signupConfirm').value;
        const userType = document.getElementById('userType').value;

        if (password !== confirm) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        // For now, using localStorage. Replace with Supabase auth when ready
        const user = {
            id: Date.now().toString(),
            email,
            userType,
            createdAt: new Date(),
            subscription: null
        };

        this.currentUser = user;
        localStorage.setItem('hoopportal_user', JSON.stringify(user));

        this.showNotification('Account created! Welcome to HoopPortal', 'success');
        this.closeModal(document.getElementById('authModal'));
        this.updateNavigation();

        if (userType === 'player') {
            setTimeout(() => window.location.href = 'profile.html', 1500);
        }
    }

    async handleSignin(e) {
        e.preventDefault();

        const email = document.getElementById('signinEmail').value;
        const password = document.getElementById('signinPassword').value;

        // For now, basic auth. Replace with Supabase when ready
        const user = {
            id: email,
            email,
            userType: 'player',
            createdAt: new Date()
        };

        this.currentUser = user;
        localStorage.setItem('hoopportal_user', JSON.stringify(user));

        this.showNotification('Signed in successfully!', 'success');
        this.closeModal(document.getElementById('authModal'));
        this.updateNavigation();
    }

    updateNavigation() {
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');
        const navMenu = document.getElementById('navMenu');

        if (loginBtn && signupBtn) {
            if (this.currentUser) {
                loginBtn.style.display = 'none';
                signupBtn.style.display = 'none';

                if (!document.getElementById('logoutBtn')) {
                    const logoutBtn = document.createElement('button');
                    logoutBtn.id = 'logoutBtn';
                    logoutBtn.className = 'nav-btn nav-btn-signup';
                    logoutBtn.textContent = `Log Out`;
                    logoutBtn.addEventListener('click', () => this.handleLogout());
                    navMenu.appendChild(logoutBtn);

                    const dashboardBtn = document.createElement('a');
                    dashboardBtn.href = 'dashboard.html';
                    dashboardBtn.className = 'nav-link';
                    dashboardBtn.textContent = 'Dashboard';
                    navMenu.insertBefore(dashboardBtn, logoutBtn);
                }
            } else {
                loginBtn.style.display = 'inline-block';
                signupBtn.style.display = 'inline-block';

                const logoutBtn = document.getElementById('logoutBtn');
                const dashboardBtn = document.querySelector('a[href="dashboard.html"]');
                if (logoutBtn) logoutBtn.remove();
                if (dashboardBtn) dashboardBtn.remove();
            }
        }
    }

    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('hoopportal_user');
        this.showNotification('Logged out successfully', 'success');
        this.updateNavigation();
        window.location.href = 'index.html';
    }

    // ============================================
    // PROSPECTS
    // ============================================
    generateMockPlayers() {
        // Only 2 example players + limited data
        return [
            {
                id: 1,
                name: 'Jordan Williams',
                gender: 'boys',
                position: 'PG',
                height: "6'2\"",
                weight: 190,
                gpa: 3.8,
                school: 'Lincoln High',
                city: 'Charlotte',
                state: 'NC',
                classYear: 2025,
                premium: true,
                emoji: '🏀',
                description: 'Quick point guard with excellent court vision and ball handling.',
                coachType: 'High-paced offense, development-focused program'
            },
            {
                id: 2,
                name: 'Maya Johnson',
                gender: 'girls',
                position: 'SG',
                height: "5'8\"",
                weight: 140,
                gpa: 3.6,
                school: 'St. Mary Academy',
                city: 'Charlotte',
                state: 'NC',
                classYear: 2026,
                premium: false,
                emoji: '⚡',
                description: 'Explosive scorer with range. Defensive intensity on every possession.',
                coachType: 'Competitive program with strong academics'
            }
        ];
    }

    filterProspectsHome(gender) {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');

        const filtered = gender === 'all'
            ? this.mockPlayers.slice(0, 2)
            : this.mockPlayers.filter(p => p.gender === gender);

        this.displayProspectsHome(filtered);
    }

    displayProspectsHome(prospects) {
        const container = document.getElementById('homeProspectsContainer');
        if (!container) return;

        if (prospects.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No players found</p>';
            return;
        }

        container.innerHTML = prospects.map(p => `
            <div class="prospect-card-home ${p.premium ? 'premium' : ''}" onclick="app.showPlayerModal(${p.id})">
                <div class="prospect-avatar">${p.emoji}</div>
                <div class="prospect-card-content">
                    <h3>${p.name}</h3>
                    <div class="prospect-stats">
                        <div class="stat-item">
                            <div class="stat-label">Position</div>
                            <div class="stat-value">${p.position}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Class</div>
                            <div class="stat-value">${p.classYear}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Height</div>
                            <div class="stat-value">${p.height}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Location</div>
                            <div class="stat-value">${p.city}, ${p.state}</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    performSearch() {
        const name = document.getElementById('filterPlayerName')?.value || '';
        const city = document.getElementById('filterCity')?.value || '';
        const state = document.getElementById('filterState')?.value || '';
        const position = document.getElementById('filterPosition')?.value || '';
        const classYear = document.getElementById('filterClassYear')?.value || '';

        let results = this.mockPlayers.filter(p => {
            if (name && !p.name.toLowerCase().includes(name.toLowerCase())) return false;
            if (city && !p.city.toLowerCase().includes(city.toLowerCase())) return false;
            if (state && p.state !== state) return false;
            if (position && p.position !== position) return false;
            if (classYear && p.classYear != classYear) return false;
            return true;
        });

        results.sort((a, b) => b.premium - a.premium);
        this.displaySearchResults(results);
    }

    displaySearchResults(prospects) {
        const container = document.getElementById('searchProspectsContainer');
        if (!container) return;

        if (prospects.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No prospects found. Try adjusting your filters.</p>';
            return;
        }

        container.innerHTML = prospects.map(p => `
            <div class="prospect-item ${p.premium ? 'premium' : ''}" onclick="app.showPlayerModal(${p.id})">
                <div class="prospect-item-avatar">${p.emoji}</div>
                <div class="prospect-item-content">
                    <div class="prospect-item-header">
                        <div class="prospect-item-name">${p.name}</div>
                        ${p.premium ? '<span class="premium-badge">⭐ PREMIUM</span>' : ''}
                    </div>
                    <div class="prospect-item-details">
                        <div class="detail-item">
                            <div class="detail-label">Position</div>
                            <div class="detail-value">${p.position}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Height</div>
                            <div class="detail-value">${p.height}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Weight</div>
                            <div class="detail-value">${p.weight} lbs</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">GPA</div>
                            <div class="detail-value">${p.gpa}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Class</div>
                            <div class="detail-value">${p.classYear}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Location</div>
                            <div class="detail-value">${p.city}, ${p.state}</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    resetFilters() {
        document.getElementById('filterPlayerName').value = '';
        document.getElementById('filterCity').value = '';
        document.getElementById('filterState').value = '';
        document.getElementById('filterPosition').value = '';
        document.getElementById('filterClassYear').value = '';
        document.getElementById('searchProspectsContainer').innerHTML = '';
    }

    showPlayerModal(playerId) {
        const player = this.mockPlayers.find(p => p.id === playerId);
        if (!player) return;

        const modalBody = document.getElementById('playerModalBody');
        modalBody.innerHTML = `
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${player.emoji}</div>
                <h2>${player.name}</h2>
                ${player.premium ? '<p style="color: var(--primary-orange); font-weight: 700;">⭐ PREMIUM PLAYER</p>' : ''}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Position</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.position}</p>
                </div>
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Height</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.height}</p>
                </div>
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Weight</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.weight} lbs</p>
                </div>
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">GPA</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.gpa}</p>
                </div>
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Class Year</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.classYear}</p>
                </div>
                <div>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">School</p>
                    <p style="font-weight: 700; font-size: 1.1rem;">${player.school}</p>
                </div>
            </div>

            <div style="background-color: var(--secondary-dark); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Game Style</p>
                <p style="font-weight: 600; margin-bottom: 1.5rem;">${player.description}</p>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Coach Type</p>
                <p style="font-weight: 600;">${player.coachType}</p>
            </div>

            <div style="background-color: var(--secondary-dark); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Location</p>
                <p style="font-weight: 700;">${player.city}, ${player.state}</p>
            </div>

            <button class="btn btn-primary btn-block">Contact Player</button>
        `;

        document.getElementById('playerModal').classList.add('show');
    }

    // ============================================
    // PROFILE FORMS
    // ============================================
    handleBasicInfo(e) {
        e.preventDefault();
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const basicInfo = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            height: document.getElementById('height').value,
            weight: document.getElementById('weight').value,
            position: document.getElementById('position').value,
            classYear: document.getElementById('classYear').value,
            gpa: document.getElementById('gpa').value,
            school: document.getElementById('school').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value
        };

        this.currentUser.basicInfo = basicInfo;
        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
        this.showNotification('Basic information saved!', 'success');
    }

    handleGameDescription(e) {
        e.preventDefault();
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        this.currentUser.gameDescription = {
            gameStyle: document.getElementById('gameDescription').value,
            coachType: document.getElementById('coachType').value
        };

        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
        this.showNotification('Game description saved!', 'success');
    }

    handleContactInfo(e) {
        e.preventDefault();
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        this.currentUser.contactInfo = {
            playerEmail: document.getElementById('playerEmail').value,
            playerPhone: document.getElementById('playerPhone').value,
            parentName: document.getElementById('parentName').value,
            parentEmail: document.getElementById('parentEmail').value,
            parentPhone: document.getElementById('parentPhone').value
        };

        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
        this.showNotification('Contact information saved!', 'success');
    }

    addHighlightField() {
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const maxClips = this.currentUser.subscription === 'premium' ? 5 : 2;
        const container = document.getElementById('highlightsContainer');
        const currentCount = container.querySelectorAll('.highlight-item').length;

        if (currentCount >= maxClips) {
            this.showNotification(`You can only add up to ${maxClips} highlight reels with your plan`, 'error');
            return;
        }

        const newField = document.createElement('div');
        newField.className = 'highlight-item';
        newField.innerHTML = `
            <input type="url" placeholder="Paste YouTube or Vimeo link..." value="">
            <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()">Remove</button>
        `;

        container.appendChild(newField);
    }

    selectPlan(plan) {
        if (!this.currentUser) {
            this.showNotification('Please log in first to select a plan', 'error');
            this.showSignupModal();
            return;
        }

        this.currentUser.subscription = plan;
        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

        const planName = plan === 'basic' ? 'Basic ($1.99/month)' : 'Premium ($4.99/month)';
        const clips = plan === 'basic' ? '2' : '5';

        this.showNotification(`You've selected the ${planName} plan! You can now add up to ${clips} highlight reels.`, 'success');
        setTimeout(() => window.location.href = 'profile.html', 1500);
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    closeModal(modal) {
        modal.classList.remove('show');
    }

    showNotification(message, type) {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        const style = document.createElement('style');
        if (!document.querySelector('style[data-notification]')) {
            style.setAttribute('data-notification', 'true');
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    z-index: 9999;
                    animation: slideIn 0.3s ease-out, slideOut 0.3s ease-in 4.7s forwards;
                    font-weight: 600;
                }
                .notification-success {
                    background-color: var(--success-green);
                    color: white;
                }
                .notification-error {
                    background-color: #ff4757;
                    color: white;
                }
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
                @media (max-width: 768px) {
                    .notification {
                        left: 20px;
                        right: 20px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    loadPageContent() {
        const path = window.location.pathname.split('/').pop() || 'index.html';

        if (path.includes('index.html') || path === '') {
            this.displayProspectsHome(this.mockPlayers);
        } else if (path.includes('search.html')) {
            // Will populate on search
        }
    }
}

// ============================================
// INITIALIZE APP
// ============================================
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new HoopPortalApp();
});