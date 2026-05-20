// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://hpuikheuntquldqdewbr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwdWlraGV1bnRxdWxkcWRld2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDc2MTQsImV4cCI6MjA5NDcyMzYxNH0.GVkICFVA3QOkZaYqf-MSag2yhCt68-M2QLGpi7_E0UA';

let supabaseClient = null;

async function initializeSupabase() {
    if (!window.supabase) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        await new Promise((resolve) => {
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }
    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ============================================
// MAIN APP CLASS
// ============================================
class HoopPortalApp {
    constructor() {
        this.currentUser = null;
        this.mockPlayers = this.generateMockPlayers(); // 25 mock players for testing
        this.realPlayers = [];
        this.playerStats = {};
        this.userLikedPlayers = [];
        this.highlightReels = [];
        this.init();
    }

    async init() {
        await initializeSupabase();
        this.setupEventListeners();
        this.checkAuthStatus();
        await this.loadSearchPlayers();
        this.loadPageContent();
    }

    setupEventListeners() {
        const setupAuthButtons = () => {
            const loginBtn = document.getElementById('loginBtn');
            const signupBtn = document.getElementById('signupBtn');

            if (loginBtn && signupBtn) {
                loginBtn.addEventListener('click', () => this.showLoginModal());
                signupBtn.addEventListener('click', () => this.showSignupModal());
            } else {
                setTimeout(setupAuthButtons, 100);
            }
        };
        setupAuthButtons();

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

        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (event) => this.filterProspectsHome(tab.dataset.filter, event));
        });

        document.getElementById('searchBtn')?.addEventListener('click', () => this.performSearch());
        document.getElementById('resetBtn')?.addEventListener('click', () => this.resetFilters());

        document.getElementById('basicInfoForm')?.addEventListener('submit', (e) => this.handleBasicInfo(e));
        document.getElementById('gameDescriptionForm')?.addEventListener('submit', (e) => this.handleGameDescription(e));
        document.getElementById('contactForm')?.addEventListener('submit', (e) => this.handleContactInfo(e));
        document.getElementById('addHighlightBtn')?.addEventListener('click', () => this.addHighlightField());
        document.getElementById('updateStatsBtn')?.addEventListener('click', () => this.updateProfileStats());
        document.getElementById('uploadPFPBtn')?.addEventListener('click', () => this.uploadProfilePicture());

        document.querySelectorAll('.select-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectPlan(btn.dataset.plan));
        });

        this.loadProfileStats();
    }

    // ============================================
    // AUTHENTICATION
    // ============================================
    async checkAuthStatus() {
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (session && session.user) {
            this.currentUser = {
                id: session.user.id,
                email: session.user.email,
                userType: 'player',
                createdAt: new Date(),
                avatar: session.user.user_metadata?.avatar_url || null
            };
            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
            await this.loadUserData();
            await this.loadPlayerProfile();
            this.updateNavigation();

            if (window.location.hash === '#' || window.location.pathname === '/') {
                setTimeout(() => window.location.href = 'profile.html', 500);
            }
            return;
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

        <button class="btn btn-social" id="googleSignupBtn">
            <span>Continue with Google</span>
        </button>

        <p class="auth-footer">
            Already have an account? 
            <button type="button" class="auth-link" id="switchToLogin">Log In</button>
        </p>
    `;

        modal.classList.add('show');

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

        const googleSignupBtn = document.getElementById('googleSignupBtn');
        if (googleSignupBtn) {
            googleSignupBtn.addEventListener('click', () => this.handleGoogleSignup());
        }

        document.getElementById('signupFormModal').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('switchToLogin').addEventListener('click', () => this.showLoginModal());
    }

    async handleGoogleSignup() {
        try {
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (error) {
            this.showNotification(error.message || 'Google signup failed', 'error');
        }
    }

    async handleGoogleSignin() {
        try {
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (error) {
            this.showNotification(error.message || 'Google signin failed', 'error');
        }
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

        <button class="btn btn-social" id="googleSigninBtn">
            <span>Continue with Google</span>
        </button>

        <p class="auth-footer">
            Don't have an account? 
            <button type="button" class="auth-link" id="switchToSignup">Sign Up</button>
        </p>
    `;

        modal.classList.add('show');

        const googleSigninBtn = document.getElementById('googleSigninBtn');
        if (googleSigninBtn) {
            googleSigninBtn.addEventListener('click', () => this.handleGoogleSignin());
        }

        document.getElementById('signinFormModal').addEventListener('submit', (e) => this.handleSignin(e));
        document.getElementById('switchToSignup').addEventListener('click', () => this.showSignupModal());
    }

    async handleSignup(e) {
        e.preventDefault();

        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('signupConfirm').value;

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

        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            if (!data.user) {
                throw new Error('Signup failed. Please try again.');
            }

            this.currentUser = {
                id: data.user.id,
                email: data.user.email,
                userType,
                createdAt: new Date(),
                avatar: null
            };

            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

            // Create profiles in Supabase
            await this.createUserProfile(userType);
            this.initializeUserData();
            await this.loadUserData();

            this.showNotification('Account created! Check your email to confirm.', 'success');
            this.closeModal(document.getElementById('authModal'));
            this.updateNavigation();

            if (userType === 'player') {
                setTimeout(() => window.location.href = 'profile.html', 1500);
            }
        } catch (error) {
            this.showNotification(error.message || 'Signup failed', 'error');
            console.error('Signup error:', error);
        }
    }

    async createUserProfile(userType) {
        if (!this.currentUser) return;

        try {
            const { error: userError } = await supabaseClient
                .from('user_profiles')
                .upsert({
                    id: this.currentUser.id,
                    email: this.currentUser.email,
                    user_type: userType,
                    avatar_url: this.currentUser.avatar
                }, { onConflict: 'id' });

            if (userError) throw userError;

            if (userType === 'player') {
                const { error: playerError } = await supabaseClient
                    .from('player_profiles')
                    .insert({
                        id: this.currentUser.id
                    });

                if (playerError && playerError.code !== '23505') throw playerError;
            }

            if (userType === 'coach') {
                const { error: coachError } = await supabaseClient
                    .from('coach_profiles')
                    .insert({
                        id: this.currentUser.id
                    });

                if (coachError && coachError.code !== '23505') throw coachError;
            }
        } catch (error) {
            console.error('Create profile error:', error);
        }
    }

    async handleSignin(e) {
        e.preventDefault();

        const email = document.getElementById('signinEmail').value;
        const password = document.getElementById('signinPassword').value;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            this.currentUser = {
                id: data.user.id,
                email: data.user.email,
                userType: 'player',
                createdAt: new Date(),
                avatar: null
            };

            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
            await this.loadUserData();

            this.showNotification('Signed in successfully!', 'success');
            this.closeModal(document.getElementById('authModal'));
            this.updateNavigation();
        } catch (error) {
            this.showNotification(error.message, 'error');
        }
    }

    updateNavigation() {
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');
        const navMenu = document.getElementById('navMenu');

        if (!navMenu) return;

        if (this.currentUser) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (signupBtn) signupBtn.style.display = 'none';

            const oldBanner = document.getElementById('navProfileBanner');
            const oldLogout = document.getElementById('logoutBtn');
            if (oldBanner) oldBanner.remove();
            if (oldLogout) oldLogout.remove();

            const profileBanner = document.createElement('button');
            profileBanner.id = 'navProfileBanner';
            profileBanner.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                background: linear-gradient(135deg, #2a2d33 0%, #1e2025 100%);
                border: 1px solid #404450;
                padding: 6px 14px;
                border-radius: 30px;
                cursor: pointer;
                color: #f0f0f0;
                font-weight: 600;
                transition: all 0.2s ease;
            `;
            profileBanner.addEventListener('mouseover', () => profileBanner.style.borderColor = 'var(--primary-orange)');
            profileBanner.addEventListener('mouseout', () => profileBanner.style.borderColor = '#404450');
            profileBanner.addEventListener('click', () => window.location.href = 'dashboard.html');

            if (this.currentUser.avatar) {
                profileBanner.innerHTML = `
                    <img src="${this.currentUser.avatar}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--primary-orange);" alt="Profile">
                    <span style="font-size: 0.9rem;">Dashboard</span>
                `;
            } else {
                profileBanner.innerHTML = `
                    <span style="font-size: 1.2rem; line-height: 1;">🏀</span>
                    <span style="font-size: 0.9rem;">Dashboard</span>
                `;
            }

            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.className = 'nav-btn nav-btn-signup';
            logoutBtn.textContent = `Log Out`;
            logoutBtn.addEventListener('click', () => this.handleLogout());

            navMenu.appendChild(profileBanner);
            navMenu.appendChild(logoutBtn);
        } else {
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (signupBtn) signupBtn.style.display = 'inline-block';

            const oldBanner = document.getElementById('navProfileBanner');
            const oldLogout = document.getElementById('logoutBtn');
            if (oldBanner) oldBanner.remove();
            if (oldLogout) oldLogout.remove();
        }
    }

    updateNavBarAvatar(newAvatarUrl) {
        const navProfileBanner = document.getElementById('navProfileBanner');
        if (navProfileBanner) {
            navProfileBanner.innerHTML = `
                <img src="${newAvatarUrl}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--primary-orange);" alt="Profile">
                <span style="font-size: 0.9rem;">Dashboard</span>
            `;
        }
    }

    async handleLogout() {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.error("Logout error:", e);
        }

        this.currentUser = null;
        localStorage.removeItem('hoopportal_user');
        this.userLikedPlayers = [];

        this.showNotification('Logged out successfully', 'success');
        this.updateNavigation();
        window.location.href = 'index.html';
    }

    // ============================================
    // USER DATA MANAGEMENT
    // ============================================
    initializeUserData() {
        if (!this.currentUser) return;

        const userKey = `hoopportal_user_${this.currentUser.id}`;
        const userData = {
            likedPlayers: [],
            stats: {}
        };
        localStorage.setItem(userKey, JSON.stringify(userData));
    }

    async loadUserData() {
        if (!document.getElementById('firstName')) {
            return;
        }
        if (!this.currentUser) return;

        try {
            // LOAD PLAYER PROFILE
            const { data: profileData, error: profileError } = await supabaseClient
                .from('player_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .maybeSingle();

            if (profileError) throw profileError;

            console.log('PROFILE DATA:', profileData);

            if (profileData) {
                document.getElementById('position').value = profileData.position || '';
                document.getElementById('height').value = profileData.height || '';
                document.getElementById('weight').value = profileData.weight || '';
                document.getElementById('classYear').value = profileData.class_year || '';
                document.getElementById('school').value = profileData.school || '';
                document.getElementById('transferSchool').value = profileData.transfer_school || '';
                document.getElementById('city').value = profileData.city || '';
                document.getElementById('state').value = profileData.state || '';

                // Store on app instance for dashboard access
                this.position = profileData.position || '';
                this.height = profileData.height || '';
                this.weight = profileData.weight || '';
                this.classYear = profileData.class_year || '';
                this.school = profileData.school || '';
                this.transferSchool = profileData.transfer_school || '';
                this.city = profileData.city || '';
                this.state = profileData.state || '';

                const gameDesc = document.getElementById('gameDescription');
                if (gameDesc) {
                    gameDesc.value = profileData.game_description || '';
                }

                const coachType = document.getElementById('coachType');
                if (coachType) {
                    coachType.value = profileData.coach_preferences || '';
                }
            }

            // LOAD PLAYER STATS
            const { data: statsData, error: statsError } = await supabaseClient
                .from('player_stats')
                .select('*')
                .eq('player_id', this.currentUser.id)
                .maybeSingle();

            if (statsError) throw statsError;

            console.log('STATS DATA:', statsData);

            if (statsData) {
                this.playerStats = {
                    ppg: statsData.ppg,
                    apg: statsData.apg,
                    rpg: statsData.rpg,
                    fg: statsData.fg_percent,
                    '3p': statsData.three_p_percent,
                    spg: statsData.spg,
                    bpg: statsData.bpg,
                    ft: statsData.ft_percent,
                    tov: statsData.tov
                };

                this.displayProfileStats();
            }

            this.updateQuickProfile();

        } catch (err) {
            console.error('LOAD USER DATA ERROR:', err);
        }
    }

    async loadStatsFromSupabase() {
        if (!this.currentUser) return;

        try {
            const { data, error } = await supabaseClient
                .from('player_stats')
                .select('*')
                .eq('player_id', this.currentUser.id)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (data) {
                this.playerStats = {
                    ppg: data.ppg,
                    apg: data.apg,
                    rpg: data.rpg,
                    fg: data.fg_percent,
                    '3p': data.three_p_percent,
                    spg: data.spg,
                    bpg: data.bpg,
                    ft: data.ft_percent,
                    tov: data.tov
                };

                const userKey = `hoopportal_user_${this.currentUser.id}`;
                const userData = JSON.parse(localStorage.getItem(userKey) || '{"likedPlayers":[],"stats":{}}');
                userData.stats = this.playerStats;
                localStorage.setItem(userKey, JSON.stringify(userData));
            }
        } catch (error) {
            console.error('Load stats error:', error);
        }
    }

    saveUserData() {
        if (!this.currentUser) return;

        const userKey = `hoopportal_user_${this.currentUser.id}`;
        const userData = {
            likedPlayers: this.userLikedPlayers,
            stats: this.playerStats
        };
        localStorage.setItem(userKey, JSON.stringify(userData));
    }

    // ============================================
    // PROFILE STATS & PICTURE
    // ============================================
    loadProfileStats() {
        if (this.currentUser) {
            this.playerStats = this.playerStats || {};
        } else {
            const stats = localStorage.getItem('hoopportal_player_stats');
            if (stats) {
                this.playerStats = JSON.parse(stats);
            }
        }
        this.displayProfileStats();
    }

    displayProfileStats() {
        if (document.getElementById('statPPG')) {
            document.getElementById('statPPG').textContent = this.playerStats.ppg || '—';
            document.getElementById('statAPG').textContent = this.playerStats.apg || '—';
            document.getElementById('statRPG').textContent = this.playerStats.rpg || '—';
            document.getElementById('statFG').textContent = this.playerStats.fg ? this.playerStats.fg + '%' : '—';

            document.getElementById('inputPPG').value = this.playerStats.ppg || '';
            document.getElementById('inputAPG').value = this.playerStats.apg || '';
            document.getElementById('inputRPG').value = this.playerStats.rpg || '';
            document.getElementById('inputFG').value = this.playerStats.fg || '';
        }

        if (document.getElementById('stat3P')) {
            document.getElementById('stat3P').textContent = this.playerStats['3p'] ? this.playerStats['3p'] + '%' : '—';
            document.getElementById('input3P').value = this.playerStats['3p'] || '';
        }
        if (document.getElementById('statSPG')) {
            document.getElementById('statSPG').textContent = this.playerStats.spg || '—';
            document.getElementById('inputSPG').value = this.playerStats.spg || '';
        }
        if (document.getElementById('statBPG')) {
            document.getElementById('statBPG').textContent = this.playerStats.bpg || '—';
            document.getElementById('inputBPG').value = this.playerStats.bpg || '';
        }
        if (document.getElementById('statFT')) {
            document.getElementById('statFT').textContent = this.playerStats.ft ? this.playerStats.ft + '%' : '—';
            document.getElementById('inputFT').value = this.playerStats.ft || '';
        }

        if (document.getElementById('statTOV')) {
            document.getElementById('statTOV').textContent = this.playerStats.tov || '—';
            document.getElementById('inputTOV').value = this.playerStats.tov || '';
        }

        const pfpImg = document.getElementById('profilePicture');
        if (pfpImg && this.currentUser?.avatar_url) {
            pfpImg.innerHTML = `<img src="${this.currentUser.avatar_url}" alt="Profile Picture" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        }
    }

    updateProfileStats() {
        const ppg = document.getElementById('inputPPG').value;
        const apg = document.getElementById('inputAPG').value;
        const rpg = document.getElementById('inputRPG').value;
        const fg = document.getElementById('inputFG').value;

        const updatedStats = {
            ppg: ppg ? parseFloat(ppg).toFixed(1) : null,
            apg: apg ? parseFloat(apg).toFixed(1) : null,
            rpg: rpg ? parseFloat(rpg).toFixed(1) : null,
            fg: fg ? parseFloat(fg).toFixed(1) : null
        };

        const threeP = document.getElementById('input3P')?.value;
        const spg = document.getElementById('inputSPG')?.value;
        const bpg = document.getElementById('inputBPG')?.value;
        const ft = document.getElementById('inputFT')?.value;
        const tov = document.getElementById('inputTOV')?.value;

        if (threeP !== undefined && threeP !== '') updatedStats['3p'] = parseFloat(threeP).toFixed(1);
        if (spg !== undefined && spg !== '') updatedStats.spg = parseFloat(spg).toFixed(1);
        if (bpg !== undefined && bpg !== '') updatedStats.bpg = parseFloat(bpg).toFixed(1);
        if (ft !== undefined && ft !== '') updatedStats.ft = parseFloat(ft).toFixed(1);
        if (tov !== undefined && tov !== '') updatedStats.tov = parseFloat(tov).toFixed(1);

        this.playerStats = updatedStats;

        if (this.currentUser) {
            const userKey = `hoopportal_user_${this.currentUser.id}`;
            const userData = JSON.parse(localStorage.getItem(userKey) || '{"likedPlayers":[],"stats":{}}');
            userData.stats = this.playerStats;
            localStorage.setItem(userKey, JSON.stringify(userData));

            this.saveStatsToSupabase();
        } else {
            localStorage.setItem('hoopportal_player_stats', JSON.stringify(this.playerStats));
        }

        this.displayProfileStats();
        this.showNotification('Player stats updated!', 'success');
    }

    async saveStatsToSupabase() {
        if (!this.currentUser) return;

        try {
            const { error } = await supabaseClient
                .from('player_stats')
                .upsert({
                    player_id: this.currentUser.id,
                    ppg: this.playerStats.ppg,
                    apg: this.playerStats.apg,
                    rpg: this.playerStats.rpg,
                    fg_percent: this.playerStats.fg,
                    three_p_percent: this.playerStats['3p'],
                    spg: this.playerStats.spg,
                    bpg: this.playerStats.bpg,
                    ft_percent: this.playerStats.ft,
                    tov: this.playerStats.tov
                }, { onConflict: 'player_id' });

            if (error) throw error;
        } catch (error) {
            console.error('Save stats error:', error);
        }
    }

    async loadPlayerProfile() {
        if (!document.getElementById('firstName')) {
            return;
        }
        if (!this.currentUser) return;

        try {
            // LOAD USER PROFILE
            const { data: userProfile, error: userError } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .maybeSingle();

            if (userError) throw userError;

            if (userProfile) {
                this.currentUser.first_name = userProfile.first_name;
                this.currentUser.last_name = userProfile.last_name;
                document.getElementById('firstName').value = userProfile.first_name || '';
                document.getElementById('lastName').value = userProfile.last_name || '';
            }

            // LOAD PLAYER PROFILE
            const { data: playerProfile, error: profileError } = await supabaseClient
                .from('player_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .maybeSingle();

            if (profileError) throw profileError;

            if (playerProfile) {
                this.school = playerProfile.school;
                this.transferSchool = playerProfile.transfer_school;
                this.position = playerProfile.position;
                this.height = playerProfile.height;
                this.weight = playerProfile.weight;
                this.classYear = playerProfile.class_year;
                this.city = playerProfile.city;
                this.state = playerProfile.state;
                if (playerProfile.profile_picture_url) {
                    const pfpContainer = document.getElementById('profilePicture');
                    if (pfpContainer) {
                        pfpContainer.innerHTML = `<img src="${playerProfile.profile_picture_url}" alt="Profile Picture" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                    }
                }

                document.getElementById('position').value = playerProfile.position || '';
                document.getElementById('height').value = playerProfile.height || '';
                document.getElementById('weight').value = playerProfile.weight || '';
                document.getElementById('classYear').value = playerProfile.class_year || '';
                document.getElementById('school').value = playerProfile.school || '';
                document.getElementById('transferSchool').value = playerProfile.transfer_school || '';
                document.getElementById('city').value = playerProfile.city || '';
                document.getElementById('state').value = playerProfile.state || '';
                document.getElementById('gameDescription').value = playerProfile.game_description || '';
                document.getElementById('coachType').value = playerProfile.coach_preferences || '';
            }

            // LOAD PLAYER CONTACT
            const { data: contactData, error: contactError } = await supabaseClient
                .from('player_contact')
                .select('*')
                .eq('player_id', this.currentUser.id)
                .maybeSingle();

            if (contactError) throw contactError;

            if (contactData) {
                document.getElementById('playerEmail').value = contactData.player_email || '';
                document.getElementById('playerPhone').value = contactData.player_phone || '';
            }

            // LOAD PARENTS / GUARDIANS
            const { data: guardians, error: guardianError } = await supabaseClient
                .from('parent_guardians')
                .select('*')
                .eq('player_id', this.currentUser.id);

            if (guardianError) throw guardianError;

            if (guardians && guardians.length > 0) {
                const parent1 = guardians.find(g => g.parent_number === 1);
                const parent2 = guardians.find(g => g.parent_number === 2);

                if (parent1) {
                    document.getElementById('parentName').value = parent1.name || '';
                    document.getElementById('parentEmail').value = parent1.email || '';
                    document.getElementById('parentPhone').value = parent1.phone || '';
                }

                if (parent2) {
                    document.getElementById('parentName2').value = parent2.name || '';
                    document.getElementById('parentEmail2').value = parent2.email || '';
                    document.getElementById('parentPhone2').value = parent2.phone || '';
                }
            }

            this.updateQuickProfile();
            await this.loadHighlightReels();

        } catch (err) {
            console.error('Load profile error:', err);
        }
    }

    async uploadProfilePicture() {
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${this.currentUser.id}-${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from('profile-pictures')
                    .upload(fileName, file, {
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabaseClient.storage
                    .from('profile-pictures')
                    .getPublicUrl(fileName);

                const { error: dbError } = await supabaseClient
                    .from('player_profiles')
                    .update({
                        profile_picture_url: publicUrl
                    })
                    .eq('id', this.currentUser.id);

                if (dbError) throw dbError;

                const pfpContainer = document.getElementById('profilePicture');
                if (pfpContainer) {
                    pfpContainer.innerHTML = `<img src="${publicUrl}" alt="Profile Picture" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                }

                // Update current user avatar
                this.currentUser.avatar = publicUrl;
                localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

                // UPDATE NAVBAR AVATAR
                this.updateNavBarAvatar(publicUrl);

                this.showNotification('Profile picture updated!', 'success');

            } catch (err) {
                console.error(err);
                this.showNotification(err.message || 'Upload failed', 'error');
            }
        };

        fileInput.click();
    }

    // ============================================
    // LOAD REAL PLAYERS FROM SUPABASE
    // ============================================
    async loadSearchPlayers() {
        try {
            // Load player profiles
            const { data: playerData, error: playerError } = await supabaseClient
                .from('player_profiles')
                .select('*');

            if (playerError) throw playerError;

            // Load user profiles to get names and avatars
            const { data: userData, error: userError } = await supabaseClient
                .from('user_profiles')
                .select('id, first_name, last_name, avatar_url, gender');

            if (userError) throw userError;

            // Create a map for quick lookup
            const userMap = {};
            userData.forEach(user => {
                userMap[user.id] = {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    avatar: user.avatar_url,
                    gender: user.gender
                };
            });

            // Combine data
            this.realPlayers = playerData.map(player => {
                const userInfo = userMap[player.id] || {};
                const fullName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim();

                return {
                    id: player.id,
                    name: fullName || 'Unnamed Player',
                    avatar: player.profile_picture_url || userInfo.avatar || null,
                    emoji: '🏀',
                    gender: userInfo.gender || 'boys',
                    position: player.position,
                    height: player.height,
                    weight: player.weight,
                    school: player.school,
                    city: player.city,
                    state: player.state,
                    classYear: player.class_year,
                    premium: player.is_premium,
                    likes: 0,
                    liked: false,
                    description: player.game_description || '',
                    coachType: player.coach_preferences || '',
                    realProfile: true
                };
            });

            console.log('REAL PLAYERS:', this.realPlayers);

        } catch (err) {
            console.error('Load search players error:', err);
        }
    }

    updateQuickProfile() {
        const position = document.getElementById('position')?.value;
        const height = document.getElementById('height')?.value;
        const weight = document.getElementById('weight')?.value;
        const classYear = document.getElementById('classYear')?.value;
        const city = document.getElementById('city')?.value;
        const state = document.getElementById('state')?.value;
        const school = document.getElementById('school')?.value;
        const transferSchool = document.getElementById('transferSchool')?.value;
        const firstName = document.getElementById('firstName')?.value;
        const lastName = document.getElementById('lastName')?.value;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('positionDisplay', position || 'Not set');
        setText('heightDisplay', height || 'Not set');
        setText('weightDisplay', weight ? `${weight} lbs` : 'Not set');
        setText('classDisplay', classYear || 'Not set');

        setText('cityDisplay', city || 'Not set');
        setText('stateDisplay', state || 'Not set');

        setText('schoolDisplay', school || 'Not set');
        setText('transferSchoolDisplay', transferSchool || '--');

        const fullName = `${firstName || ''} ${lastName || ''}`.trim();
        setText('nameDisplay', fullName || 'Not set');

        if (this.playerStats) {
            setText('ppgDisplay', this.playerStats.ppg || '--');
            setText('apgDisplay', this.playerStats.apg || '--');
        }
    }

    async loadGoogleProfilePicture() {
        try {
            const { data: { user }, error } = await supabaseClient.auth.getUser();

            if (error) throw error;

            if (user && user.user_metadata) {
                const googlePfpUrl = user.user_metadata.avatar_url || user.user_metadata.picture;

                this.currentUser.avatar = googlePfpUrl;
                this.currentUser.avatar_url = googlePfpUrl;

                localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

                await supabaseClient
                    .from('user_profiles')
                    .upsert({
                        id: this.currentUser.id,
                        avatar_url: googlePfpUrl
                    });

                const pfpContainer = document.getElementById('profilePicture');
                const placeholder = document.getElementById('pfpPlaceholder');

                if (googlePfpUrl && pfpContainer) {
                    if (placeholder) placeholder.style.display = 'none';

                    pfpContainer.innerHTML = `<img src="${googlePfpUrl}" alt="Profile Picture" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }

                // UPDATE NAVBAR AVATAR
                this.updateNavBarAvatar(googlePfpUrl);
            }
        } catch (err) {
            console.error("Error fetching user metadata:", err.message);
        }
    }

    // ============================================
    // PROFILE FORMS
    // ============================================
    async handleBasicInfo(e) {
        e.preventDefault();

        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const gender = document.getElementById('gender')?.value;

        try {
            // SAVE user_profiles
            const { error: userError } = await supabaseClient
                .from('user_profiles')
                .upsert({
                    id: this.currentUser.id,
                    first_name: document.getElementById('firstName').value,
                    last_name: document.getElementById('lastName').value,
                    gender: gender,
                    updated_at: new Date()
                }, { onConflict: 'id' });

            if (userError) throw userError;

            // SAVE player_profiles
            const { error: profileError } = await supabaseClient
                .from('player_profiles')
                .upsert({
                    id: this.currentUser.id,
                    position: document.getElementById('position').value,
                    height: document.getElementById('height').value,
                    weight: parseInt(document.getElementById('weight').value) || null,
                    class_year: parseInt(document.getElementById('classYear').value) || null,
                    school: document.getElementById('school').value,
                    transfer_school: document.getElementById('transferSchool').value,
                    city: document.getElementById('city').value,
                    state: document.getElementById('state').value,
                    updated_at: new Date()
                }, { onConflict: 'id' });

            if (profileError) throw profileError;

            // Update app instance properties for dashboard
            this.position = document.getElementById('position').value;
            this.height = document.getElementById('height').value;
            this.weight = document.getElementById('weight').value;
            this.classYear = document.getElementById('classYear').value;
            this.school = document.getElementById('school').value;
            this.transferSchool = document.getElementById('transferSchool').value;
            this.city = document.getElementById('city').value;
            this.state = document.getElementById('state').value;

            this.updateQuickProfile();
            this.showNotification('Basic information saved!', 'success');

        } catch (error) {
            console.error(error);
            this.showNotification(error.message || 'Failed to save', 'error');
        }
    }

    async handleGameDescription(e) {
        e.preventDefault();
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('player_profiles')
                .update({
                    game_description: document.getElementById('gameDescription').value,
                    coach_preferences: document.getElementById('coachType').value
                })
                .eq('id', this.currentUser.id);

            if (error) throw error;

            this.showNotification('Game description saved!', 'success');
        } catch (error) {
            this.showNotification(error.message || 'Failed to save', 'error');
        }
    }

    async handleContactInfo(e) {
        e.preventDefault();
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        try {
            // Save player contact
            const { error: contactError } = await supabaseClient
                .from('player_contact')
                .upsert({
                    player_id: this.currentUser.id,
                    player_email: document.getElementById('playerEmail').value,
                    player_phone: document.getElementById('playerPhone').value
                }, { onConflict: 'player_id' });

            if (contactError) throw contactError;

            // Save parent 1
            const { error: parent1Error } = await supabaseClient
                .from('parent_guardians')
                .upsert({
                    player_id: this.currentUser.id,
                    parent_number: 1,
                    name: document.getElementById('parentName').value,
                    email: document.getElementById('parentEmail').value || null,
                    phone: document.getElementById('parentPhone').value || null
                }, { onConflict: 'player_id,parent_number' });

            if (parent1Error) throw parent1Error;

            // Save parent 2 (optional)
            const parent2Name = document.getElementById('parentName2').value;
            if (parent2Name) {
                const { error: parent2Error } = await supabaseClient
                    .from('parent_guardians')
                    .upsert({
                        player_id: this.currentUser.id,
                        parent_number: 2,
                        name: parent2Name,
                        email: document.getElementById('parentEmail2').value || null,
                        phone: document.getElementById('parentPhone2').value || null
                    }, { onConflict: 'player_id,parent_number' });

                if (parent2Error) throw parent2Error;
            }

            this.showNotification('Contact information saved!', 'success');
        } catch (error) {
            this.showNotification(error.message || 'Failed to save', 'error');
        }
    }

    // ============================================
    // GENERATE MOCK PLAYERS (25 players)
    // ============================================
    generateMockPlayers() {
        const ncPlayers = [
            { name: 'Marcus Johnson', position: 'PG', height: "6'1\"", weight: 185, school: 'Lincoln High', city: 'Charlotte', state: 'NC', classYear: 2027, ppg: 18.5, apg: 7.2, rpg: 3.1 },
            { name: 'DeAndre Williams', position: 'SG', height: "6'3\"", weight: 195, school: 'West Charlotte High', city: 'Charlotte', state: 'NC', classYear: 2026, ppg: 22.1, apg: 5.3, rpg: 4.2 },
            { name: 'Malik Davis', position: 'SF', height: "6'6\"", weight: 215, school: 'Riverside High', city: 'Durham', state: 'NC', classYear: 2027, ppg: 19.4, apg: 4.1, rpg: 7.3 },
            { name: 'Jamal Robinson', position: 'PF', height: "6'8\"", weight: 240, school: 'Raleigh Central', city: 'Raleigh', state: 'NC', classYear: 2026, ppg: 17.8, apg: 2.5, rpg: 10.2 },
            { name: 'Tyrone Jackson', position: 'C', height: "6'10\"", weight: 260, school: 'Greensboro Academy', city: 'Greensboro', state: 'NC', classYear: 2027, ppg: 15.2, apg: 1.8, rpg: 12.5 },
            { name: 'Brandon Lee', position: 'PG', height: "6'0\"", weight: 175, school: 'Chapel Hill High', city: 'Chapel Hill', state: 'NC', classYear: 2028, ppg: 20.3, apg: 8.1, rpg: 2.9 },
            { name: 'Antonio Martinez', position: 'SG', height: "6'4\"", weight: 205, school: 'Winston-Salem Prep', city: 'Winston-Salem', state: 'NC', classYear: 2026, ppg: 24.7, apg: 6.2, rpg: 5.1 },
            { name: 'Isaiah Thompson', position: 'SF', height: "6'7\"", weight: 220, school: 'Wilmington High', city: 'Wilmington', state: 'NC', classYear: 2027, ppg: 18.9, apg: 3.7, rpg: 6.8 },
            { name: 'Jaylen Brown', position: 'PF', height: "6'9\"", weight: 235, school: 'Fayetteville Academy', city: 'Fayetteville', state: 'NC', classYear: 2026, ppg: 16.5, apg: 2.3, rpg: 9.4 },
            { name: 'Kevin Hart', position: 'C', height: "6'11\"", weight: 265, school: 'Asheville High', city: 'Asheville', state: 'NC', classYear: 2028, ppg: 14.2, apg: 1.9, rpg: 11.8 },
        ];

        const outOfStatePlayer = [
            { name: 'Zion Williams', position: 'PG', height: "6'2\"", weight: 190, school: 'Atlanta Prep', city: 'Atlanta', state: 'GA', classYear: 2027, ppg: 21.5, apg: 7.8, rpg: 3.5 },
            { name: 'LeBron Jones', position: 'SG', height: "6'5\"", weight: 210, school: 'Miami High', city: 'Miami', state: 'FL', classYear: 2026, ppg: 23.2, apg: 5.9, rpg: 4.8 },
            { name: 'Kobe Davis', position: 'SF', height: "6'7\"", weight: 225, school: 'Charleston Academy', city: 'Charleston', state: 'SC', classYear: 2027, ppg: 20.1, apg: 4.3, rpg: 7.1 },
            { name: 'Stephen Curry', position: 'PG', height: "6'1\"", weight: 180, school: 'Richmond High', city: 'Richmond', state: 'VA', classYear: 2026, ppg: 25.4, apg: 8.7, rpg: 3.2 },
            { name: 'Giannis Antetokounmpo', position: 'PF', height: "6'10\"", weight: 250, school: 'Nashville Academy', city: 'Nashville', state: 'TN', classYear: 2027, ppg: 18.9, apg: 2.7, rpg: 11.3 },
            { name: 'Donovan Mitchell', position: 'SG', height: "6'3\"", weight: 200, school: 'Columbia High', city: 'Columbia', state: 'SC', classYear: 2026, ppg: 22.8, apg: 6.1, rpg: 4.5 },
            { name: 'Damian Lillard', position: 'PG', height: "6'2\"", weight: 195, school: 'Birmingham Academy', city: 'Birmingham', state: 'AL', classYear: 2028, ppg: 19.6, apg: 7.4, rpg: 3.8 },
            { name: 'Kyrie Irving', position: 'PG', height: "6'0\"", weight: 175, school: 'New Orleans High', city: 'New Orleans', state: 'LA', classYear: 2027, ppg: 24.1, apg: 8.9, rpg: 2.9 },
            { name: 'Jayson Tatum', position: 'SF', height: "6'8\"", weight: 230, school: 'Memphis Prep', city: 'Memphis', state: 'TN', classYear: 2026, ppg: 21.5, apg: 3.9, rpg: 8.2 },
            { name: 'Luka Doncic', position: 'PF', height: "6'7\"", weight: 235, school: 'Phoenix Academy', city: 'Phoenix', state: 'AZ', classYear: 2027, ppg: 20.3, apg: 4.1, rpg: 9.1 },
            { name: 'Paolo Banchero', position: 'PF', height: "6'9\"", weight: 250, school: 'Dallas High', city: 'Dallas', state: 'TX', classYear: 2026, ppg: 17.4, apg: 2.6, rpg: 10.5 },
            { name: 'Victor Wembanyama', position: 'C', height: "7'0\"", weight: 260, school: 'Houston Academy', city: 'Houston', state: 'TX', classYear: 2028, ppg: 16.1, apg: 2.2, rpg: 12.8 },
            { name: 'Evan Bouchard', position: 'SG', height: "6'4\"", weight: 208, school: 'Denver Prep', city: 'Denver', state: 'CO', classYear: 2027, ppg: 23.5, apg: 5.8, rpg: 4.9 },
            { name: 'Tyler Herro', position: 'SG', height: "6'5\"", weight: 215, school: 'Milwaukee Academy', city: 'Milwaukee', state: 'WI', classYear: 2026, ppg: 21.9, apg: 6.3, rpg: 5.2 },
            { name: 'Devin Booker', position: 'SG', height: "6'6\"", weight: 220, school: 'Cleveland High', city: 'Cleveland', state: 'OH', classYear: 2027, ppg: 22.7, apg: 5.5, rpg: 5.8 },
        ];

        const allPlayers = [...ncPlayers, ...outOfStatePlayer];

        return allPlayers.map((p, idx) => ({
            id: idx + 1,
            name: p.name,
            gender: 'boys',
            position: p.position,
            height: p.height,
            weight: parseInt(p.weight),
            school: p.school,
            city: p.city,
            state: p.state,
            classYear: p.classYear,
            premium: idx % 4 === 0,
            emoji: '🏀',
            likes: Math.floor(Math.random() * 200) + 50,
            liked: false,
            description: `Talented ${p.position} with strong court vision and ball handling skills.`,
            coachType: 'Competitive program focused on development',
            ppg: p.ppg,
            apg: p.apg,
            rpg: p.rpg,
            fg: Math.round((Math.random() * 15 + 40) * 10) / 10,
            '3p': Math.round((Math.random() * 15 + 25) * 10) / 10,
            spg: Math.round((Math.random() * 2 + 1) * 10) / 10,
            bpg: Math.round((Math.random() * 2 + 0.5) * 10) / 10,
            ft: Math.round((Math.random() * 15 + 70) * 10) / 10
        }));
    }

    // ============================================
    // PROSPECTS
    // ============================================
    filterProspectsHome(gender, event) {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');

        // Combine mock + real players
        let filtered = gender === 'all'
            ? [...this.mockPlayers, ...this.realPlayers]
            : [...this.mockPlayers, ...this.realPlayers].filter(p => p.gender === gender);

        filtered = filtered.slice(0, 20);
        this.displayProspectsHome(filtered);
    }

    displayProspectsHome(prospects) {
        const container = document.getElementById('homeProspectsContainer');
        if (!container) return;

        if (prospects.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No players found</p>';
            return;
        }

        container.innerHTML = prospects.map(p => {
            const avatarContent = p.avatar
                ? `<img src="${p.avatar}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                : p.emoji;

            return `
                <div class="prospect-card-home ${p.premium ? 'premium' : ''}" onclick="app.showPlayerModal('${p.id}')">
                    <div class="prospect-avatar">${avatarContent}</div>
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
            `;
        }).join('');
    }

    performSearch() {
        const name = document.getElementById('filterPlayerName')?.value || '';
        const city = document.getElementById('filterCity')?.value || '';
        const state = document.getElementById('filterState')?.value || '';
        const position = document.getElementById('filterPosition')?.value || '';
        const classYear = document.getElementById('filterClassYear')?.value || '';
        const gender = document.getElementById('filterGender')?.value || '';

        const allPlayers = [...this.mockPlayers, ...this.realPlayers];

        let results = allPlayers.filter(p => {
            if (name && !p.name?.toLowerCase().includes(name.toLowerCase())) return false;
            if (city && !p.city?.toLowerCase().includes(city.toLowerCase())) return false;
            if (state && p.state !== state) return false;
            if (position && p.position !== position) return false;
            if (classYear && p.classYear != classYear) return false;
            if (gender && p.gender !== gender) return false;
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

        container.innerHTML = prospects.map(p => {
            const avatarContent = p.avatar
                ? `<img src="${p.avatar}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                : (p.emoji || '🏀');

            return `
                <div class="prospect-item ${p.premium ? 'premium' : ''}" onclick="app.showPlayerModal('${p.id}')">
                    <div class="prospect-item-avatar">
                        ${avatarContent}
                    </div>
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
            `;
        }).join('');
    }

    resetFilters() {
        if (document.getElementById('filterPlayerName')) document.getElementById('filterPlayerName').value = '';
        if (document.getElementById('filterCity')) document.getElementById('filterCity').value = '';
        if (document.getElementById('filterState')) document.getElementById('filterState').value = '';
        if (document.getElementById('filterPosition')) document.getElementById('filterPosition').value = '';
        if (document.getElementById('filterClassYear')) document.getElementById('filterClassYear').value = '';
        if (document.getElementById('filterGender')) document.getElementById('filterGender').value = '';
        const container = document.getElementById('searchProspectsContainer');
        if (container) container.innerHTML = '';
    }

   async showPlayerModal(playerId) {
    const allPlayers = [...this.mockPlayers, ...this.realPlayers];
    const player = allPlayers.find(p => String(p.id) === String(playerId));

    if (!player) return;

    let playerStats = { ppg: null, apg: null, rpg: null, fg: null, '3p': null, spg: null, bpg: null, ft: null, tov: null };
    let contactInfo = { playerEmail: null, playerPhone: null, parentName: null, parentEmail: null, parentPhone: null };
    let playerHighlightReels = [];

    if (player.realProfile) {
        try {
            // Load stats
            const { data: statsData } = await supabaseClient
                .from('player_stats')
                .select('*')
                .eq('player_id', playerId)
                .maybeSingle();
            if (statsData) {
                playerStats = {
                    ppg: statsData.ppg,
                    apg: statsData.apg,
                    rpg: statsData.rpg,
                    fg: statsData.fg_percent,
                    '3p': statsData.three_p_percent,
                    spg: statsData.spg,
                    bpg: statsData.bpg,
                    ft: statsData.ft_percent,
                    tov: statsData.tov
                };
            }

            // Load contact info
            const { data: contactData } = await supabaseClient
                .from('player_contact')
                .select('*')
                .eq('player_id', playerId)
                .maybeSingle();
            if (contactData) {
                contactInfo.playerEmail = contactData.player_email;
                contactInfo.playerPhone = contactData.player_phone;
            }

            // Load parent/guardian info
            const { data: guardians } = await supabaseClient
                .from('parent_guardians')
                .select('*')
                .eq('player_id', playerId);
            if (guardians && guardians.length > 0) {
                const parent1 = guardians.find(g => g.parent_number === 1);
                if (parent1) {
                    contactInfo.parentName = parent1.name;
                    contactInfo.parentEmail = parent1.email;
                    contactInfo.parentPhone = parent1.phone;
                }
            }

            // Load highlight reels
            const { data: reelsData } = await supabaseClient
                .from('highlight_reels')
                .select('*')
                .eq('player_id', playerId)
                .order('created_at', { ascending: true });
            if (reelsData) {
                playerHighlightReels = reelsData;
            }

        } catch (err) {
            console.error('Load player details error:', err);
        }
    }

    let profilePic = player.avatar || player.emoji || '🏀';
    const likeButtonStyle = player.liked ? 'background-color: var(--primary-orange); color: white;' : '';

    // Generate highlight reels HTML
    let highlightReelsHtml = '';
    if (playerHighlightReels.length > 0) {
        highlightReelsHtml = `
            <div style="background: linear-gradient(135deg, #2a2d33 0%, #242729 100%); border: 1px solid #404450; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
                <h3 style="font-size: 1.1rem; margin-bottom: 1.2rem; font-weight: 700;">🎥 Highlight Reels</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                    ${playerHighlightReels.map(reel => {
                        const embedUrl = this.getYouTubeEmbedUrl(reel.url);
                        const title = reel.title || 'Watch Highlight';
                        if (embedUrl) {
                            const videoId = embedUrl.match(/embed\/([^?]+)/)?.[1];
                            return `
                                <a href="${reel.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
                                    <div style="background: #1e2025; border-radius: 12px; overflow: hidden; transition: transform 0.2s;">
                                        <div style="position: relative; background: #000;">
                                            <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" 
                                                 style="width: 100%; height: 120px; object-fit: cover; opacity: 0.8;">
                                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                                        font-size: 32px; color: white; text-shadow: 2px 2px 4px black;">▶️</div>
                                        </div>
                                        <div style="padding: 0.75rem; text-align: center;">
                                            <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(title)}</div>
                                        </div>
                                    </div>
                                </a>
                            `;
                        } else {
                            return `
                                <a href="${reel.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
                                    <div style="background: #1e2025; border-radius: 12px; padding: 1rem; text-align: center;">
                                        <div style="font-size: 2rem;">🎬</div>
                                        <div style="font-weight: 600; color: var(--text-primary); margin-top: 0.5rem;">${this.escapeHtml(title)}</div>
                                    </div>
                                </a>
                            `;
                        }
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Generate contact info HTML (only show if authenticated user is viewing)
    let contactHtml = '';
    if (this.currentUser) {
        contactHtml = `
            <div style="background: linear-gradient(135deg, #2a2d33 0%, #242729 100%); border: 1px solid #404450; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
                <h3 style="font-size: 1.1rem; margin-bottom: 1.2rem; font-weight: 700;">📞 Contact Information</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    ${contactInfo.playerEmail ? `
                        <div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Player Email</div>
                            <div style="font-weight: 600;">${contactInfo.playerEmail}</div>
                        </div>
                    ` : ''}
                    ${contactInfo.playerPhone ? `
                        <div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Player Phone</div>
                            <div style="font-weight: 600;">${contactInfo.playerPhone}</div>
                        </div>
                    ` : ''}
                    ${contactInfo.parentName ? `
                        <div style="grid-column: span 2; margin-top: 0.5rem;">
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Parent/Guardian</div>
                            <div style="font-weight: 600;">${this.escapeHtml(contactInfo.parentName)}</div>
                            ${contactInfo.parentEmail ? `<div style="font-size: 0.85rem;">${contactInfo.parentEmail}</div>` : ''}
                            ${contactInfo.parentPhone ? `<div style="font-size: 0.85rem;">${contactInfo.parentPhone}</div>` : ''}
                        </div>
                    ` : ''}
                </div>
                ${!contactInfo.playerEmail && !contactInfo.playerPhone && !contactInfo.parentName ? '<div style="color: var(--text-muted); text-align: center;">No contact information provided</div>' : ''}
            </div>
        `;
    }

    const modalBody = document.getElementById('playerModalBody');
    modalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
            <div>
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    ${profilePic.startsWith('http') ? `<img src="${profilePic}" alt="${player.name}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 1rem; border: 3px solid var(--primary-orange);">` : `<div style="font-size: 3rem; margin-bottom: 1rem;">${profilePic}</div>`}
                    <h2 style="margin-bottom: 0.25rem;">${player.name}</h2>
                    ${player.premium ? '<p style="color: var(--primary-orange); font-weight: 700; margin-bottom: 0.5rem;">⭐ PREMIUM PLAYER</p>' : ''}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">Position</p><p style="font-weight: 700;">${player.position || '—'}</p></div>
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">Height</p><p style="font-weight: 700;">${player.height || '—'}</p></div>
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">Weight</p><p style="font-weight: 700;">${player.weight || '—'} lbs</p></div>
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">Class Year</p><p style="font-weight: 700;">${player.classYear || '—'}</p></div>
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">School</p><p style="font-weight: 700;">${player.school || '—'}</p></div>
                    <div><p style="color: var(--text-muted); font-size: 0.8rem;">Location</p><p style="font-weight: 700;">${player.city || '—'}, ${player.state || ''}</p></div>
                </div>

                ${contactHtml}

                <div style="background-color: var(--secondary-dark); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
                    <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.5rem;">🏀 Game Style</p>
                    <p style="font-weight: 600; margin-bottom: 1rem;">${player.description || 'No description yet'}</p>
                    <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.5rem;">🎯 Looking For</p>
                    <p style="font-weight: 600;">${player.coachType || '—'}</p>
                </div>

                <div style="background: linear-gradient(135deg, #2a2d33 0%, #242729 100%); border: 1px solid #404450; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1rem; margin-bottom: 1rem; font-weight: 700;">📊 Season Stats</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.75rem;">
                        ${[{ label: 'PPG', value: playerStats.ppg }, { label: 'APG', value: playerStats.apg }, { label: 'RPG', value: playerStats.rpg }, { label: 'FG%', value: playerStats.fg }, { label: '3P%', value: playerStats['3p'] }, { label: 'SPG', value: playerStats.spg }, { label: 'BPG', value: playerStats.bpg }, { label: 'FT%', value: playerStats.ft }, { label: 'TOV', value: playerStats.tov }].map(stat => `
                            <div style="background: #1e2025; border-radius: 8px; padding: 0.75rem; text-align: center;">
                                <div style="font-size: 0.7rem; color: #a0a8b8;">${stat.label}</div>
                                <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary-orange);">${stat.value ?? '—'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${highlightReelsHtml}

                <button class="btn btn-primary btn-block" onclick="app.likePlayer('${playerId}')" id="likeBtn" style="${likeButtonStyle}; padding: 0.75rem;">
                    ${player.liked ? `❤️ Liked (${player.likes})` : `🤍 Like (${player.likes})`}
                </button>
            </div>
        </div>
    `;

    document.getElementById('playerModal').classList.add('show');
}

    async likePlayer(playerId) {
        const player = this.mockPlayers.find(p => String(p.id) === String(playerId)) ||
            this.realPlayers.find(p => String(p.id) === String(playerId));

        if (!player) return;

        if (String(playerId) === String(this.currentUser?.id)) {
            this.showNotification("You can't like your own profile", 'error');
            return;
        }

        if (player.liked) {
            player.liked = false;
            player.likes = Math.max(0, (player.likes || 0) - 1);
        } else {
            player.liked = true;
            player.likes = (player.likes || 0) + 1;
        }

        if (this.currentUser) {
            if (player.liked) {
                if (!this.userLikedPlayers.includes(playerId)) {
                    this.userLikedPlayers.push(playerId);
                }
            } else {
                const index = this.userLikedPlayers.indexOf(playerId);
                if (index > -1) {
                    this.userLikedPlayers.splice(index, 1);
                }
            }
            this.saveUserData();

            if (player.realProfile) {
                await this.saveLikedToSupabase(playerId, player.liked);
            }
        } else {
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
        }

        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn) {
            if (player.liked) {
                likeBtn.style.backgroundColor = 'var(--primary-orange)';
                likeBtn.style.color = 'white';
                likeBtn.textContent = `❤️ Liked (${player.likes})`;
            } else {
                likeBtn.style.backgroundColor = '';
                likeBtn.style.color = '';
                likeBtn.textContent = `🤍 Like (${player.likes})`;
            }
        }

        this.showNotification(player.liked ? 'Player liked!' : 'Like removed', 'success');
    }

    async saveLikedToSupabase(playerId, isLiked) {
        if (!this.currentUser) return;

        try {
            if (isLiked) {
                await supabaseClient
                    .from('liked_players')
                    .insert({
                        user_id: this.currentUser.id,
                        player_id: playerId
                    });
            } else {
                await supabaseClient
                    .from('liked_players')
                    .delete()
                    .eq('user_id', this.currentUser.id)
                    .eq('player_id', playerId);
            }
        } catch (error) {
            console.error('Save liked error:', error);
        }
    }

    addHighlightField() {
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const maxClips = this.currentUser.subscription === 'premium' ? 5 : 3;
        const currentCount = this.highlightReels?.length || 0;
        const unsavedCount = document.querySelectorAll('.highlight-item:not(.saved-highlight)').length;

        if (currentCount + unsavedCount >= maxClips) {
            this.showNotification(`You can only add up to ${maxClips} highlight reels with your plan`, 'error');
            return;
        }

        const optionsPanel = document.createElement('div');
        optionsPanel.className = 'highlight-options-panel';
        optionsPanel.innerHTML = `
        <div class="highlight-options">
            <div class="highlight-option" data-type="camera">
                <div class="option-icon">📱</div>
                <div class="option-label">Camera / Gallery</div>
                <div class="option-desc">Upload from your device</div>
            </div>
            <div class="highlight-option" data-type="link">
                <div class="option-icon">🔗</div>
                <div class="option-label">Video Link</div>
                <div class="option-desc">YouTube or Vimeo URL</div>
            </div>
        </div>
        <button type="button" class="btn btn-secondary cancel-options">Cancel</button>
    `;

        const container = document.getElementById('highlightsContainer');
        container.appendChild(optionsPanel);

        optionsPanel.querySelectorAll('.highlight-option').forEach(option => {
            option.addEventListener('click', async () => {
                const type = option.dataset.type;
                optionsPanel.remove();
                if (type === 'camera') {
                    this.showFileUploadOption();
                } else if (type === 'link') {
                    this.showLinkInputOption();
                }
            });
        });

        optionsPanel.querySelector('.cancel-options').addEventListener('click', () => {
            optionsPanel.remove();
        });
    }

    getYouTubeEmbedUrl(url) {
        if (!url) return null;

        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
            /youtube\.com\/embed\/([^&\n?#]+)/,
            /youtube\.com\/shorts\/([^&\n?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                const videoId = match[1].split('?')[0].split('&')[0];
                return `https://www.youtube.com/embed/${videoId}`;
            }
        }

        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }

        return null;
    }

    showFileUploadOption() {
        const maxClips = this.currentUser.subscription === 'premium' ? 5 : 3;
        const currentCount = this.highlightReels?.length || 0;
        const unsavedCount = document.querySelectorAll('.highlight-item:not(.saved-highlight)').length;

        if (currentCount + unsavedCount >= maxClips) {
            this.showNotification(`You can only add up to ${maxClips} highlight reels with your plan`, 'error');
            return;
        }

        const uploadDiv = document.createElement('div');
        uploadDiv.className = 'highlight-item highlight-upload';
        uploadDiv.innerHTML = `
        <div class="file-upload-area" style="border: 2px dashed var(--border-color); border-radius: 12px; padding: 2rem; text-align: center; cursor: pointer;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎥</div>
            <div style="margin-bottom: 0.5rem; font-weight: 600;">Click to upload video</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">MP4, MOV, or WebM (Max 50MB)</div>
        </div>
        <input type="file" accept="video/mp4,video/quicktime,video/webm" style="display: none;">
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-small cancel-upload">Cancel</button>
        </div>
    `;

        const container = document.getElementById('highlightsContainer');
        container.appendChild(uploadDiv);

        const fileInput = uploadDiv.querySelector('input[type="file"]');
        const uploadArea = uploadDiv.querySelector('.file-upload-area');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary-orange)';
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--border-color)';
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--border-color)';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) {
                this.uploadVideoFile(file, uploadDiv);
            } else {
                this.showNotification('Please drop a valid video file', 'error');
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) this.uploadVideoFile(e.target.files[0], uploadDiv);
        });
        uploadDiv.querySelector('.cancel-upload').addEventListener('click', () => uploadDiv.remove());
    }

    showLinkInputOption() {
        const maxClips = this.currentUser.subscription === 'premium' ? 5 : 3;
        const currentCount = this.highlightReels?.length || 0;
        const unsavedCount = document.querySelectorAll('.highlight-item:not(.saved-highlight)').length;

        if (currentCount + unsavedCount >= maxClips) {
            this.showNotification(`You can only add up to ${maxClips} highlight reels with your plan`, 'error');
            return;
        }

        const linkDiv = document.createElement('div');
        linkDiv.className = 'highlight-item';
        linkDiv.innerHTML = `
        <input type="url" placeholder="Paste YouTube or Vimeo link..." class="highlight-url">
        <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button type="button" class="btn btn-primary btn-small save-new-highlight">Save Reel</button>
            <button type="button" class="btn btn-secondary btn-small cancel-link">Cancel</button>
        </div>
    `;

        const container = document.getElementById('highlightsContainer');
        container.appendChild(linkDiv);

        linkDiv.querySelector('.save-new-highlight').addEventListener('click', async () => {
            const urlInput = linkDiv.querySelector('.highlight-url');
            if (!urlInput.value.trim()) {
                this.showNotification('Please enter a URL', 'error');
                return;
            }
            await this.addHighlightReelFromUrl(urlInput.value.trim());
            linkDiv.remove();
        });
        linkDiv.querySelector('.cancel-link').addEventListener('click', () => linkDiv.remove());
    }

    async uploadVideoFile(file, uploadDivElement) {
        if (file.size > 50 * 1024 * 1024) {
            this.showNotification('Video file must be under 50MB', 'error');
            uploadDivElement.remove();
            return;
        }

        uploadDivElement.innerHTML = `<div style="text-align: center; padding: 1.5rem;"><div>Uploading video...</div></div>`;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `highlights/${this.currentUser.id}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('highlight_reels')
                .upload(fileName, file, { cacheControl: '3600', upsert: false });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('highlight_reels')
                .getPublicUrl(fileName);

            const { data, error } = await supabaseClient
                .from('highlight_reels')
                .insert({
                    player_id: this.currentUser.id,
                    url: publicUrl,
                    title: file.name.split('.')[0].substring(0, 100),
                    video_type: 'file',
                    views: 0
                })
                .select()
                .single();

            if (error) throw error;

            this.highlightReels.push(data);
            uploadDivElement.remove();
            this.displayHighlightReels();
            this.showNotification('Video uploaded successfully!', 'success');
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification(error.message || 'Failed to upload video', 'error');
            uploadDivElement.remove();
        }
    }

    async addHighlightReelFromUrl(url) {
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return;
        }

        const maxClips = this.currentUser.subscription === 'premium' ? 5 : 3;
        if ((this.highlightReels?.length || 0) >= maxClips) {
            this.showNotification(`You can only add up to ${maxClips} highlight reels`, 'error');
            return;
        }

        const embedUrl = this.getYouTubeEmbedUrl(url);
        if (!embedUrl) {
            this.showNotification('Please enter a valid YouTube or Vimeo URL', 'error');
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('highlight_reels')
                .insert({
                    player_id: this.currentUser.id,
                    url: url,
                    title: null,
                    video_type: url.includes('youtube') ? 'youtube' : (url.includes('vimeo') ? 'vimeo' : 'file'),
                    views: 0
                })
                .select()
                .single();

            if (error) throw error;

            this.highlightReels.push(data);
            this.displayHighlightReels();
            this.showNotification('Highlight reel added!', 'success');
        } catch (error) {
            console.error('Error:', error);
            this.showNotification(error.message || 'Failed to add', 'error');
        }
    }

    async loadHighlightReels() {
        if (!this.currentUser) return;
        try {
            const { data, error } = await supabaseClient
                .from('highlight_reels')
                .select('*')
                .eq('player_id', this.currentUser.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            this.highlightReels = data || [];
            this.displayHighlightReels();
        } catch (error) {
            console.error('Error loading highlight reels:', error);
        }
    }

    displayHighlightReels() {
        const container = document.getElementById('highlightsContainer');
        if (!container) return;

        const maxClips = this.currentUser?.subscription === 'premium' ? 5 : 3;
        const limitText = document.getElementById('highlightLimit');
        if (limitText) {
            limitText.textContent = `You can upload up to ${maxClips} highlight reels. (${this.highlightReels?.length || 0}/${maxClips} used)`;
        }

        const existingItems = container.querySelectorAll('.highlight-item:not(.highlight-options-panel)');
        existingItems.forEach(el => el.remove());

        if (this.highlightReels && this.highlightReels.length > 0) {
            this.highlightReels.forEach(reel => {
                const embedUrl = this.getYouTubeEmbedUrl(reel.url);
                const reelDiv = document.createElement('div');
                reelDiv.className = 'highlight-item saved-highlight';
                reelDiv.innerHTML = `
                <div class="highlight-preview">
                   ${embedUrl ? `<a href="${reel.url}" target="_blank" rel="noopener noreferrer">
    <div style="position: relative; background: #000; border-radius:8px; overflow:hidden; height:180px;">
        <img src="https://img.youtube.com/vi/${embedUrl.match(/embed\/([^?]+)/)[1]}/mqdefault.jpg" 
             style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); 
                    font-size:48px; color:white; text-shadow:2px 2px 4px black;">▶️</div>
    </div>
</a>` : `<a href="${reel.url}" target="_blank">Watch Video 🔗</a>`}
                    <div class="highlight-info">
                        <input type="text" class="highlight-title-input" value="${this.escapeHtml(reel.title || '')}" placeholder="Video title">
                        <button class="btn btn-small btn-primary save-title-btn" data-id="${reel.id}">Save</button>
                        <button class="btn btn-small btn-danger delete-reel-btn" data-id="${reel.id}">Delete</button>
                    </div>
                </div>
            `;
                container.appendChild(reelDiv);
            });
        }

        document.querySelectorAll('.save-title-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reelId = btn.dataset.id;
                const titleInput = btn.parentElement.querySelector('.highlight-title-input');
                await this.updateHighlightTitle(reelId, titleInput.value);
            });
        });

        document.querySelectorAll('.delete-reel-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const reelId = btn.dataset.id;
                if (confirm('Delete this highlight reel?')) {
                    await this.deleteHighlightReel(reelId);
                }
            });
        });
    }

    async updateHighlightTitle(reelId, title) {
        try {
            await supabaseClient
                .from('highlight_reels')
                .update({ title: title })
                .eq('id', reelId)
                .eq('player_id', this.currentUser.id);
            const reel = this.highlightReels.find(r => r.id === reelId);
            if (reel) reel.title = title;
            this.showNotification('Title updated!', 'success');
        } catch (error) {
            this.showNotification('Failed to update', 'error');
        }
    }

    async deleteHighlightReel(reelId) {
        try {
            await supabaseClient
                .from('highlight_reels')
                .delete()
                .eq('id', reelId)
                .eq('player_id', this.currentUser.id);
            this.highlightReels = this.highlightReels.filter(r => r.id !== reelId);
            this.displayHighlightReels();
            this.showNotification('Deleted!', 'success');
        } catch (error) {
            this.showNotification('Failed to delete', 'error');
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function (m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
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
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(400px); opacity: 0; }
                }
                @media (max-width: 768px) {
                    .notification { left: 20px; right: 20px; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    loadPageContent() {
        const path = window.location.pathname.split('/').pop() || 'index.html';

        if (window.location.hash === '#') {
            return;
        }

        if (path.includes('index.html') || path === '') {
            // Show mock players on home page
            this.displayProspectsHome(this.mockPlayers.slice(0, 20));
        } else if (path.includes('search.html')) {
            // Will populate on search
        } else if (path.includes('profile.html')) {
            this.loadProfileStats();
            this.loadPlayerProfile();
            this.loadGoogleProfilePicture();
        }
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new HoopPortalApp();
});