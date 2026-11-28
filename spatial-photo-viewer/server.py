"""
空间照片生成器后端 API
使用 Apple ML-SHARP 生成真正的 3D 高斯点云
"""

import os
import uuid
import subprocess
import tempfile
import shutil
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import urllib.parse
import cgi

# 配置
UPLOAD_DIR = Path("/tmp/spatial-uploads")
OUTPUT_DIR = Path("/tmp/spatial-outputs")
SHARP_CMD = os.path.expanduser("~/.local/bin/sharp")

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


class SpatialPhotoHandler(SimpleHTTPRequestHandler):
    """处理静态文件和 API 请求"""
    
    def __init__(self, *args, **kwargs):
        # 设置静态文件目录
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)
    
    def do_POST(self):
        if self.path == "/api/generate":
            self.handle_generate()
        else:
            self.send_error(404, "Not Found")
    
    def do_GET(self):
        # 处理 PLY 文件请求
        if self.path.startswith("/api/output/"):
            self.handle_output()
        else:
            super().do_GET()
    
    def handle_generate(self):
        """处理图片上传和 3D 生成"""
        try:
            # 解析 multipart 表单
            content_type = self.headers.get('Content-Type', '')
            if 'multipart/form-data' not in content_type:
                self.send_json_error(400, "需要 multipart/form-data")
                return
            
            # 解析边界
            boundary = content_type.split('boundary=')[1].encode()
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            
            # 简单解析 multipart（提取文件数据）
            parts = body.split(b'--' + boundary)
            file_data = None
            filename = None
            
            for part in parts:
                if b'filename=' in part:
                    # 提取文件名
                    header_end = part.find(b'\r\n\r\n')
                    header = part[:header_end].decode('utf-8', errors='ignore')
                    for line in header.split('\r\n'):
                        if 'filename=' in line:
                            filename = line.split('filename=')[1].strip('"').split('"')[0]
                    # 提取文件内容
                    file_data = part[header_end + 4:]
                    if file_data.endswith(b'\r\n'):
                        file_data = file_data[:-2]
                    break
            
            if not file_data:
                self.send_json_error(400, "未找到上传文件")
                return
            
            # 生成唯一 ID
            task_id = str(uuid.uuid4())[:8]
            
            # 保存上传文件
            input_dir = UPLOAD_DIR / task_id
            input_dir.mkdir(exist_ok=True)
            
            ext = Path(filename).suffix.lower() if filename else '.jpg'
            if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
                ext = '.jpg'
            
            input_path = input_dir / f"input{ext}"
            with open(input_path, 'wb') as f:
                f.write(file_data)
            
            print(f"[{task_id}] 收到图片: {len(file_data)} bytes")
            
            # 创建输出目录
            output_dir = OUTPUT_DIR / task_id
            output_dir.mkdir(exist_ok=True)
            
            # 调用 ML-SHARP
            print(f"[{task_id}] 开始 ML-SHARP 处理...")
            
            result = subprocess.run(
                [SHARP_CMD, "predict", "-i", str(input_dir), "-o", str(output_dir), "--device", "cpu"],
                capture_output=True,
                text=True,
                timeout=300  # 5 分钟超时
            )
            
            if result.returncode != 0:
                print(f"[{task_id}] ML-SHARP 错误: {result.stderr}")
                self.send_json_error(500, f"处理失败: {result.stderr[:200]}")
                return
            
            # 查找输出的 PLY 文件
            ply_files = list(output_dir.glob("*.ply"))
            if not ply_files:
                self.send_json_error(500, "未生成 PLY 文件")
                return
            
            ply_path = ply_files[0]
            ply_size = ply_path.stat().st_size
            
            print(f"[{task_id}] 生成完成: {ply_path.name} ({ply_size / 1024 / 1024:.1f} MB)")
            
            # 返回结果
            self.send_json({
                "success": True,
                "task_id": task_id,
                "ply_url": f"/api/output/{task_id}/{ply_path.name}",
                "ply_size": ply_size
            })
            
            # 清理上传文件
            shutil.rmtree(input_dir, ignore_errors=True)
            
        except subprocess.TimeoutExpired:
            self.send_json_error(500, "处理超时（超过5分钟）")
        except Exception as e:
            print(f"错误: {e}")
            self.send_json_error(500, str(e))
    
    def handle_output(self):
        """提供 PLY 文件下载"""
        try:
            # 解析路径 /api/output/{task_id}/{filename}
            parts = self.path.split('/')
            if len(parts) < 5:
                self.send_error(404)
                return
            
            task_id = parts[3]
            filename = parts[4]
            
            file_path = OUTPUT_DIR / task_id / filename
            
            if not file_path.exists():
                self.send_error(404)
                return
            
            # 发送文件
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', file_path.stat().st_size)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
                
        except Exception as e:
            print(f"输出错误: {e}")
            self.send_error(500)
    
    def send_json(self, data):
        """发送 JSON 响应"""
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
    
    def send_json_error(self, code, message):
        """发送 JSON 错误响应"""
        body = json.dumps({"success": False, "error": message}).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
    
    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def run_server(port=8080):
    """启动服务器"""
    server = HTTPServer(('0.0.0.0', port), SpatialPhotoHandler)
    print(f"🚀 空间照片服务器启动: http://0.0.0.0:{port}")
    print(f"📱 ML-SHARP 已就绪，使用 CPU 推理（约 40-60 秒/张）")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
