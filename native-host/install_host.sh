#!/bin/bash

# 插件ID - 请替换为扩展程序的实际ID
EXTENSION_ID="YOUR_EXTENSION_ID_HERE"

# 脚本目录的绝对路径
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 更新清单文件中的扩展ID
sed -i '' "s/YOUR_EXTENSION_ID_HERE/$EXTENSION_ID/g" "$DIR/com.douyin.uploader.json"

# 为macOS创建本地消息主机安装目录
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$HOST_DIR"

# 复制清单文件到安装目录
cp "$DIR/com.douyin.uploader.json" "$HOST_DIR/com.douyin.uploader.json"

echo "本地消息主机安装完成！" 