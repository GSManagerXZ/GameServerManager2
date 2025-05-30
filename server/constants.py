#!/usr/bin/env python3
import os

# FRP相关配置
FRP_DIR = "/home/steam/FRP"
FRP_CONFIG_FILE = os.path.join("/home/steam/games", "frp.json")
FRP_BINARY = os.path.join(FRP_DIR, "LoCyanFrp/frpc")
FRP_LOGS_DIR = os.path.join(FRP_DIR, "logs")
CUSTOM_FRP_DIR = os.path.join(FRP_DIR, "frpc")
CUSTOM_FRP_CONFIG_FILE = os.path.join(CUSTOM_FRP_DIR, "frpc.toml")
CUSTOM_FRP_BINARY = os.path.join(CUSTOM_FRP_DIR, "frpc")
MEFRP_DIR = os.path.join(FRP_DIR, "mefrp")
MEFRP_BINARY = os.path.join(MEFRP_DIR, "frpc")
SAKURA_DIR = os.path.join(FRP_DIR, "Sakura")
SAKURA_BINARY = os.path.join(SAKURA_DIR, "frpc")

# 游戏相关配置
INSTALLER_SCRIPT = os.path.join(os.path.dirname(__file__), "game_installer.py")
GAMES_CONFIG = os.path.join(os.path.dirname(__file__), "installgame.json")
GAMES_DIR = "/home/steam/games"
USER_CONFIG_PATH = os.path.join(GAMES_DIR, "config.json")

# 确保目录存在
def ensure_directories():
    directories = [
        FRP_DIR, os.path.join(FRP_DIR, "LoCyanFrp"), FRP_LOGS_DIR,
        CUSTOM_FRP_DIR, os.path.join(FRP_DIR, "logs"), MEFRP_DIR, SAKURA_DIR
    ]
    for directory in directories:
        os.makedirs(directory, exist_ok=True)