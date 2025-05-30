#!/usr/bin/env python3
import logging
from constants import FRP_DIR, FRP_BINARY, CUSTOM_FRP_BINARY, MEFRP_BINARY, SAKURA_BINARY

logger = logging.getLogger("frp_service")

# 全局变量
running_frp_processes = {}
manually_stopped_frps = set()

class FRPService:
    @staticmethod
    def list_frp_configs():
        """列出FRP配置"""
        pass
    
    @staticmethod
    def create_frp_config(config_data):
        """创建FRP配置"""
        pass
    
    @staticmethod
    def start_frp(frp_id):
        """启动FRP"""
        pass
    
    @staticmethod
    def stop_frp(frp_id):
        """停止FRP"""
        pass