/**
 * Popup Script for GglKnow Extension
 * 
 * Main popup window script that handles settings management and UI interactions
 */

import { ExtensionSettings, PopupState } from '@/types';
import { log, debounce } from '@/utils';
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
      fileFormat: 'html',
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
    fileFormat: HTMLSelectElement;
    downloadMedia: HTMLInputElement;
    saveBtn: HTMLButtonElement;
    testBtn: HTMLButtonElement;
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
      fileFormat: document.getElementById('fileFormat') as HTMLSelectElement,
      downloadMedia: document.getElementById('downloadMedia') as HTMLInputElement,
      saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
      testBtn: document.getElementById('testBtn') as HTMLButtonElement,
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
      this.showError('初始化失败，请刷新页面重试');
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Save settings button
    this.elements.saveBtn.addEventListener('click', this.handleSaveSettings.bind(this));

    // Test connection button
    this.elements.testBtn.addEventListener('click', this.handleTestConnection.bind(this));

    // Tweet browser button
    this.elements.browserBtn.addEventListener('click', this.handleOpenBrowser.bind(this));

    // Help button
    this.elements.helpBtn.addEventListener('click', this.handleOpenHelp.bind(this));

    // Auto-save on input change (debounced)
    const debouncedSave = debounce(this.handleSaveSettings.bind(this), 1000);
    
    this.elements.savePath.addEventListener('input', debouncedSave);
    this.elements.fileFormat.addEventListener('change', debouncedSave);
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
      this.showError('加载设置失败');
    }
  }

  /**
   * Update UI with settings
   */
  private updateSettingsUI(settings: ExtensionSettings): void {
    this.elements.savePath.value = settings.savePath;
    this.elements.fileFormat.value = settings.fileFormat;
    this.elements.downloadMedia.checked = settings.downloadMedia;
  }

  /**
   * Check connection to background
   */
  private async checkConnection(): Promise<void> {
    try {
      log('info', 'PopupManager', 'Checking connection');
      
      this.updateConnectionStatus('检查连接中...', false);
      
      const isConnected = await testConnection();
      this.state.isConnected = isConnected;
      
      if (isConnected) {
        this.updateConnectionStatus('连接正常', true);
      } else {
        this.updateConnectionStatus('连接失败', false);
      }
      
      log('info', 'PopupManager', 'Connection check complete', { isConnected });
    } catch (error) {
      log('error', 'PopupManager', 'Connection check failed', error);
      this.updateConnectionStatus('连接错误', false);
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
      this.elements.saveBtn.textContent = '保存中...';

      // Get current form values
      const settings: Partial<ExtensionSettings> = {
        savePath: this.elements.savePath.value.trim(),
        fileFormat: this.elements.fileFormat.value as 'html' | 'markdown' | 'json',
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
      
      this.showSuccess('设置保存成功');
      log('info', 'PopupManager', 'Settings saved successfully', settings);
    } catch (error) {
      log('error', 'PopupManager', 'Failed to save settings', error);
      this.showError(error instanceof Error ? error.message : '保存设置失败');
    } finally {
      this.state.isSaving = false;
      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.textContent = '保存设置';
    }
  }

  /**
   * Handle test connection
   */
  private async handleTestConnection(): Promise<void> {
    try {
      this.elements.testBtn.disabled = true;
      this.elements.testBtn.textContent = '测试中...';
      
      await this.checkConnection();
      
      if (this.state.isConnected) {
        this.showSuccess('连接测试成功');
      } else {
        this.showError('连接测试失败');
      }
    } catch (error) {
      log('error', 'PopupManager', 'Connection test failed', error);
      this.showError('连接测试失败');
    } finally {
      this.elements.testBtn.disabled = false;
      this.elements.testBtn.textContent = '测试连接';
    }
  }

  /**
   * Handle open tweet browser
   */
  private handleOpenBrowser(): void {
    try {
      openTweetBrowser();
      window.close();
    } catch (error) {
      log('error', 'PopupManager', 'Failed to open tweet browser', error);
      this.showError('打开推文浏览器失败');
    }
  }

  /**
   * Handle open help
   */
  private handleOpenHelp(): void {
    try {
      openHelpPage();
      window.close();
    } catch (error) {
      log('error', 'PopupManager', 'Failed to open help page', error);
      this.showError('打开帮助页面失败');
    }
  }

  /**
   * Validate save path input
   */
  private validateSavePathInput(): void {
    const path = this.elements.savePath.value.trim();
    const error = validateSavePath(path);
    
    if (error) {
      this.elements.savePath.style.borderColor = '#f44336';
      this.showError(error);
    } else {
      this.elements.savePath.style.borderColor = '#ddd';
      this.hideStatus();
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