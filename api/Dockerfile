FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev
COPY golf_server ./golf_server
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 5003
CMD ["sh", "-c", "python -m golf_server migrate && exec gunicorn --workers 1 --threads 20 --bind 0.0.0.0:5003 golf_server.wsgi:app"]
