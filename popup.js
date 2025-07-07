// Twitter推文收藏器 - 设置界面脚本
class TwitterCollectorPopup {
  constructor() {
    this.init();
  }

  init() {
    document.body.classList.add('popup');
    this.loadSettings();
    this.bindEvents();
  }

  bindEvents() {
    // 表单提交事件
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // 浏览路径按钮事件
    document.getElementById('browsePath').addEventListener('click', () => {
      this.browsePath();
    });

    // 实时验证路径输入
    document.getElementById('savePath').addEventListener('input', (e) => {
      this.validatePath(e.target.value);
    });

    // 打开推文浏览器
    document.getElementById('openBrowserBtn').addEventListener('click', () => {
      this.openTweetBrowser();
    });
  }

  async loadSettings() {
    try {
      const storedSettings = await this.getStoredSettings();
      const settings = { ...storedSettings };
      let needsSave = false;

      // 如果未设置，则提供默认值
      if (!settings.savePath) {
        settings.savePath = 'Downloads/Twitter';
        needsSave = true;
      }
      if (!settings.fileFormat) {
        settings.fileFormat = 'html';
        needsSave = true;
      }
      if (typeof settings.downloadMedia !== 'boolean') {
        settings.downloadMedia = true;
        needsSave = true;
      }

      // 填充表单
      document.getElementById('savePath').value = settings.savePath;
      document.getElementById('fileFormat').value = settings.fileFormat;
      document.getElementById('downloadMedia').checked = settings.downloadMedia;

      // 如果是首次配置，自动保存默认设置
      if (needsSave) {
        settings.lastUpdated = new Date().toISOString();
        await this.storeSettings(settings);
        this.showStatus('已自动配置默认设置，可以开始收藏了！', 'success');
      } else {
        this.showStatus('设置已加载', 'success');
      }
    } catch (error) {
      console.error('加载或自动配置设置失败:', error);
      this.showStatus('加载设置失败: ' + error.message, 'error');
    }
  }

  async saveSettings() {
    try {
      const formData = new FormData(document.getElementById('settingsForm'));
      const settings = {
        savePath: formData.get('savePath').trim(),
        fileFormat: formData.get('fileFormat'),
        downloadMedia: document.getElementById('downloadMedia').checked,
        lastUpdated: new Date().toISOString()
      };

      // 验证设置
      if (!settings.savePath) {
        throw new Error('请设置保存路径');
      }

      // 清理路径
      settings.savePath = this.cleanPath(settings.savePath);

      // 保存到Chrome存储
      await this.storeSettings(settings);

      this.showStatus('设置保存成功！现在可以开始收藏推文了。', 'success');

      // 自动测试路径是否可用
      setTimeout(() => {
        this.testPath(settings.savePath);
      }, 500);

    } catch (error) {
      console.error('保存设置失败:', error);
      this.showStatus('保存失败: ' + error.message, 'error');
    }
  }

  browsePath() {
    // 获取当前路径或使用默认路径
    const currentPath = document.getElementById('savePath').value || 'Downloads/Twitter';

    // 创建简化的路径输入对话框
    const dialogHtml = `
      <div class="path-dialog-overlay" id="pathDialog">
        <div class="path-dialog">
          <h3>设置保存路径</h3>
          <p>请输入保存路径（相对于默认下载文件夹）：</p>
          <div class="custom-path-section">
            <label>保存路径：</label>
            <input type="text" id="customPathInput" value="${currentPath}" placeholder="例如：Downloads/Twitter">
            <small>路径相对于默认下载文件夹。您可以直接修改、粘贴或输入新的路径。</small>
          </div>
          <div class="path-dialog-buttons">
            <button id="pathDialogCancel">取消</button>
            <button id="pathDialogConfirm">确定</button>
          </div>
        </div>
      </div>
    `;

    // 添加对话框到页面
    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    // 绑定事件
    const dialog = document.getElementById('pathDialog');
    const customInput = document.getElementById('customPathInput');
    const confirmBtn = document.getElementById('pathDialogConfirm');
    const cancelBtn = document.getElementById('pathDialogCancel');

    // 自动选中输入框内容，方便用户直接替换
    customInput.select();
    customInput.focus();

    // 确定按钮
    confirmBtn.addEventListener('click', () => {
      const finalPath = customInput.value.trim();
      if (finalPath) {
        document.getElementById('savePath').value = finalPath;
        this.validatePath(finalPath);
        this.showStatus(`路径已设置: ${finalPath}`, 'success');
      }
      dialog.remove();
    });

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
    });

    // 点击遮罩关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });

    // ESC键关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 回车键确定
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });
  }

  validatePath(path) {
    const pathInput = document.getElementById('savePath');
    
    // 基本路径验证
    if (!path.trim()) {
      pathInput.style.borderColor = '#dc3545';
      return false;
    }

    // 相对路径验证
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      pathInput.style.borderColor = '#dc3545';
      this.showStatus('路径包含非法字符', 'error');
      return false;
    }

    // 检查路径长度
    if (path.length > 260) {
      pathInput.style.borderColor = '#dc3545';
      this.showStatus('路径过长，请使用较短的路径', 'error');
      return false;
    }

    // 检查连续的路径分隔符
    if (/[\\/]{2,}/.test(path)) {
      pathInput.style.borderColor = '#dc3545';
      this.showStatus('路径包含连续的分隔符，请使用单个 / 或 \\', 'error');
      return false;
    }

    // 检查路径是否以分隔符结尾
    if (/[\\/]$/.test(path)) {
      pathInput.style.borderColor = '#dc3545';
      this.showStatus('路径不应以分隔符结尾', 'error');
      return false;
    }

    // 相对路径验证通过
    pathInput.style.borderColor = '#28a745';
    this.showStatus('✓ 路径验证通过', 'success');
    
    return true;
  }

  cleanPath(path) {
    // 替换所有反斜杠为正斜杠，并移除多余的斜杠
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  async testPath(path) {
    try {
      const isAvailable = await chrome.runtime.sendMessage({ 
        action: 'testPath', 
        path: path 
      });

      if (isAvailable) {
        this.showStatus('路径可用', 'success');
      } else {
        // 由于安全限制，我们无法获得详细的失败原因
        this.showStatus('路径可能不可用，请检查权限或路径拼写', 'error');
      }
    } catch (error) {
      console.error('测试路径时出错:', error.message);
      // 根据错误类型提供更具体的建议
      if (error.message.includes('Extension context invalidated')) {
        this.showStatus('扩展已更新，请刷新页面后重试', 'error');
      } else {
        this.showStatus('无法验证路径，请稍后重试', 'error');
      }
    }
  }

  getStoredSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['settings'], (result) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(result.settings || {});
      });
    });
  }

  storeSettings(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ settings }, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }

  openTweetBrowser() {
    chrome.tabs.create({ url: 'tweet-browser.html' });
  }

  showStatus(message, type = 'success') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';

    // 5秒后自动隐藏
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.style.display = 'none';
      }
    }, 5000);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new TwitterCollectorPopup();
});

// 检查插件权限
chrome.permissions.contains({
  permissions: ['downloads', 'storage'],
  origins: ['https://twitter.com/*', 'https://x.com/*']
}, (hasPermissions) => {
  if (!hasPermissions) {
    document.querySelector('.content').innerHTML = `
      <div class="status-message status-error" style="display: block;">
        <strong>权限不足</strong><br>
        插件需要以下权限才能正常工作：<br>
        • 访问Twitter/X网站<br>
        • 下载文件到本地<br>
        • 存储设置信息<br><br>
        请重新安装插件或检查权限设置。
      </div>
    `;
  }
}); 