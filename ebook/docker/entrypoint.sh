#!/bin/bash
set -e

echo "Starting Ebook Generator..."

mkdir -p /app/data /app/projects

if [ -f /app/.env ]; then
    echo "Loading environment from .env"
    set -a
    source /app/.env
    set +a
else
    echo "Warning: .env file not found, using defaults"
fi

echo "Starting Streamlit app..."
exec streamlit run app/main.py --server.port=8501 --server.address=0.0.0.0
