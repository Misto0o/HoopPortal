// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://hpuikheuntquldqdewbr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwdWlraGV1bnRxdWxkcWRld2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDc2MTQsImV4cCI6MjA5NDcyMzYxNH0.GVkICFVA3QOkZaYqf-MSag2yhCt68-M2QLGpi7_E0UA';

let supabaseClient = null;

async function initializeSupabase() {
    console.log('[initializeSupabase] Starting...');

    // Wait for supabase library to be available
    let attempts = 0;
    while (!window.supabase && attempts < 50) {
        console.log('[initializeSupabase] Waiting for supabase library...');
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
        attempts++;
    }

    if (!window.supabase) {
        console.error('[initializeSupabase] ❌ Supabase library failed to load!');
        throw new Error('Supabase library not available');
    }

    console.log('[initializeSupabase] ✅ Supabase library loaded');

    const { createClient } = window.supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;

    console.log('[initializeSupabase] ✅ Supabase client initialized');
    return supabaseClient;
}

(function () {
    // Check if service worker is supported
    if ('serviceWorker' in navigator) {
        // Wait for page to load
        window.addEventListener('load', function () {
            // Register service worker
            navigator.serviceWorker.register('/sw.js', {
                scope: '/',
                updateViaCache: 'none' // Important: prevent SW script from being cached
            })
                .then(function (registration) {
                    console.log('✅ ServiceWorker registered successfully:', registration.scope);

                    // Check for updates every hour
                    setInterval(function () {
                        registration.update();
                        console.log('🔍 Checking for service worker updates');
                    }, 60 * 60 * 1000);

                    // Handle controller change (new SW takes over)
                    navigator.serviceWorker.addEventListener('controllerchange', function () {
                        console.log('🔄 Service worker controller changed, refreshing page');
                        window.location.reload();
                    });

                    // Listen for messages from service worker
                    navigator.serviceWorker.addEventListener('message', function (event) {
                        if (event.data && event.data.type === 'FORCE_REFRESH') {
                            console.log('📢 Force refresh requested by SW');
                            window.location.reload();
                        }
                    });

                })
                .catch(function (error) {
                    console.error('❌ ServiceWorker registration failed:', error);
                });
        });
    } else {
        console.warn('⚠️ Service Worker not supported in this browser');
    }
})();


// Also add beforeunload handler to clear sensitive data
window.addEventListener('beforeunload', () => {
    if (!localStorage.getItem('hoopportal_user')) {
        sessionStorage.clear();
    }
});


// ============================================
// MAIN APP CLASS
// ============================================
class HoopPortalApp {
    constructor() {
        this.currentUser = null;
        this.realPlayers = [];
        this.playerStats = {};
        this.userLikedPlayers = [];
        this.highlightReels = [];
        this.init();
    }

    async init() {
        console.log('[init] Starting app initialization...');

        await initializeSupabase();  // ← WAIT for this to complete

        this.setupEventListeners();
        this.checkAuthStatus();
        await this.loadSearchPlayers();  // ← Now this can safely use supabaseClient
        this.loadPageContent();
        this.handleCheckoutSuccess();

        console.log('[init] ✅ App initialized successfully');
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
            const pendingUserType = localStorage.getItem('pending_user_type');

            let { data: userProfile } = await supabaseClient
                .from('user_profiles')
                .select('user_type, subscription_status, subscription_plan, free_trial_end_date')
                .eq('id', session.user.id)
                .maybeSingle();

            if (!userProfile && pendingUserType) {
                // Check how many free trials have been used
                const { count, error: countError } = await supabaseClient
                    .from('user_profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('used_free_trial', true);

                const freeTrialsUsed = count || 0;
                const FREE_TRIAL_LIMIT = 50;

                let subscriptionStatus = 'inactive';
                let usedFreeTrial = false;
                let freeTrialEndDate = null;
                let subscriptionPlan = null;

                // Only give free trial to players (not coaches)
                if (freeTrialsUsed < FREE_TRIAL_LIMIT && pendingUserType === 'player') {
                    subscriptionStatus = 'active';
                    usedFreeTrial = true;
                    subscriptionPlan = 'basic';  // Give them BASIC plan features
                    // Set expiration date to 30 days from now
                    freeTrialEndDate = new Date();
                    freeTrialEndDate.setDate(freeTrialEndDate.getDate() + 30);
                    console.log(`✅ Free BASIC trial given to ${session.user.email}. Expires: ${freeTrialEndDate.toLocaleDateString()}`);
                }

                const { error: insertError } = await supabaseClient
                    .from('user_profiles')
                    .insert({
                        id: session.user.id,
                        email: session.user.email,
                        user_type: pendingUserType,
                        first_name: session.user.user_metadata?.full_name?.split(' ')[0] || '',
                        last_name: session.user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
                        avatar_url: session.user.user_metadata?.avatar_url || null,
                        subscription_status: subscriptionStatus,
                        subscription_plan: subscriptionPlan,  // Assign 'basic'
                        used_free_trial: usedFreeTrial,
                        free_trial_end_date: freeTrialEndDate,
                        subscription_date: usedFreeTrial ? new Date().toISOString() : null
                    });

                if (!insertError) {
                    if (pendingUserType === 'player') {
                        await supabaseClient
                            .from('player_profiles')
                            .insert({ id: session.user.id });

                        if (usedFreeTrial) {
                            const endDate = freeTrialEndDate.toLocaleDateString();
                            this.showNotification(
                                `🎉 Welcome! You've received a FREE 30-day BASIC plan trial! ` +
                                `Your profile is visible to coaches until ${endDate}. ` +
                                `Features: 2 highlight reels, visible in searches. ` +
                                `Subscribe to keep it active or upgrade to PREMIUM!`,
                                'success'
                            );
                        }
                    } else if (pendingUserType === 'coach') {
                        await supabaseClient
                            .from('coach_profiles')
                            .insert({ id: session.user.id });
                    }

                    userProfile = {
                        user_type: pendingUserType,
                        subscription_status: subscriptionStatus,
                        subscription_plan: subscriptionPlan,
                        free_trial_end_date: freeTrialEndDate
                    };
                }

                localStorage.removeItem('pending_user_type');
            }

            if (!userProfile) {
                await supabaseClient.auth.signOut();
                this.showNotification('Please sign up first to choose your account type', 'error');
                window.location.href = '/index.html';
                return;
            }

            this.currentUser = {
                id: session.user.id,
                email: session.user.email,
                userType: userProfile.user_type,
                subscriptionStatus: userProfile.subscription_status || 'inactive',
                subscriptionPlan: userProfile.subscription_plan || null,
                createdAt: new Date(),
                avatar: session.user.user_metadata?.avatar_url || null
            };
            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

            if (this.currentUser.userType === 'player') {
                await this.loadUserData();
                await this.loadPlayerProfile();
            } else if (this.currentUser.userType === 'coach') {
                await this.loadCoachProfile();
                await this.loadCoachLikedPlayers();
            }

            this.updateNavigation();
            return;
        }
    }


    async checkAndExpireFreeTrials() {
        if (!this.currentUser) return;

        try {
            // Check if user has an active free trial that expired
            const { data: user, error } = await supabaseClient
                .from('user_profiles')
                .select('used_free_trial, free_trial_end_date, subscription_status')
                .eq('id', this.currentUser.id)
                .single();

            if (error) throw error;

            // If they used a free trial and it has expired
            if (user.used_free_trial && user.free_trial_end_date) {
                const now = new Date();
                const expiryDate = new Date(user.free_trial_end_date);

                if (now > expiryDate && user.subscription_status === 'active') {
                    // Expire the trial
                    const { error: updateError } = await supabaseClient
                        .from('user_profiles')
                        .update({
                            subscription_status: 'inactive'
                        })
                        .eq('id', this.currentUser.id);

                    if (!updateError) {
                        this.currentUser.subscriptionStatus = 'inactive';
                        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

                        this.showNotification(
                            'Your free 30-day trial has expired. Subscribe to continue being visible to coaches!',
                            'warning'
                        );

                        this.updateVisibilityCard();
                    }
                } else if (user.subscription_status === 'active') {
                    // Show days remaining
                    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                    if (daysRemaining <= 7 && daysRemaining > 0) {
                        console.log(`⚠️ Free trial expires in ${daysRemaining} days`);
                        // Optional: Show a banner
                        this.showTrialExpiringBanner(daysRemaining);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking free trial:', error);
        }
    }

    showTrialExpiringBanner(daysRemaining) {
        // Check if banner already exists
        if (document.getElementById('trialExpiringBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'trialExpiringBanner';
        banner.style.cssText = `
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        padding: 1rem;
        text-align: center;
        position: fixed;
        bottom: 20px;
        right: 20px;
        left: auto;
        border-radius: 12px;
        z-index: 9999;
        max-width: 350px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
    `;
        banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.5rem;">⚠️</span>
            <div>
                <strong>Free Trial Ending Soon!</strong>
                <div style="font-size: 0.85rem;">Your free trial expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Subscribe to stay visible to coaches.</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
    `;
        banner.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                window.location.href = '/plans.html';
            }
        };
        document.body.appendChild(banner);
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

        <div class="google-signup-container">
            <div style="margin-bottom: 10px; font-size: 0.85rem; color: var(--text-muted);">Continue with Google as:</div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-social" id="googlePlayerBtn" style="flex: 1;">
                    <span>🏀 Player</span>
                </button>
                <button class="btn btn-social" id="googleCoachBtn" style="flex: 1;">
                    <span>👨‍🏫 Coach</span>
                </button>
            </div>
        </div>

        <p class="auth-footer">
            Already have an account? 
            <button type="button" class="auth-link" id="switchToLogin">Log In</button>
        </p>
    `;

        modal.classList.add('show');

        // Tab switching
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

        // Google signup with type
        document.getElementById('googlePlayerBtn')?.addEventListener('click', () => this.handleGoogleSignupWithType('player'));
        document.getElementById('googleCoachBtn')?.addEventListener('click', () => this.handleGoogleSignupWithType('coach'));

        document.getElementById('signupFormModal').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('switchToLogin').addEventListener('click', () => this.showLoginModal());
    }

    async handleGoogleSignupWithType(userType) {
        try {
            // Store the intended user type in localStorage before OAuth redirect
            localStorage.setItem('pending_user_type', userType);

            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) throw error;
        } catch (error) {
            this.showNotification(error.message || 'Google signup failed', 'error');
        }
    }


    async handleGoogleSignin() {
        try {
            // For existing users signing in, no pending type needed
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + window.location.pathname
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

        const fullName = document.getElementById('signupName')?.value || '';
        let firstName = '';
        let lastName = '';
        if (fullName) {
            const nameParts = fullName.trim().split(' ');
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
        }

        if (password !== confirm) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        // Disable submit button to prevent multiple attempts
        const submitBtn = document.querySelector('#signupFormModal button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }

        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        user_type: userType
                    }
                }
            });

            if (error) {
                // Handle specific error types
                if (error.message.includes('rate limit') || error.message.includes('25 seconds')) {
                    this.showNotification('Too many attempts. Please wait 1-2 minutes before trying again.', 'error');
                } else if (error.message.includes('User already registered')) {
                    this.showNotification('An account with this email already exists. Please log in instead.', 'error');
                } else {
                    this.showNotification(error.message, 'error');
                }
                console.error('Signup error:', error);

                // Re-enable submit button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign Up';
                }
                return;
            }

            if (!data.user) {
                throw new Error('No user returned from signup');
            }

            this.currentUser = {
                id: data.user.id,
                email: data.user.email,
                userType: userType,
                createdAt: new Date(),
                avatar: null,
                first_name: firstName,
                last_name: lastName
            };

            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

            await this.createUserProfile(userType, firstName, lastName);
            this.initializeUserData();

            if (data.session) {
                this.showNotification('Account created successfully!', 'success');
                this.closeModal(document.getElementById('authModal'));
                this.updateNavigation();
                await this.checkAndExpireFreeTrials();

                setTimeout(() => {
                    if (userType === 'player') {
                        window.location.href = 'profile.html';
                    } else {
                        window.location.href = 'coach-dashboard.html';
                    }
                }, 1500);
            } else {
                this.showNotification('Account created! Please check your email to confirm.', 'success');
                this.closeModal(document.getElementById('authModal'));
            }

        } catch (error) {
            console.error('Signup error:', error);
            this.showNotification(error.message || 'Signup failed. Please try again.', 'error');

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign Up';
            }
        }
    }

    async loadCoachProfile() {
        if (!this.currentUser || this.currentUser.userType !== 'coach') return;

        // Check if we're on the coach dashboard page
        if (!window.location.pathname.includes('coach-dashboard.html')) return;

        try {
            const { data: coachProfile, error } = await supabaseClient
                .from('coach_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .maybeSingle();

            if (error) throw error;

            if (coachProfile) {
                // Add null checks for each element
                const firstNameEl = document.getElementById('coachFirstName');
                if (firstNameEl) firstNameEl.value = coachProfile.first_name || '';

                const lastNameEl = document.getElementById('coachLastName');
                if (lastNameEl) lastNameEl.value = coachProfile.last_name || '';

                const schoolEl = document.getElementById('coachSchool');
                if (schoolEl) schoolEl.value = coachProfile.school || '';

                const teamEl = document.getElementById('coachTeam');
                if (teamEl) teamEl.value = coachProfile.team || '';

                const roleEl = document.getElementById('coachRole');
                if (roleEl) roleEl.value = coachProfile.role || '';

                const experienceEl = document.getElementById('coachExperience');
                if (experienceEl) experienceEl.value = coachProfile.experience || '';

                const cityEl = document.getElementById('coachCity');
                if (cityEl) cityEl.value = coachProfile.city || '';

                const stateEl = document.getElementById('coachState');
                if (stateEl) stateEl.value = coachProfile.state || '';

                const bioEl = document.getElementById('coachBio');
                if (bioEl) bioEl.value = coachProfile.bio || '';

                const emailEl = document.getElementById('coachEmail');
                if (emailEl) emailEl.value = coachProfile.email || '';

                const phoneEl = document.getElementById('coachPhone');
                if (phoneEl) phoneEl.value = coachProfile.phone || '';
            }
        } catch (error) {
            console.error('Load coach profile error:', error);
        }
    }

    async handleCoachInfo(e) {
        e.preventDefault();
        if (!this.currentUser) return;

        try {
            const { error } = await supabaseClient
                .from('coach_profiles')
                .upsert({
                    id: this.currentUser.id,
                    first_name: document.getElementById('coachFirstName').value,
                    last_name: document.getElementById('coachLastName').value,
                    school: document.getElementById('coachSchool').value,
                    team: document.getElementById('coachTeam').value,
                    role: document.getElementById('coachRole').value,
                    experience: parseInt(document.getElementById('coachExperience').value) || null,
                    city: document.getElementById('coachCity').value,
                    state: document.getElementById('coachState').value,
                    bio: document.getElementById('coachBio').value,
                    updated_at: new Date()
                }, { onConflict: 'id' });

            if (error) throw error;
            this.showNotification('Coach information saved!', 'success');
        } catch (error) {
            console.error('Save coach error:', error);
            this.showNotification(error.message || 'Failed to save', 'error');
        }
    }

    async handleCoachContact(e) {
        e.preventDefault();
        if (!this.currentUser) return;

        try {
            const { error } = await supabaseClient
                .from('coach_profiles')
                .update({
                    email: document.getElementById('coachEmail').value,
                    phone: document.getElementById('coachPhone').value,
                    updated_at: new Date()
                })
                .eq('id', this.currentUser.id);

            if (error) throw error;
            this.showNotification('Contact information saved!', 'success');
        } catch (error) {
            console.error('Save contact error:', error);
            this.showNotification(error.message || 'Failed to save', 'error');
        }
    }

    async loadCoachLikedPlayers() {
        if (!this.currentUser || this.currentUser.userType !== 'coach') return;

        // Check if we're on the coach dashboard page
        if (!window.location.pathname.includes('coach-dashboard.html')) return;

        // Check if elements exist before using them
        const likedContainer = document.getElementById('likedPlayersContainer');
        const likedCountEl = document.getElementById('likedCount');
        const viewAllContainer = document.getElementById('viewAllButtonContainer');

        if (!likedContainer) return;

        try {
            // Get liked player IDs from Supabase
            const { data: likedData, error } = await supabaseClient
                .from('liked_players')
                .select('player_id')
                .eq('user_id', this.currentUser.id);

            if (error) throw error;

            const playerIds = likedData.map(l => l.player_id);

            // Update the liked status in realPlayers
            this.realPlayers.forEach(player => {
                player.liked = playerIds.includes(player.id);
            });

            if (playerIds.length === 0) {
                likedContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">No liked players yet. Browse players and click the ❤️ button to start your recruiting list!</p>';
                if (likedCountEl) likedCountEl.textContent = '0';
                if (viewAllContainer) viewAllContainer.innerHTML = '';
                return;
            }

            // Get player details
            const { data: players, error: playersError } = await supabaseClient
                .from('player_profiles')
                .select('*')
                .in('id', playerIds);

            if (playersError) throw playersError;

            // Get user names
            const { data: users } = await supabaseClient
                .from('user_profiles')
                .select('id, first_name, last_name')
                .in('id', playerIds);

            const userMap = {};
            users?.forEach(u => {
                userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim();
            });

            if (likedCountEl) likedCountEl.textContent = players.length;

            const displayPlayers = players.slice(0, 4);
            const hasMore = players.length > 4;

            likedContainer.innerHTML = displayPlayers.map(player => {
                const name = userMap[player.id] || 'Unknown Player';
                const roleBadge = this.getRoleBadge(player.position);
                return `
                <div class="liked-player-card" onclick="app.showPlayerModal('${player.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <h4 style="margin: 0;">${this.escapeHtml(name)}</h4>
                        ${roleBadge}
                    </div>
                    <div style="margin-top: 0.5rem;">
                        <div style="font-size: 0.85rem; color: var(--text-muted);">
                            ${player.position || 'No position'} • ${player.class_year || 'No class'}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">
                            ${player.city || ''} ${player.state || ''}
                        </div>
                        ${player.height ? `<div style="font-size: 0.85rem;">${player.height} | ${player.weight ? player.weight + ' lbs' : ''}</div>` : ''}
                    </div>
                </div>
            `;
            }).join('');

            if (hasMore) {
                const viewAllCard = document.createElement('div');
                viewAllCard.className = 'liked-player-card';
                viewAllCard.style.cssText = 'display: flex; align-items: center; justify-content: center; flex-direction: column; background-color: var(--primary-dark); border: 2px dashed var(--border-color);';
                viewAllCard.onclick = () => this.showAllLikedPlayersModal(players, userMap);
                viewAllCard.innerHTML = `
                <div style="font-size: 2rem;">👥</div>
                <div style="font-weight: 600; margin-top: 0.5rem;">View All (${players.length})</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Click to see all liked players</div>
            `;
                likedContainer.appendChild(viewAllCard);
            }

        } catch (error) {
            console.error('Load liked players error:', error);
        }
    }

    getRoleBadge(position) {
        const badges = {
            'PG': '<span class="role-badge" style="background:#3b82f6;">PG</span>',
            'SG': '<span class="role-badge" style="background:#3b82f6;">SG</span>',
            'SF': '<span class="role-badge" style="background:#3b82f6;">SF</span>',
            'PF': '<span class="role-badge" style="background:#3b82f6;">PF</span>',
            'C': '<span class="role-badge" style="background:#3b82f6;">C</span>'
        };
        return badges[position] || '';
    }

    async createUserProfile(userType, firstName = '', lastName = '') {
        if (!this.currentUser) return;

        try {
            console.log('Creating user profile for:', this.currentUser.id, userType);

            const { error: userError } = await supabaseClient
                .from('user_profiles')
                .upsert({
                    id: this.currentUser.id,
                    email: this.currentUser.email,
                    user_type: userType,
                    first_name: firstName,
                    last_name: lastName,
                    avatar_url: this.currentUser.avatar
                }, { onConflict: 'id' });

            if (userError) {
                console.error('User profile error:', userError);
                throw userError;
            }

            if (userType === 'player') {
                const { error: playerError } = await supabaseClient
                    .from('player_profiles')
                    .insert({
                        id: this.currentUser.id
                    });

                if (playerError && playerError.code !== '23505') {
                    console.error('Player profile error:', playerError);
                    throw playerError;
                }
            }

            if (userType === 'coach') {
                const { error: coachError } = await supabaseClient
                    .from('coach_profiles')
                    .insert({
                        id: this.currentUser.id
                    });

                if (coachError && coachError.code !== '23505') {
                    console.error('Coach profile error:', coachError);
                    throw coachError;
                }
            }

            console.log('Profile created successfully');
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

            // Get user type from user_profiles
            const { data: userProfile } = await supabaseClient
                .from('user_profiles')
                .select('user_type')
                .eq('id', data.user.id)
                .single();

            this.currentUser = {
                id: data.user.id,
                email: data.user.email,
                userType: userProfile?.user_type || 'player',
                createdAt: new Date(),
                avatar: null
            };

            localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));
            await this.loadUserData();

            this.showNotification('Signed in successfully!', 'success');
            this.closeModal(document.getElementById('authModal'));
            this.updateNavigation();

            // Redirect based on user type
            if (this.currentUser.userType === 'coach') {
                window.location.href = 'coach-dashboard.html';
            } else {
                window.location.href = 'profile.html';
            }
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

            // Fix: Check userType for correct dashboard redirect
            if (this.currentUser.userType === 'coach') {
                profileBanner.addEventListener('click', () => window.location.href = 'coach-dashboard.html');
            } else {
                profileBanner.addEventListener('click', () => window.location.href = 'profile.html');
            }

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
            await this.loadSubscriptionStatus();


        } catch (err) {
            console.error('Load profile error:', err);
        }
    }

    // Add this method to load subscription display
    async loadSubscriptionStatus() {
        if (!this.currentUser) return;

        const subPlanEl = document.getElementById('subPlan');
        const manageBtn = document.getElementById('managePlanBtn');
        const subStatus = document.getElementById('subStatus');

        if (subStatus) {
            if (this.currentUser.subscriptionStatus === 'active') {
                subStatus.textContent = '✓ Active';
                subStatus.style.color = '#10b981';
            } else {
                subStatus.textContent = '⚠️ Inactive - Not Visible';
                subStatus.style.color = 'var(--primary-orange)';
            }
        }

        if (subPlanEl) {
            const plan = this.currentUser.subscriptionPlan || 'basic';
            subPlanEl.textContent = plan === 'premium' ? '⭐ Premium' : 'Basic';
        }

        if (manageBtn) {
            manageBtn.textContent = 'Manage Account';
            manageBtn.onclick = () => {
                window.location.href = 'subscription.html';
            };
        }

        // Update visibility card
        if (typeof updateVisibilityCard === 'function') {
            updateVisibilityCard();
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
            const { data: playerData, error: playerError } = await supabaseClient
                .from('player_profiles')
                .select('*');

            if (playerError) throw playerError;

            const { data: userData, error: userError } = await supabaseClient
                .from('user_profiles')
                .select('id, first_name, last_name, avatar_url, gender, subscription_status');

            if (userError) throw userError;

            const { data: likesData, error: likesError } = await supabaseClient
                .from('liked_players')
                .select('player_id');

            if (likesError) throw likesError;

            const isCoach = this.currentUser?.userType === 'coach';

            // DEBUG: Log what's happening
            console.log('Current user type:', this.currentUser?.userType);
            console.log('Is Coach?', isCoach);

            const likeCounts = {};
            likesData?.forEach(like => {
                likeCounts[like.player_id] = (likeCounts[like.player_id] || 0) + 1;
            });

            let userLikes = [];
            if (this.currentUser) {
                const { data: userLikesData } = await supabaseClient
                    .from('liked_players')
                    .select('player_id')
                    .eq('user_id', this.currentUser.id);
                userLikes = userLikesData?.map(l => l.player_id) || [];
            }

            const userMap = {};
            userData.forEach(user => {
                userMap[user.id] = {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    avatar: user.avatar_url,
                    gender: user.gender,
                    subscriptionStatus: user.subscription_status || 'inactive'
                };
            });

            // DEBUG: Log subscription statuses
            console.log('User subscription data:', userData.map(u => ({
                id: u.id,
                name: u.first_name,
                subscription_status: u.subscription_status
            })));

            this.realPlayers = playerData.map(player => {
                const userInfo = userMap[player.id] || {};
                const fullName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim();

                // IMPORTANT: For coaches, ONLY show active players
                let visible = true;
                if (isCoach) {
                    visible = userInfo.subscriptionStatus === 'active';
                }

                // DEBUG: Log each player's visibility
                if (isCoach) {
                    console.log(`Player: ${fullName}, Subscription: ${userInfo.subscriptionStatus}, Visible: ${visible}`);
                }

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
                    likes: likeCounts[player.id] || 0,
                    liked: userLikes.includes(player.id),
                    description: player.game_description || '',
                    coachType: player.coach_preferences || '',
                    realProfile: true,
                    visible: visible,
                    subscriptionStatus: userInfo.subscriptionStatus  // Store for debugging
                };
            });

            console.log('Total players loaded:', this.realPlayers.length);
            console.log('Visible players for coach:', this.realPlayers.filter(p => p.visible).length);
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
    // PROSPECTS
    // ============================================
    filterProspectsHome(gender, event) {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');

        // Filter real players by gender first
        let filtered = gender === 'all'
            ? [...this.realPlayers]
            : [...this.realPlayers].filter(p => p.gender === gender);

        // For coaches, only show visible players
        if (this.currentUser?.userType === 'coach') {
            filtered = filtered.filter(p => p.visible === true);
        }

        filtered = filtered.slice(0, 20);
        this.displayProspectsHome(filtered);
    }

    displayProspectsHome(prospects) {
        const container = document.getElementById('homeProspectsContainer');
        if (!container) return;

        // Filter out invisible players for coaches
        let visibleProspects = prospects;
        if (this.currentUser?.userType === 'coach') {
            visibleProspects = prospects.filter(p => p.visible === true);
        }

        if (visibleProspects.length === 0) {
            if (this.currentUser?.userType === 'coach') {
                container.innerHTML = `
                <div style="text-align: center; padding: 3rem; background: var(--secondary-dark); border-radius: 12px; grid-column: 1/-1;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
                    <h3>No Active Players Found</h3>
                    <p style="color: var(--text-muted);">Players must have an active subscription to be visible to coaches.</p>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Check back later as more players subscribe!</p>
                </div>
            `;
            } else {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No players found</p>';
            }
            return;
        }

        container.innerHTML = visibleProspects.map(p => {
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

        const allPlayers = [...this.realPlayers];

        let results = allPlayers.filter(p => {
            // Filter by visibility first
            if (!p.visible) return false;
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

        // Show message if no results
        if (results.length === 0 && this.currentUser?.userType === 'coach') {
            const container = document.getElementById('searchProspectsContainer');
            if (container) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No active players found. Players must have an active subscription to be visible.</p>';
            }
        }
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

    updateVisibilityCard() {
        const user = this.currentUser;
        if (!user || user.userType !== 'player') return;

        const card = document.getElementById('visibilityCard');
        const status = document.getElementById('visibilityStatus');
        const icon = document.getElementById('visibilityIcon');
        const desc = document.getElementById('visibilityDescription');
        const btn = document.getElementById('getVisibilityBtn');
        const statusDisplay = document.getElementById('subStatus');

        if (card && user.subscriptionStatus === 'active') {
            card.classList.add('active');
            card.classList.remove('inactive');
            if (status) {
                status.textContent = 'ACTIVE ✓';
                status.classList.add('active');
                status.classList.remove('inactive');
            }
            if (icon) icon.textContent = '👁️✓';
            if (desc) desc.textContent = 'Coaches can see your profile! Keep your information updated to attract more recruits.';
            if (btn) {
                btn.textContent = 'Manage Subscription';
                btn.className = 'cta-button secondary';
            }
            if (statusDisplay) statusDisplay.textContent = '✓ Active';
        } else if (card) {
            card.classList.remove('active');
            if (status) {
                status.textContent = 'INACTIVE';
                status.classList.add('inactive');
                status.classList.remove('active');
            }
            if (icon) icon.textContent = '👁️❌';
            if (desc) desc.textContent = 'Your profile is currently not visible to coaches. Purchase a subscription to appear in coach search results.';
            if (btn) {
                btn.textContent = 'Get Visible - Buy Subscription';
                btn.className = 'cta-button primary';
            }
            if (statusDisplay) statusDisplay.textContent = '⚠️ Inactive - Not Visible';
        }
    }

    async showPlayerModal(playerId) {
        const allPlayers = [...this.realPlayers];
        const player = allPlayers.find(p => String(p.id) === String(playerId));

        if (!player) return;

        let playerStats = { ppg: null, apg: null, rpg: null, fg: null, '3p': null, spg: null, bpg: null, ft: null, tov: null };
        let contactInfo = { playerEmail: null, playerPhone: null, parentName: null, parentEmail: null, parentPhone: null };
        let playerHighlightReels = [];

        if (this.currentUser) {
            const { data: likedCheck } = await supabaseClient
                .from('liked_players')
                .select('id')
                .eq('user_id', this.currentUser.id)
                .eq('player_id', playerId)
                .maybeSingle();
            player.liked = !!likedCheck;

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
        }

        let profilePic = player.avatar || player.emoji || '🏀';
        const likeButtonStyle = player.liked ? 'background-color: var(--primary-orange); color: white;' : '';
        const isLoggedIn = !!this.currentUser;

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

        // Generate contact info HTML with overlay if not logged in
        let contactHtml = '';
        if (isLoggedIn) {
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
        } else {
            contactHtml = `
        <div style="background: linear-gradient(135deg, #2a2d33 0%, #242729 100%); border: 1px solid #404450; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; position: relative; filter: blur(4px);">
            <h3 style="font-size: 1.1rem; margin-bottom: 1.2rem; font-weight: 700;">📞 Contact Information</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Player Email</div>
                    <div style="font-weight: 600;">••••••••</div>
                </div>
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Player Phone</div>
                    <div style="font-weight: 600;">••••••••</div>
                </div>
                <div style="grid-column: span 2;">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Parent/Guardian</div>
                    <div style="font-weight: 600;">••••••••</div>
                </div>
            </div>
        </div>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); padding: 2rem; border-radius: 12px; text-align: center; z-index: 100; width: 80%; max-width: 400px;">
            <div style="font-size: 2rem; margin-bottom: 1rem;">🔒</div>
            <h4 style="margin-bottom: 0.5rem; color: white;">Sign in to view contact info</h4>
            <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 1.5rem;">Log in or sign up to see player contact details</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn btn-primary" onclick="app.showLoginModal()" style="cursor: pointer;">Log In</button>
                <button class="btn btn-secondary" onclick="app.showSignupModal()" style="cursor: pointer;">Sign Up</button>
            </div>
        </div>
    `;
        }

        const modalBody = document.getElementById('playerModalBody');
        modalBody.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 1rem; ${!isLoggedIn ? 'position: relative;' : ''}">
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
                ${isLoggedIn ? (player.liked ? `❤️ Liked (${player.likes})` : `🤍 Like (${player.likes})`) : `🤍 Like to save (${player.likes})`}
            </button>
        </div>
    </div>
`;

        document.getElementById('playerModal').classList.add('show');
    }

    async likePlayer(playerId) {
        const player = this.realPlayers.find(p => String(p.id) === String(playerId));

        if (!player) return;

        if (String(playerId) === String(this.currentUser?.id)) {
            this.showNotification("You can't like your own profile", 'error');
            return;
        }

        if (!this.currentUser) {
            this.showNotification("Please log in to like players", 'error');
            return;
        }

        try {
            if (player.liked) {
                // Unlike: Remove from Supabase
                const { error } = await supabaseClient
                    .from('liked_players')
                    .delete()
                    .eq('user_id', this.currentUser.id)
                    .eq('player_id', playerId);

                if (error) throw error;

                player.liked = false;
                player.likes = Math.max(0, (player.likes || 0) - 1);
                this.showNotification('Player removed from liked list', 'success');
            } else {
                // Like: Add to Supabase
                const { error } = await supabaseClient
                    .from('liked_players')
                    .insert({
                        user_id: this.currentUser.id,
                        player_id: playerId
                    });

                if (error) throw error;

                player.liked = true;
                player.likes = (player.likes || 0) + 1;
                this.showNotification('Player liked!', 'success');
            }

            // Update like button in modal if open
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

            // Refresh coach liked players if on coach dashboard
            if (this.currentUser?.userType === 'coach' && window.location.pathname.includes('coach-dashboard.html')) {
                await this.loadCoachLikedPlayers();
            }

            // Also refresh the modal's like button if it's open
            const modal = document.getElementById('playerModal');
            if (modal && modal.classList.contains('show')) {
                // Update the liked status in the player object
                // The button will be updated when modal is reopened
            }

        } catch (error) {
            console.error('Like error:', error);
            this.showNotification(error.message || 'Failed to update like', 'error');
        }
    }

    showAllLikedPlayersModal(players, userMap) {
        // Create or get modal for all liked players
        let allLikedModal = document.getElementById('allLikedModal');
        if (!allLikedModal) {
            allLikedModal = document.createElement('div');
            allLikedModal.id = 'allLikedModal';
            allLikedModal.className = 'modal';
            allLikedModal.innerHTML = `
            <div class="modal-content modal-large" style="max-width: 800px;">
                <button class="modal-close">&times;</button>
                <h2 style="margin-bottom: 1rem;">⭐ Liked Players</h2>
                <div id="allLikedModalBody" style="max-height: 60vh; overflow-y: auto;"></div>
            </div>
        `;
            document.body.appendChild(allLikedModal);

            // Add close button functionality
            allLikedModal.querySelector('.modal-close').addEventListener('click', () => {
                this.closeModal(allLikedModal);
            });
            allLikedModal.addEventListener('click', (e) => {
                if (e.target === allLikedModal) this.closeModal(allLikedModal);
            });
        }

        const modalBody = document.getElementById('allLikedModalBody');
        modalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
            ${players.map(player => {
            const name = userMap[player.id] || 'Unknown Player';
            const roleBadge = this.getRoleBadge(player.position);
            return `
                    <div class="liked-player-card" onclick="app.showPlayerModal('${player.id}'); app.closeModal(document.getElementById('allLikedModal'));" style="cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <h4 style="margin: 0;">${this.escapeHtml(name)}</h4>
                            ${roleBadge}
                        </div>
                        <div style="margin-top: 0.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-muted);">
                                ${player.position || 'No position'} • ${player.class_year || 'No class'}
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">
                                ${player.city || ''} ${player.state || ''}
                            </div>
                            ${player.height ? `<div style="font-size: 0.85rem;">${player.height} | ${player.weight ? player.weight + ' lbs' : ''}</div>` : ''}
                        </div>
                    </div>
                `;
        }).join('')}
        </div>
    `;

        allLikedModal.classList.add('show');
    }

    async saveLikedToSupabase(playerId, isLiked) {
        if (!this.currentUser) return;

        try {
            if (isLiked) {
                // Check if already liked to avoid duplicates
                const { data: existing } = await supabaseClient
                    .from('liked_players')
                    .select('id')
                    .eq('user_id', this.currentUser.id)
                    .eq('player_id', playerId)
                    .maybeSingle();

                if (!existing) {
                    await supabaseClient
                        .from('liked_players')
                        .insert({
                            user_id: this.currentUser.id,
                            player_id: playerId
                        });
                }
            } else {
                await supabaseClient
                    .from('liked_players')
                    .delete()
                    .eq('user_id', this.currentUser.id)
                    .eq('player_id', playerId);
            }
            console.log('Like saved to Supabase:', playerId, isLiked);
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
    async selectPlan(plan) {
        if (!this.currentUser) {
            this.showNotification('Please log in first to select a plan', 'error');
            this.showSignupModal();
            return;
        }

        // Price IDs - Replace with your actual Stripe Price IDs
        const priceIds = {
            basic: 'price_1TZHdpPv1yKOz6gv9mvr8OPS',    // Replace with your Basic plan price ID
            premium: 'price_1TZHeNPv1yKOz6gvZ7hotmwm'   // Replace with your Premium plan price ID
        };

        const priceId = priceIds[plan];
        if (!priceId) {
            this.showNotification('Invalid plan selected', 'error');
            return;
        }

        this.showNotification('Redirecting to checkout...', 'success');

        try {
            const response = await fetch('/.netlify/functions/create-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    priceId: priceId,
                    userId: this.currentUser.id,
                    userEmail: this.currentUser.email,
                    planType: plan,
                    successUrl: `${window.location.origin}/profile.html`,
                    cancelUrl: `${window.location.origin}/plans.html`
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Checkout failed');
            }

            const data = await response.json();

            if (!data.url) {
                throw new Error('No checkout URL returned');
            }

            window.location.href = data.url;

        } catch (error) {
            console.error('Checkout error:', error);
            this.showNotification(
                error.message || 'Failed to start checkout. Please try again.',
                'error'
            );
        }
    }

    async handleCheckoutSuccess() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');

        if (sessionId && this.currentUser) {
            try {
                const response = await fetch('/.netlify/functions/verify-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, userId: this.currentUser.id })
                });

                if (response.ok) {
                    // Refresh user data from Supabase
                    const { data: userProfile } = await supabaseClient
                        .from('user_profiles')
                        .select('subscription_status, subscription_plan')
                        .eq('id', this.currentUser.id)
                        .single();

                    if (userProfile && userProfile.subscription_status === 'active') {
                        this.currentUser.subscriptionStatus = userProfile.subscription_status;
                        this.currentUser.subscriptionPlan = userProfile.subscription_plan;
                        localStorage.setItem('hoopportal_user', JSON.stringify(this.currentUser));

                        this.updateVisibilityCard();
                        this.showNotification(
                            `Welcome to ${userProfile.subscription_plan === 'premium' ? 'Premium' : 'Basic'}! 🎉 Your profile is now visible to coaches!`,
                            'success'
                        );
                    }
                }
            } catch (error) {
                console.error('Error handling checkout success:', error);
            }

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
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

    // Update loadPageContent to handle coach dashboard
    async loadPageContent() {
        const path = window.location.pathname.split('/').pop() || 'index.html';

        if (this.currentUser) {
            await this.checkAndExpireFreeTrials();
        }

        if (path.includes('coach-dashboard.html')) {
            if (this.currentUser?.userType === 'coach') {
                this.loadCoachProfile();
                this.loadCoachLikedPlayers();
                document.getElementById('coachInfoForm')?.addEventListener('submit', (e) => this.handleCoachInfo(e));
                document.getElementById('coachContactForm')?.addEventListener('submit', (e) => this.handleCoachContact(e));
            } else if (this.currentUser?.userType === 'player') {
                window.location.href = 'profile.html';
            }
        } else if (path.includes('index.html') || path === '') {
            this.displayProspectsHome(this.realPlayers.slice(0, 20));
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