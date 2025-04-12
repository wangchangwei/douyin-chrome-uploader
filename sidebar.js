document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadExcelBtn = document.getElementById('uploadExcelBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const stopBatchBtn = document.getElementById('stopBatchBtn');
  const status = document.getElementById('status');
  const fixedFilePath = document.getElementById('localFilePath').value;
  const excelFileInput = document.getElementById('excelFile');
  const excelFileInfo = document.getElementById('excelFileInfo');
  
  // 批量上传进度元素
  const batchProgressContainer = document.getElementById('batchProgressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progressPercent = document.getElementById('progressPercent');
  const batchList = document.getElementById('batchList');
  
  // 设置标签切换
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有active类
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      
      // 添加active类到当前元素
      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
  
  // 获取表单输入元素
  const titleInput = document.getElementById('videoTitle');
  const descriptionInput = document.getElementById('videoDescription');
  const publishDateInput = document.getElementById('publishDate');
  
  // 设置发布日期默认值为明天
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  const hours = String(tomorrow.getHours()).padStart(2, '0');
  const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
  publishDateInput.value = `${year}-${month}-${day} ${hours}:${minutes}`;
  
  // 显示初始化提示
  updateStatus('设置参数并点击上传按钮发布视频', '#000', '#FFFFFF');
  
  // 下载Excel模板按钮点击事件
  downloadExcelBtn.addEventListener('click', function() {
    downloadExcelTemplate();
  });
  
  // 生成并下载Excel模板
  function downloadExcelTemplate() {
    // 检查XLSX库是否已加载
    if (typeof XLSX === 'undefined') {
      console.error('XLSX库未加载');
      updateStatus('Excel库未加载，请刷新页面后重试', '#FFF', '#FF3B30');
      return;
    }
    
    try {
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 创建示例数据
      const exampleData = [
        {
          "视频标题": "示例视频标题1",
          "视频简介": "这是一个示例简介，描述视频内容",
          "发布时间": `${year}-${month}-${day} ${hours}:${minutes}`,
          "视频路径": "/Users/用户名/Videos/示例视频1.mp4"
        },
        {
          "视频标题": "示例视频标题2",
          "视频简介": "第二个示例视频的简介",
          "发布时间": `${year}-${month}-${Number(day)+1} ${hours}:${minutes}`,
          "视频路径": "/Users/用户名/Videos/示例视频2.mp4"
        }
      ];
      
      // 将数据转换为工作表
      const ws = XLSX.utils.json_to_sheet(exampleData);
      
      // 设置列宽
      ws['!cols'] = [
        { wch: 20 }, // 标题列宽
        { wch: 40 }, // 简介列宽
        { wch: 20 }, // 发布时间列宽
        { wch: 50 }  // 视频路径列宽
      ];
      
      // 将工作表添加到工作簿
      XLSX.utils.book_append_sheet(wb, ws, "上传数据");
      
      // 生成Excel文件并下载
      XLSX.writeFile(wb, "抖音批量上传模板.xlsx");
      
      updateStatus('Excel模板已下载', '#FFF', '#4CD964');
    } catch (err) {
      console.error('生成Excel模板出错:', err);
      updateStatus('生成Excel模板出错: ' + err.message, '#FFF', '#FF3B30');
    }
  }
  
  // 单个上传按钮点击事件
  uploadBtn.addEventListener('click', function() {
    // 获取文件路径
    let filePath = fixedFilePath;
    
    // 获取用户输入的参数
    const title = titleInput.value.trim() || `自动上传测试视频 ${new Date().toLocaleString()}`;
    const description = descriptionInput.value.trim() || `这是通过Chrome插件自动上传的测试视频，发布时间：${new Date().toLocaleString()}`;
    const publishDate = publishDateInput.value.trim() || `${year}-${month}-${day} ${hours}:${minutes}`;
    
    // 检查当前是否在抖音创作者中心页面
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (tab.url.includes('creator.douyin.com')) {
        updateStatus('正在准备上传...', '#FFF', '#FE2C55');
        
        // 先查找文件输入选择器
        chrome.tabs.sendMessage(tab.id, {
          action: 'findFileInputSelector',
          parameters: {
            title: title,
            description: description,
            publishDate: publishDate,
            isRemoteUrl: false
          }
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            updateStatus('错误: 无法连接到页面，请刷新后重试', '#FFF', '#FF3B30');
            return;
          }
          
          if (!response || !response.success) {
            updateStatus('错误: 无法找到文件输入元素', '#FFF', '#FF3B30');
            return;
          }
          
          const selector = response.selector;
          console.log('找到文件输入选择器:', selector);
          
          // 使用chrome.debugger API上传本地文件
          chrome.runtime.sendMessage({
            action: 'uploadFileWithDebugger',
            tabId: tab.id,
            filePath: filePath, // 使用固定路径
            selector: selector, // 使用找到的选择器
            parameters: {
              title: title,
              description: description,
              publishDate: publishDate,
              isRemoteUrl: false
            }
          }, function(debuggerResponse) {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
              updateStatus('错误: ' + chrome.runtime.lastError.message, '#FFF', '#FF3B30');
              return;
            }
            
            if (debuggerResponse && debuggerResponse.success) {
              updateStatus('文件上传成功，正在等待页面跳转到编辑页面...', '#FFF', '#4CD964');
              
              // 显示自动填写进度的提示
              setTimeout(() => {
                updateStatus('将自动填写视频信息并发布（使用您设置的参数）', '#FFF', '#4CD964');
              }, 3000);
            } else {
              updateStatus(debuggerResponse?.error || '上传请求发送失败', '#FFF', '#FF3B30');
            }
          });
        });
      } else {
        updateStatus('请先打开抖音创作者中心页面', '#FFF', '#FF9500');
      }
    });
  });
  
  // Excel文件选择事件
  let excelData = null;
  excelFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
      excelFileInfo.textContent = '';
      uploadExcelBtn.disabled = true;
      return;
    }
    
    // 检查文件类型
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      excelFileInfo.textContent = '请选择有效的Excel文件(.xlsx或.xls)';
      uploadExcelBtn.disabled = true;
      return;
    }
    
    excelFileInfo.textContent = `已选择文件: ${file.name}，正在解析...`;
    
    // 确认XLSX库已加载
    if (typeof XLSX === 'undefined') {
      console.error('XLSX库未加载');
      excelFileInfo.textContent = 'Excel解析库未加载，请刷新页面重试';
      uploadExcelBtn.disabled = true;
      return;
    }
    
    // 读取并解析Excel文件
    readExcelFile(file).then(data => {
      if (!data || !data.length) {
        excelFileInfo.textContent = '无法解析Excel文件或文件为空';
        uploadExcelBtn.disabled = true;
        return;
      }
      
      // 验证Excel数据
      const valid = validateExcelData(data);
      if (!valid) {
        excelFileInfo.textContent = 'Excel格式错误，需要包含标题、简介、发布时间和视频路径列';
        uploadExcelBtn.disabled = true;
        return;
      }
      
      excelData = data;
      excelFileInfo.textContent = `已解析成功，共${data.length}条数据待上传`;
      uploadExcelBtn.disabled = false;
    }).catch(err => {
      console.error('Excel解析出错:', err);
      excelFileInfo.textContent = `解析Excel出错: ${err.message || '未知错误'}`;
      uploadExcelBtn.disabled = true;
    });
  });
  
  // 批量上传按钮点击事件
  uploadExcelBtn.addEventListener('click', function() {
    if (!excelData || !excelData.length) {
      updateStatus('没有可上传的数据', '#FFF', '#FF3B30');
      return;
    }
    
    // 检查当前是否在抖音创作者中心页面
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (tab.url.includes('creator.douyin.com')) {
        // 开始批量上传
        updateStatus('准备批量上传，共'+excelData.length+'个文件...', '#FFF', '#FE2C55');
        
        // 显示批量进度区域
        batchProgressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = `0/${excelData.length}`;
        progressPercent.textContent = '0%';
        
        // 清空批量列表
        batchList.innerHTML = '';
        
        // 为每个待上传项创建一个占位元素
        excelData.forEach((item, index) => {
          const itemElement = document.createElement('div');
          itemElement.className = 'batch-item pending';
          itemElement.id = `batch-item-${index}`;
          
          // 尝试找到文件名
          let fileName = '未知文件';
          for (const key in item) {
            if (key.toLowerCase().includes('路径') || key.toLowerCase().includes('文件') || 
                key.toLowerCase().includes('视频') || key.toLowerCase().includes('地址') ||
                key.toLowerCase().includes('path') || key.toLowerCase().includes('file') ||
                key.toLowerCase().includes('video')) {
              const path = item[key] || '';
              fileName = path.split('/').pop() || path.split('\\').pop() || '未知文件';
              break;
            }
          }
          
          itemElement.textContent = `${index + 1}. ${fileName}`;
          batchList.appendChild(itemElement);
        });
        
        // 将Excel数据储存到background脚本中
        chrome.runtime.sendMessage({
          action: 'storeExcelData',
          excelData: excelData
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            updateBatchItemStatus(0, '存储Excel数据失败: ' + chrome.runtime.lastError.message, false);
            return;
          }
          
          if (response && response.success) {
            // 开始第一个文件的上传
            chrome.tabs.sendMessage(tab.id, {
              action: 'startBatchUpload',
              index: 0,
              totalItems: excelData.length // 添加总项目数
            }, function(startResponse) {
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                updateBatchItemStatus(0, '无法开始批量上传: ' + chrome.runtime.lastError.message, false);
                return;
              }
              
              if (!startResponse || !startResponse.success) {
                updateBatchItemStatus(0, startResponse?.error || '开始批量上传失败', false);
              } else {
                updateBatchItemStatus(0, '正在处理...', null);
              }
            });
          } else {
            updateStatus('存储Excel数据失败', '#FFF', '#FF3B30');
          }
        });
      } else {
        updateStatus('请先打开抖音创作者中心页面', '#FFF', '#FF9500');
      }
    });
  });
  
  // 读取Excel文件
  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          try {
            const data = e.target.result;
            const workbook = XLSX.read(data, {type: 'binary'});
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        };
        
        reader.onerror = function(err) {
          reject(err);
        };
        
        reader.readAsBinaryString(file);
      } catch (err) {
        reject(err);
      }
    });
  }
  
  // 验证Excel数据格式
  function validateExcelData(data) {
    if (!data || !data.length) return false;
    
    // 获取第一行的键，检查是否包含所需的列
    const firstRow = data[0];
    const keys = Object.keys(firstRow).map(k => k.toLowerCase());
    
    // 检查是否包含标题、简介和路径相关的列
    const hasTitleCol = keys.some(k => k.includes('标题') || k.includes('title'));
    const hasDescCol = keys.some(k => k.includes('简介') || k.includes('描述') || k.includes('desc'));
    const hasPathCol = keys.some(k => 
      k.includes('路径') || k.includes('文件') || k.includes('视频') || 
      k.includes('地址') || k.includes('path') || k.includes('file') || 
      k.includes('video')
    );
    
    return hasTitleCol && hasPathCol; // 至少需要标题和路径
  }
  
  // 更新状态显示
  function updateStatus(message, textColor, bgColor) {
    status.textContent = message;
    status.style.color = textColor || '#000';
    status.style.backgroundColor = bgColor || 'transparent';
    
    if (bgColor) {
      status.style.padding = '10px';
      status.style.borderRadius = '5px';
    } else {
      status.style.padding = '0';
    }
  }
  
  // 更新批量项的状态
  function updateBatchItemStatus(index, message, success) {
    const item = document.getElementById(`batch-item-${index}`);
    if (!item) return;
    
    // 移除所有状态类
    item.classList.remove('pending', 'success', 'error');
    
    if (success === true) {
      item.classList.add('success');
    } else if (success === false) {
      item.classList.add('error');
    } else {
      item.classList.add('pending');
    }
    
    item.textContent = `${index + 1}. ${message}`;
  }
  
  // 监听来自background的批量上传进度更新
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateBatchProgress') {
      // 更新进度条
      const current = request.current;
      const total = request.total;
      const percent = Math.round((current / total) * 100);
      
      progressFill.style.width = `${percent}%`;
      progressText.textContent = `${current}/${total}`;
      progressPercent.textContent = `${percent}%`;
      
      // 更新对应项的状态
      const index = current - 1;
      updateBatchItemStatus(index, request.message, request.success);
      
      // 如果成功完成所有上传，显示成功消息
      if (current === total && request.success) {
        updateStatus('批量上传完成！', '#FFF', '#4CD964');
      }
    } else if (request.action === 'uploadStarted') {
      updateStatus(request.message || '上传已开始', '#FFF', '#FE2C55');
    } else if (request.action === 'uploadComplete') {
      if (request.success) {
        updateStatus(request.message || '上传完成', '#FFF', '#4CD964');
      } else {
        updateStatus(request.error || '上传失败', '#FFF', '#FF3B30');
      }
    } else if (request.action === 'updatePublishStatus') {
      updateStatus(request.message || '', '#FFF', request.success ? '#4CD964' : '#FF3B30');
    }
  });
  
  // 停止批量上传按钮点击事件
  stopBatchBtn.addEventListener('click', function() {
    // 确认用户是否真的要停止
    if (confirm('确定要停止当前批量上传任务吗？')) {
      // 查询当前活动标签
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
          // 发送停止命令到content script
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'stopBatchUpload'
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('发送停止命令失败:', chrome.runtime.lastError);
              updateStatus('停止命令发送失败，请重试', '#FFF', '#FF3B30');
            } else {
              updateStatus('已停止批量上传', '#FFF', '#FF9500');
            }
          });
        } else {
          updateStatus('无法获取当前标签页', '#FFF', '#FF3B30');
        }
      });
    }
  });
  
  // 添加日志查看按钮点击事件
  document.getElementById('viewLogsBtn').addEventListener('click', function() {
    // 从background获取日志
    chrome.runtime.sendMessage({
      action: 'getBatchUploadLogs'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('获取日志失败:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        const logs = response.logs || [];
        console.log('批量上传日志:', logs);
        
        // 显示日志模态框
        const logModal = document.getElementById('logModal');
        const logContent = document.getElementById('logContent');
        
        // 清空旧内容
        logContent.innerHTML = '';
        
        if (logs.length === 0) {
          logContent.textContent = '暂无日志记录';
        } else {
          // 创建日志内容
          logs.forEach(log => {
            const logItem = document.createElement('div');
            logItem.className = 'log-item ' + (log.success ? 'success' : log.success === false ? 'error' : 'info');
            
            const time = new Date(log.timestamp).toLocaleTimeString();
            logItem.innerHTML = `
              <div class="log-time">${time}</div>
              <div class="log-message">[${log.index + 1}] ${log.message}</div>
            `;
            
            logContent.appendChild(logItem);
          });
        }
        
        // 显示模态框
        logModal.style.display = 'block';
      }
    });
  });
}); 