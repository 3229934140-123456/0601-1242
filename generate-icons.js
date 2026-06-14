const fs = require('fs');
const path = require('path');

const { createCanvas, loadImage } = (() => {
  try {
    return require('canvas');
  } catch (e) {
    return null;
  }
})();

async function convertSvgToPng(svgPath, pngPath, size) {
  if (!createCanvas) {
    console.log(`[提示] 未安装 canvas 库，跳过 ${path.basename(pngPath)} 生成`);
    console.log('请运行: npm install canvas');
    console.log('或者手动将 SVG 转换为 PNG，Chrome 扩展在多数情况下也可直接使用 SVG 图标');
    return;
  }

  try {
    const svgData = fs.readFileSync(svgPath, 'utf8');
    const svgBuffer = Buffer.from(svgData);
    const img = await loadImage(svgBuffer);
    
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    
    const pngBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`✓ 已生成 ${path.basename(pngPath)} (${size}x${size})`);
  } catch (err) {
    console.error(`✗ 生成 ${path.basename(pngPath)} 失败:`, err.message);
  }
}

async function main() {
  const iconsDir = path.join(__dirname, 'icons');
  
  console.log('开始生成图标文件...\n');
  
  await convertSvgToPng(
    path.join(iconsDir, 'icon16.svg'),
    path.join(iconsDir, 'icon16.png'),
    16
  );
  
  await convertSvgToPng(
    path.join(iconsDir, 'icon48.svg'),
    path.join(iconsDir, 'icon48.png'),
    48
  );
  
  await convertSvgToPng(
    path.join(iconsDir, 'icon128.svg'),
    path.join(iconsDir, 'icon128.png'),
    128
  );
  
  console.log('\n完成！');
}

main();
