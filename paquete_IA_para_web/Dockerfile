FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TF_CPP_MIN_LOG_LEVEL=2 MPLCONFIGDIR=/tmp/matplotlib XDG_CACHE_HOME=/tmp/cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["sh", "-c", "gunicorn --workers 1 --threads 4 --timeout 60 --bind 0.0.0.0:${PORT:-5000} servidor_alertas:app"]
