#!/bin/bash

# Script to install dependencies in Claude Code web environment
# This script ensures all necessary packages are installed when the repo is opened

set -e  # Exit on error

echo "========================================="
echo "Installing dependencies with Yarn..."
echo "========================================="

# Check if yarn is available
if ! command -v yarn &> /dev/null; then
    echo "Error: Yarn is not installed"
    exit 1
fi

# Install dependencies
echo "Running: yarn install"
yarn install

echo ""
echo "========================================="
echo "✅ Dependencies installed successfully!"
echo "========================================="
