FROM python:3.11-slim

# System dependencies for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 \
    libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install core packages with compatible versions (bypasses requirements.txt conflicts)
RUN pip install --no-cache-dir \
    fastapi==0.110.1 \
    "uvicorn[standard]==0.25.0" \
    "pymongo==4.5.0" \
    "motor==3.3.2" \
    "mongomock-motor==0.0.21" \
    python-dotenv==1.2.1 \
    "pydantic[email]==2.5.3" \
    httpx==0.26.0 \
    "python-jose[cryptography]==3.3.0" \
    "passlib[bcrypt]==1.7.4" \
    google-auth==2.27.0 \
    stripe==7.12.0 \
    "playwright>=1.40.0" \
    yt-dlp \
    instaloader \
    python-multipart==0.0.9 \
    websockets \
    aiohttp \
    starlette==0.37.2

RUN playwright install chromium --with-deps

COPY . .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
