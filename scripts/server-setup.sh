#!/bin/bash
set -e

# Run as root on Ubuntu 24.04.
# One-time setup of a fresh Hetzner CX22 (or equivalent) box.

# System updates
apt-get update && apt-get upgrade -y

# Install dependencies
apt-get install -y \
    docker.io \
    docker-compose-plugin \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    curl

# Enable Docker
systemctl enable docker
systemctl start docker

# Firewall — allow SSH, HTTP, HTTPS only
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Create app user (don't run the app as root)
useradd -m -s /bin/bash wc2026 || true
usermod -aG docker wc2026

echo "Server setup complete. Next: deploy as wc2026 user."
