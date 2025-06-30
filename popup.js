// Twitter推文收藏器 - 设置界面脚本
class TwitterCollectorPopup {
  constructor() {
    this.init();
  }

  init() {
    this.loadSettings();
    this.bindEvents();
  }

  bindEvents() {
    // 表单提交事件
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // 重置按钮事件
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
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

    // 打开调试工具
    document.getElementById('debugBtn').addEventListener('click', () => {
      this.openDebugTool();
    });

    // 打开帮助页面
    document.getElementById('helpBtn').addEventListener('click', () => {
      this.openHelpPage();
    });
  }

  async loadSettings() {
    try {
      const settings = await this.getStoredSettings();
      
      // 填充表单
      document.getElementById('savePath').value = settings.savePath || 'TwitterCollections';
      document.getElementById('fileFormat').value = settings.fileFormat || 'html';
      document.getElementById('downloadMedia').checked = settings.downloadMedia !== false;

      this.showStatus('设置已加载', 'success');
    } catch (error) {
      console.error('加载设置失败:', error);
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

  resetSettings() {
    if (confirm('确定要重置所有设置吗？')) {
      document.getElementById('savePath').value = 'TwitterCollections';
      document.getElementById('fileFormat').value = 'html';
      document.getElementById('downloadMedia').checked = true;
      
      this.showStatus('设置已重置', 'success');
    }
  }

  browsePath() {
    // 由于安全限制，浏览器插件无法直接打开文件夹选择器
    // 提供一些常用路径建议
    const suggestions = [
      'TwitterCollections',
      'Downloads/Twitter',
      'Documents/TwitterBackup',
      'Desktop/推文收藏',
      'Downloads/推文收藏'
    ];

    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    document.getElementById('savePath').value = suggestion;
    
    this.showStatus(`建议路径: ${suggestion}`, 'success');
  }

  validatePath(path) {
    const pathInput = document.getElementById('savePath');
    
    // 基本路径验证
    if (!path.trim()) {
      pathInput.style.borderColor = '#dc3545';
      return false;
    }

    // 检查非法字符
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      pathInput.style.borderColor = '#dc3545';
      this.showStatus('路径包含非法字符', 'error');
      return false;
    }

    pathInput.style.borderColor = '#28a745';
    return true;
  }

  cleanPath(path) {
    // 移除开头和结尾的斜杠
    path = path.replace(/^[\/\\]+|[\/\\]+$/g, '');
    
    // 标准化路径分隔符
    path = path.replace(/[\\]/g, '/');
    
    // 移除多余的斜杠
    path = path.replace(/\/+/g, '/');
    
    return path;
  }

  async testPath(path) {
    try {
      // 尝试创建一个测试文件来验证路径
      const testContent = JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        message: '这是一个测试文件，可以安全删除'
      }, null, 2);

      const testFileName = `${path}/test_${Date.now()}.json`;

      // 使用Chrome下载API测试路径
      chrome.downloads.download({
        url: 'data:application/json;charset=utf-8,' + encodeURIComponent(testContent),
        filename: testFileName,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('路径测试失败:', chrome.runtime.lastError.message);
          this.showStatus('路径测试失败: ' + chrome.runtime.lastError.message, 'error');
        } else {
          console.log('路径测试成功，下载ID:', downloadId);
          this.showStatus('路径测试成功！', 'success');
          
          // 清理测试文件
          setTimeout(() => {
            if (chrome.downloads && chrome.downloads.removeFile) {
              chrome.downloads.removeFile(downloadId, () => {
                console.log('测试文件已清理');
              });
            }
          }, 2000);
        }
      });

    } catch (error) {
      console.error('路径测试出错:', error);
      this.showStatus('路径测试出错: ' + error.message, 'error');
    }
  }

  getStoredSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'savePath', 
        'fileFormat', 
        'downloadMedia', 
        'lastUpdated'
      ], (result) => {
        resolve(result);
      });
    });
  }

  storeSettings(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  openTweetBrowser() {
    // 创建推文浏览器的HTML内容
    const browserURL = chrome.runtime.getURL('tweet-browser.html');
    chrome.tabs.create({ url: browserURL });
  }

  openDebugTool() {
    // 创建调试工具的HTML内容
    const debugURL = chrome.runtime.getURL('debug.html');
    chrome.tabs.create({ url: debugURL });
  }

  openHelpPage() {
    // 创建帮助页面的HTML内容
    const helpURL = chrome.runtime.getURL('help.html');
    chrome.tabs.create({ url: helpURL });
  }

  showStatus(message, type = 'success') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';

    // 自动隐藏状态消息
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, type === 'error' ? 5000 : 3000);
  }
}

// 页面加载完成后初始化
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