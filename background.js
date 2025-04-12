// 与本地消息主机的连接对象
let nativePort = null;
// 存储Excel数据的全局变量
let excelBatchData = [];
// 存储批量上传日志
let batchUploadLogs = [];

// 初始化侧边栏
chrome.runtime.onInstalled.addListener(() => {
  // 设置默认侧边栏状态
  chrome.sidePanel.setOptions({ enabled: true, path: 'sidebar.html' });
  console.log('抖音自动上传助手已安装，已启用侧边栏');
});

// 在每次插件激活时检查是否为抖音创作者中心
chrome.tabs.onActivated.addListener((activeInfo) => {
  // 检查当前页面是否为抖音创作者中心
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url && tab.url.includes('creator.douyin.com')) {
      // 是抖音创作者中心页面，但不自动打开侧边栏
      console.log('检测到抖音创作者页面');
    }
  });
});

// 在页面导航到抖音创作者中心时检查
// 完全删除此功能，不再监听页面导航到抖音创作者中心
// 这是为了解决在background.js:30处停止的问题

// 连接到本地消息主机
function connectToNativeHost() {
  if (!nativePort) {
    try {
      console.log('尝试连接本地消息主机...');
      nativePort = chrome.runtime.connectNative('com.douyin.uploader');
      
      // 设置消息监听器
      nativePort.onMessage.addListener((message) => {
        console.log('收到本地消息主机的消息:', message);
        processNativeResponse(message);
      });
      
      // 设置断开连接监听器
      nativePort.onDisconnect.addListener(() => {
        console.log('与本地消息主机断开连接:', chrome.runtime.lastError);
        nativePort = null;
      });
      
      console.log('已连接到本地消息主机');
      return true;
    } catch (error) {
      console.error('连接本地消息主机失败:', error);
      nativePort = null;
      return false;
    }
  }
  return true;
}

// 处理来自本地消息主机的响应
function processNativeResponse(response) {
  if (response.success) {
    // 如果本地应用成功获取了文件，则通知content script进行上传
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'uploadNativeFile',
          fileInfo: response
        });
      }
    });
  } else {
    // 如果出现错误，则通知popup和侧边栏
    chrome.runtime.sendMessage({
      action: 'nativeError',
      error: response.error || '未知错误'
    });
  }
}

// 监听来自popup或content scripts的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('背景脚本收到消息:', request);
  
  // 获取当前标签页ID
  if (request.action === 'getCurrentTabId') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        sendResponse({success: true, tabId: tabs[0].id});
      } else {
        sendResponse({success: false, error: '找不到当前标签页'});
      }
    });
    return true; // 异步响应
  }
  
  // 打开侧边栏 - 保留此处，因为这是响应用户交互的
  if (request.action === 'openSidePanel') {
    try {
      chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      sendResponse({success: true});
    } catch (error) {
      console.error('打开侧边栏失败:', error);
      sendResponse({success: false, error: error.message});
    }
    return true;
  }
  
  // 存储Excel数据
  if (request.action === 'storeExcelData') {
    excelBatchData = request.excelData || [];
    console.log(`已存储Excel数据，共${excelBatchData.length}条记录`);
    sendResponse({success: true});
    return true;
  }
  
  // 获取指定索引的Excel数据
  if (request.action === 'getExcelItemData') {
    const index = request.index || 0;
    if (excelBatchData && index < excelBatchData.length) {
      const item = excelBatchData[index];
      sendResponse({
        success: true,
        data: item,
        totalItems: excelBatchData.length
      });
    } else {
      sendResponse({
        success: false,
        error: index < 0 ? 'Excel数据索引无效' : 'Excel数据不存在或索引超出范围'
      });
    }
    return true;
  }
  
  // 更新批量上传进度
  if (request.action === 'updateBatchProgress') {
    // 记录日志
    if (request.logData) {
      logBatchUploadStatus(request.logData);
    }
    
    // 将进度更新消息广播给所有页面（popup和sidebar）
    try {
      chrome.runtime.sendMessage(request);
    } catch (error) {
      console.error('广播进度消息失败:', error);
    }
    // 立即响应，不需要等待广播完成
    sendResponse({success: true});
    return true;
  }
  
  // 处理通过debugger上传文件请求
  if (request.action === 'uploadFileWithDebugger') {
    const tabId = request.tabId;
    const filePath = request.filePath;
    const selector = request.selector;
    const parameters = request.parameters; // 获取额外的参数
    
    console.log(`开始使用debugger API上传文件: ${filePath}, 选择器: ${selector}`);
    if (parameters) {
      console.log('上传参数:', parameters);
    }
    
    // 防止消息通道超时
    let hasResponded = false;
    
    // 添加超时保护，确保总能响应
    const timeoutId = setTimeout(() => {
      if (!hasResponded) {
        console.warn('debugger操作超时，发送失败响应');
        hasResponded = true;
        sendResponse({success: false, error: '操作超时'});
      }
    }, 15000); // 15秒超时
    
    // 首先连接debugger
    chrome.debugger.attach({tabId: tabId}, '1.3', function() {
      if (chrome.runtime.lastError) {
        console.error('连接debugger失败:', chrome.runtime.lastError);
        clearTimeout(timeoutId);
        if (!hasResponded) {
          hasResponded = true;
          sendResponse({success: false, error: chrome.runtime.lastError.message});
        }
        return;
      }
      
      console.log('已成功连接debugger');
      
      // 使用DOM.querySelector查找文件输入元素
      chrome.debugger.sendCommand({tabId: tabId}, 'DOM.getDocument', {}, function(docResult) {
        if (chrome.runtime.lastError) {
          detachDebugger(tabId);
          clearTimeout(timeoutId);
          if (!hasResponded) {
            hasResponded = true;
            sendResponse({success: false, error: chrome.runtime.lastError.message});
          }
          return;
        }
        
        chrome.debugger.sendCommand({tabId: tabId}, 'DOM.querySelector', {
          nodeId: docResult.root.nodeId,
          selector: selector
        }, function(result) {
          if (chrome.runtime.lastError || !result || !result.nodeId) {
            console.error('找不到文件输入元素:', chrome.runtime.lastError, result);
            detachDebugger(tabId);
            clearTimeout(timeoutId);
            if (!hasResponded) {
              hasResponded = true;
              sendResponse({success: false, error: '找不到文件输入元素'});
            }
            return;
          }
          
          console.log('找到文件输入元素, nodeId:', result.nodeId);
          
          // 使用DOM.setFileInputFiles设置文件
          chrome.debugger.sendCommand({tabId: tabId}, 'DOM.setFileInputFiles', {
            files: [filePath],
            nodeId: result.nodeId
          }, function() {
            if (chrome.runtime.lastError) {
              console.error('设置文件失败:', chrome.runtime.lastError);
              detachDebugger(tabId);
              clearTimeout(timeoutId);
              if (!hasResponded) {
                hasResponded = true;
                sendResponse({success: false, error: chrome.runtime.lastError.message});
              }
              return;
            }
            
            console.log('成功设置文件');
            
            // 将参数传递到content script
            if (parameters) {
              try {
                chrome.tabs.sendMessage(tabId, {
                  action: 'updateParameters',
                  parameters: parameters
                });
              } catch (error) {
                console.warn('发送参数更新消息失败，但不影响上传:', error);
              }
            }
            
            detachDebugger(tabId);
            clearTimeout(timeoutId);
            if (!hasResponded) {
              hasResponded = true;
              sendResponse({success: true});
            }
          });
        });
      });
    });
    
    return true; // 表示异步响应
  }
  
  // 获取批量上传日志
  if (request.action === 'getBatchUploadLogs') {
    sendResponse({
      success: true,
      logs: batchUploadLogs
    });
    return true;
  }
  
  // 对于其他消息，不需要异步响应
  return false;
});

// 辅助函数，断开debugger连接
function detachDebugger(tabId) {
  try {
    chrome.debugger.detach({tabId: tabId}, function() {
      if (chrome.runtime.lastError) {
        console.error('断开debugger连接失败:', chrome.runtime.lastError);
      } else {
        console.log('已断开debugger连接');
      }
    });
  } catch (error) {
    console.error('调用detach方法失败:', error);
  }
}

// 将批量上传日志写入控制台
function logBatchUploadStatus(logData) {
  if (!logData) return;
  
  // 添加到日志数组
  batchUploadLogs.push(logData);
  
  // 控制日志数量
  if (batchUploadLogs.length > 100) {
    batchUploadLogs.shift(); // 保留最新的100条日志
  }
  
  // 记录到控制台
  console.log(`批量上传日志: [${logData.index}] ${logData.message}`, logData);
} 