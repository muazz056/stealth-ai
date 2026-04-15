/**
 * Browser Preload Script for AI Provider Integration
 * This script is injected into the browser view to enable DOM manipulation
 */

// Helper function to wait for element to appear
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) return resolve(element);
        
        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });
        
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

// Helper to set React input value (works with controlled components)
function setReactInput(element, value) {
    try {
        if (element.tagName === 'TEXTAREA') {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            ).set;
            nativeInputValueSetter.call(element, value);
        } else if (element.tagName === 'INPUT') {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            ).set;
            nativeInputValueSetter.call(element, value);
        } else {
            // For contenteditable
            element.textContent = value;
        }
        
        // Trigger React's onChange
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        return true;
    } catch (error) {
        console.error('Failed to set input:', error);
        return false;
    }
}

// Expose helper functions to the injected scripts
window.___interviewAssistHelpers = {
    waitForElement,
    setReactInput
};

console.log('✅ Interview Assist browser preload loaded');

