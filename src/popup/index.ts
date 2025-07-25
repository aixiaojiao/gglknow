/**
 * Popup Script for GglKnow Extension
 * 
 * Main popup window script that handles settings management and UI interactions
 */

import { ExtensionSettings, PopupState } from '@/types';
import { log, debounce, localizePage } from '@/utils';
import { 
  getSettings, 
  saveSettings, 
  testConnection, 
  getExtensionVersion,
  openTweetBrowser,
  openHelpPage,
  validateSavePath
} from './settings-manager';

/**
 * Main Popup Manager class
 */
class PopupManager {
  private state: PopupState = {
    isConnected: false,
    settings: {
      savePath: 'Downloads/Twitter',
      fileFormats: ['html'],
      downloadMedia: true
    },
    isSaving: false,
    lastError: null
  };

  private elements: {
    connectionDot: HTMLElement;
    connectionStatus: HTMLElement;
    statusMessage: HTMLElement;
    savePath: HTMLInputElement;
    formatHtml: HTMLInputElement;
    formatJson: HTMLInputElement;
    formatMarkdown: HTMLInputElement;
    downloadMedia: HTMLInputElement;
    saveBtn: HTMLButtonElement;
    browserBtn: HTMLButtonElement;
    helpBtn: HTMLButtonElement;
    version: HTMLElement;
  };

  constructor() {
    this.elements = this.getElements();
    this.initialize();
  }

  /**
   * Get DOM elements
   */
  private getElements() {
    return {
      connectionDot: document.getElementById('connectionDot') as HTMLElement,
      connectionStatus: document.getElementById('connectionStatus') as HTMLElement,
      statusMessage: document.getElementById('statusMessage') as HTMLElement,
      savePath: document.getElementById('savePath') as HTMLInputElement,
      formatHtml: document.getElementById('formatHtml') as HTMLInputElement,
      formatJson: document.getElementById('formatJson') as HTMLInputElement,
      formatMarkdown: document.getElementById('formatMarkdown') as HTMLInputElement,
      downloadMedia: document.getElementById('downloadMedia') as HTMLInputElement,
      saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
      browserBtn: document.getElementById('browserBtn') as HTMLButtonElement,
      helpBtn: document.getElementById('helpBtn') as HTMLButtonElement,
      version: document.getElementById('version') as HTMLElement
    };
  }

  /**
   * Initialize the popup
   */
  private async initialize(): Promise<void> {
    try {
      log('info', 'PopupManager', 'Initializing popup');

      // Localize page content
      localizePage();

      // Set version
      this.elements.version.textContent = getExtensionVersion();

      // Setup event listeners
      this.setupEventListeners();

      // Load settings and test connection
      await Promise.all([
        this.loadSettings(),
        this.checkConnection()
      ]);

      log('info', 'PopupManager', 'Popup initialized successfully');
    } catch (error) {
      log('error', 'PopupManager', 'Failed to initialize popup', error);
      this.showError(chrome.i18n.getMessage('errorInitFailed'));
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Save settings button
    this.elements.saveBtn.addEventListener('click', this.handleSaveSettings.bind(this));

    // Tweet browser button
    this.elements.browserBtn.addEventListener('click', this.handleOpenBrowser.bind(this));

    // Help button
    this.elements.helpBtn.addEventListener('click', this.handleOpenHelp.bind(this));

    // Auto-save on input change (debounced)
    const debouncedSave = debounce(this.handleSaveSettings.bind(this), 1000);
    
    this.elements.savePath.addEventListener('input', debouncedSave);
    this.elements.formatHtml.addEventListener('change', debouncedSave);
    this.elements.formatJson.addEventListener('change', debouncedSave);
    this.elements.formatMarkdown.addEventListener('change', debouncedSave);
    this.elements.downloadMedia.addEventListener('change', debouncedSave);

    // Save path validation
    this.elements.savePath.addEventListener('blur', this.validateSavePathInput.bind(this));

    log('info', 'PopupManager', 'Event listeners setup complete');
  }

  /**
   * Load settings from background
   */
  private async loadSettings(): Promise<void> {
    try {
      log('info', 'PopupManager', 'Loading settings');
      
      const settings = await getSettings();
      this.state.settings = settings;
      
      // Update UI with loaded settings
      this.updateSettingsUI(settings);
      
      log('info', 'PopupManager', 'Settings loaded successfully', settings);
    } catch (error) {
      log('error', 'PopupManager', 'Failed to load settings', error);
      this.showError(chrome.i18n.getMessage('errorLoadSettingsFailed'));
    }
  }

  /**
   * Update UI with settings
   */
  private updateSettingsUI(settings: ExtensionSettings): void {
    this.elements.savePath.value = settings.savePath;
    this.elements.downloadMedia.checked = settings.downloadMedia;

    // Uncheck all first
    this.elements.formatHtml.checked = false;
    this.elements.formatJson.checked = false;
    this.elements.formatMarkdown.checked = false;

    // Check based on settings
    if (settings.fileFormats) {
      settings.fileFormats.forEach(format => {
        if (format === 'html') this.elements.formatHtml.checked = true;
        if (format === 'json') this.elements.formatJson.checked = true;
        if (format === 'markdown') this.elements.formatMarkdown.checked = true;
      });
    }
  }

  /**
   * Check connection to background
   */
  private async checkConnection(): Promise<void> {
    try {
      log('info', 'PopupManager', 'Checking connection');
      
      this.updateConnectionStatus(chrome.i18n.getMessage('connectionChecking'), false);
      
      const isConnected = await testConnection();
      this.state.isConnected = isConnected;
      
      if (isConnected) {
        this.updateConnectionStatus(chrome.i18n.getMessage('connectionOk'), true);
      } else {
        this.updateConnectionStatus(chrome.i18n.getMessage('connectionFailed'), false);
      }
      
      log('info', 'PopupManager', 'Connection check complete', { isConnected });
    } catch (error) {
      log('error', 'PopupManager', 'Connection check failed', error);
      this.updateConnectionStatus(chrome.i18n.getMessage('connectionError'), false);
    }
  }

  /**
   * Update connection status UI
   */
  private updateConnectionStatus(message: string, isConnected: boolean): void {
    this.elements.connectionStatus.textContent = message;
    this.elements.connectionDot.className = `connection-dot ${isConnected ? 'connected' : 'disconnected'}`;
  }

  /**
   * Handle save settings
   */
  private async handleSaveSettings(): Promise<void> {
    if (this.state.isSaving) return;

    try {
      log('info', 'PopupManager', 'Saving settings');
      
      this.state.isSaving = true;
      this.elements.saveBtn.disabled = true;
      this.elements.saveBtn.textContent = chrome.i18n.getMessage('saving');

      // Get current form values
      const formats: ('html' | 'markdown' | 'json')[] = [];
      if (this.elements.formatHtml.checked) formats.push('html');
      if (this.elements.formatJson.checked) formats.push('json');
      if (this.elements.formatMarkdown.checked) formats.push('markdown');

      const settings: Partial<ExtensionSettings> = {
        savePath: this.elements.savePath.value.trim(),
        fileFormats: formats,
        downloadMedia: this.elements.downloadMedia.checked
      };

      // Validate save path
      const pathError = validateSavePath(settings.savePath || '');
      if (pathError) {
        throw new Error(pathError);
      }

      // Save settings
      await saveSettings(settings);
      
      // Update state
      this.state.settings = { ...this.state.settings, ...settings };
      
      this.showSuccess(chrome.i18n.getMessage('settingsSavedSuccess'));
      log('info', 'PopupManager', 'Settings saved successfully', settings);
    } catch (error) {
      log('error', 'PopupManager', 'Failed to save settings', error);
      this.showError(error instanceof Error ? error.message : chrome.i18n.getMessage('errorSaveSettingsFailed'));
    } finally {
      this.state.isSaving = false;
      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.textContent = chrome.i18n.getMessage('saveSettingsButton');
    }
  }

  /**
   * Handle open tweet browser
   */
  private handleOpenBrowser(): void {
    log('info', 'PopupManager', 'Opening tweet browser');
    openTweetBrowser();
  }

  /**
   * Handle open help page
   */
  private handleOpenHelp(): void {
    log('info', 'PopupManager', 'Opening help page');
    openHelpPage();
  }

  /**
   * Validate save path input
   */
  private validateSavePathInput(): void {
    try {
      const path = this.elements.savePath.value.trim();
      const error = validateSavePath(path);
      
      if (error) {
        this.elements.savePath.style.borderColor = '#f44336';
        this.showError(error);
      } else {
        this.elements.savePath.style.borderColor = '#ddd';
        this.hideStatus();
      }
    } catch (error) {
      log('error', 'PopupManager', 'Failed to validate save path input', error);
      this.showError('保存路径验证失败');
    }
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = 'status success';
    this.elements.statusMessage.classList.remove('hidden');
    
    setTimeout(() => {
      this.hideStatus();
    }, 3000);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.state.lastError = message;
    this.elements.statusMessage.textContent = message;
    this.elements.statusMessage.className = 'status error';
    this.elements.statusMessage.classList.remove('hidden');
  }

  /**
   * Hide status message
   */
  private hideStatus(): void {
    this.elements.statusMessage.classList.add('hidden');
  }

  /**
   * Get current state
   */
  public getState(): PopupState {
    return { ...this.state };
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    new PopupManager();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
  }
});

// Export for testing
export { PopupManager }; 