// 工具函数库

/**
 * 等待指定元素出现在页面上
 * @param {string} selector - CSS选择器
 * @param {number} timeout - 超时时间(毫秒)
 * @returns {Promise<Element>} - 返回匹配的元素
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // 如果元素已经存在，直接返回
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }
    
    // 设置观察器，监听DOM变化
    const observer = new MutationObserver((mutations) => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 设置超时
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`等待元素 ${selector} 超时`));
    }, timeout);
  });
}

/**
 * 安全地模拟输入到文本框
 * @param {Element} element - 要输入的元素
 * @param {string} text - 要输入的文本
 */
function simulateInput(element, text) {
  // 聚焦元素
  element.focus();
  
  // 清除当前值
  element.value = '';
  
  // 设置新值
  element.value = text;
  
  // 触发输入事件
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
  
  // 触发change事件
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
}

/**
 * 安全地模拟点击
 * @param {Element} element - 要点击的元素 
 */
function simulateClick(element) {
  // 检查元素是否可见
  const rect = element.getBoundingClientRect();
  const isVisible = rect.width > 0 && rect.height > 0;
  
  if (!isVisible) {
    console.warn('尝试点击不可见元素:', element);
  }
  
  // 触发鼠标事件链
  ['mousedown', 'mouseup', 'click'].forEach(eventType => {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(event);
  });
}

/**
 * 转换文件大小为人类可读格式
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 等待指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从完整路径中提取文件名
 * @param {string} path - 文件路径
 * @returns {string} - 文件名
 */
function getFileName(path) {
  return path.split('\\').pop().split('/').pop();
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} - 扩展名
 */
function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

// 导出工具函数
window.utils = {
  waitForElement,
  simulateInput,
  simulateClick,
  formatFileSize,
  sleep,
  getFileName,
  getFileExtension
}; 