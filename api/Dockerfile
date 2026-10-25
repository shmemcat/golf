FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev
COPY golf_server ./golf_server
ARG VERSION=development
ARG REVISION=unknown
ENV PATH="/app/.venv/bin:$PATH" GOLF_SERVER_VERSION=$VERSION GOLF_SOURCE_REVISION=$REVISION
RUN useradd --system --uid 10001 golf
USER golf
EXPOSE 5003
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5003/ready', timeout=2)"
CMD ["gunicorn", "--workers", "1", "--threads", "20", "--bind", "0.0.0.0:5003", "golf_server.wsgi:app"]
