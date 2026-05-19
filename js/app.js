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
        this.playerStats = {};
        this.init();
    }

    async init() {
        await initializeSupabase();
        this.setupEventListeners();
        this.checkAuthStatus();
        this.loadPageContent();
    }

    setupEventListeners() {
        // Auth buttons - retry if not found yet
        const setupAuthButtons = () => {
            const loginBtn = document.getElementById('loginBtn');
            const signupBtn = document.getElementById('signupBtn');
            
            if (loginBtn && signupBtn) {
                loginBtn.addEventListener('click', () => this.showLoginModal());
                signupBtn.addEventListener('click', () => this.showSignupModal());
            } else {
                // Retry after a short delay if buttons not found
                setTimeout(setupAuthButtons, 100);
            }
        };
        setupAuthButtons();

        // Modal close
        const setupModalClose = () => {
            const closeButtons = document.querySelectorAll('.modal-close');
            if (closeButtons.length > 0) {
                closeButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const modal = e.target.closest('.modal');
                        if (modal) this.closeModal(modal);
                    });
                });
            }
        };
        setupModalClose();

        // Modal outside click
        const setupModalClick = () => {
            const modals = document.querySelectorAll('.modal');
            if (modals.length > 0) {
                modals.forEach(modal => {
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) this.closeModal(modal);
                    });
                });
            }
        };
        setupModalClick();

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
        document.getElementById('updateStatsBtn')?.addEventListener('click', () => this.updateProfileStats());
        document.getElementById('uploadPFPBtn')?.addEventListener('click', () => this.uploadProfilePicture());

        // Plan selection
        document.querySelectorAll('.select-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectPlan(btn.dataset.plan));
        });

        // Load saved stats
        this.loadProfileStats();
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
            
            <div class="signup-tabs">
                <button class="signup-tab active" data-type="player">Player</button>
                <button class="signup-tab" data-type="coach">Coach</button>
            </div>

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

                <div class="form-group player-field" style="display: block;">
                    <label for="signupName">Full Name *</label>
                    <input type="text" id="signupName" placeholder="Your full name">
                </div>

                <div class="form-group coach-field" style="display: none;">
                    <label for="coachTeam">Team/Program Name *</label>
                    <input type="text" id="coachTeam" placeholder="Your team or program name">
                </div>

                <div class="form-group coach-field" style="display: none;">
                    <label for="coachSchool">School/Organization *</label>
                    <input type="text" id="coachSchool" placeholder="School or organization name">
                </div>

                <div class="form-group coach-field" style="display: none;">
                    <label for="coachPhone">Phone Number *</label>
                    <input type="tel" id="coachPhone" placeholder="Your phone number">
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

        // Setup tab switching
        document.querySelectorAll('.signup-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.signup-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                const userType = e.target.dataset.type;
                document.querySelectorAll('.player-field').forEach(field => {
                    field.style.display = userType === 'player' ? 'block' : 'none';
                });
                document.querySelectorAll('.coach-field').forEach(field => {
                    field.style.display = userType === 'coach' ? 'block' : 'none';
                });
            });
        });

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
        
        // Determine user type from which tab is active
        const activeTab = document.querySelector('.signup-tab.active');
        const userType = activeTab ? activeTab.dataset.type : 'player';

        if (password !== confirm) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        // Validate required fields based on user type
        if (userType === 'player') {
            const name = document.getElementById('signupName').value;
            if (!name) {
                this.showNotification('Please enter your full name', 'error');
                return;
            }
        } else if (userType === 'coach') {
            const team = document.getElementById('coachTeam').value;
            const school = document.getElementById('coachSchool').value;
            const phone = document.getElementById('coachPhone').value;
            if (!team || !school || !phone) {
                this.showNotification('Please fill in all coach information', 'error');
                return;
            }
        }

        // For now, using localStorage. Replace with Supabase auth when ready
        const user = {
            id: Date.now().toString(),
            email,
            userType,
            createdAt: new Date(),
            subscription: null
        };

        if (userType === 'player') {
            user.name = document.getElementById('signupName').value;
        } else if (userType === 'coach') {
            user.team = document.getElementById('coachTeam').value;
            user.school = document.getElementById('coachSchool').value;
            user.phone = document.getElementById('coachPhone').value;
        }

        this.currentUser = user;
        localStorage.setItem('hoopportal_user', JSON.stringify(user));

        this.showNotification('Account created! Welcome to HoopPortal', 'success');
        this.closeModal(document.getElementById('authModal'));
        this.updateNavigation();

        if (userType === 'player') {
            setTimeout(() => window.location.href = 'profile.html', 1500);
        } else if (userType === 'coach') {
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
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
    // PROFILE STATS & PICTURE
    // ============================================
    loadProfileStats() {
        const stats = localStorage.getItem('hoopportal_player_stats');
        if (stats) {
            this.playerStats = JSON.parse(stats);
            this.displayProfileStats();
        }
    }

    displayProfileStats() {
        // Display stored stats
        document.getElementById('statPPG').textContent = this.playerStats.ppg || '—';
        document.getElementById('statAPG').textContent = this.playerStats.apg || '—';
        document.getElementById('statRPG').textContent = this.playerStats.rpg || '—';
        document.getElementById('statFG').textContent = this.playerStats.fg ? this.playerStats.fg + '%' : '—';

        // Populate inputs
        document.getElementById('inputPPG').value = this.playerStats.ppg || '';
        document.getElementById('inputAPG').value = this.playerStats.apg || '';
        document.getElementById('inputRPG').value = this.playerStats.rpg || '';
        document.getElementById('inputFG').value = this.playerStats.fg || '';

        // Display profile picture if exists
        const pfp = localStorage.getItem('hoopportal_player_pfp');
        if (pfp) {
            const pfpImg = document.getElementById('profilePicture');
            if (pfpImg) {
                pfpImg.style.backgroundImage = `url('${pfp}')`;
                pfpImg.style.backgroundSize = 'cover';
                pfpImg.style.backgroundPosition = 'center';
                pfpImg.textContent = '';
            }
        }
    }

    updateProfileStats() {
        const ppg = document.getElementById('inputPPG').value;
        const apg = document.getElementById('inputAPG').value;
        const rpg = document.getElementById('inputRPG').value;
        const fg = document.getElementById('inputFG').value;

        this.playerStats = {
            ppg: ppg ? parseFloat(ppg).toFixed(1) : null,
            apg: apg ? parseFloat(apg).toFixed(1) : null,
            rpg: rpg ? parseFloat(rpg).toFixed(1) : null,
            fg: fg ? parseFloat(fg).toFixed(1) : null
        };

        localStorage.setItem('hoopportal_player_stats', JSON.stringify(this.playerStats));
        this.displayProfileStats();
        this.showNotification('Player stats updated!', 'success');
    }

    uploadProfilePicture() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageData = event.target.result;
                    localStorage.setItem('hoopportal_player_pfp', imageData);
                    this.displayProfileStats();
                    this.showNotification('Profile picture updated!', 'success');
                };
                reader.readAsDataURL(file);
            }
        };
        fileInput.click();
    }

    updateQuickProfile() {
        const position = document.getElementById('position').value;
        const height = document.getElementById('height').value;
        const weight = document.getElementById('weight').value;
        const classYear = document.getElementById('classYear').value;
        const gpa = document.getElementById('gpa').value;
        const city = document.getElementById('city').value;
        const state = document.getElementById('state').value;

        document.getElementById('displayPosition').textContent = position || '—';
        document.getElementById('displayHeight').textContent = height || '—';
        document.getElementById('displayWeight').textContent = weight ? weight + ' lbs' : '—';
        document.getElementById('displayClassYear').textContent = classYear || '—';
        document.getElementById('displayGPA').textContent = gpa || '—';
        document.getElementById('displayLocation').textContent = (city && state) ? `${city}, ${state}` : '—';
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
                height: "6'2",
                weight: 190,
                transcript: 'https://example.com/transcript1.pdf',
                school: 'Lincoln High',
                city: 'Charlotte',
                state: 'NC',
                classYear: 2027,
                premium: true,
                emoji: '🏀',
                likes: 145,
                liked: false,
                description: 'Quick point guard with excellent court vision and ball handling.',
                coachType: 'High-paced offense, development-focused program'
            },
            {
                id: 2,
                name: 'Maya Johnson',
                gender: 'girls',
                position: 'CG',
                height: "5'8\"",
                weight: 140,
                transcript: 'https://example.com/transcript2.pdf',
                school: 'St. Mary Academy',
                city: 'Charlotte',
                state: 'NC',
                classYear: 2028,
                premium: false,
                emoji: '⚡',
                likes: 87,
                liked: false,
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
        const likeButtonStyle = player.liked ? 'background-color: var(--primary-orange); color: white;' : '';
        
        // Get player stats from localStorage
        const stats = localStorage.getItem(`hoopportal_player_${playerId}_stats`);
        const playerStats = stats ? JSON.parse(stats) : { ppg: null, apg: null, rpg: null, fg: null };
        
        // Get player profile picture
        const pfp = localStorage.getItem(`hoopportal_player_${playerId}_pfp`);
        const profilePic = pfp || player.emoji;
        const isEmoji = profilePic === player.emoji;
        
        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 280px; gap: 2rem;">
                <!-- LEFT SIDE: MAIN INFO -->
                <div>
                    <div style="text-align: center; margin-bottom: 2rem;">
                        <div style="font-size: 4rem; margin-bottom: 1rem; ${isEmoji ? '' : 'display: none;'}">${isEmoji ? profilePic : ''}</div>
                        ${!isEmoji ? `<img src="${profilePic}" alt="${player.name}" style="width: 120px; height: 120px; border-radius: 12px; object-fit: cover; margin-bottom: 1rem; border: 3px solid var(--primary-orange);">` : ''}
                        <h2 style="margin-bottom: 0.5rem;">${player.name}</h2>
                        ${player.premium ? '<p style="color: var(--primary-orange); font-weight: 700; margin-bottom: 1rem;">⭐ PREMIUM PLAYER</p>' : ''}
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
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Class Year</p>
                            <p style="font-weight: 700; font-size: 1.1rem;">${player.classYear}</p>
                        </div>
                        <div>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">School</p>
                            <p style="font-weight: 700; font-size: 1.1rem;">${player.school}</p>
                        </div>
                        <div>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Location</p>
                            <p style="font-weight: 700; font-size: 1.1rem;">${player.city}, ${player.state}</p>
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
                        <p style="font-weight: 700; margin-bottom: 1.5rem;">${player.city}, ${player.state}</p>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Transcript</p>
                        <a href="${player.transcript}" target="_blank" style="color: var(--primary-orange); text-decoration: none; font-weight: 600;">📄 View Transcript</a>
                    </div>

                    <div style="display: flex; gap: 1rem;">
                        <button class="btn btn-primary btn-block" onclick="app.likePlayer(${playerId})" id="likeBtn" style="${likeButtonStyle}; padding: 0.75rem 1.75rem;">
                            ${player.liked ? '❤️ Liked (' + player.likes + ')' : '🤍 Like (' + player.likes + ')'}
                        </button>
                        <button class="btn btn-primary btn-block" style="padding: 0.75rem 1.75rem;">Contact Player</button>
                    </div>
                </div>

                <!-- RIGHT SIDE: STATS SIDEBAR -->
                <div>
                    <div style="background: linear-gradient(135deg, #2a2d33 0%, #242729 100%); border: 1px solid #404450; border-radius: 12px; padding: 1.5rem; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);">
                        <h3 style="font-size: 1.1rem; margin-bottom: 1.2rem; padding-bottom: 0.75rem; border-bottom: 1px solid #3a3f47; font-weight: 700; color: #f0f0f0;">Season Stats</h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
                            <div style="background: #1e2025; border: 1px solid #3a3f47; border-radius: 8px; padding: 1rem; text-align: center;">
                                <div style="font-size: 0.8rem; color: #a0a8b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">PPG</div>
                                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-orange);">${playerStats.ppg || '—'}</div>
                            </div>
                            <div style="background: #1e2025; border: 1px solid #3a3f47; border-radius: 8px; padding: 1rem; text-align: center;">
                                <div style="font-size: 0.8rem; color: #a0a8b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">APG</div>
                                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-orange);">${playerStats.apg || '—'}</div>
                            </div>
                            <div style="background: #1e2025; border: 1px solid #3a3f47; border-radius: 8px; padding: 1rem; text-align: center;">
                                <div style="font-size: 0.8rem; color: #a0a8b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">RPG</div>
                                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-orange);">${playerStats.rpg || '—'}</div>
                            </div>
                            <div style="background: #1e2025; border: 1px solid #3a3f47; border-radius: 8px; padding: 1rem; text-align: center;">
                                <div style="font-size: 0.8rem; color: #a0a8b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">FG%</div>
                                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-orange);">${playerStats.fg ? playerStats.fg + '%' : '—'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('playerModal').classList.add('show');
    }

    likePlayer(playerId) {
        const player = this.mockPlayers.find(p => p.id === playerId);
        if (!player) return;

        if (player.liked) {
            player.liked = false;
            player.likes -= 1;
        } else {
            player.liked = true;
            player.likes += 1;
        }

        // Store liked players in localStorage
        const likedPlayers = JSON.parse(localStorage.getItem('hoopportal_liked_players') || '[]');
        if (player.liked) {
            if (!likedPlayers.includes(playerId)) {
                likedPlayers.push(playerId);
            }
        } else {
            const index = likedPlayers.indexOf(playerId);
            if (index > -1) {
                likedPlayers.splice(index, 1);
            }
        }
        localStorage.setItem('hoopportal_liked_players', JSON.stringify(likedPlayers));

        // Update button
        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn) {
            if (player.liked) {
                likeBtn.style.backgroundColor = 'var(--primary-orange)';
                likeBtn.style.color = 'white';
                likeBtn.textContent = '❤️ Liked (' + player.likes + ')';
            } else {
                likeBtn.style.backgroundColor = '';
                likeBtn.style.color = '';
                likeBtn.textContent = '🤍 Like (' + player.likes + ')';
            }
        }

        this.showNotification(player.liked ? 'Player liked!' : 'Like removed', 'success');
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
            transcript: document.getElementById('transcript').value,
            school: document.getElementById('school').value,
            transferSchool: document.getElementById('transferSchool').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value
        };

        this.currentUser.basicInfo = basicInfo;
        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
        this.updateQuickProfile();
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
            parentPhone: document.getElementById('parentPhone').value,
            parentName2: document.getElementById('parentName2').value,
            parentEmail2: document.getElementById('parentEmail2').value,
            parentPhone2: document.getElementById('parentPhone2').value
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
        } else if (path.includes('profile.html')) {
            this.loadProfileStats();
            this.updateQuickProfile();
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