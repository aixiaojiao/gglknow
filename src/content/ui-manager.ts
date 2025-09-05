/**
 * UI Manager Module
 * 
 * Manages the collection button UI, styles, and states
 */

import { ButtonState } from '@/types';
import { log, debounce } from '@/utils';

// CSS styles for the collection button
const BUTTON_STYLES = `
  .twitter-collector-btn,
  .twitter-collector-thread-btn {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .collect-button {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 18px;
    background: transparent;
    border: 1px solid #cfd9de;
    color: #536471;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s ease;
    cursor: pointer;
    user-select: none;
    min-width: 70px;
    justify-content: center;
  }
  
  .collect-button:hover {
    background: #f7f9fa;
    border-color: #1d9bf0;
    color: #1d9bf0;
  }
  
  .collect-button.thread-button {
    border-color: #10a37f;
    color: #10a37f;
  }

  .collect-button.thread-button:hover {
    background: #f0fdf4;
    border-color: #10a37f;
    color: #10a37f;
  }
  
  .collect-button svg {
    margin-right: 4px;
    flex-shrink: 0;
  }
  
  .collect-button.loading {
    background: #f0f8ff;
    border-color: #1d9bf0;
    color: #1d9bf0;
    cursor: wait;
  }
  
  .collect-button.success {
    background: #e8f5e8;
    border-color: #1d9bf0;
    color: #1d9bf0;
  }
  
  .collect-button.error {
    background: #fef2f2;
    border-color: #f91880;
    color: #f91880;
  }
  
  .loading-spinner {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .collect-button {
      border-color: #536471;
      color: #e7e9ea;
    }
    
    .collect-button:hover {
      background: #1e2732;
      border-color: #1d9bf0;
      color: #1d9bf0;
    }

    .collect-button.thread-button {
      border-color: #10a37f;
      color: #10a37f;
    }
    
    .collect-button.thread-button:hover {
      background: #0f2419;
      border-color: #10a37f;
      color: #10a37f;
    }
    
    .collect-button.loading {
      background: #0a1a2a;
    }
    
    .collect-button.success {
      background: #0a2a0a;
    }
    
    .collect-button.error {
      background: #2a0a0a;
    }
  }
`;

/**
 * SVG icons for different button states
 */
const ICONS = {
  idle: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
    </svg>
  `,
  thread: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM7.07 18.28c.43-.9 3.05-1.78 4.93-1.78s4.51.88 4.93 1.78C15.57 19.36 13.86 20 12 20s-3.57-.64-4.93-1.72zm11.29-1.45c-1.43-1.74-4.9-2.33-6.36-2.33s-4.93.59-6.36 2.33C4.62 15.49 4 13.82 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 1.82-.62 3.49-1.64 4.83z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  `,
  loading: `
    <svg class="loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" 
              stroke-dasharray="31.416" stroke-dashoffset="31.416">
        <animate attributeName="stroke-dasharray" dur="2s" 
                 values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
        <animate attributeName="stroke-dashoffset" dur="2s" 
                 values="0;-15.708;-31.416" repeatCount="indefinite"/>
      </circle>
    </svg>
  `,
  success: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
    </svg>
  `,
  error: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  `
};

/**
 * Button text for different states
 */
const BUTTON_TEXT = {
  idle: '收藏',
  thread: '收藏串',
  loading: '收藏中...',
  success: '已收藏',
  error: '收藏失败'
};

/**
 * Initialize UI styles
 */
export function initializeStyles(): void {
  // Check if styles already exist
  if (document.querySelector('#gglknow-styles')) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'gglknow-styles';
  styleElement.textContent = BUTTON_STYLES;
  document.head.appendChild(styleElement);

  log('info', 'UIManager', 'Styles initialized');
}

/**
 * Create a collection button for a tweet element
 */
export function createCollectionButton(
  tweetElement: Element,
  onCollect: (tweetElement: Element, buttonElement: Element) => void
): Element | null {
  try {
    // Check if button already exists
    if (tweetElement.querySelector('.twitter-collector-btn')) {
      return null;
    }

    // Find the action bar to insert the button
    const actionBar = findActionBar(tweetElement);
    if (!actionBar) {
      log('warn', 'UIManager', 'Could not find action bar for tweet');
      return null;
    }

    // Create button element
    const collectBtn = document.createElement('div');
    collectBtn.className = 'twitter-collector-btn';
    collectBtn.innerHTML = `
      <div class="collect-button" title="收藏推文">
        ${ICONS.idle}
        <span class="collect-text">${BUTTON_TEXT.idle}</span>
      </div>
    `;

    // Add click event listener with debounce
    const debouncedCollect = debounce(() => {
      onCollect(tweetElement, collectBtn);
    }, 300);

    collectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      debouncedCollect();
    });

    // Insert button into action bar
    actionBar.appendChild(collectBtn);

    log('info', 'UIManager', 'Collection button created');
    return collectBtn;
  } catch (error) {
    log('error', 'UIManager', 'Failed to create collection button', error);
    return null;
  }
}

/**
 * Create a thread collection button for a tweet element
 */
export function createThreadCollectionButton(
  tweetElement: Element,
  onCollectThread: (tweetElement: Element, buttonElement: Element) => void
): Element | null {
  try {
    // Check if button already exists
    if (tweetElement.querySelector('.twitter-collector-thread-btn')) {
      return null;
    }

    // Find the action bar to insert the button
    const actionBar = findActionBar(tweetElement);
    if (!actionBar) {
      log('warn', 'UIManager', 'Could not find action bar for thread button');
      return null;
    }

    // Create button element
    const collectBtn = document.createElement('div');
    collectBtn.className = 'twitter-collector-thread-btn';
    collectBtn.innerHTML = `
      <div class="collect-button thread-button" title="收藏推文串">
        ${ICONS.thread}
        <span class="collect-text">${BUTTON_TEXT.thread}</span>
      </div>
    `;

    // Add click event listener with debounce
    const debouncedCollect = debounce(() => {
      onCollectThread(tweetElement, collectBtn);
    }, 300);

    collectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      debouncedCollect();
    });

    // Insert button into action bar
    actionBar.appendChild(collectBtn);

    log('info', 'UIManager', 'Thread collection button created');
    return collectBtn;
  } catch (error) {
    log('error', 'UIManager', 'Failed to create thread collection button', error);
    return null;
  }
}

/**
 * Find the action bar in a tweet element
 */
function findActionBar(tweetElement: Element): Element | null {
  // Try multiple selectors to find the action bar
  const actionBarSelectors = [
    '[role="group"]',
    'div[data-testid="reply"]',
    'div[data-testid="retweet"]',
    'div[data-testid="like"]'
  ];

  for (const selector of actionBarSelectors) {
    const element = tweetElement.querySelector(selector);
    if (element) {
      // For specific action buttons, get their parent container
      if (selector.includes('data-testid')) {
        return element.parentElement?.parentElement || element.parentElement;
      }
      return element;
    }
  }

  return null;
}

/**
 * Update button state
 */
export function updateButtonState(
  buttonElement: Element,
  state: ButtonState,
  message?: string
): void {
  const button = buttonElement.querySelector('.collect-button');
  const textElement = buttonElement.querySelector('.collect-text');
  
  if (!button || !textElement) {
    log('warn', 'UIManager', 'Button elements not found');
    return;
  }

  // Remove all state classes
  button.classList.remove('loading', 'success', 'error');

  let icon: string;
  let text: string;

  // Add new state class and determine content
  if (state === ButtonState.IDLE) {
    if (button.classList.contains('thread-button')) {
      icon = ICONS.thread;
      text = message || BUTTON_TEXT.thread;
    } else {
      icon = ICONS.idle;
      text = message || BUTTON_TEXT.idle;
    }
  } else {
    button.classList.add(state);
    icon = ICONS[state];
    text = message || BUTTON_TEXT[state];
  }

  // Update button inner HTML
  button.innerHTML = `${icon}<span class="collect-text">${text}</span>`;

  log('info', 'UIManager', 'Button state updated', { state, message });
}

/**
 * Show temporary message on button
 */
export function showTemporaryMessage(
  buttonElement: Element,
  state: ButtonState,
  message: string,
  duration: number = 3000
): void {
  // Show temporary state
  updateButtonState(buttonElement, state, message);

  // Restore original state after duration
  setTimeout(() => {
    updateButtonState(buttonElement, ButtonState.IDLE);
  }, duration);
}

/**
 * Add collection buttons to all tweet elements
 */
export function addCollectionButtons(
  container: Element,
  onCollect: (tweetElement: Element, buttonElement: Element) => void
): void {
  const tweetSelectors = [
    'article[data-testid="tweet"]',
    '[data-testid="tweet"]'
  ];

  for (const selector of tweetSelectors) {
    const tweets = container.querySelectorAll(selector);
    for (const tweet of tweets) {
      createCollectionButton(tweet, onCollect);
    }
  }
}

/**
 * Remove all collection buttons
 */
export function removeCollectionButtons(): void {
  const buttons = document.querySelectorAll('.twitter-collector-btn');
  for (const button of buttons) {
    button.remove();
  }
  log('info', 'UIManager', 'All collection buttons removed');
}

/**
 * Check if element is visible in viewport
 */
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Observe DOM changes and add buttons to new tweets
 */
export function observeNewTweets(
  onCollect: (tweetElement: Element, buttonElement: Element) => void
): MutationObserver {
  let debounceTimer: number | null = null;
  
  const observer = new MutationObserver((mutations) => {
    // Debounce to avoid excessive processing
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = window.setTimeout(() => {
      let hasRelevantChanges = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              // Only process if it contains tweet elements or is a tweet itself
              if (element.matches('article[data-testid="tweet"]') || 
                  element.querySelector('article[data-testid="tweet"]')) {
                hasRelevantChanges = true;
                addCollectionButtons(element, onCollect);
              }
            }
          }
        }
      }
      
      if (hasRelevantChanges) {
        log('info', 'UIManager', 'Processing new tweets');
      }
    }, 100); // 100ms debounce
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('info', 'UIManager', 'DOM observer started with debouncing');
  return observer;
}

export default {
  initializeStyles,
  createCollectionButton,
  updateButtonState,
  showTemporaryMessage,
  addCollectionButtons,
  removeCollectionButtons,
  isElementVisible,
  observeNewTweets
}; 