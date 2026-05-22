// Load footer component on all pages
async function initializeFooter() {
    try {
        const response = await fetch('/extras/footer.html');
        const footerHTML = await response.text();

        // Create container for footer
        const footerContainer = document.createElement('div');
        footerContainer.innerHTML = footerHTML;

        // Insert footer at end of body
        document.body.appendChild(footerContainer.firstElementChild);

    } catch (error) {
        console.error('Error loading footer:', error);
    }
}

// Original function kept for compatibility
async function loadFooter() {
    await initializeFooter();
}

// Load footer when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFooter);
} else {
    initializeFooter();
}