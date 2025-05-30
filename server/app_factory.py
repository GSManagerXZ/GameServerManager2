#!/usr/bin/env python3
import logging
from flask import Flask
from flask_cors import CORS
from constants import ensure_directories

def create_app():
    """创建Flask应用实例"""
    app = Flask(__name__, static_folder='../app/dist')
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    
    # 允许跨域请求
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('api_server.log')
        ]
    )
    
    # 确保目录存在
    ensure_directories()
    
    return app