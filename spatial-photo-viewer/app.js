/**
 * 空间照片查看器 - 3D Gaussian Splatting 风格
 * 支持手机陀螺仪控制视角
 */

// ============ 状态管理 ============
const state = {
  currentScreen: 'upload',
  imageData: null,
  depthData: null,
  gyroEnabled: false,
  gyroPermissionGranted: false,
  orientation: { beta: 0, gamma: 0 },
  mouseControl: { isDragging: false, lastX: 0, lastY: 0, rotX: 0, rotY: 0 }
};

// ============ DOM 元素 ============
const elements = {
  screens: {
    upload: document.getElementById('upload-screen'),
    processing: document.getElementById('processing-screen'),
    viewer: document.getElementById('viewer-screen')
  },
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  previewContainer: document.getElementById('preview-container'),
  previewImage: document.getElementById('preview-image'),
  generateBtn: document.getElementById('generate-btn'),
  processingStatus: document.getElementById('processing-status'),
  progressFill: document.getElementById('progress-fill'),
  viewerCanvas: document.getElementById('viewer-canvas'),
  backBtn: document.getElementById('back-btn'),
  gyroToggle: document.getElementById('gyro-toggle'),
  gyroPermission: document.getElementById('gyro-permission'),
  grantPermissionBtn: document.getElementById('grant-permission-btn'),
  angleDisplay: document.getElementById('angle-display'),
  gyroHint: document.getElementById('gyro-hint'),
  demoButtons: document.querySelectorAll('.demo-btn')
};

// ============ 屏幕切换 ============
function showScreen(screenName) {
  Object.values(elements.screens).forEach(screen => {
    screen.classList.remove('active');
  });
  elements.screens[screenName].classList.add('active');
  state.currentScreen = screenName;
}

// ============ 文件处理 ============
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.imageData = e.target.result;
    elements.previewImage.src = state.imageData;
    elements.previewContainer.classList.remove('hidden');
    elements.dropZone.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// 拖放处理
elements.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', () => {
  elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elements.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

elements.dropZone.addEventListener('click', () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener('change', (e) => {
  handleFile(e.target.files[0]);
});

// ============ 深度估计（模拟 ML-SHARP 效果）============
async function generateDepthMap(imageData) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageDataObj.data;
      const depthMap = new Float32Array(canvas.width * canvas.height);
      
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const pixelIndex = i / 4;
        const y = Math.floor(pixelIndex / canvas.width);
        const normalizedY = y / canvas.height;
        const baseDepth = 0.3 + normalizedY * 0.5;
        const edgeVariation = Math.abs(luminance - 0.5) * 0.3;
        depthMap[pixelIndex] = Math.min(1, Math.max(0, baseDepth + edgeVariation));
      }
      
      resolve({
        depth: depthMap,
        width: canvas.width,
        height: canvas.height,
        imageData: imageDataObj
      });
    };
    img.src = imageData;
  });
}

// ============ 处理流程 ============
async function processImage() {
  showScreen('processing');
  
  const steps = [
    { status: '加载图像...', progress: 10 },
    { status: '分析场景结构...', progress: 30 },
    { status: '估计深度信息...', progress: 50 },
    { status: '生成 3D 高斯点...', progress: 70 },
    { status: '优化渲染数据...', progress: 90 },
    { status: '完成！', progress: 100 }
  ];
  
  for (const step of steps) {
    elements.processingStatus.textContent = step.status;
    elements.progressFill.style.width = `${step.progress}%`;
    await sleep(500);
  }
  
  state.depthData = await generateDepthMap(state.imageData);
  
  await sleep(300);
  showScreen('viewer');
  initViewer();
  checkGyroSupport();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

elements.generateBtn.addEventListener('click', () => {
  if (state.imageData) {
    processImage();
  }
});

// ============ 示例演示 ============
// 使用支持 CORS 的图片源
const demoImages = {
  landscape: 'https://picsum.photos/800/600?random=1',
  room: 'https://picsum.photos/800/600?random=2',
  portrait: 'https://picsum.photos/600/800?random=3'
};

elements.demoButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const demoType = btn.dataset.demo;
    const url = demoImages[demoType];
    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.textContent = '加载中...';
      
      // 使用 Image 对象直接加载，避免 fetch 跨域问题
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      
      // 转换为 data URL
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      state.imageData = canvas.toDataURL('image/jpeg', 0.9);
      elements.previewImage.src = state.imageData;
      elements.previewContainer.classList.remove('hidden');
      elements.dropZone.style.display = 'none';
      
      btn.disabled = false;
      btn.textContent = originalText;
    } catch (error) {
      console.error('加载示例失败:', error);
      btn.disabled = false;
      btn.textContent = '加载失败';
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    }
  });
});

// ============ WebGL 查看器 ============
let gl, program, positionBuffer, texCoordBuffer, texture;

function initViewer() {
  console.log('initViewer 被调用');
  
  if (!state.imageData) {
    console.error('没有图像数据');
    alert('图像数据丢失，请重新上传');
    showScreen('upload');
    return;
  }
  
  const canvas = elements.viewerCanvas;
  const container = canvas.parentElement;
  
  // 限制最大分辨率以提高移动端性能
  const maxSize = 1024;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.min(container.clientWidth * dpr, maxSize);
  const height = Math.min(container.clientHeight * dpr, maxSize);
  
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = container.clientWidth + 'px';
  canvas.style.height = container.clientHeight + 'px';
  
  // 尝试获取 WebGL 上下文，带有移动端友好的选项
  const contextOptions = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  };
  
  gl = canvas.getContext('webgl', contextOptions) || 
       canvas.getContext('experimental-webgl', contextOptions);
  
  if (!gl) {
    alert('您的浏览器不支持 WebGL，请使用现代浏览器');
    showScreen('upload');
    return;
  }
  
  console.log('WebGL 初始化成功');
  
  const vertexShaderSource = `
    precision mediump float;
    
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    
    uniform vec2 u_resolution;
    uniform float u_parallaxX;
    uniform float u_parallaxY;
    
    varying vec2 v_texCoord;
    varying float v_depth;
    
    void main() {
      vec2 position = a_position;
      
      // 应用视差效果
      float depthFactor = a_texCoord.y; // 简化的深度：上方更远
      position.x += u_parallaxX * depthFactor * 0.15;
      position.y += u_parallaxY * depthFactor * 0.1;
      
      // 转换到裁剪空间
      vec2 clipSpace = ((position / u_resolution) * 2.0 - 1.0) * vec2(1, -1);
      
      gl_Position = vec4(clipSpace, 0, 1);
      v_texCoord = a_texCoord;
      v_depth = depthFactor;
    }
  `;
  
  const fragmentShaderSource = `
    precision mediump float;
    
    uniform sampler2D u_image;
    uniform float u_parallaxX;
    uniform float u_parallaxY;
    
    varying vec2 v_texCoord;
    varying float v_depth;
    
    void main() {
      // 基于深度的纹理偏移，创建视差效果
      vec2 offset = vec2(
        u_parallaxX * v_depth * 0.02,
        u_parallaxY * v_depth * 0.015
      );
      
      vec2 texCoord = v_texCoord + offset;
      texCoord = clamp(texCoord, 0.0, 1.0);
      
      vec4 color = texture2D(u_image, texCoord);
      
      // 添加轻微的深度雾效果
      float fogFactor = v_depth * 0.1;
      color.rgb = mix(color.rgb, vec3(0.1, 0.1, 0.15), fogFactor);
      
      gl_FragColor = color;
    }
  `;
  
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  
  program = createProgram(gl, vertexShader, fragmentShader);
  
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  
  positionBuffer = gl.createBuffer();
  texCoordBuffer = gl.createBuffer();
  
  // 创建纹理
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
  // 加载图像到纹理
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    console.log('图像加载成功:', img.width, 'x', img.height);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    
    setupGeometry(img.width, img.height);
    render();
  };
  img.onerror = (e) => {
    console.error('图像加载失败:', e);
  };
  
  // 确保使用 data URL 时不需要 crossOrigin
  if (state.imageData.startsWith('data:')) {
    img.crossOrigin = null;
  }
  img.src = state.imageData;
  
  // 设置鼠标/触摸控制
  setupMouseControl(canvas);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function setupGeometry(imgWidth, imgHeight) {
  const canvas = elements.viewerCanvas;
  const canvasAspect = canvas.width / canvas.height;
  const imgAspect = imgWidth / imgHeight;
  
  let drawWidth, drawHeight;
  if (imgAspect > canvasAspect) {
    drawWidth = canvas.width;
    drawHeight = canvas.width / imgAspect;
  } else {
    drawHeight = canvas.height;
    drawWidth = canvas.height * imgAspect;
  }
  
  const x1 = (canvas.width - drawWidth) / 2;
  const y1 = (canvas.height - drawHeight) / 2;
  const x2 = x1 + drawWidth;
  const y2 = y1 + drawHeight;
  
  // 创建网格以支持视差变形
  const gridSize = 20;
  const positions = [];
  const texCoords = [];
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const u0 = gx / gridSize;
      const v0 = gy / gridSize;
      const u1 = (gx + 1) / gridSize;
      const v1 = (gy + 1) / gridSize;
      
      const px0 = x1 + u0 * drawWidth;
      const py0 = y1 + v0 * drawHeight;
      const px1 = x1 + u1 * drawWidth;
      const py1 = y1 + v1 * drawHeight;
      
      // 两个三角形组成一个网格单元
      positions.push(
        px0, py0, px1, py0, px0, py1,
        px0, py1, px1, py0, px1, py1
      );
      
      texCoords.push(
        u0, v0, u1, v0, u0, v1,
        u0, v1, u1, v0, u1, v1
      );
    }
  }
  
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
  
  state.vertexCount = positions.length / 2;
}

function render() {
  if (!gl || !program) return;
  
  const canvas = elements.viewerCanvas;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.04, 0.04, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  gl.useProgram(program);
  
  // 设置位置属性
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  
  // 设置纹理坐标属性
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texCoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  
  // 设置 uniforms
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  
  // 计算视差值
  let parallaxX, parallaxY;
  
  if (state.gyroEnabled && state.gyroPermissionGranted) {
    parallaxX = state.orientation.gamma / 45;  // gamma: -90 ~ 90
    parallaxY = (state.orientation.beta - 45) / 45;  // beta: -180 ~ 180，默认45度拿手机
  } else {
    parallaxX = state.mouseControl.rotY / 30;
    parallaxY = state.mouseControl.rotX / 30;
  }
  
  parallaxX = Math.max(-1, Math.min(1, parallaxX));
  parallaxY = Math.max(-1, Math.min(1, parallaxY));
  
  const parallaxXLocation = gl.getUniformLocation(program, 'u_parallaxX');
  const parallaxYLocation = gl.getUniformLocation(program, 'u_parallaxY');
  gl.uniform1f(parallaxXLocation, parallaxX);
  gl.uniform1f(parallaxYLocation, parallaxY);
  
  // 绑定纹理
  const imageLocation = gl.getUniformLocation(program, 'u_image');
  gl.uniform1i(imageLocation, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  
  // 绘制
  gl.drawArrays(gl.TRIANGLES, 0, state.vertexCount);
  
  // 更新角度显示
  if (state.gyroEnabled) {
    elements.angleDisplay.textContent = 
      `β: ${state.orientation.beta.toFixed(0)}° γ: ${state.orientation.gamma.toFixed(0)}°`;
  } else {
    elements.angleDisplay.textContent = 
      `X: ${state.mouseControl.rotX.toFixed(0)}° Y: ${state.mouseControl.rotY.toFixed(0)}°`;
  }
  
  requestAnimationFrame(render);
}

// ============ 鼠标/触摸控制 ============
function setupMouseControl(canvas) {
  let startX, startY;
  
  const onStart = (x, y) => {
    state.mouseControl.isDragging = true;
    startX = x;
    startY = y;
  };
  
  const onMove = (x, y) => {
    if (!state.mouseControl.isDragging) return;
    if (state.gyroEnabled) return;
    
    const deltaX = x - startX;
    const deltaY = y - startY;
    
    state.mouseControl.rotY += deltaX * 0.5;
    state.mouseControl.rotX += deltaY * 0.5;
    
    state.mouseControl.rotY = Math.max(-45, Math.min(45, state.mouseControl.rotY));
    state.mouseControl.rotX = Math.max(-30, Math.min(30, state.mouseControl.rotX));
    
    startX = x;
    startY = y;
  };
  
  const onEnd = () => {
    state.mouseControl.isDragging = false;
  };
  
  // 鼠标事件
  canvas.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
  canvas.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener('mouseup', onEnd);
  canvas.addEventListener('mouseleave', onEnd);
  
  // 触摸事件
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    onStart(touch.clientX, touch.clientY);
  }, { passive: false });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    onMove(touch.clientX, touch.clientY);
  }, { passive: false });
  
  canvas.addEventListener('touchend', onEnd);
}

// ============ 陀螺仪控制 ============
function checkGyroSupport() {
  // 检测是否为移动设备
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!isMobile) {
    elements.gyroHint.textContent = '🖱️ 拖动鼠标查看不同角度';
    return;
  }
  
  // 检测是否支持陀螺仪
  if ('DeviceOrientationEvent' in window) {
    // iOS 13+ 需要请求权限
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      elements.gyroHint.textContent = '📱 点击「陀螺仪」按钮启用';
    } else {
      // Android 或旧版 iOS，直接启用
      enableGyro();
    }
  } else {
    elements.gyroHint.textContent = '👆 滑动屏幕查看不同角度';
  }
}

async function requestGyroPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        state.gyroPermissionGranted = true;
        enableGyro();
        elements.gyroPermission.classList.add('hidden');
      } else {
        alert('需要陀螺仪权限才能使用此功能');
      }
    } catch (error) {
      console.error('请求陀螺仪权限失败:', error);
    }
  } else {
    state.gyroPermissionGranted = true;
    enableGyro();
  }
}

function enableGyro() {
  state.gyroEnabled = true;
  state.gyroPermissionGranted = true;
  
  window.addEventListener('deviceorientation', handleOrientation);
  
  elements.gyroToggle.classList.add('active');
  elements.gyroHint.textContent = '📱 倾斜手机查看不同角度';
}

function disableGyro() {
  state.gyroEnabled = false;
  window.removeEventListener('deviceorientation', handleOrientation);
  elements.gyroToggle.classList.remove('active');
}

function handleOrientation(event) {
  if (event.beta !== null && event.gamma !== null) {
    state.orientation.beta = event.beta;
    state.orientation.gamma = event.gamma;
  }
}

elements.gyroToggle.addEventListener('click', () => {
  if (state.gyroEnabled) {
    disableGyro();
  } else {
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && !state.gyroPermissionGranted) {
      elements.gyroPermission.classList.remove('hidden');
    } else {
      enableGyro();
    }
  }
});

elements.grantPermissionBtn.addEventListener('click', requestGyroPermission);

// ============ 返回按钮 ============
elements.backBtn.addEventListener('click', () => {
  disableGyro();
  state.imageData = null;
  state.depthData = null;
  state.mouseControl = { isDragging: false, lastX: 0, lastY: 0, rotX: 0, rotY: 0 };
  
  elements.previewContainer.classList.add('hidden');
  elements.dropZone.style.display = '';
  elements.progressFill.style.width = '0%';
  
  showScreen('upload');
});

// ============ 窗口大小变化 ============
window.addEventListener('resize', () => {
  if (state.currentScreen === 'viewer' && gl) {
    const canvas = elements.viewerCanvas;
    const container = canvas.parentElement;
    
    canvas.width = container.clientWidth * window.devicePixelRatio;
    canvas.height = container.clientHeight * window.devicePixelRatio;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    
    // 重新设置几何体
    if (state.imageData) {
      const img = new Image();
      img.onload = () => setupGeometry(img.width, img.height);
      img.src = state.imageData;
    }
  }
});

// ============ 初始化 ============
// 全局错误处理
window.onerror = function(msg, url, line, col, error) {
  console.error('全局错误:', msg, 'at', url, ':', line);
  return false;
};

// 检测 HTTPS（陀螺仪需要安全上下文）
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  console.warn('陀螺仪功能需要 HTTPS 环境');
}

// 显示上传界面
showScreen('upload');

console.log('空间照片查看器已初始化');
