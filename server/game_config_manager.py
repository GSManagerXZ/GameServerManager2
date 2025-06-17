import os
import configparser
import json
from typing import Dict, List, Any, Optional
from flask import jsonify
import logging
from ruamel.yaml import YAML
from unreal_ini_parser import IniParser
from pyhocon import ConfigFactory

logger = logging.getLogger(__name__)

class GameConfigManager:
    """游戏配置文件管理器"""
    
    def __init__(self):
        self.config_schemas_dir = os.path.join(os.path.dirname(__file__), 'public', 'gameconfig')
        self.supported_parsers = {
            'configobj': self._parse_with_configobj,
            'pyhocon': self._parse_with_pyhocon,
            'ruamel.yaml': self._parse_with_yaml,
            'unreal-ini-parser': self._parse_with_unreal
        }
    
    def get_available_configs(self) -> List[Dict[str, str]]:
        """获取所有可用的配置文件模板"""
        configs = []
        try:
            if not os.path.exists(self.config_schemas_dir):
                return configs
                
            for filename in os.listdir(self.config_schemas_dir):
                if filename.endswith('.yml') or filename.endswith('.yaml'):
                    config_path = os.path.join(self.config_schemas_dir, filename)
                    try:
                        
                        yaml = YAML()
                        
                        with open(config_path, 'r', encoding='utf-8') as f:
                            config_data = yaml.load(f)
                            
                        if 'meta' in config_data:
                            configs.append({
                                'id': filename.replace('.yml', '').replace('.yaml', ''),
                                'name': config_data['meta'].get('game_name', filename),
                                'config_file': config_data['meta'].get('config_file', ''),
                                'filename': filename
                            })
                    except Exception as e:
                        logger.error(f"解析配置文件 {filename} 失败: {e}")
                        continue
        except Exception as e:
            logger.error(f"读取配置目录失败: {e}")
            
        return configs
    
    def get_config_schema(self, config_id: str) -> Optional[Dict[str, Any]]:
        """获取指定配置文件的模板结构"""
        try:
            config_path = os.path.join(self.config_schemas_dir, f"{config_id}.yml")
            if not os.path.exists(config_path):
                config_path = os.path.join(self.config_schemas_dir, f"{config_id}.yaml")
                
            if not os.path.exists(config_path):
                return None
                
            yaml = YAML()
            
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.load(f)
        except Exception as e:
            logger.error(f"读取配置模板失败: {e}")
            return None
    
    def read_game_config(self, server_path: str, config_schema: Dict[str, Any], parser_type: str = 'configobj') -> Dict[str, Any]:
        """读取游戏配置文件"""
        try:
            config_file_path = config_schema['meta']['config_file']
            full_config_path = os.path.join(server_path, config_file_path)
            
            if not os.path.exists(full_config_path):
                logger.warning(f"配置文件不存在: {full_config_path}")
                return self._get_default_values(config_schema)
            
            # 根据解析器类型读取配置
            if parser_type in self.supported_parsers:
                return self.supported_parsers[parser_type](full_config_path, config_schema)
            else:
                logger.error(f"不支持的解析器类型: {parser_type}")
                return self._get_default_values(config_schema)
                
        except Exception as e:
            logger.error(f"读取游戏配置失败: {e}")
            return self._get_default_values(config_schema)
    
    def save_game_config(self, server_path: str, config_schema: Dict[str, Any], config_data: Dict[str, Any], parser_type: str = 'configobj') -> bool:
        """保存游戏配置文件"""
        try:
            config_file_path = config_schema['meta']['config_file']
            full_config_path = os.path.join(server_path, config_file_path)
            
            # 确保目录存在
            os.makedirs(os.path.dirname(full_config_path), exist_ok=True)
            
            # 根据解析器类型保存配置
            if parser_type == 'configobj':
                return self._save_with_configobj(full_config_path, config_data, config_schema)
            elif parser_type == 'ruamel.yaml':
                return self._save_with_yaml(full_config_path, config_data, config_schema)
            elif parser_type == 'pyhocon':
                return self._save_with_pyhocon(full_config_path, config_data, config_schema)
            elif parser_type == 'unreal-ini-parser':
                return self._save_with_unreal(full_config_path, config_data, config_schema)
            else:
                logger.error(f"不支持的解析器类型: {parser_type}")
                return False
                
        except Exception as e:
            logger.error(f"保存游戏配置失败: {e}")
            return False
    
    def _get_default_values(self, config_schema: Dict[str, Any]) -> Dict[str, Any]:
        """获取默认配置值"""
        result = {}
        
        for section in config_schema.get('sections', []):
            section_key = section['key']
            result[section_key] = {}
            
            for field in section.get('fields', []):
                field_name = field['name']
                default_value = field.get('default', '')
                result[section_key][field_name] = default_value
                
        return result
    
    def _parse_with_configobj(self, config_path: str, config_schema: Dict[str, Any]) -> Dict[str, Any]:
        """使用configobj解析配置文件"""
        try:
            import configobj
            config = configobj.ConfigObj(config_path, encoding='utf-8')
            result = {}
            
            for section in config_schema.get('sections', []):
                section_key = section['key']
                result[section_key] = {}
                
                if section_key in config:
                    for field in section.get('fields', []):
                        field_name = field['name']
                        if field_name in config[section_key]:
                            value = config[section_key][field_name]
                            
                            # 检查是否为嵌套字段
                            if field.get('type') == 'nested':
                                # 处理嵌套字段，将括号格式转换为字符串数组
                                if isinstance(value, str) and value.startswith('(') and value.endswith(')'):
                                    # 去掉括号并按逗号分割
                                    inner_content = value[1:-1]
                                    if inner_content:
                                        # 解析参数，处理带引号的字符串
                                        params = []
                                        current_param = ''
                                        in_quotes = False
                                        quote_char = None
                                        
                                        for char in inner_content:
                                            if char in ['"', "'"] and not in_quotes:
                                                in_quotes = True
                                                quote_char = char
                                                current_param += char
                                            elif char == quote_char and in_quotes:
                                                in_quotes = False
                                                quote_char = None
                                                current_param += char
                                            elif char == ',' and not in_quotes:
                                                if current_param.strip():
                                                    params.append(current_param.strip())
                                                current_param = ''
                                            else:
                                                current_param += char
                                        
                                        # 添加最后一个参数
                                        if current_param.strip():
                                            params.append(current_param.strip())
                                        
                                        value = params
                                    else:
                                        value = []
                                else:
                                    value = []
                            else:
                                # 普通字段的类型转换
                                if 'default' in field:
                                    default_type = type(field['default'])
                                    if default_type == bool:
                                        value = str(value).lower() in ('true', '1', 'yes', 'on')
                                    elif default_type == int:
                                        value = int(value)
                                    elif default_type == float:
                                        value = float(value)
                            
                            result[section_key][field_name] = value
                        else:
                            result[section_key][field_name] = field.get('default', '')
                else:
                    for field in section.get('fields', []):
                        result[section_key][field['name']] = field.get('default', '')
                        
            return result
        except ImportError:
            logger.error("configobj库未安装")
            return self._get_default_values(config_schema)
        except Exception as e:
            logger.error(f"configobj解析失败: {e}")
            return self._get_default_values(config_schema)
    
    def _parse_with_yaml(self, config_path: str, config_schema: Dict[str, Any]) -> Dict[str, Any]:
        """使用ruamel.yaml解析配置文件"""
        try:
            
            yaml = YAML()
            yaml.preserve_quotes = True
            
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.load(f) or {}
            
            result = {}
            for section in config_schema.get('sections', []):
                section_key = section['key']
                result[section_key] = {}
                
                if section_key in config:
                    for field in section.get('fields', []):
                        field_name = field['name']
                        result[section_key][field_name] = config[section_key].get(field_name, field.get('default', ''))
                else:
                    for field in section.get('fields', []):
                        result[section_key][field['name']] = field.get('default', '')
                        
            return result
        except Exception as e:
            logger.error(f"yaml解析失败: {e}")
            return self._get_default_values(config_schema)
    
    def _parse_with_pyhocon(self, config_path: str, config_schema: Dict[str, Any]) -> Dict[str, Any]:
        """使用pyhocon解析配置文件"""
        try:
            
            config = ConfigFactory.parse_file(config_path)
            
            result = {}
            for section in config_schema.get('sections', []):
                section_key = section['key']
                result[section_key] = {}
                
                if section_key in config:
                    for field in section.get('fields', []):
                        field_name = field['name']
                        result[section_key][field_name] = config[section_key].get(field_name, field.get('default', ''))
                else:
                    for field in section.get('fields', []):
                        result[section_key][field['name']] = field.get('default', '')
                        
            return result
        except ImportError:
            logger.error("pyhocon库未安装")
            return self._get_default_values(config_schema)
        except Exception as e:
            logger.error(f"pyhocon解析失败: {e}")
            return self._get_default_values(config_schema)
    
    def _parse_with_unreal(self, config_path: str, config_schema: Dict[str, Any]) -> Dict[str, Any]:
        """使用unreal-ini-parser解析UE游戏配置文件"""
        try:
            # 尝试使用unreal-ini-parser库
            try:
                
                
                parser = IniParser()
                parser.read(config_path)
                config_data = parser.sections
                
                result = {}
                for section in config_schema.get('sections', []):
                    section_key = section['key']
                    result[section_key] = {}
                    
                    # UE配置文件通常使用特殊的section格式，如[/Script/Engine.GameEngine]
                    # 尝试多种可能的section名称格式
                    possible_section_names = [
                        section_key,
                        f"/Script/{section_key}",
                        f"/Script/Engine.{section_key}",
                        f"/Script/Game.{section_key}"
                    ]
                    
                    section_found = False
                    for possible_name in possible_section_names:
                        if possible_name in config_data:
                            section_found = True
                            for field in section.get('fields', []):
                                field_name = field['name']
                                if field_name in config_data[possible_name]:
                                    value = config_data[possible_name][field_name]
                                    # UE配置文件的类型转换
                                    if 'default' in field:
                                        default_type = type(field['default'])
                                        if default_type == bool:
                                            value = str(value).lower() in ('true', '1', 'yes', 'on')
                                        elif default_type == int:
                                            try:
                                                value = int(value)
                                            except ValueError:
                                                value = field.get('default', 0)
                                        elif default_type == float:
                                            try:
                                                value = float(value)
                                            except ValueError:
                                                value = field.get('default', 0.0)
                                    result[section_key][field_name] = value
                                else:
                                    result[section_key][field_name] = field.get('default', '')
                            break
                    
                    if not section_found:
                        for field in section.get('fields', []):
                            result[section_key][field['name']] = field.get('default', '')
                            
                return result
                
            except ImportError:
                logger.warning("unreal-ini-parser库未安装，使用configparser作为fallback")
                # 使用configparser作为fallback
                config = configparser.ConfigParser()
                config.read(config_path, encoding='utf-8')
                
                result = {}
                for section in config_schema.get('sections', []):
                    section_key = section['key']
                    result[section_key] = {}
                    
                    if section_key in config:
                        for field in section.get('fields', []):
                            field_name = field['name']
                            if field_name in config[section_key]:
                                value = config[section_key][field_name]
                                # 类型转换
                                if 'default' in field:
                                    default_type = type(field['default'])
                                    if default_type == bool:
                                        value = str(value).lower() in ('true', '1', 'yes', 'on')
                                    elif default_type == int:
                                        try:
                                            value = int(value)
                                        except ValueError:
                                            value = field.get('default', 0)
                                    elif default_type == float:
                                        try:
                                            value = float(value)
                                        except ValueError:
                                            value = field.get('default', 0.0)
                                result[section_key][field_name] = value
                            else:
                                result[section_key][field_name] = field.get('default', '')
                    else:
                        for field in section.get('fields', []):
                            result[section_key][field['name']] = field.get('default', '')
                            
                return result
                
        except Exception as e:
            logger.error(f"unreal配置解析失败: {e}")
            return self._get_default_values(config_schema)
    
    def _save_with_configobj(self, config_path: str, config_data: Dict[str, Any], config_schema: Dict[str, Any]) -> bool:
        """使用configobj保存配置文件"""
        try:
            import configobj
            
            # 检查是否有嵌套字段需要特殊处理
            has_nested_fields = False
            nested_fields_data = {}
            
            for section_key, section_data in config_data.items():
                # 获取对应的schema section
                schema_section = None
                for section in config_schema.get('sections', []):
                    if section['key'] == section_key:
                        schema_section = section
                        break
                
                if schema_section:
                    for field_name, field_value in section_data.items():
                        # 检查是否为嵌套字段
                        field_schema = None
                        for field in schema_section.get('fields', []):
                            if field['name'] == field_name:
                                field_schema = field
                                break
                        
                        if field_schema and field_schema.get('type') == 'nested':
                            has_nested_fields = True
                            if section_key not in nested_fields_data:
                                nested_fields_data[section_key] = {}
                            nested_fields_data[section_key][field_name] = field_value
            
            if has_nested_fields:
                # 对于有嵌套字段的情况，使用原生文件写入
                return self._save_with_raw_write(config_path, config_data, config_schema, nested_fields_data)
            else:
                # 对于普通字段，使用configobj
                if os.path.exists(config_path):
                    config = configobj.ConfigObj(config_path, encoding='utf-8')
                else:
                    config = configobj.ConfigObj(encoding='utf-8')
                
                # 更新配置
                for section_key, section_data in config_data.items():
                    if section_key not in config:
                        config[section_key] = {}
                    for field_name, field_value in section_data.items():
                        config[section_key][field_name] = str(field_value)
                
                # 保存文件
                config.filename = config_path
                config.write()
                return True
                
        except ImportError:
            logger.error("configobj库未安装")
            return False
        except Exception as e:
            logger.error(f"configobj保存失败: {e}")
            return False
    
    def _save_with_raw_write(self, config_path: str, config_data: Dict[str, Any], config_schema: Dict[str, Any], nested_fields_data: Dict[str, Any]) -> bool:
        """使用原生文件写入处理嵌套字段"""
        try:
            lines = []
            
            for section_key, section_data in config_data.items():
                lines.append(f'[{section_key}]')
                
                # 获取对应的schema section
                schema_section = None
                for section in config_schema.get('sections', []):
                    if section['key'] == section_key:
                        schema_section = section
                        break
                
                for field_name, field_value in section_data.items():
                    # 检查是否为嵌套字段
                    field_schema = None
                    if schema_section:
                        for field in schema_section.get('fields', []):
                            if field['name'] == field_name:
                                field_schema = field
                                break
                    
                    if field_schema and field_schema.get('type') == 'nested':
                        # 处理嵌套字段，将字符串数组转换为括号格式
                        if isinstance(field_value, list):
                            # 处理嵌套字段中的每个元素，根据字段类型决定是否加引号
                            formatted_elements = []
                            nested_fields = field_schema.get('nested_fields', [])
                            
                            for element in field_value:
                                # 解析每个元素，检查是否需要引号
                                if '=' in element:
                                    key, value = element.split('=', 1)
                                    # 查找对应的嵌套字段定义
                                    nested_field_type = None
                                    for nested_field in nested_fields:
                                        if nested_field['name'] == key:
                                            nested_field_type = nested_field.get('type')
                                            break
                                    
                                    # 如果是字符串类型且值不为空，确保有引号
                                    if nested_field_type == 'string' and value and not (value.startswith('"') and value.endswith('"')):
                                        formatted_elements.append(f'{key}="{value}"')
                                    else:
                                        formatted_elements.append(element)
                                else:
                                    formatted_elements.append(element)
                            
                            formatted_value = '(' + ','.join(formatted_elements) + ')'
                            lines.append(f'{field_name} = {formatted_value}')
                        else:
                            lines.append(f'{field_name} = {field_value}')
                    else:
                        lines.append(f'{field_name} = {field_value}')
                
                lines.append('')  # 添加空行分隔section
            
            # 写入文件
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            
            return True
        except Exception as e:
            logger.error(f"原生文件写入失败: {e}")
            return False
    
    def _save_with_yaml(self, config_path: str, config_data: Dict[str, Any], config_schema: Dict[str, Any]) -> bool:
        """使用ruamel.yaml保存配置文件"""
        try:
            
            yaml = YAML()
            yaml.preserve_quotes = True
            yaml.default_flow_style = False
            
            with open(config_path, 'w', encoding='utf-8') as f:
                yaml.dump(config_data, f)
            return True
        except Exception as e:
            logger.error(f"yaml保存失败: {e}")
            return False
    
    def _save_with_pyhocon(self, config_path: str, config_data: Dict[str, Any], config_schema: Dict[str, Any]) -> bool:
        """使用pyhocon保存配置文件"""
        try:
            # pyhocon通常用于读取，保存时转换为JSON格式
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"pyhocon保存失败: {e}")
            return False
    
    def _save_with_unreal(self, config_path: str, config_data: Dict[str, Any], config_schema: Dict[str, Any]) -> bool:
        """使用unreal格式保存UE游戏配置文件"""
        try:
            # 尝试使用unreal-ini-parser库
            try:
                
                
                parser = IniParser()
                
                # 如果文件存在，先读取现有配置
                if os.path.exists(config_path):
                    parser.read(config_path)
                    existing_config = parser.sections
                else:
                    existing_config = {}
                
                # 更新配置数据
                for section_key, section_data in config_data.items():
                    # UE配置文件通常使用特殊的section格式
                    # 根据现有配置确定正确的section名称格式
                    actual_section_name = section_key
                    
                    # 检查现有配置中是否有特殊格式的section名称
                    for existing_section in existing_config.keys():
                        if (existing_section.endswith(f".{section_key}") or 
                            existing_section.endswith(f"/{section_key}") or
                            existing_section == f"/Script/{section_key}" or
                            existing_section == f"/Script/Engine.{section_key}" or
                            existing_section == f"/Script/Game.{section_key}"):
                            actual_section_name = existing_section
                            break
                    
                    if actual_section_name not in existing_config:
                        existing_config[actual_section_name] = {}
                    
                    for field_name, field_value in section_data.items():
                        # UE配置文件的值格式化
                        if isinstance(field_value, bool):
                            formatted_value = "True" if field_value else "False"
                        elif isinstance(field_value, str) and field_value.strip():
                            # 字符串值通常需要引号
                            formatted_value = f'"{field_value}"' if not field_value.startswith('"') else field_value
                        else:
                            formatted_value = str(field_value)
                        
                        existing_config[actual_section_name][field_name] = formatted_value
                
                # 保存文件
                parser.sections = existing_config
                parser.write(config_path)
                return True
                
            except ImportError:
                logger.warning("unreal-ini-parser库未安装，使用configparser作为fallback")
                # 使用configparser作为fallback
                config = configparser.ConfigParser()
                
                # 如果文件存在，先读取现有配置
                if os.path.exists(config_path):
                    config.read(config_path, encoding='utf-8')
                
                # 更新配置
                for section_key, section_data in config_data.items():
                    if not config.has_section(section_key):
                        config.add_section(section_key)
                    for field_name, field_value in section_data.items():
                        # UE配置文件的值格式化
                        if isinstance(field_value, bool):
                            formatted_value = "True" if field_value else "False"
                        else:
                            formatted_value = str(field_value)
                        config.set(section_key, field_name, formatted_value)
                
                # 保存文件
                with open(config_path, 'w', encoding='utf-8') as f:
                    config.write(f)
                return True
                
        except Exception as e:
            logger.error(f"unreal配置保存失败: {e}")
            return False

# 全局实例
game_config_manager = GameConfigManager()