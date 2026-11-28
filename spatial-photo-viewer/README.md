# 空间照片查看器

将普通 2D 照片转换为可交互的伪 3D 空间照片，支持手机陀螺仪控制视角。

## 功能特性

- 📷 上传任意照片，生成 3D 视差效果
- 📱 手机陀螺仪控制视角（需要 HTTPS）
- 🖱️ 桌面端支持鼠标拖动控制
- ⚡ 纯前端 WebGL 渲染，流畅运行

## 快速开始

```bash
# 进入项目目录
cd spatial-photo-viewer

# 启动本地服务器
npx serve .

# 或使用 Python
python3 -m http.server 8080
```

打开 `http://localhost:8080` 即可使用。

> ⚠️ 陀螺仪功能需要 HTTPS 环境，本地测试可使用 `localhost`

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (当前实现)                        │
├─────────────────────────────────────────────────────────────┤
│  上传照片 → 模拟深度估计 → WebGL 视差渲染 → 陀螺仪交互        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   完整版架构 (需要后端)                       │
├─────────────────────────────────────────────────────────────┤
│  前端: 上传照片 → 后端处理 → 加载 3DGS → gsplat.js 渲染      │
│  后端: ML-SHARP 生成 .ply → 转换 .splat → 返回前端           │
└─────────────────────────────────────────────────────────────┘
```

## 集成 ML-SHARP 后端

### 1. 后端服务 (Python + FastAPI)

```python
# server.py
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import subprocess
import tempfile
import os

app = FastAPI()

@app.post("/api/generate")
async def generate_spatial(file: UploadFile = File(...)):
    # 保存上传的图片
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        content = await file.read()
        tmp.write(content)
        input_path = tmp.name
    
    # 创建输出目录
    output_dir = tempfile.mkdtemp()
    
    # 调用 ML-SHARP
    subprocess.run([
        "sharp", "predict",
        "-i", input_path,
        "-o", output_dir
    ], check=True)
    
    # 获取生成的 .ply 文件
    ply_file = os.path.join(output_dir, os.listdir(output_dir)[0])
    
    # 转换为 .splat 格式 (使用 gsplat.js 的转换工具)
    splat_file = ply_file.replace('.ply', '.splat')
    # ... 转换逻辑
    
    return FileResponse(splat_file, media_type="application/octet-stream")

app.mount("/", StaticFiles(directory=".", html=True), name="static")
```

### 2. 安装 ML-SHARP

```bash
# 创建 Python 环境
conda create -n sharp python=3.13
conda activate sharp

# 克隆仓库
git clone https://github.com/apple-aiml-research/ml-sharp
cd ml-sharp

# 安装依赖
pip install -r requirements.txt

# 测试
sharp --help
```

### 3. 前端集成 gsplat.js

```javascript
import * as SPLAT from "gsplat";

async function loadSpatialPhoto(splatUrl) {
  const scene = new SPLAT.Scene();
  const camera = new SPLAT.Camera();
  const renderer = new SPLAT.WebGLRenderer();
  
  await SPLAT.Loader.LoadAsync(splatUrl, scene);
  
  // 陀螺仪控制
  window.addEventListener('deviceorientation', (e) => {
    camera.rotation.x = e.beta * Math.PI / 180;
    camera.rotation.y = e.gamma * Math.PI / 180;
  });
  
  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
```

## 陀螺仪 API 说明

```javascript
// iOS 13+ 需要请求权限
if (typeof DeviceOrientationEvent.requestPermission === 'function') {
  const permission = await DeviceOrientationEvent.requestPermission();
  if (permission === 'granted') {
    window.addEventListener('deviceorientation', handleOrientation);
  }
} else {
  // Android / 旧 iOS 直接监听
  window.addEventListener('deviceorientation', handleOrientation);
}

function handleOrientation(event) {
  const beta = event.beta;   // 前后倾斜 -180° ~ 180°
  const gamma = event.gamma; // 左右倾斜 -90° ~ 90°
  const alpha = event.alpha; // 方向 0° ~ 360°
}
```

## 文件结构

```
spatial-photo-viewer/
├── index.html      # 主页面
├── style.css       # 样式
├── app.js          # 前端逻辑
└── README.md       # 说明文档
```

## 相关开源项目

| 项目 | 说明 | 许可证 |
|-----|------|--------|
| [ML-SHARP](https://github.com/apple-aiml-research/ml-sharp) | Apple 官方单图转 3DGS | 仅研究用途 |
| [gsplat.js](https://github.com/huggingface/gsplat.js) | Web 端 3DGS 渲染库 | MIT |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | Three.js 3DGS 渲染 | MIT |
| [LGM](https://github.com/3DTopia/LGM) | 商用友好的单图转 3DGS | MIT |

## 许可证

MIT License

## 注意事项

1. 当前版本使用简化的深度估计模拟效果，完整的 3D 高斯泼溅需要后端 GPU 服务
2. 陀螺仪功能需要 HTTPS 环境
3. ML-SHARP 模型权重仅限研究用途，商用请选择 LGM 等 MIT 许可项目
