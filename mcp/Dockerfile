FROM python:3.12.5-alpine

WORKDIR /app

RUN pip install --no-cache-dir plane-mcp-server==0.2.3

ENV PLANE_BASE_URL=http://api:8000
ENV PLANE_WORKSPACE_SLUG=""
ENV PLANE_API_KEY=""
ENV MCP_PORT=8001

EXPOSE 8001

CMD ["sh", "-c", "plane-mcp-server http --host 0.0.0.0 --port ${MCP_PORT}"]
