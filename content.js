// 全局变量
let isUploadInProgress = false;
const FIXED_FILE_PATH = '/Users/wangchangwei/Desktop/a.mp4'; // 固定的文件路径
let currentBatchIndex = -1; // 当前批量上传的索引
let isBatchUploadMode = false; // 是否处于批量上传模式
let batchUploadTotalItems = 0; // 批量上传的总项目数
let uploadPageMonitorTimer = null; // 上传页面监听定时器
let uploadInProgressStartTime = null; // 记录上传开始的时间
let lastProcessedIndex = -1; // 记录上一次处理的索引，用于避免重复处理
let lastNotOnUploadPageTime = null; // 记录上次不在上传页面的时间，用于避免重复导航

// 初始化：从存储恢复状态
initFromStorage();

// 从本地存储恢复状态
function initFromStorage() {
  try {
    // 使用sessionStorage保存批量上传状态
    const savedState = sessionStorage.getItem('douyinUploaderState');
    if (savedState) {
      const state = JSON.parse(savedState);
      console.log('从存储恢复状态:', state);
      
      // 恢复全局状态
      isBatchUploadMode = state.isBatchUploadMode || false;
      
      // 只在isBatchUploadMode为true时才恢复索引，避免错误地恢复为-1
      if (state.isBatchUploadMode) {
        currentBatchIndex = state.currentBatchIndex === undefined ? 0 : state.currentBatchIndex;
        batchUploadTotalItems = state.batchUploadTotalItems || 1;
      } else if (currentBatchIndex >= 0) {
        // 如果当前已有有效索引而存储的模式是false，保留当前索引不变
        console.log('存储中批量模式为false，但当前索引有效，保留当前索引:', currentBatchIndex);
      } else {
        currentBatchIndex = -1;
        batchUploadTotalItems = 0;
      }
      
      console.log('批量上传状态已恢复: 模式=', isBatchUploadMode, 
                '索引=', currentBatchIndex, '总数=', batchUploadTotalItems);
    }
  } catch (error) {
    console.error('恢复状态失败:', error);
  }
}

// 保存状态到本地存储
function saveStateToStorage() {
  try {
    const state = {
      isBatchUploadMode,
      currentBatchIndex,
      batchUploadTotalItems
    };
    sessionStorage.setItem('douyinUploaderState', JSON.stringify(state));
    console.log('已保存状态到存储:', state);
  } catch (error) {
    console.error('保存状态失败:', error);
  }
}

// 监听页面卸载，保存状态
window.addEventListener('beforeunload', function() {
  console.log('页面卸载前保存状态');
  saveStateToStorage();
});

// 创建一个实用工具对象
const utils = {
  sleep: function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  simulateClick: function(element) {
    if (!element) return false;
    
    try {
      // 尝试多种点击方法
      
      // 方法1: 原生click
      element.click();
      return true;
    } catch (e1) {
      console.log('原生click失败:', e1);
      
      try {
        // 方法2: MouseEvent
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        element.dispatchEvent(clickEvent);
        return true;
      } catch (e2) {
        console.log('MouseEvent失败:', e2);
        
        try {
          // 方法3: 创建并触发点击事件
          const evt = document.createEvent('MouseEvents');
          evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
          element.dispatchEvent(evt);
          return true;
        } catch (e3) {
          console.log('createEvent失败:', e3);
          
          try {
            // 方法4: 使用触发器
            const clickTrigger = document.createEvent('HTMLEvents');
            clickTrigger.initEvent('click', true, false);
            element.dispatchEvent(clickTrigger);
            return true;
          } catch (e4) {
            console.log('所有点击方法都失败:', e4);
            return false;
          }
        }
      }
    }
  },
  
  // 查找发布按钮的高级方法
  findPublishButton: function() {
    // 1. 直接通过CSS类查找
    let btn = document.querySelector('button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw');
    if (btn) return btn;
    
    // 2. 在确认容器中查找
    const container = document.querySelector('.content-confirm-container-Wp91G7');
    if (container) {
      const buttons = container.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('发布')) {
          return button;
        }
      }
    }
    
    // 3. 查找所有具有'primary'类的按钮
    const primaryButtons = document.querySelectorAll('button[class*="primary"]');
    for (const button of primaryButtons) {
      if (button.textContent.includes('发布')) {
        return button;
      }
    }
    
    // 4. 通过文本内容查找
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      if (button.textContent.trim() === '发布' && !button.disabled) {
        return button;
      }
    }
    
    // 5. 查找任何包含"发布"文本的按钮
    for (const button of allButtons) {
      if (button.textContent.includes('发布') && !button.disabled) {
        return button;
      }
    }
    
    return null;
  }
};

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Content script 收到消息:', request);
  
  if (request.action === 'uploadNativeFile') {
    // 处理来自本地应用的真实文件信息
    console.log('收到本地文件信息:', request.fileInfo);
    sendResponse({success: true});
    
    // 执行上传操作，但使用真实文件的信息
    processNativeFileUpload(request.fileInfo);
    return true;
  }
  
  if (request.action === 'startUpload') {
    // 直接使用固定文件路径
    if (!isUploadInProgress) {
      // 检查当前页面是否为抖音创作者中心上传页面
      if (isUploadPage()) {
        sendResponse({success: true});
        startUploadProcess();
      } else {
        // 如果不是上传页面，尝试导航到上传页面
        navigateToUploadPage().then(() => {
          sendResponse({success: true});
        }).catch(error => {
          console.error('导航到上传页面失败:', error);
          sendResponse({success: false, error: '无法导航到上传页面'});
        });
        return true; // 异步响应
      }
    } else {
      sendResponse({success: false, error: '上传已在进行中'});
    }
    return true;
  }
  
  if (request.action === 'readyForUpload') {
    // 从background.js收到准备好上传的消息
    console.log('准备开始上传文件:', FIXED_FILE_PATH);
    startUploadProcess();
    sendResponse({success: true}); // 添加响应
    return true;
  }
  
  if (request.action === 'findFileInputSelector') {
    // 添加超时保护
    let hasResponded = false;
    const timeoutId = setTimeout(() => {
      if (!hasResponded) {
        console.warn('查找选择器操作超时，发送失败响应');
        hasResponded = true;
        sendResponse({success: false, error: '查找选择器操作超时'});
      }
    }, 10000); // 10秒超时
    
    // 查找文件输入元素并返回选择器
    findBestFileInputSelector().then(selector => {
      console.log('找到最佳文件输入选择器:', selector);
      clearTimeout(timeoutId);
      if (!hasResponded) {
        hasResponded = true;
        sendResponse({success: true, selector: selector});
      }
      
      // 保存用户传递的参数
      if (request.parameters) {
        saveParameters(request.parameters);
      }
      
      // 监听上传成功后的页面变化
      observePageForEditForm();
    }).catch(error => {
      console.error('查找文件输入选择器失败:', error);
      clearTimeout(timeoutId);
      if (!hasResponded) {
        hasResponded = true;
        sendResponse({success: false, error: error.message});
      }
    });
    
    return true; // 异步响应
  }
  
  // 接收来自background.js的参数更新
  if (request.action === 'updateParameters') {
    if (request.parameters) {
      console.log('收到参数更新:', request.parameters);
      saveParameters(request.parameters);
    }
    sendResponse({success: true}); // 添加响应
    return true;
  }
  
  // 开始批量上传
  if (request.action === 'startBatchUpload') {
    console.log('📣📣📣 收到开始批量上传请求 - 当前时间:', new Date().toLocaleTimeString());
    isBatchUploadMode = true;
    currentBatchIndex = request.index || 0;
    batchUploadTotalItems = request.totalItems || 0;
    
    // 保存状态到存储
    saveStateToStorage();
    
    if (isUploadInProgress) {
      console.log('❌ 批量上传失败: 上传已在进行中');
      sendResponse({success: false, error: '上传已在进行中'});
      return true;
    }
    
    // 添加超时保护
    let hasResponded = false;
    const timeoutId = setTimeout(() => {
      if (!hasResponded) {
        console.warn('⚠️ 批量上传操作超时，发送失败响应');
        hasResponded = true;
        sendResponse({success: false, error: '批量上传操作超时'});
      }
    }, 10000); // 10秒超时
    
    // 先完全停止任何可能存在的监控器
    stopUploadPageMonitor();
    
    // 再重新启动上传页面监听
    console.log('🔄 启动新的上传页面监控器');
    startUploadPageMonitor();
    
    // 检查当前页面是否为抖音创作者中心上传页面
    console.log('🔍 检查当前是否在上传页面');
    const isOnUploadPage = isUploadPage();
    console.log('是否在上传页面:', isOnUploadPage);
    
    if (!isOnUploadPage) {
      // 如果不是上传页面，尝试导航到上传页面
      console.log('🚀 尝试导航到上传页面');
      navigateToUploadPage().then(() => {
        console.log('✅ 导航成功，开始处理批量上传项目');
        startBatchUploadItem(currentBatchIndex);
        clearTimeout(timeoutId);
        if (!hasResponded) {
          hasResponded = true;
          sendResponse({success: true});
        }
      }).catch(error => {
        console.error('❌ 导航到上传页面失败:', error);
        sendBatchProgressUpdate(currentBatchIndex, '无法导航到上传页面', false, batchUploadTotalItems);
        clearTimeout(timeoutId);
        if (!hasResponded) {
          hasResponded = true;
          sendResponse({success: false, error: '无法导航到上传页面'});
        }
      });
    } else {
      // 开始处理当前索引的文件
      console.log('✅ 已在上传页面，直接开始处理批量上传项目');
      startBatchUploadItem(currentBatchIndex);
      clearTimeout(timeoutId);
      if (!hasResponded) {
        hasResponded = true;
        sendResponse({success: true});
      }
    }
    
    return true; // 异步响应
  }
  
  // 停止批量上传
  if (request.action === 'stopBatchUpload') {
    stopUploadPageMonitor();
    isBatchUploadMode = false;
    currentBatchIndex = -1;
    batchUploadTotalItems = 0;
    
    // 保存状态到存储
    saveStateToStorage();
    
    sendResponse({success: true});
    return true;
  }
  
  // 默认情况下，不需要异步响应
  return false;
});

// 开始监控上传页面
function startUploadPageMonitor() {
  console.log('🚀🚀🚀 开始监控上传页面 - 当前时间:', new Date().toLocaleTimeString());
  // 先停止任何可能存在的监控器
  stopUploadPageMonitor();
  
  // 设置一个间隔定时器，每3秒检查一次
  uploadPageMonitorInterval = setInterval(() => {
    // 添加非常明显的日志标识，确保能在控制台看到
    console.log('\n====================');
    console.log('⏱️⏱️⏱️ 上传页面监控检查 - 时间:', new Date().toLocaleTimeString());
    console.log('====================\n');
    
    // 检查是否在上传页面
    const onUploadPage = isUploadPage();
    console.log('当前是否在上传页面:', onUploadPage);
    console.log('批量上传模式:', isBatchUploadMode);
    console.log('上传进行中:', isUploadInProgress);
    console.log('当前批量索引:', currentBatchIndex);
    console.log('批量总项目数:', batchUploadTotalItems);
    
    // 如果没有在上传中且处于批量上传模式，并且在上传页面 - 处理下一个项目
    if (!isUploadInProgress && isBatchUploadMode && onUploadPage) {
      console.log('🟢 条件满足，启动下一项上传:', currentBatchIndex);
      
      // 如果最后处理的索引和当前批量索引相同，可能是重复处理
      if (lastProcessedIndex === currentBatchIndex) {
        console.log('⚠️ 检测到可能的重复处理 lastProcessedIndex:', lastProcessedIndex);
        // 只有在确认会处理下一个索引时，才更新lastProcessedIndex
        if (currentBatchIndex + 1 < batchUploadTotalItems) {
          console.log('✓ 将处理下一个索引:', currentBatchIndex + 1);
        } else {
          console.log('⚠️ 没有更多项目需要处理');
          return; // 没有更多项目，不需要重复处理当前索引
        }
      }
      
      // 更新最后处理的索引
      lastProcessedIndex = currentBatchIndex;
      console.log('✓ 更新 lastProcessedIndex =', lastProcessedIndex);
      
      // 开始处理当前索引对应的项目
      startBatchUploadItem(currentBatchIndex);
    } 
    // 如果不在上传页面但需要上传下一个项目
    else if (!isUploadInProgress && isBatchUploadMode && !onUploadPage && currentBatchIndex >= 0) {
      console.log('🟡 需要导航到上传页面');
      
      // 判断是否已经过了足够的时间（避免频繁导航）
      const now = Date.now();
      if (!lastNavigationTime || (now - lastNavigationTime > 10000)) { // 10秒内不重复导航
        lastNavigationTime = now;
        console.log('🌐 尝试导航到上传页面');
        
        // 保存当前状态到sessionStorage
        sessionStorage.setItem('isBatchUploadMode', 'true');
        sessionStorage.setItem('currentBatchIndex', String(currentBatchIndex));
        sessionStorage.setItem('batchUploadTotalItems', String(batchUploadTotalItems));
        
        // 导航到上传URL
        navigateToUploadUrl()
          .catch(error => {
            console.log('⚠️ 导航失败:', error);
            return forceNavigateToUploadPage();
          })
          .catch(error => {
            console.error('❌ 所有导航方法失败:', error);
            
            // 最后的尝试：直接设置URL
            window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
          });
      } else {
        console.log('⏳ 等待导航冷却时间，上次导航:', new Date(lastNavigationTime).toLocaleTimeString());
      }
    }
    // 检查上传是否超时
    else if (isUploadInProgress && uploadInProgressStartTime) {
      const now = Date.now();
      const elapsedTime = now - uploadInProgressStartTime;
      console.log(`⏱️ 当前上传已进行: ${Math.floor(elapsedTime/1000)}秒`);
      
      // 如果上传时间超过预设时间（5分钟），则认为上传卡住
      if (elapsedTime > 5 * 60 * 1000) {
        console.warn('⚠️ 上传似乎已卡住，正在重置状态');
        // 重置上传状态
        isUploadInProgress = false;
        uploadInProgressStartTime = null;
        
        // 如果在上传页面且处于批量模式，尝试处理下一个
        if (onUploadPage && isBatchUploadMode) {
          console.log('🔄 尝试继续处理下一个');
          processBatchNext(currentBatchIndex, batchUploadTotalItems);
        }
      }
    }
    
    console.log('\n====================');
    console.log('⏱️⏱️⏱️ 监控检查结束');
    console.log('====================\n');
  }, 3000);
  
  console.log('✅ 监控器已启动，intervalId:', uploadPageMonitorInterval);
  return uploadPageMonitorInterval;
}

// 停止上传页面监听器
function stopUploadPageMonitor() {
  if (uploadPageMonitorTimer) {
    console.log('🛑🛑🛑 停止上传页面监控器, 定时器ID:', uploadPageMonitorTimer);
    clearInterval(uploadPageMonitorTimer);
    uploadPageMonitorTimer = null;
  } else {
    console.log('没有活动的监控器需要停止');
  }
}

// 开始处理批量上传中的单个项目
async function startBatchUploadItem(index) {
  console.log(`开始处理批量上传项目 [${index}]`);
  
  // 添加索引有效性检查
  if (index < 0 || index === undefined) {
    console.error('🔴 错误: 收到无效的批量索引:', index);
    // 尝试从存储中恢复正确的索引
    if (checkAndPreserveBatchState() && currentBatchIndex >= 0) {
      console.log('✅ 已从存储恢复批量状态，使用当前索引:', currentBatchIndex);
      index = currentBatchIndex;
    } else {
      console.error('❌ 无法恢复有效的批量索引，停止批量上传');
      return;
    }
  }
  
  // 检查是否在重复处理同一个项目
  console.log('当前处理索引:', index, '上次处理索引:', lastProcessedIndex);
  if (lastProcessedIndex === index) {
    console.warn('⚠️ 检测到重复处理同一索引:', index, '尝试处理下一个项目');
    console.log('当前批量总数:', batchUploadTotalItems);
    
    // 强制移动到下一个索引
    const nextIndex = index + 1;
    if (nextIndex < batchUploadTotalItems) {
      console.log('强制跳到下一个索引:', nextIndex);
      currentBatchIndex = nextIndex;
      saveStateToStorage();
      
      // 延迟启动下一个以避免循环
      setTimeout(() => {
        if (!isUploadInProgress) {
          startBatchUploadItem(nextIndex);
        }
      }, 3000);
    } else {
      console.log('已经是最后一个项目，批量上传完成');
    }
    return;
  }
  
  // 更新上次处理的索引
  lastProcessedIndex = index;
  console.log('更新lastProcessedIndex =', lastProcessedIndex);
  
  if (isUploadInProgress) {
    console.log('警告: 上传已在进行中，等待完成或超时');
    return;
  }
  
  isUploadInProgress = true;
  uploadInProgressStartTime = new Date().getTime(); // 记录开始时间
  
  // 从background.js获取Excel数据项
  chrome.runtime.sendMessage({
    action: 'getExcelItemData',
    index: index
  }, async function(response) {
    if (chrome.runtime.lastError) {
      console.error('获取Excel数据失败:', chrome.runtime.lastError);
      sendBatchProgressUpdate(index, '获取Excel数据失败: ' + chrome.runtime.lastError.message, false);
      // 重置上传状态
      isUploadInProgress = false;
      uploadInProgressStartTime = null;
      // 尝试处理下一个
      setTimeout(() => {
        processBatchNext(index, 1); // 假设至少有一个项目
      }, 1000);
      return;
    }
    
    if (!response || !response.success) {
      console.error('获取Excel数据项失败:', response?.error || '未知错误');
      sendBatchProgressUpdate(index, response?.error || '获取Excel数据失败', false);
      // 重置上传状态
      isUploadInProgress = false;
      uploadInProgressStartTime = null;
      // 尝试处理下一个
      setTimeout(() => {
        processBatchNext(index, 1); // 假设至少有一个项目
      }, 1000);
      return;
    }
    
    const item = response.data;
    const totalItems = response.totalItems;
    
    // 提取路径、标题、简介和发布时间
    let filePath = '';
    let title = '';
    let description = '';
    let publishDate = '';
    
    // 查找文件路径
    for (const key in item) {
      if (key.toLowerCase().includes('路径') || key.toLowerCase().includes('文件') || 
          key.toLowerCase().includes('视频') || key.toLowerCase().includes('地址') ||
          key.toLowerCase().includes('path') || key.toLowerCase().includes('file') ||
          key.toLowerCase().includes('video')) {
        filePath = item[key];
      }
      
      if (key.toLowerCase().includes('标题') || key.toLowerCase().includes('title')) {
        title = item[key];
      }
      
      if (key.toLowerCase().includes('简介') || key.toLowerCase().includes('描述') || 
          key.toLowerCase().includes('desc') || key.toLowerCase().includes('description')) {
        description = item[key];
      }
      
      if (key.toLowerCase().includes('时间') || key.toLowerCase().includes('发布') || 
          key.toLowerCase().includes('time') || key.toLowerCase().includes('publish')) {
        publishDate = item[key];
      }
    }
    
    if (!filePath) {
      console.error('Excel数据中未找到文件路径');
      sendBatchProgressUpdate(index, '无法找到视频文件路径', false, totalItems);
      // 尝试处理下一个
      processBatchNext(index, totalItems);
      return;
    }
    
    // 发送进度更新
    sendBatchProgressUpdate(index, `开始处理: ${filePath}`, true, totalItems);
    
    try {
      // 查找文件输入选择器
      const selector = await findBestFileInputSelector();
      console.log(`批量[${index}]: 找到文件输入选择器:`, selector);
      
      // 设置参数
      const parameters = {
        title: title || `批量上传视频 ${index+1} - ${new Date().toLocaleString()}`,
        description: description || `这是通过Chrome插件批量上传的视频 ${index+1}，发布时间：${new Date().toLocaleString()}`,
        publishDate: publishDate || null,
        batchMode: true,
        batchIndex: index,
        batchTotal: totalItems
      };
      
      // 保存参数
      saveParameters(parameters);
      
      // 发送上传请求
      chrome.runtime.sendMessage({
        action: 'uploadFileWithDebugger',
        tabId: await getCurrentTabId(),
        filePath: filePath,
        selector: selector,
        parameters: parameters
      }, function(debuggerResponse) {
        if (chrome.runtime.lastError) {
          console.error(`批量[${index}]: 上传失败:`, chrome.runtime.lastError);
          sendBatchProgressUpdate(index, '上传失败: ' + chrome.runtime.lastError.message, false, totalItems);
          // 重置上传状态
          isUploadInProgress = false;
          uploadInProgressStartTime = null;
          processBatchNext(index, totalItems);
          return;
        }
        
        if (debuggerResponse && debuggerResponse.success) {
          sendBatchProgressUpdate(index, '文件上传成功，等待页面跳转...', true, totalItems);
          
          // 监听上传成功后的页面变化
          observePageForEditForm(index, totalItems);
        } else {
          console.error(`批量[${index}]: 上传失败:`, debuggerResponse?.error);
          sendBatchProgressUpdate(index, debuggerResponse?.error || '上传失败', false, totalItems);
          // 重置上传状态
          isUploadInProgress = false;
          uploadInProgressStartTime = null;
          processBatchNext(index, totalItems);
        }
      });
    } catch (error) {
      console.error(`批量[${index}]: 处理出错:`, error);
      sendBatchProgressUpdate(index, '错误: ' + error.message, false, totalItems);
      processBatchNext(index, totalItems);
    }
  });
}

// 获取当前标签页ID
function getCurrentTabId() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({action: 'getCurrentTabId'}, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('获取标签页ID时出错:', chrome.runtime.lastError);
          // 使用备用方法
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs.length > 0) {
              resolve(tabs[0].id);
            } else {
              // 如果都失败，返回一个占位符ID
              console.error('无法获取标签页ID');
              resolve(-1);
            }
          });
          return;
        }
        
        if (response && response.tabId) {
          resolve(response.tabId);
        } else {
          // 备用方法
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs.length > 0) {
              resolve(tabs[0].id);
            } else {
              console.error('无法获取标签页ID');
              resolve(-1);
            }
          });
        }
      });
    } catch (error) {
      console.error('发送获取标签页ID消息失败:', error);
      // 备用方法
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0].id);
        } else {
          console.error('无法获取标签页ID');
          resolve(-1);
        }
      });
    }
  });
}

// 处理批量上传的下一个项目
function processBatchNext(currentIndex, totalItems) {
  console.log(`🔄🔄🔄 处理批量上传的下一个项目: 当前索引=${currentIndex}, 总数=${totalItems} - 时间:`, new Date().toLocaleTimeString());
  console.log('当前状态:');
  console.log('- 批量模式:', isBatchUploadMode);
  console.log('- 上传进行中:', isUploadInProgress);
  console.log('- 当前URL:', window.location.href);
  console.log('- 上次处理索引:', lastProcessedIndex);
  
  // 确保上传状态被重置
  if (isUploadInProgress) {
    console.log('🔴 重置上传状态 isUploadInProgress: true -> false');
    isUploadInProgress = false;
  }
  
  if (uploadInProgressStartTime) {
    console.log('🔴 重置上传开始时间 uploadInProgressStartTime: 有值 -> null');
    uploadInProgressStartTime = null;
  }
  
  const nextIndex = currentIndex + 1;
  
  if (nextIndex < totalItems) {
    console.log(`🟢 准备处理下一个批量项目: ${nextIndex}/${totalItems}`);
    currentBatchIndex = nextIndex; // 更新全局索引
    batchUploadTotalItems = totalItems; // 确保总项目数正确
    
    // 保存状态到存储
    saveStateToStorage();
    
    // 检查当前是否在上传页面，如果不是则导航过去
    const isOnUploadPage = isUploadPage();
    if (!isOnUploadPage) {
      console.log('🔴 当前不在上传页面，尝试导航');
      
      // 记录当前URL以便调试
      console.log('当前页面URL:', window.location.href);
      
      // 保存强制刷新标志位到sessionStorage
      sessionStorage.setItem('forceRefreshUploadPage', 'true');
      sessionStorage.setItem('nextBatchIndex', String(nextIndex));
      sessionStorage.setItem('batchTotalItems', String(totalItems));
      
      // 尝试多种方法导航到上传页面
      navigateToUploadUrl()
        .catch(() => {
          console.log('⚠️ 直接导航失败，尝试强制导航');
          return forceNavigateToUploadPage();
        })
        .then(() => {
          console.log('✅ 成功导航到上传页面，等待页面稳定');
          // 延迟一会儿再处理下一个，确保页面已完全加载
          sendBatchProgressUpdate(nextIndex, '已导航到上传页面，准备处理下一个项目', true, totalItems);
          return utils.sleep(5000);
        })
        .then(() => {
          console.log('🟢 页面已加载完毕，开始处理下一个项目，时间:', new Date().toLocaleTimeString());
          
          // 确保不会重复处理同一个索引
          if (lastProcessedIndex === nextIndex) {
            console.warn('⚠️ 检测到处理重复索引，更新lastProcessedIndex');
            lastProcessedIndex = currentIndex; // 回退到当前索引，这样下一个才能正常处理
          }
          
          setTimeout(() => {
            startBatchUploadItem(nextIndex);
          }, 1000);
        })
        .catch(error => {
          console.error('❌ 所有导航方法都失败:', error);
          
          // 最后的尝试：直接设置URL并刷新页面
          console.log('⚠️ 最后尝试：直接设置URL并刷新');
          window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
          sendBatchProgressUpdate(nextIndex, '直接修改URL导航到上传页面', true, totalItems);
          
          // 通过setTimeout确保这个设置生效
          setTimeout(() => {
            if (isUploadPage()) {
              console.log('✅ 成功跳转到上传页面，处理下一个');
              
              // 确保不会重复处理同一个索引
              if (lastProcessedIndex === nextIndex) {
                console.warn('⚠️ 检测到处理重复索引，更新lastProcessedIndex');
                lastProcessedIndex = currentIndex;
              }
              
              startBatchUploadItem(nextIndex);
            } else {
              console.error('❌ 无法跳转到上传页面，当前URL:', window.location.href);
              
              // 再次尝试进行导航
              console.log('⚠️ 再次尝试导航操作');
              setTimeout(() => {
                window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
                sendBatchProgressUpdate(nextIndex, '再次尝试导航到上传页面', true, totalItems);
                setTimeout(() => {
                  // 确保不会重复处理同一个索引
                  if (lastProcessedIndex === nextIndex) {
                    console.warn('⚠️ 检测到处理重复索引，更新lastProcessedIndex');
                    lastProcessedIndex = currentIndex;
                  }
                  startBatchUploadItem(nextIndex);
                }, 5000);
              }, 3000);
            }
          }, 5000);
        });
    } else {
      // 如果已经在上传页面，确保页面完全加载后再处理下一个
      console.log('✅ 已经在上传页面，准备处理下一个');
      sendBatchProgressUpdate(nextIndex, '准备处理下一个项目', true, totalItems);
      setTimeout(() => {
        startBatchUploadItem(nextIndex);
      }, 3000);
    }
  } else {
    console.log('🎉🎉🎉 批量上传已完成所有项目!');
    sendBatchProgressUpdate(currentIndex, '批量上传已完成所有项目', true, totalItems);
    // 只有在确认所有项目都已完成时，才重置状态
    isBatchUploadMode = false;
    currentBatchIndex = -1; // 这里重置为-1是正确的，因为所有项目已完成
    batchUploadTotalItems = 0;
    isUploadInProgress = false;
    stopUploadPageMonitor(); // 停止监听器
    
    // 保存状态到存储
    saveStateToStorage();
  }
}

// 发送批量进度更新
function sendBatchProgressUpdate(index, message, success, total) {
  try {
    // 生成详细日志
    const logData = {
      timestamp: new Date().toISOString(),
      index: index,
      currentUrl: window.location.href,
      message: message,
      success: success,
      isUploadPage: isUploadPage(),
      isBatchMode: isBatchUploadMode,
      isUploading: isUploadInProgress
    };
    
    // 发送进度更新给popup和sidebar
    chrome.runtime.sendMessage({
      action: 'updateBatchProgress',
      current: index + 1,
      total: total || 0,
      message: message,
      success: success,
      logData: logData
    }, function(response) {
      // 处理响应（可选）
      if (chrome.runtime.lastError) {
        console.warn('发送批量进度更新时出错（忽略）:', chrome.runtime.lastError);
      }
    });
    
    // 记录到控制台，便于调试
    console.log(`批量进度[${index+1}/${total}]: ${message}, 成功=${success}`, logData);
  } catch (error) {
    console.warn('发送批量进度更新失败（忽略）:', error);
  }
}

// 检查当前是否在上传页面
function isUploadPage() {
  // 根据URL或页面元素判断是否在上传页面
  const currentUrl = window.location.href;
  const isUploadUrl = currentUrl.includes('creator.douyin.com/creator-micro/content/upload') || 
                     currentUrl.includes('creator.douyin.com/content/upload');
                     
  // 查找特定的页面元素
  const containerDrag = document.querySelector('.container-drag-AOMYqU');
  const uploadBtn = document.querySelector('.upload-btn');
  const dataE2EUploadBtn = document.querySelector('[data-e2e="upload-btn"]');
  
  const hasUploadElements = containerDrag !== null || uploadBtn !== null || dataE2EUploadBtn !== null;
  
  console.log('🔍 isUploadPage检查:');
  console.log('- 当前URL:', currentUrl);
  console.log('- URL匹配结果:', isUploadUrl);
  console.log('- 容器元素存在:', containerDrag !== null);
  console.log('- 上传按钮存在:', uploadBtn !== null);
  console.log('- data-e2e上传按钮存在:', dataE2EUploadBtn !== null);
  console.log('- 元素匹配结果:', hasUploadElements);
  console.log('- 最终结果:', isUploadUrl || hasUploadElements);
  
  return isUploadUrl || hasUploadElements;
}

// 导航到上传页面
async function navigateToUploadPage() {
  return new Promise(async (resolve, reject) => {
    // 如果在创作者中心但不在上传页
    if (window.location.href.includes('creator.douyin.com')) {
      try {
        // 查找并点击上传按钮
        const uploadNavLink = Array.from(document.querySelectorAll('a')).find(a => 
          a.innerText.includes('上传') || 
          a.innerText.includes('发布') || 
          a.href.includes('/content/upload')
        );
        
        if (uploadNavLink) {
          utils.simulateClick(uploadNavLink);
          
          // 等待页面跳转到上传页面
          for (let i = 0; i < 25; i++) {
            await utils.sleep(200);  // 每200ms检查一次，最多等待5秒
            if (isUploadPage()) {
              return resolve();
            }
          }
          reject(new Error('等待上传页面加载超时'));
        } else {
          reject(new Error('未找到上传按钮'));
        }
      } catch (error) {
        reject(error);
      }
    } else {
      reject(new Error('当前不在抖音创作者中心'));
    }
  });
}

// 创建文件对象
function createFileFromPath(filePath) {
  // 注意：在浏览器中，由于安全限制，无法直接访问本地文件系统
  console.log(`尝试创建文件对象，路径: ${filePath}`);
  
  // 从文件路径提取文件名
  const fileName = filePath.split('/').pop();
  console.log(`文件名: ${fileName}`);
  
  try {
    // 创建一个简单的空MP4 Blob对象
    const emptyVideoData = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
      0x6D, 0x70, 0x34, 0x31
    ]);
    
    const blob = new Blob([emptyVideoData], { type: 'video/mp4' });
    console.log(`创建了Blob对象，大小: ${blob.size} 字节`);
    
    // 创建 File 对象
    const file = new File([blob], fileName, { 
      type: 'video/mp4',
      lastModified: new Date().getTime()
    });
    console.log(`成功创建文件对象: ${file.name}, 大小: ${file.size} 字节, 类型: ${file.type}`);
    return file;
  } catch (error) {
    console.error('创建文件对象失败:', error);
    throw error;
  }
}

// 开始上传流程
async function startUploadProcess() {
  if (isUploadInProgress) return;
  
  isUploadInProgress = true;
  uploadInProgressStartTime = new Date().getTime(); // 记录开始时间
  console.log('开始上传流程，使用固定文件:', FIXED_FILE_PATH);
  
  try {
    // 1. 等待页面完全加载
    await utils.sleep(1000);
    
    // 2. 查找文件输入元素
    const fileInput = await findFileInput();
    
    if (fileInput) {
      console.log('找到文件输入元素，准备上传固定文件');
      console.log('文件输入元素:', fileInput);
      console.log('元素类型:', fileInput.tagName);
      console.log('元素属性:', fileInput.attributes);
      
      // 3. 设置文件到文件输入元素
      try {
        const result = await uploadFixedFile(fileInput);
        console.log('上传结果:', result);
        
        // 通知用户上传已开始
        try {
          chrome.runtime.sendMessage({
            action: 'uploadStarted',
            success: true,
            message: '已开始上传固定文件'
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.warn('发送上传已开始消息时出错（忽略）:', chrome.runtime.lastError);
            }
          });
        } catch (error) {
          console.warn('发送上传已开始消息失败（忽略）:', error);
        }
        
        console.log('文件上传操作完成');
        
        // 监听上传成功后的页面变化
        observePageForEditForm(null, null); // 传递null表示非批量模式
      } catch (e) {
        console.error('上传文件失败:', e);
        throw new Error('上传文件失败: ' + e.message);
      }
    } else {
      throw new Error('未找到文件输入元素');
    }
    
  } catch (error) {
    console.error('上传过程出错:', error);
    
    // 通知用户上传失败
    try {
      chrome.runtime.sendMessage({
        action: 'uploadComplete',
        success: false,
        error: error.message
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('发送上传失败消息时出错（忽略）:', chrome.runtime.lastError);
        }
      });
    } catch (e) {
      console.warn('发送上传失败消息失败（忽略）:', e);
    }
  } finally {
    isUploadInProgress = false;
    uploadInProgressStartTime = null; // 重置时间
  }
}

// 查找文件输入元素
async function findFileInput() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('查找文件输入元素...');
      
      // 输出页面上所有input元素的信息，便于调试
      const allInputs = document.querySelectorAll('input');
      console.log(`页面上共有 ${allInputs.length} 个input元素`);
      
      allInputs.forEach((input, index) => {
        console.log(`Input ${index}:`, {
          type: input.type,
          id: input.id,
          name: input.name,
          class: input.className,
          hidden: input.hidden,
          display: window.getComputedStyle(input).display
        });
      });
      
      // 直接查找文件输入元素
      let fileInput = document.querySelector('input[type="file"]');
      
      if (fileInput) {
        console.log('找到文件输入元素:', fileInput);
        resolve(fileInput);
        return;
      } else {
        console.log('未找到type="file"的input元素，尝试其他方法');
      }
      
      // 如果没有直接找到，查找拖放区域
      const dragArea = document.querySelector('.container-drag-AOMYqU');
      
      if (dragArea) {
        console.log('找到拖放区域，查找其中的文件输入框');
        
        // 查找拖放区域内的所有input元素
        const inputs = dragArea.querySelectorAll('input');
        console.log(`拖放区域内有 ${inputs.length} 个input元素`);
        
        // 查找拖放区域内的文件输入框
        fileInput = dragArea.querySelector('input[type="file"]');
        
        if (fileInput) {
          console.log('在拖放区域内找到文件输入框');
          resolve(fileInput);
        } else {
          // 尝试检查拖放区域内所有input元素
          for (let input of inputs) {
            console.log('检查input元素:', input);
            if (input.type === 'file' || input.accept?.includes('video')) {
              console.log('找到候选文件输入框元素');
              resolve(input);
              return;
            }
          }
          
          // 尝试点击拖放区域，可能会显示文件选择对话框
          console.log('在拖放区域内未找到文件输入框，尝试点击拖放区域');
          utils.simulateClick(dragArea);
          
          // 点击后等待一下，再次查找文件输入框
          await utils.sleep(500);
          
          // 再次尝试查找文件输入框
          fileInput = document.querySelector('input[type="file"]');
          if (fileInput) {
            console.log('点击拖放区域后找到文件输入框');
            resolve(fileInput);
            return;
          }
          
          reject(new Error('未能找到文件输入框'));
        }
      } else {
        console.log('未找到拖放区域，尝试查找隐藏的文件输入框');
        
        // 尝试使用更宽泛的选择器查找可能的文件输入框
        const possibleFileInputs = document.querySelectorAll('input[accept*="video"], input[accept*="mp4"]');
        if (possibleFileInputs.length > 0) {
          console.log(`找到 ${possibleFileInputs.length} 个可能的文件输入框`);
          resolve(possibleFileInputs[0]);
          return;
        }
        
        reject(new Error('未找到任何可能的文件输入框'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

// 上传固定文件
async function uploadFixedFile(fileInput) {
  console.log('开始上传固定文件过程');
  
  // 创建文件对象
  const file = createFileFromPath(FIXED_FILE_PATH);
  
  // 注意：由于浏览器安全限制，无法直接设置 input[type="file"] 的值
  // 我们使用 DataTransfer API 模拟文件拖放
  try {
    console.log('尝试通过DataTransfer直接设置文件到input元素');
    
    // 创建 DataTransfer 对象
    const dataTransfer = new DataTransfer();
    
    // 添加文件到dataTransfer
    try {
      dataTransfer.items.add(file);
      console.log('成功添加文件到DataTransfer');
    } catch (e) {
      console.error('添加文件到DataTransfer失败:', e);
      throw e;
    }
    
    // 设置文件输入元素的文件
    try {
      console.log('文件输入元素前：', fileInput.files?.length || 0);
      fileInput.files = dataTransfer.files;
      console.log('文件输入元素后：', fileInput.files?.length || 0);
    } catch (e) {
      console.error('设置文件输入元素的文件失败:', e);
      throw e;
    }
    
    // 触发 change 事件，通知页面文件已选择
    try {
      const event = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(event);
      console.log('成功触发change事件');
    } catch (e) {
      console.error('触发change事件失败:', e);
      throw e;
    }
    
    // 模拟点击上传按钮（如果有）
    try {
      await utils.sleep(1000);
      const uploadButton = document.querySelector('button:contains("上传")');
      if (uploadButton) {
        console.log('找到上传按钮，点击启动上传');
        utils.simulateClick(uploadButton);
      } else {
        console.log('未找到上传按钮，文件可能已自动开始上传');
      }
    } catch (e) {
      console.log('点击上传按钮过程中出错，可能不影响上传:', e);
    }
    
    console.log('文件上传过程已完成，等待抖音处理');
    return true;
  } catch (error) {
    console.error('直接设置文件失败:', error);
    throw error;
  }
}

// 使用本地应用获取的真实文件进行上传处理
async function processNativeFileUpload(fileInfo) {
  if (isUploadInProgress) return;
  
  isUploadInProgress = true;
  console.log('开始使用本地文件上传流程:', fileInfo.file);
  
  try {
    // 1. 等待页面完全加载
    await utils.sleep(1000);
    
    // 2. 查找文件输入元素
    const fileInput = await findFileInput();
    
    if (fileInput) {
      console.log('找到文件输入元素，准备上传本地文件');
      
      // 3. 模拟点击输入元素，触发文件选择对话框
      // 这一步是为了让用户看到直观的上传操作，但实际文件选择是通过本地应用完成的
      try {
        utils.simulateClick(fileInput);
        console.log('已触发文件选择对话框，用户需要在对话框中选择文件');
        
        // 通知用户上传已开始
        try {
          chrome.runtime.sendMessage({
            action: 'uploadStarted',
            success: true,
            message: '已触发文件选择对话框，请在对话框中选择文件'
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.warn('发送上传已开始消息时出错（忽略）:', chrome.runtime.lastError);
            }
          });
        } catch (e) {
          console.warn('发送上传已开始消息失败（忽略）:', e);
        }
        
        console.log('文件上传操作已触发，用户需要手动完成选择');
      } catch (e) {
        console.error('触发文件选择失败:', e);
        throw new Error('触发文件选择失败: ' + e.message);
      }
    } else {
      throw new Error('未找到文件输入元素');
    }
    
  } catch (error) {
    console.error('上传过程出错:', error);
    
    // 通知用户上传失败
    try {
      chrome.runtime.sendMessage({
        action: 'uploadComplete',
        success: false,
        error: error.message
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('发送上传失败消息时出错（忽略）:', chrome.runtime.lastError);
        }
      });
    } catch (e) {
      console.warn('发送上传失败消息失败（忽略）:', e);
    }
  } finally {
    isUploadInProgress = false;
  }
}

// 监听页面变化，检测何时进入编辑表单页面
function observePageForEditForm(batchIndex, totalItems) {
  console.log('开始监听页面变化，等待进入编辑表单页面...');
  console.log('当前批量索引:', batchIndex, '总数:', totalItems);
  
  // 添加超时保护，确保即使页面没有变化也会继续
  const timeoutId = setTimeout(() => {
    console.warn('等待编辑表单页面超时，可能没有检测到页面变化');
    if (batchIndex !== undefined && totalItems !== undefined) {
      console.log('批量模式下的超时，尝试继续处理下一个');
      // 先检查并保留批量状态，避免批量索引被错误重置
      checkAndPreserveBatchState();
      // 确保上传状态被重置
      isUploadInProgress = false;
      uploadInProgressStartTime = null;
      
      // 确保不会重复处理同一个索引
      if (lastProcessedIndex === batchIndex) {
        console.warn('⚠️ 超时检测到处理重复索引，确保设置正确的lastProcessedIndex');
      }
      
      // 由于是超时处理，我们认为当前项目已经上传，更新lastProcessedIndex
      lastProcessedIndex = batchIndex;
      
      // 再处理下一个批量项目
      processBatchNext(batchIndex, totalItems);
    }
  }, 30000); // 30秒超时，减少等待时间以便更快继续下一个
  
  // 创建一个MutationObserver实例
  const observer = new MutationObserver((mutations) => {
    // 检查是否已进入编辑页面
    if (isEditFormPage()) {
      console.log('检测到编辑表单页面，准备自动填写信息');
      observer.disconnect(); // 停止观察
      clearTimeout(timeoutId); // 清除超时
      
      // 延迟一段时间等待表单完全加载
      setTimeout(() => {
        fillEditForm();
      }, 2000);
    }
  });
  
  // 配置观察选项
  const config = { childList: true, subtree: true };
  
  // 开始观察document.body的变化
  observer.observe(document.body, config);
}

// 检查当前是否在编辑表单页面
function isEditFormPage() {
  // 检查页面URL或特定元素
  return document.querySelector('.semi-input[placeholder*="填写作品标题"]') !== null || 
         document.querySelector('[data-placeholder="添加作品简介"]') !== null;
}

// 自动填写编辑表单
async function fillEditForm() {
  const startTime = new Date().toLocaleTimeString();
  console.log('开始自动填写编辑表单...时间:', startTime);
  
  // 获取用户设置的参数
  const parameters = getParameters();
  console.log('使用参数:', parameters);
  
  // 等待页面完全加载
  await utils.sleep(3000);
  
  // 通知popup更新状态
  if (parameters.batchMode) {
    sendBatchProgressUpdate(parameters.batchIndex, '开始填写表单...', true, parameters.batchTotal);
  } else {
    sendStatusToPopup('开始自动填写表单...', true);
  }
  
  try {
    // 1. 写标题
    const title = parameters.title || `自动上传测试视频 ${new Date().toLocaleString()}`;
    await fillTitle(title);
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '标题填写完成', true, parameters.batchTotal);
    } else {
      sendStatusToPopup('标题填写完成', true);
    }
    
    // 2. 写简介
    const description = parameters.description || `这是通过Chrome插件自动上传的测试视频，发布时间：${new Date().toLocaleString()}`;
    await fillDescription(description);
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '简介填写完成', true, parameters.batchTotal);
    } else {
      sendStatusToPopup('简介填写完成', true);
    }
    
    // 3. 设置不允许别人保存视频
    await disallowSaveVideo();
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '权限设置完成', true, parameters.batchTotal);
    } else {
      sendStatusToPopup('权限设置完成', true);
    }
    
    // 4. 修改发布时间
    await setScheduledPublish(parameters.publishDate);
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '发布时间设置完成', true, parameters.batchTotal);
    } else {
      sendStatusToPopup('发布时间设置完成', true);
    }
    
    // 等待所有表单更改生效
    await utils.sleep(2000);
    
    // 5. 点击发布
    await publish();
    
    // 无论成功或失败，确保重置上传状态
    isUploadInProgress = false;
    uploadInProgressStartTime = null;
    
    const endTime = new Date().toLocaleTimeString();
    console.log('发布操作完成，时间:', endTime);
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '发布成功！等待返回上传页面...', true, parameters.batchTotal);
      
      // 批量模式下，在页面跳转前确保保存正确的索引信息
      const currentIndex = parameters.batchIndex; // 保存当前处理的索引
      const totalItems = parameters.batchTotal; // 保存总数量
      
      // 确保批量模式标志保持打开状态
      if (!isBatchUploadMode) {
        console.log('🔄 重新激活批量模式标志，可能被错误关闭');
        isBatchUploadMode = true;
      }
      
      // 更新lastProcessedIndex，标记当前索引已经处理完成
      lastProcessedIndex = currentIndex;
      console.log('📝 更新lastProcessedIndex =', lastProcessedIndex);
      
      // 立即保存状态到存储，确保页面跳转不会丢失当前状态
      saveStateToStorage();
      
      // 延长等待时间，确保publish函数完成并有足够时间处理页面跳转
      setTimeout(() => {
        console.log('检查是否需要处理下一个批量项目，时间:', new Date().toLocaleTimeString());
        // 再次检查并确保批量状态正确
        checkAndPreserveBatchState();
        
        if (isUploadPage()) {
          console.log('已在上传页面，处理下一个批量项目');
          processBatchNext(currentIndex, totalItems);
        } else {
          console.log('尚未回到上传页面，尝试手动导航');
          // 导航前再次确保保存正确的状态
          isBatchUploadMode = true;
          currentBatchIndex = currentIndex;
          batchUploadTotalItems = totalItems;
          saveStateToStorage();
          
          navigateToUploadUrl()
            .then(() => {
              console.log('导航成功，处理下一个批量项目');
              // 再次确保批量状态正确
              isBatchUploadMode = true;
              currentBatchIndex = currentIndex;
              batchUploadTotalItems = totalItems;
              saveStateToStorage();
              processBatchNext(currentIndex, totalItems);
            })
            .catch(error => {
              console.error('导航到上传页面失败:', error);
              // 尝试强制导航
              forceNavigateToUploadPage()
                .then(() => {
                  console.log('强制导航到上传页面成功');
                  processBatchNext(currentIndex, totalItems);
                })
                .catch(navError => {
                  console.error('强制导航失败，尝试直接修改URL', navError);
                  try {
                    window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
                    // 使用setTimeout代替await
                    setTimeout(() => {
                      processBatchNext(currentIndex, totalItems);
                    }, 2000); // 给页面跳转2秒时间
                  } catch (urlError) {
                    console.error('直接修改URL也失败了', urlError);
                    processBatchNext(currentIndex, totalItems);
                  }
                });
            });
        }
      }, 8000); // 增加到8秒等待时间，确保有足够时间处理页面跳转
    } else {
      sendStatusToPopup('已成功发布视频！', true);
    }
    
    console.log('编辑表单填写完成，已点击发布按钮');
  } catch (error) {
    console.error('自动填写表单失败:', error);
    
    // 确保重置上传状态
    isUploadInProgress = false;
    uploadInProgressStartTime = null;
    
    if (parameters.batchMode) {
      sendBatchProgressUpdate(parameters.batchIndex, '填写表单失败: ' + error.message, false, parameters.batchTotal);
      // 尝试继续下一个，先导航回上传页面
      setTimeout(() => {
        navigateToUploadUrl().then(() => {
          processBatchNext(parameters.batchIndex, parameters.batchTotal);
        }).catch(navError => {
          console.error('导航到上传页面失败:', navError);
          // 尝试强制导航
          forceNavigateToUploadPage().then(() => {
            processBatchNext(parameters.batchIndex, parameters.batchTotal);
          }).catch(forceNavError => {
            console.error('强制导航也失败:', forceNavError);
            
            // 最后尝试直接设置URL
            window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
            setTimeout(() => {
              processBatchNext(parameters.batchIndex, parameters.batchTotal);
            }, 3000);
          });
        });
      }, 3000);
    } else {
      sendStatusToPopup('填写表单失败: ' + error.message, false);
    }
  }
}

// 发送状态更新消息到popup
function sendStatusToPopup(message, success) {
  try {
    chrome.runtime.sendMessage({
      action: 'updatePublishStatus',
      message: message,
      success: success
    }, function(response) {
      // 处理响应（可选）
      if (chrome.runtime.lastError) {
        console.warn('发送状态更新时出错（忽略）:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.warn('发送状态更新失败（忽略）:', error);
  }
}

// 填写标题
async function fillTitle(title) {
  return new Promise((resolve, reject) => {
    try {
      console.log('填写标题:', title);
      const titleInput = document.querySelector('.semi-input[placeholder*="填写作品标题"]');
      
      if (titleInput) {
        // 设置值
        titleInput.value = title;
        
        // 触发input事件，确保抖音页面检测到值的变化
        const inputEvent = new Event('input', { bubbles: true });
        titleInput.dispatchEvent(inputEvent);
        
        // 触发change事件
        const changeEvent = new Event('change', { bubbles: true });
        titleInput.dispatchEvent(changeEvent);
        
        console.log('标题填写成功');
        resolve();
      } else {
        console.error('未找到标题输入框');
        reject(new Error('未找到标题输入框'));
      }
    } catch (error) {
      console.error('填写标题时出错:', error);
      reject(error);
    }
  });
}

// 填写简介
async function fillDescription(description) {
  return new Promise((resolve, reject) => {
    try {
      console.log('填写简介:', description);
      const descriptionEditor = document.querySelector('[data-placeholder="添加作品简介"]');
      
      if (descriptionEditor) {
        // 由于这是一个复杂的编辑器，我们需要尝试几种方法
        // 但只使用一种方法，避免重复填充
        
        try {
          // 方法1：使用focus和execCommand方法
          // 先清空现有内容
          descriptionEditor.innerHTML = '';
          
          // 聚焦编辑器
          descriptionEditor.focus();
          
          // 使用execCommand插入文本
          const result = document.execCommand('insertText', false, description);
          
          if (!result) {
            throw new Error('execCommand方法失败，尝试其他方法');
          }
          
          console.log('使用execCommand方法填写简介成功');
        } catch (innerError) {
          console.log('方法1失败，尝试方法2:', innerError);
          
          // 方法2：直接设置内容
          descriptionEditor.innerHTML = `<div class="ace-line" data-node="true"><div data-line-wrapper="true" dir="auto"><span class="" data-leaf="true"><span data-string="true">${description}</span></span></div></div>`;
          console.log('使用innerHTML方法填写简介成功');
        }
        
        // 触发input事件，确保抖音页面检测到值的变化
        const inputEvent = new Event('input', { bubbles: true });
        descriptionEditor.dispatchEvent(inputEvent);
        
        console.log('简介填写完成');
        resolve();
      } else {
        console.error('未找到简介编辑器');
        reject(new Error('未找到简介编辑器'));
      }
    } catch (error) {
      console.error('填写简介时出错:', error);
      reject(error);
    }
  });
}

// 设置不允许别人保存视频
async function disallowSaveVideo() {
  return new Promise((resolve, reject) => {
    try {
      console.log('设置不允许别人保存视频');
      
      // 查找"不允许"选项的checkbox
      const disallowCheckbox = Array.from(document.querySelectorAll('label.radio-d4zkru')).find(
        label => label.textContent.includes('不允许')
      );
      
      if (disallowCheckbox) {
        const checkbox = disallowCheckbox.querySelector('input[type="checkbox"]');
        
        if (checkbox && !checkbox.checked) {
          // 点击复选框
          checkbox.click();
          console.log('已选择不允许保存视频');
        } else {
          console.log('不允许保存视频已是选中状态');
        }
        
        resolve();
      } else {
        console.log('未找到不允许保存视频选项，可能默认已选中');
        resolve();
      }
    } catch (error) {
      console.error('设置不允许保存视频时出错:', error);
      reject(error);
    }
  });
}

// 设置定时发布
async function setScheduledPublish(customDate) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('设置定时发布');
      
      // 1. 查找并点击"定时发布"选项
      const scheduleLabel = Array.from(document.querySelectorAll('label.radio-d4zkru')).find(
        label => label.textContent.includes('定时发布')
      );
      
      if (scheduleLabel) {
        const radioInput = scheduleLabel.querySelector('input[type="checkbox"]');
        
        if (radioInput && !radioInput.checked) {
          // 点击选择定时发布
          radioInput.click();
          console.log('已选择定时发布');
          
          // 等待时间选择器出现
          await new Promise(r => setTimeout(r, 1000));
          
          // 2. 设置发布时间
          const dateInput = document.querySelector('.semi-datepicker input[format*="yyyy-MM-dd HH:mm"]');
          
          if (dateInput) {
            let formattedDate;
            
            if (customDate) {
              // 使用用户提供的日期
              formattedDate = customDate;
              console.log('使用用户设置的发布时间:', formattedDate);
            } else {
              // 计算明天的日期和时间
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              
              // 格式化为yyyy-MM-dd HH:mm格式
              const year = tomorrow.getFullYear();
              const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
              const day = String(tomorrow.getDate()).padStart(2, '0');
              const hours = String(tomorrow.getHours()).padStart(2, '0');
              const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
              
              formattedDate = `${year}-${month}-${day} ${hours}:${minutes}`;
              console.log('使用默认发布时间(明天):', formattedDate);
            }
            
            // 设置日期值
            dateInput.value = formattedDate;
            
            // 触发input事件
            const inputEvent = new Event('input', { bubbles: true });
            dateInput.dispatchEvent(inputEvent);
            
            // 触发change事件
            const changeEvent = new Event('change', { bubbles: true });
            dateInput.dispatchEvent(changeEvent);
            
            // 点击日期输入框外的区域，关闭日期选择器
            document.body.click();
            
            console.log('已设置发布时间为:', formattedDate);
          } else {
            console.error('未找到日期时间输入框');
          }
        } else {
          console.log('定时发布已是选中状态');
        }
        
        resolve();
      } else {
        console.error('未找到定时发布选项');
        reject(new Error('未找到定时发布选项'));
      }
    } catch (error) {
      console.error('设置定时发布时出错:', error);
      reject(error);
    }
  });
}

// 点击发布按钮
async function publish() {
  return new Promise((resolve, reject) => {
    try {
      console.log('准备点击发布按钮');
      
      // 获取当前参数，判断是否是批量模式
      const parameters = getParameters();
      const isBatchMode = parameters.batchMode;
      
      // 记录发布前的URL，用于判断是否成功跳转
      const startUrl = window.location.href;
      console.log('发布前页面URL:', startUrl);
      
      // 查找发布按钮
      setTimeout(async () => {
        // 使用高级辅助函数查找按钮
        let publishBtn = utils.findPublishButton();
        
        // 如果没找到，尝试特定选择器 - 您提供的发布按钮选择器
        if (!publishBtn) {
          console.log('高级方法未找到按钮，尝试特定选择器');
          publishBtn = document.querySelector('.content-confirm-container-Wp91G7 button.button-dhlUZE.primary-cECiOJ.fixed-J9O8Yw');
        }
        
        // 如果还是没找到，使用更通用的选择器
        if (!publishBtn) {
          console.log('特定选择器未找到按钮，查找容器内的主要按钮');
          const container = document.querySelector('.content-confirm-container-Wp91G7');
          if (container) {
            publishBtn = container.querySelector('button');
          }
        }
        
        // 打印所有按钮信息以进行调试
        console.log('页面上所有的按钮:');
        const allButtons = Array.from(document.querySelectorAll('button'));
        allButtons.forEach((btn, index) => {
          console.log(`按钮 ${index}: 文本="${btn.textContent}", class="${btn.className}", disabled=${btn.disabled}`);
        });
        
        // 通过文本内容查找
        if (!publishBtn) {
          console.log('尝试通过文本内容查找');
          publishBtn = allButtons.find(btn => 
            (btn.textContent.includes('发布') || btn.textContent.trim() === '发布') && 
            !btn.disabled
          );
        }
        
        if (publishBtn) {
          console.log('找到发布按钮:', publishBtn);
          console.log('发布按钮文本:', publishBtn.textContent);
          console.log('发布按钮类名:', publishBtn.className);
          
          // 等待一会再点击
          await utils.sleep(500);
          
          // 使用我们增强的utils.simulateClick方法
          const clickResult = utils.simulateClick(publishBtn);
          console.log('点击发布按钮结果:', clickResult);
          
          // 确认发布，可能会有二次确认弹窗
          setTimeout(async () => {
            // 查找确认按钮
            let confirmBtns = Array.from(document.querySelectorAll('button')).filter(btn => 
              btn.textContent.includes('确认') || 
              btn.textContent.includes('确定')
            );
            
            if (confirmBtns.length > 0) {
              console.log('找到确认按钮，点击');
              await utils.sleep(500); // 等待确认弹窗完全显示
              const confirmResult = utils.simulateClick(confirmBtns[0]);
              console.log('确认按钮点击结果:', confirmResult);
            } else {
              console.log('未找到确认按钮，可能不需要二次确认');
            }
            
            // 检查是否为批量模式，如果是则准备导航回上传页面
            if (isBatchMode) {
              console.log('批量模式，准备在发布后返回上传页面');
              
              // 足够长的等待时间，确保发布请求完成
              await utils.sleep(5000);
              
              // 检查页面URL是否已经变化
              if (window.location.href === startUrl) {
                console.log('页面URL未变化，可能需要手动导航');
                
                // 强制导航回上传页面
                try {
                  await forceNavigateToUploadPage();
                  console.log('强制导航到上传页面成功');
                  resolve();
                } catch (navError) {
                  console.error('强制导航失败，尝试直接修改URL', navError);
                  try {
                    window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
                    await utils.sleep(2000); // 给页面跳转一些时间
                    resolve();
                  } catch (urlError) {
                    console.error('直接修改URL也失败了', urlError);
                    resolve(); // 即使失败也继续处理
                  }
                }
              } else {
                console.log('页面URL已变化，现在是:', window.location.href);
                
                // 检查当前是否已经在上传页面
                if (isUploadPage()) {
                  console.log('已经在上传页面，可以继续下一个上传');
                  resolve();
                } else {
                  console.log('不在上传页面，尝试导航');
                  try {
                    await navigateToUploadUrl();
                    console.log('导航到上传页面成功');
                    resolve();
                  } catch (error) {
                    console.error('导航回上传页面失败:', error);
                    // 尝试使用另一种方法导航
                    try {
                      await forceNavigateToUploadPage();
                      resolve();
                    } catch(e) {
                      console.error('所有导航方法均失败');
                      resolve(); // 即使失败也继续处理
                    }
                  }
                }
              }
            } else {
              resolve();
            }
          }, 2000); // 增加等待时间，确保按钮点击事件能被处理
        } else {
          console.error('未找到发布按钮');
          // 添加调试信息
          console.log('当前页面URL:', window.location.href);
          
          // 尝试查找任意按钮
          const anyButton = document.querySelector('button');
          if (anyButton) {
            console.log('页面上存在按钮，但没有找到发布按钮');
            console.log('其中一个按钮:', anyButton.outerHTML);
            console.log('父元素结构:', anyButton.parentElement.outerHTML);
          }
          
          // 在批量模式下，即使找不到发布按钮也应该继续处理下一个视频
          if (isBatchMode) {
            console.log('批量模式下找不到发布按钮，尝试继续处理下一个视频');
            try {
              await navigateToUploadUrl();
              resolve();
            } catch (error) {
              console.error('导航失败，但仍继续处理');
              resolve();
            }
          } else {
            reject(new Error('未找到发布按钮，请检查页面结构'));
          }
        }
      }, 3000); // 增加等待时间，确保页面充分加载
    } catch (error) {
      console.error('点击发布按钮时出错:', error);
      reject(error);
    }
  });
}

// 直接导航到上传页面URL
function navigateToUploadUrl() {
  return new Promise((resolve, reject) => {
    console.log('直接导航到上传页面URL');
    
    try {
      // 直接通过修改location导航到上传页面
      window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
      
      // 检查是否成功导航
      const checkNavigation = setInterval(() => {
        if (isUploadPage()) {
          clearInterval(checkNavigation);
          console.log('已成功导航到上传页面');
          resolve();
        }
      }, 500);
      
      // 设置导航超时
      setTimeout(() => {
        clearInterval(checkNavigation);
        
        if (!isUploadPage()) {
          console.error('导航到上传页面超时');
          reject(new Error('导航到上传页面超时'));
        }
      }, 10000); // 10秒超时
    } catch (error) {
      console.error('导航到上传页面出错:', error);
      reject(error);
    }
  });
}

// 强制导航到上传页面（通过查找并点击导航菜单）
async function forceNavigateToUploadPage() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('尝试通过点击导航菜单强制导航到上传页面');
      
      // 查找所有可能的导航按钮和链接
      const allLinks = Array.from(document.querySelectorAll('a'));
      console.log(`找到 ${allLinks.length} 个链接`);
      
      // 查找可能的上传按钮
      const uploadLinks = allLinks.filter(link => 
        link.textContent.includes('上传') || 
        link.textContent.includes('发布') ||
        (link.href && (
          link.href.includes('/content/upload') || 
          link.href.includes('/creator-micro/content/upload')
        ))
      );
      
      if (uploadLinks.length > 0) {
        console.log('找到可能的上传链接:', uploadLinks[0]);
        
        // 点击第一个找到的上传链接
        utils.simulateClick(uploadLinks[0]);
        
        // 等待页面跳转
        await utils.sleep(3000);
        
        // 检查是否成功跳转
        if (isUploadPage()) {
          console.log('通过点击导航链接成功到达上传页面');
          resolve();
        } else {
          // 尝试直接修改URL
          window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
          await utils.sleep(3000);
          
          if (isUploadPage()) {
            console.log('通过直接修改URL成功到达上传页面');
            resolve();
          } else {
            reject(new Error('无法通过点击或直接修改URL导航到上传页面'));
          }
        }
      } else {
        console.log('未找到上传链接，尝试直接修改URL');
        
        // 直接修改URL
        window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
        await utils.sleep(3000);
        
        if (isUploadPage()) {
          console.log('通过直接修改URL成功到达上传页面');
          resolve();
        } else {
          reject(new Error('无法导航到上传页面'));
        }
      }
    } catch (error) {
      console.error('强制导航到上传页面失败:', error);
      reject(error);
    }
  });
}

// 查找最佳的文件输入选择器
async function findBestFileInputSelector() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('正在查找最佳文件输入选择器...');
      
      // 1. 先尝试找到最明确的文件输入元素
      const directFileInput = document.querySelector('input[type="file"]');
      if (directFileInput) {
        console.log('找到直接的文件输入元素');
        const selector = buildUniqueSelector(directFileInput);
        return resolve(selector);
      }
      
      // 2. 查找拖放区域
      const dragArea = document.querySelector('.container-drag-AOMYqU');
      if (dragArea) {
        // 在拖放区域内查找文件输入元素
        const fileInput = dragArea.querySelector('input[type="file"]') || 
                          Array.from(dragArea.querySelectorAll('input')).find(input => 
                             input.type === 'file' || input.accept?.includes('video')
                          );
                           
        if (fileInput) {
          console.log('在拖放区域内找到文件输入元素');
          const selector = buildUniqueSelector(fileInput);
          return resolve(selector);
        }
      }
      
      // 3. 查找上传按钮
      const uploadBtn = document.querySelector('.upload-btn') || 
                         document.querySelector('[data-e2e="upload-btn"]');
                         
      if (uploadBtn) {
        // 查找上传按钮附近的文件输入元素
        const closestInputs = Array.from(document.querySelectorAll('input'));
        const fileInput = closestInputs.find(input => 
          input.type === 'file' || input.accept?.includes('video') || input.accept?.includes('image')
        );
        
        if (fileInput) {
          console.log('找到上传按钮附近的文件输入元素');
          const selector = buildUniqueSelector(fileInput);
          return resolve(selector);
        }
      }
      
      // 4. 最后尝试找到任何隐藏的文件输入元素
      const hiddenInputs = Array.from(document.querySelectorAll('input[type="file"][style*="display:none"], input[type="file"][style*="visibility:hidden"], input[type="file"][hidden]'));
      if (hiddenInputs.length > 0) {
        console.log('找到隐藏的文件输入元素');
        const selector = buildUniqueSelector(hiddenInputs[0]);
        return resolve(selector);
      }
      
      // 5. 找不到匹配元素，返回通用选择器
      reject(new Error('找不到合适的文件输入元素选择器'));
    } catch (error) {
      reject(error);
    }
  });
}

// 构建元素的唯一选择器
function buildUniqueSelector(element) {
  if (!element) return null;
  
  // 简单情况：如果元素有ID，直接返回ID选择器
  if (element.id) {
    return `#${element.id}`;
  }
  
  // 如果有class，返回标签名 + 第一个class
  if (element.classList.length > 0) {
    return `${element.tagName.toLowerCase()}.${element.classList[0]}`;
  }
  
  // 回退到简单的类型选择器
  if (element.type === 'file') {
    return 'input[type="file"]';
  }
  
  // 生成一个基于属性的选择器
  const attrs = [];
  for (const attr of element.attributes) {
    if (['type', 'name', 'accept', 'data-e2e', 'data-test'].includes(attr.name)) {
      attrs.push(`[${attr.name}="${attr.value}"]`);
    }
  }
  
  if (attrs.length > 0) {
    return `${element.tagName.toLowerCase()}${attrs.join('')}`;
  }
  
  // 最后的回退：生成一个路径选择器
  let path = '';
  let current = element;
  
  while (current && current.tagName) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector = `#${current.id}`;
      path = selector + (path ? ' > ' + path : '');
      break;
    } else if (current.classList.length > 0) {
      selector += `.${current.classList[0]}`;
    }
    
    path = selector + (path ? ' > ' + path : '');
    current = current.parentElement;
    
    // 如果路径过长，就停止
    if (path.split('>').length > 3) break;
  }
  
  return path || 'input[type="file"]';
}

// 插入jQuery-like功能，用于:contains选择器
document.querySelectorAll = (function(originalQuerySelectorAll) {
  return function(selector) {
    if (selector.includes(':contains')) {
      // 简单实现:contains选择器
      const containsText = selector.match(/:contains\("([^"]+)"\)/)[1];
      const baseSelector = selector.replace(/:contains\([^)]+\)/, '');
      
      const elements = originalQuerySelectorAll.call(this, baseSelector);
      return Array.from(elements).filter(el => 
        el.textContent.includes(containsText)
      );
    }
    return originalQuerySelectorAll.call(this, selector);
  };
})(document.querySelectorAll);

// 保存用户设置的参数
function saveParameters(parameters) {
  console.log('保存用户设置的参数:', parameters);
  window.douyinUploadParameters = parameters;
}

// 获取保存的参数
function getParameters() {
  return window.douyinUploadParameters || {};
}

// 在网页加载完成时，自动检查是否需要恢复批量上传
window.addEventListener('load', function() {
  console.log('页面加载完成，检查是否需要继续批量上传');
  
  // 检查是否是从导航到上传页面后的强制刷新
  const forceRefresh = sessionStorage.getItem('forceRefreshUploadPage');
  if (forceRefresh === 'true') {
    console.log('🚀🚀🚀 检测到强制刷新标志，尝试恢复批量上传进度');
    sessionStorage.removeItem('forceRefreshUploadPage'); // 移除标志，避免重复处理
    
    const nextIndex = parseInt(sessionStorage.getItem('nextBatchIndex') || '-1');
    const totalItems = parseInt(sessionStorage.getItem('batchTotalItems') || '0');
    
    if (nextIndex >= 0 && totalItems > 0) {
      console.log('📊 从session恢复索引信息：', nextIndex, '/', totalItems);
      
      // 设置全局状态
      isBatchUploadMode = true;
      currentBatchIndex = nextIndex;
      batchUploadTotalItems = totalItems;
      isUploadInProgress = false;
      
      // 确保lastProcessedIndex被正确设置，避免重复处理
      if (lastProcessedIndex === nextIndex) {
        lastProcessedIndex = nextIndex - 1;
      }
      
      // 保存状态到存储
      saveStateToStorage();
      
      // 启动监控器
      startUploadPageMonitor();
      
      // 延迟启动处理，确保页面完全加载
      setTimeout(() => {
        console.log('开始处理批量项目，当前索引:', currentBatchIndex);
        startBatchUploadItem(currentBatchIndex);
      }, 3000);
      
      return; // 已处理强制刷新，跳过下面的常规检查
    }
  }
  
  // 先检查并尝试恢复批量状态
  const hasBatchTask = checkAndPreserveBatchState();
  console.log('是否有批量任务:', hasBatchTask);
  
  // 如果处于批量上传模式，且当前在上传页面，尝试继续处理
  if (hasBatchTask) {
    console.log('检测到未完成的批量上传任务，将继续处理');
    
    // 打印当前状态
    console.log('当前状态:');
    console.log('- 批量模式:', isBatchUploadMode);
    console.log('- 上传进行中:', isUploadInProgress);
    console.log('- 当前索引:', currentBatchIndex);
    console.log('- 总项目数:', batchUploadTotalItems);
    console.log('- 当前URL:', window.location.href);
    console.log('- 上次处理索引:', lastProcessedIndex);
    
    // 启动监控
    startUploadPageMonitor();
    
    // 检查当前是否在上传页面
    if (isUploadPage()) {
      console.log('当前在上传页面，准备继续批量上传');
      
      // 如果当前不在上传进行中，开始下一个上传
      if (!isUploadInProgress) {
        // 确保lastProcessedIndex被正确设置，避免重复处理
        if (lastProcessedIndex === currentBatchIndex) {
          console.warn('⚠️ 检测到lastProcessedIndex等于currentBatchIndex，重置为前一个索引');
          lastProcessedIndex = currentBatchIndex - 1;
        }
        
        setTimeout(() => {
          console.log('尝试继续批量上传，当前索引:', currentBatchIndex);
          startBatchUploadItem(currentBatchIndex);
        }, 3000);
      }
    } else {
      console.log('当前不在上传页面，尝试导航到上传页面');
      
      // 尝试导航到上传页面
      navigateToUploadUrl()
        .catch(() => forceNavigateToUploadPage())
        .then(() => {
          console.log('成功导航到上传页面，准备继续批量上传');
          setTimeout(() => {
            if (!isUploadInProgress) {
              startBatchUploadItem(currentBatchIndex);
            }
          }, 3000);
        })
        .catch(error => {
          console.error('无法导航到上传页面:', error);
          // 尝试直接修改URL
          window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
        });
    }
  } else {
    console.log('没有检测到进行中的批量上传任务');
  }
});

// 添加一个全局函数用于手动测试批量上传
window.testBatchUpload = function(startIndex = 0, totalItems = 3) {
  console.log('🧪🧪🧪 手动测试批量上传 - 时间:', new Date().toLocaleTimeString());
  console.log('参数: startIndex =', startIndex, ', totalItems =', totalItems);
  
  // 检查当前状态
  console.log('当前状态:');
  console.log('- 批量模式:', isBatchUploadMode);
  console.log('- 上传进行中:', isUploadInProgress);
  console.log('- 当前索引:', currentBatchIndex);
  console.log('- 总项目数:', batchUploadTotalItems);
  console.log('- 当前URL:', window.location.href);
  
  // 重置任何可能的上传状态
  isUploadInProgress = false;
  uploadInProgressStartTime = null;
  
  // 设置批量上传模式
  isBatchUploadMode = true;
  currentBatchIndex = startIndex;
  batchUploadTotalItems = totalItems;
  
  // 保存状态
  saveStateToStorage();
  
  // 停止并重新启动监控器
  stopUploadPageMonitor();
  startUploadPageMonitor();
  
  // 检查当前是否在上传页面
  const isOnUploadPage = isUploadPage();
  console.log('是否在上传页面:', isOnUploadPage);
  
  if (!isOnUploadPage) {
    console.log('🚀 尝试导航到上传页面');
    navigateToUploadUrl()
      .then(() => {
        console.log('✅ 导航成功，开始处理批量上传项目');
        startBatchUploadItem(currentBatchIndex);
      })
      .catch(error => {
        console.error('❌ 导航到上传页面失败:', error);
        // 尝试强制导航
        console.log('⚠️ 尝试强制导航');
        forceNavigateToUploadPage()
          .then(() => {
            console.log('✅ 强制导航成功，开始处理批量上传项目');
            startBatchUploadItem(currentBatchIndex);
          })
          .catch(navError => {
            console.error('❌ 强制导航失败:', navError);
            console.log('⚠️ 尝试直接修改URL');
            window.location.href = 'https://creator.douyin.com/creator-micro/content/upload';
            setTimeout(() => {
              startBatchUploadItem(currentBatchIndex);
            }, 5000);
          });
      });
  } else {
    console.log('✅ 已在上传页面，直接开始处理批量上传项目');
    startBatchUploadItem(currentBatchIndex);
  }
  
  console.log('🧪 测试批量上传函数执行完毕');
  return '测试函数已执行，查看控制台日志以了解详情';
};

// 添加一个全局函数用于在控制台检查状态
window.checkBatchUploadStatus = function() {
  const status = {
    isBatchUploadMode,
    isUploadInProgress,
    currentBatchIndex,
    batchUploadTotalItems,
    uploadPageMonitorTimer,
    uploadInProgressStartTime,
    currentUrl: window.location.href,
    isUploadPage: isUploadPage()
  };
  
  console.log('📊 批量上传状态检查 - 时间:', new Date().toLocaleTimeString());
  console.table(status);
  
  return status;
};

// 检查是否有活动的批量上传任务，便于在页面跳转等情况下避免错误重置
function checkAndPreserveBatchState() {
  console.log('🔍🔍🔍 检查并保留批量上传状态 - 当前时间:', new Date().toLocaleTimeString());
  console.log('- 批量模式:', isBatchUploadMode);
  console.log('- 当前索引:', currentBatchIndex);
  console.log('- 总项目数:', batchUploadTotalItems);
  
  // 如果正在批量上传中但索引错误为-1，从sessionStorage尝试恢复
  if (isBatchUploadMode && currentBatchIndex < 0) {
    console.log('⚠️ 检测到状态异常: 批量模式开启但索引无效，尝试从存储恢复');
    try {
      const savedState = sessionStorage.getItem('douyinUploaderState');
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.isBatchUploadMode && state.currentBatchIndex >= 0) {
          console.log('🔄 从存储恢复索引:', state.currentBatchIndex);
          currentBatchIndex = state.currentBatchIndex;
          batchUploadTotalItems = state.batchUploadTotalItems || 1;
          // 立即保存正确的状态
          saveStateToStorage();
        }
      }
    } catch (error) {
      console.error('恢复状态失败:', error);
    }
  }
  
  // 如果没有活动的批量上传，不做任何事
  return isBatchUploadMode && currentBatchIndex >= 0;
}

// 在页面可见性变化时检查批量上传状态，避免页面切换导致状态丢失
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('🔄 页面可见性变化，检查批量上传状态');
    checkAndPreserveBatchState();
    
    // 如果在批量模式且在上传页面上，考虑重新启动监控器
    if (isBatchUploadMode && currentBatchIndex >= 0 && isUploadPage()) {
      console.log('✅ 批量上传有效，在上传页面，启动或重启监控器');
      // 停止并重新启动监控器，避免重复计时器
      stopUploadPageMonitor();
      startUploadPageMonitor();
    }
  }
});

// 添加一个全局函数用于手动修复批量上传索引问题
window.fixBatchUploadIndex = function(newIndex, totalItems) {
  console.log('🔧🔧🔧 手动修复批量上传索引 - 当前时间:', new Date().toLocaleTimeString());
  console.log('当前状态:');
  console.log('- 批量模式:', isBatchUploadMode);
  console.log('- 上传进行中:', isUploadInProgress);
  console.log('- 当前索引:', currentBatchIndex);
  console.log('- 总项目数:', batchUploadTotalItems);
  console.log('- 上次处理索引:', lastProcessedIndex);
  
  if (newIndex !== undefined) {
    console.log('设置新的当前索引:', newIndex);
    currentBatchIndex = newIndex;
    
    if (totalItems !== undefined) {
      console.log('设置新的总项目数:', totalItems);
      batchUploadTotalItems = totalItems;
    }
    
    // 重置上次处理的索引，避免重复检测问题
    lastProcessedIndex = newIndex - 1;
    console.log('重置上次处理索引为:', lastProcessedIndex);
    
    // 确保批量模式开启
    isBatchUploadMode = true;
    
    // 重置上传状态
    isUploadInProgress = false;
    uploadInProgressStartTime = null;
    
    // 保存到存储
    saveStateToStorage();
    
    // 停止并重新启动监控器
    stopUploadPageMonitor();
    startUploadPageMonitor();
    
    console.log('修复完成，新状态:');
    console.log('- 批量模式:', isBatchUploadMode);
    console.log('- 上传进行中:', isUploadInProgress);
    console.log('- 当前索引:', currentBatchIndex);
    console.log('- 总项目数:', batchUploadTotalItems);
    console.log('- 上次处理索引:', lastProcessedIndex);
    
    return '批量上传索引已修复，可以使用testBatchUpload()重新测试';
  } else {
    return '请指定新的索引值';
  }
}; 