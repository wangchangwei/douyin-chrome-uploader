const fs = require('fs');
const { createCanvas } = require('canvas');

// 如果你没有canvas库，可以使用这个脚本作为参考，然后用其他工具创建图标

// 创建图标函数
function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // 绘制背景
  ctx.fillStyle = '#FE2C55'; // 抖音红色
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  
  // 绘制白色圆形
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 * 0.7, 0, Math.PI * 2);
  ctx.fill();
  
  // 绘制内部图案
  ctx.fillStyle = '#FE2C55';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 * 0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // 输出为PNG
  return canvas.toBuffer('image/png');
}

// 创建不同尺寸的图标
try {
  fs.writeFileSync('images/icon16.png', createIcon(16));
  fs.writeFileSync('images/icon48.png', createIcon(48));
  fs.writeFileSync('images/icon128.png', createIcon(128));
  console.log('图标文件已生成');
} catch (err) {
  console.error('创建图标文件失败:', err);
} 