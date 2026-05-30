# Always-on nbconvert sidecar: receives .ipynb JSON over HTTP and returns
# rendered HTML. Mirrors the production sidecar contract (Track D2).
FROM python:3.12-slim

RUN pip install --no-cache-dir "nbconvert==7.16.4" "jupyter-core==5.7.2" "mistune>=2.0.2,<3.0"

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 8090
CMD ["python", "/app/server.py"]
