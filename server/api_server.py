#!/usr/bin/env python3
import sys
import logging
from app_factory import create_app
from auth_service import check_auth
from routes.auth_routes import auth_bp
from routes.game_routes import game_bp
from routes.frp_routes import frp_bp
from routes.file_routes import file_bp
from routes.system_routes import system_bp

logger = logging.getLogger("api_server")

# 创建应用
app = create_app()

# 注册认证中间件
app.before_request(check_auth)

# 注册蓝图
app.register_blueprint(auth_bp)
app.register_blueprint(game_bp)
app.register_blueprint(frp_bp)
app.register_blueprint(file_bp)
app.register_blueprint(system_bp)

if __name__ == '__main__':
    logger.warning("检测到直接运行api_server.py")
    logger.warning("======================================================")
    logger.warning("警告: 不建议直接运行此文件。请使用Gunicorn启动服务器:")
    logger.warning("gunicorn -w 4 -b 0.0.0.0:5000 api_server:app")
    logger.warning("或者使用start_web.sh脚本")
    logger.warning("======================================================")
    
    should_continue = input("是否仍要使用Flask开发服务器启动? (y/N): ")
    if should_continue.lower() != 'y':
        logger.error("退出程序，请使用Gunicorn启动")
        sys.exit(0)
    
    logger.warning("使用Flask开发服务器启动 - 不推荐用于生产环境")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)