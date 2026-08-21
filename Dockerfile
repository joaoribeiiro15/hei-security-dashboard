FROM python:3.12-slim
WORKDIR /app

# Install MySQL client library dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev gcc pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY html/ html/
RUN mkdir -p cache

EXPOSE 8080
CMD ["python3", "server.py"]
