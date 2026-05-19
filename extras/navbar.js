// Load navbar component on all pages
async function loadNavbar() {
    try {
        const response = await fetch('/extras/navbar.html');
        const navbarHTML = await response.text();
        
        // Create container for navbar
        const navContainer = document.createElement('div');
        navContainer.innerHTML = navbarHTML;
        
        // Insert navbar at the beginning of body
        document.body.insertBefore(navContainer.firstElementChild, document.body.firstChild);
        
        // Setup hamburger menu
        setupHamburgerMenu();
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
}

// Setup hamburger menu toggle
function setupHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Close menu when a link is clicked
        const navLinks = navMenu.querySelectorAll('a, button');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }
}

// Setup auth button listeners
function setupAuthListeners() {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (window.app) {
                window.app.showLoginModal();
            }
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            if (window.app) {
                window.app.showSignupModal();
            }
        });
    }
}

// Load navbar when DOM is ready
async function initializeNavbar() {
    try {
        const response = await fetch('/extras/navbar.html');
        const navbarHTML = await response.text();
        
        // Create container for navbar
        const navContainer = document.createElement('div');
        navContainer.innerHTML = navbarHTML;
        
        // Insert navbar at the beginning of body
        document.body.insertBefore(navContainer.firstElementChild, document.body.firstChild);
        
        // Setup hamburger menu
        setupHamburgerMenu();
        
        // Setup auth listeners (these will be used after app.js loads)
        setupAuthListeners();
        
        // If app is already loaded, update navigation
        if (window.app) {
            window.app.updateNavigation();
        }
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
}

// Original loadNavbar function kept for backward compatibility
async function loadNavbar() {
    await initializeNavbar();
}

// Load navbar when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavbar);
} else {
    initializeNavbar();
}

// Also setup auth listeners if navbar is already loaded (in case app.js loads first)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(setupAuthListeners, 100);
});
