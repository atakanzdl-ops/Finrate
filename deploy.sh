#!/bin/bash
# Finrate — Hetzner Deployment Script
# Kullanım: ./deploy.sh

set -e

echo "=== Finrate Deployment ==="

# .env.production dosyasını kontrol et
if [ ! -f .env.production ]; then
  echo "HATA: .env.production dosyası bulunamadı!"
  echo "Önce .env.production dosyasını doldurun."
  exit 1
fi

# Ortam değişkenlerini yükle
export $(cat .env.production | grep -v '^#' | xargs)

# JWT_SECRET kontrolü
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "BURAYA_GUCLU_JWT_SECRET_GIRIN" ]; then
  echo "HATA: JWT_SECRET ayarlanmamış!"
  echo "Çalıştırın: openssl rand -base64 32"
  exit 1
fi

echo "1/4 Docker image build ediliyor..."
docker compose build app

echo "2/4 Servisler başlatılıyor..."
docker compose up -d postgres

echo "3/4 Veritabanı hazır bekleniyor..."
sleep 5
docker compose run --rm app npx prisma migrate deploy

echo "4/4 Uygulama başlatılıyor..."
docker compose up -d app nginx

echo ""
echo "✓ Deployment tamamlandı!"
echo "  URL: https://finrate.com"
echo ""
docker compose ps
