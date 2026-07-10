# ─── Stage 1: build the React frontend ───────────────────────────────────────
FROM node:20-alpine AS ui
WORKDIR /ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
COPY ui/ ./
RUN npm run build          # outputs to /ui/dist

# ─── Stage 2: Python API that also serves the built UI ────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Python deps (slim set — see requirements-web.txt)
COPY requirements-web.txt ./
RUN pip install --no-cache-dir -r requirements-web.txt

# App source (includes data/leads.db so testers get the real baseline leads)
COPY . .

# Built frontend from stage 1
COPY --from=ui /ui/dist ./ui/dist

# Render provides $PORT; default to 8000 locally
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000}"]
