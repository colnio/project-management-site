"""Minimal nbconvert HTTP sidecar.

POST /render  with a raw .ipynb JSON body -> returns rendered HTML.
GET  /healthz -> {"status": "ok"}

Mirrors the production contract so the Go ipynb worker (Track D2) is identical
in dev and prod.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import nbformat
from nbconvert import HTMLExporter

PORT = 8090


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, json.dumps({"status": "ok"}))
        else:
            self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        if self.path != "/render":
            self._send(404, json.dumps({"error": "not found"}))
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            nb = nbformat.reads(raw.decode("utf-8"), as_version=4)
            exporter = HTMLExporter()
            exporter.exclude_input_prompt = True
            exporter.exclude_output_prompt = True
            html, _ = exporter.from_notebook_node(nb)
            self._send(200, html, content_type="text/html; charset=utf-8")
        except Exception as exc:  # noqa: BLE001
            self._send(422, json.dumps({"error": str(exc)}))

    def log_message(self, *args):  # silence default logging
        pass


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"nbconvert sidecar listening on :{PORT}", flush=True)
    httpd.serve_forever()
