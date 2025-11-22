#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Setting up Semantic Code MCP Server ===${NC}\n"

# 1. Install dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}> Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: npm install failed.${NC}"
        exit 1
    fi
else
    echo -e "${CYAN}> Dependencies already installed.${NC}"
fi

# 2. Build project
echo -e "${CYAN}> Building project...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Build failed.${NC}"
    exit 1
fi

# 3. Generate Config
ABS_PATH="$(pwd)/build/index.js"

echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo "To use this server, add the following to your MCP Client configuration file"
echo ""
echo "{"
echo "  \"mcpServers\": {"
echo "    \"semantic-code\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$ABS_PATH\"]"
echo "    }"
echo "  }"
echo "}"
echo ""
