#!/bin/bash

# 将标准输入/输出设置为二进制模式，避免换行符转换
exec 0<&0
exec 1>&1

# 接收消息的函数
read_message() {
  # 读取消息长度（前4个字节）
  read -r -n 4 LENGTH_BYTES
  
  # 转换长度字节为整数
  LENGTH=$(printf '%d' "0x$(hexdump -v -e '/1 "%02X"' <<< "$LENGTH_BYTES")")
  
  # 读取消息内容
  read -r -n "$LENGTH" MESSAGE
  
  echo "$MESSAGE"
}

# 发送消息的函数
send_message() {
  local message=$1
  local message_length=${#message}
  
  # 以小端序写入消息长度（4字节）
  printf "$(printf '\\x%02x\\x%02x\\x%02x\\x%02x' \
    $((message_length & 0xff)) \
    $(((message_length >> 8) & 0xff)) \
    $(((message_length >> 16) & 0xff)) \
    $(((message_length >> 24) & 0xff)))"
  
  # 写入消息内容
  echo -n "$message"
}

# 处理视频文件上传
process_file() {
  local file_path=$1
  
  # 检查文件是否存在
  if [ -f "$file_path" ]; then
    # 获取文件信息
    file_size=$(stat -f%z "$file_path")
    file_name=$(basename "$file_path")
    
    # 返回文件信息
    send_message "{\"success\": true, \"file\": \"$file_path\", \"name\": \"$file_name\", \"size\": $file_size}"
  else
    send_message "{\"success\": false, \"error\": \"文件不存在: $file_path\"}"
  fi
}

# 主循环
while true; do
  # 读取来自扩展的消息
  MESSAGE=$(read_message)
  
  # 解析JSON消息
  ACTION=$(echo "$MESSAGE" | grep -o '"action":"[^"]*"' | cut -d'"' -f4)
  FILE_PATH=$(echo "$MESSAGE" | grep -o '"path":"[^"]*"' | cut -d'"' -f4)
  
  # 处理消息
  if [ "$ACTION" = "upload" ] && [ -n "$FILE_PATH" ]; then
    process_file "$FILE_PATH"
  else
    send_message "{\"success\": false, \"error\": \"无效的请求\"}"
  fi
done 